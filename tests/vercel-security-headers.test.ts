import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

type Route = { src?: string; headers?: Record<string, string>; continue?: boolean; has?: unknown };
const cfg = JSON.parse(readFileSync(join(__dirname, '..', 'vercel.json'), 'utf8')) as { routes: Route[] };

// Com `routes` definido, a Vercel IGNORA o array `headers` do vercel.json (verificado em produção em
// 15/10/2026: o CSP daquele array nunca chegou ao navegador). O que vale é o `headers` dentro da rota.
describe('cabeçalhos de segurança em vercel.json', () => {
  const rota = cfg.routes.find((r) => r.src === '/(.*)' && r.continue === true && r.headers);
  const h = rota?.headers ?? {};

  it('existe a rota catch-all com continue:true que aplica os cabeçalhos', () => {
    expect(rota).toBeDefined();
  });
  it('mantém os cabeçalhos básicos', () => {
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBeTruthy();
    expect(h['Permissions-Policy']).toContain('camera=()');
    expect(h['Strict-Transport-Security']).toMatch(/max-age=\d{7,}/);
  });
  it('CSP aplicado só com diretivas que não restringem script/estilo/imagem', () => {
    const csp = h['Content-Security-Policy'] ?? '';
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/(default|script|style|img|connect|font)-src/);
  });
  it('política completa em modo só-relatório cobre as origens usadas pelo código', () => {
    const ro = h['Content-Security-Policy-Report-Only'] ?? '';
    for (const origem of [
      'https://connect.facebook.net', // Meta Pixel
      'https://fonts.googleapis.com', // Google Fonts (CSS)
      'https://fonts.gstatic.com', // Google Fonts (arquivos)
      'https://salvitarn.com.br', // logo/fotos (WordPress)
      'https://viacep.com.br', // consulta de CEP no checkout
    ]) {
      expect(ro, origem).toContain(origem);
    }
  });
});
