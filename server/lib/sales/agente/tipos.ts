// Tipos do vendedor virtual: cartões (dado crítico escrito pelo SERVIDOR) e ações (efeitos que a
// camada de IO executa depois do turno). Nada aqui toca banco nem rede.
import type { ExceptionKind, ExceptionSeverity } from '../../../../shared/sales';

export type PerfilAgente = 'revenda' | 'consumo' | 'indefinido';

export interface OpcaoFreteCard { nome: string; precoCentavos: number; precoTexto: string; prazo: string }

export type Card =
  | { tipo: 'preco'; produto: string; precoCentavos: number; precoTexto: string; nota: string }
  | { tipo: 'frete'; cepMascarado: string; quantidadeCaixas: number; opcoes: OpcaoFreteCard[]; nota: string }
  | { tipo: 'disponibilidade'; texto: string }
  | { tipo: 'comparativo'; quantidadeCaixas: number; site: { produtoTexto: string; freteTexto: string; totalTexto: string; servico: string }; mercadoLivre: { freteTexto: string; referenciaTexto: string | null }; nota: string }
  | { tipo: 'simulacao'; linhas: Array<{ rotulo: string; valor: string }>; resultadoTexto: string; resultadoPositivo: boolean; aviso: string }
  | { tipo: 'link'; url: string; rotulo: string; instrucoes: string[] }
  | { tipo: 'aviso'; texto: string };

export type Acao =
  | { tipo: 'excecao'; kind: ExceptionKind; severity: ExceptionSeverity; motivo: string; quantidadeCaixas?: number }
  | { tipo: 'opt_in'; nome: string; empresa: string; email: string };

export interface RegistroFerramenta { nome: string; args: unknown; ok: boolean; resumo: string }

/** `grave`: o texto continha alegação proibida (conta para sinalizar a conversa); não grave = só troca de número/infra. */
export interface Bloqueio { camada: string; motivo: string; textoOriginal: string; grave: boolean }

export interface ResultadoTurno {
  mensagem: string;
  cards: Card[];
  perfil: PerfilAgente | null;
  acoes: Acao[];
  ferramentas: RegistroFerramenta[];
  bloqueios: Bloqueio[];
  /** O pedido foi para uma pessoa (pedido grande ou pedido do visitante). */
  encaminhado: boolean;
  /** O modelo não rodou (pré-filtro, pedido grande): nada a registrar como uso de IA. */
  semModelo: boolean;
}
