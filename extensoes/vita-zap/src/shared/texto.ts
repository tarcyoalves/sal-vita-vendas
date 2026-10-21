// Texto da campanha: validação (sem link na 1ª mensagem), {primeiroNome} e sorteio de variação.

import { MARCADOR_PRIMEIRO_NOME, MARCADOR_SAUDACAO, MAX_VARIACOES, TAMANHO_MAX_TEXTO } from './constantes';
import { partesNoFuso } from './datas';

// Link explícito, wa.me, encurtadores e "algo.com/.br/..." soltos no texto.
const PADRAO_LINK =
  /(https?:\/\/|www\.|wa\.me\/|\b[\p{L}0-9-]+\.(?:com|net|org|br|io|me|app|ly|link|info|biz|shop|store|site|online|xyz|gl|co|tv)(?:\.[a-z]{2})?\b)/iu;

export function contemLink(texto: string): boolean {
  return PADRAO_LINK.test(texto);
}

export interface OpcoesTexto {
  /** Tamanho máximo configurado (nunca acima de TAMANHO_MAX_TEXTO). Link e quebra de linha são sempre bloqueados. */
  tamanhoMax?: number;
}

/** Bom dia (até 11:59), boa tarde (12:00–17:59), boa noite (18:00 em diante), horário de Fortaleza. */
export function saudacaoDoHorario(agora: Date): string {
  const hora = partesNoFuso(agora).hora;
  if (hora < 12) return 'Bom dia';
  if (hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function validarModelo(texto: string, opcoes: OpcoesTexto = {}): string[] {
  const maximo = Math.min(TAMANHO_MAX_TEXTO, Math.max(1, Math.floor(opcoes.tamanhoMax ?? TAMANHO_MAX_TEXTO)));
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
  if (t.length > maximo) erros.push(`texto longo demais (${t.length}/${maximo} caracteres)`);
  const marcadores = t.match(/\{[^}]*\}/g) ?? [];
  for (const m of marcadores) {
    if (m !== MARCADOR_PRIMEIRO_NOME && m !== MARCADOR_SAUDACAO) {
      erros.push(`marcador desconhecido ${m} (use só ${MARCADOR_PRIMEIRO_NOME} ou ${MARCADOR_SAUDACAO})`);
    }
  }
  return erros;
}

/** Texto base + variações (vazias descartadas). Erros por posição. */
export function validarModelos(base: string, variacoes: string[], opcoes: OpcoesTexto = {}): { modelos: string[]; erros: string[] } {
  const extras = variacoes.map((v) => v.trim()).filter(Boolean);
  const erros: string[] = [];
  if (extras.length > MAX_VARIACOES) erros.push(`no máximo ${MAX_VARIACOES} variações`);
  const modelos = [base.trim(), ...extras.slice(0, MAX_VARIACOES)];
  modelos.forEach((m, i) => {
    for (const e of validarModelo(m, opcoes)) erros.push(`${i === 0 ? 'Texto base' : `Variação ${i}`}: ${e}`);
  });
  return { modelos, erros };
}

export function usaPrimeiroNome(modelo: string): boolean {
  return modelo.includes(MARCADOR_PRIMEIRO_NOME);
}

export function usaSaudacao(modelo: string): boolean {
  return modelo.includes(MARCADOR_SAUDACAO);
}

/** `agora` só importa para {saudacao}; o executor passa o relógio dele. */
export function montarMensagem(modelo: string, nome: string, agora: Date = new Date()): string {
  const comNome = modelo.split(MARCADOR_PRIMEIRO_NOME).join(nome.trim());
  return (usaSaudacao(comNome) ? comNome.split(MARCADOR_SAUDACAO).join(saudacaoDoHorario(agora)) : comNome).trim();
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

/**
 * Comparação do texto colado com o texto de uma mensagem lida do chat. Além dos espaços,
 * ignora caracteres invisíveis (marcas bidi, largura zero) e o seletor de variação de emoji
 * (U+FE0F/U+FE0E): o WhatsApp pode trocar "❤" por "❤️" ao renderizar o emoji como imagem.
 */
export function normalizarMensagem(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/[​-‏‪-‮⁠﻿︎️]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mensagensIguais(a: string, b: string): boolean {
  const na = normalizarMensagem(a);
  return na !== '' && na === normalizarMensagem(b);
}
