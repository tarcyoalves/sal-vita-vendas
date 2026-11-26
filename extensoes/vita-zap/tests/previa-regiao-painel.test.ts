// @vitest-environment jsdom
//
// 0.7.63: painel da Prévia com "Palavra inteira" (ligada por padrão) e o campo "Região (UF ou DDD)".

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirBanco, type Banco } from '../src/shared/banco';
import { chaveContato } from '../src/shared/nomes';
import type { ContatoVarrido } from '../src/shared/contatos';
import { dadosVazios } from '../src/shared/crm-store';
import type { CrmPainel } from '../src/sidepanel/crm';
import type { DadosLocais } from '../src/sidepanel/App';
import { Previa } from '../src/sidepanel/Previa';
import { instalarChromeFalso } from './ajuda/chrome-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function c(nome: string): ContatoVarrido {
  return { chave: chaveContato(nome), nome, rotuloData: '10/09/2026', ultimaConversa: '2026-09-10', revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, ultimaDeMim: true, duplicado: false, varridoEm: '2026-11-26T12:00:00.000Z' };
}

const CONTATOS = [
  c('CLIENTE PENSO SALTO DO LONTRA PR'),
  c('CLIENTE COMPRAS Silva'),
  c('CLIENTE Foz (DDD 45)'),
  c('CLIENTE Sem Telefone'),
  c('CLIENTE Sampa'),
];

let db: Banco;
let raiz: Root;
let el: HTMLElement;

const dados: DadosLocais = { contatos: CONTATOS, campanhas: [], envios: [], naoEnviar: [] };
const crmDados = dadosVazios();
crmDados.contatos.a = { id: 'a', nome: 'CLIENTE Foz (DDD 45)', telefone: '5545999112233', aliases: [chaveContato('CLIENTE Foz (DDD 45)')], etiquetas: [], notas: [], criadoEm: 1, atualizadoEm: 1 };
crmDados.contatos.b = { id: 'b', nome: 'CLIENTE Sampa', telefone: '551198887777', aliases: [chaveContato('CLIENTE Sampa')], etiquetas: [], notas: [], criadoEm: 1, atualizadoEm: 1 };
const crm = { dados: crmDados, agora: new Date() } as unknown as CrmPainel;

beforeAll(async () => {
  instalarChromeFalso();
  db = await abrirBanco('previa-regiao-063');
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
  await act(async () => {
    raiz.render(createElement(Previa, { db, dados, crm, aoAprovar: async () => undefined }));
  });
});
afterAll(async () => {
  await act(async () => raiz.unmount());
  el.remove();
});

function digitar(input: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, valor);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const campo = (texto: string) => {
  const l = [...el.querySelectorAll('label')].find((x) => (x.textContent ?? '').includes(texto));
  if (!l) throw new Error(`rótulo não encontrado: ${texto}`);
  return l.querySelector('input') as HTMLInputElement;
};
const botao = (texto: string) => {
  const b = [...el.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes(texto));
  if (!b) throw new Error(`botão não encontrado: ${texto}`);
  return b as HTMLButtonElement;
};
async function agir(fn: () => void) {
  await act(async () => fn());
}
const texto = () => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('painel da Prévia: palavra inteira e região', () => {
  it('"Palavra inteira" vem LIGADA e o campo Região existe, com ajuda curta', () => {
    expect(campo('Palavra inteira').checked).toBe(true);
    expect(campo('Região (UF ou DDD, separados por vírgula)').placeholder).toBe('ex.: PR, 41, 45, 46');
    expect(texto()).toContain('Atende quem tem a UF como palavra no nome');
  });

  it('contém "PR" por palavra inteira: só o contato com a palavra PR entra; COMPRAS fica de fora com o motivo novo', async () => {
    await agir(() => digitar(campo('Nome contém'), 'CLIENTE, PR'));
    expect(texto()).toContain('1 entram · 0 para revisar · 4 fora');
    expect(texto()).toContain('4 contatos: nome não contém a palavra "PR"');
    await agir(() => botao('Gerar prévia').click());
    expect(texto()).toContain('contém a palavra "CLIENTE"; contém a palavra "PR"');
    expect(texto()).toContain('CLIENTE PENSO SALTO DO LONTRA PR');
  });

  it('desligar "Palavra inteira" volta ao pedaço: COMPRAS entra', async () => {
    await agir(() => campo('Palavra inteira').click());
    expect(campo('Palavra inteira').checked).toBe(false);
    expect(texto()).toContain('2 entram · 0 para revisar · 3 fora');
    expect(texto()).toContain('3 contatos: nome não contém "PR"');
    expect(texto()).not.toContain('a palavra "PR"');
    await agir(() => campo('Palavra inteira').click());
    expect(campo('Palavra inteira').checked).toBe(true);
  });

  it('termo com várias palavras ("salto do lontra") casa como sequência', async () => {
    await agir(() => digitar(campo('Nome contém'), 'salto do lontra'));
    expect(texto()).toContain('1 entram · 0 para revisar · 4 fora');
    expect(texto()).toContain('nome não contém as palavras "salto do lontra"');
  });

  it('região: UF no nome, DDD com telefone conhecido, fora da região e sem telefone (revisar), com o motivo de cada um', async () => {
    await agir(() => digitar(campo('Nome contém'), 'CLIENTE'));
    await agir(() => digitar(campo('Região (UF'), 'PR, 45'));
    expect(texto()).toContain('2 entram · 2 para revisar · 1 fora');
    expect(texto()).toContain('fora da região (DDD 11)');
    expect(texto()).toContain('sem telefone conhecido para conferir o DDD');
    await agir(() => botao('Gerar prévia').click());
    const t = texto();
    expect(t).toContain('UF PR no nome');
    expect(t).toContain('DDD 45');
  });

  it('atalho "incluir os DDDs de PR" completa o campo e some quando já estão todos', async () => {
    await agir(() => botao('incluir os DDDs de PR').click());
    expect(campo('Região (UF').value).toBe('PR, 45, 41, 42, 43, 44, 46');
    expect([...el.querySelectorAll('button')].some((b) => (b.textContent ?? '').includes('incluir os DDDs'))).toBe(false);
  });

  it('item inválido mostra o erro ao lado do campo e trava o "Gerar prévia" (nada é ignorado em silêncio)', async () => {
    await agir(() => digitar(campo('Região (UF'), 'PR, XX, 10'));
    const alerta = el.querySelector('[role="alert"]');
    expect(alerta?.textContent).toContain('"XX" não é UF nem DDD do Brasil');
    expect(alerta?.textContent).toContain('"10" não é UF nem DDD do Brasil');
    expect(botao('Gerar prévia').disabled).toBe(true);
    await agir(() => digitar(campo('Região (UF'), 'PR, 45'));
    expect(el.querySelector('[role="alert"]')?.textContent ?? '').not.toContain('não é UF nem DDD');
    expect(botao('Gerar prévia').disabled).toBe(false);
  });

  it('região vazia: ninguém é filtrado por região', async () => {
    await agir(() => digitar(campo('Região (UF'), ''));
    expect(texto()).not.toContain('fora da região');
    expect(texto()).not.toContain('sem telefone conhecido para conferir o DDD');
  });
});
