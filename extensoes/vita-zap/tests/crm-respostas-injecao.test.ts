// @vitest-environment jsdom
//
// Respostas rápidas no WhatsApp (HTML SINTÉTICO): botão junto à caixa, menu, atalho "/xx".
// Escolher um modelo só COLA o texto na caixa; nenhuma tecla é simulada.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import type { RespostaRapida } from '../src/shared/crm-tipos';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { montarWhatsApp, type LinhaFalsa } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z');
const LINHAS: LinhaFalsa[] = [{ nome: 'Maria Souza', data: '11:40', previa: 'Quanto fica?' }];
const MODELOS: RespostaRapida[] = [
  { id: 'r1', titulo: 'Orçamento', atalho: 'orc', texto: 'Olá, {primeiro_nome}! Segue o orçamento.' },
  { id: 'r2', titulo: 'Prazo', atalho: 'prazo', texto: 'Entregamos em 3 dias úteis.' },
];

let ctrl: ControladorCrm | null = null;
let chrome: ChromeFalso;
let teclas = 0;

const sombra = (id: string): ShadowRoot => {
  const host = document.getElementById(id);
  if (!host?.shadowRoot) throw new Error(`host ${id} não encontrado`);
  return host.shadowRoot;
};
const popover = () => sombra('vita-zap-overlay');
const compositor = () => document.querySelector('#main footer [contenteditable]') as HTMLElement;

function botao(raiz: ParentNode, texto: string): HTMLButtonElement {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
}

/** Botão "Inserir" do modelo cujo título é `titulo`. */
function inserir(titulo: string): HTMLButtonElement {
  const item = [...popover().querySelectorAll('.item')].find((i) => i.querySelector('strong')?.textContent === titulo);
  if (!item) throw new Error(`modelo "${titulo}" não encontrado`);
  return botao(item, 'Inserir');
}

const iconeDaCaixa = (acao: 'respostas' | 'lembrete'): HTMLButtonElement => sombra('vita-zap-respostas').querySelector(`[data-acao="${acao}"]`) as HTMLButtonElement;
const abrirMenu = () => iconeDaCaixa('respostas').click();

function digitar(texto: string): void {
  compositor().textContent = texto;
  compositor().dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  limparAvisos();
  chrome = instalarChromeFalso({ 'vz.respostas': MODELOS });
  montarWhatsApp(LINHAS, 'Maria Souza');
  // jsdom não tem execCommand: simula o "inserir texto" do editor (substitui se há seleção, senão acrescenta).
  (document as unknown as { execCommand: unknown }).execCommand = (cmd: string, _ui: boolean, valor?: string) => {
    const el = compositor();
    const sel = window.getSelection();
    const colapsado = !sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed;
    if (cmd === 'insertText') el.textContent = colapsado ? (el.textContent ?? '') + (valor ?? '') : (valor ?? '');
    if (cmd === 'delete') el.textContent = '';
    return true;
  };
  teclas = 0;
  for (const tipo of ['keydown', 'keyup', 'keypress']) document.addEventListener(tipo, () => (teclas += 1), true);
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

async function iniciar(): Promise<ControladorCrm> {
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
  return ctrl;
}

describe('botão e menu', () => {
  it('os ícones entram na caixa, à esquerda do microfone (Shadow DOM), e somem sem conversa aberta', async () => {
    const c = await iniciar();
    const host = document.getElementById('vita-zap-respostas') as HTMLElement;
    expect(host.shadowRoot).not.toBeNull();
    const microfone = document.querySelector('#main footer button[aria-label="Mensagem de voz"]') as HTMLElement;
    expect(host.nextElementSibling).toBe(microfone);
    expect(host.parentElement).toBe(microfone.parentElement);
    expect(iconeDaCaixa('lembrete').title).toBe('Lembrete de follow-up');
    expect(iconeDaCaixa('respostas').title).toContain('Respostas rápidas');
    montarWhatsApp(LINHAS, null);
    c.ciclo();
    expect(document.getElementById('vita-zap-respostas')).toBeNull();
  });

  it('lista os modelos com atalho e filtra pela busca', async () => {
    await iniciar();
    abrirMenu();
    expect(popover().textContent).toContain('Orçamento');
    expect(popover().textContent).toContain('/orc');
    const busca = popover().querySelector('input') as HTMLInputElement;
    busca.value = 'praz';
    busca.dispatchEvent(new Event('input'));
    expect(popover().textContent).toContain('Prazo');
    expect(popover().textContent).not.toContain('Orçamento');
    busca.value = 'zzz';
    busca.dispatchEvent(new Event('input'));
    expect(popover().textContent).toContain('Sem resultados');
  });

  it('primeira vez (nada gravado): cria um modelo de exemplo', async () => {
    chrome = instalarChromeFalso();
    montarWhatsApp(LINHAS, 'Maria Souza');
    const c = await iniciar();
    await c.estado.salvarAgora();
    const gravadas = chrome.dados.get('vz.respostas') as RespostaRapida[];
    expect(gravadas).toHaveLength(1);
    expect(gravadas[0].atalho).toBe('oi');
  });
});

describe('inserir: cola e para', () => {
  it('cola o texto com {primeiro_nome} resolvido, sem teclas e sem enviar', async () => {
    await iniciar();
    abrirMenu();
    inserir('Orçamento').click();
    expect(compositor().textContent).toBe('Olá, Maria! Segue o orçamento.');
    expect(teclas).toBe(0);
    expect(document.getElementById('vita-zap-overlay')?.shadowRoot?.querySelector('.pop')).toBeNull(); // menu fechou
  });

  it('caixa com texto: pergunta Substituir / Adicionar / Cancelar', async () => {
    await iniciar();
    compositor().textContent = 'Bom dia! ';
    abrirMenu();
    inserir('Prazo').click();
    expect(popover().textContent).toContain('A caixa já tem texto');
    botao(popover(), 'Cancelar').click();
    expect(compositor().textContent).toBe('Bom dia! ');
    inserir('Prazo').click();
    botao(popover(), 'Adicionar').click();
    expect(compositor().textContent).toBe('Bom dia! Entregamos em 3 dias úteis.');
  });

  it('Substituir troca o que estava na caixa', async () => {
    await iniciar();
    compositor().textContent = 'rascunho velho';
    abrirMenu();
    inserir('Prazo').click();
    botao(popover(), 'Substituir').click();
    expect(compositor().textContent).toBe('Entregamos em 3 dias úteis.');
  });
});

describe('atalho digitado na caixa', () => {
  it('"/orc" abre o menu filtrado e Inserir troca o "/orc" pelo texto', async () => {
    await iniciar();
    digitar('/orc');
    expect(popover().textContent).toContain('Atalho digitado: /orc');
    expect(popover().textContent).toContain('Orçamento');
    expect(popover().textContent).not.toContain('Prazo');
    inserir('Orçamento').click();
    expect(compositor().textContent).toBe('Olá, Maria! Segue o orçamento.');
    expect(teclas).toBe(0);
  });

  it('continua filtrando enquanto digita e fecha quando deixa de ser um atalho', async () => {
    await iniciar();
    digitar('/');
    expect(popover().textContent).toContain('Prazo');
    digitar('/pra');
    expect(popover().textContent).not.toContain('Orçamento');
    digitar('olá');
    expect(document.getElementById('vita-zap-overlay')?.shadowRoot?.querySelector('.pop')).toBeNull();
  });

  it('texto comum na caixa não abre nada', async () => {
    await iniciar();
    digitar('Bom dia, tudo bem?');
    expect(document.getElementById('vita-zap-overlay')?.shadowRoot?.querySelector('.pop') ?? null).toBeNull();
  });
});

describe('criar, editar e excluir modelo', () => {
  it('novo modelo com atalho e variáveis; o atalho repetido é recusado', async () => {
    await iniciar();
    abrirMenu();
    botao(popover(), 'Novo modelo').click();
    (popover().querySelector('input[aria-label="Título do modelo"]') as HTMLInputElement).value = 'Agradecimento';
    (popover().querySelector('input[aria-label="Atalho do modelo"]') as HTMLInputElement).value = '/orc'; // já existe
    (popover().querySelector('textarea') as HTMLTextAreaElement).value = 'Obrigado, {primeiro_nome}!';
    botao(popover(), 'Salvar').click();
    await vi.waitFor(() => expect(popover().textContent).toContain('já existe'));
    (popover().querySelector('input[aria-label="Atalho do modelo"]') as HTMLInputElement).value = '/obg';
    botao(popover(), 'Salvar').click();
    await vi.waitFor(() => expect((chrome.dados.get('vz.respostas') as RespostaRapida[]).some((r) => r.atalho === 'obg')).toBe(true));
    expect(popover().textContent).toContain('Agradecimento');
  });

  it('avisa de variável desconhecida enquanto edita', async () => {
    await iniciar();
    abrirMenu();
    botao(popover(), 'Novo modelo').click();
    const t = popover().querySelector('textarea') as HTMLTextAreaElement;
    t.value = 'Oi {empresa}';
    t.dispatchEvent(new Event('input'));
    expect(popover().textContent).toContain('Variável desconhecida: {empresa}');
  });

  it('editar e excluir', async () => {
    await iniciar();
    abrirMenu();
    const item = [...popover().querySelectorAll('.item')].find((i) => i.querySelector('strong')?.textContent === 'Prazo') as HTMLElement;
    botao(item, 'Editar').click();
    (popover().querySelector('textarea') as HTMLTextAreaElement).value = 'Entregamos em 5 dias úteis.';
    botao(popover(), 'Salvar').click();
    await vi.waitFor(() => expect((chrome.dados.get('vz.respostas') as RespostaRapida[]).find((r) => r.id === 'r2')?.texto).toBe('Entregamos em 5 dias úteis.'));
    const item2 = [...popover().querySelectorAll('.item')].find((i) => i.querySelector('strong')?.textContent === 'Prazo') as HTMLElement;
    botao(item2, 'Editar').click();
    botao(popover(), 'Excluir').click();
    await vi.waitFor(() => expect((chrome.dados.get('vz.respostas') as RespostaRapida[]).map((r) => r.id)).toEqual(['r1']));
  });
});
