// @vitest-environment jsdom
//
// Aba "Automáticos" (0.7.59) renderizada de verdade (React + IndexedDB falso + chrome falso): modo, placar, "o que a IA faria"
// (Acertou/Errou), fila de hoje e "O que a IA fez" com Desfazer. Nada aqui toca o WhatsApp.

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { julgar, novaAcao, novaDecisao } from '../src/shared/automaticos';
import { abrirBanco, lerConfigFollowup, lerConfigReativacao, listarAcoesIa, listarJulgamentos, registrarAcaoIa, registrarDecisao, salvarConfigFollowup, salvarConfigReativacao, salvarJulgamento, salvarReativacoes, listarReativacoes, type Banco } from '../src/shared/banco';
import { CONFIG_FOLLOWUP_PADRAO } from '../src/shared/followup';
import { CONFIG_REATIVACAO_PADRAO, novoRegistro } from '../src/shared/reativacao';
import { Automaticos } from '../src/sidepanel/Automaticos';
import { Followup as PainelFollowup } from '../src/sidepanel/Followup';
import type { CrmPainel } from '../src/sidepanel/crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root;
let el: HTMLElement;
let db: Banco;
let n = 0;
let desfeitos: Array<{ taskId: number; agendadoEm: number }> = [];
let respostaDesfazer: { ok: true } | { ok: false; mensagem: string } = { ok: true };
const AGORA = new Date();
const TEXTO = ['Oi, {nome}! Passando para saber se viu minha mensagem.'];

const crm = {
  repo: {
    desfazerAgendamento: async (p: { taskId: number; agendadoEm: number }) => {
      desfeitos.push(p);
      return respostaDesfazer;
    },
    classificarRespostas: async () => ({ ok: true, valor: [] }),
    escreverCobranca: async () => ({ ok: false, erro: { tipo: 'servidor', mensagem: 'sem IA' } }),
    criarLembrete: async () => ({ ok: true }),
  },
} as unknown as CrmPainel;

const pausa = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
async function montar() {
  await act(async () => {
    raiz.render(createElement(Automaticos, { db, crm, ativa: true }));
  });
  await pausa();
}
const botao = (texto: string | RegExp) => [...el.querySelectorAll('button')].find((b) => (typeof texto === 'string' ? b.textContent?.trim() === texto : texto.test(b.textContent ?? ''))) as HTMLButtonElement;
async function clicar(b: HTMLElement) {
  await act(async () => {
    b.click();
  });
  await pausa();
}
const comTexto = async () => {
  await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO });
  await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: TEXTO });
};
const decisao = (i: number, tipo: 'cobrar' | 'retomar' | 'sair' = 'cobrar') => novaDecisao({ origem: 'followup', tipo, chave: `c${i}`, nome: `Contato ${i}`, contexto: `x${i}`, resumo: `Cobraria ${i}`, texto: `Oi, Contato ${i}!` }, new Date(AGORA.getTime() + i));

beforeEach(async () => {
  instalarChromeFalso();
  desfeitos = [];
  respostaDesfazer = { ok: true };
  db = await abrirBanco(`painel-auto-${Date.now()}-${(n += 1)}`);
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
  vi.restoreAllMocks();
});

describe('modo dos automáticos', () => {
  it('nasce Desligado, com os três modos e a explicação de cada um; fila de hoje explicada na ordem fixa', async () => {
    await montar();
    expect([...el.querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual(['Desligado', 'Observação', 'Ligado']);
    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('Desligado');
    const t = el.textContent ?? '';
    expect(t).toMatch(/Hoje saem até 0 \(teto 30, já saíram 0\); ficam 0 na fila para os próximos dias\./);
    expect(t).toContain('1. Cobrança de quem não respondeu');
    expect(t).toContain('2. Reativação, etapas 2 e 3');
    expect(t).toContain('3. Reativação, etapa 1');
    expect(t).toMatch(/4\. Campanhas comuns pendentes/);
  });

  it('sem texto do dono nem Observação liga: explica o que falta', async () => {
    await montar();
    await clicar(botao('Observação'));
    expect(el.textContent).toMatch(/Escreva a mensagem de cobrança/);
    expect((await lerConfigFollowup(db)).ligado).toBe(false);
  });

  it('Observação liga os dois (com texto) sem perguntar o risco: nada é enviado', async () => {
    await comTexto();
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    await clicar(botao('Observação'));
    expect(confirmar).not.toHaveBeenCalled();
    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('Observação');
    expect(await lerConfigFollowup(db)).toMatchObject({ automatico: 'observacao', ligado: true });
    expect(await lerConfigReativacao(db)).toMatchObject({ automatico: 'observacao', ligado: true });
    expect(el.textContent).toMatch(/Modo Observação: nada será enviado/);
  });

  it('Ligado abaixo do mínimo: o botão explica por quê ("faltam N") e NEM pergunta o risco', async () => {
    await comTexto();
    for (let i = 0; i < 12; i++) await salvarJulgamento(db, julgar(decisao(i), 'acertou', AGORA));
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    expect(el.textContent).toMatch(/Progresso: 12 de 30/);
    await clicar(botao('Ligado'));
    expect(confirmar).not.toHaveBeenCalled();
    expect(el.textContent).toMatch(/Faltam 18 julgamento\(s\)/);
    expect((await lerConfigFollowup(db)).automatico).not.toBe('ligado');
  });

  it('Ligado com o placar aprovado: pede a confirmação do risco; recusar deixa como estava, aceitar liga', async () => {
    await comTexto();
    for (let i = 0; i < 30; i++) await salvarJulgamento(db, julgar(decisao(i), 'acertou', AGORA));
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await montar();
    expect(el.textContent).toMatch(/Placar aprovado: 30 de 30 \(100%\)/);
    await clicar(botao('Ligado'));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(String(confirmar.mock.calls[0][0])).toMatch(/viola os Termos/);
    expect((await lerConfigFollowup(db)).automatico).toBe('desligado');
    await clicar(botao('Ligado'));
    expect(await lerConfigFollowup(db)).toMatchObject({ automatico: 'ligado', confirmouRisco: true, placarAprovado: true });
    expect(await lerConfigReativacao(db)).toMatchObject({ automatico: 'ligado' });
  });

  it('quem estava ligado numa versão anterior aparece em Observação, com o aviso', async () => {
    await db.put('followupConfig', { id: 'followup', valor: { ligado: true, dias: 3, pausado: false, confirmouRisco: true, textos1: TEXTO } as never });
    await montar();
    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('Observação');
    expect(el.textContent).toMatch(/estava ligado numa versão anterior e agora está em Observação/);
  });
});

describe('o que a IA faria e o placar', () => {
  it('"Acertou" grava o julgamento e atualiza o placar; "Errou" pede motivo curto e a decisão certa numa lista', async () => {
    await registrarDecisao(db, decisao(1));
    await registrarDecisao(db, decisao(2, 'sair'));
    await montar();
    expect(el.textContent).toContain('O que a IA faria (2)');
    expect(el.textContent).toContain('Oi, Contato 1!'); // o texto que a IA preparou
    await clicar(botao('Acertou')); // o mais recente primeiro: "sair" do contato 2
    expect((await listarJulgamentos(db)).filter((j) => j.veredito === 'acertou')).toHaveLength(1);
    expect(el.textContent).toContain('O que a IA faria (1)');
    expect(el.textContent).toMatch(/Marcar "não enviar mais": 1\/1 \(100%\)/);

    await clicar(botao('Errou'));
    const motivo = el.querySelector<HTMLInputElement>('[aria-label="Motivo do erro"]') as HTMLInputElement;
    const certa = el.querySelector<HTMLSelectElement>('[aria-label="Decisão certa"]') as HTMLSelectElement;
    expect([...certa.options].map((o) => o.value)).toEqual(['', 'cobrar', 'retomar', 'agendar', 'precisa', 'resolver', 'sair', 'nada']);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(motivo, 'já tinha comprado');
      motivo.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(certa, 'nada');
      certa.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clicar(botao('Confirmar: errou'));
    const errada = (await listarJulgamentos(db)).find((j) => j.veredito === 'errou');
    expect(errada).toMatchObject({ chave: 'c1', motivo: 'já tinha comprado', decisaoCerta: 'nada' });
    expect(el.textContent).toContain('O que a IA faria (0)');
  });
});

describe('O que a IA fez e o Desfazer', () => {
  it('lista as ações; envio mostra que não tem desfazer; opt-out e agendamento têm botão', async () => {
    await registrarAcaoIa(db, novaAcao({ tipo: 'enviou', origem: 'followup', chave: 'ana', nome: 'Ana', resumo: 'Cobrança 1 enviada: "Oi"' }, new Date(AGORA.getTime() + 1)));
    await registrarAcaoIa(db, novaAcao({ tipo: 'nao_enviar', origem: 'reativacao', chave: 'bia', nome: 'Bia', resumo: 'Pediu para sair', desfazer: { tipo: 'nao_enviar' } }, new Date(AGORA.getTime() + 2)));
    await registrarAcaoIa(db, novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'caio', nome: 'Caio', resumo: 'Agendou', desfazer: { tipo: 'agendamento', taskId: 9, agendadoEm: 1_800_000_000_000 } }, new Date(AGORA.getTime() + 3)));
    await montar();
    expect(el.textContent).toContain('O que a IA fez (3)');
    expect(el.textContent).toMatch(/Mensagem enviada não tem desfazer/);
    expect(el.textContent).toContain('Envio não tem desfazer.');
    expect([...el.querySelectorAll('button')].filter((b) => b.textContent === 'Desfazer')).toHaveLength(2);
  });

  it('Desfazer o agendamento chama o CRM com o id e o instante e marca como desfeita', async () => {
    await salvarReativacoes(db, [{ ...novoRegistro({ chave: 'caio', nome: 'Caio', primeiroNome: 'Caio' }, '2026-10-20', AGORA), estado: 'agendado', agendadoPara: new Date(1_800_000_000_000).toISOString() }]);
    await registrarAcaoIa(db, novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'caio', nome: 'Caio', resumo: 'Agendou', desfazer: { tipo: 'agendamento', taskId: 9, agendadoEm: 1_800_000_000_000 } }, AGORA));
    await montar();
    await clicar(botao('Desfazer'));
    expect(desfeitos).toEqual([{ taskId: 9, agendadoEm: 1_800_000_000_000 }]);
    expect(el.textContent).toMatch(/Desfeita em/);
    expect(el.textContent).toMatch(/O agendamento de Caio foi removido do CRM/);
    expect((await listarAcoesIa(db))[0].desfeitaEm).not.toBeNull();
    expect((await listarReativacoes(db))[0].estado).toBe('precisa');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'Desfazer')).toBe(false);
  });

  it('o CRM recusa (a data já mudou): mostra o motivo e mantém o botão', async () => {
    respostaDesfazer = { ok: false, mensagem: 'O agendamento já foi alterado ou concluído depois que a IA o criou. Não mexi em nada.' };
    await registrarAcaoIa(db, novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'caio', nome: 'Caio', resumo: 'Agendou', desfazer: { tipo: 'agendamento', taskId: 9, agendadoEm: 1_800_000_000_000 } }, AGORA));
    await montar();
    await clicar(botao('Desfazer'));
    expect(el.textContent).toMatch(/Não mexi em nada/);
    expect(botao('Desfazer')).toBeTruthy();
  });
});

describe('as abas Follow-up e Reativação mostram o modo e mandam para a aba Automáticos', () => {
  it('Follow-up: "Cobrança automática: Observação" + aviso de que nada é cobrado; o botão abre a aba Automáticos', async () => {
    await comTexto();
    await db.put('followupConfig', { id: 'followup', valor: { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO, automatico: 'observacao' } });
    let abriu = 0;
    await act(async () => {
      raiz.render(createElement(PainelFollowup, { db, crm, aoAbrirAutomaticos: () => void (abriu += 1) }));
    });
    await pausa();
    expect(el.querySelector('[aria-label="Modo atual"]')?.textContent).toBe('Observação');
    expect(el.textContent).toMatch(/Observação: a IA lê e decide, mas NADA é cobrado/);
    await clicar(botao(/Mudar o modo/));
    expect(abriu).toBe(1);
  });
});
