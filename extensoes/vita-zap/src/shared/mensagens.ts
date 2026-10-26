// Protocolo entre o painel lateral e o content script do WhatsApp Web.
//
// Envio manual por padrão: o content script abre a conversa, cola o texto e observa se a mensagem
// saiu; quem aperta Enter é o usuário. O envio automático é OPCIONAL (`envioAutomatico` no pedido
// abrirEColar, desligado por padrão) e vive isolado em content/envio-humano.ts, com reconferência
// imediatamente antes do clique e confirmação depois. Não existe pedido "enviar" avulso.

import type { LinhaBruta } from './contatos';

export type PedidoConteudo =
  | { tipo: 'verificar' }
  | { tipo: 'varrer'; termo: string }
  | { tipo: 'abrirEColar'; nome: string; texto: string; envioAutomatico?: boolean }
  | { tipo: 'abrirPorTelefone'; telefone: string; nomeDica?: string }
  | { tipo: 'limparCaixa'; texto: string }
  | { tipo: 'pararObservacao' }
  | { tipo: 'pararVarredura' }
  /** Batimento do painel: sem ele por ~45 s o content script não clica no envio automático. */
  | { tipo: 'batimento' }
  /** Abre a conversa e diz se há mensagem NOSSA nova (id fora de `idsAntes`) com exatamente `texto`. Só leitura. */
  | { tipo: 'consultarEnvio'; nome: string; texto: string; idsAntes: string[] | null };

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
  | 'botao_enviar_ausente' // envio automático: sem botão Enviar confiável (nunca cai no microfone)
  | 'ocupado' // outra operação em andamento
  | 'interno';

export type RespostaConteudo =
  | {
      ok: true;
      linhas?: LinhaBruta[];
      avisos?: string[];
      /** abrirPorTelefone: nome da conversa aberta. */
      nome?: string;
      /** abrirEColar: ids das mensagens da conversa antes de colar (para o marcador "em voo"). */
      idsAntes?: string[];
      /** limparCaixa: true só se o texto era exatamente o nosso e foi apagado agora. */
      limpou?: boolean;
      /** consultarEnvio: saiu uma mensagem nossa nova com o texto? */
      situacao?: 'enviado' | 'nao_encontrado';
    }
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
  /** Envio automático cancelado ANTES do clique (reconferência falhou, sem botão, painel sumiu). Nada foi clicado. */
  | { tipo: 'vitaZap:envioBloqueado'; nome: string; codigo: 'reconferencia_falhou' | 'botao_enviar_ausente' | 'painel_ausente'; motivo: string; limpou: boolean }
  /** Clique feito, mas o detector não viu a mensagem sair em 20 s. Pode ter saído: conferir. */
  | { tipo: 'vitaZap:envioNaoConfirmado'; nome: string; motivo: string }
  /** O observador desistiu (30 min sem ver a mensagem sair). */
  | { tipo: 'vitaZap:observacaoExpirada'; nome: string }
  | { tipo: 'vitaZap:progressoVarredura'; lidas: number; unicas: number };

export function ehEventoConteudo(v: unknown): v is EventoConteudo {
  if (typeof v !== 'object' || v === null || !('tipo' in v)) return false;
  const tipo = (v as { tipo: unknown }).tipo;
  return (
    tipo === 'vitaZap:envioDetectado' ||
    tipo === 'vitaZap:envioBloqueado' ||
    tipo === 'vitaZap:envioNaoConfirmado' ||
    tipo === 'vitaZap:observacaoExpirada' ||
    tipo === 'vitaZap:progressoVarredura'
  );
}

