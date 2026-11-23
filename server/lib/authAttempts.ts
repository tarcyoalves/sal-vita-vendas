import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';

// Limite de tentativas de login COMPARTILHADO entre instâncias serverless (tabela auth_attempts).
// Os limitadores em memória (api/index.ts e createEmergencyThrottle) continuam como primeira barreira; este
// contador cobre o que eles não alcançam: cada instância da Vercel tem o seu mapa, então um atacante que cai em
// instâncias diferentes multiplica o limite.
//
// - `chave` guardada é um HMAC (escopo + IP/e-mail): nunca e-mail, IP ou senha em claro.
// - UPSERT atômico (INSERT ... ON CONFLICT DO UPDATE): duas instâncias contando juntas não perdem incremento.
// - Janela fixa por chave: passou da janela, a contagem recomeça em 1.
// - Falha do banco: por padrão FALHA ABERTA (log, o login segue); `falhaFechada` (emergencyReset) lança.

export const JANELA_PADRAO_MS = 15 * 60 * 1000;

export interface AttemptsDb {
  execute(q: ReturnType<typeof sql>): PromiseLike<unknown>;
}
export type GetDb = () => Promise<AttemptsDb>;

export interface Limite { chave: string; max: number }

/** Chave opaca: `escopo:` + HMAC-SHA256 truncado (40 hex) das partes em minúsculas. */
export function chaveHash(escopo: string, ...partes: string[]): string {
  const h = createHmac('sha256', process.env.JWT_SECRET ?? 'auth-attempts')
    .update(partes.map(p => String(p ?? '').trim().toLowerCase()).join('|'))
    .digest('hex')
    .slice(0, 40);
  return `${escopo}:${h}`;
}

function linhas(r: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(r)) return r as Array<Record<string, unknown>>;
  const rows = (r as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? rows as Array<Record<string, unknown>> : [];
}

/** Alguma das chaves já atingiu o máximo de falhas dentro da janela? (uma única consulta) */
export async function estaBloqueado(db: AttemptsDb, limites: Limite[], janelaMs = JANELA_PADRAO_MS): Promise<boolean> {
  if (limites.length === 0) return false;
  const chaves = sql.join(limites.map(l => sql`${l.chave}`), sql`, `);
  const r = await db.execute(sql`
    SELECT chave, tentativas FROM auth_attempts
    WHERE chave IN (${chaves}) AND janela_inicio > now() - make_interval(secs => ${janelaMs / 1000}::double precision)
  `);
  const porChave = new Map(linhas(r).map(l => [String(l.chave), Number(l.tentativas)]));
  return limites.some(l => (porChave.get(l.chave) ?? 0) >= l.max);
}

/** Soma 1 falha em cada chave (UPSERT atômico numa instrução). Janela vencida recomeça em 1. */
export async function registrarFalhas(db: AttemptsDb, chaves: string[], janelaMs = JANELA_PADRAO_MS): Promise<void> {
  if (chaves.length === 0) return;
  const valores = sql.join(chaves.map(c => sql`(${c}, now(), 1)`), sql`, `);
  const venceu = sql`auth_attempts.janela_inicio < now() - make_interval(secs => ${janelaMs / 1000}::double precision)`;
  await db.execute(sql`
    INSERT INTO auth_attempts (chave, janela_inicio, tentativas) VALUES ${valores}
    ON CONFLICT (chave) DO UPDATE SET
      tentativas = CASE WHEN ${venceu} THEN 1 ELSE auth_attempts.tentativas + 1 END,
      janela_inicio = CASE WHEN ${venceu} THEN now() ELSE auth_attempts.janela_inicio END
  `);
}

/** Login certo zera a chave (só a de IP+e-mail; a de IP sozinho sobrevive, contra spray). */
export async function limparChaves(db: AttemptsDb, chaves: string[]): Promise<void> {
  if (chaves.length === 0) return;
  await db.execute(sql`DELETE FROM auth_attempts WHERE chave IN (${sql.join(chaves.map(c => sql`${c}`), sql`, `)})`);
}

/** Expurgo: linhas com janela mais velha que 1 dia já não limitam ninguém. */
export async function expurgarAntigas(db: AttemptsDb): Promise<void> {
  await db.execute(sql`DELETE FROM auth_attempts WHERE janela_inicio < now() - interval '1 day'`);
}

export class ContadorIndisponivel extends Error {
  constructor() { super('contador de tentativas indisponível'); this.name = 'ContadorIndisponivel'; }
}

function logFalha(onde: string, err: unknown) {
  // Só o nome do erro: a mensagem do driver pode trazer trechos do SQL/parâmetros.
  console.warn(`[auth-attempts] ${onde} falhou: ${err instanceof Error ? err.name : 'erro'}`);
}

/** Bloqueado? Erro do banco: falha aberta (false) ou, com `falhaFechada`, lança ContadorIndisponivel. */
export async function bloqueadoCompartilhado(
  getDb: GetDb, limites: Limite[], opts: { janelaMs?: number; falhaFechada?: boolean } = {},
): Promise<boolean> {
  try {
    return await estaBloqueado(await getDb(), limites, opts.janelaMs);
  } catch (err) {
    logFalha('consulta', err);
    if (opts.falhaFechada) throw new ContadorIndisponivel();
    return false;
  }
}

/** Registra uma falha de login nas chaves. Mesma política de erro de `bloqueadoCompartilhado`. */
export async function registrarFalhaCompartilhada(
  getDb: GetDb, chaves: string[], opts: { janelaMs?: number; falhaFechada?: boolean; sorteio?: () => number } = {},
): Promise<void> {
  try {
    const db = await getDb();
    await registrarFalhas(db, chaves, opts.janelaMs);
    // Expurgo oportunista (~2% das falhas): a tabela não cresce sem cron próprio.
    if ((opts.sorteio ?? Math.random)() < 0.02) await expurgarAntigas(db).catch(() => {});
  } catch (err) {
    logFalha('registro', err);
    if (opts.falhaFechada) throw new ContadorIndisponivel();
  }
}

/** Login certo: zera as chaves (erro só é logado; nunca derruba o login). */
export async function limparCompartilhado(getDb: GetDb, chaves: string[]): Promise<void> {
  try { await limparChaves(await getDb(), chaves); } catch (err) { logFalha('limpeza', err); }
}

/** Banco do CRM (DATABASE_URL) — import dinâmico: quem não usa o contador não acorda o Neon. */
export const crmAttemptsDb: GetDb = async () => (await import('../db')).db as unknown as AttemptsDb;
/** Banco da loja (ORDERS_DATABASE_URL) — import dinâmico: ordersDb lança sem a variável em produção. */
export const lojaAttemptsDb: GetDb = async () => (await import('../db/ordersDb')).ordersDb as unknown as AttemptsDb;
