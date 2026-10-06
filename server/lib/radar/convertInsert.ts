import { sql, type SQL } from 'drizzle-orm';

export interface RadarTaskInsert {
  userId: number;
  title: string;
  description: string | null;
  notes: string;
  email: string | null;
  tag: string;
  reminderDate: Date;
  lastContactedAt: Date | null;
  contactCount: number;
  assignedTo: string | null;
  cnpj: string;
  phone: string | null;
  /** Telefones (só dígitos) que, se já estiverem numa tarefa, caracterizam duplicidade. */
  dedupePhones: string[];
}

// Colunas `timestamp` sem fuso: o Drizzle grava o instante em UTC (toISOString). Aqui o
// mesmo valor vai como texto ISO + cast, para ficar idêntico ao que o query builder faria.
const ts = (d: Date | null) => (d ? sql`${d.toISOString()}::timestamp` : sql`NULL::timestamp`);

/**
 * INSERT condicional e atômico da tarefa do Radar: só insere se NÃO existir tarefa com o
 * mesmo CNPJ (ou, quando houver, com algum dos telefones normalizados). Não há índice único
 * em tasks.cnpj/phone, então o select-depois-insert deixava dois atendentes criarem o mesmo
 * lead. `RETURNING id` vazio = já existia (perdeu a corrida).
 */
export function conditionalRadarTaskInsert(v: RadarTaskInsert): SQL {
  const phoneCond = v.dedupePhones.length > 0
    ? sql` OR phone IN (${sql.join(v.dedupePhones.map((p) => sql`${p}`), sql`, `)})`
    : sql``;
  return sql`
    INSERT INTO tasks (user_id, client_id, title, description, notes, email, tags, reminder_date,
      last_contacted_at, contact_count, reminder_enabled, priority, status, assigned_to, cnpj, phone, email_confirmed)
    SELECT ${v.userId}::integer, 0, ${v.title}::text, ${v.description}::text, ${v.notes}::text, ${v.email}::text,
      ARRAY[${v.tag}]::text[], ${ts(v.reminderDate)}, ${ts(v.lastContactedAt)}, ${v.contactCount}::integer,
      TRUE, 'high', 'pending', ${v.assignedTo}::text, ${v.cnpj}::text, ${v.phone}::text, FALSE
    WHERE NOT EXISTS (
      SELECT 1 FROM tasks WHERE cnpj = ${v.cnpj}${phoneCond}
    )
    RETURNING id`;
}
