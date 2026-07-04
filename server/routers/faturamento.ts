import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, staffProcedure } from '../trpc';
import { db } from '../db';
import { fatProducts, fatOrders, fatCommissions, fatOrderDeletionLogs, sellers, tasks } from '../db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { sendEmail } from '../email/resend';
import { renderSignature } from '../email/marketing';
import { gerarPedidoPdf } from '../pdf/pedidoPdf';
import type { Pedido } from '../../client/src/lib/faturamento/types';

// ── Faturamento & Comissão (CRM Lembretes) ───────────────────────────────────
// Backend do módulo antes mantido em localStorage. IDs são gerados no cliente
// (text PK) para preservar a API síncrona do store. Escopo por papel:
//   • admin/manager → vê/edita tudo (catálogo de produtos, comissões, todos os pedidos)
//   • user          → catálogo (leitura), sua própria comissão, e só os SEUS pedidos

const itemPedidoSchema = z.object({
  id: z.string(),
  produtoId: z.string().nullable(),
  descricao: z.string(),
  quantidade: z.number(),
  pesoKg: z.number(),
  valorUnitario: z.number(),
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
  valorPago: z.number().optional().default(0),
  aprovadoEm: z.string().nullable().optional().default(null),
  aprovadoPor: z.string().nullable().optional().default(null),
  createdByUserId: z.number().nullable().optional().default(null),
  createdByRole: z.string().nullable().optional().default(null),
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
    const hasFullAccess = ctx.user.role === 'admin' || ctx.user.role === 'manager';
    const mySellerId = hasFullAccess ? null : await sellerIdForUser(ctx.user.id);

    const produtos = await db.select().from(fatProducts);

    const pedidos = hasFullAccess
      ? await db.select().from(fatOrders)
      : mySellerId != null
        ? await db.select().from(fatOrders).where(eq(fatOrders.sellerId, mySellerId))
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
    .input(pedidoSchema)
    .mutation(async ({ ctx, input }) => {
      const values = { ...input };

      const [existing] = await db
        .select({ sellerId: fatOrders.sellerId })
        .from(fatOrders)
        .where(eq(fatOrders.id, input.id));

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
      }

      // Stamped only at creation; the update `set` below deliberately excludes
      // createdByUserId/createdByRole/aprovadoEm/aprovadoPor so later edits
      // (including by the attendant) never touch who created or approved it.
      if (!existing) {
        values.createdByUserId = ctx.user.id;
        values.createdByRole = ctx.user.role;
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
            valorPago: values.valorPago,
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

      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
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

      const pdfBuffer = await gerarPedidoPdf(pedido as unknown as Pedido);
      const numeroPedido = pedido.id.slice(0, 8).toUpperCase();
      const nomeCliente = pedido.razaoSocial || pedido.clienteNome || 'Cliente';
      const assinatura = seller?.sigOn && seller.sigHtml ? renderSignature(seller.sigHtml, seller) : '';

      const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 8px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
<tr><td style="padding:32px 32px 24px;">
<p style="margin:0 0 16px;font-size:15px;color:#444;">Olá, <strong>${nomeCliente}</strong>!</p>
<p style="margin:0 0 16px;font-size:15px;color:#444;">Segue em anexo o pedido de compras nº <strong>${numeroPedido}</strong> para sua aprovação.</p>
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
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Falha ao enviar e-mail (${result.reason ?? 'erro desconhecido'})` });
      }
      return { ok: true, email: task.email };
    }),

  // ── Comissões (por atendente — admin) ──────────────────────────────────────
  setComissao: staffProcedure
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
      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'manager';
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
