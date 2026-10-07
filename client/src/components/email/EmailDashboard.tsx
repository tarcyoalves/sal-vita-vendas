import { Panel, PanelHeader, Stat, StatStrip } from "../layout/Page";
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

/*
 * Só dado real. Esta tela já teve gráfico de envios/aberturas de 30 dias e um
 * "mapa de calor de melhor horário" gerados com Math.random(): pareciam análise e
 * mudavam a cada render. Foram removidos — não há série diária no backend. Se um
 * dia houver (`emailMarketing.overview` devolvendo por dia), o gráfico volta aqui.
 */
export function EmailDashboard({ overview, campaigns }: { overview: OverviewData; campaigns?: CampaignRow[] }) {
  const deliveryPct = overview.deliveryRate * 100;
  const openPct = overview.openRate * 100;
  const clickPct = overview.clickRate * 100;
  const bounceRate = overview.totalSent30d > 0 ? (overview.bounced30d / overview.totalSent30d) * 100 : 0;

  const health =
    deliveryPct >= 95
      ? { variant: "success" as const, label: "Saudável" }
      : deliveryPct >= 90
        ? { variant: "warning" as const, label: "Atenção" }
        : { variant: "danger" as const, label: "Crítica" };

  const sentCampaigns = campaigns ? campaigns.filter((c) => c.status === "sent").slice(0, 5) : [];

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat
          label="Enviados (30 dias)"
          value={overview.totalSent30d.toLocaleString("pt-BR")}
          hint={`${overview.campaignSent30d.toLocaleString("pt-BR")} campanha · ${overview.sequenceSent30d.toLocaleString("pt-BR")} sequência`}
        />
        <Stat label="Entregues" value={overview.delivered30d.toLocaleString("pt-BR")} hint={`${deliveryPct.toFixed(1)}% do enviado`} />
        <Stat label="Abertura" value={`${openPct.toFixed(1)}%`} hint={`${overview.openedUnique30d.toLocaleString("pt-BR")} pessoas`} />
        <Stat label="Clique" value={`${clickPct.toFixed(1)}%`} hint={`${overview.clickedUnique30d.toLocaleString("pt-BR")} pessoas`} />
        <Stat label="Bounces" value={overview.bounced30d.toLocaleString("pt-BR")} tone={bounceRate > 5 ? "danger" : bounceRate > 2 ? "warning" : "default"} />
        <Stat label="Descadastros" value={overview.unsubscribed30d.toLocaleString("pt-BR")} />
      </StatStrip>

      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              Entregabilidade <Badge variant={health.variant}>{health.label}</Badge>
            </span>
          }
          description="Últimos 30 dias. Entrega abaixo de 95% ou bounce acima de 2% pede limpeza da lista."
        />
        <dl className="grid grid-cols-2 sm:grid-cols-4 divide-slate-200 sm:divide-x">
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">Taxa de entrega</dt>
            <dd className={`mt-0.5 text-base font-semibold tabular-nums ${deliveryPct >= 95 ? "text-slate-900" : deliveryPct >= 90 ? "text-amber-700" : "text-red-700"}`}>
              {deliveryPct.toFixed(1)}%
            </dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">Taxa de bounce</dt>
            <dd className={`mt-0.5 text-base font-semibold tabular-nums ${bounceRate > 5 ? "text-red-700" : bounceRate > 2 ? "text-amber-700" : "text-slate-900"}`}>
              {bounceRate.toFixed(1)}%
            </dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">Reclamações de spam</dt>
            <dd className={`mt-0.5 text-base font-semibold tabular-nums ${overview.complained30d > 0 ? "text-amber-700" : "text-slate-900"}`}>
              {overview.complained30d}
            </dd>
          </div>
          <div className="px-4 py-3">
            <dt className="text-xs text-slate-500">Clique por abertura (CTOR)</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
              {(overview.clickToOpenRate * 100).toFixed(1)}%
            </dd>
          </div>
        </dl>
      </Panel>

      {sentCampaigns.length > 0 && (
        <Panel>
          <PanelHeader title="Campanhas enviadas recentes" />
          <ul className="divide-y divide-slate-200">
            {sentCampaigns.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="truncate text-sm text-slate-800">{c.name}</span>
                <Badge variant="success">Enviada</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
