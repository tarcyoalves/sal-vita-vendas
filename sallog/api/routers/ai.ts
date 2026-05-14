import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, adminProcedure } from '../trpc';
import { db } from '../db';
import { freights, drivers, users } from '../db/schema';

async function groqChat(
  messages: { role: string; content: string }[],
  maxTokens = 800,
  fast = false,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada no servidor');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: fast ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Groq error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}

async function getOperationContext() {
  const allFreights = await db.select().from(freights);
  const allDrivers = await db
    .select({
      id: drivers.id,
      status: drivers.status,
      vehicleType: drivers.vehicleType,
      score: drivers.score,
      totalFreights: drivers.totalFreights,
      isFavorite: drivers.isFavorite,
      userName: users.name,
    })
    .from(drivers)
    .leftJoin(users, eq(drivers.userId, users.id));

  const fSummary = {
    total: allFreights.length,
    available: allFreights.filter((f) => f.status === 'available').length,
    in_progress: allFreights.filter((f) => f.status === 'in_progress').length,
    completed: allFreights.filter((f) => f.status === 'completed').length,
    validated: allFreights.filter((f) => f.status === 'validated').length,
    paid: allFreights.filter((f) => f.status === 'paid').length,
    totalValueCents: allFreights.reduce((s, f) => s + f.value, 0),
    recent: allFreights.slice(-5).map((f) => ({
      id: f.id,
      title: f.title,
      status: f.status,
      value: f.value,
      route: `${f.originCity}/${f.originState}→${f.destinationCity}/${f.destinationState}`,
    })),
  };

  const dSummary = {
    total: allDrivers.length,
    pending: allDrivers.filter((d) => d.status === 'pending').length,
    approved: allDrivers.filter((d) => d.status === 'approved').length,
    rejected: allDrivers.filter((d) => d.status === 'rejected').length,
    favorites: allDrivers.filter((d) => d.isFavorite).length,
  };

  return { freights: fSummary, drivers: dSummary };
}

const SYSTEM_PROMPT = `Você é o assistente inteligente do FRETEPRIME, plataforma de gestão logística.
Responda em português, de forma clara e objetiva. Use dados concretos da operação quando disponíveis.
Powered by Groq · Llama 3.3 70B`;

export const aiRouter = router({
  chat: adminProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        history: z
          .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
          .max(20)
          .optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const ctx = await getOperationContext();

      const systemWithContext = `${SYSTEM_PROMPT}

DADOS ATUAIS DA OPERAÇÃO:
Fretes: ${JSON.stringify(ctx.freights)}
Motoristas: ${JSON.stringify(ctx.drivers)}
Data/Hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`;

      const messages = [
        { role: 'system', content: systemWithContext },
        ...(input.history?.slice(-10) ?? []),
        { role: 'user', content: input.message },
      ];

      const reply = await groqChat(messages, 600);
      return { reply };
    }),

  suggestValue: adminProcedure
    .input(
      z.object({
        originCity: z.string(),
        originState: z.string(),
        destinationCity: z.string(),
        destinationState: z.string(),
        cargoType: z.string(),
        weight: z.number().optional(),
        distance: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const allFreights = await db.select().from(freights);
      const similar = allFreights
        .filter((f) => f.destinationState === input.destinationState && f.cargoType === input.cargoType)
        .slice(-10)
        .map((f) => ({ value: f.value, weight: f.weight, distance: f.distance }));

      const prompt = `Especialista em fretes de sal marinho no Brasil.

Rota: ${input.originCity}/${input.originState} → ${input.destinationCity}/${input.destinationState}
Tipo: ${input.cargoType}${input.weight ? ` | Peso: ${input.weight}t` : ''}${input.distance ? ` | Distância: ${input.distance}km` : ''}
Fretes similares recentes (centavos): ${JSON.stringify(similar)}

Responda SOMENTE com JSON: {"valueReais": 1500.00, "justificativa": "texto breve"}`;

      const raw = await groqChat([{ role: 'user', content: prompt }], 300, true);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('IA não retornou JSON válido');
      const parsed = JSON.parse(match[0]) as { valueReais: number; justificativa: string };
      return { valueReais: parsed.valueReais, justificativa: parsed.justificativa };
    }),

  matchDrivers: adminProcedure
    .input(z.object({ freightId: z.number() }))
    .mutation(async ({ input }) => {
      const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
      if (!freight) throw new Error('Frete não encontrado');

      const allDrivers = await db
        .select({
          id: drivers.id,
          status: drivers.status,
          vehicleType: drivers.vehicleType,
          score: drivers.score,
          totalFreights: drivers.totalFreights,
          isFavorite: drivers.isFavorite,
          userName: users.name,
        })
        .from(drivers)
        .leftJoin(users, eq(drivers.userId, users.id));

      const approved = allDrivers.filter((d) => d.status === 'approved');

      const prompt = `Analise o frete e indique os 3 melhores motoristas disponíveis.

FRETE: ${freight.title} | ${freight.originCity}/${freight.originState}→${freight.destinationCity}/${freight.destinationState} | ${freight.cargoType} | R$${(freight.value / 100).toFixed(2)}

MOTORISTAS: ${approved.map((d) => `ID${d.id}: ${d.userName}, ${d.vehicleType}, score:${d.score ?? 0}, fretes:${d.totalFreights ?? 0}${d.isFavorite ? '⭐' : ''}`).join(' | ')}

Responda em português com justificativa breve para cada indicação.`;

      const suggestion = await groqChat([{ role: 'user', content: prompt }], 500);
      return { suggestion };
    }),

  dailySummary: adminProcedure.mutation(async () => {
    const ctx = await getOperationContext();
    const totalR = (ctx.freights.totalValueCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const prompt = `Gere um briefing executivo diário do FRETEPRIME.

DADOS: ${JSON.stringify({ ...ctx, totalValue: totalR })}

Crie um briefing com: 1) Resumo geral, 2) Pontos de atenção, 3) Recomendações, 4) Resumo financeiro.
Seja direto e use os dados reais. Máximo 300 palavras.`;

    const summary = await groqChat([{ role: 'user', content: prompt }], 700);
    return { summary };
  }),
});
