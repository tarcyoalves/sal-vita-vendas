// Auxiliares de teste do Executor: campanha de exemplo e um WhatsApp falso controlável.

import 'fake-indexeddb/auto';
import { abrirBanco, salvarConfig } from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { Executor } from '../src/sidepanel/executor';

let n = 0;

export function campanha(nomes: string[], modelo = 'Oi {primeiroNome}'): Campanha {
  return {
    id: 'camp',
    nome: 'teste',
    criadaEm: '2026-10-19T12:00:00.000Z',
    aprovadaEm: '2026-10-19T12:00:00.000Z',
    termoBusca: 'CLIENTE',
    filtros: FILTROS_PADRAO,
    modelos: [modelo],
    status: 'pausada',
    motivoPausa: null,
    itens: nomes.map((nome) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo, status: 'pendente', motivo: null, atualizadoEm: null })),
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
  };
}

export type Respostas = (p: PedidoConteudo) => RespostaConteudo | Promise<RespostaConteudo>;

export async function montar(nomes: string[], respostas: Respostas = () => ({ ok: true }), modelo?: string) {
  const db = await abrirBanco(`exec-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  let agora = new Date('2026-10-19T13:00:00Z'); // 10h em Fortaleza, segunda
  const pedidos: PedidoConteudo[] = [];
  const agendados: Array<{ fn: () => void; ms: number }> = [];
  let resp = respostas;
  const deps = {
    db,
    pedir: async (p: PedidoConteudo) => {
      pedidos.push(p);
      return resp(p);
    },
    agora: () => agora,
    aleatorio: () => 0.5,
    agendar: (fn: () => void, ms: number) => {
      agendados.push({ fn, ms });
      return () => undefined;
    },
  };
  return {
    db,
    ex: new Executor(deps, campanha(nomes, modelo)),
    /** "Painel reaberto": outro Executor sobre o mesmo banco e o mesmo WhatsApp falso. */
    novoExecutor: (c: Campanha) => new Executor(deps, c),
    trocarRespostas: (r: Respostas) => {
      resp = r;
    },
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

export const abertos = (pedidos: PedidoConteudo[]) =>
  pedidos.filter((p): p is Extract<PedidoConteudo, { tipo: 'abrirEColar' }> => p.tipo === 'abrirEColar').map((p) => p.nome);

export const esperarFila = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};
