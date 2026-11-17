// Agendamentos futuros do CRM para a "trava de agendamento" do Vita Zap (extensão do WhatsApp Web, 0.7.56).
//
// Regra do dono (17/11/2026): cliente com agendamento FUTURO pendente no CRM não entra em reativação, campanha nem
// cobrança automática; o agendamento prevalece. "Agendamento" = tarefa/lead com lembrete (reminderDate) no futuro,
// status 'pending' e lembrete ligado (nulo conta como ligado, igual a tasks.reminders). Depois que a data passa, ou a
// tarefa é concluída/cancelada, o cliente volta a ser elegível.
//
// Só leitura: nenhuma coluna nova, nenhuma escrita. `tasks.reminders` não serve para isto porque só olha 7 dias à frente.

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
