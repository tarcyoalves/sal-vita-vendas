// ── Contrato robô ⇄ CRM, etapas 2 e 3 — regras puras ─────────────────────────
// Faturado espelhado (rota 3), linha do tempo (rota 7), conferência do vínculo manual (rota 5),
// desvincular (rota 6) e a reserva anti-duplicidade. Sem `server/db`: testável sem banco.
//
// Princípio do contrato: o que o robô traz do SMBI é ESPELHO FISCAL. Nada aqui altera valor
// comercial nem comissão (`itens`, `comissaoPct`, `comissaoComercialProtegida`).
import { z } from 'zod';
import type { FatOrder } from '../db/schema';
import { totalItens, freteTotal, pesoTotalItens } from '../../client/src/lib/faturamento/calc';
import type { Pedido } from '../../client/src/lib/faturamento/types';
import {
  SMBI_EVENTOS_ROBO, SMBI_RESERVA_MIN,
  type SmbiCte, type SmbiEspelhoFiscal, type SmbiMovsaiFiscal, type SmbiNfe, type SmbiVinculoEstado, type SmbiVinculoResultado,
} from '../../shared/smbiEstados';

// ── Corpo da rota 3 (faturamento) ────────────────────────────────────────────

const id = z.string().trim().min(1).max(40);
const valor = z.number().finite().min(0).max(100_000_000);
const dataTexto = z.string().trim().min(8).max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'data inválida');

const nfeSchema = z.object({
  numero: id.optional(),
  chave: z.string().trim().max(60).optional(),
  data: dataTexto.optional(),
  valorTotal: valor.optional(),
  valorSal: valor.optional(),
});
const cteSchema = z.object({
  numero: id.optional(),
  chave: z.string().trim().max(60).optional(),
  valorFrete: valor.optional(),
});
const movsaiFiscalSchema = z.object({
  id,
  pesoKg: z.number().finite().min(0).max(10_000_000).nullable().optional(),
  nfe: nfeSchema.nullable().optional(),
  cte: cteSchema.nullable().optional(),
});

export const faturamentoBodySchema = z.object({
  movsais: z.array(movsaiFiscalSchema).min(1).max(20),
  faturadoEm: dataTexto,
  snapshotHash: z.string().trim().max(128).optional(),
});
export type FaturamentoBody = z.infer<typeof faturamentoBodySchema>;

/** Total acordado no CRM (itens + frete), na mesma conta da tela. */
export function totalAcordadoDoPedido(row: Pick<FatOrder, 'itens' | 'valorFretePorUnidade'>): number {
  const pedido = row as unknown as Pedido;
  return totalItens(pedido.itens) + freteTotal(pedido);
}

/** Peso líquido total do pedido no CRM (kg), a mesma base do frete por tonelada. */
export function pesoLiquidoDoPedido(row: Pick<FatOrder, 'itens'>): number {
  return pesoTotalItens((row as unknown as Pedido).itens);
}

/** sal (NF-e) + frete (CT-e) de todos os movsais. `informado` = ao menos um valor veio no corpo. */
export function somarFiscal(movsais: SmbiMovsaiFiscal[]): { total: number; informado: boolean } {
  let total = 0;
  let informado = false;
  for (const m of movsais) {
    if (m.nfe?.valorSal !== undefined) { total += m.nfe.valorSal; informado = true; }
    if (m.cte?.valorFrete !== undefined) { total += m.cte.valorFrete; informado = true; }
  }
  return { total: Math.round(total * 100) / 100, informado };
}

/** Soma dos pesos (kg) informados nos movsais; 0 se nenhum trouxe peso. */
export function pesoFaturadoKg(movsais: SmbiMovsaiFiscal[]): number {
  return Math.round(movsais.reduce((s, m) => s + (Number(m.pesoKg) || 0), 0) * 1000) / 1000;
}

/**
 * Quantidade alterada não é desconto: o vendedor fecha de um jeito e a carga sai com mais ou menos
 * peso. O total que o fiscal DEVERIA somar é o acordado proporcional ao peso efetivamente faturado
 * (sal e frete são por peso). Sem peso do pedido ou do faturamento, não dá para ajustar e vale o acordado.
 */
export function totalEsperadoPeloPeso(totalAcordado: number, pesoPedidoKg: number, pesoFaturado: number): number {
  if (!(pesoPedidoKg > 0) || !(pesoFaturado > 0)) return totalAcordado;
  return Math.round((totalAcordado * pesoFaturado / pesoPedidoKg) * 100) / 100;
}

/**
 * Desconto no faturamento: o fiscal (sal + frete) ficou ABAIXO do total esperado (acordado, ajustado ao
 * peso faturado; tolerância R$ 0,05). Fiscal igual ao esperado é só realocação sal→frete (piso mínimo de
 * frete: baixa o sal, sobe o frete, o valor final do cliente não muda): sem alerta. Sem nenhum valor
 * informado pelo robô também não alerta (não dá para comparar).
 */
export function alertaDescontoFiscal(totalAcordado: number, totalFiscal: number, informado: boolean, tolerancia = 0.05): boolean {
  return informado && totalFiscal < totalAcordado - tolerancia;
}

const unicos = (xs: Array<string | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];

/** N movsais de um pedido do CRM: os números saem juntos ("123, 124") nas colunas existentes. */
export function numerosFiscais(movsais: SmbiMovsaiFiscal[]): { numeroNfe: string | null; numeroCte: string | null } {
  const nfe = unicos(movsais.map((m) => m.nfe?.numero));
  const cte = unicos(movsais.map((m) => m.cte?.numero));
  return { numeroNfe: nfe.length ? nfe.join(', ') : null, numeroCte: cte.length ? cte.join(', ') : null };
}

type PedidoParaFaturar = Pick<FatOrder, 'smbiMovsaiId' | 'smbiVinculoMovsais' | 'status' | 'faturadoEm'>;

/** Números de movsai ligados ao pedido (o principal + os do vínculo manual). */
export function movsaisLigados(p: Pick<FatOrder, 'smbiMovsaiId' | 'smbiVinculoMovsais'>): string[] {
  return unicos([p.smbiMovsaiId ?? undefined, ...(p.smbiVinculoMovsais ?? [])]);
}

export type FaturamentoPatch = Partial<Pick<FatOrder,
  'smbiEspelhoFiscal' | 'smbiAlertaDesconto' | 'numeroNfe' | 'numeroCte' | 'status' | 'faturadoEm'>>;

/**
 * Decide o que gravar quando o robô informa o faturamento. `erro` (HTTP 409) quando o pedido não
 * está ligado a nenhum dos movsais informados — o robô nunca fatura pedido de outro movsai.
 * Se o pedido já está faturado no CRM (decisão humana), só o espelho fiscal é atualizado:
 * `status` e `faturadoEm` não mudam.
 */
export function resolverFaturamento(
  pedido: PedidoParaFaturar,
  body: FaturamentoBody,
  totalAcordado: number,
  agora: Date = new Date(),
  pesoPedidoKg = 0,
): { erro: string | null; patch: FaturamentoPatch } {
  const ligados = movsaisLigados(pedido);
  if (ligados.length === 0) return { erro: 'pedido sem vínculo com o SMBI', patch: {} };
  if (!body.movsais.some((m) => ligados.includes(m.id))) {
    return { erro: 'nenhum dos movsais informados está ligado a este pedido', patch: {} };
  }
  // Pedido com VÁRIOS movsais ligados: enquanto algum não vier faturado, o espelho é parcial.
  // Parcial nunca marca o pedido como faturado, nem liga alerta de desconto, nem mexe no peso/comissão.
  const informados = new Set(body.movsais.map((m) => m.id));
  const parcial = ligados.some((id) => !informados.has(id));
  const soma = somarFiscal(body.movsais);
  const pesoFat = pesoFaturadoKg(body.movsais);
  const esperado = totalEsperadoPeloPeso(totalAcordado, pesoPedidoKg, pesoFat);
  const espelho: SmbiEspelhoFiscal = {
    movsais: body.movsais,
    faturadoEm: body.faturadoEm,
    snapshotHash: body.snapshotHash ?? null,
    recebidoEm: agora.toISOString(),
    totalFiscal: soma.total,
    totalAcordado: Math.round(totalAcordado * 100) / 100,
    ...(parcial ? { parcial: true } : {}),
    ...(pesoPedidoKg > 0 ? { pesoPedidoKg } : {}),
    ...(pesoFat > 0 && !parcial ? { pesoFaturadoKg: pesoFat, totalEsperado: esperado } : {}),
  };
  const patch: FaturamentoPatch = {
    smbiEspelhoFiscal: espelho,
    smbiAlertaDesconto: parcial ? false : alertaDescontoFiscal(esperado, soma.total, soma.informado),
    ...numerosFiscais(body.movsais),
  };
  if (pedido.status !== 'faturado' && !parcial) {
    patch.status = 'faturado';
    patch.faturadoEm = body.faturadoEm;
  }
  return { erro: null, patch };
}

// ── Rota 7 (linha do tempo) ──────────────────────────────────────────────────

export const statusBodySchema = z.object({
  evento: z.enum(SMBI_EVENTOS_ROBO),
  dados: z.record(z.unknown()).optional(),
  em: dataTexto,
});
export type StatusBody = z.infer<typeof statusBodySchema>;

/** Colunas que voltam ao zero quando o vínculo com o SMBI é desfeito: o pedido só volta ao robô com NOVO clique. */
export const PATCH_DESVINCULAR = {
  smbiMovsaiId: null,
  smbiEstado: null,
  smbiMotivoCodigo: null,
  smbiMotivoTexto: null,
  smbiTentativa: null,
  smbiAtualizadoEm: null,
  smbiConferidoEm: null,
  smbiSolicitadoEm: null,
  smbiSolicitadoPor: null,
  smbiReservaToken: null,
  smbiReservadoAte: null,
  smbiEspelhoFiscal: null,
  smbiAlertaDesconto: false,
  smbiVinculoEstado: null,
  smbiVinculoMovsais: null,
  smbiVinculoPor: null,
  smbiVinculoEm: null,
  smbiVinculoResultado: null,
} as const satisfies Partial<Record<keyof FatOrder, unknown>>;

/**
 * `EXCLUIDO_SMBI` desliga o vínculo — mas só se o movsai excluído for o que está ligado.
 * Evento sem `dados.movsaiId` também desliga (o robô excluiu o pedido dele); com número
 * diferente do ligado, é só registro na linha do tempo.
 */
export function deveDesvincular(evento: StatusBody['evento'], dados: Record<string, unknown> | undefined, ligados: string[]): boolean {
  if (evento !== 'EXCLUIDO_SMBI') return false;
  const alvo = dados?.movsaiId ?? dados?.movsai ?? dados?.id;
  if (alvo === undefined || alvo === null || alvo === '') return true;
  return ligados.includes(String(alvo));
}

// ── Rota 5 (resultado da conferência do vínculo) ─────────────────────────────

const itemVinculoSchema = z.object({
  produto: z.string().trim().min(1).max(120),
  qtdKg: z.number().finite().min(0).max(100_000_000),
  valorUnit: z.number().finite().min(0).max(100_000_000).optional(),
});
export const vinculoResultadoSchema = z.object({
  movsais: z.array(z.object({
    id,
    cnpj: z.string().trim().max(20).optional(),
    cliente: z.string().trim().max(200).optional(),
    itens: z.array(itemVinculoSchema).max(50).optional(),
    faturado: z.boolean().optional(),
    nfe: nfeSchema.nullable().optional(),
    cte: cteSchema.nullable().optional(),
    pesoKg: z.number().finite().min(0).max(10_000_000).nullable().optional(),
    status: z.string().trim().max(60).optional(),
  })).min(1).max(20),
  confere: z.object({ cliente: z.boolean(), produto: z.boolean(), quantidade: z.boolean() }),
});
export type VinculoResultadoBody = z.infer<typeof vinculoResultadoSchema>;

/**
 * Tudo confere E os movsais que o robô leu são exatamente os pedidos ⇒ CONFERIDO. Qualquer outra
 * coisa é divergência e fica esperando o administrador (comparação lado a lado na tela).
 */
export function decidirVinculo(pedidos: string[], body: VinculoResultadoBody): SmbiVinculoEstado {
  const lidos = new Set(body.movsais.map((m) => m.id));
  const mesmosMovsais = pedidos.length === lidos.size && pedidos.every((p) => lidos.has(p));
  const c = body.confere;
  return mesmosMovsais && c.cliente && c.produto && c.quantidade ? 'CONFERIDO' : 'VINCULO_COM_DIVERGENCIA';
}

export function montarResultadoVinculo(body: VinculoResultadoBody, agora: Date = new Date()): SmbiVinculoResultado {
  return {
    recebidoEm: agora.toISOString(),
    confere: body.confere,
    movsais: body.movsais.map((m) => ({
      id: m.id, cnpj: m.cnpj, cliente: m.cliente, faturado: m.faturado, status: m.status, itens: m.itens,
      pesoKg: m.pesoKg ?? null, nfe: m.nfe ?? null, cte: m.cte ?? null,
    })),
  };
}

/** Movsais faturados que o robô leu, no formato do corpo da rota 3 (para reaproveitar `resolverFaturamento`). */
export function faturamentoDoVinculo(
  body: { movsais: Array<{ id: string; faturado?: boolean; nfe?: SmbiNfe | null; cte?: SmbiCte | null; pesoKg?: number | null }> },
  agora: Date = new Date(),
): FaturamentoBody | null {
  const faturados = body.movsais.filter((m) => m.faturado);
  if (faturados.length === 0) return null;
  const data = faturados.map((m) => m.nfe?.data).find((d) => !!d && !Number.isNaN(Date.parse(d)));
  return {
    movsais: faturados.map((m) => ({ id: m.id, pesoKg: m.pesoKg ?? null, nfe: m.nfe ?? null, cte: m.cte ?? null })),
    faturadoEm: data ?? agora.toISOString(),
  };
}

/** "1071, 1072 ,1073" → ["1071","1072","1073"]; null se algum item não for número de movsai. */
export function parseNumerosMovsai(texto: string): string[] | null {
  const partes = texto.split(/[,\s;]+/).map((s) => s.trim()).filter(Boolean);
  if (partes.length === 0 || partes.length > 20) return null;
  if (!partes.every((p) => /^\d{1,12}$/.test(p))) return null;
  return [...new Set(partes)];
}

// ── Reserva anti-duplicidade ─────────────────────────────────────────────────

export function reservaAte(agora: Date = new Date()): string {
  return new Date(agora.getTime() + SMBI_RESERVA_MIN * 60_000).toISOString();
}

/** A re-checagem `?id=` só vale com o token da reserva ainda em vigor. */
export function reservaConfere(
  row: Pick<FatOrder, 'smbiReservaToken' | 'smbiReservadoAte'>,
  token: string | undefined,
  agora: Date = new Date(),
): boolean {
  if (!token || !row.smbiReservaToken || !row.smbiReservadoAte) return false;
  if (token !== row.smbiReservaToken) return false;
  return row.smbiReservadoAte > agora.toISOString();
}

/**
 * Pedido INDIVIDUAL: o robô nunca recebe um lote. Devolve o id do único pedido que pode ser
 * reservado agora (o clique mais antigo), ou null se ainda há um pedido reservado e sem resposta
 * (reserva em vigor) — o próximo só sai depois que o robô responder o anterior
 * (POST .../retorno libera a reserva) ou a reserva vencer.
 */
export function proximoPedidoIndividual(
  elegiveis: Array<Pick<FatOrder, 'id' | 'smbiSolicitadoEm' | 'smbiReservadoAte' | 'smbiMovsaiId'>>,
  agora: Date = new Date(),
): string | null {
  const agoraIso = agora.toISOString();
  if (elegiveis.some((r) => !r.smbiMovsaiId && r.smbiReservadoAte && r.smbiReservadoAte > agoraIso)) return null;
  const ordenados = [...elegiveis]
    .filter((r) => !r.smbiMovsaiId)
    .sort((a, b) => String(a.smbiSolicitadoEm ?? '').localeCompare(String(b.smbiSolicitadoEm ?? '')));
  return ordenados[0]?.id ?? null;
}
