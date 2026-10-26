// Protocolo entre o painel lateral e o content script do WhatsApp Web.
//
// Não existe pedido "enviar": o envio é sempre do usuário (Enter). O content script só lê a
// lista, abre a conversa, cola o texto e observa se a mensagem saiu.

import type { LinhaBruta } from './contatos';

export type PedidoConteudo =
  | { tipo: 'verificar' }
  | { tipo: 'varrer'; termo: string }
  | { tipo: 'abrirEColar'; nome: string; texto: string; envioAutomatico?: boolean }
  | { tipo: 'abrirPorTelefone'; telefone: string; nomeDica?: string }
  | { tipo: 'limparCaixa'; texto: string }
  | { tipo: 'pararObservacao' };

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
  | 'ocupado' // outra operação em andamento
  | 'interno';

export type RespostaConteudo =
  | { ok: true; linhas?: LinhaBruta[]; avisos?: string[]; /** abrirPorTelefone: nome da conversa aberta. */ nome?: string }
  | { ok: false; codigo: CodigoErro; erro: string };

/** Pedido da página do WhatsApp ao service worker: abrir o painel lateral (a aba vem pelo pedido gravado na configuração). */
export interface PedidoPainelAberto {
  vz: 'painel';
  aba: 'clientes' | 'dados' | 'lembretes';
}

export function ehPedidoPainelAberto(v: unknown): v is PedidoPainelAberto {
  const x = v as Partial<PedidoPainelAberto> | null;
  return typeof x === 'object' && x !== null && x.vz === 'painel' && (x.aba === 'clientes' || x.aba === 'dados' || x.aba === 'lembretes');
}

/** Eventos espontâneos do content script → painel (chrome.runtime.sendMessage). */
export type EventoConteudo =
  | { tipo: 'vitaZap:envioDetectado'; nome: string; texto: string; textoConfere: boolean }
  | { tipo: 'vitaZap:progressoVarredura'; lidas: number; unicas: number };

export function ehEventoConteudo(v: unknown): v is EventoConteudo {
  if (typeof v !== 'object' || v === null || !('tipo' in v)) return false;
  const tipo = (v as { tipo: unknown }).tipo;
  return tipo === 'vitaZap:envioDetectado' || tipo === 'vitaZap:progressoVarredura';
}

