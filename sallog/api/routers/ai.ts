import { z } from 'zod';
import { router, adminProcedure } from '../trpc';
import { db } from '../db';
import { freights, drivers } from '../db/schema';

type GroqMessage = { role: 'user' | 'assistant' | 'system'; content: string };

async function groqChat(messages: GroqMessage[], maxTokens = 800, fast = false): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY não configurada');

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
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0].message.content ?? '';
}

async function getOperationContext() {
  const [allFreights, allDrivers] = await Promise.all([
    db.select().from(freights),
    db.select().from(drivers),
  ]);

  const stats = {
    fretes: {
      total: allFreights.length,
      disponivel: allFreights.filter(f => f.status === 'available').length,
      em_andamento: allFreights.filter(f => f.status === 'in_progress').length,
      concluidos: allFreights.filter(f => f.status === 'completed').length,
      validados: allFreights.filter(f => f.status === 'validated').length,
      pagos: allFreights.filter(f => f.status === 'paid').length,
    },
    motoristas: {
      total: allDrivers.length,
      pendentes: allDrivers.filter(d => d.status === 'pending').length,
      aprovados: allDrivers.filter(d => d.status === 'approved').length,
    },
    financeiro: {
      a_receber: `R$ ${(allFreights.filter(f => f.status === 'validated').reduce((s, f) => s + f.value, 0) / 100).toFixed(2)}`,
      total_pago: `R$ ${(allFreights.filter(f => f.status === 'paid').reduce((s, f) => s + f.value, 0) / 100).toFixed(2)}`,
    },
  };

  const recentFreights = allFreights
    .slice(-15)
    .map(f => ({
      id: f.id,
      titulo: f.title,
      rota: `${f.originCity}/${f.originState} → ${f.destinationCity}/${f.destinationState}`,
      valor: `R$ ${(f.value / 100).toFixed(2)}`,
      status: f.status,
      carga: f.cargoType,
      peso: f.weight,
    }));

  return { stats, recentFreights, allFreights, allDrivers };
}

export const aiRouter = router({
  // — Copilot chat with full operation context
  chat: adminProcedure
    .input(z.object({
      message: z.string().min(1).max(1000),
      history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).optional().default([]),
    }))
    .mutation(async ({ input }) => {
      const ctx = await getOperationContext();

      const system = `Você é o assistente de IA do FRETEPRIME, plataforma de gestão logística da empresa Sal Vita (sal marinho de Mossoró/RN).

DADOS ATUAIS DA OPERAÇÃO:
${JSON.stringify(ctx.stats, null, 2)}

FRETES RECENTES (últimos 15):
${ctx.recentFreights.map(f => `- #${f.id} ${f.titulo} | ${f.rota} | ${f.valor} | status: ${f.status}`).join('\n')}

INSTRUÇÕES:
- Responda sempre em português brasileiro
- Seja objetivo e direto (máximo 4 parágrafos)
- Use emojis com moderação para clareza
- Valores: formato R$ X.XXX,XX
- Baseie-se sempre nos dados reais acima
- Para tópicos fora de logística, redirecione gentilmente`;

      const reply = await groqChat([
        { role: 'system', content: system },
        ...input.history.slice(-10),
        { role: 'user', content: input.message },
      ]);

      return { reply };
    }),

  // — Smart freight value suggestion
  suggestValue: adminProcedure
    .input(z.object({
      originCity: z.string(),
      originState: z.string(),
      destinationCity: z.string(),
      destinationState: z.string(),
      cargoType: z.string(),
      weight: z.number().optional(),
      distance: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const allFreights = await db.select().from(freights);

      const similar = allFreights
        .filter(f =>
          f.originState === input.originState ||
          f.destinationState === input.destinationState
        )
        .slice(-8)
        .map(f => `${f.originCity}/${f.originState}→${f.destinationCity}/${f.destinationState}: R$${(f.value / 100).toFixed(0)}, ${f.weight ?? '?'}t, ${f.cargoType}`);

      const prompt = `Especialista em fretes de sal no Brasil.

ROTA: ${input.originCity}/${input.originState} → ${input.destinationCity}/${input.destinationState}
CARGA: ${input.cargoType} | PESO: ${input.weight ? input.weight + 't' : 'n/d'} | DISTÂNCIA: ${input.distance ? input.distance + 'km' : 'n/d'}

FRETES HISTÓRICOS SIMILARES:
${similar.length > 0 ? similar.join('\n') : 'Sem histórico'}

Referencial: diesel ~R$6,20/L, consumo 2,2km/L carregado, pedágios ~R$0,12/km, margem 18%.

Responda APENAS com JSON: {"valor": 3500, "justificativa": "Uma linha de explicação"}`;

      const raw = await groqChat([{ role: 'user', content: prompt }], 120, true);

      try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { valor: number; justificativa: string };
          return {
            valueCents: Math.round((parsed.valor || 2000) * 100),
            valueReais: parsed.valor || 2000,
            justificativa: parsed.justificativa || '',
          };
        }
      } catch { /* fallback below */ }

      return { valueCents: 200000, valueReais: 2000, justificativa: 'Valor base estimado' };
    }),

  // — Score-based driver matching (no AI needed, pure logic)
  matchDrivers: adminProcedure
    .input(z.object({
      vehicleType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const allDrivers = await db.select().from(drivers);
      const approved = allDrivers.filter(d => d.status === 'approved');

      return approved
        .map(d => {
          let score = 0;
          if (d.isFavorite) score += 20;
          score += Math.min(d.totalFreights ?? 0, 30);
          if (input.vehicleType && d.vehicleType === input.vehicleType) score += 10;
          return { ...d, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }),

  // — Daily executive briefing
  dailySummary: adminProcedure
    .query(async () => {
      const ctx = await getOperationContext();

      const prompt = `Você é assistente do FRETEPRIME. Gere um briefing executivo matinal em português.

DADOS:
${JSON.stringify(ctx.stats, null, 2)}

Escreva 3 bullet points diretos:
• Situação dos fretes
• Pontos de atenção
• Ação recomendada hoje

2 linhas por bullet máximo. Use emojis. Tom executivo.`;

      const summary = await groqChat([{ role: 'user', content: prompt }], 300, true);
      return { summary };
    }),
});
