import { useState } from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { trpc } from '../../../lib/trpc';
import { btn, INPUT } from '../../../components/premium/admin/adminUi';
import { ConfirmDialog } from '../../../components/premium/admin/ConfirmDialog';
import { errorMessage } from '../../../components/premium/admin/adminLogic';
import { Aviso, Card, Consulta, MotivoDialog, Pill, Vazio, fmtData, type Tom } from './ui';
import { EXCECAO_LABEL, SEVERIDADE_LABEL, SEVERIDADE_ORDEM } from './motivos';

const TOM_SEV: Record<string, Tom> = { critica: 'rose', alta: 'amber', normal: 'sky', baixa: 'slate' };

/** Mostra evidência / ação proposta (JSON livre do servidor) de forma legível e sem estourar a largura. */
function Dados({ titulo, valor }: { titulo: string; valor: unknown }) {
  if (valor === null || valor === undefined || valor === '') return null;
  const linhas = typeof valor === 'object' && !Array.isArray(valor)
    ? Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as const)
    : [['', typeof valor === 'string' ? valor : JSON.stringify(valor)] as const];
  return (
    <div className="mt-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">{titulo}</p>
      <dl className="space-y-0.5 text-[13px]">
        {linhas.map(([k, v]) => (
          <div key={k + v} className="flex gap-2 min-w-0"><dt className="font-semibold text-slate-700 shrink-0">{k}{k ? ':' : ''}</dt><dd className="text-slate-800 break-words min-w-0">{v}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function Excecoes() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const q = trpc.sales.excecoes.useQuery({ status, pagina: 1, porPagina: 50 });
  const [alvo, setAlvo] = useState<{ id: number; como: 'resolved' | 'dismissed' } | null>(null);
  const mut = trpc.sales.resolverExcecao.useMutation({
    onSuccess: () => { toast.success('Registrado.'); utils.sales.excecoes.invalidate(); utils.sales.painel.invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const itens = [...(q.data?.itens ?? [])].sort((a, b) => (SEVERIDADE_ORDEM[a.severity] ?? 9) - (SEVERIDADE_ORDEM[b.severity] ?? 9) || b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <Card
      titulo={`Situações para decidir${q.data ? ` (${q.data.total})` : ''}`}
      acao={
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${INPUT} !w-auto`} aria-label="Filtrar situação">
          <option value="open">Abertas</option><option value="resolved">Resolvidas</option><option value="dismissed">Dispensadas</option>
        </select>
      }
    >
      <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
        {itens.length === 0 ? <Vazio>Nada por aqui.</Vazio> : (
          <ul className="space-y-3">
            {itens.map((x) => (
              <li key={x.id} className="rounded-xl border border-slate-200 p-3 min-w-0">
                <div className="flex flex-wrap gap-1.5 mb-1">
                  <Pill tom={TOM_SEV[x.severity] ?? 'slate'}>{SEVERIDADE_LABEL[x.severity] ?? x.severity}</Pill>
                  <Pill>{EXCECAO_LABEL[x.kind] ?? x.kind}</Pill>
                </div>
                <p className="font-bold text-slate-900 text-sm break-words">{x.title}</p>
                {x.detail && <p className="text-[13px] text-slate-700 mt-1 whitespace-pre-wrap break-words">{x.detail}</p>}
                <Dados titulo="Evidência" valor={x.evidence} />
                <Dados titulo="Ação proposta" valor={x.proposedAction} />
                <p className="text-[11px] text-slate-500 mt-2">{fmtData(x.createdAt)} · por {x.createdBy}</p>
                {status === 'open' && (
                  <div className="flex flex-col sm:flex-row gap-2 mt-3">
                    <button type="button" onClick={() => setAlvo({ id: x.id, como: 'resolved' })} className={btn.success}><Check className="w-4 h-4" aria-hidden="true" /> Resolver</button>
                    <button type="button" onClick={() => setAlvo({ id: x.id, como: 'dismissed' })} className={btn.secondary}><X className="w-4 h-4" aria-hidden="true" /> Dispensar</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Consulta>
      <MotivoDialog
        aberto={alvo !== null}
        aoFechar={() => setAlvo(null)}
        titulo={alvo?.como === 'resolved' ? 'Marcar como resolvida' : 'Dispensar esta situação'}
        rotulo="O que foi feito (ou por que dispensar)"
        confirmar={alvo?.como === 'resolved' ? 'Resolver' : 'Dispensar'}
        aoConfirmar={(resolucao) => { if (alvo) mut.mutate({ id: alvo.id, status: alvo.como, resolucao }); }}
      />
    </Card>
  );
}

function Desconhecidas() {
  const utils = trpc.useUtils();
  const q = trpc.sales.desconhecidas.useQuery();
  const [alvo, setAlvo] = useState<{ id: number; decisao: 'foi_enviada' | 'nao_foi_enviada' } | null>(null);
  const mut = trpc.sales.resolverDesconhecida.useMutation({
    onSuccess: () => { toast.success('Registrado.'); utils.sales.desconhecidas.invalidate(); utils.sales.painel.invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const itens = q.data ?? [];

  return (
    <Card titulo={`E-mails sem confirmação${q.data ? ` (${itens.length})` : ''}`}>
      <p className="text-xs text-slate-600 mb-3">O servidor de e-mail não confirmou se estes saíram. O sistema nunca reenvia sozinho: confira na caixa de enviados e diga o que aconteceu.</p>
      <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
        {itens.length === 0 ? <Vazio>Nenhum envio sem confirmação.</Vazio> : (
          <ul className="space-y-3">
            {itens.map((d) => (
              <li key={d.messageId} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 min-w-0">
                <p className="font-bold text-sm text-slate-900 break-words">{d.empresa}</p>
                <p className="text-xs text-slate-700 break-all">{d.email} · passo {d.passo + 1}</p>
                <p className="text-[11px] text-slate-500 mt-1">Última tentativa: {fmtData(d.ultimaTentativaEm)}{d.executor ? ` · ${d.executor}` : ''}</p>
                {d.respostaSmtp && <p className="text-[11px] text-slate-500 break-words">Resposta do servidor: {d.respostaSmtp}</p>}
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <button type="button" onClick={() => setAlvo({ id: d.messageId, decisao: 'foi_enviada' })} className={btn.success}>Foi enviada</button>
                  <button type="button" onClick={() => setAlvo({ id: d.messageId, decisao: 'nao_foi_enviada' })} className={btn.secondary}>Não foi enviada</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Consulta>
      <ConfirmDialog
        open={alvo !== null}
        onOpenChange={(o) => { if (!o) setAlvo(null); }}
        title={alvo?.decisao === 'foi_enviada' ? 'Confirmar: foi enviada' : 'Confirmar: NÃO foi enviada'}
        destructive={alvo?.decisao === 'nao_foi_enviada'}
        description={
          alvo?.decisao === 'foi_enviada' ? (
            <p>O sistema passa a contar como enviada e a sequência avança. Ela não será reenviada.</p>
          ) : (
            <Aviso tom="rose" titulo="Risco de e-mail duplicado">
              A mensagem volta para a fila e pode ser enviada de novo. Se ela na verdade saiu, a empresa recebe duas vezes e isso pode gerar reclamação. Só marque se tiver conferido na caixa de enviados.
            </Aviso>
          )
        }
        confirmLabel={alvo?.decisao === 'foi_enviada' ? 'Sim, foi enviada' : 'Sim, não foi enviada'}
        onConfirm={() => { if (alvo) mut.mutate({ messageId: alvo.id, decisao: alvo.decisao }); }}
      />
    </Card>
  );
}

export default function PrecisaTab() {
  return (
    <div className="space-y-4">
      <Excecoes />
      <Desconhecidas />
    </div>
  );
}
