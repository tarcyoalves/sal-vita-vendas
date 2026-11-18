// @vitest-environment jsdom
//
// Painel "Pedir à IA" (0.7.57) renderizado de verdade (React + IndexedDB falso + chrome falso). O WhatsApp nunca é tocado
// (chrome.tabs.query devolve vazio) e o CRM é um objeto falso: aqui se confere o que o dono VÊ e o que ele consegue fazer.

import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, lerPedidos, listarCampanhas, listarNaoEnviar, salvarPedidos, type Banco } from '../src/shared/banco';
import type { ContatoVarrido } from '../src/shared/contatos';
import { type ItemPedido, type PlanoPedido, type ResultadoPedido } from '../src/shared/pedido-ia';
import type { CrmPainel } from '../src/sidepanel/crm';
import type { DadosLocais } from '../src/sidepanel/App';
import { PedirIa } from '../src/sidepanel/PedirIa';
import { instalarChromeFalso } from './ajuda/chrome-falso';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root;
let el: HTMLElement;
let db: Banco;
let n = 0;
const chamadas = { interpretar: [] as string[], lembretes: [] as Array<{ nome: string; venceEm: number }>, orientacoes: [] as string[], travas: 0, aprovadas: [] as string[] };
let orientacaoSalva = '';
let planoDaIa: unknown;

const crm = {
  dados: null,
  repo: {
    verificarAgendamentos: async (refs: unknown[]) => {
      chamadas.travas += 1;
      return refs.map(() => ({ tipo: 'livre' }));
    },
    interpretarPedido: async (texto: string) => {
      chamadas.interpretar.push(texto);
      return { ok: true, valor: planoDaIa };
    },
    conferirPedido: async () => ({ ok: false, erro: { tipo: 'servidor', mensagem: 'sem IA no teste' } }),
    escreverCobranca: async () => ({ ok: false, erro: { tipo: 'servidor', mensagem: 'sem IA no teste' } }),
    criarLembrete: async (p: { ref: { nome: string }; venceEm: number }) => {
      chamadas.lembretes.push({ nome: p.ref.nome, venceEm: p.venceEm });
      return { ok: true };
    },
    orientacoesIa: async () => orientacaoSalva,
    salvarOrientacoesIa: async (t: string) => {
      chamadas.orientacoes.push(t);
      orientacaoSalva = t.trim();
      return orientacaoSalva;
    },
  },
} as unknown as CrmPainel;

const PLANO: PlanoPedido = { periodoDias: 30, quemFalouPorUltimo: 'eu', respondeu: false, assunto: 'perguntei sobre estoque', termosNomeContato: [] };
const contato = (nome: string): ContatoVarrido => ({ chave: nome.toLowerCase(), nome, rotuloData: '10/11/2026', ultimaConversa: '2026-11-10', revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, ultimaDeMim: true, duplicado: false, varridoEm: new Date().toISOString() });
const dados = (contatos: ContatoVarrido[] = []): DadosLocais => ({ contatos, campanhas: [], envios: [], naoEnviar: [] });

const item = (nome: string, extra: Partial<ItemPedido> = {}): ItemPedido => ({
  chave: nome.toLowerCase(), nome, primeiroNome: nome.split(' ')[1] ?? nome, ultimaConversa: '2026-11-02', corresponde: true, revisar: false, motivo: `Perguntei sobre estoque em 02/11; sem resposta (${nome})`, confianca: 'alta',
  pediuParaSair: false, trava: { tipo: 'livre' }, marcado: true, estado: 'aberto', lidoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), ...extra,
});
const resultado = (itens: ItemPedido[]): ResultadoPedido => ({ id: 'r1', texto: 'Filtre quem perguntei sobre estoque', plano: PLANO, rodadaEm: new Date().toISOString(), candidatos: itens.length, lidas: itens.length, descartadas: 2, semConferir: 0, cortados: 0, fora: [['grupo ou possível grupo', 3]], avisos: [], itens });

const pausa = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
async function montar(d: DadosLocais = dados()) {
  await act(async () => {
    raiz.render(createElement(PedirIa, { db, crm, dados: d, aoAprovar: async (id: string) => void chamadas.aprovadas.push(id) }));
  });
  await pausa();
}
const botao = (texto: string | RegExp, dentro: ParentNode = el) => [...dentro.querySelectorAll('button')].find((b) => (typeof texto === 'string' ? b.textContent?.trim() === texto : texto.test(b.textContent ?? ''))) as HTMLButtonElement;
const campo = <T extends HTMLElement = HTMLTextAreaElement>(rotulo: string) => el.querySelector<T>(`[aria-label="${rotulo}"]`) as T;
async function digitar(c: HTMLTextAreaElement | HTMLInputElement, valor: string) {
  await act(async () => {
    const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(c, valor);
    c.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function clicar(b: HTMLElement) {
  await act(async () => {
    b.click();
  });
  await pausa();
}
const linha = (nome: string) => [...el.querySelectorAll<HTMLElement>('li[data-chave]')].find((l) => l.textContent?.includes(nome)) as HTMLElement;

beforeEach(async () => {
  instalarChromeFalso();
  Object.assign(chamadas, { interpretar: [], lembretes: [], orientacoes: [], travas: 0, aprovadas: [] });
  orientacaoSalva = '';
  planoDaIa = { plano: PLANO, perguntas: [] };
  db = await abrirBanco(`painel-pedido-${Date.now()}-${(n += 1)}`);
  el = document.createElement('div');
  document.body.append(el);
  raiz = createRoot(el);
});
afterEach(async () => {
  await act(async () => raiz.unmount());
  el.remove();
  vi.restoreAllMocks();
});

describe('painel Pedir à IA: pedido, plano e busca', () => {
  it('explica o que faz, avisa do limite de ~25-40 dias e que nada sai sozinho', async () => {
    await montar();
    const t = el.textContent ?? '';
    expect(t).toContain('Pedir à IA');
    expect(t).toMatch(/lista para revisão/);
    expect(t).toMatch(/nada é enviado sozinho/);
    expect(t).toMatch(/25 a 40 dias/);
    expect(botao('Entender o pedido').disabled).toBe(true);
    expect(campo('Pedido para a IA')).toBeTruthy();
  });

  it('"Entender o pedido" mostra o plano EDITÁVEL antes de qualquer leitura; pergunta da IA aparece; nada é lido', async () => {
    planoDaIa = { plano: PLANO, perguntas: ['De quando você quer procurar?'] };
    await montar(dados([contato('CLIENTE Ana')]));
    await digitar(campo('Pedido para a IA'), 'filtre os clientes que eu mandei mensagem perguntando sobre estoque e não respondeu');
    await clicar(botao('Entender o pedido'));
    expect(chamadas.interpretar).toEqual(['filtre os clientes que eu mandei mensagem perguntando sobre estoque e não respondeu']);
    const plano = el.querySelector('[aria-label="Plano entendido"]') as HTMLElement;
    expect(plano.textContent).toContain('Conversas dos últimos 30 dia(s), em que eu falei por último e o cliente não respondeu, sobre: perguntei sobre estoque.');
    expect(plano.textContent).toContain('De quando você quer procurar?');
    expect(campo<HTMLInputElement>('Assunto').value).toBe('perguntei sobre estoque');
    expect(campo<HTMLInputElement>('Período em dias').value).toBe('30');
    expect(campo<HTMLSelectElement>('Quem falou por último').value).toBe('eu');
    expect(campo<HTMLSelectElement>('O cliente respondeu').value).toBe('nao');
    await digitar(campo<HTMLInputElement>('Período em dias'), '15');
    expect(plano.textContent).toContain('dos últimos 15 dia(s)');
    expect(await lerPedidos(db)).toMatchObject({ ultimo: null, salvos: [] }); // só entender não grava nem lê nada
  });

  it('escolher "não respondeu" ajusta "quem falou por último" para eu (plano sempre coerente)', async () => {
    planoDaIa = { plano: { ...PLANO, respondeu: null, quemFalouPorUltimo: 'tanto_faz' }, perguntas: [] };
    await montar();
    await digitar(campo('Pedido para a IA'), 'quem perguntei estoque');
    await clicar(botao('Entender o pedido'));
    const sel = campo<HTMLSelectElement>('O cliente respondeu');
    await act(async () => {
      sel.value = 'nao';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(campo<HTMLSelectElement>('Quem falou por último').value).toBe('eu');
  });

  it('assunto vazio no plano bloqueia a busca com a explicação; sem WhatsApp aberto a busca avisa e não envia nada', async () => {
    planoDaIa = { plano: { ...PLANO, assunto: '' }, perguntas: ['Sobre qual assunto?'] };
    await montar(dados([contato('CLIENTE Ana')]));
    await digitar(campo('Pedido para a IA'), 'me mostra uns clientes');
    await clicar(botao('Entender o pedido'));
    await clicar(botao(/Buscar nas conversas/));
    expect(el.textContent).toMatch(/Ajuste o plano: diga o assunto/);
    await digitar(campo<HTMLInputElement>('Assunto'), 'perguntei sobre estoque');
    await clicar(botao(/Buscar nas conversas/));
    const e = await lerPedidos(db);
    expect(e.ultimo?.itens).toEqual([]);
    expect(e.ultimo?.avisos.join(' ')).toMatch(/WhatsApp|aba/i);
    expect(e.salvos).toHaveLength(1); // o pedido usado ficou salvo para repetir
    expect(await listarCampanhas(db)).toHaveLength(0);
  });

  it('"pedidos salvos": repetir roda "entender" de novo; apagar remove', async () => {
    await salvarPedidos(db, { salvos: [{ id: 'p1', texto: 'Quem perguntei sobre estoque', plano: PLANO, usadoEm: new Date().toISOString(), vezes: 3 }], ultimo: null });
    await montar();
    expect(el.textContent).toContain('Pedidos salvos (1)');
    await clicar(botao('Repetir'));
    expect(chamadas.interpretar).toEqual(['Quem perguntei sobre estoque']);
    await clicar(botao('Apagar'));
    expect((await lerPedidos(db)).salvos).toHaveLength(0);
  });
});

describe('painel Pedir à IA: orientações para a IA', () => {
  it('mostra as salvas, conta caracteres e salva; o texto é normalizado pelo serviço', async () => {
    orientacaoSalva = 'Nunca falar de preço.';
    await montar();
    expect(campo('Orientações para a IA').value).toBe('Nunca falar de preço.');
    expect(el.textContent).toContain('Orientações para a IA (ativas)');
    expect(botao('Salvar orientações').disabled).toBe(true);
    await digitar(campo('Orientações para a IA'), 'Nunca falar de preço. Trate por você.');
    expect(el.textContent).toContain('Não salvo');
    expect(el.textContent).toMatch(/\d+\/1500 caracteres/);
    await clicar(botao('Salvar orientações'));
    expect(chamadas.orientacoes).toEqual(['Nunca falar de preço. Trate por você.']);
    expect(el.textContent).toMatch(/Orientações salvas/);
  });

  it('explica que fica abaixo das regras de segurança, mostra exemplos no placeholder e limita a 1500', async () => {
    await montar();
    const c = campo('Orientações para a IA');
    expect(c.placeholder).toMatch(/não cobrar quem comprou nos últimos 15 dias/i);
    expect(c.placeholder).toMatch(/Nunca falar de preço/);
    expect(c.placeholder).toMatch(/Trate o cliente por você/);
    expect(c.maxLength).toBe(1500);
    expect(el.textContent).toMatch(/nunca acima.*regras de segurança, LGPD e conformidade/);
    expect(el.textContent).toMatch(/não libera link, preço nem alegação sobre o produto/);
  });
});

describe('painel Pedir à IA: resultado para revisão e ações', () => {
  const seed = async (itens: ItemPedido[]) => salvarPedidos(db, { salvos: [], ultimo: resultado(itens) });

  it('mostra o motivo de cada um, a confiança, a trava "agendado para dd/MM — fica de fora" e a pré-marcação', async () => {
    await seed([
      item('CLIENTE Ana'),
      item('CLIENTE Bia', { confianca: 'baixa', marcado: false }),
      item('CLIENTE Caio', { trava: { tipo: 'agendado', ate: '2026-12-20T12:00:00.000Z', motivo: 'agendado para 20/12 (o agendamento prevalece)' }, marcado: false }),
      item('CLIENTE Dora', { corresponde: false, revisar: true, motivo: 'Revisar: a conversa aberta não é a esperada', confianca: 'baixa', marcado: false }),
    ]);
    await montar();
    const t = el.textContent ?? '';
    expect(t).toContain('Perguntei sobre estoque em 02/11; sem resposta (CLIENTE Ana)');
    expect(t).toMatch(/2 não correspondem|2 não correspondem/);
    expect(t).toContain('Por que ficaram de fora');
    expect(linha('CLIENTE Ana').textContent).toContain('confiança alta');
    expect(linha('CLIENTE Bia').textContent).toContain('confiança baixa');
    expect(linha('CLIENTE Caio').textContent).toMatch(/Agendado para 20\/12 no CRM: fica de fora/);
    expect(linha('CLIENTE Dora').textContent).toContain('revisar');
    const marcado = (nome: string) => (linha(nome).querySelector('input[type="checkbox"]') as HTMLInputElement).checked;
    expect([marcado('CLIENTE Ana'), marcado('CLIENTE Bia'), marcado('CLIENTE Caio'), marcado('CLIENTE Dora')]).toEqual([true, false, false, false]);
    // "Enviar mensagem" só para quem pode
    expect(botao('Enviar mensagem', linha('CLIENTE Ana')).disabled).toBe(false);
    for (const nome of ['CLIENTE Caio', 'CLIENTE Dora']) expect(botao('Enviar mensagem', linha(nome)).disabled, nome).toBe(true);
    expect(botao('Enviar mensagem aos marcados (1)')).toBeTruthy();
  });

  it('quem pediu para sair só tem "Não enviar mais"; o botão de enviar fica travado', async () => {
    await seed([item('CLIENTE Eva', { pediuParaSair: true, marcado: false })]);
    await montar();
    expect(linha('CLIENTE Eva').textContent).toMatch(/pediu para não receber mais mensagens/);
    expect(botao('Enviar mensagem', linha('CLIENTE Eva')).disabled).toBe(true);
    expect(botao('Não enviar mais', linha('CLIENTE Eva')).disabled).toBe(false);
  });

  it('"Não enviar mais" pede confirmação e grava o bloqueio; "Ignorar" só tira da lista; recusar não faz nada', async () => {
    await seed([item('CLIENTE Ana'), item('CLIENTE Bia')]);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    await montar();
    await clicar(botao('Não enviar mais', linha('CLIENTE Ana')));
    expect(await listarNaoEnviar(db)).toHaveLength(0);
    await clicar(botao('Não enviar mais', linha('CLIENTE Ana')));
    expect(confirmar).toHaveBeenCalledTimes(2);
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['cliente ana']);
    await clicar(botao('Ignorar', linha('CLIENTE Bia')));
    const ultimo = (await lerPedidos(db)).ultimo!;
    expect(ultimo.itens.map((i) => [i.nome, i.estado])).toEqual([['CLIENTE Ana', 'nao_enviar'], ['CLIENTE Bia', 'ignorado']]);
    expect(linha('CLIENTE Ana').textContent).toContain('Não enviar mais');
  });

  it('"Agendar no CRM" usa os dias escolhidos, cria o lembrete e diz que NENHUMA mensagem foi enviada', async () => {
    await seed([item('CLIENTE Ana')]);
    await montar();
    await digitar(campo<HTMLInputElement>('Dias do agendamento'), '20');
    await clicar(botao('Agendar no CRM (20 d)', linha('CLIENTE Ana')));
    expect(chamadas.lembretes).toHaveLength(1);
    expect(chamadas.lembretes[0].nome).toBe('CLIENTE Ana');
    expect(el.textContent).toMatch(/1 agendamento\(s\) criado\(s\) no CRM. Nenhuma mensagem foi enviada/);
    expect((await lerPedidos(db)).ultimo!.itens[0].estado).toBe('agendado');
  });

  it('Enviar mensagem: prévia OBRIGATÓRIA com o texto exato; só depois de aprovar vira campanha comum (aba 3) e o item sai da lista aberta', async () => {
    await seed([item('CLIENTE Ana'), item('CLIENTE Bia', { confianca: 'baixa', marcado: false })]);
    await montar();
    await clicar(botao('Enviar mensagem aos marcados (1)'));
    expect(el.querySelector('[aria-label="Enviar mensagem"]')?.textContent).toMatch(/prévia obrigatória/);
    expect(el.textContent).toMatch(/Nada é enviado agora/);
    expect(botao('Montar a prévia').disabled).toBe(true); // sem texto do dono
    expect(botao(/Aprovar e ir para o Envio/)).toBeUndefined();
    // texto inválido: mostra o motivo e continua travado
    await digitar(campo('Seus textos para este pedido, variação 1'), 'Oi! Veja o estoque em www.salvita.com.br');
    expect(el.textContent).not.toMatch(/precisa conter/); // {nome} é opcional (0.7.58)
    expect(botao('Montar a prévia').disabled).toBe(true);
    await digitar(campo('Seus textos para este pedido, variação 1'), 'Oi, {nome}! Passando para saber se você viu a minha pergunta sobre o estoque.');
    expect(botao('Montar a prévia').disabled).toBe(false);
    await clicar(botao('Montar a prévia'));
    expect(el.textContent).toContain('Prévia: 1 mensagem(ns)');
    expect(el.textContent).toContain('Oi, Ana! Passando para saber se você viu a minha pergunta sobre o estoque.');
    expect(await listarCampanhas(db)).toHaveLength(0); // ainda nada gravado
    expect(chamadas.aprovadas).toEqual([]);
    await clicar(botao(/Aprovar e ir para o Envio/));
    const campanhas = await listarCampanhas(db);
    expect(campanhas).toHaveLength(1);
    expect(campanhas[0]).toMatchObject({ status: 'pausada', itens: [{ nome: 'CLIENTE Ana', status: 'pendente' }] });
    expect(campanhas[0].tipo).toBeUndefined();
    expect(chamadas.aprovadas).toEqual([campanhas[0].id]);
    expect((await lerPedidos(db)).ultimo!.itens.map((i) => [i.nome, i.estado])).toEqual([['CLIENTE Ana', 'na_campanha'], ['CLIENTE Bia', 'aberto']]);
  });

  it('quem ficou de fora na prévia aparece com o motivo (agendamento feito depois da leitura)', async () => {
    await seed([item('CLIENTE Ana')]);
    (crm.repo as unknown as { verificarAgendamentos: unknown }).verificarAgendamentos = async (refs: unknown[]) => refs.map(() => ({ tipo: 'agendado', ate: new Date('2026-12-20T12:00:00Z').getTime(), taskId: 1, titulo: 'Ana', como: 'nome', motivo: 'agendado para 20/12 (o agendamento prevalece)' }));
    await montar();
    await clicar(botao('Enviar mensagem', linha('CLIENTE Ana')));
    await digitar(campo('Seus textos para este pedido, variação 1'), 'Oi, {nome}! Passando para saber se você viu a minha pergunta sobre o estoque.');
    await clicar(botao('Montar a prévia'));
    expect(el.textContent).toContain('Ficam de fora (1)');
    expect(el.textContent).toMatch(/CLIENTE Ana: agendado para 20\/12/);
    expect(botao(/Aprovar e ir para o Envio/)).toBeUndefined();
    expect(await listarCampanhas(db)).toHaveLength(0);
  });

  it('leitura de mais de 12 horas pede para rodar de novo e trava o envio', async () => {
    await seed([item('CLIENTE Ana', { lidoEm: new Date(Date.now() - 20 * 3_600_000).toISOString() })]);
    await montar();
    expect(linha('CLIENTE Ana').textContent).toMatch(/rode o pedido de novo/);
    expect(botao('Enviar mensagem', linha('CLIENTE Ana')).disabled).toBe(true);
  });

  it('marcar todos / desmarcar todos', async () => {
    await seed([item('CLIENTE Ana', { marcado: false }), item('CLIENTE Bia', { marcado: false })]);
    await montar();
    await clicar(botao('Marcar todos'));
    expect(botao('Enviar mensagem aos marcados (2)')).toBeTruthy();
    await clicar(botao('Desmarcar todos'));
    expect(botao('Enviar mensagem aos marcados (0)').disabled).toBe(true);
  });
});
