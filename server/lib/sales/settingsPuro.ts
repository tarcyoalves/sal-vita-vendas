// Parte pura das configurações do Sales AI (sem banco): importável por testes e pelo cliente.
import {
  SALES_SETTINGS_DEFAULTS, SALES_SETTINGS_SCHEMAS, type SalesSettingKey, type SalesSettings,
} from '../../../shared/sales';

export const SALES_SETTING_KEYS = Object.keys(SALES_SETTINGS_SCHEMAS) as SalesSettingKey[];

/** Valida um valor bruto do banco; inválido → padrão (nunca quebra a tela nem o envio). */
export function interpretarSetting<K extends SalesSettingKey>(key: K, bruto: unknown): SalesSettings[K] {
  if (bruto === undefined || bruto === null) return SALES_SETTINGS_DEFAULTS[key];
  const r = SALES_SETTINGS_SCHEMAS[key].safeParse(bruto);
  if (r.success) return r.data as SalesSettings[K];
  console.warn(`[sales-settings] valor inválido em "${key}" — usando o padrão`);
  return SALES_SETTINGS_DEFAULTS[key];
}
