// Acesso ao banco do módulo de crédito (CRM Lembretes). Sem transações interativas (neon-http): tudo é
// UPDATE/INSERT condicional ou consulta simples.
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { db } from '../../db';
import { creditReports, creditSettings } from '../../db/schema';
import { TETO_POR_CONSULTA_PADRAO_REAIS } from '../../../shared/creditoCatalogo';
import { relatorioValido } from '../../../shared/credito';
import { LIMITE_MENSAL_PADRAO } from './politica';
import { decidirBloqueioCredito, type DecisaoBloqueioCredito } from './bloqueioSmbi';
import { maisRecentePorProduto, resumoParaBloqueio } from './produtos';

export type OrigemVinculo = 'CONSULTA_NO_PEDIDO' | 'ENVIO_SMBI' | 'MANUAL';

export async function lerConfigCredito(): Promise<{ bloqueioAtivo: boolean; limiteMensal: number; tetoPorConsultaReais: number }> {
  const [row] = await db.select().from(creditSettings).where(eq(creditSettings.id, 1));
  return {
    bloqueioAtivo: row?.bloqueioAtivo ?? false,
    limiteMensal: row?.limiteMensal ?? LIMITE_MENSAL_PADRAO,
    tetoPorConsultaReais: row?.tetoPorConsultaReais ?? TETO_POR_CONSULTA_PADRAO_REAIS,
  };
}

/** Gasto em reais do mês corrente (fuso de São Paulo): soma do custo das consultas concluídas (status OK). */
export async function gastoNoMesReais(): Promise<number> {
  const r = await db.execute(sql`
    SELECT COALESCE(sum(custo_reais), 0)::float8 AS total FROM credit_queries
    WHERE status = 'OK'
      AND iniciado_em >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`);
  return Math.round(Number((r.rows[0] as { total?: number } | undefined)?.total ?? 0) * 100) / 100;
}

const { payloadBruto: _bruto, ...COLUNAS_SEM_BRUTO } = getTableColumns(creditReports);

/**
 * Relatórios recentes do documento (mais novo primeiro), SEM o payload bruto (pesado). `semSimulado` espelha a regra
 * de produção: o simulado nunca vale para decisão real.
 */
export async function relatoriosDoDocumento(documento: string, opts: { semSimulado?: boolean; limite?: number } = {}) {
  const conds = [eq(creditReports.documento, documento)];
  if (opts.semSimulado) conds.push(sql`${creditReports.provedor} <> 'simulado'`);
  return db.select(COLUNAS_SEM_BRUTO).from(creditReports).where(and(...conds))
    .orderBy(desc(creditReports.consultadoEm), desc(creditReports.id)).limit(opts.limite ?? 30);
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

/** Veredito EFETIVO do documento para decisões reais (em produção, nunca o simulado): o pior entre os válidos. */
export async function relatorioParaBloqueio(documento: string) {
  const linhas = await relatoriosDoDocumento(documento, { semSimulado: process.env.NODE_ENV === 'production' });
  return resumoParaBloqueio(linhas);
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

/**
 * Vincula ao pedido enviado (origem ENVIO_SMBI) o relatório vigente mais recente de cada produto; sem nenhum
 * vigente, o mais recente. Fail-open.
 */
export async function vincularUltimoRelatorioNoEnvio(pedidoId: string, cnpj: string, userId: number): Promise<void> {
  try {
    const documento = cnpj.replace(/\D/g, '');
    if (!documento) return;
    const linhas = await relatoriosDoDocumento(documento);
    const vigentes = [...maisRecentePorProduto(linhas).values()].filter((l) => relatorioValido(l.consultadoEm));
    for (const l of vigentes.length ? vigentes : linhas.slice(0, 1)) await vincularRelatorioAoPedido(l.id, pedidoId, userId, 'ENVIO_SMBI');
  } catch (e) {
    console.error('[credito] vínculo no envio falhou (envio mantido):', e instanceof Error ? e.message : 'erro');
  }
}
