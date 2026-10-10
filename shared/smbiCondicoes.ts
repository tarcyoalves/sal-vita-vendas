// Condições de pagamento do ERP SMBI — usadas pela tela do pedido (cliente) e pela
// API do robô (servidor). Os códigos vieram do catálogo do Hermes
// (client/src/lib/faturamento/smbiCatalog.ts, mapeamento com as tabelas do SMBI) e
// NÃO devem ser inventados: prazo que não está aqui fica sem código até o dono
// informar o código real do SMBI.
//
// Não confie no texto exato: pedidos antigos foram digitados à mão ("30/60/90",
// "30 dias", "à vista"). `condicaoPorTexto` reconhece essas variações.

export interface SmbiCondicaoPagamento {
  cod: string;
  descricao: string;
  parcelas: number;
}

export const SMBI_CONDICOES_PAGAMENTO: SmbiCondicaoPagamento[] = [
  { cod: '1', descricao: 'A VISTA', parcelas: 1 },
  { cod: '11', descricao: '15 DIAS', parcelas: 1 },
  { cod: '5', descricao: '20 DIAS', parcelas: 1 },
  { cod: '2', descricao: '30 DIAS', parcelas: 1 },
  { cod: '7', descricao: '30/45 DIAS', parcelas: 2 },
  { cod: '3', descricao: '30/60 DIAS', parcelas: 2 },
  { cod: '10', descricao: '30/45/60 DIAS', parcelas: 3 },
  { cod: '46', descricao: '30/60/90 DIAS', parcelas: 3 },
  { cod: '4', descricao: '45 DIAS', parcelas: 1 },
  { cod: '6', descricao: '60 DIAS', parcelas: 1 },
  // Códigos 100 e 150 informados pelo dono em 29/09/2026 (mapa de prazos do SMBI).
  { cod: '100', descricao: '20/40/60 DIAS', parcelas: 3 },
  { cod: '150', descricao: '40/60 DIAS', parcelas: 2 },
  // Código 104 informado pelo dono em 05/10/2026 (mapa de prazos do SMBI).
  { cod: '104', descricao: '15/25 DIAS', parcelas: 2 },
];

/**
 * Forma canônica de um prazo digitado à mão, só para comparar:
 * "30 / 60 / 90 dias" → "30/60/90"; "À vista" → "AVISTA".
 * Mantém só os números separados por "/" (ou o texto "AVISTA").
 */
export function normalizarPrazo(texto: string | null | undefined): string {
  const t = (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
  if (!t) return '';
  if (/^A?\s*VISTA$/.test(t) || t === 'AVISTA') return 'AVISTA';
  const numeros = t.match(/\d+/g);
  // Só aceita se, tirando números, "DIAS" e separadores, não sobrar nada: evita casar
  // "30 dias após emissão da NF" com "30 DIAS".
  const sobra = t.replace(/\d+/g, '').replace(/\b(DIAS?|D)\b/g, '').replace(/[\s/,;.\-+]/g, '');
  if (!numeros || sobra) return '';
  return numeros.join('/');
}

/** Condição do catálogo que corresponde ao texto (ou null se não houver com certeza). */
export function condicaoPorTexto(texto: string | null | undefined): SmbiCondicaoPagamento | null {
  const alvo = normalizarPrazo(texto);
  if (!alvo) return null;
  return SMBI_CONDICOES_PAGAMENTO.find((c) => normalizarPrazo(c.descricao) === alvo) ?? null;
}

// ── Códigos por empresa ──────────────────────────────────────────────────────
// O catálogo acima usa os códigos da A S Comércio. A C Alves tem outra tabela de prazos (relatório do SMBI
// de 10/10/2026). O "FT x%" no nome é ignorado por decisão do dono (erro de cadastro que ele corrige).
// Prazo sem código na empresa fica null: o robô devolve pendência e nada é digitado.
// NÃO mapeados de propósito: 20/40/60 (id 249 tem só 2 parcelas, ou seja, é 20/40) e 30/60/90 (id 183 se chama
// "30/45/60", mas tem carência 30 e intervalo 30). 40/60 não existe. Só entram depois de o dono corrigir.
const CNPJ_C_ALVES = '49748258000160';
const CONDICOES_C_ALVES: Record<string, string> = {
  AVISTA: '182', '15': '191', '20': '220', '15/25': '196',
  '30': '187', '30/45': '202', '30/60': '185', '30/45/60': '203', '45': '186', '60': '254',
};

/**
 * Código do prazo na empresa. `cod` e `texto` são os do pedido (códigos da A S). Sem empresa ou na A S devolve
 * o código de sempre; na C Alves traduz pelo prazo (nunca reaproveita o número da A S).
 */
export function codigoCondicaoDaEmpresa(cod: string | null | undefined, texto: string | null | undefined, empresaCnpj: string | null | undefined): string | null {
  const daAS = cod ?? condicaoPorTexto(texto)?.cod ?? null;
  if (empresaCnpj !== CNPJ_C_ALVES) return daAS;
  const prazo = daAS ? normalizarPrazo(SMBI_CONDICOES_PAGAMENTO.find((c) => c.cod === daAS)?.descricao) : normalizarPrazo(texto);
  return CONDICOES_C_ALVES[prazo] ?? null;
}
