// Executor do modo "uma tecla" com um WhatsApp falso: confere o ciclo
// abrir+colar → (usuário aperta Enter) → evento de envio → registro → intervalo → próximo.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { listarEnvios, listarNaoEnviar, marcarNaoEnviar, registrarEnvio, salvarConfig } from '../src/shared/banco';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { abertos, esperarFila, montar } from './_executor-helpers';

describe('Executor — modo uma tecla', () => {
  it('abre e cola, espera o Enter do usuário, registra e respeita o intervalo', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    expect(abertos(t.pedidos)).toEqual(['Ana']);
    expect(t.pedidos.find((p) => p.tipo === 'abrirEColar')).toEqual({ tipo: 'abrirEColar', nome: 'Ana', texto: 'Oi Ana' });

    // Sem evento de envio, nada acontece: não existe "enviar" no protocolo.
    expect(await listarEnvios(t.db)).toHaveLength(0);

    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    expect(await listarEnvios(t.db)).toHaveLength(1);
    expect(t.ex.atual.fase).toBe('intervalo');
    // aleatorio 0.5 → 60 + floor(0.5 * 61) = 90 s
    expect(t.agendados.at(-1)?.ms).toBe(90_000);
    expect(abertos(t.pedidos)).toEqual(['Ana']);

    t.avancarRelogio(90_000);
    t.agendados.at(-1)?.fn();
    await esperarFila();
    // 0.2: acabou o intervalo, mas NADA abre sozinho — o usuário clica em "Abrir próximo".
    expect(t.ex.atual.fase).toBe('proximo_pronto');
    expect(abertos(t.pedidos)).toEqual(['Ana']);
    await t.ex.abrirProximo();
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Bia']);
  });

  it('evento de outro contato ou fora de hora é ignorado', async () => {
    const t = await montar(['Ana']);
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'x', textoConfere: false });
    expect(await listarEnvios(t.db)).toHaveLength(0);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Zé', texto: 'x', textoConfere: false });
    expect(await listarEnvios(t.db)).toHaveLength(0);
  });

  it('Pular limpa a caixa e abre o próximo sem intervalo', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.iniciar();
    await t.ex.acao('pulado');
    expect(t.pedidos.map((p) => p.tipo).filter((x) => x !== 'consultarPendencias')).toEqual(['abrirEColar', 'limparCaixa', 'abrirEColar']);
    expect(t.ex.atual.campanha.itens[0].status).toBe('pulado');
  });

  it('Não enviar mais / Não é cliente vão para a lista permanente', async () => {
    const t = await montar(['Ana', 'Bia', 'Cris']);
    await t.ex.iniciar();
    await t.ex.acao('nao_enviar');
    await t.ex.acao('nao_cliente');
    const lista = await listarNaoEnviar(t.db);
    expect(lista.map((x) => x.motivo).sort()).toEqual(['não enviar mais', 'não é cliente']);
  });

  it('freio: 3 problemas seguidos (erros do contato) pausam a campanha', async () => {
    const t = await montar(['A', 'B', 'C', 'D'], (p) =>
      p.tipo === 'abrirEColar' ? { ok: false, codigo: 'nao_encontrado', erro: 'não achei' } : { ok: true },
    );
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual(['A', 'B', 'C']);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(3);
    expect(t.ex.atual.fase).toBe('parada');
  });

  it('erro de seletor (layout mudou) pausa na hora, sem marcar o contato', async () => {
    const t = await montar(['A', 'B'], (p) => (p.tipo === 'abrirEColar' ? { ok: false, codigo: 'seletor', erro: 'layout mudou' } : { ok: true }));
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual(['A']);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.campanha.itens.every((i) => i.status === 'pendente')).toBe(true);
  });

  it('fora do horário não abre ninguém', async () => {
    const t = await montar(['A']);
    t.setAgora(new Date('2026-10-19T22:00:00Z')); // 19h
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual([]);
    expect(t.ex.atual.campanha.motivoPausa).toMatch(/fora do horário/);
  });

  it('teto diário pausa', async () => {
    const t = await montar(['A']);
    await salvarConfig(t.db, { ...CONFIG_PADRAO, tetoDiario: 2, numeroComMaisDe30Dias: true });
    for (const k of ['x', 'y']) {
      await registrarEnvio(t.db, { campanhaId: 'outra', chave: k, nome: k, enviadoEm: '2026-10-19T12:00:00.000Z', textoConfere: true });
    }
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual([]);
    expect(t.ex.atual.campanha.motivoPausa).toMatch(/teto diário/);
  });

  it('revalida na hora: quem foi marcado "Não enviar mais" depois da aprovação não é aberto', async () => {
    const t = await montar(['Ana', 'Bia']);
    await marcarNaoEnviar(t.db, { chave: 'ana', nome: 'Ana', desde: '2026-10-19T12:00:00.000Z', motivo: 'não enviar mais' });
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual(['Bia']);
    expect(t.ex.atual.campanha.itens[0].status).toBe('nao_enviar');
  });

  it('pausar com texto colado limpa a caixa', async () => {
    const t = await montar(['Ana']);
    await t.ex.iniciar();
    await t.ex.pausar();
    expect(t.pedidos).toContainEqual({ tipo: 'limparCaixa', texto: 'Oi Ana' });
    expect(t.pedidos.at(-1)).toEqual({ tipo: 'pararObservacao' });
    expect(t.ex.atual.campanha.status).toBe('pausada');
  });

  it('último contato enviado conclui a campanha na hora (sem esperar intervalo)', async () => {
    const t = await montar(['Ana']);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    expect(t.agendados).toHaveLength(0);
    expect(t.ex.atual.fase).toBe('concluida');
    expect(t.ex.atual.campanha.status).toBe('concluida');
  });
});
