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

import { useEffect, useSyncExternalStore } from 'react';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { toast } from 'sonner';
import type { AppRouter } from '../../../../server/routers';
import type { Produto, Pedido, ComissaoMap, ItemPedido } from './types';
import { semCamposEmpresa } from './smbiEmpresaUi';
import { FAT_FOCUS_REFETCH_MS, FAT_MOUNT_REFETCH_MS, isStale } from '../refetchPolicy';

const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/api/trpc',
      transformer: superjson,
      // keepalive: sem isso, um refresh/fechamento de aba logo após salvar pode
      // cancelar a requisição em voo antes de chegar ao servidor — o dado
      // parece salvo (otimista, na tela) mas nunca grava no banco. keepalive
      // garante que o navegador conclua a requisição mesmo com a página
      // descarregando (payloads de pedido são pequenos, bem abaixo do limite
      // de 64KB da API).
      fetch: (input, init) =>
        globalThis.fetch(input, { ...(init ?? {}), credentials: 'include', keepalive: true }),
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

// Estado da carga (separado do mirror para não trocar a referência dos dados à toa).
type Meta = { loading: boolean; error: boolean };
let meta: Meta = { loading: false, error: false };
function setMeta(next: Partial<Meta>) {
  meta = { ...meta, ...next };
  emit();
}
let lastLoadAt = 0;
let inflight: Promise<void> | null = null;
// Escritas otimistas em voo: uma recarga que começou antes delas pode trazer o estado
// antigo do servidor e desfazer a tela do usuário. Descartamos essa resposta e refazemos.
let pendingWrites = 0;
let writeEpoch = 0;
let needsReload = false;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function reload(): Promise<void> {
  if (inflight) return inflight;
  setMeta({ loading: true });
  inflight = (async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const epoch = writeEpoch;
        const data = await api.faturamento.getAll.query();
        if (pendingWrites > 0 || epoch !== writeEpoch) {
          // Houve escrita durante a busca: a resposta pode estar velha. Tenta de novo.
          if (pendingWrites > 0) { needsReload = true; break; }
          continue;
        }
        mirror = {
          produtos: data.produtos as Produto[],
          pedidos: data.pedidos as Pedido[],
          comissoes: data.comissoes as ComissaoMap,
        };
        loaded = true;
        lastLoadAt = Date.now();
        break;
      }
      setMeta({ loading: false, error: false });
    } catch (err) {
      console.error('[FatStore] Erro ao carregar dados do faturamento:', err);
      setMeta({ loading: false, error: true });
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Recarrega só se os dados têm mais de `maxAgeMs` (ou nunca carregaram). Sem erro para quem chama. */
function refreshIfStale(maxAgeMs: number): void {
  if (inflight) return;
  if (!isStale(lastLoadAt, Date.now(), maxAgeMs)) return;
  reload().catch(() => {});
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
  if (loaded || inflight) return;
  reload().then(maybeImportLocal).catch(() => {});
}

function onWriteError(): void {
  toast.error('Não foi possível salvar no servidor. Recarregando dados…');
  needsReload = true;
  flushReload();
}

// Recarga adiada porque havia escrita em voo: roda quando a fila esvazia.
function flushReload(): void {
  if (!needsReload || pendingWrites > 0) return;
  needsReload = false;
  reload().catch(() => {});
}

// O servidor devolve espelhoProtegido:true quando descartou campos de um pedido espelhado do
// SMBI. Leitura tolerante (o campo pode não existir em respostas de outras mutations): o
// espelho local ficou otimista e diferente do que foi gravado, então recarrega.
function avisarEspelhoProtegido(res: unknown): void {
  if (!res || typeof res !== 'object') return;
  const r = res as { espelhoProtegido?: boolean; itensAjustados?: boolean };
  if (r.espelhoProtegido) {
    toast.info('Este pedido está espelhado do SMBI: os valores do SMBI foram mantidos.');
    needsReload = true;
  }
  // itensAjustados: o servidor sobrescreveu comissão fixa/isenção de frete de algum item.
  if (r.itensAjustados) {
    toast.info('A comissão de algum item foi ajustada pela tabela da empresa.');
    needsReload = true;
  }
}

/** Acompanha uma escrita em segundo plano. Resolve true/false (nunca rejeita). */
function track(p: Promise<unknown>): Promise<boolean> {
  pendingWrites++;
  writeEpoch++;
  return p.then(
    (res) => { pendingWrites--; avisarEspelhoProtegido(res); flushReload(); return true; },
    () => { pendingWrites--; onWriteError(); return false; },
  );
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
    void track(api.faturamento.upsertProduto.mutate(result));
    return result;
  },
  remove(id: string): void {
    mirror = { ...mirror, produtos: mirror.produtos.filter((p) => p.id !== id) };
    emit();
    void track(api.faturamento.removeProduto.mutate({ id }));
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
    previsaoFaturamentoEm: input.previsaoFaturamentoEm ?? null,
    faturadoEm: input.faturadoEm ?? null,
    valorPago: input.valorPago ?? 0,
    aprovadoEm: input.aprovadoEm ?? null,
    aprovadoPor: input.aprovadoPor ?? null,
    // Integração SMBI — smbiCondpag*Cod vêm da tela (OrderDialog); os outros
    // quatro (smbiMovsaiId, numeroNfe, numeroCte, comissaoComercialProtegida)
    // são escritos só pelo robô/admin. O servidor os ignora vindos de um
    // atendente de qualquer forma (server/routers/faturamento.ts), mas o
    // default aqui é null para um pedido novo não carregar lixo do cliente.
    smbiMovsaiId: input.smbiMovsaiId ?? null,
    numeroNfe: input.numeroNfe ?? null,
    numeroCte: input.numeroCte ?? null,
    smbiCondpagSalCod: input.smbiCondpagSalCod ?? null,
    smbiCondpagFreteCod: input.smbiCondpagFreteCod ?? null,
    comissaoComercialProtegida: input.comissaoComercialProtegida ?? null,
    smbiSolicitadoEm: input.smbiSolicitadoEm ?? null,
    smbiSolicitadoPor: input.smbiSolicitadoPor ?? null,
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
  upsert(entrada: Partial<Pedido> & { id?: string }): Pedido {
    // Campos de empresa/solicitação são só leitura: o espelho local mantém os do servidor e o payload não os leva.
    const input = semCamposEmpresa(entrada);
    const existing = input.id ? mirror.pedidos.find((p) => p.id === input.id) : undefined;
    const result: Pedido = existing
      ? { ...existing, ...input, id: existing.id }
      : buildPedido(input);
    mirror = existing
      ? { ...mirror, pedidos: mirror.pedidos.map((p) => (p.id === result.id ? result : p)) }
      : { ...mirror, pedidos: [result, ...mirror.pedidos] };
    emit();
    void track(api.faturamento.upsertPedido.mutate(semCamposEmpresa(result)));
    return result;
  },
  // Marca como faturado: congela o estimado atual e grava os itens reais.
  //
  // `faturadoEmISO` é a data REAL do embarque, escolhida por quem fatura. Ela
  // define o mês da comissão a pagar, então não pode ser assumida como "hoje":
  // um embarque de setembro lançado em outubro cairia no mês errado. Sem valor
  // informado, cai em agora — comportamento anterior.
  faturar(id: string, itensReais: ItemPedido[], faturadoEmISO?: string | null): Pedido | null {
    const atual = mirror.pedidos.find((p) => p.id === id);
    if (!atual) return null;
    const faturado: Pedido = {
      ...atual,
      itensEstimadoSnapshot: atual.itensEstimadoSnapshot ?? atual.itens,
      itens: itensReais,
      status: 'faturado',
      faturadoEm: faturadoEmISO ?? new Date().toISOString(),
    };
    mirror = { ...mirror, pedidos: mirror.pedidos.map((p) => (p.id === id ? faturado : p)) };
    emit();
    void track(api.faturamento.upsertPedido.mutate({ ...semCamposEmpresa(faturado), acao: 'faturar' }));
    return faturado;
  },
  // Desfaz o faturamento: volta o pedido para o pipeline como estimado.
  //
  // Restaura os itens do snapshot do estimado, porque o que foi digitado ao
  // faturar são as quantidades REAIS do embarque — mantê-las transformaria o
  // dado real num "estimado" que ninguém estimou. O snapshot é limpo junto,
  // senão um novo faturamento compararia contra o estimado de duas rodadas
  // atrás.
  //
  // `previsaoFaturamentoEm` é preservada: ela é a competência do pedido
  // enquanto estimado, e apagá-la jogaria o pedido de volta no mês da digitação.
  desfazerFaturamento(id: string): Pedido | null {
    const atual = mirror.pedidos.find((p) => p.id === id);
    if (!atual || atual.status !== 'faturado') return null;
    const estimado: Pedido = {
      ...atual,
      itens: atual.itensEstimadoSnapshot ?? atual.itens,
      itensEstimadoSnapshot: null,
      status: 'estimado',
      faturadoEm: null,
      // Valor pago se refere ao faturamento que está sendo desfeito.
      valorPago: 0,
    };
    mirror = { ...mirror, pedidos: mirror.pedidos.map((p) => (p.id === id ? estimado : p)) };
    emit();
    void track(api.faturamento.upsertPedido.mutate({ ...semCamposEmpresa(estimado), acao: 'desfazer' }));
    return estimado;
  },
  remove(id: string, reason: string): void {
    mirror = { ...mirror, pedidos: mirror.pedidos.filter((p) => p.id !== id) };
    emit();
    void track(api.faturamento.removePedido.mutate({ id, reason }));
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
    void track(api.faturamento.aprovarPedido.mutate({ id }));
    return aprovado;
  },
  // Igual a aprovar(), mas só resolve depois da resposta do servidor: devolve null se a
  // gravação falhou (o toast de erro e a recarga já foram disparados) — a tela só deve
  // anunciar "aprovado" quando isto devolver o pedido.
  async aprovarConfirmando(id: string, aprovadoPorNome: string): Promise<Pedido | null> {
    const atual = mirror.pedidos.find((p) => p.id === id);
    if (!atual) return null;
    const aprovado: Pedido = {
      ...atual,
      aprovadoEm: new Date().toISOString(),
      aprovadoPor: aprovadoPorNome,
    };
    mirror = { ...mirror, pedidos: mirror.pedidos.map((p) => (p.id === id ? aprovado : p)) };
    emit();
    const ok = await track(api.faturamento.aprovarPedido.mutate({ id }));
    return ok ? aprovado : null;
  },
  // ── Ações do SMBI ──────────────────────────────────────────────────────────
  // Sem atualização otimista: o servidor valida (pedido faturado, robô processando agora, vínculo…)
  // e a tela só muda depois da resposta. Erro = a promessa rejeita; quem chama mostra a mensagem.
  // Solicitação manual de envio para o ERP SMBI (cria pedido NOVO lá).
  // `empresaCnpj` só com o envio com escolha de empresa ligado; sem ele o corpo é exatamente { id } (fluxo antigo).
  async dispararSmbi(id: string, empresaCnpj?: string): Promise<Pedido | null> {
    return aplicarLinhaServidor(await api.faturamento.dispararSmbi.mutate(empresaCnpj ? { id, empresaCnpj } : { id }));
  },
  // Desfaz um clique por engano, antes de o robô pegar o pedido.
  async cancelarSmbi(id: string): Promise<Pedido | null> {
    return aplicarLinhaServidor(await api.faturamento.cancelarSmbi.mutate({ id }));
  },
  // Admin: liga o pedido a movsai(s) que já existem no SMBI, ex. "1071" ou "1071, 1072" (o robô
  // nunca cria esse pedido e depois confere no SMBI).
  // `empresaCnpj`: só quando o pedido ainda não tem empresa e o envio com escolha de empresa está ligado.
  async vincularSmbi(id: string, movsais: string, empresaCnpj?: string): Promise<Pedido | null> {
    return aplicarLinhaServidor(await api.faturamento.vincularSmbi.mutate(empresaCnpj ? { id, movsais, empresaCnpj } : { id, movsais }));
  },
  // Admin: desfaz um vínculo (auditado). O pedido só volta ao robô com novo clique.
  async desvincularSmbi(id: string, motivo: string): Promise<Pedido | null> {
    return aplicarLinhaServidor(await api.faturamento.desvincularSmbi.mutate({ id, motivo }));
  },
  // Admin: aceita um vínculo que o robô marcou com divergência.
  async confirmarVinculoSmbi(id: string): Promise<Pedido | null> {
    return aplicarLinhaServidor(await api.faturamento.confirmarVinculoSmbi.mutate({ id }));
  },
};

/** Troca no espelho a linha do pedido pela devolvida pelo servidor (fonte da verdade). */
function aplicarLinhaServidor(row: unknown): Pedido | null {
  if (!row) return null;
  const p = row as Pedido;
  mirror = { ...mirror, pedidos: mirror.pedidos.map((x) => (x.id === p.id ? p : x)) };
  emit();
  return p;
}

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
    void track(api.faturamento.setComissao.mutate({ sellerId, pct }));
  },
};

// ── Reatividade ────────────────────────────────────────────────────────────────
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
  }
  ensureLoaded();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
}

function getSnapshot(): Snapshot {
  return mirror;
}

function getMeta(): Meta {
  return meta;
}

// Volta o foco na aba (PWA aberto o dia todo): recarrega se passaram >2 min.
// O listener só existe enquanto há alguma tela usando o store.
function onVisible() {
  if (document.visibilityState === 'visible') refreshIfStale(FAT_FOCUS_REFETCH_MS);
}
function onFocus() {
  refreshIfStale(FAT_FOCUS_REFETCH_MS);
}

/**
 * Hook reativo. Retorna os dados atuais + as ações do store.
 * Re-renderiza automaticamente quando qualquer parte é escrita.
 * `loading`/`error`/`reload` deixam a tela distinguir "sem pedidos" de "falhou ao carregar".
 */
export function useFatStore() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const m = useSyncExternalStore(subscribe, getMeta, getMeta);
  // Ao montar, busca de novo só se os dados têm >60 s: faturamento.getAll é pesado e
  // vários componentes (até a Tasks, só para um selo) montam o hook a cada navegação.
  // O foco da aba segue em 2 min (FAT_FOCUS_REFETCH_MS). Escritas já recarregam por conta própria.
  useEffect(() => {
    refreshIfStale(FAT_MOUNT_REFETCH_MS);
  }, []);
  return {
    produtos: snap.produtos,
    pedidos: snap.pedidos,
    comissoes: snap.comissoes,
    loading: m.loading,
    loaded,
    error: m.error,
    reload: () => reload().catch(() => {}),
    actions: { produtos, pedidos, comissoes },
  };
}
