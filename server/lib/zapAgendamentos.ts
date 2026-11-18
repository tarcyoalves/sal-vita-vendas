// Agendamentos futuros do CRM para a "trava de agendamento" do Vita Zap (extensão do WhatsApp Web, 0.7.56).
//
// Regra do dono (17/11/2026): cliente com agendamento FUTURO pendente no CRM não entra em reativação, campanha nem
// cobrança automática; o agendamento prevalece. "Agendamento" = tarefa/lead com lembrete (reminderDate) no futuro,
// status 'pending' e lembrete ligado (nulo conta como ligado, igual a tasks.reminders). Depois que a data passa, ou a
// tarefa é concluída/cancelada, o cliente volta a ser elegível.
//
// A lista é só leitura e sem coluna nova (`tasks.reminders` não serve: só olha 7 dias à frente). Mais abaixo, o registro do
// resumo/agendamento da reativação (também sem coluna nova).

import { z } from 'zod';

export const LIMITE_AGENDAMENTOS = 5000;

export interface AgendamentoFuturo {
  taskId: number;
  titulo: string;
  /** Como está no CRM (a extensão normaliza). */
  telefone: string | null;
  venceEm: Date;
}

interface LinhaAgendamento {
  id: number;
  title: string;
  phone: string | null;
  reminderDate: Date | string | null;
}

/** Linha do banco → agendamento. Sem data válida ou já vencida → null (nunca bloqueia por dado ruim). */
export function paraAgendamento(l: LinhaAgendamento, agora: Date): AgendamentoFuturo | null {
  if (l.reminderDate == null) return null;
  const d = l.reminderDate instanceof Date ? l.reminderDate : new Date(l.reminderDate);
  if (Number.isNaN(d.getTime()) || d.getTime() <= agora.getTime()) return null;
  const tel = (l.phone ?? '').trim();
  return { taskId: l.id, titulo: l.title, telefone: tel === '' ? null : tel, venceEm: d };
}

// ── Registrar a reativação no CRM (resumo da última conversa + agendamento) ─────────────────────────────
// Por que um procedimento próprio em vez de tasks.update: tasks.update, ao mudar as notas, conta um CONTATO (contactCount + 1,
// lastContactedAt = agora) e dispara o alerta de rajada. O resumo da IA não é contato do atendente com o cliente; contá-lo
// distorceria "mais tempo sem contato" e as métricas de conversão. Aqui só as notas (e o lembrete) mudam.
export const MAX_NOTAS = 5000;
export const MAX_LINHA_REATIVACAO = 700;
/** Agendamento: pelo menos daqui a 1 hora e no máximo 400 dias (a IA sugere 7 a 120). */
export const AGENDAR_MIN_MS = 3_600_000;
export const AGENDAR_MAX_MS = 400 * 86_400_000;

export const registrarReativacaoInput = z.object({
  /** Vínculo que a extensão já conhece (confere a visibilidade no servidor). */
  taskId: z.number().int().positive().optional(),
  /** Telefone do contato (a extensão manda com DDI 55 ou sem). */
  telefone: z.string().trim().max(40).optional(),
  /** Nome do contato no WhatsApp: só para criar o lead quando não existe. */
  titulo: z.string().trim().min(1).max(200),
  /** Texto da nota, sem data (o servidor põe o carimbo). A extensão já tirou telefone/CPF. */
  linha: z.string().trim().min(1).max(MAX_LINHA_REATIVACAO),
  /** Agendamento (lembrete) novo. Ignorado se a tarefa já tem agendamento futuro: o existente prevalece. */
  agendarEm: z.date().nullish(),
  /** Cria o lead (tarefa) se não achar nenhum com o telefone. */
  criar: z.boolean(),
});
export type RegistrarReativacaoInput = z.infer<typeof registrarReativacaoInput>;

// Desfazer o agendamento que a IA criou (Vita Zap 0.7.59, tela "O que a IA fez"): só o lembrete, nada além.
export const desfazerAgendamentoInput = z.object({
  taskId: z.number().int().positive(),
  /** O instante EXATO que a IA gravou como lembrete. Só se o lembrete ainda for esse, ele é removido. */
  agendadoEm: z.date(),
});
export type DesfazerAgendamentoInput = z.infer<typeof desfazerAgendamentoInput>;

export interface TarefaParaRegistro {
  id: number;
  title: string;
  notes: string | null;
  reminderDate: Date | null;
  reminderEnabled: boolean | null;
  status: string;
}

/** "[17/11/2026 14:30] " no fuso de Brasília (igual ao de Fortaleza), o carimbo que o CRM usa nas notas. */
export function carimboDeNota(agora: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return `[${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}] `;
}

/**
 * Anexa a linha ao fim das notas. Passou do limite: saem do INÍCIO linhas inteiras (as mais antigas); a linha nova fica sempre.
 * Linha que já está nas notas (reenvio) não duplica: devolve as notas como estão.
 */
export function anexarLinha(notas: string | null | undefined, linha: string, max = MAX_NOTAS): string {
  const base = (notas ?? '').replace(/\s+$/, '');
  if (base.includes(linha)) return base;
  const nova = linha.length > max ? `${linha.slice(0, Math.max(0, max - 1)).trimEnd()}…` : linha;
  const linhas = base ? [...base.split('\n'), nova] : [nova];
  while (linhas.length > 1 && linhas.join('\n').length > max) linhas.shift();
  return linhas.join('\n');
}

export type MotivoSemAgenda = 'agendamento_existente' | 'tarefa_encerrada' | 'data_invalida';

export interface PlanoRegistro {
  notas: string;
  /** Data a gravar como lembrete (ligado). null = não mexer no lembrete. */
  agendar: Date | null;
  /** Pediu agendar e não foi possível: por quê. */
  semAgenda?: { motivo: MotivoSemAgenda; existente?: Date };
}

/** O agendamento futuro pendente que já existe na tarefa (o que a trava protege). */
export function agendamentoFuturoDa(t: Pick<TarefaParaRegistro, 'reminderDate' | 'reminderEnabled' | 'status'>, agora: Date): Date | null {
  if (t.status !== 'pending' || t.reminderEnabled === false || t.reminderDate == null) return null;
  return t.reminderDate.getTime() > agora.getTime() ? t.reminderDate : null;
}

/**
 * Decide o que gravar numa tarefa existente: sempre a nota; o agendamento só se não houver outro futuro (o que existe
 * PREVALECE), se a tarefa estiver pendente e se a data for razoável.
 */
export function planejarRegistro(t: TarefaParaRegistro, entrada: Pick<RegistrarReativacaoInput, 'linha' | 'agendarEm'>, agora: Date): PlanoRegistro {
  const notas = anexarLinha(t.notes, `${carimboDeNota(agora)}${entrada.linha}`);
  const quando = entrada.agendarEm ?? null;
  if (quando == null) return { notas, agendar: null };
  const existente = agendamentoFuturoDa(t, agora);
  if (existente) return { notas, agendar: null, semAgenda: { motivo: 'agendamento_existente', existente } };
  if (t.status !== 'pending') return { notas, agendar: null, semAgenda: { motivo: 'tarefa_encerrada' } };
  const ms = quando.getTime();
  if (!Number.isFinite(ms) || ms < agora.getTime() + AGENDAR_MIN_MS || ms > agora.getTime() + AGENDAR_MAX_MS) return { notas, agendar: null, semAgenda: { motivo: 'data_invalida' } };
  return { notas, agendar: quando };
}
