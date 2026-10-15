// Helpers para logs sem dado pessoal. O repositório é público e os logs da Vercel são lidos
// por mais gente do que o banco: e-mail, telefone, CPF/CNPJ, segredos e parâmetros de SQL
// não podem aparecer neles. Mantém o log útil (ids, contagens, códigos), sem o dado em si.

/** `joao.silva@gmail.com` → `j***@gmail.com`. Sem `@`, devolve `***`. */
export function maskEmail(email: unknown): string {
  const s = String(email ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return '***';
  return `${s[0]}***${s.slice(at)}`;
}

/** `(84) 99999-1234` → `***1234` (só os 4 últimos dígitos). Mesmo formato do maskPhone do WhatsApp. */
export function maskPhone(phone: unknown): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits ? `***${digits.slice(-4)}` : '***';
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CNPJ_RE = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
// Telefone com formatação: +55 84 99999-1234, (84) 99999-1234, 84 99999-1234, 99999-1234.
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2}\)\s?|\b\d{2}[\s.-])?\b\d{4,5}-\d{4}\b/g;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const SECRET_PAIR_RE = /\b(secret|token|key|api[_-]?key|apikey|password|senha|authorization|cookie|signature|sig)(["']?\s*[=:]\s*["']?)[^\s&"',;]+/gi;
const PROVIDER_KEY_RE = /\b(?:sk|re|xkeysib|gsk|csk|nvapi|pk|APP_USR|TEST)[-_][A-Za-z0-9_-]{16,}/g;

/**
 * Remove de um texto livre (corpo de erro de provedor, mensagem de exceção) o que é dado
 * pessoal ou segredo. Não mexe em números soltos (ids de pedido/pagamento ficam).
 * Limita o tamanho para uma resposta HTML gigante não encher o log.
 */
export function redact(text: unknown, maxLen = 300): string {
  let s = typeof text === 'string' ? text : text == null ? '' : String(text);
  s = s
    .replace(JWT_RE, '[jwt]')
    .replace(BEARER_RE, '$1 [redacted]')
    .replace(PROVIDER_KEY_RE, '[key]')
    .replace(SECRET_PAIR_RE, '$1$2[redacted]')
    .replace(EMAIL_RE, (m) => maskEmail(m))
    .replace(CNPJ_RE, '**.***.***/****-**')
    .replace(CPF_RE, '***.***.***-**')
    .replace(PHONE_RE, (m) => maskPhone(m));
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

const SEM_PARAMS = /\s*params:[\s\S]*$/i;

/**
 * Descrição segura de uma exceção para `console.error`. Imprimir o objeto inteiro de um erro
 * do Drizzle/Neon despeja o SQL **com os parâmetros** (e-mail, telefone, nome do cliente) e a
 * pilha. Aqui ficam só: nome, código, status e a mensagem sem a parte `params:`, já redigida.
 */
export function safeErr(err: unknown): string {
  if (err == null) return 'erro desconhecido';
  if (typeof err !== 'object') return redact(err);
  const e = err as { name?: unknown; code?: unknown; status?: unknown; message?: unknown; cause?: unknown };
  const parts: string[] = [];
  if (typeof e.name === 'string' && e.name !== 'Error') parts.push(e.name);
  if (e.code != null) parts.push(`code=${redact(e.code, 40)}`);
  if (e.status != null) parts.push(`status=${redact(e.status, 10)}`);
  const msg = typeof e.message === 'string' ? e.message.replace(SEM_PARAMS, '') : '';
  if (msg) parts.push(redact(msg));
  const cause = e.cause as { code?: unknown; message?: unknown } | null | undefined;
  if (cause && typeof cause === 'object') {
    if (cause.code != null) parts.push(`causa.code=${redact(cause.code, 40)}`);
    if (typeof cause.message === 'string') parts.push(`causa=${redact(cause.message.replace(SEM_PARAMS, ''), 160)}`);
  }
  return parts.join(' ') || 'erro desconhecido';
}
