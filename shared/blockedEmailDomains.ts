// Domínios de e-mail bloqueados no CRM/Premium (pedido do dono). Um e-mail desses:
//  - nunca é enviado (resend.ts, marketing.ts, marketingQuota.ts);
//  - nunca entra em público de campanha nem em contatos de marketing;
//  - é apagado do banco a cada build de produção (scripts/purge-blocked-emails.ts).
// Vale também para subdomínios (a@mail.dominio.com.br). Para bloquear outro domínio, acrescente
// aqui; nada mais precisa mudar.

export const BLOCKED_EMAIL_DOMAINS: readonly string[] = [
  'gruposmabrasil.com.br',
  // Empresas de sal, bloqueadas a pedido do dono em 29/09/2026. NÃO entram: agrosal.com.br e
  // fortsal.com.br (o dono mandou manter).
  'salmaranata.com.br',
  'salina.com.br',
  'finosal.com.br',
  'sal.com',
  'salminas.com.br',
  'grupososal.com.br',
];

/** Endereços exatos a semear nas listas de supressão por e-mail (rede de segurança). */
export const BLOCKED_EMAIL_ADDRESSES: readonly string[] = [
  'salves@gruposmabrasil.com.br',
  'salsalinasrn@gmail.com',
];

/**
 * Palavras que bloqueiam o endereço INTEIRO quando aparecem em qualquer parte dele (nome ou
 * domínio): pedido do dono para tudo que "tenha a aparência" de salsalinasrn@gmail.com — ex.:
 * salinas.rn@outlook.com, contato@salinasdorn.com.br. Cuidado: quem tem "salinas" no sobrenome
 * também cai aqui.
 */
export const BLOCKED_EMAIL_KEYWORDS: readonly string[] = ['salinas'];

/**
 * Domínios que NUNCA são bloqueados, mesmo casando com uma regra acima. A Sal Vita é uma empresa
 * de sal: sem esta proteção, regras contra "empresas de sal" derrubariam os e-mails da própria casa.
 */
export const PROTECTED_EMAIL_DOMAINS: readonly string[] = ['salvitarn.com.br'];

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Regex (mesma sintaxe em JavaScript e PostgreSQL `~*`) que casa "@domínio-bloqueado" ou um
 * subdomínio dele dentro do texto, sem casar "x@gruposmabrasil.com.br.outro.com".
 * Funciona também com "Nome <a@dominio>" e com vários e-mails no mesmo campo.
 */
export function blockedEmailPattern(
  domains: readonly string[] = BLOCKED_EMAIL_DOMAINS,
  keywords: readonly string[] = BLOCKED_EMAIL_KEYWORDS,
): string {
  const alt = domains.map((d) => escapeRegex(d.trim().toLowerCase())).filter(Boolean).join('|');
  const kw = keywords.map((k) => escapeRegex(k.trim().toLowerCase())).filter(Boolean).join('|');
  const domainPart = alt ? `@([a-z0-9-]+\\.)*(?:${alt})([^a-z0-9.-]|$)` : '';
  return [domainPart, kw].filter(Boolean).join('|');
}

/** Mesma sintaxe (JS e PostgreSQL): casa "@dominio-protegido" e subdomínios. */
export function protectedEmailPattern(domains: readonly string[] = PROTECTED_EMAIL_DOMAINS): string {
  const alt = domains.map((d) => escapeRegex(d.trim().toLowerCase())).filter(Boolean).join('|');
  return `@([a-z0-9-]+\\.)*(?:${alt})([^a-z0-9.-]|$)`;
}

const BLOCKED_RE = new RegExp(blockedEmailPattern(), 'i');
const PROTECTED_RE = new RegExp(protectedEmailPattern(), 'i');

/**
 * true se o texto contém e-mail de domínio bloqueado ou com palavra bloqueada. Domínio protegido
 * (o da própria Sal Vita) nunca é bloqueado. Nulo/vazio nunca é bloqueado.
 */
export function isBlockedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim();
  return BLOCKED_RE.test(e) && !PROTECTED_RE.test(e);
}
