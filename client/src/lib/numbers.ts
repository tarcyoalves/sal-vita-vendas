// Pequenos helpers numéricos puros (testáveis) para impedir NaN/Infinity na tela e no payload.

/** parseInt que nunca devolve NaN: campo vazio/lixo cai em `fallback`. */
export function parseIntOr(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Valor de <input type="number"> controlado: NaN vira '' (campo vazio) em vez de "NaN". */
export function numberInputValue(n: number): number | '' {
  return Number.isFinite(n) ? n : '';
}

/** Razão a/b em % arredondada e limitada a [0, cap]; divisor 0/NaN → 0 (sem NaN nem Infinity). */
export function safePercent(done: number, goal: number, cap = 100): number {
  if (!Number.isFinite(done) || !Number.isFinite(goal) || goal <= 0) return 0;
  return Math.max(0, Math.min(Math.round((done / goal) * 100), cap));
}
