import { timingSafeEqual } from 'crypto';

/**
 * Compara dois segredos em tempo constante. Comprimentos diferentes nunca batem
 * (o tamanho não é segredo, e `timingSafeEqual` exige buffers do mesmo tamanho).
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
