// Protocolo entre o painel lateral e o content script do WhatsApp Web.
//
// Não existe pedido "enviar": o envio é sempre do usuário (Enter). O content script só lê a
// lista, abre a conversa, cola o texto e observa se a mensagem saiu.

import type { LinhaBruta } from './contatos';

export type PedidoConteudo =
  | { tipo: 'verificar' }
  | { tipo: 'varrer'; termo: string }
  /** `fotoAntes`: data-id das mensagens de uma tentativa anterior (painel fechado/recarregado). */
  | { tipo: 'abrirEColar'; nome: string; texto: string; fotoAntes?: string[] }
  | { tipo: 'limparCaixa'; texto: string }
  | { tipo: 'pararObservacao' }
  /** Pausa durante "abrindo": o content script desiste e limpa a caixa se já tiver colado. */
  | { tipo: 'cancelarAbertura' }
  /** Envios detectados enquanto o painel estava fechado (e aviso do WhatsApp ainda visível). */
  | { tipo: 'consultarPendencias' }
  | { tipo: 'confirmarPendencias'; ids: string[] };

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

export type RespostaConteudo =
  | {
      ok: true;
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
