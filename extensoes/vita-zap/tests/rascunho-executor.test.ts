// Executor × rascunho diferente na caixa (achado 02): o painel pede "Manter" ou "Substituir"; automático nunca substitui.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, salvarConfig } from '../src/shared/banco';
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

const DIFERENTE: RespostaConteudo = { ok: false, codigo: 'rascunho_diferente', erro: 'A conversa já tem outro texto na caixa. Não mexi nele.' };
const substituicoes = (pedidos: PedidoConteudo[]) =>
  pedidos.filter((p) => p.tipo === 'abrirEColar' && (p as { substituirRascunho?: boolean }).substituirRascunho === true);

describe('Executor — rascunho diferente (manual)', () => {
  it('pausa o item para o atendente decidir: não conta como enviado nem como problema do freio', async () => {
    const t = await montar(['Ana', 'Bia'], () => DIFERENTE);
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('rascunho_diferente');
    expect(t.ex.atual.itemAtual?.nome).toBe('Ana');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(t.ex.atual.campanha.itens[0].status).toBe('pendente');
    expect(abertos(t.pedidos)).toEqual(['Ana']); // não seguiu para a Bia
    expect(t.ex.atual.campanha.emVoo ?? null).toBeNull();
  });

  it('Manter o rascunho: item vai para "revisar" (sem freio), nada é escrito, a campanha segue', async () => {
    const t = await montar(['Ana', 'Bia'], () => DIFERENTE);
    await t.ex.iniciar();
    await t.ex.manterRascunho();
    expect(t.ex.atual.campanha.itens[0].status).toBe('revisar');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(substituicoes(t.pedidos)).toHaveLength(0);
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Bia']);
    expect(t.pedidos.some((p) => p.tipo === 'limparCaixa')).toBe(false);
  });

  it('Substituir: só com o clique, pede de novo com substituirRascunho e segue para aguardar o Enter do atendente', async () => {
    let substituindo = false;
    const t = await montar(['Ana'], (p) => {
      if (p.tipo !== 'abrirEColar') return { ok: true };
      if ((p as { substituirRascunho?: boolean }).substituirRascunho) {
        substituindo = true;
        return { ok: true, idsAntes: ['M1'] };
      }
      return DIFERENTE;
    });
    await t.ex.iniciar();
    expect(substituindo).toBe(false); // nada de substituir por conta própria
    await t.ex.substituirRascunho();
    expect(substituindo).toBe(true);
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    expect(t.ex.atual.campanha.itens[0].status).toBe('pendente');
    expect(t.ex.atual.campanha.emVoo?.idsAntes).toEqual(['M1']);
  });

  it('Substituir é recusado quando o envio automático está ligado', async () => {
    const t = await montar(['Ana'], () => DIFERENTE);
    await t.ex.iniciar();
    t.ex.setEnvioAutomatico(true);
    await t.ex.substituirRascunho();
    expect(substituicoes(t.pedidos)).toHaveLength(0);
  });

  it('Substituir/Manter fora da fase rascunho_diferente não fazem nada', async () => {
    const t = await montar(['Ana']);
    await t.ex.iniciar();
    await t.ex.substituirRascunho();
    await t.ex.manterRascunho();
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    expect(t.ex.atual.campanha.itens[0].status).toBe('pendente');
  });
});

describe('Executor — rascunho diferente (automático)', () => {
  it('nunca substitui: item vai para "revisar" sem freio e a campanha segue', async () => {
    const t = await montar(['Ana', 'Bia'], (p) => (p.tipo === 'abrirEColar' && p.nome === 'Ana' ? DIFERENTE : { ok: true, idsAntes: [] }));
    t.ex.setEnvioAutomatico(true);
    await t.ex.iniciar();
    expect(t.ex.atual.campanha.itens[0].status).toBe('revisar');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(substituicoes(t.pedidos)).toHaveLength(0);
    expect(t.pedidos.filter((p) => p.tipo === 'abrirEColar').every((p) => (p as { substituirRascunho?: boolean }).substituirRascunho !== true)).toBe(true);
  });
});
