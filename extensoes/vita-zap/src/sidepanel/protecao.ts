// Proteções do painel lateral enquanto uma campanha roda (sobretudo com o envio automático opcional ligado):
//
// 1. Fechou ou escondeu o painel (pagehide / visibilitychange) → pausa a campanha na hora.
// 2. Batimento: o painel avisa o content script a cada 10 s que está vivo. Sem batimento por ~45 s o
//    content script não clica (ver PRAZO_BATIMENTO_MS em content/execucao.ts). Se o painel travar ou
//    fechar sem conseguir pausar, o clique agendado simplesmente não acontece.

import type { PedidoConteudo, RespostaConteudo } from '../shared/mensagens';

export const INTERVALO_BATIMENTO_MS = 10_000;

interface PausavelComEstado {
  pausar: (motivo?: string | null) => Promise<void>;
  readonly atual: { fase: string };
}

export const MOTIVO_PAINEL_FECHADO = 'painel fechado ou escondido: campanha pausada por segurança';

/** Liga o pause-ao-fechar. Devolve a função que desliga. */
export function protegerContraFechamento(executor: PausavelComEstado, janela: Window = window, doc: Document = document): () => void {
  const pausarSeRodando = (): void => {
    const fase = executor.atual.fase;
    if (fase === 'parada' || fase === 'concluida') return;
    void executor.pausar(MOTIVO_PAINEL_FECHADO);
  };
  const aoMudarVisibilidade = (): void => {
    if (doc.visibilityState === 'hidden') pausarSeRodando();
  };
  janela.addEventListener('pagehide', pausarSeRodando);
  doc.addEventListener('visibilitychange', aoMudarVisibilidade);
  return () => {
    janela.removeEventListener('pagehide', pausarSeRodando);
    doc.removeEventListener('visibilitychange', aoMudarVisibilidade);
  };
}

/** Manda `batimento` ao content script a cada `intervaloMs`. Devolve a função que para. */
export function iniciarBatimento(
  pedir: (pedido: PedidoConteudo) => Promise<RespostaConteudo>,
  intervaloMs: number = INTERVALO_BATIMENTO_MS,
  agendar: typeof setInterval = setInterval,
  cancelar: typeof clearInterval = clearInterval,
): () => void {
  const id = agendar(() => {
    void pedir({ tipo: 'batimento' }).catch(() => undefined);
  }, intervaloMs);
  return () => cancelar(id);
}
