// Geração do content script. O painel pode reinjetar content.js numa aba que já o tem (extensão
// atualizada). Cada injeção ganha um número de geração; os ouvintes das gerações antigas
// continuam registrados no Chrome (não dá para removê-los de fora), mas passam a IGNORAR os
// pedidos — só a geração atual responde. A injeção nova também encerra o que a antiga deixou
// rodando (observação, vigia) e herda os envios detectados que ninguém recebeu.

import type { PendenciaEnvio } from '../shared/mensagens';

export interface EstadoGlobal {
  geracao: number;
  /** Encerra o que a geração anterior deixou rodando. */
  encerrar: (() => void) | null;
  /** Envios percebidos sem painel aberto, à espera do pedido `consultarPendencias`. */
  pendencias: PendenciaEnvio[];
}

declare global {
  interface Window {
    __vitaZap?: EstadoGlobal;
  }
}

export interface Geracao {
  minha: number;
  estado: EstadoGlobal;
  /** Esta injeção ainda é a mais nova? Ouvintes antigos devolvem false e ignoram o pedido. */
  atual: () => boolean;
}

export function assumirGeracao(encerrarEsta: () => void, janela: Window = window): Geracao {
  const estado = (janela.__vitaZap ??= { geracao: 0, encerrar: null, pendencias: [] });
  try {
    estado.encerrar?.();
  } catch {
    // a geração antiga pode estar quebrada; seguimos
  }
  estado.geracao += 1;
  const minha = estado.geracao;
  estado.encerrar = encerrarEsta;
  return { minha, estado, atual: () => estado.geracao === minha };
}
