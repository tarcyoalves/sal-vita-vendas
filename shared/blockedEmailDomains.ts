// Domínios de e-mail bloqueados no CRM/Premium (pedido do dono). Um e-mail desses:
//  - nunca é enviado (resend.ts, marketing.ts, marketingQuota.ts);
//  - nunca entra em público de campanha nem em contatos de marketing;
//  - é apagado do banco a cada build de produção (scripts/purge-blocked-emails.ts).
// Vale também para subdomínios (a@mail.dominio.com.br). Para bloquear outro domínio, acrescente
// aqui; nada mais precisa mudar.

export const BLOCKED_EMAIL_DOMAINS: readonly string[] = ['gruposmabrasil.com.br'];

/** Endereços exatos a semear nas listas de supressão por e-mail (rede de segurança). */
export const BLOCKED_EMAIL_ADDRESSES: readonly string[] = ['salves@gruposmabrasil.com.br'];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Regex (mesma sintaxe em JavaScript e PostgreSQL `~*`) que casa "@domínio-bloqueado" ou um
 * subdomínio dele dentro do texto, sem casar "x@gruposmabrasil.com.br.outro.com".
 * Funciona também com "Nome <a@dominio>" e com vários e-mails no mesmo campo.
 */
export function blockedEmailPattern(domains: readonly string[] = BLOCKED_EMAIL_DOMAINS): string {
  const alt = domains.map((d) => escapeRegex(d.trim().toLowerCase())).filter(Boolean).join('|');
  return `@([a-z0-9-]+\\.)*(?:${alt})([^a-z0-9.-]|$)`;
}

const BLOCKED_RE = new RegExp(blockedEmailPattern(), 'i');

/** true se o texto contém um e-mail de domínio bloqueado. Nulo/vazio nunca é bloqueado. */
export function isBlockedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return BLOCKED_RE.test(email.trim());
}
