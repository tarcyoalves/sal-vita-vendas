// Acesso ao banco do módulo de crédito (CRM Lembretes). Sem transações interativas (neon-http): tudo é
// UPDATE/INSERT condicional ou consulta simples.
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { creditReports, creditSettings } from '../../db/schema';
import { LIMITE_MENSAL_PADRAO } from './politica';
import { decidirBloqueioCredito, type DecisaoBloqueioCredito } from './bloqueioSmbi';

export type OrigemVinculo = 'CONSULTA_NO_PEDIDO' | 'ENVIO_SMBI' | 'MANUAL';

export async function lerConfigCredito(): Promise<{ bloqueioAtivo: boolean; limiteMensal: number }> {
  const [row] = await db.select().from(creditSettings).where(eq(creditSettings.id, 1));
  return { bloqueioAtivo: row?.bloqueioAtivo ?? false, limiteMensal: row?.limiteMensal ?? LIMITE_MENSAL_PADRAO };
}

/** Consultas pagas concluídas (status OK) no mês corrente, fuso de São Paulo. */
export async function usadasNoMes(): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*)::int AS n FROM credit_queries
    WHERE status = 'OK'
      AND iniciado_em >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`);
  return Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0);
}

export async function ultimoRelatorioDoDocumento(documento: string) {
  const [row] = await db.select().from(creditReports)
    .where(eq(creditReports.documento, documento))
    .orderBy(desc(creditReports.consultadoEm), desc(creditReports.id)).limit(1);
  return row ?? null;
}

/** Vínculo idempotente: o mesmo par (relatório, pedido) nunca é gravado duas vezes. Devolve true se inseriu. */
export async function vincularRelatorioAoPedido(reportId: number, pedidoId: string, userId: number | null, origem: OrigemVinculo): Promise<boolean> {
  const r = await db.execute(sql`
    INSERT INTO credit_report_links (report_id, pedido_id, vinculado_por_user_id, origem)
    SELECT ${reportId}::integer, ${pedidoId}::text, ${userId}::integer, ${origem}::text
    WHERE NOT EXISTS (
      SELECT 1 FROM credit_report_links WHERE report_id = ${reportId}::integer AND pedido_id = ${pedidoId}::text
    )
    RETURNING id`);
  return r.rows.length > 0;
}

export async function desvincularRelatorioDoPedido(reportId: number, pedidoId: string): Promise<number> {
  const r = await db.execute(sql`
    DELETE FROM credit_report_links WHERE report_id = ${reportId}::integer AND pedido_id = ${pedidoId}::text RETURNING id`);
  return r.rows.length;
}

/** Relatório mais recente do documento que vale para decisões reais (em produção, nunca o simulado). */
export async function relatorioParaBloqueio(documento: string) {
  const conds = [eq(creditReports.documento, documento)];
  if (process.env.NODE_ENV === 'production') conds.push(sql`${creditReports.provedor} <> 'simulado'`);
  const [row] = await db.select({ id: creditReports.id, veredito: creditReports.veredito, consultadoEm: creditReports.consultadoEm })
    .from(creditReports).where(and(...conds))
    .orderBy(desc(creditReports.consultadoEm), desc(creditReports.id)).limit(1);
  return row ?? null;
}

/**
 * Bloqueio de crédito do envio ao SMBI. FAIL-OPEN: qualquer falha de leitura (tabela ausente, rede) é logada e o
 * envio segue como sempre — esta guarda nunca pode derrubar o botão que já funciona.
 */
export async function decidirBloqueioDoPedido(pedido: {
  cnpj: string; prazoPagamentoSal: string; prazoPagamentoFrete: string; creditoLiberadoEm?: string | null;
}): Promise<DecisaoBloqueioCredito> {
  try {
    const cfg = await lerConfigCredito();
    if (!cfg.bloqueioAtivo) return { bloquear: false };
    const documento = pedido.cnpj.replace(/\D/g, '');
    const ultimo = documento ? await relatorioParaBloqueio(documento) : null;
    return decidirBloqueioCredito({
      bloqueioAtivo: cfg.bloqueioAtivo, prazoSal: pedido.prazoPagamentoSal, prazoFrete: pedido.prazoPagamentoFrete,
      ultimoRelatorio: ultimo, liberadoEm: pedido.creditoLiberadoEm,
    });
  } catch (e) {
    console.error('[credito] guarda de crédito indisponível, seguindo sem ela:', e instanceof Error ? e.message : 'erro');
    return { bloquear: false };
  }
}

/** Vincula o relatório mais recente do CNPJ ao pedido enviado (origem ENVIO_SMBI). Fail-open. */
export async function vincularUltimoRelatorioNoEnvio(pedidoId: string, cnpj: string, userId: number): Promise<void> {
  try {
    const documento = cnpj.replace(/\D/g, '');
    if (!documento) return;
    const ultimo = await ultimoRelatorioDoDocumento(documento);
    if (ultimo) await vincularRelatorioAoPedido(ultimo.id, pedidoId, userId, 'ENVIO_SMBI');
  } catch (e) {
    console.error('[credito] vínculo no envio falhou (envio mantido):', e instanceof Error ? e.message : 'erro');
  }
}
