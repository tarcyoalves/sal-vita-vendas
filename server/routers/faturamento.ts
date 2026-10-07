import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { fatProducts, fatOrders, fatCommissions, fatOrderDeletionLogs, sellers, tasks, smbiRobotState, smbiOrderEvents } from '../db/schema';
import { eq, and, or, isNull, isNotNull, lte, desc } from 'drizzle-orm';
import { sendEmail } from '../email/resend';
import { renderSignature } from '../email/marketing';
import { escapeHtml } from '../lib/emailSanitize';
import { gerarPedidoPdf } from '../pdf/pedidoPdf';
import { resolveRobotOwnedFields, roboSemSinal } from '../lib/smbi';
import { camposPedidoNovoAtendente, catalogoPorId, reconstruirItensPedidoNovo, itensPedidoExistente } from '../lib/faturamentoNovoPedido';
import { userTaskFilter } from './tasks';
import { mergeProtegidoPeloEspelho, espelhoDescartouEdicao, atendentePodeRemover } from '../lib/faturamentoProtecao';
import {
  parseNumerosMovsai, PATCH_DESVINCULAR, movsaisLigados, resolverFaturamento, faturamentoDoVinculo,
  totalAcordadoDoPedido, pesoLiquidoDoPedido,
} from '../lib/smbiFaturamento';
import { SMBI_ROBO_SEM_SINAL_MIN } from '../../shared/smbiEstados';
import type { Pedido } from '../../client/src/lib/faturamento/types';

/** Ação humana na linha do tempo do pedido no SMBI (auditoria: quem, o quê, quando). */
async function registrarEventoSmbi(pedidoId: string, evento: string, porNome: string, dados: Record<string, unknown>) {
  await db.insert(smbiOrderEvents).values({ pedidoId, evento, dados, origem: 'tela', porNome });
}

// Anti clique-duplo do "Enviar pedido por e-mail": a tabela não tem coluna de "enviado em",
// então o controle é em memória (por instância serverless; reinicia no cold start).
// Limitação: duas instâncias diferentes ainda podem enviar duas vezes.
const ENVIO_PEDIDO_JANELA_MS = 60_000;
const envioPedidoRecente = new Map<string, number>();

// ── Faturamento & Comissão (CRM Lembretes) ───────────────────────────────────
// Backend do módulo antes mantido em localStorage. IDs são gerados no cliente
// (text PK) para preservar a API síncrona do store. Escopo por papel:
//   • admin/manager → vê/edita tudo (catálogo de produtos, comissões, todos os pedidos)
//   • user          → catálogo (leitura), sua própria comissão, e só os SEUS pedidos

const itemPedidoSchema = z.object({
  id: z.string(),
  produtoId: z.string().nullable(),
  descricao: z.string(),
  quantidade: z.number().nonnegative(),
  pesoKg: z.number().nonnegative(),
  valorUnitario: z.number().nonnegative(),
  pesoBrutoKg: z.number().optional().default(0),
  comissaoFixaPct: z.number().nullable().optional().default(null),
  isentoFrete: z.boolean().optional().default(false),
});

const produtoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  pesoUnitarioKg: z.number(),
  valorUnitario: z.number(),
  ativo: z.boolean(),
  criadoEm: z.string(),
  comissaoFixaPct: z.number().nullable().optional().default(null),
  isentoFrete: z.boolean().optional().default(false),
});

// Exportado só para teste (tests/smbi-api.test.ts confere que os 6 campos SMBI
// sobrevivem ao parse — o bug do caso M do HANDOFF-HERMES.md era justamente o
// zod descartando campos ausentes do schema de entrada).
export const pedidoSchema = z.object({
  id: z.string(),
  taskId: z.number().nullable(),
  sellerId: z.number().nullable(),
  sellerName: z.string(),
  clienteNome: z.string(),
  cnpj: z.string(),
  razaoSocial: z.string(),
  cidade: z.string(),
  uf: z.string(),
  status: z.enum(['estimado', 'faturado']),
  comissaoPct: z.number(),
  itens: z.array(itemPedidoSchema),
  itensEstimadoSnapshot: z.array(itemPedidoSchema).nullable(),
  prazoPagamentoSal: z.string(),
  prazoPagamentoFrete: z.string(),
  valorFretePorUnidade: z.number(),
  observacoes: z.string(),
  criadoEm: z.string(),
  // Mês de competência enquanto o pedido é estimado. Opcional para aceitar
  // pedidos legados (e clientes antigos em cache) sem quebrar a mutation.
  previsaoFaturamentoEm: z.string().nullable().optional().default(null),
  faturadoEm: z.string().nullable(),
  valorPago: z.number().optional().default(0),
  aprovadoEm: z.string().nullable().optional().default(null),
  aprovadoPor: z.string().nullable().optional().default(null),
  // Integração com ERP SMBI (smbi.com.br) — ver server/lib/smbi.ts e
  // docs/INTEGRACAO-SMBI.md. smbiCondpag*Cod vêm da tela (OrderDialog); os
  // outros quatro são escritos pelo robô/admin — upsertPedido e importLocal
  // impedem um atendente de sobrescrevê-los (ver comentário nesses handlers).
  smbiMovsaiId: z.string().nullable().optional().default(null),
  numeroNfe: z.string().nullable().optional().default(null),
  numeroCte: z.string().nullable().optional().default(null),
  smbiCondpagSalCod: z.string().nullable().optional().default(null),
  smbiCondpagFreteCod: z.string().nullable().optional().default(null),
  comissaoComercialProtegida: z.number().nullable().optional().default(null),
  createdByUserId: z.number().nullable().optional().default(null),
  createdByRole: z.string().nullable().optional().default(null),
});

// smbiMovsaiId, numeroNfe, numeroCte e comissaoComercialProtegida são
// escritos só pelo robô SMBI (via /api/smbi/pedidos/:id/retorno) ou pelo
// admin — nunca por um atendente salvando o pedido pela tela. upsertPedido e
// importLocal impedem que um payload de UI (ou um mirror desatualizado no
// cliente) apague ou reescreva o vínculo com o ERP.

// % de comissão cadastrada para o atendente (0 se não houver): pedido novo de atendente nasce com ela.
async function comissaoDoVendedor(sellerId: number): Promise<number> {
  const [row] = await db.select({ pct: fatCommissions.pct }).from(fatCommissions).where(eq(fatCommissions.sellerId, sellerId));
  return row?.pct ?? 0;
}

// taskId informado por atendente tem que ser tarefa dele (senão lê e-mail de cliente alheio em enviarPedidoEmail).
async function exigirTarefaDoAtendente(taskId: number | null | undefined, user: { id: number; name?: string | null }) {
  if (taskId == null) return;
  const filter = await userTaskFilter(user.id, user.name ?? '');
  const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), filter)).limit(1);
  if (!t) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa de outro atendente' });
}

async function sellerIdForUser(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: sellers.id })
    .from(sellers)
    .where(eq(sellers.userId, userId));
  return row?.id ?? null;
}

export const faturamentoRouter = router({
  // Um único round-trip carrega tudo que o store precisa (economiza Neon).
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const hasFullAccess = ctx.user.role === 'admin' || ctx.user.role === 'manager';
    const mySellerId = hasFullAccess ? null : await sellerIdForUser(ctx.user.id);

    const produtos = await db.select().from(fatProducts);

    const pedidos = hasFullAccess
      ? await db.select().from(fatOrders).orderBy(desc(fatOrders.criadoEm))
      : mySellerId != null
        ? await db.select().from(fatOrders).where(eq(fatOrders.sellerId, mySellerId)).orderBy(desc(fatOrders.criadoEm))
        : [];

    const commissionRows = hasFullAccess
      ? await db.select().from(fatCommissions)
      : mySellerId != null
        ? await db.select().from(fatCommissions).where(eq(fatCommissions.sellerId, mySellerId))
        : [];

    const comissoes: Record<number, number> = {};
    for (const c of commissionRows) comissoes[c.sellerId] = c.pct;

    return { produtos, pedidos, comissoes };
  }),

  // ── Produtos (catálogo — admin) ────────────────────────────────────────────
  upsertProduto: staffProcedure
    .input(produtoSchema)
    .mutation(async ({ input }) => {
      const [row] = await db
        .insert(fatProducts)
        .values(input)
        .onConflictDoUpdate({
          target: fatProducts.id,
          set: {
            nome: input.nome,
            pesoUnitarioKg: input.pesoUnitarioKg,
            valorUnitario: input.valorUnitario,
            ativo: input.ativo,
            comissaoFixaPct: input.comissaoFixaPct,
            isentoFrete: input.isentoFrete,
          },
        })
        .returning();
      return row;
    }),

  removeProduto: staffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(fatProducts).where(eq(fatProducts.id, input.id));
      return { ok: true };
    }),

  // ── Pedidos ────────────────────────────────────────────────────────────────
  upsertPedido: protectedProcedure
    // `acao`: o store marca "Faturar"/"Desfazer faturamento" (decisão humana); sem ela, um pedido
    // espelhado do SMBI não tem status/itens/comissão sobrescritos (cache velho da tela).
    .input(pedidoSchema.extend({ acao: z.enum(['faturar', 'desfazer']).optional() }))
    .mutation(async ({ ctx, input: { acao, ...input } }) => {
      const values = { ...input };
      const isAdmin = ctx.user.role === 'admin';
      // Algum item veio da tela com comissão fixa/isenção de frete diferente da de referência
      let itensAjustados = false;

      const [existing] = await db.select().from(fatOrders).where(eq(fatOrders.id, input.id));

      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        const mySellerId = await sellerIdForUser(ctx.user.id);
        if (mySellerId == null) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Perfil de vendedor não encontrado' });
        }
        // Ownership: attendants can only touch their own orders.
        if (existing && existing.sellerId !== mySellerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
        }
        values.sellerId = mySellerId;
        // Atendente nunca se aprova nem escolhe a própria comissão: a % de pedido novo vem do
        // cadastro (fat_commissions) e a de pedido existente é a já gravada (congelada).
        // Status/faturadoEm/valorPago de pedido existente continuam livres: "Faturar" e
        // "Desfazer" são ações legítimas do atendente (AttendantBilling). Pedido NOVO nunca
        // nasce faturado pela tela.
        values.aprovadoEm = null;
        values.aprovadoPor = null;
        if (!existing || existing.taskId !== input.taskId) await exigirTarefaDoAtendente(input.taskId, ctx.user);
        const catalogo = catalogoPorId(await db.select().from(fatProducts));
        if (existing) {
          values.comissaoPct = existing.comissaoPct;
          const r = itensPedidoExistente(input.itens, existing.itens, catalogo);
          values.itens = r.itens;
          itensAjustados = r.ajustados;
        } else {
          Object.assign(values, camposPedidoNovoAtendente(await comissaoDoVendedor(mySellerId)));
          const r = reconstruirItensPedidoNovo(input.itens, catalogo);
          values.itens = r.itens;
          itensAjustados = r.ajustados;
          // Pedido novo nasce estimado: o snapshot "de antes de faturar" só existe depois do
          // faturamento (store/robô) e alimenta relatório e "Desfazer"; a tela não o semeia.
          values.itensEstimadoSnapshot = null;
        }
      }

      // Campos do robô/admin: a tela NUNCA escreve smbiMovsaiId/numeroNfe/numeroCte (só o
      // POST /api/smbi/pedidos/:id/retorno), nem mesmo um admin — senão um espelho
      // desatualizado mandaria null e devolveria o pedido à fila do robô (duplicata no ERP).
      // Ver resolveRobotOwnedFields em server/lib/smbi.ts.
      Object.assign(values, resolveRobotOwnedFields(existing, input, isAdmin));
      // Espelho do SMBI: o save da tela não desfaz o que o robô já gravou.
      // `input` (não `values`): compara o que o cliente mandou com o gravado, antes de o servidor ajustar.
      const espelhoProtegido = espelhoDescartouEdicao(existing, input, acao);
      Object.assign(values, mergeProtegidoPeloEspelho(existing, values, acao));

      // Stamped only at creation; the update `set` below deliberately excludes
      // createdByUserId/createdByRole/aprovadoEm/aprovadoPor so later edits
      // (including by the attendant) never touch who created or approved it.
      if (!existing) {
        values.createdByUserId = ctx.user.id;
        values.createdByRole = ctx.user.role;
      }
      // Toda gravação pela tela carimba a edição; o robô compara com o clique (payload.atualizadoEm).
      const atualizadoEm = new Date().toISOString();

      const [row] = await db
        .insert(fatOrders)
        .values({ ...values, atualizadoEm })
        .onConflictDoUpdate({
          target: fatOrders.id,
          set: {
            atualizadoEm,
            taskId: values.taskId,
            sellerId: values.sellerId,
            sellerName: values.sellerName,
            clienteNome: values.clienteNome,
            cnpj: values.cnpj,
            razaoSocial: values.razaoSocial,
            cidade: values.cidade,
            uf: values.uf,
            status: values.status,
            comissaoPct: values.comissaoPct,
            itens: values.itens,
            itensEstimadoSnapshot: values.itensEstimadoSnapshot,
            prazoPagamentoSal: values.prazoPagamentoSal,
            prazoPagamentoFrete: values.prazoPagamentoFrete,
            valorFretePorUnidade: values.valorFretePorUnidade,
            observacoes: values.observacoes,
            previsaoFaturamentoEm: values.previsaoFaturamentoEm,
            faturadoEm: values.faturadoEm,
            valorPago: values.valorPago,
            smbiCondpagSalCod: values.smbiCondpagSalCod,
            smbiCondpagFreteCod: values.smbiCondpagFreteCod,
            smbiMovsaiId: values.smbiMovsaiId,
            numeroNfe: values.numeroNfe,
            numeroCte: values.numeroCte,
            comissaoComercialProtegida: values.comissaoComercialProtegida,
          },
        })
        .returning();
      // espelhoProtegido: o servidor descartou uma edição de campo protegido (pedido espelhado do
      // SMBI); a tela deve avisar e recarregar em vez de mostrar o valor otimista.
      return { ...row, espelhoProtegido, itensAjustados };
    }),

  removePedido: protectedProcedure
    .input(z.object({
      id: z.string(),
      reason: z.string().trim().min(5).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(fatOrders)
        .where(eq(fatOrders.id, input.id));
      if (!existing) return { ok: true };

      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        const mySellerId = await sellerIdForUser(ctx.user.id);
        if (existing.sellerId !== mySellerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
        }
        if (!atendentePodeRemover(existing)) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Pedido faturado ou ligado ao SMBI só pode ser excluído por administrador ou gerente.',
          });
        }
      }

      const valorTotal = existing.itens.reduce(
        (s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valorUnitario) || 0),
        0,
      );

      await db.insert(fatOrderDeletionLogs).values({
        pedidoId: existing.id,
        clienteNome: existing.clienteNome,
        cnpj: existing.cnpj,
        valorTotal,
        sellerId: existing.sellerId,
        sellerName: existing.sellerName,
        deletedByUserId: ctx.user.id,
        deletedByName: ctx.user.name,
        reason: input.reason.trim(),
      });

      await db.delete(fatOrders).where(eq(fatOrders.id, input.id));
      return { ok: true };
    }),

  // Envia a solicitação do pedido para criação no SMBI (ação manual do admin/manager)
  dispararSmbi: staffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [pedido] = await db.select().from(fatOrders).where(eq(fatOrders.id, input.id));
      if (!pedido) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      if (!pedido.aprovadoEm) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'O pedido precisa estar aprovado antes de enviar ao SMBI' });
      }
      if (pedido.smbiMovsaiId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Pedido já criado no SMBI (movsai ${pedido.smbiMovsaiId})` });
      }
      // Pedido já faturado no CRM é pedido que já embarcou: no SMBI ele já existe (caso 1115).
      if (pedido.status === 'faturado') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Este pedido já está faturado. Não crie outro no SMBI: use "Vincular a pedido do SMBI".',
        });
      }
      if (pedido.smbiVinculoEstado) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este pedido está vinculado a um pedido do SMBI. Desvincule antes de enviar.' });
      }

      // UPDATE condicional: só grava se ninguém (robô) reservou o pedido nesse instante, senão o
      // novo clique zeraria a reserva no meio da criação e o robô pegaria o pedido de novo.
      const agoraIso = new Date().toISOString();
      const [row] = await db
        .update(fatOrders)
        .set({
          smbiSolicitadoEm: agoraIso,
          smbiSolicitadoPor: ctx.user.name,
          // Novo clique = nova tentativa: o estado/motivo da anterior (ex.: PENDENTE) sai da tela.
          smbiEstado: null,
          smbiMotivoCodigo: null,
          smbiMotivoTexto: null,
          smbiTentativa: null,
          smbiAtualizadoEm: null,
          smbiConferidoEm: null,
          smbiReservaToken: null,
          smbiReservadoAte: null,
        })
        .where(and(
          eq(fatOrders.id, input.id),
          isNull(fatOrders.smbiMovsaiId),
          or(isNull(fatOrders.smbiReservadoAte), lte(fatOrders.smbiReservadoAte, agoraIso)),
        ))
        .returning();
      if (!row) {
        throw new TRPCError({ code: 'CONFLICT', message: 'O robô está processando este pedido agora. Aguarde a resposta dele antes de enviar de novo.' });
      }
      await registrarEventoSmbi(input.id, 'ENVIO_SOLICITADO', ctx.user.name, { tentativaAnterior: pedido.smbiEstado ?? null });
      // Prova nos logs de quem pediu e quando (o CRM não guardava isto: caso 1115).
      console.log(`[smbi] dispararSmbi pedido=${input.id} por=${ctx.user.name} (id ${ctx.user.id})`);
      return row;
    }),

  // Desfaz um clique por engano ANTES de o robô pegar o pedido. Sem efeito depois que o robô
  // reservou ou criou (aí o caminho é o vínculo/desvínculo).
  cancelarSmbi: staffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const agoraIso = new Date().toISOString();
      const [row] = await db
        .update(fatOrders)
        .set({
          smbiSolicitadoEm: null,
          smbiSolicitadoPor: null,
          smbiEstado: null,
          smbiMotivoCodigo: null,
          smbiMotivoTexto: null,
          smbiTentativa: null,
          smbiAtualizadoEm: null,
          smbiConferidoEm: null,
        })
        .where(and(
          eq(fatOrders.id, input.id),
          isNull(fatOrders.smbiMovsaiId),
          isNotNull(fatOrders.smbiSolicitadoEm),
          or(isNull(fatOrders.smbiReservadoAte), lte(fatOrders.smbiReservadoAte, agoraIso)),
        ))
        .returning();
      if (!row) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Não dá para cancelar: o pedido não está aguardando o robô, ou o robô já está processando/criou.',
        });
      }
      await registrarEventoSmbi(input.id, 'ENVIO_CANCELADO', ctx.user.name, {});
      console.log(`[smbi] cancelarSmbi pedido=${input.id} por=${ctx.user.name} (id ${ctx.user.id})`);
      return row;
    }),

  // Painel do robô do SMBI (só admin/gerente): chave de parada + último batimento.
  smbiRoboStatus: staffProcedure.query(async () => {
    const [s] = await db.select().from(smbiRobotState).where(eq(smbiRobotState.id, 1));
    const semSinal = roboSemSinal(s?.ultimoHeartbeatEm);
    return {
      roboAtivo: s?.roboAtivo === true,
      ultimoHeartbeatEm: s?.ultimoHeartbeatEm ?? null,
      versao: s?.versao ?? null,
      ciclo: s?.ciclo ?? null,
      pendentes: s?.pendentes ?? null,
      pulados: s?.pulados ?? null,
      criados: s?.criados ?? null,
      atualizadoPor: s?.atualizadoPor ?? null,
      atualizadoEm: s?.atualizadoEm ?? null,
      semSinal,
      limiteSemSinalMin: SMBI_ROBO_SEM_SINAL_MIN,
    };
  }),

  // Chave de parada do robô (CONTRATO-ROBO-CRM.md, rota 9). Só admin. Desligada, a lista do
  // robô sai vazia no servidor. Nasce desligada.
  setRoboAtivo: adminProcedure
    .input(z.object({ ativo: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const dados = { roboAtivo: input.ativo, atualizadoPor: ctx.user.name, atualizadoEm: new Date().toISOString() };
      await db
        .insert(smbiRobotState)
        .values({ id: 1, ...dados })
        .onConflictDoUpdate({ target: smbiRobotState.id, set: dados });
      console.log(`[smbi] setRoboAtivo ativo=${input.ativo} por=${ctx.user.name} (id ${ctx.user.id})`);
      return { ok: true, roboAtivo: input.ativo };
    }),

  // Vincula o pedido a um movsai que JÁ EXISTE no SMBI (ex.: pedido aprovado tarde, que já
  // tinha sido criado e embarcado lá). Ação explícita do admin: o robô nunca cria pedido
  // que já tem movsai. Pode substituir um vínculo errado (caso 1115 → 1071).
  // Aceita mais de um número ("1071, 1072": carga dividida em vários pedidos). O vínculo vale na
  // hora (o robô nunca mais cria esse pedido) e o robô confere no SMBI depois (cliente, produto e
  // quantidade); divergência fica aguardando confirmação do administrador.
  vincularSmbi: adminProcedure
    .input(z.object({ id: z.string(), movsais: z.string().trim().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const numeros = parseNumerosMovsai(input.movsais);
      if (!numeros) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe só números do SMBI, separados por vírgula (até 20).' });
      }
      const [antes] = await db.select().from(fatOrders).where(eq(fatOrders.id, input.id));
      if (!antes) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      const agoraIso = new Date().toISOString();
      const [row] = await db
        .update(fatOrders)
        .set({
          smbiMovsaiId: numeros[0],
          smbiVinculoMovsais: numeros,
          smbiVinculoEstado: 'PENDENTE_CONFERENCIA',
          smbiVinculoPor: ctx.user.name,
          smbiVinculoEm: agoraIso,
          smbiVinculoResultado: null,
          smbiEstado: null, smbiMotivoCodigo: null, smbiMotivoTexto: null, smbiTentativa: null,
          smbiAtualizadoEm: null, smbiConferidoEm: null,
          smbiReservaToken: null, smbiReservadoAte: null,
        })
        .where(eq(fatOrders.id, input.id))
        .returning();
      await registrarEventoSmbi(input.id, 'VINCULADO', ctx.user.name, {
        movsais: numeros,
        anterior: antes.smbiVinculoMovsais ?? (antes.smbiMovsaiId ? [antes.smbiMovsaiId] : []),
      });
      console.log(
        `[smbi] vincularSmbi pedido=${input.id} movsais ${antes.smbiMovsaiId ?? '(vazio)'} -> ${numeros.join(',')} por=${ctx.user.name} (id ${ctx.user.id})`,
      );
      return row;
    }),

  // Desfaz o vínculo com o SMBI (vínculo errado, como o do 1115 apagado). Auditado. O pedido só
  // volta ao robô com um NOVO clique em "Enviar pedido para SMBI".
  desvincularSmbi: adminProcedure
    .input(z.object({ id: z.string(), motivo: z.string().trim().min(5).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const [antes] = await db.select().from(fatOrders).where(eq(fatOrders.id, input.id));
      if (!antes) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      if (!antes.smbiMovsaiId && !antes.smbiVinculoEstado) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este pedido não está vinculado ao SMBI.' });
      }
      const [row] = await db.update(fatOrders).set(PATCH_DESVINCULAR).where(eq(fatOrders.id, input.id)).returning();
      await registrarEventoSmbi(input.id, 'DESVINCULADO', ctx.user.name, {
        motivo: input.motivo,
        anterior: movsaisLigados(antes),
      });
      console.log(`[smbi] desvincularSmbi pedido=${input.id} (era ${movsaisLigados(antes).join(',') || '-'}) por=${ctx.user.name} (id ${ctx.user.id})`);
      return row;
    }),

  // O administrador aceita um vínculo que o robô marcou com divergência (ex.: quantidade diferente
  // por corte de carga). Se o SMBI já faturou, espelha o faturamento agora.
  confirmarVinculoSmbi: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [antes] = await db.select().from(fatOrders).where(eq(fatOrders.id, input.id));
      if (!antes) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      if (antes.smbiVinculoEstado !== 'VINCULO_COM_DIVERGENCIA') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não há divergência de vínculo para confirmar neste pedido.' });
      }
      const patch: Partial<typeof fatOrders.$inferInsert> = { smbiVinculoEstado: 'CONFERIDO' };
      const fat = antes.smbiVinculoResultado ? faturamentoDoVinculo(antes.smbiVinculoResultado) : null;
      if (fat) {
        const r = resolverFaturamento(antes, fat, totalAcordadoDoPedido(antes), new Date(), pesoLiquidoDoPedido(antes));
        if (!r.erro) Object.assign(patch, r.patch);
      }
      const [row] = await db.update(fatOrders).set(patch).where(eq(fatOrders.id, input.id)).returning();
      await registrarEventoSmbi(input.id, 'VINCULO_CONFIRMADO', ctx.user.name, { movsais: movsaisLigados(antes) });
      console.log(`[smbi] confirmarVinculoSmbi pedido=${input.id} por=${ctx.user.name} (id ${ctx.user.id})`);
      return row;
    }),

  // Linha do tempo do pedido no SMBI (robô + ações da tela). Só admin/gerente.
  smbiEventos: staffProcedure
    .input(z.object({ pedidoId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(smbiOrderEvents)
        .where(eq(smbiOrderEvents.pedidoId, input.pedidoId))
        .orderBy(desc(smbiOrderEvents.id))
        .limit(100);
    }),

  // Revisão do admin/manager — informativa: não bloqueia nenhuma ação do
  // atendente, só marca o pedido como conferido e libera a "cópia" para envio.
  aprovarPedido: staffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .update(fatOrders)
        .set({ aprovadoEm: new Date().toISOString(), aprovadoPor: ctx.user.name })
        .where(eq(fatOrders.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      return row;
    }),

  // Pedidos criados por atendentes ainda não revisados pelo admin — alimenta o
  // banner de notificação no dashboard.
  pendingApproval: staffProcedure.query(async () => {
    return db
      .select()
      .from(fatOrders)
      .where(and(isNull(fatOrders.aprovadoEm), eq(fatOrders.createdByRole, 'user')))
      .orderBy(desc(fatOrders.criadoEm));
  }),

  // Envia a cópia do pedido (PDF anexado) para o e-mail do cliente cadastrado
  // e confirmado na tarefa — mesmo padrão de "só e-mail confirmado entra em
  // disparo" usado no resto do sistema. Exige aprovação prévia do admin/manager
  // (mesma regra do botão "Gerar cópia"), e sempre usa a assinatura do
  // atendente dono do pedido, igual aos outros envios de e-mail do sistema.
  enviarPedidoEmail: protectedProcedure
    .input(z.object({ pedidoId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [pedido] = await db.select().from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
      if (!pedido) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });

      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        const mySellerId = await sellerIdForUser(ctx.user.id);
        if (pedido.sellerId !== mySellerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
        }
      }

      if (!pedido.aprovadoEm) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'O pedido precisa ser aprovado antes de enviar ao cliente' });
      }
      if (pedido.taskId && ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        await exigirTarefaDoAtendente(pedido.taskId, ctx.user);
      }
      if (!pedido.taskId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pedido sem tarefa vinculada — não há e-mail de cliente para enviar' });
      }

      const [task] = await db.select({ email: tasks.email, emailConfirmed: tasks.emailConfirmed })
        .from(tasks).where(eq(tasks.id, pedido.taskId));
      if (!task?.email || !task.emailConfirmed) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum e-mail confirmado para o cliente desta tarefa' });
      }

      let seller: { name: string; email: string; phone: string | null; department: string | null; sigHtml: string | null; sigOn: boolean } | undefined;
      if (pedido.sellerId) {
        [seller] = await db.select({
          name: sellers.name, email: sellers.email, phone: sellers.phone, department: sellers.department,
          sigHtml: sellers.emailSignatureHtml, sigOn: sellers.emailSignatureEnabled,
        }).from(sellers).where(eq(sellers.id, pedido.sellerId));
      }

      const agora = Date.now();
      for (const [k, t] of envioPedidoRecente) if (agora - t > ENVIO_PEDIDO_JANELA_MS) envioPedidoRecente.delete(k);
      if (envioPedidoRecente.has(pedido.id)) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Enviado há pouco' });
      }
      envioPedidoRecente.set(pedido.id, agora);

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await gerarPedidoPdf(pedido as unknown as Pedido);
      } catch (e) {
        envioPedidoRecente.delete(pedido.id);
        throw e;
      }
      const numeroPedido = pedido.id.slice(0, 8).toUpperCase();
      const nomeCliente = escapeHtml(pedido.razaoSocial || pedido.clienteNome || 'Cliente');
      const assinatura = seller?.sigOn && seller.sigHtml ? renderSignature(seller.sigHtml, seller) : '';

      const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 8px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
<tr><td style="padding:32px 32px 24px;">
<p style="margin:0 0 16px;font-size:15px;color:#444;">Olá, <strong>${nomeCliente}</strong>!</p>
<p style="margin:0 0 16px;font-size:15px;color:#444;">Segue em anexo o pedido de compras nº <strong>${escapeHtml(numeroPedido)}</strong> para sua aprovação.</p>
<p style="margin:0 0 16px;font-size:15px;color:#444;">Qualquer dúvida, estamos à disposição.</p>
${assinatura ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;">${assinatura}</div>` : ''}
</td></tr>
<tr><td style="background:#f4f4f4;padding:16px 32px;border-top:1px solid #e0e0e0;text-align:center;">
<p style="margin:0;font-size:12px;color:#888;"><strong>Sal Vita</strong> — Sistema de Gestão</p>
</td></tr>
</table></td></tr></table></body></html>`;

      const result = await sendEmail(
        task.email,
        `Pedido de Compras Nº ${numeroPedido} — Sal Vita`,
        html,
        [{ filename: `pedido-${numeroPedido}.pdf`, content: pdfBuffer.toString('base64') }],
      );

      if (!result.ok) {
        envioPedidoRecente.delete(pedido.id); // falhou: permite tentar de novo
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Falha ao enviar e-mail (${result.reason ?? 'erro desconhecido'})` });
      }
      return { ok: true, email: task.email };
    }),

  // Gera o mesmo PDF anexado ao e-mail para download direto pelo navegador —
  // usado pelo botão "Baixar PDF" no lugar de window.print(). Evita de vez o
  // cabeçalho/rodapé que o Chrome injeta em "Salvar como PDF" (título da
  // página + URL + data), que não tem como ser suprimido via CSS: é uma opção
  // do próprio diálogo de impressão do navegador, fora do nosso controle.
  baixarPedidoPdf: protectedProcedure
    .input(z.object({ pedidoId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [pedido] = await db.select().from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
      if (!pedido) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });

      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        const mySellerId = await sellerIdForUser(ctx.user.id);
        if (pedido.sellerId !== mySellerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
        }
      }

      const pdfBuffer = await gerarPedidoPdf(pedido as unknown as Pedido);
      const numeroPedido = pedido.id.slice(0, 8).toUpperCase();
      return { filename: `pedido-${numeroPedido}.pdf`, base64: pdfBuffer.toString('base64') };
    }),

  // ── Comissões (por atendente — admin) ──────────────────────────────────────
  setComissao: staffProcedure
    .input(z.object({ sellerId: z.number(), pct: z.number().min(0).max(100) }))
    .mutation(async ({ input }) => {
      await db
        .insert(fatCommissions)
        .values({ sellerId: input.sellerId, pct: input.pct })
        .onConflictDoUpdate({
          target: fatCommissions.sellerId,
          set: { pct: input.pct },
        });
      return { ok: true };
    }),

  // ── Importação única do localStorage → Neon (idempotente por id) ────────────
  // Chamada uma vez por navegador pelo store, para não perder dados da fase
  // visual. Admin importa tudo; atendente importa só os próprios pedidos.
  importLocal: protectedProcedure
    .input(z.object({
      produtos: z.array(produtoSchema).optional(),
      pedidos: z.array(pedidoSchema).optional(),
      comissoes: z.record(z.string(), z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'manager';
      const mySellerId = isAdmin ? null : await sellerIdForUser(ctx.user.id);
      const pctDoVendedor = mySellerId != null ? await comissaoDoVendedor(mySellerId) : 0;
      let produtos = 0, pedidos = 0, comissoes = 0;
      const catalogoImport = catalogoPorId(isAdmin || !input.pedidos?.length ? [] : await db.select().from(fatProducts));

      if (isAdmin && input.produtos?.length) {
        for (const p of input.produtos) {
          try {
            await db.insert(fatProducts).values(p).onConflictDoNothing({ target: fatProducts.id });
            produtos++;
          } catch { /* skip bad row */ }
        }
      }

      if (input.pedidos?.length) {
        for (const p of input.pedidos) {
          if (!isAdmin) {
            if (mySellerId == null) break;
            p.sellerId = mySellerId; // force ownership for attendants
            // Same rule as upsertPedido: a non-admin import can never seed the
            // robot/admin-owned SMBI fields (legacy localStorage payloads
            // predate this feature and never carried real values anyway).
            p.smbiMovsaiId = null;
            p.numeroNfe = null;
            p.numeroCte = null;
            p.comissaoComercialProtegida = null;
            // Autoria e aprovação são do servidor; a % vem do cadastro, não do localStorage.
            p.createdByUserId = ctx.user.id;
            p.createdByRole = ctx.user.role;
            // Mesmas regras de pedido novo de upsertPedido: estimado, sem faturamento/pagamento
            // e itens (preço/comissão fixa) reconstruídos do catálogo.
            Object.assign(p, camposPedidoNovoAtendente(pctDoVendedor));
            p.itens = reconstruirItensPedidoNovo(p.itens, catalogoImport).itens;
            p.itensEstimadoSnapshot = null;
            try { await exigirTarefaDoAtendente(p.taskId, ctx.user); } catch { continue; }
          }
          try {
            await db.insert(fatOrders).values(p).onConflictDoNothing({ target: fatOrders.id });
            pedidos++;
          } catch { /* skip bad row */ }
        }
      }

      if (isAdmin && input.comissoes) {
        for (const [sellerId, pct] of Object.entries(input.comissoes)) {
          const sid = Number(sellerId);
          if (!Number.isFinite(sid)) continue;
          try {
            await db.insert(fatCommissions).values({ sellerId: sid, pct })
              .onConflictDoNothing({ target: fatCommissions.sellerId });
            comissoes++;
          } catch { /* skip */ }
        }
      }

      return { produtos, pedidos, comissoes };
    }),
});
