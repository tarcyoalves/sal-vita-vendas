// Datas no fuso de Fortaleza e parser do rótulo de data da lista de conversas do WhatsApp Web.
//
// Regra de ouro: em dúvida, o resultado é "revisar" — o contato nunca entra direto na campanha
// por uma data que não conseguimos ler com certeza.

import { FUSO } from './constantes';

/** Data de calendário 'AAAA-MM-DD' (sem hora, no fuso de Fortaleza). */
export type DataIso = string;

export type ResultadoData =
  | { tipo: 'ok'; data: DataIso }
  | { tipo: 'revisar'; motivo: string };

export interface PartesNoFuso {
  ano: number;
  mes: number; // 1-12
  dia: number;
  hora: number; // 0-23
  minuto: number;
  diaSemana: number; // 0 = domingo
}

const formatador = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const DIAS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function partesNoFuso(agora: Date): PartesNoFuso {
  const p: Record<string, string> = {};
  for (const parte of formatador.formatToParts(agora)) p[parte.type] = parte.value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: DIAS_EN.indexOf(p.weekday ?? ''),
  };
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

export function montarDataIso(ano: number, mes: number, dia: number): DataIso {
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

export function hojeNoFuso(agora: Date): DataIso {
  const p = partesNoFuso(agora);
  return montarDataIso(p.ano, p.mes, p.dia);
}

function paraUtc(iso: DataIso): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function somarDias(iso: DataIso, dias: number): DataIso {
  const d = paraUtc(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return montarDataIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** a - b, em dias de calendário. */
export function diferencaDias(a: DataIso, b: DataIso): number {
  return Math.round((paraUtc(a).getTime() - paraUtc(b).getTime()) / 86_400_000);
}

export function dataValida(ano: number, mes: number, dia: number): boolean {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return false;
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' (para mostrar). */
export function formatarDataBr(iso: DataIso | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Aceita 'AAAA-MM-DD' (input type=date) e devolve null se inválida. */
export function lerDataIso(texto: string | null | undefined): DataIso | null {
  if (!texto) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const [a, me, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return dataValida(a, me, d) ? montarDataIso(a, me, d) : null;
}

function normalizar(rotulo: string): string {
  return rotulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‎‏‪-‮]/g, '') // marcas de direção que o WhatsApp insere
    .replace(/\s+/g, ' ')
    .replace(/[.,]$/, '')
    .trim();
}

// Dia da semana por extenso/abreviado (pt-BR) e em inglês, sem acento.
const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, dom: 0, sunday: 0, sun: 0,
  'segunda-feira': 1, segunda: 1, seg: 1, monday: 1, mon: 1,
  'terca-feira': 2, terca: 2, ter: 2, tuesday: 2, tue: 2,
  'quarta-feira': 3, quarta: 3, qua: 3, wednesday: 3, wed: 3,
  'quinta-feira': 4, quinta: 4, qui: 4, thursday: 4, thu: 4,
  'sexta-feira': 5, sexta: 5, sex: 5, friday: 5, fri: 5,
  sabado: 6, sab: 6, saturday: 6, sat: 6,
};

/**
 * Converte o rótulo de data que o WhatsApp Web mostra na lista de conversas.
 *
 * Formatos aceitos (WhatsApp em português):
 * - hora ("14:32", "9:05", "2:05 PM") → hoje
 * - "hoje" → hoje; "ontem" → ontem
 * - dia da semana ("segunda-feira", "sáb.") → o último daquele dia entre 2 e 6 dias atrás
 *   (é a janela em que o WhatsApp usa dia da semana; fora dela é ambíguo → revisar)
 * - "17/09/2026", "17/09/26" → a própria data (no futuro → revisar)
 * - "17/09" (sem ano) → a data mais recente não futura (virada de ano)
 *
 * Datas são dia/mês. Se o segundo número passar de 12, o WhatsApp está em outro formato
 * (mês/dia) → revisar.
 */
export function interpretarRotuloData(rotulo: string | null | undefined, agora: Date): ResultadoData {
  if (rotulo == null || rotulo.trim() === '') return { tipo: 'revisar', motivo: 'sem data na lista' };
  let t = normalizar(rotulo);
  const hoje = hojeNoFuso(agora);

  // Se tiver data + hora (ex.: "10/09/2026, 14:30", "10/09/2026 às 14:30", "ontem às 14:30"), extrai o prefixo da data
  const comHora = /^(.+?)(?:,|\s+as|\s+at|\s+de)?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?$/i.exec(t);
  if (comHora && comHora[1].trim() && !/^\d{1,2}$/.test(comHora[1].trim())) {
    t = comHora[1].trim();
  }

  // Hora: 14:32 | 9:05 | 2:05 pm | 2:05 p. m.
  const hora = /^(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?$/.exec(t);
  if (hora) {
    const h = Number(hora[1]);
    const min = Number(hora[2]);
    const ampm = hora[3];
    const horaOk = ampm ? h >= 1 && h <= 12 : h <= 23;
    if (!horaOk || min > 59) return { tipo: 'revisar', motivo: `hora inválida: "${rotulo}"` };
    return { tipo: 'ok', data: hoje };
  }

  if (t === 'hoje' || t === 'today') return { tipo: 'ok', data: hoje };
  if (t === 'ontem' || t === 'yesterday') return { tipo: 'ok', data: somarDias(hoje, -1) };

  const semPonto = t.replace(/\.$/, '');
  if (semPonto in DIAS_SEMANA) {
    const alvo = DIAS_SEMANA[semPonto];
    const atual = partesNoFuso(agora).diaSemana;
    const atras = (atual - alvo + 7) % 7;
    if (atras < 2) {
      // 0 = hoje (o WhatsApp mostraria a hora) ou 7 dias atrás; 1 = ontem (mostraria "Ontem").
      return { tipo: 'revisar', motivo: `dia da semana ambíguo: "${rotulo}"` };
    }
    return { tipo: 'ok', data: somarDias(hoje, -atras) };
  }

  const completa = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  if (completa) {
    const dia = Number(completa[1]);
    const mes = Number(completa[2]);
    let ano = Number(completa[3]);
    if (completa[3].length === 2) ano += 2000;
    if (mes > 12) return { tipo: 'revisar', motivo: `data fora do formato dia/mês: "${rotulo}"` };
    if (!dataValida(ano, mes, dia)) return { tipo: 'revisar', motivo: `data inválida: "${rotulo}"` };
    const iso = montarDataIso(ano, mes, dia);
    if (diferencaDias(iso, hoje) > 0) return { tipo: 'revisar', motivo: `data no futuro: "${rotulo}"` };
    return { tipo: 'ok', data: iso };
  }

  const semAno = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (semAno) {
    const dia = Number(semAno[1]);
    const mes = Number(semAno[2]);
    if (mes > 12) return { tipo: 'revisar', motivo: `data fora do formato dia/mês: "${rotulo}"` };
    const anoAtual = partesNoFuso(agora).ano;
    for (const ano of [anoAtual, anoAtual - 1]) {
      if (!dataValida(ano, mes, dia)) continue;
      const iso = montarDataIso(ano, mes, dia);
      if (diferencaDias(iso, hoje) <= 0) return { tipo: 'ok', data: iso };
    }
    return { tipo: 'revisar', motivo: `data inválida: "${rotulo}"` };
  }

  return { tipo: 'revisar', motivo: `formato de data desconhecido: "${rotulo}"` };
}

/** Verdadeiro se o texto tem cara de rótulo de data/hora da lista (usado para achar o rótulo na linha). */
export function pareceRotuloData(texto: string): boolean {
  let t = normalizar(texto);
  if (t === '') return false;
  const comHora = /^(.+?)(?:,|\s+as|\s+at|\s+de)?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?$/i.exec(t);
  if (comHora && comHora[1].trim() && !/^\d{1,2}$/.test(comHora[1].trim())) {
    t = comHora[1].trim();
  }
  if (/^\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?$/.test(t)) return true;
  if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(t)) return true;
  if (['hoje', 'today', 'ontem', 'yesterday'].includes(t)) return true;
  return t.replace(/\.$/, '') in DIAS_SEMANA;
}
