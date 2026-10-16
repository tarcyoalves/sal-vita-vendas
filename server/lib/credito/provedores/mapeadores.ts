// Um mapeador por produto do catálogo (shared/creditoCatalogo.ts): converte o corpo da API Full em conteúdo do
// relatório. REAIS (estrutura vista em 16/10/2026): boavista (scpc-boavista), serasa_premium e, no mínimo, define_risco.
// Os demais produtos seguem no defensivo (só o score) até a estrutura deles ser vista.
//
// Convenções da API Full: números como STRING com vírgula decimal ("9451,05"), percentuais "3,0%", datas dd/mm/aaaa,
// vazio = "". Bloco ausente = a fonte não devolveu => consultado:false ("Não informado pela fonte"); "Nada consta" só
// quando o bloco veio e a quantidade é 0. Contatos (telefone/e-mail) NÃO são mapeados: dado pessoal.
// O bruto completo continua em credit_reports.payload_bruto.
import type { GrupoAnotacao, RelatorioCredito, ScoreExtra } from '../../../../shared/credito';
import { PRODUTO_PADRAO } from '../../../../shared/creditoCatalogo';
import { dividirCnaes, faixaExibivel, humanizarChave, valorSeguro } from '../../../../shared/creditoRotulos';

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

const primeiro = (o: Obj, chaves: string[]): { chave: string; valor: string } | null => {
  for (const chave of chaves) { const v = txt(o[chave]); if (v) return { chave, valor: v }; }
  return null;
};

/** Copia para `extras` todo campo escalar não vazio que ainda não virou data/descrição/valor/local/credor. */
function extrasDe(o: Obj, usados: Set<string>): Record<string, string> | undefined {
  const extras: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (usados.has(k) || k.toUpperCase() === 'MOEDA') continue; // a moeda já está no valor formatado (R$)
    const bruto = typeof v === 'string' || typeof v === 'number' ? String(v)
      : Array.isArray(v) ? v.filter((x) => typeof x === 'string' || typeof x === 'number').join(', ') : '';
    const seguro = valorSeguro(k, bruto);
    if (!seguro) continue;
    extras[humanizarChave(k)] = seguro.length > 300 ? seguro.slice(0, 297) + '...' : seguro;
  }
  return Object.keys(extras).length ? extras : undefined;
}

const itemPendencia: ItemDe = (o) => {
  const dv = dataPtBr(o.DATA_VENCIMENTO);
  const contrato = txt(o.CONTRATO);
  const usados = new Set(['VALOR', 'CREDOR', 'ORIGEM', dv ? 'DATA_VENCIMENTO' : 'DATA_INCLUSAO']);
  if (contrato) usados.add('CONTRATO'); else if (txt(o.MODALIDADE)) usados.add('MODALIDADE');
  return {
    data: dv ?? dataPtBr(o.DATA_INCLUSAO),
    descricao: contrato ? `Contrato ${contrato}` : (txt(o.MODALIDADE) ?? 'Pendência financeira'),
    valor: numeroPtBr(o.VALOR), local: txt(o.ORIGEM), credor: txt(o.CREDOR), extras: extrasDe(o, usados),
  };
};

// Protestos/cheques/ações: leitura defensiva (campos reais variam). Tipo/espécie entra na descrição; cartório e
// cidade/UF no local; o resto vai para `extras`.
const CHAVES_DATA = ['DATA', 'DATA_PROTESTO', 'DATA_VENCIMENTO', 'DATA_INCLUSAO'];
const itemGenerico = (rotulo: string): ItemDe => (o) => {
  const dt = CHAVES_DATA.map((k) => ({ k, v: dataPtBr(o[k]) })).find((x) => x.v);
  const usados = new Set(['VALOR', 'CREDOR']);
  if (dt) usados.add(dt.k);
  const tipo = primeiro(o, ['ESPECIE', 'TIPO', 'TIPO_TITULO', 'NATUREZA', 'TIPO_OCORRENCIA', 'MODALIDADE']);
  if (tipo) usados.add(tipo.chave);
  const qtd = primeiro(o, ['QUANTIDADE', 'QTD']);
  if (qtd) usados.add(qtd.chave);
  const cart = primeiro(o, ['CARTORIO', 'NOME_CARTORIO']);
  const cidade = primeiro(o, ['CIDADE', 'MUNICIPIO']);
  const uf = primeiro(o, ['UF', 'ESTADO']);
  const cidadeUf = cidade && uf ? `${cidade.valor}/${uf.valor}` : (cidade?.valor ?? uf?.valor ?? null);
  const partes = [cart?.valor, cidadeUf].filter((x): x is string => !!x);
  let local: string | null = null;
  if (partes.length) { local = partes.join(' — '); for (const x of [cart, cidade, uf]) if (x) usados.add(x.chave); }
  else { const alt = primeiro(o, ['ORIGEM', 'COMARCA', 'VARA']); if (alt) { local = alt.valor; usados.add(alt.chave); } }
  const qn = qtd ? numeroPtBr(qtd.valor) : null;
  return {
    data: dt?.v ?? null,
    descricao: rotulo + (tipo ? ` — ${tipo.valor}` : '') + (qn !== null && qn > 1 ? ` (${qtd?.valor} títulos)` : ''),
    valor: numeroPtBr(o.VALOR), local, credor: txt(o.CREDOR), extras: extrasDe(o, usados),
  };
};

/**
 * Ação cível (Serasa): REQUERIDO, ACAO, FORO/UF, VARA, PROCESSO, DISTRIBUICAO (data), VALOR. As chaves foram descritas a
 * partir do PDF do provedor (o JSON dessa lista ainda não foi visto): leitura defensiva com alternativas; o que sobrar vai
 * para `extras` (ex.: Requerido).
 */
const itemAcao: ItemDe = (o) => {
  const dt = ['DISTRIBUICAO', 'DATA_DISTRIBUICAO', 'DATA'].map((k) => ({ k, v: dataPtBr(o[k]) })).find((x) => x.v);
  const usados = new Set(['VALOR']);
  if (dt) usados.add(dt.k);
  const acao = primeiro(o, ['ACAO', 'TIPO_ACAO', 'NATUREZA', 'ASSUNTO']);
  if (acao) usados.add(acao.chave);
  const foro = primeiro(o, ['FORO', 'COMARCA', 'CIDADE', 'MUNICIPIO']);
  const uf = primeiro(o, ['UF', 'ESTADO']);
  const vara = primeiro(o, ['VARA', 'JUIZO']);
  for (const x of [foro, uf, vara]) if (x) usados.add(x.chave);
  const foroUf = foro && uf ? `${foro.valor}/${uf.valor}` : (foro?.valor ?? uf?.valor ?? null);
  const proc = primeiro(o, ['PROCESSO', 'NUMERO_PROCESSO', 'NUM_PROCESSO']);
  if (proc) usados.add(proc.chave);
  return {
    data: dt?.v ?? null, descricao: acao?.valor ?? 'Ação cível', valor: numeroPtBr(o.VALOR),
    local: [foroUf, vara?.valor].filter((x): x is string => !!x).join(' — ') || null,
    processo: proc?.valor ?? null, credor: null, extras: extrasDe(o, usados),
  };
};

const CHAVES_QTD = ['QUANTIDADE_OCORRENCIA', 'QUANTIDADE_OCORRENCIAS', 'TOTAL_ACOES', 'TOTAL_DE_ACOES', 'QUANTIDADE_ACOES'];
const CHAVES_VALOR_TOTAL = ['VALOR_TOTAL', 'TOTAL_VALOR', 'VALOR_TOTAL_ACOES'];
/** Primeiro número encontrado nas chaves, no bloco ou no seu resumo (RESUMO/TOTAIS), quando existir. */
function numeroDe(b: Obj, chaves: string[]): number | null {
  for (const alvo of [b, obj(b.RESUMO), obj(b.TOTAIS)]) {
    if (!alvo) continue;
    for (const k of chaves) { const n = numeroPtBr(alvo[k]); if (n !== null) return n; }
  }
  return null;
}

/** Bloco ausente => consultado:false. Presente com quantidade (mesmo "0") ou itens => consultado:true. */
function grupoDe(bloco: unknown, item: ItemDe): GrupoAnotacao {
  const b = obj(bloco);
  if (!b) return grupoNaoConsultado();
  const itens = lista(b.OCORRENCIAS).map(item);
  const qtd = numeroDe(b, CHAVES_QTD);
  if (qtd === null && itens.length === 0) return grupoNaoConsultado();
  const quantidade = qtd ?? itens.length;
  return { consultado: true, quantidade, valorTotal: numeroDe(b, CHAVES_VALOR_TOTAL) ?? somaValores(itens) ?? (quantidade === 0 ? 0 : null), itens };
}

function juntarGrupos(a: GrupoAnotacao, b: GrupoAnotacao): GrupoAnotacao {
  if (!a.consultado && !b.consultado) return grupoNaoConsultado();
  const itens = [...a.itens, ...b.itens];
  const vt = a.valorTotal === null && b.valorTotal === null ? null : (a.valorTotal ?? 0) + (b.valorTotal ?? 0);
  return { consultado: true, quantidade: a.quantidade + b.quantidade, valorTotal: vt, itens };
}

/** Número/complemento só entram se o logradouro ainda não os traz ("AVENIDA X, 1200" + número 1200 não duplica). */
function enderecoTexto(e: Obj): string | null {
  const logr = txt(e.ENDERECO) ?? txt(e.LOGRADOURO);
  const numero = txt(e.NUMERO);
  const compl = txt(e.COMPLEMENTO);
  const rua = [logr, numero && !(logr ?? '').includes(numero) ? numero : null].filter(Boolean).join(', ') + (compl ? ` ${compl}` : '');
  const cep = txt(e.CEP)?.replace(/^(\d{5})-?(\d{3})$/, '$1-$2') ?? null;
  return [rua.trim() || null, txt(e.BAIRRO), cep].filter(Boolean).join(', ') || null;
}

/**
 * Endereço da empresa. O Serasa não preenche ENDERECO em INFORMACOES_DA_EMPRESA: o endereço vem num bloco próprio
 * (SOMENTE_ENDERECO.DADOS[0] ou ENDERECOS), com ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CIDADE, UF e CEP.
 */
function enderecoPrincipal(c: Obj | null, emp: Obj | null): Obj | null {
  const direto = obj(emp?.ENDERECO);
  if (direto) return direto;
  if (!c) return null;
  for (const chave of ['SOMENTE_ENDERECO', 'ENDERECOS', 'ENDERECO']) {
    const b = c[chave];
    const candidatos = Array.isArray(b) ? b : ehObjeto(b) ? [b, ...['DADOS', 'OCORRENCIAS', 'ENDERECOS'].flatMap((k) => (Array.isArray(b[k]) ? (b[k] as unknown[]) : []))] : [];
    const achado = candidatos.filter(ehObjeto).find((o) => txt(o.ENDERECO) ?? txt(o.LOGRADOURO) ?? txt(o.CIDADE));
    if (achado) return achado;
  }
  return null;
}

function cadastroDe(emp: Obj | null, c: Obj | null = null): ConteudoMapeado['cadastro'] {
  const base = mapeadorDefensivo(null).cadastro;
  if (!emp) return base;
  const e = enderecoPrincipal(c, emp);
  return {
    ...base,
    razaoSocial: txt(emp.RAZAO_SOCIAL), nomeFantasia: txt(emp.NOME_FANTASIA), situacao: txt(emp.SITUACAO),
    situacaoEm: dataPtBr(emp.DATA_SITUACAO), fundacao: dataPtBr(emp.DATA_FUNDACAO), naturezaJuridica: txt(emp.NATUREZA_JURIDICA),
    capitalSocial: numeroPtBr(emp.CAPITAL_SOCIAL), cnaePrincipal: txt(emp.CNAE_PRIMARIO), atividade: txt(emp.RAMO_ATIVIDADE_PRIMARIO),
    inscricaoEstadual: txt(emp.INSCRICAO_ESTADUAL),
    endereco: e ? enderecoTexto(e) : null,
    municipio: e ? (txt(e.CIDADE) ?? txt(e.MUNICIPIO)) : null, uf: e ? txt(e.UF) : null,
  };
}

/** Primeira faixa que seja de verdade: "NULO"/"NULL"/"NAO CALCULADO" não são faixa (e não bloqueiam as alternativas). */
const faixaDe = (e: Obj): string | null => {
  for (const k of ['CLASSIF_ABC', 'FAIXA_SCORE', 'FAIXA', 'DESCR_FAIXA', 'CLASSIF_NRO']) {
    const f = faixaExibivel(txt(e[k]));
    if (f) return f;
  }
  return null;
};

/**
 * Lê TODAS as entradas de score da fonte. O principal (o que as regras e o card individual usam) é a primeira entrada
 * calculada; as demais ficam em `outros`, na ordem da fonte, SEM somar nem fazer média. Entrada "NAO CALCULADO" vira
 * score null. `exigirProbabilidade` (Serasa): só vale a entrada com probabilidade numérica.
 * Com mais de uma entrada, cada uma ganha rótulo: "Score 1", "Score 2" (ou o LAYOUT/TIPO_SCORE/DESCR_SCORE da fonte,
 * quando todos vierem preenchidos e diferentes entre si).
 */
function scoreDe(scores: unknown, exigirProbabilidade: boolean): ConteudoMapeado['score'] {
  const entradas = lista(obj(scores)?.OCORRENCIAS);
  const lido = entradas.map((o, i) => {
    const n = numeroPtBr(o.SCORE);
    const prob = numeroPtBr(o.PROBABILIDADE_INADIMPLENCIA);
    const faixaValida = n !== null && n >= 0 && n <= 1000;
    const calculado = faixaValida && (!exigirProbabilidade || prob !== null);
    return { o, i, calculado, n: calculado ? n : null, prob: calculado ? prob : null };
  });
  const descr = entradas.map((o) => txt(o.DESCR_SCORE) ?? txt(o.TIPO_SCORE) ?? txt(o.LAYOUT));
  const usarDescr = entradas.length > 1 && descr.every((d) => d !== null) && new Set(descr.map((d) => semAcento(d as string))).size === descr.length;
  const rotulo = (i: number) => (usarDescr ? (descr[i] as string) : `Score ${i + 1}`);
  const principal = lido.find((x) => x.calculado && x.prob !== null) ?? (exigirProbabilidade ? undefined : lido.find((x) => x.calculado));
  if (!principal) return { valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null };
  const base = {
    valor: principal.n, probabilidadeInadimplencia: principal.prob, faixa: faixaDe(principal.o), textoInterpretacao: txt(principal.o.TEXTO),
  };
  if (lido.length < 2) return base;
  const outros: ScoreExtra[] = lido.filter((x) => x !== principal).map((x) => ({
    valor: x.n, probabilidadeInadimplencia: x.prob, faixa: x.calculado ? faixaDe(x.o) : null,
    texto: txt(x.o.TEXTO), rotulo: rotulo(x.i),
  }));
  return { ...base, rotulo: rotulo(principal.i), outros };
}

// ── Dados que só algumas fontes trazem (Serasa Premium / Boa Vista) ───────────────────────────────────────
type Complementos = NonNullable<RelatorioCredito['complementos']>;

const semAcento = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

/** "CONSULTAS 30 DIAS" etc. + "QUANTIDADE TOTAL: N" (contagens OFICIAIS) e "ULTIMAS CONSULTAS" (mês/ano + quantidade + segmento). */
function consultasDoAlertas(c: Obj): Pick<Complementos, 'consultasJanelas' | 'consultasPorSegmento'> {
  const out: Pick<Complementos, 'consultasJanelas' | 'consultasPorSegmento'> = {};
  const janelas = { ate30: null as number | null, de31a60: null as number | null, de61a90: null as number | null, mais90: null as number | null };
  let achouJanela = false;
  const segmentos: NonNullable<Complementos['consultasPorSegmento']> = [];
  for (const o of lista(obj(c.INFORMACOES_ALERTAS_RESTRICOES)?.OCORRENCIAS)) {
    const titulo = semAcento(txt(o.TITULO) ?? '');
    const bruto = o.OBSERVACOES;
    const obs = Array.isArray(bruto) ? bruto.filter((x) => typeof x === 'string').join(' ') : (txt(bruto) ?? '');
    if (/ULTIMAS?\s+CONSULTAS/.test(titulo)) {
      // "DATA:/10/2025/QUANTIDADE:2/SEGMENTO:ATIVIDADES DE CONSULTORIA EM G" (a fonte pode omitir o dia e truncar o segmento)
      for (const m of obs.matchAll(/DATA:\s*(?:(?:\d{1,2})?\/)?(\d{1,2})\/(\d{4})\s*\/\s*QUANTIDADE:\s*(\d+)\s*\/\s*SEGMENTO:\s*(.+?)\s*(?=DATA:|$)/gi)) {
        const mes = Number(m[1]);
        segmentos.push({ mes: mes >= 1 && mes <= 12 ? `${m[2]}-${String(mes).padStart(2, '0')}` : null, quantidade: Number(m[3]), segmento: m[4].trim().replace(/[\s;|,]+$/, '') });
      }
      continue;
    }
    if (!/CONSULTAS?/.test(titulo)) continue;
    const q = obs.match(/QUANTIDADE\s+TOTAL\s*:\s*(\d+)/i);
    const n = q ? Number(q[1]) : null;
    if (n === null) continue;
    if (/31\s*A\s*60/.test(titulo)) { janelas.de31a60 = n; achouJanela = true; }
    else if (/61\s*A\s*90/.test(titulo)) { janelas.de61a90 = n; achouJanela = true; }
    else if (/90\s*\+|MAIS\s+DE\s+90|ACIMA\s+DE\s+90/.test(titulo)) { janelas.mais90 = n; achouJanela = true; }
    else if (/\b30\s+DIAS/.test(titulo)) { janelas.ate30 = n; achouJanela = true; }
  }
  if (achouJanela) out.consultasJanelas = janelas;
  if (segmentos.length) out.consultasPorSegmento = segmentos;
  return out;
}

/** Texto das observações de uma ocorrência de alerta (a fonte manda string ou lista de strings). */
function observacaoDe(o: Obj): string {
  const bruto = o.OBSERVACOES ?? o.OBSERVACAO ?? o.OBS;
  return (Array.isArray(bruto) ? bruto.filter((x) => typeof x === 'string' || typeof x === 'number').join(' ') : (txt(bruto) ?? '')).replace(/\s+/g, ' ').trim();
}

/**
 * INFORMACOES_ALERTAS_RESTRICOES também carrega dados cadastrais como "alertas" informativos: MATRIZ/FILIAL, TEMPO DE ATUACAO,
 * CNAES SECUNDARIOS (separados por "/") e REPRESENTANTE. Aqui eles viram complementos (e NÃO são impressos como alerta).
 * Quando INFORMACOES_DA_EMPRESA traz o mesmo campo, ele tem prioridade (o spread é feito por quem chama).
 */
function complementosDoAlertas(c: Obj): Partial<Complementos> {
  const out: Partial<Complementos> = {};
  for (const o of lista(obj(c.INFORMACOES_ALERTAS_RESTRICOES)?.OCORRENCIAS)) {
    const titulo = semAcento(txt(o.TITULO) ?? '').replace(/\s+/g, ' ').trim();
    const obs = observacaoDe(o);
    if (!obs || /NENHUM\s+REGISTRO/i.test(semAcento(obs))) continue;
    if (/^MATRIZ\s*\/?\s*FILIAL/.test(titulo)) out.matrizFilial = obs.replace(/^(MATRIZ\s*\/?\s*FILIAL)\s*:\s*/i, '');
    else if (/^TEMPO\s+DE\s+ATUACAO/.test(titulo)) out.tempoAtuacao = obs.replace(/^TEMPO\s+DE\s+ATUA[CÇ][AÃ]O\s*:\s*/i, '');
    else if (/^CNAES?\s+SECUNDARI/.test(titulo)) {
      const cnaes = [...new Set(dividirCnaes(obs.replace(/^CNAES?\s+SECUNDARI[OA]S?\s*:\s*/i, '')))];
      if (cnaes.length) out.cnaesSecundarios = cnaes;
    } else if (/^REPRESENTANTE/.test(titulo)) {
      const doc = /(?:CPF\s*\/\s*CNPJ|CPF|CNPJ|DOCUMENTO)\s*:\s*([\d.\-/*]+)/i.exec(obs)?.[1] ?? null;
      const nome = /NOME\s*:\s*(.+?)(?=\s+(?:CPF|CNPJ|DOCUMENTO|CARGO|VINCULO)\b|$)/i.exec(obs)?.[1]?.trim() ?? null;
      if (nome || doc) out.representante = { nome, documento: doc };
    }
  }
  return out;
}

const MESES_NOMES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
/** HIST_CONSULTAS.QUANTIDADES: [{ANO, JANEIRO, FEVEREIRO...}] -> um item por ano, 12 meses (null = sem dado). */
function consultasPorMesDe(hist: Obj | null): Complementos['consultasPorMes'] {
  const out: NonNullable<Complementos['consultasPorMes']> = [];
  for (const o of lista(hist?.QUANTIDADES)) {
    const ano = numeroPtBr(o.ANO);
    if (ano === null) continue;
    const meses: Array<number | null> = new Array<number | null>(12).fill(null);
    for (const [k, v] of Object.entries(o)) {
      const nome = semAcento(k).trim();
      const i = MESES_NOMES.indexOf(nome) >= 0 ? MESES_NOMES.indexOf(nome) : MESES.indexOf(nome);
      if (i >= 0) meses[i] = numeroPtBr(v);
    }
    if (meses.some((m) => m !== null)) out.push({ ano, meses });
  }
  return out.length ? out.sort((a, b) => b.ano - a.ano) : undefined;
}

const textoDe = (o: Obj, chaves: string[]): string | null => primeiro(o, chaves)?.valor ?? null;

/** Faixa de funcionários, CNAEs secundários, tempo de atuação, matriz/filial e representante (nomes de chave defensivos). */
function empresaComplementos(emp: Obj | null): Partial<Complementos> {
  if (!emp) return {};
  const out: Partial<Complementos> = {};
  const func = txt(emp.FAIXA_FUNCIONARIOS);
  if (func) out.funcionariosFaixa = func;
  const chaveCnae = Object.keys(emp).find((k) => /^CNAES?_?SECUND/.test(semAcento(k)));
  if (chaveCnae) {
    const v = emp[chaveCnae];
    const itens = Array.isArray(v) ? v : typeof v === 'string' ? dividirCnaes(v) : [];
    const cnaes = itens.map((x) => {
      if (ehObjeto(x)) return [textoDe(x, ['CNAE', 'CODIGO']), textoDe(x, ['DESCRICAO', 'ATIVIDADE'])].filter(Boolean).join('-');
      return typeof x === 'string' || typeof x === 'number' ? String(x).trim() : '';
    }).filter(Boolean);
    const unicos = [...new Set(cnaes)];
    if (unicos.length) out.cnaesSecundarios = unicos;
  }
  const atuacao = Object.keys(emp).find((k) => /^TEMPO.*ATUA/.test(semAcento(k)));
  if (atuacao && txt(emp[atuacao])) out.tempoAtuacao = txt(emp[atuacao]);
  const chaveMF = Object.keys(emp).find((k) => /^(MATRIZ|FILIAL|TIPO_ESTABELECIMENTO)/.test(semAcento(k)) && txt(emp[k]));
  if (chaveMF) {
    const v = (txt(emp[chaveMF]) ?? '').toUpperCase();
    if (/^MATRIZ/.test(semAcento(chaveMF)) && !/MATRIZ|FILIAL/.test(v)) out.matrizFilial = /^(S|SIM|1|TRUE)$/.test(v) ? 'Matriz' : /^(N|NAO|0|FALSE)$/.test(v) ? 'Filial' : v;
    else out.matrizFilial = txt(emp[chaveMF]);
  }
  const rep = emp.REPRESENTANTE;
  if (ehObjeto(rep)) {
    const nome = textoDe(rep, ['NOME', 'NOME_REPRESENTANTE', 'RAZAO_SOCIAL']);
    const doc = textoDe(rep, ['CPF', 'CPF_CNPJ', 'DOCUMENTO']);
    if (nome || doc) out.representante = { nome, documento: doc };
  } else if (txt(rep)) {
    out.representante = { nome: txt(rep), documento: textoDe(emp, ['REPRESENTANTE_CPF', 'CPF_REPRESENTANTE']) };
  } else {
    const nome = textoDe(emp, ['REPRESENTANTE_NOME', 'NOME_REPRESENTANTE']);
    if (nome) out.representante = { nome, documento: textoDe(emp, ['REPRESENTANTE_CPF', 'CPF_REPRESENTANTE']) };
  }
  return out;
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
    cadastro: cadastroDe(obj(c.INFORMACOES_DA_EMPRESA), c),
    socios: [],
    consultasRecentes,
    comportamento: eventos || pontual
      ? { ultimaCompraEm: compra ? periodoMes(compra.PERIODO) : null, relacionamentoMaisAntigoEm: null, fontesConsultadas: null, pagamentoPontualPct: numeroPtBr(pontual?.PONTUACAO) }
      : undefined,
    complementos: (() => {
      const porMes = consultasPorMesDe(hist);
      const comp: Complementos = {
        ...(hist ? { consultas12Meses: numeroPtBr(hist.QUANTIDADE_OCORRENCIAS) } : {}),
        ...(porMes ? { consultasPorMes: porMes } : {}),
        ...empresaComplementos(obj(c.INFORMACOES_DA_EMPRESA)),
      };
      return Object.keys(comp).length ? comp : undefined;
    })(),
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
    cadastro: cadastroDe(obj(c.INFORMACOES_DA_EMPRESA), c),
    socios: lista(obj(c.QUADRO_SOCIETARIO)?.OCORRENCIAS).map((s) => ({
      documento: txt(s.CPF_CNPJ), nome: txt(s.NOME) ?? 'Não informado', entrada: dataPtBr(s.DATA_ENTRADA_SOCIEDADE),
      participacao: numeroPtBr(s.PERCENTUAL_PARTICIPACAO), cargo: txt(s.CARGO),
    })),
    consultasRecentes: passagens,
    complementos: {
      faturamentoPresumidoFaixa: txt(obj(c.FATURAMENTO_PRESUMIDO)?.FAIXA), veiculos,
      ...consultasDoAlertas(c), ...complementosDoAlertas(c), ...empresaComplementos(obj(c.INFORMACOES_DA_EMPRESA)),
    },
    anotacoes: {
      protestos: grupoDe(protestos, itemGenerico('Protesto')),
      pendenciasFinanceiras: grupoDe(c.RESTRICOES_FINANCEIRAS, itemPendencia),
      chequesSemFundo: grupoDe(c.CH_SEM_FUNDOS_BACEN, itemGenerico('Cheque sem fundo (BACEN)')),
      acoesJudiciais: grupoDe(c.ACOES_CIVEIS, itemAcao),
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
