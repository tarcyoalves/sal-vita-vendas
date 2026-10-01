// Rotas REST do robô do SMBI — contrato robô ⇄ CRM, etapas 2 e 3 (docs/CONTRATO-ROBO-CRM.md):
//   POST /api/smbi/pedidos/:id/faturamento        rota 3  (faturado espelhado, N movsais)
//   POST /api/smbi/pedidos/:id/status             rota 7  (linha do tempo; EXCLUIDO_SMBI desliga o vínculo)
//   GET  /api/smbi/vinculos                       rota 4  (fila de vínculos manuais a conferir)
//   POST /api/smbi/vinculos/:pedidoId/resultado   rota 5  (resultado da conferência)
// As rotas 1, 2, 8 e 9 ficam em api/index.ts. Mesma autenticação (Bearer SMBI_SYNC_SECRET,
// falha fechado). O que o robô traz é ESPELHO FISCAL: nada aqui altera valor comercial nem comissão.
import express, { type Express, type RequestHandler } from 'express';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { db } from './db';
import { fatOrders, smbiOrderEvents } from './db/schema';
import { isAuthorized } from './lib/smbi';
import {
  faturamentoBodySchema, statusBodySchema, vinculoResultadoSchema,
  resolverFaturamento, deveDesvincular, movsaisLigados, decidirVinculo, montarResultadoVinculo,
  faturamentoDoVinculo, PATCH_DESVINCULAR, totalAcordadoDoPedido, pesoLiquidoDoPedido,
} from './lib/smbiFaturamento';

const json = express.json({ limit: '32kb' });

export function registerSmbiExtraRoutes(app: Express, limiter: RequestHandler): void {
  const auth = (req: express.Request, res: express.Response, tag: string): boolean => {
    if (isAuthorized(process.env.SMBI_SYNC_SECRET, req.headers['authorization'])) return true;
    console.warn(`[smbi] ${tag} → 401`);
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  };

  // ── Rota 3: o pedido ligado foi faturado no SMBI ───────────────────────────
  app.post('/api/smbi/pedidos/:id/faturamento', limiter, json, async (req, res) => {
    if (!auth(req, res, 'POST faturamento')) return;
    const { id } = req.params;
    const parsed = faturamentoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`[smbi] POST faturamento pedido=${id} → 400`);
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }
    try {
      const [row] = await db.select().from(fatOrders).where(eq(fatOrders.id, id));
      if (!row) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }
      const { erro, patch } = resolverFaturamento(row, parsed.data, totalAcordadoDoPedido(row), new Date(), pesoLiquidoDoPedido(row));
      if (erro) {
        console.warn(`[smbi] POST faturamento pedido=${id} → 409 (${erro})`);
        res.status(409).json({ error: erro });
        return;
      }
      await db.update(fatOrders).set(patch).where(eq(fatOrders.id, id));
      await db.insert(smbiOrderEvents).values({
        pedidoId: id, evento: 'FATURADO', em: parsed.data.faturadoEm, origem: 'robo',
        dados: { movsais: parsed.data.movsais.map((m) => m.id), snapshotHash: parsed.data.snapshotHash ?? null },
      }).onConflictDoNothing();
      console.log(`[smbi] POST faturamento pedido=${id} → ok (movsais ${parsed.data.movsais.map((m) => m.id).join(',')}, alertaDesconto=${patch.smbiAlertaDesconto})`);
      res.json({ ok: true, alertaDesconto: patch.smbiAlertaDesconto === true, status: patch.status ?? row.status });
    } catch (err) {
      console.error(`[smbi] POST faturamento pedido=${id} error:`, err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Rota 7: linha do tempo ─────────────────────────────────────────────────
  app.post('/api/smbi/pedidos/:id/status', limiter, json, async (req, res) => {
    if (!auth(req, res, 'POST status')) return;
    const { id } = req.params;
    const parsed = statusBodySchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`[smbi] POST status pedido=${id} → 400`);
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }
    try {
      const [row] = await db.select().from(fatOrders).where(eq(fatOrders.id, id));
      if (!row) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }
      const { evento, dados, em } = parsed.data;
      const desvincular = deveDesvincular(evento, dados, movsaisLigados(row));
      // Evento repetido (mesmo pedido + evento + hora) é ignorado: o robô pode reenviar à vontade.
      await db.insert(smbiOrderEvents).values({
        pedidoId: id, evento, dados: { ...(dados ?? {}), ...(desvincular ? { vinculoDesfeito: true } : {}) }, em, origem: 'robo',
      }).onConflictDoNothing();
      if (desvincular) {
        // Excluído no SMBI: o vínculo cai e o pedido só volta ao robô com NOVO clique.
        await db.update(fatOrders).set(PATCH_DESVINCULAR).where(eq(fatOrders.id, id));
      }
      console.log(`[smbi] POST status pedido=${id} evento=${evento} → ok${desvincular ? ' (vínculo desfeito)' : ''}`);
      res.json({ ok: true, desvinculado: desvincular });
    } catch (err) {
      console.error(`[smbi] POST status pedido=${id} error:`, err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Rota 4b: pedidos LIGADOS a um movsai e ainda NÃO faturados no CRM ─────────
  // O robô confere o faturamento destes direto no SMBI (não depende de arquivo local nem do clique).
  app.get('/api/smbi/ligados', limiter, async (req, res) => {
    if (!auth(req, res, 'GET ligados')) return;
    try {
      const rows = await db
        .select({
          pedidoId: fatOrders.id,
          movsaiPrincipal: fatOrders.smbiMovsaiId,
          movsaiVinculo: fatOrders.smbiVinculoMovsais,
          estado: fatOrders.smbiVinculoEstado,
        })
        .from(fatOrders)
        .where(and(isNotNull(fatOrders.smbiMovsaiId), ne(fatOrders.status, 'faturado')));
      const ligados = rows.map((r) => ({
        pedidoId: r.pedidoId,
        movsaiNumeros: movsaisLigados({ smbiMovsaiId: r.movsaiPrincipal, smbiVinculoMovsais: r.movsaiVinculo }),
        vinculoEstado: r.estado,
      }));
      console.log(`[smbi] GET ligados → ${ligados.length}`);
      res.json({ ok: true, ligados });
    } catch (err) {
      console.error('[smbi] GET ligados error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Rota 4: fila de vínculos manuais a conferir ────────────────────────────
  app.get('/api/smbi/vinculos', limiter, async (req, res) => {
    if (!auth(req, res, 'GET vinculos')) return;
    try {
      const rows = await db
        .select({
          pedidoId: fatOrders.id,
          movsaiNumeros: fatOrders.smbiVinculoMovsais,
          solicitadoEm: fatOrders.smbiVinculoEm,
          solicitadoPor: fatOrders.smbiVinculoPor,
        })
        .from(fatOrders)
        .where(eq(fatOrders.smbiVinculoEstado, 'PENDENTE_CONFERENCIA'));
      const vinculos = rows.map((r) => ({ ...r, movsaiNumeros: r.movsaiNumeros ?? [] }));
      console.log(`[smbi] GET vinculos → ${vinculos.length}`);
      res.json({ ok: true, vinculos });
    } catch (err) {
      console.error('[smbi] GET vinculos error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── Rota 5: resultado da conferência do vínculo ────────────────────────────
  app.post('/api/smbi/vinculos/:pedidoId/resultado', limiter, json, async (req, res) => {
    if (!auth(req, res, 'POST vinculos resultado')) return;
    const { pedidoId } = req.params;
    const parsed = vinculoResultadoSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`[smbi] POST vinculos resultado pedido=${pedidoId} → 400`);
      res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      return;
    }
    try {
      const [row] = await db.select().from(fatOrders).where(eq(fatOrders.id, pedidoId));
      if (!row) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }
      if (!row.smbiVinculoEstado) {
        res.status(409).json({ error: 'pedido sem vínculo manual para conferir' });
        return;
      }
      const ligados = row.smbiVinculoMovsais ?? movsaisLigados(row);
      const estado = decidirVinculo(ligados, parsed.data);
      const patch: Partial<typeof fatOrders.$inferInsert> = {
        smbiVinculoEstado: estado,
        smbiVinculoResultado: montarResultadoVinculo(parsed.data),
      };
      // Tudo confere: se o SMBI já faturou, espelha o faturamento (mesma regra da rota 3).
      // Com divergência NADA é espelhado: espera o administrador decidir.
      if (estado === 'CONFERIDO') {
        const fb = faturamentoDoVinculo(parsed.data);
        if (fb) {
          const r = resolverFaturamento(row, fb, totalAcordadoDoPedido(row), new Date(), pesoLiquidoDoPedido(row));
          if (!r.erro) Object.assign(patch, r.patch);
        }
      }
      await db.update(fatOrders).set(patch).where(eq(fatOrders.id, pedidoId));
      await db.insert(smbiOrderEvents).values({
        pedidoId, evento: estado === 'CONFERIDO' ? 'VINCULO_CONFERIDO' : 'VINCULO_DIVERGENTE',
        origem: 'robo', em: new Date().toISOString(), dados: { movsais: parsed.data.movsais.map((m) => m.id), confere: parsed.data.confere },
      }).onConflictDoNothing();
      console.log(`[smbi] POST vinculos resultado pedido=${pedidoId} → ${estado}`);
      res.json({ ok: true, estado });
    } catch (err) {
      console.error(`[smbi] POST vinculos resultado pedido=${pedidoId} error:`, err);
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
