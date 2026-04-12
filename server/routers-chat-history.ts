import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { chatHistory, knowledge } from "../drizzle/schema";
import { InsertChatHistory, InsertKnowledge } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const chatHistoryRouter = router({
  // Obter histórico de chat do usuário
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      
      const messages = await db
        .select()
        .from(chatHistory)
        .where(eq(chatHistory.userId, ctx.user.id))
        .orderBy(desc(chatHistory.createdAt))
        .limit(input?.limit || 50);
      
      return messages.reverse();
    }),

  // Salvar mensagem de chat
  saveMessage: protectedProcedure
    .input(
      z.object({
        role: z.enum(["user", "assistant"]),
        message: z.string(),
        context: z.record(z.string(), z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db.insert(chatHistory).values({
        userId: ctx.user.id,
        role: input.role,
        message: input.message,
        context: input.context || null,
      });

      return result;
    }),

  // Limpar histórico
  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    
    await db.delete(chatHistory).where(eq(chatHistory.userId, ctx.user.id));
    return { success: true };
  }),
});

export const knowledgeRouter = router({
  // Listar documentos de conhecimento
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    
    const docs = await db
      .select()
      .from(knowledge)
      .where(eq(knowledge.userId, ctx.user.id))
      .orderBy(desc(knowledge.createdAt));

    return docs;
  }),

  // Criar documento de conhecimento
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        category: z.string().optional(),
        fileUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db.insert(knowledge).values({
        userId: ctx.user.id,
        title: input.title,
        content: input.content,
        category: input.category || null,
        fileUrl: input.fileUrl || null,
      });

      return result;
    }),

  // Atualizar documento
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        category: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      const result = await db
        .update(knowledge)
        .set({
          title: input.title,
          content: input.content,
          category: input.category,
        })
        .where(
          and(eq(knowledge.id, input.id), eq(knowledge.userId, ctx.user.id))
        );

      return result;
    }),

  // Deletar documento
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      
      await db
        .delete(knowledge)
        .where(
          and(eq(knowledge.id, input.id), eq(knowledge.userId, ctx.user.id))
        );

      return { success: true };
    }),

  // Buscar documentos por categoria
  getByCategory: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      
      const docs = await db
        .select()
        .from(knowledge)
        .where(
          and(
            eq(knowledge.userId, ctx.user.id),
            eq(knowledge.category, input.category)
          )
        );

      return docs;
    }),
});
