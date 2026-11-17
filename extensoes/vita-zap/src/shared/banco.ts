// Armazenamento local (IndexedDB da extensão). Nada sai do computador na fase 1.
// Backup/migração: exportarTudo / importarTudo (JSON).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Campanha } from './campanha';
import type { ContatoVarrido } from './contatos';
import type { Backup, Envio, NaoEnviar } from './exportar';
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
  followupConfig: { key: string; value: { id: 'followup'; valor: ConfigFollowup } | { id: 'reativacao'; valor: ConfigReativacao } | { id: 'pedidos'; valor: EstadoPedidos } };
  /** Reativação por inatividade (v0.7.56): um registro por contato (chave = nome normalizado). */
  reativacoes: { key: string; value: Reativacao };
}

export const NOME_BANCO = 'vita-zap';
const VERSAO_BANCO = 3;

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

export async function marcarNaoEnviar(db: Banco, item: NaoEnviar): Promise<void> {
  const atual = await db.get('naoEnviar', item.chave);
  if (!atual) await db.put('naoEnviar', item);
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

export async function lerConfigReativacao(db: Banco): Promise<ConfigReativacao> {
  const r = await db.get('followupConfig', 'reativacao');
  return normalizarConfigReativacao(r?.id === 'reativacao' ? r.valor : undefined);
}

export async function salvarConfigReativacao(db: Banco, cfg: ConfigReativacao): Promise<ConfigReativacao> {
  const valor = normalizarConfigReativacao(cfg);
  await db.put('followupConfig', { id: 'reativacao', valor });
  return valor;
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

export async function exportarTudo(db: Banco, agora: Date = new Date()): Promise<Backup> {
  const r = await db.get('config', 'politica');
  return {
    formato: 'vita-zap-backup',
    versao: 1,
    exportadoEm: agora.toISOString(),
    contatos: await db.getAll('contatos'),
    campanhas: await db.getAll('campanhas'),
    envios: await db.getAll('envios'),
    naoEnviar: await db.getAll('naoEnviar'),
    config: r?.valor ?? null,
  };
}

/**
 * Importa um backup já validado (lerBackup).
 * - 'mesclar': acrescenta/atualiza; envios e "não enviar mais" existentes nunca são apagados.
 * - 'substituir': apaga tudo e grava o backup.
 */
export async function importarTudo(db: Banco, b: Backup, modo: 'mesclar' | 'substituir'): Promise<void> {
  const tx = db.transaction(['contatos', 'campanhas', 'envios', 'naoEnviar', 'config'], 'readwrite');
  const ops: Promise<unknown>[] = [];
  if (modo === 'substituir') {
    for (const s of ['contatos', 'campanhas', 'envios', 'naoEnviar', 'config'] as const) ops.push(tx.objectStore(s).clear());
  }
  for (const c of b.contatos) ops.push(tx.objectStore('contatos').put(c));
  for (const c of b.campanhas) ops.push(tx.objectStore('campanhas').put(c));
  for (const e of b.envios) ops.push(tx.objectStore('envios').put(e));
  for (const n of b.naoEnviar) ops.push(tx.objectStore('naoEnviar').put(n));
  if (b.config) ops.push(tx.objectStore('config').put({ id: 'politica', valor: normalizarConfig(b.config) }));
  await Promise.all([...ops, tx.done]);
}
