// @vitest-environment jsdom
//
// Lembretes dentro do WhatsApp Web (HTML SINTÉTICO): botão no cabeçalho, painel de novo lembrete,
// central de vencidos e "abrir a conversa e COLAR o rascunho" (sem enviar nada).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import { instanteNoFuso, prazoRapido } from '../src/shared/crm-lembretes';
import { CHAVE_ACAO_PENDENTE } from '../src/shared/crm-store';
import type { Lembrete } from '../src/shared/crm-tipos';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { montarWhatsApp, type LinhaFalsa } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z');
const LINHAS: LinhaFalsa[] = [{ nome: 'Ana Souza', data: '11:40', previa: 'Quanto fica o saco?' }];

let ctrl: ControladorCrm | null = null;
let chrome: ChromeFalso;
let eventosDeTeclado = 0;

function sombra(id: string): ShadowRoot {
  const host = document.getElementById(id);
  if (!host?.shadowRoot) throw new Error(`host ${id} não encontrado`);
  return host.shadowRoot;
}

const popover = () => sombra('vita-zap-overlay');
const compositor = () => document.querySelector('#main footer [contenteditable]') as HTMLElement;

function botao(raiz: ParentNode, texto: string): HTMLButtonElement {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
}

async function iniciar(): Promise<ControladorCrm> {
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
  return ctrl;
}

beforeEach(() => {
  limparAvisos();
  chrome = instalarChromeFalso({ 'vz.config': { barraSuperior: false } });
  montarWhatsApp(LINHAS, 'Ana Souza');
  // jsdom não tem execCommand: simula só "inserir texto" / "apagar" no compositor (como o editor faria).
  (document as unknown as { execCommand: unknown }).execCommand = (cmd: string, _ui: boolean, valor?: string) => {
    const el = compositor();
    if (cmd === 'insertText') el.textContent = (el.textContent ?? '') + (valor ?? '');
    if (cmd === 'delete') el.textContent = '';
    return true;
  };
  eventosDeTeclado = 0;
  for (const tipo of ['keydown', 'keyup', 'keypress']) document.addEventListener(tipo, () => (eventosDeTeclado += 1), true);
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

describe('botão de lembrete no cabeçalho da conversa', () => {
  it('aparece dentro do cabeçalho, em Shadow DOM, só com conversa aberta', async () => {
    const c = await iniciar();
    const host = document.getElementById('vita-zap-cabecalho') as HTMLElement;
    expect(host.parentElement?.tagName).toBe('HEADER');
    expect(host.shadowRoot?.querySelector('[title="Lembrete de follow-up"]')).not.toBeNull();
    montarWhatsApp(LINHAS, null);
    c.ciclo();
    expect(document.getElementById('vita-zap-cabecalho')).toBeNull();
  });

  it('data rápida + rascunho: salva o lembrete no storage (sem enviar nada)', async () => {
    await iniciar();
    const abrir = sombra('vita-zap-cabecalho').querySelector<HTMLButtonElement>('[title="Lembrete de follow-up"]') as HTMLButtonElement;
    abrir.click();
    botao(popover(), 'Amanhã 9h').click();
    expect(popover().textContent).toContain('Avisar em: amanhã 09:00');
    const rascunho = popover().querySelector('textarea') as HTMLTextAreaElement;
    rascunho.value = 'Oi {primeiro_nome}, conseguiu ver o orçamento?';
    botao(popover(), 'Salvar lembrete').click();
    await vi.waitFor(() => expect((chrome.dados.get('vz.lembretes') as Lembrete[] | undefined)?.length).toBe(1));
    const [l] = chrome.dados.get('vz.lembretes') as Lembrete[];
    expect(l).toMatchObject({ nome: 'Ana Souza', status: 'pendente', rascunho: 'Oi {primeiro_nome}, conseguiu ver o orçamento?' });
    expect(l.venceEm).toBe(prazoRapido('amanha9h', AGORA));
    // o lembrete é do contato (id interno), não do nome
    const [contatoCriado] = Object.values(chrome.dados.get('vz.contatos') as Record<string, { id: string; nome: string }>);
    expect(l.contatoId).toBe(contatoCriado.id);
    expect(contatoCriado.id).not.toContain('ana');
    // nada foi colado nem digitado agora: o rascunho só vai para a caixa quando o aviso for aberto
    expect(compositor().textContent).toBe('');
    // o botão ganha o selo de 1 lembrete
    await vi.waitFor(() => expect(sombra('vita-zap-cabecalho').querySelector('.selo')?.textContent).toBe('1'));
  });

  it('data personalizada no passado é recusada', async () => {
    await iniciar();
    (sombra('vita-zap-cabecalho').querySelector('[title="Lembrete de follow-up"]') as HTMLButtonElement).click();
    const campo = popover().querySelector('input[type="datetime-local"]') as HTMLInputElement;
    campo.value = '2026-10-20T09:00';
    campo.dispatchEvent(new Event('input'));
    botao(popover(), 'Salvar lembrete').click();
    await vi.waitFor(() => expect(popover().textContent).toContain('já passou'));
    expect(chrome.dados.get('vz.lembretes')).toBeUndefined();
  });

  it('data personalizada no futuro vale no fuso de Fortaleza', async () => {
    await iniciar();
    (sombra('vita-zap-cabecalho').querySelector('[title="Lembrete de follow-up"]') as HTMLButtonElement).click();
    const campo = popover().querySelector('input[type="datetime-local"]') as HTMLInputElement;
    campo.value = '2026-10-23T14:30';
    campo.dispatchEvent(new Event('input'));
    botao(popover(), 'Salvar lembrete').click();
    await vi.waitFor(() => expect(chrome.dados.get('vz.lembretes')).toBeDefined());
    expect((chrome.dados.get('vz.lembretes') as Lembrete[])[0].venceEm).toBe(instanteNoFuso('2026-10-23', 14, 30));
  });
});

describe('abrir pelo aviso: cola o rascunho e para', () => {
  async function pedirAbertura(rascunho: string | undefined): Promise<void> {
    await (chrome.chrome as { storage: { local: { set: (o: unknown) => Promise<void> } } }).storage.local.set({
      [CHAVE_ACAO_PENDENTE]: { tipo: 'abrirConversa', nome: 'Ana Souza', rascunho, ts: Date.now() },
    });
  }

  it('o pedido do service worker abre a conversa e cola o rascunho com {primeiro_nome} resolvido', async () => {
    await iniciar();
    await pedirAbertura('Oi {primeiro_nome}, tudo bem?');
    await vi.waitFor(() => expect(compositor().textContent).toBe('Oi Ana, tudo bem?'));
    await vi.waitFor(() => expect(popover().textContent).toContain('Confira e aperte Enter')); // terminou
    // o pedido foi consumido (não roda duas vezes)
    await vi.waitFor(() => expect(chrome.dados.has(CHAVE_ACAO_PENDENTE)).toBe(false));
    // PARA aí: nenhum evento de teclado, nenhuma mensagem enviada
    expect(eventosDeTeclado).toBe(0);
    expect(compositor().textContent).toBe('Oi Ana, tudo bem?');
  });

  it('não sobrescreve um texto que o usuário já tinha na caixa', async () => {
    compositor().textContent = 'meu rascunho';
    await iniciar();
    await pedirAbertura('Oi!');
    await vi.waitFor(() => expect(popover().textContent).toContain('já tem um rascunho'));
    expect(compositor().textContent).toBe('meu rascunho');
  });

  it('pedido antigo (mais de 15 minutos) é descartado', async () => {
    await iniciar();
    await (chrome.chrome as { storage: { local: { set: (o: unknown) => Promise<void> } } }).storage.local.set({
      [CHAVE_ACAO_PENDENTE]: { tipo: 'abrirConversa', nome: 'Ana Souza', rascunho: 'velho', ts: Date.now() - 20 * 60_000 },
    });
    await vi.waitFor(() => expect(chrome.dados.has(CHAVE_ACAO_PENDENTE)).toBe(false));
    expect(compositor().textContent).toBe('');
  });
});

describe('central de lembretes (sino da barra)', () => {
  const vencido: Lembrete = { id: 'v1', contatoId: 'id-ana-souza', nome: 'Ana Souza', venceEm: instanteNoFuso('2026-10-20', 9), criadoEm: 1, status: 'disparado', rascunho: 'Oi Ana!' };
  const proximo: Lembrete = { id: 'p1', contatoId: 'id-bruno', nome: 'Bruno Lima', venceEm: instanteNoFuso('2026-10-25', 9), criadoEm: 1, status: 'pendente' };

  beforeEach(() => {
    chrome = instalarChromeFalso({ 'vz.config': { barraSuperior: false }, 'vz.lembretes': [vencido, proximo] });
    montarWhatsApp(LINHAS, 'Ana Souza');
  });

  it('o sino mostra o número de vencidos e a central separa Vencidos / Hoje / Próximos', async () => {
    await iniciar();
    const bar = sombra('vita-zap-barra');
    expect(bar.querySelector('.selo')?.textContent).toBe('1');
    (bar.querySelector('[title^="Lembretes"]') as HTMLButtonElement).click();
    const texto = popover().textContent ?? '';
    expect(texto).toContain('Vencidos (1)');
    expect(texto).toContain('Hoje (0)');
    expect(texto).toContain('Próximos (1)');
    expect(texto).toContain('ontem 09:00');
  });

  it('Concluir tira da central e do contador; a mudança é gravada', async () => {
    await iniciar();
    (sombra('vita-zap-barra').querySelector('[title^="Lembretes"]') as HTMLButtonElement).click();
    botao(popover(), 'Concluir').click();
    await vi.waitFor(() => expect(popover().textContent).toContain('Vencidos (0)'));
    await vi.waitFor(() => expect((chrome.dados.get('vz.lembretes') as Lembrete[]).find((l) => l.id === 'v1')?.status).toBe('concluido'));
  });

  it('Adiar volta a pendente para amanhã às 9h', async () => {
    await iniciar();
    (sombra('vita-zap-barra').querySelector('[title^="Lembretes"]') as HTMLButtonElement).click();
    botao(popover(), 'Adiar').click();
    await vi.waitFor(() => expect((chrome.dados.get('vz.lembretes') as Lembrete[]).find((l) => l.id === 'v1')).toMatchObject({ status: 'pendente', venceEm: prazoRapido('amanha9h', AGORA) }));
  });

  it('Abrir cola o rascunho na conversa e fecha a central', async () => {
    await iniciar();
    (sombra('vita-zap-barra').querySelector('[title^="Lembretes"]') as HTMLButtonElement).click();
    botao(popover(), 'Abrir').click();
    await vi.waitFor(() => expect(compositor().textContent).toBe('Oi Ana!'));
    await vi.waitFor(() => expect(popover().textContent).toContain('Confira e aperte Enter'));
  });
});
