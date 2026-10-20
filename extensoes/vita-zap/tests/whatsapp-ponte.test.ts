// A11 — a ponte painel → content script só reinjeta quando NÃO há content script na aba.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pedir, semReceptor } from '../src/sidepanel/whatsapp';

const aba = { id: 7, active: true, windowId: 1 };

function chromeFalso(sendMessage: ReturnType<typeof vi.fn>) {
  const executeScript = vi.fn().mockResolvedValue([]);
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn().mockResolvedValue([aba]), sendMessage, update: vi.fn() },
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
    scripting: { executeScript },
  });
  return executeScript;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('semReceptor', () => {
  it.each([
    'Could not establish connection. Receiving end does not exist.',
    'Receiving end does not exist',
    'Could not establish connection',
  ])('reconhece: %s', (m) => expect(semReceptor(new Error(m))).toBe(true));

  it.each(['The message port closed before a response was received.', 'Extension context invalidated.', 'timeout'])('não reconhece: %s', (m) =>
    expect(semReceptor(new Error(m))).toBe(false),
  );
});

describe('pedir — reinjeção', () => {
  it('sem content script ("Receiving end does not exist"): injeta content.js UMA vez e repete o pedido', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({ ok: true });
    const executeScript = chromeFalso(sendMessage);
    expect(await pedir({ tipo: 'verificar' })).toEqual({ ok: true });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, files: ['content.js'] });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('outro erro (porta fechada no meio de uma operação) NÃO reinjeta e devolve erro interno', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('The message port closed before a response was received.'));
    const executeScript = chromeFalso(sendMessage);
    const r = await pedir({ tipo: 'abrirEColar', nome: 'Ana', texto: 'Oi' });
    expect(executeScript).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, codigo: 'interno' });
    expect(r.ok === false && r.erro).toMatch(/message port closed/);
  });

  it('continua sem receptor depois de injetar: pede para recarregar a aba (F5)', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('Could not establish connection. Receiving end does not exist.'));
    const executeScript = chromeFalso(sendMessage);
    const r = await pedir({ tipo: 'verificar' });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, codigo: 'nao_pronto' });
    expect(r.ok === false && r.erro).toMatch(/F5/);
  });

  it('funcionando de primeira: não injeta nada', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, avisos: [] });
    const executeScript = chromeFalso(sendMessage);
    expect(await pedir({ tipo: 'verificar' })).toEqual({ ok: true, avisos: [] });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('resposta vazia vira erro interno (não reinjeta)', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const executeScript = chromeFalso(sendMessage);
    expect(await pedir({ tipo: 'verificar' })).toMatchObject({ ok: false, codigo: 'interno' });
    expect(executeScript).not.toHaveBeenCalled();
  });
});
