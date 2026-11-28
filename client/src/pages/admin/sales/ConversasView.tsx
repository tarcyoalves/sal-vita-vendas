import { useState } from 'react';
import { ArrowLeft, Flag } from 'lucide-react';
import { trpc } from '../../../lib/trpc';
import { btn } from '../../../components/premium/admin/adminUi';
import { Card, Consulta, Pill, Vazio, fmtData } from './ui';

const ROLE: Record<string, string> = { user: 'Cliente', assistant: 'Assistente', tool: 'Sistema', system: 'Sistema' };

function Conversa({ id, voltar }: { id: string; voltar: () => void }) {
  const q = trpc.sales.conversa.useQuery({ id });
  return (
    <Card
      titulo="Conversa"
      acao={<button type="button" onClick={voltar} className={btn.secondary}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar</button>}
    >
      <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
        {q.data && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5 items-center">
              <p className="font-bold text-sm break-words">{q.data.conversa.companyName ?? 'Visitante'}</p>
              {q.data.conversa.flagged && <Pill tom="rose">Marcada{q.data.conversa.flagReason ? `: ${q.data.conversa.flagReason}` : ''}</Pill>}
            </div>
            <ul className="space-y-2">
              {q.data.mensagens.map((m, i) => (
                <li key={`${i}-${m.createdAt.getTime()}`} className={`rounded-xl p-3 text-[13px] min-w-0 ${m.blocked ? 'border-2 border-rose-300 bg-rose-50' : m.role === 'user' ? 'bg-slate-100' : 'bg-blue-50 border border-blue-100'}`}>
                  <p className="text-[11px] font-bold text-slate-500 mb-1">{ROLE[m.role] ?? m.role}{m.toolName ? ` (${m.toolName})` : ''} · {fmtData(m.createdAt)}</p>
                  <p className="whitespace-pre-wrap break-words text-slate-900">{m.content}</p>
                  {m.blocked && <p className="text-rose-800 font-semibold mt-1">Mensagem barrada, o cliente não viu{m.blockReason ? `: ${m.blockReason}` : '.'}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Consulta>
    </Card>
  );
}

export default function ConversasView() {
  const [soMarcadas, setSoMarcadas] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const q = trpc.sales.conversas.useQuery({ soMarcadas: soMarcadas || undefined, pagina: 1, porPagina: 50 });
  if (aberta) return <Conversa id={aberta} voltar={() => setAberta(null)} />;
  const itens = [...(q.data?.itens ?? [])].sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.lastAt.getTime() - a.lastAt.getTime());
  return (
    <Card
      titulo="Conversas do vendedor virtual"
      acao={<label className="flex items-center gap-2 text-xs text-slate-600 min-h-[44px]"><input type="checkbox" checked={soMarcadas} onChange={(e) => setSoMarcadas(e.target.checked)} className="w-4 h-4" /> Só marcadas</label>}
    >
      <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
        {itens.length === 0 ? <Vazio>Nenhuma conversa ainda.</Vazio> : (
          <ul className="space-y-2">
            {itens.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setAberta(c.id)} className={`w-full text-left rounded-xl border p-3 min-h-[44px] cursor-pointer hover:bg-slate-50 min-w-0 ${c.flagged ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.flagged && <Flag className="w-4 h-4 text-rose-600 shrink-0" aria-label="Marcada" />}
                    <p className="font-semibold text-sm text-slate-900 break-words min-w-0">{c.companyName ?? 'Visitante'}</p>
                    <Pill>{c.messageCount} msg</Pill>
                    <Pill>{c.status}</Pill>
                  </div>
                  {c.flagReason && <p className="text-[12px] text-rose-800 mt-1 break-words">{c.flagReason}</p>}
                  <p className="text-[11px] text-slate-500 mt-1">Última: {fmtData(c.lastAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Consulta>
    </Card>
  );
}
