// Sessão do admin da loja Premium. Não usa banco: a credencial vem de variáveis de ambiente
// (PREMIUM_ADMIN_EMAIL e PREMIUM_ADMIN_PASSWORD_HASH) e o cookie é um JWT próprio.
//
// Isolamento entre CRM e loja:
//  - cookie com nome diferente do CRM (PREMIUM_COOKIE_NAME);
//  - JWT com `aud: 'premium'` e SEM `id` numérico: o createContext do CRM exige `id` numérico
//    (token da loja nunca vira ctx.user) e verifyPremiumToken exige `aud` (token do CRM,
//    que não tem aud, nunca vale na loja);
//  - o token carrega `pv` (impressão digital do e-mail + hash atuais): trocar a senha ou o
//    e-mail nas variáveis de ambiente derruba as sessões antigas.
import jwt from 'jsonwebtoken';
import { passwordVersion } from './sessionToken';
import { safeEqual } from './safeEqual';

export const PREMIUM_AUDIENCE = 'premium';
const MAX_AGE_S = 7 * 24 * 60 * 60;

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is required');
  return s;
}

export interface PremiumConfig { email: string; passwordHash: string }

/** null = login da loja não configurado (qualquer das duas variáveis ausente ou em branco). */
export function getPremiumConfig(): PremiumConfig | null {
  const email = (process.env.PREMIUM_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const passwordHash = (process.env.PREMIUM_ADMIN_PASSWORD_HASH ?? '').trim();
  if (!email || !passwordHash) return null;
  return { email, passwordHash };
}

function versionOf(cfg: PremiumConfig): string {
  return passwordVersion(secret(), `${cfg.email}|${cfg.passwordHash}`);
}

export function signPremiumToken(cfg: PremiumConfig): string {
  return jwt.sign(
    { email: cfg.email, pv: versionOf(cfg) },
    secret(),
    { algorithm: 'HS256', expiresIn: MAX_AGE_S, audience: PREMIUM_AUDIENCE },
  );
}

/** Valida o cookie da loja sem tocar em banco. null = inválido, de outra audiência ou revogado. */
export function verifyPremiumToken(token: string | undefined): { email: string } | null {
  if (!token) return null;
  const cfg = getPremiumConfig();
  if (!cfg) return null;
  try {
    const p = jwt.verify(token, secret(), { algorithms: ['HS256'], audience: PREMIUM_AUDIENCE });
    if (!p || typeof p !== 'object' || typeof p.email !== 'string' || typeof p.pv !== 'string') return null;
    if ('id' in p) return null; // token da loja nunca carrega id de usuário do CRM
    if (!safeEqual(p.email, cfg.email) || !safeEqual(p.pv, versionOf(cfg))) return null;
    return { email: cfg.email };
  } catch {
    return null;
  }
}

export function premiumCookieHeader(name: string, token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(token)}; HttpOnly${secure}; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax`;
}

export function clearPremiumCookieHeader(name: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=; HttpOnly${secure}; Path=/; Max-Age=0; SameSite=Lax`;
}

const PREMIUM_PREFIXES = ['premiumauth.', 'shipping.', 'recovery.', 'b2b.', 'premiumemailmarketing.'];

/**
 * true quando TODAS as procedures da requisição pertencem à loja. Nesses casos, havendo sessão
 * da loja válida, o createContext nem tenta carregar o usuário do CRM (banco do CRM fora do ar
 * não pode atrasar a loja). `url` é a URL da requisição, ex.: /api/trpc/shipping.listOrders?batch=1.
 */
export function isPremiumOnlyRequest(url: string | undefined): boolean {
  if (!url) return false;
  const m = /\/api\/trpc\/([^?#]*)/.exec(url);
  const raw = m ? m[1] : url.split('?')[0].replace(/^\/+/, '');
  const names = raw.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return names.length > 0 && names.every(n => PREMIUM_PREFIXES.some(pre => n.startsWith(pre)));
}
