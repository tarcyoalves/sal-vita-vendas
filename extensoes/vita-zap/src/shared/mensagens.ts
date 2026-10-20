// Protocolo entre o painel lateral e o content script do WhatsApp Web.
//
// Modo manual (padrão): não existe pedido de envio; o envio é do usuário (Enter). O content
// script só lê a lista, abre a conversa, cola o texto e observa se a mensagem saiu.
// Modo automático (0.3.0, opcional): o ÚNICO pedido que aciona o envio é `enviarAutomatico`, que
// exige um token de autorização do painel (por envio) e o modo automático ligado.

import type { TokenEnvio } from './automatico';
import type { LinhaBruta } from './contatos';

export type PedidoConteudo =
  | { tipo: 'verificar' }
  | { tipo: 'varrer'; termo: string }
  /** `fotoAntes`: data-id das mensagens de uma tentativa anterior (painel fechado/recarregado). */
  | { tipo: 'abrirEColar'; nome: string; texto: string; fotoAntes?: string[] }
  | { tipo: 'limparCaixa'; texto: string }
  | { tipo: 'pararObservacao' }
  /** Somente leitura: quais seletores batem e contagens na página (nunca clica nem escreve). */
  | { tipo: 'diagnosticar' }
  /** Pausa durante "abrindo": o content script desiste e limpa a caixa se já tiver colado. */
  | { tipo: 'cancelarAbertura' }
  /** Envios detectados enquanto o painel estava fechado (e aviso do WhatsApp ainda visível). */
  | { tipo: 'consultarPendencias' }
  | { tipo: 'confirmarPendencias'; ids: string[] }
  /** Modo automático: o painel renova (ligado) ou revoga (desligado) a permissão do content script. */
  | { tipo: 'modoAutomatico'; ligado: boolean }
  /** Modo automático: aciona o envio da mensagem JÁ colada, se o token e o modo valerem. */
  | { tipo: 'enviarAutomatico'; nome: string; texto: string; campanhaId: string; jid: string | null; token: TokenEnvio };

export type CodigoErro =
  | 'seletor' // estrutura do WhatsApp Web não reconhecida → falha fechada, pausa tudo
  | 'nao_pronto' // WhatsApp Web não carregado / sem login
  | 'nao_encontrado' // contato não apareceu na busca
  | 'ambiguo' // mais de uma conversa com o mesmo nome
  | 'grupo' // a conversa aberta é grupo/transmissão
  | 'nao_confirmado' // não deu para confirmar que é conversa individual
  | 'cabecalho' // a conversa aberta não é a do contato
  | 'caixa_ocupada' // já havia rascunho na caixa (não sobrescrevemos)
  | 'colar_falhou' // o texto não ficou na caixa
  | 'ja_enviada' // já existe mensagem nossa nova nesta conversa (retomada): não colar de novo
  | 'usuario_digitando' // o foco está num campo com texto do usuário: não mexemos
  | 'texto_invalido' // o texto não passa na validação (link, tamanho, quebra de linha)
  | 'cancelado' // pausado durante a abertura
  | 'envio_nao_autorizado' // automático: token ausente/expirado/usado/de outro envio, ou modo desligado
  | 'texto_alterado' // automático: o texto da caixa não é mais exatamente o colado
  | 'aviso_whatsapp' // automático: o WhatsApp mostra um aviso — não envia
  | 'botao_enviar_ausente' // automático: botão de enviar do rodapé não encontrado
  | 'envio_nao_confirmado' // automático: clique dado, mas a mensagem não foi percebida em 20 s
  | 'ocupado' // outra operação em andamento
  | 'interno';

/** Mensagem nossa percebida pelo content script. */
export interface PendenciaEnvio {
  id: string;
  nome: string;
  texto: string;
  textoConfere: boolean;
  jid: string | null;
  detectadoEm: string; // ISO
}

/** Resultado de um seletor: qual alternativa casou (null = nenhuma) e quantos elementos. */
export interface SeletorDiagnosticado {
  chave: string;
  casou: string | null;
  quantidade: number;
}

/** Retrato SOMENTE LEITURA da página do WhatsApp Web (sem nomes, sem textos de mensagem). */
export interface CaixaBuscaDiagnosticada {
  tag: string;
  role: string | null;
  /** null = atributo ausente; "" = presente e vazio. */
  ariaLabel: string | null;
  dataTab: string | null;
  temTexto: boolean;
}

export interface LinhasMensagemDiagnosticadas {
  /** Mensagens com id (data-id ou data-testid conv-msg-…). */
  convMsg: number;
  /** Quantas têm texto/autor renderizados (selectable-text, copyable-text, msg-container ou msg-meta). */
  renderizadas: number;
  /** Autores distintos dos data-pre-plain-text, só as 3 primeiras letras (minúsculas, sem repetição). */
  autores: string[];
  /** Elementos de autor DENTRO de linhas de mensagem. */
  elementosAutor: number;
}

export interface DiagnosticoPagina {
  url: string;
  idioma: string;
  seletores: SeletorDiagnosticado[];
  linhasNaLista: number;
  conversaAberta: boolean;
  tituloCabecalho: boolean;
  caixaMensagem: boolean;
  /** Quantos '#main [data-id]' existem e até 8 amostras MASCARADAS (dígitos viram *, menos os 4 últimos de cada bloco). */
  dataIds: { total: number; amostras: string[] };
  /** Atributos (só os nomes) e seletores presentes nas linhas de mensagem, p.ex. "attr:data-pre-plain-text". */
  estruturaMensagem: string[];
  /** Caixa de busca da lista: atributos que a identificam e se tem texto (nunca o texto). null = não achada. */
  caixaBusca: CaixaBuscaDiagnosticada | null;
  /** Linhas de mensagem (conversa virtualizada): quantas têm id, quantas estão renderizadas por completo e autores (3 primeiras letras). */
  linhasMensagem: LinhasMensagemDiagnosticadas;
  /** Resultado da classificação da conversa aberta e os sinais usados (sem nomes). */
  classificacao: { tipo: string; iconeGrupo: boolean; recebidas: number; enviadas: number; recebidasComAutor: number; autoresDistintos: number; autorIgualAoTitulo: boolean | null; elementoAutor: boolean };
}

export type RespostaConteudo =
  | {
      ok: true;
      diagnostico?: DiagnosticoPagina;
      linhas?: LinhaBruta[];
      avisos?: string[];
      /** abrirEColar: data-id das mensagens ANTES de colar (a "foto"). */
      foto?: string[];
      jid?: string | null;
      pendencias?: PendenciaEnvio[];
      /** consultarPendencias: aviso do WhatsApp ainda visível (desconexão, restrição…). */
      avisoWhatsApp?: string | null;
    }
  | { ok: false; codigo: CodigoErro; erro: string; /** ja_enviada: texto da mensagem nova. */ texto?: string; jid?: string | null };

/** Eventos espontâneos do content script → painel (chrome.runtime.sendMessage). */
export type EventoConteudo =
  | { tipo: 'vitaZap:envioDetectado'; id?: string; nome: string; texto: string; textoConfere: boolean; jid?: string | null; detectadoEm?: string }
  | { tipo: 'vitaZap:progressoVarredura'; lidas: number; unicas: number }
  /** A observação de 30 min terminou sem perceber o envio. */
  | { tipo: 'vitaZap:observacaoExpirou'; nome: string }
  /** O WhatsApp mostrou um aviso (telefone desconectado, restrição, falha de envio…). */
  | { tipo: 'vitaZap:aviso'; texto: string };

const TIPOS_EVENTO = new Set(['vitaZap:envioDetectado', 'vitaZap:progressoVarredura', 'vitaZap:observacaoExpirou', 'vitaZap:aviso']);

export function ehEventoConteudo(v: unknown): v is EventoConteudo {
  if (typeof v !== 'object' || v === null || !('tipo' in v)) return false;
  const tipo = (v as { tipo: unknown }).tipo;
  return typeof tipo === 'string' && TIPOS_EVENTO.has(tipo);
}
