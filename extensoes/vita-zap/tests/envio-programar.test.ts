// @vitest-environment jsdom
//
// 0.7.64: o WhatsApp Web ganhou "Programar mensagem". O envio automático nunca pode tomar o botão de programar por
// Enviar, nunca pode adivinhar entre dois botões e, se o diálogo de programar abrir, fecha pelo X e PAUSA.
// HTML sintético (README, seção 6: validar no WhatsApp real).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnosticarRodape, encontrarBotaoEnviar, enviarHumano } from '../src/content/envio-humano';
import { instalarEventosDeMouseSeguros } from './ajuda/whatsapp-envio-falso';

beforeEach(() => {
  vi.useFakeTimers();
  instalarEventosDeMouseSeguros();
});
afterEach(() => vi.useRealTimers());

function rodape(html: string, textoCaixa = 'oi'): void {
  document.body.innerHTML = `<div id="main"><footer><div contenteditable="true" role="textbox">${textoCaixa}</div><div>${html}</div></footer></div>`;
}

const PROGRAMAR = [
  '<button id="p" aria-label="Programar mensagem"><span data-icon="schedule-send"></span></button>',
  '<button id="p" aria-label="Schedule message"><svg><title>wds-ic-schedule-send</title></svg></button>',
  '<button id="p"><span data-icon="wds-ic-schedule-send"></span></button>',
  '<button id="p" aria-label="Programar envio"><svg><title>send-clock</title></svg></button>',
];
const ENVIAR = '<button id="e" aria-label="Enviar"><span data-icon="wds-ic-send-filled"></span></button>';

describe('botão Enviar x botão Programar', () => {
  it.each(PROGRAMAR)('botão de programar ANTES do enviar no DOM: escolhe o enviar (%s)', (p) => {
    rodape(p + ENVIAR);
    expect(encontrarBotaoEnviar()?.id).toBe('e');
  });

  it.each(PROGRAMAR)('só o de programar → null (%s)', (p) => {
    rodape(p);
    expect(encontrarBotaoEnviar()).toBeNull();
  });

  it('o ícone "schedule-send" não casa mais por pedaço de "send"', () => {
    rodape('<button id="p"><span data-icon="schedule-send"></span></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
    rodape('<button id="p"><svg><title>Programar envio</title></svg></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
  });

  it('enviar com ícone exato → ok; "Enviar" com seta/menu (botão dividido) → descartado', () => {
    rodape('<button id="e"><span data-icon="send"></span></button>');
    expect(encontrarBotaoEnviar()?.id).toBe('e');
    rodape('<button id="e" aria-label="Enviar"><span data-icon="send"></span><span data-icon="chevron-down"></span></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
    rodape('<button id="e" aria-label="Enviar" title="Mais opções"></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
  });

  it('data-testid="send" também passa pela lista negativa; [data-tab="11"] sozinho não basta', () => {
    rodape('<button id="e" data-testid="send"><span data-icon="schedule-send"></span></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
    rodape('<button id="e" data-testid="compose-btn-send"></button>');
    expect(encontrarBotaoEnviar()?.id).toBe('e');
    rodape('<button id="e" data-tab="11"></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
  });

  it('descendente/ancestral do botão com marca negativa descarta o candidato', () => {
    rodape('<button id="e" aria-label="Enviar"><span aria-label="Relógio"></span></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
    rodape('<div role="button" id="e"><button aria-label="Enviar" id="i"><svg><title>wds-ic-send</title></svg></button></div>');
    expect(encontrarBotaoEnviar()?.id).toBe('i'); // aninhados = o mesmo botão: fica o interno
  });

  it('dois enviares diferentes → ambiguidade → null', () => {
    rodape('<button id="a" aria-label="Enviar"></button><button id="b"><span data-icon="send"></span></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
  });

  it('o microfone continua excluído', () => {
    rodape('<button aria-label="Mensagem de voz"><span data-icon="ptt"></span></button>' + ENVIAR);
    expect(encontrarBotaoEnviar()?.id).toBe('e');
    rodape('<button aria-label="Enviar"><span data-icon="ptt"></span></button>');
    expect(encontrarBotaoEnviar()).toBeNull();
  });
});

describe('enviarHumano: ambiguidade, pressão curta, sem contextmenu, diálogo de programar', () => {
  const rodarEnvio = async (op: Parameters<typeof enviarHumano>[1], ms = 6000) => {
    const p = enviarHumano(document, op);
    await vi.advanceTimersByTimeAsync(ms);
    return p;
  };

  it('ambiguidade → botao_enviar_ausente com o motivo combinado, nada clicado, diagnóstico sem texto de mensagem', async () => {
    rodape('<button id="a" aria-label="Enviar"></button><button id="b"><span data-icon="send"></span></button>', 'segredo da mensagem');
    let cliques = 0;
    document.addEventListener('click', () => (cliques += 1), true);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await rodarEnvio({ reconferir: () => null, confirmar: () => true });
    expect(r).toEqual({ ok: false, codigo: 'botao_enviar_ausente', motivo: 'Achei mais de um botão parecido com Enviar no rodapé (o WhatsApp mudou). Não cliquei em nada.' });
    expect(cliques).toBe(0);
    expect(JSON.stringify(aviso.mock.calls)).not.toContain('segredo');
    aviso.mockRestore();
  });

  it('pressão de 30-60 ms entre apertar e soltar e nenhum contextmenu', async () => {
    rodape(ENVIAR);
    const t: Record<string, number> = {};
    const vistos: string[] = [];
    for (const tipo of ['mousedown', 'mouseup', 'contextmenu', 'click']) {
      document.addEventListener(tipo, () => {
        vistos.push(tipo);
        t[tipo] = Date.now();
      }, true);
    }
    await rodarEnvio({ reconferir: () => null, confirmar: () => vistos.includes('click') });
    expect(vistos).not.toContain('contextmenu');
    const d = t.mouseup - t.mousedown;
    expect(d).toBeGreaterThanOrEqual(30);
    expect(d).toBeLessThanOrEqual(60);
  });

  function comDialogo(fecharHtml: string): { verde: () => number; x: () => number } {
    rodape(ENVIAR);
    let verde = 0;
    let x = 0;
    document.getElementById('e')!.addEventListener('click', () => {
      setTimeout(() => {
        const d = document.createElement('div');
        d.setAttribute('role', 'dialog');
        d.innerHTML = `<h2>Programar mensagem</h2><input type="datetime-local">${fecharHtml}<button id="verde" aria-label="Programar"><span data-icon="check"></span></button>`;
        document.body.appendChild(d);
        d.querySelector('#verde')!.addEventListener('click', () => (verde += 1));
        d.querySelector('#fechar')?.addEventListener('click', () => {
          x += 1;
          d.remove();
        });
      }, 300);
    });
    return { verde: () => verde, x: () => x };
  }

  it('diálogo "Programar mensagem" depois do clique: fecha pelo X, nunca clica no verde, resultado abriu_programar', async () => {
    const c = comDialogo('<button id="fechar" aria-label="Fechar"><span data-icon="x"></span></button>');
    const r = await rodarEnvio({ reconferir: () => null, confirmar: () => false });
    expect(r).toMatchObject({ ok: false, codigo: 'abriu_programar', fechou: true });
    expect(r.ok === false && r.motivo).toBe('O WhatsApp abriu "Programar mensagem" em vez de enviar. Fechei sem programar e pausei: confira a conversa.');
    expect(c.x()).toBe(1);
    expect(c.verde()).toBe(0);
  });

  it('sem botão de fechar seguro: deixa aberto, não clica em nada e pausa com o mesmo problema', async () => {
    const c = comDialogo('');
    const r = await rodarEnvio({ reconferir: () => null, confirmar: () => false });
    expect(r).toMatchObject({ ok: false, codigo: 'abriu_programar', fechou: false });
    expect(c.verde()).toBe(0);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('mensagem que saiu de verdade continua sendo ok (sem diálogo)', async () => {
    rodape(ENVIAR);
    let saiu = false;
    document.getElementById('e')!.addEventListener('click', () => (saiu = true));
    expect(await rodarEnvio({ reconferir: () => null, confirmar: () => saiu })).toEqual({ ok: true });
  });
});

describe('diagnosticarRodape', () => {
  it('lista rótulo, ícone, data-testid e título do svg de cada botão, sem o texto da mensagem', () => {
    rodape('<button aria-label="Programar mensagem" data-testid="x1"><span data-icon="schedule-send"></span><svg><title>wds-ic-schedule-send</title></svg></button>' + ENVIAR, 'texto privado');
    const linhas = diagnosticarRodape().join('\n');
    expect(linhas).toContain('aria-label="Programar mensagem"');
    expect(linhas).toContain('schedule-send');
    expect(linhas).toContain('wds-ic-schedule-send');
    expect(linhas).toContain('data-testid=[x1]');
    expect(linhas).toContain('=> aceito');
    expect(linhas).toMatch(/negativa:/);
    expect(linhas).not.toContain('texto privado');
  });
});
