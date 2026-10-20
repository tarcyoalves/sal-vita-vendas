// Permissão do modo automático dentro do content script: um "contrato de aluguel" curto.
//
// O painel renova a permissão (pedido `modoAutomatico`) a cada contato do automático e a revoga
// ao desligar/pausar. Se o painel fechar, a permissão expira sozinha em `validadeModoMs` e nada
// mais pode ser acionado. Estado só em memória: recarregar a aba o apaga.

import { AUTO } from '../shared/constantes';

let validoAte = 0;

export function definirModoAutomatico(ligado: boolean, agora: number = Date.now()): void {
  validoAte = ligado ? agora + AUTO.validadeModoMs : 0;
}

export function modoAutomaticoLigado(agora: number = Date.now()): boolean {
  return agora < validoAte;
}
