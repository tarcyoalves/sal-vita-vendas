// Anexo do PDF de crédito: converte a RESPOSTA CRUA do provedor (credit_reports.payload_bruto) num modelo de
// apresentação genérico (seções, tabelas, fichas, matrizes), sem depender de mapeador. Puro: o desenho fica em pdf.ts.
//
// Regras: SEM REDUNDÂNCIA. O corpo do PDF já mostra empresa, score, anotações, sócios, consultas e comportamento
// comercial; o anexo traz SOMENTE o que o corpo não mostrou (blocos/campos desconhecidos). HEADER, telefones e
// e-mails nunca são impressos; bloco vazio ou com "0 ocorrências" vira um nome na lista `semOcorrencias`; o status
// da consulta só aparece (em `avisos`) quando o código não é 1. CPF mascarado; URLs de imagem/arquivo omitidas.
// Legibilidade: meses sempre Jan→Dez; colunas idênticas são fundidas; texto longo ou muitas colunas viram
// "ficha por registro"; séries {período, pontuação mensal} viram matriz.
import { humanizarChave, rotuloBloco, semPrefixo, valorSeguro } from '../../../shared/creditoRotulos';

export type Parte =
  | { t: 'sub'; texto: string }
  | { t: 'campos'; pares: Array<[string, string]> }
  | { t: 'tabela'; colunas: string[]; pesos: number[]; linhas: string[][]; continuacao: boolean; compacta?: boolean }
  | { t: 'ficha'; registros: Array<Array<[string, string]>> }
  | { t: 'lista'; itens: string[] }
  | { t: 'aviso'; texto: string };

/** Status da consulta do bloco; `destaque` só quando o código existe e não é 1. */
export interface StatusBloco { texto: string; destaque: boolean }
export interface BlocoAnexo { titulo: string; partes: Parte[] }
export interface Anexo {
  /** Só o que o corpo do PDF não mostrou. Vazio = o PDF não tem anexo. */
  blocos: BlocoAnexo[];
  /** Blocos cujo status da consulta não foi 1 ("Protestos: status 3 — falha na fonte"). */
  avisos: string[];
  /** Nomes dos blocos de restrição consultados e zerados ("Contumácia", "Cheques sem fundos (BACEN)"...). */
  semOcorrencias: string[];
  /** Alertas da fonte com conteúdo (INFORMACOES_ALERTAS_RESTRICOES), já em texto. */
  alertas: string[];
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ehEscalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

const MAX_COLUNAS_TABELA = 6; // acima disto (ou com texto longo) cada registro vira ficha
const TEXTO_LONGO = 60;
const MAX_MESES_POR_MATRIZ = 12;
const MAX_PROFUNDIDADE = 6;
const MAX_CELULA = 600;

interface Ctx { pf: boolean; bloco?: string }

const ehPessoaFisicaMarcada = (o: Obj): boolean => {
  for (const k of ['TIPO_PESSOA', 'TIPO_DOCUMENTO']) {
    const v = o[k];
    if (typeof v === 'string' && /^(fisica|física|pf|cpf)$/i.test(v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim())) return true;
  }
  return false;
};

/** "5500,00" / "1.000,50" / "5500.00" -> "R$ 5.500,00"; qualquer outra coisa volta igual. */
export function moedaBR(s: string): string {
  const t = s.trim();
  let n: number;
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(t)) n = Number(t.replace(/\./g, '').replace(',', '.'));
  else if (/^\d+,\d{1,2}$/.test(t)) n = Number(t.replace(',', '.'));
  else if (/^\d+(\.\d{1,2})?$/.test(t)) n = Number(t);
  else return s;
  if (!Number.isFinite(n)) return s;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Escalar -> texto seguro ('' se vazio/URL). Escalar `false`/número entram como texto; colunas de valor viram R$. */
function textoEscalar(chave: string, v: unknown, ctx: Ctx): string {
  if (!ehEscalar(v)) return '';
  let s = valorSeguro(chave, String(v), ctx.pf);
  if (!s) return '';
  if (/^valor(_total)?$/i.test(semPrefixo(chave))) s = moedaBR(s);
  return s.length > MAX_CELULA ? s.slice(0, MAX_CELULA - 3) + '...' : s;
}

/** Qualquer valor numa célula só (objetos/listas aninhados viram "Campo: valor; ..."). */
function textoCelula(chave: string, v: unknown, ctx: Ctx, prof = 0): string {
  if (ehEscalar(v)) return textoEscalar(chave, v, ctx);
  if (prof > 3) return '';
  if (Array.isArray(v)) return v.map((x) => textoCelula(chave, x, ctx, prof + 1)).filter(Boolean).join(', ');
  if (ehObj(v)) {
    const sub: Ctx = { ...ctx, pf: ctx.pf || ehPessoaFisicaMarcada(v) };
    return Object.entries(v)
      .map(([k, x]) => { const t = textoCelula(k, x, sub, prof + 1); return t ? `${humanizarChave(k)}: ${t}` : ''; })
      .filter(Boolean).join('; ');
  }
  return '';
}

const BLOCOS_CONSULTAS = new Set(['HIST_CONSULTAS', 'PASSAGENS_COMERCIAIS']);
const ehNumeroCurto = (v: string) => /^\d{1,3}$/.test(v.trim());

/** Rótulo de um campo. `valores`: valores do campo, para desambiguar (CARTORIO = 1/2 é o NÚMERO do cartório). */
const rotuloCampo = (k: string, ctx?: Ctx, valores: string[] = []): string => {
  const b = semPrefixo(k).toUpperCase();
  if (b === 'STATUS_RETORNO') return 'Status';
  if (b === 'CPFCNPJ') return 'CPF/CNPJ consultado';
  if (b === 'CNPJ' && ctx?.bloco && BLOCOS_CONSULTAS.has(ctx.bloco)) return 'CNPJ do consultante';
  if (b === 'CARTORIO') { const v = valores.filter(Boolean); if (v.length && v.every(ehNumeroCurto)) return 'Nº do cartório'; }
  if (b === 'QUANTIDADE_OCORRENCIA' || b === 'QUANTIDADE_OCORRENCIAS') return 'Quantidade de ocorrências';
  return humanizarChave(k);
};

// ---- meses e séries mensais ----
const MESES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_COMPLETOS = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const abrev = (i: number) => MESES3[i].charAt(0) + MESES3[i].slice(1).toLowerCase();

/** Nome de mês (JANEIRO, MARCO/MARÇO, JAN...) -> 0..11, ou -1. */
function indiceMes(nome: string): number {
  const n = semAcento(nome).trim();
  const i = MESES_COMPLETOS.indexOf(n);
  return i >= 0 ? i : MESES3.indexOf(n);
}
const temMeses = (o: unknown): o is Obj => ehObj(o) && Object.keys(o).filter((k) => indiceMes(k) >= 0).length >= 3;

const COLUNAS_MESES = ['Ano', ...MESES3.map((_, i) => abrev(i))];

/** Linhas [Ano, Jan..Dez] sempre em ordem de calendário; ano mais recente primeiro; só anos com algum valor. */
function linhasPorMes(q: Obj[]): string[][] {
  const linhas: string[][] = [];
  for (const o of q) {
    const porMes = new Array<string>(12).fill('');
    let ano = '';
    for (const [k, v] of Object.entries(o)) {
      if (!ehEscalar(v)) continue;
      if (semAcento(k).trim() === 'ANO') { ano = String(v).trim(); continue; }
      const i = indiceMes(k);
      if (i >= 0) porMes[i] = String(v).trim();
    }
    if (ano || porMes.some(Boolean)) linhas.push([ano || '—', ...porMes.map((m) => m || '-')]);
  }
  const num = (l: string[]) => (/^\d{4}$/.test(l[0]) ? Number(l[0]) : -1);
  return linhas.sort((a, b) => num(b) - num(a));
}

function tabelaMeses(q: Obj[]): Parte[] {
  const linhas = linhasPorMes(q);
  if (!linhas.length) return [];
  return [{ t: 'tabela', colunas: COLUNAS_MESES, pesos: COLUNAS_MESES.map((_, i) => (i === 0 ? 40 : 38)), linhas, continuacao: false }];
}

/** "OUT/2025", "10/2025", "2025-10" -> ordem cronológica + rótulo curto "Out/25". null se não for período. */
function periodo(s: string): { ord: number; rot: string } | null {
  const t = s.trim();
  let mes = -1;
  let ano = 0;
  let m = /^([A-Za-zÀ-ú]{3})[/\-. ]?(\d{2}|\d{4})$/.exec(t);
  if (m) { mes = indiceMes(m[1]); ano = Number(m[2]); }
  else if ((m = /^(\d{1,2})[/\-.](\d{4})$/.exec(t))) { mes = Number(m[1]) - 1; ano = Number(m[2]); }
  else if ((m = /^(\d{4})[/\-.](\d{1,2})$/.exec(t))) { mes = Number(m[2]) - 1; ano = Number(m[1]); }
  if (mes < 0 || mes > 11) return null;
  if (ano < 100) ano += 2000;
  return { ord: ano * 12 + mes, rot: `${abrev(mes)}/${String(ano).slice(2)}` };
}

const CHAVES_PERIODO = new Set(['PERIODO', 'MES_ANO', 'MES_REFERENCIA', 'COMPETENCIA']);
const CHAVES_PONTOS = new Set(['PONTUACAO_MENSAL', 'PONTUACAO_MES']);
interface Serie { pontos: Map<number, string>; rotulos: Map<number, string> }

/** Array de {periodo/mes_ano, pontuacao_mensal} -> série; null se algum item não tiver esse formato. */
function serieDe(arr: unknown): Serie | null {
  if (!Array.isArray(arr) || !arr.length || !arr.every(ehObj)) return null;
  const serie: Serie = { pontos: new Map(), rotulos: new Map() };
  for (const o of arr) {
    let per: { ord: number; rot: string } | null = null;
    let val: string | null = null;
    for (const [k, v] of Object.entries(o)) {
      const b = semPrefixo(k).toUpperCase();
      if (CHAVES_PERIODO.has(b) && ehEscalar(v)) per = periodo(String(v));
      else if (CHAVES_PONTOS.has(b) && (ehEscalar(v) || v == null)) val = v == null ? '' : String(v).trim();
    }
    if (!per || val === null) return null;
    serie.pontos.set(per.ord, val || '-');
    serie.rotulos.set(per.ord, per.rot);
  }
  return serie;
}
const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && !v.length) || (ehObj(v) && !Object.keys(v).length);
const ehChavePontuacao = (k: string) => semPrefixo(k).toUpperCase() === 'PONTUACAO';

interface LinhaSerie { fixos: string[]; serie: Serie }
/** Matriz: colunas fixas + um mês por coluna (ordem cronológica), em fatias de 12 meses. */
function matrizDe(titulosFixos: string[], pesosFixos: number[], linhas: LinhaSerie[]): Parte[] {
  const rot = new Map<number, string>();
  for (const l of linhas) for (const [o, r] of l.serie.rotulos) rot.set(o, r);
  const ords = [...rot.keys()].sort((a, b) => a - b);
  const partes: Parte[] = [];
  for (let ini = 0, n = 0; ini < ords.length; ini += MAX_MESES_POR_MATRIZ, n++) {
    const fatia = ords.slice(ini, ini + MAX_MESES_POR_MATRIZ);
    partes.push({
      t: 'tabela', continuacao: n > 0, compacta: true,
      colunas: [...titulosFixos, ...fatia.map((o) => rot.get(o) ?? '')],
      pesos: [...pesosFixos, ...fatia.map(() => 33)],
      linhas: linhas.map((l) => [...l.fixos, ...fatia.map((o) => l.serie.pontos.get(o) ?? '-')]),
    });
  }
  return partes;
}

/** Objetos cujos filhos não escalares são todos séries mensais (ex.: faixas de atraso com ITENS) -> matriz. */
function matrizDeObjetos(objs: Obj[], ctx: Ctx): Parte[] | null {
  const linhas: Array<{ rotulo: string; pont: string; serie: Serie }> = [];
  let tituloLinha = '';
  let temPont = false;
  for (const o of objs) {
    const c: Ctx = { ...ctx, pf: ctx.pf || ehPessoaFisicaMarcada(o) };
    const rotulos: string[] = [];
    let pont = '';
    const series: Array<[string, Serie]> = [];
    for (const [k, v] of Object.entries(o)) {
      if (ehEscalar(v)) {
        const t = textoEscalar(k, v, c);
        if (!t) continue;
        if (ehChavePontuacao(k)) { pont = t; temPont = true; } else { rotulos.push(t); if (!tituloLinha) tituloLinha = rotuloCampo(k, c, [t]); }
      } else if (!vazio(v)) {
        const s = serieDe(v);
        if (!s) return null;
        series.push([k, s]);
      }
    }
    if (!series.length) return null;
    for (const [k, serie] of series) {
      linhas.push({ rotulo: [...rotulos, ...(series.length > 1 ? [humanizarChave(k)] : [])].join(' — ') || '-', pont, serie });
    }
  }
  if (!linhas.length) return null;
  const titulos = [tituloLinha || 'Item', ...(temPont ? ['Pontuação'] : [])];
  return matrizDe(titulos, temPont ? [90, 48] : [110], linhas.map((l) => ({ fixos: temPont ? [l.rotulo, l.pont || '-'] : [l.rotulo], serie: l.serie })));
}

// ---- tabelas / fichas ----
const GENERICOS = new Set(['TEXTO', 'DESCRICAO', 'DETALHE', 'OBSERVACAO', 'OBS']);

function pesoColuna(titulo: string, valores: string[]): number {
  const maior = valores.reduce((a, v) => Math.max(a, Math.min(v.length, 60)), 0);
  const maiorPalavra = titulo.split(' ').reduce((a, w) => Math.max(a, w.length), 0);
  return Math.min(125, Math.max(44, Math.max(maiorPalavra * 5.6, maior * 5.2) + 16));
}

/**
 * Array de objetos -> tabela (cabe em até 6 colunas, sem texto longo) ou fichas (um bloco rótulo: valor por registro).
 * Colunas totalmente vazias são omitidas; colunas de conteúdo idêntico a outra são fundidas (fica a mais descritiva).
 */
function tabelaDe(linhasBrutas: Obj[], ctx: Ctx): Parte[] {
  const chaves: string[] = [];
  for (const o of linhasBrutas) for (const k of Object.keys(o)) if (!chaves.includes(k) && !ehRuido(k)) chaves.push(k);
  const celulas = linhasBrutas.map((o) => {
    const c: Ctx = { ...ctx, pf: ctx.pf || ehPessoaFisicaMarcada(o) };
    return chaves.map((k) => textoCelula(k, o[k], c));
  });
  const colunaDe = (j: number) => celulas.map((l) => l[j]);
  const tituloDe = (j: number) => rotuloCampo(chaves[j], ctx, colunaDe(j));
  const mesmoConteudo = (a: number, b: number) => celulas.every((l) => l[a] === l[b]);
  const maisDescritiva = (novo: number, atual: number): boolean => {
    const g = (j: number) => GENERICOS.has(semAcento(semPrefixo(chaves[j])));
    if (g(atual) !== g(novo)) return g(atual);
    return tituloDe(novo).length > tituloDe(atual).length;
  };
  let usadas: number[] = [];
  for (let j = 0; j < chaves.length; j++) {
    if (!celulas.some((l) => l[j] !== '')) continue;
    if (semAcento(semPrefixo(chaves[j])) === 'moeda') continue; // já embutida no valor (R$)
    const dup = usadas.findIndex((u) => mesmoConteudo(u, j));
    if (dup < 0) usadas.push(j);
    else if (maisDescritiva(j, usadas[dup])) usadas = usadas.map((u, i) => (i === dup ? j : u));
  }
  if (!usadas.length) return [];
  const titulos = usadas.map(tituloDe);
  const longo = usadas.some((j) => celulas.some((l) => l[j].length > TEXTO_LONGO));
  if (longo || usadas.length > MAX_COLUNAS_TABELA) {
    const registros = celulas
      .map((l) => usadas.map((j, i): [string, string] => [titulos[i], l[j]]).filter(([, v]) => v !== ''))
      .filter((r) => r.length);
    return registros.length ? [{ t: 'ficha', registros }] : [];
  }
  const linhas = celulas.map((l) => usadas.map((j) => l[j]));
  const pesos = usadas.map((_, i) => pesoColuna(titulos[i], linhas.map((l) => l[i])));
  return [{ t: 'tabela', colunas: titulos, pesos, linhas, continuacao: false }];
}

/** Percorre um valor qualquer e acumula partes de apresentação. `caminho` só aparece em subtítulos. */
function emPartes(valor: unknown, caminho: string[], ctx: Ctx, saida: Parte[], prof = 0, chave = ''): void {
  if (prof > MAX_PROFUNDIDADE) return;
  if (ehEscalar(valor)) {
    const t = textoEscalar(chave, valor, ctx);
    if (t) saida.push({ t: 'campos', pares: [[chave ? rotuloCampo(chave, ctx, [t]) : 'Valor', t]] });
    return;
  }
  if (Array.isArray(valor)) {
    const serie = serieDe(valor);
    if (serie) {
      saida.push(...matrizDe([chave ? rotuloCampo(chave, ctx) : 'Indicador'], [110], [{ fixos: ['Pontuação mensal'], serie }]));
      return;
    }
    const objs = valor.filter(ehObj);
    const escalares = valor.filter(ehEscalar);
    if (objs.length) {
      if (objs.every(temMeses)) saida.push(...tabelaMeses(objs));
      else saida.push(...(matrizDeObjetos(objs, ctx) ?? tabelaDe(objs, ctx)));
    }
    const itens = escalares.map((x) => textoEscalar(chave, x, ctx)).filter(Boolean);
    if (itens.length) saida.push({ t: 'lista', itens });
    for (const sub of valor) if (Array.isArray(sub)) emPartes(sub, caminho, ctx, saida, prof + 1, chave);
    return;
  }
  if (!ehObj(valor)) return;
  const c: Ctx = { ...ctx, pf: ctx.pf || ehPessoaFisicaMarcada(valor) };
  const pares: Array<[string, string]> = [];
  const filhos: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(valor)) {
    if (ehRuido(k)) continue;
    if (ehEscalar(v)) {
      const t = textoEscalar(k, v, c);
      if (t) pares.push([rotuloCampo(k, c, [t]), t]);
    } else if (v !== null && v !== undefined) filhos.push([k, v]);
  }
  if (pares.length) saida.push({ t: 'campos', pares });
  for (const [k, v] of filhos) {
    const parcial: Parte[] = [];
    emPartes(v, [...caminho, k], c, parcial, prof + 1, k);
    if (!parcial.length) continue; // filho vazio: omitido
    saida.push({ t: 'sub', texto: [...caminho, k].map(rotuloBloco).join(' › ') });
    saida.push(...parcial);
  }
}

// ---- status do bloco ----
const ehChaveStatus = (k: string) => semPrefixo(k).toUpperCase() === 'STATUS_RETORNO';

/** Tira STATUS_RETORNO do bloco. Aceita texto puro ou {CODIGO, DESCRICAO}; destaque só se o código existir e não for 1. */
function separarStatus(valor: unknown): { resto: unknown; status?: StatusBloco } {
  if (!ehObj(valor)) return { resto: valor };
  const chave = Object.keys(valor).find(ehChaveStatus);
  if (!chave) return { resto: valor };
  const resto: Obj = {};
  for (const [k, v] of Object.entries(valor)) if (k !== chave) resto[k] = v;
  const s = valor[chave];
  let codigo = '';
  let desc = '';
  if (ehEscalar(s)) desc = String(s);
  else if (ehObj(s)) {
    for (const [k, v] of Object.entries(s)) {
      if (!ehEscalar(v)) continue;
      const b = semAcento(semPrefixo(k));
      if (b.startsWith('COD')) codigo = String(v).trim();
      else if (b.startsWith('DESC') || b === 'MENSAGEM' || b === 'TEXTO') desc = String(v);
    }
  }
  desc = desc.trim() ? humanizarChave(desc.trim().replace(/\s+/g, '_')).replace(/^./, (x) => x.toLowerCase()) : '';
  if (!desc && !codigo) return { resto };
  const destaque = codigo !== '' && codigo !== '1';
  const texto = destaque ? `status ${codigo}${desc ? ' — ' + desc : ''}` : desc || `status ${codigo}`;
  return { resto, status: { texto, destaque } };
}

/** Bloco-indicador: só PONTUACAO escalar + exatamente uma série mensal. Esses blocos viram uma matriz única. */
function comoIndicador(resto: unknown): { pont: string; serie: Serie } | null {
  if (!ehObj(resto)) return null;
  let pont = '';
  let serie: Serie | null = null;
  for (const [k, v] of Object.entries(resto)) {
    if (vazio(v)) continue;
    if (ehEscalar(v)) { if (!ehChavePontuacao(k)) return null; pont = String(v).trim(); continue; }
    const s = serieDe(v);
    if (!s || serie) return null;
    serie = s;
  }
  return serie ? { pont: pont || '-', serie } : null;
}

function blocoSeguro(titulo: string, fazer: () => Parte[]): BlocoAnexo {
  try { return { titulo, partes: fazer() }; } catch { return { titulo, partes: [{ t: 'aviso', texto: 'bloco não renderizado' }] }; }
}

// ---- cobertura: o que o corpo do PDF já mostra (nada disto se repete no anexo) ----
/** Blocos cujo conteúdo o corpo do PDF já apresenta por inteiro. */
const BLOCOS_COBERTOS = new Set([
  'SCORES', 'SCORE', 'HIST_CONSULTAS', 'PASSAGENS_COMERCIAIS', 'CONSULTAS', 'QUADRO_SOCIETARIO', 'FATURAMENTO_PRESUMIDO',
  'VEICULOS_POR_DOCUMENTO', 'VEICULAR', 'EVENTOS_PESSOA_JURIDICA', 'PERIODO_RELACIONAMENTO_FORNECEDORES', 'CREDITO_OBTIDO',
  'COMPROMISSOS', 'PAGAMENTO_PONTUAL', 'PAGAMENTO_ATRASADO', 'COMPROMETIMENTO_FUTURO',
  // Endereço: vai para "Dados da empresa" (cadastro.endereco), nunca para o anexo.
  'SOMENTE_ENDERECO', 'ENDERECOS', 'ENDERECO',
]);
/** Campos de controle da fonte (flags e códigos internos): sem valor para a decisão, nunca impressos no anexo. */
const RUIDO_CAMPO = /^(REGISTRO_LOCALIZADO|REGISTRO_ENCONTRADO|ENCONTRADO|COD(IGO)?_IDENTIFICACAO(_\w+)?|ID_ENDERECO|COD_ENDERECO|TIPO_PESSOA|TIPO_DOCUMENTO|SEQUENCIAL|SEQ)$/;
const ehRuido = (k: string): boolean => RUIDO_CAMPO.test(semAcento(semPrefixo(k)));
/** Blocos de restrição: com ocorrências o corpo os detalha; zerados viram um nome em "Sem ocorrências em". */
const NOMES_RESTRICAO: Record<string, string> = {
  PROTESTOS: 'Protestos', PROTESTO_SINTETICO: 'Protestos', PROTESTO_ANALITICO: 'Protestos',
  PEND_FINANCEIRAS: 'Pendências financeiras', RESTRICOES_FINANCEIRAS: 'Restrições financeiras',
  ACOES_CIVEIS: 'Ações cíveis', CONTUMACIA: 'Contumácia', INFORMACOES_ALERTAS_RESTRICOES: 'Alertas',
};
const ehCheque = (b: string) => b.startsWith('CH_SEM_FUNDOS');
/** Cabeçalho da resposta e dados de contato: nunca impressos. */
const ehDescartado = (b: string) => b === 'HEADER' || b === 'EMAILS' || b === 'EMAIL' || b.startsWith('TELEFONE');

/** Campos de INFORMACOES_DA_EMPRESA que a seção "Dados da empresa" já mostra (ou que são contato). */
const EMPRESA_CONHECIDOS = new Set([
  'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'CPF', 'SITUACAO', 'DATA_SITUACAO', 'DATA_FUNDACAO', 'NATUREZA_JURIDICA', 'CNAE_PRIMARIO',
  'RAMO_ATIVIDADE_PRIMARIO', 'INSCRICAO_ESTADUAL', 'CAPITAL_SOCIAL', 'ENDERECO', 'OPCAO_TRIBUTARIA',
  'FAIXA_FUNCIONARIOS', 'NUMERO_FUNCIONARIOS', 'QUANTIDADE_FUNCIONARIOS', 'PORTE', 'PORTE_EMPRESA', 'PORTE_DA_EMPRESA',
  'NUMERO_FILIAIS', 'QUANTIDADE_FILIAIS', 'QTD_FILIAIS', 'TELEFONE', 'EMAIL', 'DDD',
  // Metadados de cadastro sem valor para a decisão de crédito (registro na junta, data em que a fonte atualizou, UF da IE).
  'NIRE', 'NIRE_UF', 'DATA_CONSULTA', 'INSCRICAO_ESTADUAL_UF', 'CNAE_SECUNDARIO', 'RAMO_ATIVIDADE_SECUNDARIO', 'RAZAO_SOCIAL_ANTERIOR',
  // Já lidos pelo mapeador (complementos) e mostrados em "Dados da empresa".
  'CNAE_SECUNDARIOS', 'CNAES_SECUNDARIOS', 'TEMPO_ATUACAO', 'TEMPO_DE_ATUACAO', 'MATRIZ_FILIAL', 'MATRIZ', 'FILIAL', 'REPRESENTANTE',
  'TIPO_ESTABELECIMENTO',
]);

const ZERO = /^0+(?:[.,]0+)?%?$/;
/** Sem nada que valha imprimir: vazio, "" ou só zeros. */
function semConteudo(v: unknown, prof = 0): boolean {
  if (v === null || v === undefined) return true;
  if (ehEscalar(v)) { const t = String(v).trim(); return t === '' || ZERO.test(t); }
  if (prof > 8) return false;
  if (Array.isArray(v)) return v.every((x) => semConteudo(x, prof + 1));
  if (ehObj(v)) return Object.values(v).every((x) => semConteudo(x, prof + 1));
  return true;
}

/** QUANTIDADE_OCORRENCIA(S) explícita do bloco, ou null. */
function quantidadeDe(v: unknown): number | null {
  if (!ehObj(v)) return null;
  for (const [k, x] of Object.entries(v)) {
    if (/^QUANTIDADE_OCORRENCIAS?$/.test(semPrefixo(k).toUpperCase()) && ehEscalar(x)) {
      const n = Number(String(x).trim().replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

const capitalizar = (t: string) => t.trim().toLowerCase().replace(/^./, (c) => c.toUpperCase());

function omitirChaves(v: unknown, chaves: Set<string>): unknown {
  if (!ehObj(v)) return v;
  const out: Obj = {};
  for (const [k, x] of Object.entries(v)) if (!chaves.has(semPrefixo(k).toUpperCase())) out[k] = x;
  return out;
}

// Títulos de INFORMACOES_ALERTAS_RESTRICOES que NUNCA viram "Alerta da fonte": o mapeador já os consome (consultas por janela e
// por mês/segmento, matriz/filial, tempo de atuação, CNAEs secundários, representante) ou são ruído informativo.
const TITULO_NAO_ALERTA = /^(CONSULTAS?\b|ULTIMAS?\s+CONSULTAS|MATRIZ\s*\/?\s*FILIAL|TEMPO\s+DE\s+ATUACAO|CNAES?\s+SECUNDARI|REPRESENTANTE|AERONAVES?|IMOVEIS|IMOVEL)/;
const SEM_REGISTRO = /NENHUM(A)?\s+(REGISTRO|OCORRENCIA)|NAO\s+(HA|CONSTA|FORAM\s+ENCONTRAD)|SEM\s+(REGISTRO|OCORRENCIA)/;
const NIVEL_INFORMACAO = /^(INFORMACAO|INFORMATIVO|INFO|INFORMATIVA)$/;
const NIVEL_CONHECIDO = /^(INFORMACAO|INFORMATIVO|INFORMATIVA|INFO|AVISO|ALERTA|ATENCAO|RESTRICAO|CRITICO|CRITICA|ALTO|ALTA|MEDIO|MEDIA|BAIXO|BAIXA|GRAVE)$/;

/**
 * INFORMACOES_ALERTAS_RESTRICOES: só alertas/restrições de verdade, uma linha por alerta distinto, sem o nível ("— 1 — informacao").
 * Fora: títulos já consumidos pelo mapeador, "nenhum registro encontrado", "quantidade total: 0" e informação sem conteúdo.
 */
function alertasDe(resto: unknown): string[] {
  if (!ehObj(resto) || !Array.isArray(resto.OCORRENCIAS)) return [];
  const out = new Map<string, string>();
  for (const o of resto.OCORRENCIAS) {
    if (!ehObj(o)) continue;
    let titulo = '';
    let obs = '';
    let nivel = '';
    const outros: string[] = [];
    for (const [k, v] of Object.entries(o)) {
      const chave = semPrefixo(k).toUpperCase();
      const lista = Array.isArray(v) ? v.filter(ehEscalar) : [v];
      const t = lista.filter(ehEscalar).map((x) => valorSeguro(k, String(x)) ?? '').filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (chave.startsWith('TITULO') || chave === 'TITLE') titulo = t;
      else if (chave.startsWith('OBS')) obs = t;
      else if (NIVEL_CONHECIDO.test(semAcento(t).trim())) nivel = semAcento(t).trim();
      else if (!/^\d+$/.test(t) && !ehRuido(k)) outros.push(t);
    }
    const tituloNorm = semAcento(titulo).replace(/\s+/g, ' ').trim();
    const obsNorm = semAcento(obs);
    if (TITULO_NAO_ALERTA.test(tituloNorm)) continue;
    if (SEM_REGISTRO.test(obsNorm) || /:\s*0+$/.test(obs)) continue;
    const conteudo = [obs, ...outros].filter(Boolean).join(' — ');
    if (!titulo && !conteudo) continue;
    // informação (ou nível desconhecido) sem conteúdo próprio não é alerta
    if ((!nivel || NIVEL_INFORMACAO.test(nivel)) && !conteudo) continue;
    const texto = capitalizar([titulo, conteudo].filter(Boolean).join(' — '));
    out.set(semAcento(texto), texto);
  }
  return [...out.values()];
}

/** `pessoaFisica`: o documento consultado é CPF (todo contato da resposta é de pessoa física). */
export function montarAnexo(bruto: unknown, opts: { pessoaFisica: boolean }): Anexo | null {
  if (!ehObj(bruto) || !ehObj(bruto.dados)) return null;
  const dados = bruto.dados;
  const ctx: Ctx = { pf: opts.pessoaFisica };
  const anexo: Anexo = { blocos: [], avisos: [], semOcorrencias: [], alertas: [] };
  const zerados: string[] = [];
  const comConteudo = new Set<string>();
  const marcar = (nome: string, zero: boolean) => { if (zero) { if (!zerados.includes(nome)) zerados.push(nome); } else comConteudo.add(nome); };

  const indicadores: Array<{ rotulo: string; pont: string; serie: Serie }> = [];
  const ind = { bloco: null as BlocoAnexo | null };

  const adicionar = (chave: string, valor: unknown): void => {
    const b = semPrefixo(chave).trim().toUpperCase();
    if (ehDescartado(b)) return;
    const titulo = rotuloBloco(chave);
    const cb: Ctx = { pf: ctx.pf, bloco: b };
    let sep: { resto: unknown; status?: StatusBloco } = { resto: valor };
    try { sep = separarStatus(valor); } catch { /* segue sem status */ }
    if (sep.status?.destaque) anexo.avisos.push(`${titulo}: ${sep.status.texto}`);
    const nomeRestricao = ehCheque(b) ? titulo : NOMES_RESTRICAO[b];
    try {
      if (b === 'INFORMACOES_DA_EMPRESA') {
        const resto = omitirChaves(sep.resto, EMPRESA_CONHECIDOS);
        if (semConteudo(resto)) return;
        const bl = blocoSeguro('Informações da empresa (outros campos)', () => { const p: Parte[] = []; emPartes(resto, [], cb, p, 0, chave); return p; });
        if (bl.partes.length) anexo.blocos.push(bl);
        return;
      }
      if (b === 'INFORMACOES_ALERTAS_RESTRICOES') {
        const a = alertasDe(sep.resto);
        if (a.length) anexo.alertas.push(...a); else marcar('Alertas', true);
        return;
      }
      if (nomeRestricao && b !== 'CONTUMACIA') {
        marcar(nomeRestricao, quantidadeDe(sep.resto) === 0 || semConteudo(sep.resto));
        return;
      }
      if (BLOCOS_COBERTOS.has(b)) return;

      // bloco desconhecido (ou contumácia, que o corpo ainda não detalha)
      const q = quantidadeDe(sep.resto);
      if (q === 0 || semConteudo(sep.resto)) { if (q === 0 || b === 'CONTUMACIA') marcar(nomeRestricao ?? titulo, true); return; }
      const info = comoIndicador(sep.resto);
      if (info) {
        indicadores.push({ rotulo: titulo, ...info });
        if (!ind.bloco) { ind.bloco = { titulo: 'Indicadores de comportamento (12 meses)', partes: [] }; anexo.blocos.push(ind.bloco); }
        return;
      }
      const bl = blocoSeguro(titulo, () => { const p: Parte[] = []; emPartes(sep.resto, [], cb, p, 0, chave); return p; });
      if (bl.partes.length) anexo.blocos.push(bl);
    } catch {
      anexo.blocos.push({ titulo, partes: [{ t: 'aviso', texto: 'bloco não renderizado' }] });
    }
  };

  // Contêineres (CREDCADASTRAL, define_risco_*): cada filho é um bloco.
  for (const [chave, valor] of Object.entries(dados)) {
    if (ehObj(valor) && (chave.toUpperCase() === 'CREDCADASTRAL' || /^define_risco/i.test(chave))) {
      for (const [k, v] of Object.entries(valor)) adicionar(k, v);
      continue;
    }
    adicionar(chave, valor);
  }

  if (ind.bloco && indicadores.length) {
    const alvo: BlocoAnexo = ind.bloco;
    try {
      alvo.partes = matrizDe(['Indicador', 'Pontuação'], [90, 48], indicadores.map((i) => ({ fixos: [i.rotulo, i.pont], serie: i.serie })));
    } catch { alvo.partes = [{ t: 'aviso', texto: 'bloco não renderizado' }]; }
  }
  anexo.semOcorrencias = zerados.filter((n) => !comConteudo.has(n));
  return anexo;
}

// ---- dados do bruto que o CORPO do PDF mostra (empresa e comportamento comercial) ----
const credDe = (bruto: unknown): Obj | null => {
  if (!ehObj(bruto) || !ehObj(bruto.dados)) return null;
  return ehObj(bruto.dados.CREDCADASTRAL) ? bruto.dados.CREDCADASTRAL : null;
};
const achar = (o: Obj | null, chaves: string[]): string | null => {
  if (!o) return null;
  for (const [k, v] of Object.entries(o)) {
    if (chaves.includes(semPrefixo(k).toUpperCase()) && ehEscalar(v) && String(v).trim()) return String(v).trim();
  }
  return null;
};

/** Campos da empresa que o relatório mapeado não carrega (faixa de funcionários, porte, filiais). */
export function empresaExtrasDe(bruto: unknown): { funcionarios: string | null; porte: string | null; filiais: string | null } {
  const emp = ehObj(credDe(bruto)?.INFORMACOES_DA_EMPRESA) ? (credDe(bruto)?.INFORMACOES_DA_EMPRESA as Obj) : null;
  return {
    funcionarios: achar(emp, ['FAIXA_FUNCIONARIOS', 'NUMERO_FUNCIONARIOS', 'QUANTIDADE_FUNCIONARIOS']),
    porte: achar(emp, ['PORTE', 'PORTE_EMPRESA', 'PORTE_DA_EMPRESA']),
    filiais: achar(emp, ['NUMERO_FILIAIS', 'QUANTIDADE_FILIAIS', 'QTD_FILIAIS']),
  };
}

/** "SET/2026" -> "Set/2026"; data dd/mm/aaaa e o resto voltam como vieram. */
function rotuloPeriodoCheio(s: string): string {
  const p = periodo(s);
  return p ? `${abrev(p.ord % 12)}/${Math.floor(p.ord / 12)}` : s.trim();
}

interface LinhaComp { rotulo: string; serie: Serie }

/** Linhas (rótulo + série mensal) de um bloco de comportamento: indicador único, ou um item por OCORRENCIA com ITENS. */
function linhasDe(resto: unknown, base: string, ctx: Ctx): LinhaComp[] {
  if (!ehObj(resto)) return [];
  const ind = comoIndicador(resto);
  if (ind) return [{ rotulo: base || 'Indicador', serie: ind.serie }];
  const out: LinhaComp[] = [];
  const objs = Array.isArray(resto.OCORRENCIAS) ? resto.OCORRENCIAS.filter(ehObj) : [];
  for (const o of objs) {
    const rot: string[] = [];
    const series: Array<[string, Serie]> = [];
    for (const [k, v] of Object.entries(o)) {
      if (ehEscalar(v)) { if (!ehChavePontuacao(k)) { const t = textoEscalar(k, v, ctx); if (t) rot.push(t); } }
      else if (!vazio(v)) { const s = serieDe(v); if (s) series.push([k, s]); }
    }
    for (const [k, s] of series) out.push({ rotulo: [...rot, ...(series.length > 1 ? [humanizarChave(k)] : [])].join(' — ') || base, serie: s });
  }
  if (!out.length) {
    for (const [k, v] of Object.entries(resto)) {
      if (Array.isArray(v) && !vazio(v)) { const s = serieDe(v); if (s) out.push({ rotulo: base || humanizarChave(k), serie: s }); }
    }
  }
  return out;
}

const linhaVazia = (l: LinhaComp) => [...l.serie.pontos.values()].every((v) => v === '-' || v === '');

/** Mantém só os 12 meses mais recentes presentes nas linhas. */
function ultimos12(linhas: LinhaComp[]): LinhaComp[] {
  const ords = new Set<number>();
  for (const l of linhas) for (const o of l.serie.rotulos.keys()) ords.add(o);
  const manter = new Set([...ords].sort((a, b) => a - b).slice(-MAX_MESES_POR_MATRIZ));
  const filtra = <T>(m: Map<number, T>) => new Map([...m].filter(([o]) => manter.has(o)));
  return linhas.map((l) => ({ rotulo: l.rotulo, serie: { pontos: filtra(l.serie.pontos), rotulos: filtra(l.serie.rotulos) } }));
}

export interface ComportamentoBruto {
  /** Eventos do mercado ("Última compra", "Maior fatura"...) já formatados: [rótulo, "Set/2026 — R$ ..."]. */
  eventos: Array<[string, string]>;
  /** UMA matriz "últimos 12 meses" (linhas vazias omitidas), mais o comprometimento futuro se houver. */
  matriz: Parte[];
  /** "Acima de 5 anos: R$ 12.000,00  |  ..." só com as faixas que têm valor; null se tudo zero. */
  relacionamento: string | null;
}

export function comportamentoDe(bruto: unknown, pessoaFisica = false): ComportamentoBruto | null {
  const cred = credDe(bruto);
  if (!cred) return null;
  const ctx: Ctx = { pf: pessoaFisica };
  const resto = (chave: string): unknown => { const v = cred[chave]; if (v === undefined) return undefined; return separarStatus(v).resto; };

  const eventos: Array<[string, string]> = [];
  const ev = resto('EVENTOS_PESSOA_JURIDICA');
  if (ehObj(ev) && Array.isArray(ev.OCORRENCIAS)) {
    for (const o of ev.OCORRENCIAS) {
      if (!ehObj(o)) continue;
      const nome = achar(o, ['INDICADOR', 'EVENTO', 'DESCRICAO']);
      const per = achar(o, ['PERIODO', 'MES_ANO', 'DATA']);
      // VALOR é dinheiro; PONTUACAO é pontuação do bureau (NÃO é R$).
      const valor = achar(o, ['VALOR']);
      const pontos = achar(o, ['PONTUACAO']);
      const texto = [per ? rotuloPeriodoCheio(per) : '', valor ? moedaBR(valor) : ''].filter(Boolean).join(' — ');
      // Evento só com pontuação do bureau (sem valor em R$): mostra só o período.
      if (nome && (texto || per)) eventos.push([humanizarChave(nome.replace(/\s+/g, '_')), texto]);
    }
  }

  const historico: LinhaComp[] = [];
  for (const [chave, rotulo] of [['PAGAMENTO_PONTUAL', 'Pagamento pontual'], ['PAGAMENTO_ATRASADO', '']] as const) {
    for (const l of linhasDe(resto(chave), rotulo, ctx)) {
      let r = l.rotulo.replace(/^./, (c) => c.toUpperCase());
      if (chave === 'PAGAMENTO_ATRASADO') {
        const m = /^pagto\s+atrasado\s*-\s*(.+)$/i.exec(r.trim());
        const resto = (m ? m[1] : r).trim().toLowerCase();
        r = /m[eé]dia/.test(resto) ? 'Atraso médio (dias)' : `Atraso ${resto}`;
      }
      historico.push({ rotulo: r, serie: l.serie });
    }
  }
  const futuro = linhasDe(resto('COMPROMETIMENTO_FUTURO'), 'Comprometimento futuro', ctx);

  const matriz: Parte[] = [];
  const hist = ultimos12(historico).filter((l) => !linhaVazia(l));
  if (hist.length) matriz.push(...matrizDe(['Indicador'], [118], hist.map((l) => ({ fixos: [l.rotulo], serie: l.serie }))));
  const fut = futuro.filter((l) => !linhaVazia(l));
  if (fut.length) {
    matriz.push({ t: 'sub', texto: 'Comprometimento futuro' });
    matriz.push(...matrizDe(['Indicador'], [118], fut.map((l) => ({ fixos: [l.rotulo], serie: l.serie }))));
  }

  let relacionamento: string | null = null;
  const rel = resto('PERIODO_RELACIONAMENTO_FORNECEDORES');
  if (ehObj(rel) && Array.isArray(rel.OCORRENCIAS)) {
    const faixas: string[] = [];
    for (const o of rel.OCORRENCIAS) {
      if (!ehObj(o)) continue;
      const per = achar(o, ['PERIODO', 'FAIXA', 'DESCRICAO']);
      const val = achar(o, ['VALOR']);
      if (!per || !val || ZERO.test(val)) continue;
      faixas.push(`${capitalizar(per)}: ${moedaBR(val)}`);
    }
    if (faixas.length) relacionamento = faixas.join('   |   ');
  }

  if (!eventos.length && !matriz.length && !relacionamento) return null;
  return { eventos, matriz, relacionamento };
}

/** Nº de registros (linhas de tabela, pares, itens) de uma parte, para o aviso de truncamento. */
export function registrosDaParte(p: Parte): number {
  switch (p.t) {
    case 'tabela': return p.continuacao ? 0 : p.linhas.length;
    case 'ficha': return p.registros.length;
    case 'campos': return p.pares.length;
    case 'lista': return p.itens.length;
    default: return 0;
  }
}

/** HIST_CONSULTAS.QUANTIDADES (ano × mês) -> linhas [Ano, Jan..Dez]; só anos com algum valor. null se não houver. */
export function consultasPorMes(bruto: unknown): { colunas: string[]; linhas: string[][] } | null {
  if (!ehObj(bruto) || !ehObj(bruto.dados)) return null;
  const cred = ehObj(bruto.dados.CREDCADASTRAL) ? bruto.dados.CREDCADASTRAL : null;
  const hist = cred && ehObj(cred.HIST_CONSULTAS) ? cred.HIST_CONSULTAS : null;
  const q = hist?.QUANTIDADES;
  if (!Array.isArray(q)) return null;
  const linhas = linhasPorMes(q.filter(ehObj));
  if (!linhas.length) return null;
  return { colunas: COLUNAS_MESES, linhas };
}
