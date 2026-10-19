// Erros de banco nunca podem chegar à tela com o texto bruto (inclui o SQL inteiro e parâmetros, ex.: e-mail digitado).
// Mensagens do próprio sistema (TRPCError com texto nosso) passam; só mascaramos o que vem do driver/Drizzle.

const PADROES_QUOTA = [/exceeded the quota/i, /HTTP status 402/i, /compute time quota/i, /data transfer quota/i];

export function ehErroDeCotaDoBanco(msg: string): boolean {
  return PADROES_QUOTA.some((p) => p.test(msg));
}

/** Texto seguro para o usuário quando `msg` parece erro do banco; null quando a mensagem pode ir como está. */
export function mensagemSeguraDeBanco(msg: string, causa?: string): string | null {
  const alvo = `${msg} ${causa ?? ''}`;
  if (ehErroDeCotaDoBanco(alvo)) {
    return 'O banco de dados do sistema atingiu o limite do plano e está bloqueado. Avise o administrador (Neon: Billing/Usage).';
  }
  if (/^Failed query:/i.test(msg) || /\bparams:/i.test(msg) || /NeonDbError|ECONNREFUSED|fetch failed/i.test(alvo)) {
    return 'Falha temporária ao acessar o banco de dados. Tente novamente em instantes.';
  }
  return null;
}
