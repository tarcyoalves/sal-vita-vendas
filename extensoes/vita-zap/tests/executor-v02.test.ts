// Executor da versão 0.2: Abrir próximo (A1), item em andamento persistido (A2), Já enviei (A3),
// texto revalidado (A8), pausa durante "abrindo" (A9), observação que expira (A10),
// avisos do WhatsApp (I1) e intervalo global (P1).

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { lerEmAndamento, listarEnvios, registrarEnvio } from '../src/shared/banco';
import type { PedidoConteudo, PendenciaEnvio, RespostaConteudo } from '../src/shared/mensagens';
import { contarEnviosHoje } from '../src/shared/politica';
import { abertos, esperarFila, montar } from './_executor-helpers';

const FOTO = ['false_ana@c.us_M1', 'false_ana@c.us_M2'];

/** WhatsApp falso que cola com sucesso e devolve foto/JID. */
const colaOk = (p: PedidoConteudo): RespostaConteudo =>
  p.tipo === 'abrirEColar' ? { ok: true, foto: FOTO, jid: 'ana@c.us' } : { ok: true };

describe('A1 — nada abre sozinho depois do intervalo', () => {
  it('fim do intervalo → "Próximo pronto"; só o clique em Abrir próximo abre a conversa', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    expect(t.ex.atual.fase).toBe('intervalo');

    t.avancarRelogio(90_000);
    t.agendados.at(-1)?.fn();
    await esperarFila();
    expect(t.ex.atual.fase).toBe('proximo_pronto');
    expect(t.ex.atual.mensagem).toMatch(/Próximo pronto — clique em Abrir próximo/);
    expect(abertos(t.pedidos)).toEqual(['Ana']);

    await t.ex.abrirProximo();
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Bia']);
    expect(t.ex.atual.fase).toBe('aguardando_envio');
  });

  it('Abrir próximo só vale quando o próximo está pronto', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.abrirProximo(); // parado
    expect(abertos(t.pedidos)).toEqual([]);
    await t.ex.iniciar();
    await t.ex.abrirProximo(); // aguardando envio
    expect(abertos(t.pedidos)).toEqual(['Ana']);
  });

  it('Pausar durante "Próximo pronto" não abre nada ao clicar depois', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    t.avancarRelogio(90_000);
    t.agendados.at(-1)?.fn();
    await t.ex.pausar();
    await t.ex.abrirProximo();
    expect(abertos(t.pedidos)).toEqual(['Ana']);
  });

  it('usuário digitando: não é problema do contato — volta para "Próximo pronto" sem marcar ninguém', async () => {
    const t = await montar(['Ana', 'Bia'], (p) =>
      p.tipo === 'abrirEColar' ? { ok: false, codigo: 'usuario_digitando', erro: 'Você está digitando' } : { ok: true },
    );
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('proximo_pronto');
    expect(t.ex.atual.mensagem).toBe('Você está digitando');
    expect(t.ex.atual.campanha.itens.every((i) => i.status === 'pendente')).toBe(true);
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
  });
});

describe('A2 — item em andamento sobrevive a fechar/recarregar o painel', () => {
  it('grava campanha, nome, texto e a foto ao colar', async () => {
    const t = await montar(['Ana'], colaOk);
    await t.ex.iniciar();
    expect(await lerEmAndamento(t.db, 'camp')).toMatchObject({ campanhaId: 'camp', chave: 'ana', nome: 'Ana', texto: 'Oi Ana', foto: FOTO, jid: 'ana@c.us' });
  });

  it('painel reaberto: mostra o item em andamento e, ao retomar, manda a foto para conferir antes de colar', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar(); // cola Ana
    // "Fecha o painel": o executor antigo some, o registro fica no banco.
    const campanhaSalva = t.ex.atual.campanha;
    const novo = t.novoExecutor({ ...campanhaSalva, status: 'pausada' });
    await novo.preparar();
    expect(novo.atual.emAndamento).toEqual({ chave: 'ana', nome: 'Ana', texto: 'Oi Ana' });

    t.pedidos.length = 0;
    await novo.iniciar();
    const abrir = t.pedidos.find((p) => p.tipo === 'abrirEColar');
    expect(abrir).toEqual({ tipo: 'abrirEColar', nome: 'Ana', texto: 'Oi Ana', fotoAntes: FOTO });
  });

  it('já existe mensagem nossa nova → conta como enviada e NUNCA cola de novo no mesmo contato', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    t.trocarRespostas((p) =>
      p.tipo === 'abrirEColar' && p.nome === 'Ana'
        ? { ok: false, codigo: 'ja_enviada', erro: 'já tem', texto: 'Oi Ana', jid: 'ana@c.us' }
        : p.tipo === 'abrirEColar'
          ? { ok: true, foto: ['b1'], jid: 'bia@c.us' }
          : { ok: true },
    );
    const novo = t.novoExecutor({ ...t.ex.atual.campanha, status: 'pausada' });
    t.pedidos.length = 0;
    await novo.iniciar();

    const envios = await listarEnvios(t.db);
    expect(envios.map((e) => e.nome)).toEqual(['Ana']);
    expect(envios[0].jid).toBe('ana@c.us');
    expect(novo.atual.campanha.itens.find((i) => i.nome === 'Ana')?.status).toBe('enviado');
    expect(await lerEmAndamento(t.db, 'camp')).toBeUndefined();
    // Ana não foi aberta de novo além da tentativa de conferência; Bia só abre depois do intervalo, por clique.
    expect(abertos(t.pedidos)).toEqual(['Ana']);
    expect(novo.atual.fase).toBe('intervalo');
  });

  it('envio percebido com o painel fechado (pendência) é registrado ao reabrir, e confirmado no content script', async () => {
    const pendencia: PendenciaEnvio = { id: 'p1', nome: 'Ana', texto: 'Oi Ana', textoConfere: true, jid: 'ana@c.us', detectadoEm: '2026-10-19T13:00:30.000Z' };
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    t.trocarRespostas((p) => (p.tipo === 'consultarPendencias' ? { ok: true, pendencias: [pendencia] } : { ok: true }));
    const novo = t.novoExecutor({ ...t.ex.atual.campanha, status: 'pausada' });
    await novo.preparar();

    const envios = await listarEnvios(t.db);
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ nome: 'Ana', enviadoEm: pendencia.detectadoEm, jid: 'ana@c.us', textoConfere: true });
    expect(novo.atual.campanha.itens[0].status).toBe('enviado');
    expect(novo.atual.emAndamento).toBeNull();
    expect(t.pedidos).toContainEqual({ tipo: 'confirmarPendencias', ids: ['p1'] });
    // Conferir de novo não duplica.
    await novo.preparar();
    expect(await listarEnvios(t.db)).toHaveLength(1);
  });

  it('pendência de outro contato/texto não é creditada a ninguém', async () => {
    const t = await montar(['Ana'], colaOk);
    t.trocarRespostas((p) =>
      p.tipo === 'consultarPendencias'
        ? { ok: true, pendencias: [{ id: 'z', nome: 'Zé', texto: 'Oi Zé', textoConfere: true, jid: null, detectadoEm: '2026-10-19T13:00:00.000Z' }] }
        : { ok: true },
    );
    await t.ex.preparar();
    expect(await listarEnvios(t.db)).toHaveLength(0);
    expect(t.pedidos.some((p) => p.tipo === 'confirmarPendencias')).toBe(false);
  });

  it('pausar com texto colado mantém o registro (se o usuário apertou Enter no meio, a retomada percebe)', async () => {
    const t = await montar(['Ana'], colaOk);
    await t.ex.iniciar();
    await t.ex.pausar();
    expect(await lerEmAndamento(t.db, 'camp')).toMatchObject({ nome: 'Ana', foto: FOTO });
    expect(t.ex.atual.emAndamento).toMatchObject({ nome: 'Ana' });
  });

  it('Pular / Problema / Não enviar apagam o registro', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    await t.ex.acao('pulado');
    expect((await lerEmAndamento(t.db, 'camp'))?.nome).toBe('Bia'); // o da Bia, recém-colado
  });

  it('registro de item que já não está pendente é descartado', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    const c = t.ex.atual.campanha;
    const novo = t.novoExecutor({ ...c, status: 'pausada', itens: c.itens.map((i) => (i.chave === 'ana' ? { ...i, status: 'pulado' as const } : i)) });
    await novo.preparar();
    expect(novo.atual.emAndamento).toBeNull();
    expect(await lerEmAndamento(t.db, 'camp')).toBeUndefined();
  });
});

describe('A3 — botão "Já enviei"', () => {
  it('registra o envio (status enviado, conta no teto, define o intervalo) e segue para o intervalo', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    await t.ex.jaEnviei();
    const envios = await listarEnvios(t.db);
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ nome: 'Ana', textoConfere: false });
    expect(contarEnviosHoje(envios, new Date('2026-10-19T13:00:00Z'))).toBe(1);
    const ana = t.ex.atual.campanha.itens[0];
    expect(ana.status).toBe('enviado');
    expect(ana.motivo).toMatch(/Já enviei/);
    expect(t.ex.atual.campanha.intervaloAtualSeg).toBe(90);
    expect(t.pedidos).toContainEqual({ tipo: 'pararObservacao' });
    expect(t.ex.atual.fase).toBe('intervalo');
    expect(abertos(t.pedidos)).toEqual(['Ana']);
  });

  it('funciona com o painel reaberto (item vindo do registro) e não abre nada sozinho', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    const novo = t.novoExecutor({ ...t.ex.atual.campanha, status: 'pausada' });
    await novo.preparar();
    t.pedidos.length = 0;
    await novo.jaEnviei();
    expect((await listarEnvios(t.db)).map((e) => e.nome)).toEqual(['Ana']);
    expect(novo.atual.campanha.itens[0].status).toBe('enviado');
    expect(novo.atual.fase).toBe('parada');
    expect(abertos(t.pedidos)).toEqual([]);
    expect(await lerEmAndamento(t.db, 'camp')).toBeUndefined();
  });

  it('clicar duas vezes não duplica o envio', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    await t.ex.jaEnviei();
    await t.ex.jaEnviei();
    expect(await listarEnvios(t.db)).toHaveLength(1);
  });

  it('sem item em andamento não faz nada', async () => {
    const t = await montar(['Ana'], colaOk);
    await t.ex.jaEnviei();
    expect(await listarEnvios(t.db)).toHaveLength(0);
  });
});

describe('A8 — texto revalidado imediatamente antes de colar', () => {
  it('texto com quebra de linha (ex.: de backup importado) nunca chega ao WhatsApp', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk, 'Oi {primeiroNome}\nTudo bem?');
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual([]);
    expect(t.ex.atual.campanha.itens[0].status).toBe('problema');
    expect(t.ex.atual.campanha.itens[0].motivo).toMatch(/quebra de linha/);
  });

  it('texto com link também é recusado', async () => {
    const t = await montar(['Ana'], colaOk, 'Oi {primeiroNome}, veja www.salvita.com.br');
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual([]);
    expect(t.ex.atual.campanha.itens[0].motivo).toMatch(/link/);
  });
});

describe('A9 — pausar enquanto a conversa abre', () => {
  it('pede o cancelamento ao content script; se o texto chegou a ser colado, limpa a caixa e guarda o registro', async () => {
    let liberar: (r: RespostaConteudo) => void = () => undefined;
    const t = await montar(['Ana'], (p) =>
      p.tipo === 'abrirEColar' ? new Promise<RespostaConteudo>((resolve) => (liberar = resolve)) : { ok: true },
    );
    const iniciando = t.ex.iniciar();
    await esperarFila();
    expect(t.ex.atual.fase).toBe('abrindo');

    await t.ex.pausar();
    expect(t.pedidos).toContainEqual({ tipo: 'cancelarAbertura' });
    expect(t.ex.atual.fase).toBe('parada');

    liberar({ ok: true, foto: FOTO, jid: 'ana@c.us' }); // o content script já tinha colado
    await iniciando;
    expect(t.pedidos).toContainEqual({ tipo: 'limparCaixa', texto: 'Oi Ana' });
    expect(t.ex.atual.fase).toBe('parada');
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(await lerEmAndamento(t.db, 'camp')).toMatchObject({ nome: 'Ana' });
  });

  it('resposta "cancelado" do content script pausa sem marcar o contato', async () => {
    const t = await montar(['Ana'], (p) => (p.tipo === 'abrirEColar' ? { ok: false, codigo: 'cancelado', erro: 'Pausado durante a abertura' } : { ok: true }));
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('parada');
    expect(t.ex.atual.campanha.itens[0].status).toBe('pendente');
  });
});

describe('A10 — observação que expira', () => {
  it('mostra no painel que não percebe mais o envio e sugere Já enviei / Pular', async () => {
    const t = await montar(['Ana'], colaOk);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:observacaoExpirou', nome: 'Ana' });
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    expect(t.ex.atual.mensagem).toMatch(/30 minutos/);
    expect(t.ex.atual.mensagem).toMatch(/Já enviei/);
  });

  it('expiração de outro contato é ignorada', async () => {
    const t = await montar(['Ana'], colaOk);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:observacaoExpirou', nome: 'Zé' });
    expect(t.ex.atual.mensagem).toBeNull();
  });
});

describe('I1 — avisos do WhatsApp pausam a campanha', () => {
  it('evento de aviso com a campanha rodando: pausa, limpa a caixa e mostra o aviso', async () => {
    const t = await montar(['Ana', 'Bia'], colaOk);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:aviso', texto: 'O WhatsApp avisou que o telefone está desconectado.' });
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.fase).toBe('parada');
    expect(t.ex.atual.mensagem).toMatch(/desconectado/);
    expect(t.pedidos).toContainEqual({ tipo: 'limparCaixa', texto: 'Oi Ana' });
  });

  it('aviso já visível ao iniciar: nem abre a primeira conversa', async () => {
    const t = await montar(['Ana'], (p) => (p.tipo === 'consultarPendencias' ? { ok: true, pendencias: [], avisoWhatsApp: 'WhatsApp com alerta de restrição' } : colaOk(p)));
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual([]);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.mensagem).toMatch(/restrição/);
  });

  it('aviso com a campanha parada é ignorado (nada para pausar)', async () => {
    const t = await montar(['Ana'], colaOk);
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:aviso', texto: 'x' });
    expect(t.ex.atual.mensagem).toBeNull();
  });
});

describe('P1 — o intervalo mínimo vale desde o último envio de QUALQUER campanha', () => {
  it('envio de outra campanha há 20 s segura esta campanha pelo resto do mínimo (60 s)', async () => {
    const t = await montar(['Ana'], colaOk);
    await registrarEnvio(t.db, { campanhaId: 'outra', chave: 'zz', nome: 'Zé', enviadoEm: '2026-10-19T12:59:40.000Z', textoConfere: true });
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual([]);
    expect(t.ex.atual.fase).toBe('intervalo');
    expect(t.agendados.at(-1)?.ms).toBe(40_000);
  });

  it('com o último envio global antigo, abre normalmente', async () => {
    const t = await montar(['Ana'], colaOk);
    await registrarEnvio(t.db, { campanhaId: 'outra', chave: 'zz', nome: 'Zé', enviadoEm: '2026-10-19T12:50:00.000Z', textoConfere: true });
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual(['Ana']);
  });
});
