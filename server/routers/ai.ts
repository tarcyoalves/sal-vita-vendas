import { z } from 'zod';
import OpenAI from 'openai';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { chatMessages, tasks, clients, sellers } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
}

async function buildUserContext(userId: number, role: string): Promise<string> {
  const now = new Date();

  // Fetch user's tasks
  const userTasks = role === 'admin'
    ? await db.select().from(tasks)
    : await db.select().from(tasks).where(eq(tasks.userId, userId));

  const pending = userTasks.filter(t => t.status === 'pending');
  const completed = userTasks.filter(t => t.status === 'completed');
  const overdue = pending.filter(t => t.reminderDate && new Date(t.reminderDate) < now);
  const highPriority = pending.filter(t => t.priority === 'high');
  const noNotes = completed.filter(t => !t.notes || t.notes.trim().length < 10);

  // Fetch clients
  const allClients = await db.select().from(clients);
  const activeClients = allClients.filter(c => c.status === 'active');
  const potentialClients = allClients.filter(c => c.status === 'potential');
  const coldLeads = allClients.filter(c => c.status === 'inactive');

  let context = `
=== DADOS REAIS DO SISTEMA (${now.toLocaleDateString('pt-BR')}) ===
TAREFAS:
- Total: ${userTasks.length} | Pendentes: ${pending.length} | Concluídas: ${completed.length}
- Atrasadas: ${overdue.length} | Alta prioridade: ${highPriority.length}
- Taxa de conclusão: ${userTasks.length > 0 ? Math.round((completed.length / userTasks.length) * 100) : 0}%

CLIENTES:
- Total: ${allClients.length} | Ativos: ${activeClients.length} | Potenciais: ${potentialClients.length} | Leads Frios: ${coldLeads.length}
- Taxa de conversão estimada: ${allClients.length > 0 ? Math.round((activeClients.length / allClients.length) * 100) : 0}%

TAREFAS ATRASADAS:
${overdue.slice(0, 5).map(t => `- "${t.title}" (criada ${Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / 86400000)} dias atrás)`).join('\n') || '- Nenhuma tarefa atrasada'}

ALTA PRIORIDADE:
${highPriority.slice(0, 3).map(t => `- "${t.title}" para ${t.assignedTo || 'não atribuído'}`).join('\n') || '- Nenhuma tarefa de alta prioridade'}
`;

  if (role === 'admin') {
    const allSellers = await db.select().from(sellers);
    context += `\nATENDENTES: ${allSellers.length} cadastrados\n`;

    for (const seller of allSellers.slice(0, 5)) {
      const sellerTasks = userTasks.filter(t => t.userId === seller.userId);
      const sellerDone = sellerTasks.filter(t => t.status === 'completed').length;
      const sellerOverdue = sellerTasks.filter(t => t.status === 'pending' && t.reminderDate && new Date(t.reminderDate) < now).length;
      context += `- ${seller.name}: ${sellerTasks.length} tarefas, ${sellerDone} concluídas, ${sellerOverdue} atrasadas\n`;
    }
  }

  return context;
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
        return { success: false, message: err?.message ?? 'Erro desconhecido' };
      }
    }),

  chat: protectedProcedure
    .input(z.object({
      message: z.string().min(1),
      apiKey: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Use key from client (localStorage) if no server env key
      const baseURLs: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1',
        openai: 'https://api.openai.com/v1',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
        grok: 'https://api.x.ai/v1',
        claude: 'https://api.anthropic.com/v1',
      };
      let groq = getGroqClient();
      let chatModel = 'llama3-8b-8192';
      if (!groq && input.apiKey) {
        const baseURL = baseURLs[input.provider ?? 'groq'] ?? baseURLs.groq;
        groq = new OpenAI({ apiKey: input.apiKey, baseURL });
        chatModel = input.model ?? (input.provider === 'openai' ? 'gpt-3.5-turbo' : input.provider === 'gemini' ? 'gemini-1.5-flash' : 'llama3-8b-8192');
      }

      await db.insert(chatMessages).values({ userId: ctx.user.id, content: input.message, role: 'user' });

      if (!groq) {
        const reply = 'IA não configurada. Configure GROQ_API_KEY para ativar o assistente.';
        await db.insert(chatMessages).values({ userId: ctx.user.id, content: reply, role: 'assistant' });
        return { reply };
      }

      const [history, userContext] = await Promise.all([
        db.select().from(chatMessages).where(eq(chatMessages.userId, ctx.user.id)).orderBy(desc(chatMessages.createdAt)).limit(8),
        buildUserContext(ctx.user.id, ctx.user.role),
      ]);

      const messages = history.reverse().map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      const systemPrompt = `Você é um assistente especializado em vendas da empresa Sal Vita — Sal do Brasil.
Seu objetivo é ajudar ${ctx.user.role === 'admin' ? 'o administrador' : 'o atendente'} a vender mais e melhor.

${userContext}

SUAS FUNÇÕES:
1. Analisar performance com base nos dados reais acima
2. Recomendar próximas ações prioritárias
3. Criar planos semanais/diários
4. Identificar padrões e dar insights
5. Fornecer dicas de vendas contextualizadas
6. Alertar sobre tarefas atrasadas

REGRAS:
- Use SEMPRE os dados reais fornecidos acima nas respostas
- Seja direto, objetivo e prático
- Use emojis para facilitar leitura
- Responda em português brasileiro
- Quando sugerir prioridades, cite os números reais`;

      const completion = await groq.chat.completions.create({
        model: chatModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 800,
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content ?? 'Sem resposta da IA.';
      await db.insert(chatMessages).values({ userId: ctx.user.id, content: reply, role: 'assistant' });
      return { reply };
    }),

  analyzeAttendants: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') throw new Error('Apenas admins podem usar este recurso');
    const groq = getGroqClient();
    if (!groq) return { report: [], summary: 'IA não configurada.' };

    const now = new Date();
    const allSellers = await db.select().from(sellers);
    const allTasks = await db.select().from(tasks);

    const report = allSellers.map(seller => {
      const st = allTasks.filter(t => t.userId === seller.userId);
      const total = st.length;
      const completed = st.filter(t => t.status === 'completed');
      const pending = st.filter(t => t.status === 'pending');
      const overdue = pending.filter(t => t.reminderDate && new Date(t.reminderDate) < now);

      // Suspicious patterns
      const completedNoNotes = completed.filter(t => !t.notes || t.notes.trim().length < 5);
      const neverUpdated = st.filter(t => {
        const age = now.getTime() - new Date(t.createdAt).getTime();
        const updated = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
        return age > 3 * 86400000 && updated < 60000; // older than 3 days, never touched
      });
      const veryFastCompleted = completed.filter(t => {
        const duration = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
        return duration < 120000 && (!t.notes || t.notes.trim().length < 10); // done in < 2min with no notes
      });

      const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;
      const suspicionScore = (completedNoNotes.length * 2) + (neverUpdated.length * 3) + (veryFastCompleted.length * 4) + (overdue.length * 1);

      let status: '🟢 Normal' | '🟡 Atenção' | '🔴 Suspeito';
      if (suspicionScore >= 8) status = '🔴 Suspeito';
      else if (suspicionScore >= 3) status = '🟡 Atenção';
      else status = '🟢 Normal';

      return {
        sellerId: seller.id,
        name: seller.name,
        email: seller.email,
        total,
        completed: completed.length,
        pending: pending.length,
        overdue: overdue.length,
        completionRate,
        completedNoNotes: completedNoNotes.length,
        neverUpdated: neverUpdated.length,
        veryFastCompleted: veryFastCompleted.length,
        suspicionScore,
        status,
        flags: [
          overdue.length > 0 ? `${overdue.length} tarefa(s) atrasada(s)` : null,
          completedNoNotes.length > 0 ? `${completedNoNotes.length} concluída(s) sem anotação` : null,
          neverUpdated.length > 0 ? `${neverUpdated.length} tarefa(s) nunca atualizada(s)` : null,
          veryFastCompleted.length > 0 ? `${veryFastCompleted.length} concluída(s) em < 2min sem notas` : null,
        ].filter(Boolean) as string[],
      };
    });

    // Build AI summary
    const reportText = report.map(r =>
      `${r.name}: ${r.total} tarefas, ${r.completionRate}% concluídas, ${r.overdue} atrasadas, status=${r.status}, flags=${r.flags.join('; ') || 'nenhuma'}`
    ).join('\n');

    const completion = await groq.chat.completions.create({
      model: 'llama3-8b-8192',
      messages: [{
        role: 'system',
        content: 'Você é um analista de RH especializado em gestão de equipes de vendas. Analise os dados e identifique problemas de desempenho, padrões suspeitos e recomende ações. Seja direto e use emojis. Responda em português brasileiro.',
      }, {
        role: 'user',
        content: `Analise os dados de desempenho dos atendentes e dê um parecer executivo:\n\n${reportText}\n\nIdentifique: quem está performando bem, quem precisa de atenção, comportamentos suspeitos e recomendações de ação.`,
      }],
      max_tokens: 600,
      temperature: 0.5,
    });

    const summary = completion.choices[0]?.message?.content ?? 'Análise indisponível.';
    return { report, summary };
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(chatMessages).where(eq(chatMessages.userId, ctx.user.id)).orderBy(chatMessages.createdAt).limit(50);
  }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await db.delete(chatMessages).where(eq(chatMessages.userId, ctx.user.id));
    return { ok: true };
  }),
});
