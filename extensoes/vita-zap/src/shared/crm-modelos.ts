// Respostas rápidas e rascunhos: variáveis {nome} e {primeiro_nome}, busca por atalho/título.
// O texto renderizado só é COLADO na caixa de mensagem; quem envia é sempre o usuário.

import { normalizarTexto, primeiroNome } from './nomes';
import type { RespostaRapida } from './crm-tipos';

export const VARIAVEIS = ['{nome}', '{primeiro_nome}'] as const;

/** Variáveis do texto que não são {nome} nem {primeiro_nome} (para avisar quem está editando o modelo). */
export function variaveisDesconhecidas(texto: string): string[] {
  const achadas = texto.match(/\{[^{}]*\}/g) ?? [];
  return [...new Set(achadas.filter((v) => !(VARIAVEIS as readonly string[]).includes(v)))];
}

/**
 * Troca {nome} pelo nome do contato e {primeiro_nome} pelo primeiro nome.
 * Contato só com número (sem nome salvo): as variáveis somem e a pontuação que sobra é arrumada
 * ("Olá, {primeiro_nome}!" vira "Olá!"). Variáveis desconhecidas ficam como o usuário escreveu.
 */
export function renderizarModelo(texto: string, nomeContato: string): string {
  const nome = nomeContato.trim();
  const primeiro = primeiroNome(nome);
  const semNome = /^[+\d\s().-]+$/.test(nome);
  const valorNome = semNome ? '' : nome;
  let r = texto.split('{primeiro_nome}').join(primeiro).split('{nome}').join(valorNome);
  if (valorNome === '' || primeiro === '') {
    r = r
      .replace(/[ \t]+([,.!?;:])/g, '$1') // "Olá ," → "Olá,"
      .replace(/,([!.?])/g, '$1') // "Olá,!" → "Olá!"
      .replace(/[ \t]{2,}/g, ' ');
  }
  return r.trim();
}

/** "/Oi Tudo" → "oi tudo" (sem a barra, sem acento). */
export function normalizarAtalho(s: string): string {
  return normalizarTexto(s.replace(/^\/+/, ''));
}

/** Atalho válido: letras, números, hífen ou sublinhado (é o que se digita depois da barra). */
export function atalhoValido(atalho: string): boolean {
  return /^[\p{L}\p{N}_-]{1,24}$/u.test(atalho.replace(/^\/+/, ''));
}

/** Filtra por título, atalho ou texto. Atalho que começa igual aparece primeiro. */
export function buscarRespostas(lista: RespostaRapida[], consulta: string): RespostaRapida[] {
  const q = normalizarAtalho(consulta);
  if (q === '') return [...lista].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const pontuar = (r: RespostaRapida): number => {
    const atalho = normalizarAtalho(r.atalho);
    if (atalho === q) return 0;
    if (atalho.startsWith(q)) return 1;
    if (normalizarTexto(r.titulo).includes(q)) return 2;
    if (normalizarTexto(r.texto).includes(q)) return 3;
    return -1;
  };
  return lista
    .map((r) => ({ r, p: pontuar(r) }))
    .filter((x) => x.p >= 0)
    .sort((a, b) => a.p - b.p || a.r.titulo.localeCompare(b.r.titulo, 'pt-BR'))
    .map((x) => x.r);
}

/** Texto digitado na caixa que chama o menu: "/" seguido do atalho. Devolve a consulta ou null. */
export function consultaDeAtalho(textoDaCaixa: string): string | null {
  const m = /^\/([\p{L}\p{N}_-]*)$/u.exec(textoDaCaixa.trim());
  return m ? m[1] : null;
}

export const MODELOS_INICIAIS: ReadonlyArray<Omit<RespostaRapida, 'id'>> = [
  { titulo: 'Saudação', atalho: 'oi', texto: 'Olá, {primeiro_nome}! Tudo bem? Como posso ajudar?' },
];

export function validarResposta(r: { titulo: string; atalho: string; texto: string }, existentes: RespostaRapida[], idAtual?: string): string | null {
  if (r.titulo.trim() === '') return 'Dê um título ao modelo.';
  if (r.texto.trim() === '') return 'O texto não pode ficar vazio.';
  const atalho = r.atalho.replace(/^\/+/, '').trim();
  if (atalho !== '') {
    if (!atalhoValido(atalho)) return 'O atalho aceita só letras, números, hífen e sublinhado (até 24).';
    if (existentes.some((e) => e.id !== idAtual && normalizarAtalho(e.atalho) === normalizarAtalho(atalho))) return `O atalho /${atalho} já existe.`;
  }
  return null;
}
