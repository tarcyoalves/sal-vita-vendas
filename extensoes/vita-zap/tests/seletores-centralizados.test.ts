// Seletores do WhatsApp Web ficam SÓ em src/content/selectors.ts (e os do envio automático, isolados em
// envio-humano.ts). Este teste falha se alguém voltar a escrever querySelector/closest/matches com um
// seletor do WhatsApp em outro arquivo do content script.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..', 'src', 'content');
const PERMITIDOS = new Set(['selectors.ts', 'envio-humano.ts']);
// Marcas típicas do HTML do WhatsApp (ids fixos, classes de mensagem, data-*, aria/title).
const DO_WHATSAPP = /#main|#side|#pane-side|#app\b|message-(in|out)|data-testid|data-icon|data-id|data-tab|aria-label|\[title|selectable-text|copyable-text|contenteditable/;
const CHAMADA = /\.(querySelector(?:All)?|closest|matches)\(\s*(['"`])((?:(?!\2).)*)\2/g;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('seletores centralizados', () => {
  it('nenhum seletor do WhatsApp fora de selectors.ts', () => {
    const achados: string[] = [];
    for (const f of arquivos(RAIZ)) {
      const rel = relative(RAIZ, f);
      if (PERMITIDOS.has(rel)) continue;
      for (const m of readFileSync(f, 'utf8').matchAll(CHAMADA)) if (DO_WHATSAPP.test(m[3])) achados.push(`${rel}: ${m[0]}`);
    }
    expect(achados).toEqual([]);
  });
});
