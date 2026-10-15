import React, { useState } from 'react';
import { trpc } from '../lib/trpc';
import {
  Send,
  Sparkles,
  Users,
  BarChart3,
  Plus,
  Play,
  Pause,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  FileText,
  Mail,
  Zap,
  Split,
  UserX,
  Search,
  Server,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { looksLikeHtml, plainTextToEmailHtml } from '../../../shared/emailText';
/* Prévia do passo da sequência: mesma conversão do servidor (shared/emailText.ts). */
const PREVIEW_VARS: Record<string, string> = {
  nome: 'Maria',
  link_loja: 'https://www.premium.salvitarn.com.br/',
  unsubscribe: 'https://www.premium.salvitarn.com.br/api/unsubscribe',
};
function fillPreviewVars(s: string): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => PREVIEW_VARS[k] ?? m);
}
function stepPreviewHtml(body: string): string {
  const filled = fillPreviewVars(body);
  const inner = looksLikeHtml(filled) ? filled : plainTextToEmailHtml(filled);
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px 28px;border:1px solid #e2e8f0;">${inner}<p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">Rodapé padrão: link para sair da lista.</p></div></body></html>`;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function SalVitaEmailMarketing() {
  const [activeTab, setActiveTab] = useState<'enviar' | 'automatizar' | 'audiencia' | 'resultados'>('enviar');
  // useUtils é um hook: precisa ser chamado no corpo do componente. Estava
  // dentro de um onClick, o que quebra as regras de hooks em runtime.
  const utils = trpc.useUtils();

  // Queries
  const metricsQuery = trpc.premiumEmailMarketing.getMetrics.useQuery(undefined, { refetchInterval: 10000 });
  const previewAudienceQuery = trpc.premiumEmailMarketing.previewAudience.useQuery();
  const campaignsQuery = trpc.premiumEmailMarketing.getCampaigns.useQuery();
  const sequencesQuery = trpc.premiumEmailMarketing.getSequences.useQuery();
  const rulesQuery = trpc.premiumEmailMarketing.getAutomationRules.useQuery();
  const templatesQuery = trpc.premiumEmailMarketing.getTemplates.useQuery();
  const contactsQuery = trpc.premiumEmailMarketing.getContacts.useQuery({});
  const suppressionsQuery = trpc.premiumEmailMarketing.getSuppressions.useQuery();

  // Mutations
  const createCampaignMut = trpc.premiumEmailMarketing.createCampaign.useMutation({
    onSuccess: () => {
      toast.success('Campanha criada com sucesso e destinatários vinculados!');
      campaignsQuery.refetch();
      metricsQuery.refetch();
      setIsNewCampaignOpen(false);
    },
    onError: (err) => toast.error(`Erro ao criar campanha: ${err.message}`),
  });

  const dispatchCampaignMut = trpc.premiumEmailMarketing.dispatchCampaign.useMutation({
    onSuccess: (data) => {
      toast.success(`Lote processado: ${data.sent} enviados, ${data.failed} falhas.`);
      campaignsQuery.refetch();
      metricsQuery.refetch();
    },
    onError: (err) => toast.error(`Erro no disparo: ${err.message}`),
  });

  const pauseCampaignMut = trpc.premiumEmailMarketing.pauseCampaign.useMutation({
    onSuccess: () => campaignsQuery.refetch(),
  });

  const deleteCampaignMut = trpc.premiumEmailMarketing.deleteCampaign.useMutation({
    onSuccess: () => {
      toast.success('Campanha removida.');
      campaignsQuery.refetch();
    },
  });

  const addSuppressionMut = trpc.premiumEmailMarketing.addSuppression.useMutation({
    onSuccess: () => {
      toast.success('E-mail adicionado à lista de supressão (LGPD).');
      suppressionsQuery.refetch();
      metricsQuery.refetch();
    },
  });

  const toggleSequenceMut = trpc.premiumEmailMarketing.toggleSequence.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(vars.active ? 'Sequência ligada: começa a enviar no próximo ciclo diário.' : 'Sequência desligada: nada mais é enviado por ela.');
      sequencesQuery.refetch();
    },
    onError: (err) => toast.error(`Erro ao alterar a sequência: ${err.message}`),
  });

  const updateStepMut = trpc.premiumEmailMarketing.updateSequenceStep.useMutation({
    onSuccess: () => {
      toast.success('Passo salvo.');
      sequencesQuery.refetch();
      setEditingStep(null);
    },
    onError: (err) => toast.error(`Erro ao salvar o passo: ${err.message}`),
  });

  const removeSuppressionMut = trpc.premiumEmailMarketing.removeSuppression.useMutation({
    onSuccess: () => {
      toast.success('E-mail removido da supressão.');
      suppressionsQuery.refetch();
      metricsQuery.refetch();
    },
  });

  // Modals state
  const [isNewCampaignOpen, setIsNewCampaignOpen] = useState(false);
  const [campName, setCampName] = useState('');
  const [campSubject, setCampSubject] = useState('');
  const [campSubjectB, setCampSubjectB] = useState('');
  const [campBody, setCampBody] = useState('');
  const [useSubjectAB, setUseSubjectAB] = useState(false);

  const [newSuppressionEmail, setNewSuppressionEmail] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [editingStep, setEditingStep] = useState<{ id: number; subject: string; htmlBody: string; delayDays: number } | null>(null);

  const metrics = metricsQuery.data;
  const audience = previewAudienceQuery.data;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Tabs */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Mail className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">E-mail Marketing SaaS</h1>
              <p className="text-slate-400 text-sm">
                Sal Vita Premium — Campanhas em Massa, Sequências Drip, Gestão Multi-Conta e LGPD 100%
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
          <button
            onClick={() => setActiveTab('enviar')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'enviar' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Send className="w-4 h-4" /> Enviar
          </button>
          <button
            onClick={() => setActiveTab('automatizar')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'automatizar' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" /> Automatizar
          </button>
          <button
            onClick={() => setActiveTab('audiencia')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'audiencia' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Audiência
          </button>
          <button
            onClick={() => setActiveTab('resultados')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === 'resultados' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Resultados & Cotas
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Público Ativo</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{audience?.total ?? 0}</p>
            <p className="text-xs text-emerald-600 font-medium mt-1">✓ Sem duplicados / opt-outs</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Campanhas</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{metrics?.totalCampaigns ?? 0}</p>
            <p className="text-xs text-blue-600 font-medium mt-1">{metrics?.totalSentCampaignEmails ?? 0} e-mails entregues</p>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center font-bold">
            <Send className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inscrições Drip</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{metrics?.activeEnrollments ?? 0}</p>
            <p className="text-xs text-amber-600 font-medium mt-1">Sequências em execução</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center font-bold">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Supressões (LGPD)</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{metrics?.totalSuppressions ?? 0}</p>
            <p className="text-xs text-slate-500 font-medium mt-1">Opt-outs & bounces globais</p>
          </div>
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-bold">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* TAB 1: ENVIAR (Campanhas em Massa) */}
      {activeTab === 'enviar' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Campanhas de E-mail</h2>
              <p className="text-sm text-slate-500">Crie, agende e envie disparos em massa com suporte a Teste A/B de assunto.</p>
            </div>
            <button
              onClick={() => setIsNewCampaignOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition shadow-md"
            >
              <Plus className="w-4 h-4" /> Nova Campanha
            </button>
          </div>

          {/* Campaigns Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-4">Campanha</th>
                  <th className="px-6 py-4">Assunto</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Destinatários</th>
                  <th className="px-6 py-4">Progresso</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaignsQuery.data?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                      Nenhuma campanha criada ainda. Clique em "Nova Campanha" acima.
                    </td>
                  </tr>
                ) : (
                  campaignsQuery.data?.map((camp) => {
                    const pct = camp.total_recipients > 0 ? Math.round((camp.sent_count / camp.total_recipients) * 100) : 0;
                    return (
                      <tr key={camp.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-6 py-4 font-semibold text-slate-900">{camp.name}</td>
                        <td className="px-6 py-4">
                          <div>{camp.subject}</div>
                          {camp.subject_b && (
                            <div className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                              <Split className="w-3 h-3" /> Variant B: {camp.subject_b}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              camp.status === 'sent'
                                ? 'bg-emerald-100 text-emerald-800'
                                : camp.status === 'sending'
                                ? 'bg-blue-100 text-blue-800 animate-pulse'
                                : camp.status === 'paused'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {camp.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium">{camp.total_recipients} contatos</td>
                        <td className="px-6 py-4">
                          <div className="w-48 space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-600">
                              <span>{camp.sent_count} / {camp.total_recipients}</span>
                              <span>{pct}%</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div className="bg-blue-600 h-2 transition-all duration-300" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          {camp.status !== 'sent' && (
                            <button
                              onClick={() => dispatchCampaignMut.mutate({ campaignId: camp.id })}
                              disabled={dispatchCampaignMut.isPending}
                              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-100 transition text-xs"
                            >
                              <Play className="w-3.5 h-3.5" /> Disparar Lote
                            </button>
                          )}
                          <button
                            onClick={() => deleteCampaignMut.mutate({ campaignId: camp.id })}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: AUTOMATIZAR (Sequências & Automações) */}
      {activeTab === 'automatizar' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Drip Sequences */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-4 border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" /> Sequências Drip
                </h3>
                <p className="text-sm text-slate-500">Fluxos de nutrição automatizados por dia e engajamento.</p>
              </div>
              <button
                onClick={() => utils.premiumEmailMarketing.getSequences.invalidate()}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {sequencesQuery.data?.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Nenhuma sequência configurada.</p>
              ) : (
                sequencesQuery.data?.map((seq) => (
                  <div key={seq.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900">{seq.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${seq.active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {seq.active ? 'Ligada' : 'Desligada'}
                        </span>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
                          {seq.activeEnrollments} inscritos ativos
                        </span>
                      </div>
                    </div>
                    {!seq.active && (
                      <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-2.5">
                        Esta sequência está <strong>desligada</strong>: ninguém é inscrito e nada é enviado. Revise o texto de cada passo (botão Editar) e ligue quando estiver pronta.
                      </div>
                    )}
                    <button
                      onClick={() => toggleSequenceMut.mutate({ sequenceId: seq.id, active: !seq.active })}
                      disabled={toggleSequenceMut.isPending}
                      className={`px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50 ${seq.active ? 'border border-slate-200 text-slate-700 hover:bg-slate-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                    >
                      {seq.active ? 'Desligar sequência' : 'Ligar sequência'}
                    </button>
                    <div className="text-xs text-slate-500">
                      {seq.steps.length} passos cadastrados {seq.repeat && '• Repetição em Loop ativa'}
                    </div>
                    <div className="space-y-1">
                      {seq.steps.map((st: any) => (
                        <div key={st.id} className="text-xs bg-white p-2 rounded-lg border border-slate-200 flex justify-between items-center gap-2">
                          <span>
                            {st.step_order}. +{st.delay_days} dia(s): <strong>{st.subject}</strong>
                            {st.send_condition !== 'always' && <span className="text-slate-400"> ({st.send_condition})</span>}
                          </span>
                          <button
                            onClick={() => setEditingStep({ id: st.id, subject: st.subject, htmlBody: st.html_body, delayDays: st.delay_days })}
                            className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-100"
                          >
                            Editar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Rules Engine */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-4 border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" /> Regras de Automação
                </h3>
                <p className="text-sm text-slate-500">Gatilhos automáticos (ex: lead inativo, pós-venda).</p>
              </div>
            </div>

            <div className="space-y-3">
              {rulesQuery.data?.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">Nenhuma regra de automação.</p>
              ) : (
                rulesQuery.data?.map((rule) => (
                  <div key={rule.id} className="p-4 rounded-xl border border-slate-200 bg-white flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{rule.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Gatilho: <span className="font-semibold text-slate-700">{rule.trigger_type}</span> ➔ Ação: <span className="font-semibold text-blue-600">{rule.action_type}</span>
                      </div>
                    </div>
                    <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">Ativo</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIÊNCIA (Contatos & Supressões LGPD) */}
      {activeTab === 'audiencia' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Contacts list */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-4 border-slate-100">
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" /> Contatos & Fontes
                </h3>
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Buscar contato..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">E-mail</th>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Origem</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contactsQuery.data?.map((mc) => (
                      <tr key={mc.id}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{mc.email}</td>
                        <td className="px-4 py-3">{mc.name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                            {mc.source}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold">
                            {mc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Suppression / Opt-out Management (LGPD) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="border-b pb-4 border-slate-100">
                <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2 text-rose-600">
                  <ShieldCheck className="w-5 h-5" /> Conformidade LGPD & Opt-Outs
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Um opt-out nesta lista bloqueia e-mails em todos os produtos do grupo.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Adicionar e-mail para bloquear..."
                  value={newSuppressionEmail}
                  onChange={(e) => setNewSuppressionEmail(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-500"
                />
                <button
                  onClick={() => {
                    if (newSuppressionEmail) {
                      addSuppressionMut.mutate({ email: newSuppressionEmail });
                      setNewSuppressionEmail('');
                    }
                  }}
                  className="bg-rose-600 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-rose-700 transition"
                >
                  Bloquear
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {suppressionsQuery.data?.map((sup) => (
                  <div key={sup.id} className="p-3 bg-rose-50/50 rounded-xl border border-rose-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-rose-900">{sup.email}</span>
                      <div className="text-slate-500">Motivo: {sup.reason}</div>
                    </div>
                    <button
                      onClick={() => removeSuppressionMut.mutate({ email: sup.email })}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RESULTADOS & COTAS MULTI-CONTA */}
      {activeTab === 'resultados' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600" /> Vendas do follow-up pós-compra
            </h3>
            <p className="text-sm text-slate-500">Pedidos pagos que vieram de links dos e-mails de pós-venda (utm_medium=posvenda).</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Pedidos (30 dias)', value: String(metrics?.posvenda.orders30 ?? 0) },
                { label: 'Receita (30 dias)', value: brl(metrics?.posvenda.revenue30 ?? 0) },
                { label: 'Pedidos (90 dias)', value: String(metrics?.posvenda.orders90 ?? 0) },
                { label: 'Receita (90 dias)', value: brl(metrics?.posvenda.revenue90 ?? 0) },
              ].map((m) => (
                <div key={m.label} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                  <p className="text-xs font-semibold text-slate-500">{m.label}</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-600" /> Consumo de Cotas por Conta / Provedor
            </h3>
            <p className="text-sm text-slate-500">Monitoramento em tempo real do sistema de transbordo multi-conta (Resend 1..5 + Brevo 1..5).</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {metrics?.accounts.map((acc) => {
                const dailyPct = Math.round((acc.sentToday / acc.dailyLimit) * 100);
                const monthlyPct = Math.round((acc.sentMonth / acc.monthlyLimit) * 100);

                return (
                  <div key={acc.key} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 uppercase text-xs tracking-wider bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full">
                        {acc.provider} ({acc.key})
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{acc.from.split('<')[0]}</span>
                    </div>

                    <div className="space-y-2 pt-2">
                      <div>
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>Cota Diária</span>
                          <span>{acc.sentToday} / {acc.dailyLimit}</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                          <div className="bg-blue-600 h-2" style={{ width: `${dailyPct}%` }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>Cota Mensal</span>
                          <span>{acc.sentMonth} / {acc.monthlyLimit}</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                          <div className="bg-purple-600 h-2" style={{ width: `${monthlyPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* EDIT SEQUENCE STEP DIALOG */}
      {editingStep && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-xl text-slate-900">Editar passo da sequência</h3>
            <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 text-sm">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assunto</label>
                <input
                  type="text"
                  value={editingStep.subject}
                  onChange={(e) => setEditingStep({ ...editingStep, subject: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dias depois do e-mail anterior</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={editingStep.delayDays}
                  onChange={(e) => setEditingStep({ ...editingStep, delayDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                  className="w-32 px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="step-body" className="block font-semibold text-slate-700 mb-1">Texto do e-mail</label>
                <textarea
                  id="step-body"
                  value={editingStep.htmlBody}
                  onChange={(e) => setEditingStep({ ...editingStep, htmlBody: e.target.value })}
                  rows={16}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm leading-relaxed"
                />
                <ul className="text-xs text-slate-600 mt-2 space-y-1 list-disc pl-4">
                  <li>Escreva normalmente. Deixe uma <strong>linha em branco</strong> entre os parágrafos.</li>
                  <li>Lista: comece a linha com <code>- </code> (traço e espaço).</li>
                  <li>Link: <code>[texto do botão]({'{link_loja}'})</code> leva para a loja. <code>**assim**</code> fica em negrito.</li>
                  <li><code>{'{nome}'}</code> vira o nome do cliente. O link para sair da lista já vai no rodapé de todo e-mail.</li>
                  <li>Não use alegações de saúde, minerais ou pureza.</li>
                </ul>
              </div>
            </div>
            <div>
              <p className="block font-semibold text-slate-700 mb-1 text-sm">Prévia (como o cliente vê, com nome de exemplo)</p>
              <p className="text-xs text-slate-600 mb-2"><strong>Assunto:</strong> {fillPreviewVars(editingStep.subject)}</p>
              <iframe
                title="Prévia do e-mail"
                sandbox=""
                srcDoc={stepPreviewHtml(editingStep.htmlBody)}
                className="w-full h-[460px] border border-slate-200 rounded-xl bg-white"
              />
            </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditingStep(null)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={() => updateStepMut.mutate({ stepId: editingStep.id, subject: editingStep.subject, htmlBody: editingStep.htmlBody, delayDays: editingStep.delayDays })}
                disabled={updateStepMut.isPending || !editingStep.subject.trim() || !editingStep.htmlBody.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {updateStepMut.isPending ? 'Salvando...' : 'Salvar passo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW CAMPAIGN DIALOG */}
      {isNewCampaignOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-xl text-slate-900">Nova Campanha de E-mail</h3>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Interno</label>
                <input
                  type="text"
                  placeholder="Ex: Oferta Especial Flor de Sal"
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assunto Principal (Variante A)</label>
                <input
                  type="text"
                  placeholder="Ex: Descubra o verdadeiro sabor do Sal Vita 🌊"
                  value={campSubject}
                  onChange={(e) => setCampSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ab-test"
                  checked={useSubjectAB}
                  onChange={(e) => setUseSubjectAB(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="ab-test" className="font-semibold text-slate-700 cursor-pointer">
                  Habilitar Teste A/B de Assunto
                </label>
              </div>

              {useSubjectAB && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assunto (Variante B)</label>
                  <input
                    type="text"
                    placeholder="Ex: Seu sal de cozinha comum está estragando suas receitas?"
                    value={campSubjectB}
                    onChange={(e) => setCampSubjectB(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Corpo do E-mail (Texto ou HTML)</label>
                <textarea
                  rows={6}
                  placeholder="Digite o texto da mensagem. Parágrafos são convertidos automaticamente..."
                  value={campBody}
                  onChange={(e) => setCampBody(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-sans"
                />
                <p className="text-xs text-slate-500 mt-1">Variáveis disponíveis: &#123;nome&#125;, &#123;email&#125;, &#123;unsubscribe&#125;</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsNewCampaignOpen(false)}
                className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (campName && campSubject && campBody) {
                    createCampaignMut.mutate({
                      name: campName,
                      subject: campSubject,
                      subjectB: useSubjectAB ? campSubjectB : undefined,
                      htmlBody: campBody,
                    });
                  }
                }}
                disabled={createCampaignMut.isPending}
                className="bg-blue-600 text-white font-semibold px-5 py-2 rounded-xl hover:bg-blue-700 transition shadow-md"
              >
                {createCampaignMut.isPending ? 'Criando...' : 'Criar & Vincular Audiência'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
