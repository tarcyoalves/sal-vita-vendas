import { useState, type ReactNode } from 'react';
import {
  MapPin,
  Star,
  Globe,
  Instagram,
  Facebook,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  Phone,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import {
  RADAR_ENRICH_TTL_DAYS,
  type RadarEnrichment,
  type RadarEnrichSource,
} from '../../../../shared/radar';

// Rótulo exibido para cada fonte de onde um dado foi raspado — usado tanto
// aqui (seção "Da web") quanto em CreateTaskDialog (lista de telefones).
export const RADAR_ENRICH_SOURCE_LABELS: Record<RadarEnrichSource, string> = {
  busca: 'buscador',
  site: 'site',
  maps: 'Google Maps',
  social: 'Instagram/Facebook',
};

// true enquanto o robô da VPS ainda não terminou (ou nem começou) este CNPJ.
// `null` conta como "precisa" porque a busca acabou de enfileirar o
// enriquecimento e ainda não veio nenhum status.
// null = nunca foi pedido (a busca só enfileira as mais próximas) — não há o que
// esperar; tratar como pendente deixaria a tela consultando até o limite de tempo.
export function enrichmentNeedsPolling(enrichment: RadarEnrichment | null): boolean {
  if (!enrichment) return false;
  return enrichment.status === 'pendente' || enrichment.status === 'processando';
}

// Resultado "pronto" com mais de RADAR_ENRICH_TTL_DAYS — a tela oferece
// varrer de novo mesmo sem o atendente perceber que venceu.
export function isEnrichmentExpired(enrichment: RadarEnrichment | null): boolean {
  if (!enrichment || enrichment.status !== 'pronto' || !enrichment.updatedAt) return false;
  const ageMs = Date.now() - new Date(enrichment.updatedAt).getTime();
  return ageMs > RADAR_ENRICH_TTL_DAYS * 24 * 60 * 60 * 1000;
}

// Números vindos do enriquecedor chegam em dígitos (DDD + número, sem "55") —
// mesmo formato da base da Receita. Fora desse formato, mostra como veio.
export function formatFoundDigits(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `atualizado em ${dd}/${mm}`;
}

function CategoryHintBadge({ categoria }: { categoria: string | null }) {
  if (!categoria) return null;
  const low = categoria.toLowerCase();
  if (low.includes('pet')) {
    return (
      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50">
        Maps: pet shop
      </Badge>
    );
  }
  if (low.includes('agropecu') || low.includes('ração') || low.includes('racao')) {
    return (
      <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700 bg-emerald-50">
        Maps: agropecuária
      </Badge>
    );
  }
  return null;
}

function ExternalLinkRow({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline min-w-0 max-w-[47%]"
    >
      {icon}
      <span className="shrink-0">{label}:</span>
      <span className="truncate">{hostnameOf(href)}</span>
    </a>
  );
}

/**
 * "Da web" — dados raspados pelo robô da VPS (Fase 2). `enrichment` é o
 * estado atual (mesclado a partir do polling em RadarCargas). `onScanNow`
 * chama enrichNow com o `force` indicado; o card cuida do toast de erro.
 */
export function EnrichmentSection({
  enrichment,
  onScanNow,
  scanning,
  discarded = false,
}: {
  enrichment: RadarEnrichment | null;
  onScanNow: (force: boolean) => void;
  scanning: boolean;
  // Empresa descartada: nunca entra na fila do robô (nem antes nem depois do
  // descarte). Sem botão de varrer, sem esqueleto de "processando" — só o
  // que já tiver sido achado antes, ou nada.
  discarded?: boolean;
}) {
  const [fontesOpen, setFontesOpen] = useState(false);

  const status = enrichment?.status ?? null;
  const expired = isEnrichmentExpired(enrichment);
  // Ícone de varrer fica visível quando não há nada em andamento: nunca
  // pedido, já pronto (inclusive vencido) ou falhou mostra seu próprio botão
  // "Tentar de novo" abaixo, para não duplicar a ação.
  const showTopButton = !discarded && (status === null || status === 'pronto');

  if (discarded && !(status === 'pronto' && enrichment?.data)) return null;

  let content: ReactNode;

  if (status === 'pendente' || status === 'processando') {
    content = (
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <p className="text-[11px] text-slate-400">Procurando no Google Maps, site e redes…</p>
      </div>
    );
  } else if (status === 'falhou') {
    content = (
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-400">Não foi possível buscar agora</p>
        <Button type="button" variant="outline" size="sm" disabled={scanning} onClick={() => onScanNow(true)}>
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Tentar de novo
        </Button>
      </div>
    );
  } else if (status === 'pronto' && enrichment?.data) {
    const data = enrichment.data;
    const situacaoFechada = !!data.maps?.situacao && /fechado permanentemente/i.test(data.maps.situacao);
    content = (
      <div className="space-y-2 min-w-0">
        <CategoryHintBadge categoria={data.maps?.categoria ?? null} />

        {data.maps && (
          <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 shrink-0">
              <MapPin size={12} className="text-slate-400" />
              {data.maps.categoria ?? 'Google Maps'}
            </span>
            {data.maps.nota != null && (
              <span className="inline-flex items-center gap-0.5 shrink-0">
                <Star size={11} className="text-amber-500 fill-amber-500" />
                {data.maps.nota.toFixed(1)}
                {data.maps.avaliacoes != null ? ` (${data.maps.avaliacoes})` : ''}
              </span>
            )}
            {data.maps.situacao && (
              <span className={situacaoFechada ? 'text-red-600 font-semibold shrink-0' : 'text-slate-500 shrink-0'}>
                {data.maps.situacao}
              </span>
            )}
          </p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {data.website && <ExternalLinkRow href={data.website} label="Site" icon={<Globe size={11} />} />}
          {data.maps?.url && <ExternalLinkRow href={data.maps.url} label="Maps" icon={<MapPin size={11} />} />}
          {data.instagram && <ExternalLinkRow href={data.instagram} label="Instagram" icon={<Instagram size={11} />} />}
          {data.facebook && <ExternalLinkRow href={data.facebook} label="Facebook" icon={<Facebook size={11} />} />}
        </div>

        {data.whatsapps.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.whatsapps.map((w, i) => (
              <Badge
                key={`wa-${w.value}-${i}`}
                className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] font-medium whitespace-normal break-words max-w-full h-auto text-left"
              >
                {formatFoundDigits(w.value)} · WhatsApp (achado em {RADAR_ENRICH_SOURCE_LABELS[w.source]})
              </Badge>
            ))}
          </div>
        )}

        {(data.telefones.length > 0 || data.emails.length > 0) && (
          <div className="space-y-0.5">
            {data.telefones.map((t, i) => (
              <p key={`tel-${i}`} className="text-xs text-slate-600 flex items-center gap-1">
                <Phone size={11} className="text-slate-400 shrink-0" />
                {formatFoundDigits(t.value)}
                <span className="text-[10px] text-slate-400">({RADAR_ENRICH_SOURCE_LABELS[t.source]})</span>
              </p>
            ))}
            {data.emails.map((e, i) => (
              <p key={`email-${i}`} className="text-xs text-slate-600 flex items-center gap-1 min-w-0">
                <Mail size={11} className="text-slate-400 shrink-0" />
                <span className="truncate">{e.value}</span>
                <span className="text-[10px] text-slate-400 shrink-0">({RADAR_ENRICH_SOURCE_LABELS[e.source]})</span>
              </p>
            ))}
          </div>
        )}

        {data.fontes.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setFontesOpen((o) => !o)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
            >
              {fontesOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Fontes
            </button>
            {fontesOpen && (
              <ul className="mt-1 space-y-0.5 pl-3">
                {data.fontes.map((f) => (
                  <li key={f.source} className="text-[11px] text-slate-500">
                    {RADAR_ENRICH_SOURCE_LABELS[f.source]}: {f.ok ? 'ok' : f.note ?? 'falhou'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {enrichment.updatedAt && <p className="text-[10px] text-slate-400">{formatUpdatedAt(enrichment.updatedAt)}</p>}
      </div>
    );
  } else {
    content = <p className="text-xs text-slate-400 italic">Ainda não buscado na web.</p>;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Da web</p>
        {showTopButton && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            disabled={scanning}
            title={expired ? 'Dados vencidos — varrer de novo' : 'Varrer agora'}
            onClick={() => onScanNow(true)}
          >
            {scanning ? (
              <Loader2 size={13} className="animate-spin text-slate-500" />
            ) : (
              <RefreshCw size={13} className="text-slate-500" />
            )}
          </Button>
        )}
      </div>
      {expired && !discarded && (
        <p className="text-[10px] text-amber-600">
          Dados de mais de {RADAR_ENRICH_TTL_DAYS} dias — considere varrer de novo.
        </p>
      )}
      {content}
    </div>
  );
}
