// @vitest-environment jsdom
//
// Painel lateral (achado 06): a tela de erro não pode usar `onclick=` inline nem innerHTML (a CSP das páginas de extensão
// bloqueia handlers inline). Aqui o React falha antes de montar e o botão "Recarregar painel" tem de funcionar por clique,
// Enter e Espaço, mesmo com o bloqueio global de Enter do painel.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/sidepanel/App', () => {
  throw new Error('falha de carregamento <img src=x onerror=alert(1)>');
});
vi.mock('../src/sidepanel/estilo.css', () => ({}));

import { codigoDeSuporte, exibirErroFatal } from '../src/sidepanel/erro-fatal';

let recarregou = 0;

beforeEach(() => {
  recarregou = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function montarPainelComFalha(): Promise<HTMLElement> {
  vi.resetModules();
  document.body.innerHTML = '<div id="raiz"></div>';
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fatal = await import('../src/sidepanel/erro-fatal'); // a mesma instância que o main.tsx vai usar
  fatal.acoes.recarregar = () => {
    recarregou += 1;
  };
  await import('../src/sidepanel/main');
  const raiz = document.getElementById('raiz')!;
  await vi.waitFor(() => expect(raiz.querySelector('button')).not.toBeNull());
  return raiz;
}

const teclar = (alvo: HTMLElement, key: string): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  alvo.dispatchEvent(ev);
  return ev;
};

describe('falha antes de montar o React', () => {
  it('mostra mensagem simples e código de suporte, sem despejar o erro nem interpretar HTML', async () => {
    const raiz = await montarPainelComFalha();
    expect(raiz.textContent).toContain('O painel do Vita Zap não abriu');
    expect(raiz.textContent).toMatch(/Código de suporte: VZ-[0-9A-F]{6}/);
    expect(raiz.querySelector('img')).toBeNull(); // o texto do erro nunca vira HTML
    expect(raiz.textContent).not.toContain('onerror');
    expect(raiz.querySelector('[onclick]')).toBeNull();
  });

  it('o botão recarrega por clique', async () => {
    const raiz = await montarPainelComFalha();
    raiz.querySelector('button')!.click();
    expect(recarregou).toBe(1);
  });

  it('o botão recarrega por Enter e por Espaço (e o Enter não é engolido pelo bloqueio global)', async () => {
    const raiz = await montarPainelComFalha();
    const botao = raiz.querySelector('button')!;
    expect(teclar(botao, 'Enter').defaultPrevented).toBe(true); // tratado, sem o clique nativo duplicado
    expect(recarregou).toBe(1);
    teclar(botao, ' ');
    expect(recarregou).toBe(2);
    teclar(botao, 'a');
    expect(recarregou).toBe(2);
  });

  it('o bloqueio global de Enter continua valendo para os outros botões do painel', async () => {
    await montarPainelComFalha();
    const outro = document.createElement('button');
    document.body.append(outro);
    expect(teclar(outro, 'Enter').defaultPrevented).toBe(true);
  });
});

describe('exibirErroFatal', () => {
  it('o código de suporte é estável e curto', () => {
    expect(codigoDeSuporte('x')).toBe(codigoDeSuporte('x'));
    expect(codigoDeSuporte('x')).not.toBe(codigoDeSuporte('y'));
    const raiz = document.createElement('div');
    expect(exibirErroFatal(raiz, 'x', () => undefined)).toBe(codigoDeSuporte('x'));
  });
});

describe('código do painel: nada de handler inline', () => {
  const arquivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|html)$/.test(n) ? [p] : [];
    });
  const todos = [...arquivos(join(__dirname, '../src/sidepanel')), join(__dirname, '../sidepanel.html')];

  it('nenhum arquivo do painel tem onclick= (atributo HTML) nem innerHTML com handler', () => {
    for (const f of todos) {
      const codigo = readFileSync(f, 'utf8');
      expect([f, /\bonclick\s*=\s*["'`]/i.test(codigo)]).toEqual([f, false]);
      expect([f, /innerHTML[^;\n]*\bon[a-z]+\s*=/i.test(codigo)]).toEqual([f, false]);
    }
  });

  it('o manifest não libera script inline na CSP', () => {
    const m = JSON.parse(readFileSync(join(__dirname, '../public/manifest.json'), 'utf8')) as { content_security_policy?: { extension_pages?: string } };
    expect(m.content_security_policy?.extension_pages ?? '').not.toMatch(/unsafe-inline|unsafe-eval/);
  });
});
