// @vitest-environment jsdom
//
// Painel lateral: abas Clientes e Lembretes renderizadas de verdade (React + chrome.storage falso).

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_ACAO_PENDENTE } from '../src/shared/crm-store';
import { instanteNoFuso } from '../src/shared/crm-lembretes';
import { Clientes } from '../src/sidepanel/Clientes';
import { Lembretes } from '../src/sidepanel/Lembretes';
import { useCrm } from '../src/sidepanel/crm';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { contato, porId } from './ajuda/fabrica';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root;
let el: HTMLElement;
let chrome: ChromeFalso;

// Ontem em ISO local: a expectativa "há 1 dia" não pode depender do dia em que o teste roda.
const ontem = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const conv = (nome: string, dataMsg: string) => ({
  chave: nome.toLowerCase(), nome, ultimaDeMim: false, naoLida: false, naoLidas: 0, grupo: false, arquivada: false,
  rotuloData: null, dataMsg, hora: null, previa: 'oi', ass: `${nome}|0`, desdeEm: 0, vistaEm: 0,
});

function Cliente() {
  return createElement(Clientes, { crm: useCrm() });
}
function Central() {
  return createElement(Lembretes, { crm: useCrm() });
}

async function montar(componente: () => ReturnType<typeof createElement>) {
  await act(async () => {
    raiz.render(createElement(componente));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

beforeEach(() => {
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
  chrome = instalarChromeFalso({
    'vz.etiquetas': [{ id: 'e1', nome: 'Quente', cor: '#c62828' }],
    'vz.conversas': { ana: conv('Ana Cliente', ontem), bruno: conv('Bruno Cliente', '2026-09-01') },
    'vz.contatos': {
      ...porId(contato('Ana Cliente', { fase: 'negociando', etiquetas: ['e1'] }), contato('Bruno Cliente')),
    },
    'vz.lembretes': [
      { id: 'v', contatoId: 'id-ana-cliente', nome: 'Ana Cliente', venceEm: Date.now() - 3_600_000, criadoEm: 1, status: 'disparado', rascunho: 'Oi Ana!' },
      { id: 'p', contatoId: 'id-bruno-cliente', nome: 'Bruno Cliente', venceEm: instanteNoFuso('2099-01-01', 9), criadoEm: 1, status: 'pendente' },
    ],
  });
  (chrome.chrome as { tabs: { query: () => Promise<unknown[]> } }).tabs.query = async () => [{ id: 3, windowId: 1, active: true }];
});

afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
});

describe('aba Clientes', () => {
  it('lista com fase, etiqueta, última interação e próximo lembrete; mais tempo sem contato primeiro', async () => {
    await montar(Cliente);
    const itens = [...(el.querySelector('ul.lista') as HTMLElement).querySelectorAll(':scope > li')]; // a 1ª lista é a de clientes
    expect(itens.map((i) => i.querySelector('b')?.textContent)).toEqual(['Bruno Cliente', 'Ana Cliente']);
    const ana = itens[1].textContent ?? '';
    expect(ana).toContain('Negociando');
    expect(ana).toContain('Quente');
    expect(ana).toContain('Última interação: há 1 dia');
    expect(ana).toContain('Próximo lembrete');
    expect(itens[0].textContent).toContain('Próximo lembrete: ');
  });

  it('a busca filtra a lista', async () => {
    await montar(Cliente);
    const busca = el.querySelector('input[type="search"]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      set?.call(busca, 'ana');
      busca.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect([...el.querySelectorAll('ul.lista > li b')].map((b) => b.textContent)).toEqual(['Ana Cliente']);
  });

  it('Abrir leva ao WhatsApp Web: grava o pedido (sem rascunho)', async () => {
    await montar(Cliente);
    const abrir = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Abrir') as HTMLButtonElement;
    await act(async () => abrir.click());
    await vi.waitFor(() => expect(chrome.dados.get(CHAVE_ACAO_PENDENTE)).toMatchObject({ tipo: 'abrirConversa', nome: 'Bruno Cliente' }));
    expect(chrome.abasAtivadas).toEqual([3]);
  });
});

describe('aba Lembretes (central)', () => {
  it('separa Vencidos e Próximos, e Abrir pede a conversa com o rascunho', async () => {
    await montar(Central);
    const texto = el.textContent ?? '';
    expect(texto).toContain('Vencidos (1)');
    expect(texto).toContain('Hoje (0)');
    expect(texto).toContain('Próximos (1)');
    const abrir = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Abrir conversa') as HTMLButtonElement;
    await act(async () => abrir.click());
    await vi.waitFor(() => expect(chrome.dados.get(CHAVE_ACAO_PENDENTE)).toMatchObject({ nome: 'Ana Cliente', rascunho: 'Oi Ana!', lembreteId: 'v' }));
  });

  it('Concluir tira o vencido da central', async () => {
    await montar(Central);
    const concluir = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Concluir') as HTMLButtonElement;
    await act(async () => concluir.click());
    await vi.waitFor(() => expect(el.textContent).toContain('Vencidos (0)'));
    const lista = chrome.dados.get('vz.lembretes') as Array<{ id: string; status: string }>;
    expect(lista.find((l) => l.id === 'v')?.status).toBe('concluido');
  });
});
