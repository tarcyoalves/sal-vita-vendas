import { safeEqual } from './safeEqual';

export type WebhookSecretVia = 'header' | 'query';

type HeaderBag = Record<string, string | string[] | undefined>;
type QueryBag = Record<string, unknown>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Confere o segredo de um webhook. Ordem de preferência:
 *   1. `Authorization: Bearer <segredo>` ou `X-Webhook-Secret: <segredo>` (não vai para log de acesso);
 *   2. `?secret=<segredo>` na URL — FALLBACK TEMPORÁRIO. Segredo em querystring aparece no log de
 *      requisições da Vercel, em proxies e no histórico do painel do provedor. Existe só para não
 *      quebrar o webhook já cadastrado no painel; remova (ou defina WEBHOOK_ALLOW_QUERY_SECRET=0)
 *      depois de migrar o painel para o cabeçalho.
 * A comparação é em tempo constante (safeEqual). Nunca devolve nem registra o valor recebido.
 */
export function checkWebhookSecret(
  expected: string,
  headers: HeaderBag,
  query: QueryBag,
  env: Record<string, string | undefined> = process.env,
): { ok: boolean; via: WebhookSecretVia | null } {
  if (!expected) return { ok: false, via: null };

  const bearer = /^Bearer\s+(.+)$/i.exec((first(headers['authorization']) ?? '').trim())?.[1];
  const custom = first(headers['x-webhook-secret']);
  for (const candidate of [bearer, custom]) {
    if (typeof candidate === 'string' && candidate !== '' && safeEqual(candidate, expected)) {
      return { ok: true, via: 'header' };
    }
  }

  if (env.WEBHOOK_ALLOW_QUERY_SECRET !== '0') {
    const q = query['secret'];
    if (typeof q === 'string' && q !== '' && safeEqual(q, expected)) {
      return { ok: true, via: 'query' };
    }
  }
  return { ok: false, via: null };
}
