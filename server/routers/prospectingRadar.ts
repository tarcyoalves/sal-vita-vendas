// Radar de Cargas — prospecção para completar a carreta (CRM de Lembretes).
// Visão geral e decisões: PLANO-RADAR-CARGAS.md. Contrato de tipos: shared/radar.ts.
//
// Pertence só ao CRM: usa `db` (DATABASE_URL). Nada aqui toca o banco do Premium.
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { radarEstablishments, tasks, taskDeletionLogs, emailSuppressions, tags } from '../db/schema';
import { municipioByIbge, municipiosWithinRadius, searchMunicipios } from '../lib/radar/geo';
import {
  establishmentPhones,
  buildLead,
  buildTaskNotes,
  pickTaskPhone,
  segmentLabelsForCnaes,
  taskDescription,
  taskTitle,
} from '../lib/radar/leads';
import { draftRadarMessage, type RadarDraftInput } from '../lib/radar/messageDraft';
import {
  RADAR_SEGMENTS,
  RADAR_SEGMENT_KEYS,
  RADAR_MAX_RADIUS_KM,
  RADAR_MAX_RESULTS,
  type RadarCrmStatus,
  type RadarLead,
  type RadarMunicipality,
  type RadarSearchResult,
  type RadarCnpjCheck,
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

const CNPJ_CHECK_TIMEOUT_MS = 10_000;

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
    .query(async ({ input }): Promise<RadarSearchResult> => {
      const origin = municipioByIbge(input.originIbge);
      if (!origin) throw new TRPCError({ code: 'NOT_FOUND', message: 'Município de origem não encontrado' });

      const nearby = municipiosWithinRadius(origin, input.radiusKm);
      const originResult = { ibge: origin.ibge, nome: origin.nome, uf: origin.uf, lat: origin.lat, lon: origin.lon };

      // Base vazia (importador nunca rodou) → resultado vazio, não erro.
      const [releaseRow] = await db
        .select({ release: sql<string | null>`max(${radarEstablishments.sourceRelease})` })
        .from(radarEstablishments);
      const datasetRelease = releaseRow?.release ?? null;
      if (datasetRelease === null) {
        return { origin: originResult, municipalitiesInRadius: nearby.length, leads: [], truncated: false, datasetRelease: null };
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

      const truncated = withDistance.length > RADAR_MAX_RESULTS;
      const page = withDistance.slice(0, RADAR_MAX_RESULTS);

      // Nenhum estabelecimento casou os CNAEs no raio — evita `inArray` com
      // lista vazia (gera SQL inválido) e devolve resultado vazio direto.
      if (page.length === 0) {
        return { origin: originResult, municipalitiesInRadius: nearby.length, leads: [], truncated: false, datasetRelease };
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

      const leads: RadarLead[] = page.map(({ row, distanceKm }) => {
        const municipio = municipioByIbge(row.municipioIbge);
        const municipality: RadarMunicipality = municipio
          ? { ibge: municipio.ibge, nome: municipio.nome, uf: municipio.uf }
          : { ibge: row.municipioIbge, nome: '', uf: row.uf };
        const phones = phonesByRow.get(row.cnpj)!;
        const crm = crmStatusFor(row.cnpj, phones.map((p) => p.digits));
        const emailSuppressed = !!row.email && suppressedSet.has(row.email.toLowerCase().trim());
        return buildLead(row, municipality, distanceKm, codes.includes(row.cnaePrincipal), phones, crm, emailSuppressed);
      });

      return { origin: originResult, municipalitiesInRadius: nearby.length, leads, truncated, datasetRelease };
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
    }))
    .mutation(async ({ input, ctx }): Promise<{ taskId: number }> => {
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
          reminderDate: new Date(),
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

      return { taskId: created.id };
    }),
});
