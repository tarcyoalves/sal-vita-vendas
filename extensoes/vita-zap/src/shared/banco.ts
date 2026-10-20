// Armazenamento local (IndexedDB da extensão). Nada sai do computador na fase 1.
// Backup/migração: exportarTudo / importarTudo (JSON).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Campanha } from './campanha';
import type { EventoDiagnostico } from './diagnostico';
import type { ContatoVarrido } from './contatos';
import type { Backup, Envio, NaoEnviar } from './exportar';
import { normalizarConfig, type ConfigPolitica } from './politica';

interface EsquemaVitaZap extends DBSchema {
  contatos: { key: string; value: ContatoVarrido };
  campanhas: { key: string; value: Campanha };
  envios: { key: string; value: Envio; indexes: { porChave: string; porCampanha: string } };
  naoEnviar: { key: string; value: NaoEnviar };
  config: { key: string; value: { id: 'politica'; valor: ConfigPolitica } };
  /** Item colado e esperando o Enter do usuário (sobrevive a fechar/recarregar o painel). */
  emAndamento: { key: string; value: EmAndamento };
  /** Registro circular de diagnóstico (fora do backup). */
  diagnostico: { key: string; value: EventoDiagnostico };
}

/** O item em andamento de uma campanha (no máximo um por campanha). */
export interface EmAndamento {
  campanhaId: string;
  chave: string;
  nome: string;
  /** Texto exato colado na caixa. */
  texto: string;
  /** "Foto": data-id das mensagens da conversa ANTES de colar. */
  foto: string[];
  jid: string | null;
  iniciadoEm: string;
}

export const NOME_BANCO = 'vita-zap';
const VERSAO_BANCO = 3;

export type Banco = IDBPDatabase<EsquemaVitaZap>;

export function abrirBanco(nome: string = NOME_BANCO): Promise<Banco> {
  return openDB<EsquemaVitaZap>(nome, VERSAO_BANCO, {
    upgrade(db, versaoAntiga) {
      if (versaoAntiga < 1) {
        db.createObjectStore('contatos', { keyPath: 'chave' });
        db.createObjectStore('campanhas', { keyPath: 'id' });
        const envios = db.createObjectStore('envios', { keyPath: 'id' });
        envios.createIndex('porChave', 'chave');
        envios.createIndex('porCampanha', 'campanhaId');
        db.createObjectStore('naoEnviar', { keyPath: 'chave' });
        db.createObjectStore('config', { keyPath: 'id' });
      }
      if (versaoAntiga < 2) db.createObjectStore('emAndamento', { keyPath: 'campanhaId' });
      if (versaoAntiga < 3) db.createObjectStore('diagnostico', { keyPath: 'id' });
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

// ── Item em andamento (0.2) ──────────────────────────────────────────────────

export async function gravarEmAndamento(db: Banco, item: EmAndamento): Promise<void> {
  await db.put('emAndamento', item);
}

export function lerEmAndamento(db: Banco, campanhaId: string): Promise<EmAndamento | undefined> {
  return db.get('emAndamento', campanhaId);
}

export async function limparEmAndamento(db: Banco, campanhaId: string): Promise<void> {
  await db.delete('emAndamento', campanhaId);
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

// ── Diagnóstico (registro circular; fora do backup) ─────────────────────────

export function listarDiagnostico(db: Banco): Promise<EventoDiagnostico[]> {
  return db.getAll('diagnostico');
}

/** Grava o evento e apaga os mais antigos além de `maximo`. */
export async function salvarEventoDiagnostico(db: Banco, ev: EventoDiagnostico, maximo: number): Promise<void> {
  const tx = db.transaction('diagnostico', 'readwrite');
  await tx.store.put(ev);
  const excesso = (await tx.store.count()) - maximo;
  if (excesso > 0) {
    let cursor = await tx.store.openCursor();
    for (let i = 0; cursor && i < excesso; i += 1) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function apagarDiagnostico(db: Banco): Promise<void> {
  await db.clear('diagnostico');
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
  const tx = db.transaction(['contatos', 'campanhas', 'envios', 'naoEnviar', 'config', 'emAndamento'], 'readwrite');
  const ops: Promise<unknown>[] = [];
  if (modo === 'substituir') {
    for (const s of ['contatos', 'campanhas', 'envios', 'naoEnviar', 'config', 'emAndamento'] as const) ops.push(tx.objectStore(s).clear());
  }
  for (const c of b.contatos) ops.push(tx.objectStore('contatos').put(c));
  for (const c of b.campanhas) ops.push(tx.objectStore('campanhas').put(c));
  for (const e of b.envios) ops.push(tx.objectStore('envios').put(e));
  for (const n of b.naoEnviar) ops.push(tx.objectStore('naoEnviar').put(n));
  if (b.config) ops.push(tx.objectStore('config').put({ id: 'politica', valor: normalizarConfig(b.config) }));
  await Promise.all([...ops, tx.done]);
}
