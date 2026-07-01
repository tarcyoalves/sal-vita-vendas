// ── Faturamento & Comissão — cálculos puros ──────────────────────────────────
// Funções sem efeito colateral. TOTAL da linha = quantidade × valorUnitario.
// PESO é informativo e não entra no preço. Comissão sempre sobre o total do pedido.

import type { Pedido, ItemPedido, ResumoAtendente, ComissaoMap, FiltroMes } from './types';

export function totalLinha(item: Pick<ItemPedido, 'quantidade' | 'valorUnitario'>): number {
  const q = Number(item.quantidade) || 0;
  const v = Number(item.valorUnitario) || 0;
  return q * v;
}

export function totalItens(itens: ItemPedido[]): number {
  return itens.reduce((s, it) => s + totalLinha(it), 0);
}

export function totalPedido(pedido: Pedido): number {
  return totalItens(pedido.itens);
}

export function pesoTotalItens(itens: ItemPedido[]): number {
  return itens.reduce((s, it) => s + (Number(it.pesoKg) || 0), 0);
}

// Comissão sobre o total atual do pedido (estimado ou faturado, conforme status).
export function comissaoPedido(pedido: Pedido): number {
  return totalPedido(pedido) * (Number(pedido.comissaoPct) || 0) / 100;
}

// ── Filtro por mês ────────────────────────────────────────────────────────────
export function mesAtual(): FiltroMes {
  const d = new Date();
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

export function isoNoMes(iso: string | null, filtro: FiltroMes): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === filtro.ano && d.getMonth() === filtro.mes;
}

// ── Resumo de um atendente no mês ─────────────────────────────────────────────
// Vendido/comissão prevista: pedidos criados no mês (pipeline).
// Embarcado/comissão embarcada: pedidos faturados no mês (realizado).
//
// IMPORTANTE: a comissão em R$ é sempre a SOMA de comissaoPedido() de cada
// pedido — ou seja, usa a % que ficou congelada em pedido.comissaoPct no
// momento da criação, nunca a % atual do atendente. Isso mantém o valor
// idêntico ao que aparece no card/detalhe de cada pedido individualmente.
// `comissaoPctAtual` só é usado para exibir a % vigente do atendente (rótulo);
// não entra no cálculo monetário — trocar a % de alguém não pode alterar
// retroativamente a comissão de pedidos já criados com a % antiga.
export function resumoAtendente(
  todosPedidos: Pedido[],
  sellerId: number,
  sellerName: string,
  comissaoPctAtual: number,
  filtro: FiltroMes,
): ResumoAtendente {
  const meus = todosPedidos.filter((p) => p.sellerId === sellerId);

  const doMes = meus.filter((p) => isoNoMes(p.criadoEm, filtro));
  const faturadosNoMes = meus.filter((p) => p.status === 'faturado' && isoNoMes(p.faturadoEm, filtro));

  const totalVendido = doMes.reduce((s, p) => s + totalPedido(p), 0);
  const totalEmbarcado = faturadosNoMes.reduce((s, p) => s + totalPedido(p), 0);
  const comissaoPrevista = doMes.reduce((s, p) => s + comissaoPedido(p), 0);
  const comissaoEmbarcada = faturadosNoMes.reduce((s, p) => s + comissaoPedido(p), 0);
  const pesoTotalKg = doMes.reduce((s, p) => s + pesoTotalItens(p.itens), 0);
  const pesoEmbarcadoKg = faturadosNoMes.reduce((s, p) => s + pesoTotalItens(p.itens), 0);

  return {
    sellerId,
    sellerName,
    comissaoPct: comissaoPctAtual,
    totalVendido,
    totalEmbarcado,
    comissaoPrevista,
    comissaoEmbarcada,
    qtdPedidos: doMes.length,
    qtdFaturados: faturadosNoMes.length,
    pesoTotalKg,
    pesoEmbarcadoKg,
  };
}

// ── Panorama do admin: uma linha por atendente ────────────────────────────────
export function panoramaPorAtendente(
  todosPedidos: Pedido[],
  sellers: { id: number; name: string }[],
  comissoes: ComissaoMap,
  filtro: FiltroMes,
): ResumoAtendente[] {
  return sellers
    .map((s) => resumoAtendente(todosPedidos, s.id, s.name, comissoes[s.id] ?? 0, filtro))
    .sort((a, b) => b.totalEmbarcado - a.totalEmbarcado || b.totalVendido - a.totalVendido);
}

export function somarResumos(rows: ResumoAtendente[]) {
  return rows.reduce(
    (acc, r) => ({
      totalVendido: acc.totalVendido + r.totalVendido,
      totalEmbarcado: acc.totalEmbarcado + r.totalEmbarcado,
      comissaoPrevista: acc.comissaoPrevista + r.comissaoPrevista,
      comissaoEmbarcada: acc.comissaoEmbarcada + r.comissaoEmbarcada,
      qtdPedidos: acc.qtdPedidos + r.qtdPedidos,
      qtdFaturados: acc.qtdFaturados + r.qtdFaturados,
      pesoTotalKg: acc.pesoTotalKg + r.pesoTotalKg,
      pesoEmbarcadoKg: acc.pesoEmbarcadoKg + r.pesoEmbarcadoKg,
    }),
    { totalVendido: 0, totalEmbarcado: 0, comissaoPrevista: 0, comissaoEmbarcada: 0, qtdPedidos: 0, qtdFaturados: 0, pesoTotalKg: 0, pesoEmbarcadoKg: 0 },
  );
}

// ── Formatação BRL ────────────────────────────────────────────────────────────
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(n: number): string {
  return BRL.format(Number(n) || 0);
}

// Aceita "6,00", "6.00", "1.500,50", "R$ 1.234,56" → number.
export function parseBRL(input: string): number {
  if (typeof input === 'number') return input;
  const s = String(input).replace(/[^\d.,-]/g, '').trim();
  if (!s) return 0;
  // Se tem vírgula, ela é o separador decimal (padrão BR): remove pontos de milhar.
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = s;
  }
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

export function formatKg(n: number): string {
  const v = Number(n) || 0;
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
}

export function formatTons(kg: number): string {
  const t = (Number(kg) || 0) / 1000;
  return `${t.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;
}
