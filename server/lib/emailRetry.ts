// Erro do provedor que vale tentar de novo: 429 (limite) e 5xx. Formatos de sendBatch:
// `resend_429`, `brevo_503`. 'network_error' continua tratado à parte (pode ter saído).
export function isRetryableProviderError(error: string | undefined | null): boolean {
  return /^(resend|brevo)_(429|5\d\d)(\D|$)/.test(error ?? '');
}

// Marcador gravado em `error` quando o destinatário volta a 'pending' (não há coluna de tentativas):
// quem já carrega o marcador não ganha uma segunda chance.
const RETRY_MARK = 'retry:';
export const retryMarker = (error: string) => `${RETRY_MARK}${error}`;
export const jaTentouDeNovo = (error: string | null | undefined) => (error ?? '').startsWith(RETRY_MARK);
