// @vitest-environment jsdom
//
// "Acompanhar" no WhatsApp Web (HTML sintético + CRM falso): botão na faixa do lead (põe/tira a etiqueta
// "Acompanhar"), selo "Em acompanhamento", "Marcar convertido" tira a etiqueta, aba "Acompanhar" na barra
// superior (contador, destaque de vencido, filtro da lista) e consumo do CRM (nada sem clique, nenhum polling).
// Nenhuma mensagem de WhatsApp é enviada em nenhum caminho.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';
import { montarWhatsApp, nomesVisiveis, type LinhaFalsa } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z'); // 12:00 em Fortaleza
const LINHAS: LinhaFalsa[] = [
  { nome: 'Ana Souza Cliente', data: '11:40', previa: 'Quanto fica?' },
  { nome: 'Bruno Lima Cliente', data: '10:05', previa: 'Bom dia' },
];

let ctrl: ControladorCrm | null = null;
let crm: CrmFalso;
let servico: ServicoCrm;
let repo: ReturnType<typeof criarRepositorioCRM>;

const sombra = (id: string): ShadowRoot => document.getElementById(id)!.shadowRoot!;
const faixa = (): ShadowRoot | null => document.getElementById('vita-zap-lead')?.shadowRoot ?? null;
const textoFaixa = (): string => faixa()?.textContent ?? '';
const overlay = (): ShadowRoot => sombra('vita-zap-overlay');
const topo = (): ShadowRoot => sombra('vita-zap-topo');
const botao = (raiz: ParentNode, texto: string): HTMLButtonElement => {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
};
const abaAcompanhar = (): HTMLButtonElement | undefined => topo().querySelector<HTMLButtonElement>('.taba[data-aba="acompanhar"]') ?? undefined;
const contador = (): number => Number(abaAcompanhar()?.querySelector('.n')?.textContent);

async function iniciar(logar = true): Promise<void> {
  if (logar) {
    await servico.definirUrl(BASE);
    expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
  }
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0, repositorio: repo });
}

beforeEach(() => {
  limparAvisos();
  instalarChromeFalso();
  crm = criarCrmFalso([
    task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', tags: ['quente'], reminderDate: new Date('2026-10-22T12:00:00Z'), lastContactedAt: new Date('2026-10-20T15:00:00Z'), contactCount: 2 }),
    task({ id: 2, title: 'Mercado do Bruno', phone: '84911112222', tags: ['Acompanhar'], reminderDate: new Date('2026-10-20T12:00:00Z') }),
  ]);
  const local = new RepositorioLocal();
  servico = new ServicoCrm(local, crm.transporte, () => AGORA.getTime());
  repo = criarRepositorioCRM(local, servico);
  montarWhatsApp(LINHAS, 'Ana Souza Cliente'); // as mensagens da conversa têm o telefone 5584999990000
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

describe('botão Acompanhar na faixa do lead', () => {
  it('lead sem a etiqueta: botão "Acompanhar" e nenhum selo; um clique põe a etiqueta, mostra "Em acompanhamento" e vira "Parar de acompanhar"', async () => {
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    expect(textoFaixa()).not.toContain('Em acompanhamento');
    botao(faixa()!, 'Acompanhar').click();
    await vi.waitFor(() => expect(crm.tasks[0].tags).toEqual(['quente', 'Acompanhar']));
    await vi.waitFor(() => expect(textoFaixa()).toContain('Em acompanhamento'));
    expect(textoFaixa()).toContain('Parar de acompanhar');
    expect(textoFaixa()).toContain('quente');
    expect([...faixa()!.querySelectorAll('.tag.neutra')].map((e) => e.textContent)).not.toContain('Acompanhar'); // o selo já a representa
  });

  it('"Parar de acompanhar" tira só essa etiqueta e o selo some', async () => {
    crm.tasks[0].tags = ['quente', 'Acompanhar'];
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Em acompanhamento'));
    botao(faixa()!, 'Parar de acompanhar').click();
    await vi.waitFor(() => expect(crm.tasks[0].tags).toEqual(['quente']));
    await vi.waitFor(() => expect(textoFaixa()).not.toContain('Em acompanhamento'));
    expect(botao(faixa()!, 'Acompanhar')).toBeTruthy();
  });

  it('só chama o CRM no clique: ler o lead + clicar = getById/update do clique, sem consulta da lista nem lembretes extras', async () => {
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    await new Promise((r) => setTimeout(r, 100));
    const antes = crm.requisicoes.length;
    botao(faixa()!, 'Acompanhar').click();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Em acompanhamento'));
    const novas = crm.requisicoes.slice(antes).map((r) => r.url.pathname.replace('/api/trpc/', ''));
    expect(novas).toEqual(['tasks.getById', 'tasks.update']);
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(0);
  });

  it('Marcar convertido tira a etiqueta Acompanhar (e o selo) na mesma ação, sem chamada de escrita extra', async () => {
    crm.tasks[0].tags = ['quente', 'Acompanhar'];
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Em acompanhamento'));
    botao(faixa()!, 'Marcar convertido').click();
    botao(overlay(), 'Marcar convertido').click();
    await vi.waitFor(() => expect(crm.tasks[0].convertedAt).not.toBeNull());
    expect(crm.tasks[0].tags).toEqual(['quente', 'ativo']);
    await vi.waitFor(() => expect(textoFaixa()).not.toContain('Em acompanhamento'));
    expect(textoFaixa()).toContain('Convertido');
    expect(crm.chamadas('tasks.update')).toHaveLength(0);
    expect(crm.chamadas('tasks.toggleConverted')).toHaveLength(1);
  });

  it('erro do CRM: aviso em português e a etiqueta não muda', async () => {
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    crm.semRede = true;
    botao(faixa()!, 'Acompanhar').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('guardei a ação'));
    expect(crm.tasks[0].tags).toEqual(['quente']);
  });
});

describe('aba Acompanhar na barra superior', () => {
  it('sem login a aba não existe', async () => {
    await iniciar(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(abaAcompanhar()).toBeUndefined();
    expect(crm.requisicoes).toHaveLength(0);
  });

  it('com login: o contador mostra os leads em acompanhamento que a extensão já viu, sem consultar a lista no CRM', async () => {
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    botao(faixa()!, 'Acompanhar').click();
    await vi.waitFor(() => expect(abaAcompanhar()).toBeDefined());
    await vi.waitFor(() => expect(contador()).toBe(1));
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(0);
  });

  it('clicar na aba faz UMA consulta ao CRM, traz o lead que só está no CRM, filtra a lista do WhatsApp e destaca o vencido', async () => {
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    botao(faixa()!, 'Acompanhar').click();
    await vi.waitFor(() => expect(contador()).toBe(1));
    expect(abaAcompanhar()!.classList.contains('alerta')).toBe(false);
    expect(nomesVisiveis()).toEqual(['Ana Souza Cliente', 'Bruno Lima Cliente']);
    abaAcompanhar()!.click();
    await vi.waitFor(() => expect(crm.chamadas('tasks.acompanhando')).toHaveLength(1));
    await vi.waitFor(() => expect(contador()).toBe(2)); // o lead do Bruno (etiquetado no site) veio da consulta
    await vi.waitFor(() => expect(abaAcompanhar()!.classList.contains('alerta')).toBe(true)); // lembrete do Bruno vencido
    await vi.waitFor(() => expect(nomesVisiveis()).toEqual(['Ana Souza Cliente']));
    // clicar de novo (dentro de 15 min) não consulta de novo
    abaAcompanhar()!.click();
    await new Promise((r) => setTimeout(r, 100));
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(1);
  });

  it('nada de polling: o ciclo periódico e o foco da janela não consultam a lista no CRM', async () => {
    await iniciar();
    await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
    for (let i = 0; i < 5; i += 1) {
      ctrl!.ciclo();
      window.dispatchEvent(new Event('focus'));
    }
    await new Promise((r) => setTimeout(r, 120));
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(0);
  });
});
