// @vitest-environment jsdom
//
// Painel "Reativação" (0.7.56) renderizado de verdade (React + IndexedDB falso + chrome falso). O WhatsApp nunca é tocado
// (chrome.tabs.query devolve vazio) e o CRM é um objeto falso: aqui se confere o que o dono VÊ e o que ele consegue fazer.

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, lerConfigReativacao, listarNaoEnviar, listarReativacoes, salvarReativacoes, type Banco } from '../src/shared/banco';
import type { ContatoVarrido } from '../src/shared/contatos';
import { novoRegistro, type Reativacao as RegistroReativacao } from '../src/shared/reativacao';
import { definirModo } from '../src/sidepanel/automaticos-motor';
import type { CrmPainel } from '../src/sidepanel/crm';
import type { DadosLocais } from '../src/sidepanel/App';
import { Reativacao } from '../src/sidepanel/Reativacao';
import { instalarChromeFalso } from './ajuda/chrome-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root;
let el: HTMLElement;
let db: Banco;
let n = 0;
let consultasTrava = 0;

const crm = {
  dados: null,
  repo: {
    verificarAgendamentos: async (refs: unknown[]) => {
      consultasTrava += 1;
      return refs.map(() => ({ tipo: 'livre' }));
    },
    avaliarReativacao: async () => ({ ok: false, erro: { tipo: 'servidor', mensagem: 'sem IA no teste' } }),
    classificarRespostas: async () => ({ ok: true, valor: [] }),
    escreverCobranca: async () => ({ ok: false, erro: { tipo: 'servidor', mensagem: 'sem IA no teste' } }),
    registrarReativacao: async () => ({ ok: true, taskId: 1, criou: false, agendou: false }),
    criarLembrete: async () => ({ ok: true }),
  },
} as unknown as CrmPainel;

const contato = (nome: string): ContatoVarrido => ({ chave: nome.toLowerCase(), nome, rotuloData: '20/10/2026', ultimaConversa: '2026-10-20', revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, ultimaDeMim: true, duplicado: false, varridoEm: new Date().toISOString() });
const dadosVazios: DadosLocais = { contatos: [], campanhas: [], envios: [], naoEnviar: [] };

const pausa = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
async function montar(dados: DadosLocais = dadosVazios) {
  await act(async () => {
    raiz.render(createElement(Reativacao, { db, crm, dados }));
  });
  await pausa();
}
const botao = (texto: string | RegExp) => [...el.querySelectorAll('button')].find((b) => (typeof texto === 'string' ? b.textContent?.trim() === texto : texto.test(b.textContent ?? ''))) as HTMLButtonElement;
const campo = (rotulo: string) => el.querySelector<HTMLTextAreaElement>(`[aria-label="${rotulo}"]`) as HTMLTextAreaElement;
async function digitar(c: HTMLTextAreaElement, valor: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(c, valor);
    c.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function clicar(b: HTMLElement) {
  await act(async () => {
    b.click();
  });
  await pausa();
}

beforeEach(async () => {
  instalarChromeFalso();
  consultasTrava = 0;
  db = await abrirBanco(`painel-reativacao-${Date.now()}-${(n += 1)}`);
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
  vi.restoreAllMocks();
});

const TEXTO = 'Oi, {nome}! Faz um tempinho que não nos falamos. Precisa de sal?';
const reg = (nome: string, extra: Partial<RegistroReativacao>): RegistroReativacao => ({ ...novoRegistro({ chave: nome.toLowerCase(), nome, primeiroNome: nome.split(' ')[1] ?? nome }, '2026-10-20', new Date('2026-11-17T13:00:00Z')), ...extra });

describe('painel Reativação', () => {
  it('explica o que faz, a trava de agendamento e o risco; nasce DESLIGADO, com as etapas 25/30/40 e as 4 listas pedidas', async () => {
    await montar();
    const t = el.textContent ?? '';
    expect(t).toContain('Reativação por inatividade');
    expect(t).toContain('Trava de agendamento');
    expect(t).toMatch(/mesmo daqui a 60 dias/);
    expect(t).toMatch(/viola os Termos de Serviço do WhatsApp/);
    expect(el.querySelector('[aria-label="Modo atual"]')?.textContent).toBe('Desligado');
    expect([...el.querySelectorAll<HTMLInputElement>('input[aria-label^="Etapa "]')].map((i) => i.value)).toEqual(['25', '30', '40']);
    for (const rotulo of ['Vai receber hoje (0)', 'Agendados pela IA (0)', 'Precisa de você (0)', 'Travados por agendamento (0)']) expect(botao(rotulo), rotulo).toBeTruthy();
    expect(botao('Avaliar agora (não envia)')).toBeTruthy();
    expect(t).toMatch(/Faça a varredura primeiro/);
  });

  it('sem mensagem salva NÃO liga (nem em Observação); o editor nasce vazio (nenhum texto genérico)', async () => {
    await montar();
    expect(el.textContent).toContain('Escreva a mensagem da etapa 1 antes de ligar a reativação');
    expect([...el.querySelectorAll('textarea')].every((t) => t.value === '')).toBe(true);
    expect(await definirModo(db, 'observacao')).toMatchObject({ ok: false });
    expect((await lerConfigReativacao(db)).ligado).toBe(false);
  });

  it('texto inválido mostra o motivo e bloqueia o salvar; texto bom salva por etapa e libera a Observação (o envio só com o placar)', async () => {
    await montar({ ...dadosVazios, contatos: [contato('CLIENTE Ana')] });
    const c1 = campo('Etapa 1 (25 dias), variação 1');
    await digitar(c1, 'Oi! Veja www.salvita.com.br por R$ 20');
    expect(el.textContent).not.toMatch(/precisa conter/); // {nome} é opcional (0.7.58)
    expect(botao('Salvar minhas mensagens').disabled).toBe(true);
    await digitar(c1, TEXTO);
    expect(botao('Salvar minhas mensagens').disabled).toBe(false);
    await clicar(botao('Salvar minhas mensagens'));
    expect(await lerConfigReativacao(db)).toMatchObject({ modo: 'meus_textos', textos1: [TEXTO], ligado: false });
    expect(el.textContent).toContain('Mensagens salvas');

    // Observação liga (nada é enviado); "Ligado" fica bloqueado até o placar da IA aprovar.
    expect(await definirModo(db, 'observacao')).toMatchObject({ ok: true });
    expect(await lerConfigReativacao(db)).toMatchObject({ ligado: true, automatico: 'observacao' });
    expect(await definirModo(db, 'ligado', { confirmouRisco: true })).toMatchObject({ ok: false, motivo: expect.stringMatching(/Faltam 30/) });
    expect(await lerConfigReativacao(db)).toMatchObject({ automatico: 'observacao' });
  });

  it('as etapas são configuráveis e sempre ficam crescentes, com 3 dias de intervalo', async () => {
    await montar();
    const [e1, e2, e3] = [...el.querySelectorAll<HTMLInputElement>('input[aria-label^="Etapa "]')];
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(e1, '20');
      e1.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(e2, '21');
      e2.dispatchEvent(new Event('input', { bubbles: true }));
      e3.dispatchEvent(new Event('input', { bubbles: true }));
      e3.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await pausa();
    expect((await lerConfigReativacao(db)).etapas).toEqual([20, 23, 40]);
  });

  it('mostra cada lista com o que a IA decidiu, o motivo da trava e o texto que vai sair', async () => {
    await salvarReativacoes(db, [
      reg('CLIENTE Ana', { estado: 'pronto', resumo: 'Comprou 40 sacos em setembro.', textoPronto: { etapa: 1, modelo: 'Oi {primeiroNome}, faz tempo que não nos falamos. Precisa de sal?', origem: 'meus_textos', assinatura: 'x' } }),
      reg('CLIENTE Bia', { estado: 'agendado', resumo: 'Tem estoque até janeiro.', diasSugeridos: 45, agendadoPara: '2027-01-01T12:00:00.000Z', crmSalvoEm: '2026-11-17T13:00:00.000Z' }),
      reg('CLIENTE Caio', { estado: 'precisa', decisao: 'delicado', motivo: null, resumo: 'Reclamou do atraso.' }),
      reg('CLIENTE Dani', { estado: 'travado', motivo: 'agendado para 16/01 (o agendamento prevalece)', agendadoPara: '2027-01-16T12:00:00.000Z' }),
    ]);
    await montar();
    for (const rotulo of ['Vai receber hoje (1)', 'Agendados pela IA (1)', 'Precisa de você (1)', 'Travados por agendamento (1)']) expect(botao(rotulo), rotulo).toBeTruthy();
    expect(el.textContent).toContain('CLIENTE Ana');
    expect(el.textContent).toContain('Oi Ana, faz tempo que não nos falamos. Precisa de sal?'); // o texto montado com o nome
    expect(el.textContent).toContain('etapa 1 de 3 · texto: seu texto');
    await clicar(botao(/^Agendados pela IA/));
    expect(el.textContent).toContain('Tem estoque até janeiro.');
    expect(el.textContent).toMatch(/NENHUMA mensagem foi enviada/);
    await clicar(botao(/^Precisa de você/));
    expect(el.textContent).toContain('Reclamou do atraso.');
    await clicar(botao(/^Travados por agendamento/));
    expect(el.textContent).toContain('agendado para 16/01 (o agendamento prevalece)');
    expect(el.textContent).toMatch(/Voltam a ser elegíveis quando a data passar/);
  });

  it('"Não enviar mais" na fila grava o opt-out e tira o contato', async () => {
    await salvarReativacoes(db, [reg('CLIENTE Ana', { estado: 'pronto', textoPronto: { etapa: 1, modelo: 'Oi {primeiroNome}, faz tempo. Precisa de sal?', origem: 'meus_textos', assinatura: 'x' } })]);
    await montar();
    await clicar(botao('Não enviar mais'));
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['cliente ana']);
    expect((await listarReativacoes(db))[0].estado).toBe('saiu');
    expect(botao('Vai receber hoje (0)')).toBeTruthy();
  });

  it('"Avaliar agora" só avalia: consulta a trava e NÃO manda nada ao WhatsApp além de ler', async () => {
    await montar({ ...dadosVazios, contatos: [contato('CLIENTE Ana')] });
    expect(el.textContent).toMatch(/1 contato\(s\) com a última conversa há 25\+ dias entram na próxima rodada/);
    await clicar(botao('Avaliar agora (não envia)'));
    await pausa(60);
    expect(consultasTrava).toBeGreaterThanOrEqual(1); // conferiu o CRM antes de abrir qualquer conversa
    expect(el.textContent).toMatch(/WhatsApp Web|Abra o WhatsApp/); // sem aba do WhatsApp no teste: falha fechada, sem colar nada
    expect(await listarReativacoes(db)).toEqual([]);
  });
});
