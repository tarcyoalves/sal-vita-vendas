import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { fatProducts, fatOrders, fatCommissions, fatOrderDeletionLogs, sellers } from '../db/schema';
import { eq } from 'drizzle-orm';

// ── Faturamento & Comissão (CRM Lembretes) ───────────────────────────────────
// Backend do módulo antes mantido em localStorage. IDs são gerados no cliente
// (text PK) para preservar a API síncrona do store. Escopo por papel:
//   • admin  → vê/edita tudo (catálogo de produtos, comissões, todos os pedidos)
//   • user   → catálogo (leitura), sua própria comissão, e só os SEUS pedidos

const itemPedidoSchema = z.object({
  id: z.string(),
  produtoId: z.string().nullable(),
  descricao: z.string(),
  quantidade: z.number(),
  pesoKg: z.number(),
  valorUnitario: z.number(),
});

const produtoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  pesoUnitarioKg: z.number(),
  valorUnitario: z.number(),
  ativo: z.boolean(),
  criadoEm: z.string(),
});

const pedidoSchema = z.object({
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
  faturadoEm: z.string().nullable(),
});

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
    const isAdmin = ctx.user.role === 'admin';
    const mySellerId = isAdmin ? null : await sellerIdForUser(ctx.user.id);

    const produtos = await db.select().from(fatProducts);

    const pedidos = isAdmin
      ? await db.select().from(fatOrders)
      : mySellerId != null
        ? await db.select().from(fatOrders).where(eq(fatOrders.sellerId, mySellerId))
        : [];

    const commissionRows = isAdmin
      ? await db.select().from(fatCommissions)
      : mySellerId != null
        ? await db.select().from(fatCommissions).where(eq(fatCommissions.sellerId, mySellerId))
        : [];

    const comissoes: Record<number, number> = {};
    for (const c of commissionRows) comissoes[c.sellerId] = c.pct;

    return { produtos, pedidos, comissoes };
  }),

  // ── Produtos (catálogo — admin) ────────────────────────────────────────────
  upsertProduto: adminProcedure
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
          },
        })
        .returning();
      return row;
    }),

  removeProduto: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db.delete(fatProducts).where(eq(fatProducts.id, input.id));
      return { ok: true };
    }),

  // ── Pedidos ────────────────────────────────────────────────────────────────
  upsertPedido: protectedProcedure
    .input(pedidoSchema)
    .mutation(async ({ ctx, input }) => {
      const values = { ...input };

      if (ctx.user.role !== 'admin') {
        const mySellerId = await sellerIdForUser(ctx.user.id);
        if (mySellerId == null) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Perfil de vendedor não encontrado' });
        }
        // Ownership: attendants can only touch their own orders.
        const [existing] = await db
          .select({ sellerId: fatOrders.sellerId })
          .from(fatOrders)
          .where(eq(fatOrders.id, input.id));
        if (existing && existing.sellerId !== mySellerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
        }
        values.sellerId = mySellerId;
      }

      const [row] = await db
        .insert(fatOrders)
        .values(values)
        .onConflictDoUpdate({
          target: fatOrders.id,
          set: {
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
            faturadoEm: values.faturadoEm,
          },
        })
        .returning();
      return row;
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

      if (ctx.user.role !== 'admin') {
        const mySellerId = await sellerIdForUser(ctx.user.id);
        if (existing.sellerId !== mySellerId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
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

  // ── Comissões (por atendente — admin) ──────────────────────────────────────
  setComissao: adminProcedure
    .input(z.object({ sellerId: z.number(), pct: z.number() }))
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
      const isAdmin = ctx.user.role === 'admin';
      const mySellerId = isAdmin ? null : await sellerIdForUser(ctx.user.id);
      let produtos = 0, pedidos = 0, comissoes = 0;

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
