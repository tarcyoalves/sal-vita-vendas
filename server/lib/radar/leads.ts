// Radar de Cargas — funções puras (telefone, montagem de lead, título/descrição/
// notas da tarefa). Nada aqui faz I/O (banco ou rede) — isso fica em
// prospectingRadar.ts, que é quem chama estas funções e as testa por integração.
// Contrato de tipos: shared/radar.ts. Visão geral: PLANO-RADAR-CARGAS.md.
import {
  RADAR_SEGMENTS,
  formatCnpj,
  segmentsForCnaes,
  type RadarCrmStatus,
  type RadarLead,
  type RadarMunicipality,
  type RadarPhone,
  type RadarSegmentKey,
} from '../../../shared/radar';
import type { RadarEstablishment } from '../../db/schema';
import { spDateStr } from '../tz';

// Heurística honesta (ver shared/radar.ts): celular brasileiro tem 9 dígitos
// locais e começa com 9. NÃO prova que o número tem WhatsApp.
export function isLikelyMobile(digits: string): boolean {
  return digits.length === 11 && digits[2] === '9';
}

// "(49) 3544-1234" (fixo, 10 dígitos) ou "(49) 99123-4567" (celular, 11 dígitos).
// Fora desse formato (dado sujo da base da Receita), devolve só os dígitos.
export function formatPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

// null quando o valor não tem 10 nem 11 dígitos (lixo/typo da base importada) —
// preferível a mostrar um telefone claramente errado no CRM.
export function toRadarPhone(raw: string): RadarPhone | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 10 && digits.length !== 11) return null;
  return { digits, formatted: formatPhoneDigits(digits), likelyMobile: isLikelyMobile(digits) };
}

// Telefones válidos do estabelecimento (telefone1 primeiro), sem duplicar.
export function establishmentPhones(row: Pick<RadarEstablishment, 'telefone1' | 'telefone2'>): RadarPhone[] {
  const out: RadarPhone[] = [];
  const seen = new Set<string>();
  for (const raw of [row.telefone1, row.telefone2]) {
    if (!raw) continue;
    const phone = toRadarPhone(raw);
    if (phone && !seen.has(phone.digits)) {
      seen.add(phone.digits);
      out.push(phone);
    }
  }
  return out;
}

// Telefone a usar na conversão em tarefa (regra da Fase 1, `convert`): o que o
// atendente digitou na tela > primeiro "provável celular" > telefone1.
export function pickTaskPhone(phones: RadarPhone[], overrideDigits?: string): string | undefined {
  if (overrideDigits) return overrideDigits.replace(/\D/g, '');
  const mobile = phones.find((p) => p.likelyMobile);
  if (mobile) return mobile.digits;
  return phones[0]?.digits;
}

// Rótulos (não chaves) dos segmentos casados pelos CNAEs-alvo do estabelecimento
// — usado no rascunho de mensagem (draftMessage), que precisa de texto legível.
export function segmentLabelsForCnaes(cnaesAlvo: readonly string[]): string[] {
  const keys = new Set<RadarSegmentKey>(segmentsForCnaes(cnaesAlvo));
  return RADAR_SEGMENTS.filter((s) => keys.has(s.key)).map((s) => s.label);
}

export function buildLead(
  row: RadarEstablishment,
  municipio: RadarMunicipality,
  distanceKm: number,
  matchedByPrincipal: boolean,
  phones: RadarPhone[],
  crm: RadarCrmStatus,
  emailSuppressed: boolean,
): RadarLead {
  return {
    cnpj: row.cnpj,
    razaoSocial: row.razaoSocial,
    nomeFantasia: row.nomeFantasia,
    cnaePrincipal: row.cnaePrincipal,
    segments: segmentsForCnaes(row.cnaesAlvo),
    matchedByPrincipal,
    municipio,
    distanceKm: Math.round(distanceKm),
    endereco: row.endereco,
    cep: row.cep,
    phones,
    email: row.email,
    emailSuppressed,
    porte: row.porte,
    dataInicio: row.dataInicio,
    crm,
    enrichment: null,
  };
}

// "NOME DA EMPRESA - CIDADE - UF" — formato que
// client/src/lib/tasks/location.ts lê de volta para os filtros de cidade/UF.
export function taskTitle(companyName: string, municipioNome: string, uf: string): string {
  return `${companyName} - ${municipioNome} - ${uf}`;
}

// "CIDADE - UF" — mesmo formato, fonte preferida de extractLocation().
export function taskDescription(municipioNome: string, uf: string): string {
  return `${municipioNome} - ${uf}`;
}

function brDate(isoYmd: string): string {
  const [y, m, d] = isoYmd.split('-');
  return `${d}/${m}/${y}`;
}

export interface TaskNotesInput {
  originLabel: string; // "Barracão - PR"
  bags: number;
  cnpj: string;
  razaoSocial: string;
  endereco: string | null;
  sourceRelease: string;
  message?: string;
  now?: Date;
}

// Notas em texto puro (português) gravadas em tasks.notes na conversão.
// Data sempre em horário de São Paulo (server/lib/tz.ts) — nunca o fuso do
// processo Node, que na Vercel roda em UTC.
export function buildTaskNotes(input: TaskNotesInput): string {
  const date = brDate(spDateStr(input.now ?? new Date()));
  const lines = [
    `Radar de Cargas — completar carga de ${input.originLabel} (${input.bags} sacos de 25 kg)`,
    date,
    '',
    `CNPJ: ${formatCnpj(input.cnpj)}`,
    `Razão social: ${input.razaoSocial}`,
    `Endereço: ${input.endereco || 'não informado'}`,
    `Base Receita: ${input.sourceRelease}`,
  ];
  if (input.message) {
    lines.push('', 'Mensagem sugerida:', input.message);
  }
  return lines.join('\n');
}
