/**
 * Serviço para testar conexão com cada provedor de IA
 */

interface TestResult {
  success: boolean;
  message: string;
  provider: string;
  model: string;
}

/**
 * Testar conexão com OpenAI
 */
export async function testOpenAI(apiKey: string, model: string = "gpt-3.5-turbo"): Promise<TestResult> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: "Responda com 'OK' se você está funcionando.",
          },
        ],
        max_tokens: 10,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        message: `Erro OpenAI: ${error.error?.message || "Chave inválida"}`,
        provider: "openai",
        model,
      };
    }

    const data = (await response.json()) as any;
    if (data.choices?.[0]?.message?.content) {
      return {
        success: true,
        message: "✅ Conexão com OpenAI OK",
        provider: "openai",
        model,
      };
    }

    return {
      success: false,
      message: "Resposta vazia do OpenAI",
      provider: "openai",
      model,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro ao conectar: ${String(error)}`,
      provider: "openai",
      model,
    };
  }
}

/**
 * Testar conexão com Groq
 */
export async function testGroq(apiKey: string, model: string = "llama-3.1-8b-instant"): Promise<TestResult> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: "Responda com 'OK' se você está funcionando.",
          },
        ],
        max_tokens: 10,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        message: `Erro Groq: ${error.error?.message || "Chave inválida"}`,
        provider: "groq",
        model,
      };
    }

    const data = (await response.json()) as any;
    if (data.choices?.[0]?.message?.content) {
      return {
        success: true,
        message: "✅ Conexão com Groq OK",
        provider: "groq",
        model,
      };
    }

    return {
      success: false,
      message: "Resposta vazia do Groq",
      provider: "groq",
      model,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro ao conectar: ${String(error)}`,
      provider: "groq",
      model,
    };
  }
}

/**
 * Testar conexão com Google Gemini
 */
export async function testGemini(apiKey: string, model: string = "gemini-1.5-flash"): Promise<TestResult> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Responda com 'OK' se você está funcionando.",
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 10,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        message: `Erro Gemini: ${error.error?.message || "Chave inválida"}`,
        provider: "gemini",
        model,
      };
    }

    const data = (await response.json()) as any;
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return {
        success: true,
        message: "✅ Conexão com Gemini OK",
        provider: "gemini",
        model,
      };
    }

    return {
      success: false,
      message: "Resposta vazia do Gemini",
      provider: "gemini",
      model,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro ao conectar: ${String(error)}`,
      provider: "gemini",
      model,
    };
  }
}

/**
 * Testar conexão com Grok (xAI)
 */
export async function testGrok(apiKey: string, model: string = "grok-1"): Promise<TestResult> {
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: "Responda com 'OK' se você está funcionando.",
          },
        ],
        max_tokens: 10,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        message: `Erro Grok: ${error.error?.message || "Chave inválida"}`,
        provider: "grok",
        model,
      };
    }

    const data = (await response.json()) as any;
    if (data.choices?.[0]?.message?.content) {
      return {
        success: true,
        message: "✅ Conexão com Grok OK",
        provider: "grok",
        model,
      };
    }

    return {
      success: false,
      message: "Resposta vazia do Grok",
      provider: "grok",
      model,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro ao conectar: ${String(error)}`,
      provider: "grok",
      model,
    };
  }
}

/**
 * Testar conexão com Claude (Anthropic)
 */
export async function testClaude(apiKey: string, model: string = "claude-3-sonnet"): Promise<TestResult> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: "Responda com 'OK' se você está funcionando.",
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        message: `Erro Claude: ${error.error?.message || "Chave inválida"}`,
        provider: "claude",
        model,
      };
    }

    const data = (await response.json()) as any;
    if (data.content?.[0]?.text) {
      return {
        success: true,
        message: "✅ Conexão com Claude OK",
        provider: "claude",
        model,
      };
    }

    return {
      success: false,
      message: "Resposta vazia do Claude",
      provider: "claude",
      model,
    };
  } catch (error) {
    return {
      success: false,
      message: `Erro ao conectar: ${String(error)}`,
      provider: "claude",
      model,
    };
  }
}

/**
 * Testar qualquer provedor
 */
export async function testAIProvider(
  provider: string,
  apiKey: string,
  model: string
): Promise<TestResult> {
  switch (provider.toLowerCase()) {
    case "openai":
      return testOpenAI(apiKey, model);
    case "groq":
      return testGroq(apiKey, model);
    case "gemini":
      return testGemini(apiKey, model);
    case "grok":
      return testGrok(apiKey, model);
    case "claude":
      return testClaude(apiKey, model);
    default:
      return {
        success: false,
        message: `Provedor desconhecido: ${provider}`,
        provider,
        model,
      };
  }
}
