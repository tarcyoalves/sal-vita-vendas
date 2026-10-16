// Regras PURAS da consulta paga (cache, teto mensal, trava contra clique duplo). O banco só executa o que estas
// funções (e o INSERT condicional do router) decidem; assim dá para testar sem rede nem banco.
import { relatorioValido } from '../../../shared/credito';

/** Uma consulta EM_ANDAMENTO mais velha que isto é considerada morta (a função serverless caiu no meio). */
export const TRAVA_CONSULTA_MS = 2 * 60_000;
export const LIMITE_MENSAL_PADRAO = 50;

export type DecisaoCache = 'REAPROVEITAR' | 'CONSULTAR';

/** Reaproveita relatório válido (<30 dias) do MESMO provedor, a menos que o admin peça uma nova. */
export function decidirCache(
  ultimo: { consultadoEm: Date | string; provedor: string } | null,
  opts: { forcarNova?: boolean; provedorAtual: string; agora?: Date },
): DecisaoCache {
  if (!ultimo || opts.forcarNova) return 'CONSULTAR';
  if (ultimo.provedor !== opts.provedorAtual) return 'CONSULTAR'; // relatório simulado nunca vale como real
  return relatorioValido(ultimo.consultadoEm, opts.agora) ? 'REAPROVEITAR' : 'CONSULTAR';
}

export function limiteAtingido(usadasNoMes: number, limiteMensal: number): boolean {
  return usadasNoMes >= limiteMensal;
}

/** Espelha a condição do INSERT atômico: há outra consulta viva do mesmo documento? */
export function consultaEmAndamentoViva(iniciadoEm: Date | string, agora: Date = new Date()): boolean {
  const t = new Date(iniciadoEm).getTime();
  return Number.isFinite(t) && agora.getTime() - t < TRAVA_CONSULTA_MS;
}

export function limiteMensalValido(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 10_000;
}

export { tetoPorConsultaValido } from '../../../shared/creditoCatalogo';
