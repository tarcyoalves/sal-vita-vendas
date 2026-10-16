// Lógica PURA do seletor de consultas (sem DOM, sem React): total, saldo após, o que é reaproveitado e bloqueios.
// As regras de custo/limite vêm de shared/creditoCatalogo.ts: o servidor usa as MESMAS funções, então a tela nunca
// promete uma consulta que o servidor vai recusar (nem o contrário).
import {
  CATALOGO_CREDITO, CONSULTA_COMPLETA, MAX_PRODUTOS_POR_CONSULTA, PRODUTO_PADRAO, brl, calcularCustos, custoConsultaCompleta, itemSelecionavel,
  saldoApos, verificarLimitesCusto, type ItemCatalogoCredito,
} from '../../../../shared/creditoCatalogo';
import { motivoConsultaValido, vaiReaproveitar } from './regras';

export interface UltimoDoProduto { consultadoEm: string | Date; valido: boolean; provedor?: string | null }

export const selecaoInicial = (): string[] => [PRODUTO_PADRAO];

/** Marca/desmarca. Item não medido ou desconhecido nunca entra; o máximo (3) é respeitado. Mantém a ordem do catálogo. */
export function alternarProduto(
  selecionados: readonly string[], chave: string, itens: readonly ItemCatalogoCredito[] = CATALOGO_CREDITO,
): string[] {
  const item = itens.find((i) => i.chave === chave);
  if (!item || !itemSelecionavel(item)) return [...selecionados];
  if (selecionados.includes(chave)) return selecionados.filter((c) => c !== chave);
  if (selecionados.length >= MAX_PRODUTOS_POR_CONSULTA) return [...selecionados];
  const novos = [...selecionados, chave];
  return itens.map((i) => i.chave).filter((c) => novos.includes(c));
}

/** Preset de um clique "Consulta completa": as duas fontes (Consulta simples + Serasa Premium). null se alguma não for consultável. */
export function selecaoCompleta(itens: readonly ItemCatalogoCredito[] = CATALOGO_CREDITO): string[] | null {
  const escolhidos = CONSULTA_COMPLETA.map((c) => itens.find((i) => i.chave === c));
  if (escolhidos.some((i) => !i || !itemSelecionavel(i))) return null;
  return itens.map((i) => i.chave).filter((c) => (CONSULTA_COMPLETA as readonly string[]).includes(c));
}

/** "Consulta completa (Consulta simples + Serasa Premium) — R$ 9,47" (os nomes e o preço vêm do catálogo). */
export function textoPresetCompleto(itens: readonly ItemCatalogoCredito[] = CATALOGO_CREDITO): string | null {
  const custo = custoConsultaCompleta(itens);
  if (custo === null) return null;
  const nomes = CONSULTA_COMPLETA.map((c) => itens.find((i) => i.chave === c)?.nome ?? c);
  return `Consulta completa (${nomes.join(' + ')}) — ${brl(custo).replace(/\u00a0/g, ' ')}`;
}

/** A seleção atual é exatamente a consulta completa? */
export const ehSelecaoCompleta = (selecionados: readonly string[]): boolean =>
  selecionados.length === CONSULTA_COMPLETA.length && CONSULTA_COMPLETA.every((c) => selecionados.includes(c));

/** Itens que não podem mais ser marcados agora (limite de 3 atingido), para desabilitar a caixa. */
export const limiteDeSelecaoAtingido = (selecionados: readonly string[]): boolean => selecionados.length >= MAX_PRODUTOS_POR_CONSULTA;

export interface LinhaPlano {
  chave: string; nome: string; custoCatalogo: number; custoCobrado: number; reaproveitado: boolean; ultimaEm: string | Date | null;
}

export interface PlanoSelecao { linhas: LinhaPlano[]; totalReais: number; chamadas: number; reaproveitados: number }

/** Plano da seleção: o que é reaproveitado (sem custo) e a soma do que será cobrado. Item sem custo medido é ignorado. */
export function planoDaSelecao(e: {
  itens?: readonly ItemCatalogoCredito[]; selecionados: readonly string[];
  ultimoPorProduto: Readonly<Record<string, UltimoDoProduto>> | null | undefined;
  forcarNova: boolean; simulado: boolean; provedorAtual: string | null | undefined;
}): PlanoSelecao {
  const catalogo = e.itens ?? CATALOGO_CREDITO;
  const escolhidos = catalogo.filter((i) => e.selecionados.includes(i.chave) && itemSelecionavel(i));
  const reaproveita: Record<string, boolean> = {};
  for (const i of escolhidos) {
    reaproveita[i.chave] = vaiReaproveitar(e.ultimoPorProduto?.[i.chave] ?? null, { forcarNova: e.forcarNova, provedorAtual: e.provedorAtual });
  }
  const custos = calcularCustos(escolhidos, reaproveita, e.simulado);
  const linhas = escolhidos.map((i): LinhaPlano => ({
    chave: i.chave, nome: i.nome, custoCatalogo: i.custoReais ?? 0,
    custoCobrado: reaproveita[i.chave] || e.simulado ? 0 : (i.custoReais ?? 0),
    reaproveitado: reaproveita[i.chave], ultimaEm: e.ultimoPorProduto?.[i.chave]?.consultadoEm ?? null,
  }));
  return { linhas, ...custos };
}

/** "dd/mm" no fuso de São Paulo. */
export function dataCurta(valor: string | Date | null | undefined): string {
  if (!valor) return '--';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
}

export const textoReaproveita = (ultimaEm: string | Date | null | undefined): string =>
  `Já consultado em ${dataCurta(ultimaEm)} — sem custo (reaproveita)`;

export interface EstadoConsulta {
  podeConsultar: boolean;
  saldoApos: number | null;
  saldoNegativo: boolean;
  /** Mensagens de bloqueio para mostrar (vermelho). Vazio = nada impede. */
  bloqueios: string[];
}

/** Tudo que habilita o botão "Consultar": seleção, motivo, teto, saldo e limite mensal. */
export function estadoDaConsulta(e: {
  plano: PlanoSelecao; saldo: number | null | undefined; tetoPorConsultaReais: number;
  usadasNoMes: number; limiteMensal: number; motivo: string; ocupado?: boolean; carregado?: boolean;
}): EstadoConsulta {
  const bloqueios: string[] = [];
  const b = verificarLimitesCusto({
    totalReais: e.plano.totalReais, chamadas: e.plano.chamadas, saldo: e.saldo,
    tetoPorConsultaReais: e.tetoPorConsultaReais, usadasNoMes: e.usadasNoMes, limiteMensal: e.limiteMensal,
  });
  if (!b.ok) bloqueios.push(b.mensagem);
  const apos = saldoApos(e.saldo, e.plano.totalReais);
  const selecionou = e.plano.linhas.length > 0;
  return {
    podeConsultar: selecionou && b.ok && motivoConsultaValido(e.motivo) && !e.ocupado && e.carregado !== false,
    saldoApos: apos,
    saldoNegativo: apos !== null && apos < 0,
    bloqueios,
  };
}
