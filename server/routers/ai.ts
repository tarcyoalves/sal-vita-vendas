import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { chatMessages, tasks, clients, sellers, workSessions } from '../db/schema';
import { eq, desc, or, gte, and, isNull, lt } from 'drizzle-orm';

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

// In-memory context cache — avoids rebuilding full admin context on every chat call
const contextCache = new Map<string, { data: string; expires: number }>();
const CONTEXT_TTL = 5 * 60_000; // 5 minutes

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
  {
    type: 'function',
    function: {
      name: 'get_system_activity',
      description: 'Retorna um log de atividade recente do sistema: tarefas editadas nas últimas horas, quem está online agora, lembretes desativados recentemente, alterações suspeitas. Use quando quiser saber o que está acontecendo no sistema agora.',
      parameters: {
        type: 'object',
        properties: {
          hours_back: { type: 'number', description: 'Quantas horas atrás verificar (padrão: 2)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_fraud_patterns',
      description: 'Análise profunda de padrões suspeitos de um atendente: burst de contatos em janela de tempo, tarefas reagendadas sem contato real, lembretes desativados, qualidade de anotações. Use quando suspeitar de fraude ou manipulação.',
      parameters: {
        type: 'object',
        properties: {
          attendant_name: { type: 'string', description: 'Nome do atendente a analisar' },
        },
        required: ['attendant_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_all_sellers_summary',
      description: 'Resumo rápido de TODOS os atendentes: status online, lembretes vencidos, última atividade, score de suspeita. Use para visão geral do time.',
      parameters: { type: 'object', properties: {} },
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

  if (name === 'get_system_activity') {
    const hoursBack = Number(args.hours_back ?? 2);
    const since = new Date(Date.now() - hoursBack * 3600_000);
    const now = new Date();

    const [recentEdits, activeSessions, allSellers] = await Promise.all([
      db.select().from(tasks).where(gte(tasks.updatedAt, since)).orderBy(desc(tasks.updatedAt)).limit(30),
      db.select().from(workSessions).where(eq(workSessions.status, 'active')),
      db.select().from(sellers),
    ]);

    const onlineNames = activeSessions.map(s => {
      const seller = allSellers.find(sel => sel.userId === s.userId);
      const started = new Date(s.startedAt);
      const elapsed = now.getTime() - started.getTime();
      const hrs = Math.floor(elapsed / 3600000);
      const mins = Math.floor((elapsed % 3600000) / 60000);
      return `${seller?.name ?? `userId:${s.userId}`} (online há ${hrs > 0 ? hrs + 'h' : ''}${mins}min)`;
    });

    const recentlyDisabled = recentEdits.filter(t => t.reminderEnabled === false);
    const noNotesEdits = recentEdits.filter(t => !t.notes || t.notes.trim().length < 15);
    const suspiciousEdits = recentEdits.filter(t => {
      const diff = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
      return diff < 2 * 60_000; // edited in first 2 min = never really touched
    });

    return {
      period: `últimas ${hoursBack}h`,
      onlineNow: onlineNames.length > 0 ? onlineNames : ['nenhum atendente online'],
      recentEditsCount: recentEdits.length,
      recentlyDisabledReminders: recentlyDisabled.map(t => ({
        id: t.id, title: t.title.slice(0, 60), assignedTo: t.assignedTo, updatedAt: t.updatedAt
      })),
      editsWithoutNotes: noNotesEdits.length,
      suspiciousEdits: suspiciousEdits.length,
      topEdits: recentEdits.slice(0, 10).map(t => ({
        id: t.id,
        title: t.title.slice(0, 50),
        assignedTo: t.assignedTo,
        hasNotes: !!t.notes && t.notes.trim().length > 15,
        noteLen: t.notes?.trim().length ?? 0,
        updatedAt: t.updatedAt,
      })),
    };
  }

  if (name === 'analyze_fraud_patterns') {
    const name_ = String(args.attendant_name ?? '');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const allSellers = await db.select().from(sellers);
    const seller = allSellers.find(s => s.name.toLowerCase().includes(name_.toLowerCase()));
    if (!seller) return { error: `Atendente "${name_}" não encontrado` };

    const st = await db.select().from(tasks).where(
      or(eq(tasks.assignedTo, seller.name), eq(tasks.userId, seller.userId))
    );

    // Burst windows: check every 10, 30, 60-min window
    const contactedSorted = st
      .filter(t => t.lastContactedAt)
      .sort((a, b) => new Date(a.lastContactedAt!).getTime() - new Date(b.lastContactedAt!).getTime());

    const burstWindows: Array<{ window: string; count: number; start: Date }> = [];
    for (const windowMs of [600_000, 1800_000, 3600_000]) {
      let max = 0; let maxStart: Date | null = null;
      for (const t of contactedSorted) {
        const base = new Date(t.lastContactedAt!).getTime();
        const inW = contactedSorted.filter(x => {
          const d = new Date(x.lastContactedAt!).getTime() - base;
          return d >= 0 && d <= windowMs;
        }).length;
        if (inW > max) { max = inW; maxStart = new Date(base); }
      }
      if (max >= 3) burstWindows.push({ window: `${windowMs/60000}min`, count: max, start: maxStart! });
    }

    const neverUpdated = st.filter(t => new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime() < 2 * 60_000);
    const reschedNoContact = st.filter(t =>
      new Date(t.updatedAt) > sevenDaysAgo &&
      (!t.lastContactedAt || new Date(t.lastContactedAt) < sevenDaysAgo) &&
      t.reminderDate
    );
    const disabledReminders = st.filter(t => t.reminderEnabled === false);
    const ghostClients = st.filter(t => !t.lastContactedAt || new Date(t.lastContactedAt) < thirtyDaysAgo);
    const noNotes = st.filter(t => !t.notes || t.notes.trim().length < 15);
    const avgNoteLen = st.filter(t => t.notes && t.notes.trim().length > 0)
      .reduce((acc, t, _, arr) => acc + t.notes!.trim().length / arr.length, 0);

    let suspicionScore = 0;
    suspicionScore += burstWindows.some(b => b.window === '10min' && b.count >= 5) ? 25 : 0;
    suspicionScore += reschedNoContact.length * 3;
    suspicionScore += disabledReminders.length * 4;
    suspicionScore += neverUpdated.length * 2;
    suspicionScore += noNotes.length * 2;
    if (avgNoteLen < 20 && noNotes.length > 5) suspicionScore += 10;

    return {
      attendant: seller.name,
      total: st.length,
      suspicionScore,
      verdict: suspicionScore >= 30 ? '🔴 ALTO RISCO — padrões fortes de fraude detectados'
        : suspicionScore >= 15 ? '🟡 MÉDIO RISCO — comportamento suspeito, monitorar'
        : '🟢 BAIXO RISCO — sem padrões críticos detectados',
      burstDetection: burstWindows.length > 0 ? burstWindows : 'Nenhum burst detectado',
      reschedNoContact: reschedNoContact.length,
      disabledReminders: disabledReminders.length,
      neverUpdated: neverUpdated.length,
      ghostClients: ghostClients.length,
      noNotes: noNotes.length,
      avgNoteLength: Math.round(avgNoteLen),
      topSuspiciousTasks: reschedNoContact.slice(0, 5).map(t => ({
        id: t.id, title: t.title.slice(0, 60), updatedAt: t.updatedAt, lastContact: t.lastContactedAt
      })),
    };
  }

  if (name === 'get_all_sellers_summary') {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const pad2 = (n: number) => String(n).padStart(2, '0');

    const [allSellers, allTasks, todaySessions] = await Promise.all([
      db.select().from(sellers),
      db.select().from(tasks),
      db.select().from(workSessions).where(gte(workSessions.startedAt, todayStart)),
    ]);

    return allSellers.map(s => {
      const st = allTasks.filter(t => t.assignedTo === s.name || t.userId === s.userId);
      const overdue = st.filter(t => t.reminderDate && new Date(t.reminderDate) < now).length;
      const ghost = st.filter(t => !t.lastContactedAt || new Date(t.lastContactedAt) < thirtyDaysAgo).length;
      const disabled = st.filter(t => t.reminderEnabled === false).length;
      const noNotes = st.filter(t => !t.notes || t.notes.trim().length < 15).length;

      const sess = todaySessions
        .filter(ws => ws.userId === s.userId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

      let sessionLine = 'não acessou hoje';
      if (sess) {
        const start = new Date(sess.startedAt);
        const end = sess.endedAt ? new Date(sess.endedAt) : now;
        const workedMs = Math.max(0, end.getTime() - start.getTime() - (sess.totalPausedMs ?? 0));
        const hrs = Math.floor(workedMs / 3600000);
        const mins = Math.floor((workedMs % 3600000) / 60000);
        sessionLine = `entrada ${pad2(start.getHours())}:${pad2(start.getMinutes())}, ${hrs > 0 ? hrs + 'h' : ''}${mins}min, status=${sess.status}`;
      }

      let score = overdue * 2 + noNotes * 2 + disabled * 4 + ghost * 1;
      return {
        name: s.name,
        total: st.length,
        overdue,
        ghost,
        disabled,
        noNotes,
        score,
        status: score >= 10 ? '🔴 Suspeito' : score >= 4 ? '🟡 Atenção' : '🟢 Normal',
        session: sessionLine,
      };
    });
  }

  return { error: `Ferramenta desconhecida: ${name}` };
}

// ── Context builder ───────────────────────────────────────────────────────────

async function buildUserContext(userId: number, role: string): Promise<string> {
  const cacheKey = `ctx:${role}:${userId}`;
  const cached = contextCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000);
  const oneDayAgo = new Date(now.getTime() - 86400_000);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const fmtMs = (ms: number) => {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h${pad2(m)}min` : `${m}min`;
  };

  const userTasks = role === 'admin'
    ? await db.select().from(tasks)
    : await db.select().from(tasks).where(eq(tasks.userId, userId));

  const withReminder = userTasks.filter(t => t.reminderDate && t.reminderEnabled !== false);
  const overdue = withReminder.filter(t => new Date(t.reminderDate!) < now);
  const highPriority = userTasks.filter(t => t.priority === 'high');

  let context = `=== SISTEMA SAL VITA — SNAPSHOT (${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}) ===
TOTAL: ${userTasks.length} tarefas | ${withReminder.length} com lembrete ativo | ${overdue.length} VENCIDAS | ${highPriority.length} alta prioridade
VENCIDAS: ${overdue.slice(0, 5).map(t => `"${t.title.slice(0, 50)}"(${t.assignedTo ?? '-'})`).join(' | ') || 'nenhuma'}
`;

  if (role === 'admin') {
    const [allSellers, todaySessions, recentEdits, activeSessions] = await Promise.all([
      db.select().from(sellers),
      db.select().from(workSessions).where(gte(workSessions.startedAt, todayStart)),
      db.select().from(tasks).where(gte(tasks.updatedAt, twoHoursAgo)).orderBy(desc(tasks.updatedAt)).limit(20),
      db.select().from(workSessions).where(eq(workSessions.status, 'active')),
    ]);

    // Online now
    const onlineNow = activeSessions.map(s => {
      const sel = allSellers.find(x => x.userId === s.userId);
      const mins = Math.floor((now.getTime() - new Date(s.startedAt).getTime()) / 60000);
      return `${sel?.name ?? `uid:${s.userId}`}(${mins}min)`;
    });
    context += `\nONLINE AGORA (${onlineNow.length}): ${onlineNow.join(', ') || 'ninguém'}`;

    // Suspicious recent activity
    const recentlyDisabled = recentEdits.filter(t => t.reminderEnabled === false);
    const editedNoNotes = recentEdits.filter(t => !t.notes || t.notes.trim().length < 15);
    const editedNoContact = recentEdits.filter(t =>
      !t.lastContactedAt || new Date(t.lastContactedAt) < oneDayAgo
    );
    context += `\nATIVIDADE ÚLTIMAS 2H: ${recentEdits.length} edições | ${recentlyDisabled.length} lembretes desativados | ${editedNoNotes.length} edições sem nota real | ${editedNoContact.length} editadas sem contato registrado`;
    if (recentlyDisabled.length > 0) {
      context += `\nLEMBRETES DESATIVADOS RECENTEMENTE: ${recentlyDisabled.slice(0, 5).map(t => `"${t.title.slice(0, 40)}"(${t.assignedTo ?? '-'})`).join(' | ')}`;
    }

    // Per-seller summary
    context += `\n\nATENDENTES (${allSellers.length}):`;
    for (const s of allSellers) {
      const st = userTasks.filter(t => t.assignedTo === s.name || t.userId === s.userId);
      const late = st.filter(t => t.reminderDate && new Date(t.reminderDate) < now).length;
      const contactsToday = st.filter(t => t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart).length;
      const ghost = st.filter(t => !t.lastContactedAt || new Date(t.lastContactedAt) < thirtyDaysAgo).length;
      const disabled = st.filter(t => t.reminderEnabled === false).length;
      const noNotes = st.filter(t => !t.notes || t.notes.trim().length < 15).length;
      const neverUpdated = st.filter(t => new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime() < 2 * 60_000).length;

      // Burst detection
      const cSorted = st.filter(t => t.lastContactedAt)
        .sort((a, b) => new Date(a.lastContactedAt!).getTime() - new Date(b.lastContactedAt!).getTime());
      let burst = 0;
      for (const t of cSorted) {
        const base = new Date(t.lastContactedAt!).getTime();
        const w = cSorted.filter(x => { const d = new Date(x.lastContactedAt!).getTime() - base; return d >= 0 && d <= 600_000; }).length;
        if (w > burst) burst = w;
      }

      const sess = todaySessions.filter(ws => ws.userId === s.userId)
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
      let sessLine = 'ausente';
      if (sess) {
        const start = new Date(sess.startedAt);
        const end = sess.endedAt ? new Date(sess.endedAt) : now;
        let pMs = sess.totalPausedMs ?? 0;
        if (sess.status === 'paused' && sess.pausedAt) pMs += now.getTime() - new Date(sess.pausedAt).getTime();
        sessLine = `entrada=${pad2(start.getHours())}:${pad2(start.getMinutes())},trabalhado=${fmtMs(Math.max(0, end.getTime()-start.getTime()-pMs))},status=${sess.status}`;
      }

      const fraudFlags = [
        burst >= 5 ? `⚠️BURST(${burst})` : null,
        disabled > 0 ? `DESATIV(${disabled})` : null,
        neverUpdated > 3 ? `NUNCA_EDIT(${neverUpdated})` : null,
      ].filter(Boolean).join(' ');

      context += `\n• ${s.name}: ${st.length}c, venc=${late}, hoje=${contactsToday}, ghost=${ghost}, semNota=${noNotes} | ${sessLine}${fraudFlags ? ` | 🚨${fraudFlags}` : ''}`;
    }
  }

  const result = context;
  contextCache.set(cacheKey, { data: result, expires: Date.now() + CONTEXT_TTL });
  return result;
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

        // Force fresh context if user explicitly asks for current status
        const needsFresh = /agora|atual|hoje|online|atividade|suspeito/i.test(input.message);
        if (needsFresh) contextCache.delete(`ctx:${ctx.user.role}:${ctx.user.id}`);

        const userContext = await buildUserContext(ctx.user.id, ctx.user.role);
        console.log('[AI_CHAT] context built');

        const isAdmin = ctx.user.role === 'admin';

        const systemPrompt = isAdmin
          ? `Você é o sistema de inteligência interna da empresa Sal Vita — Sal do Brasil. Você é os OLHOS do gestor dentro do sistema.
Você tem acesso COMPLETO a todos os dados e pode EXECUTAR ações reais.

${userContext}

FERRAMENTAS DISPONÍVEIS — USE PROATIVAMENTE:
- get_system_activity: O QUE ESTÁ ACONTECENDO AGORA — edições recentes, quem está online, lembretes desativados, atividade suspeita
- get_all_sellers_summary: VISÃO GERAL de todos os atendentes com scores de suspeita em tempo real
- analyze_fraud_patterns: ANÁLISE PROFUNDA de fraude/negligência de um atendente específico
- list_tasks: listar lembretes/status de um atendente específico
- list_sessions: histórico de sessões de trabalho (use "todos" para ver todos)
- reschedule_tasks: REDISTRIBUIR lembretes vencidos de um atendente em dias úteis

QUANDO USAR CADA FERRAMENTA:
- Perguntou "o que está acontecendo?", "tem algo suspeito?", "quem está online?" → get_system_activity
- Perguntou sobre o time geral, ranking, quem está pior → get_all_sellers_summary
- Perguntou sobre fraude, simulação, comportamento suspeito de alguém específico → analyze_fraud_patterns
- Pediu para reagendar, redistribuir lembretes → reschedule_tasks
- Pediu histórico de acesso, horas trabalhadas → list_sessions
- Pediu dados de tarefas de alguém → list_tasks

REGRAS ABSOLUTAS:
- Sempre que há dado disponível, USE a ferramenta — não responda "não tenho acesso"
- Após executar ferramenta, reporte os DADOS REAIS retornados
- Se algo estiver suspeito no contexto, ALERTE proativamente sem esperar ser perguntado
- Use os dados de contexto acima que já estão atualizados
- Seja direto, preciso, use emojis quando relevante, responda em português brasileiro
- Se o contexto mostrar fraudes ou problemas graves, alerte IMEDIATAMENTE`
          : `Você é um co-piloto de performance para atendentes da empresa Sal Vita — Sal do Brasil.
Seu papel é INFORMATIVO — você não executa ações no sistema.

${userContext}

SUAS FUNÇÕES:
1. Analisar sua própria performance com base nos dados acima
2. Sugerir prioridades para o dia: quais clientes contatar primeiro
3. Dicas de abordagem para clientes B2B de sal
4. Alertar sobre lembretes vencidos e clientes em risco de churn
5. Lembrar sobre a importância de registrar contatos e anotações

REGRAS:
- Use apenas os dados do contexto acima (são os seus dados)
- Seja objetivo, motivador, use emojis, responda em português brasileiro
- Não mencione outros atendentes — foque apenas na performance do usuário atual`;

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

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

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

      // Ghost clients: no real contact in 30+ days (lastContactedAt null or stale)
      const ghostClients = st.filter(t =>
        !t.lastContactedAt || new Date(t.lastContactedAt) < thirtyDaysAgo
      );

      // Note quality: average chars in notes for tasks that have notes
      const notedTasks = st.filter(t => t.notes && t.notes.trim().length > 0);
      const avgNoteLen = notedTasks.length > 0
        ? Math.round(notedTasks.reduce((acc, t) => acc + t.notes!.trim().length, 0) / notedTasks.length)
        : 0;

      // Burst detection: ≥5 contacts logged within any 10-min window → fraud signal
      const contactedSorted = st
        .filter(t => t.lastContactedAt)
        .sort((a, b) => new Date(a.lastContactedAt!).getTime() - new Date(b.lastContactedAt!).getTime());
      let burstMax = 0;
      for (let i = 0; i < contactedSorted.length; i++) {
        const base = new Date(contactedSorted[i].lastContactedAt!).getTime();
        const inWindow = contactedSorted.filter(t => {
          const d = new Date(t.lastContactedAt!).getTime() - base;
          return d >= 0 && d <= 600000;
        }).length;
        if (inWindow > burstMax) burstMax = inWindow;
      }
      const hasBurst = burstMax >= 5;

      // Rescheduled without real contact: updatedAt recent but lastContactedAt old/null
      const reschedNoContact = st.filter(t =>
        new Date(t.updatedAt) > sevenDaysAgo
        && (!t.lastContactedAt || new Date(t.lastContactedAt) < sevenDaysAgo)
        && t.reminderDate
      );

      // Suspicion score (recurring model — no completion metric)
      let suspicionScore = 0;
      suspicionScore += overdue.length * 2;
      suspicionScore += noNotes.length * 3;
      suspicionScore += disabledReminders.length * 4;
      suspicionScore += noReminderDate.length * 1;
      suspicionScore += neverUpdated.length * 2;
      suspicionScore += ghostClients.length * 2;
      suspicionScore += hasBurst ? 20 : 0;
      suspicionScore += reschedNoContact.length * 3;
      if (avgNoteLen < 20 && notedTasks.length > 5) suspicionScore += 5;

      let status: '🟢 Normal' | '🟡 Atenção' | '🔴 Suspeito';
      if (suspicionScore >= 10) status = '🔴 Suspeito';
      else if (suspicionScore >= 4) status = '🟡 Atenção';
      else status = '🟢 Normal';

      const activeRate = total > 0 ? Math.round((withReminder.length / total) * 100) : 0;

      const flags = [
        overdue.length > 0           ? `${overdue.length} lembrete(s) vencido(s) sem reatualização` : null,
        noNotes.length > 0           ? `${noNotes.length} cliente(s) sem anotação de contato` : null,
        disabledReminders.length > 0 ? `${disabledReminders.length} lembrete(s) DESATIVADO(s) manualmente` : null,
        noReminderDate.length > 0    ? `${noReminderDate.length} cliente(s) sem data de lembrete configurada` : null,
        neverUpdated.length > 0      ? `${neverUpdated.length} tarefa(s) nunca atualizadas desde a importação` : null,
        ghostClients.length > 0      ? `${ghostClients.length} cliente(s) sem contato há 30+ dias (risco churn)` : null,
        hasBurst                     ? `⚠️ ALERTA FRAUDE: ${burstMax} contatos em <10min (burst detectado)` : null,
        reschedNoContact.length > 0  ? `${reschedNoContact.length} tarefa(s) reagendadas sem contato real (simulação suspeita)` : null,
        avgNoteLen < 20 && notedTasks.length > 5 ? `Qualidade de anotações baixa (média ${avgNoteLen} chars)` : null,
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
        ghostCount: ghostClients.length,
        avgNoteLen,
        hasBurst,
        burstMax,
        reschedNoContact: reschedNoContact.length,
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
      `${r.name}: ${r.total} clientes, ${r.withReminder} com lembrete ativo, ${r.overdue} vencidos, sem_anotação=${r.noNotes}, desativados=${r.disabledReminders}, sem_data=${r.noReminderDate}, nunca_atualizado=${r.neverUpdated}, status=${r.status} | CHURN: ghost_clientes=${r.ghostCount} (sem contato 30d+), reagendado_sem_contato=${r.reschedNoContact} | FRAUDE: burst=${r.hasBurst ? `SIM(${r.burstMax} em 10min)` : 'não'} | QUALIDADE: media_nota=${r.avgNoteLen}chars | ACESSO: hoje=[${r.sessaoHoje}], dias_ativos_7d=${r.diasAtivos7}, total_trabalhado_7d=${r.totalTrabalhado7dias}, ultimo_acesso=${r.ultimoAcesso} | flags=${r.flags.join('; ') || 'nenhuma'}`
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
- ghost_clientes = clientes sem NENHUM contato real nos últimos 30+ dias → risco churn alto
- burst=SIM (N em 10min) = possível fraude: clientes "marcados" em massa em poucos minutos, sem contato real
- reagendado_sem_contato = tarefa atualizada recentemente mas sem contato registrado → simulação de atividade
- media_nota baixa (<20 chars) = anotações superficiais/vazias → atendente não documenta contatos reais
- dias_ativos_7d / total_trabalhado_7d = presença e dedicação real no sistema nos últimos 7 dias

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
