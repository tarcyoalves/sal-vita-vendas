// Regras puras de "abrir a conversa pelo telefone SEM recarregar o WhatsApp Web": em que formatos digitar o
// número na busca e como decidir qual resultado abrir. Quem lê e clica na página é content/abrir-por-telefone.ts.

import { normalizarTexto } from './nomes';
import { normalizarTelefone } from './telefone';

/** Texto da mensagem de fallback (painel e página) quando a busca não resolve e o jeito é recarregar pelo endereço. */
export const AVISO_FALLBACK_ENDERECO = 'Não achei pela busca; abrindo pelo endereço do WhatsApp (recarrega a página).';

/**
 * Formatos para digitar na busca, do mais específico ao mais curto: com DDI 55, sem DDI, com/sem o 9 extra do
 * celular brasileiro, últimos 9 e últimos 8 dígitos. Só dígitos. Lista vazia se o telefone não for válido.
 */
export function formatosDeBusca(telefone: string): string[] {
  const completo = normalizarTelefone(telefone);
  if (!completo) return [];
  const nacional = /^55\d{10,11}$/.test(completo) ? completo.slice(2) : null;
  const saida: string[] = [completo];
  if (nacional) {
    saida.push(nacional);
    if (nacional.length === 11 && nacional[2] === '9') saida.push(nacional.slice(0, 2) + nacional.slice(3));
    if (nacional.length === 10) saida.push(nacional.slice(0, 2) + '9' + nacional.slice(2));
  }
  const base = nacional ?? completo;
  if (base.length >= 9) saida.push(base.slice(-9));
  if (base.length >= 8) saida.push(base.slice(-8));
  return [...new Set(saida)];
}

/** Formatos curtos (menos de 10 dígitos) casam com muita gente: só valem com o nome conferido. */
export function formatoCurto(formato: string): boolean {
  return formato.length < 10;
}

export interface CandidatoBusca {
  nome: string;
}

export type Escolha = { tipo: 'um'; indice: number } | { tipo: 'nenhum' } | { tipo: 'ambiguo' };

const mesmoNome = (a: string, b: string): boolean => a !== '' && b !== '' && (a === b || a.includes(b) || b.includes(a));

/**
 * Qual resultado da busca abrir. Linhas com o mesmo nome contam como UM contato (a mesma pessoa aparece em
 * "Conversas" e em "Contatos"; vale a primeira). Regras:
 * - um contato só → abre;
 * - vários contatos → abre só se exatamente um tem o título igual/parecido com `nomeDica`; senão é ambíguo;
 * - `exigirNome` (formato curto): só abre se esse único contato bate com `nomeDica`.
 */
export function escolherResultado(candidatos: CandidatoBusca[], nomeDica?: string, exigirNome = false): Escolha {
  const distintos = new Map<string, number>();
  candidatos.forEach((c, i) => {
    const n = normalizarTexto(c.nome);
    if (!distintos.has(n)) distintos.set(n, i);
  });
  if (distintos.size === 0) return { tipo: 'nenhum' };
  const dica = nomeDica ? normalizarTexto(nomeDica) : '';
  const batem = [...distintos].filter(([n]) => mesmoNome(n, dica));
  if (batem.length === 1) return { tipo: 'um', indice: batem[0][1] };
  if (batem.length > 1) return { tipo: 'ambiguo' };
  if (exigirNome) return distintos.size > 1 ? { tipo: 'ambiguo' } : { tipo: 'nenhum' };
  if (distintos.size === 1) return { tipo: 'um', indice: [...distintos.values()][0] };
  return { tipo: 'ambiguo' };
}
