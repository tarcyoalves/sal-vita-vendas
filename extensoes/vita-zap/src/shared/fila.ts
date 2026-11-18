// Prioridade e previsão da fila dos automáticos (v0.7.59). Regras PURAS.
//
// O teto diário é COMPARTILHADO entre todas as mensagens automáticas e as campanhas. Ordem FIXA de prioridade (decisão do dono):
//   1. cobrança de quem não respondeu a campanha (follow-up);
//   2. reativação, etapas 2 e 3 (quem já recebeu a anterior e não respondeu);
//   3. reativação, etapa 1 (quem está parado há 25+ dias);
//   4. campanhas comuns pendentes: seguem como sempre, só saem quando o dono as inicia (não entram na previsão).
// A previsão responde: "hoje saem até N (teto X, já saíram Y); ficam Z na fila para os próximos dias".

import type { Followup } from './followup';
import type { Reativacao } from './reativacao';

export type GrupoDaFila = 'cobranca' | 'reativacao_2_3' | 'reativacao_1';

/** A ordem documentada: índice menor = sai primeiro. */
export const ORDEM_DA_FILA: readonly GrupoDaFila[] = ['cobranca', 'reativacao_2_3', 'reativacao_1'];
export const ROTULO_GRUPO: Record<GrupoDaFila, string> = {
  cobranca: '1. Cobrança de quem não respondeu',
  reativacao_2_3: '2. Reativação, etapas 2 e 3',
  reativacao_1: '3. Reativação, etapa 1',
};

/** Etapa da mensagem que o contato da reativação vai receber (1, 2 ou 3). */
export const etapaDoPronto = (r: Pick<Reativacao, 'etapa' | 'textoPronto'>): number => r.textoPronto?.etapa ?? r.etapa + 1;

/** Reativação: etapas 2 e 3 antes da etapa 1; dentro do grupo, a conversa mais antiga primeiro (o histórico que está para sumir). */
export function compararProntosDaReativacao(a: Reativacao, b: Reativacao): number {
  const ga = etapaDoPronto(a) >= 2 ? 0 : 1;
  const gb = etapaDoPronto(b) >= 2 ? 0 : 1;
  if (ga !== gb) return ga - gb;
  return a.baseConversa.localeCompare(b.baseConversa);
}

export interface PrevisaoDaFila {
  teto: number;
  jaSairamHoje: number;
  /** Vagas que sobram hoje no teto. */
  vagasHoje: number;
  /** Quantos saem hoje (no máximo): o menor entre a fila e as vagas. */
  saemHoje: number;
  /** Quantos ficam para os próximos dias. */
  ficam: number;
  porGrupo: Record<GrupoDaFila, number>;
  /** Por grupo, quantos saem hoje (respeitando a prioridade). */
  hojePorGrupo: Record<GrupoDaFila, number>;
  /** Campanhas comuns ainda com itens pendentes (só saem quando o dono inicia: não entram na conta). */
  comunsPendentes: number;
}

export function contarFila(followups: ReadonlyArray<Followup>, reativacoes: ReadonlyArray<Reativacao>): Record<GrupoDaFila, number> {
  const prontos = reativacoes.filter((r) => r.estado === 'pronto' && r.textoPronto != null);
  return {
    cobranca: followups.filter((f) => f.estado === 'cobranca' && f.cobrancaModelo != null).length,
    reativacao_2_3: prontos.filter((r) => etapaDoPronto(r) >= 2).length,
    reativacao_1: prontos.filter((r) => etapaDoPronto(r) < 2).length,
  };
}

export function preverFila(porGrupo: Record<GrupoDaFila, number>, teto: number, jaSairamHoje: number, comunsPendentes = 0): PrevisaoDaFila {
  const vagasHoje = Math.max(0, teto - jaSairamHoje);
  const total = ORDEM_DA_FILA.reduce((s, g) => s + porGrupo[g], 0);
  let resta = vagasHoje;
  const hojePorGrupo = { cobranca: 0, reativacao_2_3: 0, reativacao_1: 0 } as Record<GrupoDaFila, number>;
  for (const g of ORDEM_DA_FILA) {
    hojePorGrupo[g] = Math.min(porGrupo[g], resta);
    resta -= hojePorGrupo[g];
  }
  const saemHoje = ORDEM_DA_FILA.reduce((s, g) => s + hojePorGrupo[g], 0);
  return { teto, jaSairamHoje, vagasHoje, saemHoje, ficam: total - saemHoje, porGrupo, hojePorGrupo, comunsPendentes };
}

export function textoDaPrevisao(p: PrevisaoDaFila): string {
  return `Hoje saem até ${p.saemHoje} (teto ${p.teto}, já saíram ${p.jaSairamHoje}); ficam ${p.ficam} na fila para os próximos dias.`;
}

/**
 * A reativação espera a cobrança: enquanto houver cobrança na fila e o follow-up estiver mandando de verdade (modo Ligado e sem
 * pausa), a reativação NÃO começa um envio. Assim a ordem 1 → 2 → 3 vale também entre as duas abas.
 */
export function reativacaoDeveEsperar(followup: { automatico: string; pausado: boolean }, cobrancasNaFila: number): boolean {
  return followup.automatico === 'ligado' && !followup.pausado && cobrancasNaFila > 0;
}
