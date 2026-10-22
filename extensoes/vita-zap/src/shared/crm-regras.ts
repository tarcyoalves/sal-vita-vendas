// Regras puras de triagem: classificação das abas, "há X dias" e filtros. Sem DOM, sem storage.

import { diferencaDias, hojeNoFuso, interpretarRotuloData, partesNoFuso } from './datas';
import { normalizarTexto } from './nomes';
import { telefoneDoNomeExibido } from './telefone';
import type { AbaId, Contato, Conversa } from './crm-tipos';
import { ABAS } from './crm-tipos';

const DIA_MS = 86_400_000;

/** Chave de leitura da lista: o telefone normalizado quando o nome exibido é um número (contato não salvo), senão o nome normalizado. */
export function chaveDaConversa(nome: string): string {
  return telefoneDoNomeExibido(nome) ?? normalizarTexto(nome);
}

export function telefoneDoNome(nome: string): string | undefined {
  return telefoneDoNomeExibido(nome) ?? undefined;
}

/** O que foi lido de uma linha da lista, antes de virar Conversa. */
export interface LeituraConversa {
  nome: string;
  telefone?: string;
  rotuloData: string | null;
  previa: string;
  ultimaDeMim: boolean | null;
  naoLidas: number;
  naoLida: boolean;
  grupo: boolean;
}

/** "14:32" → "14:32"; "2:05 PM" → "14:05"; outra coisa → null. */
export function horaDoRotulo(rotulo: string | null): string | null {
  if (!rotulo) return null;
  const m = /^(\d{1,2}):(\d{2})(?:\s*([ap])\.?\s*m\.?)?$/i.exec(rotulo.replace(/[‎‏‪-‮]/g, '').trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Atualiza (ou cria) a Conversa a partir da leitura da linha. `desdeEm` só muda quando o estado muda. */
export function atualizarConversa(anterior: Conversa | undefined, l: LeituraConversa, agora: Date, arquivada: boolean): Conversa {
  const chave = chaveDaConversa(l.nome);
  const ass = `${l.previa}|${l.naoLidas}`;
  const ultimaDeMim = l.naoLidas > 0 || l.naoLida ? false : l.ultimaDeMim;
  const interp = l.rotuloData ? interpretarRotuloData(l.rotuloData, agora) : null;
  const mesmoEstado = anterior != null && anterior.ass === ass && anterior.ultimaDeMim === ultimaDeMim;
  let dataMsg: string | null = null;
  if (interp?.tipo === 'ok') dataMsg = interp.data;
  else if (mesmoEstado) dataMsg = anterior.dataMsg;
  return {
    chave,
    nome: l.nome,
    telefone: l.telefone ?? anterior?.telefone,
    ultimaDeMim,
    naoLida: l.naoLida || l.naoLidas > 0,
    naoLidas: l.naoLidas,
    grupo: l.grupo || (anterior?.grupo ?? false),
    arquivada,
    rotuloData: l.rotuloData,
    dataMsg,
    hora: horaDoRotulo(l.rotuloData) ?? (mesmoEstado && !interp ? anterior.hora : null),
    previa: l.previa,
    ass,
    desdeEm: mesmoEstado ? anterior.desdeEm : agora.getTime(),
    vistaEm: agora.getTime(),
  };
}

export function formatarDecorrido(ms: number): string {
  if (ms < 60_000) return 'agora há pouco';
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

export interface Idade {
  /** Dias de calendário desde a última mensagem. */
  dias: number;
  ms: number;
  texto: string;
}

/**
 * Há quanto tempo foi a última mensagem. Usa a data lida do rótulo da linha (dia de calendário
 * no fuso de Fortaleza; hora quando o rótulo é uma hora) e, se não houver, o instante em que
 * a extensão viu a conversa nesse estado.
 */
export function idadeDaUltima(c: Pick<Conversa, 'dataMsg' | 'hora' | 'desdeEm'>, agora: Date): Idade {
  if (c.dataMsg) {
    const dias = Math.max(0, diferencaDias(hojeNoFuso(agora), c.dataMsg));
    if (dias === 0 && c.hora) {
      const p = partesNoFuso(agora);
      const [h, m] = c.hora.split(':').map(Number);
      const ms = Math.max(0, p.hora * 60 + p.minuto - (h * 60 + m)) * 60_000;
      return { dias: 0, ms, texto: formatarDecorrido(ms) };
    }
    if (dias === 0) return { dias: 0, ms: 0, texto: 'hoje' };
    return { dias, ms: dias * DIA_MS, texto: dias === 1 ? 'há 1 dia' : `há ${dias} dias` };
  }
  const ms = Math.max(0, agora.getTime() - c.desdeEm);
  return { dias: Math.floor(ms / DIA_MS), ms, texto: formatarDecorrido(ms) };
}

export function estaDispensada(c: Conversa, contato: Contato | undefined): boolean {
  return contato?.dispensadaAss != null && contato.dispensadaAss === c.ass;
}

export interface Classe {
  naoLida: boolean;
  /** O cliente falou por último e eu devo resposta. */
  precisa: boolean;
  /** Eu falei por último: espero o cliente. */
  aguardando: boolean;
}

export function classificar(c: Conversa, contato: Contato | undefined): Classe {
  const individual = !c.grupo && !c.arquivada;
  return {
    naoLida: c.naoLida && !c.arquivada,
    precisa: individual && c.ultimaDeMim === false && !estaDispensada(c, contato),
    aguardando: individual && c.ultimaDeMim === true,
  };
}

export interface Contagens {
  todas: number;
  naoLidas: number;
  precisa: number;
  aguardando: number;
}

export function contar(conversas: Conversa[], contatoDe: (c: Conversa) => Contato | undefined): Contagens {
  const r: Contagens = { todas: 0, naoLidas: 0, precisa: 0, aguardando: 0 };
  for (const c of conversas) {
    if (c.arquivada) continue;
    r.todas += 1;
    const k = classificar(c, contatoDe(c));
    if (k.naoLida) r.naoLidas += 1;
    if (k.precisa) r.precisa += 1;
    if (k.aguardando) r.aguardando += 1;
  }
  return r;
}

export interface FiltroLista {
  aba: AbaId;
  /** Filtro de uma aba de funil ou personalizada (ids de etiqueta ou "fase:<id>"; basta um bater). Combina com `etiquetas` por E. */
  abaFiltro?: string[];
  /** Esconde grupos. */
  ocultarGrupos?: boolean;
  /** Só na aba "aguardando": mínimo de dias sem resposta. */
  diasSemResposta: number | null;
  /** Ids de etiqueta; vale também "fase:<id>". Vazio = sem filtro. */
  etiquetas: string[];
}

/** O contato tem alguma das etiquetas (ids) ou fases ("fase:<id>") da lista. */
export function contatoTemAlgum(contato: Contato | undefined, itens: readonly string[]): boolean {
  if (!contato) return false;
  return itens.some((e) => (e.startsWith('fase:') ? contato.fase === e.slice(5) : contato.etiquetas.includes(e)));
}

export function passaNoFiltro(c: Conversa, contato: Contato | undefined, f: FiltroLista, agora: Date): boolean {
  if (c.arquivada) return false;
  if (f.ocultarGrupos && c.grupo) return false;
  const k = classificar(c, contato);
  let ok: boolean;
  switch (f.aba) {
    case 'todas':
      ok = true;
      break;
    case 'naoLidas':
      ok = k.naoLida;
      break;
    case 'precisa':
      ok = k.precisa;
      break;
    case 'aguardando':
      ok = k.aguardando && (f.diasSemResposta == null || idadeDaUltima(c, agora).dias >= f.diasSemResposta);
      break;
  }
  if (!ok) return false;
  if (f.abaFiltro && !contatoTemAlgum(contato, f.abaFiltro)) return false;
  if (f.etiquetas.length > 0 && !contatoTemAlgum(contato, f.etiquetas)) return false;
  return true;
}

export function rotuloDaAba(id: AbaId): string {
  return ABAS.find((a) => a.id === id)?.rotulo ?? id;
}

/**
 * Sinais de que a leitura da lista está quebrada (o WhatsApp mudou o HTML). Sem eles, uma
 * lista inteira "do cliente" pareceria dever resposta em todas as conversas.
 */
export function diagnosticoDaLeitura(conversas: Conversa[]): string[] {
  const individuais = conversas.filter((c) => !c.grupo && !c.arquivada);
  const avisos: string[] = [];
  if (individuais.length >= 15 && !individuais.some((c) => c.ultimaDeMim === true)) {
    avisos.push('Não reconheci nenhuma mensagem sua na lista: "Precisa de resposta" pode estar inflada (ícone de entrega não encontrado).');
  }
  if (individuais.length >= 15 && individuais.every((c) => c.dataMsg == null)) {
    avisos.push('Não reconheci a data de nenhuma conversa: o tempo decorrido vem só do que a extensão viu.');
  }
  return avisos;
}

/** Contato de cliente = nome salvo com "cliente" (sem diferenciar maiúsculas/acentos). Só esses ganham a faixa do CRM. */
export function ehContatoCliente(nome: string | null | undefined): boolean {
  return /cliente/i.test((nome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
}
