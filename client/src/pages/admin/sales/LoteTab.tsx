import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCheck, Scissors } from 'lucide-react';
import { trpc } from '../../../lib/trpc';
import { btn } from '../../../components/premium/admin/adminUi';
import { ConfirmDialog } from '../../../components/premium/admin/ConfirmDialog';
import { errorMessage } from '../../../components/premium/admin/adminLogic';
import { Card, Consulta, MotivoDialog, Pill, Vazio } from './ui';
import { MENSAGEM_STATUS_LABEL, traduzirMotivo } from './motivos';

export default function LoteTab() {
  const utils = trpc.useUtils();
  const q = trpc.sales.lote.useQuery();
  const [cortar, setCortar] = useState<number | null>(null);
  const [aprovar, setAprovar] = useState(false);

  const refazer = () => { utils.sales.lote.invalidate(); utils.sales.painel.invalidate(); };
  const cortarMut = trpc.sales.cortarDoLote.useMutation({
    onSuccess: () => { toast.success('Mensagem cortada do lote.'); refazer(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const aprovarMut = trpc.sales.aprovarLote.useMutation({
    onSuccess: (r) => { toast.success(`${r.aprovadas} mensagem(ns) aprovada(s).`); refazer(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const lote = q.data?.lote ?? null;
  const itens = q.data?.itens ?? [];

  return (
    <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
      {!lote ? (
        <Card><Vazio>Ainda não há lote do dia. Rode o ciclo na aba Painel.</Vazio></Card>
      ) : (
        <div className="space-y-4">
          <Card
            titulo={`Lote nº ${lote.id} (${lote.data})`}
            acao={
              <button type="button" disabled={itens.length === 0 || aprovarMut.isPending} onClick={() => setAprovar(true)} className={btn.success}>
                <CheckCheck className="w-4 h-4" aria-hidden="true" /> Aprovar lote
              </button>
            }
          >
            <p className="text-xs text-slate-600">
              Situação: <b>{lote.status}</b> · {lote.tamanho} mensagem(ns). Corte o que não quiser antes de aprovar.
              Aprovar não envia na hora: o envio ainda depende do modo e do canal.
            </p>
          </Card>

          {itens.length === 0 ? (
            <Card><Vazio>O lote está vazio.</Vazio></Card>
          ) : (
            <ul className="space-y-3">
              {itens.map((i) => (
                <li key={i.messageId} className="bg-white rounded-2xl border border-slate-200/80 p-4 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 break-words">{i.empresa}</p>
                      <p className="text-xs text-slate-500">{i.cidadeUf ?? 'Local não informado'}</p>
                      <p className="text-xs text-slate-700 break-all mt-0.5">{i.email}{i.fonteEmail ? ` · fonte: ${i.fonteEmail}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-slate-500">Nota</p>
                      <p className="text-xl font-bold tabular-nums">{i.score ?? '—'}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {i.segmentos.map((s) => <Pill key={s} tom="blue">{s}</Pill>)}
                    <Pill>Passo {i.passo + 1}</Pill>
                    <Pill tom={i.status === 'CANCELLED' ? 'rose' : 'slate'}>{MENSAGEM_STATUS_LABEL[i.status] ?? i.status}</Pill>
                  </div>
                  {i.scoreMotivos.length > 0 && (
                    <ul className="mt-2 text-[12px] text-slate-600 list-disc pl-5">
                      {i.scoreMotivos.map((m) => <li key={m}>{traduzirMotivo(m)}</li>)}
                    </ul>
                  )}
                  <details className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <summary className="text-xs font-semibold text-slate-700 cursor-pointer min-h-[32px] flex items-center">Ver e-mail: {i.assunto}</summary>
                    <p className="text-sm font-bold mt-2 break-words">{i.assunto}</p>
                    <pre className="text-[13px] text-slate-800 whitespace-pre-wrap break-words font-sans mt-2">{i.corpo}</pre>
                  </details>
                  <div className="mt-3">
                    <button type="button" onClick={() => setCortar(i.messageId)} disabled={i.status === 'CANCELLED'} className={btn.secondary}>
                      <Scissors className="w-4 h-4" aria-hidden="true" /> Cortar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <MotivoDialog
        aberto={cortar !== null}
        aoFechar={() => setCortar(null)}
        titulo="Cortar esta mensagem do lote?"
        descricao={<p>A empresa não recebe esta mensagem. Diga por que, para ficar registrado.</p>}
        confirmar="Cortar"
        perigoso
        aoConfirmar={(motivo) => { if (cortar !== null) cortarMut.mutate({ messageId: cortar, motivo }); }}
      />
      <ConfirmDialog
        open={aprovar}
        onOpenChange={setAprovar}
        title="Aprovar o lote?"
        description={<p>{itens.length} mensagem(ns) ficam liberadas para envio quando o modo e o canal permitirem. Quem você cortou não entra.</p>}
        confirmLabel="Aprovar lote"
        onConfirm={() => { if (lote) aprovarMut.mutate({ loteId: lote.id }); }}
      />
    </Consulta>
  );
}
