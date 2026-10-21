// Cliente tRPC mínimo para o CRM Lembretes (Express + tRPC com superjson em /api/trpc).
// Roda SÓ no service worker (fetch com cookie de sessão, `credentials: 'include'`): as outras partes
// da extensão falam com ele por mensagem (ver crm-transporte.ts).
//
// Formato do tRPC (v11, sem lote): query = GET /api/trpc/<proc>?input=<json>; mutation = POST com o
// input no corpo. Com superjson, entrada e saída são `{ json, meta }`. A senha NUNCA é guardada aqui.

import superjson from 'superjson';

export type TipoErro =
  | 'rede' // sem internet / CRM fora do ar / endereço errado
  | 'credenciais' // e-mail ou senha errados (auth.login)
  | 'nao-autenticado' // 401: sessão expirada, cookie não enviado ou IP não liberado para o usuário
  | 'ip' // o servidor disse explicitamente que o IP não é permitido
  | 'origem' // 403 do csrfGuard: o servidor não conhece o ID desta extensão
  | 'limite' // 429: muitas tentativas
  | 'proibido'
  | 'nao-encontrado'
  | 'validacao'
  | 'servidor';

export interface ErroCrm {
  tipo: TipoErro;
  mensagem: string;
  status?: number;
}

/** Entrada/saída do superjson já serializada (JSON puro: pode atravessar chrome.runtime.sendMessage). */
export type Serializado = { json: unknown; meta?: unknown };

export interface PedidoTrpc {
  baseUrl: string;
  tipo: 'query' | 'mutation';
  caminho: string;
  entrada?: Serializado;
}

export type RespostaTrpc = { ok: true; dados?: Serializado } | { ok: false; erro: ErroCrm };

export type Transporte = (pedido: PedidoTrpc) => Promise<RespostaTrpc>;

export class ErroDoCrm extends Error {
  constructor(readonly erro: ErroCrm) {
    super(erro.mensagem);
    this.name = 'ErroDoCrm';
  }
}

export const MSG_SEM_REDE = 'Sem conexão com o CRM. Confira a internet e o endereço do CRM na aba Dados.';

/** Só a origem (esquema + host + porta): https, ou http só em localhost. Inválido → null. */
export function normalizarBaseUrl(texto: string): string | null {
  let u: URL;
  try {
    u = new URL(texto.trim());
  } catch {
    return null;
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return u.origin;
}

function textoDe(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

/** Traduz a resposta de erro do servidor (tRPC ou middleware Express) para um erro claro em português. */
export function classificarErro(status: number, corpo: unknown, caminho: string): ErroCrm {
  const c = (typeof corpo === 'object' && corpo !== null ? corpo : {}) as Record<string, unknown>;
  const trpc = (typeof c.error === 'object' && c.error !== null ? (c.error as Record<string, unknown>).json : undefined) as Record<string, unknown> | undefined;
  const dados = (typeof trpc?.data === 'object' && trpc.data !== null ? trpc.data : {}) as Record<string, unknown>;
  const codigo = textoDe(dados.code);
  const msg = textoDe(trpc?.message) ?? textoDe(c.error);
  const base = { status };

  if (status === 429) return { ...base, tipo: 'limite', mensagem: msg ?? 'Muitas tentativas. Espere alguns minutos.' };
  if (status === 403 && typeof c.error === 'string' && /^Origem|Content-Type/i.test(c.error)) {
    return { ...base, tipo: 'origem', mensagem: 'O CRM não aceitou esta extensão (origem não permitida). O servidor precisa estar atualizado com o ID da extensão.' };
  }
  if (codigo === 'UNAUTHORIZED' || status === 401) {
    if (caminho === 'auth.login') return { ...base, tipo: 'credenciais', mensagem: 'E-mail ou senha inválidos.' };
    return { ...base, tipo: 'nao-autenticado', mensagem: 'Sessão não reconhecida: ela expirou ou o seu IP não está liberado no CRM. Entre de novo na aba Dados.' };
  }
  if (codigo === 'FORBIDDEN' || status === 403) {
    if (msg && /\bIP\b/.test(msg)) return { ...base, tipo: 'ip', mensagem: `IP não permitido: ${msg}` };
    return { ...base, tipo: 'proibido', mensagem: msg ?? 'Sem permissão para esta ação no CRM.' };
  }
  if (codigo === 'NOT_FOUND' || status === 404) return { ...base, tipo: 'nao-encontrado', mensagem: msg ?? 'Não encontrado no CRM.' };
  if (codigo === 'BAD_REQUEST' || status === 400) return { ...base, tipo: 'validacao', mensagem: msg ?? 'O CRM recusou os dados enviados.' };
  return { ...base, tipo: 'servidor', mensagem: `O CRM respondeu com erro${status ? ` (${status})` : ''}${msg ? `: ${msg}` : '.'}` };
}

/** Executa UM pedido tRPC com `fetch` (o do service worker, ou um falso nos testes). Nunca lança. */
export async function executarTrpc(fetchImpl: typeof fetch, pedido: PedidoTrpc): Promise<RespostaTrpc> {
  let url: URL;
  try {
    url = new URL(`/api/trpc/${pedido.caminho}`, pedido.baseUrl);
  } catch {
    return { ok: false, erro: { tipo: 'rede', mensagem: 'Endereço do CRM inválido.' } };
  }
  const init: RequestInit = { credentials: 'include', cache: 'no-store' };
  if (pedido.tipo === 'query') {
    if (pedido.entrada) url.searchParams.set('input', JSON.stringify(pedido.entrada));
    init.method = 'GET';
  } else {
    init.method = 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(pedido.entrada ?? { json: null });
  }
  let resp: Response;
  try {
    resp = await fetchImpl(url.toString(), init);
  } catch {
    return { ok: false, erro: { tipo: 'rede', mensagem: MSG_SEM_REDE } };
  }
  let corpo: unknown;
  try {
    corpo = await resp.json();
  } catch {
    corpo = undefined;
  }
  if (!resp.ok) return { ok: false, erro: classificarErro(resp.status, corpo, pedido.caminho) };
  const dados = ((corpo as { result?: { data?: Serializado } } | undefined)?.result?.data) as Serializado | undefined;
  if (dados === undefined) return { ok: false, erro: { tipo: 'servidor', mensagem: 'Resposta inesperada do CRM.' } };
  return { ok: true, dados };
}

export interface ClienteTrpc {
  consultar<T>(caminho: string, entrada?: unknown): Promise<T>;
  alterar<T>(caminho: string, entrada?: unknown): Promise<T>;
}

/** Cliente tipado por cima de um transporte. Lança `ErroDoCrm` em qualquer falha. */
export function criarClienteTrpc(transporte: Transporte, baseUrl: () => Promise<string>): ClienteTrpc {
  async function chamar<T>(tipo: PedidoTrpc['tipo'], caminho: string, entrada: unknown): Promise<T> {
    const r = await transporte({
      baseUrl: await baseUrl(),
      tipo,
      caminho,
      ...(entrada !== undefined ? { entrada: superjson.serialize(entrada) as Serializado } : {}),
    });
    if (!r.ok) throw new ErroDoCrm(r.erro);
    return (r.dados ? superjson.deserialize(r.dados as Parameters<typeof superjson.deserialize>[0]) : undefined) as T;
  }
  return {
    consultar: (caminho, entrada) => chamar('query', caminho, entrada),
    alterar: (caminho, entrada) => chamar('mutation', caminho, entrada),
  };
}
