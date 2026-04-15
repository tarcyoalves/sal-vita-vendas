import { z } from 'zod';
import OpenAI from 'openai';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { chatMessages } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
}

export const aiRouter = router({
  testConnection: protectedProcedure
    .input(z.object({
      provider: z.string(),
      model: z.string(),
      apiKey: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const baseURLs: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1',
        openai: 'https://api.openai.com/v1',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
        grok: 'https://api.x.ai/v1',
        claude: 'https://api.anthropic.com/v1',
      };
      const baseURL = baseURLs[input.provider] ?? baseURLs.openai;
      try {
        const client = new OpenAI({ apiKey: input.apiKey, baseURL });
        await client.chat.completions.create({
          model: input.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        });
        return { success: true, message: 'Conexão bem-sucedida!' };
      } catch (err: any) {
        const msg = err?.message ?? 'Erro desconhecido';
        return { success: false, message: msg };
      }
    }),

  chat: protectedProcedure
    .input(z.object({ message: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const groq = getGroqClient();

      // Save user message
      await db.insert(chatMessages).values({
        userId: ctx.user.id,
        content: input.message,
        role: 'user',
      });

      if (!groq) {
        const reply = 'IA não configurada. Adicione GROQ_API_KEY no arquivo .env para ativar o chat.';
        await db.insert(chatMessages).values({ userId: ctx.user.id, content: reply, role: 'assistant' });
        return { reply };
      }

      const history = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.userId, ctx.user.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(10);

      const messages = history.reverse().map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      const completion = await groq.chat.completions.create({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente especializado em vendas da empresa Sal Vita. Ajude os atendentes com dicas de vendas, gestão de clientes e lembretes. Responda sempre em português brasileiro.',
          },
          ...messages,
        ],
      });

      const reply = completion.choices[0]?.message?.content ?? 'Sem resposta da IA.';

      await db.insert(chatMessages).values({ userId: ctx.user.id, content: reply, role: 'assistant' });

      return { reply };
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.userId, ctx.user.id))
      .orderBy(chatMessages.createdAt)
      .limit(50);
  }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await db.delete(chatMessages).where(eq(chatMessages.userId, ctx.user.id));
    return { ok: true };
  }),
});
