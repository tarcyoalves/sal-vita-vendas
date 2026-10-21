// Teste de CÓDIGO-FONTE: o acesso aos dados do CRM passa por UMA interface (RepositorioContatos).
// Só o RepositorioLocal fala com chrome.storage; a UI (WhatsApp, painel, service worker) não.
// Se este teste falhar, NÃO libere a exceção: mova o acesso para o repositório.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..');
const SRC = join(RAIZ, 'src');

function listar(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listar(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const arquivos = listar(SRC).map((p) => ({ caminho: relative(RAIZ, p).replace(/\\/g, '/'), codigo: semComentarios(readFileSync(p, 'utf8')) }));
const usam = (re: RegExp) => arquivos.filter((a) => re.test(a.codigo)).map((a) => a.caminho);

describe('acesso a dados só pelo repositório', () => {
  it('encontrou os arquivos-fonte (sanidade)', () => {
    expect(arquivos.map((a) => a.caminho)).toContain('src/shared/repositorio-local.ts');
    expect(arquivos.map((a) => a.caminho)).toContain('src/shared/repositorio.ts');
  });

  it('chrome.storage só aparece no RepositorioLocal', () => {
    expect(usam(/chrome\s*\.\s*storage|chrome\[['"]storage['"]\]/)).toEqual(['src/shared/repositorio-local.ts']);
  });

  it('nenhum outro armazenamento do navegador guarda dados do CRM (localStorage só nas preferências do painel)', () => {
    expect(usam(/\blocalStorage\b|\bsessionStorage\b/)).toEqual(['src/sidepanel/preferencias.ts']);
    expect(usam(/\bindexedDB\b/)).toEqual([]); // o IndexedDB das campanhas vai pela biblioteca idb (banco.ts)
  });

  it('a interface não depende da implementação (nem do chrome)', () => {
    const iface = arquivos.find((a) => a.caminho === 'src/shared/repositorio.ts')?.codigo ?? '';
    expect(iface).not.toMatch(/repositorio-local|\bchrome\b/);
    // os métodos de dados são assíncronos (outro adaptador pode ir à rede)
    const metodos = [...iface.matchAll(/^\s{2}(\w+)\(.*\):\s*(.+);$/gm)].filter((m) => m[1] !== 'aoMudar');
    expect(metodos.length).toBeGreaterThan(20);
    for (const m of metodos) expect(m[2], `${m[1]} deve devolver Promise`).toMatch(/^Promise</);
  });

  it('a UI importa o repositório pela interface (o RepositorioLocal só é criado em repositorioPadrao)', () => {
    const usamLocal = usam(/from '[./]*(?:shared\/)?repositorio-local'/);
    // permitido: ponto de entrada de cada contexto (página, service worker, painel)
    expect(usamLocal.sort()).toEqual(['src/background/lembretes.ts', 'src/background/service-worker.ts', 'src/content/crm/index.ts', 'src/sidepanel/crm.ts']);
  });
});
