// @vitest-environment jsdom
//
// HTML SINTÉTICO (ver aviso em extrair.test.ts). Testa a lógica de: leitura de texto com emoji
// (A4), foco (A1), clique no título (A7), prévia de grupo (A12), vigia de avisos (I1),
// geração do content script (A11) e seletores (I2).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { abrirLinhaDaLista } from '../src/content/abrir-conversa';
import { campoVazio, escreverNoCampo, limparCampo, textoDoCampo, textoDoNo, textoVazio, usuarioDigitando } from '../src/content/dom';
import { lerLinha, previaDaLinha } from '../src/content/extrair';
import { assumirGeracao } from '../src/content/geracao';
import { encontrar, SELETORES } from '../src/content/selectors';
import { iniciarVigia, lerAvisoWhatsApp, novoEstadoVigia, pararVigia, RELOGIO_LIMITE_MS } from '../src/content/vigia';

afterEach(() => {
  pararVigia();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

function corpo(html: string): void {
  document.body.innerHTML = html;
}

describe('A4 — texto com emoji (<img alt>, data-plain-text)', () => {
  it('lê alt e data-plain-text de <img>, <br> e blocos', () => {
    corpo('<div id="c" contenteditable="true">Oi <img alt="😀" data-plain-text="😀"> tudo<br>bem <img data-plain-text="👍"></div>');
    expect(textoDoCampo(document.getElementById('c') as HTMLElement)).toBe('Oi 😀 tudo\nbem 👍');
  });

  it('parágrafos viram quebra de linha e o contêiner raiz não deixa quebra sobrando', () => {
    corpo('<div id="c" contenteditable="true"><p>um</p><p>dois</p></div>');
    expect(textoDoNo(document.getElementById('c') as HTMLElement)).toBe('um\ndois\n');
    corpo('<div id="c" contenteditable="true">texto</div>');
    expect(textoDoNo(document.getElementById('c') as HTMLElement)).toBe('texto');
  });

  it('rascunho só com emoji NÃO é vazio (innerText o perderia)', () => {
    corpo('<div id="c" contenteditable="true"><img alt="😀" data-plain-text="😀"></div>');
    expect(campoVazio(document.getElementById('c') as HTMLElement)).toBe(false);
  });

  it('caixa vazia do WhatsApp (<p><br></p>, espaços e caracteres invisíveis) é vazia', () => {
    corpo('<div id="c" contenteditable="true"><p><br></p></div>');
    expect(campoVazio(document.getElementById('c') as HTMLElement)).toBe(true);
    expect(textoVazio(' \n​﻿ ')).toBe(true);
    expect(textoVazio('😀')).toBe(false);
  });

  it('input/textarea usam .value', () => {
    corpo('<input id="i" value="abc">');
    expect(textoDoCampo(document.getElementById('i') as HTMLElement)).toBe('abc');
  });
});

describe('A1 — foco: nunca chamar focus() sobre um campo com texto do usuário', () => {
  it('usuarioDigitando: campo focado com texto é "digitando"; vazio não; sem foco não', () => {
    corpo('<div id="c" contenteditable="true" tabindex="0"></div><input id="b">');
    const c = document.getElementById('c') as HTMLElement;
    expect(usuarioDigitando()).toBe(false);
    c.focus();
    expect(usuarioDigitando()).toBe(false); // focado mas vazio
    c.textContent = 'rascunho';
    expect(usuarioDigitando()).toBe(true);
    c.innerHTML = '<img alt="😀" data-plain-text="😀">';
    expect(usuarioDigitando()).toBe(true); // emoji também é texto
  });

  it('escreverNoCampo / limparCampo recusam (sem focar nem escrever) quando o usuário digita em outro campo', () => {
    corpo('<div id="c" contenteditable="true" tabindex="0">meu texto</div><input id="b">');
    const c = document.getElementById('c') as HTMLElement;
    const b = document.getElementById('b') as HTMLInputElement;
    c.focus();
    const focar = vi.spyOn(b, 'focus');
    expect(escreverNoCampo(b, 'busca')).toBe(false);
    expect(limparCampo(b)).toBe(false);
    expect(focar).not.toHaveBeenCalled();
    expect(b.value).toBe('');
    expect(document.activeElement).toBe(c);
    expect(c.textContent).toBe('meu texto');
  });

  it('com o foco em campo vazio ou fora de campos, escreve normalmente', () => {
    corpo('<input id="b">');
    const b = document.getElementById('b') as HTMLInputElement;
    expect(escreverNoCampo(b, 'maria')).toBe(true);
    expect(b.value).toBe('maria');
    expect(document.activeElement).toBe(b);
    // O que nós mesmos escrevemos não é "o usuário digitando".
    expect(usuarioDigitando()).toBe(false);
    // Se o usuário mexe no texto, passa a ser dele.
    b.value = 'maria silva';
    expect(usuarioDigitando()).toBe(true);
  });
});

describe('A7 — o clique de abrir vai no título da linha', () => {
  it('despacha mousedown/mouseup/click no elemento recebido (título) e o evento sobe até a linha', () => {
    corpo('<div id="linha" role="listitem"><div><span id="titulo" dir="auto" title="Ana">Ana</span></div><div>10:00</div></div>');
    const linha = document.getElementById('linha') as HTMLElement;
    const titulo = document.getElementById('titulo') as HTMLElement;
    const alvos: string[] = [];
    linha.addEventListener('mousedown', (e) => alvos.push(`down:${(e.target as HTMLElement).id}`));
    linha.addEventListener('mouseup', (e) => alvos.push(`up:${(e.target as HTMLElement).id}`));
    linha.addEventListener('click', (e) => alvos.push(`click:${(e.target as HTMLElement).id}`));
    abrirLinhaDaLista(titulo);
    expect(alvos).toEqual(['down:titulo', 'up:titulo', 'click:titulo']);
  });

  it('recebendo a própria linha, usa o elemento que está no centro dela (elementFromPoint) se for filho', () => {
    corpo('<div id="linha"><span id="miolo">x</span></div>');
    const linha = document.getElementById('linha') as HTMLElement;
    const miolo = document.getElementById('miolo') as HTMLElement;
    document.elementFromPoint = () => miolo;
    const alvos: string[] = [];
    linha.addEventListener('click', (e) => alvos.push((e.target as HTMLElement).id));
    abrirLinhaDaLista(linha);
    expect(alvos).toEqual(['miolo']);
    // elementFromPoint fora da linha: cai na própria linha.
    document.elementFromPoint = () => document.body;
    alvos.length = 0;
    abrirLinhaDaLista(linha);
    expect(alvos).toEqual(['linha']);
  });
});

describe('A12 — grupo também pelo prefixo "Fulano:" da prévia', () => {
  const linha = (nome: string, previa: string, extra = '') => {
    const el = document.createElement('div');
    el.setAttribute('role', 'listitem');
    el.innerHTML = `<div><div><span dir="auto" title="${nome}">${nome}</span></div><div>10:00</div></div><div><span title="${previa}"><span>${previa}</span></span>${extra}</div>`;
    return el;
  };
  const grupo = (el: HTMLElement) => {
    const r = lerLinha(el);
    return r.tipo === 'conversa' && r.linha.pareceGrupo;
  };

  it.each([
    ['Maria: bom dia pessoal', true],
    ['João Silva: chego já', true],
    ['Você: Oi, tudo bem?', false],
    ['You: ok', false],
    ['Bom dia, tudo bem?', false],
    ['chego 14:30', false],
  ])('prévia "%s" → grupo=%s', (previa, esperado) => {
    expect(grupo(linha('Contato', previa))).toBe(esperado);
  });

  it('o ícone de grupo continua valendo', () => {
    expect(grupo(linha('Contato', 'oi', '<span data-icon="default-group"></span>'))).toBe(true);
  });

  it('a prévia é o que sobra na linha sem o título e a data (emoji incluído)', () => {
    const el = linha('Contato', 'Ana: oi');
    const titulo = encontrar(el, 'tituloLinha') as HTMLElement;
    expect(previaDaLinha(el, titulo, '10:00')).toBe('Ana: oi');
  });
});

describe('I1 — avisos do WhatsApp (vigia)', () => {
  const msgSua = (id: string, relogio: boolean) =>
    `<div data-id="${id}"><span class="selectable-text"><span>oi</span></span>${relogio ? '<span data-icon="msg-time"></span>' : '<span data-icon="msg-check"></span>'}</div>`;
  const principal = (mensagens = '') => `<div id="main"><div>${mensagens}</div></div>`;

  it('tela normal: sem aviso', () => {
    corpo(principal(msgSua('true_a@c.us_1', false)));
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toBeNull();
  });

  it('telefone desconectado (data-testid)', () => {
    corpo(`${principal()}<div data-testid="alert-phone-not-connected">Telefone não conectado</div>`);
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toMatch(/telefone está desconectado/);
  });

  it('ícone alert-computer', () => {
    corpo(`${principal()}<span data-icon="alert-computer"></span>`);
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toMatch(/desconectado/);
  });

  it('banner div[role=alert] com texto', () => {
    corpo(`${principal()}<div role="alert">Sua conta foi restrita por violar os termos</div>`);
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toMatch(/alerta: "Sua conta foi restrita/);
  });

  it('banner vazio é ignorado', () => {
    corpo(`${principal()}<div role="alert"> </div>`);
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toBeNull();
  });

  it('modal "não foi possível enviar"', () => {
    corpo(`${principal()}<div role="dialog"><div>Não foi possível enviar a mensagem. Tente de novo.</div><button>OK</button></div>`);
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toMatch(/uma mensagem não saiu/);
  });

  it('modal de restrição de conta', () => {
    corpo(`${principal()}<div role="dialog">Sua conta está restrita temporariamente</div>`);
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toMatch(/aviso de conta/);
  });

  it('modal qualquer (ex.: menu) não pausa', () => {
    corpo(`${principal()}<div role="dialog">Deseja sair do grupo?</div>`);
    expect(lerAvisoWhatsApp(novoEstadoVigia(), 0)).toBeNull();
  });

  it('relógio pendente em mensagem sua por mais de 60 s', () => {
    corpo(principal(msgSua('true_a@c.us_1', true)));
    const estado = novoEstadoVigia();
    expect(lerAvisoWhatsApp(estado, 1000)).toBeNull();
    expect(lerAvisoWhatsApp(estado, 1000 + RELOGIO_LIMITE_MS)).toBeNull(); // exatamente 60 s ainda não
    expect(lerAvisoWhatsApp(estado, 1000 + RELOGIO_LIMITE_MS + 1)).toMatch(/mais de 1 minuto com o relógio/);
  });

  it('relógio que some (mensagem saiu) zera a contagem', () => {
    corpo(principal(msgSua('true_a@c.us_1', true)));
    const estado = novoEstadoVigia();
    lerAvisoWhatsApp(estado, 0);
    corpo(principal(msgSua('true_a@c.us_1', false)));
    expect(lerAvisoWhatsApp(estado, 90_000)).toBeNull();
    expect(estado.relogios.size).toBe(0);
  });

  it('mensagem RECEBIDA com relógio não conta; .message-out conta como sua', () => {
    corpo(principal(msgSua('false_a@c.us_1', true)));
    const estado = novoEstadoVigia();
    lerAvisoWhatsApp(estado, 0);
    expect(lerAvisoWhatsApp(estado, 120_000)).toBeNull();
    corpo(principal(`<div class="message-out">${msgSua('3EB01', true)}</div>`));
    const e2 = novoEstadoVigia();
    lerAvisoWhatsApp(e2, 0);
    expect(lerAvisoWhatsApp(e2, 120_000)).not.toBeNull();
  });

  it('iniciarVigia avisa uma vez por aviso novo e não duplica o relógio', () => {
    vi.useFakeTimers();
    corpo(principal());
    const aviso = vi.fn();
    iniciarVigia(aviso, 1000);
    iniciarVigia(aviso, 1000); // idempotente
    vi.advanceTimersByTime(3000);
    expect(aviso).not.toHaveBeenCalled();
    document.body.insertAdjacentHTML('beforeend', '<div data-testid="alert-phone-not-connected"></div>');
    vi.advanceTimersByTime(3000);
    expect(aviso).toHaveBeenCalledTimes(1);
    pararVigia();
    document.body.insertAdjacentHTML('beforeend', '<div role="alert">outro</div>');
    vi.advanceTimersByTime(3000);
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe('A11 — geração do content script', () => {
  it('a injeção nova encerra a antiga, vira a atual e herda as pendências', () => {
    const janela = {} as Window;
    const encerrar1 = vi.fn();
    const g1 = assumirGeracao(encerrar1, janela);
    expect(g1.minha).toBe(1);
    expect(g1.atual()).toBe(true);
    g1.estado.pendencias.push({ id: 'p', nome: 'Ana', texto: 't', textoConfere: true, jid: null, detectadoEm: 'x' });

    const encerrar2 = vi.fn();
    const g2 = assumirGeracao(encerrar2, janela);
    expect(encerrar1).toHaveBeenCalledTimes(1);
    expect(g2.minha).toBe(2);
    expect(g1.atual()).toBe(false); // o ouvinte antigo passa a ignorar pedidos
    expect(g2.atual()).toBe(true);
    expect(g2.estado.pendencias).toHaveLength(1);
    expect(encerrar2).not.toHaveBeenCalled();

    assumirGeracao(vi.fn(), janela);
    expect(encerrar2).toHaveBeenCalledTimes(1);
  });

  it('falha ao encerrar a geração antiga não impede a nova', () => {
    const janela = {} as Window;
    assumirGeracao(() => {
      throw new Error('quebrada');
    }, janela);
    expect(assumirGeracao(vi.fn(), janela).atual()).toBe(true);
  });
});

describe('I2 — alternativas de seletor por data-testid estável', () => {
  it('cada chave tem a alternativa testid pedida', () => {
    expect(SELETORES.caixaBusca).toContain('div[role="textbox"][data-testid="chat-list-search"]');
    expect(SELETORES.tituloLinha).toContain('[data-testid="cell-frame-title"] span');
    expect(SELETORES.caixaMensagem).toContain('div[contenteditable="true"][data-testid="conversation-compose-box-input"]');
    expect(SELETORES.mensagem).toContain('[data-testid="conversation-panel-messages"] [data-id]');
    expect(SELETORES.painelLateral).toContain('[data-testid="chat-list"]');
  });

  it('encontra os elementos usando SÓ os data-testid', () => {
    corpo(`
      <div data-testid="chat-list"><div role="listitem"><div data-testid="cell-frame-title"><span>Ana</span></div></div></div>
      <div role="textbox" contenteditable="true" data-testid="chat-list-search"></div>
      <div data-testid="conversation-panel-messages"><div data-id="true_a@c.us_1"></div></div>
      <div contenteditable="true" data-testid="conversation-compose-box-input"></div>`);
    expect(encontrar(document, 'painelLateral')?.getAttribute('data-testid')).toBe('chat-list');
    expect(encontrar(document, 'caixaBusca')?.getAttribute('data-testid')).toBe('chat-list-search');
    expect(encontrar(document, 'caixaMensagem')?.getAttribute('data-testid')).toBe('conversation-compose-box-input');
    expect(encontrar(document, 'mensagem')?.getAttribute('data-id')).toBe('true_a@c.us_1');
    const linha = document.querySelector('[role="listitem"]') as HTMLElement;
    const r = lerLinha(linha);
    expect(r.tipo === 'conversa' && r.linha.nome).toBe('Ana');
  });

  it('nenhum seletor usa classe com hash (_ak72, x1abc…); só classes semânticas conhecidas', () => {
    const todos = Object.values(SELETORES).flat();
    expect(todos.length).toBeGreaterThan(20);
    for (const s of todos) {
      expect(s, s).not.toMatch(/\.(_[A-Za-z0-9]{2,}|x[a-z0-9]{6,})\b/);
      const classes = [...s.matchAll(/\.([A-Za-z][\w-]*)/g)].map((m) => m[1]);
      for (const c of classes) expect(['selectable-text', 'copyable-text', 'message-out'], s).toContain(c);
    }
  });
});
