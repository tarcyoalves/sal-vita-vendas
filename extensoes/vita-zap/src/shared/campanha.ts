// Campanha: itens, aprovação e transições de estado (funções puras; o painel grava no IndexedDB).

import type { Filtros } from './filtros';
import { registrarProblema } from './politica';
import { montarMensagem, sortearModelo, usaPrimeiroNome, validarModelo } from './texto';
import { primeiroNome as extrairPrimeiroNome } from './nomes';

/** 'revisar': pode ter saído, ou a conversa não foi confirmada. Nunca é reenviado sozinho; o atendente confere. */
export type StatusItem = 'pendente' | 'enviado' | 'pulado' | 'nao_cliente' | 'problema' | 'nao_enviar' | 'revisar';
export type StatusCampanha = 'rascunho' | 'em_execucao' | 'pausada' | 'concluida';

export interface ItemCampanha {
  chave: string;
  nome: string;
  primeiroNome: string;
  /** Modelo sorteado (com {primeiroNome}); o texto final é montado na hora de colar. */
  modelo: string;
  status: StatusItem;
  motivo: string | null;
  atualizadoEm: string | null;
  ultimaConversa?: string | null;
  /** Se marcado para envio na prévia (padrão true para incluídos; contatos de revisar entram false). */
  marcado?: boolean;
}

/**
 * Marcador "em voo": gravado ANTES de colar o texto de um contato e apagado só quando o desfecho é conhecido.
 * Se o painel fechar/travar no meio, ao reabrir ele diz que havia uma mensagem em andamento: a campanha NÃO cola
 * de novo, consulta a conversa (saiu?) e, na dúvida, marca "revisar".
 */
export interface EmVoo {
  chave: string;
  nome: string;
  texto: string;
  /** Foto dos ids das mensagens da conversa tirada antes de colar (null enquanto a conversa ainda abre). */
  idsAntes: string[] | null;
  desde: string;
}

export interface Campanha {
  id: string;
  nome: string;
  criadaEm: string;
  aprovadaEm: string | null;
  termoBusca: string;
  filtros: Filtros;
  modelos: string[];
  status: StatusCampanha;
  motivoPausa: string | null;
  itens: ItemCampanha[];
  problemasSeguidos: number;
  ultimoEnvioEm: string | null;
  intervaloAtualSeg: number | null;
  /** Mensagem em andamento (ver EmVoo). Ausente/null = nada em voo. */
  emVoo?: EmVoo | null;
}

export function novoId(agora: Date, aleatorio: () => number = Math.random): string {
  return `c${agora.getTime().toString(36)}${Math.floor(aleatorio() * 1e6).toString(36)}`;
}

export function criarItens(
  selecionados: ReadonlyArray<{ chave: string; nome: string; ultimaConversa?: string | null }>,
  modelos: string[],
  termosIgnorar: string[],
  aleatorio: () => number = Math.random,
): ItemCampanha[] {
  const vistos = new Set<string>();
  const itens: ItemCampanha[] = [];
  for (const s of selecionados) {
    if (vistos.has(s.chave)) continue; // uma mensagem por contato por campanha
    vistos.add(s.chave);
    itens.push({
      chave: s.chave,
      nome: s.nome,
      primeiroNome: extrairPrimeiroNome(s.nome, termosIgnorar),
      modelo: sortearModelo(modelos, aleatorio),
      status: 'pendente',
      motivo: null,
      atualizadoEm: null,
      ultimaConversa: s.ultimaConversa ?? null,
    });
  }
  return itens;
}

export function textoDoItem(item: ItemCampanha): string {
  if (!item) return '';
  return montarMensagem(item.modelo ?? '', item.primeiroNome ?? item.nome ?? '');
}

/** Erros que impedem aprovar (lista vazia = pode aprovar). */
export function validarParaAprovar(c: Pick<Campanha, 'itens' | 'modelos'>): string[] {
  const erros: string[] = [];
  if (c.itens.length === 0) erros.push('nenhum contato na campanha');
  for (const m of c.modelos) for (const e of validarModelo(m)) erros.push(e);
  const chaves = new Set<string>();
  for (const item of c.itens) {
    if (chaves.has(item.chave)) erros.push(`contato repetido: ${item.nome}`);
    chaves.add(item.chave);
    if (usaPrimeiroNome(item.modelo) && item.primeiroNome.trim() === '') erros.push(`preencha o primeiro nome de "${item.nome}"`);
    for (const e of validarModelo(textoDoItem(item))) erros.push(`${item.nome}: ${e}`);
  }
  return [...new Set(erros)];
}

export function proximoPendente(c: Campanha): ItemCampanha | null {
  return c.itens.find((i) => i.status === 'pendente') ?? null;
}

export function resumo(c: Campanha): Record<StatusItem, number> {
  const r: Record<StatusItem, number> = { pendente: 0, enviado: 0, pulado: 0, nao_cliente: 0, problema: 0, nao_enviar: 0, revisar: 0 };
  for (const i of c.itens) r[i.status] += 1;
  return r;
}

/**
 * Muda o status de um item. Só sai de "pendente": um item já enviado/pulado não muda mais
 * (garante uma mensagem por contato por campanha). Devolve a mesma campanha se nada mudou.
 */
export function marcarItem(
  c: Campanha,
  chave: string,
  status: Exclude<StatusItem, 'pendente'>,
  agora: Date,
  motivo: string | null = null,
  /** Conta no freio dos "3 problemas seguidos"? Padrão: só 'problema'. 'revisar' não conta, a menos que se peça. */
  contaNoFreio: boolean = status === 'problema',
): Campanha {
  const item = c.itens.find((i) => i.chave === chave);
  if (!item || item.status !== 'pendente') return c;
  const itens = c.itens.map((i) => (i.chave === chave ? { ...i, status, motivo, atualizadoEm: agora.toISOString() } : i));
  let problemasSeguidos = c.problemasSeguidos;
  let statusCampanha: StatusCampanha = c.status;
  let motivoPausa = c.motivoPausa;
  if (contaNoFreio) {
    const r = registrarProblema(problemasSeguidos);
    problemasSeguidos = r.problemasSeguidos;
    if (r.pausar) {
      statusCampanha = 'pausada';
      motivoPausa = `${problemasSeguidos} problemas seguidos — confira o WhatsApp antes de continuar`;
    }
  } else if (status === 'enviado') {
    problemasSeguidos = 0;
  }
  const novo: Campanha = { ...c, itens, problemasSeguidos, status: statusCampanha, motivoPausa };
  if (statusCampanha === 'em_execucao' && !novo.itens.some((i) => i.status === 'pendente')) {
    return { ...novo, status: 'concluida', motivoPausa: null };
  }
  return novo;
}
