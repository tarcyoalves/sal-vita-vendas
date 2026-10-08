import { useState } from 'react';
import { toast } from 'sonner';
import { Send, ClipboardCopy, UserPlus } from 'lucide-react';
import { Button } from '../ui/button';
import { StatusBadge } from '../StatusBadge';
import { useFatStore } from '../../lib/faturamento/store';
import { useAuth } from '../../_core/hooks/useAuth';
import { useConfirm } from '../useConfirm';
import { PromptDialog } from '../PromptDialog';
import SmbiCadastroClienteDialog from './SmbiCadastroClienteDialog';
import { trpc } from '../../lib/trpc';
import { formatBRL } from '../../lib/faturamento/calc';
import { clienteNaoCadastrado, textoPedidoCadastroHermes } from '../../lib/faturamento/smbiPendencia';
import { formatCnpj } from '../../../../shared/radar.js';
import type { Pedido } from '../../lib/faturamento/types';
import {
  SMBI_ESTADO_ROTULO, SMBI_MOTIVO_ROTULO, SMBI_VINCULO_ROTULO, SMBI_EVENTO_ROTULO,
  type SmbiEstado, type SmbiMotivoCodigo, type SmbiVinculoEstado,
} from '../../../../shared/smbiEstados.js';

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

const quando = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/**
 * Tudo do pedido com o ERP SMBI: enviar (com confirmação), cancelar envio, vincular a pedido que já
 * existe, desvincular, conferência do robô, alerta de desconto, espelho fiscal e histórico.
 * O servidor decide; a tela só muda depois da resposta dele.
 */
export default function SmbiPedidoControles({ pedido }: { pedido: Pedido }) {
  const { actions } = useFatStore();
  const { user } = useAuth();
  const canApprove = user?.role === 'admin' || user?.role === 'manager';
  const isAdmin = user?.role === 'admin';
  const isFaturado = pedido.status === 'faturado';
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  // Janela de texto (vincular / motivo do desvínculo), no lugar do window.prompt.
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [textoPara, setTextoPara] = useState<'vincular' | 'desvincular' | null>(null);

  const roboProcessando = !!pedido.smbiReservadoAte && pedido.smbiReservadoAte > new Date().toISOString();
  const solicitado = !!pedido.smbiSolicitadoEm;
  const temVinculo = !!pedido.smbiMovsaiId || !!pedido.smbiVinculoEstado;
  const vinculo = pedido.smbiVinculoEstado as SmbiVinculoEstado | null | undefined;

  const { data: eventos = [] } = trpc.faturamento.smbiEventos.useQuery(
    { pedidoId: pedido.id },
    { enabled: canApprove && historico },
  );

  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await acao();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };

  const enviar = async () => {
    const confirmou = await confirm(
      `${pedido.clienteNome}\n\n` +
        'Se ele já existe no SMBI (por exemplo, já foi embarcado), cancele e use "Vincular a pedido do SMBI".',
      { title: 'Criar este pedido NOVO no SMBI?', confirmLabel: 'Criar no SMBI' },
    );
    if (confirmou) {
      void executar(
        () => actions.pedidos.dispararSmbi(pedido.id),
        'Solicitado! O robô cria o pedido no SMBI e o número aparece aqui quando ele responder.',
      );
    }
  };

  const atualVinculo = pedido.smbiVinculoMovsais?.join(', ') ?? pedido.smbiMovsaiId ?? '';

  const vincular = (n: string) => {
    setTextoPara(null);
    void executar(() => actions.pedidos.vincularSmbi(pedido.id, n), 'Pedido vinculado. O robô vai conferir no SMBI.');
  };

  const desvincular = (motivo: string) => {
    setTextoPara(null);
    void executar(() => actions.pedidos.desvincularSmbi(pedido.id, motivo), 'Vínculo desfeito.');
  };

  const semCadastro = clienteNaoCadastrado(pedido) && !temVinculo;
  const copiarParaHermes = async () => {
    const ok = await copiarTexto(textoPedidoCadastroHermes(pedido));
    if (ok) toast.success('Pedido de cadastro copiado. Cole no Hermes; nada foi gravado no SMBI.');
    else toast.error('Não foi possível copiar. Selecione e copie os dados do quadro manualmente.');
  };

  const espelho = pedido.smbiEspelhoFiscal;
  const resultado = pedido.smbiVinculoResultado;

  return (
    <>
      {confirmDialog}
      <PromptDialog
        open={textoPara === 'vincular'}
        onOpenChange={(o) => { if (!o) setTextoPara(null); }}
        title={temVinculo ? 'Trocar vínculo do SMBI' : 'Vincular a pedido do SMBI'}
        description={
          temVinculo
            ? `Este pedido está ligado ao pedido ${atualVinculo} do SMBI. Informe o(s) número(s) CORRETO(s) no SMBI (vários: separe por vírgula).`
            : 'Informe o número do pedido que JÁ existe no SMBI (vários: separe por vírgula). O robô não vai criar outro.'
        }
        label="Número(s) do pedido no SMBI"
        initialValue={atualVinculo}
        confirmLabel="Vincular"
        onSubmit={vincular}
      />
      <PromptDialog
        open={textoPara === 'desvincular'}
        onOpenChange={(o) => { if (!o) setTextoPara(null); }}
        title="Desfazer o vínculo com o SMBI?"
        description='O pedido só volta ao robô se você clicar em "Enviar pedido para SMBI" de novo.'
        label="Motivo (obrigatório)"
        minLength={5}
        confirmLabel="Desvincular"
        onSubmit={desvincular}
      />
      {/* ENVIAR: só pedido aprovado, não faturado, sem vínculo. Pedido faturado nunca é enviado. */}
      {canApprove && pedido.aprovadoEm && !pedido.smbiMovsaiId && !isFaturado && !vinculo && (
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado || roboProcessando}
          className="gap-1.5"
          onClick={() => void enviar()}
        >
          <Send size={14} />
          {solicitado ? 'Reenviar ao SMBI' : 'Enviar pedido para SMBI'}
        </Button>
      )}
      {canApprove && solicitado && !pedido.smbiMovsaiId && !roboProcessando && (
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => void executar(() => actions.pedidos.cancelarSmbi(pedido.id), 'Envio cancelado.')}>
          Cancelar envio
        </Button>
      )}
      {isAdmin && (
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setTextoPara('vincular')}>
          {temVinculo ? 'Trocar vínculo do SMBI' : 'Vincular a pedido do SMBI'}
        </Button>
      )}
      {isAdmin && temVinculo && (
        <Button size="sm" variant="outline" disabled={ocupado} className="text-red-700" onClick={() => setTextoPara('desvincular')}>
          Desvincular
        </Button>
      )}

      {/* Faturado e sem vínculo: é exatamente o caso do movsai 1115. */}
      {canApprove && isFaturado && !temVinculo && (
        <div className="basis-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Pedido já faturado: não é enviado ao SMBI (criaria um pedido duplicado). Se ele já existe lá, use
          "Vincular a pedido do SMBI".
        </div>
      )}

      {/* "Por que não foi": o motivo que o robô devolveu. */}
      {pedido.smbiEstado && pedido.smbiEstado !== 'CRIADO' && (
        <div
          className={`basis-full rounded-md border px-3 py-2 text-xs ${
            pedido.smbiEstado === 'DIVERGENTE' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="font-semibold">{SMBI_ESTADO_ROTULO[pedido.smbiEstado as SmbiEstado] ?? pedido.smbiEstado}</p>
          <p className="mt-0.5">
            {(pedido.smbiMotivoCodigo && SMBI_MOTIVO_ROTULO[pedido.smbiMotivoCodigo as SmbiMotivoCodigo]) ||
              pedido.smbiMotivoTexto ||
              'O robô não informou o motivo.'}
          </p>
          {pedido.smbiMotivoTexto && pedido.smbiMotivoCodigo && <p className="mt-0.5 opacity-80">Detalhe do robô: {pedido.smbiMotivoTexto}</p>}
          {pedido.smbiAtualizadoEm && (
            <p className="mt-0.5 opacity-70">
              {quando(pedido.smbiAtualizadoEm)}
              {pedido.smbiTentativa ? ` · tentativa ${pedido.smbiTentativa}` : ''} · o robô só tenta de novo se você reenviar.
            </p>
          )}
        </div>
      )}
      {semCadastro && !canApprove && (
        <div className="basis-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Cliente não cadastrado no SMBI</p>
          <p className="mt-0.5">Fale com o administrador para cadastrar o cliente no SMBI.</p>
        </div>
      )}
      {semCadastro && canApprove && (
        <div className="basis-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Cadastrar cliente no SMBI</p>
          <dl className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
            <div className="break-words"><dt className="inline opacity-70">CNPJ: </dt><dd className="inline">{pedido.cnpj ? formatCnpj(pedido.cnpj) : '—'}</dd></div>
            <div className="break-words"><dt className="inline opacity-70">Cliente: </dt><dd className="inline">{pedido.razaoSocial || pedido.clienteNome || '—'}</dd></div>
            <div><dt className="inline opacity-70">Cidade/UF: </dt><dd className="inline">{[pedido.cidade, pedido.uf].filter(Boolean).join('/') || '—'}</dd></div>
            <div><dt className="inline opacity-70">Atendente / representante esperado: </dt><dd className="inline">{pedido.sellerName || '—'}</dd></div>
          </dl>
          <p className="mt-1.5 opacity-80">
            O cadastro é assistido: o Hermes mostra a prévia e só grava depois do seu "cadastra". Nada é gravado automaticamente, e o pedido só segue pelo seu clique em Enviar para o SMBI.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="h-10 gap-1.5 bg-white" onClick={() => void copiarParaHermes()}>
              <ClipboardCopy size={14} /> Copiar pedido de cadastro para o Hermes
            </Button>
            <Button size="sm" variant="outline" className="h-10 gap-1.5 bg-white" onClick={() => setCadastroAberto(true)}>
              <UserPlus size={14} /> Abrir cadastro assistido
            </Button>
          </div>
          <SmbiCadastroClienteDialog pedido={pedido} open={cadastroAberto} onOpenChange={setCadastroAberto} />
        </div>
      )}
      {solicitado && !pedido.smbiMovsaiId && !pedido.smbiEstado && (
        <span className="text-xs text-slate-500">
          {roboProcessando ? 'O robô está criando este pedido agora…' : `Solicitado em ${quando(pedido.smbiSolicitadoEm)}${pedido.smbiSolicitadoPor ? ` por ${pedido.smbiSolicitadoPor}` : ''} — aguardando o robô criar no SMBI`}
        </span>
      )}

      {pedido.smbiMovsaiId && (
        <StatusBadge tone="success">
          SMBI: Pedido {pedido.smbiVinculoMovsais && pedido.smbiVinculoMovsais.length > 1 ? pedido.smbiVinculoMovsais.join(', ') : pedido.smbiMovsaiId}
        </StatusBadge>
      )}

      {/* Vínculo manual e a conferência do robô. */}
      {vinculo && (
        <div
          className={`basis-full rounded-md border px-3 py-2 text-xs ${
            vinculo === 'VINCULO_COM_DIVERGENCIA' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}
        >
          <p className="font-semibold">{SMBI_VINCULO_ROTULO[vinculo] ?? vinculo}</p>
          <p className="mt-0.5 opacity-80">
            Pedido(s) do SMBI: {pedido.smbiVinculoMovsais?.join(', ') ?? pedido.smbiMovsaiId}
            {pedido.smbiVinculoPor ? ` · vinculado por ${pedido.smbiVinculoPor} em ${quando(pedido.smbiVinculoEm)}` : ''}
          </p>
          {vinculo === 'VINCULO_COM_DIVERGENCIA' && resultado && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="rounded border border-slate-200 bg-white p-2 text-slate-700">
                <p className="font-semibold">No CRM</p>
                <p>{pedido.clienteNome} ({pedido.cnpj})</p>
                {pedido.itens.map((it) => (
                  <p key={it.id}>{it.descricao}: {it.pesoKg} kg</p>
                ))}
              </div>
              <div className="rounded border border-slate-200 bg-white p-2 text-slate-700">
                <p className="font-semibold">No SMBI</p>
                {resultado.movsais.map((m) => (
                  <div key={m.id}>
                    <p>Pedido {m.id}: {m.cliente ?? '—'} {m.cnpj ? `(${m.cnpj})` : ''}</p>
                    {(m.itens ?? []).map((it, i) => (
                      <p key={i}>{it.produto}: {it.qtdKg} kg</p>
                    ))}
                  </div>
                ))}
                <p className="mt-1 opacity-70">
                  Confere — cliente: {resultado.confere.cliente ? 'sim' : 'NÃO'} · produto: {resultado.confere.produto ? 'sim' : 'NÃO'} · quantidade: {resultado.confere.quantidade ? 'sim' : 'NÃO'}
                </p>
              </div>
            </div>
          )}
          {isAdmin && vinculo === 'VINCULO_COM_DIVERGENCIA' && (
            <Button
              size="sm"
              className="mt-2"
              disabled={ocupado}
              onClick={async () => {
                if (await confirm('Confirmar este vínculo mesmo com a divergência?', { title: 'Confirmar vínculo', confirmLabel: 'Confirmar vínculo' })) {
                  void executar(() => actions.pedidos.confirmarVinculoSmbi(pedido.id), 'Vínculo confirmado.');
                }
              }}
            >
              Confirmar vínculo mesmo assim
            </Button>
          )}
        </div>
      )}

      {/* Faturado no SMBI por valor menor que o acordado (contrato, rota 3). */}
      {pedido.smbiAlertaDesconto && espelho && (
        <div className="basis-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p className="font-semibold">Faturado no SMBI abaixo do valor esperado</p>
          <p className="mt-0.5">
            Fiscal (sal + frete): {formatBRL(espelho.totalFiscal)} · esperado para o peso faturado: {formatBRL(espelho.totalEsperado ?? espelho.totalAcordado)}
            {espelho.totalEsperado !== undefined && espelho.totalEsperado !== espelho.totalAcordado ? ` (acordado no CRM: ${formatBRL(espelho.totalAcordado)})` : ''}. A comissão
            não foi alterada; confira com o cliente.
          </p>
        </div>
      )}
      {/* Quantidade diferente do pedido: não é desconto, mas a comissão do representante segue o pedido. */}
      {espelho?.pesoPedidoKg && espelho.pesoFaturadoKg && Math.abs(espelho.pesoFaturadoKg - espelho.pesoPedidoKg) > 1 && (
        <div className="basis-full rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Peso faturado diferente do pedido</p>
          <p className="mt-0.5">
            Faturado: {(espelho.pesoFaturadoKg / 1000).toLocaleString('pt-BR')} t · pedido: {(espelho.pesoPedidoKg / 1000).toLocaleString('pt-BR')} t.
            Isso não é desconto. O pedido tem mais de um item (ou o faturamento ainda é parcial), então não foi reescrito; a comissão já segue o peso do SMBI.
          </p>
        </div>
      )}
      {espelho && (
        <div className="basis-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold">Espelho fiscal (SMBI) — só leitura</p>
          {espelho.movsais.map((m) => (
            <p key={m.id}>
              Pedido {m.id}
              {m.pesoKg ? ` · ${m.pesoKg} kg` : ''}
              {m.nfe?.numero ? ` · NF-e ${m.nfe.numero}${m.nfe.valorSal !== undefined ? ` (sal ${formatBRL(m.nfe.valorSal)})` : ''}` : ''}
              {m.cte?.numero ? ` · CT-e ${m.cte.numero}${m.cte.valorFrete !== undefined ? ` (frete ${formatBRL(m.cte.valorFrete)})` : ''}` : ''}
            </p>
          ))}
        </div>
      )}

      {canApprove && (
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => setHistorico((v) => !v)}>
          {historico ? 'Ocultar histórico do SMBI' : 'Histórico do SMBI'}
        </Button>
      )}
      {canApprove && historico && (
        <div className="basis-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          {eventos.length === 0 ? (
            <p>Nenhum evento registrado ainda.</p>
          ) : (
            eventos.map((e) => (
              <p key={e.id}>
                {quando(e.em ?? new Date(e.criadoEm).toISOString())} —{SMBI_EVENTO_ROTULO[e.evento] ?? e.evento}
                {e.porNome ? ` (${e.porNome})` : e.origem === 'robo' ? ' (robô)' : ''}
              </p>
            ))
          )}
        </div>
      )}
    </>
  );
}
