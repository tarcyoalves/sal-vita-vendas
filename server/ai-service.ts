import { invokeLLM } from "./_core/llm";
import * as db from "./db";

export async function analyzeSellerPerformance(sellerId: number) {
  try {
    // Buscar dados do vendedor
    const reminders = await db.getCallReminders(sellerId);
    const metrics = await db.getDailyMetrics(sellerId, new Date());

    if (!reminders || reminders.length === 0) {
      return {
        performanceScore: 0,
        fraudRiskScore: 0,
        insights: "Sem dados suficientes para análise",
        recommendations: "Comece a registrar lembretes para gerar análises",
        suspiciousPatterns: [],
      };
    }

    // Preparar dados para análise
    const totalReminders = reminders.length;
    const completedReminders = reminders.filter(r => r.status === "completed").length;
    const completionRate = (completedReminders / totalReminders) * 100;

    // Chamar IA para análise
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "Você é um analista de performance de vendas. Analise os dados fornecidos e retorne insights em JSON.",
        },
        {
          role: "user",
          content: `Analise o desempenho do vendedor com os seguintes dados:
          - Total de lembretes: ${totalReminders}
          - Lembretes completos: ${completedReminders}
          - Taxa de conclusão: ${completionRate.toFixed(2)}%
          - Meta diária cumprida: ${metrics?.goalMet ? "Sim" : "Não"}
          
          Retorne um JSON com:
          {
            "performanceScore": (0-100),
            "fraudRiskScore": (0-100),
            "insights": "análise detalhada",
            "recommendations": "recomendações",
            "suspiciousPatterns": ["padrão1", "padrão2"]
          }`,
        },
      ],
      response_format: {
        type: "json_schema" as const,
        json_schema: {
          name: "performance_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              performanceScore: { type: "number" },
              fraudRiskScore: { type: "number" },
              insights: { type: "string" },
              recommendations: { type: "string" },
              suspiciousPatterns: { type: "array", items: { type: "string" } },
            },
            required: ["performanceScore", "fraudRiskScore", "insights", "recommendations", "suspiciousPatterns"],
          },
        },
      },
    });

    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== 'string') throw new Error("Empty response from LLM");

    const analysis = JSON.parse(content);

    // Salvar análise no banco
    await db.createAiAnalysis({
      sellerId,
      analysisDate: new Date(),
      performanceScore: analysis.performanceScore,
      fraudRiskScore: analysis.fraudRiskScore,
      insights: analysis.insights,
      recommendations: analysis.recommendations,
      suspiciousPatterns: analysis.suspiciousPatterns,
    });

    return analysis;
  } catch (error) {
    console.error("[AI Service] Error analyzing seller performance:", error);
    throw error;
  }
}

export async function detectFraudPatterns(sellerId: number) {
  try {
    const reminders = await db.getCallReminders(sellerId);
    const results = reminders?.length ? await Promise.all(
      reminders.map(r => db.getCallResults(r.id))
    ) : [];

    // Verificar padrões suspeitos
    const suspiciousPatterns: string[] = [];

    // Padrão 1: Muitos reagendamentos sem conclusão
    const rescheduledCount = results.flat().filter(r => r.resultType === "reagendada").length;
    if (rescheduledCount > (reminders?.length || 0) * 0.5) {
      suspiciousPatterns.push("Muitos reagendamentos sem conclusão");
    }

    // Padrão 2: Taxa alta de "não atendida"
    const notAttendedCount = results.flat().filter(r => r.resultType === "nao_atendida").length;
    if (notAttendedCount > (reminders?.length || 0) * 0.6) {
      suspiciousPatterns.push("Taxa alta de ligações não atendidas");
    }

    // Padrão 3: Sem conversões
    const convertedCount = results.flat().filter(r => r.resultType === "convertida").length;
    if (convertedCount === 0 && (reminders?.length || 0) > 10) {
      suspiciousPatterns.push("Nenhuma conversão apesar de múltiplos lembretes");
    }

    return {
      isFraud: suspiciousPatterns.length > 1,
      patterns: suspiciousPatterns,
      riskScore: Math.min(100, suspiciousPatterns.length * 30),
    };
  } catch (error) {
    console.error("[AI Service] Error detecting fraud patterns:", error);
    throw error;
  }
}
