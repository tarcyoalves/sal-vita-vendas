// "Não enviar mais" e contato registrado COMPARTILHADOS pelo time (Vita Zap 0.7.60, lote 2).
//
// Regras do dono (18/11/2026): o opt-out vale entre atendentes e computadores; "contatado há menos de X dias por QUALQUER atendente"
// entra na regra de não reenviar. NUNCA se guarda texto de mensagem: só quem, quando, de onde veio e o tipo.
//
// Chave do contato: o telefone canônico quando existe; senão `n:<hash do nome normalizado>`. A extensão manda SEMPRE os dois
// (telefone, se conhece, e o hash do nome) e o servidor casa o contato por qualquer um deles (ver `mesmoContato`).
// Sem consulta periódica: a extensão sincroniza ao abrir o painel, antes da prévia/fila e antes de cada envio automático.

import { z } from 'zod';

export const ORIGENS_OPT_OUT = ['manual', 'ia', 'campanha', 'cobranca', 'reativacao'] as const;
export type OrigemOptOut = (typeof ORIGENS_OPT_OUT)[number];
export const TIPOS_ENVIO = ['campanha', 'cobranca', 'reativacao', 'pedido'] as const;
export type TipoEnvio = (typeof TIPOS_ENVIO)[number];

/** Limites: a extensão manda em lotes e o servidor recusa o que passa disto. */
export const LIMITE_LOTE_OPT_OUT = 200;
export const LIMITE_LOTE_ENVIOS = 200;
export const LIMITE_LOTE_CONSULTA = 500;
export const LIMITE_LISTA_OPT_OUT = 20_000;
export const LIMITE_LINHAS_CONSULTA = 10_000;
export const DIAS_MAX_CONSULTA = 365;
/** Envio mais velho que isto não vale a pena guardar; no futuro (relógio errado) é tratado como "agora". */
export const ENVIO_MAX_IDADE_MS = 400 * 86_400_000;
export const ENVIO_TOLERANCIA_FUTURO_MS = 5 * 60_000;

/** Telefone → forma canônica: só dígitos com DDI e SEM o 9 extra do celular brasileiro (55 + DDD + 8 dígitos). Inválido → null. */
export function chaveTelefone(bruto: string | null | undefined): string | null {
  let d = (bruto ?? '').replace(/[^\d+]/g, '');
  const comMais = d.startsWith('+');
  d = d.replace(/\D/g, '');
  if (d.startsWith('00') && !comMais && d.length > 12) d = d.slice(2);
  if (d.length < 10 || d.length > 15) return null;
  if (!comMais && (d.length === 10 || d.length === 11)) d = `55${d}`;
  else if (!comMais && !(d.startsWith('55') && (d.length === 12 || d.length === 13))) return null;
  const m = /^55(\d{2})9(\d{8})$/.exec(d);
  return m ? `55${m[1]}${m[2]}` : d;
}

export const chaveDoContato = (telefone: string | null, nomeHash: string): string => telefone ?? `n:${nomeHash}`;

/**
 * Mesmo contato? Se os DOIS têm telefone, vale o telefone (nome igual com telefones diferentes são pessoas diferentes);
 * se um deles não tem, vale o hash do nome.
 */
export function mesmoContato(a: { telefone: string | null; nomeHash: string }, b: { telefone: string | null; nomeHash: string }): boolean {
  if (a.telefone && b.telefone) return a.telefone === b.telefone;
  return a.nomeHash === b.nomeHash;
}

const nomeHash = z.string().trim().toLowerCase().regex(/^[0-9a-f]{16,64}$/, 'hash do nome inválido');
const telefoneOpcional = z.string().trim().max(40).optional();
const nomeOpcional = z.string().trim().max(200).optional();

const refContato = z.object({ telefone: telefoneOpcional, nomeHash });

export const marcarOptOutsInput = z.object({
  itens: z.array(z.object({ telefone: telefoneOpcional, nomeHash, nome: nomeOpcional, origem: z.enum(ORIGENS_OPT_OUT), marcadoEm: z.date().optional() })).min(1).max(LIMITE_LOTE_OPT_OUT),
});
export const desmarcarOptOutsInput = z.object({ itens: z.array(refContato).min(1).max(LIMITE_LOTE_OPT_OUT) });
export const registrarEnviosInput = z.object({
  itens: z.array(z.object({ telefone: telefoneOpcional, nomeHash, tipo: z.enum(TIPOS_ENVIO), enviadoEm: z.date().optional() })).min(1).max(LIMITE_LOTE_ENVIOS),
});
export const consultarContatadosInput = z.object({
  contatos: z.array(refContato).min(1).max(LIMITE_LOTE_CONSULTA),
  dias: z.number().int().min(1).max(DIAS_MAX_CONSULTA),
  /** Devolve também quem dos contatos está em "não enviar mais" (confere o opt-out sem baixar a lista inteira: usado antes de cada envio). */
  incluirOptOut: z.boolean().optional(),
});

export interface RefNormalizada {
  telefone: string | null;
  nomeHash: string;
}

export function normalizarRef(r: { telefone?: string; nomeHash: string }): RefNormalizada {
  return { telefone: chaveTelefone(r.telefone), nomeHash: r.nomeHash };
}

/** Data do envio a gravar: ausente ou no futuro → agora; velha demais → null (descarta). */
export function dataDoEnvio(informada: Date | undefined, agora: Date): Date | null {
  if (!informada || !Number.isFinite(informada.getTime())) return agora;
  const ms = informada.getTime();
  if (ms > agora.getTime() + ENVIO_TOLERANCIA_FUTURO_MS) return agora;
  if (ms < agora.getTime() - ENVIO_MAX_IDADE_MS) return null;
  return informada;
}

export interface EnvioParaGravar {
  chave: string;
  telefone: string | null;
  nomeHash: string;
  tipo: TipoEnvio;
  enviadoEm: Date;
}

/** Junta os repetidos do mesmo lote (mesma chave+tipo → o mais recente): o INSERT ... ON CONFLICT não aceita a mesma linha duas vezes. */
export function prepararEnvios(itens: ReadonlyArray<{ telefone?: string; nomeHash: string; tipo: TipoEnvio; enviadoEm?: Date }>, agora: Date): EnvioParaGravar[] {
  const mapa = new Map<string, EnvioParaGravar>();
  for (const it of itens) {
    const enviadoEm = dataDoEnvio(it.enviadoEm, agora);
    if (!enviadoEm) continue;
    const ref = normalizarRef(it);
    const chave = chaveDoContato(ref.telefone, ref.nomeHash);
    const k = `${chave}|${it.tipo}`;
    const atual = mapa.get(k);
    if (!atual || enviadoEm.getTime() > atual.enviadoEm.getTime()) mapa.set(k, { chave, telefone: ref.telefone, nomeHash: ref.nomeHash, tipo: it.tipo, enviadoEm });
  }
  return [...mapa.values()];
}

export interface LinhaEnvio {
  telefone: string | null;
  nomeHash: string;
  tipo: string;
  enviadoEm: Date;
  userId: number;
}

export interface ContatadoEncontrado {
  /** Posição do contato na lista enviada. */
  i: number;
  tipo: string;
  enviadoEm: Date;
  /** Foi o próprio usuário que enviou (os outros atendentes aparecem como "outro atendente"). */
  meu: boolean;
}

/** Casa as linhas do banco com os contatos pedidos. Um item por (contato, tipo), sempre o mais recente. */
export function casarContatados(contatos: ReadonlyArray<RefNormalizada>, linhas: ReadonlyArray<LinhaEnvio>, userId: number): ContatadoEncontrado[] {
  const saida: ContatadoEncontrado[] = [];
  contatos.forEach((c, i) => {
    const porTipo = new Map<string, LinhaEnvio>();
    for (const l of linhas) {
      if (!mesmoContato(c, l)) continue;
      const atual = porTipo.get(l.tipo);
      if (!atual || l.enviadoEm.getTime() > atual.enviadoEm.getTime()) porTipo.set(l.tipo, l);
    }
    for (const l of porTipo.values()) saida.push({ i, tipo: l.tipo, enviadoEm: l.enviadoEm, meu: l.userId === userId });
  });
  return saida;
}

export interface LinhaOptOut {
  telefone: string | null;
  nomeHash: string;
  origem: string;
  userId: number;
}

export interface OptOutEncontrado {
  i: number;
  origem: string;
  meu: boolean;
}

/** Quais dos contatos pedidos estão em "não enviar mais" (um item por contato). */
export function casarOptOuts(contatos: ReadonlyArray<RefNormalizada>, linhas: ReadonlyArray<LinhaOptOut>, userId: number): OptOutEncontrado[] {
  const saida: OptOutEncontrado[] = [];
  contatos.forEach((c, i) => {
    const l = linhas.find((x) => mesmoContato(c, x));
    if (l) saida.push({ i, origem: l.origem, meu: l.userId === userId });
  });
  return saida;
}
