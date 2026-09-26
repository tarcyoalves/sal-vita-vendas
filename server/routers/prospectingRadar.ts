// Radar de Cargas — prospecção para completar a carreta (CRM de Lembretes).
// Visão geral e decisões: PLANO-RADAR-CARGAS.md. Contrato de tipos: shared/radar.ts.
//
// Pertence só ao CRM: usa `db` (DATABASE_URL). Nada aqui toca o banco do Premium.
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { router, protectedProcedure, staffProcedure } from '../trpc';
import { db } from '../db';
import { spDateStr } from '../lib/tz';
import { radarEstablishments, radarEnrichment, radarLeadActions, radarLeadEvents, tasks, taskDeletionLogs, emailSuppressions, tags } from '../db/schema';
import { municipioByIbge, municipiosWithinRadius, searchMunicipios } from '../lib/radar/geo';
import {
  establishmentPhones,
  buildLead,
  buildTaskNotes,
  pickTaskPhone,
  segmentLabelsForCnaes,
  taskDescription,
  taskTitle,
  toRadarLeadActivity,
} from '../lib/radar/leads';
import { draftRadarMessage, type RadarDraftInput } from '../lib/radar/messageDraft';
import {
  enqueue,
  isEnricherOnline,
  loadEnrichments,
  loadHeartbeat,
  needsEnqueue,
  toRadarEnrichment,
  toRadarEnrichmentData,
} from '../lib/radar/enrichment';
import {
  RADAR_SEGMENTS,
  RADAR_SEGMENT_KEYS,
  RADAR_MAX_RADIUS_KM,
  RADAR_MAX_RESULTS,
  RADAR_ENRICH_PER_SEARCH,
  RADAR_CONTACT_CHANNELS,
  RADAR_DISCARD_REASON_KEYS,
  discardReasonLabel,
  type RadarCrmStatus,
  type RadarLead,
  type RadarMunicipality,
  type RadarSearchResult,
  type RadarCnpjCheck,
  type RadarEnrichment,
  type RadarLeadActivity,
} from '../../shared/radar';

const UF = z.string().length(2).transform((s) => s.toUpperCase());
const CNPJ = z.string().transform((s) => s.replace(/\D/g, '')).pipe(z.string().length(14));
const BAGS = z.number().int().min(1).max(2000);

// Tag do catálogo de admin (server/routers/tags.ts) aplicada a toda tarefa
// criada pelo Radar — precisa existir no catálogo para aparecer no filtro de
// tags da tela de Tarefas (a tela só lista tags de `tags.list`, não as tags
// livres já usadas nas tarefas).
const RADAR_TAG = 'radar-cargas';

// Protege a função contra uma busca que devolveria uma quantidade absurda de
// linhas do banco (raio muito grande + segmento muito comum). O corte real
// para o atendente é RADAR_MAX_RESULTS; isto é só um limite de segurança do
// SELECT.
const RADAR_DB_FETCH_CAP = 3000;

// Limitador em memória, por processo — suficiente para o volume de uma função
// serverless de uso interno; não precisa de Redis/Upstash para isto. Reinicia
// a cada cold start, o que é aceitável para uma proteção de abuso, não de cota.
function makeRateLimiter(limit: number, windowMs: number, tooManyMessage: string) {
  const hits = new Map<number, number[]>();
  return (userId: number) => {
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: tooManyMessage });
    }
    recent.push(now);
    hits.set(userId, recent);
  };
}

const checkVerifyCnpjRate = makeRateLimiter(
  20, 60_000,
  'Muitas consultas de CNPJ em pouco tempo. Aguarde um minuto e tente de novo.',
);
const checkDraftMessageRate = makeRateLimiter(
  10, 60_000,
  'Muitos rascunhos de mensagem em pouco tempo. Aguarde um minuto e tente de novo.',
);
const checkEnrichNowRate = makeRateLimiter(
  20, 60_000,
  'Muitos pedidos de busca na web em pouco tempo. Aguarde um minuto e tente de novo.',
);

const checkLeadActionRate = makeRateLimiter(
  60, 60_000,
  'Muitas ações em pouco tempo. Aguarde um minuto e tente de novo.',
);

const CNPJ_CHECK_TIMEOUT_MS = 10_000;

// Retorno marcado para as 9h de São Paulo do dia escolhido (offset fixo -03:00,
// ver server/lib/tz.ts). Data de hoje ou passada = agora, para não nascer atrasado.
function reminderFromDateStr(ymd: string): Date {
  const at9 = new Date(`${ymd}T09:00:00-03:00`);
  return ymd <= spDateStr() ? new Date() : at9;
}

async function loadLeadAction(cnpj: string) {
  const [row] = await db.select().from(radarLeadActions).where(eq(radarLeadActions.cnpj, cnpj));
  return row;
}

// Histórico permanente (radar_lead_events) — só INSERT, nunca UPDATE/DELETE.
async function logLeadEvent(e: {
  cnpj: string; type: 'contatado' | 'descartado' | 'restaurado' | 'convertido';
  user: { id: number; name: string }; channel?: string; reason?: string; note?: string | null; taskId?: number;
}) {
  await db.insert(radarLeadEvents).values({
    cnpj: e.cnpj, type: e.type, channel: e.channel ?? null, reason: e.reason ?? null,
    note: e.note ?? null, taskId: e.taskId ?? null, userId: e.user.id, userName: e.user.name,
  });
}

async function requireEstablishment(cnpj: string) {
  const [row] = await db.select().from(radarEstablishments).where(eq(radarEstablishments.cnpj, cnpj));
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado na base do Radar' });
  return row;
}

export const prospectingRadarRouter = router({
  // Autocomplete da cidade da carga. Sempre devolve o código IBGE: há nomes
  // repetidos entre estados (Barracão existe no PR e no RS).
  municipalities: protectedProcedure
    .input(z.object({ q: z.string().trim().min(1).max(60), uf: UF.optional() }))
    .query(({ input }): RadarMunicipality[] =>
      searchMunicipios(input.q, input.uf).map(({ ibge, nome, uf }) => ({ ibge, nome, uf })),
    ),

  search: protectedProcedure
    .input(z.object({
      originIbge: z.number().int(),
      radiusKm: z.number().int().min(1).max(RADAR_MAX_RADIUS_KM),
      segments: z.array(z.enum(RADAR_SEGMENT_KEYS)).min(1),
      includeSecondary: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }): Promise<RadarSearchResult> => {
      const origin = municipioByIbge(input.originIbge);
      if (!origin) throw new TRPCError({ code: 'NOT_FOUND', message: 'Município de origem não encontrado' });

      const now = new Date();
      // Sinal de vida do robô: pedido cedo e reaproveitado em todo `return` desta
      // procedure — inclusive nos caminhos vazios abaixo, para a tela saber se
      // vale a pena esperar os cards se completarem antes mesmo de haver leads.
      const enricherOnline = isEnricherOnline(await loadHeartbeat(), now);

      const nearby = municipiosWithinRadius(origin, input.radiusKm);
      const originResult = { ibge: origin.ibge, nome: origin.nome, uf: origin.uf, lat: origin.lat, lon: origin.lon };

      // Base vazia (importador nunca rodou) → resultado vazio, não erro.
      const [releaseRow] = await db
        .select({ release: sql<string | null>`max(${radarEstablishments.sourceRelease})` })
        .from(radarEstablishments);
      const datasetRelease = releaseRow?.release ?? null;
      if (datasetRelease === null) {
        return { origin: originResult, municipalitiesInRadius: nearby.length, leads: [], truncated: false, datasetRelease: null, enricherOnline };
      }

      const ibgeCodes = nearby.map((m) => m.ibge);
      const distanceByIbge = new Map(nearby.map((m) => [m.ibge, m.distanceKm]));

      const codes: string[] = RADAR_SEGMENTS.filter((s) => (input.segments as readonly string[]).includes(s.key))
        .flatMap((s) => [...s.cnaes] as string[]);

      const principalMatch = inArray(radarEstablishments.cnaePrincipal, codes);
      // Overlap de array (`&&`) — mesmo padrão usado em server/routers/emailMarketing.ts
      // para filtrar tasks.tags por uma lista.
      const secondaryMatch = sql`${radarEstablishments.cnaesAlvo} && ARRAY[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[]`;
      const cnaeMatch = input.includeSecondary ? or(principalMatch, secondaryMatch) : principalMatch;

      // `nearby` já vem ordenado por distância: ordenar pela posição do município na
      // lista garante que, se o teto de linhas cortar, quem fica de fora é o mais longe.
      const rows = await db.select().from(radarEstablishments)
        .where(and(inArray(radarEstablishments.municipioIbge, ibgeCodes), cnaeMatch))
        .orderBy(sql`array_position(ARRAY[${sql.join(ibgeCodes.map((c) => sql`${c}`), sql`, `)}]::int[], ${radarEstablishments.municipioIbge})`)
        .limit(RADAR_DB_FETCH_CAP);

      const withDistance = rows.map((row) => ({ row, distanceKm: distanceByIbge.get(row.municipioIbge) ?? 0 }));
      withDistance.sort((a, b) => {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        const aHasPhone = a.row.telefone1 || a.row.telefone2 ? 0 : 1;
        const bHasPhone = b.row.telefone1 || b.row.telefone2 ? 0 : 1;
        if (aHasPhone !== bHasPhone) return aHasPhone - bHasPhone;
        const aName = (a.row.nomeFantasia || a.row.razaoSocial).toLowerCase();
        const bName = (b.row.nomeFantasia || b.row.razaoSocial).toLowerCase();
        return aName.localeCompare(bName, 'pt-BR');
      });

      // Descartados ficam para sempre (evita retrabalho com lead ruim): não ocupam
      // vaga no limite de 200 — a lista enche com empresas úteis — e vêm no fim,
      // para o filtro "Descartados" da tela.
      const discardedSet = new Set<string>();
      if (withDistance.length > 0) {
        const discardedRows = await db.select({ cnpj: radarLeadActions.cnpj }).from(radarLeadActions)
          .where(and(
            inArray(radarLeadActions.cnpj, withDistance.map((w) => w.row.cnpj)),
            sql`${radarLeadActions.discardedAt} IS NOT NULL`,
          ));
        for (const r of discardedRows) discardedSet.add(r.cnpj);
      }
      const active = withDistance.filter((w) => !discardedSet.has(w.row.cnpj));
      const discardedOnes = withDistance.filter((w) => discardedSet.has(w.row.cnpj));
      const truncated = active.length > RADAR_MAX_RESULTS;
      const page = [...active.slice(0, RADAR_MAX_RESULTS), ...discardedOnes.slice(0, RADAR_MAX_RESULTS)];

      // Nenhum estabelecimento casou os CNAEs no raio — evita `inArray` com
      // lista vazia (gera SQL inválido) e devolve resultado vazio direto.
      if (page.length === 0) {
        return { origin: originResult, municipalitiesInRadius: nearby.length, leads: [], truncated: false, datasetRelease, enricherOnline };
      }

      // Cruzamento com o CRM em lote (sem N+1): uma consulta em `tasks` e uma
      // em `task_deletion_logs` para todos os leads da página, por CNPJ e por
      // telefone.
      const cnpjs = page.map((p) => p.row.cnpj);
      const phonesByRow = new Map(page.map((p) => [p.row.cnpj, establishmentPhones(p.row)]));
      const allPhoneDigits = [...new Set(page.flatMap((p) => phonesByRow.get(p.row.cnpj)!.map((ph) => ph.digits)))];

      const taskConditions: SQL[] = [inArray(tasks.cnpj, cnpjs)];
      if (allPhoneDigits.length) taskConditions.push(inArray(tasks.phone, allPhoneDigits));
      const taskRows = await db.select({
        id: tasks.id, cnpj: tasks.cnpj, phone: tasks.phone, assignedTo: tasks.assignedTo, convertedAt: tasks.convertedAt,
      }).from(tasks).where(or(...taskConditions));

      const taskByCnpj = new Map<string, typeof taskRows[number]>();
      const taskByPhone = new Map<string, typeof taskRows[number]>();
      for (const t of taskRows) {
        if (t.cnpj && !taskByCnpj.has(t.cnpj)) taskByCnpj.set(t.cnpj, t);
        if (t.phone && !taskByPhone.has(t.phone)) taskByPhone.set(t.phone, t);
      }

      const logConditions: SQL[] = [inArray(taskDeletionLogs.cnpj, cnpjs)];
      if (allPhoneDigits.length) logConditions.push(inArray(taskDeletionLogs.phone, allPhoneDigits));
      const logRows = await db.select({
        cnpj: taskDeletionLogs.cnpj, phone: taskDeletionLogs.phone,
        reason: taskDeletionLogs.reason, deletedByName: taskDeletionLogs.deletedByName,
      }).from(taskDeletionLogs).where(or(...logConditions)).orderBy(desc(taskDeletionLogs.createdAt));

      // Ordenado por mais recente primeiro: o primeiro que achar por chave é o
      // registro de exclusão mais recente daquele CNPJ/telefone.
      const logByCnpj = new Map<string, typeof logRows[number]>();
      const logByPhone = new Map<string, typeof logRows[number]>();
      for (const l of logRows) {
        if (l.cnpj && !logByCnpj.has(l.cnpj)) logByCnpj.set(l.cnpj, l);
        if (l.phone && !logByPhone.has(l.phone)) logByPhone.set(l.phone, l);
      }

      const emails = [...new Set(
        page.map((p) => p.row.email?.toLowerCase().trim()).filter((v): v is string => !!v),
      )];
      const suppressedRows = emails.length
        ? await db.select({ email: emailSuppressions.email }).from(emailSuppressions).where(inArray(emailSuppressions.email, emails))
        : [];
      const suppressedSet = new Set(suppressedRows.map((r) => r.email.toLowerCase()));

      function crmStatusFor(cnpj: string, phoneDigitsList: string[]): RadarCrmStatus {
        const task = taskByCnpj.get(cnpj) ?? phoneDigitsList.map((d) => taskByPhone.get(d)).find((t) => !!t);
        if (task) return { kind: 'no_crm', taskId: task.id, assignedTo: task.assignedTo, converted: task.convertedAt != null };
        const log = logByCnpj.get(cnpj) ?? phoneDigitsList.map((d) => logByPhone.get(d)).find((l) => !!l);
        if (log) return { kind: 'excluido_antes', reason: log.reason, deletedByName: log.deletedByName };
        return { kind: 'novo' };
      }

      // Enriquecimento (Fase 2): uma consulta em lote pelos CNPJs da página, e —
      // só se o robô estiver online, senão a fila só cresceria sem ninguém para
      // consumi-la — enfileira os primeiros RADAR_ENRICH_PER_SEARCH (na mesma
      // ordem de distância que `page` já tem) que precisam de refresh.
      const [enrichmentByCnpj, actionRows] = await Promise.all([
        loadEnrichments(cnpjs),
        db.select().from(radarLeadActions).where(inArray(radarLeadActions.cnpj, cnpjs)),
      ]);
      const actionByCnpj = new Map(actionRows.map((r) => [r.cnpj, r]));
      const toEnqueue = enricherOnline
        ? page
            .filter((p) => !discardedSet.has(p.row.cnpj))
            .filter((p) => needsEnqueue(enrichmentByCnpj.get(p.row.cnpj), now))
            .slice(0, RADAR_ENRICH_PER_SEARCH)
            .map((p) => p.row.cnpj)
        : [];
      if (toEnqueue.length > 0) {
        await enqueue(toEnqueue, { priority: 10, userId: ctx.user.id });
      }
      const justEnqueued = new Set(toEnqueue);

      const leads: RadarLead[] = page.map(({ row, distanceKm }) => {
        const municipio = municipioByIbge(row.municipioIbge);
        const municipality: RadarMunicipality = municipio
          ? { ibge: municipio.ibge, nome: municipio.nome, uf: municipio.uf }
          : { ibge: row.municipioIbge, nome: '', uf: row.uf };
        const phones = phonesByRow.get(row.cnpj)!;
        const crm = crmStatusFor(row.cnpj, phones.map((p) => p.digits));
        const emailSuppressed = !!row.email && suppressedSet.has(row.email.toLowerCase().trim());
        const enrichmentRow = enrichmentByCnpj.get(row.cnpj);
        // Card que acabamos de mandar para a fila: mostra na hora como
        // 'pendente' (sem esperar o próximo poll) mas mantém o dado anterior,
        // se houver, em vez de apagar o que já se sabia sobre a empresa.
        const enrichment: RadarEnrichment | null = justEnqueued.has(row.cnpj)
          ? { status: 'pendente', updatedAt: null, data: enrichmentRow ? toRadarEnrichmentData(enrichmentRow.result) : null }
          : toRadarEnrichment(enrichmentRow, now);
        return buildLead(
          row, municipality, distanceKm, codes.includes(row.cnaePrincipal), phones, crm, emailSuppressed, enrichment,
          toRadarLeadActivity(actionByCnpj.get(row.cnpj)),
        );
      });

      return { origin: originResult, municipalitiesInRadius: nearby.length, leads, truncated, datasetRelease, enricherOnline };
    }),

  // Polling da tela enquanto o robô da VPS enriquece os cards (Fase 2). Barato
  // de propósito: um select em `radar_enrichment` (em lote) e a leitura do
  // heartbeat — nada de N+1 por card.
  enrichmentStatus: protectedProcedure
    .input(z.object({ cnpjs: z.array(CNPJ).max(200) }))
    .query(async ({ input }): Promise<{ enricherOnline: boolean; items: Record<string, RadarEnrichment> }> => {
      const now = new Date();
      const [heartbeat, enrichmentByCnpj] = await Promise.all([
        loadHeartbeat(),
        loadEnrichments(input.cnpjs),
      ]);

      const items: Record<string, RadarEnrichment> = {};
      for (const cnpj of input.cnpjs) {
        const row = enrichmentByCnpj.get(cnpj);
        if (!row) continue; // sem linha == nunca foi pedido; a tela não precisa dele aqui
        const enrichment = toRadarEnrichment(row, now);
        if (enrichment) items[cnpj] = enrichment;
      }

      return { enricherOnline: isEnricherOnline(heartbeat, now), items };
    }),

  // "Varrer agora" num card: fura a fila (prioridade alta) ou refaz um resultado vencido/falho.
  // `force` também refaz um 'pronto' ainda dentro do prazo — mas nunca mexe num
  // card que o robô já reservou ('processando').
  enrichNow: protectedProcedure
    .input(z.object({ cnpj: CNPJ, force: z.boolean().optional() }))
    .mutation(async ({ input, ctx }): Promise<RadarEnrichment> => {
      checkEnrichNowRate(ctx.user.id);

      const [establishment] = await db.select({ cnpj: radarEstablishments.cnpj }).from(radarEstablishments)
        .where(eq(radarEstablishments.cnpj, input.cnpj));
      if (!establishment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado na base do Radar' });
      if ((await loadLeadAction(input.cnpj))?.discardedAt) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Empresa descartada — não vale buscar na web.' });
      }

      const now = new Date();
      if (!isEnricherOnline(await loadHeartbeat(), now)) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'O robô de busca na web está desligado.' });
      }

      await enqueue([input.cnpj], { priority: 100, userId: ctx.user.id, force: input.force ?? false });

      const row = (await loadEnrichments([input.cnpj])).get(input.cnpj);
      const enrichment = toRadarEnrichment(row, now);
      if (!enrichment) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enfileirar o enriquecimento' });
      }
      return enrichment;
    }),

  // Confirma na hora, na Receita (via BrasilAPI), se o CNPJ continua ativo — a base
  // importada pode ter até um mês de atraso.
  verifyCnpj: protectedProcedure
    .input(z.object({ cnpj: CNPJ }))
    .mutation(async ({ input, ctx }): Promise<RadarCnpjCheck> => {
      checkVerifyCnpjRate(ctx.user.id);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CNPJ_CHECK_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${input.cnpj}`, { signal: controller.signal });
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Não foi possível consultar a Receita agora. Tente novamente em instantes.',
        });
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 404) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'CNPJ não encontrado na Receita' });
      }
      if (!res.ok) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'A consulta à Receita falhou. Tente novamente em instantes.',
        });
      }

      let data: { situacao_cadastral?: number; descricao_situacao_cadastral?: string; razao_social?: string };
      try {
        data = await res.json() as typeof data;
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'A Receita devolveu uma resposta inesperada. Tente novamente.',
        });
      }

      return {
        cnpj: input.cnpj,
        ativa: data?.situacao_cadastral === 2,
        situacao: String(data?.descricao_situacao_cadastral ?? 'DESCONHECIDA'),
        razaoSocial: String(data?.razao_social ?? ''),
        checkedAt: new Date().toISOString(),
        source: 'brasilapi',
      };
    }),

  draftMessage: protectedProcedure
    .input(z.object({
      cnpj: CNPJ,
      originIbge: z.number().int(),
      bags: BAGS,
      loadDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      freightNote: z.string().trim().max(200).optional(),
    }))
    .mutation(async ({ input, ctx }): Promise<{ message: string; provider: string }> => {
      checkDraftMessageRate(ctx.user.id);

      const [establishment] = await db.select().from(radarEstablishments).where(eq(radarEstablishments.cnpj, input.cnpj));
      if (!establishment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado na base do Radar' });

      const origin = municipioByIbge(input.originIbge);
      if (!origin) throw new TRPCError({ code: 'NOT_FOUND', message: 'Município de origem não encontrado' });

      const municipio = municipioByIbge(establishment.municipioIbge);
      const cityLabel = municipio ? `${municipio.nome} - ${municipio.uf}` : establishment.uf;

      const draftInput: RadarDraftInput = {
        companyName: establishment.nomeFantasia || establishment.razaoSocial,
        cityLabel,
        segmentLabels: segmentLabelsForCnaes(establishment.cnaesAlvo),
        originLabel: `${origin.nome} - ${origin.uf}`,
        bags: input.bags,
        loadDate: input.loadDate,
        freightNote: input.freightNote,
        attendantName: ctx.user.name,
      };

      try {
        return await draftRadarMessage(draftInput);
      } catch (err) {
        console.error('[prospectingRadar.draftMessage] draftRadarMessage failed:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Não foi possível gerar o rascunho da mensagem agora. Tente novamente em instantes.',
        });
      }
    }),

  // O atendente abriu o WhatsApp ou ligou a partir do card. Registra para os
  // outros atendentes verem "contatado por Fulano" e não ligarem de novo.
  // Não cria tarefa — isso é só no `convert`, depois do contato.
  markContacted: protectedProcedure
    .input(z.object({ cnpj: CNPJ, channel: z.enum(RADAR_CONTACT_CHANNELS) }))
    .mutation(async ({ input, ctx }): Promise<RadarLeadActivity> => {
      checkLeadActionRate(ctx.user.id);
      await requireEstablishment(input.cnpj);
      const now = new Date();
      await db.insert(radarLeadActions).values({
        cnpj: input.cnpj,
        contactedAt: now,
        contactedByUserId: ctx.user.id,
        contactedByName: ctx.user.name,
        contactChannel: input.channel,
        contactCount: 1,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: radarLeadActions.cnpj,
        set: {
          contactedAt: now,
          contactedByUserId: ctx.user.id,
          contactedByName: ctx.user.name,
          contactChannel: input.channel,
          contactCount: sql`${radarLeadActions.contactCount} + 1`,
          updatedAt: now,
        },
      });
      await logLeadEvent({ cnpj: input.cnpj, type: 'contatado', user: ctx.user, channel: input.channel });
      return toRadarLeadActivity(await loadLeadAction(input.cnpj));
    }),

  // Descarta a empresa da lista para todos os atendentes (com motivo). Fica para
  // sempre — só admin/gerente desfaz, com `restore` — e vai para o histórico. "Pediu para não ser contatado" também descadastra o e-mail
  // dela de todo e-mail marketing do CRM (email_suppressions) — isso o restore
  // não desfaz, de propósito.
  discard: protectedProcedure
    .input(z.object({
      cnpj: CNPJ,
      reason: z.enum(RADAR_DISCARD_REASON_KEYS),
      note: z.string().trim().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }): Promise<RadarLeadActivity> => {
      checkLeadActionRate(ctx.user.id);
      if (input.reason === 'outro' && !input.note) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Descreva o motivo do descarte.' });
      }
      const establishment = await requireEstablishment(input.cnpj);
      const now = new Date();
      const values = {
        discardedAt: now,
        discardedByUserId: ctx.user.id,
        discardedByName: ctx.user.name,
        discardReason: input.reason,
        discardNote: input.note || null,
        updatedAt: now,
      };
      await db.insert(radarLeadActions).values({ cnpj: input.cnpj, ...values })
        .onConflictDoUpdate({ target: radarLeadActions.cnpj, set: values });
      await logLeadEvent({ cnpj: input.cnpj, type: 'descartado', user: ctx.user, reason: input.reason, note: input.note || null });
      if (input.reason === 'nao_contatar' && establishment.email) {
        await db.insert(emailSuppressions)
          .values({ email: establishment.email.toLowerCase().trim(), reason: 'manual' })
          .onConflictDoNothing({ target: emailSuppressions.email });
      }
      return toRadarLeadActivity(await loadLeadAction(input.cnpj));
    }),

  // Só admin/gerente desfaz um descarte (o dono quer os descartados mantidos).
  // O descarte original continua no histórico (radar_lead_events).
  restore: staffProcedure
    .input(z.object({ cnpj: CNPJ, note: z.string().trim().max(500).optional() }))
    .mutation(async ({ input, ctx }): Promise<RadarLeadActivity> => {
      checkLeadActionRate(ctx.user.id);
      const current = await loadLeadAction(input.cnpj);
      if (!current?.discardedAt) return toRadarLeadActivity(current);
      await db.update(radarLeadActions).set({
        discardedAt: null, discardedByUserId: null, discardedByName: null,
        discardReason: null, discardNote: null, updatedAt: new Date(),
      }).where(eq(radarLeadActions.cnpj, input.cnpj));
      await logLeadEvent({ cnpj: input.cnpj, type: 'restaurado', user: ctx.user, note: input.note || null });
      return toRadarLeadActivity(await loadLeadAction(input.cnpj));
    }),

  // Transforma o lead aprovado pelo atendente em tarefa do CRM (tabela `tasks`).
  convert: protectedProcedure
    .input(z.object({
      cnpj: CNPJ,
      originIbge: z.number().int(),
      bags: BAGS,
      message: z.string().trim().max(2000).optional(),
      phoneDigits: z.string().regex(/^\d{10,11}$/).optional(),
      // Obrigatório quando o lead já foi excluído do CRM antes (task_deletion_logs):
      // o atendente viu o motivo e decidiu seguir mesmo assim.
      acknowledgeExcluded: z.boolean().optional(),
      // O que o cliente respondeu no contato feito pela lista.
      contactNote: z.string().trim().max(2000).optional(),
      // Próximo retorno (YYYY-MM-DD, horário de São Paulo). Sem data = hoje.
      reminderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ input, ctx }): Promise<{ taskId: number }> => {
      const action = await loadLeadAction(input.cnpj);
      if (action?.discardedAt) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Esta empresa foi descartada por ${action.discardedByName} (${discardReasonLabel(action.discardReason ?? 'outro')}). Restaure antes de criar a tarefa.`,
        });
      }
      const [establishment] = await db.select().from(radarEstablishments).where(eq(radarEstablishments.cnpj, input.cnpj));
      if (!establishment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Estabelecimento não encontrado na base do Radar' });

      const origin = municipioByIbge(input.originIbge);
      if (!origin) throw new TRPCError({ code: 'NOT_FOUND', message: 'Município de origem não encontrado' });

      const municipio = municipioByIbge(establishment.municipioIbge);
      const municipioNome = municipio?.nome ?? '';
      const uf = municipio?.uf ?? establishment.uf;

      const phones = establishmentPhones(establishment);
      const phoneCandidates = [...new Set([
        ...(input.phoneDigits ? [input.phoneDigits.replace(/\D/g, '')] : []),
        ...phones.map((p) => p.digits),
      ])];

      // Re-checagem em tempo real: o resultado de `search` pode ter minutos e
      // outro atendente pode ter convertido o mesmo lead nesse meio tempo.
      const dupConditions: SQL[] = [eq(tasks.cnpj, establishment.cnpj)];
      if (phoneCandidates.length) dupConditions.push(inArray(tasks.phone, phoneCandidates));
      const [existingTask] = await db.select({ id: tasks.id, cnpj: tasks.cnpj, assignedTo: tasks.assignedTo })
        .from(tasks).where(or(...dupConditions)).limit(1);
      if (existingTask) {
        const who = existingTask.assignedTo ? `, atribuída a ${existingTask.assignedTo}` : '';
        const via = existingTask.cnpj === establishment.cnpj ? 'CNPJ' : 'telefone';
        throw new TRPCError({ code: 'CONFLICT', message: `Este lead já é uma tarefa no CRM (mesmo ${via})${who}.` });
      }

      if (!input.acknowledgeExcluded) {
        const logConditions: SQL[] = [eq(taskDeletionLogs.cnpj, establishment.cnpj)];
        if (phoneCandidates.length) logConditions.push(inArray(taskDeletionLogs.phone, phoneCandidates));
        const [log] = await db.select({ reason: taskDeletionLogs.reason, deletedByName: taskDeletionLogs.deletedByName })
          .from(taskDeletionLogs).where(or(...logConditions)).orderBy(desc(taskDeletionLogs.createdAt)).limit(1);
        if (log) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: `Este lead já foi excluído do CRM antes (motivo: "${log.reason}", por ${log.deletedByName}). Confirme para prosseguir mesmo assim.`,
          });
        }
      }

      const phoneToUse = pickTaskPhone(phones, input.phoneDigits);

      const [suppressedRow] = establishment.email
        ? await db.select({ email: emailSuppressions.email }).from(emailSuppressions)
            .where(eq(emailSuppressions.email, establishment.email.toLowerCase().trim())).limit(1)
        : [];
      const email = establishment.email && !suppressedRow ? establishment.email.toLowerCase().trim() : undefined;

      // Idempotente: garante que a tag exista no catálogo de admin para
      // aparecer no filtro de tags da tela de Tarefas.
      await db.insert(tags).values({ name: RADAR_TAG }).onConflictDoNothing({ target: tags.name });

      // Se o robô já enriqueceu este CNPJ (Fase 2), leva o que achou para as
      // notas da tarefa — é o único lugar em que esse dado sobrevive além da
      // tela de busca.
      const [enrichmentRow] = await db.select({ result: radarEnrichment.result }).from(radarEnrichment)
        .where(eq(radarEnrichment.cnpj, establishment.cnpj));
      const enrichmentData = enrichmentRow ? toRadarEnrichmentData(enrichmentRow.result) : null;

      const assignedTo = ctx.user.role !== 'admin' ? ctx.user.name : undefined;
      const companyName = establishment.nomeFantasia || establishment.razaoSocial;
      const notes = buildTaskNotes({
        originLabel: `${origin.nome} - ${origin.uf}`,
        bags: input.bags,
        cnpj: establishment.cnpj,
        razaoSocial: establishment.razaoSocial,
        endereco: establishment.endereco,
        sourceRelease: establishment.sourceRelease,
        message: input.message,
        contact: action?.contactedAt
          ? { at: action.contactedAt, byName: action.contactedByName ?? '', channel: toRadarLeadActivity(action).contactChannel }
          : null,
        contactNote: input.contactNote,
        enrichment: enrichmentData,
      });

      let created;
      try {
        [created] = await db.insert(tasks).values({
          userId: ctx.user.id,
          clientId: 0,
          title: taskTitle(companyName, municipioNome, uf),
          description: taskDescription(municipioNome, uf),
          notes,
          email,
          tags: [RADAR_TAG],
          reminderDate: input.reminderDate ? reminderFromDateStr(input.reminderDate) : new Date(),
          // Contato feito pela lista conta como contato real da tarefa (métricas de progresso).
          lastContactedAt: action?.contactedAt ?? null,
          contactCount: action?.contactedAt ? action.contactCount : 0,
          reminderEnabled: true,
          priority: 'high',
          status: 'pending',
          assignedTo,
          cnpj: establishment.cnpj,
          phone: phoneToUse,
          // E-mail importado nunca entra confirmado — só o atendente confirma à
          // mão depois (tasks.confirmEmail), igual a qualquer outra importação.
          // Isso é o que impede runTriggerNow('lead_created') de disparar
          // automação de e-mail marketing para um lead que nunca deu
          // consentimento (por isso este `convert`, ao contrário de
          // tasks.create, NÃO chama runTriggerNow — ver nota abaixo).
          emailConfirmed: false,
        }).returning();
      } catch (err) {
        if ((err as { code?: string } | null)?.code === '23505') {
          throw new TRPCError({ code: 'CONFLICT', message: 'Este lead já foi convertido em tarefa por outro atendente.' });
        }
        throw err;
      }
      if (!created) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao criar a tarefa' });

      // Deliberadamente NÃO chama runTriggerNow('lead_created', ...) aqui (ao
      // contrário de tasks.create/bulkCreate/confirmEmail): esse hook enrola o
      // e-mail numa sequência de e-mail marketing mesmo com emailConfirmed
      // false — só a automação `inactive_days`, que roda via cron, respeita
      // esse flag (ver server/email/automations.ts). Um lead do Radar vem de
      // uma base pública e nunca deu consentimento algum; ele só pode entrar
      // em qualquer automação depois que o atendente confirmar o e-mail à mão.

      await logLeadEvent({ cnpj: establishment.cnpj, type: 'convertido', user: ctx.user, taskId: created.id });
      return { taskId: created.id };
    }),
});
