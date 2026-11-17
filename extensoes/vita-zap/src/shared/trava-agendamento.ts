// Trava de agendamento (v0.7.56): regras PURAS. Sem rede, sem chrome.
//
// Decisão do dono (17/11/2026): se o cliente tem um agendamento FUTURO pendente no CRM (ex.: daqui a 60 dias), ele NÃO entra
// em reativação, campanha (Varredura/Prévia/Executor) nem cobrança automática: o agendamento prevalece. Passou a data (ou o
// lembrete foi concluído/cancelado), volta a ser elegível.
//
// O CRM não conhece o contato pelo nome do WhatsApp, então o casamento é, na ordem:
//  1. telefone (mesma linha, com ou sem o 9 extra e o DDI);
//  2. vínculo que a própria extensão já gravou (contato → tarefa do CRM);
//  3. nome: igual (sem acento/maiúscula) ou um contendo o outro por PALAVRAS inteiras (ver nomesCompativeis).
// Na dúvida, bloqueia: errar para o lado de NÃO mandar mensagem é o lado seguro.
// Falha fechada: lista que não pôde ser lida (CRM fora do ar, sem login) ou truncada = `indisponivel`: envio automático não acontece.

import { chavesDoVinculo } from './crm-remoto';
import { partesNoFuso } from './datas';
import { normalizarTexto } from './nomes';
import { mesmoTelefone } from './telefone';

/** Um agendamento futuro pendente do CRM (uma tarefa com lembrete ligado). `venceEm` em epoch ms. */
export interface AgendamentoCrm {
  taskId: number;
  titulo: string;
  telefone: string | null;
  venceEm: number;
}

export interface ListaAgendamentos {
  itens: AgendamentoCrm[];
  /** O servidor cortou a lista (limite): pode haver agendamento que não veio. */
  truncado: boolean;
  /** Instante da consulta ao CRM que gerou esta lista (epoch ms). */
  em: number;
}

export interface RefTrava {
  nome: string;
  telefone?: string | null;
}

export type ResultadoTrava =
  | { tipo: 'livre' }
  | { tipo: 'agendado'; ate: number; taskId: number; titulo: string; como: 'telefone' | 'vinculo' | 'nome'; motivo: string }
  | { tipo: 'indisponivel'; motivo: string };

/** Quanto tempo a lista consultada vale antes de consultar o CRM de novo (cache curto: poupa o banco do CRM). */
export const VALIDADE_AGENDAMENTOS_MS = 5 * 60_000;

const dois = (n: number) => String(n).padStart(2, '0');

/** "dd/MM" no fuso de Fortaleza. */
export function diaMes(ms: number): string {
  const p = partesNoFuso(new Date(ms));
  return `${dois(p.dia)}/${dois(p.mes)}`;
}

export function motivoAgendado(ate: number): string {
  return `agendado para ${diaMes(ate)} (o agendamento prevalece)`;
}

/** Palavras que não distinguem uma pessoa de outra. */
const NEUTRAS = new Set(['cliente', 'clientes', 'lead', 'de', 'da', 'do', 'dos', 'das', 'e', 'sr', 'sra', 'dona', 'seu']);

function palavras(nome: string): string[] {
  return normalizarTexto(nome)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((p) => p !== '' && !NEUTRAS.has(p));
}

/**
 * O contato do WhatsApp e o título da tarefa do CRM podem ser a mesma pessoa? Igual depois de normalizar, ou as palavras
 * significativas de um são o começo das palavras do outro ("Ismael Roberto" x "Ismael Roberto - Agropecuária Pradal").
 * Uma palavra só ("Maria") nunca basta: é comum demais.
 */
export function nomesCompativeis(a: string, b: string): boolean {
  const x = palavras(a);
  const y = palavras(b);
  if (x.length === 0 || y.length === 0) return false;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  if (curto.length === longo.length) return curto.every((p, i) => p === longo[i]);
  if (curto.length < 2 && curto.join('').length < 10) return false;
  return curto.every((p, i) => p === longo[i]);
}

/**
 * O contato tem agendamento futuro no CRM? Só conta o que ainda é futuro AGORA (a lista pode ter sido consultada há minutos).
 * Vários agendamentos: vale o mais distante (o contato só volta a ser elegível depois de todos).
 */
export function verificarTrava(ref: RefTrava, lista: ListaAgendamentos | null, vinculos: Readonly<Record<string, number>>, agora: number): ResultadoTrava {
  if (lista === null) return { tipo: 'indisponivel', motivo: 'não consegui consultar os agendamentos do CRM' };
  const futuros = lista.itens.filter((i) => i.venceEm > agora);
  const tel = ref.telefone ?? null;
  const taskIds = new Set<number>();
  for (const k of chavesDoVinculo({ nome: ref.nome, ...(tel ? { telefone: tel } : {}) })) if (typeof vinculos[k] === 'number') taskIds.add(vinculos[k]);

  const achados: Array<{ a: AgendamentoCrm; como: 'telefone' | 'vinculo' | 'nome' }> = [];
  for (const a of futuros) {
    if (tel && a.telefone && mesmoTelefone(tel, a.telefone)) achados.push({ a, como: 'telefone' });
    else if (taskIds.has(a.taskId)) achados.push({ a, como: 'vinculo' });
    else if (nomesCompativeis(ref.nome, a.titulo)) achados.push({ a, como: 'nome' });
  }
  if (achados.length > 0) {
    const melhor = achados.reduce((m, x) => (x.a.venceEm > m.a.venceEm ? x : m));
    return { tipo: 'agendado', ate: melhor.a.venceEm, taskId: melhor.a.taskId, titulo: melhor.a.titulo, como: melhor.como, motivo: motivoAgendado(melhor.a.venceEm) };
  }
  if (lista.truncado) return { tipo: 'indisponivel', motivo: 'a lista de agendamentos do CRM veio incompleta' };
  return { tipo: 'livre' };
}

/** Lê a lista do servidor (zapCrm.agendamentosFuturos) de forma defensiva. Fora do contrato → null (indisponível). */
export function listaDoServidor(bruto: unknown, em: number): ListaAgendamentos | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const o = bruto as Record<string, unknown>;
  if (!Array.isArray(o.itens)) return null;
  const itens: AgendamentoCrm[] = [];
  for (const x of o.itens) {
    if (typeof x !== 'object' || x === null) continue;
    const t = x as Record<string, unknown>;
    const ms = t.venceEm instanceof Date ? t.venceEm.getTime() : typeof t.venceEm === 'string' || typeof t.venceEm === 'number' ? new Date(t.venceEm).getTime() : NaN;
    if (typeof t.taskId !== 'number' || typeof t.titulo !== 'string' || !Number.isFinite(ms)) continue;
    itens.push({ taskId: t.taskId, titulo: t.titulo, telefone: typeof t.telefone === 'string' && t.telefone !== '' ? t.telefone : null, venceEm: ms });
  }
  return { itens, truncado: o.truncado === true, em };
}
