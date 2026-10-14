// Traduz erros do servidor da loja para mensagens curtas em português.
// O tRPC (sem errorFormatter) devolve erro de validação do Zod como JSON no campo `message`,
// e os limitadores do Express devolvem `{ error: "texto" }` com HTTP 429. Nenhum dos dois pode
// chegar cru ao cliente.

export const RATE_LIMIT_MSG = 'Muitas tentativas em pouco tempo. Aguarde alguns minutos ou chame no WhatsApp.';
export const GENERIC_VALIDATION_MSG = 'Confira os dados informados e tente novamente.';

export type ApiErrorKind = 'rate_limit' | 'validation' | 'message' | 'unknown';
export interface ParsedApiError {
  kind: ApiErrorKind;
  /** Mensagem pronta para mostrar (uma frase curta). Vazia quando `unknown`: o chamador usa o seu texto. */
  message: string;
  /** Mensagem por campo (chaves do servidor: customerEmail, number, ...). */
  fields: Record<string, string>;
  /** Primeiro campo com erro, para levar o foco. */
  firstField?: string;
}

const FIELD_LABEL: Record<string, string> = {
  customerName: 'o nome',
  customerPhone: 'o telefone',
  customerEmail: 'o e-mail',
  customerCpf: 'o CPF',
  postalCode: 'o CEP',
  cep: 'o CEP',
  address: 'a rua',
  number: 'o número',
  complement: 'o complemento',
  neighborhood: 'o bairro',
  city: 'a cidade',
  state: 'o estado',
  couponCode: 'o cupom',
};

type Issue = { code?: string; path?: unknown[]; message?: string; validation?: string; format?: string; minimum?: number; maximum?: number };

function issueMessage(field: string, i: Issue): string {
  const label = FIELD_LABEL[field] ?? 'este campo';
  const isEmail = i.validation === 'email' || i.format === 'email' || /invalid email/i.test(i.message ?? '');
  if (isEmail) return 'Informe um e-mail válido, como nome@exemplo.com.';
  if (i.code === 'too_small') return i.minimum === 1 || i.minimum === 0 ? `Preencha ${label}.` : `Confira ${label}: está curto demais.`;
  if (i.code === 'too_big') return `Confira ${label}: está longo demais.`;
  if (i.code === 'invalid_enum_value' || i.code === 'invalid_literal') return `Escolha ${label} da lista.`;
  return `Confira ${label}.`;
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith('[') || t.startsWith('{');
}

/** `status` = HTTP status da resposta (0 se desconhecido); `data` = corpo já convertido de JSON. */
export function parseApiError(status: number, data: unknown): ParsedApiError {
  const err = (data as { error?: unknown } | null | undefined)?.error;

  // 1) Limitador do Express: 429 com { error: "texto" } (ou qualquer 429).
  if (status === 429) return { kind: 'rate_limit', message: RATE_LIMIT_MSG, fields: {} };
  if (typeof err === 'string') {
    return /muitas|tentativas|aguarde|limite/i.test(err)
      ? { kind: 'rate_limit', message: RATE_LIMIT_MSG, fields: {} }
      : { kind: 'unknown', message: '', fields: {} };
  }

  // 2) Envelope do tRPC: error.json.message / error.message.
  const env = err as { json?: { message?: unknown; data?: { code?: string; httpStatus?: number } }; message?: unknown } | undefined;
  if (env?.json?.data?.code === 'TOO_MANY_REQUESTS' || env?.json?.data?.httpStatus === 429) {
    return { kind: 'rate_limit', message: RATE_LIMIT_MSG, fields: {} };
  }
  const raw = env?.json?.message ?? env?.message;
  if (typeof raw !== 'string' || !raw.trim()) return { kind: 'unknown', message: '', fields: {} };

  if (looksLikeJson(raw)) {
    let issues: Issue[] = [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) issues = parsed as Issue[];
    } catch { /* JSON quebrado: cai na mensagem genérica */ }
    const fields: Record<string, string> = {};
    for (const i of issues) {
      const f = typeof i?.path?.[0] === 'string' ? (i.path[0] as string) : '';
      if (f && !fields[f]) fields[f] = issueMessage(f, i);
    }
    const firstField = Object.keys(fields)[0];
    return {
      kind: 'validation',
      message: firstField ? fields[firstField] : GENERIC_VALIDATION_MSG,
      fields,
      firstField,
    };
  }

  // 3) Mensagem em texto puro escrita pelo servidor (ex.: "Este pedido já foi pago").
  return { kind: 'message', message: raw.trim().slice(0, 240), fields: {} };
}
