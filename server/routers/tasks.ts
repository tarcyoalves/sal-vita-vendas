import { z } from 'zod';
import { eq, inArray, or, isNotNull, isNull, and, gte, count, sql, SQL, asc, desc } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { tasks, sellers, users, taskDeletionLogs } from '../db/schema';
import { runTriggerNow, cancelAllEnrollments } from '../email/automations';
import { normalizeBrPhone, phoneOfTask } from '../../shared/phone';
import { isNewContact } from '../lib/taskNotes';
import { matchAssignee, ehDuplicada, lembreteEscalonado, executarComOrcamento } from '../lib/taskImport';

// Tag aplicada/removida automaticamente junto com tasks.emailConfirmed (ver
// confirmEmail e update abaixo), para permitir filtrar tarefas por confirmação
// de e-mail usando o filtro de tags já existente na UI. Sincronizada sempre
// que o flag muda — nunca editar manualmente sem também ajustar o flag.
const EMAIL_CONFIRMED_TAG = 'Email Confirmado';

// Normaliza CNPJ/telefone para somente dígitos. Para telefone, remove o código
// do país (55) quando presente, para casar números digitados com ou sem DDI.
function normalizeCnpj(value?: string | null): string | undefined {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits || undefined;
}
function normalizePhone(value?: string | null): string | undefined {
  let digits = (value ?? '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  return digits || undefined;
}

// Build the assignedTo filter for a non-admin user.
// Uses case-insensitive comparison: tasks imported via CSV often have different
// capitalization than the seller name stored in the DB (e.g. "MATHEUS" vs "Matheus").
export async function userTaskFilter(userId: number, userName: string) {
  const sellerRows = await db.select({ name: sellers.name }).from(sellers).where(eq(sellers.userId, userId));
  const sellerName = sellerRows[0]?.name;
  const conditions: SQL<unknown>[] = [eq(tasks.userId, userId)];
  if (userName) conditions.push(sql`lower(${tasks.assignedTo}) = ${userName.toLowerCase()}`);
  if (sellerName) conditions.push(sql`lower(${tasks.assignedTo}) = ${sellerName.toLowerCase()}`);
  return or(...conditions);
}

// "Dono da tarefa" tem que existir: atendente cadastrado ou conta admin/gerente. Devolve a grafia
// do cadastro (lista, filtros e userTaskFilter comparam o nome em minúsculas, mas a tela mostra o texto).
async function resolveAssignee(raw: string): Promise<string> {
  const alvo = raw.trim().toLowerCase();
  const [sellerRows, staffRows] = await Promise.all([
    db.select({ name: sellers.name }).from(sellers).where(sql`lower(trim(${sellers.name})) = ${alvo}`),
    db.select({ name: users.name }).from(users).where(and(sql`lower(trim(${users.name})) = ${alvo}`, inArray(users.role, ['admin', 'manager']))),
  ]);
  const nome = matchAssignee(raw, sellerRows.map(r => r.name), staffRows.map(r => r.name));
  if (!nome) throw new TRPCError({ code: 'BAD_REQUEST', message: `Atendente "${raw.trim()}" não encontrado no cadastro. Escolha um atendente da lista.` });
  return nome;
}

// Columns returned by tasks.list — excludes `notes` (up to 5000 chars) and
// `description` (up to 2000 chars) to reduce transfer payload. Use tasks.getById
// to fetch the full task when opening a detail view.
const listColumns = {
  id: tasks.id,
  clientId: tasks.clientId,
  userId: tasks.userId,
  title: tasks.title,
  email: tasks.email,
  tags: tasks.tags,
  reminderDate: tasks.reminderDate,
  reminderEnabled: tasks.reminderEnabled,
  status: tasks.status,
  priority: tasks.priority,
  assignedTo: tasks.assignedTo,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  convertedAt: tasks.convertedAt,
  contactCount: tasks.contactCount,
  lastContactedAt: tasks.lastContactedAt,
  hotLead: tasks.hotLead,
  lastEngagementAt: tasks.lastEngagementAt,
  cnpj: tasks.cnpj,
  phone: tasks.phone,
  orderValue: tasks.orderValue,
  orderId: tasks.orderId,
  emailConfirmed: tasks.emailConfirmed,
  emailConfirmedAt: tasks.emailConfirmedAt,
  emailConfirmedBy: tasks.emailConfirmedBy,
};

export const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'admin') {
      return db.select(listColumns).from(tasks).orderBy(tasks.createdAt);
    }
    const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    return db.select(listColumns).from(tasks).where(filter).orderBy(tasks.createdAt);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id));
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ctx.user.role !== 'admin') {
        const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
        const [owned] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.id), filter));
        if (!owned) throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return task;
    }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number().optional().default(0),
      title: z.string().min(1).max(500),
      description: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      email: z.string().email().max(200).optional().or(z.literal('')),
      tags: z.array(z.string()).optional(),
      reminderDate: z.date({ required_error: 'Data do lembrete é obrigatória' }),
      reminderEnabled: z.boolean().optional().default(true),
      priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
      assignedTo: z.string().optional(),
      cnpj: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // assignedTo livre plantava tarefa na lista de outro atendente: o nome informado
      // tem que existir no cadastro (o padrão, o próprio usuário, não precisa).
      const assignedTo = input.assignedTo?.trim()
        ? await resolveAssignee(input.assignedTo)
        : (ctx.user.role !== 'admin' ? ctx.user.name : undefined);
      const email = input.email ? input.email.toLowerCase().trim() : undefined;
      // E-mail digitado à mão pelo atendente já entra confirmado (importações não
      // passam o campo `email` — elas o preenchem depois via backfill, logo ficam
      // não-confirmadas até o atendente editar/confirmar).
      const emailConfirmer = ctx.user.name ?? ctx.user.email;
      const [created] = await db.insert(tasks).values({
        userId: ctx.user.id,
        clientId: input.clientId,
        title: input.title,
        description: input.description,
        notes: input.notes,
        email,
        tags: input.tags,
        reminderDate: input.reminderDate,
        reminderEnabled: input.reminderEnabled,
        priority: input.priority,
        assignedTo,
        status: 'pending',
        cnpj: normalizeCnpj(input.cnpj),
        phone: normalizePhone(input.phone),
        emailConfirmed: !!email,
        emailConfirmedAt: email ? new Date() : null,
        emailConfirmedBy: email ? emailConfirmer : null,
      }).returning();

      if (created?.email) {
        try {
          await runTriggerNow('lead_created', {
            id: created.id,
            email: created.email,
            title: created.title,
            tags: created.tags,
            assignedTo: created.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.create] runTriggerNow(lead_created) failed:', err);
        }
      }

      return created;
    }),

  // Cria N tarefas em um único INSERT (usado pela importação de CSV, que antes
  // fazia uma chamada `create` por linha). Mesma validação e normalização de
  // create acima, linha a linha — só o INSERT é agrupado. Mantém o mesmo efeito
  // colateral de disparar `lead_created` para cada tarefa criada com e-mail.
  bulkCreate: protectedProcedure
    .input(z.object({
      items: z.array(z.object({
        clientId: z.number().optional().default(0),
        title: z.string().min(1).max(500),
        description: z.string().max(2000).optional(),
        notes: z.string().max(5000).optional(),
        email: z.string().email().max(200).optional().or(z.literal('')),
        tags: z.array(z.string()).optional(),
        // Sem data: o servidor escalona (1 a cada 2 min a partir de agora + 5 min) em vez de
        // empilhar todas no mesmo minuto.
        reminderDate: z.date().optional(),
        reminderEnabled: z.boolean().optional().default(true),
        priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
        assignedTo: z.string().optional(),
        cnpj: z.string().optional(),
        phone: z.string().optional(),
      })).min(1).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      const emailConfirmer = ctx.user.name ?? ctx.user.email;

      // Reimportar o mesmo arquivo não pode duplicar: ignora linhas cujo CNPJ ou telefone
      // (normalizados) já existem em tasks.
      const cnpjs = [...new Set(input.items.map(i => normalizeCnpj(i.cnpj)).filter((v): v is string => !!v))];
      const phones = [...new Set(input.items.map(i => normalizePhone(i.phone)).filter((v): v is string => !!v))];
      const jaExistem = { cnpjs: new Set<string>(), phones: new Set<string>() };
      const conds: SQL<unknown>[] = [];
      if (cnpjs.length) conds.push(inArray(tasks.cnpj, cnpjs));
      if (phones.length) conds.push(inArray(tasks.phone, phones));
      if (conds.length) {
        const existentes = await db.select({ cnpj: tasks.cnpj, phone: tasks.phone }).from(tasks).where(or(...conds));
        for (const e of existentes) {
          if (e.cnpj) jaExistem.cnpjs.add(e.cnpj);
          if (e.phone) jaExistem.phones.add(e.phone);
        }
      }
      const novos = input.items.filter(item => !ehDuplicada({ cnpj: normalizeCnpj(item.cnpj), phone: normalizePhone(item.phone) }, jaExistem));
      const duplicadas = input.items.length - novos.length;
      if (novos.length === 0) return { created: [], length: 0, duplicadas };

      // Mesmo critério do create: cada nome distinto informado é validado uma vez.
      const resolvidos = new Map<string, string>();
      for (const nome of new Set(novos.map(i => i.assignedTo?.trim()).filter((v): v is string => !!v))) {
        resolvidos.set(nome, await resolveAssignee(nome));
      }

      const baseLembrete = new Date(Date.now() + 5 * 60 * 1000);
      let semData = 0;
      const rows = novos.map(item => {
        const assignedTo = item.assignedTo?.trim()
          ? resolvidos.get(item.assignedTo.trim())
          : (ctx.user.role !== 'admin' ? ctx.user.name : undefined);
        const email = item.email ? item.email.toLowerCase().trim() : undefined;
        return {
          userId: ctx.user.id,
          clientId: item.clientId,
          title: item.title,
          description: item.description,
          notes: item.notes,
          email,
          tags: item.tags,
          reminderDate: item.reminderDate ?? lembreteEscalonado(baseLembrete, semData++),
          reminderEnabled: item.reminderEnabled,
          priority: item.priority,
          assignedTo,
          status: 'pending' as const,
          cnpj: normalizeCnpj(item.cnpj),
          phone: normalizePhone(item.phone),
          emailConfirmed: !!email,
          emailConfirmedAt: email ? new Date() : null,
          emailConfirmedBy: email ? emailConfirmer : null,
        };
      });

      const created = await db.insert(tasks).values(rows).returning();

      // 2000 runTriggerNow em sequência estouram os 60 s da função: as 200 primeiras uma a uma,
      // o resto 10 por vez, tudo sob orçamento de 40 s. A tarefa já está criada; o que não rodar
      // só perde a automação "lead criado" (reaparece ao confirmar o e-mail) e fica no log.
      const comEmail = created.filter(r => !!r.email);
      const r = await executarComOrcamento(comEmail, async (row) => {
        try {
          await runTriggerNow('lead_created', {
            id: row.id,
            email: row.email,
            title: row.title,
            tags: row.tags,
            assignedTo: row.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.bulkCreate] runTriggerNow(lead_created) failed:', err);
        }
      }, { sequenciais: 200, concorrencia: 10, orcamentoMs: 40_000 });
      if (r.naoExecutados.length > 0) {
        console.warn(`[tasks.bulkCreate] orçamento de tempo esgotado: ${r.naoExecutados.length} automações lead_created não rodaram (ids ${r.naoExecutados.slice(0, 20).map(t => t.id).join(',')}...)`);
      }

      // `length` mantém compatibilidade com o front antigo (que lia `created.length` do array).
      return { created, length: created.length, duplicadas };
    }),

  // Reatribuição em massa (usada pelo botão "Designar" da seleção múltipla).
  // Diferente de `update`, esta ação só toca assignedTo — não mexe em
  // email/tags/notes, então nenhuma das trilhas de automação de `update`
  // (email confirmado, tag_added) se aplica aqui. Por isso um endpoint dedicado
  // e simples (1 UPDATE com inArray) é suficiente, em vez de generalizar todo
  // o `update` complexo para lote.
  bulkAssign: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(2000),
      assignedTo: z.string().trim().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const assignedTo = await resolveAssignee(input.assignedTo);
      const ownerFilter = ctx.user.role === 'admin'
        ? inArray(tasks.id, input.ids)
        : and(inArray(tasks.id, input.ids), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));
      const updated = await db.update(tasks)
        .set({ assignedTo, updatedAt: new Date() })
        .where(ownerFilter)
        .returning({ id: tasks.id });
      return { updated: updated.length };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().trim().min(1, 'Título não pode ficar vazio').max(500).optional(),
      description: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      email: z.string().email().max(200).optional().or(z.literal('')),
      tags: z.array(z.string()).optional(),
      reminderDate: z.date().optional().nullable(),
      reminderEnabled: z.boolean().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      assignedTo: z.string().trim().optional(),
      status: z.enum(['pending', 'completed', 'cancelled']).optional(),
      // Quando o atendente edita o e-mail para um novo valor, o front envia
      // `emailConfirmed: true` (e-mail digitado = confirmado). Em saves que não
      // mexem no e-mail, o campo vem `undefined` e a confirmação não é tocada.
      emailConfirmed: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, emailConfirmed, ...data } = input;
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, id)
        : and(eq(tasks.id, id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));
      // Mark real contact: attendant manually saved notes (>15 chars = real annotation)
      const now = new Date();
      const setData: Record<string, any> = { ...data, updatedAt: now };
      // assignedTo vazio = tarefa sem responsável (null), nunca a string vazia
      if (data.assignedTo !== undefined) {
        setData.assignedTo = data.assignedTo || null;
        if (data.assignedTo) {
          // A tela reenvia o responsável atual em todo save: só valida (e normaliza) quando mudou,
          // senão uma tarefa antiga com nome fora do cadastro ficaria impossível de editar.
          const [atual] = await db.select({ assignedTo: tasks.assignedTo }).from(tasks).where(ownerFilter).limit(1);
          if ((atual?.assignedTo ?? '').trim().toLowerCase() !== data.assignedTo.trim().toLowerCase()) {
            setData.assignedTo = await resolveAssignee(data.assignedTo);
          }
        }
      }
      let confirmedNow = false;
      if (data.email !== undefined) {
        const newEmail = data.email ? data.email.toLowerCase().trim() : null;
        setData.email = newEmail;
        if (!newEmail) {
          // E-mail removido → deixa de ser confirmado.
          setData.emailConfirmed = false;
          setData.emailConfirmedAt = null;
          setData.emailConfirmedBy = null;
        } else if (emailConfirmed === true) {
          setData.emailConfirmed = true;
          setData.emailConfirmedAt = now;
          setData.emailConfirmedBy = ctx.user.name ?? ctx.user.email;
          confirmedNow = true;
        } else if (emailConfirmed === false) {
          setData.emailConfirmed = false;
          setData.emailConfirmedAt = null;
          setData.emailConfirmedBy = null;
        }
        // emailConfirmed === undefined → e-mail inalterado: não mexe na confirmação.
      }
      // Uma leitura só do registro atual: serve ao contato (notas mudaram?) e ao telefone.
      if (data.title !== undefined || data.notes !== undefined) {
        const [cur] = await db.select({ phone: tasks.phone, title: tasks.title, notes: tasks.notes }).from(tasks).where(ownerFilter).limit(1);
        if (cur && data.notes !== undefined && isNewContact(cur.notes, data.notes)) {
          setData.lastContactedAt = now;
          setData.contactCount = sql`${tasks.contactCount} + 1`;
        }
        // Telefone digitado depois da criação (título/anotações): preenche a coluna `phone` se estiver
        // vazia, para o Buscador, o dedupe e o botão de WhatsApp enxergarem o número.
        if (cur && !normalizeBrPhone(cur.phone)) {
          const found = phoneOfTask({ title: data.title ?? cur.title, notes: data.notes ?? cur.notes });
          if (found) setData.phone = found;
        }
      }
      const needsPrev = data.email !== undefined || data.tags !== undefined;
      let oldEmail: string | null = null;
      let oldTags: string[] = [];
      if (needsPrev) {
        const [prev] = await db.select({ email: tasks.email, tags: tasks.tags }).from(tasks).where(ownerFilter).limit(1);
        oldEmail = prev?.email?.toLowerCase().trim() ?? null;
        oldTags = prev?.tags ?? [];
      }

      // Mesma tag "Email Confirmado" sincronizada em tasks.confirmEmail — aqui
      // cobre o caso de o atendente confirmar implicitamente ao digitar um e-mail novo.
      if ('emailConfirmed' in setData) {
        const baseTags: string[] = setData.tags !== undefined ? setData.tags : oldTags;
        setData.tags = setData.emailConfirmed
          ? (baseTags.includes(EMAIL_CONFIRMED_TAG) ? baseTags : [...baseTags, EMAIL_CONFIRMED_TAG])
          : baseTags.filter((t: string) => t !== EMAIL_CONFIRMED_TAG);
      }

      const [updated] = await db
        .update(tasks)
        .set(setData)
        .where(ownerFilter)
        .returning();
      if (!updated) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });

      if (oldEmail && oldEmail !== (updated.email?.toLowerCase().trim() ?? null)) {
        try {
          await cancelAllEnrollments(oldEmail);
        } catch (err) {
          console.error('[tasks.update] cancelAllEnrollments for old email failed:', err);
        }
      }

      if (confirmedNow && updated.email) {
        try {
          await runTriggerNow('lead_created', {
            id: updated.id, email: updated.email, title: updated.title, tags: updated.tags, assignedTo: updated.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.update] runTriggerNow(lead_created) failed:', err);
        }
      }

      if (data.tags && updated.email) {
        const newTags = updated.tags ?? [];
        const addedTags = newTags.filter(t => !oldTags.includes(t));
        for (const tag of addedTags) {
          try {
            await runTriggerNow('tag_added', {
              id: updated.id, email: updated.email, title: updated.title, tags: updated.tags, assignedTo: updated.assignedTo,
            }, { addedTag: tag });
          } catch (err) {
            console.error(`[tasks.update] runTriggerNow(tag_added, ${tag}) failed:`, err);
          }
        }
      }
      let burstWarning = false;
      let burstCount = 0;
      if (ctx.user.role !== 'admin' && setData.lastContactedAt) {
        const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
        const [burstRow] = await db.select({ cnt: count() })
          .from(tasks)
          .where(and(eq(tasks.userId, ctx.user.id), isNotNull(tasks.lastContactedAt), gte(tasks.lastContactedAt, tenMinAgo)));
        burstCount = Number(burstRow?.cnt ?? 0);
        burstWarning = burstCount >= 10;
      }
      return { ...updated, burstWarning, burstCount };
    }),

  // Confirma manualmente o e-mail de uma tarefa (sem alterar o valor) — usado para
  // liberar e-mails IMPORTADOS, que começam não-confirmados. Só após isso o e-mail
  // pode ser usado em campanhas/sequências/automações.
  confirmEmail: protectedProcedure
    .input(z.object({ id: z.number(), confirmed: z.boolean().optional().default(true) }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      const [task] = await db.select({ id: tasks.id, email: tasks.email, tags: tasks.tags }).from(tasks).where(ownerFilter).limit(1);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tarefa não encontrada ou sem permissão' });
      if (input.confirmed && !task.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta tarefa não tem e-mail para confirmar' });
      }

      // Aplica/remove a tag "Email Confirmado" junto com o flag, para permitir
      // filtrar tarefas por confirmação de e-mail via o filtro de tags já existente.
      const currentTags = task.tags ?? [];
      const newTags = input.confirmed
        ? (currentTags.includes(EMAIL_CONFIRMED_TAG) ? currentTags : [...currentTags, EMAIL_CONFIRMED_TAG])
        : currentTags.filter(t => t !== EMAIL_CONFIRMED_TAG);

      const now = new Date();
      const [updated] = await db.update(tasks)
        .set(input.confirmed
          ? { emailConfirmed: true, emailConfirmedAt: now, emailConfirmedBy: ctx.user.name ?? ctx.user.email, updatedAt: now, tags: newTags }
          : { emailConfirmed: false, emailConfirmedAt: null, emailConfirmedBy: null, updatedAt: now, tags: newTags })
        .where(ownerFilter)
        .returning();

      // Ao desconfirmar, o lead deixa de ser elegível: cancela as sequências pendentes
      // (mesmo cancelamento que update/delete já fazem), senão elas seguiriam enviando.
      if (!input.confirmed && task.email) {
        try {
          await cancelAllEnrollments(task.email);
        } catch (err) {
          console.error('[tasks.confirmEmail] cancelAllEnrollments failed:', err);
        }
      }

      // Ao confirmar, o lead "entra" de fato no marketing → dispara a automação
      // "lead criado" (idempotente, seguro re-disparar).
      if (input.confirmed && updated?.email) {
        const taskPayload = { id: updated.id, email: updated.email, title: updated.title, tags: updated.tags, assignedTo: updated.assignedTo };
        try { await runTriggerNow('lead_created', taskPayload); } catch (err) {
          console.error('[tasks.confirmEmail] runTriggerNow(lead_created) failed:', err);
        }
        try { await runTriggerNow('email_confirmed', taskPayload); } catch (err) {
          console.error('[tasks.confirmEmail] runTriggerNow(email_confirmed) failed:', err);
        }
      }

      return updated;
    }),

  // Marca/desmarca o lead como cliente ativo (conversão). Não altera status do lembrete —
  // lembretes continuam recorrentes; isto é apenas um marco de negócio (virou venda).
  toggleConverted: protectedProcedure
    .input(z.object({
      id: z.number(),
      converted: z.boolean(),
      orderValue: z.number().min(0).max(999999.99).optional(),
      orderId: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      // Leitura já com ownerFilter: atendente não lê/regrava tags de tarefa alheia
      const [existing] = await db.select({ tags: tasks.tags, convertedAt: tasks.convertedAt })
        .from(tasks).where(ownerFilter).limit(1);
      if (!existing) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });
      const currentTags = existing.tags ?? [];
      const newTags = input.converted
        ? (currentTags.includes('ativo') ? currentTags : [...currentTags, 'ativo'])
        : currentTags.filter(t => t !== 'ativo');
      const alreadyConverted = !!existing.convertedAt;

      const setData: Record<string, any> = {
        updatedAt: new Date(),
        tags: newTags,
      };
      if (input.converted) {
        // Já convertida: não regrava convertedAt (mantém a data original). Só atualiza valor/pedido.
        if (!alreadyConverted) setData.convertedAt = new Date();
        if (input.orderValue !== undefined) setData.orderValue = input.orderValue.toFixed(2);
        if (input.orderId !== undefined) setData.orderId = input.orderId;
      } else {
        setData.convertedAt = null;
        setData.orderValue = null;
        setData.orderId = null;
      }

      // Não convertida → convertida: UPDATE condicional (converted_at IS NULL). Num clique
      // duplo só uma das requisições "vira" a conversão e dispara lead_converted.
      const becomingConverted = input.converted && !alreadyConverted;
      const [updated] = await db.update(tasks)
        .set(setData)
        .where(becomingConverted ? and(ownerFilter, isNull(tasks.convertedAt)) : ownerFilter)
        .returning();
      if (!updated) {
        const [current] = await db.select().from(tasks).where(ownerFilter).limit(1);
        if (!current) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });
        return current; // perdeu a corrida: a outra requisição já converteu e disparou a automação
      }

      if (becomingConverted && updated.email) {
        try {
          await runTriggerNow('lead_converted', {
            id: updated.id,
            email: updated.email,
            title: updated.title,
            tags: updated.tags,
            assignedTo: updated.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.toggleConverted] runTriggerNow(lead_converted) failed:', err);
        }
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().max(500).optional().default('Não informado'),
    }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      const [task] = await db.select({ id: tasks.id, title: tasks.title, notes: tasks.notes, cnpj: tasks.cnpj, phone: tasks.phone, email: tasks.email })
        .from(tasks).where(ownerFilter).limit(1);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tarefa não encontrada ou sem permissão' });

      await db.insert(taskDeletionLogs).values({
        taskId: task.id,
        taskTitle: task.title,
        taskNotes: task.notes ?? null,
        deletedByUserId: ctx.user.id,
        deletedByName: ctx.user.name ?? ctx.user.email,
        reason: input.reason,
        reviewedByAdmin: ctx.user.role === 'admin',
        cnpj: task.cnpj,
        phone: task.phone,
      });

      // Lead excluído não pode continuar recebendo sequência de e-mail (mesmo cancelamento do update).
      if (task.email) {
        try {
          await cancelAllEnrollments(task.email);
        } catch (err) {
          console.error('[tasks.delete] cancelAllEnrollments failed:', err);
        }
      }

      await db.delete(tasks).where(eq(tasks.id, task.id));
      return { ok: true };
    }),

  deleteMany: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      reason: z.string().max(500).optional().default('Não informado'),
    }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? inArray(tasks.id, input.ids)
        : and(inArray(tasks.id, input.ids), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      const found = await db.select({ id: tasks.id, title: tasks.title, notes: tasks.notes, cnpj: tasks.cnpj, phone: tasks.phone, email: tasks.email })
        .from(tasks).where(ownerFilter);
      if (found.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhuma tarefa encontrada ou sem permissão' });

      await db.insert(taskDeletionLogs).values(found.map(t => ({
        taskId: t.id,
        taskTitle: t.title,
        taskNotes: t.notes ?? null,
        deletedByUserId: ctx.user.id,
        deletedByName: ctx.user.name ?? ctx.user.email,
        reason: input.reason,
        reviewedByAdmin: ctx.user.role === 'admin',
        cnpj: t.cnpj,
        phone: t.phone,
      })));

      const emails = [...new Set(found.map(t => t.email?.toLowerCase().trim()).filter((e): e is string => !!e))];
      for (const email of emails) {
        try {
          await cancelAllEnrollments(email);
        } catch (err) {
          console.error('[tasks.deleteMany] cancelAllEnrollments failed:', err);
        }
      }

      await db.delete(tasks).where(inArray(tasks.id, found.map(t => t.id)));
      return { ok: true, count: found.length };
    }),

  // Verifica, antes de importar, quais CNPJs/telefones já correspondem a uma tarefa
  // excluída anteriormente (task_deletion_logs) — usado para não reimportar leads
  // que um atendente já removeu.
  checkCancelledMatches: protectedProcedure
    .input(z.object({
      items: z.array(z.object({ cnpj: z.string().optional(), phone: z.string().optional() })).max(2000),
    }))
    .query(async ({ input }) => {
      const cnpjs = [...new Set(input.items.map(i => normalizeCnpj(i.cnpj)).filter((v): v is string => !!v))];
      const phones = [...new Set(input.items.map(i => normalizePhone(i.phone)).filter((v): v is string => !!v))];
      if (cnpjs.length === 0 && phones.length === 0) return { cnpjs: [], phones: [] };

      const conditions: SQL<unknown>[] = [];
      if (cnpjs.length) conditions.push(inArray(taskDeletionLogs.cnpj, cnpjs));
      if (phones.length) conditions.push(inArray(taskDeletionLogs.phone, phones));

      const rows = await db.select({ cnpj: taskDeletionLogs.cnpj, phone: taskDeletionLogs.phone })
        .from(taskDeletionLogs)
        .where(or(...conditions));

      return {
        cnpjs: [...new Set(rows.map(r => r.cnpj).filter((v): v is string => !!v))],
        phones: [...new Set(rows.map(r => r.phone).filter((v): v is string => !!v))],
      };
    }),

  // Admin: list pending deletion log reviews
  deletionLogs: adminProcedure
    .input(z.object({ onlyUnreviewed: z.boolean().optional().default(true) }).optional())
    .query(async ({ input }) => {
      const filter = input?.onlyUnreviewed !== false
        ? eq(taskDeletionLogs.reviewedByAdmin, false)
        : undefined;
      return db.select().from(taskDeletionLogs)
        .where(filter)
        .orderBy(desc(taskDeletionLogs.createdAt))
        .limit(100);
    }),

  // Admin: mark a deletion log as reviewed
  markDeletionReviewed: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.update(taskDeletionLogs)
        .set({ reviewedByAdmin: true })
        .where(eq(taskDeletionLogs.id, input.id));
      return { ok: true };
    }),

  fraudAlerts: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [burstRows, hourRows, allSellers] = await Promise.all([
      db.select({ userId: tasks.userId, cnt: count() }).from(tasks)
        .where(and(isNotNull(tasks.lastContactedAt), gte(tasks.lastContactedAt, tenMinAgo)))
        .groupBy(tasks.userId),
      db.select({ userId: tasks.userId, cnt: count() }).from(tasks)
        .where(and(isNotNull(tasks.lastContactedAt), gte(tasks.lastContactedAt, oneHourAgo)))
        .groupBy(tasks.userId),
      db.select({ name: sellers.name, userId: sellers.userId }).from(sellers),
    ]);
    const alerts: { sellerName: string; type: string; message: string; severity: 'high' | 'medium'; count: number }[] = [];
    for (const row of burstRows) {
      if (Number(row.cnt) >= 10) {
        const seller = allSellers.find(s => s.userId === row.userId);
        if (seller) alerts.push({ sellerName: seller.name, type: 'burst', message: `${row.cnt} contatos em menos de 10 minutos`, severity: 'high', count: Number(row.cnt) });
      }
    }
    for (const row of hourRows) {
      if (Number(row.cnt) >= 45) {
        const seller = allSellers.find(s => s.userId === row.userId);
        if (seller && !alerts.some(a => a.sellerName === seller.name)) {
          alerts.push({ sellerName: seller.name, type: 'burst_hour', message: `${row.cnt} contatos em menos de 1 hora`, severity: 'medium', count: Number(row.cnt) });
        }
      }
    }
    return alerts;
  }),

  reminders: protectedProcedure.query(async ({ ctx }) => {
    // Only fetch reminders from yesterday onward — no need for historical data for notifications
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const reminderFields = {
      id: tasks.id, title: tasks.title, reminderDate: tasks.reminderDate,
      reminderEnabled: tasks.reminderEnabled, status: tasks.status,
      // Truncated: only used for short notification bodies, no need for the full text.
      notes: sql<string | null>`substring(${tasks.notes}, 1, 300)`,
      assignedTo: tasks.assignedTo,
    };
    if (ctx.user.role === 'admin') {
      return db.select(reminderFields).from(tasks)
        .where(and(isNotNull(tasks.reminderDate), gte(tasks.reminderDate, yesterday)))
        .orderBy(asc(tasks.reminderDate))
        .limit(300);
    }
    const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    return db.select(reminderFields).from(tasks)
      .where(and(filter, isNotNull(tasks.reminderDate), gte(tasks.reminderDate, yesterday)))
      .orderBy(asc(tasks.reminderDate))
      .limit(300);
  }),
});
