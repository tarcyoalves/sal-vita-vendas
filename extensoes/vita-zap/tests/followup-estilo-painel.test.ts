// @vitest-environment jsdom
//
// Painel Follow-up (0.7.55): "Sua mensagem de cobrança" renderizado de verdade (React + IndexedDB falso + chrome falso).
// O WhatsApp nunca é tocado: chrome.tabs.query devolve vazio, então qualquer pedido ao content script falha fechado.

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, lerConfigFollowup, listarFollowups, salvarConfigFollowup, salvarFollowups, type Banco } from '../src/shared/banco';
import { assinaturaTextos } from '../src/shared/followup-estilo';
import type { Followup } from '../src/shared/followup';
import type { CrmPainel } from '../src/sidepanel/crm';
import { Followup as PainelFollowup } from '../src/sidepanel/Followup';
import { instalarChromeFalso } from './ajuda/chrome-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root;
let el: HTMLElement;
let db: Banco;
let n = 0;
let chamadasIa: unknown[][] = [];

const crm = {
  repo: {
    classificarRespostas: async () => ({ ok: true, valor: [] }),
    escreverCobranca: async (...a: unknown[]) => {
      chamadasIa.push(a);
      return { ok: false, erro: { tipo: 'servidor', mensagem: 'sem IA no teste' } };
    },
    criarLembrete: async () => ({ ok: true }),
  },
} as unknown as CrmPainel;

const pausa = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));

async function montar() {
  await act(async () => {
    raiz.render(createElement(PainelFollowup, { db, crm }));
  });
  await pausa();
}

const porRotulo = (rotulo: string) => el.querySelector<HTMLElement>(`[aria-label="${rotulo}"]`) as HTMLTextAreaElement;
const botao = (texto: string | RegExp) =>
  [...el.querySelectorAll('button')].find((b) => (typeof texto === 'string' ? b.textContent?.trim() === texto : texto.test(b.textContent ?? ''))) as HTMLButtonElement;

async function digitar(campo: HTMLTextAreaElement, valor: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(campo, valor);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
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
  chamadasIa = [];
  db = await abrirBanco(`painel-estilo-${Date.now()}-${(n += 1)}`);
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
  vi.restoreAllMocks();
});

const TEXTO = 'Oi, {nome}! Passando para saber se você viu minha mensagem.';

describe('Sua mensagem de cobrança', () => {
  it('mostra os dois modos, "meus textos" é o padrão, e o editor começa VAZIO (nenhum modelo genérico)', async () => {
    await montar();
    expect(el.textContent).toContain('Sua mensagem de cobrança');
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[name="modo-cobranca"]')];
    expect(radios.map((r) => r.value)).toEqual(['meus_textos', 'ia_estilo']);
    expect(radios[0].checked).toBe(true);
    expect(el.textContent).toContain('Usar os meus textos');
    expect(el.textContent).toContain('IA escreve no meu estilo');
    expect((porRotulo('1ª cobrança, variação 1') as HTMLTextAreaElement).value).toBe('');
    // as "ideias de ponto de partida" ficam recolhidas e só entram no editor se o dono clicar; nenhum campo vem preenchido
    expect([...el.querySelectorAll('textarea')].every((t) => t.value === '')).toBe(true);
    expect(el.textContent).not.toContain('Como devo escrever');
  });

  it('sem texto salvo NÃO liga: mostra "Escreva sua mensagem de cobrança antes de ligar" e nem pergunta o risco', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    expect(el.textContent).toContain('Escreva sua mensagem de cobrança antes de ligar');
    await clicar(el.querySelector('input[type="checkbox"]') as HTMLElement);
    expect(confirmar).not.toHaveBeenCalled();
    expect((await lerConfigFollowup(db)).ligado).toBe(false);
    expect(el.textContent).toContain('Escreva sua mensagem de cobrança antes de ligar');
  });

  it('texto inválido mostra o motivo e bloqueia o salvar; texto bom salva no IndexedDB e libera o ligar', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await montar();
    const campo = porRotulo('1ª cobrança, variação 1');
    await digitar(campo, 'Oi! Veja www.salvita.com.br por R$ 20');
    expect(el.textContent).not.toMatch(/precisa conter/); // {nome} é opcional (0.7.58)
    expect(el.textContent).toMatch(/sem link/);
    expect(el.textContent).toMatch(/preço/);
    expect(botao('Salvar minha mensagem').disabled).toBe(true);

    await digitar(campo, 'Bom dia {nome, tudo bem? Conseguiu olhar o estoque por aí?');
    expect(el.textContent).toMatch(/marcador incompleto: use \{nome\} exatamente assim/);
    expect(botao('Salvar minha mensagem').disabled).toBe(true);
    await digitar(campo, 'Bom dia, tudo bem? Conseguiu olhar o estoque por aí?'); // sem {nome} vale
    expect(botao('Salvar minha mensagem').disabled).toBe(false);

    await digitar(campo, TEXTO);
    expect(botao('Salvar minha mensagem').disabled).toBe(false);
    await clicar(botao('Salvar minha mensagem'));
    expect(await lerConfigFollowup(db)).toMatchObject({ modo: 'meus_textos', textos1: [TEXTO], textos2: [] });
    expect(el.textContent).toContain('Mensagem salva');
    expect(el.textContent).not.toContain('Escreva sua mensagem de cobrança antes de ligar');

    await clicar(el.querySelector('input[type="checkbox"]') as HTMLElement);
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect((await lerConfigFollowup(db)).ligado).toBe(true);
  });

  it('adicionar e remover variações (máximo 10) e a 2ª cobrança tem lista própria', async () => {
    await montar();
    for (let i = 0; i < 12; i++) {
      const add = [...el.querySelectorAll('button')].filter((b) => /^Adicionar variação/.test(b.textContent ?? ''))[0];
      if (add.disabled) break;
      await clicar(add);
    }
    expect(el.querySelectorAll('[aria-label^="1ª cobrança, variação"]').length).toBe(10);
    expect([...el.querySelectorAll('button')].filter((b) => /^Adicionar variação/.test(b.textContent ?? ''))[0].disabled).toBe(true);
    await clicar(botao('Remover'));
    expect(el.querySelectorAll('[aria-label^="1ª cobrança, variação"]').length).toBe(9);
    expect(el.querySelectorAll('[aria-label^="2ª cobrança (última), variação"]').length).toBe(0);
    const add2 = [...el.querySelectorAll('button')].filter((b) => /^Adicionar variação/.test(b.textContent ?? ''))[1];
    await clicar(add2);
    expect(el.querySelectorAll('[aria-label^="2ª cobrança (última), variação"]').length).toBe(1);
  });

  it('"IA escreve no meu estilo": aparece "Como devo escrever" (limite de 500) e salva modo e estilo', async () => {
    await montar();
    await clicar(el.querySelector('input[value="ia_estilo"]') as HTMLElement);
    const estilo = el.querySelector('textarea:not([aria-label])') as HTMLTextAreaElement;
    expect(estilo).toBeTruthy();
    expect(el.textContent).toContain('Como devo escrever');
    await digitar(porRotulo('1ª cobrança, variação 1'), TEXTO);
    await digitar(estilo, 'a'.repeat(501));
    expect(el.textContent).toMatch(/no máximo 500 caracteres/);
    expect(botao('Salvar minha mensagem').disabled).toBe(true);
    await digitar(estilo, 'curto e informal, sem exclamação');
    await clicar(botao('Salvar minha mensagem'));
    expect(await lerConfigFollowup(db)).toMatchObject({ modo: 'ia_estilo', estilo: 'curto e informal, sem exclamação', textos1: [TEXTO] });
  });

  it('"Ver exemplo" mostra a mensagem com um nome fictício', async () => {
    await montar();
    await digitar(porRotulo('1ª cobrança, variação 1'), TEXTO);
    expect(el.querySelector('[aria-label="Exemplo da mensagem"]')).toBeNull();
    await clicar(botao('Ver exemplo'));
    const previa = el.querySelector('[aria-label="Exemplo da mensagem"]') as HTMLElement;
    expect(previa.textContent).toContain('Oi, Maria! Passando para saber se você viu minha mensagem.');
    expect(previa.textContent).not.toContain('{nome}');
  });

  it('aviso de migração: config antiga ligada sem texto aparece desligada, com explicação', async () => {
    await db.put('followupConfig', { id: 'followup', valor: { ligado: true, dias: 3, pausado: false, confirmouRisco: true } as never });
    await montar();
    expect(el.textContent).toContain('A cobrança automática foi desligada');
    expect((el.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
  });

  it('a fila mostra de onde veio o texto: "seu texto" / "IA no seu estilo"', async () => {
    const config = await salvarConfigFollowup(db, { ...(await lerConfigFollowup(db)), textos1: [TEXTO] });
    const ass = assinaturaTextos(config);
    const base: Followup = {
      id: 'o:ana', campanhaId: 'o', chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', mensagemCampanha: 'Oi', enviadoEm: new Date().toISOString(), estado: 'cobranca', motivo: null,
      verificadoEm: new Date().toISOString(), cobrancas: [], cobrancaModelo: 'Oi, {primeiroNome}! Passando para saber se você viu minha mensagem.', cobrancaOrigem: 'meus_textos', cobrancaAssinatura: ass, atualizadoEm: new Date().toISOString(),
    };
    await salvarFollowups(db, [base, { ...base, id: 'o:bia', chave: 'bia', nome: 'Bia', primeiroNome: 'Bia', cobrancaOrigem: 'ia_estilo' }]);
    await montar();
    await clicar(botao(/^Cobrança automática \(/));
    expect(el.textContent).toContain('texto: seu texto');
    expect(el.textContent).toContain('texto: IA no seu estilo');
    expect((await listarFollowups(db)).every((f) => f.estado === 'cobranca')).toBe(true);
  });

  it('mudar o texto com gente na fila refaz o texto da fila (e mostra o novo na lista)', async () => {
    const config = await salvarConfigFollowup(db, { ...(await lerConfigFollowup(db)), textos1: [TEXTO] });
    const f: Followup = {
      id: 'o:ana', campanhaId: 'o', chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', mensagemCampanha: 'Oi', enviadoEm: new Date().toISOString(), estado: 'cobranca', motivo: null,
      verificadoEm: new Date().toISOString(), cobrancas: [], cobrancaModelo: 'Oi, {primeiroNome}! Passando para saber se você viu minha mensagem.', cobrancaOrigem: 'meus_textos', cobrancaAssinatura: assinaturaTextos(config), atualizadoEm: new Date().toISOString(),
    };
    await salvarFollowups(db, [f]);
    await montar();
    await digitar(porRotulo('1ª cobrança, variação 1'), 'Bom dia, {nome}! Tudo certo por aí?');
    await clicar(botao('Salvar minha mensagem'));
    const depois = (await listarFollowups(db))[0];
    expect(depois.cobrancaModelo).toBe('Bom dia, {primeiroNome}! Tudo certo por aí?');
    await clicar(botao(/^Cobrança automática \(/));
    expect(el.textContent).toContain('Bom dia, Ana! Tudo certo por aí?');
    expect(chamadasIa).toHaveLength(0); // modo "meus textos": sem IA
  });
});
