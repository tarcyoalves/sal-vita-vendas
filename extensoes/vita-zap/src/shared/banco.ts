// Armazenamento local (IndexedDB da extensão). Nada sai do computador na fase 1.
// Backup/migração: exportarTudo / importarTudo (JSON).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { acharEnvioDaResposta, comResposta, idsParaPodarEnvios, type EnvioDoTexto } from './resultado-texto';
import { type AcaoIa, type Julgamento, idsAcoesParaPodar, idsParaPodar } from './automaticos';
import type { Campanha } from './campanha';
import type { ContatoVarrido } from './contatos';
import { VERSAO_BACKUP, type Backup, type BackupArquivo, type Envio, type NaoEnviar } from './exportar';
import { normalizarConfigFollowup, type ConfigFollowup, type Followup } from './followup';
import { normalizarEstadoPedidos, type EstadoPedidos } from './pedido-ia';
import { normalizarConfig, type ConfigPolitica } from './politica';
import { normalizarConfigReativacao, type ConfigReativacao, type Reativacao } from './reativacao';

interface EsquemaVitaZap extends DBSchema {
  contatos: { key: string; value: ContatoVarrido };
  campanhas: { key: string; value: Campanha };
  envios: { key: string; value: Envio; indexes: { porChave: string; porCampanha: string } };
  naoEnviar: { key: string; value: NaoEnviar };
  config: { key: string; value: { id: 'politica'; valor: ConfigPolitica } };
  /** Follow-up (v0.7.54): um registro por contato/campanha de origem (`${campanhaId}:${chave}`). */
  followups: { key: string; value: Followup };
  followupConfig: { key: string; value: { id: 'followup'; valor: ConfigFollowup } | { id: 'reativacao'; valor: ConfigReativacao } | { id: 'pedidos'; valor: EstadoPedidos } | { id: 'historico'; valor: { avisadoEm: string } } | { id: 'equipe'; valor: EstadoEquipe } };
  /** Reativação por inatividade (v0.7.56): um registro por contato (chave = nome normalizado). */
  reativacoes: { key: string; value: Reativacao };
  /** Modo Observação (v0.7.59): o que a IA faria + o julgamento do dono. Loja nova, aditiva. */
  julgamentos: { key: string; value: Julgamento };
  /** "O que a IA fez" (v0.7.59): cada ação automática, com como desfazer. Loja nova, aditiva. */
  acoesIa: { key: string; value: AcaoIa };
  /** Resultado por texto (v0.7.60): um registro por envio de texto do dono (hash do modelo + se respondeu). Só local. Loja nova, aditiva. */
  resultadosTexto: { key: string; value: EnvioDoTexto };
}

/** Estado da sincronização com a equipe (v0.7.60). Fica em followupConfig, id 'equipe'. */
export interface EstadoEquipe {
  /** Envios locais até este instante (ISO) já subiram ao CRM. null = nunca: a primeira sincronização manda os dos últimos dias. */
  enviosAte: string | null;
  /** Última sincronização bem-sucedida (ISO). */
  sincronizadoEm: string | null;
}

export const NOME_BANCO = 'vita-zap';
const VERSAO_BANCO = 5;

export type Banco = IDBPDatabase<EsquemaVitaZap>;

export function abrirBanco(nome: string = NOME_BANCO): Promise<Banco> {
  return openDB<EsquemaVitaZap>(nome, VERSAO_BANCO, {
    upgrade(db, versaoAnterior) {
      if (versaoAnterior < 1) {
        db.createObjectStore('contatos', { keyPath: 'chave' });
        db.createObjectStore('campanhas', { keyPath: 'id' });
        const envios = db.createObjectStore('envios', { keyPath: 'id' });
        envios.createIndex('porChave', 'chave');
        envios.createIndex('porCampanha', 'campanhaId');
        db.createObjectStore('naoEnviar', { keyPath: 'chave' });
        db.createObjectStore('config', { keyPath: 'id' });
      }
      // v2 (0.7.54): follow-up. Só ACRESCENTA lojas; nada do que já existe muda.
      if (versaoAnterior < 2) {
        db.createObjectStore('followups', { keyPath: 'id' });
        db.createObjectStore('followupConfig', { keyPath: 'id' });
      }
      // v3 (0.7.56): reativação. Só ACRESCENTA uma loja (a configuração dela fica em followupConfig, id 'reativacao').
      if (versaoAnterior < 3) {
        db.createObjectStore('reativacoes', { keyPath: 'chave' });
      }
      // v4 (0.7.59): modo Observação e "O que a IA fez". Só ACRESCENTA duas lojas; nada do que já existe muda.
      if (versaoAnterior < 4) {
        db.createObjectStore('julgamentos', { keyPath: 'id' });
        db.createObjectStore('acoesIa', { keyPath: 'id' });
      }
      // v5 (0.7.60): resultado por texto. Só ACRESCENTA uma loja; nada do que já existe muda (o estado da sincronização com a equipe fica em followupConfig, id 'equipe').
      if (versaoAnterior < 5) {
        db.createObjectStore('resultadosTexto', { keyPath: 'id' });
      }
    },
  });
}

// ── Contatos ─────────────────────────────────────────────────────────────────

/** Grava (ou atualiza) os contatos da varredura. */
export async function salvarContatos(db: Banco, contatos: ContatoVarrido[]): Promise<void> {
  const tx = db.transaction('contatos', 'readwrite');
  await Promise.all([...contatos.map((c) => tx.store.put(c)), tx.done]);
}

export function listarContatos(db: Banco): Promise<ContatoVarrido[]> {
  return db.getAll('contatos');
}

export function limparContatos(db: Banco): Promise<void> {
  return db.clear('contatos');
}

// ── Campanhas ────────────────────────────────────────────────────────────────

export async function salvarCampanha(db: Banco, c: Campanha): Promise<void> {
  await db.put('campanhas', c);
}

export function lerCampanha(db: Banco, id: string): Promise<Campanha | undefined> {
  return db.get('campanhas', id);
}

export async function listarCampanhas(db: Banco): Promise<Campanha[]> {
  const todas = await db.getAll('campanhas');
  return todas.sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

export async function apagarCampanha(db: Banco, id: string): Promise<void> {
  await db.delete('campanhas', id);
}

// ── Envios ───────────────────────────────────────────────────────────────────

/**
 * Registra um envio. O id `${campanhaId}:${chave}` torna o registro idempotente: o mesmo
 * contato nunca conta duas vezes na mesma campanha. Devolve false se já existia.
 */
export async function registrarEnvio(db: Banco, envio: Omit<Envio, 'id'>): Promise<boolean> {
  const id = `${envio.campanhaId}:${envio.chave}`;
  const tx = db.transaction('envios', 'readwrite');
  const existe = await tx.store.get(id);
  if (existe) {
    await tx.done;
    return false;
  }
  await tx.store.put({ ...envio, id });
  await tx.done;
  return true;
}

export function listarEnvios(db: Banco): Promise<Envio[]> {
  return db.getAll('envios');
}

// ── Não enviar mais ──────────────────────────────────────────────────────────

// Quem quer saber quando alguém marca "não enviar mais" aqui (a sincronização com a equipe sobe a marcação logo, v0.7.60).
const ouvintesNaoEnviar = new Set<() => void>();
export function aoMarcarNaoEnviar(fn: () => void): () => void {
  ouvintesNaoEnviar.add(fn);
  return () => void ouvintesNaoEnviar.delete(fn);
}

/** `semAvisar`: a própria sincronização com a equipe está gravando (não precisa subir de novo). */
export async function marcarNaoEnviar(db: Banco, item: NaoEnviar, opcoes: { semAvisar?: boolean } = {}): Promise<void> {
  const atual = await db.get('naoEnviar', item.chave);
  if (atual) return;
  await db.put('naoEnviar', item);
  if (opcoes.semAvisar !== true) for (const fn of [...ouvintesNaoEnviar]) fn();
}

export async function desmarcarNaoEnviar(db: Banco, chave: string): Promise<void> {
  await db.delete('naoEnviar', chave);
}

export function listarNaoEnviar(db: Banco): Promise<NaoEnviar[]> {
  return db.getAll('naoEnviar');
}

// ── Configuração ─────────────────────────────────────────────────────────────

export async function lerConfig(db: Banco): Promise<ConfigPolitica> {
  const r = await db.get('config', 'politica');
  return normalizarConfig(r?.valor);
}

export async function salvarConfig(db: Banco, cfg: ConfigPolitica): Promise<ConfigPolitica> {
  const valor = normalizarConfig(cfg);
  await db.put('config', { id: 'politica', valor });
  return valor;
}

// ── Follow-up ────────────────────────────────────────────────────────────────

export async function salvarFollowups(db: Banco, itens: ReadonlyArray<Followup>): Promise<void> {
  if (itens.length === 0) return;
  const tx = db.transaction('followups', 'readwrite');
  await Promise.all([...itens.map((f) => tx.store.put(f)), tx.done]);
}

export async function apagarFollowup(db: Banco, id: string): Promise<void> {
  await db.delete('followups', id);
}

export function listarFollowups(db: Banco): Promise<Followup[]> {
  return db.getAll('followups');
}

export async function lerConfigFollowup(db: Banco): Promise<ConfigFollowup> {
  const r = await db.get('followupConfig', 'followup');
  return normalizarConfigFollowup(r?.id === 'followup' ? r.valor : undefined);
}

export async function salvarConfigFollowup(db: Banco, cfg: ConfigFollowup): Promise<ConfigFollowup> {
  const valor = normalizarConfigFollowup(cfg);
  await db.put('followupConfig', { id: 'followup', valor });
  return valor;
}

// ── Reativação por inatividade ───────────────────────────────────────────────

export async function salvarReativacoes(db: Banco, itens: ReadonlyArray<Reativacao>): Promise<void> {
  if (itens.length === 0) return;
  const tx = db.transaction('reativacoes', 'readwrite');
  await Promise.all([...itens.map((r) => tx.store.put(r)), tx.done]);
}

export function listarReativacoes(db: Banco): Promise<Reativacao[]> {
  return db.getAll('reativacoes');
}

export function lerReativacao(db: Banco, chave: string): Promise<Reativacao | undefined> {
  return db.get('reativacoes', chave);
}

export async function apagarReativacao(db: Banco, chave: string): Promise<void> {
  await db.delete('reativacoes', chave);
}

export async function lerConfigReativacao(db: Banco): Promise<ConfigReativacao> {
  const r = await db.get('followupConfig', 'reativacao');
  return normalizarConfigReativacao(r?.id === 'reativacao' ? r.valor : undefined);
}

export async function salvarConfigReativacao(db: Banco, cfg: ConfigReativacao): Promise<ConfigReativacao> {
  const valor = normalizarConfigReativacao(cfg);
  await db.put('followupConfig', { id: 'reativacao', valor });
  return valor;
}

// ── Aviso "histórico sumindo" (v0.7.59): em que dia o service worker já avisou (no máximo um aviso por dia). Fica em followupConfig. ──

export async function lerAvisoHistorico(db: Banco): Promise<string | null> {
  const r = await db.get('followupConfig', 'historico');
  return r?.id === 'historico' && typeof r.valor.avisadoEm === 'string' ? r.valor.avisadoEm : null;
}

export async function salvarAvisoHistorico(db: Banco, dia: string): Promise<void> {
  await db.put('followupConfig', { id: 'historico', valor: { avisadoEm: dia } });
}

// ── Modo Observação: o que a IA faria (v0.7.59) ──────────────────────────────

/** Guarda a decisão como "pendente de julgamento". Idempotente: a mesma decisão (mesmo id) nunca vira dois itens. Poda o excesso. */
export async function registrarDecisao(db: Banco, j: Julgamento): Promise<boolean> {
  const tx = db.transaction('julgamentos', 'readwrite');
  const existe = await tx.store.get(j.id);
  if (!existe) await tx.store.put(j);
  await tx.done;
  if (existe) return false;
  await podarJulgamentos(db);
  return true;
}

export function listarJulgamentos(db: Banco): Promise<Julgamento[]> {
  return db.getAll('julgamentos');
}

export async function salvarJulgamento(db: Banco, j: Julgamento): Promise<void> {
  await db.put('julgamentos', j);
}

export async function podarJulgamentos(db: Banco): Promise<void> {
  const apagar = idsParaPodar(await db.getAll('julgamentos'));
  if (apagar.length === 0) return;
  const tx = db.transaction('julgamentos', 'readwrite');
  await Promise.all([...apagar.map((id) => tx.store.delete(id)), tx.done]);
}

// ── "O que a IA fez" (v0.7.59) ────────────────────────────────────────────────

/** Registra a ação (idempotente por id: o mesmo envio notificado várias vezes vira um registro só). */
export async function registrarAcaoIa(db: Banco, a: AcaoIa): Promise<boolean> {
  const tx = db.transaction('acoesIa', 'readwrite');
  const existe = await tx.store.get(a.id);
  if (!existe) await tx.store.put(a);
  await tx.done;
  if (existe) return false;
  const apagar = idsAcoesParaPodar(await db.getAll('acoesIa'));
  if (apagar.length > 0) {
    const t2 = db.transaction('acoesIa', 'readwrite');
    await Promise.all([...apagar.map((id) => t2.store.delete(id)), t2.done]);
  }
  return true;
}

export async function listarAcoesIa(db: Banco): Promise<AcaoIa[]> {
  return (await db.getAll('acoesIa')).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export async function salvarAcaoIa(db: Banco, a: AcaoIa): Promise<void> {
  await db.put('acoesIa', a);
}

// ── Pedir à IA (v0.7.57) ─────────────────────────────────────────────────────
// Pedidos salvos + o último resultado para revisão. Fica na loja `followupConfig` (id 'pedidos'): sem versão nova do banco.

export async function lerPedidos(db: Banco): Promise<EstadoPedidos> {
  const r = await db.get('followupConfig', 'pedidos');
  return normalizarEstadoPedidos(r?.id === 'pedidos' ? r.valor : undefined);
}

export async function salvarPedidos(db: Banco, estado: EstadoPedidos): Promise<EstadoPedidos> {
  const valor = normalizarEstadoPedidos(estado);
  await db.put('followupConfig', { id: 'pedidos', valor });
  return valor;
}

// ── Backup ───────────────────────────────────────────────────────────────────

export async function exportarTudo(db: Banco, agora: Date = new Date(), versaoExtensao = ''): Promise<BackupArquivo> {
  // Lista branca: só estas lojas/ids saem. Nunca o estado da sincronização com a equipe, o aviso do histórico nem nada do chrome.storage (token do CRM fica de fora).
  const r = await db.get('config', 'politica');
  return {
    formato: 'vita-zap-backup',
    versao: VERSAO_BACKUP,
    geradoEm: agora.toISOString(),
    versaoExtensao,
    lojas: {
      contatos: await db.getAll('contatos'),
      campanhas: await db.getAll('campanhas'),
      envios: await db.getAll('envios'),
      naoEnviar: await db.getAll('naoEnviar'),
      config: r?.valor ?? null,
      followups: await db.getAll('followups'),
      followupConfig: await lerConfigFollowup(db),
      reativacaoConfig: await lerConfigReativacao(db),
      pedidos: await lerPedidos(db),
      reativacoes: await db.getAll('reativacoes'),
      julgamentos: await db.getAll('julgamentos'),
      acoesIa: await db.getAll('acoesIa'),
      resultadosTexto: await db.getAll('resultadosTexto'),
    },
  };
}

/** Dois registros "não enviar mais" do mesmo contato: vale o mais recente, e os campos do mais antigo que o novo não tem são mantidos (ex.: marcadores de sincronização). */
export function mesclarNaoEnviar(existente: NaoEnviar, vindo: NaoEnviar): NaoEnviar {
  const vindoMaisNovo = vindo.desde > existente.desde;
  return vindoMaisNovo ? { ...existente, ...vindo } : { ...vindo, ...existente };
}

/**
 * Importa um backup já validado (lerBackup), do formato 1 ou 2.
 * - 'mesclar': acrescenta; o que já existe (campanhas, envios, follow-ups, placar...) nunca é sobrescrito por um backup mais velho.
 * - 'substituir': apaga e grava o backup. EXCEÇÃO: "não enviar mais" nunca é apagado (sempre mescla): um bloqueio mais novo não pode sumir por restaurar um arquivo velho.
 * Lojas que o backup não traz (formato 1) ficam como estão.
 */
export async function importarTudo(db: Banco, b: Backup, modo: 'mesclar' | 'substituir'): Promise<void> {
  const lojas = ['contatos', 'campanhas', 'envios', 'naoEnviar', 'config', 'followups', 'followupConfig', 'reativacoes', 'julgamentos', 'acoesIa', 'resultadosTexto'] as const;
  const tx = db.transaction(lojas, 'readwrite');
  const substituir = modo === 'substituir';
  // Lê o que existe ANTES de apagar/gravar (e dentro da transação: nada se intromete no meio).
  const [contatos, campanhas, envios, naoEnviar, followups, reativacoes, julgamentos, acoes, textos] = await Promise.all([
    tx.objectStore('contatos').getAll(),
    tx.objectStore('campanhas').getAll(),
    tx.objectStore('envios').getAll(),
    tx.objectStore('naoEnviar').getAll(),
    tx.objectStore('followups').getAll(),
    tx.objectStore('reativacoes').getAll(),
    tx.objectStore('julgamentos').getAll(),
    tx.objectStore('acoesIa').getAll(),
    tx.objectStore('resultadosTexto').getAll(),
  ]);
  const ops: Promise<unknown>[] = [];
  if (substituir) {
    const limpar: Array<(typeof lojas)[number]> = ['contatos', 'campanhas', 'envios', 'config'];
    if (b.followups) limpar.push('followups');
    if (b.reativacoes) limpar.push('reativacoes');
    if (b.julgamentos) limpar.push('julgamentos');
    if (b.acoesIa) limpar.push('acoesIa');
    if (b.resultadosTexto) limpar.push('resultadosTexto');
    for (const s of limpar) ops.push(tx.objectStore(s).clear());
  }
  const idsDe = <T,>(xs: T[], chave: (x: T) => string) => new Map(xs.map((x) => [chave(x), x]));
  /** Grava o que o backup traz; no mesclar, o que já existe vence. */
  const gravar = <T,>(loja: 'followups' | 'reativacoes' | 'julgamentos' | 'acoesIa' | 'resultadosTexto' | 'campanhas' | 'envios', vindos: T[] | undefined, existentes: T[], chave: (x: T) => string) => {
    if (!vindos) return;
    const ja = idsDe(existentes, chave);
    const st = tx.objectStore(loja) as unknown as { put(v: T): Promise<unknown> };
    for (const v of vindos) if (substituir || !ja.has(chave(v))) ops.push(st.put(v));
  };

  const jaContato = idsDe(contatos, (c) => c.chave);
  for (const c of b.contatos) {
    const e = jaContato.get(c.chave);
    if (substituir || !e || c.varridoEm > e.varridoEm) ops.push(tx.objectStore('contatos').put(c));
  }
  gravar('campanhas', b.campanhas, campanhas, (c) => c.id);
  gravar('envios', b.envios, envios, (e) => e.id);
  // Opt-out: SEMPRE mescla, nunca apaga, nunca troca por um registro mais velho.
  const jaBloqueio = idsDe(naoEnviar, (n) => n.chave);
  for (const n of b.naoEnviar) {
    const e = jaBloqueio.get(n.chave);
    ops.push(tx.objectStore('naoEnviar').put(e ? mesclarNaoEnviar(e, n) : n));
  }
  if (b.config) ops.push(tx.objectStore('config').put({ id: 'politica', valor: normalizarConfig(b.config) }));
  gravar('followups', b.followups, followups, (f) => f.id);
  gravar('reativacoes', b.reativacoes, reativacoes, (r) => r.chave);
  gravar('julgamentos', b.julgamentos, julgamentos, (j) => j.id);
  gravar('acoesIa', b.acoesIa, acoes, (a) => a.id);
  gravar('resultadosTexto', b.resultadosTexto, textos, (t) => t.id);
  const cfg = tx.objectStore('followupConfig');
  if (b.configFollowup) ops.push(cfg.put({ id: 'followup', valor: normalizarConfigFollowup(b.configFollowup) }));
  if (b.configReativacao) ops.push(cfg.put({ id: 'reativacao', valor: normalizarConfigReativacao(b.configReativacao) }));
  if (b.pedidos) ops.push(cfg.put({ id: 'pedidos', valor: normalizarEstadoPedidos(b.pedidos) }));
  await Promise.all([...ops, tx.done]);
}

// ── Equipe: estado da sincronização (v0.7.60) ────────────────────────────────

export async function lerEstadoEquipe(db: Banco): Promise<EstadoEquipe> {
  const r = await db.get('followupConfig', 'equipe');
  const v = r?.id === 'equipe' ? r.valor : undefined;
  return { enviosAte: typeof v?.enviosAte === 'string' ? v.enviosAte : null, sincronizadoEm: typeof v?.sincronizadoEm === 'string' ? v.sincronizadoEm : null };
}

export async function salvarEstadoEquipe(db: Banco, estado: EstadoEquipe): Promise<void> {
  await db.put('followupConfig', { id: 'equipe', valor: estado });
}

// ── Resultado por texto (v0.7.60) ────────────────────────────────────────────

/** Registra o envio de um texto (idempotente por id: o mesmo envio nunca conta duas vezes). Poda os muito velhos. */
export async function registrarEnvioDoTexto(db: Banco, e: EnvioDoTexto, agora: Date = new Date()): Promise<boolean> {
  const tx = db.transaction('resultadosTexto', 'readwrite');
  const existe = await tx.store.get(e.id);
  if (!existe) await tx.store.put(e);
  await tx.done;
  if (existe) return false;
  const velhos = idsParaPodarEnvios(await db.getAll('resultadosTexto'), agora);
  if (velhos.length > 0) {
    const t2 = db.transaction('resultadosTexto', 'readwrite');
    await Promise.all([...velhos.map((id) => t2.store.delete(id)), t2.done]);
  }
  return true;
}

export function listarResultadosTexto(db: Banco): Promise<EnvioDoTexto[]> {
  return db.getAll('resultadosTexto');
}

/** A leitura achou resposta do cliente: marca o envio correspondente (uma vez, dentro de 7 dias). Devolve true se marcou. */
export async function registrarRespostaDoTexto(db: Banco, alvo: { id?: string; chave: string; referencia: string }, agora: Date): Promise<boolean> {
  const envio = acharEnvioDaResposta(await db.getAll('resultadosTexto'), alvo);
  if (!envio) return false;
  const novo = comResposta(envio, agora);
  if (!novo) return false;
  await db.put('resultadosTexto', novo);
  return true;
}
