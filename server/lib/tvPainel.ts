/** Painel da TV é opt-in: só a env `TV_PAINEL_ATIVO=1` liga; qualquer outra coisa deixa `getPanelStatus` sem tocar no banco. */
export const tvPainelLigado = (env: string | undefined): boolean => env === '1';
