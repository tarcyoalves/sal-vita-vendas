// Manifesto de produção sem localhost (achado 09): o que vai no dist/ e no zip não pode liberar localhost nem 127.0.0.1 em
// host_permissions, optional_host_permissions, content_scripts nem externally_connectable. O desenvolvimento acrescenta o
// localhost só no build `--mode development` (npm run build:dev), a partir de dev/manifest.dev.json.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error módulo .mjs de ferramenta (sem tipos)
import { enderecosLocais, gerarManifesto } from '../dev/manifesto.mjs';

const RAIZ = join(__dirname, '..');
const lerJson = (...p: string[]) => JSON.parse(readFileSync(join(RAIZ, ...p), 'utf8')) as Record<string, any>;
const base = lerJson('public', 'manifest.json');
const extra = lerJson('dev', 'manifest.dev.json');

describe('manifesto de produção', () => {
  it('public/manifest.json (a base do dist/ e do zip) não tem localhost nem 127.0.0.1 em lugar nenhum', () => {
    expect(enderecosLocais(base)).toEqual([]);
    const textos = JSON.stringify([base.host_permissions, base.optional_host_permissions ?? [], base.externally_connectable, base.content_scripts]);
    expect(textos).not.toMatch(/localhost|127\.0\.0\.1/i);
    expect(base.host_permissions).toContain('https://lembretes.salvitarn.com.br/*');
    expect(base.externally_connectable.matches).toEqual(['https://lembretes.salvitarn.com.br/*']);
  });

  it('gerarManifesto de produção devolve a base e RECUSA (build falha) se alguém reintroduzir um endereço local', () => {
    expect(gerarManifesto(base, false)).toEqual(base);
    for (const suja of [
      { ...base, host_permissions: [...base.host_permissions, 'http://localhost/*'] },
      { ...base, optional_host_permissions: ['http://127.0.0.1/*'] },
      { ...base, externally_connectable: { matches: ['http://localhost:5173/*'] } },
      { ...base, content_scripts: [{ matches: ['http://localhost/*'], js: ['content.js'] }] },
    ]) {
      expect(() => gerarManifesto(suja, false)).toThrow(/endereço local/);
    }
  });

  it('o desenvolvimento acrescenta o localhost (e marca o nome), sem alterar a base nem a lista de produção', () => {
    const dev = gerarManifesto(base, true, extra);
    expect(dev.name).toMatch(/\(dev\)$/);
    expect(dev.optional_host_permissions).toEqual(['http://localhost/*']);
    expect(dev.externally_connectable.matches).toEqual(['https://lembretes.salvitarn.com.br/*', 'http://localhost:5173/*']);
    expect(dev.host_permissions).toEqual(base.host_permissions);
    expect(dev.version).toBe(base.version); // a versão nunca muda por causa do modo
    expect(enderecosLocais(base)).toEqual([]); // a base não foi mutada
    expect(enderecosLocais(dev).length).toBeGreaterThan(0);
  });

  it('o que o vite escreve no dist/manifest.json de produção não tem localhost (confere se o dist/ existe e não é de desenvolvimento)', () => {
    const caminho = join(RAIZ, 'dist', 'manifest.json');
    if (!existsSync(caminho)) return; // sem build feito, a conferência acima (função + base) é a garantia
    const dist = JSON.parse(readFileSync(caminho, 'utf8')) as Record<string, any>;
    if (String(dist.name).endsWith('(dev)')) return; // dist/ de build:dev
    expect(enderecosLocais(dist)).toEqual([]);
    expect(dist).toEqual(base);
  });

  it('o vite.config.ts liga o manifesto ao modo: só "development" recebe o localhost; o content script não recopia o public/', () => {
    const cfg = readFileSync(join(RAIZ, 'vite.config.ts'), 'utf8');
    expect(cfg).toContain("mode === 'development'");
    expect(readFileSync(join(RAIZ, 'vite.content.config.ts'), 'utf8')).toContain('publicDir: false');
    const pacote = lerJson('package.json');
    expect(pacote.scripts.build).not.toMatch(/development/);
    expect(pacote.scripts['build:dev']).toMatch(/--mode development.*--mode development/);
    expect(pacote.scripts.publicar).toMatch(/^npm run build /);
  });
});
