import { useState, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import {
  Building2,
  Search,
  CheckCircle2,
  Clock,
  PhoneCall,
  XCircle,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Send,
  User,
  MessageSquare,
  ChevronRight,
  ExternalLink,
  Briefcase,
  X
} from 'lucide-react';
import { toast } from 'sonner';

const STAGE_LABEL: Record<string, string> = {
  discovered: 'Novo Lead',
  qualified: 'Qualificado',
  contacted: 'Contatado',
  lost: 'Perdido',
};

const STAGE_PILL: Record<string, { bg: string; text: string; border: string }> = {
  discovered: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  qualified: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  contacted: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  lost:      { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function B2bLeadsPanel() {
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');

  const utils = trpc.useUtils();
  const { data: leads = [], isLoading } = trpc.b2b.listLeads.useQuery(
    stageFilter ? { stage: stageFilter } : undefined,
  );
  const { data: detail, isLoading: detailLoading } = trpc.b2b.getLead.useQuery(
    { companyId: selectedId! },
    { enabled: selectedId !== null },
  );

  const updateStage = trpc.b2b.updateStage.useMutation({
    onSuccess: () => {
      toast.success('Estágio do lead atualizado!');
      utils.b2b.listLeads.invalidate();
      utils.b2b.getLead.invalidate({ companyId: selectedId! });
    },
    onError: (e) => toast.error(e.message || 'Erro ao atualizar estágio'),
  });

  const addNote = trpc.b2b.addNote.useMutation({
    onSuccess: () => {
      toast.success('Observação adicionada!');
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
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Leads B2B Atacado</h2>
          <p className="text-xs text-slate-500">Gestão de contatos corporativos e revendedores vindos do formulário /atacado (SLA: 2h úteis).</p>
        </div>
      </div>

      {/* Pipeline Stage Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { key: '', label: 'Todos os Leads', icon: Building2, color: 'text-slate-700', bg: 'bg-slate-100' },
          { key: 'discovered', label: 'Novos Leads', icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
          { key: 'qualified', label: 'Qualificados', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { key: 'contacted', label: 'Em Negociação', icon: PhoneCall, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(s => {
          const Icon = s.icon;
          const active = stageFilter === s.key;
          const count = s.key ? (countByStage[s.key] ?? 0) : leads.length;
          return (
            <div
              key={s.key}
              onClick={() => setStageFilter(s.key)}
              className={`bg-white rounded-2xl border p-4 transition duration-200 cursor-pointer shadow-xs hover:shadow-md ${
                active ? 'border-blue-600 ring-2 ring-blue-500/20' : 'border-slate-200/80'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-xl ${s.bg} ${s.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Search Input Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3 shadow-xs">
        <div className="relative">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empresa, responsável, e-mail, segmento ou cidade..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20 transition"
          />
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Empresas Cadastradas ({filtered.length})</h3>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-slate-400 text-xs">Carregando leads B2B...</div>
        ) : filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3.5 pl-4">Empresa</th>
                  <th className="p-3.5">Contato</th>
                  <th className="p-3.5 hidden sm:table-cell">Segmento</th>
                  <th className="p-3.5 hidden md:table-cell">Cidade/UF</th>
                  <th className="p-3.5">Estágio</th>
                  <th className="p-3.5 pr-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(lead => {
                  const pill = STAGE_PILL[lead.pipelineStage] ?? { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 pl-4 font-bold text-slate-900 cursor-pointer" onClick={() => setSelectedId(lead.id)}>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                            {lead.name.substring(0, 2).toUpperCase()}
                          </div>
                          <span>{lead.name}</span>
                        </div>
                      </td>
                      <td className="p-3.5 text-slate-600">
                        <p className="font-semibold text-slate-800">{lead.contactName || '--'}</p>
                        <p className="text-[11px] text-slate-400">{lead.contactEmail || ''}</p>
                      </td>
                      <td className="p-3.5 hidden sm:table-cell text-slate-500">{lead.segment || '--'}</td>
                      <td className="p-3.5 hidden md:table-cell text-slate-500">
                        {lead.city ? `${lead.city}/${lead.state ?? ''}` : '--'}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${pill.bg} ${pill.text} ${pill.border}`}>
                          {STAGE_LABEL[lead.pipelineStage] ?? lead.pipelineStage}
                        </span>
                      </td>
                      <td className="p-3.5 pr-4 text-right">
                        <button
                          onClick={() => setSelectedId(lead.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <Building2 className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="font-bold text-slate-800 text-sm">Nenhum lead encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Os contatos do formulário público /atacado aparecerão aqui.</p>
          </div>
        )}
      </div>

      {/* Lead Detail Dialog Modal */}
      {selectedId !== null && (
        <div onClick={e => e.target === e.currentTarget && setSelectedId(null)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-900">{detail?.company.name ?? 'Detalhes do Lead B2B'}</h3>
              <button onClick={() => setSelectedId(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading || !detail ? (
              <div className="py-8 text-center text-xs text-slate-400">Carregando ficha da empresa...</div>
            ) : (
              <div className="space-y-5 text-xs">
                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Segmento</span>
                    <span className="font-bold text-slate-800">{detail.company.segment || '--'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Cidade/UF</span>
                    <span className="font-bold text-slate-800">{detail.company.city ? `${detail.company.city}/${detail.company.state ?? ''}` : '--'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Data Entrada</span>
                    <span className="font-bold text-slate-800">{fmtDate(detail.company.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold block">Estágio Atual</span>
                    <span className="font-bold text-blue-900">{STAGE_LABEL[detail.company.pipelineStage] ?? detail.company.pipelineStage}</span>
                  </div>
                </div>

                {/* Contacts List */}
                <div>
                  <span className="text-slate-500 font-semibold uppercase tracking-wider block mb-2">Pessoas de Contato</span>
                  {detail.contacts.map(c => (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                      <p className="font-bold text-slate-900">{c.name || '--'}</p>
                      <p className="text-slate-500">✉️ {c.email || '--'}</p>
                      <p className="text-slate-500">📱 WhatsApp: {c.whatsapp || c.phone || '--'}</p>
                      {(c.whatsapp || c.phone) && (
                        <a
                          href={`https://wa.me/${(c.whatsapp || c.phone || '').replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200"
                        >
                          <Send className="w-3 h-3" /> Conversar no WA
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pipeline Transition Buttons */}
                <div>
                  <span className="text-slate-500 font-semibold uppercase tracking-wider block mb-2">Mover Estágio do Pipeline</span>
                  <div className="flex gap-2 flex-wrap">
                    {/* 'discovered' é o estágio inicial automático e o servidor não aceita
                        voltar para ele (STAGE_VALUES em server/routers/b2b.ts) — o botão
                        existia mas dava erro de validação ao clicar. */}
                    {(['qualified', 'contacted', 'lost'] as const).map(stage => (
                      <button
                        key={stage}
                        disabled={updateStage.isPending}
                        onClick={() => updateStage.mutate({ companyId: detail.company.id, stage })}
                        className={`px-3 py-1.5 rounded-xl font-semibold text-xs transition cursor-pointer ${
                          detail.company.pipelineStage === stage
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {STAGE_LABEL[stage]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Timeline / Notes */}
                <div>
                  <span className="text-slate-500 font-semibold uppercase tracking-wider block mb-2">Histórico & Observações</span>
                  <div className="max-h-36 overflow-y-auto space-y-2 mb-3 pr-1">
                    {detail.logs.map(log => {
                      const meta = (log.metadataJson ?? {}) as Record<string, unknown>;
                      return (
                        <div key={log.id} className="border-l-2 border-blue-500 pl-3 py-1 text-xs text-slate-600">
                          <span className="text-slate-400 text-[10px] block">{fmtDate(log.createdAt)}</span>
                          {log.action === 'note_added' && <span>📝 {String(meta.byName ?? 'admin')}: {String(meta.note ?? '')}</span>}
                          {log.action === 'stage_changed' && <span>🔄 Alterado para <strong>{STAGE_LABEL[String(meta.newStage)] ?? String(meta.newStage)}</strong></span>}
                          {log.action === 'inbound_lead_created' && <span>📥 Lead criado via formulário /atacado</span>}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Adicionar nota interna..."
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20"
                    />
                    <button
                      disabled={!noteText.trim() || addNote.isPending}
                      onClick={() => addNote.mutate({ companyId: detail.company.id, note: noteText.trim() })}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
