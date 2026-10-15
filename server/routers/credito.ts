// Análise de crédito (CRM Lembretes) — ver docs/ANALISE-CREDITO.md e shared/credito.ts.
// Só admin dispara consulta paga. Payload bruto e sócios nunca saem deste arquivo para atendente.
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { router, protectedProcedure, staffProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { creditQueries, creditReports, creditSettings, fatOrders, sellers, tasks, users } from '../db/schema';
import { userTaskFilter } from './tasks';
import {
  SEMAFORO, calcularVeredito, relatorioValido, type GrupoAnotacao, type RelatorioCredito, type Veredito,
} from '../../shared/credito';
import { SQL_ACENTOS, SQL_SEM_ACENTOS } from '../../shared/searchText';
import { validarDocumento } from '../lib/credito/documento';
import { decidirCache, LIMITE_MENSAL_PADRAO, limiteMensalValido } from '../lib/credito/politica';
import { montarFiltrosListagem, POR_PAGINA_MAX } from '../lib/credito/listagem';
import {
  desvincularRelatorioDoPedido, lerConfigCredito, ultimoRelatorioDoDocumento, usadasNoMes, vincularRelatorioAoPedido,
} from '../lib/credito/repo';
import { getProvedorCredito } from '../lib/credito/provedores';
import { ErroProvedorCredito } from '../lib/credito/provedores/tipos';
import { consultarSaldoApiFull } from '../lib/credito/provedores/boavistaApifull';
import { gerarPdfCredito } from '../lib/credito/pdf';

const comoVeredito = (s: string): Veredito => (s === 'APROVADO' || s === 'COM_RESTRICAO' ? s : 'REPROVADO_A_PRAZO');
const ehStaff = (role: string) => role === 'admin' || role === 'manager';
const qtd = (g: GrupoAnotacao) => (g.consultado ? g.quantidade : null);

export function resumoAnotacoes(r: RelatorioCredito) {
  const a = r.anotacoes;
  return {
    protestos: qtd(a.protestos), pendenciasFinanceiras: qtd(a.pendenciasFinanceiras), chequesSemFundo: qtd(a.chequesSemFundo),
    acoesJudiciais: qtd(a.acoesJudiciais), falenciaRecuperacao: qtd(a.falenciaRecuperacao),
  };
}

async function sellerIdDoUsuario(userId: number): Promise<number | null> {
  const [row] = await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.userId, userId));
  return row?.id ?? null;
}

/** Atendente só vê documento de tarefa dele (tasks.cnpj) ou de pedido dele (fat_orders.sellerId). */
async function atendentePodeVerDocumento(user: { id: number; name: string }, documento: string): Promise<boolean> {
  const filtro = await userTaskFilter(user.id, user.name ?? '');
  const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.cnpj, documento), filtro)).limit(1);
  if (t) return true;
  const sid = await sellerIdDoUsuario(user.id);
  if (sid === null) return false;
  const r = await db.execute(sql`
    SELECT 1 FROM fat_orders WHERE seller_id = ${sid}::integer AND regexp_replace(cnpj, '\\D', '', 'g') = ${documento} LIMIT 1`);
  return r.rows.length > 0;
}

function cartaoDoRelatorio(row: typeof creditReports.$inferSelect) {
  const veredito = comoVeredito(row.veredito);
  return {
    id: row.id,
    consultadoEm: row.consultadoEm,
    veredito,
    motivos: row.motivos,
    semaforo: SEMAFORO[veredito],
    score: row.relatorio.score.valor,
    probabilidadeInadimplencia: row.relatorio.score.probabilidadeInadimplencia,
    resumo: resumoAnotacoes(row.relatorio),
    valido: relatorioValido(row.consultadoEm),
    razaoSocial: row.relatorio.cadastro.razaoSocial ?? row.razaoSocial,
  };
}

const documentoInput = z.string().min(1).max(30);

function erroDocumento(documento: string, tipo?: 'CNPJ' | 'CPF') {
  const v = validarDocumento(documento, tipo);
  if (!v.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: v.erro });
  return v;
}

export const creditoRouter = router({
  status: protectedProcedure.query(async () => {
    const provedor = getProvedorCredito();
    const [cfg, usadas] = await Promise.all([lerConfigCredito(), usadasNoMes()]);
    return {
      provedor: provedor.nome, simulado: provedor.nome === 'simulado',
      limiteMensal: cfg.limiteMensal, usadasNoMes: usadas, bloqueioAtivo: cfg.bloqueioAtivo,
    };
  }),

  ultimo: protectedProcedure
    .input(z.object({ documento: documentoInput }))
    .query(async ({ ctx, input }) => {
      const documento = input.documento.replace(/\D/g, '');
      if (!ehStaff(ctx.user.role) && !(await atendentePodeVerDocumento(ctx.user, documento))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Documento fora da sua carteira' });
      }
      const row = await ultimoRelatorioDoDocumento(documento);
      return row ? cartaoDoRelatorio(row) : null;
    }),

  relatorio: staffProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(creditReports).where(eq(creditReports.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado' });
      const veredito = comoVeredito(row.veredito);
      return {
        id: row.id, relatorio: row.relatorio, veredito, motivos: row.motivos, semaforo: SEMAFORO[veredito],
        consultadoEm: row.consultadoEm, provedor: row.provedor, produto: row.produto, custoReais: row.custoReais,
        consultadoPorUserId: row.consultadoPorUserId, motivo: row.motivo, taskId: row.taskId,
      };
    }),

  consultar: adminProcedure
    .input(z.object({
      documento: documentoInput,
      tipo: z.enum(['CNPJ', 'CPF']).optional(),
      motivo: z.string().trim().min(5).max(300),
      forcarNova: z.boolean().optional(),
      taskId: z.number().int().optional(),
      pedidoId: z.string().min(1).max(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { documento, tipo } = erroDocumento(input.documento, input.tipo);
      const provedor = getProvedorCredito();

      let pedido: { razaoSocial: string; cidade: string; uf: string } | null = null;
      if (input.pedidoId) {
        const [p] = await db.select({ razaoSocial: fatOrders.razaoSocial, cidade: fatOrders.cidade, uf: fatOrders.uf })
          .from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
        if (!p) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
        pedido = p;
      }
      const entrega = (row: typeof creditReports.$inferSelect, reaproveitado: boolean) => {
        const veredito = comoVeredito(row.veredito);
        return {
          reaproveitado, id: row.id, consultadoEm: row.consultadoEm, veredito, motivos: row.motivos,
          semaforo: SEMAFORO[veredito], relatorio: row.relatorio,
        };
      };

      // 1) Cache: relatório válido (<30 dias) do mesmo provedor é devolvido sem custo.
      const ultimo = await ultimoRelatorioDoDocumento(documento);
      if (ultimo && decidirCache(ultimo, { forcarNova: input.forcarNova, provedorAtual: provedor.nome }) === 'REAPROVEITAR') {
        await db.insert(creditQueries).values({
          documento, userId: ctx.user.id, status: 'REAPROVEITADO', reportId: ultimo.id, custoReais: 0, finalizadoEm: new Date(),
        });
        if (input.pedidoId) await vincularRelatorioAoPedido(ultimo.id, input.pedidoId, ctx.user.id, 'CONSULTA_NO_PEDIDO');
        return entrega(ultimo, true);
      }

      // 2) Trava atômica: uma única linha EM_ANDAMENTO viva por documento + teto mensal, no mesmo INSERT.
      const travou = await db.execute(sql`
        INSERT INTO credit_queries (documento, user_id, status)
        SELECT ${documento}::text, ${ctx.user.id}::integer, 'EM_ANDAMENTO'
        WHERE NOT EXISTS (
          SELECT 1 FROM credit_queries
          WHERE documento = ${documento}::text AND status = 'EM_ANDAMENTO' AND iniciado_em > now() - interval '2 minutes'
        )
        AND (
          SELECT count(*) FROM credit_queries
          WHERE iniciado_em >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
            AND (status = 'OK' OR (status = 'EM_ANDAMENTO' AND iniciado_em > now() - interval '2 minutes'))
        ) < COALESCE((SELECT limite_mensal FROM credit_settings WHERE id = 1), ${LIMITE_MENSAL_PADRAO}::integer)
        RETURNING id`);
      const queryId = (travou.rows[0] as { id?: number } | undefined)?.id;
      if (queryId === undefined) {
        const emAndamento = await db.execute(sql`
          SELECT 1 FROM credit_queries
          WHERE documento = ${documento}::text AND status = 'EM_ANDAMENTO' AND iniciado_em > now() - interval '2 minutes' LIMIT 1`);
        if (emAndamento.rows.length > 0) throw new TRPCError({ code: 'CONFLICT', message: 'Consulta já em andamento' });
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Limite mensal de consultas pagas atingido. Ajuste o limite ou aguarde o próximo mês.' });
      }

      // 3) Chamada ao provedor. Erro: mensagem segura ao cliente, detalhe só no log/razão.
      let resultado: Awaited<ReturnType<typeof provedor.consultar>>;
      try {
        resultado = await provedor.consultar(documento, tipo);
      } catch (e) {
        const seguro = e instanceof ErroProvedorCredito ? e.mensagemSegura : 'Falha ao consultar o provedor de crédito.';
        const detalhe = (e instanceof ErroProvedorCredito ? e.detalhe : e instanceof Error ? e.name : 'erro').slice(0, 500);
        console.error(`[credito] consulta falhou provedor=${provedor.nome} query=${queryId}: ${detalhe}`);
        await db.update(creditQueries).set({ status: 'ERRO', erro: detalhe, finalizadoEm: new Date() }).where(eq(creditQueries.id, queryId));
        throw new TRPCError({ code: 'BAD_GATEWAY', message: seguro });
      }

      // 4) Grava o relatório e fecha o razão. Se a gravação falhar, o razão registra o custo e o erro.
      const { relatorio, bruto } = resultado;
      const { veredito, motivos } = calcularVeredito(relatorio);
      const custo = relatorio.fonte.custoReais ?? provedor.custoReais;
      let tarefaTitulo: string | null = null;
      if (input.taskId && !relatorio.cadastro.razaoSocial) {
        const [t] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, input.taskId));
        tarefaTitulo = t?.title ?? null;
      }
      try {
        const [row] = await db.insert(creditReports).values({
          documento, tipo, taskId: input.taskId ?? null,
          razaoSocial: relatorio.cadastro.razaoSocial ?? pedido?.razaoSocial ?? tarefaTitulo ?? null,
          municipio: relatorio.cadastro.municipio ?? pedido?.cidade ?? null,
          uf: relatorio.cadastro.uf ?? pedido?.uf ?? null,
          provedor: provedor.nome, produto: provedor.produto,
          consultadoEm: new Date(relatorio.consultadoEm),
          relatorio, payloadBruto: bruto ?? null, veredito, motivos, score: relatorio.score.valor,
          custoReais: custo, consultadoPorUserId: ctx.user.id, motivo: input.motivo,
        }).returning();
        await db.update(creditQueries).set({ status: 'OK', reportId: row.id, custoReais: custo, finalizadoEm: new Date() })
          .where(eq(creditQueries.id, queryId));
        if (input.pedidoId) await vincularRelatorioAoPedido(row.id, input.pedidoId, ctx.user.id, 'CONSULTA_NO_PEDIDO');
        return entrega(row, false);
      } catch (e) {
        console.error(`[credito] relatório pago NÃO gravado query=${queryId}:`, e instanceof Error ? e.name : 'erro');
        await db.update(creditQueries).set({ status: 'ERRO', custoReais: custo, erro: 'Consulta feita, mas o relatório não foi gravado', finalizadoEm: new Date() })
          .where(eq(creditQueries.id, queryId)).catch(() => undefined);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'A consulta foi feita, mas não foi possível gravar o relatório. Avise o suporte antes de repetir.' });
      }
    }),

  historico: staffProcedure
    .input(z.object({ documento: documentoInput }))
    .query(async ({ input }) => {
      const documento = input.documento.replace(/\D/g, '');
      return db.select({
        id: creditQueries.id, status: creditQueries.status, reportId: creditQueries.reportId, custoReais: creditQueries.custoReais,
        erro: creditQueries.erro, iniciadoEm: creditQueries.iniciadoEm, finalizadoEm: creditQueries.finalizadoEm, usuario: users.name,
      }).from(creditQueries).leftJoin(users, eq(users.id, creditQueries.userId))
        .where(eq(creditQueries.documento, documento)).orderBy(desc(creditQueries.iniciadoEm)).limit(100);
    }),

  listar: staffProcedure
    .input(z.object({
      busca: z.string().max(100).optional(), documento: z.string().max(30).optional(),
      uf: z.string().max(2).optional(), municipio: z.string().max(100).optional(),
      veredito: z.enum(['APROVADO', 'COM_RESTRICAO', 'REPROVADO_A_PRAZO']).optional(),
      de: z.date().optional(), ate: z.date().optional(),
      pagina: z.number().int().min(1).default(1), porPagina: z.number().int().min(1).max(POR_PAGINA_MAX).default(20),
    }))
    .query(async ({ input }) => {
      const f = montarFiltrosListagem(input);
      const dobrado = sql`lower(translate(coalesce(r.razao_social, '') || ' ' || coalesce(r.municipio, ''), ${SQL_ACENTOS}, ${SQL_SEM_ACENTOS}))`;
      const conds: SQL[] = [sql`true`];
      for (const t of f.termosTexto) conds.push(sql`position(${t}::text in ${dobrado}) > 0`);
      if (f.digitosBusca) conds.push(sql`position(${f.digitosBusca}::text in r.documento) > 0`);
      if (f.documento) conds.push(sql`r.documento = ${f.documento}::text`);
      if (f.uf) conds.push(sql`upper(r.uf) = ${f.uf}::text`);
      if (f.municipioFold) conds.push(sql`position(${f.municipioFold}::text in lower(translate(coalesce(r.municipio, ''), ${SQL_ACENTOS}, ${SQL_SEM_ACENTOS}))) > 0`);
      if (f.veredito) conds.push(sql`r.veredito = ${f.veredito}::text`);
      if (f.de) conds.push(sql`r.consultado_em >= ${f.de.toISOString()}::timestamptz`);
      if (f.ate) conds.push(sql`r.consultado_em <= ${f.ate.toISOString()}::timestamptz`);
      const where = sql.join(conds, sql` AND `);
      const [itens, total] = await Promise.all([
        db.execute(sql`
          SELECT r.id, r.documento, r.razao_social, r.municipio, r.uf, r.score, r.veredito, r.consultado_em, r.custo_reais,
                 u.name AS consultado_por,
                 (SELECT count(*)::int FROM credit_report_links l WHERE l.report_id = r.id) AS pedidos_vinculados
          FROM credit_reports r LEFT JOIN users u ON u.id = r.consultado_por_user_id
          WHERE ${where}
          ORDER BY r.consultado_em DESC, r.id DESC
          LIMIT ${f.limite}::integer OFFSET ${f.offset}::integer`),
        db.execute(sql`SELECT count(*)::int AS n FROM credit_reports r WHERE ${where}`),
      ]);
      type Linha = {
        id: number; documento: string; razao_social: string | null; municipio: string | null; uf: string | null;
        score: number | null; veredito: string; consultado_em: Date | string; custo_reais: number | null;
        consultado_por: string | null; pedidos_vinculados: number;
      };
      return {
        total: Number((total.rows[0] as { n?: number } | undefined)?.n ?? 0),
        itens: (itens.rows as unknown as Linha[]).map((l) => ({
          id: l.id, documento: l.documento, razaoSocial: l.razao_social, municipio: l.municipio, uf: l.uf, score: l.score,
          veredito: comoVeredito(l.veredito), consultadoEm: new Date(l.consultado_em), consultadoPor: l.consultado_por,
          custoReais: l.custo_reais, pedidosVinculados: l.pedidos_vinculados,
        })),
      };
    }),

  porPedido: protectedProcedure
    .input(z.object({ pedidoId: z.string().min(1).max(100) }))
    .query(async ({ ctx, input }) => {
      const [pedido] = await db.select({ id: fatOrders.id, cnpj: fatOrders.cnpj, sellerId: fatOrders.sellerId })
        .from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
      if (!pedido) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      if (!ehStaff(ctx.user.role)) {
        const sid = await sellerIdDoUsuario(ctx.user.id);
        if (sid === null || pedido.sellerId !== sid) throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido de outro atendente' });
      }
      const vinculados = await db.execute(sql`
        SELECT r.id, r.consultado_em, r.veredito, r.score, l.origem
        FROM credit_report_links l JOIN credit_reports r ON r.id = l.report_id
        WHERE l.pedido_id = ${input.pedidoId}::text ORDER BY r.consultado_em DESC, r.id DESC`);
      type L = { id: number; consultado_em: Date | string; veredito: string; score: number | null; origem: string };
      const lista = (vinculados.rows as unknown as L[]).map((l) => ({
        id: l.id, consultadoEm: new Date(l.consultado_em), veredito: comoVeredito(l.veredito), score: l.score, origem: l.origem, vinculado: true,
      }));
      const doc = pedido.cnpj.replace(/\D/g, '');
      const ultimo = doc ? await ultimoRelatorioDoDocumento(doc) : null;
      const semVinculo = ultimo && !lista.some((l) => l.id === ultimo.id)
        ? { id: ultimo.id, consultadoEm: ultimo.consultadoEm, veredito: comoVeredito(ultimo.veredito), score: ultimo.score, origem: null, vinculado: false }
        : null;
      return { vinculados: lista, ultimoDoCnpj: semVinculo };
    }),

  vincular: adminProcedure
    .input(z.object({ reportId: z.number().int(), pedidoId: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await db.select({ id: creditReports.id }).from(creditReports).where(eq(creditReports.id, input.reportId));
      const [p] = await db.select({ id: fatOrders.id }).from(fatOrders).where(eq(fatOrders.id, input.pedidoId));
      if (!r || !p) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório ou pedido não encontrado' });
      const criado = await vincularRelatorioAoPedido(input.reportId, input.pedidoId, ctx.user.id, 'MANUAL');
      console.log(`[credito] vincular relatorio=${input.reportId} pedido=${input.pedidoId} criado=${criado} por=user#${ctx.user.id}`);
      return { ok: true, criado };
    }),

  desvincular: adminProcedure
    .input(z.object({ reportId: z.number().int(), pedidoId: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const removidos = await desvincularRelatorioDoPedido(input.reportId, input.pedidoId);
      console.log(`[credito] desvincular relatorio=${input.reportId} pedido=${input.pedidoId} removidos=${removidos} por=user#${ctx.user.id}`);
      return { ok: true, removidos };
    }),

  setBloqueioAtivo: adminProcedure
    .input(z.object({ ativo: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const auditoria = { atualizadoPorUserId: ctx.user.id, atualizadoPorNome: ctx.user.name, atualizadoEm: new Date() };
      await db.insert(creditSettings).values({ id: 1, bloqueioAtivo: input.ativo, ...auditoria })
        .onConflictDoUpdate({ target: creditSettings.id, set: { bloqueioAtivo: input.ativo, ...auditoria } });
      console.log(`[credito] bloqueio_ativo=${input.ativo} por=user#${ctx.user.id}`);
      return { ok: true, bloqueioAtivo: input.ativo };
    }),

  setLimiteMensal: adminProcedure
    .input(z.object({ limite: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (!limiteMensalValido(input.limite)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Limite mensal deve ser um inteiro entre 0 e 10000' });
      const auditoria = { atualizadoPorUserId: ctx.user.id, atualizadoPorNome: ctx.user.name, atualizadoEm: new Date() };
      await db.insert(creditSettings).values({ id: 1, limiteMensal: input.limite, ...auditoria })
        .onConflictDoUpdate({ target: creditSettings.id, set: { limiteMensal: input.limite, ...auditoria } });
      console.log(`[credito] limite_mensal=${input.limite} por=user#${ctx.user.id}`);
      return { ok: true, limiteMensal: input.limite };
    }),

  liberarPedido: adminProcedure
    .input(z.object({ pedidoId: z.string().min(1).max(100), motivo: z.string().trim().min(5).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await db.update(fatOrders).set({
        creditoLiberadoPor: ctx.user.name, creditoLiberadoEm: new Date().toISOString(), creditoLiberadoMotivo: input.motivo,
      }).where(eq(fatOrders.id, input.pedidoId)).returning({ id: fatOrders.id });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
      console.log(`[credito] liberarPedido pedido=${input.pedidoId} por=user#${ctx.user.id}`);
      return { ok: true };
    }),

  saldo: adminProcedure.query(async () => {
    const provedor = getProvedorCredito();
    if (provedor.nome === 'simulado') return { saldo: null as number | null, simulado: true, bruto: null };
    try {
      const s = await consultarSaldoApiFull();
      return { saldo: s.saldo, simulado: false, bruto: s.bruto as Record<string, string | number | boolean | null> | null };
    } catch (e) {
      if (e instanceof ErroProvedorCredito) {
        console.error(`[credito] saldo falhou: ${e.detalhe}`);
        throw new TRPCError({ code: 'BAD_GATEWAY', message: e.mensagemSegura });
      }
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Não foi possível consultar o saldo.' });
    }
  }),

  pdf: staffProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(creditReports).where(eq(creditReports.id, input.id));
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Relatório não encontrado' });
      const [autor] = await db.select({ name: users.name }).from(users).where(eq(users.id, row.consultadoPorUserId));
      try {
        // Sempre regenerado a partir do relatório gravado (determinístico); nada de binário no banco.
        const buf = await gerarPdfCredito(row.relatorio, {
          veredito: comoVeredito(row.veredito), motivos: row.motivos, consultadoPor: autor?.name ?? null,
        });
        const dia = row.consultadoEm.toISOString().slice(0, 10).replace(/-/g, '');
        return { nomeArquivo: `analise-credito-${row.documento}-${dia}.pdf`, base64: buf.toString('base64') };
      } catch (e) {
        console.error('[credito] pdf falhou:', e instanceof Error ? e.message : 'erro');
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível gerar o PDF.' });
      }
    }),
});
