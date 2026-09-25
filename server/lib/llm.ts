// Chamada de LLM com a mesma cadeia de fallback do chat (server/routers/ai.ts),
// reutilizável por outros routers (hoje: o Radar de Cargas).
//
// Cadeia: antigravity (opcional, endpoint do dono na VPS) → Groq → Cerebras →
// OpenRouter → NVIDIA. `antigravity` só entra quando as 3 variáveis estiverem
// configuradas; sem elas, o comportamento é idêntico ao de hoje.
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletion {
  text: string;
  provider: string;
}

export interface LlmProviderConfig {
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
}

// Mesmas URLs e modelos padrão de server/routers/ai.ts — não duplicar sem motivo,
// mas os dois arquivos não podem se importar um ao outro (ai.ts é o router; este
// módulo é usado por outros routers), então o valor fica replicado aqui de propósito.
const BASE_URLS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
};

const DEFAULT_MODELS: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
  cerebras: 'gpt-oss-120b',
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  nvidia: 'meta/llama-3.3-70b-instruct',
};

function modelFor(provider: string, env: Record<string, string | undefined>): string {
  return env[`${provider.toUpperCase()}_MODEL`] || DEFAULT_MODELS[provider];
}

// Pura — recebe o `env` em vez de ler `process.env` direto, para dar para testar
// sem mexer em variável de ambiente global.
export function buildProviderChain(env: Record<string, string | undefined>): LlmProviderConfig[] {
  const chain: LlmProviderConfig[] = [];

  // antigravity só entra com as 3 variáveis presentes — configuração parcial é
  // tratada como "não configurado" (ver PLANO-RADAR-CARGAS.md seção 4).
  const { ANTIGRAVITY_BASE_URL, ANTIGRAVITY_API_KEY, ANTIGRAVITY_MODEL } = env;
  if (ANTIGRAVITY_BASE_URL && ANTIGRAVITY_API_KEY && ANTIGRAVITY_MODEL) {
    chain.push({
      provider: 'antigravity',
      baseURL: ANTIGRAVITY_BASE_URL.replace(/\/+$/, ''),
      apiKey: ANTIGRAVITY_API_KEY,
      model: ANTIGRAVITY_MODEL,
    });
  }

  const rest: { provider: string; apiKey: string | undefined }[] = [
    { provider: 'groq', apiKey: env.GROQ_API_KEY },
    { provider: 'cerebras', apiKey: env.CEREBRAS_API_KEY },
    { provider: 'openrouter', apiKey: env.OPENROUTER_API_KEY },
    { provider: 'nvidia', apiKey: env.NVIDIA_API_KEY },
  ];
  for (const r of rest) {
    if (!r.apiKey) continue;
    chain.push({
      provider: r.provider,
      baseURL: BASE_URLS[r.provider],
      apiKey: r.apiKey,
      model: modelFor(r.provider, env),
    });
  }

  return chain;
}

// fetch com timeout — mesmo motivo do fetchWithTimeout de ai.ts: sem isso, um
// provedor "pendurado" trava a função serverless até o limite dela.
async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Mesma regra de ai.ts: só o 400 (request malformado) não tenta o próximo
// provedor. Tudo mais (429, 401/403, 404, 408, 5xx, erro de rede/abort sem
// status) vale a pena tentar no próximo.
function isRetryable(err: unknown): boolean {
  return (err as { status?: number } | undefined)?.status !== 400;
}

async function callOnce(cfg: LlmProviderConfig, messages: LlmMessage[], opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<string> {
  const res = await fetchWithTimeout(`${cfg.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
    }),
  }, opts.timeoutMs);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`LLM API ${res.status}: ${text.slice(0, 300)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data?.choices?.[0]?.message?.content ?? '';
}

export async function completeWithFallback(
  messages: LlmMessage[],
  opts: { maxTokens?: number; temperature?: number; label?: string; timeoutMs?: number } = {},
): Promise<LlmCompletion> {
  const chain = buildProviderChain(process.env);
  if (chain.length === 0) {
    throw new Error(
      'completeWithFallback: nenhum provedor de IA configurado (defina GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY, NVIDIA_API_KEY ou os 3 ANTIGRAVITY_*)',
    );
  }

  const callOpts = {
    maxTokens: opts.maxTokens ?? 800,
    temperature: opts.temperature ?? 0.7,
    timeoutMs: opts.timeoutMs ?? 30000,
  };
  const label = opts.label ?? 'LLM_CHAIN';

  let lastErr: unknown;
  for (const cfg of chain) {
    try {
      const text = await callOnce(cfg, messages, callOpts);
      return { text, provider: cfg.provider };
    } catch (err) {
      lastErr = err;
      // Nunca logar a chave nem o conteúdo das mensagens — só provedor e status.
      console.warn(`[${label}] provedor ${cfg.provider} falhou (status ${(err as { status?: number } | undefined)?.status ?? 'rede'})`);
      if (!isRetryable(err)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('completeWithFallback: todos os provedores falharam');
}
