/**
 * Serviço para usar IA configurada pelo usuário (Groq como principal)
 */

interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Obter configuração de IA do localStorage (será passada do frontend)
 */
function getAIConfig(provider: string = "groq"): AIConfig | null {
  // Isso será passado do frontend via tRPC
  // Por enquanto, retorna null para usar fallback
  return null;
}

/**
 * Chamar Groq API
 */
async function callGroq(
  messages: ChatMessage[],
  apiKey: string,
  model: string = "llama-3.1-8b-instant"
): Promise<string> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Groq API error: ${error.error?.message || "Unknown error"}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0]?.message?.content || "Sem resposta";
  } catch (error) {
    console.error("[Groq] Error:", error);
    throw error;
  }
}

/**
 * Chamar Gemini API
 */
async function callGemini(
  messages: ChatMessage[],
  apiKey: string,
  model: string = "gemini-1.5-flash"
): Promise<string> {
  try {
    // Converter mensagens para formato Gemini
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            maxOutputTokens: 1000,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || "Unknown error"}`);
    }

    const data = (await response.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta";
  } catch (error) {
    console.error("[Gemini] Error:", error);
    throw error;
  }
}

/**
 * Chamar IA configurada (Groq como principal)
 */
export async function callConfiguredAI(
  messages: ChatMessage[],
  provider: string = "groq",
  apiKey: string,
  model?: string
): Promise<string> {
  if (!apiKey) {
    throw new Error(`Chave de API não configurada para ${provider}`);
  }

  switch (provider.toLowerCase()) {
    case "groq":
      return callGroq(messages, apiKey, model || "llama-3.1-8b-instant");
    case "gemini":
      return callGemini(messages, apiKey, model || "gemini-1.5-flash");
    default:
      throw new Error(`Provedor não suportado: ${provider}`);
  }
}

/**
 * Chat com IA configurada para admin
 */
export async function chatWithConfiguredAI(
  userMessage: string,
  provider: string,
  apiKey: string,
  model: string,
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  const systemPrompt = `Você é um assistente de IA especializado em gestão de vendas e tarefas.
Você ajuda o gerente a:
- Analisar performance de vendedores
- Otimizar estratégias de follow-up
- Identificar padrões em conversões
- Fornecer recomendações baseadas em dados

Forneça respostas concisas, acionáveis e baseadas em dados.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  return await callConfiguredAI(messages, provider, apiKey, model);
}
