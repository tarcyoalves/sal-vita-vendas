// Consultas do relatório do Sales AI (banco do Premium). Só agregados: nenhum dado pessoal sai daqui.
// A montagem (e a separação confirmado / cupom / indício) é pura: montarRelatorio (operacoesPuro.ts).
import { sql } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import type { RelatorioVendas } from './operacoes';
import { CLASSES_POSITIVAS, agregarPorDimensao, centavosDeTexto, intervaloRelatorio, montarRelatorio } from './operacoesPuro';
import { iso, listaSql } from './consultas';

export async function relatorioImpl(p: { de: string; ate: string }): Promise<RelatorioVendas> {
  const intervalo = intervaloRelatorio(p.de, p.ate);
  if (!intervalo.ok) throw new Error(`relatório: ${intervalo.erro}`);
  const ini = sql`${iso(intervalo.inicio)}::timestamp`;
  const fim = sql`${iso(intervalo.fim)}::timestamp`;
  const positivas = listaSql(CLASSES_POSITIVAS);

  const [emp, msg, resp, agente, vendas, clientes, contatadas, respostas] = await Promise.all([
    ordersDb.execute<{ pesquisadas: number; elegiveis: number; contatadas: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM companies WHERE source_type = 'radar_receita' AND pipeline_type = 'outbound'
           AND company_validation_status <> 'duplicate' AND created_at BETWEEN ${ini} AND ${fim}) AS pesquisadas,
        (SELECT count(DISTINCT company_id)::int FROM sales_journeys WHERE created_at BETWEEN ${ini} AND ${fim}
           AND eligibility->>'ok' = 'true') AS elegiveis,
        (SELECT count(DISTINCT company_id)::int FROM sales_messages WHERE step = 0 AND status = 'ACCEPTED'
           AND accepted_at BETWEEN ${ini} AND ${fim}) AS contatadas
    `),
    ordersDb.execute<{ tentadas: number; aceitas: number; desconhecidas: number; falhas: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM sales_message_attempts WHERE started_at BETWEEN ${ini} AND ${fim}) AS tentadas,
        (SELECT count(*)::int FROM sales_messages WHERE status = 'ACCEPTED' AND accepted_at BETWEEN ${ini} AND ${fim}) AS aceitas,
        (SELECT count(*)::int FROM sales_messages WHERE status = 'UNKNOWN' AND last_attempt_at BETWEEN ${ini} AND ${fim}) AS desconhecidas,
        (SELECT count(*)::int FROM sales_messages WHERE status = 'PERMANENT_FAILURE' AND failed_at BETWEEN ${ini} AND ${fim}) AS falhas
    `),
    ordersDb.execute<{ humanas: number; positivas: number; saida: number; reclamacoes: number; devolvidas: number }>(sql`
      SELECT
        count(*) FILTER (WHERE type = 'RESPOSTA')::int AS humanas,
        count(*) FILTER (WHERE type = 'RESPOSTA' AND payload->>'classificacao' IN (${positivas}))::int AS positivas,
        count(*) FILTER (WHERE type = 'PEDIU_PARA_SAIR')::int AS saida,
        count(*) FILTER (WHERE type = 'RECLAMACAO')::int AS reclamacoes,
        count(*) FILTER (WHERE type = 'DEVOLVIDO')::int AS devolvidas
      FROM sales_events WHERE source = 'hermes' AND received_at BETWEEN ${ini} AND ${fim}
        AND coalesce(result, '') NOT LIKE 'ignorado%' -- e-mail sem jornada: guardado, mas não é efeito da prospecção
    `),
    ordersDb.execute<{ conversas: number; encaminhadas: number; links: number; barradas: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM sales_agent_conversations WHERE started_at BETWEEN ${ini} AND ${fim}) AS conversas,
        (SELECT count(*)::int FROM sales_agent_conversations WHERE status = 'handed_off' AND started_at BETWEEN ${ini} AND ${fim}) AS encaminhadas,
        (SELECT count(*)::int FROM sales_agent_messages WHERE role = 'tool' AND tool_name ILIKE '%link%' AND created_at BETWEEN ${ini} AND ${fim}) AS links,
        (SELECT count(*)::int FROM sales_agent_messages WHERE blocked = TRUE AND created_at BETWEEN ${ini} AND ${fim}) AS barradas
    `),
    // Confirmado = pedido PAGO no site, no período, com o e-mail de um contato que recebeu mensagem ANTES do pedido.
    ordersDb.execute<{ quantity: number; total_price: string | null }>(sql`
      SELECT o.quantity, o.total_price FROM site_orders o
      WHERE o.payment_status = 'confirmed' AND o.created_at BETWEEN ${ini} AND ${fim}
        AND o.customer_email IS NOT NULL
        AND EXISTS (SELECT 1 FROM sales_messages m WHERE m.status = 'ACCEPTED' AND lower(m.to_email) = lower(o.customer_email)
                    AND m.accepted_at < o.created_at)
    `),
    ordersDb.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM sales_journeys j
      WHERE j.state IN ('CUSTOMER', 'REPLENISHMENT') AND EXISTS (SELECT 1 FROM sales_messages m WHERE m.journey_id = j.id AND m.status = 'ACCEPTED')
    `),
    ordersDb.execute<{ email: string; segments: unknown; uf: string | null }>(sql`
      SELECT DISTINCT ON (j.id) j.email, j.segments, co.state AS uf
      FROM sales_messages m JOIN sales_journeys j ON j.id = m.journey_id LEFT JOIN companies co ON co.id = j.company_id
      WHERE m.step = 0 AND m.status = 'ACCEPTED' AND m.accepted_at BETWEEN ${ini} AND ${fim}
    `),
    ordersDb.execute<{ email: string | null; classe: string | null }>(sql`
      SELECT email, payload->>'classificacao' AS classe FROM sales_events
      WHERE source = 'hermes' AND type = 'RESPOSTA' AND received_at BETWEEN ${ini} AND ${fim}
        AND coalesce(result, '') NOT LIKE 'ignorado%'
    `),
  ]);

  const e = emp.rows[0];
  const m = msg.rows[0];
  const rr = resp.rows[0];
  const ag = agente.rows[0];
  const positivasSet = new Set<string>(CLASSES_POSITIVAS);
  const listaResp = respostas.rows.flatMap((x) => (x.email ? [{ email: x.email, positiva: positivasSet.has(x.classe ?? '') }] : []));
  const segs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

  return montarRelatorio({
    de: p.de,
    ate: p.ate,
    empresas: { pesquisadas: e?.pesquisadas ?? 0, elegiveis: e?.elegiveis ?? 0, contatadas: e?.contatadas ?? 0 },
    mensagens: { tentadas: m?.tentadas ?? 0, aceitas: m?.aceitas ?? 0, devolvidas: rr?.devolvidas ?? 0, desconhecidas: m?.desconhecidas ?? 0, falhas: m?.falhas ?? 0 },
    respostas: { humanas: rr?.humanas ?? 0, positivas: rr?.positivas ?? 0, pedidosDeSaida: rr?.saida ?? 0, reclamacoes: rr?.reclamacoes ?? 0 },
    agente: { conversas: ag?.conversas ?? 0, linksDePedido: ag?.links ?? 0, encaminhadas: ag?.encaminhadas ?? 0, respostasBarradas: ag?.barradas ?? 0 },
    confirmadas: {
      pedidos: vendas.rows.length,
      caixas: vendas.rows.reduce((s, v) => s + (Number(v.quantity) || 0), 0),
      receitaCentavos: vendas.rows.reduce((s, v) => s + centavosDeTexto(v.total_price), 0),
    },
    pedidosComCupomCampanha: null, // não existe configuração de "cupom de campanha" (ver docs/CONTRATO-HERMES-VENDAS.md)
    jornadasClientes: clientes.rows[0]?.n ?? 0,
    porSegmento: agregarPorDimensao(contatadas.rows.map((c) => ({ email: c.email, chaves: segs(c.segments) })), listaResp),
    porUf: agregarPorDimensao(contatadas.rows.map((c) => ({ email: c.email, chaves: c.uf ? [c.uf] : [] })), listaResp),
  });
}
