import { router, adminProcedure } from '../trpc';
import { sql as sqlClient } from '../db/index';
import { cached } from '../lib/cache';
import { getUsage, getAccountLimits } from '../email/marketing';

export const freePlanMonitorRouter = router({
  overview: adminProcedure.query(async () => {
    return cached('freePlan:overview', 120_000, async () => {
      const [dbSizeRow, tableRows] = await Promise.all([
        sqlClient`
          SELECT
            pg_database_size(current_database())::bigint AS bytes,
            pg_size_pretty(pg_database_size(current_database())) AS pretty
        ` as unknown as Promise<Array<{ bytes: number; pretty: string }>>,
        sqlClient`
          SELECT
            relname AS table,
            pg_total_relation_size(quote_ident(relname))::bigint AS bytes,
            pg_size_pretty(pg_total_relation_size(quote_ident(relname))) AS pretty,
            n_live_tup::int AS rows
          FROM pg_stat_user_tables
          ORDER BY pg_total_relation_size(quote_ident(relname)) DESC
          LIMIT 10
        ` as unknown as Promise<Array<{ table: string; bytes: number; pretty: string; rows: number }>>,
      ]);

      const NEON_FREE_STORAGE_BYTES = 512 * 1024 * 1024;
      const storageBytesUsed = Number(dbSizeRow?.bytes ?? 0);
      const storagePercent = Math.round((storageBytesUsed / NEON_FREE_STORAGE_BYTES) * 1000) / 10;

      const emailAccounts = await getUsage();
      const resendAccounts = emailAccounts.filter(a => a.provider === 'resend');
      const brevoAccounts = emailAccounts.filter(a => a.provider === 'brevo');

      const resendLimits = getAccountLimits('resend');
      const brevoLimits = getAccountLimits('brevo');

      const resendDailyUsed = resendAccounts.reduce((s, a) => s + a.sentToday, 0);
      const resendDailyLimit = resendAccounts.length * resendLimits.daily;
      const resendMonthlyUsed = resendAccounts.reduce((s, a) => s + a.sentThisMonth, 0);
      const resendMonthlyLimit = resendAccounts.length * resendLimits.monthly;

      const brevoDailyUsed = brevoAccounts.reduce((s, a) => s + a.sentToday, 0);
      const brevoDailyLimit = brevoAccounts.length * brevoLimits.daily;
      const brevoMonthlyUsed = brevoAccounts.reduce((s, a) => s + a.sentThisMonth, 0);
      const brevoMonthlyLimit = brevoAccounts.length * brevoLimits.monthly;

      return {
        neon: {
          storageBytesUsed,
          storageLimitBytes: NEON_FREE_STORAGE_BYTES,
          storagePretty: dbSizeRow?.pretty ?? '??',
          storageLimitPretty: '512 MB',
          storagePercent,
          status: storagePercent > 90 ? 'critical' as const : storagePercent > 70 ? 'warning' as const : 'ok' as const,
          tables: (tableRows ?? []).map(t => ({
            name: t.table,
            sizePretty: t.pretty,
            sizeBytes: Number(t.bytes),
            rows: t.rows,
          })),
        },
        vercel: {
          plan: 'Hobby',
          functionDuration: 60,
          bandwidthLimitGB: 100,
        },
        resend: {
          accounts: resendAccounts.length,
          dailyUsed: resendDailyUsed,
          dailyLimit: resendDailyLimit,
          dailyPercent: resendDailyLimit > 0 ? Math.round((resendDailyUsed / resendDailyLimit) * 1000) / 10 : 0,
          monthlyUsed: resendMonthlyUsed,
          monthlyLimit: resendMonthlyLimit,
          monthlyPercent: resendMonthlyLimit > 0 ? Math.round((resendMonthlyUsed / resendMonthlyLimit) * 1000) / 10 : 0,
          status: (resendMonthlyLimit > 0 && (resendMonthlyUsed / resendMonthlyLimit) > 0.9) ? 'critical' as const
            : (resendMonthlyLimit > 0 && (resendMonthlyUsed / resendMonthlyLimit) > 0.7) ? 'warning' as const : 'ok' as const,
        },
        brevo: {
          accounts: brevoAccounts.length,
          dailyUsed: brevoDailyUsed,
          dailyLimit: brevoDailyLimit,
          dailyPercent: brevoDailyLimit > 0 ? Math.round((brevoDailyUsed / brevoDailyLimit) * 1000) / 10 : 0,
          monthlyUsed: brevoMonthlyUsed,
          monthlyLimit: brevoMonthlyLimit,
          monthlyPercent: brevoMonthlyLimit > 0 ? Math.round((brevoMonthlyUsed / brevoMonthlyLimit) * 1000) / 10 : 0,
          status: (brevoMonthlyLimit > 0 && (brevoMonthlyUsed / brevoMonthlyLimit) > 0.9) ? 'critical' as const
            : (brevoMonthlyLimit > 0 && (brevoMonthlyUsed / brevoMonthlyLimit) > 0.7) ? 'warning' as const : 'ok' as const,
        },
      };
    });
  }),
});
