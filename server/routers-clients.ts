import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { clients, leads } from "../drizzle/schema";
import { eq, and, like } from "drizzle-orm";
import { importLeadsFromCsv } from "./csv-import-service";

export const clientsRouter = router({
  // Listar clientes com filtros
  list: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        status: z.enum(["active", "inactive", "prospect"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      let query = db.select().from(clients);

      if (input.search) {
        query = query.where(
          like(clients.name, `%${input.search}%`)
        ) as any;
      }
      if (input.city) {
        query = query.where(eq(clients.city, input.city)) as any;
      }
      if (input.state) {
        query = query.where(eq(clients.state, input.state)) as any;
      }
      if (input.status) {
        query = query.where(eq(clients.status, input.status)) as any;
      }

      return await query;
    }),

  // Criar cliente
  create: protectedProcedure
    .input(
      z.object({
        cnpj: z.string().optional(),
        name: z.string().min(1),
        contact: z.string().optional(),
        phone: z.string().min(1),
        city: z.string().min(1),
        state: z.string().min(2).max(2),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await db.insert(clients).values({
        cnpj: input.cnpj || null,
        name: input.name,
        contact: input.contact || null,
        phone: input.phone,
        city: input.city,
        state: input.state,
        email: input.email || null,
      });

      return { id: (result as any).insertId };
    }),

  // Importar CSV
  importCsv: protectedProcedure
    .input(
      z.object({
        csvData: z.string(),
        sellerId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Apenas admin pode importar leads");
      }

      // Parsear CSV
      const lines = input.csvData.split("\n").filter((l) => l.trim());
      const headers = lines[0]
        .split(",")
        .map((h) => h.trim().toLowerCase());
      const rows = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: any = {};

        headers.forEach((header, idx) => {
          row[header] = values[idx] || "";
        });

        rows.push({
          cnpj: row.cnpj,
          nome: row.nome || row.name,
          contato: row.contato || row.contact,
          telefone: row.telefone || row.phone,
          cidade: row.cidade || row.city,
          uf: row.uf || row.state,
          email: row.email,
        });
      }

      return await importLeadsFromCsv(rows, input.sellerId);
    }),

  // Listar leads de um vendedor
  listLeads: protectedProcedure
    .input(z.object({ sellerId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const sellerId = input.sellerId || ctx.user?.id;

      const leadsData = await db
        .select()
        .from(leads)
        .where(eq(leads.sellerId, sellerId));

      // Buscar dados dos clientes
      const clientIds = leadsData.map((l) => l.clientId);
      if (clientIds.length === 0) return [];

      const clientsData = await db
        .select()
        .from(clients)
        .where(
          and(...clientIds.map((id) => eq(clients.id, id))) as any
        );

      return leadsData.map((lead) => ({
        ...lead,
        client: clientsData.find((c) => c.id === lead.clientId),
      }));
    }),

  // Atribuir lead a vendedor
  assignLead: protectedProcedure
    .input(
      z.object({
        leadId: z.number(),
        sellerId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new Error("Apenas admin pode atribuir leads");
      }

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(leads)
        .set({ sellerId: input.sellerId, status: "assigned" })
        .where(eq(leads.id, input.leadId));

      return { success: true };
    }),
});
