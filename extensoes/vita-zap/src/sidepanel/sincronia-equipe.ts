// Sincronização com a EQUIPE (v0.7.60): o "não enviar mais" e o contato registrado passam a valer entre atendentes e computadores.
// O CRM é a fonte; a lista local (IndexedDB) é cache/offline: a UNIÃO vale (opt-out em qualquer lugar vale em todos).
//
// Quando roda (nada periódico): ao abrir o painel, antes de montar prévia/fila (preparar) e antes de cada envio automático
// (conferirEquipeAntesDeEnviar, uma consulta ao CRM com o opt-out junto). Cache curto de 5 min na lista (no serviço do CRM).
// Falha do CRM: o opt-out local continua valendo; o envio automático PAUSA (mesma regra da trava de agendamento) e a campanha
// manual só avisa. NUNCA sai texto de mensagem daqui.

import {
  type Banco,
  desmarcarNaoEnviar,
  listarCampanhas,
  listarContatos,
  listarEnvios,
  listarNaoEnviar,
  lerEstadoEquipe,
  marcarNaoEnviar,
  salvarEstadoEquipe,
} from '../shared/banco';
import type { Campanha, ItemCampanha } from '../shared/campanha';
import { diferencaDias, hojeNoFuso } from '../shared/datas';
import {
  DIAS_CONSULTA_PLANEJAMENTO,
  DIAS_MIGRACAO_ENVIOS,
  LOTE_CONSULTA,
  VALIDADE_EQUIPE_MS,
  hashDoNome,
  maisRecenteDaEquipe,
  motivoContatoDaEquipe,
  origemDoMotivo,
  planejarOptOuts,
  refDoContato,
  tipoDoEnvio,
  type ContatoDaEquipe,
  type RefEquipe,
} from '../shared/equipe';
import type { NaoEnviar } from '../shared/exportar';
import type { LeadsCRM } from '../shared/leads';
import type { ItemEnvioEquipe } from '../shared/servico-equipe';

export interface DependenciasEquipe {
  db: Banco;
  repo: Pick<LeadsCRM, 'optOutsDaEquipe' | 'marcarOptOutsDaEquipe' | 'desmarcarOptOutsDaEquipe' | 'registrarEnviosDaEquipe' | 'contatadosDaEquipe'>;
  /** Telefone que a extensão já conhece do contato (nome do WhatsApp). null = não conhece. */
  telefoneDe: (nome: string, chave: string) => Promise<string | null> | string | null;
  agora: () => Date;
}

export interface ContatoParaEquipe {
  nome: string;
  chave: string;
  telefone?: string | null;
}

export type ResultadoEquipe =
  | { tipo: 'livre' }
  | { tipo: 'bloqueado'; status: 'nao_enviar' | 'pulado'; motivo: string }
  | { tipo: 'indisponivel'; motivo: string };

export type ResultadoSincronia = { ok: true; novos: number; removidos: number; enviados: number; mudou: boolean } | { ok: false; motivo: string };

// ── Estado compartilhado do painel (um por janela) ───────────────────────────

interface EstadoDoPainel {
  /** Último contato da equipe por chave local (só quem foi consultado). */
  contatados: Map<string, ContatoDaEquipe>;
  /** Quando cada chave foi consultada (epoch ms): cache curto. */
  consultadoEm: Map<string, number>;
  /** Por que a equipe está indisponível agora (null = tudo certo na última tentativa). */
  indisponivel: string | null;
  versao: number;
}

const estado: EstadoDoPainel = { contatados: new Map(), consultadoEm: new Map(), indisponivel: null, versao: 0 };
const ouvintes = new Set<() => void>();

function mudou(): void {
  estado.versao += 1;
  for (const fn of [...ouvintes]) fn();
}

/** Último contato registrado pela EQUIPE (qualquer atendente) por chave local, ISO. Vazio até a primeira consulta. */
export function contatadoPelaEquipe(): ReadonlyMap<string, string> {
  return new Map([...estado.contatados].map(([k, v]) => [k, v.em] as const));
}

export const indisponibilidadeDaEquipe = (): string | null => estado.indisponivel;
export const versaoDaEquipe = (): number => estado.versao;

export function aoMudarEquipe(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => void ouvintes.delete(fn);
}

/** Só para testes: volta ao estado inicial. */
export function zerarEstadoDaEquipe(): void {
  estado.contatados.clear();
  estado.consultadoEm.clear();
  estado.indisponivel = null;
  estado.versao = 0;
}

function indisponivel(motivo: string | null): void {
  if (estado.indisponivel === motivo) return;
  estado.indisponivel = motivo;
  mudou();
}

async function refDe(d: DependenciasEquipe, c: { nome: string; chave: string; telefone?: string | null }): Promise<RefEquipe> {
  const telefone = c.telefone ?? (await d.telefoneDe(c.nome, c.chave));
  return refDoContato(c.nome, telefone);
}

/** Roda `fn` sobre os itens em grupos (as leituras locais de telefone são muitas, mas baratas). */
async function emGrupos<T, R>(itens: ReadonlyArray<T>, tamanho: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  return saida;
}

// ── "Não enviar mais": união local + CRM ─────────────────────────────────────

/**
 * Puxa a lista da equipe, sobe o que só existe aqui (migração e marcações feitas sem rede) e põe no cache local o que outros
 * marcaram. `mudou` = a lista local mudou (o painel recarrega os dados).
 */
export async function sincronizarOptOuts(d: DependenciasEquipe, opcoes: { forcar?: boolean } = {}): Promise<ResultadoSincronia> {
  let r;
  try {
    r = await d.repo.optOutsDaEquipe({ forcar: opcoes.forcar === true });
  } catch (e) {
    r = { ok: false as const, motivo: e instanceof Error ? e.message : String(e) };
  }
  if (!r.ok) {
    indisponivel(r.motivo);
    return { ok: false, motivo: r.motivo };
  }
  const locais = await listarNaoEnviar(d.db);
  const telLocais = new Map<string, string | null>();
  await emGrupos(locais, 100, async (l) => void telLocais.set(l.chave, (await d.telefoneDe(l.nome, l.chave)) ?? null));

  // Contatos conhecidos (para achar a chave local de quem foi marcado por telefone) só se o CRM tem telefone sem nome que a gente reconheça.
  const hashesLocais = new Set(locais.map((l) => hashDoNome(l.nome)));
  const precisaTelefones = r.lista.itens.some((c) => !hashesLocais.has(c.nomeHash));
  let contatos: Array<{ chave: string; nome: string; telefone: string | null }> = [];
  if (precisaTelefones) {
    const varridos = await listarContatos(d.db);
    contatos = await emGrupos(varridos, 200, async (c) => ({ chave: c.chave, nome: c.nome, telefone: (await d.telefoneDe(c.nome, c.chave)) ?? null }));
  }

  const plano = planejarOptOuts(locais, r.lista, contatos, (n) => telLocais.get(n.chave) ?? null);
  for (const n of plano.novosLocais) await marcarNaoEnviar(d.db, n, { semAvisar: true });
  for (const chave of plano.removerLocais) await desmarcarNaoEnviar(d.db, chave);
  await confirmarNoCrm(d.db, plano.confirmar);

  let enviados = 0;
  if (plano.paraEnviar.length > 0) {
    const itens = plano.paraEnviar.map((l) => ({
      ...refDoContato(l.nome, telLocais.get(l.chave)),
      nome: l.nome,
      origem: l.origem ?? origemDoMotivo(l.motivo),
      marcadoEm: new Date(l.desde).getTime(),
    }));
    let s;
    try {
      s = await d.repo.marcarOptOutsDaEquipe(itens);
    } catch (e) {
      s = { ok: false as const, motivo: e instanceof Error ? e.message : String(e) };
    }
    if (s.ok) {
      await confirmarNoCrm(d.db, plano.paraEnviar.map((l) => l.chave));
      enviados = plano.paraEnviar.length;
    } else indisponivel(s.motivo);
  }
  if (estado.indisponivel !== null) indisponivel(null);
  if (plano.novosLocais.length + plano.removerLocais.length > 0) mudou(); // a tela Hoje e a prévia recalculam
  return { ok: true, novos: plano.novosLocais.length, removidos: plano.removerLocais.length, enviados, mudou: plano.novosLocais.length + plano.removerLocais.length > 0 };
}

async function confirmarNoCrm(db: Banco, chaves: ReadonlyArray<string>): Promise<void> {
  if (chaves.length === 0) return;
  const porChave = new Map((await listarNaoEnviar(db)).map((n) => [n.chave, n]));
  const tx = db.transaction('naoEnviar', 'readwrite');
  await Promise.all([
    ...chaves.flatMap((c) => {
      const n = porChave.get(c);
      return n ? [tx.store.put({ ...n, crm: true })] : [];
    }),
    tx.done,
  ]);
}

export type ResultadoDesmarcar = { ok: true; mensagem: string } | { ok: false; mensagem: string };

/**
 * Tira do "não enviar mais" aqui E no CRM (senão a próxima sincronização o traria de volta). CRM fora do ar: se a entrada já estava
 * no CRM, nada é alterado (avisa); se nunca subiu, sai só daqui.
 */
export async function desmarcarNaEquipe(d: DependenciasEquipe, chave: string): Promise<ResultadoDesmarcar> {
  const entrada = (await listarNaoEnviar(d.db)).find((n) => n.chave === chave);
  if (!entrada) return { ok: true, mensagem: 'Já não estava na lista.' };
  const ref = refDoContato(entrada.nome, await d.telefoneDe(entrada.nome, entrada.chave));
  let r;
  try {
    r = await d.repo.desmarcarOptOutsDaEquipe([ref]);
  } catch (e) {
    r = { ok: false as const, motivo: e instanceof Error ? e.message : String(e) };
  }
  if (r.ok) {
    await desmarcarNaoEnviar(d.db, chave);
    return { ok: true, mensagem: `${entrada.nome} saiu da lista "Não enviar mais" (também no CRM).` };
  }
  if (entrada.crm !== true) {
    await desmarcarNaoEnviar(d.db, chave);
    return { ok: true, mensagem: `${entrada.nome} saiu da lista neste computador (o CRM não respondeu: ${r.motivo}).` };
  }
  return { ok: false, mensagem: `Não consegui desfazer no CRM (${r.motivo}). Nada foi alterado: sem isso o "não enviar mais" voltaria na próxima sincronização.` };
}

// ── Contato registrado: subir os envios daqui ────────────────────────────────

/** Sobe ao CRM os envios feitos aqui que ainda não subiram (na primeira vez, os últimos dias). Idempotente no servidor. */
export async function enviarContatos(d: DependenciasEquipe): Promise<{ ok: true; quantidade: number } | { ok: false; motivo: string }> {
  const estadoLocal = await lerEstadoEquipe(d.db);
  const agora = d.agora();
  const desde = estadoLocal.enviosAte ?? new Date(agora.getTime() - DIAS_MIGRACAO_ENVIOS * 86_400_000).toISOString();
  const [envios, campanhas] = await Promise.all([listarEnvios(d.db), listarCampanhas(d.db)]);
  const novos = envios.filter((e) => e.enviadoEm > desde).sort((a, b) => a.enviadoEm.localeCompare(b.enviadoEm));
  if (novos.length === 0) return { ok: true, quantidade: 0 };
  const tipoPorCampanha = new Map(campanhas.map((c) => [c.id, tipoDoEnvio(c)] as const));
  const itens: ItemEnvioEquipe[] = await emGrupos(novos, 100, async (e) => ({
    ...(await refDe(d, { nome: e.nome, chave: e.chave })),
    tipo: tipoPorCampanha.get(e.campanhaId) ?? 'campanha',
    enviadoEm: new Date(e.enviadoEm).getTime(),
  }));
  let r;
  try {
    r = await d.repo.registrarEnviosDaEquipe(itens);
  } catch (e) {
    r = { ok: false as const, motivo: e instanceof Error ? e.message : String(e) };
  }
  if (!r.ok) {
    indisponivel(r.motivo);
    return { ok: false, motivo: r.motivo };
  }
  await salvarEstadoEquipe(d.db, { enviosAte: novos[novos.length - 1].enviadoEm, sincronizadoEm: agora.toISOString() });
  return { ok: true, quantidade: itens.length };
}

/** Ao abrir o painel: o "não enviar mais" e os envios daqui, nos dois sentidos. */
export async function sincronizarTudo(d: DependenciasEquipe, opcoes: { forcar?: boolean } = {}): Promise<ResultadoSincronia> {
  const opt = await sincronizarOptOuts(d, opcoes);
  if (!opt.ok) return opt;
  const env = await enviarContatos(d);
  return env.ok ? opt : { ok: false, motivo: env.motivo };
}

// ── Contato registrado: consultar quem foi contatado pela equipe ─────────────

/**
 * "Contatado há quanto tempo, por QUALQUER atendente?" para os contatos dados (em lotes), guardado em memória para a prévia, o
 * follow-up e a reativação. Cache de 5 min por contato; `forcar` ignora. CRM fora do ar → não muda nada e marca indisponível.
 */
export async function atualizarContatados(d: DependenciasEquipe, contatos: ReadonlyArray<ContatoParaEquipe>, opcoes: { forcar?: boolean } = {}): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const agora = d.agora().getTime();
  const alvo = contatos.filter((c) => opcoes.forcar === true || agora - (estado.consultadoEm.get(c.chave) ?? 0) >= VALIDADE_EQUIPE_MS);
  if (alvo.length === 0) return { ok: true };
  const refs = await emGrupos(alvo, 200, (c) => refDe(d, c));
  for (let i = 0; i < alvo.length; i += LOTE_CONSULTA * 4) {
    const fatiaAlvo = alvo.slice(i, i + LOTE_CONSULTA * 4);
    let r;
    try {
      r = await d.repo.contatadosDaEquipe(refs.slice(i, i + LOTE_CONSULTA * 4), DIAS_CONSULTA_PLANEJAMENTO);
    } catch (e) {
      r = { ok: false as const, motivo: e instanceof Error ? e.message : String(e) };
    }
    if (!r.ok) {
      indisponivel(r.motivo);
      return { ok: false, motivo: r.motivo };
    }
    fatiaAlvo.forEach((c, k) => {
      const m = maisRecenteDaEquipe(r.porContato[k] ?? []);
      if (m) estado.contatados.set(c.chave, m);
      else estado.contatados.delete(c.chave);
      estado.consultadoEm.set(c.chave, agora);
    });
  }
  indisponivel(null);
  mudou();
  return { ok: true };
}

/** O que prepara a prévia, o follow-up e a reativação: o "não enviar mais" fresco e o contato da equipe para estes contatos. Nunca lança. */
export async function preparar(d: DependenciasEquipe, contatos: ReadonlyArray<ContatoParaEquipe>, opcoes: { forcar?: boolean } = {}): Promise<{ mudouLista: boolean }> {
  try {
    const s = await sincronizarOptOuts(d, opcoes);
    if (s.ok) await atualizarContatados(d, contatos, opcoes);
    return { mudouLista: s.ok && s.mudou };
  } catch (e) {
    indisponivel(e instanceof Error ? e.message : String(e));
    return { mudouLista: false };
  }
}

// ── Antes de cada envio (o Executor chama) ───────────────────────────────────

/**
 * UMA consulta ao CRM para o contato que está para receber a mensagem: está em "não enviar mais" (de qualquer atendente)? foi
 * contatado há menos de `limiteDias` por qualquer atendente? Não deu para saber → `indisponivel` (falha fechada no automático).
 */
export async function conferirEquipeAntesDeEnviar(d: DependenciasEquipe, item: Pick<ItemCampanha, 'nome' | 'chave'>, limiteDias: number): Promise<ResultadoEquipe> {
  try {
    const ref = await refDe(d, item);
    // Os envios feitos aqui sobem antes (a equipe vê o contato anterior); falha ao subir não impede a conferência.
    await enviarContatos(d).catch(() => undefined);
    const r = await d.repo.contatadosDaEquipe([ref], Math.max(1, Math.floor(limiteDias)) + 1, { incluirOptOut: true });
    if (!r.ok) {
      indisponivel(r.motivo);
      return { tipo: 'indisponivel', motivo: r.motivo };
    }
    indisponivel(null);
    const opt = r.optOuts[0];
    if (opt) {
      await marcarNaoEnviar(d.db, { chave: item.chave, nome: item.nome, desde: d.agora().toISOString(), motivo: 'marcado no CRM por outro atendente ou computador', origem: opt.origem, crm: true }, { semAvisar: true });
      return { tipo: 'bloqueado', status: 'nao_enviar', motivo: 'marcado "Não enviar mais" (por outro atendente ou computador)' };
    }
    const m = maisRecenteDaEquipe(r.porContato[0] ?? []);
    if (m) {
      estado.contatados.set(item.chave, m);
      const motivo = motivoContatoDaEquipe(m, d.agora(), limiteDias);
      if (motivo) return { tipo: 'bloqueado', status: 'pulado', motivo };
    }
    return { tipo: 'livre' };
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    indisponivel(motivo);
    return { tipo: 'indisponivel', motivo };
  }
}

/** Depois de um envio: avisa a equipe na hora (melhor esforço; o que falhar sobe na próxima sincronização, pois o envio já está no registro local). */
export async function aoEnviar(d: DependenciasEquipe, item: Pick<ItemCampanha, 'nome' | 'chave'>, campanha: Pick<Campanha, 'tipo'>, enviadoEm: string): Promise<void> {
  try {
    const ref = await refDe(d, item);
    const r = await d.repo.registrarEnviosDaEquipe([{ ...ref, tipo: tipoDoEnvio(campanha), enviadoEm: new Date(enviadoEm).getTime() }]);
    if (r.ok) estado.contatados.set(item.chave, { em: enviadoEm, tipo: tipoDoEnvio(campanha), meu: true });
  } catch {
    /* sobe na próxima sincronização */
  }
}

/** Dias do calendário desde o contato da equipe (para telas). */
export function diasDesdeContatoDaEquipe(em: string, agora: Date): number {
  return diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(em)));
}

export type { NaoEnviar };
