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

// Peso bruto total (kg). Itens antigos sem pesoBrutoKg gravado caem no líquido.
export function pesoBrutoTotalItens(itens: ItemPedido[]): number {
  return itens.reduce((s, it) => s + (Number(it.pesoBrutoKg) || Number(it.pesoKg) || 0), 0);
}

// Comissão por item: usa a % fixa do produto (snapshot em item.comissaoFixaPct)
// quando existir, senão cai na % do atendente congelada em pedido.comissaoPct.
// Itens antigos (sem comissaoFixaPct) mantêm exatamente o comportamento anterior.
export function comissaoPedido(pedido: Pedido): number {
  const pctPadrao = Number(pedido.comissaoPct) || 0;
  return pedido.itens.reduce((s, it) => {
    const pct = it.comissaoFixaPct ?? pctPadrao;
    return s + totalLinha(it) * (Number(pct) || 0) / 100;
  }, 0);
}

// Frete total do pedido: negociado por TONELADA (pedido.valorFretePorUnidade
// guarda R$/tonelada), aplicado sobre o peso líquido de cada item — não por
// quantidade de sacos/fardos, já que sacos/fardos de pesos diferentes pagam
// frete proporcional ao peso, não por unidade. Itens isentos (snapshot
// isentoFrete, ex: produto de preço final fixo) não entram na conta.
export function freteTotal(pedido: Pedido): number {
  const porTonelada = Number(pedido.valorFretePorUnidade) || 0;
  if (!porTonelada) return 0;
  return pedido.itens.reduce(
    (s, it) => s + (it.isentoFrete ? 0 : (Number(it.pesoKg) || 0) / 1000 * porTonelada),
    0,
  );
}

// Frete por saco/fardo de UM item (não o total do pedido): deriva o peso de
// um único saco/fardo desse item (pesoKg da linha ÷ quantidade) e aplica a
// taxa por tonelada. Usado no documento/PDF do pedido, onde os valores da
// tabela de itens são unitários. Compartilhado entre o print (client) e o
// PDF anexado ao e-mail (server) para nunca haver dois cálculos divergentes.
export function freteUnitItem(it: ItemPedido, valorFretePorTonelada: number): number {
  if (it.isentoFrete || !it.quantidade) return 0;
  const pesoUnitKg = (Number(it.pesoKg) || 0) / it.quantidade;
  return (pesoUnitKg / 1000) * (Number(valorFretePorTonelada) || 0);
}

// Formata um prazo de pagamento livre (ex: "30/45/60", "25", "à vista") —
// só acrescenta "dias" quando o texto for puramente numérico/barras, pra não
// grudar a palavra em valores como "à vista" que já são autoexplicativos.
export function formatPrazo(valor: string, singular = false): string {
  const v = (valor || '').trim();
  if (!v) return '--';
  if (/^[\d/]+$/.test(v)) return `${v} ${singular ? 'dia' : 'dias'}`;
  return v;
}

// ── Filtro por mês ────────────────────────────────────────────────────────────
export function mesAtual(): FiltroMes {
  const d = new Date();
  return { ano: d.getFullYear(), mes: d.getMonth() };
}

export function isoNoMes(iso: string | null, filtro: FiltroMes): boolean {
  if (!iso) return false;
  const d = parseDataLocal(iso);
  if (!d) return false;
  return d.getFullYear() === filtro.ano && d.getMonth() === filtro.mes;
}

/**
 * Lê uma data que pode chegar como `YYYY-MM-DD` (input date) ou ISO completo.
 *
 * `new Date('2026-09-01')` é interpretado como UTC e, em fuso negativo, volta
 * para 31/08 — exatamente o erro de um mês que esta regra existe para evitar.
 * Datas puras são montadas componente a componente, no fuso local.
 */
export function parseDataLocal(valor: string | null): Date | null {
  if (!valor) return null;
  const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  const d = soData
    ? new Date(Number(soData[1]), Number(soData[2]) - 1, Number(soData[3]))
    : new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/** `YYYY-MM-DD` no fuso local — formato aceito por <input type="date">. */
export function dataInputLocal(valor: string | null): string {
  const d = parseDataLocal(valor);
  if (!d) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function hojeInputLocal(): string {
  return dataInputLocal(new Date().toISOString());
}

/** dd/mm/aaaa, ou '--' quando vazio/inválido. */
export function formatDataBR(valor: string | null): string {
  const d = parseDataLocal(valor);
  return d ? d.toLocaleDateString('pt-BR') : '--';
}

/**
 * Data que decide a QUAL MÊS o pedido pertence no financeiro.
 *
 * Faturado → `faturadoEm`: o mês é o do embarque real, o que de fato se paga.
 * Estimado → `previsaoFaturamentoEm`: o mês em que o pedido deve faturar, não
 * o mês em que foi digitado. Sem previsão (pedido legado) cai em `criadoEm`,
 * preservando o comportamento antigo em vez de sumir do relatório.
 */
export function dataCompetenciaPedido(pedido: Pedido): string {
  if (pedido.status === 'faturado' && pedido.faturadoEm) return pedido.faturadoEm;
  return pedido.previsaoFaturamentoEm ?? pedido.criadoEm;
}

/** O pedido pertence ao mês do filtro, pela sua data de competência. */
export function pedidoNoMes(pedido: Pedido, filtro: FiltroMes): boolean {
  return isoNoMes(dataCompetenciaPedido(pedido), filtro);
}

// ── Resumo de um atendente no mês ─────────────────────────────────────────────
// Vendido/comissão prevista: pedidos cuja COMPETÊNCIA cai no mês (pipeline) —
// para estimados, o mês previsto de faturamento; nunca o mês da digitação.
// Embarcado/comissão embarcada: pedidos faturados no mês (realizado).
//
// Um pedido estimado com previsão em setembro sai do pipeline de agosto: ele
// entra uma única vez, no mês em que vai faturar. Ao ser faturado, passa a
// valer a data real do embarque, então ele nunca é contado em dois meses.
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

  const doMes = meus.filter((p) => pedidoNoMes(p, filtro));
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
