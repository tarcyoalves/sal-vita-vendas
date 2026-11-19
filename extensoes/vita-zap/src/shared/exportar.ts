// Backup em JSON (exportar/importar) e relatório CSV.

import { z } from 'zod';
import type { Campanha } from './campanha';
import type { ContatoVarrido } from './contatos';
import type { AcaoIa, Julgamento } from './automaticos';
import type { ConfigFollowup, Followup } from './followup';
import type { EstadoPedidos } from './pedido-ia';
import type { ConfigPolitica } from './politica';
import type { ConfigReativacao, Reativacao } from './reativacao';
import type { EnvioDoTexto } from './resultado-texto';

export interface Envio {
  /** `${campanhaId}:${chave}` — garante um envio por contato por campanha. */
  id: string;
  campanhaId: string;
  chave: string;
  nome: string;
  enviadoEm: string;
  /** O texto que apareceu no chat confere com o texto colado. */
  textoConfere: boolean;
}

export interface NaoEnviar {
  chave: string;
  nome: string;
  desde: string;
  motivo: string;
  /** Quem/onde marcou (v0.7.60). Ausente em registros antigos: o motivo diz. */
  origem?: 'manual' | 'ia' | 'campanha' | 'cobranca' | 'reativacao';
  /** Já está no CRM (v0.7.60): se o CRM deixar de ter, alguém desfez e a entrada local sai. Ausente = ainda não subiu (migração). */
  crm?: boolean;
}

/** Campos que o formato 1 não tinha: ausentes ao ler um backup antigo (e então a importação não toca nessas lojas). */
export interface ExtrasBackup {
  followups?: Followup[];
  /** Configurações guardadas em followupConfig. Nunca inclui o estado da sincronização com a equipe nem avisos (são do computador). */
  configFollowup?: ConfigFollowup | null;
  configReativacao?: ConfigReativacao | null;
  pedidos?: EstadoPedidos | null;
  reativacoes?: Reativacao[];
  julgamentos?: Julgamento[];
  acoesIa?: AcaoIa[];
  resultadosTexto?: EnvioDoTexto[];
}

/** O backup já lido, em forma plana (vale para o formato 1 e para o 2). É o que a importação consome. */
export interface Backup extends ExtrasBackup {
  formato: 'vita-zap-backup';
  versao: 1 | 2;
  exportadoEm: string;
  contatos: ContatoVarrido[];
  campanhas: Campanha[];
  envios: Envio[];
  naoEnviar: NaoEnviar[];
  config: ConfigPolitica | null;
}

export const VERSAO_BACKUP = 2;

/** O arquivo gravado hoje (formato 2). SEM tokens, senhas ou sessão: só as lojas de dados do IndexedDB listadas aqui. */
export interface BackupArquivo {
  formato: 'vita-zap-backup';
  versao: 2;
  geradoEm: string;
  versaoExtensao: string;
  lojas: {
    contatos: ContatoVarrido[];
    campanhas: Campanha[];
    envios: Envio[];
    naoEnviar: NaoEnviar[];
    config: ConfigPolitica | null;
    followups: Followup[];
    followupConfig: ConfigFollowup | null;
    reativacaoConfig: ConfigReativacao | null;
    pedidos: EstadoPedidos | null;
    reativacoes: Reativacao[];
    julgamentos: Julgamento[];
    acoesIa: AcaoIa[];
    resultadosTexto: EnvioDoTexto[];
  };
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
  // Sem estes dois o zod os descartava na restauração: o contato perdia o sinal "conversa minha" (filtro padrão da Varredura) e a marca
  // de "possível grupo" (proteção contra grupo com foto).
  ultimaDeMim: z.boolean().nullable().optional(),
  possivelGrupo: z.boolean().optional(),
  duplicado: z.boolean(),
  varridoEm: iso,
});

const filtrosSchema = z.object({
  contem: z.array(z.string()),
  naoContem: z.array(z.string()),
  ultimaConversaAntesDe: dataOuNulo,
  ultimaConversaDepoisDe: dataOuNulo,
  excluirContatadosHaDias: z.number(),
  incluirSemConversa: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  fases: z.array(z.enum(['novo', 'orcamento', 'negociando', 'fechado', 'perdido'])).optional(),
  aguardandoResposta: z.boolean().optional(),
  // Sem isto o backup apagava o filtro "só contatos com conversa minha" (achado no teste de restauração completa).
  soComMensagemMinha: z.boolean().optional(),
});

const itemSchema = z.object({
  chave: z.string().min(1),
  nome: z.string(),
  primeiroNome: z.string(),
  modelo: z.string(),
  status: z.enum(['pendente', 'enviado', 'pulado', 'nao_cliente', 'problema', 'nao_enviar', 'revisar', 'aguardando_crm']),
  motivo: z.string().nullable(),
  atualizadoEm: z.string().nullable(),
  // Também descartados antes: a data da última conversa mostrada no Envio e a marca da prévia.
  ultimaConversa: z.string().nullable().optional(),
  marcado: z.boolean().optional(),
});

const campanhaSchema = z.object({
  id: z.string().min(1),
  // Sem isto o backup apagaria a marca e a cobrança do follow-up voltaria como campanha comum.
  tipo: z.enum(['followup', 'reativacao']).optional(),
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
  emVoo: z
    .object({ chave: z.string(), nome: z.string(), texto: z.string(), idsAntes: z.array(z.string()).nullable(), desde: z.string() })
    .nullable()
    .optional(),
});

const envioSchema = z.object({
  id: z.string().min(1),
  campanhaId: z.string().min(1),
  chave: z.string().min(1),
  nome: z.string(),
  enviadoEm: iso,
  textoConfere: z.boolean(),
});

const naoEnviarSchema = z.object({
  chave: z.string().min(1),
  nome: z.string(),
  desde: iso,
  motivo: z.string(),
  origem: z.enum(['manual', 'ia', 'campanha', 'cobranca', 'reativacao']).optional(),
  crm: z.boolean().optional(),
  // passthrough: campos que esta versão não conhece (ex.: marcador de "pendente de sincronização") atravessam o backup intactos.
}).passthrough();

const configSchema = z.object({
  tetoDiario: z.number(),
  intervaloMinSeg: z.number(),
  intervaloMaxSeg: z.number(),
  numeroComMaisDe30Dias: z.boolean(),
});

const baseSchema = {
  formato: z.literal('vita-zap-backup'),
  contatos: z.array(contatoSchema),
  campanhas: z.array(campanhaSchema),
  envios: z.array(envioSchema),
  naoEnviar: z.array(naoEnviarSchema),
  config: configSchema.nullable(),
};

const backupV1Schema = z.object({ ...baseSchema, versao: z.literal(1), exportadoEm: iso });

/** Lojas novas: valida o formato (objeto com a chave) e preserva o resto do registro; a normalização acontece ao ler/usar. */
const registro = (chave: string) => z.object({ [chave]: z.string().min(1) }).passthrough();
const objetoOuNulo = z.record(z.string(), z.unknown()).nullable();

const backupV2Schema = z.object({
  formato: z.literal('vita-zap-backup'),
  versao: z.literal(2),
  geradoEm: iso,
  versaoExtensao: z.string(),
  lojas: z.object({
    contatos: baseSchema.contatos,
    campanhas: baseSchema.campanhas,
    envios: baseSchema.envios,
    naoEnviar: baseSchema.naoEnviar,
    config: baseSchema.config,
    followups: z.array(registro('id')),
    followupConfig: objetoOuNulo,
    reativacaoConfig: objetoOuNulo,
    pedidos: objetoOuNulo,
    reativacoes: z.array(registro('chave')),
    julgamentos: z.array(registro('id')),
    acoesIa: z.array(registro('id')),
    resultadosTexto: z.array(registro('id')),
  }),
});

export type ResultadoLerBackup = { ok: true; backup: Backup } | { ok: false; erro: string };

function erroZod(e: z.ZodError): ResultadoLerBackup {
  const p = e.issues[0];
  return { ok: false, erro: `backup inválido em "${p?.path.join('.') ?? '?'}": ${p?.message ?? 'formato'}` };
}

export function lerBackup(texto: string): ResultadoLerBackup {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'arquivo não é JSON válido' };
  }
  const versao = typeof json === 'object' && json !== null ? (json as { versao?: unknown }).versao : undefined;
  if (typeof versao === 'number' && versao > VERSAO_BACKUP) {
    return { ok: false, erro: `este backup é de uma versão mais nova (formato ${versao}); atualize a extensão para importá-lo` };
  }
  if (versao === 2) {
    const r = backupV2Schema.safeParse(json);
    if (!r.success) return erroZod(r.error);
    const { lojas: l } = r.data;
    // Os registros das lojas novas passaram pela checagem de chave; o conteúdo é normalizado por quem o usa (mesmas funções de leitura do banco).
    const como = <T>(v: unknown): T => v as T;
    return {
      ok: true,
      backup: {
        formato: 'vita-zap-backup',
        versao: 2,
        exportadoEm: r.data.geradoEm,
        contatos: l.contatos,
        campanhas: l.campanhas,
        envios: l.envios,
        naoEnviar: l.naoEnviar,
        config: l.config,
        followups: como<Followup[]>(l.followups),
        configFollowup: como<ConfigFollowup | null>(l.followupConfig),
        configReativacao: como<ConfigReativacao | null>(l.reativacaoConfig),
        pedidos: como<EstadoPedidos | null>(l.pedidos),
        reativacoes: como<Reativacao[]>(l.reativacoes),
        julgamentos: como<Julgamento[]>(l.julgamentos),
        acoesIa: como<AcaoIa[]>(l.acoesIa),
        resultadosTexto: como<EnvioDoTexto[]>(l.resultadosTexto),
      },
    };
  }
  const r = backupV1Schema.safeParse(json);
  if (!r.success) return erroZod(r.error);
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
  revisar: 'revisar (conferir no WhatsApp)',
  aguardando_crm: 'aguardando verificação do CRM',
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
