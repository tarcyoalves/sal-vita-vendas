// Utilitários dos scripts de seed/manutenção (rodam à mão, só em dev/local).
import { randomInt } from 'crypto';

/** Mensagem de recusa quando o script roda em produção; null = pode rodar. */
export function seedRefusal(nodeEnv: string | undefined): string | null {
  return nodeEnv === 'production'
    ? 'Recusado: este script não roda com NODE_ENV=production (use o fluxo de troca de senha do admin).'
    : null;
}

/** Senha da variável de ambiente ou, se ausente, uma aleatória (impressa uma única vez). */
export function seedPassword(fromEnv: string | undefined): { password: string; generated: boolean } {
  if (fromEnv && fromEnv.length >= 8) return { password: fromEnv, generated: false };
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return { password: Array.from({ length: 16 }, () => chars[randomInt(chars.length)]).join(''), generated: true };
}
