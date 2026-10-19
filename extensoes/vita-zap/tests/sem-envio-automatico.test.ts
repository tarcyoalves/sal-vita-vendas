// Teste de CÓDIGO-FONTE: a extensão não pode ter nada que envie mensagem sozinha.
//
// Envio automático pelo WhatsApp Web viola os Termos do WhatsApp e arrisca o banimento do
// número (docs/PLANO-CAMPANHAS-WHATSAPP.md, seção 6). O envio é SEMPRE o Enter do usuário.
// Se este teste falhar, NÃO "ajuste o teste": remova o código que dispara o envio.

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

/** Remove comentários (// e /* *\/) para checar só código. Strings ficam. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const arquivos = listar(SRC).map((p) => ({ caminho: relative(RAIZ, p).replace(/\\/g, '/'), codigo: semComentarios(readFileSync(p, 'utf8')) }));
const conteudo = arquivos.filter((a) => a.caminho.startsWith('src/content/'));

function ocorrencias(re: RegExp, lista = arquivos): string[] {
  return lista.filter((a) => re.test(a.codigo)).map((a) => a.caminho);
}

describe('nenhum código dispara o envio', () => {
  it('encontrou os arquivos-fonte (sanidade do teste)', () => {
    expect(arquivos.length).toBeGreaterThan(10);
    expect(conteudo.map((a) => a.caminho)).toContain('src/content/execucao.ts');
  });

  it('nenhum evento de teclado é criado ou disparado em lugar nenhum', () => {
    expect(ocorrencias(/KeyboardEvent|InputEvent|initKeyEvent|keyCode|charCode|\bwhich\s*:/)).toEqual([]);
  });

  it('content script não fala em Enter, keydown/keyup/keypress', () => {
    expect(ocorrencias(/['"`]Enter['"`]|keydown|keyup|keypress|beforeinput/i, conteudo)).toEqual([]);
  });

  it('nenhum seletor/menção ao botão de enviar no content script', () => {
    // Tira as APIs do Chrome (sendMessage/sendResponse) e procura "send"/"enviar".
    const achados = conteudo
      .filter((a) => /send|enviar/i.test(a.codigo.replace(/\bsendMessage\b|\bsendResponse\b/g, '')))
      .map((a) => a.caminho);
    expect(achados).toEqual([]);
  });

  it('nenhum .click() programático, submit ou requestSubmit', () => {
    expect(ocorrencias(/\.click\s*\(|\.submit\s*\(|requestSubmit/)).toEqual([]);
  });

  it('dispatchEvent só em dom.ts (evento "input" de campo) e abrir-conversa.ts (clique na linha da lista)', () => {
    expect(ocorrencias(/dispatchEvent\s*\(/).sort()).toEqual(['src/content/abrir-conversa.ts', 'src/content/dom.ts']);
    const dom = arquivos.find((a) => a.caminho === 'src/content/dom.ts')?.codigo ?? '';
    const chamadas = dom.match(/dispatchEvent\s*\([^)]*\)/g) ?? [];
    expect(chamadas.length).toBeGreaterThan(0);
    for (const c of chamadas) expect(c).toMatch(/^dispatchEvent\(new Event\('input'/);
  });

  it('MouseEvent só em abrir-conversa.ts, e abrir-conversa só é usado para abrir a conversa achada na lista', () => {
    expect(ocorrencias(/MouseEvent|PointerEvent/)).toEqual(['src/content/abrir-conversa.ts']);
    expect(ocorrencias(/from '\.\/abrir-conversa'|from "\.\/abrir-conversa"/)).toEqual(['src/content/execucao.ts']);
    const execucao = arquivos.find((a) => a.caminho === 'src/content/execucao.ts')?.codigo ?? '';
    expect(execucao.match(/abrirLinhaDaLista\(([^)]*)\)/g)).toEqual(['abrirLinhaDaLista(candidatas[0])']);
    const abrir = arquivos.find((a) => a.caminho === 'src/content/abrir-conversa.ts')?.codigo ?? '';
    expect(abrir).not.toMatch(/footer|caixaMensagem|querySelector|encontrar/);
  });

  it('execCommand só para inserir/apagar texto (nada de quebra de linha/parágrafo)', () => {
    const usos = arquivos.flatMap((a) => a.codigo.match(/execCommand\s*\(\s*['"][^'"]+['"]/g) ?? []);
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u).toMatch(/execCommand\('(insertText|delete)'/);
  });

  it('sem injeção de código nem APIs que geram teclas reais', () => {
    expect(ocorrencias(/chrome\.debugger|\beval\s*\(|new Function\s*\(|chrome\.input\b/)).toEqual([]);
    // chrome.scripting só para reinjetar o próprio content.js (aba aberta antes da instalação).
    expect(ocorrencias(/chrome\.scripting/)).toEqual(['src/sidepanel/whatsapp.ts']);
    const wa = arquivos.find((a) => a.caminho === 'src/sidepanel/whatsapp.ts')?.codigo ?? '';
    const usos = wa.match(/chrome\.scripting\.[a-zA-Z]+\([^)]*\)/g) ?? [];
    expect(usos).toEqual(["chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })"]);
  });

  it('o protocolo não tem pedido de envio', () => {
    const msgs = arquivos.find((a) => a.caminho === 'src/shared/mensagens.ts')?.codigo ?? '';
    const tipos = [...msgs.matchAll(/tipo: '([a-zA-Z:]+)'/g)].map((m) => m[1]);
    expect(tipos).toEqual(
      expect.arrayContaining(['verificar', 'varrer', 'abrirEColar', 'limparCaixa', 'pararObservacao']),
    );
    expect(tipos.filter((t) => /envi|send/i.test(t) && t !== 'vitaZap:envioDetectado')).toEqual([]);
  });

  it('manifesto não pede permissões que permitiriam digitar/enviar por fora', () => {
    const manifesto = JSON.parse(readFileSync(join(RAIZ, 'public/manifest.json'), 'utf8')) as { permissions?: string[]; host_permissions?: string[] };
    expect(manifesto.permissions ?? []).not.toEqual(expect.arrayContaining(['debugger']));
    for (const p of ['debugger', 'input', 'nativeMessaging']) expect(manifesto.permissions ?? []).not.toContain(p);
    expect(manifesto.host_permissions).toEqual(['https://web.whatsapp.com/*']);
  });
});

describe('o próprio teste pega violações (casos plantados)', () => {
  const amostras = [
    "el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))",
    "document.querySelector('[data-icon=\"send\"]').click()",
    "botao.click()",
    "form.requestSubmit()",
  ];
  it.each(amostras)('detecta: %s', (codigo) => {
    const pegou =
      /KeyboardEvent|InputEvent|keyCode/.test(codigo) || /\.click\s*\(|\.submit\s*\(|requestSubmit/.test(codigo) || /send/i.test(codigo);
    expect(pegou).toBe(true);
  });
});
