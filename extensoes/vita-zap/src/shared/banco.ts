// Armazenamento local (IndexedDB da extensão). Nada sai do computador na fase 1.
// Backup/migração: exportarTudo / importarTudo (JSON).

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Campanha } from './campanha';
import type { EventoDiagnostico } from './diagnostico';
import type { ContatoVarrido } from './contatos';
import type { Backup, Envio, NaoEnviar } from './exportar';
import { ESTADO_AUTOMATICO_PADRAO, type EstadoAutomatico } from './automatico';
import { type Ajustes, ajustesDeLegado, configManual, normalizarAjustes, validarAjustes, type ErroAjuste, limitarAjustes } from './ajustes';
import { normalizarConfig, type ConfigPolitica } from './politica';

interface EsquemaVitaZap extends DBSchema {
  contatos: { key: string; value: ContatoVarrido };
  campanhas: { key: string; value: Campanha };
  envios: { key: string; value: Envio; indexes: { porChave: string; porCampanha: string } };
  naoEnviar: { key: string; value: NaoEnviar };
  config: { key: string; value: { id: 'politica'; valor: ConfigPolitica } | { id: 'meuNomeWhatsApp'; valor: string } | { id: 'ajustes'; valor: Ajustes } };
  /** Item colado e esperando o Enter do usuário (sobrevive a fechar/recarregar o painel). */
  emAndamento: { key: string; value: EmAndamento };
  /** Registro circular de diagnóstico (fora do backup). */
  diagnostico: { key: string; value: EventoDiagnostico };
  /** Estado do modo automático (0.3.0). Fora do backup: importar um backup nunca liga o automático. */
  automatico: { key: string; value: EstadoAutomatico };
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
const VERSAO_BANCO = 4;

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
      if (versaoAntiga < 4) db.createObjectStore('automatico', { keyPath: 'id' });
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

/** Registro da política da 0.3.x (teto, intervalo e a confirmação de número com mais de 30 dias). */
async function lerPoliticaLegada(db: Banco): Promise<ConfigPolitica> {
  const r = await db.get('config', 'politica');
  return normalizarConfig(r?.id === 'politica' ? r.valor : null);
}

/**
 * Ajustes (0.4.0), fonte única do ritmo, limites, horários, freio, filtros e textos. Quem nunca salvou
 * Ajustes recebe os valores da política antiga (migração sem mudar o comportamento da 0.3.x).
 */
export async function lerAjustes(db: Banco): Promise<Ajustes> {
  const r = await db.get('config', 'ajustes');
  if (r?.id === 'ajustes') return normalizarAjustes(r.valor);
  return ajustesDeLegado(await lerPoliticaLegada(db));
}

/** Salva só se tudo estiver válido; devolve os erros (campo + mensagem) sem gravar nada se não estiver. */
export async function salvarAjustes(db: Banco, a: Ajustes): Promise<{ ok: true; ajustes: Ajustes } | { ok: false; erros: ErroAjuste[] }> {
  const erros = validarAjustes(a);
  if (erros.length > 0) return { ok: false, erros };
  const valor = limitarAjustes(a);
  await db.put('config', { id: 'ajustes', valor });
  return { ok: true, ajustes: valor };
}

/**
 * Política do modo manual (teto, intervalo) a partir dos Ajustes + a confirmação de número com mais
 * de 30 dias. O executor e a política leem daqui.
 */
export async function lerConfig(db: Banco): Promise<ConfigPolitica> {
  const [legado, ajustes] = await Promise.all([lerPoliticaLegada(db), lerAjustes(db)]);
  return configManual(ajustes, legado.numeroComMaisDe30Dias);
}

/** Meu nome no WhatsApp (autor das minhas mensagens), aprendido ou digitado na aba Dados. */
export async function lerMeuNome(db: Banco): Promise<string> {
  const r = await db.get('config', 'meuNomeWhatsApp');
  return r?.id === 'meuNomeWhatsApp' ? r.valor : '';
}

export async function salvarMeuNome(db: Banco, nome: string): Promise<string> {
  const valor = nome.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (valor === '') await db.delete('config', 'meuNomeWhatsApp');
  else await db.put('config', { id: 'meuNomeWhatsApp', valor });
  return valor;
}

/**
 * Grava a política da 0.3.x. Desde a 0.4.0 teto e intervalo vêm dos Ajustes quando eles já foram salvos;
 * aqui o que sempre vale é `numeroComMaisDe30Dias`.
 */
export async function salvarConfig(db: Banco, cfg: ConfigPolitica): Promise<ConfigPolitica> {
  const valor = normalizarConfig(cfg);
  await db.put('config', { id: 'politica', valor });
  return valor;
}

/** Só a confirmação "número com mais de 30 dias" (não mexe em teto/intervalo). */
export async function salvarNumeroAntigo(db: Banco, confirmado: boolean): Promise<void> {
  const atual = await lerPoliticaLegada(db);
  await db.put('config', { id: 'politica', valor: { ...atual, numeroComMaisDe30Dias: confirmado } });
}

// ── Modo automático (0.3.0) ──────────────────────────────────────────────────

export async function lerAutomatico(db: Banco): Promise<EstadoAutomatico> {
  return (await db.get('automatico', 'estado')) ?? ESTADO_AUTOMATICO_PADRAO;
}

export async function salvarAutomatico(db: Banco, e: EstadoAutomatico): Promise<void> {
  await db.put('automatico', e);
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
    config: r?.id === 'politica' ? r.valor : null,
    ajustes: await lerAjustes(db),
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
  // Ajustes do backup entram sempre dentro dos limites absolutos. Importar nunca liga o automático.
  if (b.ajustes) ops.push(tx.objectStore('config').put({ id: 'ajustes', valor: normalizarAjustes(b.ajustes) }));
  await Promise.all([...ops, tx.done]);
}
