// Radar de Cargas — escolha de telefone para contato (WhatsApp/ligar/tarefa).
// Compartilhado entre LeadCard (botões de contato) e CreateTaskDialog (rádio
// de telefone ao transformar em tarefa) para não duplicar a ordenação.
import { RADAR_ENRICH_SOURCE_LABELS, formatFoundDigits } from './EnrichmentSection';
import { RADAR_TELEFONE_COMPARTILHADO_MIN, type RadarEnrichment, type RadarLead } from '../../../../shared/radar';

export interface PhoneOption {
  digits: string;
  formatted: string;
  isWhatsapp: boolean;
  likelyMobile: boolean;
  sourceLabel: string | null;
  // Quantas empresas da base usam este número (undefined = desconhecido).
  compartilhadoPor?: number;
  // true = número repetido em muitas empresas, provável escritório de contabilidade.
  compartilhado: boolean;
}

export function isTelefoneCompartilhado(compartilhadoPor: number | undefined): boolean {
  return typeof compartilhadoPor === 'number' && compartilhadoPor >= RADAR_TELEFONE_COMPARTILHADO_MIN;
}

/** Aviso curto ao lado do número; null quando o número não é compartilhado (ou é desconhecido). */
export function sharedPhoneLabel(opt: Pick<PhoneOption, 'compartilhado' | 'compartilhadoPor'>): string | null {
  if (!opt.compartilhado || opt.compartilhadoPor === undefined) return null;
  return `provável contabilidade · usado por ${opt.compartilhadoPor} empresas`;
}

// Dígitos vindos do enriquecedor (achados em wa.me) já são DDD + número, mas
// alguns links de WhatsApp trazem o "55" na frente — normaliza para o mesmo
// formato usado pela base da Receita (10-11 dígitos, sem DDI) e o que
// `convert`/`markContacted` esperam.
export function normalizePhoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}

// WhatsApps achados na web primeiro, depois telefones da Receita — deduplicado
// por dígitos, sem repetir um telefone que já apareceu como WhatsApp.
export function buildPhoneOptions(lead: RadarLead, enrichment: RadarEnrichment | null): PhoneOption[] {
  const seen = new Set<string>();
  const options: PhoneOption[] = [];

  const whatsapps = enrichment?.status === 'pronto' ? enrichment.data?.whatsapps ?? [] : [];
  for (const w of whatsapps) {
    const digits = normalizePhoneDigits(w.value);
    if (digits.length !== 10 && digits.length !== 11) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    options.push({
      digits,
      formatted: formatFoundDigits(digits),
      isWhatsapp: true,
      likelyMobile: digits.length === 11,
      sourceLabel: RADAR_ENRICH_SOURCE_LABELS[w.source],
      compartilhado: false,
    });
  }
  for (const p of lead.phones) {
    if (seen.has(p.digits)) continue;
    seen.add(p.digits);
    options.push({
      digits: p.digits,
      formatted: p.formatted,
      isWhatsapp: false,
      likelyMobile: p.likelyMobile,
      sourceLabel: null,
      compartilhadoPor: p.compartilhadoPor,
      compartilhado: isTelefoneCompartilhado(p.compartilhadoPor),
    });
  }
  // Números compartilhados (contabilidade) vão para o fim; sort é estável, então a
  // ordem WhatsApp > Receita é preservada dentro de cada grupo.
  return options.sort((a, b) => Number(a.compartilhado) - Number(b.compartilhado));
}

// Padrão de seleção: WhatsApp achado na web > celular não compartilhado >
// fixo não compartilhado > qualquer número compartilhado (contabilidade).
export function defaultPhoneDigits(options: PhoneOption[]): string | null {
  const whatsapp = options.find((o) => o.isWhatsapp);
  if (whatsapp) return whatsapp.digits;
  const mobile = options.find((o) => o.likelyMobile && !o.compartilhado);
  if (mobile) return mobile.digits;
  const fixo = options.find((o) => !o.compartilhado);
  if (fixo) return fixo.digits;
  const shared = options.find((o) => o.likelyMobile) ?? options[0];
  return shared?.digits ?? null;
}
