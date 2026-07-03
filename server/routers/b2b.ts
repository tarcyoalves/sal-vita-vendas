import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { ordersDb as db } from '../db/ordersDb';
import { companies, contacts, publicSources, consentRecords, auditLogs } from '../db/schema';

// Sprint 1 admin surface: view inbound leads + 3 manual stage transitions +
// free-text notes (stored as audit_logs entries — no schema change needed).
// NO scoring, NO outbound, NO automation — see PLANO-FINAL-EXECUCAO-B2B.md.

function requireAdmin(ctx: { user: { role: string } }) {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
}

const STAGE_VALUES = ['qualified', 'contacted', 'lost'] as const;

export const b2bRouter = router({
  listLeads: protectedProcedure
    .input(
      z.object({
        segment: z.string().trim().optional(),
        state: z.string().trim().optional(),
        stage: z.string().trim().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const conditions = [eq(companies.pipelineType, 'inbound')];
      if (input?.segment) conditions.push(eq(companies.segment, input.segment));
      if (input?.state) conditions.push(eq(companies.state, input.state.toUpperCase()));
      if (input?.stage) conditions.push(eq(companies.pipelineStage, input.stage));

      const rows = await db.select().from(companies)
        .where(and(...conditions))
        .orderBy(desc(companies.createdAt));

      const companyIds = rows.map(r => r.id);
      const [allContacts, allSources] = await Promise.all([
        companyIds.length
          ? db.select().from(contacts).where(inArray(contacts.companyId, companyIds)).orderBy(desc(contacts.createdAt))
          : Promise.resolve([] as (typeof contacts.$inferSelect)[]),
        companyIds.length
          ? db.select().from(publicSources).where(inArray(publicSources.companyId, companyIds)).orderBy(desc(publicSources.capturedAt))
          : Promise.resolve([] as (typeof publicSources.$inferSelect)[]),
      ]);
      const contactByCompany = new Map<number, typeof allContacts[number]>();
      for (const c of allContacts) {
        if (!contactByCompany.has(c.companyId)) contactByCompany.set(c.companyId, c);
      }
      const interestByCompany = new Map<number, string>();
      for (const s of allSources) {
        if (interestByCompany.has(s.companyId) || s.sourceType !== 'inbound_form' || !s.rawExcerpt) continue;
        try {
          const parsed = JSON.parse(s.rawExcerpt) as { volumeInterest?: string; message?: string };
          const note = [parsed.volumeInterest, parsed.message].filter(Boolean).join(' — ');
          if (note) interestByCompany.set(s.companyId, note);
        } catch { /* not JSON — skip */ }
      }

      return rows.map(company => {
        const contact = contactByCompany.get(company.id);
        return {
          ...company,
          contactName: contact?.name ?? null,
          contactEmail: contact?.email ?? null,
          contactWhatsapp: contact?.whatsapp ?? null,
          interestNote: interestByCompany.get(company.id) ?? null,
        };
      });
    }),

  getLead: protectedProcedure
    .input(z.object({ companyId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const [company] = await db.select().from(companies).where(eq(companies.id, input.companyId));
      if (!company) throw new TRPCError({ code: 'NOT_FOUND' });

      const [leadContacts, sources, consents, logs] = await Promise.all([
        db.select().from(contacts).where(eq(contacts.companyId, input.companyId)).orderBy(desc(contacts.createdAt)),
        db.select().from(publicSources).where(eq(publicSources.companyId, input.companyId)).orderBy(desc(publicSources.capturedAt)),
        db.select().from(consentRecords).where(eq(consentRecords.companyId, input.companyId)).orderBy(desc(consentRecords.consentedAt)),
        db.select().from(auditLogs)
          .where(and(eq(auditLogs.entityType, 'company'), eq(auditLogs.entityId, input.companyId)))
          .orderBy(desc(auditLogs.createdAt)),
      ]);

      return { company, contacts: leadContacts, sources, consents, logs };
    }),

  updateStage: protectedProcedure
    .input(z.object({ companyId: z.number().int(), stage: z.enum(STAGE_VALUES) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const [updated] = await db.update(companies)
        .set({ pipelineStage: input.stage, updatedAt: new Date() })
        .where(eq(companies.id, input.companyId))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND' });

      await db.insert(auditLogs).values({
        entityType: 'company',
        entityId: input.companyId,
        action: 'stage_changed',
        actorType: 'human',
        actorId: String(ctx.user.id),
        metadataJson: { newStage: input.stage, byName: ctx.user.name },
      });

      return updated;
    }),

  addNote: protectedProcedure
    .input(z.object({ companyId: z.number().int(), note: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const [company] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, input.companyId));
      if (!company) throw new TRPCError({ code: 'NOT_FOUND' });

      await db.insert(auditLogs).values({
        entityType: 'company',
        entityId: input.companyId,
        action: 'note_added',
        actorType: 'human',
        actorId: String(ctx.user.id),
        metadataJson: { note: input.note, byName: ctx.user.name },
      });

      return { ok: true };
    }),
});
