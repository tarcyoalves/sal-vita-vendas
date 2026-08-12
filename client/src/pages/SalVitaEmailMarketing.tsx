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

export function SalVitaEmailMarketing() {
  const [activeTab, setActiveTab] = useState<'enviar' | 'automatizar' | 'audiencia' | 'resultados'>('enviar');

  // Queries
  const metricsQuery = trpc.emailMarketing.getMetrics.useQuery(undefined, { refetchInterval: 10000 });
  const previewAudienceQuery = trpc.emailMarketing.previewAudience.useQuery();
  const campaignsQuery = trpc.emailMarketing.getCampaigns.useQuery();
  const sequencesQuery = trpc.emailMarketing.getSequences.useQuery();
  const rulesQuery = trpc.emailMarketing.getAutomationRules.useQuery();
  const templatesQuery = trpc.emailMarketing.getTemplates.useQuery();
  const contactsQuery = trpc.emailMarketing.getContacts.useQuery({});
  const suppressionsQuery = trpc.emailMarketing.getSuppressions.useQuery();

  // Mutations
  const createCampaignMut = trpc.emailMarketing.createCampaign.useMutation({
    onSuccess: () => {
      toast.success('Campanha criada com sucesso e destinatários vinculados!');
      campaignsQuery.refetch();
      metricsQuery.refetch();
      setIsNewCampaignOpen(false);
    },
    onError: (err) => toast.error(`Erro ao criar campanha: ${err.message}`),
  });

  const dispatchCampaignMut = trpc.emailMarketing.dispatchCampaign.useMutation({
    onSuccess: (data) => {
      toast.success(`Lote processado: ${data.sent} enviados, ${data.failed} falhas.`);
      campaignsQuery.refetch();
      metricsQuery.refetch();
    },
    onError: (err) => toast.error(`Erro no disparo: ${err.message}`),
  });

  const pauseCampaignMut = trpc.emailMarketing.pauseCampaign.useMutation({
    onSuccess: () => campaignsQuery.refetch(),
  });

  const deleteCampaignMut = trpc.emailMarketing.deleteCampaign.useMutation({
    onSuccess: () => {
      toast.success('Campanha removida.');
      campaignsQuery.refetch();
    },
  });

  const addSuppressionMut = trpc.emailMarketing.addSuppression.useMutation({
    onSuccess: () => {
      toast.success('E-mail adicionado à lista de supressão (LGPD).');
      suppressionsQuery.refetch();
      metricsQuery.refetch();
    },
  });

  const removeSuppressionMut = trpc.emailMarketing.removeSuppression.useMutation({
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
                onClick={() => trpc.useUtils().emailMarketing.getSequences.invalidate()}
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
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900">{seq.name}</h4>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
                        {seq.activeEnrollments} inscritos ativos
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {seq.steps.length} passos cadastrados {seq.repeat && '• Repetição em Loop ativa'}
                    </div>
                    <div className="space-y-1">
                      {seq.steps.map((st: any) => (
                        <div key={st.id} className="text-xs bg-white p-2 rounded-lg border border-slate-200 flex justify-between">
                          <span>Dia {st.delay_days}: <strong>{st.subject}</strong></span>
                          <span className="text-slate-400">{st.send_condition}</span>
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
