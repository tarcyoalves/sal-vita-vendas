// Regras PURAS da consulta com seletor de produtos: veredito efetivo (pior entre produtos), plano de cache por
// (documento, produto) e resultado parcial. O router só executa o SQL e as chamadas; aqui nada toca rede ou banco.
import {
  CATALOGO_CREDITO, arredondar, chaveDoProdutoGravado, itemDoCatalogo, nomeDoProduto,
  type ItemCatalogoCredito,
} from '../../../shared/creditoCatalogo';
import { piorVeredito, relatorioValido, type Veredito } from '../../../shared/credito';
import { decidirCache } from './politica';

export { validarProdutos } from '../../../shared/creditoCatalogo';

export const comoVeredito = (s: string): Veredito => (s === 'APROVADO' || s === 'COM_RESTRICAO' ? s : 'REPROVADO_A_PRAZO');

export interface LinhaRelatorio {
  veredito: string;
  consultadoEm: Date | string;
  provedor: string;
  produto?: string | null;
}

/**
 * Relatório EFETIVO de um documento. `linhas` vêm da mais recente para a mais antiga. Entre os relatórios válidos
 * (<30 dias), de qualquer produto, vale o PIOR veredito; o "principal" é o mais recente com esse veredito.
 * Sem nenhum válido: o mais recente, marcado `valido:false` (a tela mostra cinza/vencido).
 */
export function escolherEfetivo<T extends LinhaRelatorio>(
  linhas: readonly T[], agora: Date = new Date(),
): { principal: T; veredito: Veredito; valido: boolean } | null {
  if (linhas.length === 0) return null;
  const validas = linhas.filter((l) => relatorioValido(l.consultadoEm, agora));
  if (validas.length === 0) return { principal: linhas[0], veredito: comoVeredito(linhas[0].veredito), valido: false };
  const pior = piorVeredito(validas.map((l) => comoVeredito(l.veredito))) as Veredito;
  const principal = validas.find((l) => comoVeredito(l.veredito) === pior) ?? validas[0];
  return { principal, veredito: pior, valido: true };
}

/** O relatório mais recente de cada produto (chave do catálogo), mantendo a ordem de chegada. */
export function maisRecentePorProduto<T extends LinhaRelatorio>(linhas: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const l of linhas) {
    const chave = chaveDoProdutoGravado(l.produto, l.provedor);
    if (!out.has(chave)) out.set(chave, l);
  }
  return out;
}

/**
 * Quais linhas entram no RELATÓRIO CONSOLIDADO do documento (`linhas` da mais recente para a mais antiga):
 * sem simulados quando o provedor ligado é o real; o mais recente de cada produto; só os válidos (<30 dias) — se
 * nenhum for válido, o mais recente de cada produto com `valido:false` (a tela mostra "vencido"). Ordem do catálogo.
 */
export function selecionarParaConsolidado<T extends LinhaRelatorio>(
  linhas: readonly T[], opts: { provedorReal: boolean; agora?: Date },
): { linhas: T[]; valido: boolean } {
  const base = opts.provedorReal ? linhas.filter((l) => l.provedor !== 'simulado') : linhas;
  const porProduto = [...maisRecentePorProduto(base).entries()];
  const validas = porProduto.filter(([, l]) => relatorioValido(l.consultadoEm, opts.agora));
  const escolhidas = validas.length ? validas : porProduto;
  const ordem = CATALOGO_CREDITO.map((i) => i.chave);
  escolhidas.sort(([a], [b]) => (ordem.indexOf(a) === -1 ? 999 : ordem.indexOf(a)) - (ordem.indexOf(b) === -1 ? 999 : ordem.indexOf(b)));
  return { linhas: escolhidas.map(([, l]) => l), valido: validas.length > 0 };
}

export interface ChipProduto {
  produto: string; nome: string; consultadoEm: Date | string; valido: boolean; veredito: Veredito; custoReais: number | null;
}

/** Um chip por produto já consultado, na ordem do catálogo (produtos fora do catálogo vão no fim). */
export function chipsDosProdutos<T extends LinhaRelatorio & { custoReais: number | null }>(
  linhas: readonly T[], agora: Date = new Date(),
): ChipProduto[] {
  const mapa = maisRecentePorProduto(linhas);
  const ordem = CATALOGO_CREDITO.map((i) => i.chave);
  const chaves = [...mapa.keys()].sort((a, b) => {
    const ia = ordem.indexOf(a); const ib = ordem.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  return chaves.map((chave) => {
    const l = mapa.get(chave) as T;
    return {
      produto: chave, nome: nomeDoProduto(chave, l.provedor), consultadoEm: l.consultadoEm,
      valido: relatorioValido(l.consultadoEm, agora), veredito: comoVeredito(l.veredito), custoReais: l.custoReais,
    };
  });
}

/** Entrada do bloqueio no SMBI: veredito efetivo e a data do relatório mais recente que vale. */
export function resumoParaBloqueio(
  linhas: readonly LinhaRelatorio[], agora: Date = new Date(),
): { veredito: string; consultadoEm: Date | string } | null {
  const e = escolherEfetivo(linhas, agora);
  if (!e) return null;
  if (!e.valido) return { veredito: e.veredito, consultadoEm: e.principal.consultadoEm };
  const maisNovaValida = linhas.find((l) => relatorioValido(l.consultadoEm, agora)) as LinhaRelatorio;
  return { veredito: e.veredito, consultadoEm: maisNovaValida.consultadoEm };
}

/** Decide, por produto, se o relatório válido (<30 dias) deste (documento, produto) é reaproveitado. */
export function planoDeCache<T extends LinhaRelatorio>(
  itens: readonly ItemCatalogoCredito[],
  linhas: readonly T[],
  opts: { forcarNova?: boolean; provedorAtual: string; agora?: Date },
): { reaproveita: Record<string, boolean>; ultimo: Map<string, T> } {
  const ultimo = maisRecentePorProduto(linhas);
  const reaproveita: Record<string, boolean> = {};
  for (const i of itens) {
    const l = ultimo.get(i.chave) ?? null;
    reaproveita[i.chave] = decidirCache(l ? { consultadoEm: l.consultadoEm, provedor: l.provedor } : null, opts) === 'REAPROVEITAR';
  }
  return { reaproveita, ultimo };
}

// ── Resultado parcial ────────────────────────────────────────────────────────
export interface ResultadoProduto {
  produto: string;
  ok: boolean;
  reaproveitado: boolean;
  /** true = o provedor já cobrou esta consulta (mesmo que o relatório não tenha sido gravado). */
  cobrado: boolean;
  custoReais: number;
  id?: number;
  consultadoEm?: Date;
  veredito?: Veredito;
  erro?: string;
}

export interface ResumoResultados {
  custoCobradoReais: number;
  falhas: number;
  /** Algum produto deu certo e outro falhou, ou algo foi cobrado sem relatório: a tela precisa explicar. */
  parcial: boolean;
  /** Tudo falhou e nada foi cobrado: o router responde com erro em vez de devolver a lista. */
  falhouSemCobranca: boolean;
}

export function resumirResultados(resultados: readonly ResultadoProduto[]): ResumoResultados {
  const falhas = resultados.filter((r) => !r.ok).length;
  const custoCobradoReais = arredondar(resultados.reduce((s, r) => s + (r.cobrado ? r.custoReais : 0), 0));
  const algumCobrado = resultados.some((r) => r.cobrado);
  return {
    custoCobradoReais, falhas,
    parcial: falhas > 0 && falhas < resultados.length || (falhas > 0 && algumCobrado),
    falhouSemCobranca: falhas === resultados.length && !algumCobrado,
  };
}

export const nomeDaChave = (chave: string): string => itemDoCatalogo(chave)?.nome ?? chave;
