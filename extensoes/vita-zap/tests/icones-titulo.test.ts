// @vitest-environment jsdom
// WhatsApp Web de 10/2026: ícones são <svg><title>nome</title> sem data-icon (visto em 22/10/2026).
import { describe, expect, it } from 'vitest';
import { encontrar, existeAlgum } from '../src/content/selectors';

function linha(titulos: string[]): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = titulos.map((t) => `<span><svg><title>${t}</title></svg></span>`).join('');
  return div;
}

describe('ícones pelo <title> do svg', () => {
  it('reconhece o ✓✓ novo como mensagem minha', () => {
    expect(existeAlgum(linha(['wds-ic-read', 'ic-push-pin']), 'iconeMinhaMensagem')).toBe(true);
    expect(existeAlgum(linha(['wds-ic-delivered']), 'iconeMinhaMensagem')).toBe(true);
    expect(existeAlgum(linha(['ic-msg-check']), 'iconeMinhaMensagem')).toBe(true);
  });

  it('não confunde ícones de mensagem recebida', () => {
    for (const t of ['ic-keyboard-voice-filled', 'ic-push-pin', 'ic-notifications-off', 'ic-image']) {
      expect(existeAlgum(linha([t]), 'iconeMinhaMensagem')).toBe(false);
    }
  });

  it('continua aceitando o data-icon antigo', () => {
    const div = document.createElement('div');
    div.innerHTML = '<span data-icon="msg-dblcheck"></span>';
    expect(existeAlgum(div, 'iconeMinhaMensagem')).toBe(true);
  });

  it('acha grupo e o elemento do ícone pelo título', () => {
    const l = linha(['wds-ic-default-group']);
    expect(existeAlgum(l, 'iconeGrupo')).toBe(true);
    expect(encontrar(l, 'iconeGrupo')?.tagName).toBe('SPAN');
  });
});

import { ehContatoCliente } from '../src/shared/crm-regras';

describe('faixa só para contato de cliente', () => {
  it('aceita "cliente" em qualquer caixa e posição', () => {
    expect(ehContatoCliente('Johnny HCM Cliente Itapemirim Es')).toBe(true);
    expect(ehContatoCliente('CLIENTE Vere PR Novo')).toBe(true);
    expect(ehContatoCliente('Maria cliênte')).toBe(true);
  });
  it('ignora contatos pessoais', () => {
    expect(ehContatoCliente('Alan Braga Salina Casqueira')).toBe(false);
    expect(ehContatoCliente('KITE NINJA | Kitesurf')).toBe(false);
    expect(ehContatoCliente('')).toBe(false);
  });
});

import { abaFicouAntiga, criarProxyLeads, ERRO_ABA_ANTIGA } from '../src/shared/crm-transporte';

describe('extensão atualizada com a aba aberta', () => {
  it('reconhece o erro do Chrome e pede F5', async () => {
    expect(abaFicouAntiga(new Error('Extension context invalidated.'))).toBe(true);
    expect(abaFicouAntiga(new Error('Could not establish connection'))).toBe(false);
    const proxy = criarProxyLeads(() => Promise.reject(new Error('Extension context invalidated.')));
    const metodo = Object.values(proxy).find((f) => typeof f === 'function') as () => Promise<unknown>;
    await expect(metodo()).rejects.toThrow(ERRO_ABA_ANTIGA);
  });
});
