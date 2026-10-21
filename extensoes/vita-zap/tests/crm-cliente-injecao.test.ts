// @vitest-environment jsdom
//
// Painel do cliente (fase, etiquetas com cor, notas) e o chip "Etiquetas" que filtra a lista,
// sobre o HTML SINTÉTICO do WhatsApp.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparAvisos } from '../src/content/crm/ui';
import type { Contato, Etiqueta } from '../src/shared/crm-tipos';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { montarWhatsApp, nomesVisiveis, type LinhaFalsa } from './ajuda/whatsapp-falso';

const AGORA = new Date('2026-10-21T15:00:00Z');
const LINHAS: LinhaFalsa[] = [
  { nome: 'Ana Souza', data: '11:40', previa: 'Quanto fica o saco?' },
  { nome: 'Bruno Lima', data: '10:20', previa: 'Bom dia' },
  { nome: 'Carla Dias', data: 'Ontem', previa: 'Segue o pedido', minha: true },
];

let ctrl: ControladorCrm | null = null;
let chrome: ChromeFalso;

const sombra = (id: string): ShadowRoot => {
  const host = document.getElementById(id);
  if (!host?.shadowRoot) throw new Error(`host ${id} não encontrado`);
  return host.shadowRoot;
};
const popover = () => sombra('vita-zap-overlay');

function botao(raiz: ParentNode, texto: string): HTMLButtonElement {
  const b = [...raiz.querySelectorAll<HTMLButtonElement>('button')].find((x) => x.textContent?.trim() === texto);
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
}

const abrirPainelCliente = () => (sombra('vita-zap-cabecalho').querySelector('[title^="Cliente"]') as HTMLButtonElement).click();
const contatos = () => chrome.dados.get('vz.contatos') as Record<string, Contato> | undefined;

async function iniciar(): Promise<ControladorCrm> {
  ctrl = await iniciarCrm({ agora: () => AGORA, periodicoMs: 0 });
  return ctrl;
}

beforeEach(() => {
  limparAvisos();
  chrome = instalarChromeFalso();
  montarWhatsApp(LINHAS, 'Ana Souza');
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

describe('painel do cliente no cabeçalho', () => {
  it('fase do funil: marcar, trocar e desmarcar', async () => {
    await iniciar();
    abrirPainelCliente();
    botao(popover(), 'Negociando').click();
    await vi.waitFor(() => expect(contatos()?.['ana souza']?.fase).toBe('negociando'));
    botao(popover(), 'Fechado').click();
    await vi.waitFor(() => expect(contatos()?.['ana souza']?.fase).toBe('fechado'));
    botao(popover(), 'Fechado').click(); // de novo: tira a fase
    await vi.waitFor(() => expect(contatos()?.['ana souza']?.fase).toBeUndefined());
  });

  it('cria etiqueta com cor, aplica ao contato e recusa nome repetido', async () => {
    await iniciar();
    abrirPainelCliente();
    botao(popover(), 'Nova').click();
    const nome = popover().querySelector('input') as HTMLInputElement;
    nome.value = 'Cliente fiel';
    (popover().querySelector('.cor[title="#8e24aa"]') as HTMLButtonElement).click();
    botao(popover(), 'Criar e aplicar').click();
    await vi.waitFor(() => expect(chrome.dados.get('vz.etiquetas')).toBeDefined());
    const [e] = chrome.dados.get('vz.etiquetas') as Etiqueta[];
    expect(e).toMatchObject({ nome: 'Cliente fiel', cor: '#8e24aa' });
    expect(contatos()?.['ana souza']?.etiquetas).toEqual([e.id]);
    // a etiqueta aparece como chip colorido (marcada)
    const chip = botao(popover(), 'Cliente fiel');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.getAttribute('style')).toContain('#8e24aa');
    // outra com o mesmo nome: erro, nada criado
    botao(popover(), 'Nova').click();
    (popover().querySelector('input') as HTMLInputElement).value = 'cliente FIEL';
    botao(popover(), 'Criar e aplicar').click();
    expect(popover().textContent).toContain('Já existe uma etiqueta');
    expect((chrome.dados.get('vz.etiquetas') as Etiqueta[]).length).toBe(1);
  });

  it('notas: salvar, editar e excluir (com confirmação)', async () => {
    await iniciar();
    abrirPainelCliente();
    const campo = popover().querySelector('textarea') as HTMLTextAreaElement;
    campo.value = 'Quer 200 sacos para dia 30';
    botao(popover(), 'Salvar nota').click();
    await vi.waitFor(() => expect(contatos()?.['ana souza']?.notas).toHaveLength(1));
    expect(popover().textContent).toContain('Quer 200 sacos para dia 30');
    expect(campo.value).toBe('');

    botao(popover(), 'Editar').click();
    const edicao = popover().querySelectorAll('textarea')[1] as HTMLTextAreaElement;
    edicao.value = 'Quer 300 sacos para dia 30';
    botao(popover(), 'Salvar').click();
    await vi.waitFor(() => expect(contatos()?.['ana souza']?.notas[0].texto).toBe('Quer 300 sacos para dia 30'));
    expect(popover().textContent).toContain('(editada)');

    botao(popover(), 'Excluir').click(); // pede confirmação
    expect(contatos()?.['ana souza']?.notas).toHaveLength(1);
    botao(popover(), 'Confirmar').click();
    await vi.waitFor(() => expect(contatos()?.['ana souza']?.notas).toHaveLength(0));
  });

  it('nota vazia é recusada', async () => {
    await iniciar();
    abrirPainelCliente();
    botao(popover(), 'Salvar nota').click();
    expect(popover().textContent).toContain('Escreva a nota');
    expect(contatos()).toBeUndefined();
  });

  it('o botão mostra o número de notas', async () => {
    chrome = instalarChromeFalso({ 'vz.contatos': { 'ana souza': { chave: 'ana souza', nome: 'Ana Souza', etiquetas: [], notas: [{ id: 'n', texto: 'x', criadaEm: 1 }, { id: 'm', texto: 'y', criadaEm: 2 }], criadoEm: 1, atualizadoEm: 1 } } });
    montarWhatsApp(LINHAS, 'Ana Souza');
    await iniciar();
    expect(sombra('vita-zap-cabecalho').querySelector('[title^="Cliente"] .selo')?.textContent).toBe('2');
  });

  it('"Dispensar" tira a conversa de Precisa de resposta; "Voltar para a lista" a devolve', async () => {
    const c = await iniciar();
    const precisa = () => Number([...sombra('vita-zap-barra').querySelectorAll('.aba')].find((b) => b.textContent?.startsWith('Precisa'))?.querySelector('.n')?.textContent);
    expect(precisa()).toBe(2);
    abrirPainelCliente();
    botao(popover(), 'Dispensar: não preciso responder').click();
    c.ciclo();
    expect(precisa()).toBe(1);
    botao(popover(), 'Voltar para a lista').click();
    c.ciclo();
    expect(precisa()).toBe(2);
  });
});

describe('chip "Etiquetas" filtra a lista', () => {
  const contato = (nome: string, extra: Partial<Contato>): Contato => ({ chave: nome.toLowerCase(), nome, etiquetas: [], notas: [], criadoEm: 1, atualizadoEm: 1, ...extra });

  beforeEach(() => {
    chrome = instalarChromeFalso({
      'vz.etiquetas': [{ id: 'e1', nome: 'Quente', cor: '#c62828' }, { id: 'e2', nome: 'Cliente fiel', cor: '#8e24aa' }],
      'vz.contatos': {
        'ana souza': contato('Ana Souza', { etiquetas: ['e1'] }),
        'bruno lima': contato('Bruno Lima', { etiquetas: ['e2'], fase: 'negociando' }),
      },
    });
    montarWhatsApp(LINHAS, null);
  });

  const chip = () => [...sombra('vita-zap-barra').querySelectorAll<HTMLButtonElement>('.chip')].find((b) => b.textContent?.startsWith('Etiquetas')) as HTMLButtonElement;

  it('por etiqueta: só as conversas de contatos com ela', async () => {
    await iniciar();
    chip().click();
    botao(popover(), 'Quente').click();
    expect(nomesVisiveis()).toEqual(['Ana Souza']);
    expect(chip().textContent).toContain('Etiquetas (1)');
    botao(popover(), 'Cliente fiel').click(); // duas etiquetas: qualquer uma
    expect(nomesVisiveis()).toEqual(['Ana Souza', 'Bruno Lima']);
    botao(popover(), 'Limpar filtro').click();
    expect(nomesVisiveis()).toHaveLength(3);
  });

  it('por fase do funil, e junto com a aba', async () => {
    const c = await iniciar();
    chip().click();
    botao(popover(), 'Negociando').click();
    expect(nomesVisiveis()).toEqual(['Bruno Lima']);
    // aba "Aguardando resposta" + fase Negociando: o Bruno falou por último, então não aparece
    [...sombra('vita-zap-barra').querySelectorAll<HTMLButtonElement>('.aba')].find((b) => b.textContent?.startsWith('Aguardando'))?.click();
    c.ciclo();
    expect(nomesVisiveis()).toEqual([]);
  });

  it('busca de etiquetas e estado vazio', async () => {
    await iniciar();
    chip().click();
    const busca = popover().querySelector('input') as HTMLInputElement;
    busca.value = 'fiel';
    busca.dispatchEvent(new Event('input'));
    expect(popover().textContent).toContain('Cliente fiel');
    expect(popover().textContent).not.toContain('Quente');
    busca.value = 'zzz';
    busca.dispatchEvent(new Event('input'));
    expect(popover().textContent).toContain('Sem resultados');
  });

  it('o filtro escolhido continua depois de recarregar (fica no storage)', async () => {
    await iniciar();
    chip().click();
    botao(popover(), 'Quente').click();
    await vi.waitFor(() => expect((chrome.dados.get('vz.config') as { filtroEtiquetas: string[] } | undefined)?.filtroEtiquetas).toEqual(['e1']));
  });
});
