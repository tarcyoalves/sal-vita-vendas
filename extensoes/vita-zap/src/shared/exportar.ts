// Backup em JSON (exportar/importar) e relatório CSV.

import { z } from 'zod';
import type { Campanha } from './campanha';
import type { ContatoVarrido } from './contatos';
import type { ConfigPolitica } from './politica';

export interface Envio {
  /** `${campanhaId}:${chave}` — garante um envio por contato por campanha. */
  id: string;
  campanhaId: string;
  chave: string;
  nome: string;
  enviadoEm: string;
  /** O texto que apareceu no chat confere com o texto colado. */
  textoConfere: boolean;
  /** JID da conversa (ex.: 5584...@c.us) lido do chat no momento do envio; null se não deu para ler. */
  jid?: string | null;
}

export interface NaoEnviar {
  chave: string;
  nome: string;
  desde: string;
  motivo: string;
}

export interface Backup {
  formato: 'vita-zap-backup';
  versao: 1;
  exportadoEm: string;
  contatos: ContatoVarrido[];
  campanhas: Campanha[];
  envios: Envio[];
  naoEnviar: NaoEnviar[];
  config: ConfigPolitica | null;
}

const iso = z.string().min(1);
const dataOuNulo = z.string().nullable();

const contatoSchema = z.object({
  chave: z.string().min(1),
  nome: z.string(),
  rotuloData: z.string().nullable(),
  ultimaConversa: dataOuNulo,
  revisarData: z.string().nullable(),
  soNumero: z.boolean(),
  pareceGrupo: z.boolean(),
  temConversa: z.boolean(),
  duplicado: z.boolean(),
  varridoEm: iso,
});

const filtrosSchema = z.object({
  contem: z.array(z.string()),
  naoContem: z.array(z.string()),
  ultimaConversaAntesDe: dataOuNulo,
  ultimaConversaDepoisDe: dataOuNulo,
  excluirContatadosHaDias: z.number(),
});

const itemSchema = z.object({
  chave: z.string().min(1),
  nome: z.string(),
  primeiroNome: z.string(),
  modelo: z.string(),
  status: z.enum(['pendente', 'enviado', 'pulado', 'nao_cliente', 'problema', 'nao_enviar']),
  motivo: z.string().nullable(),
  atualizadoEm: z.string().nullable(),
});

const campanhaSchema = z.object({
  id: z.string().min(1),
  nome: z.string(),
  criadaEm: iso,
  aprovadaEm: z.string().nullable(),
  termoBusca: z.string(),
  filtros: filtrosSchema,
  modelos: z.array(z.string()),
  status: z.enum(['rascunho', 'em_execucao', 'pausada', 'concluida']),
  motivoPausa: z.string().nullable(),
  itens: z.array(itemSchema),
  problemasSeguidos: z.number(),
  ultimoEnvioEm: z.string().nullable(),
  intervaloAtualSeg: z.number().nullable(),
});

const envioSchema = z.object({
  id: z.string().min(1),
  campanhaId: z.string().min(1),
  chave: z.string().min(1),
  nome: z.string(),
  enviadoEm: iso,
  textoConfere: z.boolean(),
  jid: z.string().nullable().optional(),
});

const naoEnviarSchema = z.object({ chave: z.string().min(1), nome: z.string(), desde: iso, motivo: z.string() });

const configSchema = z.object({
  tetoDiario: z.number(),
  intervaloMinSeg: z.number(),
  intervaloMaxSeg: z.number(),
  numeroComMaisDe30Dias: z.boolean(),
});

const backupSchema = z.object({
  formato: z.literal('vita-zap-backup'),
  versao: z.literal(1),
  exportadoEm: iso,
  contatos: z.array(contatoSchema),
  campanhas: z.array(campanhaSchema),
  envios: z.array(envioSchema),
  naoEnviar: z.array(naoEnviarSchema),
  config: configSchema.nullable(),
});

export function lerBackup(texto: string): { ok: true; backup: Backup } | { ok: false; erro: string } {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'arquivo não é JSON válido' };
  }
  const r = backupSchema.safeParse(json);
  if (!r.success) {
    const p = r.error.issues[0];
    return { ok: false, erro: `backup inválido em "${p?.path.join('.') ?? '?'}": ${p?.message ?? 'formato'}` };
  }
  return { ok: true, backup: r.data };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/** Célula CSV (separador ;). Prefixa ' em valores que o Excel interpretaria como fórmula. */
export function celulaCsv(valor: string | number | boolean | null | undefined): string {
  if (valor == null) return '';
  let s = String(valor);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function gerarCsv(cabecalho: string[], linhas: Array<Array<string | number | boolean | null | undefined>>): string {
  const todas = [cabecalho, ...linhas].map((l) => l.map(celulaCsv).join(';'));
  return `﻿${todas.join('\r\n')}\r\n`; // BOM: o Excel em português abre com acento certo
}

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'pendente',
  enviado: 'enviado',
  pulado: 'pulado',
  nao_cliente: 'não é cliente',
  problema: 'problema',
  nao_enviar: 'não enviar mais',
};

/** Uma linha por contato de cada campanha. Não inclui telefone (a extensão não guarda). */
export function csvDasCampanhas(campanhas: Campanha[], envios: Envio[]): string {
  const enviosPorId = new Map(envios.map((e) => [e.id, e]));
  const linhas: Array<Array<string | number | null>> = [];
  for (const c of campanhas) {
    for (const i of c.itens) {
      const envio = enviosPorId.get(`${c.id}:${i.chave}`);
      linhas.push([c.nome, c.id, i.nome, i.primeiroNome, ROTULO_STATUS[i.status] ?? i.status, i.motivo, envio?.enviadoEm ?? null, i.atualizadoEm]);
    }
  }
  return gerarCsv(['campanha', 'id_campanha', 'contato', 'primeiro_nome', 'status', 'motivo', 'enviado_em', 'atualizado_em'], linhas);
}
