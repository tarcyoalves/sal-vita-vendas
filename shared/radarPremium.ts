// Radar — perfil "Premium": empresas que podem comprar a CAIXA de 10 kg de sal marinho
// (lojas de produtos naturais, empórios, granel/cerealistas, restaurantes saudáveis,
// marmitas fit, padarias artesanais, fábricas de temperos e de conservas, lojas de suplementos,
// churrascarias e — opt-in, por volume — minimercados, açougues, peixarias e hortifrútis).
//
// É um perfil À PARTE do Radar de Cargas (`RADAR_SEGMENTS` em shared/radar.ts): nada daqui
// entra em `RADAR_ALL_CNAES`, e a tela/roteador de cargas nunca mostra quem só casa aqui
// (ver server/lib/radar/cargoScope.ts).
//
// Todos os códigos abaixo foram conferidos em 2026-11-28 na API oficial do IBGE
// (https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/<7 dígitos>); a descrição oficial
// está no comentário de cada código. Código que a API não devolveu foi descartado
// (ex.: 4721101 não existe).
//
// CNAE genérico (loja de alimentos "em geral", minimercado, restaurante) tem milhares de
// empresas que não têm nada a ver com o perfil. Por isso o segmento marca
// `requiresNameMatch: true`: só vale se o nome fantasia OU a razão social tiver uma das
// palavras-chave do segmento (sem acento, sem diferenciar maiúsculas, palavra inteira).

/** Palavras-chave de nome. O padrão é aplicado ao texto JÁ normalizado (sem acento,
 * minúsculo, só letras/dígitos separados por 1 espaço) e sempre como palavra inteira. */
export const PREMIUM_KEYWORDS = {
  natural: 'natural|naturais|natureba|naturebas',
  emporio: 'emporio|emporios',
  granel: 'granel|graneis',
  integral: 'integral|integrais',
  organico: 'organico|organica|organicos|organicas',
  saudavel: 'saudavel|saudaveis',
  vegano: 'vegano|vegana|veganos|veganas|vegetariano|vegetariana|vegetarianos|vegetarianas',
  // "fit" só como palavra inteira: "fitness" e "crossfit" NÃO casam.
  fit: 'fit',
  light: 'light|lowcarb|low carb|funcional|funcionais',
  nutri: 'nutri|nutricao|nutricional|nutrition',
  cerealista: 'cerealista|cerealistas|cereal|cereais',
  graos: 'grao|graos',
  temperos: 'tempero|temperos|especiaria|especiarias|condimento|condimentos',
  artesanal: 'artesanal|artesanais|levain|sourdough|fermentacao natural',
  // Lojas de suplementação. "whey" e "suplemento" só como palavra inteira.
  suplemento: 'suplemento|suplementos|suplementacao|suplementar',
  whey: 'whey',
  // "saude" é fraca (clínica, farmácia, plano...): no segmento `suplementos` só vale no NOME
  // FANTASIA (o nome da loja), nunca na razão social (ver `fantasiaOnly`).
  saude: 'saude',
  // Churrascarias e similares. "churrasc" cobre só a palavra solta; as variações vêm abaixo.
  churrasco: 'churrasc|churrasco|churrascos|churrascaria|churrascarias|parrilla|parrillada|grill|steak|steakhouse|steak house|espetinho|espetinhos|costelaria',
} as const;

export type PremiumKeywordId = keyof typeof PREMIUM_KEYWORDS;

/** Palavras que, presentes no nome, anulam a correspondência ("Academia Fit"). */
const VETO = /(?:^| )(?:academia|academias|gym|musculacao|pilates|crossfit|fisioterapia)(?: |$)/;

/** Palavra-chave de nome que só vale no nome fantasia, nunca na razão social, por segmento. */
type SegmentShape = {
  key: string;
  label: string;
  cnaes: readonly string[];
  requiresNameMatch: boolean;
  keywords: readonly PremiumKeywordId[];
  fantasiaOnly?: readonly PremiumKeywordId[];
};

export const PREMIUM_SEGMENTS = [
  {
    key: 'loja_natural',
    label: 'Lojas de produtos naturais e empórios',
    // 4729699 = COMÉRCIO VAREJISTA DE PRODUTOS ALIMENTÍCIOS EM GERAL OU ESPECIALIZADO EM
    //           PRODUTOS ALIMENTÍCIOS NÃO ESPECIFICADOS ANTERIORMENTE
    cnaes: ['4729699'],
    requiresNameMatch: true,
    keywords: ['natural', 'emporio', 'organico', 'integral', 'saudavel', 'vegano'],
  },
  {
    key: 'granel_cerealista',
    label: 'Lojas a granel e cerealistas',
    // 4729699 = (descrição acima)
    // 4632001 = COMÉRCIO ATACADISTA DE CEREAIS E LEGUMINOSAS BENEFICIADOS
    // 4632003 = COMÉRCIO ATACADISTA DE CEREAIS E LEGUMINOSAS BENEFICIADOS, FARINHAS, AMIDOS E
    //           FÉCULAS, COM ATIVIDADE DE FRACIONAMENTO E ACONDICIONAMENTO ASSOCIADA
    cnaes: ['4729699', '4632001', '4632003'],
    requiresNameMatch: true,
    keywords: ['granel', 'cerealista', 'graos', 'temperos'],
  },
  {
    key: 'mercado_natural',
    label: 'Mercadinhos com perfil natural / empório',
    // 4712100 = COMÉRCIO VAREJISTA DE MERCADORIAS EM GERAL, COM PREDOMINÂNCIA DE PRODUTOS
    //           ALIMENTÍCIOS - MINIMERCADOS, MERCEARIAS E ARMAZÉNS
    cnaes: ['4712100'],
    requiresNameMatch: true,
    keywords: ['natural', 'emporio', 'organico', 'integral', 'saudavel', 'granel', 'graos', 'vegano'],
  },
  {
    key: 'restaurante_saudavel',
    label: 'Restaurantes naturais, veganos, fit e saudáveis',
    // 5611201 = RESTAURANTES E SIMILARES
    // 5611203 = LANCHONETES, CASAS DE CHÁ, DE SUCOS E SIMILARES
    cnaes: ['5611201', '5611203'],
    requiresNameMatch: true,
    keywords: ['natural', 'vegano', 'fit', 'saudavel', 'integral', 'organico', 'light'],
  },
  {
    key: 'marmita_saudavel',
    label: 'Marmitas e refeições saudáveis',
    // 5620104 = FORNECIMENTO DE ALIMENTOS PREPARADOS PREPONDERANTEMENTE PARA CONSUMO DOMICILIAR
    // 5620101 = FORNECIMENTO DE ALIMENTOS PREPARADOS PREPONDERANTEMENTE PARA EMPRESAS
    cnaes: ['5620104', '5620101'],
    requiresNameMatch: true,
    keywords: ['fit', 'saudavel', 'natural', 'vegano', 'light', 'nutri', 'integral', 'organico'],
  },
  {
    key: 'padaria_artesanal',
    label: 'Padarias artesanais',
    // 1091102 = FABRICAÇÃO DE PRODUTOS DE PADARIA E CONFEITARIA COM PREDOMINÂNCIA DE PRODUÇÃO PRÓPRIA
    // 4721102 = PADARIA E CONFEITARIA COM PREDOMINÂNCIA DE REVENDA
    cnaes: ['1091102', '4721102'],
    requiresNameMatch: true,
    keywords: ['artesanal', 'integral', 'natural', 'organico'],
  },
  {
    key: 'temperos_especiarias',
    label: 'Fábricas de temperos e especiarias',
    // 1095300 = FABRICAÇÃO DE ESPECIARIAS, MOLHOS, TEMPEROS E CONDIMENTOS
    cnaes: ['1095300'],
    requiresNameMatch: false,
    keywords: [],
  },
  {
    key: 'conservas',
    label: 'Fábricas de conservas',
    // 1031700 = FABRICAÇÃO DE CONSERVAS DE FRUTAS
    // 1032501 = FABRICAÇÃO DE CONSERVAS DE PALMITO
    // 1032599 = FABRICAÇÃO DE CONSERVAS DE LEGUMES E OUTROS VEGETAIS, EXCETO PALMITO
    cnaes: ['1031700', '1032501', '1032599'],
    requiresNameMatch: false,
    keywords: [],
  },
  // ---- Público ampliado (dono, 2026-11-28) -------------------------------------------------
  {
    key: 'suplementos',
    label: 'Lojas de suplementos e produtos de nutrição',
    // 4729699 = COMÉRCIO VAREJISTA DE PRODUTOS ALIMENTÍCIOS EM GERAL OU ESPECIALIZADO EM
    //           PRODUTOS ALIMENTÍCIOS NÃO ESPECIFICADOS ANTERIORMENTE
    //           (atividades do IBGE: "SUPLEMENTOS ALIMENTÍCIOS; COMÉRCIO VAREJISTA" e
    //           "PRODUTOS DIETÉTICOS; COMÉRCIO VAREJISTA" — é o único CNAE de varejo que cita
    //           suplemento. 4772500 é cosmético/perfumaria e 4789099 é "outros produtos não
    //           especificados": nenhum dos dois cita suplemento, então ficam de FORA.)
    // ATENÇÃO — RISCO ALTO DE ALEGAÇÃO DE SAÚDE: lojas de suplemento vivem de promessa de
    // emagrecer, ganhar massa, "detox" etc. Qualquer texto/mensagem para este segmento fala
    // SÓ de origem, sabor e processo do sal (CHECKLIST-ALTERACOES.md, seção 5). Nunca prometa
    // benefício, nunca cite saúde, dieta ou desempenho. O veto de academia/gym/musculação/
    // crossfit/pilates (VETO) continua valendo: academia não é loja.
    cnaes: ['4729699'],
    requiresNameMatch: true,
    keywords: ['suplemento', 'nutri', 'whey', 'natural', 'saude'],
    fantasiaOnly: ['saude'],
  },
  {
    key: 'minimercado',
    label: 'Minimercados, mercearias e armazéns (SEM regra de nome)',
    // OPT-IN (ver PREMIUM_OPT_IN_SEGMENT_KEYS): milhares de estabelecimentos por UF.
    // 4712100 = COMÉRCIO VAREJISTA DE MERCADORIAS EM GERAL, COM PREDOMINÂNCIA DE PRODUTOS
    //           ALIMENTÍCIOS - MINIMERCADOS, MERCEARIAS E ARMAZÉNS
    // Mesmo CNAE de `mercado_natural`; quem casa os dois ganha os dois segmentos.
    cnaes: ['4712100'],
    requiresNameMatch: false,
    keywords: [],
  },
  {
    key: 'acougue_casa_de_carnes',
    label: 'Açougues e casas de carnes',
    // OPT-IN. 4722901 = COMÉRCIO VAREJISTA DE CARNES - AÇOUGUES
    cnaes: ['4722901'],
    requiresNameMatch: false,
    keywords: [],
  },
  {
    key: 'peixaria',
    label: 'Peixarias',
    // OPT-IN. 4722902 = PEIXARIA
    cnaes: ['4722902'],
    requiresNameMatch: false,
    keywords: [],
  },
  {
    key: 'hortifruti',
    label: 'Hortifrútis',
    // OPT-IN. 4724500 = COMÉRCIO VAREJISTA DE HORTIFRUTIGRANJEIROS
    cnaes: ['4724500'],
    requiresNameMatch: false,
    keywords: [],
  },
  {
    key: 'churrascaria',
    label: 'Churrascarias, parrillas, steakhouses e espetarias',
    // 5611201 = RESTAURANTES E SIMILARES (mesmo CNAE de `restaurante_saudavel`; aqui o que
    //           vale é o nome: churrasc..., parrilla, grill, steak, espetinho, costelaria)
    cnaes: ['5611201'],
    requiresNameMatch: true,
    keywords: ['churrasco'],
  },
] as const satisfies ReadonlyArray<SegmentShape>;

export type PremiumSegmentKey = (typeof PREMIUM_SEGMENTS)[number]['key'];

export const PREMIUM_SEGMENT_KEYS = PREMIUM_SEGMENTS.map((s) => s.key) as [PremiumSegmentKey, ...PremiumSegmentKey[]];

/** Segmentos de volume alto: ficam FORA do padrão do importador (Neon free = 512 MB) e só
 * entram com `--segmentos-premium`. */
export const PREMIUM_OPT_IN_SEGMENT_KEYS = [
  'minimercado',
  'acougue_casa_de_carnes',
  'peixaria',
  'hortifruti',
] as const satisfies readonly PremiumSegmentKey[];

/** Segmentos que o importador usa quando `--segmentos-premium` não é informado. */
export const PREMIUM_DEFAULT_SEGMENT_KEYS: PremiumSegmentKey[] = PREMIUM_SEGMENT_KEYS.filter(
  (k) => !(PREMIUM_OPT_IN_SEGMENT_KEYS as readonly string[]).includes(k),
);

/** Todos os CNAEs do perfil Premium, sem repetir (4729699 está em dois segmentos). */
export const PREMIUM_ALL_CNAES: string[] = [...new Set(PREMIUM_SEGMENTS.flatMap((s) => [...s.cnaes] as string[]))];

/** Primeira onda de importação: o Nordeste próximo da fábrica (Neon free tem só 512 MB). */
export const PREMIUM_WAVE_1_UFS = ['RN', 'CE', 'PB', 'PE'] as const;

/** Minúsculo, sem acento, só letras/dígitos separados por um espaço. */
export function normalizePremiumText(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const keywordRegexCache = new Map<PremiumKeywordId, RegExp>();
function keywordRegex(id: PremiumKeywordId): RegExp {
  let re = keywordRegexCache.get(id);
  if (!re) {
    re = new RegExp(`(?:^| )(?:${PREMIUM_KEYWORDS[id]})(?: |$)`);
    keywordRegexCache.set(id, re);
  }
  return re;
}

/** Palavras-chave (ids) de `keywords` presentes em `text` (qualquer texto, normalizado aqui). */
export function premiumKeywordsIn(text: string | null | undefined, keywords: readonly PremiumKeywordId[]): PremiumKeywordId[] {
  const norm = normalizePremiumText(text);
  if (!norm || VETO.test(norm)) return [];
  return keywords.filter((id) => keywordRegex(id).test(norm));
}

function segmentNameMatches(
  seg: SegmentShape,
  nomeFantasia: string | null | undefined,
  razaoSocial: string | null | undefined,
): boolean {
  const fantasiaOnly = seg.fantasiaOnly ?? [];
  const nasDuas = seg.keywords.filter((k) => !fantasiaOnly.includes(k));
  return premiumKeywordsIn(nomeFantasia, seg.keywords).length > 0 || premiumKeywordsIn(razaoSocial, nasDuas).length > 0;
}

/** Segmentos Premium que o estabelecimento casa: CNAE (principal ou secundário) do segmento
 * E, se o segmento exigir, palavra-chave no nome fantasia ou na razão social. `only` restringe
 * a esses segmentos (o importador passa a seleção); sem ele vale o catálogo inteiro. */
export function premiumSegmentsFor(
  cnaes: readonly string[],
  nomeFantasia: string | null | undefined,
  razaoSocial: string | null | undefined,
  only?: readonly PremiumSegmentKey[],
): PremiumSegmentKey[] {
  const out: PremiumSegmentKey[] = [];
  for (const seg of PREMIUM_SEGMENTS) {
    if (only && !only.includes(seg.key)) continue;
    if (!seg.cnaes.some((c) => cnaes.includes(c))) continue;
    if (seg.requiresNameMatch && !segmentNameMatches(seg, nomeFantasia, razaoSocial)) continue;
    out.push(seg.key);
  }
  return out;
}

/** CNAEs (na ordem de `cnaes`) que sustentam algum segmento Premium efetivamente casado.
 * É o que vai para `radar_establishments.cnaes_alvo` no perfil Premium. */
export function premiumCnaesAlvo(
  cnaes: readonly string[],
  nomeFantasia: string | null | undefined,
  razaoSocial: string | null | undefined,
  only?: readonly PremiumSegmentKey[],
): string[] {
  const casados = premiumSegmentsFor(cnaes, nomeFantasia, razaoSocial, only) as string[];
  const matched = new Set(
    PREMIUM_SEGMENTS.filter((s) => casados.includes(s.key)).flatMap(
      (s) => [...s.cnaes] as string[],
    ),
  );
  const seen = new Set<string>();
  return cnaes.filter((c) => {
    if (!matched.has(c) || seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

/** Palavras-chave que casaram no nome (fantasia + razão), para os segmentos dados. Evidência
 * textual para quem for abordar a empresa; vazio quando o segmento não exige nome. */
export function premiumNameSignals(
  segments: readonly PremiumSegmentKey[],
  nomeFantasia: string | null | undefined,
  razaoSocial: string | null | undefined,
): PremiumKeywordId[] {
  const ids = new Set<PremiumKeywordId>();
  for (const seg of PREMIUM_SEGMENTS) {
    if (!(segments as readonly string[]).includes(seg.key)) continue;
    const fantasiaOnly: readonly PremiumKeywordId[] = 'fantasiaOnly' in seg ? seg.fantasiaOnly : [];
    for (const id of premiumKeywordsIn(nomeFantasia, seg.keywords)) ids.add(id);
    for (const id of premiumKeywordsIn(razaoSocial, seg.keywords.filter((k) => !fantasiaOnly.includes(k)))) ids.add(id);
  }
  return [...ids];
}
