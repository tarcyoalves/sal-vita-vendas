// @vitest-environment jsdom
//
// Aba "Hoje" (0.7.60) e o resultado por texto no editor, renderizados de verdade (React + IndexedDB falso + chrome falso).
// Só leitura: nada é enviado, lido do WhatsApp ou gravado pela tela Hoje.

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { novaDecisao } from '../src/shared/automaticos';
import { abrirBanco, registrarDecisao, registrarEnvioDoTexto, salvarConfigFollowup, salvarFollowups, salvarReativacoes, type Banco } from '../src/shared/banco';
import { CONFIG_FOLLOWUP_PADRAO, type Followup } from '../src/shared/followup';
import { hashDoTextoDoDono } from '../src/shared/resultado-texto';
import { novoRegistro } from '../src/shared/reativacao';
import { ABAS, LINHAS_DE_ABAS } from '../src/sidepanel/abas';
import { Hoje } from '../src/sidepanel/Hoje';
import { EditorDeTextos } from '../src/sidepanel/MensagemCobranca';
import { ProvedorResultadosTexto } from '../src/sidepanel/ResultadosTexto';
import { falhaDaIa, iaFuncionou } from '../src/sidepanel/saude-painel';
import { instalarChromeFalso } from './ajuda/chrome-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root;
let el: HTMLElement;
let db: Banco;
let n = 0;
const AGORA = new Date();
const pausa = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
const botao = (texto: string | RegExp, dentro: ParentNode = el) => [...dentro.querySelectorAll('button')].find((b) => (typeof texto === 'string' ? b.textContent?.trim() === texto : texto.test(b.textContent ?? ''))) as HTMLButtonElement;
const fup = (chave: string, estado: Followup['estado']): Followup => ({ id: `o:${chave}`, campanhaId: 'o', chave, nome: chave, primeiroNome: chave, mensagemCampanha: 'x', enviadoEm: AGORA.toISOString(), estado, motivo: null, verificadoEm: null, cobrancas: [], cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: AGORA.toISOString() });

beforeEach(async () => {
  instalarChromeFalso();
  iaFuncionou();
  db = await abrirBanco(`hoje-${Date.now()}-${(n += 1)}`);
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
  iaFuncionou();
});

describe('aba Hoje', () => {
  async function montar(ir: (a: string) => void = () => undefined, logado = true) {
    await act(async () => {
      raiz.render(createElement(Hoje, { db, ativa: true, logadoNoCrm: logado, ir }));
    });
    await pausa();
  }

  it('mostra os cinco cartões com números, e "nenhum erro" quando está tudo certo', async () => {
    await montar();
    const titulos = [...el.querySelectorAll('[data-cartao] h3')].map((h) => h.textContent);
    expect(titulos).toEqual(['Sai hoje sozinho', 'Precisa de você', 'A IA agendou', 'Para julgar', 'Histórico sumindo']);
    expect(el.textContent).toMatch(/Hoje saem até 0 \(teto 30, já saíram 0\)/);
    expect(el.textContent).toContain('Modo: Desligado (nada sai sozinho)');
    expect(el.textContent).toContain('Nenhum erro nem pausa ativa');
  });

  it('conta o que está gravado e cada cartão leva à aba certa', async () => {
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: ['Oi, {nome}!'], automatico: 'observacao' });
    await salvarFollowups(db, [fup('ana', 'precisa'), fup('bia', 'revisar')]);
    await salvarReativacoes(db, [{ ...novoRegistro({ chave: 'caio', nome: 'Caio', primeiroNome: 'Caio' }, '2026-10-20', AGORA), estado: 'precisa' }]);
    await registrarDecisao(db, novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: 'x', nome: 'X', contexto: 'x', resumo: 'Cobraria', texto: 'Oi' }, AGORA));
    const destinos: string[] = [];
    await montar((a) => destinos.push(a));
    const num = (id: string) => el.querySelector(`[data-cartao="${id}"] .hoje-numero`)?.textContent;
    expect(num('precisa')).toBe('3');
    expect(num('julgar')).toBe('1');
    expect(el.querySelector('[data-cartao="precisa"] .ajuda')?.textContent).toBe('Follow-up 1 · Reativação 1 · Revisar 1');
    for (const id of ['sai', 'precisa', 'agendou', 'julgar', 'sumindo']) {
      await act(async () => botao('Abrir', el.querySelector(`[data-cartao="${id}"]`) as HTMLElement).click());
    }
    expect(destinos).toEqual(['automaticos', 'followup', 'reativacao', 'automaticos', 'reativacao']);
    await act(async () => botao(/^Reativação \(/, el.querySelector('[data-cartao="precisa"]') as HTMLElement).click());
    expect(destinos.at(-1)).toBe('reativacao');
  });

  it('IA indisponível e sem login viram avisos com atalho', async () => {
    falhaDaIa('limite diário', Date.now());
    const destinos: string[] = [];
    await montar((a) => destinos.push(a), false);
    expect(el.textContent).toMatch(/Atenção \(2\)/);
    expect(el.textContent).toMatch(/Sem login no CRM/);
    expect(el.textContent).toMatch(/IA indisponível desde \d\d:\d\d \(limite diário\)/);
    for (const b of [...el.querySelectorAll('.hoje-alertas button')]) await act(async () => (b as HTMLButtonElement).click());
    expect(destinos).toEqual(['dados', 'automaticos']);
  });

  it('a tela é só leitura: nada é gravado no banco ao abrir', async () => {
    await montar();
    for (const loja of [...db.objectStoreNames]) expect(await db.getAll(loja as never)).toEqual([]);
  });
});

describe('barra de abas', () => {
  it('as três linhas têm os 12 rótulos', () => {
    expect(LINHAS_DE_ABAS.flatMap((l) => l.ids).map((id) => ABAS.find((a) => a.id === id)?.rotulo)).toEqual(['Lembretes', 'Acompanhar', 'Clientes', 'Hoje', '1. Varredura', '2. Prévia', '3. Envio', 'Follow-up', 'Reativação', 'Automáticos', 'Pedir à IA', 'Dados']);
  });
});

describe('resultado por texto no editor', () => {
  const TEXTO = 'Oi, {nome}! Tudo bem?';
  async function montarEditor(lista: string[]) {
    await act(async () => {
      raiz.render(createElement(ProvedorResultadosTexto, { db, versao: 'x', children: createElement(EditorDeTextos, { titulo: 'Cobrança', ajuda: 'a', lista, erros: lista.map(() => []), sugestoes: [], idBase: 't', onChange: () => undefined }) }));
    });
    await pausa();
  }
  const envios = (qtd: number, resp: number) =>
    Promise.all(Array.from({ length: qtd }, (_, i) => registrarEnvioDoTexto(db, { id: `c:${i}`, hash: hashDoTextoDoDono(TEXTO), chave: `k${i}`, enviadoEm: AGORA.toISOString(), respondeuEm: i < resp ? AGORA.toISOString() : null })));

  it('mostra "enviado 42 · respondeu 9 (21%)" ao lado do texto, sem aviso de amostra pequena', async () => {
    await envios(42, 9);
    await montarEditor([TEXTO]);
    expect(el.textContent).toContain('enviado 42 · respondeu 9 (21%)');
    expect(el.textContent).not.toMatch(/amostra pequena/);
  });
  it('com menos de 20 envios avisa "amostra pequena"', async () => {
    await envios(5, 2);
    await montarEditor([TEXTO]);
    expect(el.textContent).toContain('enviado 5 · respondeu 2 (40%)');
    expect(el.textContent).toMatch(/amostra pequena/);
  });
  it('texto editado (outro hash) zera a contagem: mostra "ainda sem envios deste texto"', async () => {
    await envios(42, 9);
    await montarEditor([`${TEXTO} Qualquer coisa me chama.`]);
    expect(el.textContent).not.toContain('enviado 42');
    expect(el.textContent).toContain('ainda sem envios deste texto');
  });
  it('cada variação mostra o seu próprio resultado', async () => {
    await envios(3, 1);
    await montarEditor([TEXTO, 'Outro texto {nome}, tudo certo?']);
    const t = el.textContent ?? '';
    expect(t.match(/enviado 3 · respondeu 1 \(33%\)/g)).toHaveLength(1);
    expect(t).toContain('ainda sem envios deste texto');
  });
});
