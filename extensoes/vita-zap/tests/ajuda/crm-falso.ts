// CRM Lembretes falso para os testes: um `fetch` que fala o protocolo tRPC + superjson (GET ?input= e POST
// com o input no corpo), com sessão por cookie, tasks em memória e registro de todas as requisições.
// Nenhuma conta nem senha reais: o usuário e a senha abaixo existem só aqui.

import superjson from 'superjson';
import { executarTrpc, type Transporte } from '../../src/shared/crm-rede';
import type { ArmazemChaves } from '../../src/shared/leads';

export const BASE = 'https://crm.teste.local';
export const EMAIL = 'ana@teste.local';
export const SENHA = 'senha-de-teste';

export interface TaskFalsa {
  id: number;
  title: string;
  phone: string | null;
  notes: string | null;
  tags: string[];
  reminderDate: Date | null;
  reminderEnabled: boolean;
  status: string;
  lastContactedAt: Date | null;
  contactCount: number;
  convertedAt: Date | null;
  orderValue?: string | null;
}

export interface Requisicao {
  url: URL;
  metodo: string;
  credentials: RequestCredentials | undefined;
  contentType: string | null;
  entrada: unknown;
}

export interface CrmFalso {
  tasks: TaskFalsa[];
  requisicoes: Requisicao[];
  logado: boolean;
  /** Derruba a rede (fetch rejeita). */
  semRede: boolean;
  /** Força um status HTTP em todas as chamadas (ex.: 429). */
  forcarStatus: number | null;
  /** O login passa, mas a sessão não é reconhecida depois (IP restrito / cookie não enviado). */
  sessaoInvisivel: boolean;
  fetch: typeof fetch;
  transporte: Transporte;
  chamadas(caminho: string): Requisicao[];
}

export function task(parcial: Partial<TaskFalsa> & { id: number; title: string }): TaskFalsa {
  return { phone: null, notes: null, tags: [], reminderDate: null, reminderEnabled: true, status: 'pending', lastContactedAt: null, contactCount: 0, convertedAt: null, ...parcial };
}

const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (dados: unknown) => resposta(200, { result: { data: superjson.serialize(dados) } });
const erroTrpc = (status: number, code: string, message: string) => resposta(status, { error: { json: { message, code: -32001, data: { code, httpStatus: status } } } });

export function criarCrmFalso(tasks: TaskFalsa[] = [], agora: () => number = Date.now): CrmFalso {
  const crm: CrmFalso = {
    tasks,
    requisicoes: [],
    logado: false,
    semRede: false,
    forcarStatus: null,
    sessaoInvisivel: false,
    fetch: undefined as unknown as typeof fetch,
    transporte: undefined as unknown as Transporte,
    chamadas: (c) => crm.requisicoes.filter((r) => r.url.pathname === `/api/trpc/${c}`),
  };

  crm.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (crm.semRede) throw new TypeError('Failed to fetch');
    const url = new URL(String(entrada));
    const metodo = init?.method ?? 'GET';
    const caminho = url.pathname.replace('/api/trpc/', '');
    const bruto = metodo === 'GET' ? url.searchParams.get('input') : (init?.body as string | undefined);
    const entradaSer = bruto ? JSON.parse(bruto) : undefined;
    const dados = entradaSer && entradaSer.json !== null ? superjson.deserialize<Record<string, unknown>>(entradaSer) : undefined;
    const headers = new Headers(init?.headers);
    crm.requisicoes.push({ url, metodo, credentials: init?.credentials, contentType: headers.get('Content-Type'), entrada: dados });
    if (crm.forcarStatus) return resposta(crm.forcarStatus, { error: 'Muitas tentativas. Tente novamente em 15 minutos.' });

    if (caminho === 'auth.login') {
      if (dados?.email !== EMAIL || dados?.password !== SENHA) return erroTrpc(401, 'UNAUTHORIZED', 'Email ou senha inválidos');
      crm.logado = true;
      return ok({ id: 7, name: 'Ana', email: EMAIL, role: 'user' });
    }
    if (caminho === 'auth.logout') {
      crm.logado = false;
      return ok({ success: true });
    }
    if (caminho === 'auth.me') return ok(crm.logado && !crm.sessaoInvisivel ? { id: 7, name: 'Ana', email: EMAIL, role: 'user', mustChangePassword: false } : null);
    if (!crm.logado || crm.sessaoInvisivel) return erroTrpc(401, 'UNAUTHORIZED', 'UNAUTHORIZED');

    if (caminho === 'tasks.findForWhatsapp') {
      const d = dados as { phone?: string; q?: string };
      const digitos = (d.phone ?? '').replace(/\D/g, '').replace(/^55/, '');
      const achadas = crm.tasks.filter((t) => (digitos && (t.phone ?? '').replace(/\D/g, '').replace(/^55/, '') === digitos) || (d.q && t.title.toLowerCase().includes(d.q.toLowerCase())));
      return ok(achadas.slice(0, 20).map((t) => ({ ...t, notes: (t.notes ?? '').slice(-500) })));
    }
    if (caminho === 'tasks.getById') {
      const t = crm.tasks.find((x) => x.id === (dados as { id: number }).id);
      return t ? ok(t) : erroTrpc(404, 'NOT_FOUND', 'NOT_FOUND');
    }
    if (caminho === 'tasks.update') {
      const { id, ...resto } = dados as { id: number } & Partial<TaskFalsa>;
      const t = crm.tasks.find((x) => x.id === id);
      if (!t) return erroTrpc(403, 'FORBIDDEN', 'Tarefa não encontrada ou sem permissão');
      if (typeof resto.notes === 'string' && resto.notes.length > 5000) return erroTrpc(400, 'BAD_REQUEST', 'notes muito longo');
      if (typeof resto.notes === 'string' && resto.notes.replace(/\s+/g, ' ').trim().length > 15 && resto.notes !== t.notes) {
        t.lastContactedAt = new Date(agora());
        t.contactCount += 1;
      }
      Object.assign(t, resto);
      return ok({ ...t, burstWarning: false, burstCount: 0 });
    }
    if (caminho === 'tasks.toggleConverted') {
      const d = dados as { id: number; converted: boolean; orderValue?: number };
      const t = crm.tasks.find((x) => x.id === d.id);
      if (!t) return erroTrpc(403, 'FORBIDDEN', 'Tarefa não encontrada ou sem permissão');
      t.convertedAt ??= new Date(agora());
      if (!t.tags.includes('ativo')) t.tags = [...t.tags, 'ativo'];
      if (d.orderValue !== undefined) t.orderValue = d.orderValue.toFixed(2);
      return ok(t);
    }
    if (caminho === 'tasks.create') {
      const d = dados as { title: string; phone?: string; reminderDate: Date };
      const nova = task({ id: 1000 + crm.tasks.length, title: d.title, phone: d.phone?.replace(/^55/, '') ?? null, reminderDate: d.reminderDate });
      crm.tasks.push(nova);
      return ok(nova);
    }
    if (caminho === 'tasks.reminders') {
      return ok(crm.tasks.filter((t) => t.reminderDate && t.reminderEnabled && t.status === 'pending').map((t) => ({ id: t.id, title: t.title, reminderDate: t.reminderDate, reminderEnabled: t.reminderEnabled, status: t.status, notes: null, assignedTo: null, phone: t.phone })));
    }
    return erroTrpc(404, 'NOT_FOUND', `procedure ${caminho} desconhecida`);
  }) as typeof fetch;

  crm.transporte = (p) => executarTrpc(crm.fetch, p);
  return crm;
}

/** Armazenamento em memória no lugar do RepositorioLocal (para testar o ServicoCrm sozinho). */
export function criarArmazemMemoria(): ArmazemChaves & { dados: Map<string, unknown>; gravacoes: string[] } {
  const dados = new Map<string, unknown>();
  const gravacoes: string[] = [];
  const copia = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
  return {
    dados,
    gravacoes,
    async lerChave<T>(chave: string) {
      return copia(dados.get(chave)) as T | undefined;
    },
    async gravarChave(chave, valor) {
      gravacoes.push(chave);
      dados.set(chave, copia(valor));
    },
    async limparChaves(prefixo, manter) {
      for (const k of [...dados.keys()]) if (k.startsWith(prefixo) && !manter.includes(k)) dados.delete(k);
    },
  };
}
