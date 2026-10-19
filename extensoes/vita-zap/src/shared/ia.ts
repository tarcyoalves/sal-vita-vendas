// Interface da IA — FASE 2. Nada disto está ligado na fase 1.
//
// Decisão do dono (19/10/2026): a IA será a API Gemini, chamada por um PROXY NO SERVIDOR.
// A chave NUNCA fica na extensão: qualquer pessoa extrai uma chave de uma extensão instalada.
// A extensão manda ao proxy só um token pessoal revogável, o primeiro nome e o texto
// necessário — nunca telefone (LGPD, docs/PLANO-CAMPANHAS-WHATSAPP.md, seção 7).
//
// Toda saída da IA será validada (zod) e mostrada na prévia; a IA nunca executa nada sozinha.

import type { Filtros } from './filtros';

/** Ordem em português convertida em plano (seção 3.1 do plano). */
export interface PlanoCampanha {
  filtros: Filtros;
  termoBusca: string;
  mensagemBase: string;
  quantidadeVariacoes: number;
  /** Perguntas quando falta informação ("de quando?") — o painel pergunta em vez de adivinhar. */
  perguntas: string[];
}

export type ClasseResposta =
  | 'interessado'
  | 'pediu_preco'
  | 'tem_estoque'
  | 'compra_depois'
  | 'reclamacao'
  | 'pediu_para_sair'
  | 'sem_relacao';

export interface ProvedorIA {
  readonly disponivel: boolean;
  interpretarOrdem(ordem: string): Promise<PlanoCampanha>;
  gerarVariacoes(textoBase: string, quantidade: number): Promise<string[]>;
  classificarResposta(primeiroNome: string, textoResposta: string): Promise<{ classe: ClasseResposta; sugestao: string }>;
}

function naoDisponivel(): never {
  throw new Error('IA ainda não disponível (fase 2: proxy no servidor).');
}

/** Implementação da fase 1: desligada. */
export const IA_DESLIGADA: ProvedorIA = {
  disponivel: false,
  interpretarOrdem: async () => naoDisponivel(),
  gerarVariacoes: async () => naoDisponivel(),
  classificarResposta: async () => naoDisponivel(),
};
