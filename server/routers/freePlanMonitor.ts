import { router, adminProcedure } from '../trpc';
import { sql as sqlClient } from '../db/index';
import { cached } from '../lib/cache';
import { getUsage, getAccountLimits } from '../email/marketing';

async function fetchNeonApiMetrics() {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const from = startOfMonth.toISOString();
    const to = now.toISOString();

    const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };

    const [consumptionRes] = await Promise.all([
      fetch(`https://console.neon.tech/api/v2/consumption/projects/${projectId}/periods?from=${from}&to=${to}`, { headers }),
    ]);

    if (!consumptionRes.ok) return null;

    const consumptionData = await consumptionRes.json() as any;
    const periods = consumptionData?.periods ?? consumptionData?.data ?? [];
    const period = Array.isArray(periods) ? periods[0] : periods;

    const computeSeconds = period?.active_time_seconds ?? period?.compute_time_seconds ?? 0;
    const dataTransferBytes = period?.data_transfer_bytes ?? 0;
    const writtenDataBytes = period?.written_data_bytes ?? 0;

    const COMPUTE_LIMIT_HOURS = 100;
    const TRANSFER_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
    const HISTORY_LIMIT_BYTES = 30 * 1024 * 1024 * 1024;

    const computeHours = computeSeconds / 3600;
    const computePercent = Math.round((computeHours / COMPUTE_LIMIT_HOURS) * 1000) / 10;

    const transferPercent = Math.round((dataTransferBytes / TRANSFER_LIMIT_BYTES) * 1000) / 10;

    const historyPercent = Math.round((writtenDataBytes / HISTORY_LIMIT_BYTES) * 1000) / 10;

    return {
      compute: {
        hoursUsed: Math.round(computeHours * 10) / 10,
        hoursLimit: COMPUTE_LIMIT_HOURS,
        percent: computePercent,
        pretty: `${Math.round(computeHours * 10) / 10}h`,
        status: computePercent > 90 ? 'critical' as const : computePercent > 70 ? 'warning' as const : 'ok' as const,
      },
      transfer: {
        bytesUsed: dataTransferBytes,
        bytesLimit: TRANSFER_LIMIT_BYTES,
        percent: transferPercent,
        pretty: `${(dataTransferBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        prettyLimit: '5 GB',
        status: transferPercent > 90 ? 'critical' as const : transferPercent > 70 ? 'warning' as const : 'ok' as const,
      },
      history: {
        bytesUsed: writtenDataBytes,
        bytesLimit: HISTORY_LIMIT_BYTES,
        percent: historyPercent,
        pretty: `${(writtenDataBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`,
        prettyLimit: '30 GB',
        status: historyPercent > 90 ? 'critical' as const : historyPercent > 70 ? 'warning' as const : 'ok' as const,
      },
    };
  } catch {
    return null;
  }
}

export const freePlanMonitorRouter = router({
  overview: adminProcedure.query(async () => {
    return cached('freePlan:overview', 300_000, async () => {
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

      const [neonApiMetrics, emailAccounts] = await Promise.all([
        fetchNeonApiMetrics(),
        getUsage(),
      ]);

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

      const storageStatus = storagePercent > 90 ? 'critical' as const : storagePercent > 70 ? 'warning' as const : 'ok' as const;

      const worstNeonStatus = (() => {
        const statuses = [storageStatus];
        if (neonApiMetrics) {
          statuses.push(neonApiMetrics.compute.status, neonApiMetrics.transfer.status, neonApiMetrics.history.status);
        }
        if (statuses.includes('critical')) return 'critical' as const;
        if (statuses.includes('warning')) return 'warning' as const;
        return 'ok' as const;
      })();

      return {
        neon: {
          storageBytesUsed,
          storageLimitBytes: NEON_FREE_STORAGE_BYTES,
          storagePretty: dbSizeRow?.pretty ?? '??',
          storageLimitPretty: '512 MB',
          storagePercent,
          status: worstNeonStatus,
          tables: (tableRows ?? []).map(t => ({
            name: t.table,
            sizePretty: t.pretty,
            sizeBytes: Number(t.bytes),
            rows: t.rows,
          })),
          compute: neonApiMetrics?.compute ?? null,
          transfer: neonApiMetrics?.transfer ?? null,
          history: neonApiMetrics?.history ?? null,
          hasApiMetrics: !!neonApiMetrics,
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
