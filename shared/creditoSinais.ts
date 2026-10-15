// Apresentação dos pontos de atenção (SinalCredito), usada pelo PDF e pelas telas: mesma ordem e mesmos rótulos.
import type { NivelSinal, SinalCredito } from './credito';

export const ORDEM_NIVEL_SINAL: Record<NivelSinal, number> = { ALERTA: 0, ATENCAO: 1, POSITIVO: 2 };
export const ROTULO_NIVEL_SINAL: Record<NivelSinal, string> = { ALERTA: 'Alerta', ATENCAO: 'Atenção', POSITIVO: 'Positivo' };

/** ALERTA, depois ATENCAO, depois POSITIVO; dentro do mesmo nível, a ordem original. */
export function ordenarSinais(sinais: readonly SinalCredito[]): SinalCredito[] {
  return sinais
    .map((s, i) => ({ s, i }))
    .sort((a, b) => ORDEM_NIVEL_SINAL[a.s.nivel] - ORDEM_NIVEL_SINAL[b.s.nivel] || a.i - b.i)
    .map((x) => x.s);
}
