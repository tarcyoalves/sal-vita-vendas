// Número interno do pedido no CRM ("PED-123"): sequencial, gerado pelo banco, só leitura.
export const rotuloNumeroCrm = (n: number | null | undefined): string => (n ? `PED-${n}` : '--');

/** Busca por número: "123", "ped123", "PED-123" ou "#123". Só acha se o texto for (quase) só o número. */
export function casaNumeroCrm(n: number | null | undefined, consulta: string): boolean {
  if (!n) return false;
  const m = consulta.trim().toLowerCase().match(/^(?:ped|crm)?[\s#-]*(\d{1,9})$/);
  return !!m && Number(m[1]) === n;
}
