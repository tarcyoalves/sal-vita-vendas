import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useFatStore } from '../../lib/faturamento/store';
import { formatBRL, formatKg, freteTotal, pesoEfetivoKg, totalPedido } from '../../lib/faturamento/calc';
import {
  AVISO_ESCRITA_INICIADA, empresaDoEnvio, empresaTravada, escritaIniciadaSemMovsai, opcoesEmpresa, textoBotaoFinal,
  type OpcaoEmpresa,
} from '../../lib/faturamento/smbiEmpresaUi';
import { formatCnpj } from '../../../../shared/radar.js';
import type { Pedido } from '../../lib/faturamento/types';

/**
 * As duas empresas do SMBI como opções exclusivas. Sem pré-seleção: `valor` vem vazio até o usuário clicar.
 * Opção desabilitada (não homologada, ou outra que a travada) mostra o motivo e não aceita clique.
 */
export function EmpresaOpcoes({
  opcoes, valor, onChange, disabled,
}: { opcoes: OpcaoEmpresa[]; valor: string | null; onChange: (cnpj: string) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Empresa do SMBI" className="grid gap-2">
      {opcoes.map((o) => {
        const marcada = valor === o.empresa.cnpj;
        const bloqueada = o.desabilitada || !!disabled;
        return (
          <button
            key={o.empresa.cnpj}
            type="button"
            role="radio"
            aria-checked={marcada}
            disabled={bloqueada}
            onClick={() => onChange(o.empresa.cnpj)}
            className={`flex min-h-12 w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              marcada ? 'border-blue-800 bg-blue-50 ring-1 ring-blue-800' : 'border-slate-200 bg-white'
            } ${bloqueada ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-50'}`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${marcada ? 'border-blue-800 bg-blue-800 text-white' : 'border-slate-300'}`}
            >
              {marcada && <Check size={12} />}
            </span>
            <span className="min-w-0">
              <span className="block break-words font-semibold text-slate-900">{o.empresa.nome}</span>
              <span className="block text-xs text-slate-600">CNPJ {o.cnpjFormatado}</span>
              {o.motivo && <span className="mt-0.5 block text-xs font-medium text-amber-800">{o.motivo}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Escolha da empresa no clique de "Enviar pedido para SMBI" (só com o envio com escolha de empresa ligado).
 * Sem seleção inicial. O servidor decide (homologação, travamento, reserva...): a tela só mostra a resposta
 * dele e atualiza os dados depois dela.
 */
export default function SmbiEmpresaEnvioDialog({
  pedido, open, onOpenChange,
}: { pedido: Pedido; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { actions, reload } = useFatStore();
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (open) { setEscolhida(null); setErro(null); } }, [open]);

  const travada = empresaTravada(pedido);
  const opcoes = opcoesEmpresa(pedido);
  const alvo = empresaDoEnvio(pedido, escolhida);
  const valor = travada ? (pedido.smbiEmpresaCnpj ?? null) : escolhida;
  const risco = escritaIniciadaSemMovsai(pedido);
  const podeEnviar = !!alvo && !!pedido.aprovadoEm && !enviando && !risco;

  const enviar = async () => {
    if (!alvo) return;
    setEnviando(true);
    setErro(null);
    try {
      await actions.pedidos.dispararSmbi(pedido.id, alvo.cnpj);
      toast.success(`Solicitado para ${alvo.curto}! O robô cria o pedido no SMBI e o número aparece aqui quando ele responder.`);
      onOpenChange(false);
      void reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível concluir.';
      setErro(msg);
      toast.error(msg);
      void reload();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!enviando) onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Em qual empresa este pedido será lançado?</DialogTitle>
          <DialogDescription>
            Você escolhe agora; o pedido continua sendo digitado normalmente. Depois que o robô reservar o pedido, a empresa fica travada.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p className="font-semibold text-slate-800">Resumo do pedido</p>
          <dl className="mt-1 grid gap-y-0.5">
            <div className="break-words"><dt className="inline opacity-70">Comprador: </dt><dd className="inline">{pedido.razaoSocial || pedido.clienteNome || '—'}</dd></div>
            <div><dt className="inline opacity-70">CNPJ do comprador: </dt><dd className="inline">{pedido.cnpj ? formatCnpj(pedido.cnpj) : '—'}</dd></div>
            <div>
              <dt className="inline opacity-70">Produtos: </dt>
              <dd className="inline">
                {pedido.itens.length === 0 ? '—' : pedido.itens.map((it) => `${it.descricao} (${it.quantidade} un)`).join('; ')}
              </dd>
            </div>
            <div><dt className="inline opacity-70">Peso: </dt><dd className="inline">{formatKg(pesoEfetivoKg(pedido))}</dd></div>
            <div>
              <dt className="inline opacity-70">Totais: </dt>
              <dd className="inline">sal {formatBRL(totalPedido(pedido))} · frete {formatBRL(freteTotal(pedido))}</dd>
            </div>
            <div>
              <dt className="inline opacity-70">Prazos: </dt>
              <dd className="inline">sal {pedido.prazoPagamentoSal || '—'} · frete {pedido.prazoPagamentoFrete || '—'}</dd>
            </div>
          </dl>
        </div>

        {travada && (
          <p className="flex items-start gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
            <Lock size={14} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              Empresa travada{pedido.smbiEmpresaTravadaEm ? ` em ${quando(pedido.smbiEmpresaTravadaEm)}` : ''}: o robô já reservou este pedido, então ela não pode mais ser trocada.
            </span>
          </p>
        )}
        {risco && (
          <p role="alert" className="flex items-start gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0" /> {AVISO_ESCRITA_INICIADA}
          </p>
        )}
        {!pedido.aprovadoEm && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            O pedido precisa estar aprovado antes de enviar ao SMBI.
          </p>
        )}

        <EmpresaOpcoes opcoes={opcoes} valor={valor} onChange={setEscolhida} disabled={travada || enviando} />

        {erro && (
          <p role="alert" className="break-words rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{erro}</p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-10" disabled={enviando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" className="h-10" disabled={!podeEnviar} onClick={() => void enviar()}>
            {enviando ? 'Enviando…' : textoBotaoFinal(alvo)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
