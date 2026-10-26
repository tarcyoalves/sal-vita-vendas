// Teste de CÓDIGO-FONTE: envio humano automático isolado e controlado (pedido do dono em 22/10/2026).
//
// O envio automático é isolado e restrito exclusivamente a `src/content/envio-humano.ts`.
// Nenhum outro arquivo da extensão pode conter cliques ou eventos de envio não autorizados.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sortearPausaHumana } from '../src/content/envio-humano';

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

describe('envio humano controlado e isolado', () => {
  it('encontrou os arquivos-fonte (sanidade do teste)', () => {
    expect(arquivos.length).toBeGreaterThan(10);
    expect(conteudo.map((a) => a.caminho)).toContain('src/content/execucao.ts');
    expect(conteudo.map((a) => a.caminho)).toContain('src/content/envio-humano.ts');
  });

  it('nenhum evento de teclado fora de envio-humano.ts', () => {
    expect(ocorrencias(/KeyboardEvent|InputEvent|initKeyEvent|keyCode|charCode|\bwhich\s*:/)).toEqual(['src/content/envio-humano.ts']);
  });

  it('content script não fala em Enter fora de envio-humano.ts', () => {
    expect(ocorrencias(/['"`]Enter['"`]|keydown|keyup|keypress|beforeinput/i, conteudo)).toEqual(['src/content/envio-humano.ts']);
  });

  it('menção ao envio no content script só em envio-humano.ts e execucao.ts (chamada controlada)', () => {
    const achados = conteudo
      .filter((a) => /send|enviar/i.test(a.codigo.replace(/\bsendMessage\b|\bsendResponse\b/g, '')))
      .map((a) => a.caminho);
    expect(achados.sort()).toEqual(['src/content/envio-humano.ts', 'src/content/execucao.ts']);
  });

  it('.click() programático restrito a envio-humano.ts', () => {
    expect(ocorrencias(/\.click\s*\(|\.submit\s*\(|requestSubmit/)).toEqual(['src/content/envio-humano.ts']);
  });

  it('dispatchEvent restrito a dom.ts, abrir-conversa.ts e envio-humano.ts', () => {
    expect(ocorrencias(/dispatchEvent\s*\(/).sort()).toEqual([
      'src/content/abrir-conversa.ts',
      'src/content/dom.ts',
      'src/content/envio-humano.ts',
    ]);
  });

  it('MouseEvent/PointerEvent só em abrir-conversa.ts e envio-humano.ts', () => {
    expect(ocorrencias(/MouseEvent|PointerEvent/).sort()).toEqual([
      'src/content/abrir-conversa.ts',
      'src/content/envio-humano.ts',
    ]);
  });

  it('execCommand só para inserir/apagar texto (nada de quebra de linha/parágrafo)', () => {
    const usos = arquivos.flatMap((a) => a.codigo.match(/execCommand\s*\(\s*['"][^'"]+['"]/g) ?? []);
    expect(usos.length).toBeGreaterThan(0);
    for (const u of usos) expect(u).toMatch(/execCommand\('(insertText|delete)'/);
  });

  it('sem injeção de código nem APIs que geram teclas reais', () => {
    expect(ocorrencias(/chrome\.debugger|\beval\s*\(|new Function\s*\(|chrome\.input\b/)).toEqual([]);
    expect(ocorrencias(/chrome\.scripting/)).toEqual(['src/sidepanel/whatsapp.ts']);
  });

  it('manifesto não pede permissões de debugger nem de automação externa', () => {
    const manifesto = JSON.parse(readFileSync(join(RAIZ, 'public/manifest.json'), 'utf8')) as { permissions?: string[]; host_permissions?: string[] };
    expect(manifesto.permissions ?? []).not.toEqual(expect.arrayContaining(['debugger']));
    for (const p of ['debugger', 'input', 'nativeMessaging']) expect(manifesto.permissions ?? []).not.toContain(p);
    expect(manifesto.host_permissions).toEqual(['https://web.whatsapp.com/*']);
  });

  it('sortearPausaHumana gera pausa segura maior ou igual a 2000ms', () => {
    for (let i = 0; i < 20; i++) {
      const p = sortearPausaHumana();
      expect(p).toBeGreaterThanOrEqual(2200);
      expect(p).toBeLessThanOrEqual(3800);
    }
  });
});

describe('cliques permitidos em abrir-conversa.ts (v0.7.21): só abrir conversa e ler o telefone dos Dados do contato', () => {
  const abrir = arquivos.find((a) => a.caminho === 'src/content/abrir-conversa.ts')!.codigo;
  const exportadas = [...abrir.matchAll(/export function (\w+)/g)].map((m) => m[1]).sort();

  it('o arquivo expõe exatamente três funções de clique, nenhuma com nome ou alvo de envio', () => {
    expect(exportadas).toEqual(['abrirLinhaDaLista', 'abrirPainelDadosDoContato', 'fecharPainelDadosDoContato']);
    expect(abrir).not.toMatch(/send|enviar|submit|footer|caixaMensagem|microfone|Enter/i);
  });

  it('só dados-do-contato.ts clica no cabeçalho e no X do painel; só abrir-por-telefone.ts e execucao.ts abrem linhas da lista', () => {
    const usa = (nome: string) => arquivos.filter((a) => a.caminho !== 'src/content/abrir-conversa.ts' && new RegExp(`\\b${nome}\\b`).test(a.codigo)).map((a) => a.caminho).sort();
    expect(usa('abrirPainelDadosDoContato')).toEqual(['src/content/crm/dados-do-contato.ts']);
    expect(usa('fecharPainelDadosDoContato')).toEqual(['src/content/crm/dados-do-contato.ts']);
    expect(usa('abrirLinhaDaLista')).toEqual(['src/content/abrir-por-telefone.ts', 'src/content/execucao.ts']);
  });

  it('o clique no cabeçalho vai no NOME da conversa e o de fechar vai no X DENTRO do painel (nunca no rodapé nem em botão de envio)', () => {
    const dados = arquivos.find((a) => a.caminho === 'src/content/crm/dados-do-contato.ts')!.codigo;
    expect(dados).toContain("encontrar(document, 'tituloCabecalho')");
    expect(dados).toContain("encontrar(painel, 'botaoFecharPainel')");
    expect(dados).toMatch(/abrirPainelDadosDoContato\(titulo\)/);
    expect(dados).toMatch(/fecharPainelDadosDoContato\(fechar\)/);
    expect(dados).not.toMatch(/rodapeConversa|caixaMensagem|microfone/);
  });

  it('os seletores do botão de fechar nunca apontam para enviar, microfone, anexo ou rodapé', () => {
    const fonte = readFileSync(join(SRC, 'content/selectors.ts'), 'utf8');
    const bloco = /botaoFecharPainel: \[([\s\S]*?)\],/.exec(fonte)?.[1] ?? '';
    expect(bloco).toContain('Fechar');
    expect(bloco).not.toMatch(/send|enviar|ptt|mic|attach|clip|footer|submit/i);
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
