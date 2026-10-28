// Telefone do contato: normalizado SÓ com dígitos e com DDI 55 (Brasil). É o campo que liga o
// contato a outros sistemas (ex.: o CRM Lembretes) e que identifica a mesma pessoa mesmo que o
// nome exibido mude.

/**
 * Normaliza para dígitos com DDI. Regras:
 * - "(84) 99999-0000", "84999990000" (10 ou 11 dígitos) → "5584999990000" (assume Brasil);
 * - "+55 84 99999-0000", "5584999990000" (12 ou 13 dígitos começando com 55) → mantém;
 * - "+1 415 555 0100" (com "+" e outro DDI) → mantém os dígitos;
 * - sem DDD (8 ou 9 dígitos), curto demais ou longo demais → null (não dá para identificar).
 */
export function normalizarTelefone(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpo = texto.replace(/[‎‏‪-‮]/g, '').trim();
  const comMais = limpo.startsWith('+');
  let d = limpo.replace(/\D/g, '');
  if (d.startsWith('00') && comMais === false && d.length > 12) d = d.slice(2); // 0055...
  if (d.length < 10 || d.length > 15) return null;
  if (comMais) return d;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length === 14 && !limpo.startsWith('00')) return null; // CNPJ sem '+' não é telefone
  if (limpo.startsWith('00') && d.length >= 11) return d;
  return null;
}

/**
 * Chave para comparar telefones: o WhatsApp mostra números antigos sem o "9" extra do celular
 * brasileiro (55 + DDD + 8 dígitos) e os novos com ele (55 + DDD + 9 + 8 dígitos). As duas formas
 * são a mesma linha: a chave descarta esse 9.
 */
export function chaveDoTelefone(telefone: string): string {
  const m = /^55(\d{2})9(\d{8})$/.exec(telefone);
  return m ? `55${m[1]}${m[2]}` : telefone;
}

export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizarTelefone(a);
  const y = normalizarTelefone(b);
  return x != null && y != null && chaveDoTelefone(x) === chaveDoTelefone(y);
}

/** O nome exibido é só um número (contato não salvo)? Devolve o telefone normalizado. */
export function telefoneDoNomeExibido(nome: string): string | null {
  const t = nome.replace(/[‎‏‪-‮]/g, '').trim();
  if (!/^[+\d\s().\-‒–]+$/.test(t)) return null;
  if ((t.match(/\d/g) ?? []).length < 8) return null;
  return normalizarTelefone(t);
}

/** Telefone a partir de um id do WhatsApp ("5584999990000@c.us", "true_5584..@c.us_ABC"). Só @c.us; @lid não é telefone. */
export function telefoneDoJid(id: string): string | null {
  const m = /(\d{10,15})@c\.us/.exec(id);
  return m ? m[1] : null; // o id do WhatsApp já traz o DDI: não presume Brasil
}
