// Hash curto e ESTÁVEL de um texto (cyrb53, duas sementes): 28 caracteres hexadecimais. Síncrono e sem dependência
// (vale no painel, no service worker e nos testes). NÃO é criptografia: serve para identificar um nome ou um texto sem
// mandá-lo ao servidor (a chave do contato no CRM) e para contar o resultado de cada texto do dono.

function cyrb53(texto: string, semente: number): number {
  let h1 = 0xdeadbeef ^ semente;
  let h2 = 0x41c6ce57 ^ semente;
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto.codePointAt(i) ?? 0;
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function hashTexto(texto: string): string {
  return cyrb53(texto, 0).toString(16).padStart(14, '0') + cyrb53(texto, 0x9e3779b9).toString(16).padStart(14, '0');
}
