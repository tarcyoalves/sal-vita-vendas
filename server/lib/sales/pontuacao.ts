// Pontuação comercial do lead (0–100). Separada da elegibilidade: score alto não autoriza contato.
// Pura. Cada ponto tem um motivo legível, para o painel e o relatório do Hermes.
import type { FonteEmail } from './elegibilidade';
import { ehInstitucional, ehWebmail } from './elegibilidade';
import type { PremiumSegmentKey } from '../../../shared/radarPremium';

export const PONTUACAO_VERSAO = 'score-2026-11-28a';

export interface EntradaPontuacao {
  segmentos: string[];
  /** Evidências de compatibilidade (ex.: "nome contém 'empório'", "site menciona granel"). */
  evidencias: string[];
  email: string | null;
  fonteEmail: FonteEmail | null;
  temSite: boolean;
  uf: string | null;
  ufsDaOnda: string[];
}

/** Peso de cada segmento Premium (chaves de shared/radarPremium.ts). Desconhecido = 5. */
export const PESO_SEGMENTO: Record<PremiumSegmentKey, number> = {
  loja_natural: 30,
  granel_cerealista: 30,
  mercado_natural: 22,
  restaurante_saudavel: 18,
  marmita_saudavel: 18,
  temperos_especiarias: 15,
  padaria_artesanal: 12,
  conservas: 10,
  // Público ampliado pelo dono em 28/11/2026. Suplementos: venda boa, mas é o segmento de MAIOR risco de
  // alegação de saúde na conversa; o texto para eles fala só de origem, processo e sabor.
  suplementos: 26,
  churrascaria: 14,
  minimercado: 14,
  acougue_casa_de_carnes: 12,
  hortifruti: 8,
  peixaria: 8,
};

const pesoDe = (s: string): number => (s in PESO_SEGMENTO ? PESO_SEGMENTO[s as PremiumSegmentKey] : 5);

export function pontuar(e: EntradaPontuacao): { score: number; motivos: string[]; versao: string } {
  const motivos: string[] = [];
  let score = 0;

  const melhorSegmento = Math.max(0, ...e.segmentos.map(pesoDe));
  if (melhorSegmento > 0) { score += melhorSegmento; motivos.push(`segmento (+${melhorSegmento})`); }

  const ev = Math.min(e.evidencias.length, 4) * 5;
  if (ev > 0) { score += ev; motivos.push(`${Math.min(e.evidencias.length, 4)} evidência(s) de compatibilidade (+${ev})`); }

  if (e.email) {
    if (e.fonteEmail === 'site' || e.fonteEmail === 'maps') { score += 15; motivos.push('e-mail publicado pela empresa (+15)'); }
    else if (e.fonteEmail !== 'receita') { score += 8; motivos.push('e-mail com origem pública (+8)'); }
    if (ehInstitucional(e.email)) { score += 10; motivos.push('caixa institucional (+10)'); }
    else if (ehWebmail(e.email)) { score += 2; motivos.push('webmail (+2)'); }
  }
  if (e.temSite) { score += 10; motivos.push('tem site (+10)'); }
  if (e.uf && e.ufsDaOnda.includes(e.uf)) { score += 10; motivos.push('estado da onda atual (+10)'); }

  return { score: Math.min(100, score), motivos, versao: PONTUACAO_VERSAO };
}
