// Resultado por texto do dono (v0.7.60). Regras PURAS: quantos foram enviados e quantos responderam, por texto.
//
// SÓ LOCAL: nada daqui vai ao servidor (nem o texto, nem a contagem). O texto é identificado pelo HASH do conteúdo (a forma de
// campanha, `{primeiroNome}`), então EDITAR o texto muda o hash e zera a contagem dele (o texto novo é outro texto).
// "Respondeu" = a leitura que o follow-up/reativação já faz da conversa achou resposta do cliente em até 7 dias depois do envio.

import { diferencaDias, hojeNoFuso } from './datas';
import { textoParaModelo } from './followup-estilo';
import { hashTexto } from './hash';

/** Resposta só conta se foi vista em até 7 dias depois do envio. */
export const JANELA_RESPOSTA_DIAS = 7;
/** Abaixo disto a taxa é só um palpite. */
export const AMOSTRA_MINIMA = 20;
/** Quanto tempo o registro de cada envio fica guardado (a janela de resposta já fechou há muito). */
export const MANTER_ENVIOS_DIAS = 120;
/** Tolerância para casar o instante do envio com a referência que o follow-up/reativação guardou. */
export const TOLERANCIA_ENVIO_MS = 15 * 60_000;

/** Um envio de um texto do dono. `id` = `${campanhaId}:${chave}` (o mesmo do registro de envio). */
export interface EnvioDoTexto {
  id: string;
  /** Hash do modelo enviado (ver hashDoModelo). */
  hash: string;
  chave: string;
  enviadoEm: string;
  respondeuEm: string | null;
}

/** Espaços colapsados: o mesmo texto com espaços diferentes é o mesmo texto. */
export const hashDoModelo = (modelo: string): string => hashTexto(modelo.replace(/\s+/g, ' ').trim());

/** O texto como o dono o escreve no editor (`{nome}`) → o hash do modelo que vai no item da campanha (`{primeiroNome}`). */
export const hashDoTextoDoDono = (texto: string): string => hashDoModelo(textoParaModelo(texto));

export interface ResultadoDoTexto {
  enviados: number;
  responderam: number;
  /** null enquanto não há envio. */
  percentual: number | null;
  amostraPequena: boolean;
}

export function resultadoDoTexto(envios: ReadonlyArray<EnvioDoTexto>, hash: string): ResultadoDoTexto {
  let enviados = 0;
  let responderam = 0;
  for (const e of envios) {
    if (e.hash !== hash) continue;
    enviados += 1;
    if (e.respondeuEm != null) responderam += 1;
  }
  return { enviados, responderam, percentual: enviados > 0 ? Math.round((responderam / enviados) * 100) : null, amostraPequena: enviados < AMOSTRA_MINIMA };
}

/** "enviado 42 · respondeu 9 (21%)". Texto ainda sem envio: null (o editor não mostra nada). */
export function rotuloDoResultado(r: ResultadoDoTexto): string | null {
  if (r.enviados === 0) return null;
  return `enviado ${r.enviados} · respondeu ${r.responderam} (${r.percentual}%)`;
}

export const AVISO_AMOSTRA_PEQUENA = `amostra pequena (menos de ${AMOSTRA_MINIMA} envios): ainda não dá para comparar com outros textos`;

/**
 * Qual envio a leitura de resposta se refere? Pelo id exato, se há; senão o envio do mesmo contato mais próximo da referência
 * (o instante da mensagem que o follow-up/reativação esperava resposta), dentro da tolerância.
 */
export function acharEnvioDaResposta(envios: ReadonlyArray<EnvioDoTexto>, alvo: { id?: string; chave: string; referencia: string }): EnvioDoTexto | null {
  if (alvo.id) {
    const exato = envios.find((e) => e.id === alvo.id);
    if (exato) return exato;
  }
  const ref = new Date(alvo.referencia).getTime();
  if (!Number.isFinite(ref)) return null;
  let melhor: EnvioDoTexto | null = null;
  let distancia = Infinity;
  for (const e of envios) {
    if (e.chave !== alvo.chave) continue;
    const d = Math.abs(new Date(e.enviadoEm).getTime() - ref);
    if (d <= TOLERANCIA_ENVIO_MS && d < distancia) {
      melhor = e;
      distancia = d;
    }
  }
  return melhor;
}

/** Marca a resposta (uma vez só, e só dentro da janela de 7 dias). Devolve o envio atualizado ou null se nada muda. */
export function comResposta(e: EnvioDoTexto, agora: Date): EnvioDoTexto | null {
  if (e.respondeuEm != null) return null;
  if (diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(e.enviadoEm))) > JANELA_RESPOSTA_DIAS) return null;
  return { ...e, respondeuEm: agora.toISOString() };
}

/** Ids dos envios velhos demais para guardar. */
export function idsParaPodarEnvios(envios: ReadonlyArray<EnvioDoTexto>, agora: Date): string[] {
  return envios.filter((e) => diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(e.enviadoEm))) > MANTER_ENVIOS_DIAS).map((e) => e.id);
}
