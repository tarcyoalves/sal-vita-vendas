import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { chatMessages, tasks, clients, sellers, workSessions } from '../db/schema';
import { eq, desc, or, gte, and } from 'drizzle-orm';

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URLS: Record<string, string> = {
  groq:    'https://api.groq.com/openai/v1',
  openai:  'https://api.openai.com/v1',
  gemini:  'https://generativelanguage.googleapis.com/v1beta/openai',
  anthropic: 'https://api.anthropic.com/v1',
};

const DEFAULT_MODELS: Record<string, string> = {
  groq:    'llama-3.3-70b-versatile',
  openai:  'gpt-3.5-turbo',
  gemini:  'gemini-2.5-flash',
  anthropic: 'claude-3-haiku-20240307',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nextBusinessDay(d: Date): Date {
  const next = new Date(d.getTime() + 86400000);
  while (next.getDay() === 0 || next.getDay() === 6) next.setTime(next.getTime() + 86400000);
  return next;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60000);
}

async function callLLMWithTools(
  apiKey: string, baseURL: string, model: string,
  messages: any[], tools: any[], maxTokens = 1000
): Promise<string> {
  const loop = async (msgs: any[]): Promise<string> => {
    const body: any = { model, messages: msgs, max_tokens: maxTokens, temperature: 0.4 };
    if (tools.length) body.tools = tools;

    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`LLM API ${res.status}: ${t.slice(0, 200)}`);
    }
    const data = await res.json() as any;
    const msg = data?.choices?.[0]?.message;
    if (!msg) return 'Sem resposta da IA.';

    // If tool calls requested, execute them and loop
    if (msg.tool_calls?.length) {
      const newMsgs = [...msgs, msg];
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments ?? '{}');
        const result = await executeTool(tc.function.name, args);
        newMsgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      return loop(newMsgs);
    }
    return msg.content ?? 'Sem resposta.';
  };
  return loop(messages);
}

async function callLLM(apiKey: string, baseURL: string, model: string, messages: any[], maxTokens = 800, temperature = 0.7): Promise<string> {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  return data?.choices?.[0]?.message?.content ?? 'Sem resposta da IA.';
}

// ── Tool definitions (OpenAI-compatible) ─────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Lista os lembretes/tarefas de um atendente. Use para ver o que precisa ser reagendado.',
      parameters: {
        type: 'object',
        properties: {
          attendant_name: { type: 'string', description: 'Nome do atendente (ex: "Analice")' },
        },
        required: ['attendant_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_sessions',
      description: 'Retorna histórico de acesso/sessões de trabalho de um atendente: quando entrou, quanto tempo trabalhou, tempo ocioso, última atividade. Use quando perguntarem sobre presença, acesso, horas trabalhadas ou atividade.',
      parameters: {
        type: 'object',
        properties: {
          attendant_name: { type: 'string', description: 'Nome do atendente (ex: "Analice"). Use "todos" para ver todos.' },
        },
        required: ['attendant_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_tasks',
      description: 'Redistribui os lembretes vencidos (atrasados) de um atendente ao longo dos próximos dias úteis, com um limite por dia. Use quando o usuário pedir para reagendar ou distribuir lembretes.',
      parameters: {
        type: 'object',
        properties: {
          attendant_name: { type: 'string', description: 'Nome exato do atendente' },
          tasks_per_day: { type: 'number', description: 'Quantos lembretes por dia útil (padrão: 50)' },
          start_hour: { type: 'number', description: 'Hora inicial do dia para o primeiro lembrete (padrão: 8)' },
        },
        required: ['attendant_name'],
      },
    },
  },
];

async function executeTool(name: string, args: any): Promise<any> {
  if (name === 'list_tasks') {
    const name_ = String(args.attendant_name ?? '');
    const seller = (await db.select().from(sellers)).find(
      s => s.name.toLowerCase().includes(name_.toLowerCase())
    );
    if (!seller) return { error: `Atendente "${name_}" não encontrado.` };
    const st = await db.select().from(tasks).where(
      or(eq(tasks.assignedTo, seller.name), eq(tasks.userId, seller.userId))
    );
    const now = new Date();
    const overdue = st.filter(t => t.reminderDate && new Date(t.reminderDate) < now);
    const upcoming = st.filter(t => t.reminderDate && new Date(t.reminderDate) >= now);
    return {
      attendant: seller.name,
      total: st.length,
      overdue: overdue.length,
      upcoming: upcoming.length,
      sample_overdue: overdue.slice(0, 5).map(t => ({ id: t.id, title: t.title.slice(0, 60), date: t.reminderDate })),
    };
  }

  if (name === 'list_sessions') {
    const nameArg = String(args.attendant_name ?? '').toLowerCase();
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    const allSellers = await db.select().from(sellers);
    const targets = nameArg === 'todos'
      ? allSellers
      : allSellers.filter(s => s.name.toLowerCase().includes(nameArg));
    if (targets.length === 0) return { error: `Atendente "${args.attendant_name}" não encontrado.` };

    const recentSessions = await db.select().from(workSessions)
      .where(gte(workSessions.startedAt, sevenDaysAgo))
      .orderBy(desc(workSessions.startedAt));

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const fmtTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const fmtDate = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
    const fmtMs = (ms: number) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h > 0 ? `${h}h${pad2(m)}min` : `${m}min`;
    };

    const results = targets.map(seller => {
      const mine = recentSessions.filter(s => s.userId === seller.userId);
      const sessionDetails = mine.slice(0, 7).map(s => {
        const start = new Date(s.startedAt);
        const end = s.endedAt ? new Date(s.endedAt) : (s.status !== 'ended' ? now : null);
        const elapsed = end ? end.getTime() - start.getTime() : 0;
        let pausedMs = s.totalPausedMs ?? 0;
        if (s.status === 'paused' && s.pausedAt) pausedMs += now.getTime() - new Date(s.pausedAt).getTime();
        const workedMs = Math.max(0, elapsed - pausedMs);
        return {
          data: fmtDate(start),
          entrada: fmtTime(start),
          saida: end && s.status === 'ended' ? fmtTime(end) : s.status === 'paused' ? 'pausado' : 'ativo agora',
          tempo_trabalhado: fmtMs(workedMs),
          pausas: fmtMs(pausedMs),
          status: s.status,
        };
      });
      const todaySess = mine.find(s => new Date(s.startedAt) >= todayStart);
      return { atendente: seller.name, hoje: todaySess ? 'sim' : 'não acessou hoje', sessoes_7dias: sessionDetails };
    });

    return { sessions: results };
  }

  if (name === 'reschedule_tasks') {
    const name_ = String(args.attendant_name ?? '');
    const perDay = Number(args.tasks_per_day ?? 50);
    const startHour = Number(args.start_hour ?? 8);

    const allSellers = await db.select().from(sellers);
    const seller = allSellers.find(s => s.name.toLowerCase().includes(name_.toLowerCase()));
    if (!seller) return { error: `Atendente "${name_}" não encontrado.` };

    const now = new Date();
    const allTasks = await db.select().from(tasks).where(
      or(eq(tasks.assignedTo, seller.name), eq(tasks.userId, seller.userId))
    );

    // Only reschedule overdue tasks (reminder in the past)
    const overdue = allTasks.filter(t =>
      t.reminderDate && new Date(t.reminderDate) < now && t.reminderEnabled !== false
    );
    if (overdue.length === 0) return { message: `Nenhum lembrete vencido para ${seller.name}.` };

    // Distribute: start from tomorrow, skip weekends
    let currentDay = nextBusinessDay(now);
    let countToday = 0;
    let updated = 0;
    const minutesBetween = Math.floor((9 * 60) / Math.max(perDay, 1)); // spread 8h→17h

    for (const task of overdue) {
      if (countToday >= perDay) {
        currentDay = nextBusinessDay(currentDay);
        countToday = 0;
      }
      const reminderDate = new Date(currentDay);
      reminderDate.setHours(startHour, 0, 0, 0);
      const offsetMins = countToday * minutesBetween;
      const final = addMinutes(reminderDate, offsetMins);

      await db.update(tasks)
        .set({ reminderDate: final, reminderEnabled: true, updatedAt: now })
        .where(eq(tasks.id, task.id));

      countToday++;
      updated++;
    }

    const daysNeeded = Math.ceil(overdue.length / perDay);
    return {
      success: true,
      rescheduled: updated,
      attendant: seller.name,
      days_used: daysNeeded,
      first_day: currentDay.toLocaleDateString('pt-BR'),
      message: `✅ ${updated} lembretes de ${seller.name} redistribuídos em ${daysNeeded} dia(s) útil(eis) — ${perDay} por dia a partir de amanhã.`,
    };
  }

  return { error: `Ferramenta desconhecida: ${name}` };
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildUserContext(userId: number, role: string): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  const userTasks = role === 'admin'
    ? await db.select().from(tasks)
    : await db.select().from(tasks).where(eq(tasks.userId, userId));

  const withReminder = userTasks.filter(t => t.reminderDate && t.reminderEnabled !== false);
  const overdue = withReminder.filter(t => new Date(t.reminderDate!) < now);
  const highPriority = userTasks.filter(t => t.priority === 'high');

  let context = `
=== DADOS REAIS DO SISTEMA (${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}) ===
LEMBRETES: Total=${userTasks.length} | Com lembrete ativo=${withReminder.length} | Vencidos=${overdue.length} | Alta prioridade=${highPriority.length}
VENCIDOS RECENTES:
${overdue.slice(0, 5).map(t => `- "${t.title.slice(0, 60)}" (${t.assignedTo ?? 'sem atendente'})`).join('\n') || '- Nenhum vencido'}
`;

  if (role === 'admin') {
    const allSellers = await db.select().from(sellers);
    const todaySessions = await db.select().from(workSessions)
      .where(gte(workSessions.startedAt, todayStart));

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const fmtMs = (ms: number) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h > 0 ? `${h}h${pad2(m)}min` : `${m}min`;
    };

    context += `\nATENDENTES — TAREFAS E ACESSO HOJE (${allSellers.length}):\n`;
    for (const s of allSellers) {
      const st = userTasks.filter(t => t.assignedTo === s.name || t.userId === s.userId);
      const late = st.filter(t => t.reminderDate && new Date(t.reminderDate) < now).length;
      const contatos = st.filter(t => t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart).length;

      const sess = todaySessions.filter(ws => ws.userId === s.userId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

      let sessionInfo = 'não acessou hoje';
      if (sess) {
        const start = new Date(sess.startedAt);
        const end = sess.endedAt ? new Date(sess.endedAt) : now;
        const elapsed = end.getTime() - start.getTime();
        let pausedMs = sess.totalPausedMs ?? 0;
        if (sess.status === 'paused' && sess.pausedAt) pausedMs += now.getTime() - new Date(sess.pausedAt).getTime();
        const workedMs = Math.max(0, elapsed - pausedMs);
        const entrada = `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
        sessionInfo = `entrada=${entrada}, trabalhado=${fmtMs(workedMs)}, pausas=${fmtMs(pausedMs)}, status=${sess.status}`;
      }

      context += `- ${s.name}: ${st.length} clientes, ${late} vencidos, contatos_hoje=${contatos} | sessão: ${sessionInfo}\n`;
    }
  }
  return context;
}


export const aiRouter = router({
  bulkReschedule: protectedProcedure
    .input(z.object({
      sellerName: z.string().min(1),
      tasksPerDay: z.number().min(1).max(200).default(50),
      startHour: z.number().min(6).max(12).default(8),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error('Apenas admins podem reagendar em massa');
      return executeTool('reschedule_tasks', {
        attendant_name: input.sellerName,
        tasks_per_day: input.tasksPerDay,
        start_hour: input.startHour,
      });
    }),

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
      message: z.string().min(1).max(4000),
      apiKey: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // User key takes priority. Groq is the leader — more generous free tier
        const provider = input.provider ?? (process.env.GROQ_API_KEY ? 'groq' : process.env.GEMINI_API_KEY ? 'gemini' : 'groq');
        const envKey = provider === 'groq' ? process.env.GROQ_API_KEY
          : provider === 'gemini' ? process.env.GEMINI_API_KEY
          : undefined;
        const apiKey = input.apiKey || envKey || '';
        const baseURL = BASE_URLS[provider] ?? BASE_URLS.groq;
        const model = input.model ?? DEFAULT_MODELS[provider] ?? 'llama-3.3-70b-versatile';

        console.log('[AI_CHAT] uid:', ctx.user.id, 'provider:', provider, 'model:', model, 'hasKey:', !!apiKey);

        await db.insert(chatMessages).values({ userId: ctx.user.id, content: input.message, role: 'user' });
        console.log('[AI_CHAT] msg saved');

        if (!apiKey) {
          const reply = 'IA não configurada. Vá em Configurações → IA e adicione uma chave do Groq ou Gemini (ambos gratuitos).';
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

        const isAdmin = ctx.user.role === 'admin';

        const systemPrompt = isAdmin
          ? `Você é um assistente de gestão de equipes de vendas da empresa Sal Vita — Sal do Brasil.
Você tem acesso a ferramentas que permitem EXECUTAR ações reais no sistema (não apenas descrever).

${userContext}

FERRAMENTAS DISPONÍVEIS (use quando o usuário pedir):
- list_tasks: listar lembretes/status de um atendente
- list_sessions: ver histórico de acesso/sessões de trabalho — quando entrou, quanto trabalhou, pausas, últimos 7 dias. Use "todos" para ver todos.
- reschedule_tasks: REDISTRIBUIR lembretes vencidos de um atendente em dias úteis futuros

INSTRUÇÕES CRÍTICAS:
- Quando o usuário pedir para "reagendar", "redistribuir", "reorganizar" lembretes de algum atendente → USE a ferramenta reschedule_tasks imediatamente. NÃO apenas descreva — EXECUTE.
- Quando perguntarem sobre acesso, presença, horas trabalhadas, tempo ativo, ociosidade → USE list_sessions.
- Quando precisar ver os dados de tarefas de um atendente → USE list_tasks primeiro.
- Após executar uma ferramenta, informe o resultado real retornado por ela.
- Use os dados reais do contexto acima nas análises. O contexto já inclui dados de sessão de HOJE.
- Seja direto, use emojis, responda em português brasileiro.`
          : `Você é um assistente de suporte ao atendente da empresa Sal Vita — Sal do Brasil.
Seu papel é INFORMATIVO apenas — você não pode executar ações no sistema.

${userContext}

SUAS FUNÇÕES:
1. Analisar sua própria performance com base nos dados acima
2. Sugerir prioridades para o dia/semana
3. Dicas de abordagem com clientes de sal B2B
4. Alertar sobre lembretes vencidos

REGRAS:
- Apenas informações e dicas — sem execução de ações
- Use os dados reais do contexto
- Seja objetivo, use emojis, responda em português brasileiro`;

        const messages = [
          { role: 'system', content: systemPrompt },
          ...history.reverse().map(m => ({ role: m.role, content: m.content })),
        ];

        console.log('[AI_CHAT] calling LLM, isAdmin:', isAdmin);
        const reply = isAdmin
          ? await callLLMWithTools(apiKey, baseURL, model, messages, TOOLS, 1200)
          : await callLLM(apiKey, baseURL, model, messages, 800, 0.6);
        console.log('[AI_CHAT] LLM OK, reply len:', reply.length);

        await db.insert(chatMessages).values({ userId: ctx.user.id, content: reply, role: 'assistant' });
        return { reply };

      } catch (err: any) {
        console.error('[AI_CHAT_ERROR]', err?.message, '| status:', err?.status, '| stack:', err?.stack?.slice(0, 500));
        throw new Error(err?.message ?? 'Erro interno na IA');
      }
    }),

  analyzeAttendants: protectedProcedure
    .input(z.object({
      apiKey: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
    }).optional())
    .mutation(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin') throw new Error('Apenas admins podem usar este recurso');

    // Groq as leader — more generous free tier (14k req/day vs ~500 Gemini)
    const analyzeProvider = input?.provider ?? (process.env.GROQ_API_KEY ? 'groq' : process.env.GEMINI_API_KEY ? 'gemini' : 'groq');
    const envKey = analyzeProvider === 'groq' ? process.env.GROQ_API_KEY : process.env.GEMINI_API_KEY;
    const apiKey = input?.apiKey || envKey || '';
    // Always use server-side model for analysis — client's saved model may be llama-3.1-8b-instant
    // which has 6k TPM limit, too low for the analysis prompt (~9k tokens)
    const analyzeModel = DEFAULT_MODELS[analyzeProvider] ?? 'llama-3.3-70b-versatile';
    if (!apiKey) return { report: [], summary: 'IA não configurada. Vá em Configurações → IA e configure Groq (recomendado) ou Gemini.' };

    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    const allSellers = await db.select().from(sellers);
    const allTasks = await db.select().from(tasks);
    const recentSessions = await db.select().from(workSessions)
      .where(gte(workSessions.startedAt, sevenDaysAgo))
      .orderBy(desc(workSessions.startedAt));

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const fmtMs = (ms: number) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return h > 0 ? `${h}h${pad2(m)}min` : `${m}min`;
    };

    // Build session summary per seller
    const sessionSummary = (sellerId: number) => {
      const mine = recentSessions.filter(s => s.userId === sellerId);
      const todaySess = mine.find(s => new Date(s.startedAt) >= todayStart);
      const daysActive7 = new Set(mine.map(s => new Date(s.startedAt).toDateString())).size;
      const totalWorkedMs7 = mine.reduce((acc, s) => {
        const end = s.endedAt ? new Date(s.endedAt) : (s.status !== 'ended' ? now : new Date(s.startedAt));
        const elapsed = end.getTime() - new Date(s.startedAt).getTime();
        const paused = (s.totalPausedMs ?? 0) + (s.status === 'paused' && s.pausedAt ? now.getTime() - new Date(s.pausedAt).getTime() : 0);
        return acc + Math.max(0, elapsed - paused);
      }, 0);
      const lastAccess = mine[0] ? new Date(mine[0].startedAt).toLocaleString('pt-BR') : 'nunca';

      let todayInfo = 'não acessou hoje';
      if (todaySess) {
        const start = new Date(todaySess.startedAt);
        const end = todaySess.endedAt ? new Date(todaySess.endedAt) : now;
        const elapsed = end.getTime() - start.getTime();
        let pausedMs = todaySess.totalPausedMs ?? 0;
        if (todaySess.status === 'paused' && todaySess.pausedAt) pausedMs += now.getTime() - new Date(todaySess.pausedAt).getTime();
        const workedMs = Math.max(0, elapsed - pausedMs);
        todayInfo = `entrada=${pad2(start.getHours())}:${pad2(start.getMinutes())}, trabalhado=${fmtMs(workedMs)}, status=${todaySess.status}`;
      }

      return { todayInfo, daysActive7, totalWorkedMs7Fmt: fmtMs(totalWorkedMs7), lastAccess };
    };

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

      const sess = sessionSummary(seller.userId);

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
        sessaoHoje: sess.todayInfo,
        diasAtivos7: sess.daysActive7,
        totalTrabalhado7dias: sess.totalWorkedMs7Fmt,
        ultimoAcesso: sess.lastAccess,
      };
    });

    const reportText = report.map(r =>
      `${r.name}: ${r.total} clientes, ${r.withReminder} com lembrete ativo, ${r.overdue} vencidos, sem_anotação=${r.noNotes}, desativados=${r.disabledReminders}, sem_data=${r.noReminderDate}, nunca_atualizado=${r.neverUpdated}, status=${r.status}, flags=${r.flags.join('; ') || 'nenhuma'} | ACESSO: hoje=[${r.sessaoHoje}], dias_ativos_7d=${r.diasAtivos7}, total_trabalhado_7d=${r.totalTrabalhado7dias}, ultimo_acesso=${r.ultimoAcesso}`
    ).join('\n');

    try {
      const summary = await callLLM(apiKey, BASE_URLS[analyzeProvider], analyzeModel, [
        {
          role: 'system',
          content: `Você é um analista sênior de desempenho de equipes de vendas B2B da empresa Sal Vita — Sal do Brasil.

MODELO DE NEGÓCIO: Vendas recorrentes de sal para clientes industriais/alimentícios. NÃO existe "conclusão" de tarefa — cada cliente precisa de contato contínuo e periódico. O ciclo correto é: atender → anotar → reagendar próximo lembrete.

INTERPRETAÇÃO DOS DADOS:
- lembrete vencido sem atualização = cliente não recebeu contato → risco de perda
- sem anotação (<15 chars) = contato não documentado → suspeita de omissão
- lembrete desativado manualmente = atendente tentou esconder inadimplência
- tarefa nunca atualizada = cliente ignorado desde importação
- taxa de lembretes ativos baixa = carteira sendo negligenciada

SEU PAPEL:
1. Classificar cada atendente: 🟢 Ativo / 🟡 Atenção / 🔴 Crítico
2. Identificar padrões de negligência vs. engajamento real
3. Calcular risco de churn por atendente (clientes sem contato)
4. Dar recomendações concretas e acionáveis imediatamente
5. Destacar quem merece reconhecimento e quem precisa de intervenção

FORMATO OBRIGATÓRIO (markdown completo — NÃO PARE antes de terminar todas as 4 seções):

## 🏆 Ranking de Desempenho
[tabela markdown com todos os atendentes: Nome | Clientes | Vencidos | Sem nota | Status]

## 🔴 Alertas Críticos
[CADA atendente com problema: nome, números exatos, impacto em churn, gravidade]

## 📊 Risco de Churn por Atendente
[CADA atendente: clientes em risco (número), percentual da carteira, nível de urgência]

## ✅ Plano de Ação — Próximos 7 dias
[CADA atendente: ações específicas e prioritárias, da mais urgente à menos urgente]

## 🌟 Reconhecimentos
[atendentes com desempenho positivo, métricas concretas]

REGRAS ABSOLUTAS:
- Inclua TODOS os ${allSellers.length} atendentes em TODAS as seções
- Use números exatos dos dados fornecidos
- NÃO encurte, NÃO resuma, NÃO pule atendentes
- Complete TODAS as 5 seções antes de parar
- Português BR`,
        },
        {
          role: 'user',
          content: `DADOS COMPLETOS (${allSellers.length} atendentes):\n\n${reportText}\n\nGere análise COMPLETA com todas as 5 seções. Inclua TODOS os atendentes. Não encurte.`,
        },
      ], 8000, 0.3);
      return { report, summary };
    } catch (err: any) {
      console.error('[ANALYZE_ERROR]', err?.message);
      return { report, summary: 'Análise indisponível: ' + (err?.message ?? 'erro') };
    }
  }),

  suggestSalesApproach: protectedProcedure
    .input(z.object({ title: z.string().min(1), notes: z.string() }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
      const suggestProvider = process.env.GROQ_API_KEY ? 'groq' : 'gemini';
      if (!apiKey) return { suggestion: 'IA não configurada.' };
      try {
        const suggestion = await callLLM(apiKey, BASE_URLS[suggestProvider], DEFAULT_MODELS[suggestProvider], [
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
