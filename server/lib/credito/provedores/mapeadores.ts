// Um mapeador por produto do catálogo (shared/creditoCatalogo.ts): converte o corpo da API Full em conteúdo do
// relatório. REAIS (estrutura vista em 16/10/2026): boavista (scpc-boavista), serasa_premium e, no mínimo, define_risco.
// Os demais produtos seguem no defensivo (só o score) até a estrutura deles ser vista.
//
// Convenções da API Full: números como STRING com vírgula decimal ("9451,05"), percentuais "3,0%", datas dd/mm/aaaa,
// vazio = "". Bloco ausente = a fonte não devolveu => consultado:false ("Não informado pela fonte"); "Nada consta" só
// quando o bloco veio e a quantidade é 0. Contatos (telefone/e-mail) NÃO são mapeados: dado pessoal.
// O bruto completo continua em credit_reports.payload_bruto.
import type { GrupoAnotacao, RelatorioCredito } from '../../../../shared/credito';
import { PRODUTO_PADRAO } from '../../../../shared/creditoCatalogo';

export type ConteudoMapeado = Pick<RelatorioCredito, 'score' | 'cadastro' | 'socios' | 'consultasRecentes' | 'anotacoes'>
  & Partial<Pick<RelatorioCredito, 'comportamento' | 'complementos'>>;
export type Mapeador = (json: unknown) => ConteudoMapeado;

// S2 — chaves candidatas do score em `dados` (suposição não confirmada).
export const CHAVES_SCORE = ['score', 'pontuacao'];

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const grupoNaoConsultado = (): GrupoAnotacao => ({ consultado: false, quantidade: 0, valorTotal: null, itens: [] });

/** DEFENSIVO: estrutura desconhecida → nulls e `consultado:false`. Só reconhece o score (S2). */
export function mapeadorDefensivo(json: unknown): ConteudoMapeado {
  const dados = ehObjeto(json) && ehObjeto(json.dados) ? json.dados : null;
  let valor: number | null = null;
  if (dados) {
    for (const chave of CHAVES_SCORE) {
      const v = dados[chave];
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (Number.isFinite(n) && n >= 0 && n <= 1000) { valor = n; break; }
    }
  }
  return {
    score: { valor, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null },
    cadastro: {
      razaoSocial: null, nomeFantasia: null, situacao: null, situacaoEm: null, fundacao: null, naturezaJuridica: null,
      capitalSocial: null, cnaePrincipal: null, atividade: null, opcaoTributaria: null, inscricaoEstadual: null,
      endereco: null, municipio: null, uf: null, telefone: null, numeroFiliais: null,
    },
    socios: [],
    consultasRecentes: [],
    anotacoes: {
      protestos: grupoNaoConsultado(), pendenciasFinanceiras: grupoNaoConsultado(), chequesSemFundo: grupoNaoConsultado(),
      acoesJudiciais: grupoNaoConsultado(), falenciaRecuperacao: grupoNaoConsultado(),
    },
  };
}

// ── Leitura PT-BR defensiva ──────────────────────────────────────────────────
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (ehObjeto(v) ? v : null);
const lista = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(ehObjeto) : []);
const txt = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() || null : null);

/** "9451,05" -> 9451.05; "3,0%" -> 3; "1.234,56" -> 1234.56; "NAO CALCULADO"/"" -> null. */
export function numeroPtBr(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let t = v.replace(/R\$|%|\s/g, '');
  if (t === '' || !/^-?[\d.,]+$/.test(t)) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "16/10/2026" -> "2026-10-16"; ISO passa; resto -> null. */
export function dataPtBr(v: unknown): string | null {
  const t = txt(v);
  if (!t) return null;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
/** "SET/2026" -> "2026-09-01". */
export function periodoMes(v: unknown): string | null {
  const m = (txt(v) ?? '').toUpperCase().match(/^([A-Z]{3})\/(\d{4})$/);
  const i = m ? MESES.indexOf(m[1]) : -1;
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, '0')}-01` : null;
}

const somaValores = (itens: GrupoAnotacao['itens']): number | null => {
  const v = itens.map((i) => i.valor).filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) * 100) / 100 : null;
};

type ItemDe = (o: Obj) => GrupoAnotacao['itens'][number];
const itemPendencia: ItemDe = (o) => ({
  data: dataPtBr(o.DATA_VENCIMENTO) ?? dataPtBr(o.DATA_INCLUSAO),
  descricao: txt(o.CONTRATO) ? `Contrato ${txt(o.CONTRATO)}` : (txt(o.MODALIDADE) ?? 'Pendência financeira'),
  valor: numeroPtBr(o.VALOR), local: txt(o.ORIGEM), credor: txt(o.CREDOR),
});
// Campos dos itens de protesto/cheque/ação NÃO foram vistos: leitura defensiva.
const itemGenerico = (rotulo: string): ItemDe => (o) => ({
  data: dataPtBr(o.DATA) ?? dataPtBr(o.DATA_PROTESTO) ?? dataPtBr(o.DATA_VENCIMENTO) ?? dataPtBr(o.DATA_INCLUSAO),
  descricao: rotulo, valor: numeroPtBr(o.VALOR), local: txt(o.CARTORIO) ?? txt(o.CIDADE) ?? txt(o.ORIGEM), credor: txt(o.CREDOR),
});

/** Bloco ausente => consultado:false. Presente com quantidade (mesmo "0") ou itens => consultado:true. */
function grupoDe(bloco: unknown, item: ItemDe): GrupoAnotacao {
  const b = obj(bloco);
  if (!b) return grupoNaoConsultado();
  const itens = lista(b.OCORRENCIAS).map(item);
  const qtd = numeroPtBr(b.QUANTIDADE_OCORRENCIA) ?? numeroPtBr(b.QUANTIDADE_OCORRENCIAS);
  if (qtd === null && itens.length === 0) return grupoNaoConsultado();
  const quantidade = qtd ?? itens.length;
  return { consultado: true, quantidade, valorTotal: numeroPtBr(b.VALOR_TOTAL) ?? somaValores(itens) ?? (quantidade === 0 ? 0 : null), itens };
}

function juntarGrupos(a: GrupoAnotacao, b: GrupoAnotacao): GrupoAnotacao {
  if (!a.consultado && !b.consultado) return grupoNaoConsultado();
  const itens = [...a.itens, ...b.itens];
  const vt = a.valorTotal === null && b.valorTotal === null ? null : (a.valorTotal ?? 0) + (b.valorTotal ?? 0);
  return { consultado: true, quantidade: a.quantidade + b.quantidade, valorTotal: vt, itens };
}

function cadastroDe(emp: Obj | null): ConteudoMapeado['cadastro'] {
  const base = mapeadorDefensivo(null).cadastro;
  if (!emp) return base;
  const e = obj(emp.ENDERECO);
  return {
    ...base,
    razaoSocial: txt(emp.RAZAO_SOCIAL), nomeFantasia: txt(emp.NOME_FANTASIA), situacao: txt(emp.SITUACAO),
    situacaoEm: dataPtBr(emp.DATA_SITUACAO), fundacao: dataPtBr(emp.DATA_FUNDACAO), naturezaJuridica: txt(emp.NATUREZA_JURIDICA),
    capitalSocial: numeroPtBr(emp.CAPITAL_SOCIAL), cnaePrincipal: txt(emp.CNAE_PRIMARIO), atividade: txt(emp.RAMO_ATIVIDADE_PRIMARIO),
    inscricaoEstadual: txt(emp.INSCRICAO_ESTADUAL),
    endereco: e ? [txt(e.ENDERECO), txt(e.BAIRRO), txt(e.CEP)].filter(Boolean).join(', ') || null : null,
    municipio: e ? txt(e.CIDADE) : null, uf: e ? txt(e.UF) : null,
  };
}

/** Escolhe a entrada de score. `exigirProbabilidade`: só vale a que tem probabilidade numérica ("NAO CALCULADO" não vale). */
function scoreDe(scores: unknown, exigirProbabilidade: boolean): ConteudoMapeado['score'] {
  const entradas = lista(obj(scores)?.OCORRENCIAS);
  const valida = (o: Obj) => { const n = numeroPtBr(o.SCORE); return n !== null && n >= 0 && n <= 1000; };
  const e = entradas.find((o) => valida(o) && numeroPtBr(o.PROBABILIDADE_INADIMPLENCIA) !== null)
    ?? (exigirProbabilidade ? undefined : entradas.find(valida));
  if (!e) return { valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null };
  return {
    valor: numeroPtBr(e.SCORE), probabilidadeInadimplencia: numeroPtBr(e.PROBABILIDADE_INADIMPLENCIA),
    faixa: txt(e.CLASSIF_ABC) ?? txt(e.CLASSIF_NRO), textoInterpretacao: txt(e.TEXTO),
  };
}

const credDe = (json: unknown): Obj | null => obj(obj(obj(json)?.dados)?.CREDCADASTRAL);

/** scpc-boavista: dados.CREDCADASTRAL.*. Sem sócios nem faturamento (a fonte não traz). */
export function mapeadorBoaVista(json: unknown): ConteudoMapeado {
  const c = credDe(json);
  if (!c) return mapeadorDefensivo(json);
  const hist = obj(c.HIST_CONSULTAS);
  const consultasRecentes = lista(hist?.DETALHES)
    .map((d) => ({ data: dataPtBr(d.DATA) ?? '', consultante: txt(d.RAZAO_SOCIAL) ?? 'Não informado', quantidade: 1 }))
    .filter((d) => d.data !== '');
  const eventos = obj(c.EVENTOS_PESSOA_JURIDICA);
  const compra = lista(eventos?.OCORRENCIAS).find((o) => (txt(o.INDICADOR) ?? '').toUpperCase() === 'ULTIMA COMPRA');
  const pontual = obj(c.PAGAMENTO_PONTUAL);
  return {
    score: scoreDe(obj(c.SCORES), false),
    cadastro: cadastroDe(obj(c.INFORMACOES_DA_EMPRESA)),
    socios: [],
    consultasRecentes,
    comportamento: eventos || pontual
      ? { ultimaCompraEm: compra ? periodoMes(compra.PERIODO) : null, relacionamentoMaisAntigoEm: null, fontesConsultadas: null, pagamentoPontualPct: numeroPtBr(pontual?.PONTUACAO) }
      : undefined,
    complementos: hist ? { consultas12Meses: numeroPtBr(hist.QUANTIDADE_OCORRENCIAS) } : undefined,
    anotacoes: {
      protestos: grupoDe(c.PROTESTOS, itemGenerico('Protesto')),
      pendenciasFinanceiras: grupoDe(c.PEND_FINANCEIRAS, itemPendencia),
      chequesSemFundo: juntarGrupos(grupoDe(c.CH_SEM_FUNDOS_BACEN, itemGenerico('Cheque sem fundo (BACEN)')), grupoDe(c.CH_SEM_FUNDOS_VAREJO, itemGenerico('Cheque sem fundo (varejo)'))),
      acoesJudiciais: grupoNaoConsultado(), // o Boa Vista não cobre ações
      falenciaRecuperacao: grupoNaoConsultado(),
    },
  };
}

/** serasa-premium: mesmo prefixo. A entrada de score "NAO CALCULADO" é ignorada; sem nenhuma válida, score=null. */
export function mapeadorSerasaPremium(json: unknown): ConteudoMapeado {
  const c = credDe(json);
  if (!c) return mapeadorDefensivo(json);
  const dados = obj(obj(json)?.dados);
  const veiculosBloco = obj(c.VEICULOS_POR_DOCUMENTO) ?? obj(dados?.VEICULAR);
  const veiculos = lista(veiculosBloco?.OCORRENCIAS).map((v) => ({ marcaModelo: txt(v.MARCA_MODELO) ?? 'Não informado', placa: txt(v.PLACA) }));
  const passagens = lista(obj(c.PASSAGENS_COMERCIAIS)?.OCORRENCIAS)
    .map((o) => ({ data: dataPtBr(o.DATA_CONSULTA) ?? '', consultante: txt(o.CLIENTE_CONSULTA) ?? 'Não informado', quantidade: 1 }))
    .filter((o) => o.data !== '');
  const protestos = obj(c.PROTESTOS) ? c.PROTESTOS : c.PROTESTO_SINTETICO;
  return {
    score: scoreDe(obj(c.SCORES), true),
    cadastro: cadastroDe(obj(c.INFORMACOES_DA_EMPRESA)),
    socios: lista(obj(c.QUADRO_SOCIETARIO)?.OCORRENCIAS).map((s) => ({
      documento: txt(s.CPF_CNPJ), nome: txt(s.NOME) ?? 'Não informado', entrada: dataPtBr(s.DATA_ENTRADA_SOCIEDADE),
      participacao: numeroPtBr(s.PERCENTUAL_PARTICIPACAO), cargo: txt(s.CARGO),
    })),
    consultasRecentes: passagens,
    complementos: { faturamentoPresumidoFaixa: txt(obj(c.FATURAMENTO_PRESUMIDO)?.FAIXA), veiculos },
    anotacoes: {
      protestos: grupoDe(protestos, itemGenerico('Protesto')),
      pendenciasFinanceiras: grupoDe(c.RESTRICOES_FINANCEIRAS, itemPendencia),
      chequesSemFundo: grupoDe(c.CH_SEM_FUNDOS_BACEN, itemGenerico('Cheque sem fundo (BACEN)')),
      acoesJudiciais: grupoDe(c.ACOES_CIVEIS, itemGenerico('Ação cível')),
      falenciaRecuperacao: grupoNaoConsultado(),
    },
  };
}

/** Procura recursivamente a primeira folha cujo nome (sem o prefixo "xxx:") contém algum dos termos. */
function acharChave(o: unknown, termos: string[], prof = 0): unknown {
  if (!ehObjeto(o) || prof > 6) return undefined;
  for (const [k, v] of Object.entries(o)) {
    const nome = k.toLowerCase().split(':').pop() ?? '';
    if (termos.some((t) => nome.includes(t)) && !ehObjeto(v) && !Array.isArray(v)) return v;
  }
  for (const v of Object.values(o)) { const r = acharChave(v, termos, prof + 1); if (r !== undefined) return r; }
  return undefined;
}

/**
 * pj-define-risco (mínimo): chaves com prefixo e ':' (ex.: dados.define_risco_positivo['scor:score']['scor:score_pj']['scor:score']).
 * Só score, classificação, probabilidade, faixa de faturamento, decisão e total de consultas. NADA de sócios/protestos.
 * As chaves exatas de classificação/probabilidade/decisão/consultas foram vistas só em parte: busca defensiva por nome.
 */
export function mapeadorDefineRisco(json: unknown): ConteudoMapeado {
  const raiz = obj(obj(obj(json)?.dados)?.define_risco_positivo);
  if (!raiz) return mapeadorDefensivo(json);
  const sc = obj(obj(raiz['scor:score'])?.['scor:score_pj']) ?? obj(raiz['scor:score']);
  const valor = numeroPtBr(sc?.['scor:score']);
  const ok = valor !== null && valor >= 0 && valor <= 1000;
  return {
    ...mapeadorDefensivo(null),
    score: {
      valor: ok ? valor : null,
      probabilidadeInadimplencia: ok ? numeroPtBr(acharChave(raiz, ['probabilidade'])) : null,
      faixa: ok ? txt(acharChave(raiz, ['classificacao', 'classe'])) : null,
      textoInterpretacao: txt(acharChave(raiz, ['decisao', 'recomendacao'])),
    },
    complementos: {
      faturamentoPresumidoFaixa: txt(acharChave(obj(raiz['fat:faturamento_presumido']), ['faixa', 'descricao'])),
      consultas12Meses: numeroPtBr(acharChave(obj(raiz['con:consultas']), ['total', 'quantidade', 'qtd'])),
    },
  };
}

/** Mapeador por chave do catálogo. Produtos sem estrutura vista seguem no defensivo. */
export const MAPEADORES: Record<string, Mapeador> = {
  boavista: mapeadorBoaVista,
  serasa_premium: mapeadorSerasaPremium,
  define_risco: mapeadorDefineRisco,
  serasa_basica: mapeadorDefensivo,
  protesto_nacional: mapeadorDefensivo,
  cenprot: mapeadorDefensivo,
  cnpj_cadastro: mapeadorDefensivo,
  cndt: mapeadorDefensivo,
};

export function mapeadorDoProduto(chave: string): Mapeador {
  return MAPEADORES[chave] ?? MAPEADORES[PRODUTO_PADRAO];
}
