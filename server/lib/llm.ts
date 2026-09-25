// Chamada de LLM com a mesma cadeia de fallback do chat (server/routers/ai.ts),
// reutilizável por outros routers. Implementação: subagente "IA" do Radar.
export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletion {
  text: string;
  provider: string;
}

export async function completeWithFallback(
  _messages: LlmMessage[],
  _opts: { maxTokens?: number; temperature?: number; label?: string } = {},
): Promise<LlmCompletion> {
  throw new Error('completeWithFallback: não implementado');
}
