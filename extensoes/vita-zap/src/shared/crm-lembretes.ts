// Agenda de lembretes de follow-up (lógica pura). O lembrete NÃO envia nada: na hora marcada
// aparece um aviso; ao clicar, a conversa abre e o rascunho (se houver) é colado na caixa.

import { dataValida, diferencaDias, hojeNoFuso, montarDataIso, partesNoFuso, somarDias } from './datas';
import type { Lembrete } from './crm-tipos';

/** Fortaleza não tem horário de verão: UTC-3 o ano todo. */
const DESLOCAMENTO_FUSO_H = 3;

/** Instante (epoch ms) de uma data/hora de calendário no fuso de Fortaleza. */
export function instanteNoFuso(iso: string, hora: number, minuto = 0): number {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d, hora + DESLOCAMENTO_FUSO_H, minuto);
}

export type PrazoRapido = 'amanha9h' | '3dias' | '1semana' | '30dias' | '45dias' | '60dias';

export const PRAZOS_RAPIDOS: ReadonlyArray<{ id: PrazoRapido; rotulo: string }> = [
  { id: 'amanha9h', rotulo: 'Amanhã 9h' },
  { id: '3dias', rotulo: 'Em 3 dias' },
  { id: '1semana', rotulo: 'Em 1 semana' },
  { id: '30dias', rotulo: 'Em 30 dias' },
  { id: '45dias', rotulo: 'Em 45 dias' },
  { id: '60dias', rotulo: 'Em 60 dias' },
];

/** Os prazos rápidos caem sempre às 9h (de Fortaleza) do dia escolhido. */
/** "atualizado há 12 min" (para o botão Atualizar do CRM). `em` = instante da última busca bem-sucedida. */
export function textoAtualizadoHa(em: number | null, agora: number): string {
  if (em == null) return 'ainda não atualizado';
  const min = Math.max(0, Math.floor((agora - em) / 60_000));
  if (min < 1) return 'atualizado agora há pouco';
  if (min < 120) return `atualizado há ${min} min`;
  return `atualizado há ${Math.floor(min / 60)} h`;
}

export function prazoRapido(id: PrazoRapido, agora: Date): number {
  const dias = id === 'amanha9h' ? 1 : id === '3dias' ? 3 : id === '1semana' ? 7 : id === '30dias' ? 30 : id === '45dias' ? 45 : 60;
  return instanteNoFuso(somarDias(hojeNoFuso(agora), dias), 9, 0);
}

/** "2026-10-22T14:30" (input datetime-local) → instante, no fuso de Fortaleza. Inválido → null. */
export function lerDataHoraLocal(texto: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const [a, me, d, h, min] = m.slice(1).map(Number);
  if (!dataValida(a, me, d) || h > 23 || min > 59) return null;
  return instanteNoFuso(montarDataIso(a, me, d), h, min);
}

export type ResultadoLembrete = { ok: true; lembrete: Lembrete } | { ok: false; erro: string };

export function criarLembrete(
  entrada: { contatoId: string; nome: string; telefone?: string; venceEm: number | null; rascunho?: string },
  agora: Date,
  id: string,
): ResultadoLembrete {
  if (entrada.venceEm == null || !Number.isFinite(entrada.venceEm)) return { ok: false, erro: 'Escolha a data e a hora.' };
  if (entrada.venceEm <= agora.getTime()) return { ok: false, erro: 'Esse horário já passou. Escolha uma data futura.' };
  const rascunho = entrada.rascunho?.trim();
  return {
    ok: true,
    lembrete: {
      id,
      contatoId: entrada.contatoId,
      nome: entrada.nome,
      ...(entrada.telefone ? { telefone: entrada.telefone } : {}),
      venceEm: entrada.venceEm,
      criadoEm: agora.getTime(),
      status: 'pendente',
      ...(rascunho ? { rascunho } : {}),
    },
  };
}

export type Situacao = 'vencido' | 'hoje' | 'proximo';

export function situacaoDoLembrete(l: Lembrete, agora: Date): Situacao {
  if (l.venceEm <= agora.getTime()) return 'vencido';
  const dias = diferencaDias(hojeNoFuso(new Date(l.venceEm)), hojeNoFuso(agora));
  return dias <= 0 ? 'hoje' : 'proximo';
}

export interface AgrupamentoLembretes {
  vencidos: Lembrete[];
  hoje: Lembrete[];
  proximos: Lembrete[];
}

/** Central de lembretes: ignora os concluídos; cada grupo em ordem de vencimento. */
export function agruparLembretes(lista: Lembrete[], agora: Date): AgrupamentoLembretes {
  const r: AgrupamentoLembretes = { vencidos: [], hoje: [], proximos: [] };
  for (const l of [...lista].sort((a, b) => a.venceEm - b.venceEm)) {
    if (l.status === 'concluido') continue;
    const s = situacaoDoLembrete(l, agora);
    if (s === 'vencido') r.vencidos.push(l);
    else if (s === 'hoje') r.hoje.push(l);
    else r.proximos.push(l);
  }
  return r;
}

/** Número do selo do ícone da extensão. */
export function contarVencidos(lista: Lembrete[], agora: Date): number {
  return lista.filter((l) => l.status !== 'concluido' && l.venceEm <= agora.getTime()).length;
}

/** Lembretes que ainda não foram avisados e já venceram (o alarme dispara por eles). */
export function lembretesParaAvisar(lista: Lembrete[], agora: Date): Lembrete[] {
  return lista.filter((l) => l.status === 'pendente' && l.venceEm <= agora.getTime());
}

export interface AlarmeAgendado {
  nome: string;
  quando: number;
}

export const PREFIXO_ALARME = 'vz:';

/** Alarmes que o service worker precisa ter agora: um por lembrete pendente (os atrasados disparam já). */
export function agendaDeAlarmes(lista: Lembrete[], agora: Date): AlarmeAgendado[] {
  return lista
    .filter((l) => l.status === 'pendente')
    .map((l) => ({ nome: `${PREFIXO_ALARME}${l.id}`, quando: Math.max(l.venceEm, agora.getTime() + 2000) }));
}

export function idDoAlarme(nome: string): string | null {
  return nome.startsWith(PREFIXO_ALARME) ? nome.slice(PREFIXO_ALARME.length) : null;
}

/** Adia: volta a "pendente" no novo horário (ainda exige que seja no futuro). */
export function adiarLembrete(l: Lembrete, venceEm: number, agora: Date): Lembrete {
  const { disparadoEm: _descartado, ...resto } = l;
  void _descartado;
  return { ...resto, venceEm: Math.max(venceEm, agora.getTime() + 60_000), status: 'pendente' };
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** "hoje 14:30", "amanhã 09:00", "sex 24/10 09:00" — sempre no fuso de Fortaleza. */
export function formatarVencimento(venceEm: number, agora: Date): string {
  const p = partesNoFuso(new Date(venceEm));
  const hora = `${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`;
  const dias = diferencaDias(hojeNoFuso(new Date(venceEm)), hojeNoFuso(agora));
  if (dias === 0) return `hoje ${hora}`;
  if (dias === 1) return `amanhã ${hora}`;
  if (dias === -1) return `ontem ${hora}`;
  return `${SEMANA[p.diaSemana]} ${doisDigitos(p.dia)}/${doisDigitos(p.mes)} ${hora}`;
}

/** Valor para o input datetime-local ("2026-10-22T09:00") no fuso de Fortaleza. */
export function paraInputDataHora(instante: number): string {
  const p = partesNoFuso(new Date(instante));
  return `${montarDataIso(p.ano, p.mes, p.dia)}T${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}`;
}
