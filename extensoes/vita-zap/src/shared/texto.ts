// Texto da campanha: validação (sem link na 1ª mensagem), {primeiroNome} e sorteio de variação.

import { MARCADOR_PRIMEIRO_NOME, MAX_VARIACOES, TAMANHO_MAX_TEXTO } from './constantes';

// Link explícito, wa.me, encurtadores e "algo.com/.br/..." soltos no texto.
const PADRAO_LINK =
  /(https?:\/\/|www\.|wa\.me\/|\b[\p{L}0-9-]+\.(?:com|net|org|br|io|me|app|ly|link|info|biz|shop|store|site|online|xyz|gl|co|tv)(?:\.[a-z]{2})?\b)/iu;

export function contemLink(texto: string): boolean {
  return PADRAO_LINK.test(texto);
}

export function validarModelo(texto: string): string[] {
  const erros: string[] = [];
  const t = texto.trim();
  if (t === '') {
    erros.push('texto vazio');
    return erros;
  }
  // Versão 0.2: sem quebra de linha. O editor do WhatsApp trata Enter/parágrafo de um jeito
  // que não dá para colar com segurança (e Enter é o gatilho do envio) — só texto corrido.
  if (/[\r\n\u2028\u2029]/.test(t)) {
    erros.push('quebra de linha não é suportada nesta versão (0.2) — escreva o texto em uma linha só, com frases corridas');
  }
  if (contemLink(t)) erros.push('a primeira mensagem não pode ter link (regra da política)');
  if (t.length > TAMANHO_MAX_TEXTO) erros.push(`texto longo demais (${t.length}/${TAMANHO_MAX_TEXTO} caracteres)`);
  const marcadores = t.match(/\{[^}]*\}/g) ?? [];
  for (const m of marcadores) {
    if (m !== MARCADOR_PRIMEIRO_NOME) erros.push(`marcador desconhecido ${m} (use só ${MARCADOR_PRIMEIRO_NOME})`);
  }
  return erros;
}

/** Texto base + variações (vazias descartadas). Erros por posição. */
export function validarModelos(base: string, variacoes: string[]): { modelos: string[]; erros: string[] } {
  const extras = variacoes.map((v) => v.trim()).filter(Boolean);
  const erros: string[] = [];
  if (extras.length > MAX_VARIACOES) erros.push(`no máximo ${MAX_VARIACOES} variações`);
  const modelos = [base.trim(), ...extras.slice(0, MAX_VARIACOES)];
  modelos.forEach((m, i) => {
    for (const e of validarModelo(m)) erros.push(`${i === 0 ? 'Texto base' : `Variação ${i}`}: ${e}`);
  });
  return { modelos, erros };
}

export function usaPrimeiroNome(modelo: string): boolean {
  return modelo.includes(MARCADOR_PRIMEIRO_NOME);
}

export function montarMensagem(modelo: string, nome: string): string {
  return modelo.split(MARCADOR_PRIMEIRO_NOME).join(nome.trim()).trim();
}

/** Sorteia um modelo. `aleatorio` injetável para teste. */
export function sortearModelo(modelos: string[], aleatorio: () => number = Math.random): string {
  if (modelos.length === 0) throw new Error('nenhum modelo de texto');
  const i = Math.min(modelos.length - 1, Math.floor(aleatorio() * modelos.length));
  return modelos[i];
}

/** Espaços colapsados, para comparar o texto colado com o que saiu no chat. */
export function normalizarParaComparar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}
