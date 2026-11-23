import { safeEqual } from './safeEqual';

/**
 * /api/db-stats: aceita CRON_SECRET (preferido). ADMIN_RESET_SECRET continua valendo por enquanto
 * (compatibilidade temporária, com aviso no log) — esse segredo é de recuperação de emergência de senha
 * de admin e não deve ser usado em monitoramento.
 */
export function autorizarDbStats(
  provided: unknown, secrets: { cron?: string; legado?: string },
): 'cron' | 'legado' | null {
  if (typeof provided !== 'string' || provided === '') return null;
  if (secrets.cron && safeEqual(provided, secrets.cron)) return 'cron';
  if (secrets.legado && safeEqual(provided, secrets.legado)) return 'legado';
  return null;
}
