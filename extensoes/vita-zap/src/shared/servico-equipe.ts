// "Não enviar mais" e contato registrado da EQUIPE no CRM (zapContatos.*, v0.7.60). Quem chama é o ServicoCrm (service worker),
// dentro de `exclusivo`. Cada chamada nasce de uma ação do atendente ou do ciclo do painel aberto: nada periódico por conta própria.
//
// CONSUMO DO BANCO DO CRM: a lista de "não enviar mais" fica em cache por 5 minutos (VALIDADE_EQUIPE_MS); marcar, desmarcar e
// registrar envio vão em lotes; a consulta "contatado nos últimos N dias" vai em lotes de 500 contatos.
// NUNCA vai texto de mensagem: só telefone, hash do nome, nome (para a lista), origem, tipo e data.

import type { ApoioAgendamentos } from './servico-agendamentos';
import { CHAVES_CRM } from './crm-remoto';
import {
  contatadosDoServidor,
  LOTE_CONSULTA,
  LOTE_ENVIOS,
  LOTE_OPT_OUT,
  listaOptOutsDoServidor,
  telefoneNoFio,
  VALIDADE_EQUIPE_MS,
  type ContatadoEquipe,
  type ListaOptOuts,
  type OptOutEncontrado,
  type OrigemOptOut,
  type RefEquipe,
  type TipoEnvioEquipe,
} from './equipe';

export type ApoioEquipe = Pick<ApoioAgendamentos, 'consultar' | 'alterar' | 'chamar' | 'ler' | 'gravar' | 'relogio' | 'temLogin'>;

export interface ItemOptOutEquipe extends RefEquipe {
  nome?: string;
  origem: OrigemOptOut;
  /** Quando foi marcado (epoch ms): a migração preserva a data original. */
  marcadoEm?: number;
}

export interface ItemEnvioEquipe extends RefEquipe {
  tipo: TipoEnvioEquipe;
  /** epoch ms */
  enviadoEm: number;
}

export type ResultadoOptOutsEquipe = { ok: true; lista: ListaOptOuts } | { ok: false; motivo: string };
export type ResultadoSimplesEquipe = { ok: true; quantidade: number } | { ok: false; motivo: string };
export type ResultadoContatadosEquipe = { ok: true; porContato: ContatadoEquipe[][]; optOuts: Array<OptOutEncontrado | null>; truncado: boolean } | { ok: false; motivo: string };

const SEM_LOGIN = 'sem login no CRM';

function motivoDoErro(e: { tipo: string; mensagem: string }): string {
  if (e.tipo === 'nao-encontrado') return 'o servidor do CRM ainda não tem o "não enviar mais" da equipe (o CRM precisa estar atualizado)';
  return `CRM indisponível (${e.mensagem})`;
}

const noFio = (r: RefEquipe) => ({ ...(telefoneNoFio(r.telefone) ? { telefone: telefoneNoFio(r.telefone) } : {}), nomeHash: r.nomeHash });

function lotes<T>(xs: ReadonlyArray<T>, n: number): T[][] {
  const saida: T[][] = [];
  for (let i = 0; i < xs.length; i += n) saida.push(xs.slice(i, i + n));
  return saida;
}

/** Lista de "não enviar mais" da equipe: do cache (menos de 5 min) ou do CRM. */
export async function listarOptOuts(ap: ApoioEquipe, forcar: boolean): Promise<ResultadoOptOutsEquipe> {
  if (!(await ap.temLogin())) return { ok: false, motivo: SEM_LOGIN };
  const agora = ap.relogio();
  const cache = await ap.ler<ListaOptOuts | null>(CHAVES_CRM.optouts, null);
  const valido = cache != null && Array.isArray(cache.itens) && typeof cache.em === 'number' && cache.em <= agora && agora - cache.em < VALIDADE_EQUIPE_MS;
  if (valido && !forcar) return { ok: true, lista: cache };
  const r = await ap.chamar(() => ap.consultar<unknown>('zapContatos.listarOptOuts'));
  if (!r.ok) return { ok: false, motivo: motivoDoErro(r.erro) };
  const lista = listaOptOutsDoServidor(r.valor, agora);
  if (lista === null) return { ok: false, motivo: 'resposta inesperada do CRM ao listar o "não enviar mais"' };
  await ap.gravar(CHAVES_CRM.optouts, lista);
  return { ok: true, lista };
}

export async function marcarOptOuts(ap: ApoioEquipe, itens: ReadonlyArray<ItemOptOutEquipe>): Promise<ResultadoSimplesEquipe> {
  if (itens.length === 0) return { ok: true, quantidade: 0 };
  if (!(await ap.temLogin())) return { ok: false, motivo: SEM_LOGIN };
  let criados = 0;
  for (const lote of lotes(itens, LOTE_OPT_OUT)) {
    const entrada = { itens: lote.map((i) => ({ ...noFio(i), ...(i.nome ? { nome: i.nome.slice(0, 200) } : {}), origem: i.origem, ...(i.marcadoEm != null ? { marcadoEm: new Date(i.marcadoEm) } : {}) })) };
    const r = await ap.chamar(() => ap.alterar<unknown>('zapContatos.marcarOptOuts', entrada));
    if (!r.ok) return { ok: false, motivo: motivoDoErro(r.erro) };
    criados += typeof (r.valor as { criados?: unknown } | null)?.criados === 'number' ? (r.valor as { criados: number }).criados : 0;
  }
  await ap.gravar(CHAVES_CRM.optouts, null); // a lista mudou: a próxima leitura vai ao CRM
  return { ok: true, quantidade: criados };
}

export async function desmarcarOptOuts(ap: ApoioEquipe, refs: ReadonlyArray<RefEquipe>): Promise<ResultadoSimplesEquipe> {
  if (refs.length === 0) return { ok: true, quantidade: 0 };
  if (!(await ap.temLogin())) return { ok: false, motivo: SEM_LOGIN };
  let removidos = 0;
  for (const lote of lotes(refs, LOTE_OPT_OUT)) {
    const r = await ap.chamar(() => ap.alterar<unknown>('zapContatos.desmarcarOptOuts', { itens: lote.map(noFio) }));
    if (!r.ok) return { ok: false, motivo: motivoDoErro(r.erro) };
    removidos += typeof (r.valor as { removidos?: unknown } | null)?.removidos === 'number' ? (r.valor as { removidos: number }).removidos : 0;
  }
  await ap.gravar(CHAVES_CRM.optouts, null);
  return { ok: true, quantidade: removidos };
}

export async function registrarEnvios(ap: ApoioEquipe, itens: ReadonlyArray<ItemEnvioEquipe>): Promise<ResultadoSimplesEquipe> {
  if (itens.length === 0) return { ok: true, quantidade: 0 };
  if (!(await ap.temLogin())) return { ok: false, motivo: SEM_LOGIN };
  let gravados = 0;
  for (const lote of lotes(itens, LOTE_ENVIOS)) {
    const entrada = { itens: lote.map((i) => ({ ...noFio(i), tipo: i.tipo, enviadoEm: new Date(i.enviadoEm) })) };
    const r = await ap.chamar(() => ap.alterar<unknown>('zapContatos.registrarEnvios', entrada));
    if (!r.ok) return { ok: false, motivo: motivoDoErro(r.erro) };
    gravados += typeof (r.valor as { gravados?: unknown } | null)?.gravados === 'number' ? (r.valor as { gravados: number }).gravados : 0;
  }
  return { ok: true, quantidade: gravados };
}

/** "Contatado nos últimos N dias?" para cada contato (em lotes). Um resultado por contato, na mesma ordem. */
export async function contatadosNosUltimosDias(ap: ApoioEquipe, refs: ReadonlyArray<RefEquipe>, dias: number, incluirOptOut: boolean): Promise<ResultadoContatadosEquipe> {
  if (refs.length === 0) return { ok: true, porContato: [], optOuts: [], truncado: false };
  if (!(await ap.temLogin())) return { ok: false, motivo: SEM_LOGIN };
  const porContato: ContatadoEquipe[][] = refs.map(() => []);
  const optOuts: Array<OptOutEncontrado | null> = refs.map(() => null);
  let truncado = false;
  let base = 0;
  for (const lote of lotes(refs, LOTE_CONSULTA)) {
    const entrada = { contatos: lote.map(noFio), dias: Math.max(1, Math.min(365, Math.floor(dias))), ...(incluirOptOut ? { incluirOptOut: true } : {}) };
    const r = await ap.chamar(() => ap.consultar<unknown>('zapContatos.consultarContatados', entrada));
    if (!r.ok) return { ok: false, motivo: motivoDoErro(r.erro) };
    const lido = contatadosDoServidor(r.valor);
    if (lido === null) return { ok: false, motivo: 'resposta inesperada do CRM ao consultar os contatos da equipe' };
    for (const it of lido.itens) if (it.i >= 0 && it.i < lote.length) porContato[base + it.i].push(it);
    for (const o of lido.optOuts) if (o.i >= 0 && o.i < lote.length) optOuts[base + o.i] = o;
    truncado = truncado || lido.truncado;
    base += lote.length;
  }
  return { ok: true, porContato, optOuts, truncado };
}
