// Rotas REST do robô do SMBI — contrato robô ⇄ CRM, etapas 2 e 3 (docs/CONTRATO-ROBO-CRM.md):
//   POST /api/smbi/pedidos/:id/faturamento        rota 3  (faturado espelhado, N movsais)
//   POST /api/smbi/pedidos/:id/status             rota 7  (linha do tempo; EXCLUIDO_SMBI desliga o vínculo)
//   GET  /api/smbi/vinculos                       rota 4  (fila de vínculos manuais a conferir)
//   POST /api/smbi/vinculos/:pedidoId/resultado   rota 5  (resultado da conferência)
//   POST /api/smbi/pedidos/:id/iniciar            contrato v2 (multiempresa): ponto sem volta antes da 1ª escrita no SMBI
// As rotas 1, 2, 8 e 9 ficam em api/index.ts. Contrato v2: docs/SMBI-MULTIEMPRESA.md. Mesma autenticação (Bearer SMBI_SYNC_SECRET,
// falha fechado). O que o robô traz é ESPELHO FISCAL: nada aqui altera valor comercial nem comissão.
import express, { type Express, type RequestHandler } from 'express';
import { and, eq, gt, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { fatOrders, smbiOrderEvents, smbiRobotState } from './db/schema';
import { isAuthorized } from './lib/smbi';
import {
  faturamentoBodySchema, statusBodySchema, vinculoResultadoSchema,
  resolverFaturamento, deveDesvincular, movsaisLigados, decidirVinculo, montarResultadoVinculo,
  faturamentoDoVinculo, PATCH_DESVINCULAR, totalAcordadoDoPedido, pesoLiquidoDoPedido,
} from './lib/smbiFaturamento';
import { decidirIniciar, montarLigados, montarVinculos, patchDesvincularEmpresa, protocoloDoRobo, validarEmpresaDoRobo, type Recusa } from './lib/smbiMultiempresa';

const json = express.json({ limit: '32kb' });

const iniciarBodySchema = z.object({
  empresaCnpj: z.string().max(20),
  solicitacaoId: z.string().max(64),
  solicitacaoHash: z.string().length(64),
}).strict();

export function registerSmbiExtraRoutes(app: Express, limiter: RequestHandler): void {
  const auth = (req: express.Request, res: express.Response, tag: string): boolean => {
    if (isAuthorized(process.env.SMBI_SYNC_SECRET, req.headers['authorization'])) return true;
    console.warn(`[smbi] ${tag} → 401`);
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  };

  const negar = (res: express.Response, tag: string, r: Pick<Recusa, 'status' | 'codigo' | 'erro'>) => {
    console.warn(`[smbi] ${tag} → ${r.status} ${r.codigo}`);
    res.status(r.status).json({ error: r.erro, codigo: r.codigo });
  };
  const protocolo = (req: express.Request) => protocoloDoRobo(req.headers['x-smbi-protocolo']);

  // ── Contrato v2: /iniciar — marca, no servidor, o ponto sem volta ANTES da primeira escrita no SMBI ──
  // Uma única operação condicional confere empresa, solicitação, hash e reserva e grava smbi_escrita_iniciada_em;
  // só depois responde. Sem resposta (timeout/erro) o worker NÃO escreve: o marcador pode ou não ter sido gravado,
  // e a repetição devolve jaIniciado=true (reconciliar antes de qualquer escrita).
  app.post('/api/smbi/pedidos/:id/iniciar', limiter, json, async (req, res) => {
    if (!auth(req, res, 'POST iniciar')) return;
    const { id } = req.params;
    const parsed = iniciarBodySchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() }); return; }
    const reservaHeader = req.headers['x-smbi-reserva'];
    const token = typeof reservaHeader === 'string' && reservaHeader.length > 0 && reservaHeader.length <= 100 ? reservaHeader : undefined;
    try {
      const gatesDoBanco = async () => {
        const [g] = await db.select({ robo: smbiRobotState.roboAtivo, multi: smbiRobotState.multiempresaAtivo }).from(smbiRobotState).where(eq(smbiRobotState.id, 1));
        return { roboAtivo: g?.robo === true, multiempresaAtivo: g?.multi === true };
      };
      const [row] = await db.select().from(fatOrders).where(eq(fatOrders.id, id));
      if (!row) { res.status(404).json({ error: 'Pedido não encontrado' }); return; }
      const d = decidirIniciar(row, parsed.data, token, await gatesDoBanco(), protocolo(req), new Date());
      if (!d.ok) { negar(res, `POST iniciar pedido=${id}`, d); return; }
      if (d.jaIniciado) {
        res.json({ ok: true, jaIniciado: true, iniciadoEm: row.smbiEscritaIniciadaEm });
        return;
      }
      const agoraIso = new Date().toISOString();
      const gravado = await db.update(fatOrders)
        .set({ smbiEscritaIniciadaEm: agoraIso })
        .where(and(
          eq(fatOrders.id, id),
          eq(fatOrders.smbiEmpresaCnpj, parsed.data.empresaCnpj),
          eq(fatOrders.smbiSolicitacaoId, parsed.data.solicitacaoId),
          eq(fatOrders.smbiSolicitacaoHash, parsed.data.solicitacaoHash),
          eq(fatOrders.smbiReservaToken, token ?? ''),
          gt(fatOrders.smbiReservadoAte, agoraIso),
          isNull(fatOrders.smbiMovsaiId), isNull(fatOrders.smbiVinculoEstado), isNull(fatOrders.smbiEscritaIniciadaEm),
          ne(fatOrders.status, 'faturado'),
          // Os dois gates são rechecados no próprio UPDATE: desligar a chave entre a leitura e a escrita ainda impede o início.
          sql`exists (select 1 from smbi_robot_state where id = 1 and robo_ativo = true and multiempresa_ativo = true)`,
        ))
        .returning({ em: fatOrders.smbiEscritaIniciadaEm });
      if (gravado.length !== 1) {
        const [fresco] = await db.select().from(fatOrders).where(eq(fatOrders.id, id));
        const d2 = fresco ? decidirIniciar(fresco, parsed.data, token, await gatesDoBanco(), protocolo(req), new Date()) : null;
        if (fresco && d2?.ok && d2.jaIniciado) { res.json({ ok: true, jaIniciado: true, iniciadoEm: fresco.smbiEscritaIniciadaEm }); return; }
        negar(res, `POST iniciar pedido=${id}`, { status: 409, codigo: 'CONCORRENCIA', erro: 'não foi possível iniciar: reserva, solicitação ou gate mudaram' });
        return;
      }
      await db.insert(smbiOrderEvents).values({
        pedidoId: id, evento: 'ESCRITA_INICIADA', em: agoraIso, origem: 'robo', dados: { empresaCnpj: parsed.data.empresaCnpj, solicitacaoId: parsed.data.solicitacaoId },
      }).onConflictDoNothing();
      console.log(`[smbi] POST iniciar pedido=${id} empresa=${parsed.data.empresaCnpj} → ok`);
      res.json({ ok: true, jaIniciado: false, iniciadoEm: agoraIso });
    } catch (err) {
      console.error(`[smbi] POST iniciar pedido=${id} error:`, err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

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
      const recusaEmpresa = validarEmpresaDoRobo(row, parsed.data.empresaCnpj, protocolo(req));
      if (recusaEmpresa) { negar(res, `POST faturamento pedido=${id}`, recusaEmpresa); return; }
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
      const recusaEmpresa = validarEmpresaDoRobo(row, parsed.data.empresaCnpj, protocolo(req));
      if (recusaEmpresa) { negar(res, `POST status pedido=${id}`, recusaEmpresa); return; }
      const { evento, dados, em } = parsed.data;
      const desvincular = deveDesvincular(evento, dados, movsaisLigados(row));
      // Evento repetido (mesmo pedido + evento + hora) é ignorado: o robô pode reenviar à vontade.
      await db.insert(smbiOrderEvents).values({
        pedidoId: id, evento, dados: { ...(dados ?? {}), ...(desvincular ? { vinculoDesfeito: true } : {}) }, em, origem: 'robo',
      }).onConflictDoNothing();
      if (desvincular) {
        // Excluído no SMBI: o vínculo cai e o pedido só volta ao robô com NOVO clique.
        await db.update(fatOrders).set({ ...PATCH_DESVINCULAR, ...patchDesvincularEmpresa(row) }).where(eq(fatOrders.id, id));
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
          cnpj: fatOrders.cnpj,
          comissaoPct: fatOrders.comissaoPct,
          empresaCnpj: fatOrders.smbiEmpresaCnpj,
        })
        .from(fatOrders)
        .where(and(isNotNull(fatOrders.smbiMovsaiId), ne(fatOrders.status, 'faturado')));
      // A referência ERP é (empresa, movsai). Worker de protocolo 1 não sabe a empresa: não recebe pedido que tenha uma
      // (procuraria o número na empresa errada).
      const { ligados, omitidos } = montarLigados(rows, protocolo(req));
      console.log(`[smbi] GET ligados → ${ligados.length}`);
      res.json({ ok: true, ligados, ...(omitidos > 0 ? { aviso: 'Pedidos com empresa omitidos: envie X-SMBI-Protocolo: 2.' } : {}) });
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
          cnpj: fatOrders.cnpj,
          comissaoPct: fatOrders.comissaoPct,
          empresaCnpj: fatOrders.smbiEmpresaCnpj,
        })
        .from(fatOrders)
        .where(eq(fatOrders.smbiVinculoEstado, 'PENDENTE_CONFERENCIA'));
      const { vinculos, omitidos } = montarVinculos(rows, protocolo(req));
      console.log(`[smbi] GET vinculos → ${vinculos.length}`);
      res.json({ ok: true, vinculos, ...(omitidos > 0 ? { aviso: 'Pedidos com empresa omitidos: envie X-SMBI-Protocolo: 2.' } : {}) });
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
      const recusaEmpresa = validarEmpresaDoRobo(row, parsed.data.empresaCnpj, protocolo(req));
      if (recusaEmpresa) { negar(res, `POST vinculos resultado pedido=${pedidoId}`, recusaEmpresa); return; }
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
