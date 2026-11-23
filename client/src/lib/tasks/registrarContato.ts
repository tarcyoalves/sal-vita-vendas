/**
 * "Registrar contato" em um toque: acrescenta uma linha com data/hora ao FIM das anotações e reagenda o lembrete.
 * Mesmo formato que a extensão Vita Zap grava (extensoes/vita-zap/src/shared/crm-remoto.ts): "[21/10/2026 14:30] texto".
 * Nunca substitui nem corta anotações: se a linha nova não couber no limite do servidor (5000), não grava.
 */
export const LIMITE_NOTAS = 5000;
export const FUSO = 'America/Sao_Paulo';

export type AtalhoContato = '30min' | 'amanha9h' | '3d' | '7d';

export const ATALHOS_CONTATO: ReadonlyArray<{ id: AtalhoContato; rotulo: string }> = [
  { id: '30min', rotulo: '+30 min' },
  { id: 'amanha9h', rotulo: 'Amanhã 9h' },
  { id: '3d', rotulo: '+3 dias' },
  { id: '7d', rotulo: '+7 dias' },
];

const dois = (n: number) => String(n).padStart(2, '0');

function partesSP(d: Date) {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { dia: g('day'), mes: g('month'), ano: g('year'), hora: g('hour'), minuto: g('minute') };
}

/** 'AAAA-MM-DD' no fuso de São Paulo. */
export function diaSP(d: Date): string {
  const p = partesSP(d);
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/** Quando o lembrete passa a valer depois do atalho. Brasil não tem horário de verão: offset fixo -03:00. */
export function proximoLembrete(atalho: AtalhoContato, agora: Date): Date {
  const MIN = 60_000;
  const DIA = 86_400_000;
  switch (atalho) {
    case '30min': return new Date(agora.getTime() + 30 * MIN);
    case '3d': return new Date(agora.getTime() + 3 * DIA);
    case '7d': return new Date(agora.getTime() + 7 * DIA);
    case 'amanha9h': {
      // Meio-dia de hoje (SP) + 24 h cai sempre no dia seguinte de calendário.
      const amanha = diaSP(new Date(new Date(`${diaSP(agora)}T12:00:00-03:00`).getTime() + DIA));
      return new Date(`${amanha}T09:00:00-03:00`);
    }
  }
}

/** "[21/10/2026 14:30] texto", uma linha só. Sem texto, registra "Contato feito." */
export function linhaDeContato(texto: string, agora: Date): string {
  const p = partesSP(agora);
  const corpo = texto.replace(/\s+/g, ' ').trim() || 'Contato feito.';
  return `[${p.dia}/${p.mes}/${p.ano} ${p.hora}:${p.minuto}] ${corpo}`;
}

export type ResultadoNota = { ok: true; notes: string; linha: string } | { ok: false; motivo: 'cheia' };

export function anexarNotaContato(notasAtuais: string | null | undefined, texto: string, agora: Date, max = LIMITE_NOTAS): ResultadoNota {
  const linha = linhaDeContato(texto, agora);
  const base = (notasAtuais ?? '').replace(/\s+$/, '');
  const notes = base ? `${base}\n${linha}` : linha;
  if (notes.length > max) return { ok: false, motivo: 'cheia' };
  return { ok: true, notes, linha };
}

/** "24/11 09:00" no fuso de São Paulo, para o aviso de sucesso. */
export function rotuloLembrete(d: Date): string {
  const p = partesSP(d);
  return `${p.dia}/${p.mes} ${p.hora}:${p.minuto}`;
}
