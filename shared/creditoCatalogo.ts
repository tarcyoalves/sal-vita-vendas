// Catálogo ÚNICO das consultas pagas da API Full (usado pelo servidor e pela tela de seleção).
//
// PREÇOS MEDIDOS EM 16/10/2026 (extrato oficial da API Full, diferença de saldo da sonda
// `scripts/credito/sonda-apifull.mjs`). Eles PODEM MUDAR: refaça a sonda antes de confiar em um valor antigo.
// `custoReais: null` = ainda NÃO medido. Esses itens aparecem desabilitados na tela e o servidor recusa
// (BAD_REQUEST): nunca se cobra um produto sem preço conhecido.
//
// `mostra.confirmado` = o que as respostas reais medidas mostraram. `mostra.aConfirmar` = o que o provedor anuncia,
// mas que ainda depende de olhar a estrutura real da resposta (`scripts/credito/estrutura-resposta.mjs`).

export const PRECOS_MEDIDOS_EM = '16/10/2026';
export const PRODUTO_PADRAO = 'boavista';
export const MAX_PRODUTOS_POR_CONSULTA = 3;
export const TETO_POR_CONSULTA_PADRAO_REAIS = 30;
/** Orientação do dono (16/10/2026), exibida no seletor e no painel. */
export const TEXTO_RECOMENDACAO = 'Recomendado: Boa Vista (R$ 2,75) cobre quase tudo; use Serasa Premium (R$ 6,72) só para sócios, veículos e faturamento.';
export const TEXTO_NAO_MEDIDO = 'Custo ainda não medido — rode a sonda';

export interface ItemCatalogoCredito {
  /** Identificador estável: vai em credit_reports.produto e credit_queries.produto. */
  chave: string;
  /** Vai em `POST /api/<endpoint>` com `{ link: endpoint, document }`. */
  endpoint: string;
  nome: string;
  custoReais: number | null;
  recomendado?: boolean;
  mostra: { confirmado: string[]; aConfirmar: string[] };
  quandoUsar: string;
}

export const CATALOGO_CREDITO: readonly ItemCatalogoCredito[] = [
  {
    chave: 'boavista', endpoint: 'scpc-boavista', nome: 'Boa Vista Essencial Positivo', custoReais: 2.75, recomendado: true,
    mostra: {
      confirmado: [
        'Fundação e situação cadastral',
        'Score de risco (12 meses) com classe e probabilidade de inadimplência',
        'Pendências financeiras (credor, valor, vencimento)',
        'Protestos',
        'Cheques sem fundo (BACEN + varejo)',
        'Histórico de consultas (total em 12 meses e as últimas)',
        'Última compra no mercado',
        'Pontualidade de pagamento',
        'Relacionamento com fornecedores',
      ],
      aConfirmar: [],
    },
    quandoUsar: 'Nível 1 e padrão: use em toda análise de cliente novo ou pedido a prazo. Não traz sócios nem faturamento presumido.',
  },
  {
    chave: 'serasa_premium', endpoint: 'serasa-premium', nome: 'Serasa Premium', custoReais: 6.72,
    mostra: {
      confirmado: [
        'Cadastro da empresa',
        'Quadro societário (com cargo)',
        'Veículos da empresa',
        'Faturamento presumido (faixa)',
        'Ações cíveis',
        'Protestos',
        'Restrições financeiras',
        'Passagens comerciais (consultas)',
        'Score (pode vir "não calculado")',
      ],
      aConfirmar: ['Data de entrada dos sócios (não veio na resposta)'],
    },
    quandoUsar: 'Quando precisar conferir quadro societário, veículos ou faturamento presumido.',
  },
  {
    chave: 'define_risco', endpoint: 'pj-define-risco', nome: 'Define Risco Positivo', custoReais: 15.09,
    mostra: {
      confirmado: [
        'Score, classe e probabilidade de inadimplência',
        'Faixa de faturamento presumido',
        'Decisão / recomendação de análise',
        'Consultas',
        'Pendências',
      ],
      aConfirmar: [],
    },
    quandoUsar: 'Só em caso excepcional (R$ 15,09, a mais cara). Não traz sócios nem protestos detalhados.',
  },
  // ── Ainda NÃO medidos (custoReais: null): nunca selecionáveis. As descrições são só "a confirmar". ──
  {
    chave: 'serasa_basica', endpoint: 'serasa-basica', nome: 'Serasa Básica', custoReais: null,
    mostra: { confirmado: [], aConfirmar: ['Relatório básico da Serasa (o "Relato" que a Sal Vita já usa)'] },
    quandoUsar: 'Depois de medir o custo com a sonda.',
  },
  {
    chave: 'protesto_nacional', endpoint: 'protesto-nacional', nome: 'Protesto Nacional', custoReais: null,
    mostra: { confirmado: [], aConfirmar: ['Protestos em cartórios de todo o país'] },
    quandoUsar: 'Depois de medir o custo com a sonda.',
  },
  {
    chave: 'cenprot', endpoint: 'e-cenprot', nome: 'CENPROT', custoReais: null,
    mostra: { confirmado: [], aConfirmar: ['Consulta à Central Nacional de Protestos'] },
    quandoUsar: 'Depois de medir o custo com a sonda.',
  },
  {
    chave: 'cnpj_cadastro', endpoint: 'cnpj', nome: 'Cadastro do CNPJ', custoReais: null,
    mostra: { confirmado: [], aConfirmar: ['Dados cadastrais do CNPJ (situação, atividade, endereço)'] },
    quandoUsar: 'Depois de medir o custo com a sonda.',
  },
  {
    chave: 'cndt', endpoint: 'ic-cndt', nome: 'CNDT (certidão trabalhista)', custoReais: null,
    mostra: { confirmado: [], aConfirmar: ['Certidão Negativa de Débitos Trabalhistas'] },
    quandoUsar: 'Depois de medir o custo com a sonda.',
  },
];

export const itemDoCatalogo = (chave: string): ItemCatalogoCredito | undefined => CATALOGO_CREDITO.find((i) => i.chave === chave);
/** Só item com custo medido pode ser consultado/selecionado. */
export const itemSelecionavel = (i: Pick<ItemCatalogoCredito, 'custoReais'>): boolean => i.custoReais !== null;

/** Valor gravado em credit_reports.produto: a chave do catálogo; linhas antigas guardavam o nome do provedor. */
export function chaveDoProdutoGravado(produto: string | null | undefined, provedor: string | null | undefined): string {
  if (produto && itemDoCatalogo(produto)) return produto;
  // Legado (antes do seletor): havia um único produto, o Boa Vista (real ou simulado).
  return provedor === 'boavista_apifull' || provedor === 'simulado' ? PRODUTO_PADRAO : (produto ?? PRODUTO_PADRAO);
}

export function nomeDoProduto(produto: string | null | undefined, provedor?: string | null): string {
  const chave = chaveDoProdutoGravado(produto, provedor);
  return itemDoCatalogo(chave)?.nome ?? (produto || 'Produto desconhecido');
}

const centavos = (n: number) => Math.round(n * 100);
export const arredondar = (n: number): number => centavos(n) / 100;
export const brl = (n: number): string => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type ValidacaoProdutos = { ok: true; itens: ItemCatalogoCredito[] } | { ok: false; erro: string };

/** 1 a 3 chaves, sem repetição, existentes e com custo medido. Ausente = só o padrão (compatibilidade). */
export function validarProdutos(chaves: readonly string[] | undefined): ValidacaoProdutos {
  const lista = chaves === undefined ? [PRODUTO_PADRAO] : [...chaves];
  if (lista.length < 1) return { ok: false, erro: 'Escolha ao menos uma consulta' };
  if (lista.length > MAX_PRODUTOS_POR_CONSULTA) return { ok: false, erro: `Escolha no máximo ${MAX_PRODUTOS_POR_CONSULTA} consultas por vez` };
  if (new Set(lista).size !== lista.length) return { ok: false, erro: 'Consulta repetida na seleção' };
  const itens: ItemCatalogoCredito[] = [];
  for (const chave of lista) {
    const item = itemDoCatalogo(chave);
    if (!item) return { ok: false, erro: `Consulta desconhecida: ${chave}` };
    if (!itemSelecionavel(item)) return { ok: false, erro: `${item.nome}: ${TEXTO_NAO_MEDIDO.toLowerCase()}` };
    itens.push(item);
  }
  return { ok: true, itens };
}

/**
 * Custo a cobrar: soma dos itens que NÃO serão reaproveitados. Provedor simulado nunca cobra (R$ 0).
 * `reaproveita[chave] === true` = já existe relatório válido (<30 dias) e ninguém forçou nova consulta.
 */
export function calcularCustos(
  itens: ReadonlyArray<Pick<ItemCatalogoCredito, 'chave' | 'custoReais'>>,
  reaproveita: Readonly<Record<string, boolean>>,
  simulado: boolean,
): { totalReais: number; chamadas: number; reaproveitados: number } {
  let total = 0; let chamadas = 0; let reaproveitados = 0;
  for (const i of itens) {
    if (reaproveita[i.chave]) { reaproveitados += 1; continue; }
    chamadas += 1;
    if (!simulado) total += i.custoReais ?? 0;
  }
  return { totalReais: arredondar(total), chamadas, reaproveitados };
}

export const saldoApos = (saldo: number | null | undefined, totalReais: number): number | null =>
  saldo == null ? null : arredondar(saldo - totalReais);

export type CodigoBloqueioCusto = 'SALDO' | 'TETO' | 'LIMITE_MENSAL';
export type BloqueioCusto = { ok: true } | { ok: false; codigo: CodigoBloqueioCusto; mensagem: string };

/**
 * Bloqueios ANTES de gastar (servidor e tela usam esta mesma função). Saldo desconhecido (API fora) = fail-open.
 * Ordem: teto por consulta, saldo, limite mensal (por contagem: 1 por produto cobrado).
 */
export function verificarLimitesCusto(e: {
  totalReais: number; chamadas: number; saldo: number | null | undefined;
  tetoPorConsultaReais: number; usadasNoMes: number; limiteMensal: number;
}): BloqueioCusto {
  if (e.chamadas <= 0) return { ok: true };
  if (centavos(e.totalReais) > centavos(e.tetoPorConsultaReais)) {
    return { ok: false, codigo: 'TETO', mensagem: `O total de ${brl(e.totalReais)} passa do teto por consulta (${brl(e.tetoPorConsultaReais)}). Tire uma consulta ou peça ao administrador para ajustar o teto.` };
  }
  if (e.saldo != null && centavos(e.saldo) < centavos(e.totalReais)) {
    return { ok: false, codigo: 'SALDO', mensagem: `Saldo insuficiente na conta API Full: ${brl(e.saldo)} para um total de ${brl(e.totalReais)}.` };
  }
  if (e.usadasNoMes + e.chamadas > e.limiteMensal) {
    return { ok: false, codigo: 'LIMITE_MENSAL', mensagem: `Limite mensal de consultas pagas: já foram ${e.usadasNoMes} de ${e.limiteMensal} e esta seleção usa mais ${e.chamadas}.` };
  }
  return { ok: true };
}

/** Teto de gasto por consulta (R$): maior que zero, até R$ 1.000, no máximo 2 casas decimais. */
export function tetoPorConsultaValido(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= 1000 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}
