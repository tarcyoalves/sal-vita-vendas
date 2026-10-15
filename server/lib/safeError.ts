export const GENERIC_ERROR = 'Erro interno no servidor';

/** Mensagem segura para devolver ao cliente num 500: genérica em produção, detalhe só fora dela. */
export function safeErrorMessage(err: unknown, env: string | undefined = process.env.NODE_ENV): string {
  if (env === 'production') return GENERIC_ERROR;
  return err instanceof Error ? err.message : String(err);
}
