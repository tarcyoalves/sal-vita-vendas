// @vitest-environment jsdom
//
// Modo automático (0.3.0) de ponta a ponta: Executor + content script REAL (handler do chrome
// simulado) + WhatsApp falso no formato 'real' (20/10/2026). O HTML é sintético; a validação no
// WhatsApp de verdade é o checklist do README. Relógio falso: Date, setTimeout e setInterval.

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESTADO_AUTOMATICO_PADRAO, emitirToken, ligarAutomatico } from '../src/shared/automatico';
import { abrirBanco, lerAutomatico, lerMeuNome, listarEnvios, registrarEnvio, salvarAutomatico, salvarConfig, salvarMeuNome } from '../src/shared/banco';
import type { NovoEvento } from '../src/shared/diagnostico';
import type { EventoConteudo, PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { Executor } from '../src/sidepanel/executor';
import { campanha } from './_executor-helpers';
import { type ContatoFalso, type OpcoesFalso, montarWhatsAppFalso } from './_whatsapp-falso';

const realSetImmediate = setImmediate;
const macro = (): Promise<void> => new Promise((r) => realSetImmediate(r));

type Ouvinte = (m: PedidoConteudo, remetente: { id?: string }, responder: (r: RespostaConteudo) => void) => boolean;

function contato(nome: string, extras: Partial<ContatoFalso> = {}): ContatoFalso {
  return { nome, jid: `${nome.toLowerCase()}@c.us`, formato: 'real', ...extras };
}
const NOMES_EXTRAS = [contato('Outro')];

let n = 0;

async function montarFluxo(nomes: string[], opcoes: OpcoesFalso = { botaoEnviar: 'enviar' }, ligado = true, ausentes: string[] = [], extras: Record<string, Partial<ContatoFalso>> = {}) {
  let ouvinte: Ouvinte | null = null;
  let aoEvento: (ev: EventoConteudo) => void = () => undefined;
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'ext',
      sendMessage: (ev: EventoConteudo) => {
        aoEvento(ev);
        return Promise.resolve();
      },
      onMessage: {
        addListener: (fn: Ouvinte) => {
          ouvinte = fn;
        },
        removeListener: () => {
          ouvinte = null;
        },
      },
    },
  });
  vi.resetModules();
  await import('../src/content/index');

  const w = montarWhatsAppFalso([...nomes.filter((x) => !ausentes.includes(x)).map((x) => contato(x, extras[x])), ...NOMES_EXTRAS], { buscaSemRotulo: true, ...opcoes });
  const marcasDeClique: number[] = [];
  document.getElementById('enviar')?.addEventListener('click', () => marcasDeClique.push(Date.now()));

  const db = await abrirBanco(`auto-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  if (ligado) await salvarAutomatico(db, ligarAutomatico(ESTADO_AUTOMATICO_PADRAO, new Date()));

  const pedidos: PedidoConteudo[] = [];
  const diagnostico: NovoEvento[] = [];
  const pedirContent = (p: PedidoConteudo): Promise<RespostaConteudo> =>
    new Promise((resolver) => {
      if (!ouvinte) throw new Error('content script não registrou ouvinte');
      // Solta a trava de "operação em andamento" do content script entre pedidos seguidos do teste.
      void macro().then(() => ouvinte?.(p, { id: 'ext' }, resolver));
    });
  const ex = new Executor(
    {
      db,
      pedir: async (p) => {
        pedidos.push(p);
        return pedirContent(p);
      },
      agora: () => new Date(),
      aleatorio: () => 0.5,
      agendar: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      diagnostico: { registrar: (e) => diagnostico.push(e) },
    },
    campanha(nomes),
  );
  aoEvento = (ev) => void ex.aoReceberEvento(ev);
  const fases: Array<{ fase: string; em: number }> = [];
  ex.assinar((e) => {
    if (fases.at(-1)?.fase !== e.fase) fases.push({ fase: e.fase, em: Date.now() });
  });
  return { w, db, ex, pedidos, diagnostico, pedirContent, marcasDeClique, fases };
}

async function avancar(ms: number, passo = 100): Promise<void> {
  for (let t = 0; t < ms; t += passo) {
    await vi.advanceTimersByTimeAsync(passo);
    await macro();
    await macro();
  }
}

async function ate(cond: () => boolean, limiteMs: number, descricao: string, passo = 100): Promise<void> {
  for (let t = 0; t <= limiteMs; t += passo) {
    if (cond()) return;
    await avancar(passo, passo);
  }
  throw new Error(`não aconteceu: ${descricao}`);
}

const cliquesEnviar = (w: { cliques: string[] }): number => w.cliques.filter((c) => c === 'enviar').length;
const abertos = (pedidos: PedidoConteudo[]): string[] =>
  pedidos.filter((p): p is Extract<PedidoConteudo, { tipo: 'abrirEColar' }> => p.tipo === 'abrirEColar').map((p) => p.nome);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-19T13:00:00Z')); // segunda, 10h em Fortaleza
});
afterEach(() => {
  window.__vitaZap?.encerrar?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('fluxo automático de 3 contatos', () => {
  it('abre sozinho, cola, conta 8 s, envia, confirma, espera 90–180 s e segue até concluir', async () => {
    const t = await montarFluxo(['Ana', 'Bia', 'Cai']);
    void t.ex.iniciar();
    await ate(() => cliquesEnviar(t.w) === 3 && t.ex.atual.fase === 'concluida', 900_000, 'campanha concluída', 500);

    // Cada contato recebeu a mensagem UMA vez, pelo botão de enviar.
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Bia', 'Cai']);
    expect(t.w.cliques.filter((c) => c === 'enviar')).toHaveLength(3);
    for (const nome of ['Ana', 'Bia', 'Cai']) {
      const hist = t.w.mensagens; // última conversa aberta; as anteriores ficam no histórico do falso
      expect(hist).toBeTruthy();
      expect(t.pedidos.filter((p) => p.tipo === 'enviarAutomatico' && p.nome === nome)).toHaveLength(1);
    }
    expect((await listarEnvios(t.db)).map((e) => e.nome).sort()).toEqual(['Ana', 'Bia', 'Cai']);
    expect(t.ex.atual.campanha.itens.map((i) => i.status)).toEqual(['enviado', 'enviado', 'enviado']);

    // Contagem de 8 s antes de cada clique; intervalo mínimo de 90 s entre envios.
    const inicios = t.fases.filter((f) => f.fase === 'contagem').map((f) => f.em);
    expect(inicios).toHaveLength(3);
    t.marcasDeClique.forEach((clique, i) => {
      expect(clique - inicios[i]).toBeGreaterThanOrEqual(8000);
      expect(clique - inicios[i]).toBeLessThan(10_000);
    });
    expect(t.marcasDeClique[1] - t.marcasDeClique[0]).toBeGreaterThanOrEqual(90_000);
    expect(t.marcasDeClique[2] - t.marcasDeClique[1]).toBeGreaterThanOrEqual(90_000);
    expect(t.marcasDeClique[1] - t.marcasDeClique[0]).toBeLessThanOrEqual(190_000);

    // Diagnóstico registra cada etapa, sem o texto da mensagem.
    const etapas = new Set(t.diagnostico.map((e) => e.pedido));
    for (const e of ['auto:politica_ok', 'auto:contagem_iniciada', 'auto:token_emitido', 'auto:clique_enviar', 'auto:envio_confirmado', 'auto:intervalo', 'enviarAutomatico', 'abrirEColar']) {
      expect(etapas.has(e), e).toBe(true);
    }
    expect(JSON.stringify(t.diagnostico)).not.toMatch(/Oi Ana|Oi Bia|Oi Cai/);
  });

  it('o texto da conversa sai exatamente uma vez e igual ao colado', async () => {
    const t = await montarFluxo(['Ana']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'concluida', 60_000, 'concluída');
    expect(t.w.mensagens.textContent).toContain('Oi Ana');
    expect(t.w.mensagens.textContent?.match(/Oi Ana/g)).toHaveLength(1);
    expect(t.w.caixa.textContent).toBe('');
  });
});

describe('cancelar na contagem', () => {
  it('Cancelar pausa a campanha, limpa a caixa e nada é enviado — nem depois', async () => {
    const t = await montarFluxo(['Ana', 'Bia']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem');
    expect(t.w.caixa.textContent).toBe('Oi Ana');
    await avancar(3000);
    await t.ex.cancelarEnvio();
    await avancar(40_000);
    expect(cliquesEnviar(t.w)).toBe(0);
    expect(t.w.caixa.textContent).toBe('');
    expect(t.ex.atual.fase).toBe('parada');
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.mensagem).toMatch(/cancelado/);
    expect(t.pedidos.some((p) => p.tipo === 'enviarAutomatico')).toBe(false);
    expect(t.ex.atual.campanha.itens.every((i) => i.status === 'pendente')).toBe(true);
  });
});

describe('o content script reconfere tudo antes de enviar', () => {
  it('o título muda durante a contagem: não envia, marca problema e segue', async () => {
    const t = await montarFluxo(['Ana']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem');
    await avancar(4000);
    t.w.trocarParaOutraConversa(contato('Outro'));
    await ate(() => t.ex.atual.campanha.itens[0].status !== 'pendente', 20_000, 'item resolvido');
    expect(cliquesEnviar(t.w)).toBe(0);
    expect(t.ex.atual.campanha.itens[0]).toMatchObject({ status: 'problema', codigo: 'cabecalho' });
    expect((await listarEnvios(t.db)).length).toBe(0);
  });

  it('o texto da caixa foi alterado: não envia, não apaga o que o usuário escreveu', async () => {
    const t = await montarFluxo(['Ana']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem');
    await avancar(2000);
    t.w.digitar('Oi Ana, mudei de ideia');
    await ate(() => t.ex.atual.campanha.itens[0].status !== 'pendente', 20_000, 'item resolvido');
    expect(cliquesEnviar(t.w)).toBe(0);
    expect(t.ex.atual.campanha.itens[0]).toMatchObject({ status: 'problema', codigo: 'texto_alterado' });
    expect(t.w.caixa.textContent).toBe('Oi Ana, mudei de ideia');
  });

  it('aviso do WhatsApp na tela: não envia, PAUSA a campanha e mantém o automático ligado (0.3.2)', async () => {
    const t = await montarFluxo(['Ana', 'Bia']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem');
    await avancar(3000);
    document.body.insertAdjacentHTML('beforeend', '<div role="alert">Telefone não conectado</div>');
    await ate(() => t.ex.atual.fase === 'parada', 30_000, 'pausa pelo aviso');
    expect(cliquesEnviar(t.w)).toBe(0);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.automatico).toBe(true);
    expect(t.ex.atual.alertaAutomatico).toMatch(/PAUSADA pelo freio/);
    expect((await lerAutomatico(t.db)).ligado).toBe(true);
    expect(t.w.caixa.textContent).toBe('');
  });

  it('o aviso aparece logo antes do clique (entre duas conferências do vigia): o content script recusa', async () => {
    const t = await montarFluxo(['Ana']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem');
    await avancar(7900);
    document.body.insertAdjacentHTML('beforeend', '<div role="alert">Telefone não conectado</div>');
    await ate(() => t.ex.atual.fase === 'parada', 30_000, 'pausa pelo aviso');
    expect(cliquesEnviar(t.w)).toBe(0);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect((await lerAutomatico(t.db)).ligado).toBe(true);
  });

  it('sem botão de enviar no rodapé: para com erro botao_enviar_ausente e não faz mais nada', async () => {
    const t = await montarFluxo(['Ana', 'Bia'], {});
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'parada' && t.ex.atual.erroGeral !== null, 40_000, 'erro por botão ausente');
    expect(t.ex.atual.erroGeral).toMatchObject({ nome: 'Ana', codigo: 'botao_enviar_ausente' });
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.w.cliques.filter((c) => c === 'enviar')).toEqual([]);
    expect(t.w.caixa.textContent).toBe('');
    await avancar(60_000);
    expect(abertos(t.pedidos)).toEqual(['Ana']);
    expect(t.ex.atual.campanha.itens[0].status).toBe('pendente');
  });

  it('clique dado mas envio não confirmado em 20 s: pausa com envio_nao_confirmado e não repete o contato', async () => {
    const t = await montarFluxo(['Ana', 'Bia'], { botaoEnviar: 'ignorar' });
    void t.ex.iniciar();
    await ate(() => cliquesEnviar(t.w) === 1, 40_000, 'clique');
    const quando = Date.now();
    await ate(() => t.ex.atual.fase === 'parada', 60_000, 'pausa por envio não confirmado');
    expect(Date.now() - quando).toBeGreaterThanOrEqual(19_000);
    expect(t.ex.atual.erroGeral).toMatchObject({ nome: 'Ana', codigo: 'envio_nao_confirmado' });
    expect(t.ex.atual.campanha.itens[0]).toMatchObject({ status: 'problema', codigo: 'envio_nao_confirmado' });
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect((await listarEnvios(t.db)).length).toBe(0);

    // Retomar não repete a Ana: o próximo é a Bia.
    void t.ex.iniciar();
    await ate(() => abertos(t.pedidos).length === 2, 60_000, 'abre a Bia');
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Bia']);
    expect(t.pedidos.filter((p) => p.tipo === 'enviarAutomatico' && p.nome === 'Ana')).toHaveLength(1);
  });
});

describe('usuário digitando', () => {
  it('espera e tenta de novo em 15 s, sem tocar na conversa nem marcar problema', async () => {
    const t = await montarFluxo(['Ana']);
    t.w.digitar('rascunho que eu estou escrevendo');
    void t.ex.iniciar();
    await ate(() => abertos(t.pedidos).length === 1, 5000, 'primeira tentativa');
    await avancar(500);
    expect(t.ex.atual.fase).toBe('intervalo');
    expect(t.ex.atual.mensagem).toMatch(/digitando/);
    expect(t.ex.atual.campanha.itens[0].status).toBe('pendente');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(t.w.caixa.textContent).toBe('rascunho que eu estou escrevendo');
    await avancar(13_000);
    expect(abertos(t.pedidos)).toHaveLength(1);
    expect(t.w.caixa.textContent).toBe('rascunho que eu estou escrevendo');

    // O usuário termina e limpa; a próxima tentativa (15 s) segue o fluxo.
    t.w.caixa.innerHTML = '';
    t.w.caixa.blur();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem depois de liberar');
    expect(abertos(t.pedidos)).toHaveLength(2);
  });
});

describe('o content script só aciona o envio com token e modo ligados', () => {
  async function colar(t: Awaited<ReturnType<typeof montarFluxo>>): Promise<void> {
    let resposta: RespostaConteudo | null = null;
    void t.pedirContent({ tipo: 'abrirEColar', nome: 'Ana', texto: 'Oi Ana' }).then((r) => {
      resposta = r;
    });
    await ate(() => resposta !== null, 30_000, 'abrirEColar respondeu');
    expect(t.w.caixa.textContent).toBe('Oi Ana');
    expect((resposta as RespostaConteudo | null)?.ok).toBe(true);
  }
  const alvo = { campanhaId: 'camp', nome: 'Ana', texto: 'Oi Ana' };
  const pedidoEnvio = (token: ReturnType<typeof emitirToken>, extra: Partial<typeof alvo> = {}): PedidoConteudo => ({
    tipo: 'enviarAutomatico',
    ...alvo,
    ...extra,
    jid: null,
    token,
  });

  it('sem o modo ligado no content script: recusa, mesmo com token válido', async () => {
    const t = await montarFluxo(['Ana'], { botaoEnviar: 'enviar' }, false);
    await colar(t);
    const r = await t.pedirContent(pedidoEnvio(emitirToken(alvo, Date.now(), 'tk1')));
    expect(r).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(cliquesEnviar(t.w)).toBe(0);
  });

  it('token amarrado a nome+texto+campanha, de uso único e com validade de 30 s', async () => {
    const t = await montarFluxo(['Ana'], { botaoEnviar: 'ignorar' });
    await colar(t);
    await t.pedirContent({ tipo: 'modoAutomatico', ligado: true });

    // Sem token / token de outro texto / de outro contato / de outra campanha.
    expect(await t.pedirContent({ ...pedidoEnvio(emitirToken(alvo, Date.now(), 'x')), token: undefined } as unknown as PedidoConteudo)).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(await t.pedirContent(pedidoEnvio(emitirToken({ ...alvo, texto: 'Oi Bia' }, Date.now(), 'tk-a')))).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(await t.pedirContent(pedidoEnvio(emitirToken({ ...alvo, nome: 'Bia' }, Date.now(), 'tk-b')))).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(await t.pedirContent(pedidoEnvio(emitirToken({ ...alvo, campanhaId: 'outra' }, Date.now(), 'tk-c')))).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(cliquesEnviar(t.w)).toBe(0);

    // Expirado (31 s).
    const velho = emitirToken(alvo, Date.now(), 'tk-velho');
    await avancar(31_000, 1000);
    await t.pedirContent({ tipo: 'modoAutomatico', ligado: true });
    const r = await t.pedirContent(pedidoEnvio(velho));
    expect(r).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(r.ok === false && r.erro).toMatch(/expirou/);
    expect(cliquesEnviar(t.w)).toBe(0);

    // Válido: clica uma vez. Usar de novo: recusado.
    const bom = emitirToken(alvo, Date.now(), 'tk-bom');
    expect((await t.pedirContent(pedidoEnvio(bom))).ok).toBe(true);
    expect(cliquesEnviar(t.w)).toBe(1);
    const repetido = await t.pedirContent(pedidoEnvio(bom));
    expect(repetido).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(repetido.ok === false && repetido.erro).toMatch(/já foi usado/);
    expect(cliquesEnviar(t.w)).toBe(1);
  });

  it('painel fechado: a permissão do modo expira em 45 s e nenhum envio é acionado', async () => {
    const t = await montarFluxo(['Ana'], { botaoEnviar: 'enviar' });
    await colar(t);
    await t.pedirContent({ tipo: 'modoAutomatico', ligado: true });
    const token = emitirToken(alvo, Date.now(), 'tk-fechado');
    await avancar(46_000, 1000); // ninguém renovou
    const r = await t.pedirContent(pedidoEnvio({ ...token, expiraEm: Date.now() + 1000 }));
    expect(r).toMatchObject({ ok: false, codigo: 'envio_nao_autorizado' });
    expect(cliquesEnviar(t.w)).toBe(0);
  });

  it.each(['Enviar', 'Send', 'icone'] as const)('acha o botão de enviar do rodapé (%s)', async (rotulo) => {
    const t = await montarFluxo(['Ana'], { botaoEnviar: 'enviar', rotuloBotaoEnviar: rotulo });
    await colar(t);
    await t.pedirContent({ tipo: 'modoAutomatico', ligado: true });
    expect((await t.pedirContent(pedidoEnvio(emitirToken(alvo, Date.now(), `tk-${rotulo}`)))).ok).toBe(true);
    expect(cliquesEnviar(t.w)).toBe(1);
  });

  it('botão com o mesmo rótulo FORA do rodapé não é clicado', async () => {
    const t = await montarFluxo(['Ana'], {});
    document.querySelector('#side')?.insertAdjacentHTML('beforeend', '<button type="button" aria-label="Enviar" id="falso"></button>');
    const clicado = vi.fn();
    document.getElementById('falso')?.addEventListener('click', clicado);
    await colar(t);
    await t.pedirContent({ tipo: 'modoAutomatico', ligado: true });
    const r = await t.pedirContent(pedidoEnvio(emitirToken(alvo, Date.now(), 'tk-fora')));
    expect(r).toMatchObject({ ok: false, codigo: 'botao_enviar_ausente' });
    expect(clicado).not.toHaveBeenCalled();
  });
});

describe('limites do automático (teto, pausa longa, horário)', () => {
  it('teto diário no automático é 30, mesmo com a política manual em 60', async () => {
    const t = await montarFluxo(['Ana']);
    await salvarConfig(t.db, { ...CONFIG_PADRAO, tetoDiario: 60, numeroComMaisDe30Dias: true });
    for (let i = 0; i < 30; i += 1) {
      await registrarEnvio(t.db, { campanhaId: 'antiga', chave: `c${i}`, nome: `C${i}`, enviadoEm: new Date(Date.now() - 3600_000).toISOString(), textoConfere: true, jid: null });
    }
    void t.ex.iniciar();
    await ate(() => t.ex.atual.campanha.status === 'pausada' && t.ex.atual.fase === 'parada' && t.ex.atual.mensagem !== null, 5000, 'pausa pelo teto');
    expect(t.ex.atual.mensagem).toMatch(/teto diário atingido \(30\/30\)/);
    expect(t.ex.atual.tetoDiario).toBe(30);
    expect(abertos(t.pedidos)).toEqual([]);
    expect(cliquesEnviar(t.w)).toBe(0);
  });

  it('no manual o teto continua o configurado (sem o limite de 30 do automático)', async () => {
    const t = await montarFluxo(['Ana'], { botaoEnviar: 'enviar' }, false);
    await salvarConfig(t.db, { ...CONFIG_PADRAO, tetoDiario: 60, numeroComMaisDe30Dias: true });
    for (let i = 0; i < 30; i += 1) {
      await registrarEnvio(t.db, { campanhaId: 'antiga', chave: `c${i}`, nome: `C${i}`, enviadoEm: new Date(Date.now() - 3600_000).toISOString(), textoConfere: true, jid: null });
    }
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'aguardando_envio', 30_000, 'cola no manual');
    expect(t.ex.atual.tetoDiario).toBe(60);
    expect(t.pedidos.some((p) => p.tipo === 'enviarAutomatico' || p.tipo === 'modoAutomatico')).toBe(false);
    expect(cliquesEnviar(t.w)).toBe(0);
  });

  it('a cada 10 envios seguidos vem uma pausa longa de 10–20 min (e o ritmo normal volta depois)', async () => {
    const nomes = Array.from({ length: 11 }, (_, i) => `P${i + 1}`);
    const t = await montarFluxo(nomes);
    void t.ex.iniciar();
    const esperas: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      await ate(() => cliquesEnviar(t.w) === i + 1, 1_300_000, `envio ${i + 1}`, 1000);
      await ate(() => t.ex.atual.campanha.itens[i].status === 'enviado', 60_000, `registro ${i + 1}`);
      esperas.push(t.ex.atual.campanha.intervaloAtualSeg ?? 0);
      if (i === 9) {
        await ate(() => t.ex.atual.fase === 'intervalo', 5000, 'intervalo da pausa longa');
        expect(t.ex.atual.mensagem).toMatch(/Pausa longa/);
      }
    }
    esperas.slice(0, 9).forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(90);
      expect(s).toBeLessThanOrEqual(180);
    });
    expect(esperas[9]).toBeGreaterThanOrEqual(600);
    expect(esperas[9]).toBeLessThanOrEqual(1200);
    expect(esperas[10]).toBeLessThanOrEqual(180);
    // Entre o 10º e o 11º envio passaram pelo menos 10 minutos.
    expect(t.marcasDeClique[10] - t.marcasDeClique[9]).toBeGreaterThanOrEqual(600_000);
  }, 60_000);

  it.each([
    ['sábado depois das 12h', '2026-10-17T16:00:00Z', /fora do horário \(sábado/],
    ['domingo', '2026-10-18T15:00:00Z', /domingo/],
    ['sexta às 18h', '2026-10-23T21:00:00Z', /fora do horário/],
    ['segunda antes das 8h', '2026-10-19T10:30:00Z', /fora do horário/],
  ])('fora do horário (%s): pausa e não abre conversa', async (_nome, quando, motivo) => {
    const t = await montarFluxo(['Ana']);
    vi.setSystemTime(new Date(quando));
    void t.ex.iniciar();
    await ate(() => t.ex.atual.campanha.status === 'pausada' && t.ex.atual.fase === 'parada' && t.ex.atual.mensagem !== null, 5000, 'pausa por horário');
    expect(t.ex.atual.mensagem).toMatch(motivo);
    expect(abertos(t.pedidos)).toEqual([]);
    expect(cliquesEnviar(t.w)).toBe(0);
  });

  it('sábado às 11h está dentro do horário', async () => {
    const t = await montarFluxo(['Ana']);
    vi.setSystemTime(new Date('2026-10-17T14:00:00Z'));
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem no sábado de manhã');
    expect(abertos(t.pedidos)).toEqual(['Ana']);
  });
});

describe('desligar e freio', () => {
  it('desligar o automático durante a contagem: nada é enviado e a caixa é limpa', async () => {
    const t = await montarFluxo(['Ana']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'contagem', 30_000, 'contagem');
    await salvarAutomatico(t.db, { ...(await lerAutomatico(t.db)), ligado: false });
    await ate(() => t.ex.atual.fase === 'parada', 20_000, 'pausa');
    expect(cliquesEnviar(t.w)).toBe(0);
    expect(t.w.caixa.textContent).toBe('');
    expect(t.pedidos.some((p) => p.tipo === 'enviarAutomatico')).toBe(false);
  });

  it('2 problemas seguidos PAUSAM a campanha com alerta e o automático continua ligado (0.3.2)', async () => {
    // Ana e Bia não existem no WhatsApp falso: viram "não encontrado" (problema do contato).
    const t = await montarFluxo(['Ana', 'Bia', 'Cai'], { botaoEnviar: 'enviar' }, true, ['Ana', 'Bia']);
    void t.ex.iniciar();
    await ate(() => t.ex.atual.alertaAutomatico !== null, 120_000, 'freio');
    expect(t.ex.atual.automatico).toBe(true);
    expect(t.ex.atual.alertaAutomatico).toMatch(/2 problemas seguidos/);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect((await lerAutomatico(t.db)).ligado).toBe(true);
    expect(t.ex.atual.campanha.itens.filter((i) => i.status === 'problema')).toHaveLength(2);
    expect(t.ex.atual.campanha.itens[2].status).toBe('pendente');
    expect(cliquesEnviar(t.w)).toBe(0);
  });
});

describe('0.3.1 — conversa só com mensagens minhas e conferências antes de colar', () => {
  const SO_MINHAS: Partial<ContatoFalso> = { semRecebidas: true, linhasVirtualizadas: 0, minhasIniciais: 2, mensagensSistema: true };
  const SEM_MENSAGENS: Partial<ContatoFalso> = { semRecebidas: true, linhasVirtualizadas: 0 };

  it('o caso do campo: só balões meus (✓✓) + sistema → individual, cola, envia, confirma e guarda meu nome', async () => {
    const t = await montarFluxo(['Ana'], { botaoEnviar: 'enviar' }, true, [], { Ana: SO_MINHAS });
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'concluida', 120_000, 'campanha concluída', 500);
    expect(t.ex.atual.campanha.itens[0]).toMatchObject({ status: 'enviado' });
    expect(cliquesEnviar(t.w)).toBe(1);
    expect(await lerMeuNome(t.db)).toBe('Tarcyo');
    expect(t.ex.atual.automatico).toBe(true);
  });

  it('o nome guardado é reenviado ao content script nas próximas aberturas', async () => {
    const t = await montarFluxo(['Ana'], { botaoEnviar: 'enviar' }, true, [], { Ana: SO_MINHAS });
    await salvarMeuNome(t.db, 'Tarcyo');
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'concluida', 120_000, 'campanha concluída', 500);
    const abertura = t.pedidos.find((p): p is Extract<PedidoConteudo, { tipo: 'abrirEColar' }> => p.tipo === 'abrirEColar');
    expect(abertura?.meuNome).toBe('Tarcyo');
  });

  it('nao_confirmado antes de colar NÃO conta para o freio: vira "pulado (revisar)" e o automático segue', async () => {
    const t = await montarFluxo(['Ana', 'Bia', 'Cai', 'Dani'], { botaoEnviar: 'enviar' }, true, [], { Ana: SEM_MENSAGENS, Bia: SEM_MENSAGENS, Cai: SEM_MENSAGENS });
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'concluida', 600_000, 'campanha concluída', 500);
    const itens = t.ex.atual.campanha.itens;
    expect(itens.slice(0, 3).map((i) => [i.status, i.codigo])).toEqual([
      ['pulado', 'nao_confirmado'],
      ['pulado', 'nao_confirmado'],
      ['pulado', 'nao_confirmado'],
    ]);
    expect(itens[0].motivo).toMatch(/Nada foi colado nem enviado/);
    expect(itens[3].status).toBe('enviado');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(t.ex.atual.alertaAutomatico).toBeNull();
    expect((await lerAutomatico(t.db)).ligado).toBe(true);
    expect(cliquesEnviar(t.w)).toBe(1);
  }, 60_000);

  it('só pulados e nenhum envio: a campanha não termina como "concluída" verde', async () => {
    const t = await montarFluxo(['Ana', 'Bia'], { botaoEnviar: 'enviar' }, true, [], { Ana: SEM_MENSAGENS, Bia: SEM_MENSAGENS });
    void t.ex.iniciar();
    await ate(() => t.ex.atual.fase === 'concluida', 300_000, 'campanha concluída', 500);
    expect(t.ex.atual.campanha.itens.map((i) => i.status)).toEqual(['pulado', 'pulado']);
    expect(t.ex.atual.mensagem).toMatch(/com problemas/);
    expect(cliquesEnviar(t.w)).toBe(0);
  }, 60_000);
});
