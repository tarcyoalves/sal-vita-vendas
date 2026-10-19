// Nomes de contato: normalização, chave, "só número" e primeiro nome para o texto.

/** Sem acento, minúsculo, espaços colapsados. Usado em comparação e filtro. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Chave do contato. A lista do WhatsApp não mostra o telefone de contato salvo, então a
 * identidade local é o nome salvo. Dois chats com o mesmo nome são marcados como duplicados
 * (dedup.ts) e vão para "revisar": não dá para saber qual abrir.
 */
export function chaveContato(nome: string): string {
  return normalizarTexto(nome);
}

/** Contato não salvo aparece na lista só como número ("+55 84 99999-0000"). */
export function pareceSoNumero(nome: string): boolean {
  const t = nome.replace(/[‎‏‪-‮]/g, '').trim();
  if (!/^[+\d\s().\-‒–]+$/.test(t)) return false;
  return (t.match(/\d/g) ?? []).length >= 8;
}

const TRATAMENTOS = new Set(['sr', 'sra', 'srta', 'seu', 'dona', 'dr', 'dra', 'd']);

function capitalizar(palavra: string): string {
  const temMinuscula = palavra !== palavra.toUpperCase();
  if (temMinuscula) return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}

/**
 * Primeiro nome para {primeiroNome}. Ignora os termos do filtro ("CLIENTE"), tratamentos
 * ("Sr.", "Dona"), números e emojis. "CLIENTE - JOÃO SILVA" → "João".
 * Devolve '' quando não acha um nome — a prévia obriga a preencher à mão.
 */
export function primeiroNome(nome: string, termosIgnorar: string[] = []): string {
  const ignorar = new Set(termosIgnorar.map(normalizarTexto).filter(Boolean));
  const tokens = nome.split(/[\s\-–—|/,;:()[\]{}_*~"'+•·]+/);
  for (const bruto of tokens) {
    const palavra = bruto.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (palavra.length < 2) continue;
    if (!/^[\p{L}.]+$/u.test(palavra)) continue;
    const norm = normalizarTexto(palavra).replace(/\.$/, '');
    if (ignorar.has(norm)) continue;
    if ([...ignorar].some((t) => t.length >= 3 && norm.startsWith(t))) continue; // "CLIENTES", "Cliente."
    if (TRATAMENTOS.has(norm)) continue;
    return capitalizar(palavra.replace(/\.$/, ''));
  }
  return '';
}

/** Lista "CLIENTE, ATACADO" → ['CLIENTE', 'ATACADO']. */
export function separarTermos(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
