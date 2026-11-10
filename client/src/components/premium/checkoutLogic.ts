// Regras puras do checkout da loja Premium (testáveis sem navegador).

// ── Carrinho abandonado (F-01) ─────────────────────────────────────────────────────────────
// Só conta como "carrinho" depois que o cliente abriu o passo de dados (passo 2) E mexeu num
// campo do formulário NESTA visita. Dados restaurados do aparelho nunca disparam sozinhos.
export interface CartTrackInput {
  alreadyTracked: boolean;
  checkoutOpen: boolean;
  touchedThisVisit: boolean;
  customerName: string;
  customerPhone: string;
}
export function shouldTrackCart(i: CartTrackInput): boolean {
  if (i.alreadyTracked || !i.checkoutOpen || !i.touchedThisVisit) return false;
  return i.customerName.trim().length >= 3 && i.customerPhone.replace(/\D/g, '').length >= 11;
}

// ── Dados salvos no aparelho (F-09) ────────────────────────────────────────────────────────
export const SAVED_CUSTOMER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** `savedAt` válido e dentro de 30 dias. Entradas sem data, futuras ou antigas expiram. */
export function isSavedCustomerFresh(savedAt: unknown, now: number = Date.now()): boolean {
  if (typeof savedAt !== 'number') return false;
  const age = now - savedAt;
  return age >= 0 && age <= SAVED_CUSTOMER_TTL_MS;
}

// ── Validação antes de enviar (F-02) ───────────────────────────────────────────────────────
// Nome >= 2 caracteres, e-mail válido, número até 20 (o servidor usa a mesma regra).
export function isValidEmail(v: string): boolean {
  const t = v.trim();
  return t.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(t);
}

export interface CheckoutFields {
  customerName: string; customerEmail: string; number: string; address: string;
  neighborhood: string; city: string; state: string;
}
export function validateCheckoutFields(f: CheckoutFields): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.customerName.trim().replace(/\s+/g, ' ').length < 2) e.customerName = 'Informe seu nome completo.';
  if (!isValidEmail(f.customerEmail)) e.customerEmail = 'Informe um e-mail válido, como nome@exemplo.com.';
  if (!f.address.trim()) e.address = 'Informe a rua ou avenida.';
  if (!f.number.trim()) e.number = 'Informe o número. Se não houver, escreva S/N.';
  else if (f.number.trim().length > 20) e.number = 'O número está longo demais (até 20 caracteres).';
  if (f.neighborhood.trim().length < 2) e.neighborhood = 'Informe o bairro.';
  if (f.city.trim().length < 2) e.city = 'Informe a cidade.';
  if (!f.state) e.state = 'Escolha o estado.';
  return e;
}

// ── Campo Número (F-07) ────────────────────────────────────────────────────────────────────
/** Aceita "123", "12A", "S/N", "Km 5". Remove só o que não é texto de endereço. */
export function cleanAddressNumber(v: string): string {
  return v.replace(/[^\p{L}\p{N}\s/.\-º°]/gu, '').slice(0, 20);
}

// ── Transportadoras (F-14) ─────────────────────────────────────────────────────────────────
// Espelha ALLOWED_CARRIERS de server/lib/shippingFilter.ts (Correios, Jadlog, Azul Cargo, J&T).
export const CARRIERS_TEXT = 'Correios, Jadlog, Azul Cargo ou J&T, conforme o CEP';

// ── Nome, telefone e e-mail no formulário (lote 3) ─────────────────────────────────────────
// validateCheckoutFields continua aceitando nome curto (o servidor também); o formulário
// exige nome e sobrenome com customerNameError, aplicado no envio e na tela.
/** Nome com pelo menos duas palavras. null = ok. */
export function customerNameError(name: string): string | null {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 ? null : 'Informe nome e sobrenome.';
}

/** Telefone/WhatsApp: 10 ou 11 dígitos, DDD entre 11 e 99, celular de 11 dígitos com 9 após o DDD. */
export function phoneProblem(v: string): string | null {
  const d = v.replace(/\D/g, '');
  const msg = 'Informe DDD + número de celular válido.';
  if (d.length !== 10 && d.length !== 11) return msg;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return msg;
  if (d.length === 11 && d[2] !== '9') return msg;
  return null;
}

/** Domínios digitados errado com mais frequência. Só sugere; nunca bloqueia. */
const EMAIL_DOMAIN_FIXES: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'icloud.co': 'icloud.com',
};

/** E-mail válido com domínio típico de erro de digitação → endereço corrigido; senão null. */
export function emailTypoSuggestion(v: string): string | null {
  const t = v.trim();
  if (!isValidEmail(t)) return null;
  const at = t.lastIndexOf('@');
  const fix = EMAIL_DOMAIN_FIXES[t.slice(at + 1).toLowerCase()];
  return fix ? `${t.slice(0, at)}@${fix}` : null;
}
