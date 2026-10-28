// Executor do modo "uma tecla" com um WhatsApp falso: confere o ciclo
// abrir+colar → (usuário aperta Enter) → evento de envio → registro → intervalo → próximo.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, listarEnvios, listarNaoEnviar, marcarNaoEnviar, registrarEnvio, salvarConfig } from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { Executor } from '../src/sidepanel/executor';

let n = 0;

function campanha(nomes: string[]): Campanha {
  return {
    id: 'camp',
    nome: 'teste',
    criadaEm: '2026-10-19T12:00:00.000Z',
    aprovadaEm: '2026-10-19T12:00:00.000Z',
    termoBusca: 'CLIENTE',
    filtros: FILTROS_PADRAO,
    modelos: ['Oi {primeiroNome}'],
    status: 'pausada',
    motivoPausa: null,
    itens: nomes.map((nome) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo: 'Oi {primeiroNome}', status: 'pendente', motivo: null, atualizadoEm: null })),
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
  };
}

async function montar(nomes: string[], respostas: (p: PedidoConteudo) => RespostaConteudo = () => ({ ok: true })) {
  const db = await abrirBanco(`exec-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  let agora = new Date('2026-10-19T13:00:00Z'); // 10h em Fortaleza, segunda
  const pedidos: PedidoConteudo[] = [];
  const agendados: Array<{ fn: () => void; ms: number }> = [];
  const ex = new Executor(
    {
      db,
      pedir: async (p) => {
        pedidos.push(p);
        return respostas(p);
      },
      agora: () => agora,
      aleatorio: () => 0.5,
      agendar: (fn, ms) => {
        agendados.push({ fn, ms });
        return () => undefined;
      },
    },
    campanha(nomes),
  );
  return {
    db,
    ex,
    pedidos,
    agendados,
    avancarRelogio: (ms: number) => {
      agora = new Date(agora.getTime() + ms);
    },
    setAgora: (d: Date) => {
      agora = d;
    },
  };
}

const abertos = (pedidos: PedidoConteudo[]) =>
  pedidos.filter((p): p is Extract<PedidoConteudo, { tipo: 'abrirEColar' }> => p.tipo === 'abrirEColar').map((p) => p.nome);

describe('Executor — modo uma tecla', () => {
  it('abre e cola, espera o Enter do usuário, registra e respeita o intervalo', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    expect(abertos(t.pedidos)).toEqual(['Ana']);
    expect(t.pedidos[0]).toEqual({ tipo: 'abrirEColar', nome: 'Ana', texto: 'Oi Ana', envioAutomatico: false }); // envio manual por padrão

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
    await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 20));
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
    expect(t.pedidos.map((p) => p.tipo)).toEqual(['abrirEColar', 'limparCaixa', 'abrirEColar']);
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
    expect(t.pedidos.at(-1)).toEqual({ tipo: 'limparCaixa', texto: 'Oi Ana' });
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

  it('ordenarPendentesPorData reordena os itens pendentes do mais recente para o mais antigo', async () => {
    const t = await montar(['Helton', 'Logans', 'Carlos']);
    const mapa = new Map([
      ['helton', '2026-08-25'],
      ['logans', '2026-08-17'],
      ['carlos', '2026-09-10'],
    ]);
    await t.ex.ordenarPendentesPorData(mapa);
    expect(t.ex.atual.campanha.itens.map((i) => i.nome)).toEqual(['Carlos', 'Helton', 'Logans']);
  });
});
