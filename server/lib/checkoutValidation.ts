// Validação do checkout no servidor (o navegador pode ser contornado). Funções puras.

/** Dígitos verificadores do CPF (mesmo algoritmo da loja, client/src/pages/SalVitaLanding.tsx). */
export function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i);
  let r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i);
  r = (sum * 10) % 11; if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10], 10);
}

/** Número nacional (DDD + número, 10 ou 11 dígitos) ou null se inválido. Aceita máscara e prefixo 55. */
export function nationalPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== '9') return null;
  return d;
}

export function isValidPhoneBr(raw: string): boolean {
  return nationalPhone(raw) !== null;
}

export function isValidFullName(name: string): boolean {
  return name.trim().split(/\s+/).filter((w) => w.length >= 1).length >= 2;
}

export function isValidEmail(email: string): boolean {
  const e = email.trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e);
}

/** Primeira mensagem de erro (em português) do checkout, ou null se tudo certo. */
export function checkoutError(i: { customerName: string; customerPhone: string; customerEmail?: string | null; customerCpf?: string | null }): string | null {
  if (!isValidFullName(i.customerName)) return 'Informe seu nome completo (nome e sobrenome).';
  if (!isValidPhoneBr(i.customerPhone)) return 'Telefone inválido. Informe DDD + número (ex.: (84) 99999-9999).';
  if (!i.customerEmail || !isValidEmail(i.customerEmail)) return 'Informe um e-mail válido: é por ele que enviamos os avisos do seu pedido.';
  if (i.customerCpf && !isValidCpf(i.customerCpf)) return 'CPF inválido — confira os números.';
  return null;
}
