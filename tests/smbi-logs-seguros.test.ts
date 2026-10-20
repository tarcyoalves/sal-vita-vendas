import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('rotas SMBI não logam o objeto de erro cru', () => {
  for (const f of ['server/smbiRoutes.ts', 'server/smbiCadastroRoutes.ts']) {
    const src = readFileSync(f, 'utf8');
    it(`${f}: todo console.error/warn com err passa por safeErr`, () => {
      const linhas = src.split('\n').filter((l) => /console\.(error|warn)\(/.test(l) && /\berr\b/.test(l));
      expect(linhas.length).toBeGreaterThan(0);
      for (const l of linhas) expect(l).toMatch(/safeErr\(err\)/);
      expect(src).not.toMatch(/console\.(error|warn)\([^)]*,\s*err\)/);
      expect(src).toMatch(/import \{ safeErr \} from '\.\/lib\/logSafe'/);
    });
  }
});
