// Rotas REST do cadastro assistido CRM → SMBI (docs/SMBI-CADASTRO-ASSISTIDO.md):
//   GET  /api/smbi/cadastros[?simular=1]       lease atômico de NO MÁXIMO um trabalho (ou simulação só leitura)
//   GET  /api/smbi/cadastros/:id               releitura (X-SMBI-Reserva confere a reserva)
//   POST /api/smbi/cadastros/:id/previa        worker registra o snapshot (leitura) → BLOQUEADO | AGUARDANDO_APROVACAO
//   POST /api/smbi/cadastros/:id/iniciar       APROVADO → CADASTRANDO (ponto sem volta; idempotente)
//   POST /api/smbi/cadastros/:id/resultado     resultado final conferido (idempotente)
// Mesma autenticação das demais /api/smbi/* (Bearer SMBI_SYNC_SECRET, falha fechado). O token de reserva só
// trafega no header X-SMBI-Reserva e na resposta do lease: nunca em URL, corpo de erro ou log.
// O gate `cadastro_ativo` nasce DESLIGADO. As decisões moram em lib/smbiCadastroDecisoes.ts (puras).
import express, { type Express, type RequestHandler } from 'express';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, notExists, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { fatOrders, smbiClientRegistrations as T, smbiOrderEvents, smbiRobotState } from './db/schema';
import { isAuthorized } from './lib/smbi';
import { hashPedido } from './lib/smbiCadastro';
import {
  decidirIniciar, decidirPrevia, decidirResultado, elegivelParaLease, iniciarBodySchema, montarTrabalho,
  previaBodySchema, reservaCadastroAte, respostaSemTrabalho, resultadoBodySchema, type Cadastro, type PatchCadastro, type Recusa,
} from './lib/smbiCadastroDecisoes';

const json = express.json({ limit: '64kb' });
const idSchema = z.string().uuid();

export async function cadastroAtivo(): Promise<boolean> {
  const [s] = await db.select({ v: smbiRobotState.cadastroAtivo }).from(smbiRobotState).where(eq(smbiRobotState.id, 1));
  return s?.v === true; // sem linha = desligado (falha fechado)
}

async function carregar(id: string): Promise<Cadastro | undefined> {
  const [row] = await db.select().from(T).where(eq(T.id, id));
  return row;
}

/** Hash do pedido ATUAL (null se o pedido sumiu). */
async function pedidoHashAtual(pedidoId: string): Promise<string | null> {
  const [p] = await db.select().from(fatOrders).where(eq(fatOrders.id, pedidoId));
  return p ? hashPedido(p) : null;
}

/** Linha do tempo do pedido (best effort: falhar o evento não desfaz a transição já gravada). */
async function evento(c: Pick<Cadastro, 'id' | 'pedidoId' | 'revisao'>, nome: string, dados: Record<string, unknown>): Promise<void> {
  try {
    await db.insert(smbiOrderEvents).values({
      pedidoId: c.pedidoId, evento: nome, origem: 'robo', em: new Date().toISOString(),
      dados: { cadastroId: c.id, revisao: c.revisao, ...dados },
    }).onConflictDoNothing();
  } catch (err) {
    console.warn(`[smbi-cadastro] evento ${nome} não gravado:`, err instanceof Error ? err.message : err);
  }
}

export function registerSmbiCadastroRoutes(app: Express, limiter: RequestHandler): void {
  const auth = (req: express.Request, res: express.Response, tag: string): boolean => {
    if (isAuthorized(process.env.SMBI_SYNC_SECRET, req.headers['authorization'])) return true;
    console.warn(`[smbi-cadastro] ${tag} → 401`);
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  };
  const negar = (res: express.Response, tag: string, r: Recusa) => {
    console.warn(`[smbi-cadastro] ${tag} → ${r.status} ${r.codigo}`);
    res.status(r.status).json({ error: r.erro, codigo: r.codigo });
  };
  const reserva = (req: express.Request): string | undefined => {
    const h = req.headers['x-smbi-reserva'];
    return typeof h === 'string' && h.length > 0 && h.length <= 100 ? h : undefined;
  };
  /** UPDATE condicional: só grava se estado e revisão ainda forem os lidos (e a reserva, quando exigida). */
  const gravar = async (row: Cadastro, patch: PatchCadastro, extra: SQL[] = []): Promise<boolean> => {
    const r = await db.update(T).set(patch)
      .where(and(eq(T.id, row.id), eq(T.estado, row.estado), eq(T.revisao, row.revisao), ...extra))
      .returning({ id: T.id });
    return r.length === 1;
  };
  const comReserva = (token: string | undefined, agora: Date): SQL[] =>
    token ? [eq(T.reservaToken, token), gt(T.reservadoAte, agora)] : [sql`false`];

  // ── GET /api/smbi/cadastros ──────────────────────────────────────────────
  app.get('/api/smbi/cadastros', limiter, async (req, res) => {
    if (!auth(req, res, 'GET cadastros')) return;
    try {
      const agora = new Date();
      const ativo = await cadastroAtivo();
      if (req.query.simular === '1') {
        // Só leitura: o que seria entregue, sem lease e sem token.
        const rows = await db.select().from(T).where(inArray(T.estado, ['PREPARANDO', 'APROVADO'])).orderBy(asc(T.criadoEm)).limit(50);
        const trabalhos = rows.filter((r) => elegivelParaLease(r, agora)).map((r) => montarTrabalho(r, false));
        console.log(`[smbi-cadastro] GET cadastros simular cadastroAtivo=${ativo} → ${trabalhos.length}`);
        res.json({ ok: true, cadastroAtivo: ativo, simulacao: true, trabalhos });
        return;
      }
      if (!ativo) {
        console.log('[smbi-cadastro] GET cadastros → gate desligado');
        res.json(respostaSemTrabalho(false));
        return;
      }
      // Cadastro que ficou CADASTRANDO com a reserva vencida: o worker morreu no meio, pode ter escrito → INCERTO.
      await db.update(T)
        .set({ estado: 'INCERTO', motivoCodigo: 'RESERVA_EXPIRADA_CADASTRANDO', reservaToken: null, reservadoAte: null, atualizadoEm: agora })
        .where(and(eq(T.estado, 'CADASTRANDO'), or(isNull(T.reservadoAte), lte(T.reservadoAte, agora))));

      const candidatos = await db.select().from(T).where(inArray(T.estado, ['PREPARANDO', 'APROVADO'])).orderBy(asc(T.criadoEm)).limit(20);
      const cand = candidatos.find((r) => elegivelParaLease(r, agora));
      if (!cand) { res.json(respostaSemTrabalho(true)); return; }
      // Lease ATÔMICO: um único trabalho em andamento no sistema inteiro (nenhuma outra reserva viva).
      const emAndamento = db.select({ um: sql`1` }).from(T)
        .where(and(inArray(T.estado, ['PREPARANDO', 'APROVADO', 'CADASTRANDO']), isNotNull(T.reservadoAte), gt(T.reservadoAte, agora)));
      const [leased] = await db.update(T)
        .set({ reservaToken: globalThis.crypto.randomUUID(), reservadoAte: reservaCadastroAte(agora) })
        .where(and(
          eq(T.id, cand.id), eq(T.estado, cand.estado), eq(T.revisao, cand.revisao),
          or(isNull(T.reservadoAte), lte(T.reservadoAte, agora)),
          cand.estado === 'APROVADO' ? gt(T.aprovacaoExpiraEm, agora) : sql`true`,
          notExists(emAndamento),
        ))
        .returning();
      if (!leased || !elegivelParaLease({ ...leased, reservadoAte: null }, agora)) {
        res.json(respostaSemTrabalho(true));
        return;
      }
      console.log(`[smbi-cadastro] GET cadastros → lease id=${leased.id} fase=${montarTrabalho(leased, false).fase}`);
      res.json({ ok: true, cadastroAtivo: true, trabalho: montarTrabalho(leased, true) });
    } catch (err) {
      console.error('[smbi-cadastro] GET cadastros error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── GET /api/smbi/cadastros/:id ──────────────────────────────────────────
  app.get('/api/smbi/cadastros/:id', limiter, async (req, res) => {
    if (!auth(req, res, 'GET cadastro')) return;
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) { res.status(400).json({ error: 'id inválido' }); return; }
    try {
      const row = await carregar(id.data);
      if (!row) { res.status(404).json({ error: 'Cadastro não encontrado' }); return; }
      const agora = new Date();
      const t = reserva(req);
      const reservaValida = !!t && !!row.reservaToken && !!row.reservadoAte && row.reservaToken === t && row.reservadoAte > agora;
      res.json({ ok: true, reservaValida, cadastroAtivo: await cadastroAtivo(), trabalho: montarTrabalho(row, false) });
    } catch (err) {
      console.error('[smbi-cadastro] GET cadastro error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── POST /api/smbi/cadastros/:id/previa ──────────────────────────────────
  app.post('/api/smbi/cadastros/:id/previa', limiter, json, async (req, res) => {
    if (!auth(req, res, 'POST previa')) return;
    const id = idSchema.safeParse(req.params.id);
    const body = previaBodySchema.safeParse(req.body);
    if (!id.success || !body.success) { res.status(400).json({ error: 'Invalid body' }); return; }
    try {
      const row = await carregar(id.data);
      if (!row) { res.status(404).json({ error: 'Cadastro não encontrado' }); return; }
      const agora = new Date();
      const hashPedidoAtual = await pedidoHashAtual(row.pedidoId);
      if (!hashPedidoAtual) { negar(res, 'previa', { ok: false, status: 409, codigo: 'PEDIDO_INEXISTENTE', erro: 'pedido originador não existe mais' }); return; }
      const d = decidirPrevia(row, body.data, reserva(req), hashPedidoAtual, agora);
      if (!d.ok) { negar(res, `previa ${row.id}`, d); return; }
      if (!(await gravar(row, d.patch, comReserva(reserva(req), agora)))) {
        negar(res, `previa ${row.id}`, { ok: false, status: 409, codigo: 'CONCORRENCIA', erro: 'o cadastro mudou durante a prévia: releia' });
        return;
      }
      const revisao = d.patch.revisao ?? row.revisao;
      await evento({ ...row, revisao }, 'CADASTRO_PREVIA', { estado: d.patch.estado, snapshotHash: d.patch.snapshotHash });
      console.log(`[smbi-cadastro] POST previa id=${row.id} → ${d.patch.estado} rev=${revisao}`);
      res.json({ ok: true, estado: d.patch.estado, revisao, snapshotHash: d.patch.snapshotHash, pedidoHash: d.patch.pedidoHash, divergencias: d.patch.divergencias });
    } catch (err) {
      console.error('[smbi-cadastro] POST previa error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── POST /api/smbi/cadastros/:id/iniciar ─────────────────────────────────
  app.post('/api/smbi/cadastros/:id/iniciar', limiter, json, async (req, res) => {
    if (!auth(req, res, 'POST iniciar')) return;
    const id = idSchema.safeParse(req.params.id);
    const body = iniciarBodySchema.safeParse(req.body);
    if (!id.success || !body.success) { res.status(400).json({ error: 'Invalid body' }); return; }
    try {
      const row = await carregar(id.data);
      if (!row) { res.status(404).json({ error: 'Cadastro não encontrado' }); return; }
      const agora = new Date();
      const ativo = await cadastroAtivo();
      const hashPedidoAtual = await pedidoHashAtual(row.pedidoId);
      if (!hashPedidoAtual) { negar(res, 'iniciar', { ok: false, status: 409, codigo: 'PEDIDO_INEXISTENTE', erro: 'pedido originador não existe mais' }); return; }
      const d = decidirIniciar(row, body.data, reserva(req), hashPedidoAtual, ativo, agora);
      if (!d.ok) { negar(res, `iniciar ${row.id}`, d); return; }
      if (d.idempotente) {
        res.json({ ok: true, estado: 'CADASTRANDO', jaIniciado: true, iniciadoEm: row.tentativaIniciadaEm?.toISOString() ?? null });
        return;
      }
      // Gate rechecado NO próprio UPDATE: desligar a chave entre a leitura e a escrita ainda impede o início.
      const gateLigado = sql`exists (select 1 from smbi_robot_state where id = 1 and cadastro_ativo = true)`;
      const ok = await gravar(row, d.patch, [...comReserva(reserva(req), agora), gt(T.aprovacaoExpiraEm, agora), eq(T.snapshotHash, body.data.snapshotHash), eq(T.pedidoHash, hashPedidoAtual), gateLigado]);
      if (!ok) {
        const fresh = await carregar(row.id);
        const d2 = fresh ? decidirIniciar(fresh, body.data, reserva(req), hashPedidoAtual, ativo, new Date()) : null;
        if (d2?.ok && d2.idempotente) { res.json({ ok: true, estado: 'CADASTRANDO', jaIniciado: true, iniciadoEm: fresh?.tentativaIniciadaEm?.toISOString() ?? null }); return; }
        negar(res, `iniciar ${row.id}`, { ok: false, status: 409, codigo: 'CONCORRENCIA', erro: 'não foi possível iniciar: estado, reserva, aprovação ou gate mudaram' });
        return;
      }
      await evento(row, 'CADASTRO_INICIADO', { snapshotHash: row.snapshotHash });
      console.log(`[smbi-cadastro] POST iniciar id=${row.id} → CADASTRANDO`);
      res.json({ ok: true, estado: 'CADASTRANDO', jaIniciado: false, iniciadoEm: agora.toISOString() });
    } catch (err) {
      console.error('[smbi-cadastro] POST iniciar error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // ── POST /api/smbi/cadastros/:id/resultado ───────────────────────────────
  app.post('/api/smbi/cadastros/:id/resultado', limiter, json, async (req, res) => {
    if (!auth(req, res, 'POST resultado')) return;
    const id = idSchema.safeParse(req.params.id);
    const body = resultadoBodySchema.safeParse(req.body);
    if (!id.success || !body.success) { res.status(400).json({ error: 'Invalid body' }); return; }
    try {
      const row = await carregar(id.data);
      if (!row) { res.status(404).json({ error: 'Cadastro não encontrado' }); return; }
      const agora = new Date();
      const d = decidirResultado(row, body.data, reserva(req), agora);
      if (!d.ok) { negar(res, `resultado ${row.id}`, d); return; }
      if (d.idempotente) { res.json({ ok: true, idempotente: true, estado: row.estado }); return; }
      // INCERTO→(CONFERIDO|DIVERGENTE) é reconciliação sem reserva; os demais exigem a reserva viva.
      const extra = row.estado === 'INCERTO' ? [] : comReserva(reserva(req), agora);
      if (!(await gravar(row, d.patch, extra))) {
        const fresh = await carregar(row.id);
        const d2 = fresh ? decidirResultado(fresh, body.data, reserva(req), new Date()) : null;
        if (d2?.ok && d2.idempotente) { res.json({ ok: true, idempotente: true, estado: fresh?.estado }); return; }
        negar(res, `resultado ${row.id}`, { ok: false, status: 409, codigo: 'CONCORRENCIA', erro: 'o cadastro mudou: releia' });
        return;
      }
      await evento(row, `CADASTRO_${d.patch.estado}`, { erpClienteId: d.patch.erpClienteId ?? null, divergencias: body.data.divergencias.length });
      console.log(`[smbi-cadastro] POST resultado id=${row.id} → ${d.patch.estado}`);
      res.json({ ok: true, idempotente: false, estado: d.patch.estado });
    } catch (err) {
      console.error('[smbi-cadastro] POST resultado error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });
}
