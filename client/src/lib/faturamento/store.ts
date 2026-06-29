// ── Faturamento & Comissão — store (fase visual, localStorage) ───────────────
// Camada de acesso a dados. HOJE persiste em localStorage; em 02/07 cada função
// vira uma chamada tRPC equivalente — as telas não mudam. A API abaixo é o
// CONTRATO: mantenha as assinaturas estáveis.
//
// Reatividade: toda escrita dispara um evento; useFatStore() re-renderiza os
// componentes montados (inclusive entre abas do mesmo navegador via 'storage').

import { useSyncExternalStore } from 'react';
import type { Produto, Pedido, ComissaoMap, ItemPedido } from './types';

const K_PRODUTOS = 'sv_fat_products';
const K_PEDIDOS = 'sv_fat_orders';
const K_COMISSOES = 'sv_fat_commissions';

const EVT = 'sv-fat-change';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota cheia ou indisponível — ignora na fase visual */
  }
  // Notifica componentes desta aba; o evento 'storage' cobre outras abas.
  window.dispatchEvent(new Event(EVT));
}

// ── Produtos ────────────────────────────────────────────────────────────────
export const produtos = {
  list(): Produto[] {
    return read<Produto[]>(K_PRODUTOS, []);
  },
  upsert(input: Omit<Produto, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string }): Produto {
    const all = produtos.list();
    if (input.id) {
      const idx = all.findIndex((p) => p.id === input.id);
      if (idx >= 0) {
        const updated: Produto = { ...all[idx], ...input, id: all[idx].id, criadoEm: all[idx].criadoEm };
        all[idx] = updated;
        write(K_PRODUTOS, all);
        return updated;
      }
    }
    const novo: Produto = {
      id: uid(),
      nome: input.nome,
      pesoUnitarioKg: input.pesoUnitarioKg,
      valorUnitario: input.valorUnitario,
      ativo: input.ativo ?? true,
      criadoEm: new Date().toISOString(),
    };
    write(K_PRODUTOS, [...all, novo]);
    return novo;
  },
  remove(id: string): void {
    write(K_PRODUTOS, produtos.list().filter((p) => p.id !== id));
  },
};

// ── Pedidos ─────────────────────────────────────────────────────────────────
export const pedidos = {
  list(): Pedido[] {
    return read<Pedido[]>(K_PEDIDOS, []);
  },
  listBySeller(sellerId: number): Pedido[] {
    return pedidos.list().filter((p) => p.sellerId === sellerId);
  },
  get(id: string): Pedido | null {
    return pedidos.list().find((p) => p.id === id) ?? null;
  },
  upsert(input: Partial<Pedido> & { id?: string }): Pedido {
    const all = pedidos.list();
    if (input.id) {
      const idx = all.findIndex((p) => p.id === input.id);
      if (idx >= 0) {
        const updated: Pedido = { ...all[idx], ...input, id: all[idx].id };
        all[idx] = updated;
        write(K_PEDIDOS, all);
        return updated;
      }
    }
    const novo: Pedido = {
      id: uid(),
      taskId: input.taskId ?? null,
      sellerId: input.sellerId ?? null,
      sellerName: input.sellerName ?? '',
      clienteNome: input.clienteNome ?? '',
      cnpj: input.cnpj ?? '',
      razaoSocial: input.razaoSocial ?? '',
      cidade: input.cidade ?? '',
      uf: input.uf ?? '',
      status: input.status ?? 'estimado',
      comissaoPct: input.comissaoPct ?? 0,
      itens: input.itens ?? [],
      itensEstimadoSnapshot: input.itensEstimadoSnapshot ?? null,
      prazoPagamentoSal: input.prazoPagamentoSal ?? '',
      prazoPagamentoFrete: input.prazoPagamentoFrete ?? '',
      valorFretePorUnidade: input.valorFretePorUnidade ?? 0,
      observacoes: input.observacoes ?? '',
      criadoEm: input.criadoEm ?? new Date().toISOString(),
      faturadoEm: input.faturadoEm ?? null,
    };
    write(K_PEDIDOS, [...all, novo]);
    return novo;
  },
  // Marca como faturado: congela o estimado atual e grava os itens reais.
  faturar(id: string, itensReais: ItemPedido[]): Pedido | null {
    const all = pedidos.list();
    const idx = all.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const atual = all[idx];
    const faturado: Pedido = {
      ...atual,
      itensEstimadoSnapshot: atual.itensEstimadoSnapshot ?? atual.itens,
      itens: itensReais,
      status: 'faturado',
      faturadoEm: new Date().toISOString(),
    };
    all[idx] = faturado;
    write(K_PEDIDOS, all);
    return faturado;
  },
  remove(id: string): void {
    write(K_PEDIDOS, pedidos.list().filter((p) => p.id !== id));
  },
};

// ── Comissões (por atendente) ────────────────────────────────────────────────
export const comissoes = {
  all(): ComissaoMap {
    return read<ComissaoMap>(K_COMISSOES, {});
  },
  get(sellerId: number): number {
    return comissoes.all()[sellerId] ?? 0;
  },
  set(sellerId: number, pct: number): void {
    const map = comissoes.all();
    map[sellerId] = pct;
    write(K_COMISSOES, map);
  },
};

// ── Reatividade ───────────────────────────────────────────────────────────────
function subscribe(callback: () => void): () => void {
  window.addEventListener(EVT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVT, callback);
    window.removeEventListener('storage', callback);
  };
}

// Snapshot estável: só muda de referência quando algo é escrito. Evita loop no
// useSyncExternalStore (que compara por Object.is).
let cacheKey = '';
let cacheVal: { produtos: Produto[]; pedidos: Pedido[]; comissoes: ComissaoMap } = {
  produtos: [],
  pedidos: [],
  comissoes: {},
};

function getSnapshot() {
  const p = localStorage.getItem(K_PRODUTOS) ?? '';
  const o = localStorage.getItem(K_PEDIDOS) ?? '';
  const c = localStorage.getItem(K_COMISSOES) ?? '';
  const key = p + '|' + o + '|' + c;
  if (key !== cacheKey) {
    cacheKey = key;
    cacheVal = { produtos: produtos.list(), pedidos: pedidos.list(), comissoes: comissoes.all() };
  }
  return cacheVal;
}

/**
 * Hook reativo. Retorna os dados atuais + as ações do store.
 * Re-renderiza automaticamente quando qualquer parte é escrita.
 */
export function useFatStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    produtos: snap.produtos,
    pedidos: snap.pedidos,
    comissoes: snap.comissoes,
    actions: { produtos, pedidos, comissoes },
  };
}
