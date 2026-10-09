// Envio ao SMBI com escolha de empresa — regras PURAS (sem `server/db`, testáveis sem banco).
// Solicitação (hash canônico), decisão do clique, elegibilidade da fila, /iniciar e validação do
// retorno do robô. Contrato v2 do robô: docs/SMBI-MULTIEMPRESA.md.
//
// Princípios: a empresa é escolhida SÓ no clique; depois da primeira reserva ela fica travada para
// sempre (reserva vencida NUNCA libera troca nem recriação); retorno de solicitação/empresa errada é
// rejeitado ANTES de qualquer escrita, sem limpar o token atual.
import crypto from 'crypto';
import type { FatOrder } from '../db/schema';
import { condicaoPorTexto } from '../../shared/smbiCondicoes';
import { empresaPorCnpj, type SmbiEmpresa } from '../../shared/smbiEmpresas';
import { canonico } from './smbiCadastro';
import { safeEqual } from './safeEqual';
import { isElegivelParaSmbi } from './smbi';
import { movsaisLigados } from './smbiFaturamento';

export const PROTOCOLO_MULTIEMPRESA = 2;

/** `X-SMBI-Protocolo: 2`. Ausente ou diferente de um inteiro ≥ 1 = protocolo 1 (worker antigo). */
export function protocoloDoRobo(header: string | string[] | undefined): number {
  if (typeof header !== 'string' || !/^\d{1,2}$/.test(header.trim())) return 1;
  return Math.max(1, Number(header.trim()));
}

export interface Recusa { ok: false; status: 400 | 409; codigo: string; erro: string }
const recusa = (status: Recusa['status'], codigo: string, erro: string): Recusa => ({ ok: false, status, codigo, erro });

// ── Hash da solicitação ──────────────────────────────────────────────────────

export type PedidoParaSolicitacao = Pick<FatOrder,
  'id' | 'cnpj' | 'razaoSocial' | 'clienteNome' | 'cidade' | 'uf' | 'itens' | 'prazoPagamentoSal' | 'prazoPagamentoFrete'
  | 'smbiCondpagSalCod' | 'smbiCondpagFreteCod' | 'valorFretePorUnidade'>;

/**
 * sha256 da serialização canônica do que o robô vai digitar: comprador, itens (ordenados, então a ordem
 * da tela não importa), quantidades, valores, prazos (texto + código, o derivado do texto quando a coluna
 * está vazia, igual ao payload), frete e empresa. SEM timestamp e SEM segredo: o mesmo pedido gera sempre o
 * mesmo hash, e qualquer edição relevante depois do clique o muda.
 */
export function hashSolicitacao(p: PedidoParaSolicitacao, empresaCnpj: string): string {
  const itens = p.itens
    .map((i) => ({
      produtoId: i.produtoId, descricao: i.descricao, quantidade: i.quantidade, pesoKg: i.pesoKg,
      valorUnitario: i.valorUnitario, isentoFrete: i.isentoFrete ?? false,
    }))
    .sort((a, b) => (canonico(a) < canonico(b) ? -1 : canonico(a) > canonico(b) ? 1 : 0));
  const prazo = (texto: string, cod: string | null) => ({ texto, cod: cod ?? condicaoPorTexto(texto)?.cod ?? null });
  return crypto.createHash('sha256').update(canonico({
    v: 2,
    empresaCnpj,
    pedidoId: p.id,
    comprador: { cnpj: p.cnpj.replace(/\D/g, ''), razaoSocial: p.razaoSocial, clienteNome: p.clienteNome, cidade: p.cidade, uf: p.uf },
    itens,
    prazoSal: prazo(p.prazoPagamentoSal, p.smbiCondpagSalCod),
    prazoFrete: prazo(p.prazoPagamentoFrete, p.smbiCondpagFreteCod),
    valorFretePorUnidade: p.valorFretePorUnidade,
  }), 'utf8').digest('hex');
}

type EstadoSolicitacao = PedidoParaSolicitacao
  & Pick<FatOrder, 'smbiEmpresaCnpj' | 'smbiSolicitacaoId' | 'smbiSolicitacaoHash' | 'smbiSolicitadoEm' | 'atualizadoEm'>;

/** true quando a solicitação gravada já não vale: hash recalculado ≠ gravado, ou o pedido foi editado depois do clique. */
export function solicitacaoObsoleta(row: EstadoSolicitacao): boolean {
  if (!row.smbiEmpresaCnpj || !row.smbiSolicitacaoId || !row.smbiSolicitacaoHash) return true;
  if (hashSolicitacao(row, row.smbiEmpresaCnpj) !== row.smbiSolicitacaoHash) return true;
  return !!row.atualizadoEm && !!row.smbiSolicitadoEm && row.atualizadoEm > row.smbiSolicitadoEm;
}

export const reservaVigente = (row: Pick<FatOrder, 'smbiReservadoAte'>, agora: Date): boolean =>
  !!row.smbiReservadoAte && row.smbiReservadoAte > agora.toISOString();

// ── Clique em "Enviar para o SMBI" ───────────────────────────────────────────

export type PedidoParaEnvio = PedidoParaSolicitacao
  & Pick<FatOrder, 'smbiEmpresaCnpj' | 'smbiEmpresaTravadaEm' | 'smbiEscritaIniciadaEm' | 'smbiReservadoAte' | 'smbiMovsaiId'>;

export type DecisaoEnvio =
  | Recusa
  | { ok: true; modo: 'LEGADO' }
  | { ok: true; modo: 'MULTIEMPRESA'; empresa: SmbiEmpresa; trocaEmpresa: boolean; solicitacaoHash: string };

/**
 * Decide o lado "empresa" do clique (as travas de aprovação/faturado/vínculo/movsai continuam no router).
 *  - Gate desligado: comportamento de sempre; pedido que já tem empresa (gate religado e desligado) não passa.
 *  - Gate ligado: empresa obrigatória, do catálogo, homologada; sem risco de escrita; sem reserva vigente;
 *    troca de empresa só antes da primeira reserva (smbi_empresa_travada_em nulo).
 */
export function decidirEnvio(e: { multiempresaAtivo: boolean; empresaCnpj: unknown; pedido: PedidoParaEnvio; agora: Date }): DecisaoEnvio {
  const { pedido } = e;
  if (!e.multiempresaAtivo) {
    if (pedido.smbiEmpresaCnpj) {
      return recusa(409, 'EMPRESA_JA_ESCOLHIDA', 'Este pedido já tem empresa escolhida e o envio com escolha de empresa está desligado.');
    }
    return { ok: true, modo: 'LEGADO' };
  }
  if (e.empresaCnpj === undefined || e.empresaCnpj === null || e.empresaCnpj === '') {
    return recusa(400, 'EMPRESA_OBRIGATORIA', 'Escolha a empresa antes de enviar ao SMBI.');
  }
  const empresa = empresaPorCnpj(e.empresaCnpj);
  if (!empresa) return recusa(400, 'EMPRESA_INVALIDA', 'Empresa inválida.');
  if (!empresa.homologada) return recusa(400, 'EMPRESA_NAO_HOMOLOGADA', `${empresa.curto} ainda não está habilitada`);
  // Escrita já iniciada e sem movsai gravado: o resultado é desconhecido. Só reconciliação humana (vínculo).
  if (pedido.smbiEscritaIniciadaEm && !pedido.smbiMovsaiId) {
    return recusa(409, 'RISCO_DE_ESCRITA', 'O robô já começou a criar este pedido no SMBI e não devolveu o resultado. Confira o SMBI e use "Vincular a pedido do SMBI".');
  }
  if (reservaVigente(pedido, e.agora)) {
    return recusa(409, 'RESERVA_VIGENTE', 'O robô está processando este pedido agora. Aguarde a resposta dele antes de enviar de novo.');
  }
  const trocaEmpresa = !!pedido.smbiEmpresaCnpj && pedido.smbiEmpresaCnpj !== empresa.cnpj;
  // Travada (uma reserva já existiu) = definitiva. Reserva vencida não destrava.
  if (pedido.smbiEmpresaTravadaEm && (trocaEmpresa || !pedido.smbiEmpresaCnpj)) {
    return recusa(409, 'EMPRESA_TRAVADA', 'A empresa deste pedido já foi travada (o robô já o reservou) e não pode mais ser trocada.');
  }
  return { ok: true, modo: 'MULTIEMPRESA', empresa, trocaEmpresa, solicitacaoHash: hashSolicitacao(pedido, empresa.cnpj) };
}

/** Cancelar o clique zera só o clique e o estado do robô. Empresa, travamento e marcador de risco ficam. */
export const PATCH_CANCELAR_ENVIO = {
  smbiSolicitadoEm: null,
  smbiSolicitadoPor: null,
  smbiEstado: null,
  smbiMotivoCodigo: null,
  smbiMotivoTexto: null,
  smbiTentativa: null,
  smbiAtualizadoEm: null,
  smbiConferidoEm: null,
} as const satisfies Partial<Record<keyof FatOrder, unknown>>;

// ── Vínculo manual ───────────────────────────────────────────────────────────

/**
 * Vínculo manual com o gate ligado: nunca com reserva vigente (o robô pode estar criando agora) e sempre
 * numa empresa definida: a do pedido, se travada/escolhida, ou a informada pelo admin (origem VINCULO_MANUAL).
 */
export function decidirVinculoEmpresa(e: {
  multiempresaAtivo: boolean; empresaCnpj: unknown; pedido: Pick<FatOrder, 'smbiEmpresaCnpj' | 'smbiEmpresaTravadaEm' | 'smbiReservadoAte'>; agora: Date;
}): Recusa | { ok: true; empresa: SmbiEmpresa | null; gravarEmpresa: boolean } {
  if (reservaVigente(e.pedido, e.agora)) {
    return recusa(409, 'RESERVA_VIGENTE', 'O robô está processando este pedido agora. Aguarde a resposta dele antes de vincular.');
  }
  if (!e.multiempresaAtivo) return { ok: true, empresa: null, gravarEmpresa: false };
  const informada = e.empresaCnpj === undefined || e.empresaCnpj === null || e.empresaCnpj === '' ? null : empresaPorCnpj(e.empresaCnpj);
  if (e.empresaCnpj !== undefined && e.empresaCnpj !== null && e.empresaCnpj !== '' && !informada) return recusa(400, 'EMPRESA_INVALIDA', 'Empresa inválida.');
  const doPedido = e.pedido.smbiEmpresaCnpj ? empresaPorCnpj(e.pedido.smbiEmpresaCnpj) : null;
  if (e.pedido.smbiEmpresaCnpj && !doPedido) return recusa(409, 'EMPRESA_INVALIDA', 'O pedido tem uma empresa fora do catálogo.');
  if (doPedido) {
    if (informada && informada.cnpj !== doPedido.cnpj) {
      return recusa(409, e.pedido.smbiEmpresaTravadaEm ? 'EMPRESA_TRAVADA' : 'EMPRESA_DIVERGENTE', 'O pedido já pertence a outra empresa do SMBI.');
    }
    return { ok: true, empresa: doPedido, gravarEmpresa: false };
  }
  if (!informada) return recusa(400, 'EMPRESA_OBRIGATORIA', 'Informe a empresa do SMBI onde o pedido existe.');
  return { ok: true, empresa: informada, gravarEmpresa: true };
}

/**
 * Ao desvincular, o marcador de risco só cai quando o resultado da escrita era CONHECIDO: pedido de empresa com movsai
 * gravado pelo próprio robô (retorno CRIADO), sem vínculo manual. Se a escrita nunca foi reconciliada (sem movsai) ou o
 * movsai veio de vínculo manual, o marcador fica — recriar poderia duplicar. Empresa e travamento nunca caem.
 */
export function patchDesvincularEmpresa(row: Pick<FatOrder, 'smbiEmpresaCnpj' | 'smbiMovsaiId' | 'smbiVinculoEstado'>): { smbiEscritaIniciadaEm?: null } {
  return row.smbiEmpresaCnpj && row.smbiMovsaiId && !row.smbiVinculoEstado ? { smbiEscritaIniciadaEm: null } : {};
}

// ── Fila do robô (gate ligado) ───────────────────────────────────────────────

type PedidoParaFila = EstadoSolicitacao
  & Pick<FatOrder, 'smbiEscritaIniciadaEm' | 'smbiMovsaiId' | 'aprovadoEm' | 'smbiSolicitadoPor' | 'smbiEstado' | 'smbiVinculoEstado'>;

/**
 * Por que o pedido NÃO pode ser entregue ao robô com a multiempresa ligada (null = pode). Soma-se às regras
 * de `isElegivelParaSmbi` (aprovação, prova do clique, sem movsai, sem vínculo, sem estado que para).
 */
export function motivoForaDaFila(row: PedidoParaFila): string | null {
  if (!isElegivelParaSmbi(row)) return 'NAO_ELEGIVEL';
  const empresa = empresaPorCnpj(row.smbiEmpresaCnpj);
  if (!empresa) return 'SEM_EMPRESA';
  if (!empresa.homologada) return 'EMPRESA_NAO_HOMOLOGADA';
  if (row.smbiEscritaIniciadaEm && !row.smbiMovsaiId) return 'RISCO_DE_ESCRITA';
  if (solicitacaoObsoleta(row)) return 'SOLICITACAO_OBSOLETA';
  return null;
}

// ── POST /api/smbi/pedidos/:id/iniciar ───────────────────────────────────────

export interface IniciarEntrada { empresaCnpj: string; solicitacaoId: string; solicitacaoHash: string }

type PedidoParaIniciar = PedidoParaFila & Pick<FatOrder, 'id' | 'status' | 'smbiReservaToken' | 'smbiReservadoAte'>;

/**
 * Ponto sem volta antes da primeira escrita física no SMBI. Só vale com: protocolo 2, gate e robô ligados,
 * empresa homologada igual à do pedido, solicitação vigente (id e hash batem e o pedido não foi editado) e a
 * reserva do próprio chamador ainda viva. Repetição com a reserva viva devolve `jaIniciado` — o worker NÃO
 * pode escrever de novo: reconcilia no SMBI primeiro. Falha ou timeout ambíguo nunca autoriza escrita.
 */
export function decidirIniciar(
  row: PedidoParaIniciar,
  entrada: IniciarEntrada,
  token: string | undefined,
  gates: { multiempresaAtivo: boolean; roboAtivo: boolean },
  protocolo: number,
  agora: Date,
): Recusa | { ok: true; jaIniciado: boolean } {
  if (protocolo < PROTOCOLO_MULTIEMPRESA) return recusa(400, 'PROTOCOLO_2_OBRIGATORIO', 'envie o header X-SMBI-Protocolo: 2');
  if (!gates.multiempresaAtivo || !gates.roboAtivo) return recusa(409, 'GATE_DESLIGADO', 'envio multiempresa ou robô desligado');
  if (!row.smbiEmpresaCnpj) return recusa(409, 'SEM_EMPRESA', 'o pedido não tem empresa escolhida');
  if (entrada.empresaCnpj !== row.smbiEmpresaCnpj) return recusa(409, 'EMPRESA_DIVERGENTE', 'empresa diferente da escolhida no pedido');
  const empresa = empresaPorCnpj(row.smbiEmpresaCnpj);
  if (!empresa?.homologada) return recusa(409, 'EMPRESA_NAO_HOMOLOGADA', 'empresa não habilitada');
  if (entrada.solicitacaoId !== row.smbiSolicitacaoId || entrada.solicitacaoHash !== row.smbiSolicitacaoHash || solicitacaoObsoleta(row)) {
    return recusa(409, 'SOLICITACAO_OBSOLETA', 'a solicitação não vale mais (pedido reenviado ou editado)');
  }
  if (!isElegivelParaSmbi(row) || row.status === 'faturado') return recusa(409, 'PEDIDO_NAO_ELEGIVEL', 'o pedido não está mais aguardando o robô');
  const leaseOk = !!token && !!row.smbiReservaToken && safeEqual(token, row.smbiReservaToken) && reservaVigente(row, agora);
  if (!leaseOk) return recusa(409, 'RESERVA_INVALIDA', 'reserva ausente, vencida ou de outro worker');
  return { ok: true, jaIniciado: !!row.smbiEscritaIniciadaEm };
}

// ── Retorno e demais rotas do robô para pedido COM empresa ───────────────────

type PedidoComEmpresa = Pick<FatOrder, 'id' | 'smbiEmpresaCnpj'>;

/** Pedido com empresa só conversa com worker de protocolo 2 (worker antigo não sabe a que empresa pertence). */
export function exigeProtocolo2(row: Pick<FatOrder, 'smbiEmpresaCnpj'>, protocolo: number): Recusa | null {
  if (row.smbiEmpresaCnpj && protocolo < PROTOCOLO_MULTIEMPRESA) {
    return recusa(400, 'PROTOCOLO_2_OBRIGATORIO', 'pedido com empresa exige o header X-SMBI-Protocolo: 2');
  }
  return null;
}

/** Faturamento / status / resultado do vínculo: a empresa do corpo tem que ser a do pedido (pedido legado: sem empresa). */
export function validarEmpresaDoRobo(row: PedidoComEmpresa, empresaCnpj: string | undefined, protocolo: number): Recusa | null {
  const p = exigeProtocolo2(row, protocolo);
  if (p) return p;
  if (!row.smbiEmpresaCnpj) {
    return empresaCnpj === undefined ? null : recusa(409, 'PEDIDO_SEM_EMPRESA', 'o pedido não tem empresa definida; o robô informou uma');
  }
  if (empresaCnpj === undefined) return recusa(400, 'EMPRESA_OBRIGATORIA', 'informe empresaCnpj');
  if (empresaCnpj !== row.smbiEmpresaCnpj) return recusa(409, 'EMPRESA_DIVERGENTE', 'empresa diferente da do pedido');
  return null;
}

export interface RetornoEmpresaEntrada {
  empresaCnpj?: string;
  solicitacaoId?: string;
  smbiMovsaiId?: string;
  estado?: string;
}

/**
 * Retorno do robô para pedido COM empresa: protocolo 2 + empresa + solicitação correspondentes; e, quando o
 * retorno encerra a tentativa (movsai ou estado), o token da reserva. Qualquer recusa acontece ANTES do UPDATE:
 * o token atual não é limpo por retorno tardio ou de empresa errada. Repetição idêntica de retorno já gravado
 * (token já liberado) continua idempotente. Pedido sem empresa: devolve `legado` e vale a regra antiga.
 */
export function decidirRetorno(
  row: PedidoComEmpresa & Pick<FatOrder, 'smbiSolicitacaoId' | 'smbiReservaToken' | 'smbiMovsaiId' | 'smbiEstado'>,
  body: RetornoEmpresaEntrada,
  token: string | undefined,
  protocolo: number,
): Recusa | { ok: true; legado: boolean; exigirToken: boolean } {
  if (!row.smbiEmpresaCnpj) {
    if (body.empresaCnpj !== undefined || body.solicitacaoId !== undefined) {
      return recusa(409, 'PEDIDO_SEM_EMPRESA', 'o pedido não tem empresa definida; o robô informou uma');
    }
    return { ok: true, legado: true, exigirToken: false };
  }
  const p = exigeProtocolo2(row, protocolo);
  if (p) return p;
  if (body.empresaCnpj === undefined) return recusa(400, 'EMPRESA_OBRIGATORIA', 'informe empresaCnpj');
  if (body.empresaCnpj !== row.smbiEmpresaCnpj) return recusa(409, 'EMPRESA_DIVERGENTE', 'empresa diferente da do pedido');
  if (body.solicitacaoId === undefined) return recusa(400, 'SOLICITACAO_OBRIGATORIA', 'informe solicitacaoId');
  if (body.solicitacaoId !== row.smbiSolicitacaoId) return recusa(409, 'SOLICITACAO_OBSOLETA', 'retorno de uma solicitação anterior');
  const encerra = body.smbiMovsaiId !== undefined || body.estado !== undefined;
  if (!encerra) return { ok: true, legado: false, exigirToken: false };
  if (token && row.smbiReservaToken && safeEqual(token, row.smbiReservaToken)) return { ok: true, legado: false, exigirToken: true };
  const repeticao = (body.smbiMovsaiId !== undefined && body.smbiMovsaiId === row.smbiMovsaiId)
    || (body.estado !== undefined && body.estado === row.smbiEstado);
  if (repeticao && !row.smbiReservaToken) return { ok: true, legado: false, exigirToken: false };
  return recusa(409, 'RESERVA_INVALIDA', 'token da reserva ausente ou diferente do atual');
}

// ── Visibilidade por protocolo (fila, /ligados, /vinculos) ───────────────────

/** Multiempresa ligada + worker de protocolo 1: a fila sai vazia (com aviso) e NADA é reservado. */
export const filaBloqueadaPorProtocolo = (multiempresaAtivo: boolean, protocolo: number): boolean =>
  multiempresaAtivo && protocolo < PROTOCOLO_MULTIEMPRESA;

/** Referência ERP = (empresa, movsai). O mesmo número em empresas diferentes são pedidos diferentes. */
export const chaveErp = (empresaCnpj: string | null, movsai: string): string => `${empresaCnpj ?? '-'}:${movsai}`;

interface LinhaLigada {
  pedidoId: string; movsaiPrincipal: string | null; movsaiVinculo: string[] | null; estado: string | null;
  cnpj: string; comissaoPct: number; empresaCnpj: string | null;
}

/** /ligados: worker v1 não recebe pedido que tenha empresa (procuraria o número na empresa errada). */
export function montarLigados(rows: LinhaLigada[], protocolo: number) {
  const visiveis = rows.filter((r) => protocolo >= PROTOCOLO_MULTIEMPRESA || !r.empresaCnpj);
  return {
    omitidos: rows.length - visiveis.length,
    ligados: visiveis.map((r) => ({
      pedidoId: r.pedidoId,
      empresaCnpj: r.empresaCnpj,
      movsaiNumeros: movsaisLigados({ smbiMovsaiId: r.movsaiPrincipal, smbiVinculoMovsais: r.movsaiVinculo }),
      vinculoEstado: r.estado,
      // Para a trava de documento (raiz do CNPJ/CPF) e a decisão de mandar comissaoPct.
      cnpj: r.cnpj,
      comissaoPct: r.comissaoPct,
    })),
  };
}

/** /vinculos: mesma regra de visibilidade. */
export function montarVinculos<T extends { empresaCnpj: string | null; movsaiNumeros: string[] | null }>(rows: T[], protocolo: number) {
  const visiveis = rows.filter((r) => protocolo >= PROTOCOLO_MULTIEMPRESA || !r.empresaCnpj);
  return { omitidos: rows.length - visiveis.length, vinculos: visiveis.map((r) => ({ ...r, movsaiNumeros: r.movsaiNumeros ?? [] })) };
}
