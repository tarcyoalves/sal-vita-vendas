import { useState } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useFatStore } from '../../lib/faturamento/store';
import { useAuth } from '../../_core/hooks/useAuth';
import { trpc } from '../../lib/trpc';
import { formatBRL } from '../../lib/faturamento/calc';
import type { Pedido } from '../../lib/faturamento/types';
import {
  SMBI_ESTADO_ROTULO, SMBI_MOTIVO_ROTULO, SMBI_VINCULO_ROTULO, SMBI_EVENTO_ROTULO,
  type SmbiEstado, type SmbiMotivoCodigo, type SmbiVinculoEstado,
} from '../../../../shared/smbiEstados.js';

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

  const enviar = () => {
    const confirmou = window.confirm(
      `Criar este pedido NOVO no SMBI?\n\n${pedido.clienteNome}\n\n` +
        'Se ele já existe no SMBI (por exemplo, já foi embarcado), cancele e use "Vincular a pedido do SMBI".',
    );
    if (confirmou) {
      void executar(
        () => actions.pedidos.dispararSmbi(pedido.id),
        'Solicitado! O robô cria o pedido no SMBI e o número aparece aqui quando ele responder.',
      );
    }
  };

  const vincular = () => {
    const atual = pedido.smbiVinculoMovsais?.join(', ') ?? pedido.smbiMovsaiId ?? '';
    const n = window.prompt(
      temVinculo
        ? `Este pedido está ligado ao pedido ${atual} do SMBI.\nInforme o(s) número(s) CORRETO(s) no SMBI (vários: separe por vírgula):`
        : 'Informe o número do pedido que JÁ existe no SMBI (vários: separe por vírgula). O robô não vai criar outro:',
      atual,
    );
    if (!n?.trim()) return;
    void executar(() => actions.pedidos.vincularSmbi(pedido.id, n.trim()), 'Pedido vinculado. O robô vai conferir no SMBI.');
  };

  const desvincular = () => {
    const motivo = window.prompt(
      'Desfazer o vínculo com o SMBI?\n\nO pedido só volta ao robô se você clicar em "Enviar pedido para SMBI" de novo.\n\nMotivo (obrigatório):',
    );
    if (!motivo || motivo.trim().length < 5) {
      if (motivo !== null) toast.error('Informe o motivo (pelo menos 5 letras).');
      return;
    }
    void executar(() => actions.pedidos.desvincularSmbi(pedido.id, motivo.trim()), 'Vínculo desfeito.');
  };

  const espelho = pedido.smbiEspelhoFiscal;
  const resultado = pedido.smbiVinculoResultado;

  return (
    <>
      {/* ENVIAR: só pedido aprovado, não faturado, sem vínculo. Pedido faturado nunca é enviado. */}
      {canApprove && pedido.aprovadoEm && !pedido.smbiMovsaiId && !isFaturado && !vinculo && (
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado || roboProcessando}
          className={
            solicitado
              ? 'border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 gap-1.5'
              : 'border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 gap-1.5'
          }
          onClick={enviar}
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
        <Button size="sm" variant="outline" disabled={ocupado} onClick={vincular}>
          {temVinculo ? 'Trocar vínculo do SMBI' : 'Vincular a pedido do SMBI'}
        </Button>
      )}
      {isAdmin && temVinculo && (
        <Button size="sm" variant="outline" disabled={ocupado} className="text-red-700 border-red-300 hover:bg-red-50" onClick={desvincular}>
          Desvincular
        </Button>
      )}

      {/* Faturado e sem vínculo: é exatamente o caso do movsai 1115. */}
      {canApprove && isFaturado && !temVinculo && (
        <div className="basis-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Pedido já faturado: não é enviado ao SMBI (criaria um pedido duplicado). Se ele já existe lá, use
          "Vincular a pedido do SMBI".
        </div>
      )}

      {/* "Por que não foi": o motivo que o robô devolveu. */}
      {pedido.smbiEstado && pedido.smbiEstado !== 'CRIADO' && (
        <div
          className={`basis-full rounded-lg border px-3 py-2 text-xs ${
            pedido.smbiEstado === 'DIVERGENTE' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'
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
      {solicitado && !pedido.smbiMovsaiId && !pedido.smbiEstado && (
        <span className="text-xs text-indigo-700">
          {roboProcessando ? 'O robô está criando este pedido agora…' : `Solicitado em ${quando(pedido.smbiSolicitadoEm)}${pedido.smbiSolicitadoPor ? ` por ${pedido.smbiSolicitadoPor}` : ''} — aguardando o robô criar no SMBI`}
        </span>
      )}

      {pedido.smbiMovsaiId && (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs py-1 px-2.5">
          SMBI: Pedido {pedido.smbiVinculoMovsais && pedido.smbiVinculoMovsais.length > 1 ? pedido.smbiVinculoMovsais.join(', ') : pedido.smbiMovsaiId}
        </Badge>
      )}

      {/* Vínculo manual e a conferência do robô. */}
      {vinculo && (
        <div
          className={`basis-full rounded-lg border px-3 py-2 text-xs ${
            vinculo === 'VINCULO_COM_DIVERGENCIA' ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700'
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
              onClick={() => {
                if (window.confirm('Confirmar este vínculo mesmo com a divergência?')) {
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
        <div className="basis-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <p className="font-semibold">Faturado no SMBI abaixo do valor acordado</p>
          <p className="mt-0.5">
            Fiscal (sal + frete): {formatBRL(espelho.totalFiscal)} · acordado no CRM: {formatBRL(espelho.totalAcordado)}. A comissão
            não foi alterada; confira com o cliente.
          </p>
        </div>
      )}
      {espelho && (
        <div className="basis-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
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
        <div className="basis-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
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
