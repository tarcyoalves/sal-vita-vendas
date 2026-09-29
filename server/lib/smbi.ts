// ── Integração CRM → ERP SMBI ────────────────────────────────────────────────
// Funções puras usadas pelas rotas REST `/api/smbi/*` (api/index.ts): checagem
// de autenticação, validação do corpo do retorno do robô, mapeamento de linha
// → payload, e a regra de conflito do vínculo com o movsai do SMBI.
//
// De propósito, este arquivo NÃO importa `server/db` — assim os testes em
// `tests/smbi-api.test.ts` exercitam a lógica real sem precisar de banco nem
// de DATABASE_URL fictício (ver o comentário em tests/radar-enrichment.test.ts
// para o caso em que esse workaround é necessário).
import crypto from 'crypto';
import { z } from 'zod';
import type { FatOrder } from '../db/schema';
import { condicaoPorTexto } from '../../shared/smbiCondicoes';
import { SMBI_ESTADOS, SMBI_MOTIVO_CODIGOS, SMBI_ROBO_SEM_SINAL_MIN } from '../../shared/smbiEstados';

// ── Autenticação (Bearer SMBI_SYNC_SECRET) ───────────────────────────────────

/**
 * Compara duas strings em tempo constante. Tamanhos diferentes nunca batem —
 * essa checagem de comprimento não depende do conteúdo, só do tamanho (que já
 * não é segredo), então não reintroduz o vazamento por timing que
 * `crypto.timingSafeEqual` evita quando os buffers têm o mesmo tamanho.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Extrai o token de um header `Authorization: Bearer <token>`. */
export function extractBearerToken(authHeader: string | string[] | undefined): string | null {
  if (!authHeader || Array.isArray(authHeader)) return null;
  const match = /^Bearer\s+(.+)$/.exec(authHeader.trim());
  return match ? match[1].trim() : null;
}

/**
 * Falha fechado: sem `SMBI_SYNC_SECRET` configurado na Vercel, nenhuma
 * requisição é aceita — nunca cai para "sem checagem" como um endpoint que
 * esqueceu o segredo. Comparação em tempo constante contra timing attack.
 */
export function isAuthorized(secret: string | undefined, authHeader: string | string[] | undefined): boolean {
  if (!secret) return false;
  const token = extractBearerToken(authHeader);
  if (!token) return false;
  return constantTimeEqual(token, secret);
}

// ── GET /api/smbi/pedidos — mapeamento linha → payload do robô ──────────────

export interface SmbiPedidoPayload {
  id: string;
  sellerName: string;
  cnpj: string;
  razaoSocial: string;
  clienteNome: string;
  cidade: string;
  uf: string;
  status: string;
  itens: FatOrder['itens'];
  prazoPagamentoSal: string;
  prazoPagamentoFrete: string;
  smbiCondpagSalCod: string | null;
  smbiCondpagFreteCod: string | null;
  valorFretePorUnidade: number;
  observacoes: string;
  previsaoFaturamentoEm: string | null;
  aprovadoEm: string | null;
  aprovadoPor: string | null;
  /** Prova do clique em "Enviar pedido para SMBI": quando e quem. O robô só cria com isto preenchido. */
  smbiSolicitadoEm: string | null;
  smbiSolicitadoPor: string | null;
  /** Última edição do pedido pela tela (ou a criação). Se for depois do clique, o pedido foi
   * editado depois de solicitado e o robô deve reconferir antes de criar. */
  atualizadoEm: string;
}

/** Converte uma linha de `fat_orders` no payload que o robô consome. Nunca
 * inclui `smbiMovsaiId`/`numeroNfe`/`numeroCte`: o robô só LÊ pedidos
 * pendentes (que ainda não têm esses valores) e os DEVOLVE via POST/retorno —
 * não faz sentido ecoar de volta o que ele mesmo vai preencher. */
export function mapOrderToSmbiPayload(row: FatOrder): SmbiPedidoPayload {
  return {
    id: row.id,
    sellerName: row.sellerName,
    cnpj: row.cnpj,
    razaoSocial: row.razaoSocial,
    clienteNome: row.clienteNome,
    cidade: row.cidade,
    uf: row.uf,
    status: row.status,
    itens: row.itens,
    prazoPagamentoSal: row.prazoPagamentoSal,
    prazoPagamentoFrete: row.prazoPagamentoFrete,
    // Pedido antigo (prazo digitado à mão) tem a coluna vazia: deriva do texto quando ele
    // corresponde com certeza a uma condição do catálogo; senão continua null e o robô pula.
    smbiCondpagSalCod: row.smbiCondpagSalCod ?? condicaoPorTexto(row.prazoPagamentoSal)?.cod ?? null,
    smbiCondpagFreteCod: row.smbiCondpagFreteCod ?? condicaoPorTexto(row.prazoPagamentoFrete)?.cod ?? null,
    valorFretePorUnidade: row.valorFretePorUnidade,
    observacoes: row.observacoes,
    previsaoFaturamentoEm: row.previsaoFaturamentoEm,
    aprovadoEm: row.aprovadoEm,
    aprovadoPor: row.aprovadoPor,
    smbiSolicitadoEm: row.smbiSolicitadoEm,
    smbiSolicitadoPor: row.smbiSolicitadoPor,
    atualizadoEm: row.atualizadoEm ?? row.criadoEm,
  };
}

// ── POST /api/smbi/pedidos/:id/retorno — corpo + regra de conflito ──────────

const trimmedField = z.string().trim().min(1).max(40);

export const retornoBodySchema = z
  .object({
    smbiMovsaiId: trimmedField.optional(),
    numeroNfe: trimmedField.optional(),
    numeroCte: trimmedField.optional(),
    // Contrato robô ⇄ CRM, rota 2 (docs/INTEGRACAO-SMBI.md).
    estado: z.enum(SMBI_ESTADOS).optional(),
    motivoCodigo: z.enum(SMBI_MOTIVO_CODIGOS).optional(),
    motivoTexto: z.string().trim().min(1).max(300).optional(),
    tentativa: z.number().int().min(0).max(50).optional(),
    conferidoEm: z.string().datetime({ offset: true }).optional(),
  })
  .refine(
    (v) =>
      v.smbiMovsaiId !== undefined || v.numeroNfe !== undefined || v.numeroCte !== undefined || v.estado !== undefined,
    { message: 'Informe ao menos um campo: smbiMovsaiId, numeroNfe, numeroCte ou estado' },
  );

export type RetornoBody = z.infer<typeof retornoBodySchema>;

export type RetornoPatch = Partial<
  Pick<
    FatOrder,
    | 'smbiMovsaiId'
    | 'numeroNfe'
    | 'numeroCte'
    | 'smbiEstado'
    | 'smbiMotivoCodigo'
    | 'smbiMotivoTexto'
    | 'smbiTentativa'
    | 'smbiAtualizadoEm'
    | 'smbiConferidoEm'
  >
>;

/**
 * Regra do contrato: "CRIADO" só vale com movsai (no corpo ou já gravado) — o robô só declara
 * criado depois de conferir o pedido no SMBI. Devolve a mensagem do erro (HTTP 400) ou null.
 */
export function validarEstadoRetorno(
  existing: Pick<FatOrder, 'smbiMovsaiId'>,
  body: RetornoBody,
): string | null {
  if (body.estado === 'CRIADO' && !body.smbiMovsaiId && !existing.smbiMovsaiId) {
    return 'estado CRIADO exige smbiMovsaiId';
  }
  if ((body.motivoCodigo || body.motivoTexto) && body.estado === undefined) {
    return 'motivoCodigo/motivoTexto só valem junto com estado';
  }
  if (body.estado === 'CRIADO' && (body.motivoCodigo || body.motivoTexto)) {
    return 'estado CRIADO não tem motivo';
  }
  return null;
}

export interface RetornoResolution {
  /** true quando `smbiMovsaiId` já está gravado com um valor DIFERENTE do
   * enviado — o vínculo com o ERP nunca é sobrescrito silenciosamente
   * (HTTP 409 na rota). */
  conflict: boolean;
  /** Colunas a atualizar (vazio quando `conflict` é true). Reenviar o mesmo
   * valor já gravado é idempotente: entra no patch normalmente (no-op no
   * banco), nunca conta como conflito. */
  patch: RetornoPatch;
}

/**
 * Um pedido só vai para o robô do SMBI se o dono clicou em "Enviar pedido para
 * SMBI" (`smbiSolicitadoEm` + `smbiSolicitadoPor`, gravados juntos pelo clique),
 * se está aprovado e se ainda não tem movsai. Pedido sem `smbiSolicitadoPor` nunca
 * sai, mesmo com hora: prova o clique e exclui qualquer resíduo anterior a ela.
 * Vale para a lista E para a consulta `?id=` (a re-checagem do robô antes de
 * criar). Sem isso o robô pegou pedidos antigos e criou os movsai 1108–1113
 * (HANDOFF-HERMES.md, seção 7, caso N).
 */
export function isElegivelParaSmbi(
  row: Pick<FatOrder, 'aprovadoEm' | 'smbiSolicitadoEm' | 'smbiSolicitadoPor' | 'smbiMovsaiId'>,
): boolean {
  return (
    row.aprovadoEm != null &&
    !!row.smbiSolicitadoEm &&
    !!row.smbiSolicitadoPor &&
    row.smbiMovsaiId == null
  );
}

/**
 * Decide o que gravar a partir do estado atual do pedido e do corpo recebido.
 * NÃO toca `status`/`faturadoEm` — marcar como faturado continua sendo ação
 * humana no CRM (ver docs/INTEGRACAO-SMBI.md).
 */
export function resolveRetornoUpdate(
  existing: Pick<FatOrder, 'smbiMovsaiId' | 'numeroNfe' | 'numeroCte'>,
  body: RetornoBody,
): RetornoResolution {
  if (
    body.smbiMovsaiId !== undefined &&
    existing.smbiMovsaiId !== null &&
    existing.smbiMovsaiId !== body.smbiMovsaiId
  ) {
    return { conflict: true, patch: {} };
  }
  const patch: RetornoPatch = {};
  if (body.smbiMovsaiId !== undefined) patch.smbiMovsaiId = body.smbiMovsaiId;
  if (body.numeroNfe !== undefined) patch.numeroNfe = body.numeroNfe;
  if (body.numeroCte !== undefined) patch.numeroCte = body.numeroCte;
  if (body.estado !== undefined) {
    // O estado mais recente substitui o anterior por inteiro (incluindo o motivo).
    patch.smbiEstado = body.estado;
    patch.smbiMotivoCodigo = body.motivoCodigo ?? null;
    patch.smbiMotivoTexto = body.motivoTexto ?? null;
    patch.smbiTentativa = body.tentativa ?? null;
    patch.smbiAtualizadoEm = new Date().toISOString();
    if (body.conferidoEm !== undefined) patch.smbiConferidoEm = body.conferidoEm;
  }
  return { conflict: false, patch };
}

// ── POST /api/smbi/heartbeat + chave de parada (`roboAtivo`) ────────────────

const contador = z.number().int().min(0).max(1_000_000);

export const heartbeatBodySchema = z.object({
  versao: z.string().trim().min(1).max(40),
  ciclo: contador,
  pendentes: contador,
  pulados: contador,
  criados: contador,
});
export type HeartbeatBody = z.infer<typeof heartbeatBodySchema>;

/** true se o robô nunca deu sinal ou o último batimento tem mais de SMBI_ROBO_SEM_SINAL_MIN minutos. */
export function roboSemSinal(ultimoHeartbeatEm: string | null | undefined, agora: number = Date.now()): boolean {
  if (!ultimoHeartbeatEm) return true;
  const t = Date.parse(ultimoHeartbeatEm);
  if (Number.isNaN(t)) return true;
  return agora - t > SMBI_ROBO_SEM_SINAL_MIN * 60_000;
}

/**
 * O que a lista do robô devolve, dada a chave de parada. Desligado (padrão) a lista sai VAZIA —
 * a trava é do servidor, não da boa vontade do robô (caso 1115). `simular=1` deixa o robô ver o
 * que criaria, para conferir antes de ligar; nesse modo ele nunca deve criar nada.
 */
export function pedidosParaRobo<T>(roboAtivo: boolean, simular: boolean, elegiveis: T[]): T[] {
  return roboAtivo || simular ? elegiveis : [];
}

// ── upsertPedido: campos que a TELA nunca escreve ────────────────────────────
// `smbiMovsaiId`, `numeroNfe` e `numeroCte` são gravados SÓ pela API do robô
// (POST /api/smbi/pedidos/:id/retorno). Antes, o payload de um admin passava direto: com o
// espelho da tela desatualizado (o robô gravou o movsai depois que a tela carregou) ela
// mandava `null` e o UPDATE apagava o vínculo — o pedido voltava à fila e o robô o
// criava de novo no ERP (auditoria do Hermes, 28/09). Nenhum papel escreve esses três
// por aqui; `comissaoComercialProtegida` só muda por admin e nunca é zerada por `null`.
export interface RobotOwnedStored {
  smbiMovsaiId: string | null;
  numeroNfe: string | null;
  numeroCte: string | null;
  comissaoComercialProtegida: number | null;
}

export function resolveRobotOwnedFields(
  existing: RobotOwnedStored | undefined,
  payload: { comissaoComercialProtegida?: number | null },
  isAdmin: boolean,
): RobotOwnedStored {
  const storedComissao = existing?.comissaoComercialProtegida ?? null;
  return {
    smbiMovsaiId: existing?.smbiMovsaiId ?? null,
    numeroNfe: existing?.numeroNfe ?? null,
    numeroCte: existing?.numeroCte ?? null,
    comissaoComercialProtegida: isAdmin ? (payload.comissaoComercialProtegida ?? storedComissao) : storedComissao,
  };
}
