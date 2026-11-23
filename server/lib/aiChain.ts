// Execução das chamadas de IA do CRM (server/routers/ai.ts) sobre a MESMA cadeia de provedores de
// server/lib/llm.ts (antigravity02 → antigravity → groq → cerebras → openrouter → nvidia).
//
// - fallback para o PRÓXIMO provedor em qualquer falha (inclusive 400, que pode ser específico do provedor);
// - prazo total compartilhado entre os provedores (a função da Vercel tem maxDuration 60 s);
// - tool-calling com no máximo `maxRodadas` rodadas; 400 com ferramentas → tenta o MESMO provedor sem ferramentas;
// - cadeia inteira falhou → uma linha de log (a mesma de llm.ts) e TRPCError SERVICE_UNAVAILABLE.
import { TRPCError } from '@trpc/server';
import { buildProviderChain, codigoDoErro, type LlmProviderConfig } from './llm';

export const AI_INDISPONIVEL = 'A IA está indisponível agora. Avise o administrador.';
export const PRAZO_TOTAL_MS = 50_000;
export const TIMEOUT_POR_CHAMADA_MS = 30_000;
export const MAX_RODADAS_FERRAMENTAS = 5;
const MIN_RESTANTE_MS = 1_000;

export type Msg = { role: string; content?: string | null; [k: string]: unknown };

export interface Prazo { restanteMs(): number }

function novoPrazo(totalMs: number): Prazo {
  const fim = Date.now() + totalMs;
  return { restanteMs: () => fim - Date.now() };
}

function erroComStatus(mensagem: string, status?: number, codigo?: string): Error {
  const err = new Error(mensagem) as Error & { status?: number; codigo?: string };
  err.status = status;
  err.codigo = codigo;
  return err;
}

function timeoutDaChamada(prazo: Prazo): number {
  const r = prazo.restanteMs();
  if (r < MIN_RESTANTE_MS) throw erroComStatus('prazo total da IA esgotado');
  return Math.min(TIMEOUT_POR_CHAMADA_MS, r);
}

async function postar(cfg: LlmProviderConfig, body: Record<string, unknown>, ms: number): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(`${cfg.baseURL}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, ...body }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw erroComStatus(`LLM API ${res.status}: ${t.slice(0, 300)}`, res.status, codigoDoErro(t));
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Uma chamada simples (sem ferramentas). */
export async function chamarLLM(cfg: LlmProviderConfig, prazo: Prazo, messages: Msg[], maxTokens = 800, temperature = 0.7): Promise<string> {
  const data = await postar(cfg, { messages, max_tokens: maxTokens, temperature }, timeoutDaChamada(prazo));
  return data?.choices?.[0]?.message?.content ?? 'Sem resposta da IA.';
}

export interface OpcoesFerramentas {
  maxTokens?: number;
  maxRodadas?: number;
  executar: (nome: string, args: any) => Promise<unknown>;
  permitida: (nome: string) => boolean;
}

/**
 * Loop de tool-calling num provedor. Depois de `maxRodadas` rodadas com ferramentas, a última chamada vai SEM
 * ferramentas para forçar a resposta em texto. 400 com ferramentas: repete sem elas, com as mensagens originais.
 */
export async function chamarComFerramentas(
  cfg: LlmProviderConfig, prazo: Prazo, messages: Msg[], tools: any[], op: OpcoesFerramentas,
): Promise<string> {
  const maxTokens = op.maxTokens ?? 1000;
  const maxRodadas = op.maxRodadas ?? MAX_RODADAS_FERRAMENTAS;
  try {
    let msgs: Msg[] = messages;
    for (let rodada = 0; ; rodada++) {
      const comTools = tools.length > 0 && rodada < maxRodadas;
      const body: Record<string, unknown> = { messages: msgs, max_tokens: maxTokens, temperature: 0.4 };
      if (comTools) { body.tools = tools; body.parallel_tool_calls = false; }
      const data = await postar(cfg, body, timeoutDaChamada(prazo));
      const msg = data?.choices?.[0]?.message;
      if (!msg) return 'Sem resposta da IA.';
      if (comTools && msg.tool_calls?.length) {
        const novas: Msg[] = [...msgs, msg];
        for (const tc of msg.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* argumentos truncados: usa vazio */ }
          const resultado = op.permitida(tc.function?.name)
            ? await op.executar(tc.function.name, args)
            : { error: 'Ferramenta não permitida.' };
          novas.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(resultado) });
        }
        msgs = novas;
        continue;
      }
      return msg.content ?? 'Sem resposta.';
    }
  } catch (err) {
    if ((err as { status?: number })?.status === 400 && tools.length > 0) {
      console.warn(`[AI] provedor ${cfg.provider} devolveu 400 com ferramentas — repetindo sem ferramentas`);
      return chamarLLM(cfg, prazo, messages, maxTokens, 0.4);
    }
    throw err;
  }
}

export interface OpcoesCadeia {
  label: string;
  /** Provedor preferido (ex.: chave informada pelo admin): vai antes da cadeia do ambiente. */
  primeiro?: LlmProviderConfig;
  /** Ajuste por provedor (ex.: modelo menor no Groq). */
  ajustar?: (cfg: LlmProviderConfig) => LlmProviderConfig;
  prazoMs?: number;
  /** Só para teste. */
  env?: Record<string, string | undefined>;
}

export function cadeiaConfigurada(env: Record<string, string | undefined> = process.env): boolean {
  return buildProviderChain(env).length > 0;
}

/**
 * Roda `fn` em cada provedor da cadeia até um funcionar, dentro de um prazo único.
 * Cadeia vazia ou toda falhando → TRPCError SERVICE_UNAVAILABLE (AI_INDISPONIVEL).
 */
export async function executarNaCadeia(
  fn: (cfg: LlmProviderConfig, prazo: Prazo) => Promise<string>,
  op: OpcoesCadeia,
): Promise<{ text: string; provider: string }> {
  let chain = buildProviderChain(op.env ?? process.env);
  if (op.primeiro) chain = [op.primeiro, ...chain.filter((c) => c.provider !== op.primeiro!.provider)];
  const prazo = novoPrazo(op.prazoMs ?? PRAZO_TOTAL_MS);
  const falhas: string[] = [];
  for (const base of chain) {
    if (prazo.restanteMs() < MIN_RESTANTE_MS) { falhas.push(`${base.provider}=prazo`); continue; }
    const cfg = op.ajustar ? op.ajustar(base) : base;
    try {
      return { text: await fn(cfg, prazo), provider: cfg.provider };
    } catch (err) {
      // Nunca logar a chave nem o conteúdo das mensagens — só provedor e status.
      const codigo = (err as { codigo?: string } | undefined)?.codigo;
      const status = (err as { status?: number } | undefined)?.status ?? 'rede';
      console.warn(`[${op.label}] provedor ${cfg.provider} falhou (status ${status}${codigo ? `, código ${codigo}` : ''})`);
      falhas.push(`${cfg.provider}=${status}`);
    }
  }
  console.warn(`[${op.label}] cadeia inteira falhou: ${falhas.join(',') || 'nenhum provedor configurado'}`);
  throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: AI_INDISPONIVEL });
}
