import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/** E-mail como é gravado ao criar usuário: sem espaços e em minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Comparação sem diferenciar maiúsculas. Dados antigos podem ter maiúsculas, por isso
 * o lado do banco também passa por lower() (não reescrevemos os dados existentes).
 */
export function emailEquals(column: AnyColumn, email: string): SQL {
  return sql`lower(${column}) = ${normalizeEmail(email)}`;
}
