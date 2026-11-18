// "Não enviar mais" e contato registrado COMPARTILHADOS pela equipe (v0.7.60). Regras PURAS: sem rede, sem chrome, sem banco.
//
// A fonte passa a ser o CRM (zapContatos.*). A lista local (IndexedDB `naoEnviar`) vira cache/offline: a união vale
// (opt-out em qualquer lugar vale em todos). NUNCA se guarda texto de mensagem: só quem, quando, origem e tipo.
//
// Chave do contato no CRM: o telefone canônico quando existe; senão o hash estável do nome normalizado. A extensão manda
// SEMPRE os dois (telefone, se conhece, e o hash do nome); o servidor casa o contato por qualquer um (ver mesmoContato).

import { diferencaDias, hojeNoFuso } from './datas';
import type { NaoEnviar } from './exportar';
import { hashTexto } from './hash';
import { chaveContato } from './nomes';
import { chaveDoTelefone, normalizarTelefone } from './telefone';

export type OrigemOptOut = 'manual' | 'ia' | 'campanha' | 'cobranca' | 'reativacao';
export type TipoEnvioEquipe = 'campanha' | 'cobranca' | 'reativacao' | 'pedido';
export const ORIGENS_OPT_OUT: readonly OrigemOptOut[] = ['manual', 'ia', 'campanha', 'cobranca', 'reativacao'];
export const ROTULO_ORIGEM_OPT_OUT: Record<OrigemOptOut, string> = {
  manual: 'marcado à mão',
  ia: 'marcado pela IA',
  campanha: 'campanha',
  cobranca: 'cobrança',
  reativacao: 'reativação',
};

/** Quanto tempo a lista do CRM (e o último contato) vale antes de consultar de novo: cache curto, como a trava de agendamento. */
export const VALIDADE_EQUIPE_MS = 5 * 60_000;
/** Cada lote enviado ao servidor (o servidor também limita). */
export const LOTE_OPT_OUT = 200;
export const LOTE_ENVIOS = 200;
export const LOTE_CONSULTA = 500;
/** Quantos dias de envios antigos sobem ao CRM na primeira sincronização (migração). */
export const DIAS_MIGRACAO_ENVIOS = 45;
/** Janela da consulta "contatado há quanto tempo" para planejar a fila (prévia, follow-up, reativação). O Executor consulta pelo limite do próprio contato. */
export const DIAS_CONSULTA_PLANEJAMENTO = 60;

// ── Referência do contato ───────────────────────────────────────────────────

/** O que identifica o contato fora do WhatsApp deste computador. */
export interface RefEquipe {
  /** Canônico (com DDI e sem o 9 extra do celular); null = a extensão não conhece o telefone. */
  telefone: string | null;
  /** Hash do nome normalizado (a mesma normalização da chave local). */
  nomeHash: string;
}

export const hashDoNome = (nome: string): string => hashTexto(chaveContato(nome));

export function telefoneCanonico(bruto: string | null | undefined): string | null {
  const n = normalizarTelefone(bruto);
  return n ? chaveDoTelefone(n) : null;
}

export function refDoContato(nome: string, telefone?: string | null): RefEquipe {
  return { telefone: telefoneCanonico(telefone), nomeHash: hashDoNome(nome) };
}

/** Forma que vai no fio: números que não são do Brasil levam "+" para o servidor não presumir o DDI 55. */
export function telefoneNoFio(telefone: string | null): string | undefined {
  if (telefone == null) return undefined;
  return /^55\d{10,11}$/.test(telefone) ? telefone : `+${telefone}`;
}

/** Mesmo contato? Os dois com telefone: vale o telefone; se um não tem, vale o hash do nome. (Igual ao servidor.) */
export function mesmoContatoEquipe(a: RefEquipe, b: RefEquipe): boolean {
  if (a.telefone && b.telefone) return a.telefone === b.telefone;
  return a.nomeHash === b.nomeHash;
}

// ── O que o servidor devolve (leitura defensiva) ────────────────────────────

export interface OptOutCrm extends RefEquipe {
  chave: string;
  nome: string | null;
  userId: number;
  origem: OrigemOptOut;
  /** epoch ms */
  em: number;
}

export interface ListaOptOuts {
  itens: OptOutCrm[];
  /** O servidor cortou a lista (limite): a ausência de um contato NÃO prova que ele foi desmarcado. */
  truncado: boolean;
  /** Instante da consulta (epoch ms). */
  em: number;
}

const ms = (v: unknown): number | null => {
  const t = v instanceof Date ? v.getTime() : typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

export function listaOptOutsDoServidor(bruto: unknown, em: number): ListaOptOuts | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const o = bruto as Record<string, unknown>;
  if (!Array.isArray(o.itens)) return null;
  const itens: OptOutCrm[] = [];
  for (const x of o.itens) {
    if (typeof x !== 'object' || x === null) continue;
    const t = x as Record<string, unknown>;
    const quando = ms(t.criadoEm);
    if (typeof t.chave !== 'string' || typeof t.nomeHash !== 'string' || typeof t.userId !== 'number' || quando == null) continue;
    const origem = (ORIGENS_OPT_OUT as readonly string[]).includes(t.origem as string) ? (t.origem as OrigemOptOut) : 'manual';
    itens.push({
      chave: t.chave,
      telefone: typeof t.telefone === 'string' && t.telefone !== '' ? t.telefone : null,
      nomeHash: t.nomeHash,
      nome: typeof t.nome === 'string' && t.nome.trim() !== '' ? t.nome : null,
      userId: t.userId,
      origem,
      em: quando,
    });
  }
  return { itens, truncado: o.truncado === true, em };
}

export interface ContatadoEquipe {
  /** Posição do contato na lista enviada. */
  i: number;
  tipo: TipoEnvioEquipe;
  /** epoch ms */
  enviadoEm: number;
  /** Foi este mesmo usuário (outro computador) e não outro atendente. */
  meu: boolean;
}

export interface OptOutEncontrado {
  i: number;
  origem: OrigemOptOut;
  meu: boolean;
}

export interface RespostaContatados {
  itens: ContatadoEquipe[];
  optOuts: OptOutEncontrado[];
  truncado: boolean;
}

const TIPOS: readonly string[] = ['campanha', 'cobranca', 'reativacao', 'pedido'];

export function contatadosDoServidor(bruto: unknown): RespostaContatados | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const o = bruto as Record<string, unknown>;
  if (!Array.isArray(o.itens)) return null;
  const itens: ContatadoEquipe[] = [];
  for (const x of o.itens) {
    if (typeof x !== 'object' || x === null) continue;
    const t = x as Record<string, unknown>;
    const quando = ms(t.enviadoEm);
    if (typeof t.i !== 'number' || !TIPOS.includes(t.tipo as string) || quando == null) continue;
    itens.push({ i: t.i, tipo: t.tipo as TipoEnvioEquipe, enviadoEm: quando, meu: t.meu === true });
  }
  const optOuts: OptOutEncontrado[] = [];
  if (Array.isArray(o.optOuts)) {
    for (const x of o.optOuts) {
      if (typeof x !== 'object' || x === null) continue;
      const t = x as Record<string, unknown>;
      if (typeof t.i !== 'number') continue;
      optOuts.push({ i: t.i, origem: (ORIGENS_OPT_OUT as readonly string[]).includes(t.origem as string) ? (t.origem as OrigemOptOut) : 'manual', meu: t.meu === true });
    }
  }
  return { itens, optOuts, truncado: o.truncado === true };
}

// ── Opt-out: união local + CRM ──────────────────────────────────────────────

/** Origem a gravar para um "não enviar mais" local que ainda não tem origem (registros antigos): deduz do motivo. */
export function origemDoMotivo(motivo: string | null | undefined): OrigemOptOut {
  const m = (motivo ?? '').toLowerCase();
  if (m.includes('lido pela ia') || m.includes('pela ia')) return 'ia';
  if (m.includes('reativa')) return 'reativacao';
  if (m.includes('follow-up') || m.includes('cobran')) return 'cobranca';
  if (m.includes('campanha')) return 'campanha';
  return 'manual';
}

export interface ContatoConhecido {
  chave: string;
  nome: string;
  telefone: string | null;
}

export interface PlanoOptOuts {
  /** Entradas locais NOVAS vindas do CRM (o opt-out de outro atendente/computador passa a valer aqui). */
  novosLocais: NaoEnviar[];
  /** Entradas locais que já estavam sincronizadas e o CRM não tem mais (alguém desfez): saem daqui. */
  removerLocais: string[];
  /** Entradas locais que o CRM ainda não tem (migração e marcações feitas sem rede): sobem. */
  paraEnviar: NaoEnviar[];
  /** Entradas locais confirmadas no CRM (passam a ser marcadas como sincronizadas). */
  confirmar: string[];
}

/**
 * Une a lista local e a do CRM.
 *  - local ausente do CRM e nunca sincronizado → sobe (migração / marcado offline);
 *  - local já sincronizado e ausente do CRM → alguém desfez: sai daqui (só se a lista do CRM veio completa);
 *  - CRM sem entrada local → passa a valer aqui. A chave local vem do nome gravado no CRM; sem nome, de um contato conhecido
 *    do mesmo telefone/nome (`contatos`).
 */
export function planejarOptOuts(locais: ReadonlyArray<NaoEnviar>, crm: ListaOptOuts, contatos: ReadonlyArray<ContatoConhecido>, telefoneDeLocal: (n: NaoEnviar) => string | null): PlanoOptOuts {
  const novosLocais: NaoEnviar[] = [];
  const removerLocais: string[] = [];
  const paraEnviar: NaoEnviar[] = [];
  const confirmar: string[] = [];
  const chavesLocais = new Set(locais.map((l) => l.chave));
  const noCrm = indiceDeRefs(crm.itens);

  const refsLocais = new Map<string, RefEquipe>();
  for (const l of locais) {
    const ref = refDoContato(l.nome, telefoneDeLocal(l));
    refsLocais.set(l.chave, ref);
    if (noCrm.acha(ref)) {
      if (l.crm !== true) confirmar.push(l.chave);
    } else if (l.crm === true) {
      if (!crm.truncado) removerLocais.push(l.chave);
    } else paraEnviar.push(l);
  }

  const removidas = new Set(removerLocais);
  const vivos = indiceDeRefs(locais.filter((l) => !removidas.has(l.chave)).map((l) => refsLocais.get(l.chave) as RefEquipe));
  const conhecidos = indiceDeRefs(contatos.map((k) => ({ ...refDoContato(k.nome, k.telefone), chave: k.chave, nome: k.nome })));
  for (const c of crm.itens) {
    if (vivos.acha(c)) continue;
    const doNome = c.nome ? { chave: chaveContato(c.nome), nome: c.nome } : null;
    const achado = conhecidos.acha(c);
    const alvo = achado ? { chave: achado.chave, nome: achado.nome } : doNome;
    if (!alvo || alvo.chave === '' || chavesLocais.has(alvo.chave) || novosLocais.some((n) => n.chave === alvo.chave)) continue;
    novosLocais.push({ chave: alvo.chave, nome: alvo.nome, desde: new Date(c.em).toISOString(), motivo: `marcado no CRM (${ROTULO_ORIGEM_OPT_OUT[c.origem]})`, origem: c.origem, crm: true });
    vivos.adiciona(c);
  }
  return { novosLocais, removerLocais, paraEnviar, confirmar };
}

/** Índice para achar "o mesmo contato" sem comparar todos com todos (telefone quando os dois têm; senão o hash do nome). */
export function indiceDeRefs<T extends RefEquipe>(itens: ReadonlyArray<T>): { acha: (r: RefEquipe) => T | undefined; adiciona: (r: T) => void } {
  const porTel = new Map<string, T>();
  const porHash = new Map<string, T[]>();
  const adiciona = (x: T): void => {
    if (x.telefone && !porTel.has(x.telefone)) porTel.set(x.telefone, x);
    const l = porHash.get(x.nomeHash);
    if (l) l.push(x);
    else porHash.set(x.nomeHash, [x]);
  };
  for (const x of itens) adiciona(x);
  return {
    adiciona,
    acha: (r) => {
      if (r.telefone) {
        const t = porTel.get(r.telefone);
        if (t) return t;
      }
      // Mesmo nome: só vale se um dos dois não tem telefone (dois telefones diferentes = pessoas diferentes).
      return (porHash.get(r.nomeHash) ?? []).find((x) => !(r.telefone && x.telefone));
    },
  };
}

// ── Contato registrado ──────────────────────────────────────────────────────

export interface ContatoDaEquipe {
  /** Instante do envio mais recente de qualquer tipo (ISO). */
  em: string;
  tipo: TipoEnvioEquipe;
  meu: boolean;
}

/** Do que o servidor devolveu para UM contato (vários tipos), o contato mais recente. */
export function maisRecenteDaEquipe(itens: ReadonlyArray<ContatadoEquipe>): ContatoDaEquipe | null {
  let melhor: ContatadoEquipe | null = null;
  for (const x of itens) if (melhor == null || x.enviadoEm > melhor.enviadoEm) melhor = x;
  return melhor ? { em: new Date(melhor.enviadoEm).toISOString(), tipo: melhor.tipo, meu: melhor.meu } : null;
}

/** O mais recente entre o envio local e o contato registrado pela equipe (ISO). */
export function maisRecenteIso(a: string | undefined, b: string | undefined): string | undefined {
  if (a == null) return b;
  if (b == null) return a;
  return a >= b ? a : b;
}

export const ROTULO_TIPO_ENVIO: Record<TipoEnvioEquipe, string> = { campanha: 'campanha', cobranca: 'cobrança', reativacao: 'reativação', pedido: 'pedido' };

/** "contatado há N dia(s) por outro atendente" quando abaixo do limite; senão null. Mesmo critério de dias do filtro local (dia do calendário em Fortaleza). */
export function motivoContatoDaEquipe(c: ContatoDaEquipe, agora: Date, limiteDias: number): string | null {
  const dias = diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(c.em)));
  if (dias >= limiteDias) return null;
  const quem = c.meu ? 'por você em outro computador' : 'por outro atendente';
  return `contatado há ${dias} dia(s) ${quem} (${ROTULO_TIPO_ENVIO[c.tipo]}; mínimo ${limiteDias})`;
}

/** Tipo do envio a registrar no CRM, pela campanha que o fez. */
export function tipoDoEnvio(campanha: { tipo?: 'followup' | 'reativacao' }): TipoEnvioEquipe {
  return campanha.tipo === 'followup' ? 'cobranca' : campanha.tipo === 'reativacao' ? 'reativacao' : 'campanha';
}

/** Origem do "não enviar mais" marcado durante uma campanha: a cobrança, a reativação ou uma campanha comum. */
export function origemDaCampanha(campanha: { tipo?: 'followup' | 'reativacao' }): OrigemOptOut {
  return campanha.tipo === 'followup' ? 'cobranca' : campanha.tipo === 'reativacao' ? 'reativacao' : 'campanha';
}
