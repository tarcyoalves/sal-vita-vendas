// Leitura e gravação das configurações do Sales AI (tabela sales_settings, banco do Premium).
// Valor ausente ou inválido → padrão de shared/sales.ts (nunca quebra a tela nem o envio).
// Os padrões são os SEGUROS: modo DRY_RUN, canal desligado, agente desligado.
import { eq, inArray } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import { salesSettings } from '../../db/schema';
import { SALES_SETTINGS_SCHEMAS, type SalesSettingKey, type SalesSettings } from '../../../shared/sales';

import { SALES_SETTING_KEYS, interpretarSetting } from './settingsPuro';

export { SALES_SETTING_KEYS, interpretarSetting };

export async function getSalesSettings(): Promise<SalesSettings> {
  const rows = await ordersDb.select().from(salesSettings).where(inArray(salesSettings.key, SALES_SETTING_KEYS));
  const porChave = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SalesSettingKey, unknown>;
  for (const k of SALES_SETTING_KEYS) out[k] = interpretarSetting(k, porChave.get(k));
  return out as SalesSettings;
}

export async function getSalesSetting<K extends SalesSettingKey>(key: K): Promise<SalesSettings[K]> {
  const [row] = await ordersDb.select().from(salesSettings).where(eq(salesSettings.key, key)).limit(1);
  return interpretarSetting(key, row?.value);
}

let geracaoLocal = 0;
/**
 * Sobe a cada gravação feita NESTA instância. Quem guarda as configurações em cache (ex.: `GET
 * /api/sales/modo`) compara e descarta o cache na hora. Gravação feita em OUTRA instância só aparece
 * quando o cache vence.
 */
export function geracaoSettingsLocal(): number {
  return geracaoLocal;
}

/** Grava uma chave (valida antes). `por` vai para a auditoria e para updated_by. */
export async function setSalesSetting<K extends SalesSettingKey>(key: K, value: SalesSettings[K], por: string): Promise<SalesSettings[K]> {
  const parsed = SALES_SETTINGS_SCHEMAS[key].parse(value) as SalesSettings[K];
  await ordersDb.insert(salesSettings)
    .values({ key, value: parsed, updatedAt: new Date(), updatedBy: por })
    .onConflictDoUpdate({ target: salesSettings.key, set: { value: parsed, updatedAt: new Date(), updatedBy: por } });
  geracaoLocal += 1;
  return parsed;
}
