import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { chatMessages, tasks, clients, sellers } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

// Direct fetch to any OpenAI-compatible API — avoids SDK bundling issues in Vercel
async function callLLM(apiKey: string, baseURL: string, model: string, messages: { role: string; content: string }[], maxTokens = 800, temperature = 0.7): Promise<string> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  return data?.choices?.[0]?.message?.content ?? 'Sem resposta da IA.';
}

async function buildUserContext(userId: number, role: string): Promise<string> {
  const now = new Date();

  const userTasks = role === 'admin'
    ? await db.select().from(tasks)
    : await db.select().from(tasks).where(eq(tasks.userId, userId));

  const pending = userTasks.filter(t => t.status === 'pending');
  const completed = userTasks.filter(t => t.status === 'completed');
  const overdue = pending.filter(t => t.reminderDate && new Date(t.reminderDate) < now);
  const highPriority = pending.filter(t => t.priority === 'high');

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
      const st = userTasks.filter(t => t.userId === seller.userId);
      const done = st.filter(t => t.status === 'completed').length;
      const late = st.filter(t => t.status === 'pending' && t.reminderDate && new Date(t.reminderDate) < now).length;
      context += `- ${seller.name}: ${st.length} tarefas, ${done} concluídas, ${late} atrasadas\n`;
    }
  }

  return context;
}

const BASE_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  grok: 'https://api.x.ai/v1',
  claude: 'https://api.anthropic.com/v1',
};

export const aiRouter = router({
  testConnection: protectedProcedure
    .input(z.object({
      provider: z.string(),
      model: z.string(),
      apiKey: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const baseURL = BASE_URLS[input.provider] ?? BASE_URLS.openai;
      try {
        await callLLM(input.apiKey, baseURL, input.model, [{ role: 'user', content: 'ping' }], 5, 0);
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
      try {
        // Resolve which API key + endpoint to use
        const envKey = process.env.GROQ_API_KEY;
        const apiKey = envKey || input.apiKey || '';
        const provider = envKey ? 'groq' : (input.provider ?? 'groq');
        const baseURL = BASE_URLS[provider] ?? BASE_URLS.groq;
        const model = envKey
          ? 'llama-3.1-8b-instant'
          : (input.model ?? (provider === 'openai' ? 'gpt-3.5-turbo' : provider === 'gemini' ? 'gemini-1.5-flash' : 'llama-3.1-8b-instant'));

        console.log('[AI_CHAT] start uid:', ctx.user.id, 'provider:', provider, 'model:', model, 'hasKey:', !!apiKey);

        await db.insert(chatMessages).values({ userId: ctx.user.id, content: input.message, role: 'user' });
        console.log('[AI_CHAT] msg saved');

        if (!apiKey) {
          const reply = 'IA não configurada. Configure GROQ_API_KEY para ativar o assistente.';
          await db.insert(chatMessages).values({ userId: ctx.user.id, content: reply, role: 'assistant' });
          return { reply };
        }

        const history = await db.select().from(chatMessages)
          .where(eq(chatMessages.userId, ctx.user.id))
          .orderBy(desc(chatMessages.createdAt))
          .limit(8);
        console.log('[AI_CHAT] history:', history.length, 'rows');

        const userContext = await buildUserContext(ctx.user.id, ctx.user.role);
        console.log('[AI_CHAT] context built');

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

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.reverse().map(m => ({ role: m.role, content: m.content })),
        ];

        console.log('[AI_CHAT] calling LLM...');
        const reply = await callLLM(apiKey, baseURL, model, messages);
        console.log('[AI_CHAT] LLM OK, reply len:', reply.length);

        await db.insert(chatMessages).values({ userId: ctx.user.id, content: reply, role: 'assistant' });
        return { reply };

      } catch (err: any) {
        console.error('[AI_CHAT_ERROR]', err?.message, '| status:', err?.status, '| stack:', err?.stack?.slice(0, 500));
        throw new Error(err?.message ?? 'Erro interno na IA');
      }
    }),

  analyzeAttendants: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') throw new Error('Apenas admins podem usar este recurso');

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return { report: [], summary: 'IA não configurada.' };

    const now = new Date();
    const allSellers = await db.select().from(sellers);
    const allTasks = await db.select().from(tasks);

    const report = allSellers.map(seller => {
      // All tasks assigned to this attendant (by name or userId)
      const st = allTasks.filter(t =>
        t.assignedTo === seller.name || t.userId === seller.userId
      );
      const total = st.length;

      // Active reminders (enabled with a date set)
      const withReminder = st.filter(t => t.reminderDate && t.reminderEnabled !== false);

      // Overdue: reminder date passed and task was never rescheduled (still old date)
      const overdue = withReminder.filter(t => new Date(t.reminderDate!) < now);

      // No notes: task has no meaningful notes written (< 15 chars)
      const noNotes = st.filter(t => !t.notes || t.notes.trim().length < 15);

      // Disabled reminders: attendant manually turned off the reminder
      const disabledReminders = st.filter(t => t.reminderEnabled === false);

      // No reminder date: task exists but no date was ever set
      const noReminderDate = st.filter(t => !t.reminderDate);

      // Never updated: task was imported/created but notes/date never touched
      // (updatedAt is within 2 minutes of createdAt)
      const neverUpdated = st.filter(t => {
        const diff = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
        return diff < 2 * 60 * 1000;
      });

      // Suspicion score (recurring model — no completion metric)
      let suspicionScore = 0;
      suspicionScore += overdue.length * 2;
      suspicionScore += noNotes.length * 3;
      suspicionScore += disabledReminders.length * 4;
      suspicionScore += noReminderDate.length * 1;
      suspicionScore += neverUpdated.length * 2;

      let status: '🟢 Normal' | '🟡 Atenção' | '🔴 Suspeito';
      if (suspicionScore >= 10) status = '🔴 Suspeito';
      else if (suspicionScore >= 4) status = '🟡 Atenção';
      else status = '🟢 Normal';

      const activeRate = total > 0 ? Math.round((withReminder.length / total) * 100) : 0;

      const flags = [
        overdue.length > 0        ? `${overdue.length} lembrete(s) vencido(s) sem reatualização` : null,
        noNotes.length > 0        ? `${noNotes.length} cliente(s) sem anotação de contato` : null,
        disabledReminders.length > 0 ? `${disabledReminders.length} lembrete(s) DESATIVADO(s) manualmente` : null,
        noReminderDate.length > 0 ? `${noReminderDate.length} cliente(s) sem data de lembrete configurada` : null,
        neverUpdated.length > 0   ? `${neverUpdated.length} tarefa(s) nunca atualizadas desde a importação` : null,
      ].filter(Boolean) as string[];

      return {
        sellerId: seller.id,
        name: seller.name,
        email: seller.email,
        total,
        withReminder: withReminder.length,
        overdue: overdue.length,
        noNotes: noNotes.length,
        disabledReminders: disabledReminders.length,
        noReminderDate: noReminderDate.length,
        neverUpdated: neverUpdated.length,
        activeRate,
        suspicionScore,
        status,
        flags,
      };
    });

    const reportText = report.map(r =>
      `${r.name}: ${r.total} clientes, ${r.withReminder} com lembrete ativo, ${r.overdue} vencidos, sem_anotação=${r.noNotes}, desativados=${r.disabledReminders}, sem_data=${r.noReminderDate}, nunca_atualizado=${r.neverUpdated}, status=${r.status}, flags=${r.flags.join('; ') || 'nenhuma'}`
    ).join('\n');

    try {
      const summary = await callLLM(apiKey, BASE_URLS.groq, 'llama-3.1-8b-instant', [
        {
          role: 'system',
          content: `Você é um analista de desempenho de equipes de vendas B2B recorrentes.
CONTEXTO: Neste sistema NÃO existe conclusão de tarefas. As tarefas são clientes recorrentes que precisam de contato contínuo. O ciclo correto é: atender o cliente → anotar o contato nas notas → reagendar o próximo lembrete.
SINAIS DE MAU DESEMPENHO:
- Lembrete vencido sem reatualização = cliente não foi contatado
- Sem anotação = contato não foi documentado (suspeito de não ter sido feito)
- Lembrete desativado manualmente = tentativa de esconder inadimplência no atendimento
- Tarefa nunca atualizada = cliente ignorado desde a importação
Seja direto, use emojis, responda em português brasileiro.`,
        },
        {
          role: 'user',
          content: `Analise o desempenho dos atendentes considerando que o modelo é RECORRENTE (sem conclusão):\n\n${reportText}\n\nIdentifique: quem está fazendo contato regularmente, quem está negligenciando clientes, comportamentos suspeitos e recomendações concretas de ação imediata.`,
        },
      ], 800, 0.5);
      return { report, summary };
    } catch (err: any) {
      console.error('[ANALYZE_ERROR]', err?.message);
      return { report, summary: 'Análise indisponível: ' + (err?.message ?? 'erro') };
    }
  }),

  suggestSalesApproach: protectedProcedure
    .input(z.object({ title: z.string().min(1), notes: z.string() }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return { suggestion: 'IA não configurada (GROQ_API_KEY ausente).' };
      try {
        const suggestion = await callLLM(apiKey, BASE_URLS.groq, 'llama-3.1-8b-instant', [
          { role: 'system', content: 'Vendas B2B de sal. Sugira 1 abordagem prática em 2-3 frases. Direto, sem introdução. Português BR.' },
          { role: 'user', content: `Cliente: ${input.title}\nObservações: ${input.notes || 'sem observações'}` },
        ], 150, 0.7);
        return { suggestion };
      } catch (err: any) {
        return { suggestion: 'Erro ao gerar sugestão: ' + (err?.message ?? 'tente novamente') };
      }
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(chatMessages)
      .where(eq(chatMessages.userId, ctx.user.id))
      .orderBy(chatMessages.createdAt)
      .limit(50);
  }),

  clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
    await db.delete(chatMessages).where(eq(chatMessages.userId, ctx.user.id));
    return { ok: true };
  }),
});
