// Filtro "abertas há mais de N anos": a base guarda a data de início como texto YYYY-MM-DD,
// então comparar como texto equivale a comparar datas.

/** Data-limite (YYYY-MM-DD): abertas nesta data ou antes têm pelo menos `anos` anos. */
export function dataLimiteAbertura(hoje: Date, anos: number): string {
  const d = new Date(Date.UTC(hoje.getUTCFullYear() - anos, hoje.getUTCMonth(), hoje.getUTCDate()));
  // 29/02 vira 01/03 em ano não bissexto; recua para o último dia de fevereiro.
  if (d.getUTCMonth() !== hoje.getUTCMonth()) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
