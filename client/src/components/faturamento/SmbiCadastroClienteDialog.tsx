import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { StatusBadge } from '../StatusBadge';
import { QueryError } from '../QueryError';
import { useConfirm } from '../useConfirm';
import { useAuth } from '../../_core/hooks/useAuth';
import { trpc } from '../../lib/trpc';
import { formatCnpj } from '../../../../shared/radar.js';
import type { Pedido } from '../../lib/faturamento/types';
import {
  AVISO_CADASTRO_POR_EMPRESA, cadastroExigeEscolha, empresaDoPedido, opcoesEmpresa, tituloCadastroEmpresa,
} from '../../lib/faturamento/smbiEmpresaUi';
import { empresaPorCnpj } from '../../../../shared/smbiEmpresas.js';
import { EmpresaOpcoes } from './SmbiEmpresaEnvioDialog';
import type { CadastroOrigem } from '../../../../shared/smbiCadastro.js';
import {
  CAMPOS_CONTATO_FORM, ORIGEM_ROTULO, TEXTO_APROVACAO, estadoUi, formatarFaltantes, linhasPrevia, listarDivergencias,
  mensagemErroCadastro, montarContatos, origensPermitidas, podeAprovar, podeRevisarContatos, proximaAcao, rotuloBloqueio,
  ehEstadoReconciliar, type CampoContatoForm,
} from '../../lib/faturamento/smbiCadastroUi';

const ROTULO_CONTATO: Record<CampoContatoForm, string> = {
  contato: 'Contato', telefone: 'Telefone', celular: 'Celular', email: 'E-mail', emailFinanceiro: 'E-mail financeiro',
};

const quando = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Cadastro ASSISTIDO do cliente no SMBI. Esta tela NÃO grava nada no SMBI: ela prepara a prévia, revisa
 * contatos, registra a aprovação do admin e libera o pedido. Quem grava é o robô, depois da aprovação e
 * com o gate "cadastro automatizado" ligado. O estado só muda depois da resposta do servidor; hashes e
 * revisão são sempre os que o servidor devolveu.
 */
export default function SmbiCadastroClienteDialog({
  pedido, open, onOpenChange,
}: { pedido: Pedido; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const utils = trpc.useUtils();
  const { confirm, confirmDialog } = useConfirm();

  // Empresa do cadastro: a do pedido (definida) ou, com o envio por empresa ligado e pedido sem empresa, a escolhida aqui.
  const [empresaEscolhida, setEmpresaEscolhida] = useState<string | null>(null);
  useEffect(() => { if (open) setEmpresaEscolhida(null); }, [open, pedido.id]);
  const empresaCnpj = empresaDoPedido(pedido)?.cnpj ?? empresaEscolhida ?? undefined;
  const empresa = empresaPorCnpj(empresaCnpj);

  const status = trpc.faturamento.cadastroSmbiStatus.useQuery(
    { pedidoId: pedido.id, ...(empresaCnpj ? { empresaCnpj } : {}) },
    { enabled: open, refetchInterval: open ? 15_000 : false },
  );
  const cadastro = status.data?.cadastro ?? null;
  const gates = status.data?.gates;
  // Última resposta do servidor, para conferir depois do ConfirmDialog se a tela ainda é a mesma.
  const ultima = useRef(cadastro);
  ultima.current = cadastro;

  const recarregar = () => { void utils.faturamento.cadastroSmbiStatus.invalidate({ pedidoId: pedido.id }); };
  const falha = (e: unknown) => {
    const u = mensagemErroCadastro(e);
    toast.error(u.mensagem);
    if (u.recarregar) recarregar();
  };

  const solicitar = trpc.faturamento.solicitarPreviaCadastroSmbi.useMutation({
    onSuccess: () => { toast.success('Cadastro preparado. O robô gera a prévia (somente leitura).'); recarregar(); },
    onError: falha,
  });
  const revisar = trpc.faturamento.revisarContatosCadastroSmbi.useMutation({
    onSuccess: () => { toast.success('Contatos salvos. A aprovação anterior (se havia) foi cancelada e a prévia será refeita.'); setEditados({}); recarregar(); },
    onError: falha,
  });
  const aprovar = trpc.faturamento.aprovarCadastroEContinuarSmbi.useMutation({
    onSuccess: (r) => { toast.success(r.idempotente ? 'Este cadastro já estava aprovado.' : 'Cadastro aprovado por 24 h. Nada foi gravado ainda.'); recarregar(); },
    onError: falha,
  });
  const liberar = trpc.faturamento.liberarPedidoAposCadastroSmbi.useMutation({
    onSuccess: (r) => {
      toast.success(r.liberado ? 'Pedido liberado para o robô.' : 'Este pedido já estava liberado.');
      recarregar();
      void utils.faturamento.invalidate();
    },
    onError: falha,
  });
  const gate = trpc.faturamento.setCadastroAtivo.useMutation({
    onSuccess: (r) => { toast.success(r.cadastroAtivo ? 'Cadastro automatizado LIGADO.' : 'Cadastro automatizado desligado.'); recarregar(); },
    onError: falha,
  });
  const ocupado = solicitar.isPending || revisar.isPending || aprovar.isPending || liberar.isPending || gate.isPending;

  // Formulário de contatos: só os campos mexidos vão ao servidor.
  const [editados, setEditados] = useState<Partial<Record<CampoContatoForm, string>>>({});
  const [origens, setOrigens] = useState<Partial<Record<CampoContatoForm, CadastroOrigem>>>({});
  const revKey = cadastro ? `${cadastro.id}:${cadastro.revisao}` : '';
  useEffect(() => { setEditados({}); setOrigens({}); }, [revKey]);

  const atual = (c: CampoContatoForm): string => {
    const s = cadastro?.snapshot?.[c];
    const k = cadastro?.contatos?.[c]?.valor;
    return (typeof s === 'string' && s) || (typeof k === 'string' && k) || '';
  };

  const exigeEscolha = cadastroExigeEscolha(pedido, gates?.multiempresaAtivo) && !empresaCnpj;
  const preparar = () => {
    if (exigeEscolha) { toast.error('Escolha a empresa do cadastro primeiro.'); return; }
    solicitar.mutate({ pedidoId: pedido.id, ...(empresaCnpj ? { empresaCnpj } : {}) });
  };

  const salvarContatos = async () => {
    if (!cadastro) return;
    const contatos = montarContatos(editados, origens, isAdmin);
    if (Object.keys(contatos).length === 0) { toast.error('Preencha ao menos um contato.'); return; }
    if (cadastro.estado === 'APROVADO' || cadastro.estado === 'AGUARDANDO_APROVACAO') {
      const ok = await confirm(
        'Alterar contatos invalida a aprovação: o robô refaz a prévia e o administrador precisa aprovar de novo.',
        { title: 'Salvar contatos?', confirmLabel: 'Salvar contatos' },
      );
      if (!ok) return;
    }
    revisar.mutate({ cadastroId: cadastro.id, revisao: cadastro.revisao, contatos });
  };

  const aprovarCadastro = async () => {
    const visto = cadastro;
    if (!visto?.snapshotHash || !visto.pedidoHash) return;
    const ok = await confirm(
      `${TEXTO_APROVACAO}\n\nCNPJ ${formatCnpj(visto.cnpj)} · revisão ${visto.revisao}`,
      { title: 'Aprovar cadastro no SMBI?', confirmLabel: 'Aprovar cadastro' },
    );
    if (!ok) return;
    const agora = ultima.current;
    if (!agora || agora.id !== visto.id || agora.revisao !== visto.revisao || agora.snapshotHash !== visto.snapshotHash || agora.pedidoHash !== visto.pedidoHash) {
      toast.error('A prévia mudou enquanto você confirmava. Confira os dados novos e aprove de novo.');
      recarregar();
      return;
    }
    // Revisão e hashes EXATAMENTE como o servidor devolveu; nada é recalculado aqui.
    aprovar.mutate({ cadastroId: visto.id, revisao: visto.revisao, snapshotHash: visto.snapshotHash, pedidoHash: visto.pedidoHash });
  };

  const liberarPedido = async () => {
    if (!cadastro) return;
    const ok = await confirm(
      'SÓ este pedido será liberado para o robô. O envio ao SMBI continua exigindo o robô ligado e o seu clique/fila normal; nenhum outro pedido é afetado.',
      { title: 'Liberar este pedido para o robô?', confirmLabel: 'Liberar este pedido' },
    );
    if (ok) liberar.mutate({ cadastroId: cadastro.id, pedidoHash: cadastro.pedidoHashAtual });
  };

  const alternarGate = async () => {
    const ligar = !gates?.cadastroAtivo;
    const ok = await confirm(
      ligar ? 'Ligar o cadastro automatizado de clientes? O robô poderá cadastrar clientes aprovados.' : 'O robô para de cadastrar clientes. Cadastros já em andamento não são desfeitos.',
      { title: ligar ? 'LIGAR o cadastro automatizado?' : 'Desligar o cadastro automatizado?', confirmLabel: ligar ? 'Ligar' : 'Desligar' },
    );
    if (ok) gate.mutate({ ativo: ligar });
  };

  const ui = cadastro ? estadoUi(cadastro.estado) : null;
  const aprov = cadastro
    ? podeAprovar({
        isAdmin, estado: cadastro.estado, camposFaltantes: cadastro.camposFaltantes, bloqueios: cadastro.bloqueios,
        pedidoAlterado: cadastro.pedidoAlterado, temSnapshotEHashes: !!cadastro.snapshot && !!cadastro.snapshotHash && !!cadastro.pedidoHash,
        revisaoVelha: status.isError,
      })
    : null;
  const linhas = cadastro?.snapshot ? linhasPrevia(cadastro.snapshot, cadastro.camposFaltantes) : [];
  const divergencias = cadastro ? listarDivergencias(cadastro.divergencias) : [];
  const permitidas = origensPermitidas(isAdmin);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {confirmDialog}
        <DialogHeader>
          <DialogTitle>Cadastro assistido no SMBI{tituloCadastroEmpresa(empresaCnpj) ? ` — ${tituloCadastroEmpresa(empresaCnpj)}` : ''}</DialogTitle>
          <DialogDescription>
            {pedido.razaoSocial || pedido.clienteNome} · CNPJ {pedido.cnpj ? formatCnpj(pedido.cnpj) : '—'}. Esta tela não grava nada no SMBI: quem grava é o robô, depois da aprovação do administrador.
          </DialogDescription>
        </DialogHeader>

        {status.isError && (
          <QueryError
            onRetry={() => void status.refetch()}
            retrying={status.isFetching}
            message={status.data ? 'Não foi possível atualizar. O que aparece pode estar velho; a aprovação fica bloqueada.' : 'Falha ao carregar o cadastro.'}
          />
        )}
        {status.isLoading && <p className="text-sm text-slate-500">Carregando…</p>}

        {gates && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold">Cadastro automatizado:</span>
            <StatusBadge tone={gates.cadastroAtivo ? 'success' : 'neutral'} dot>{gates.cadastroAtivo ? 'Ligado' : 'Desligado'}</StatusBadge>
            <span className="font-semibold">Robô do SMBI:</span>
            <StatusBadge tone={gates.roboAtivo ? 'success' : 'neutral'} dot>{gates.roboAtivo ? 'Ligado' : 'Desligado'}</StatusBadge>
            {isAdmin && (
              <Button size="sm" variant="outline" className="ml-auto h-10 bg-white" disabled={ocupado} onClick={() => void alternarGate()}>
                {gates.cadastroAtivo ? 'Desligar cadastro automatizado' : 'Ligar cadastro automatizado'}
              </Button>
            )}
            {!gates.cadastroAtivo && <p className="basis-full opacity-80">Desligado (padrão): o robô não cadastra nem prepara prévias.</p>}
          </div>
        )}

        {(empresa || gates?.multiempresaAtivo) && (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {AVISO_CADASTRO_POR_EMPRESA}
          </p>
        )}

        {status.data && !cadastro && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-semibold">Ainda não há cadastro preparado para este CNPJ{empresa ? ` na ${empresa.curto}` : ''}.</p>
            <p className="mt-0.5 text-xs">Preparar pede ao robô uma prévia somente de leitura. Nada é cadastrado.</p>
            {exigeEscolha && (
              <div className="mt-2 text-slate-900">
                <p className="mb-1 text-xs font-semibold">Em qual empresa o cliente será cadastrado?</p>
                <EmpresaOpcoes opcoes={opcoesEmpresa(pedido, { exigeHomologada: false })} valor={empresaEscolhida} onChange={setEmpresaEscolhida} disabled={ocupado} />
              </div>
            )}
            <Button size="sm" className="mt-2 h-10" disabled={ocupado || exigeEscolha} onClick={preparar}>Preparar cadastro</Button>
          </div>
        )}

        {cadastro && ui && (
          <>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={ui.tom} dot>{ui.rotulo}</StatusBadge>
                <span className="text-xs text-slate-500">revisão {cadastro.revisao}</span>
                {cadastro.erpClienteId && <span className="text-xs text-slate-500">· cliente no SMBI: {cadastro.erpClienteId}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-700">{ui.significado}</p>
              <p className="mt-1 text-xs font-medium text-slate-800">Próxima ação: {proximaAcao(cadastro.estado, isAdmin)}</p>
            </div>

            {ehEstadoReconciliar(cadastro.estado) && (
              <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={16} aria-hidden /> Não reenvie nem recadastre: o resultado precisa ser reconciliado.</p>
                {divergencias.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {divergencias.map((d, i) => <li key={i} className="break-words">{d.campo}: esperado "{d.esperado}", lido "{d.lido}"</li>)}
                  </ul>
                )}
              </div>
            )}

            {cadastro.pedidoAlterado && cadastro.estado !== 'CONFERIDO' && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                O pedido foi alterado depois da prévia. A aprovação não vale para o pedido novo: prepare o cadastro de novo.
              </div>
            )}

            {(cadastro.camposFaltantes.length > 0 || cadastro.bloqueios.length > 0) && (
              <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                {cadastro.camposFaltantes.length > 0 && <p className="font-semibold">{formatarFaltantes(cadastro.camposFaltantes)}</p>}
                {cadastro.bloqueios.map((b) => <p key={b} className="mt-0.5 font-semibold">Bloqueio: {rotuloBloqueio(b)}</p>)}
              </div>
            )}

            {linhas.length > 0 && (
              <div className="rounded-md border border-slate-200">
                <p className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">Prévia (dados que o robô vai cadastrar)</p>
                <dl className="divide-y divide-slate-100 text-xs">
                  {linhas.map((l) => (
                    <div key={l.chave} className={`grid gap-x-3 px-3 py-1.5 sm:grid-cols-[10rem_1fr_9rem] ${l.faltante ? 'bg-red-50' : ''}`}>
                      <dt className="text-slate-500">{l.rotulo}</dt>
                      <dd className={`break-words ${l.faltante ? 'font-semibold text-red-700' : 'text-slate-800'}`}>{l.valor}{l.faltante ? ' (faltante)' : ''}</dd>
                      <dd className="text-[11px] text-slate-500">{l.origem ? ORIGEM_ROTULO[l.origem] : 'origem não informada'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {(cadastro.aprovadoEm || cadastro.estado === 'APROVADO') && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700">
                <ShieldCheck size={14} aria-hidden className="text-slate-500" />
                Aprovado por {cadastro.aprovadoPorNome ?? '—'} em {quando(cadastro.aprovadoEm)} · expira em {quando(cadastro.aprovacaoExpiraEm)}
                {cadastro.estado === 'APROVADO' && !cadastro.aprovacaoValida && <span className="font-semibold text-red-700"> (aprovação expirada ou inválida: aprove de novo)</span>}
              </p>
            )}

            {podeRevisarContatos(cadastro.estado) && (
              <form
                className="rounded-md border border-slate-200 px-3 py-2"
                onSubmit={(e) => { e.preventDefault(); void salvarContatos(); }}
              >
                <p className="text-xs font-semibold text-slate-700">Contatos</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Alterar contatos invalida a aprovação e refaz a prévia. {isAdmin
                    ? 'Como administrador você pode marcar a origem como confirmada pelo Tarcyo.'
                    : 'Sem o administrador, só telefone, celular e e-mail idênticos aos da tarefa do pedido são aceitos como CRM confirmado.'}
                </p>
                <div className="mt-2 grid gap-2">
                  {CAMPOS_CONTATO_FORM.map((c) => (
                    <div key={c} className="grid gap-1 sm:grid-cols-[8rem_1fr_11rem] sm:items-center">
                      <label htmlFor={`cad-${c}`} className="text-xs text-slate-600">{ROTULO_CONTATO[c]}</label>
                      <Input
                        id={`cad-${c}`}
                        className="h-10"
                        inputMode={c === 'telefone' || c === 'celular' ? 'tel' : c.startsWith('email') ? 'email' : 'text'}
                        value={editados[c] ?? atual(c)}
                        onChange={(e) => setEditados((p) => ({ ...p, [c]: e.target.value }))}
                      />
                      <select
                        aria-label={`Origem de ${ROTULO_CONTATO[c]}`}
                        className="h-10 rounded-md border border-slate-200 bg-white px-2 text-xs"
                        value={origens[c] ?? 'CRM_CONFIRMADO'}
                        onChange={(e) => setOrigens((p) => ({ ...p, [c]: e.target.value as CadastroOrigem }))}
                      >
                        {permitidas.map((o) => <option key={o} value={o}>{ORIGEM_ROTULO[o]}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <Button type="submit" size="sm" variant="outline" className="mt-2 h-10" disabled={ocupado}>Salvar contatos</Button>
              </form>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {cadastro.estado === 'INVALIDADO' && (
                <Button size="sm" className="h-10" disabled={ocupado} onClick={preparar}>Preparar novamente</Button>
              )}
              {isAdmin && cadastro.estado === 'AGUARDANDO_APROVACAO' && aprov && (
                <Button size="sm" className="h-10" disabled={ocupado || !aprov.ok} onClick={() => void aprovarCadastro()}>Aprovar cadastro</Button>
              )}
              {isAdmin && cadastro.estado === 'CONFERIDO' && cadastro.podeLiberar.ok && (
                <Button size="sm" className="h-10" disabled={ocupado} onClick={() => void liberarPedido()}>Liberar este pedido para o robô</Button>
              )}
              <Button size="sm" variant="ghost" className="h-10" disabled={status.isFetching} onClick={recarregar}>Atualizar</Button>
            </div>
            {isAdmin && cadastro.estado === 'AGUARDANDO_APROVACAO' && aprov && !aprov.ok && (
              <p className="text-xs text-red-700">Não dá para aprovar: {aprov.motivo}</p>
            )}
            {cadastro.estado === 'CONFERIDO' && !cadastro.podeLiberar.ok && (
              <p className="text-xs text-slate-600">Liberação indisponível: {cadastro.podeLiberar.erro}</p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
