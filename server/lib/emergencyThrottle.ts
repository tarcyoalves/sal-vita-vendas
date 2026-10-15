/**
 * Limite de tentativas do emergencyReset. Duas chaves por tentativa: IP+e-mail e só e-mail.
 * Girar o cabeçalho de IP não zera a chave do e-mail; sem e-mail usa-se uma chave global.
 */
interface Entry { count: number; blockedUntil: number }

export function createEmergencyThrottle(now: () => number = Date.now) {
  const map = new Map<string, Entry>();
  const keys = (ip: string, email: string) => {
    const e = email.trim().toLowerCase();
    return e ? [`ip:${ip}|${e}`, `email:${e}`] : ['global'];
  };
  return {
    isBlocked(ip: string, email: string): boolean {
      return keys(ip, email).some(k => (map.get(k)?.blockedUntil ?? 0) > now());
    },
    fail(ip: string, email: string): void {
      for (const k of keys(ip, email)) {
        const prev = map.get(k) ?? { count: 0, blockedUntil: 0 };
        prev.count++;
        prev.blockedUntil = now() + Math.min(prev.count * 30_000, 300_000);
        map.set(k, prev);
      }
    },
    // Só zera a chave IP+e-mail: o contador do e-mail sobrevive a um acerto, como antes.
    succeed(ip: string, email: string): void {
      map.delete(keys(ip, email)[0]);
    },
  };
}
