// @vitest-environment jsdom
//
// Prova, com um HTML SINTÉTICO que imita a lista do WhatsApp Web, que a barra de abas aparece,
// que os contadores batem e que o filtro esconde as linhas certas (sem reordenar o DOM).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { montarWhatsApp, nomesVisiveis, type LinhaFalsa } from './ajuda/whatsapp-falso';

// 2026-10-21 12:00 em Fortaleza.
const AGORA = new Date('2026-10-21T15:00:00Z');

const LINHAS: LinhaFalsa[] = [
  { nome: 'Ana Souza', data: '11:40', previa: 'Quanto fica o saco de 50 kg?' },
  { nome: 'Bruno Lima', data: '14/10/2026', previa: 'Segue o orçamento', minha: true },
  { nome: 'Carla Dias', data: '10:05', previa: 'Pode entregar amanhã?', naoLidas: 2 },
  { nome: 'Clientes Sal', data: '09:00', previa: 'Maria: bom dia', grupo: true },
  { nome: 'Eva Prado', data: '19/10/2026', previa: 'Combinado, aguardo', minha: true },
  { nome: 'Fábio Reis', data: 'Ontem', previa: 'obrigado!' },
];

let ctrl: ControladorCrm | null = null;

async function iniciar(): Promise<ControladorCrm> {
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
  return ctrl;
}

function barra(): ShadowRoot {
  const host = document.getElementById('vita-zap-barra');
  expect(host).not.toBeNull();
  return (host as HTMLElement).shadowRoot as ShadowRoot;
}

function abas(): Record<string, number> {
  const r: Record<string, number> = {};
  for (const b of barra().querySelectorAll('.aba')) r[(b.childNodes[0].textContent ?? '').trim()] = Number(b.querySelector('.n')?.textContent);
  return r;
}

function clicarAba(rotulo: string): void {
  const b = [...barra().querySelectorAll<HTMLButtonElement>('.aba')].find((x) => (x.childNodes[0].textContent ?? '').trim() === rotulo);
  if (!b) throw new Error(`aba "${rotulo}" não encontrada`);
  b.click();
}

beforeEach(() => {
  limparAvisos();
  instalarChromeFalso();
  montarWhatsApp(LINHAS);
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

describe('barra de abas injetada', () => {
  it('aparece acima da lista, em Shadow DOM, com os contadores', async () => {
    await iniciar();
    const host = document.getElementById('vita-zap-barra') as HTMLElement;
    expect(host.nextElementSibling?.id).toBe('pane-side');
    expect(host.shadowRoot).not.toBeNull();
    // o CSS do WhatsApp não vê o conteúdo: nada da barra está no DOM "normal"
    expect(document.querySelectorAll('.aba').length).toBe(0);
    expect(abas()).toEqual({ Todas: 6, 'Não lidas': 1, 'Precisa de resposta': 3, 'Aguardando resposta': 2 });
    expect(barra().textContent).toMatch(/já vistas/);
  });

  it('não mexe na ordem do DOM do WhatsApp', async () => {
    const antes = [...document.querySelectorAll('#lista > [role="listitem"]')].map((el) => el.getAttribute('data-nome'));
    const c = await iniciar();
    clicarAba('Precisa de resposta');
    c.ciclo();
    const depois = [...document.querySelectorAll('#lista > [role="listitem"]')].map((el) => el.getAttribute('data-nome'));
    expect(depois).toEqual(antes);
  });

  it('"Precisa de resposta": esconde as linhas que não batem (minhas, grupo) e encosta as outras no topo', async () => {
    await iniciar();
    clicarAba('Precisa de resposta');
    expect(nomesVisiveis()).toEqual(['Ana Souza', 'Carla Dias', 'Fábio Reis']);
    const pos = (nome: string) => (document.querySelector(`[data-nome="${nome}"]`) as HTMLElement).style.transform;
    expect(pos('Ana Souza')).toBe('translateY(0px)');
    expect(pos('Carla Dias')).toBe('translateY(72px)'); // sem buraco onde estava o Bruno
    expect(pos('Fábio Reis')).toBe('translateY(144px)');
  });

  it('"Aguardando resposta" mostra só as minhas, com o tempo decorrido na linha', async () => {
    await iniciar();
    clicarAba('Aguardando resposta');
    expect(nomesVisiveis()).toEqual(['Bruno Lima', 'Eva Prado']);
    const selo = (nome: string) => (document.querySelector(`[data-nome="${nome}"] [data-vita-zap-linha]`) as HTMLElement | null)?.shadowRoot?.textContent ?? '';
    expect(selo('Bruno Lima')).toContain('há 7 dias');
    expect(selo('Eva Prado')).toContain('há 2 dias');
  });

  it('"Não lidas" e voltar para "Todas" restaura tudo como estava', async () => {
    await iniciar();
    clicarAba('Não lidas');
    expect(nomesVisiveis()).toEqual(['Carla Dias']);
    clicarAba('Todas');
    expect(nomesVisiveis()).toHaveLength(6);
    const transforms = [...document.querySelectorAll<HTMLElement>('#lista > [role="listitem"]')].map((el) => el.style.transform);
    expect(transforms).toEqual(LINHAS.map((_, i) => `translateY(${i * 72}px)`));
    expect(document.querySelectorAll('[data-vita-zap-linha]').length).toBe(0);
  });

  it('"dispensar" tira a conversa de "Precisa de resposta" e o contador cai', async () => {
    await iniciar();
    clicarAba('Precisa de resposta');
    const dispensar = (document.querySelector('[data-nome="Ana Souza"] [data-vita-zap-linha]') as HTMLElement).shadowRoot?.querySelector<HTMLButtonElement>('button');
    expect(dispensar?.textContent).toBe('dispensar');
    dispensar?.click();
    await vi.waitFor(() => expect(nomesVisiveis()).toEqual(['Carla Dias', 'Fábio Reis']));
    expect(abas()['Precisa de resposta']).toBe(2);
  });

  it('o filtro "sem resposta há X dias" aparece na aba Aguardando e esconde as mais novas', async () => {
    await iniciar();
    clicarAba('Aguardando resposta');
    const chips = [...barra().querySelectorAll<HTMLButtonElement>('.chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(expect.arrayContaining(['qualquer prazo', '1 dia', '3 dias', '7 dias', '15 dias']));
    [...barra().querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.textContent?.trim() === '3 dias')?.click();
    expect(nomesVisiveis()).toEqual(['Bruno Lima']); // Eva tem 2 dias
    [...barra().querySelectorAll<HTMLButtonElement>('.chip')].find((c) => c.textContent?.trim() === '1 dia')?.click();
    expect(nomesVisiveis()).toEqual(['Bruno Lima', 'Eva Prado']);
  });

  it('o filtro não se aplica enquanto a busca do WhatsApp está com texto', async () => {
    const c = await iniciar();
    clicarAba('Precisa de resposta');
    expect(nomesVisiveis()).toHaveLength(3);
    (document.querySelector('input[role="textbox"]') as HTMLInputElement).value = 'ana';
    c.ciclo();
    expect(nomesVisiveis()).toHaveLength(6);
  });

  it('guarda o estado conforme as linhas aparecem (lista virtualizada)', async () => {
    const chrome = instalarChromeFalso();
    montarWhatsApp(LINHAS.slice(0, 3));
    const c = await iniciar();
    expect(abas().Todas).toBe(3);
    // o WhatsApp recicla as linhas: sai o começo da lista, entra o resto
    montarWhatsApp(LINHAS.slice(3));
    c.ciclo();
    c.ciclo();
    // a barra foi removida com o HTML novo; o ciclo a coloca de volta
    expect(abas().Todas).toBe(6);
    await c.estado.salvarAgora();
    const gravadas = chrome.dados.get('vz.conversas') as Record<string, unknown>;
    expect(Object.keys(gravadas)).toHaveLength(6);
  });

  it('degrada em silêncio se a lista não existe: sem erro e sem barra', async () => {
    document.body.innerHTML = '<div id="app">tela de carregamento</div>';
    await iniciar();
    expect(document.getElementById('vita-zap-barra')).toBeNull();
  });

  it('degrada em silêncio se o nome das linhas não é encontrado e avisa uma vez só', async () => {
    const avisos: unknown[][] = [];
    const original = console.warn;
    console.warn = (...a: unknown[]) => void avisos.push(a);
    try {
      document.querySelectorAll('#lista [title]').forEach((el) => el.removeAttribute('title'));
      const c = await iniciar();
      c.ciclo();
      c.ciclo();
      expect(abas().Todas).toBe(0);
      expect(avisos.filter((a) => String(a[0]).includes('tituloLinha'))).toHaveLength(1);
    } finally {
      console.warn = original;
    }
  });
});
