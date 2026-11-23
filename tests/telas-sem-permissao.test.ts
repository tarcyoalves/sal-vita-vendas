// Páginas admin não ficam em branco sem permissão: mostram AccessDenied (como Clientes e Faturamento).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('páginas admin sem permissão', () => {
  for (const [arq, area] of [['AdminDashboard', 'Painel do administrador'], ['Attendants', 'Atendentes']] as const) {
    it(`${arq} mostra AccessDenied em vez de return null`, () => {
      const f = readFileSync(`client/src/pages/${arq}.tsx`, 'utf8');
      expect(f).toContain(`<AccessDenied area="${area}" />`);
      expect(f).not.toMatch(/if \(!user \|\|[^\n]*\) return null;/);
    });
  }
});
