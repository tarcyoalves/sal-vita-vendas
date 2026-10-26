// @vitest-environment jsdom
//
// Painel lateral, aba "Acompanhar" (React + chrome.storage falso + CRM falso): lista ordenada (vencido primeiro,
// depois mais dias sem contato), dados de cada cliente, ações (Abrir conversa SEM recarregar, Registrar contato,
// Reagendar) e consumo do CRM (1 consulta ao abrir, no máximo 1 por 15 min, nada de polling).

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rotuloDaAbaAcompanhar, Acompanhar, resumoDoPainel, useAcompanhando } from '../src/sidepanel/Acompanhar';
import { useCrm } from '../src/sidepanel/crm';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIA = 86_400_000;
let raiz: Root;
let el: HTMLElement;
let chrome: ChromeFalso;
let crm: CrmFalso;
let repo: ReturnType<typeof criarRepositorioCRM>;
let mensagensParaAba: unknown[];

function Painel() {
  const c = useCrm(repo);
  const a = useAcompanhando(c);
  const resumo = resumoDoPainel(a, c.agora);
  return createElement('div', null, createElement('span', { id: 'rotulo' }, rotuloDaAbaAcompanhar(resumo)), createElement(Acompanhar, { crm: c, acompanhando: a }));
}

async function montar() {
  await act(async () => {
    raiz.render(createElement(Painel));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

const botoes = (texto: string): HTMLButtonElement[] => [...el.querySelectorAll('button')].filter((b) => b.textContent === texto);
const nomes = (): string[] => [...el.querySelectorAll('ul.lista > li > div:first-child b')].map((b) => b.textContent ?? '');
const consultas = (): number => crm.chamadas('tasks.acompanhando').length;

beforeEach(async () => {
  const agora = Date.now();
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
  chrome = instalarChromeFalso();
  chrome.abas = [{ id: 3, windowId: 1, active: true, url: 'https://web.whatsapp.com/' }];
  mensagensParaAba = [];
  const tabs = (chrome.chrome as { tabs: { sendMessage: (id: number, m: unknown) => Promise<unknown> } }).tabs;
  tabs.sendMessage = async (_id, m) => {
    mensagensParaAba.push(m);
    return { ok: true };
  };
  crm = criarCrmFalso([
    task({ id: 1, title: 'Padaria Sol', phone: '84999990001', tags: ['Acompanhar'], reminderDate: new Date(agora + 2 * DIA), lastContactedAt: new Date(agora - 10 * DIA), contactCount: 3 }),
    task({ id: 2, title: 'Mercado Mar', phone: '84999990002', tags: ['Acompanhar'], reminderDate: new Date(agora - 3_600_000), lastContactedAt: new Date(agora - 2 * DIA), contactCount: 1 }),
    task({ id: 3, title: 'Atacado Rio', phone: '84999990003', tags: ['Acompanhar'], reminderDate: new Date(agora - 2 * 3_600_000), lastContactedAt: new Date(agora - 6 * DIA), contactCount: 2 }),
    task({ id: 4, title: 'Outro lead', phone: '84999990004', tags: ['quente'] }),
  ]);
  const local = new RepositorioLocal();
  const servico = new ServicoCrm(local, crm.transporte);
  repo = criarRepositorioCRM(local, servico);
  await servico.definirUrl(BASE);
  expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
});

afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
});

describe('aba Acompanhar do painel', () => {
  it('abrir a aba faz UMA consulta ao CRM e lista só os leads com a etiqueta: vencidos primeiro, depois mais dias sem contato', async () => {
    await montar();
    expect(consultas()).toBe(1);
    // vencidos: Atacado Rio (6 dias) antes de Mercado Mar (2 dias); depois Padaria Sol (10 dias, lembrete futuro)
    expect(nomes()).toEqual(['Atacado Rio', 'Mercado Mar', 'Padaria Sol']);
  });

  it('cada cliente mostra próximo lembrete, último contato e "há N dias sem falar"', async () => {
    await montar();
    const itens = [...el.querySelectorAll('ul.lista > li')];
    const rio = itens[0].textContent ?? '';
    expect(rio).toContain('lembrete vencido');
    expect(rio).toContain('Próximo lembrete:');
    expect(rio).toContain('Último contato:');
    expect(rio).toContain('(2x)');
    expect(rio).toContain('há 6 dias sem falar');
    expect(itens[2].textContent).toContain('há 10 dias sem falar');
    expect(itens[2].textContent).not.toContain('lembrete vencido');
  });

  it('contador na aba: total e destaque de vencidos', async () => {
    await montar();
    expect(el.querySelector('#rotulo')?.textContent).toBe('Acompanhar (3)');
    expect(el.textContent).toContain('3 em acompanhamento, 2 vencidos');
    expect(resumoDoPainel({ dados: null, carregando: false, ler: async () => undefined }, new Date())).toBeNull();
    expect(rotuloDaAbaAcompanhar(null)).toBe('Acompanhar');
    expect(rotuloDaAbaAcompanhar({ total: 0, vencidos: 0 })).toBe('Acompanhar');
  });

  it('reabrir a aba dentro de 15 min não consulta de novo; Atualizar consulta; nada de polling', async () => {
    await montar();
    await act(async () => raiz.unmount());
    raiz = createRoot(el);
    await montar();
    expect(consultas()).toBe(1);
    await act(async () => botoes('Atualizar')[0].click());
    await vi.waitFor(() => expect(consultas()).toBe(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(consultas()).toBe(2);
  });

  it('Abrir conversa usa a busca do WhatsApp (sem recarregar a página) e não envia nada', async () => {
    await montar();
    await act(async () => botoes('Abrir conversa')[0].click());
    await vi.waitFor(() => expect(mensagensParaAba).toHaveLength(1));
    expect(mensagensParaAba[0]).toMatchObject({ tipo: 'abrirPorTelefone', telefone: '84999990003', nomeDica: 'Atacado Rio' });
    expect(chrome.abasCriadas).toEqual([]);
    expect(el.textContent).toContain('aberta pela busca do WhatsApp Web (sem recarregar)');
  });

  it('Registrar contato anexa a nota no CRM, conta como contato e o cartão passa a "falou hoje"', async () => {
    await montar();
    await act(async () => botoes('Registrar contato')[0].click());
    const campo = el.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(campo, 'Confirmou 40 sacos');
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => botoes('Registrar no CRM')[0].click());
    await vi.waitFor(() => expect(crm.tasks[2].notes).toContain('Confirmou 40 sacos'));
    await vi.waitFor(() => expect(el.textContent).toContain('falou hoje'));
    expect(el.querySelector('textarea')).toBeNull();
  });

  it('Reagendar: prazo rápido muda a data do lembrete no CRM', async () => {
    await montar();
    await act(async () => botoes('Reagendar')[0].click());
    const antes = crm.tasks[2].reminderDate?.getTime() ?? 0;
    await act(async () => botoes('Em 3 dias')[0].click());
    await vi.waitFor(() => expect(crm.tasks[2].reminderDate?.getTime() ?? 0).toBeGreaterThan(antes + DIA));
  });

  it('sem login: pede para entrar no CRM e não consulta nada', async () => {
    await repo.sair();
    await montar();
    expect(el.textContent).toContain('Entre no CRM');
    expect(consultas()).toBe(0);
  });
});
