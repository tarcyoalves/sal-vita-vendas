// Envio duplicado (atendente, 10/11/2026): o painel repetia o pedido ao WhatsApp quando a resposta se perdia no
// meio (extensão atualizada / aba recarregada). Repetir só é seguro quando o pedido nunca chegou.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pedidoNaoEntregue, pedir } from '../src/sidepanel/whatsapp';

function chromeFalso(falha: Error) {
  const sendMessage = vi.fn().mockRejectedValueOnce(falha).mockResolvedValue({ ok: true });
  const executeScript = vi.fn().mockResolvedValue([]);
  (globalThis as unknown as { chrome: unknown }).chrome = {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, windowId: 1, active: true }]), sendMessage, update: vi.fn() },
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 1 }) },
    scripting: { executeScript },
  };
  return { sendMessage, executeScript };
}

const PEDIDO = { tipo: 'abrirEColar', nome: 'Ana', texto: 'oi' } as never;

afterEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe('pedir ao WhatsApp sem repetir envio', () => {
  it('resposta perdida no meio (porta fechada / contexto invalidado): NÃO repete', async () => {
    for (const msg of ['The message port closed before a response was received.', 'Extension context invalidated.']) {
      const { sendMessage, executeScript } = chromeFalso(new Error(msg));
      const r = await pedir(PEDIDO);
      expect(r).toMatchObject({ ok: false, codigo: 'interno' });
      expect(sendMessage).toHaveBeenCalledTimes(1);
      expect(executeScript).not.toHaveBeenCalled();
    }
  });

  it('aba sem content script (pedido não entregue): injeta e tenta uma vez', async () => {
    const { sendMessage, executeScript } = chromeFalso(new Error('Could not establish connection. Receiving end does not exist.'));
    expect(await pedir(PEDIDO)).toEqual({ ok: true });
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('classificação do erro', () => {
    expect(pedidoNaoEntregue(new Error('Could not establish connection. Receiving end does not exist.'))).toBe(true);
    expect(pedidoNaoEntregue(new Error('The message port closed before a response was received.'))).toBe(false);
    expect(pedidoNaoEntregue('x')).toBe(false);
  });
});
