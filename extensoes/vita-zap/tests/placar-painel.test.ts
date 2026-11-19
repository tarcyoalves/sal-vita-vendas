// @vitest-environment jsdom
//
// Aba "Automáticos": "Aprovado anteriormente" explícito para aprovação de registro antigo, aviso de que o placar recomeçou
// quando as Orientações para a IA mudam, e percentual que não engana (89,7%, não "90%").

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { julgar, novaDecisao } from '../src/shared/automaticos';
import { abrirBanco, lerConfigFollowup, salvarConfigFollowup, salvarConfigReativacao, salvarJulgamento, type Banco } from '../src/shared/banco';
import { CONFIG_FOLLOWUP_PADRAO } from '../src/shared/followup';
import { CONFIG_REATIVACAO_PADRAO } from '../src/shared/reativacao';
import { Automaticos } from '../src/sidepanel/Automaticos';
import type { CrmPainel } from '../src/sidepanel/crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root;
let el: HTMLElement;
let db: Banco;
let n = 0;
let orientacoes = 'Trate por você.';
const TEXTO = ['Oi, {nome}! Passando para saber se viu minha mensagem.'];
const crm = { repo: { orientacoesIa: async () => orientacoes, desfazerAgendamento: async () => ({ ok: true }) } } as unknown as CrmPainel;

const pausa = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
async function montar() {
  await act(async () => {
    raiz.render(createElement(Automaticos, { db, crm, ativa: true }));
  });
  await pausa();
}
async function julgamentos(total: number, acertos: number, desde = new Date()) {
  for (let i = 0; i < total; i += 1) {
    const d = novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: `c${i}`, nome: `Contato ${i}`, contexto: 'x', resumo: 'r' }, desde);
    await salvarJulgamento(db, julgar(d, i < acertos ? 'acertou' : 'errou', new Date(desde.getTime() + i)));
  }
}

beforeEach(async () => {
  instalarChromeFalso();
  orientacoes = 'Trate por você.';
  db = await abrirBanco(`placar-painel-${Date.now()}-${(n += 1)}`);
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
});

describe('aba Automáticos × aprovação do placar', () => {
  it('aprovação de registro antigo: mostra "Aprovado anteriormente"', async () => {
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO, automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: TEXTO, automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    await montar();
    expect(el.textContent).toContain('Aprovado anteriormente');
    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('Ligado');
  });

  it('as Orientações mudaram: a aprovação é cancelada, cai para Observação e a tela explica que o placar recomeçou', async () => {
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO, automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: TEXTO, automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    await julgamentos(30, 28, new Date(Date.now() - 3_600_000));
    await montar(); // registra as Orientações de hoje como a base da aprovação antiga
    expect(el.textContent).toContain('Aprovado anteriormente');
    orientacoes = 'Nunca falar de preço.';
    await act(async () => raiz.render(null)); // fecha e reabre a aba
    await montar();
    expect(el.textContent).not.toContain('Aprovado anteriormente');
    expect(el.textContent).toContain('O placar recomeçou');
    expect(el.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toBe('Observação');
    expect(await lerConfigFollowup(db)).toMatchObject({ automatico: 'observacao', placarAprovado: false });
    expect(el.textContent).toMatch(/Progresso/);
  });

  it('35 de 39 mostra 89,7% (não "90%") e não libera', async () => {
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO });
    await julgamentos(39, 35);
    await montar();
    expect(el.textContent).toContain('Progresso: 39 de 30');
    expect(el.textContent).toContain('89,7% de acerto');
    expect(el.textContent).toMatch(/mínimo é 90%/);
    expect(el.textContent).not.toContain('Placar aprovado');
  });
});
