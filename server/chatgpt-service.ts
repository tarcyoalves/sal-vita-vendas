import { ENV } from "./_core/env";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Analisar cliente com IA
 */
export async function analyzeClientWithAI(clientData: {
  name: string;
  phone: string;
  city: string;
  state: string;
  email?: string;
  notes?: string;
}): Promise<string> {
  const prompt = `Analise este cliente e forneça insights:
Nome: ${clientData.name}
Telefone: ${clientData.phone}
Cidade: ${clientData.city}
Estado: ${clientData.state}
Email: ${clientData.email || "N/A"}
Observações: ${clientData.notes || "Nenhuma"}

Forneça:
1. Perfil do cliente (tipo de negócio estimado)
2. Potencial de venda (alto/médio/baixo)
3. Próximos passos recomendados
4. Palavras-chave para abordagem`;

  return await callChatGPT([
    {
      role: "system",
      content:
        "Você é um especialista em análise de clientes e vendas. Forneça análises concisas e acionáveis.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);
}

/**
 * Buscar clientes similares com IA
 */
export async function findSimilarClientsWithAI(
  clientNotes: string,
  allClients: any[]
): Promise<number[]> {
  if (allClients.length === 0) return [];

  const clientsList = allClients
    .map((c) => `ID: ${c.id}, Nome: ${c.name}, Notas: ${c.notes || "N/A"}`)
    .join("\n");

  const prompt = `Dados os clientes abaixo, identifique quais são similares ao cliente descrito nas notas.

CLIENTE ALVO:
${clientNotes}

TODOS OS CLIENTES:
${clientsList}

Retorne apenas os IDs dos clientes similares, separados por vírgula. Se nenhum for similar, retorne "nenhum".`;

  const response = await callChatGPT([
    {
      role: "system",
      content:
        "Você é um especialista em análise de dados de clientes. Identifique padrões e similaridades.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);

  const ids = response
    .split(",")
    .map((id) => parseInt(id.trim()))
    .filter((id) => !isNaN(id));

  return ids;
}

/**
 * Chat com IA para admin (contexto de tarefas)
 */
export async function chatWithAI(
  userMessage: string,
  context: {
    totalReminders?: number;
    completedReminders?: number;
    conversionRate?: number;
    topSellers?: string[];
  },
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  const systemPrompt = `Você é um assistente de IA especializado em gestão de vendas e lembretes.
Você ajuda o gerente a:
- Analisar performance de vendedores
- Otimizar estratégias de follow-up
- Identificar padrões em conversões
- Fornecer recomendações baseadas em dados

CONTEXTO ATUAL:
- Total de Lembretes: ${context.totalReminders || 0}
- Lembretes Concluídos: ${context.completedReminders || 0}
- Taxa de Conversão: ${context.conversionRate || 0}%
- Top Vendedores: ${context.topSellers?.join(", ") || "N/A"}

Forneça respostas concisas, acionáveis e baseadas em dados.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  return await callChatGPT(messages);
}

/**
 * Chamar API ChatGPT
 */
async function callChatGPT(messages: ChatMessage[]): Promise<string> {
  if (!ENV.openaiApiKey) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: ENV.openaiModel || "gpt-3.5-turbo",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message}`);
    }

    const data = (await response.json()) as any;
    return data.choices[0]?.message?.content || "Sem resposta";
  } catch (error) {
    console.error("[ChatGPT] Error:", error);
    throw error;
  }
}

/**
 * Sugerir próximas ações para vendedor
 */
export async function suggestNextActions(
  sellerPerformance: {
    name: string;
    completedCalls: number;
    convertedCalls: number;
    pendingReminders: number;
  }
): Promise<string> {
  const prompt = `Baseado na performance do vendedor abaixo, sugira 3 ações prioritárias:

Vendedor: ${sellerPerformance.name}
Ligações Concluídas: ${sellerPerformance.completedCalls}
Ligações Convertidas: ${sellerPerformance.convertedCalls}
Lembretes Pendentes: ${sellerPerformance.pendingReminders}

Forneça sugestões práticas e imediatas.`;

  return await callChatGPT([
    {
      role: "system",
      content:
        "Você é um coach de vendas experiente. Forneça recomendações práticas e motivadoras.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);
}
