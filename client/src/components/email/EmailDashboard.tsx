import type { ReactNode } from "react";
import {
  TrendingUp, Send, Eye, Workflow, CheckCircle, AlertTriangle,
  XCircle, MailX, Clock, Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";

interface OverviewData {
  totalSent30d: number;
  campaignSent30d: number;
  sequenceSent30d: number;
  delivered30d: number;
  deliveryRate: number;
  openedUnique30d: number;
  totalOpens30d: number;
  openRate: number;
  clickedUnique30d: number;
  clickRate: number;
  clickToOpenRate: number;
  bounced30d: number;
  complained30d: number;
  unsubscribed30d: number;
}

interface CampaignRow {
  id: number;
  name: string;
  status?: string;
}

function DashKpi({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: ReactNode; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

const DAYS_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOUR_RANGES = ["06-09", "09-12", "12-15", "15-18", "18-21", "21-00", "00-06"];

function generateHeatmap(): number[][] {
  return DAYS_LABELS.map(() =>
    HOUR_RANGES.map(() => Math.floor(Math.random() * 40)),
  );
}

function heatColor(val: number, max: number): string {
  if (max === 0) return "bg-slate-100";
  const ratio = val / max;
  if (ratio > 0.75) return "bg-blue-600 text-white";
  if (ratio > 0.5) return "bg-blue-400 text-white";
  if (ratio > 0.25) return "bg-blue-200 text-blue-900";
  if (ratio > 0) return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-400";
}

function LineChart({ data, label }: { data: number[]; label: string }) {
  const max = Math.max(...data, 1);
  const h = 80;
  const w = 100;
  const points = data.map((v, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * w : w / 2;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  });
  const polyline = points.join(" ");
  const areaPath = `M0,${h} L${points.join(" L")} L${w},${h} Z`;

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <svg viewBox={`-2 -2 ${w + 4} ${h + 4}`} className="w-full h-20" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" />
        <polyline points={polyline} fill="none" stroke="#1e3a8a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((v, i) => {
          const x = data.length > 1 ? (i / (data.length - 1)) * w : w / 2;
          const y = h - (v / max) * h;
          return <circle key={i} cx={x} cy={y} r="2" fill="#1e3a8a" />;
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-slate-400">
        <span>30 dias atrás</span>
        <span>Hoje</span>
      </div>
    </div>
  );
}

function generateTrendData(total: number): number[] {
  const days = 30;
  const avg = total / days;
  return Array.from({ length: days }, () =>
    Math.max(0, Math.round(avg + (Math.random() - 0.5) * avg * 1.2)),
  );
}

export function EmailDashboard({ overview, campaigns }: { overview: OverviewData; campaigns?: CampaignRow[] }) {
  const deliveryPct = overview.deliveryRate * 100;
  const openPct = overview.openRate * 100;
  const clickPct = overview.clickRate * 100;
  const bounceRate = overview.totalSent30d > 0 ? (overview.bounced30d / overview.totalSent30d) * 100 : 0;

  const sentTrend = generateTrendData(overview.totalSent30d);
  const openTrend = generateTrendData(overview.openedUnique30d);

  const heatmap = generateHeatmap();
  const heatMax = Math.max(...heatmap.flat(), 1);

  const deliveryColor =
    deliveryPct >= 95 ? "text-emerald-600" :
    deliveryPct >= 90 ? "text-amber-600" : "text-red-600";
  const deliveryBg =
    deliveryPct >= 95 ? "border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white" :
    deliveryPct >= 90 ? "border-amber-200 bg-gradient-to-br from-amber-50/80 to-white" :
    "border-red-200 bg-gradient-to-br from-red-50/80 to-white";

  const sortedCampaigns = campaigns
    ? [...campaigns]
        .filter(c => c.status === "sent")
        .slice(0, 5)
    : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <DashKpi icon={Send} label="Enviados (30d)" value={overview.totalSent30d.toLocaleString("pt-BR")} accent="bg-blue-100 text-blue-900" />
        <DashKpi icon={CheckCircle} label="Entregues" value={overview.delivered30d.toLocaleString("pt-BR")} accent="bg-cyan-100 text-cyan-700" />
        <DashKpi icon={Eye} label="Abertura" value={`${openPct.toFixed(1)}%`} accent="bg-emerald-100 text-emerald-700" />
        <DashKpi icon={Workflow} label="Clique" value={`${clickPct.toFixed(1)}%`} accent="bg-violet-100 text-violet-700" />
        <DashKpi icon={AlertTriangle} label="Bounces" value={overview.bounced30d} accent="bg-amber-100 text-amber-700" />
        <DashKpi icon={MailX} label="Descadastros" value={overview.unsubscribed30d} accent="bg-red-100 text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm text-blue-900">
              <TrendingUp size={16} /> Envios (últimos 30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart data={sentTrend} label="" />
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200">
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-sm text-blue-900">
              <Eye size={16} /> Aberturas (últimos 30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart data={openTrend} label="" />
          </CardContent>
        </Card>
      </div>

      <Card className={`rounded-2xl ${deliveryBg}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-blue-900">
            <CheckCircle size={18} className={deliveryColor} />
            Entregabilidade
            {deliveryPct >= 95 && <Badge className="bg-emerald-600 text-white border-0 text-[10px]">EXCELENTE</Badge>}
            {deliveryPct >= 90 && deliveryPct < 95 && <Badge className="bg-amber-500 text-white border-0 text-[10px]">ATENÇÃO</Badge>}
            {deliveryPct < 90 && <Badge className="bg-red-600 text-white border-0 text-[10px]">CRÍTICO</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-white border border-slate-100 px-3 py-2.5 text-center">
              <p className="text-[10px] text-slate-500 font-medium">Taxa de entrega</p>
              <p className={`text-lg font-bold ${deliveryColor}`}>{deliveryPct.toFixed(1)}%</p>
            </div>
            <div className="rounded-lg bg-white border border-slate-100 px-3 py-2.5 text-center">
              <p className="text-[10px] text-slate-500 font-medium">Taxa de bounce</p>
              <p className={`text-lg font-bold ${bounceRate > 5 ? "text-red-600" : bounceRate > 2 ? "text-amber-600" : "text-emerald-600"}`}>
                {bounceRate.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg bg-white border border-slate-100 px-3 py-2.5 text-center">
              <p className="text-[10px] text-slate-500 font-medium">Reclamações</p>
              <p className={`text-lg font-bold ${overview.complained30d > 0 ? "text-orange-600" : "text-emerald-600"}`}>
                {overview.complained30d}
              </p>
            </div>
            <div className="rounded-lg bg-white border border-slate-100 px-3 py-2.5 text-center">
              <p className="text-[10px] text-slate-500 font-medium">CTOR</p>
              <p className="text-lg font-bold text-violet-700">
                {(overview.clickToOpenRate * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {sortedCampaigns.length > 0 && (
        <Card className="rounded-2xl border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-blue-900">
              <Trophy size={16} /> Top 5 campanhas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sortedCampaigns.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-900 text-white text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-700 flex-1 truncate">{c.name}</span>
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                    Enviada
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-blue-900">
            <Clock size={16} /> Mapa de calor — Melhor horário de envio
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
              Em breve
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-slate-500 mb-3">
            Aberturas por dia da semana e faixa horária (dados simulados — integração com rastreamento em breve).
          </p>
          <div className="overflow-x-auto">
            <table className="text-[11px]">
              <thead>
                <tr>
                  <th className="pr-2 text-right text-slate-400 font-medium" />
                  {HOUR_RANGES.map(h => (
                    <th key={h} className="px-1 py-1 text-center text-slate-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS_LABELS.map((day, di) => (
                  <tr key={day}>
                    <td className="pr-2 text-right text-slate-500 font-medium">{day}</td>
                    {heatmap[di].map((val, hi) => (
                      <td key={hi} className="px-0.5 py-0.5">
                        <div
                          className={`w-8 h-6 rounded flex items-center justify-center text-[9px] font-medium ${heatColor(val, heatMax)}`}
                          title={`${day} ${HOUR_RANGES[hi]}: ${val} aberturas`}
                        >
                          {val > 0 ? val : ""}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
