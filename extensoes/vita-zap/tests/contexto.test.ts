// Contexto da extensão invalidado (extensão recarregada/desativada): o content script antigo
// não pode lançar erro na página nem deixar timers/observers vivos.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextoValido, emitirSeguro, idDaExtensao, iniciarVigiaDeContexto } from '../src/content/contexto';

type Globais = { chrome?: unknown };
const g = globalThis as Globais;

const evento = { tipo: 'vitaZap:progressoVarredura', lidas: 1, unicas: 1 } as const;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  delete g.chrome;
});

describe('contextoValido / idDaExtensao', () => {
  it('false sem chrome, sem chrome.runtime ou sem chrome.runtime.id', () => {
    delete g.chrome;
    expect(contextoValido()).toBe(false);
    g.chrome = {};
    expect(contextoValido()).toBe(false);
    g.chrome = { runtime: {} };
    expect(contextoValido()).toBe(false);
    expect(idDaExtensao()).toBeNull();
  });

  it('true com chrome.runtime.id', () => {
    g.chrome = { runtime: { id: 'abc' } };
    expect(contextoValido()).toBe(true);
    expect(idDaExtensao()).toBe('abc');
  });

  it('não lança se o acesso a chrome.runtime lançar', () => {
    g.chrome = {
      get runtime(): never {
        throw new Error('Extension context invalidated.');
      },
    };
    expect(contextoValido()).toBe(false);
    expect(idDaExtensao()).toBeNull();
  });
});

/** Simula o contexto morrendo no meio da chamada: sendMessage lança e chrome.runtime some. */
function chromeMorre(): void {
  const c = g.chrome as { runtime?: unknown };
  c.runtime = undefined;
}

describe('emitirSeguro', () => {
  it('chama sendMessage quando o contexto é válido; painel fechado (rejeição) devolve false sem lançar', async () => {
    const sendMessage = vi.fn(() => Promise.reject(new Error('Receiving end does not exist')));
    g.chrome = { runtime: { id: 'abc', sendMessage } };
    await expect(emitirSeguro(evento)).resolves.toBe(false);
    expect(sendMessage).toHaveBeenCalledWith(evento);
    const ok = vi.fn(() => Promise.resolve());
    g.chrome = { runtime: { id: 'abc', sendMessage: ok } };
    await expect(emitirSeguro(evento)).resolves.toBe(true);
  });

  it('contexto invalidado: não chama nada, devolve false e avisa quem encerra', async () => {
    const aoInvalidar = vi.fn();
    g.chrome = { runtime: undefined };
    await expect(emitirSeguro(evento, aoInvalidar)).resolves.toBe(false);
    expect(aoInvalidar).toHaveBeenCalledTimes(1);
  });

  it('sendMessage lançando (contexto morreu no meio) é engolido', async () => {
    const aoInvalidar = vi.fn();
    g.chrome = {
      runtime: {
        id: 'abc',
        sendMessage: () => {
          chromeMorre();
          throw new Error('Extension context invalidated.');
        },
      },
    };
    await expect(emitirSeguro(evento, aoInvalidar)).resolves.toBe(false);
    expect(aoInvalidar).toHaveBeenCalledTimes(1);
  });

  it('chrome.runtime sem sendMessage (o erro visto em campo) não lança', async () => {
    g.chrome = { runtime: { id: 'abc' } };
    await expect(emitirSeguro(evento)).resolves.toBe(false);
  });

  it('não escreve nada no console da página', async () => {
    const espioes = (['log', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    g.chrome = { runtime: undefined };
    await emitirSeguro(evento, () => undefined);
    for (const e of espioes) expect(e).not.toHaveBeenCalled();
    for (const e of espioes) e.mockRestore();
  });
});

describe('iniciarVigiaDeContexto', () => {
  it('enquanto o contexto é válido não faz nada; ao invalidar encerra UMA vez e para o timer', () => {
    const runtime: { id?: string } = { id: 'abc' };
    g.chrome = { runtime };
    const aoInvalidar = vi.fn();
    iniciarVigiaDeContexto(aoInvalidar, 1000);
    vi.advanceTimersByTime(5000);
    expect(aoInvalidar).not.toHaveBeenCalled();

    runtime.id = undefined;
    vi.advanceTimersByTime(1000);
    expect(aoInvalidar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(aoInvalidar).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('erro dentro de aoInvalidar não escapa', () => {
    g.chrome = { runtime: undefined };
    iniciarVigiaDeContexto(() => {
      throw new Error('boom');
    }, 1000);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });

  it('parar() cancela o timer', () => {
    g.chrome = { runtime: { id: 'abc' } };
    const v = iniciarVigiaDeContexto(() => undefined, 1000);
    v.parar();
    expect(vi.getTimerCount()).toBe(0);
  });
});
