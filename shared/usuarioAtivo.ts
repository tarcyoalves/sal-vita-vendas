/**
 * Decisão pura de "usuário ativo" (economia de CU do Neon): só faz polling quem está de fato na
 * tela. Ativo = houve mouse/teclado/toque/scroll/foco nos últimos 10 min E a aba está visível.
 * Aba esquecida aberta NÃO mantém o banco acordado. Sem I/O.
 */
export const INATIVIDADE_LIMITE_MS = 10 * 60_000;

export function usuarioAtivo(
  ultimaAtividadeMs: number,
  agoraMs: number,
  abaVisivel: boolean,
  limiteMs: number = INATIVIDADE_LIMITE_MS,
): boolean {
  if (!abaVisivel) return false;
  if (!Number.isFinite(ultimaAtividadeMs)) return false;
  return agoraMs - ultimaAtividadeMs <= limiteMs;
}

/** Queries refeitas ao voltar de inativo para ativo (um refetch imediato; só as já montadas). */
export const QUERIES_REFETCH_AO_REATIVAR: readonly string[] = [
  'faturamento.pendingApproval',
  'tasks.deletionLogs',
  'tasks.reminders',
  'tasks.list',
  'workSessions.current',
  'faturamento.smbiRoboStatus',
];
