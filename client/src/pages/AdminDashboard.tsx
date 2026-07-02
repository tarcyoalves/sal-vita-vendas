import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Users,
  ClipboardList,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  MessageSquare,
  Settings,
  Scan,
  BarChart2,
  Timer,
  Activity,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
  AlertTriangle,
  Eye,
  Phone,
  RefreshCw,
  Download,
  DollarSign,
  Mail,
  MousePointerClick,
  MailOpen,
  MailX,
  ShieldAlert,
  Zap,
  Workflow,
} from "lucide-react";
import AttendantDetailModal from '../components/AttendantDetailModal';
import { useFatStore } from '../lib/faturamento/store';
import { panoramaPorAtendente, somarResumos, mesAtual, formatBRL } from '../lib/faturamento/calc';

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

type SectionTheme = { bg: string; border: string; headerBg: string; headerText: string; dot: string };

function getSectionTheme(h: string): SectionTheme {
  if (h.includes('🏆')) return { bg:'#fffbeb', border:'#f59e0b', headerBg:'#fef3c7', headerText:'#92400e', dot:'#f59e0b' };
  if (h.includes('💰')) return { bg:'#ecfdf5', border:'#10b981', headerBg:'#d1fae5', headerText:'#065f46', dot:'#10b981' };
  if (h.includes('🔴')) return { bg:'#fef2f2', border:'#ef4444', headerBg:'#fee2e2', headerText:'#991b1b', dot:'#ef4444' };
  if (h.includes('📊')) return { bg:'#eff6ff', border:'#3b82f6', headerBg:'#dbeafe', headerText:'#1e40af', dot:'#3b82f6' };
  if (h.includes('✅')) return { bg:'#f0fdf4', border:'#22c55e', headerBg:'#dcfce7', headerText:'#166534', dot:'#22c55e' };
  if (h.includes('🌟')) return { bg:'#faf5ff', border:'#8b5cf6', headerBg:'#ede9fe', headerText:'#5b21b6', dot:'#8b5cf6' };
  return { bg:'#f8fafc', border:'#94a3b8', headerBg:'#f1f5f9', headerText:'#1e293b', dot:'#64748b' };
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*(?:[^*]|\*(?!\*))+\*\*)/g);
  if (parts.length === 1) return text;
  return <>{parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ fontWeight:700, color:'#111827' }}>{p.slice(2,-2)}</strong>
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
          <div key={k++} style={{ overflowX:'auto', margin:'10px 0', borderRadius:'8px', border:'1px solid #e5e7eb' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#f3f4f6' }}>
                  {headers.map((h,j) => <th key={j} style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#4b5563', borderBottom:'2px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row,ri) => (
                  <tr key={ri} style={{ background: ri%2===0 ? '#fff' : '#f9fafb' }}>
                    {row.map((cell,ci) => <td key={ci} style={{ padding:'8px 12px', color:'#374151', borderBottom:'1px solid #f3f4f6', verticalAlign:'top' }}>{cell}</td>)}
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
      nodes.push(<p key={k++} style={{ fontWeight:700, fontSize:'13px', color:'#1f2937', marginTop:'14px', marginBottom:'4px', paddingTop:'10px', borderTop:'1px solid #f3f4f6' }}>{t.slice(4)}</p>);
      i++; continue;
    }
    // #### small heading
    if (t.startsWith('#### ')) {
      nodes.push(<p key={k++} style={{ fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:'10px', marginBottom:'2px' }}>{t.slice(5)}</p>);
      i++; continue;
    }
    // List item
    if (/^[-*•]\s/.test(t) || /^\d+\.\s/.test(t)) {
      const txt = t.replace(/^[-*•]\s/,'').replace(/^\d+\.\s/,'');
      nodes.push(
        <div key={k++} style={{ display:'flex', gap:'8px', marginBottom:'5px', paddingLeft:'2px' }}>
          <span style={{ color:'#9ca3af', flexShrink:0, fontSize:'12px', marginTop:'3px' }}>▸</span>
          <span style={{ fontSize:'13px', color:'#374151', lineHeight:'1.55' }}>{renderInline(txt)}</span>
        </div>
      );
      i++; continue;
    }
    // Paragraph
    nodes.push(<p key={k++} style={{ fontSize:'13px', color:'#374151', lineHeight:'1.6', marginBottom:'4px' }}>{renderInline(t)}</p>);
    i++;
  }
  return <>{nodes}</>;
}

function AiAnalysisReport({ markdown }: { markdown: string }) {
  const raw = markdown.split(/(?=^## )/m).filter(Boolean);
  const intro = raw[0]?.startsWith('## ') ? null : raw[0];
  const sections = raw.filter(s => s.startsWith('## '));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#8b5cf6', flexShrink:0 }} />
        <p style={{ fontWeight:600, color:'#6d28d9', fontSize:'13px', margin:0 }}>📋 Parecer Executivo da IA</p>
      </div>

      {intro && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px 16px', fontSize:'13px', color:'#475569', lineHeight:'1.6' }}>
          {intro.trim()}
        </div>
      )}

      {sections.map((section, i) => {
        const lines = section.trim().split('\n');
        const heading = lines[0].replace(/^##\s*/,'');
        const body = lines.slice(1).join('\n').trim();
        const th = getSectionTheme(heading);
        return (
          <div key={i} style={{ background:th.bg, border:`1.5px solid ${th.border}`, borderRadius:'12px', overflow:'hidden' }}>
            <div style={{ background:th.headerBg, padding:'10px 16px', borderBottom:`1px solid ${th.border}`, display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:th.dot, flexShrink:0 }} />
              <h3 style={{ fontWeight:700, fontSize:'13px', color:th.headerText, margin:0 }}>{heading}</h3>
            </div>
            <div style={{ padding:'14px 16px' }}>
              <MdSection body={body} />
            </div>
          </div>
        );
      })}
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
      <Card className="border-violet-200">
        <CardContent className="pt-4 px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-violet-100 text-violet-700 p-2.5 rounded-xl flex-shrink-0">
              <Mail size={20} />
            </div>
            <div className="flex-1 h-8 bg-gray-100 rounded animate-pulse" />
          </div>
        </CardContent>
      </Card>
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

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Mail size={18} className="text-violet-600" />
            E-mail Marketing — Painel Estrategico
          </span>
          {emailStats.bouncesToday > 0 || emailStats.complaintsToday > 0 ? (
            <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">
              <ShieldAlert size={12} />
              {emailStats.bouncesToday > 0 && `${emailStats.bouncesToday} bounce${emailStats.bouncesToday > 1 ? 's' : ''}`}
              {emailStats.bouncesToday > 0 && emailStats.complaintsToday > 0 && ' · '}
              {emailStats.complaintsToday > 0 && `${emailStats.complaintsToday} reclamacao`}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* KPIs do dia */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Mail size={14} className="text-violet-500" />
              <span className="text-[10px] font-semibold text-violet-500 uppercase">Enviados hoje</span>
            </div>
            <p className="text-2xl font-black text-violet-700">{emailStats.totalSentToday}</p>
            <p className="text-[11px] text-violet-400 mt-0.5">
              Cota: {emailStats.quotaUsed}/{emailStats.quotaTotal}
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-[10px] font-semibold text-emerald-500 uppercase">Confirmados hoje</span>
            </div>
            <p className="text-2xl font-black text-emerald-700">{emailStats.confirmedToday}</p>
            <p className="text-[11px] text-emerald-400 mt-0.5">
              {confirmationRatePct}% da base confirmada
            </p>
          </div>
          <div className={`border rounded-xl p-3 ${emailStats.pendingConfirmation > 500 ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <MailX size={14} className={emailStats.pendingConfirmation > 500 ? 'text-red-500' : 'text-amber-500'} />
              <span className={`text-[10px] font-semibold uppercase ${emailStats.pendingConfirmation > 500 ? 'text-red-500' : 'text-amber-500'}`}>Pendentes</span>
            </div>
            <p className={`text-2xl font-black ${emailStats.pendingConfirmation > 500 ? 'text-red-700' : 'text-amber-700'}`}>{emailStats.pendingConfirmation}</p>
            <p className={`text-[11px] mt-0.5 ${emailStats.pendingConfirmation > 500 ? 'text-red-400' : 'text-amber-400'}`}>
              de {emailStats.totalWithEmail} com e-mail
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Workflow size={14} className="text-purple-500" />
              <span className="text-[10px] font-semibold text-purple-500 uppercase">Em sequência hoje</span>
            </div>
            <p className="text-2xl font-black text-purple-700">{emailStats.sequencesEnrolledToday}</p>
            <p className="text-[11px] text-purple-400 mt-0.5">novas inscrições</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <MailOpen size={14} className="text-blue-500" />
              <span className="text-[10px] font-semibold text-blue-500 uppercase">Aberturas hoje</span>
            </div>
            <p className="text-2xl font-black text-blue-700">{emailStats.opensToday}</p>
            <p className="text-[11px] text-blue-400 mt-0.5">
              {emailStats.totalOpensToday} total · {openRateToday}% taxa
            </p>
          </div>
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <MousePointerClick size={14} className="text-teal-500" />
              <span className="text-[10px] font-semibold text-teal-500 uppercase">Cliques hoje</span>
            </div>
            <p className="text-2xl font-black text-teal-700">{emailStats.clicksToday}</p>
            <p className="text-[11px] text-teal-400 mt-0.5">
              {emailStats.totalClicksToday} total · {clickRateToday}% click-to-open
            </p>
          </div>
        </div>

        {/* Cota diaria — barra fina em vez de tile, pra nao competir com os KPIs de atividade */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Zap size={13} className={quotaPct >= 90 ? 'text-red-500' : quotaPct >= 70 ? 'text-amber-500' : 'text-slate-400'} />
            <span className="text-[11px] font-medium text-gray-500">Cota diária</span>
          </div>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${quotaPct >= 90 ? 'bg-red-500' : quotaPct >= 70 ? 'bg-amber-400' : 'bg-violet-400'}`}
              style={{ width: `${Math.min(quotaPct, 100)}%` }}
            />
          </div>
          <span className={`text-[11px] font-semibold flex-shrink-0 ${quotaPct >= 90 ? 'text-red-600' : quotaPct >= 70 ? 'text-amber-600' : 'text-gray-500'}`}>
            {quotaPct}%
          </span>
        </div>

        {/* Tendencia 7 dias + Envios por atendente */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Envios por atendente hoje */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Envios por atendente — hoje</p>
            {emailStats.attendantSends.length > 0 ? (
              <div className="space-y-2">
                {emailStats.attendantSends.map((a: { name: string; campaigns: number; sequences: number; total: number }) => {
                  const pct = emailStats.totalSentToday > 0 ? Math.round((a.total / emailStats.totalSentToday) * 100) : 0;
                  return (
                    <div key={a.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium truncate flex-1">{a.name}</span>
                        <span className="text-violet-700 font-bold text-xs ml-2">{a.total}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
                      </div>
                      <div className="flex gap-3 text-[10px] text-gray-400 mt-0.5 pl-0.5">
                        {a.campaigns > 0 && <span>Campanhas: {a.campaigns}</span>}
                        {a.sequences > 0 && <span>Sequencias: {a.sequences}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400">
                <Mail size={24} className="mx-auto mb-1 opacity-30" />
                <p className="text-xs">Nenhum e-mail enviado hoje</p>
              </div>
            )}
          </div>

          {/* Tendencia 7 dias */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Volume de envios — ultimos 7 dias</p>
            {emailStats.dailyTrend.length > 0 ? (
              <div className="flex items-end gap-2 h-24">
                {emailStats.dailyTrend.map((d: { day: string; sent: number }) => {
                  const dayLabel = d.day.slice(8, 10) + '/' + d.day.slice(5, 7);
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1">
                      <span className="text-[10px] text-gray-500 font-medium">{d.sent > 0 ? d.sent : ''}</span>
                      <div
                        className={`w-full rounded-t ${d.sent > 0 ? 'bg-violet-400' : 'bg-gray-100'} transition-all`}
                        style={{ height: `${Math.max(4, Math.round((d.sent / trendMax) * 72))}px` }}
                      />
                      <span className="text-[9px] text-gray-400">{dayLabel}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-400">
                <BarChart2 size={24} className="mx-auto mb-1 opacity-30" />
                <p className="text-xs">Sem dados de envio recentes</p>
              </div>
            )}
          </div>
        </div>

        {/* Top campanhas por abertura */}
        {emailStats.topCampaigns.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Melhores campanhas por abertura — ultimos 30 dias</p>
            <div className="space-y-1.5">
              {emailStats.topCampaigns.map((c: { id: number; name: string; subject: string; sent: number; opened: number; clicked: number; openRate: number }, i: number) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <span className={`text-xs w-5 text-center font-bold ${i === 0 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-700 truncate text-xs font-medium">{c.subject}</p>
                    <div className="flex gap-3 text-[10px] text-gray-400">
                      <span>{c.sent} enviados</span>
                      <span className="text-blue-500">{c.opened} abriram</span>
                      <span className="text-emerald-500">{c.clicked} clicaram</span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-sm font-bold ${c.openRate >= 30 ? 'text-emerald-600' : c.openRate >= 15 ? 'text-blue-600' : 'text-amber-600'}`}>
                      {c.openRate}%
                    </p>
                    <p className="text-[9px] text-gray-400">abertura</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insights estrategicos */}
        {(emailStats.totalSentToday > 0 || emailStats.pendingConfirmation > 100) && (
          <div className="bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-violet-700 mb-1">Insights do dia</p>
            {emailStats.pendingConfirmation > 100 && (
              <p className="text-[11px] text-amber-700">
                {emailStats.pendingConfirmation} e-mails aguardando confirmação ({100 - confirmationRatePct}% da base) — confirme em Tarefas para liberar para campanhas e sequências.
              </p>
            )}
            {openRateToday >= 25 && (
              <p className="text-[11px] text-violet-600">Taxa de abertura em {openRateToday}% — acima da media do mercado (15-25%)</p>
            )}
            {openRateToday > 0 && openRateToday < 15 && (
              <p className="text-[11px] text-amber-700">Taxa de abertura de {openRateToday}% esta abaixo da media. Considere revisar os assuntos dos e-mails.</p>
            )}
            {clickRateToday >= 3 && (
              <p className="text-[11px] text-emerald-700">Click-to-open de {clickRateToday}% — bom engajamento com o conteudo</p>
            )}
            {emailStats.bouncesToday > 0 && (
              <p className="text-[11px] text-red-600">{emailStats.bouncesToday} bounce(s) hoje — verifique a qualidade dos e-mails da base</p>
            )}
            {quotaPct >= 80 && (
              <p className="text-[11px] text-amber-700">Cota em {quotaPct}% — planeje os envios restantes com cuidado</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
    <Card
      className="border-blue-200 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setLocation("/admin/faturamento")}
    >
      <CardContent className="pt-4 px-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 text-blue-700 p-2.5 rounded-xl flex-shrink-0">
            <DollarSign size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800">Faturamento & Comissao</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {totals.totalEmbarcado > 0
                ? `Embarcado este mes: ${formatBRL(totals.totalEmbarcado)}`
                : "Acompanhe vendas, comissoes e relatorios"}
            </p>
          </div>
          <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  // Gerente (atendente promovido) vê o dashboard principal, mas sem as seções
  // de gestão de atendentes/IA — só o admin de verdade (Tarcyo) tem isFullAdmin.
  const isFullAdmin = user?.role === "admin";
  const { data: sellers = [], isLoading } = trpc.sellers.list.useQuery(undefined, { staleTime: 300_000 });
  const { data: tasks = [] } = trpc.tasks.list.useQuery(undefined, { staleTime: 120_000 });
  const { data: reminders = [] } = trpc.tasks.reminders.useQuery(undefined, { staleTime: 120_000 });
  const { data: deletionLogs = [], refetch: refetchDeletionLogs } = trpc.tasks.deletionLogs.useQuery({ onlyUnreviewed: true }, { staleTime: 120_000, enabled: isFullAdmin });
  const markDeletionReviewedMutation = trpc.tasks.markDeletionReviewed.useMutation({ onSuccess: () => refetchDeletionLogs() });
  const [showDeletionLogs, setShowDeletionLogs] = useState(false);
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

  const getAiConfig = () => {
    try {
      const configs = JSON.parse(localStorage.getItem('aiConfigs') || '{}') as Record<string, any>;
      for (const id of ['groq', 'cerebras', 'gemini']) {
        const c = configs[id];
        if (c?.status === 'configured') return { apiKey: c.apiKey, provider: c.provider, model: c.model };
      }
    } catch { /* ignore */ }
    return undefined;
  };

  const handleRunMonitor = async (forceRefresh = false) => {
    setMonitorLoading(true);
    try {
      const aiCfg = getAiConfig();
      const result: any = await analyzeAttendantsMutation.mutateAsync({ ...aiCfg, forceRefresh });
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "manager")) return null;

  const pending = (tasks as any[]).filter(t => t.status === 'pending');
  const completed = (tasks as any[]).filter(t => t.status === 'completed');
  const overdue = (tasks as any[]).filter(t => {
    if (t.status !== 'pending') return false;
    if (!t.reminderDate) return false;
    return new Date(t.reminderDate) < new Date();
  });
  const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const contactsToday = (tasks as any[]).filter(t => t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart).length;

  // Conversão: leads (lembretes recorrentes) que viraram clientes ativos.
  // contactCount registra quantos contatos reais foram feitos até a conversão — mede esforço de venda.
  const convertedTasks = (tasks as any[]).filter(t => t.convertedAt);
  const convertedCount = convertedTasks.length;
  const conversionRate = tasks.length > 0 ? Math.round((convertedCount / tasks.length) * 100) : 0;
  const avgContactsToConvert = convertedCount > 0
    ? Math.round(convertedTasks.reduce((sum, t) => sum + (t.contactCount || 0), 0) / convertedCount)
    : 0;
  const convertedThisMonth = convertedTasks.filter(t => {
    const d = new Date(t.convertedAt);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  // ── Funil de conversão: total de leads → contatados → convertidos ──────────
  const contactedTasks = (tasks as any[]).filter(t => t.lastContactedAt);
  const funnel = {
    total: tasks.length,
    contacted: contactedTasks.length,
    converted: convertedCount,
  };

  // ── Tempo médio até o 1º contato (createdAt → lastContactedAt) ──────────────
  const firstContactDeltas = contactedTasks
    .map(t => new Date(t.lastContactedAt).getTime() - new Date(t.createdAt).getTime())
    .filter(d => d > 0);
  const avgFirstContactMs = firstContactDeltas.length > 0
    ? firstContactDeltas.reduce((a, b) => a + b, 0) / firstContactDeltas.length
    : 0;
  const avgFirstContactDays = avgFirstContactMs > 0 ? (avgFirstContactMs / 86400000) : 0;

  // ── Tempo médio até a conversão (createdAt → convertedAt) ───────────────────
  const conversionTimeDeltas = convertedTasks
    .map(t => new Date(t.convertedAt).getTime() - new Date(t.createdAt).getTime())
    .filter(d => d > 0);
  const avgConversionMs = conversionTimeDeltas.length > 0
    ? conversionTimeDeltas.reduce((a, b) => a + b, 0) / conversionTimeDeltas.length
    : 0;
  const avgConversionDays = avgConversionMs > 0 ? (avgConversionMs / 86400000) : 0;
  const staleNoContact = (tasks as any[]).filter(t => {
    if (t.lastContactedAt || t.convertedAt) return false;
    const ageMs = Date.now() - new Date(t.createdAt).getTime();
    return ageMs > 48 * 3600000; // > 48h sem nenhum contato
  });

  // ── Leads "quentes": contactCount próximo da média necessária para converter, ainda não convertidos ─
  const hotLeads = avgContactsToConvert > 0
    ? (tasks as any[])
        .filter(t => !t.convertedAt && (t.contactCount || 0) >= Math.max(1, avgContactsToConvert - 1))
        .sort((a, b) => (b.contactCount || 0) - (a.contactCount || 0))
        .slice(0, 8)
    : [];

  // ── Ranking de conversão por atendente (+ ticket de esforço individual e taxa de perdidos) ─
  const conversionRanking = (sellers as any[] || []).map((seller: any) => {
    const mine = (tasks as any[]).filter(t => t.assignedTo === seller.name || t.userId === seller.userId);
    const minePending = mine.length;
    const mineConvertedTasks = mine.filter(t => t.convertedAt);
    const mineConverted = mineConvertedTasks.length;
    const mineCancelled = mine.filter(t => t.status === 'cancelled').length;
    const rate = minePending > 0 ? Math.round((mineConverted / minePending) * 100) : 0;
    // Ticket de esforço individual: quantos contatos esse atendente precisa, em média, até converter
    const myAvgContacts = mineConverted > 0
      ? Math.round(mineConvertedTasks.reduce((acc, t) => acc + (t.contactCount || 0), 0) / mineConverted)
      : 0;
    // Taxa de leads perdidos: cancelados em relação ao que já teve um desfecho (convertido ou cancelado)
    const decided = mineConverted + mineCancelled;
    const lostRate = decided > 0 ? Math.round((mineCancelled / decided) * 100) : 0;
    return { name: seller.name, total: minePending, converted: mineConverted, rate, myAvgContacts, cancelled: mineCancelled, lostRate };
  }).filter(r => r.total > 0).sort((a, b) => b.converted - a.converted || b.rate - a.rate);

  // ── Tendência semanal de conversões (últimas 8 semanas, agrupado por convertedAt) ──
  const weeklyTrend = (() => {
    const weeks: { label: string; start: number; end: number; count: number }[] = [];
    const now = new Date();
    const startOfWeek = (d: Date) => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; };
    let cursor = startOfWeek(now);
    for (let i = 7; i >= 0; i--) {
      const start = new Date(cursor); start.setDate(start.getDate() - i * 7);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      const p = (n: number) => String(n).padStart(2, '0');
      weeks.push({ label: `${p(start.getDate())}/${p(start.getMonth() + 1)}`, start: start.getTime(), end: end.getTime(), count: 0 });
    }
    for (const t of convertedTasks) {
      const ts = new Date(t.convertedAt).getTime();
      const wk = weeks.find(w => ts >= w.start && ts < w.end);
      if (wk) wk.count++;
    }
    return weeks;
  })();
  const weeklyTrendMax = Math.max(1, ...weeklyTrend.map(w => w.count));

  // ── Taxa geral de leads perdidos (cancelados vs. convertidos — leads com desfecho) ──
  const cancelledTotal = (tasks as any[]).filter(t => t.status === 'cancelled').length;
  const decidedTotal = convertedCount + cancelledTotal;
  const lostRateGlobal = decidedTotal > 0 ? Math.round((cancelledTotal / decidedTotal) * 100) : 0;

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

  const kpis = [
    {
      label: "Contatos hoje",
      value: contactsToday,
      sub: `meta: ${teamDailyGoal}`,
      icon: <Phone size={22} />,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
    ...(isFullAdmin ? [{
      label: "Atendentes",
      value: sellers?.length || 0,
      sub: `${(sessionData as any[]).filter((s: any) => s.session?.status === 'active').length} ativos agora`,
      icon: <Users size={22} />,
      color: "text-indigo-600",
      bg: "bg-indigo-50",
      border: "border-indigo-100",
    }] : []),
    {
      label: "Pendentes",
      value: pending.length,
      sub: `${completionRate}% concluídos`,
      icon: <ClipboardList size={22} />,
      color: "text-orange-500",
      bg: "bg-orange-50",
      border: "border-orange-100",
    },
    {
      label: "Atrasados",
      value: overdue.length,
      sub: overdue.length > 0 ? "precisam de ação" : "tudo em dia ✓",
      icon: <AlertTriangle size={22} />,
      color: overdue.length > 0 ? "text-red-600" : "text-green-600",
      bg: overdue.length > 0 ? "bg-red-50" : "bg-green-50",
      border: overdue.length > 0 ? "border-red-100" : "border-green-100",
    },
    {
      label: "Com lembrete",
      value: (tasks as any[]).filter(t => t.reminderDate && t.reminderEnabled).length,
      sub: `de ${tasks.length} total`,
      icon: <CheckCircle2 size={22} />,
      color: "text-teal-600",
      bg: "bg-teal-50",
      border: "border-teal-100",
    },
    {
      label: "Conversões",
      value: convertedCount,
      sub: `${conversionRate}% taxa · ${convertedThisMonth} este mês · ~${avgContactsToConvert} contatos p/ converter`,
      icon: <span className="text-[22px]">🎉</span>,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
    },
  ];

  const quickActions = isFullAdmin ? [
    { label: "Tarefas", path: "/tasks", icon: <ClipboardList size={20} />, color: "bg-blue-600 hover:bg-blue-700" },
    { label: "Atendentes", path: "/attendants", icon: <Users size={20} />, color: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Chat IA", path: "/ai-chat", icon: <MessageSquare size={20} />, color: "bg-purple-600 hover:bg-purple-700" },
    { label: "Config IA", path: "/ai-settings", icon: <Settings size={20} />, color: "bg-slate-600 hover:bg-slate-700" },
  ] : [
    { label: "Tarefas", path: "/tasks", icon: <ClipboardList size={20} />, color: "bg-blue-600 hover:bg-blue-700" },
    { label: "E-mail Marketing", path: "/admin/email-marketing", icon: <Mail size={20} />, color: "bg-violet-600 hover:bg-violet-700" },
    { label: "Faturamento", path: "/admin/faturamento", icon: <DollarSign size={20} />, color: "bg-cyan-600 hover:bg-cyan-700" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-4 md:p-5 text-white flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Olá, {user.name?.split(' ')[0]} 👋</h2>
          <p className="text-slate-300 text-sm mt-0.5">
            {overdue.length > 0
              ? `⚠️ ${overdue.length} tarefa${overdue.length > 1 ? 's' : ''} em atraso`
              : 'Tudo em ordem no sistema'}
          </p>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          <div className="hidden md:flex items-center gap-2 text-slate-400 text-sm">
            <span>{(() => { try { return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { const d = new Date(); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; } })()}</span>
          </div>
        </div>
      </div>

      {/* Task Deletion Alert Banner */}
      {deletionLogs.length > 0 && (
        <div
          className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => setShowDeletionLogs(v => !v)}
        >
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle size={18} className="text-amber-500 shrink-0" />
            <span className="font-semibold text-sm">
              {deletionLogs.length} tarefa{deletionLogs.length > 1 ? 's' : ''} excluída{deletionLogs.length > 1 ? 's' : ''} aguarda{deletionLogs.length > 1 ? 'm' : ''} revisão
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold">
              {deletionLogs.length}
            </span>
            {showDeletionLogs ? <ChevronDown size={16} className="text-amber-600" /> : <ChevronRight size={16} className="text-amber-600" />}
          </div>
        </div>
      )}

      {/* Task Deletion Logs Panel */}
      {showDeletionLogs && deletionLogs.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800">
              <Trash2 size={16} />
              Tarefas Excluídas — Pendentes de Revisão
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-amber-100">
              {deletionLogs.map((log: any) => (
                <div key={log.id} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-800 truncate">{log.taskTitle}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Excluída por <span className="font-semibold text-gray-700">{log.deletedByName}</span>
                      {' · '}
                      {new Date(log.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="mt-1.5 flex items-start gap-1.5">
                      <span className="text-xs text-amber-700 font-medium shrink-0">Motivo:</span>
                      <span className="text-xs text-gray-700 break-words">{log.reason}</span>
                    </div>
                    {log.taskNotes && (
                      <p className="text-xs text-gray-400 mt-1 italic truncate">Nota: {log.taskNotes.slice(0, 80)}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 text-xs border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => markDeletionReviewedMutation.mutate({ id: log.id })}
                    disabled={markDeletionReviewedMutation.isPending}
                  >
                    <Eye size={13} className="mr-1" />
                    Revisei
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={`border ${kpi.border}`}>
            <CardContent className="pt-4 px-4 pb-3">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-xs font-medium text-gray-600 mt-0.5">{kpi.label}</p>
                  {(kpi as any).sub && <p className="text-[11px] text-gray-400 mt-0.5">{(kpi as any).sub}</p>}
                </div>
                <div className={`${kpi.bg} ${kpi.color} p-2 rounded-lg flex-shrink-0 ml-2`}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Email Marketing — Painel Estrategico */}
      <EmailStrategicCard />

      {/* Funil de Conversão & Performance de Vendas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="text-lg">🎯</span>
            Funil de Conversão & Performance de Vendas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Funil visual */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Funil — do lead ao cliente ativo</p>
            <div className="flex items-center gap-2">
              {[
                { label: 'Leads', value: funnel.total, color: 'bg-slate-500' },
                { label: 'Contatados', value: funnel.contacted, color: 'bg-blue-500' },
                { label: 'Convertidos', value: funnel.converted, color: 'bg-emerald-500' },
              ].map((stage, i, arr) => {
                const pct = funnel.total > 0 ? Math.round((stage.value / funnel.total) * 100) : 0;
                return (
                  <div key={stage.label} className="flex-1 flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                        <span>{stage.label}</span>
                        <span className="font-semibold text-gray-700">{stage.value} ({pct}%)</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${stage.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {i < arr.length - 1 && <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
            {staleNoContact.length > 0 && (
              <p className="text-[11px] text-amber-600 mt-2">
                ⚠️ {staleNoContact.length} lead(s) há mais de 48h sem nenhum contato — esfriando
              </p>
            )}
            {avgFirstContactDays > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">
                ⏱️ Tempo médio até o 1º contato: <strong className="text-gray-600">{avgFirstContactDays < 1 ? `${Math.round(avgFirstContactMs / 3600000)}h` : `${avgFirstContactDays.toFixed(1)} dias`}</strong>
              </p>
            )}
            {avgConversionDays > 0 && (
              <p className="text-[11px] text-gray-400 mt-1">
                🎯 Tempo médio até a conversão: <strong className="text-gray-600">{avgConversionDays < 1 ? `${Math.round(avgConversionMs / 3600000)}h` : `${avgConversionDays.toFixed(1)} dias`}</strong>
              </p>
            )}
          </div>

          {/* Tendência semanal de conversões */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">📈 Tendência de conversões — últimas 8 semanas</p>
              {decidedTotal > 0 && (
                <p className="text-[11px] text-gray-400">
                  Taxa de leads perdidos: <strong className={lostRateGlobal >= 50 ? 'text-red-500' : lostRateGlobal >= 25 ? 'text-amber-600' : 'text-gray-600'}>{lostRateGlobal}%</strong>
                  <span className="text-gray-300"> ({cancelledTotal} cancelado{cancelledTotal !== 1 ? 's' : ''} de {decidedTotal} com desfecho)</span>
                </p>
              )}
            </div>
            <div className="flex items-end gap-2 h-20">
              {weeklyTrend.map(w => (
                <div key={w.label} className="flex-1 flex flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-gray-500 font-medium">{w.count > 0 ? w.count : ''}</span>
                  <div
                    className={`w-full rounded-t ${w.count > 0 ? 'bg-emerald-400' : 'bg-gray-100'} transition-all`}
                    style={{ height: `${Math.max(4, Math.round((w.count / weeklyTrendMax) * 64))}px` }}
                  />
                  <span className="text-[9px] text-gray-400">{w.label}</span>
                </div>
              ))}
            </div>
            {convertedCount === 0 && <p className="text-xs text-gray-400 mt-1">Sem conversões registradas ainda — o gráfico vai ganhar vida conforme as vendas acontecerem.</p>}
          </div>

          <div className={`grid grid-cols-1 ${isFullAdmin ? 'md:grid-cols-2' : ''} gap-5`}>
            {/* Ranking de conversão — cross-atendente, só admin */}
            {isFullAdmin && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500">🏆 Ranking de conversão por atendente</p>
                {conversionRanking.length > 0 && (
                  <button
                    onClick={() => exportCsv(
                      `ranking-conversao-${new Date().toISOString().slice(0, 10)}.csv`,
                      ['Atendente', 'Total leads', 'Convertidos', 'Taxa (%)', 'Contatos médios/venda', 'Perdidos', 'Taxa perdidos (%)'],
                      conversionRanking.map(r => [r.name, r.total, r.converted, r.rate, r.myAvgContacts, r.cancelled, r.lostRate])
                    )}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-emerald-600 transition"
                    title="Exportar CSV"
                  >
                    <Download size={12} /> CSV
                  </button>
                )}
              </div>
              {conversionRanking.length > 0 ? (
                <div className="space-y-2">
                  {conversionRanking.slice(0, 6).map((r, i) => (
                    <div key={r.name} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-4">{i + 1}º</span>
                        <span className="flex-1 truncate text-gray-700">{r.name}</span>
                        <span className="text-emerald-700 font-semibold text-xs">{r.converted} 🎉</span>
                        <span className="text-[11px] text-gray-400 w-12 text-right">{r.rate}%</span>
                      </div>
                      <div className="flex items-center gap-3 pl-6 mt-0.5 text-[10px] text-gray-400">
                        {r.myAvgContacts > 0 && <span>📞 ~{r.myAvgContacts} contatos/venda</span>}
                        {r.cancelled > 0 && <span className={r.lostRate >= 50 ? 'text-red-500' : ''}>❌ {r.cancelled} perdido(s) ({r.lostRate}%)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Sem conversões registradas ainda.</p>
              )}
            </div>
            )}

            {/* Leads quentes */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                🔥 Leads quentes — perto de converter
                {avgContactsToConvert > 0 && <span className="text-gray-400 font-normal"> (≥ {Math.max(1, avgContactsToConvert - 1)} contatos)</span>}
              </p>
              {hotLeads.length > 0 ? (
                <div className="space-y-1.5">
                  {hotLeads.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <span className="truncate flex-1 text-gray-700">{(t.title || '').split(' - ')[0].slice(0, 36)}</span>
                      {t.assignedTo && <span className="text-[11px] text-gray-400 truncate max-w-[80px]">👤 {t.assignedTo}</span>}
                      <span className="text-orange-600 font-semibold text-xs flex-shrink-0">📞 {t.contactCount}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  {avgContactsToConvert > 0 ? 'Nenhum lead próximo do ponto médio de conversão agora.' : 'Ainda sem dados suficientes de conversão para calcular.'}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendants overview — cross-atendente, só admin */}
      {isFullAdmin && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Users size={18} className="text-gray-600" />
              Desempenho dos Atendentes
            </span>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setLocation('/attendants')}>
              Gerenciar <ArrowRight size={13} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sellers && sellers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sellers.map((seller: any) => {
                const sellerTasks = (tasks as any[]).filter(t => t.assignedTo === seller.name || t.userId === seller.userId);
                const sellerContactsToday = sellerTasks.filter(t => t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart).length;
                const GOAL = effectiveDailyGoal(seller.dailyGoal);
                const pct = Math.min(Math.round((sellerContactsToday / GOAL) * 100), 100);
                const sellerOverdue = sellerTasks.filter(t => {
                  if (t.status !== 'pending' || !t.reminderDate || !t.reminderEnabled) return false;
                  return new Date(t.reminderDate) < new Date();
                }).length;
                const sessionRow = (sessionData as any[]).find((s: any) => s.name === seller.name);
                const isActive = sessionRow?.session?.status === 'active';
                const isPaused = sessionRow?.session?.status === 'paused';
                const barColor = pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 30 ? 'bg-amber-400' : 'bg-red-400';
                return (
                  <div key={seller.id} className="p-4 border rounded-xl bg-white hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-slate-700 text-white flex items-center justify-center text-sm font-bold">
                          {seller.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isActive ? 'bg-green-500' : isPaused ? 'bg-yellow-400' : 'bg-gray-300'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-gray-800 truncate">{seller.name}</p>
                        <p className="text-xs text-gray-400 truncate">{seller.email}</p>
                      </div>
                      <button
                        onClick={() => setSelectedSeller(seller)}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Análise detalhada"
                      >
                        <BarChart2 size={12} />
                        Analisar
                      </button>
                    </div>
                    {/* Contatos hoje vs meta */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-14 text-right tabular-nums">
                        {sellerContactsToday}/{GOAL}
                      </span>
                    </div>
                    {/* Carteira: total / contatos hoje / atrasados */}
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="bg-slate-50 rounded-lg py-1.5 px-1">
                        <p className="text-sm font-bold text-slate-700 tabular-nums">{sellerTasks.length}</p>
                        <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><Users size={9} /> total</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg py-1.5 px-1">
                        <p className="text-sm font-bold text-blue-700 tabular-nums">{sellerContactsToday}</p>
                        <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5"><Phone size={9} /> hoje</p>
                      </div>
                      <div className={`rounded-lg py-1.5 px-1 ${sellerOverdue > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <p className={`text-sm font-bold tabular-nums ${sellerOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{sellerOverdue}</p>
                        <p className={`text-[10px] flex items-center justify-center gap-0.5 ${sellerOverdue > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                          <AlertTriangle size={9} /> atrasado{sellerOverdue !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum atendente cadastrado.</p>
              <button onClick={() => setLocation('/attendants')} className="mt-2 text-blue-600 text-sm underline hover:no-underline">
                Adicionar agora
              </button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Monitor IA — recurso de IA, só admin */}
      {isFullAdmin && (
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Scan size={18} className="text-purple-600" />
              Monitor IA — Comportamento
            </span>
            <Button
              onClick={() => handleRunMonitor(false)}
              disabled={monitorLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-1 text-xs"
              size="sm"
            >
              {monitorLoading ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                  Analisando...
                </>
              ) : (
                <>Analisar Agora</>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {monitorCached?.cached && (
            <div className="flex items-center justify-between gap-2 text-xs bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
              <span className="text-purple-700">
                📦 Resultado em cache de {new Date(monitorCached.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} — economiza sua cota gratuita de IA
              </span>
              <button
                type="button"
                className="text-purple-700 font-medium hover:underline whitespace-nowrap"
                onClick={() => handleRunMonitor(true)}
                disabled={monitorLoading}
              >
                🔄 Forçar nova análise
              </button>
            </div>
          )}
          {!monitorReport && !monitorSummary && !monitorLoading && (
            <div className="text-center py-8 text-gray-400">
              <Scan size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Clique em "Analisar Agora" para verificar o comportamento de cada atendente.</p>
              <p className="text-xs mt-1 text-gray-300">Detecta: tarefas sem anotação, adiamentos suspeitos, baixa produtividade.</p>
            </div>
          )}

          {monitorReport && monitorReport.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {monitorReport.map((r: any) => (
                <div key={r.sellerId} className={`p-4 rounded-xl border-2 ${r.status === '🔴 Suspeito' ? 'border-red-300 bg-red-50' : r.status === '🟡 Atenção' ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-gray-800">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.email}</p>
                    </div>
                    <span className="text-sm font-bold">{r.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center mb-2">
                    <div className="bg-white rounded-lg p-1.5">
                      <p className="text-base font-bold text-blue-600">{r.total}</p>
                      <p className="text-xs text-gray-500">Clientes</p>
                    </div>
                    <div className="bg-white rounded-lg p-1.5">
                      <p className={`text-base font-bold ${r.overdue > 0 ? 'text-red-600' : 'text-gray-500'}`}>{r.overdue}</p>
                      <p className="text-xs text-gray-500">Vencidos</p>
                    </div>
                    <div className="bg-white rounded-lg p-1.5">
                      <p className={`text-base font-bold ${r.noNotes > 0 ? 'text-orange-500' : 'text-gray-500'}`}>{r.noNotes}</p>
                      <p className="text-xs text-gray-500">Sem nota</p>
                    </div>
                    <div className="bg-white rounded-lg p-1.5">
                      <p className={`text-base font-bold ${r.disabledReminders > 0 ? 'text-red-700' : 'text-gray-500'}`}>{r.disabledReminders}</p>
                      <p className="text-xs text-gray-500">Desativados</p>
                    </div>
                  </div>
                  {r.flags.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {r.flags.map((flag: string, i: number) => (
                        <p key={i} className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded">⚠️ {flag}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {monitorSummary && (
            <AiAnalysisReport markdown={monitorSummary} />
          )}
        </CardContent>
      </Card>
      )}

      {/* Work Sessions — cross-atendente, só admin */}
      {isFullAdmin && (
      <Card className="border-cyan-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Timer size={18} className="text-cyan-600" />
              Sessões de Trabalho Hoje
            </span>
            <button
              onClick={() => refetchSessions()}
              disabled={sessionsFetching}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-600 transition disabled:opacity-50"
              title="Atualizar"
            >
              <RefreshCw size={13} className={sessionsFetching ? 'animate-spin' : ''} />
              {sessionsFetching ? 'Atualizando...' : 'Atualizar'}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
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
                <div key={row.sellerId} className={`rounded-xl border overflow-hidden ${
                  isIdle ? 'border-amber-200' :
                  isPaused ? 'border-yellow-200' :
                  s ? 'border-green-200' : 'border-gray-100'
                }`}>
                  {/* Main row */}
                  <div
                    className={`flex items-center gap-3 p-3 cursor-pointer select-none ${
                      isIdle ? 'bg-amber-50 hover:bg-amber-100' :
                      isPaused ? 'bg-yellow-50 hover:bg-yellow-100' :
                      s ? 'bg-green-50 hover:bg-green-100' : 'bg-gray-50 hover:bg-gray-100'
                    } transition-colors`}
                    onClick={() => hasDetail && toggleSession(row.sellerId)}
                  >
                    {/* Status dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isIdle ? 'bg-amber-400' : isPaused ? 'bg-yellow-400' : s ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                    }`} />

                    {/* Name */}
                    <div className="w-28 flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{row.name}</p>
                    </div>

                    {/* Status label */}
                    <div className="w-28 flex-shrink-0">
                      {!s && <span className="text-xs text-gray-400">Sem sessão hoje</span>}
                      {s?.status === 'active' && !isIdle && <span className="text-xs font-semibold text-green-700 flex items-center gap-1"><Activity size={11} /> Ativo</span>}
                      {isIdle && <span className="text-xs font-semibold text-amber-700">⚠ Ocioso {idleMin}min</span>}
                      {isPaused && <span className="text-xs font-semibold text-yellow-700">⏸ Pausado</span>}
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-4 flex-1 text-xs text-gray-600 flex-wrap">
                      {startTime && <span title="Entrada">🕐 <strong>{startTime}</strong></span>}
                      {s && (
                        <span title="Tempo trabalhado">
                          ⏱ <strong>{workedH > 0 ? `${workedH}h ` : ''}{workedM}min</strong>
                        </span>
                      )}
                      <span title="Tarefas com anotação hoje">
                        📞 <strong>{row.contactsToday}</strong> contatos
                      </span>
                      {lastAct && <span title="Última edição de tarefa">🕒 <strong>{lastAct}</strong></span>}
                      {!s && lastOnline && (
                        <span className="text-gray-400" title="Último acesso registrado">
                          🔌 último acesso: <strong>{lastOnline}</strong>
                        </span>
                      )}
                      {row.ghostCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold" title={`${row.ghostCount} clientes sem contato há 30+ dias`}>
                          👻 {row.ghostCount}
                        </span>
                      )}
                      {row.burstAlert && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold animate-pulse" title={`Alerta de fraude: ${row.burstMax} contatos em <10min`}>
                          ⚡ Burst
                        </span>
                      )}
                    </div>

                    {/* Expand chevron */}
                    {hasDetail && (
                      <div className="text-gray-400 flex-shrink-0">
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </div>
                    )}
                  </div>

                  {/* Expanded detail — recent tasks */}
                  {isExpanded && (
                    <div className="border-t border-dashed px-4 py-3 bg-white">
                      {row.recentTasks?.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                            Tarefas editadas hoje
                          </p>
                          {row.recentTasks.map((t: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs text-gray-700">
                              <FileText size={12} className="text-cyan-500 mt-0.5 flex-shrink-0" />
                              <span className="flex-1 truncate font-medium">{t.title}</span>
                              <span className="text-gray-400 flex-shrink-0 tabular-nums">
                                {fmtAgo(t.lastContactedAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">
                          Nenhuma tarefa editada hoje.
                          {lastOnline && <> Último acesso: <strong>{lastOnline}</strong>.</>}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {(sessionData as any[]).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum atendente cadastrado.</p>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {/* Reminders Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ClipboardList size={18} className="text-gray-600" />
              Lembretes
            </span>
            <select
              value={reminderFilter}
              onChange={(e) => setReminderFilter(e.target.value)}
              className="px-3 py-1 border rounded-lg text-xs font-normal bg-white"
            >
              <option value="all">👁️ Todos</option>
              <option value="__admin__">🔑 Administrador</option>
              {(sellers ?? []).map((s: any) => (
                <option key={s.id} value={s.name}>👤 {s.name}</option>
              ))}
            </select>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredReminders.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum lembrete</p>
            </div>
          ) : (
            <>
              {overdueReminders.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-red-600 mb-2">🚨 ATRASADOS ({overdueReminders.length})</p>
                  <div className="space-y-2">
                    {overdueReminders.slice(0, 5).map((reminder: any) => (
                      <div key={reminder.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-medium text-sm text-red-900">{reminder.title}</p>
                          <span className="text-xs text-red-700">{(() => { try { const d=new Date(reminder.reminderDate); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}`; } catch { return ''; } })()}</span>
                        </div>
                        {reminder.assignedTo && <p className="text-xs text-red-600">👤 {reminder.assignedTo}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {upcomingReminders.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-blue-600 mb-2">🔔 PRÓXIMOS ({upcomingReminders.length})</p>
                  <div className="space-y-2">
                    {upcomingReminders.slice(0, 5).map((reminder: any) => (
                      <div key={reminder.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-medium text-sm text-blue-900">{reminder.title}</p>
                          <span className="text-xs text-blue-700">{(() => { try { const d=new Date(reminder.reminderDate); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`; } catch { return ''; } })()}</span>
                        </div>
                        {reminder.assignedTo && <p className="text-xs text-blue-600">👤 {reminder.assignedTo}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Faturamento & Comissão — quick link */}
      <FaturamentoQuickCard setLocation={setLocation} />

      {/* Quick Actions */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ações Rápidas</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => setLocation(action.path)}
              className={`${action.color} text-white rounded-xl p-4 text-center transition-all hover:scale-[1.02] active:scale-95 flex flex-col items-center gap-2`}
            >
              {action.icon}
              <span className="text-sm font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Attendant Detail Modal */}
      {selectedSeller && (
        <AttendantDetailModal
          seller={selectedSeller}
          allTasks={tasks as any[]}
          allSellers={sellers as any[]}
          onClose={() => setSelectedSeller(null)}
        />
      )}

    </div>
  );
}
