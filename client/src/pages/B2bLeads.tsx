import { useState, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import { Building2, Search } from 'lucide-react';
import { toast } from 'sonner';

// Sprint 1 admin B2B — página do HOST PREMIUM (premium.salvitarn.com.br/sal-vita-b2b).
// Login próprio + sem AppShell, exatamente como SalVitaAdmin / SalVitaRecovery.
// NÃO pertence ao CRM de lembretes — é o admin de leads do produto premium.
// Visualização simples de leads inbound do formulário /atacado + 3 transições
// manuais de estágio + observação (audit log). Sem score/outbound/automação.

/* ── Estilos do login (mesmo padrão dos admins premium) ── */
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '.88rem',
  outline: 'none', fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '.72rem', fontWeight: 700, color: '#64748b',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em',
};
const btnPrimary: React.CSSProperties = {
  padding: '9px 16px', background: '#0C3680', color: 'white', border: 'none',
  borderRadius: 9, fontSize: '.83rem', fontWeight: 700, cursor: 'pointer',
};

const STAGE_LABEL: Record<string, string> = {
  discovered: 'Novo',
  qualified: 'Qualificado',
  contacted: 'Contatado',
  lost: 'Perdido',
};

const STAGE_BADGE: Record<string, string> = {
  discovered: 'bg-blue-100 text-blue-800',
  qualified: 'bg-emerald-100 text-emerald-800',
  contacted: 'bg-amber-100 text-amber-800',
  lost: 'bg-gray-200 text-gray-600',
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ── Login (host premium, igual SalVitaRecovery) ── */
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const loginMut = trpc.auth.login.useMutation();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginMut.mutateAsync({ email, password });
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message ?? 'Credenciais inválidas');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0b1d3a 0%,#1a3a6b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 24, boxShadow: '0 25px 60px rgba(0,0,0,.3)', padding: '40px 36px', width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: 56, width: 'auto', marginBottom: 12 }}>
            <defs><clipPath id="oval-b2b"><ellipse cx="250" cy="187" rx="228" ry="164" /></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="white" />
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#0C3680" clipPath="url(#oval-b2b)" />
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="#0C3680">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="#0C3680" strokeWidth="15" />
          </svg>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0b1d3a', margin: 0 }}>Leads B2B — Atacado</h1>
          <p style={{ fontSize: '.85rem', color: '#94a3b8', marginTop: 4 }}>premium.salvitarn.com.br</p>
        </div>
        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@salvitarn.com.br" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
          </div>
          <button type="submit" disabled={loading} style={{ ...btnPrimary, marginTop: 4, padding: '13px', borderRadius: 12, fontSize: '.95rem', opacity: loading ? .6 : 1 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Gate: login próprio, sem AppShell (host premium) ── */
export default function B2bLeads() {
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const logoutMut = trpc.auth.logout.useMutation();

  if (meQuery.isLoading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Carregando...</div>;
  }
  const user = meQuery.data as any;
  if (!user || user.role !== 'admin') {
    return <LoginForm />;
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* Header próprio do premium (não é o AppShell do CRM) */}
      <div style={{ background: 'linear-gradient(135deg,#0b1d3a 0%,#1a3a6b 100%)', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Leads B2B — Atacado</h1>
          <p style={{ margin: '2px 0 0', fontSize: '.8rem', color: 'rgba(255,255,255,.6)' }}>Recebidos pelo formulário /atacado · SLA recomendado: 2h úteis</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/sal-vita-admin" style={{ padding: '8px 14px', background: 'rgba(255,255,255,.12)', color: 'white', borderRadius: 9, fontSize: '.82rem', fontWeight: 600, textDecoration: 'none' }}>← Pedidos</a>
          <button onClick={async () => { await logoutMut.mutateAsync(); window.location.reload(); }} style={{ padding: '8px 14px', background: 'rgba(255,255,255,.12)', color: 'white', border: 'none', borderRadius: 9, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>Sair</button>
        </div>
      </div>
      <B2bLeadsInner />
    </div>
  );
}

/* ── Conteúdo (já autenticado) ── */
function B2bLeadsInner() {
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  const utils = trpc.useUtils();
  const { data: leads, isLoading } = trpc.b2b.listLeads.useQuery(
    stageFilter ? { stage: stageFilter } : undefined,
  );
  const { data: detail, isLoading: detailLoading } = trpc.b2b.getLead.useQuery(
    { companyId: selectedId! },
    { enabled: selectedId !== null },
  );

  const updateStage = trpc.b2b.updateStage.useMutation({
    onSuccess: () => {
      toast.success('Estágio atualizado');
      utils.b2b.listLeads.invalidate();
      utils.b2b.getLead.invalidate({ companyId: selectedId! });
    },
    onError: (e) => toast.error(e.message || 'Erro ao atualizar estágio'),
  });

  const addNote = trpc.b2b.addNote.useMutation({
    onSuccess: () => {
      toast.success('Observação adicionada');
      setNoteText('');
      utils.b2b.getLead.invalidate({ companyId: selectedId! });
    },
    onError: (e) => toast.error(e.message || 'Erro ao adicionar observação'),
  });

  const filtered = useMemo(() => {
    if (!leads) return [];
    if (!search.trim()) return leads;
    const q = search.toLowerCase();
    return leads.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.contactName ?? '').toLowerCase().includes(q) ||
      (l.contactEmail ?? '').toLowerCase().includes(q) ||
      (l.city ?? '').toLowerCase().includes(q),
    );
  }, [leads, search]);

  const countByStage = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads ?? []) c[l.pipelineStage] = (c[l.pipelineStage] ?? 0) + 1;
    return c;
  }, [leads]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Contadores por estágio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: '', label: 'Todos' },
          { key: 'qualified', label: 'Qualificados' },
          { key: 'contacted', label: 'Contatados' },
          { key: 'lost', label: 'Perdidos' },
        ].map(s => (
          <Card
            key={s.key}
            className={`cursor-pointer transition ${stageFilter === s.key ? 'ring-2 ring-blue-500' : ''}`}
            onClick={() => setStageFilter(s.key)}
          >
            <CardContent className="p-3 md:p-4 flex items-center gap-3">
              <Building2 className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-lg md:text-2xl font-bold">
                  {s.key ? (countByStage[s.key] ?? 0) : (leads?.length ?? 0)}
                </p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Busca */}
      <Card>
        <CardContent className="p-3 md:p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar empresa, responsável, e-mail ou cidade..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 p-2 border rounded text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Leads ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500 py-6 text-center">Carregando...</p>
          ) : filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Empresa</th>
                    <th className="p-2 text-left">Responsável</th>
                    <th className="p-2 text-left hidden sm:table-cell">Segmento</th>
                    <th className="p-2 text-left hidden md:table-cell">Cidade/UF</th>
                    <th className="p-2 text-left hidden lg:table-cell">Entrada</th>
                    <th className="p-2 text-left">Estágio</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => (
                    <tr key={lead.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium max-w-[180px] truncate cursor-pointer" onClick={() => setSelectedId(lead.id)}>
                        {lead.name}
                      </td>
                      <td className="p-2 text-gray-600">
                        <div>{lead.contactName || '--'}</div>
                        <div className="text-xs text-blue-600">{lead.contactEmail || ''}</div>
                      </td>
                      <td className="p-2 hidden sm:table-cell text-gray-500 text-xs">{lead.segment || '--'}</td>
                      <td className="p-2 hidden md:table-cell text-gray-500 text-xs whitespace-nowrap">
                        {lead.city ? `${lead.city}/${lead.state ?? ''}` : '--'}
                      </td>
                      <td className="p-2 hidden lg:table-cell text-gray-400 text-xs whitespace-nowrap">{fmtDate(lead.createdAt)}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STAGE_BADGE[lead.pipelineStage] ?? 'bg-gray-100 text-gray-700'}`}>
                          {STAGE_LABEL[lead.pipelineStage] ?? lead.pipelineStage}
                        </span>
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="outline" onClick={() => setSelectedId(lead.id)}>
                          Ver detalhe
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {search || stageFilter ? 'Nenhum resultado encontrado' : 'Nenhum lead B2B ainda'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Leads aparecem aqui automaticamente quando alguém preenche o formulário em /atacado.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detalhe */}
      <Dialog open={selectedId !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.company.name ?? 'Lead B2B'}</DialogTitle>
          </DialogHeader>

          {detailLoading || !detail ? (
            <p className="text-sm text-gray-500 py-6 text-center">Carregando...</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-400 text-xs block">Segmento</span>{detail.company.segment || '--'}</div>
                <div><span className="text-gray-400 text-xs block">Cidade/UF</span>{detail.company.city ? `${detail.company.city}/${detail.company.state ?? ''}` : '--'}</div>
                <div><span className="text-gray-400 text-xs block">Entrada</span>{fmtDate(detail.company.createdAt)}</div>
                <div>
                  <span className="text-gray-400 text-xs block">Estágio</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STAGE_BADGE[detail.company.pipelineStage] ?? 'bg-gray-100 text-gray-700'}`}>
                    {STAGE_LABEL[detail.company.pipelineStage] ?? detail.company.pipelineStage}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-gray-400 text-xs block mb-1">Contatos</span>
                {detail.contacts.length === 0 && <p className="text-gray-400 text-xs">Nenhum contato registrado.</p>}
                {detail.contacts.map(c => (
                  <div key={c.id} className="border rounded p-2 mb-1">
                    <p className="font-medium">{c.name || '--'}</p>
                    <p className="text-xs text-blue-600">{c.email || '--'}</p>
                    <p className="text-xs text-gray-500">WhatsApp: {c.whatsapp || c.phone || '--'}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap">
                {(['qualified', 'contacted', 'lost'] as const).map(stage => (
                  <Button
                    key={stage}
                    size="sm"
                    variant={detail.company.pipelineStage === stage ? 'default' : 'outline'}
                    disabled={updateStage.isPending}
                    onClick={() => updateStage.mutate({ companyId: detail.company.id, stage })}
                  >
                    Marcar como {STAGE_LABEL[stage]}
                  </Button>
                ))}
              </div>

              <div>
                <span className="text-gray-400 text-xs block mb-1">Observações e histórico</span>
                <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                  {detail.logs.length === 0 && <p className="text-gray-400 text-xs">Sem registros ainda.</p>}
                  {detail.logs.map(log => {
                    const meta = (log.metadataJson ?? {}) as Record<string, unknown>;
                    return (
                      <div key={log.id} className="text-xs border-l-2 border-gray-200 pl-2">
                        <span className="text-gray-400">{fmtDate(log.createdAt)}</span>{' '}
                        {log.action === 'note_added' && <span>📝 {String(meta.byName ?? 'admin')}: {String(meta.note ?? '')}</span>}
                        {log.action === 'stage_changed' && <span>🔄 {String(meta.byName ?? 'admin')} marcou como {STAGE_LABEL[String(meta.newStage)] ?? String(meta.newStage)}</span>}
                        {log.action === 'inbound_lead_created' && <span>📥 Lead recebido pelo formulário /atacado{meta.volumeInterest ? ` — ${String(meta.volumeInterest)}` : ''}{meta.message ? ` · "${String(meta.message)}"` : ''}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    placeholder="Adicionar observação..."
                    className="flex-1 p-2 border rounded text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={!noteText.trim() || addNote.isPending}
                    onClick={() => detail && addNote.mutate({ companyId: detail.company.id, note: noteText.trim() })}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
