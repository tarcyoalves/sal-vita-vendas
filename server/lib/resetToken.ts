import { createHash } from 'node:crypto';

// Token de redefinição de senha: o link do e-mail leva o token em claro, mas o BANCO guarda só o SHA-256
// (um vazamento da tabela não entrega links utilizáveis). O prefixo `sha256:` distingue o formato novo do
// legado (token em claro, 64 hex): sem ele, o hash vazado poderia ser apresentado como se fosse um token legado.
// Transição: tokens antigos em claro continuam válidos até expirar (30 min); depois disso este prefixo é a única via.
export const PREFIXO_HASH_RESET = 'sha256:';

export function hashResetToken(token: string): string {
  return PREFIXO_HASH_RESET + createHash('sha256').update(token, 'utf8').digest('hex');
}
