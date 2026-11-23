/**
 * Texto de erro para mostrar ao atendente. Usa a mensagem que o servidor mandou (tRPC) quando ela é legível;
 * erro de rede vira uma frase em português; o que não dá para mostrar cai no texto padrão da tela.
 */
const REDE = /failed to fetch|networkerror|load failed|network request failed|fetch failed/i;

export function mensagemDoServidor(erro: unknown, padrao: string): string {
  const bruta = erro instanceof Error ? erro.message : typeof (erro as { message?: unknown } | null)?.message === 'string' ? (erro as { message: string }).message : '';
  const msg = bruta.trim();
  if (!msg) return padrao;
  if (REDE.test(msg)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  // Erro de validação (zod) chega como JSON: [{"message":"..."}]. Mostra só a primeira frase.
  if (msg.startsWith('[') || msg.startsWith('{')) {
    try {
      const j = JSON.parse(msg) as unknown;
      const primeiro = Array.isArray(j) ? j[0] : j;
      const m = (primeiro as { message?: unknown } | null)?.message;
      return typeof m === 'string' && m.trim() ? m.trim() : padrao;
    } catch {
      return padrao;
    }
  }
  return msg.length > 300 ? `${msg.slice(0, 297)}…` : msg;
}
