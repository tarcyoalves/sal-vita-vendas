// ── Faturamento & Comissão — store (Neon via tRPC) ───────────────────────────
// Migrado do localStorage → banco em 02/07. A API pública (assinaturas de
// produtos/pedidos/comissoes + useFatStore) é a MESMA de antes, de forma que
// NENHUMA tela precisou mudar. Estratégia:
//   • Um mirror em memória (módulo) é a fonte síncrona lida por .list()/.get().
//   • useFatStore() usa useSyncExternalStore sobre esse mirror.
//   • Escritas atualizam o mirror na hora (otimista), notificam a UI, e disparam
//     a mutation tRPC em segundo plano. Em caso de erro, recarrega do servidor.
//   • IDs continuam gerados no cliente (uid()), então upsert retorna o objeto
//     imediatamente — sem quebrar o contrato síncrono.

import { useSyncExternalStore } from 'react';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { toast } from 'sonner';
import type { AppRouter } from '../../../../server/routers';
import type { Produto, Pedido, ComissaoMap, ItemPedido } from './types';

const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
      fetch: (input, init) =>
        globalThis.fetch(input, { ...(init ?? {}), credentials: 'include' }),
    }),
  ],
});

// Chaves do localStorage antigo — lidas apenas na importação única.
const K_PRODUTOS = 'sv_fat_products';
const K_PEDIDOS = 'sv_fat_orders';
const K_COMISSOES = 'sv_fat_commissions';
const K_SYNCED = 'sv_fat_synced_v1';

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ── Mirror em memória + reatividade ──────────────────────────────────────────
type Snapshot = { produtos: Produto[]; pedidos: Pedido[]; comissoes: ComissaoMap };
let mirror: Snapshot = { produtos: [], pedidos: [], comissoes: {} };
let loaded = false;
let loading = false;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

async function reload(): Promise<void> {
  const data = await api.faturamento.getAll.query();
  mirror = {
    produtos: data.produtos as Produto[],
    pedidos: data.pedidos as Pedido[],
    comissoes: data.comissoes as ComissaoMap,
  };
  loaded = true;
  emit();
}

// Importa dados do localStorage antigo para o banco uma única vez por navegador.
// Idempotente (upsert por id no servidor) e não-destrutivo (não apaga o LS).
async function maybeImportLocal(): Promise<void> {
  try {
    if (localStorage.getItem(K_SYNCED)) return;
    const lProdutos = readLS<Produto[]>(K_PRODUTOS, []);
    const lPedidos = readLS<Pedido[]>(K_PEDIDOS, []);
    const lComissoes = readLS<ComissaoMap>(K_COMISSOES, {});
    const hasData =
      lProdutos.length > 0 || lPedidos.length > 0 || Object.keys(lComissoes).length > 0;
    if (!hasData) {
      localStorage.setItem(K_SYNCED, '1');
      return;
    }
    const comissoesStr: Record<string, number> = {};
    for (const [k, v] of Object.entries(lComissoes)) comissoesStr[String(k)] = Number(v) || 0;
    await api.faturamento.importLocal.mutate({
      produtos: lProdutos,
      pedidos: lPedidos,
      comissoes: comissoesStr,
    });
    localStorage.setItem(K_SYNCED, '1');
    await reload();
  } catch {
    // Deixa a flag sem marcar para tentar de novo numa próxima montagem.
  }
}

function ensureLoaded(): void {
  if (loaded || loading) return;
  loading = true;
  reload()
    .then(maybeImportLocal)
    .catch(() => { /* fica vazio; tenta de novo na próxima montagem */ })
    .finally(() => { loading = false; });
}

function onWriteError(): void {
  toast.error('Não foi possível salvar no servidor. Recarregando dados…');
  reload().catch(() => {});
}

// ── Produtos ──────────────────────────────────────────────────────────────────
export const produtos = {
  list(): Produto[] {
    return mirror.produtos;
  },
  upsert(input: Omit<Produto, 'id' | 'criadoEm'> & { id?: string; criadoEm?: string }): Produto {
    let result: Produto;
    const existing = input.id ? mirror.produtos.find((p) => p.id === input.id) : undefined;
    if (existing) {
      result = { ...existing, ...input, id: existing.id, criadoEm: existing.criadoEm };
      mirror = {
        ...mirror,
        produtos: mirror.produtos.map((p) => (p.id === result.id ? result : p)),
      };
    } else {
      result = {
        id: input.id ?? uid(),
        nome: input.nome,
        pesoUnitarioKg: input.pesoUnitarioKg,
        valorUnitario: input.valorUnitario,
        ativo: input.ativo ?? true,
        criadoEm: input.criadoEm ?? new Date().toISOString(),
        comissaoFixaPct: input.comissaoFixaPct ?? null,
        isentoFrete: input.isentoFrete ?? false,
      };
      mirror = { ...mirror, produtos: [...mirror.produtos, result] };
    }
    emit();
    api.faturamento.upsertProduto.mutate(result).catch(onWriteError);
    return result;
  },
  remove(id: string): void {
    mirror = { ...mirror, produtos: mirror.produtos.filter((p) => p.id !== id) };
    emit();
    api.faturamento.removeProduto.mutate({ id }).catch(onWriteError);
  },
};

// ── Pedidos ───────────────────────────────────────────────────────────────────
function buildPedido(input: Partial<Pedido> & { id?: string }): Pedido {
  return {
    id: input.id ?? uid(),
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
    valorPago: input.valorPago ?? 0,
    aprovadoEm: input.aprovadoEm ?? null,
    aprovadoPor: input.aprovadoPor ?? null,
    createdByUserId: input.createdByUserId ?? null,
    createdByRole: input.createdByRole ?? null,
  };
}

export const pedidos = {
  list(): Pedido[] {
    return mirror.pedidos;
  },
  listBySeller(sellerId: number): Pedido[] {
    return mirror.pedidos.filter((p) => p.sellerId === sellerId);
  },
  get(id: string): Pedido | null {
    return mirror.pedidos.find((p) => p.id === id) ?? null;
  },
  upsert(input: Partial<Pedido> & { id?: string }): Pedido {
    const existing = input.id ? mirror.pedidos.find((p) => p.id === input.id) : undefined;
    const result: Pedido = existing
      ? { ...existing, ...input, id: existing.id }
      : buildPedido(input);
    mirror = existing
      ? { ...mirror, pedidos: mirror.pedidos.map((p) => (p.id === result.id ? result : p)) }
      : { ...mirror, pedidos: [...mirror.pedidos, result] };
    emit();
    api.faturamento.upsertPedido.mutate(result).catch(onWriteError);
    return result;
  },
  // Marca como faturado: congela o estimado atual e grava os itens reais.
  faturar(id: string, itensReais: ItemPedido[]): Pedido | null {
    const atual = mirror.pedidos.find((p) => p.id === id);
    if (!atual) return null;
    const faturado: Pedido = {
      ...atual,
      itensEstimadoSnapshot: atual.itensEstimadoSnapshot ?? atual.itens,
      itens: itensReais,
      status: 'faturado',
      faturadoEm: new Date().toISOString(),
    };
    mirror = { ...mirror, pedidos: mirror.pedidos.map((p) => (p.id === id ? faturado : p)) };
    emit();
    api.faturamento.upsertPedido.mutate(faturado).catch(onWriteError);
    return faturado;
  },
  remove(id: string, reason: string): void {
    mirror = { ...mirror, pedidos: mirror.pedidos.filter((p) => p.id !== id) };
    emit();
    api.faturamento.removePedido.mutate({ id, reason }).catch(onWriteError);
  },
  // Revisão do admin/manager — informativa, não bloqueia ações do atendente.
  aprovar(id: string, aprovadoPorNome: string): Pedido | null {
    const atual = mirror.pedidos.find((p) => p.id === id);
    if (!atual) return null;
    const aprovado: Pedido = {
      ...atual,
      aprovadoEm: new Date().toISOString(),
      aprovadoPor: aprovadoPorNome,
    };
    mirror = { ...mirror, pedidos: mirror.pedidos.map((p) => (p.id === id ? aprovado : p)) };
    emit();
    api.faturamento.aprovarPedido.mutate({ id }).catch(onWriteError);
    return aprovado;
  },
};

// ── Comissões (por atendente) ─────────────────────────────────────────────────
export const comissoes = {
  all(): ComissaoMap {
    return mirror.comissoes;
  },
  get(sellerId: number): number {
    return mirror.comissoes[sellerId] ?? 0;
  },
  set(sellerId: number, pct: number): void {
    mirror = { ...mirror, comissoes: { ...mirror.comissoes, [sellerId]: pct } };
    emit();
    api.faturamento.setComissao.mutate({ sellerId, pct }).catch(onWriteError);
  },
};

// ── Reatividade ────────────────────────────────────────────────────────────────
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  ensureLoaded();
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Snapshot {
  return mirror;
}

/**
 * Hook reativo. Retorna os dados atuais + as ações do store.
 * Re-renderiza automaticamente quando qualquer parte é escrita.
 * Mesma assinatura da fase localStorage — nenhuma tela precisou mudar.
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
