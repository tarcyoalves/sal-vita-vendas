// Abas da barra superior: fixas (Todas, Não lidas, Aguardando, Precisa), de funil (uma por fase) e as
// personalizadas do usuário. Regras puras: sem DOM, sem storage.

import { contar, contatoTemAlgum, type FiltroLista } from './crm-regras';
import { FASES, type AbaId, type AbaPersonalizada, type ConfigCrm, type Contato, type Conversa } from './crm-tipos';

export interface DefAba {
  id: string;
  rotulo: string;
  tipo: 'fixa' | 'funil' | 'personalizada';
  /** Cor da fase (só no funil). */
  cor?: string;
  dica?: string;
}

/** Ordem da barra superior. */
export const ABAS_FIXAS: ReadonlyArray<DefAba> = [
  { id: 'todas', rotulo: 'Todas', tipo: 'fixa' },
  { id: 'naoLidas', rotulo: 'Não lidas', tipo: 'fixa' },
  { id: 'aguardando', rotulo: 'Aguardando resposta', tipo: 'fixa', dica: 'Você falou por último' },
  { id: 'precisa', rotulo: 'Precisa de resposta', tipo: 'fixa', dica: 'O cliente falou por último (sem grupos nem arquivadas)' },
];

export const idDaFase = (fase: string): string => `fase:${fase}`;
export const idDaPersonalizada = (id: string): string => `p:${id}`;

export const ABAS_DE_FUNIL: ReadonlyArray<DefAba> = FASES.map((f) => ({ id: idDaFase(f.id), rotulo: f.rotulo, tipo: 'funil' as const, cor: f.cor, dica: `Conversas na fase ${f.rotulo}` }));

/** Todas as abas que existem (as escondidas também), na ordem em que aparecem. */
export function todasAsAbas(config: ConfigCrm): DefAba[] {
  const proprias = (config.abasPersonalizadas ?? []).map<DefAba>((a) => ({ id: idDaPersonalizada(a.id), rotulo: a.nome, tipo: 'personalizada' }));
  return [...ABAS_FIXAS, ...ABAS_DE_FUNIL, ...proprias];
}

/** "Todas" nunca some: é o caminho de volta ao normal. */
export function abasVisiveis(config: ConfigCrm): DefAba[] {
  const ocultas = new Set(config.abasOcultas ?? []);
  return todasAsAbas(config).filter((a) => a.id === 'todas' || !ocultas.has(a.id));
}

export function personalizadaDaAba(config: ConfigCrm, id: string): AbaPersonalizada | undefined {
  return id.startsWith('p:') ? (config.abasPersonalizadas ?? []).find((a) => idDaPersonalizada(a.id) === id) : undefined;
}

/** Ids de etiqueta e "fase:<id>" que definem uma aba de funil/personalizada; null = aba fixa (ou que não existe mais). */
export function itensDaAba(config: ConfigCrm, id: string): string[] | null {
  if (id.startsWith('fase:')) return FASES.some((f) => idDaFase(f.id) === id) ? [id] : null;
  const p = personalizadaDaAba(config, id);
  return p ? [...p.etiquetas, ...p.fases.map(idDaFase)] : null;
}

/** A aba ativa de verdade: uma aba apagada ou escondida volta para "Todas". `soFixas` = layout antigo, que só tem as 4 abas fixas. */
export function abaEfetiva(config: ConfigCrm, soFixas = false): string {
  const id = config.aba;
  const visiveis = soFixas ? ABAS_FIXAS : abasVisiveis(config);
  return visiveis.some((a) => a.id === id) ? id : 'todas';
}

/** Filtro das linhas da lista para a configuração atual (aba ativa + chip de etiquetas + ocultar grupos). */
export function filtroDaConfig(config: ConfigCrm, soFixas = false): FiltroLista {
  const id = abaEfetiva(config, soFixas);
  const itens = itensDaAba(config, id);
  const fixa: AbaId = id === 'naoLidas' || id === 'precisa' || id === 'aguardando' ? id : 'todas';
  return {
    aba: fixa,
    diasSemResposta: config.diasSemResposta,
    etiquetas: config.filtroEtiquetas,
    ...(itens ? { abaFiltro: itens } : {}),
    ...(config.ocultarGrupos ? { ocultarGrupos: true } : {}),
  };
}

/** O filtro esconde alguma linha? (Com "Todas" sem etiquetas nem ocultar grupos, a lista fica como o WhatsApp mostra.) */
export function filtroLigado(f: FiltroLista): boolean {
  return f.aba !== 'todas' || f.etiquetas.length > 0 || f.abaFiltro != null || f.ocultarGrupos === true;
}

/** Quantas conversas há em cada aba (arquivadas nunca contam; grupos só se não estiverem ocultos). */
export function contarAbas(conversas: Conversa[], contatoDe: (c: Conversa) => Contato | undefined, config: ConfigCrm): Record<string, number> {
  const base = config.ocultarGrupos ? conversas.filter((c) => !c.grupo) : conversas;
  const c = contar(base, contatoDe);
  const r: Record<string, number> = { todas: c.todas, naoLidas: c.naoLidas, precisa: c.precisa, aguardando: c.aguardando };
  for (const aba of todasAsAbas(config)) {
    const itens = aba.tipo === 'fixa' ? null : itensDaAba(config, aba.id);
    if (!itens) continue;
    r[aba.id] = base.filter((x) => !x.arquivada && contatoTemAlgum(contatoDe(x), itens)).length;
  }
  return r;
}

/** Ponto verde: a aba tem mais conversas do que na última vez que o usuário olhou (base). */
export function temNovidade(contagem: number, base: number | undefined): boolean {
  return base != null && contagem > base;
}
