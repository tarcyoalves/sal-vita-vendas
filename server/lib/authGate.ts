// Regras puras de acesso usadas por createContext/protectedProcedure (testáveis sem banco).

// Únicas procedures liberadas enquanto users.mustChangePassword = true:
// as que o próprio fluxo de troca de senha do AppShell usa.
const MUST_CHANGE_PASSWORD_ALLOWED = new Set([
  'auth.me',
  'auth.logout',
  'auth.changePassword',
  'auth.forceChangePassword',
]);

/** Atendente desativado (sellers.status='inactive') perde o acesso; admin nunca é barrado por isso. */
export function isSellerBlocked(role: string, sellerStatus: string | null | undefined): boolean {
  return role !== 'admin' && sellerStatus === 'inactive';
}

/** false = bloquear com FORBIDDEN 'Troque a senha para continuar'. */
export function canProceed(user: { mustChangePassword?: boolean | null }, path: string): boolean {
  if (!user.mustChangePassword) return true;
  return MUST_CHANGE_PASSWORD_ALLOWED.has(path);
}
