import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Page, PageHeader, Panel, PanelHeader, StatStrip, Stat, EmptyState } from '../components/layout/Page';
import { Button } from '../components/ui/button';
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Users,
  ClipboardList,
  ArrowRight,
  MessageSquare,
  Settings,
  Scan,
  BarChart2,
  Activity,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
  AlertTriangle,
  Eye,
  RefreshCw,
  Download,
  DollarSign,
  Mail,
  ShieldAlert,
  Zap,
  PackageCheck,
  Ghost,
  Flame,
} from "lucide-react";
import AttendantDetailModal from '../components/AttendantDetailModal';
import { useFatStore } from '../lib/faturamento/store';
import { computeDashboardAgg, type DashSeller, type DashTask } from '../lib/dashboardAgg';
import { QueryError } from '../components/QueryError';
import { panoramaPorAtendente, somarResumos, mesAtual, formatBRL } from '../lib/faturamento/calc';
import { OrderDetailDialog } from '../components/faturamento/OrderDetailDialog';
import { OrderDialog } from '../components/faturamento/OrderDialog';
import { InvoiceDialog } from '../components/faturamento/InvoiceDialog';
import { DeleteOrderDialog } from '../components/faturamento/DeleteOrderDialog';

// Sellers created before dailyGoal was wired up still carry the old default of 10
// while the gamification has always targeted 100 — treat 10 as "not customized".
function effectiveDailyGoal(dailyGoal?: number | null): number {
  return dailyGoal && dailyGoal !== 10 ? dailyGoal : 100;
}

// ── CSV export helper ────────────────────────────────────────────────────────
function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (cell: string | number) => {
    const s = String(cell ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map(row => row.map(escapeCell).join(';'));
  const csv = '﻿' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── AI Analysis Report ───────────────────────────────────────────────────────
// Uses inline styles (not Tailwind dynamic classes) + manual table parser
// (avoids remark-gfm ESM issues and Tailwind JIT missing dynamic strings)

type SectionTheme = { dot: string };

// O tema é escolhido pelo emoji que a IA coloca no título (dado, não UI): só o
// ponto de cor muda; o emoji em si não é exibido (ver stripLeadingSymbols).
function getSectionTheme(h: string): SectionTheme {
  if (h.includes('🏆')) return { dot:'#d97706' };
  if (h.includes('💰')) return { dot:'#16a34a' };
  if (h.includes('🔴')) return { dot:'#dc2626' };
  if (h.includes('📊')) return { dot:'#0C3680' };
  if (h.includes('✅')) return { dot:'#16a34a' };
  if (h.includes('🌟')) return { dot:'#7c3aed' };
  return { dot:'#64748b' };
}

function stripLeadingSymbols(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*(?:[^*]|\*(?!\*))+\*\*)/g);
  if (parts.length === 1) return text;
  return <>{parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ fontWeight:600, color:'#0f172a' }}>{p.slice(2,-2)}</strong>
      : <span key={i}>{p}</span>
  )}</>;
}

function MdSection({ body }: { body: string }) {
  const lines = body.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }

    // Markdown table
    if (t.startsWith('|')) {
      const tl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tl.push(lines[i]); i++; }
      if (tl.length >= 2) {
        const splitRow = (l: string) => l.split('|').slice(1,-1).map(c => c.trim());
        const headers = splitRow(tl[0]);
        const rows = tl.slice(2).map(splitRow).filter(r => r.some(c => c && !/^[:\-\s]+$/.test(c)));
        nodes.push(
          <div key={k++} style={{ overflowX:'auto', margin:'10px 0', borderRadius:'6px', border:'1px solid #e2e8f0' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {headers.map((h,j) => <th key={j} style={{ padding:'8px 12px', textAlign:'left', fontWeight:500, color:'#64748b', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row,ri) => (
                  <tr key={ri}>
                    {row.map((cell,ci) => <td key={ci} style={{ padding:'8px 12px', color:'#334155', borderBottom:'1px solid #f1f5f9', verticalAlign:'top' }}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // ### attendant sub-heading
    if (t.startsWith('### ')) {
      nodes.push(<p key={k++} style={{ fontWeight:600, fontSize:'13px', color:'#0f172a', marginTop:'14px', marginBottom:'4px', paddingTop:'10px', borderTop:'1px solid #f1f5f9' }}>{stripLeadingSymbols(t.slice(4))}</p>);
      i++; continue;
    }
    // #### small heading
    if (t.startsWith('#### ')) {
      nodes.push(<p key={k++} style={{ fontWeight:500, fontSize:'12px', color:'#64748b', marginTop:'10px', marginBottom:'2px' }}>{stripLeadingSymbols(t.slice(5))}</p>);
      i++; continue;
    }
    // List item
    if (/^[-*•]\s/.test(t) || /^\d+\.\s/.test(t)) {
      const txt = t.replace(/^[-*•]\s/,'').replace(/^\d+\.\s/,'');
      nodes.push(
        <div key={k++} style={{ display:'flex', gap:'8px', marginBottom:'5px', paddingLeft:'2px' }}>
          <span aria-hidden="true" style={{ color:'#94a3b8', flexShrink:0, fontSize:'12px', marginTop:'3px' }}>•</span>
          <span style={{ fontSize:'13px', color:'#334155', lineHeight:'1.55' }}>{renderInline(txt)}</span>
        </div>
      );
      i++; continue;
    }
    // Paragraph
    nodes.push(<p key={k++} style={{ fontSize:'13px', color:'#334155', lineHeight:'1.6', marginBottom:'4px' }}>{renderInline(t)}</p>);
    i++;
  }
  return <>{nodes}</>;
}

function AiAnalysisReport({ markdown }: { markdown: string }) {
  const raw = markdown.split(/(?=^## )/m).filter(Boolean);
  const intro = raw[0]?.startsWith('## ') ? null : raw[0];
  const sections = raw.filter(s => s.startsWith('## '));

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-900">Parecer executivo da IA</p>

      {intro && (
        <div className="rounded-md bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
          {intro.trim()}
        </div>
      )}

      {sections.map((section, i) => {
        const lines = section.trim().split('\n');
        const heading = lines[0].replace(/^##\s*/,'');
        const body = lines.slice(1).join('\n').trim();
        const th = getSectionTheme(heading);
        return (
          <div key={i} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: th.dot }} />
              <h3 className="text-sm font-semibold text-slate-900">{stripLeadingSymbols(heading)}</h3>
            </div>
            <div className="px-4 py-3">
              <MdSection body={body} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Barra fina de progresso usada nas listas compactas.
function MiniBar({ pct, tone = 'brand' }: { pct: number; tone?: 'brand' | 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? 'bg-green-600' : tone === 'warning' ? 'bg-amber-500' : tone === 'danger' ? 'bg-red-500' : 'bg-brand-600';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
    </div>
  );
}

function EmailStrategicCard() {
  const { data: emailStats, isLoading: emailLoading } = trpc.emailMarketing.dashboardEmailStats.useQuery(
    undefined,
    { staleTime: 120_000, refetchOnWindowFocus: false },
  );

  if (emailLoading) {
    return (
      <Panel>
        <PanelHeader title="E-mail Marketing" />
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      </Panel>
    );
  }

  if (!emailStats) return null;

  const quotaPct = emailStats.quotaTotal > 0 ? Math.round((emailStats.quotaUsed / emailStats.quotaTotal) * 100) : 0;
  const openRateToday = emailStats.totalSentToday > 0
    ? Math.round((emailStats.opensToday / emailStats.totalSentToday) * 100)
    : 0;
  const clickRateToday = emailStats.opensToday > 0
    ? Math.round((emailStats.clicksToday / emailStats.opensToday) * 100)
    : 0;
  // % da base com e-mail que já está confirmada — dá contexto ao número
  // absoluto de pendentes (2031 pendentes assusta menos se a base é 50 mil).
  const confirmedTotal = Math.max(0, emailStats.totalWithEmail - emailStats.pendingConfirmation);
  const confirmationRatePct = emailStats.totalWithEmail > 0
    ? Math.round((confirmedTotal / emailStats.totalWithEmail) * 100)
    : 0;

  const trendMax = Math.max(1, ...emailStats.dailyTrend.map((d: { sent: number }) => d.sent));
  const quotaTone = quotaPct >= 90 ? 'danger' : quotaPct >= 70 ? 'warning' : 'brand';

  return (
    <Panel>
      <PanelHeader
        title="E-mail Marketing"
        description="Envios, confirmações e engajamento de hoje"
        actions={
          emailStats.bouncesToday > 0 || emailStats.complaintsToday > 0 ? (
            <Badge variant="danger">
              <ShieldAlert aria-hidden="true" />
              {emailStats.bouncesToday > 0 && `${emailStats.bouncesToday} bounce${emailStats.bouncesToday > 1 ? 's' : ''}`}
              {emailStats.bouncesToday > 0 && emailStats.complaintsToday > 0 && ' · '}
              {emailStats.complaintsToday > 0 && `${emailStats.complaintsToday} reclamação`}
            </Badge>
          ) : undefined
        }
      />
      {/* KPIs do dia: faixa única, sem card por número */}
      <StatStrip className="rounded-none border-0 border-b">
        <Stat label="Enviados hoje" value={emailStats.totalSentToday} hint={`Cota ${emailStats.quotaUsed}/${emailStats.quotaTotal}`} />
        <Stat label="Confirmados hoje" value={emailStats.confirmedToday} hint={`${confirmationRatePct}% da base confirmada`} />
        <Stat
          label="Pendentes"
          value={emailStats.pendingConfirmation}
          hint={`de ${emailStats.totalWithEmail} com e-mail`}
          tone={emailStats.pendingConfirmation > 500 ? 'danger' : 'default'}
        />
        <Stat label="Em sequência hoje" value={emailStats.sequencesEnrolledToday} hint="novas inscrições" />
        <Stat label="Aberturas hoje" value={emailStats.opensToday} hint={`${emailStats.totalOpensToday} total · ${openRateToday}% taxa`} />
        <Stat label="Cliques hoje" value={emailStats.clicksToday} hint={`${emailStats.totalClicksToday} total · ${clickRateToday}% click-to-open`} />
      </StatStrip>

      <div className="space-y-5 p-4">
        {/* Cota diária */}
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-slate-500">Cota diária</span>
          <MiniBar pct={quotaPct} tone={quotaTone} />
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${quotaPct >= 90 ? 'text-red-700' : quotaPct >= 70 ? 'text-amber-700' : 'text-slate-500'}`}>
            {quotaPct}%
          </span>
        </div>

        {/* Envios por atendente + tendência 7 dias */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Envios por atendente — hoje</p>
            {emailStats.attendantSends.length > 0 ? (
              <ul className="divide-y divide-slate-200">
                {emailStats.attendantSends.map((a: { name: string; campaigns: number; sequences: number; total: number }) => {
                  const pct = emailStats.totalSentToday > 0 ? Math.round((a.total / emailStats.totalSentToday) * 100) : 0;
                  return (
                    <li key={a.name} className="py-2">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{a.name}</span>
                        <span className="text-xs tabular-nums text-slate-500">{pct}%</span>
                        <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-900">{a.total}</span>
                      </div>
                      <div className="mt-1.5"><MiniBar pct={pct} /></div>
                      {(a.campaigns > 0 || a.sequences > 0) && (
                        <div className="mt-1 flex gap-3 text-xs text-slate-500">
                          {a.campaigns > 0 && <span>Campanhas: {a.campaigns}</span>}
                          {a.sequences > 0 && <span>Sequências: {a.sequences}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-sm text-slate-500">Nenhum e-mail enviado hoje.</p>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Volume de envios — últimos 7 dias</p>
            {emailStats.dailyTrend.length > 0 ? (
              <div className="flex h-28 items-end gap-2">
                {emailStats.dailyTrend.map((d: { day: string; sent: number }) => {
                  const dayLabel = d.day.slice(8, 10) + '/' + d.day.slice(5, 7);
                  return (
                    <div key={d.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-xs tabular-nums text-slate-500">{d.sent > 0 ? d.sent : ''}</span>
                      <div
                        className={`w-full rounded-t-sm ${d.sent > 0 ? 'bg-brand-600' : 'bg-slate-100'}`}
                        style={{ height: `${Math.max(4, Math.round((d.sent / trendMax) * 72))}px` }}
                      />
                      <span className="text-xs text-slate-500">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-sm text-slate-500">Sem dados de envio recentes.</p>
            )}
          </div>
        </div>

        {/* Top campanhas por abertura */}
        {emailStats.topCampaigns.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Melhores campanhas por abertura — últimos 30 dias</p>
            <ul className="divide-y divide-slate-200">
              {emailStats.topCampaigns.map((c: { id: number; name: string; subject: string; sent: number; opened: number; clicked: number; openRate: number }, i: number) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="w-5 text-center text-xs font-medium tabular-nums text-slate-500">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{c.subject}</p>
                    <p className="text-xs text-slate-500">
                      {c.sent} enviados · {c.opened} abriram · {c.clicked} clicaram
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-semibold tabular-nums ${c.openRate >= 30 ? 'text-green-700' : c.openRate >= 15 ? 'text-slate-900' : 'text-amber-700'}`}>
                      {c.openRate}%
                    </p>
                    <p className="text-xs text-slate-500">abertura</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Insights */}
        {(emailStats.totalSentToday > 0 || emailStats.pendingConfirmation > 100) && (
          <div className="space-y-1 rounded-md bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-900">Insights do dia</p>
            {emailStats.pendingConfirmation > 100 && (
              <p className="text-xs text-amber-800">
                {emailStats.pendingConfirmation} e-mails aguardando confirmação ({100 - confirmationRatePct}% da base) — confirme em Tarefas para liberar para campanhas e sequências.
              </p>
            )}
            {openRateToday >= 25 && (
              <p className="text-xs text-slate-700">Taxa de abertura em {openRateToday}% — acima da média do mercado (15-25%).</p>
            )}
            {openRateToday > 0 && openRateToday < 15 && (
              <p className="text-xs text-amber-800">Taxa de abertura de {openRateToday}% está abaixo da média. Considere revisar os assuntos dos e-mails.</p>
            )}
            {clickRateToday >= 3 && (
              <p className="text-xs text-green-700">Click-to-open de {clickRateToday}% — bom engajamento com o conteúdo.</p>
            )}
            {emailStats.bouncesToday > 0 && (
              <p className="text-xs text-red-700">{emailStats.bouncesToday} bounce(s) hoje — verifique a qualidade dos e-mails da base.</p>
            )}
            {quotaPct >= 80 && (
              <p className="text-xs text-amber-800">Cota em {quotaPct}% — planeje os envios restantes com cuidado.</p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function FaturamentoQuickCard({ setLocation }: { setLocation: (to: string) => void }) {
  const { pedidos, comissoes } = useFatStore();
  const { data: sellers = [] } = trpc.sellers.list.useQuery();
  const sellerList = (sellers as { id: number; name: string }[]).map((s) => ({ id: s.id, name: s.name }));
  const filtro = mesAtual();
  const rows = panoramaPorAtendente(pedidos, sellerList, comissoes, filtro);
  const totals = somarResumos(rows);

  return (
    <Panel>
      <button
        type="button"
        onClick={() => setLocation("/admin/faturamento")}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <DollarSign aria-hidden="true" size={18} className="shrink-0 text-slate-500" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">Faturamento e comissão</span>
          <span className="block text-xs text-slate-500">
            {totals.totalEmbarcado > 0
              ? `Embarcado este mês: ${formatBRL(totals.totalEmbarcado)}`
              : "Acompanhe vendas, comissões e relatórios"}
          </span>
        </span>
        <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-slate-400" />
      </button>
    </Panel>
  );
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  // Gerente (atendente promovido) vê o dashboard principal, mas sem as seções
  // de gestão de atendentes/IA — só o admin de verdade (Tarcyo) tem isFullAdmin.
  const isFullAdmin = user?.role === "admin";
  const { data: sellers = [], isLoading, isError: sellersError, isFetching: sellersFetching, refetch: refetchSellers } = trpc.sellers.list.useQuery(undefined, { staleTime: 300_000 });
  const { data: tasks = [], isError: tasksError, isFetching: tasksFetching, refetch: refetchTasks } = trpc.tasks.list.useQuery(undefined, { staleTime: 120_000 });
  const { data: reminders = [] } = trpc.tasks.reminders.useQuery(undefined, { staleTime: 120_000 });
  const { data: deletionLogs = [], refetch: refetchDeletionLogs } = trpc.tasks.deletionLogs.useQuery({ onlyUnreviewed: true }, { staleTime: 120_000, enabled: isFullAdmin });
  const markDeletionReviewedMutation = trpc.tasks.markDeletionReviewed.useMutation({ onSuccess: () => refetchDeletionLogs() });
  const [showDeletionLogs, setShowDeletionLogs] = useState(false);

  // Pedidos aguardando revisão (criados por atendentes) — admin/manager têm
  // acesso completo ao Faturamento, mesmo padrão de permissão do módulo.
  const canManageFaturamento = user?.role === "admin" || user?.role === "manager";
  const { data: pendingPedidos = [], refetch: refetchPendingPedidos } = trpc.faturamento.pendingApproval.useQuery(
    undefined,
    { staleTime: 30_000, refetchInterval: 60_000, enabled: canManageFaturamento }
  );
  const [showPendingPedidos, setShowPendingPedidos] = useState(false);
  const [pedidoDetailId, setPedidoDetailId] = useState<string | null>(null);
  const [pedidoDetailOpen, setPedidoDetailOpen] = useState(false);
  const [pedidoEditOpen, setPedidoEditOpen] = useState(false);
  const [pedidoInvoiceOpen, setPedidoInvoiceOpen] = useState(false);
  const [pedidoDeleteOpen, setPedidoDeleteOpen] = useState(false);
  const { pedidos: allPedidosForReview, reload: reloadPedidos } = useFatStore();
  const pedidoEmRevisao = pedidoDetailId ? allPedidosForReview.find((p) => p.id === pedidoDetailId) ?? null : null;
  const openPedidoRevisao = (id: string) => {
    setPedidoDetailId(id);
    setPedidoDetailOpen(true);
    // Pedido recém-criado por outro atendente pode não estar no espelho local ainda.
    void reloadPedidos();
  };
  const analyzeAttendantsMutation = trpc.ai.analyzeAttendants.useMutation();
  const { data: sessionData = [], refetch: refetchSessions, isFetching: sessionsFetching } = trpc.workSessions.allActiveToday.useQuery(undefined, { staleTime: 90_000, enabled: isFullAdmin });
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());
  const toggleSession = (id: number) => setExpandedSessions(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [monitorReport, setMonitorReport] = useState<any[] | null>(null);
  const [monitorSummary, setMonitorSummary] = useState<string | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorCached, setMonitorCached] = useState<{ cached: boolean; at: number } | null>(null);
  const [reminderFilter, setReminderFilter] = useState<string>("all");
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);

  // "Agora" fixo por minuto: os cálculos abaixo não criam Date por tarefa a cada render.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  // Atrasadas seguem a regra de Tasks.tsx (reminderEnabled !== false) e o dono da tarefa é
  // comparado sem diferenciar maiúsculas/espaços, como o servidor faz (lower()).
  const agg = useMemo(
    () => computeDashboardAgg(tasks as DashTask[], sellers as DashSeller[], nowMs),
    [tasks, sellers, nowMs],
  );

  const handleRunMonitor = async (forceRefresh = false) => {
    setMonitorLoading(true);
    try {
      const result: any = await analyzeAttendantsMutation.mutateAsync({ forceRefresh });
      setMonitorReport(result.report);
      setMonitorSummary(result.summary);
      setMonitorCached(typeof result.cached === 'boolean'
        ? { cached: result.cached, at: result.cachedAt ?? Date.now() }
        : null);
    } catch (e: any) {
      setMonitorSummary('Erro ao analisar: ' + (e?.message ?? 'Erro desconhecido'));
    } finally {
      setMonitorLoading(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </Page>
    );
  }


  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;

  // Agregados vindos do useMemo acima (calculados uma vez por tarefas/atendentes/minuto).
  const {
    pending, overdue, completionRate, contactsToday, reminderOn,
    convertedCount, conversionRate, avgContactsToConvert, convertedThisMonth,
    funnel, avgFirstContactMs, avgFirstContactDays, avgConversionMs, avgConversionDays, staleNoContact, hotLeads,
    sellerStats, conversionRanking, weeklyTrend, weeklyTrendMax,
    cancelledTotal, decidedTotal, lostRateGlobal,
  } = agg;

  // Filter reminders based on selection
  const filteredReminders = (reminders as any[]).filter(r => {
    if (reminderFilter === "all") return true;
    if (reminderFilter === "__admin__") return !r.assignedTo || r.assignedTo.trim() === "";
    return r.assignedTo === reminderFilter;
  }).sort((a, b) => {
    const dateA = new Date(a.reminderDate).getTime();
    const dateB = new Date(b.reminderDate).getTime();
    return dateA - dateB;
  });

  const now = new Date();
  const upcomingReminders = filteredReminders.filter(r => new Date(r.reminderDate) > now && r.status === 'pending');
  const overdueReminders = filteredReminders.filter(r => new Date(r.reminderDate) <= now && r.status === 'pending');

  const teamDailyGoal = (sellers as any[] || []).reduce((sum, s) => sum + effectiveDailyGoal(s.dailyGoal), 0);

  const firstName = user.name?.split(' ')[0];
  const activeNow = (sessionData as any[]).filter((s: any) => s.session?.status === 'active').length;
  const needsAction = pendingPedidos.length > 0 || deletionLogs.length > 0 || overdue.length > 0 || staleNoContact.length > 0;
  const fmtShort = (d: any) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const statusLabel = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();

  return (
    <Page>
      <PageHeader
        title="Dashboard"
        description={`${firstName ? `Olá, ${firstName}. ` : ''}${overdue.length > 0
          ? `${overdue.length} tarefa${overdue.length > 1 ? 's' : ''} em atraso.`
          : 'Tudo em ordem no sistema.'}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setLocation('/tasks')}>
              <ClipboardList aria-hidden="true" /> Tarefas
            </Button>
            {isFullAdmin ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation('/attendants')}>
                  <Users aria-hidden="true" /> Atendentes
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLocation('/ai-chat')}>
                  <MessageSquare aria-hidden="true" /> Chat IA
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLocation('/ai-settings')}>
                  <Settings aria-hidden="true" /> Config IA
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setLocation('/admin/email-marketing')}>
                  <Mail aria-hidden="true" /> E-mail Marketing
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLocation('/admin/faturamento')}>
                  <DollarSign aria-hidden="true" /> Faturamento
                </Button>
              </>
            )}
          </>
        }
      />

      {tasksError && tasks.length === 0 && (
        <QueryError
          message="Falha ao carregar — os números abaixo podem estar zerados"
          onRetry={() => { void refetchTasks(); }}
          retrying={tasksFetching}
        />
      )}

      {/* O que exige ação agora */}
      {needsAction && (
        <Panel>
          <PanelHeader title="Exige ação agora" />
          <ul className="divide-y divide-slate-200">
            {pendingPedidos.length > 0 && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => setShowPendingPedidos(v => !v)}
                  aria-expanded={showPendingPedidos}
                >
                  <PackageCheck aria-hidden="true" size={16} className="shrink-0 text-brand-700" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                    {pendingPedidos.length} pedido{pendingPedidos.length > 1 ? 's' : ''} aguarda{pendingPedidos.length > 1 ? 'm' : ''} sua revisão
                  </span>
                  <Badge variant="info">{pendingPedidos.length}</Badge>
                  {showPendingPedidos ? <ChevronDown aria-hidden="true" size={16} className="text-slate-500" /> : <ChevronRight aria-hidden="true" size={16} className="text-slate-500" />}
                </button>
                {showPendingPedidos && (
                  <ul className="divide-y divide-slate-200 border-t border-slate-200 bg-slate-50">
                    {pendingPedidos.map((p: any) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{p.clienteNome || p.razaoSocial || 'Sem cliente'}</p>
                          <p className="text-xs text-slate-500">
                            Criado por <span className="font-medium text-slate-700">{p.sellerName}</span> · {fmtShort(p.criadoEm)}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="shrink-0" onClick={() => openPedidoRevisao(p.id)}>
                          <Eye aria-hidden="true" /> Revisar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )}

            {deletionLogs.length > 0 && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => setShowDeletionLogs(v => !v)}
                  aria-expanded={showDeletionLogs}
                >
                  <Trash2 aria-hidden="true" size={16} className="shrink-0 text-amber-700" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                    {deletionLogs.length} tarefa{deletionLogs.length > 1 ? 's' : ''} excluída{deletionLogs.length > 1 ? 's' : ''} aguarda{deletionLogs.length > 1 ? 'm' : ''} revisão
                  </span>
                  <Badge variant="warning">{deletionLogs.length}</Badge>
                  {showDeletionLogs ? <ChevronDown aria-hidden="true" size={16} className="text-slate-500" /> : <ChevronRight aria-hidden="true" size={16} className="text-slate-500" />}
                </button>
                {showDeletionLogs && (
                  <ul className="divide-y divide-slate-200 border-t border-slate-200 bg-slate-50">
                    {deletionLogs.map((log: any) => (
                      <li key={log.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{log.taskTitle}</p>
                          <p className="text-xs text-slate-500">
                            Excluída por <span className="font-medium text-slate-700">{log.deletedByName}</span> · {fmtShort(log.createdAt)}
                          </p>
                          <p className="mt-1 break-words text-xs text-slate-700">
                            <span className="font-medium text-amber-800">Motivo:</span> {log.reason}
                          </p>
                          {log.taskNotes && (
                            <p className="mt-1 truncate text-xs italic text-slate-500">Nota: {log.taskNotes.slice(0, 80)}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => markDeletionReviewedMutation.mutate({ id: log.id })}
                          disabled={markDeletionReviewedMutation.isPending}
                        >
                          <Eye aria-hidden="true" /> Revisei
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )}

            {overdue.length > 0 && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  onClick={() => setLocation('/tasks')}
                >
                  <AlertTriangle aria-hidden="true" size={16} className="shrink-0 text-red-700" />
                  <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                    {overdue.length} tarefa{overdue.length > 1 ? 's' : ''} atrasada{overdue.length > 1 ? 's' : ''} na equipe
                  </span>
                  <Badge variant="danger">{overdue.length}</Badge>
                  <ChevronRight aria-hidden="true" size={16} className="text-slate-500" />
                </button>
              </li>
            )}

            {staleNoContact.length > 0 && (
              <li className="flex items-center gap-3 px-4 py-3">
                <Flame aria-hidden="true" size={16} className="shrink-0 text-amber-700" />
                <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                  {staleNoContact.length} lead(s) há mais de 48h sem nenhum contato — esfriando
                </span>
              </li>
            )}
          </ul>
        </Panel>
      )}

      {/* Indicadores */}
      <StatStrip>
        <Stat label="Contatos hoje" value={contactsToday} hint={`meta: ${teamDailyGoal}`} />
        {isFullAdmin && <Stat label="Atendentes" value={sellers?.length || 0} hint={`${activeNow} ativos agora`} />}
        <Stat label="Pendentes" value={pending.length} hint={`${completionRate}% concluídos`} onClick={() => setLocation('/tasks')} />
        <Stat
          label="Atrasados"
          value={overdue.length}
          hint={overdue.length > 0 ? 'precisam de ação' : 'tudo em dia'}
          tone={overdue.length > 0 ? 'danger' : 'success'}
          onClick={() => setLocation('/tasks')}
        />
        <Stat label="Com lembrete" value={reminderOn} hint={`de ${tasks.length} total`} />
        <Stat
          label="Conversões"
          value={convertedCount}
          hint={`${conversionRate}% taxa · ${convertedThisMonth} este mês · ~${avgContactsToConvert} contatos p/ converter`}
        />
      </StatStrip>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Funil de conversão */}
        <Panel>
          <PanelHeader title="Funil de conversão" description="Lead → cliente ativo, em tempo real" />
          <div className="space-y-5 p-4">
            <ul className="space-y-3">
              {[
                { label: 'Leads totais', value: funnel.total, tone: 'brand' as const },
                { label: 'Contatados', value: funnel.contacted, tone: 'brand' as const },
                { label: 'Convertidos', value: funnel.converted, tone: 'success' as const },
              ].map((stage) => {
                const pct = funnel.total > 0 ? Math.round((stage.value / funnel.total) * 100) : 0;
                return (
                  <li key={stage.label}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-slate-900">{stage.label}</span>
                      <span className="tabular-nums text-slate-900">
                        <span className="font-semibold">{stage.value.toLocaleString('pt-BR')}</span>
                        <span className="ml-2 text-xs text-slate-500">{pct}%</span>
                      </span>
                    </div>
                    <MiniBar pct={pct} tone={stage.tone} />
                  </li>
                );
              })}
            </ul>

            {(avgFirstContactDays > 0 || avgConversionDays > 0) && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                {avgFirstContactDays > 0 && (
                  <span>1º contato médio: <strong className="font-semibold text-slate-900">{avgFirstContactDays < 1 ? `${Math.round(avgFirstContactMs / 3600000)}h` : `${avgFirstContactDays.toFixed(1)} dias`}</strong></span>
                )}
                {avgConversionDays > 0 && (
                  <span>Conversão média: <strong className="font-semibold text-slate-900">{avgConversionDays < 1 ? `${Math.round(avgConversionMs / 3600000)}h` : `${avgConversionDays.toFixed(1)} dias`}</strong></span>
                )}
              </div>
            )}

            {/* Tendência semanal de conversões */}
            <div className="border-t border-slate-200 pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3">
                <p className="text-xs font-medium text-slate-500">Conversões — últimas 8 semanas</p>
                {decidedTotal > 0 && (
                  <p className="text-xs text-slate-500">
                    Leads perdidos: <strong className={lostRateGlobal >= 50 ? 'text-red-700' : lostRateGlobal >= 25 ? 'text-amber-700' : 'text-slate-700'}>{lostRateGlobal}%</strong>
                    <span> ({cancelledTotal} cancelado{cancelledTotal !== 1 ? 's' : ''} de {decidedTotal} com desfecho)</span>
                  </p>
                )}
              </div>
              <div className="flex h-24 items-end gap-2">
                {weeklyTrend.map(w => (
                  <div key={w.label} className="flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="text-xs tabular-nums text-slate-500">{w.count > 0 ? w.count : ''}</span>
                    <div
                      className={`w-full rounded-t-sm ${w.count > 0 ? 'bg-green-600' : 'bg-slate-100'}`}
                      style={{ height: `${Math.max(4, Math.round((w.count / weeklyTrendMax) * 64))}px` }}
                    />
                    <span className="text-xs text-slate-500">{w.label}</span>
                  </div>
                ))}
              </div>
              {convertedCount === 0 && <p className="mt-2 text-xs text-slate-500">Sem conversões registradas ainda.</p>}
            </div>
          </div>
        </Panel>

        {/* Ranking + leads quentes */}
        <Panel>
          <PanelHeader
            title={isFullAdmin ? 'Ranking e leads quentes' : 'Leads quentes'}
            actions={isFullAdmin && conversionRanking.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => exportCsv(
                  `ranking-conversao-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Atendente', 'Total leads', 'Convertidos', 'Taxa (%)', 'Contatos médios/venda', 'Perdidos', 'Taxa perdidos (%)'],
                  conversionRanking.map(r => [r.name, r.total, r.converted, r.rate, r.myAvgContacts, r.cancelled, r.lostRate])
                )}
                title="Exportar ranking em CSV"
              >
                <Download aria-hidden="true" /> CSV
              </Button>
            ) : undefined}
          />
          <div className="space-y-5 p-4">
            {/* Ranking de conversão — cross-atendente, só admin */}
            {isFullAdmin && (
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">Conversão por atendente</p>
                {conversionRanking.length > 0 ? (
                  <ul className="divide-y divide-slate-200">
                    {conversionRanking.slice(0, 6).map((r, i) => (
                      <li key={r.name} className="py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-5 text-xs tabular-nums text-slate-500">{i + 1}º</span>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{r.name}</span>
                          <span className="text-sm font-semibold tabular-nums text-green-700">{r.converted}</span>
                          <span className="w-12 text-right text-xs tabular-nums text-slate-500">{r.rate}%</span>
                        </div>
                        {(r.myAvgContacts > 0 || r.cancelled > 0) && (
                          <div className="flex items-center gap-3 pl-7 text-xs text-slate-500">
                            {r.myAvgContacts > 0 && <span>~{r.myAvgContacts} contatos/venda</span>}
                            {r.cancelled > 0 && <span className={r.lostRate >= 50 ? 'text-red-700' : ''}>{r.cancelled} perdido(s) ({r.lostRate}%)</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">Sem conversões registradas ainda.</p>
                )}
              </div>
            )}

            {/* Leads quentes */}
            <div className={isFullAdmin ? 'border-t border-slate-200 pt-4' : ''}>
              <p className="mb-1 text-xs font-medium text-slate-500">
                Leads quentes — perto de converter
                {avgContactsToConvert > 0 && <span className="font-normal"> (≥ {Math.max(1, avgContactsToConvert - 1)} contatos)</span>}
              </p>
              {hotLeads.length > 0 ? (
                <ul className="divide-y divide-slate-200">
                  {hotLeads.map((t: any) => (
                    <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-slate-900">{(t.title || '').split(' - ')[0].slice(0, 36)}</span>
                      {t.assignedTo && <span className="max-w-[90px] truncate text-xs text-slate-500">{t.assignedTo}</span>}
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900" title="Contatos feitos">{t.contactCount}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  {avgContactsToConvert > 0 ? 'Nenhum lead próximo do ponto médio de conversão agora.' : 'Ainda sem dados suficientes de conversão para calcular.'}
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* Desempenho dos atendentes — cross-atendente, só admin */}
      {isFullAdmin && (
        <Panel>
          <PanelHeader
            title="Desempenho dos atendentes"
            description="Contatos de hoje contra a meta diária"
            actions={
              <Button size="sm" variant="outline" onClick={() => setLocation('/attendants')}>
                Gerenciar <ArrowRight aria-hidden="true" />
              </Button>
            }
          />
          {isLoading ? (
            <div className="divide-y divide-slate-200">
              {[1, 2, 3].map(i => (
                <div key={i} className="px-4 py-3"><Skeleton className="h-9" /></div>
              ))}
            </div>
          ) : sellersError && sellers.length === 0 ? (
            <div className="p-4">
              <QueryError onRetry={() => { void refetchSellers(); }} retrying={sellersFetching} />
            </div>
          ) : sellers && sellers.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {sellers.map((seller: any) => {
                const stats = sellerStats.get(seller.id);
                const sellerTasks = stats?.tasks ?? [];
                const sellerContactsToday = stats?.contactsToday ?? 0;
                const GOAL = effectiveDailyGoal(seller.dailyGoal);
                const pct = Math.min(Math.round((sellerContactsToday / GOAL) * 100), 100);
                const sellerOverdue = stats?.overdue ?? 0;
                const sessionRow = (sessionData as any[]).find((s: any) => s.name === seller.name);
                const isActive = sessionRow?.session?.status === 'active';
                const isPaused = sessionRow?.session?.status === 'paused';
                const barTone = pct >= 100 ? 'success' : pct >= 60 ? 'brand' : pct >= 30 ? 'warning' : 'danger';
                return (
                  <li key={seller.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="flex min-w-0 basis-full items-center gap-3 sm:basis-56 sm:flex-1">
                      <span
                        aria-label={isActive ? 'Ativo' : isPaused ? 'Pausado' : 'Sem sessão'}
                        title={isActive ? 'Ativo' : isPaused ? 'Pausado' : 'Sem sessão'}
                        className={`size-2.5 shrink-0 rounded-full ${isActive ? 'bg-green-500' : isPaused ? 'bg-amber-500' : 'bg-slate-300'}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{seller.name}</p>
                        <p className="truncate text-xs text-slate-500">{seller.email}</p>
                      </div>
                    </div>
                    <div className="flex min-w-[160px] flex-1 items-center gap-2">
                      <MiniBar pct={pct} tone={barTone} />
                      <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
                        {sellerContactsToday}/{GOAL}
                      </span>
                    </div>
                    <dl className="flex items-center gap-4 text-xs text-slate-500">
                      <div className="text-center">
                        <dt>Carteira</dt>
                        <dd className="text-sm font-semibold tabular-nums text-slate-900">{sellerTasks.length}</dd>
                      </div>
                      <div className="text-center">
                        <dt>Atrasadas</dt>
                        <dd className={`text-sm font-semibold tabular-nums ${sellerOverdue > 0 ? 'text-red-700' : 'text-slate-500'}`}>{sellerOverdue}</dd>
                      </div>
                    </dl>
                    <Button size="sm" variant="outline" onClick={() => setSelectedSeller(seller)} title="Análise detalhada">
                      <BarChart2 aria-hidden="true" /> Analisar
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              icon={<Users />}
              title="Nenhum atendente cadastrado"
              description="Cadastre atendentes para acompanhar metas e contatos."
              action={<Button size="sm" onClick={() => setLocation('/attendants')}>Adicionar atendente</Button>}
            />
          )}
        </Panel>
      )}

      {/* Sessões de trabalho — cross-atendente, só admin */}
      {isFullAdmin && (
        <Panel>
          <PanelHeader
            title="Sessões de trabalho hoje"
            actions={
              <Button size="sm" variant="ghost" onClick={() => refetchSessions()} disabled={sessionsFetching}>
                <RefreshCw aria-hidden="true" className={sessionsFetching ? 'animate-spin' : ''} />
                {sessionsFetching ? 'Atualizando...' : 'Atualizar'}
              </Button>
            }
          />
          <ul className="divide-y divide-slate-200">
            {(sessionData as any[]).map((row: any) => {
              const s = row.session;
              const idleMin = Math.floor((row.idleSinceMs ?? 0) / 60000);
              const isIdle = s?.status === 'active' && idleMin >= 30;
              const isPaused = s?.status === 'paused';
              const workedH = s ? Math.floor(s.workedMs / 3600000) : 0;
              const workedM = s ? Math.floor((s.workedMs % 3600000) / 60000) : 0;
              const startTime = s ? (() => {
                const d = new Date(s.startedAt);
                return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
              })() : null;
              const fmtAgo = (date: any) => {
                const min = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
                if (min < 1) return '<1min atrás';
                if (min < 60) return `${min}min atrás`;
                const h = Math.floor(min / 60);
                if (h < 24) return `${h}h atrás`;
                return `${Math.floor(h / 24)}d atrás`;
              };
              const lastAct = row.lastActivityDate ? fmtAgo(row.lastActivityDate) : null;
              const lastOnline = row.lastOnlineAt ? fmtAgo(row.lastOnlineAt) : null;
              const isExpanded = expandedSessions.has(row.sellerId);
              const hasDetail = (row.recentTasks?.length > 0) || lastOnline;

              return (
                <li key={row.sellerId}>
                  <button
                    type="button"
                    className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors ${hasDetail ? 'hover:bg-slate-50' : 'cursor-default'}`}
                    onClick={() => hasDetail && toggleSession(row.sellerId)}
                    aria-expanded={hasDetail ? isExpanded : undefined}
                  >
                    <span className="flex min-w-0 basis-full items-center gap-2.5 sm:basis-52">
                      <span className={`size-2.5 shrink-0 rounded-full ${
                        isIdle ? 'bg-amber-500' : isPaused ? 'bg-amber-500' : s ? 'bg-green-500' : 'bg-slate-300'
                      }`} />
                      <span className="truncate text-sm font-medium text-slate-900">{row.name}</span>
                    </span>

                    <span className="w-28 shrink-0 text-xs">
                      {!s && <span className="text-slate-500">Sem sessão hoje</span>}
                      {s?.status === 'active' && !isIdle && <span className="inline-flex items-center gap-1 font-medium text-green-700"><Activity aria-hidden="true" size={12} /> Ativo</span>}
                      {isIdle && <span className="font-medium text-amber-700">Ocioso {idleMin}min</span>}
                      {isPaused && <span className="font-medium text-amber-700">Pausado</span>}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      {startTime && <span title="Entrada"><strong className="font-semibold text-slate-900">{startTime}</strong></span>}
                      {s && (
                        <span title="Tempo trabalhado">
                          <strong className="font-semibold text-slate-900">{workedH > 0 ? `${workedH}h ` : ''}{workedM}min</strong>
                        </span>
                      )}
                      <span title="Tarefas com anotação hoje">
                        <strong className="font-semibold text-slate-900">{row.contactsToday}</strong> contatos
                      </span>
                      {lastAct && <span title="Última edição de tarefa"><strong className="font-semibold text-slate-900">{lastAct}</strong></span>}
                      {!s && lastOnline && (
                        <span className="text-slate-500" title="Último acesso registrado">
                          último acesso: <strong className="font-semibold text-slate-700">{lastOnline}</strong>
                        </span>
                      )}
                      {row.ghostCount > 0 && (
                        <Badge variant="warning" title={`${row.ghostCount} clientes sem contato há 30+ dias`}>
                          <Ghost aria-hidden="true" /> {row.ghostCount} sem contato
                        </Badge>
                      )}
                      {row.burstAlert && (
                        <Badge variant="danger" title={`Alerta de fraude: ${row.burstMax} contatos em <10min`}>
                          <Zap aria-hidden="true" /> Burst
                        </Badge>
                      )}
                    </span>

                    {hasDetail && (
                      <span className="shrink-0 text-slate-500" aria-hidden="true">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                      {row.recentTasks?.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="mb-2 text-xs font-medium text-slate-500">Tarefas editadas hoje</p>
                          {row.recentTasks.map((t: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-slate-700">
                              <FileText aria-hidden="true" size={12} className="mt-0.5 shrink-0 text-slate-400" />
                              <span className="flex-1 truncate font-medium">{t.title}</span>
                              <span className="shrink-0 tabular-nums text-slate-500">
                                {fmtAgo(t.lastContactedAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs italic text-slate-500">
                          Nenhuma tarefa editada hoje.
                          {lastOnline && <> Último acesso: <strong>{lastOnline}</strong>.</>}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            {(sessionData as any[]).length === 0 && (
              <li><EmptyState className="py-6" title="Nenhum atendente cadastrado" /></li>
            )}
          </ul>
        </Panel>
      )}

      {/* Monitor IA — recurso de IA, só admin */}
      {isFullAdmin && (
        <Panel>
          <PanelHeader
            title="Monitor IA — comportamento"
            description="Tarefas sem anotação, adiamentos suspeitos e baixa produtividade"
            actions={
              <Button size="sm" onClick={() => handleRunMonitor(false)} disabled={monitorLoading}>
                {monitorLoading ? (
                  <>
                    <span className="inline-block size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Analisando...
                  </>
                ) : (
                  <><Scan aria-hidden="true" /> Analisar agora</>
                )}
              </Button>
            }
          />
          <div className="space-y-4 p-4">
            {monitorCached?.cached && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                <span className="text-slate-700">
                  Resultado em cache de {new Date(monitorCached.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — economiza sua cota gratuita de IA
                </span>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs whitespace-nowrap"
                  onClick={() => handleRunMonitor(true)}
                  disabled={monitorLoading}
                >
                  Forçar nova análise
                </Button>
              </div>
            )}
            {!monitorReport && !monitorSummary && !monitorLoading && (
              <EmptyState
                className="py-6"
                icon={<Scan />}
                title="Nenhuma análise executada"
                description='Clique em "Analisar agora" para verificar o comportamento de cada atendente.'
              />
            )}

            {monitorReport && monitorReport.length > 0 && (
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                {monitorReport.map((r: any) => {
                  const tone = r.status === '🔴 Suspeito' ? 'danger' : r.status === '🟡 Atenção' ? 'warning' : 'success';
                  return (
                    <li key={r.sellerId} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{r.name}</p>
                          <p className="truncate text-xs text-slate-500">{r.email}</p>
                        </div>
                        <Badge variant={tone}>{statusLabel(String(r.status))}</Badge>
                      </div>
                      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                        <div className="flex items-baseline gap-1.5"><dd className="text-sm font-semibold tabular-nums text-slate-900">{r.total}</dd><dt>clientes</dt></div>
                        <div className="flex items-baseline gap-1.5"><dd className={`text-sm font-semibold tabular-nums ${r.overdue > 0 ? 'text-red-700' : 'text-slate-900'}`}>{r.overdue}</dd><dt>vencidos</dt></div>
                        <div className="flex items-baseline gap-1.5"><dd className={`text-sm font-semibold tabular-nums ${r.noNotes > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{r.noNotes}</dd><dt>sem nota</dt></div>
                        <div className="flex items-baseline gap-1.5"><dd className={`text-sm font-semibold tabular-nums ${r.disabledReminders > 0 ? 'text-red-700' : 'text-slate-900'}`}>{r.disabledReminders}</dd><dt>desativados</dt></div>
                      </dl>
                      {r.flags.length > 0 && (
                        <ul className="space-y-1">
                          {r.flags.map((flag: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-xs text-red-700">
                              <AlertTriangle aria-hidden="true" size={12} className="mt-0.5 shrink-0" /> {flag}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {monitorSummary && (
              <AiAnalysisReport markdown={monitorSummary} />
            )}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Lembretes */}
        <Panel>
          <PanelHeader
            title="Lembretes"
            actions={
              <select
                value={reminderFilter}
                onChange={(e) => setReminderFilter(e.target.value)}
                aria-label="Filtrar lembretes por responsável"
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 max-md:h-10"
              >
                <option value="all">Todos</option>
                <option value="__admin__">Administrador</option>
                {(sellers ?? []).map((s: any) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            }
          />
          {filteredReminders.length === 0 ? (
            <EmptyState className="py-6" icon={<ClipboardList />} title="Nenhum lembrete" />
          ) : (
            <div className="divide-y divide-slate-200">
              {overdueReminders.length > 0 && (
                <div className="px-4 py-3">
                  <p className="mb-1 text-xs font-semibold text-red-700">Atrasados ({overdueReminders.length})</p>
                  <ul className="divide-y divide-slate-200">
                    {overdueReminders.slice(0, 5).map((reminder: any) => (
                      <li key={reminder.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{reminder.title}</p>
                          {reminder.assignedTo && <p className="text-xs text-slate-500">{reminder.assignedTo}</p>}
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-red-700">{(() => { try { const d=new Date(reminder.reminderDate); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}`; } catch { return ''; } })()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {upcomingReminders.length > 0 && (
                <div className="px-4 py-3">
                  <p className="mb-1 text-xs font-semibold text-slate-700">Próximos ({upcomingReminders.length})</p>
                  <ul className="divide-y divide-slate-200">
                    {upcomingReminders.slice(0, 5).map((reminder: any) => (
                      <li key={reminder.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{reminder.title}</p>
                          {reminder.assignedTo && <p className="text-xs text-slate-500">{reminder.assignedTo}</p>}
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">{(() => { try { const d=new Date(reminder.reminderDate); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`; } catch { return ''; } })()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Panel>

        {/* Faturamento e comissão — atalho */}
        <div className="self-start">
          <FaturamentoQuickCard setLocation={setLocation} />
        </div>
      </div>

      {/* E-mail Marketing */}
      <EmailStrategicCard />

      {/* Attendant Detail Modal */}
      {selectedSeller && (
        <AttendantDetailModal
          seller={selectedSeller}
          allTasks={tasks as any[]}
          allSellers={sellers as any[]}
          onClose={() => setSelectedSeller(null)}
        />
      )}

      {/* Revisão de pedido — abre direto no detalhe para o admin aprovar */}
      <OrderDetailDialog
        open={pedidoDetailOpen}
        onOpenChange={setPedidoDetailOpen}
        pedidoId={pedidoDetailId}
        onEdit={() => { setPedidoDetailOpen(false); setPedidoEditOpen(true); }}
        onInvoice={() => { setPedidoDetailOpen(false); setPedidoInvoiceOpen(true); }}
        onDelete={() => { setPedidoDetailOpen(false); setPedidoDeleteOpen(true); }}
        onApproved={() => refetchPendingPedidos()}
      />
      <OrderDialog
        open={pedidoEditOpen}
        onOpenChange={setPedidoEditOpen}
        seller={pedidoEmRevisao ? { id: pedidoEmRevisao.sellerId ?? 0, name: pedidoEmRevisao.sellerName } : null}
        existingPedidoId={pedidoDetailId}
      />
      <InvoiceDialog
        open={pedidoInvoiceOpen}
        onOpenChange={setPedidoInvoiceOpen}
        pedidoId={pedidoDetailId}
      />
      <DeleteOrderDialog
        open={pedidoDeleteOpen}
        onOpenChange={setPedidoDeleteOpen}
        pedidoId={pedidoDetailId}
      />
    </Page>
  );
}
