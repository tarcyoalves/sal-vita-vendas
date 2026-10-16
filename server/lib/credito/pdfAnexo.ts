// Anexo do PDF de crédito: converte a RESPOSTA CRUA do provedor (credit_reports.payload_bruto) num modelo de
// apresentação genérico (seções, tabelas, listas), sem depender de mapeador. Puro: o desenho fica em pdf.ts.
//
// Regras: vazio é omitido; HEADER.DADOS_RETORNADOS/CONTROLE são ruído (vira uma linha com os blocos "1");
// CPF mascarado; telefone/e-mail de pessoa física mascarados; URLs de imagem/arquivo não são impressas.
import { humanizarChave, rotuloBloco, semPrefixo, valorSeguro } from '../../../shared/creditoRotulos';

export type Parte =
  | { t: 'sub'; texto: string }
  | { t: 'campos'; pares: Array<[string, string]> }
  | { t: 'tabela'; colunas: string[]; pesos: number[]; linhas: string[][]; continuacao: boolean }
  | { t: 'lista'; itens: string[] }
  | { t: 'aviso'; texto: string };

export interface BlocoAnexo { titulo: string; partes: Parte[] }
export interface Anexo {
  entregues: string[];
  parametros: Array<[string, string]>;
  blocos: BlocoAnexo[];
  linkOriginal: string | null;
}

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ehEscalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

const MAX_COLUNAS_POR_TABELA = 7; // incluindo a coluna identificadora repetida
const MAX_PROFUNDIDADE = 6;
const MAX_CELULA = 600;

interface Ctx { pf: boolean }

const ehPessoaFisicaMarcada = (o: Obj): boolean => {
  for (const k of ['TIPO_PESSOA', 'TIPO_DOCUMENTO']) {
    const v = o[k];
    if (typeof v === 'string' && /^(fisica|física|pf|cpf)$/i.test(v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim())) return true;
  }
  return false;
};

/** Escalar -> texto seguro ('' se vazio/URL). Escalar `false`/número entram como texto. */
function textoEscalar(chave: string, v: unknown, ctx: Ctx): string {
  if (!ehEscalar(v)) return '';
  const s = valorSeguro(chave, String(v), ctx.pf);
  if (!s) return '';
  return s.length > MAX_CELULA ? s.slice(0, MAX_CELULA - 3) + '...' : s;
}

/** Qualquer valor numa célula só (objetos/listas aninhados viram "Campo: valor; ..."). */
function textoCelula(chave: string, v: unknown, ctx: Ctx, prof = 0): string {
  if (ehEscalar(v)) return textoEscalar(chave, v, ctx);
  if (prof > 3) return '';
  if (Array.isArray(v)) return v.map((x) => textoCelula(chave, x, ctx, prof + 1)).filter(Boolean).join(', ');
  if (ehObj(v)) {
    const sub: Ctx = { pf: ctx.pf || ehPessoaFisicaMarcada(v) };
    return Object.entries(v)
      .map(([k, x]) => { const t = textoCelula(k, x, sub, prof + 1); return t ? `${humanizarChave(k)}: ${t}` : ''; })
      .filter(Boolean).join('; ');
  }
  return '';
}

const rotuloCampo = (k: string): string => {
  const b = semPrefixo(k).toUpperCase();
  if (b === 'STATUS_RETORNO') return 'Status';
  return humanizarChave(k);
};

function pesoColuna(titulo: string, valores: string[]): number {
  const maior = valores.reduce((a, v) => Math.max(a, Math.min(v.length, 60)), 0);
  const maiorPalavra = titulo.split(' ').reduce((a, w) => Math.max(a, w.length), 0);
  return Math.min(125, Math.max(44, Math.max(maiorPalavra * 5.6, maior * 5.2) + 16));
}

/** Array de objetos -> tabela(s) com TODAS as linhas; colunas = união das chaves não totalmente vazias. */
function tabelaDe(linhasBrutas: Obj[], ctx: Ctx): Parte[] {
  const chaves: string[] = [];
  for (const o of linhasBrutas) for (const k of Object.keys(o)) if (!chaves.includes(k)) chaves.push(k);
  const celulas = linhasBrutas.map((o) => {
    const c: Ctx = { pf: ctx.pf || ehPessoaFisicaMarcada(o) };
    return chaves.map((k) => textoCelula(k, o[k], c));
  });
  const usadas = chaves.map((_, j) => j).filter((j) => celulas.some((l) => l[j] !== ''));
  if (!usadas.length) return [];
  const linhas = celulas.map((l) => usadas.map((j) => l[j]));
  const titulos = usadas.map((j) => rotuloCampo(chaves[j]));
  const pesos = usadas.map((_, i) => pesoColuna(titulos[i], linhas.map((l) => l[i])));
  if (usadas.length <= MAX_COLUNAS_POR_TABELA) return [{ t: 'tabela', colunas: titulos, pesos, linhas, continuacao: false }];

  // Muitas colunas: fatias consecutivas, repetindo a 1ª coluna (identificadora) em cada uma.
  const porFatia = MAX_COLUNAS_POR_TABELA - 1;
  const partes: Parte[] = [];
  for (let ini = 1, n = 0; ini < usadas.length; ini += porFatia, n++) {
    const idx = [0, ...Array.from({ length: Math.min(porFatia, usadas.length - ini) }, (_, i) => ini + i)];
    partes.push({
      t: 'tabela', continuacao: n > 0,
      colunas: idx.map((i) => titulos[i]), pesos: idx.map((i) => pesos[i]), linhas: linhas.map((l) => idx.map((i) => l[i])),
    });
  }
  return partes;
}

/** Percorre um valor qualquer e acumula partes de apresentação. `caminho` só aparece em subtítulos. */
function emPartes(valor: unknown, caminho: string[], ctx: Ctx, saida: Parte[], prof = 0, chave = ''): void {
  if (prof > MAX_PROFUNDIDADE) return;
  if (ehEscalar(valor)) {
    const t = textoEscalar(chave, valor, ctx);
    if (t) saida.push({ t: 'campos', pares: [[chave ? rotuloCampo(chave) : 'Valor', t]] });
    return;
  }
  if (Array.isArray(valor)) {
    const objs = valor.filter(ehObj);
    const escalares = valor.filter(ehEscalar);
    if (objs.length) saida.push(...tabelaDe(objs, ctx));
    const itens = escalares.map((x) => textoEscalar(chave, x, ctx)).filter(Boolean);
    if (itens.length) saida.push({ t: 'lista', itens });
    for (const sub of valor) if (Array.isArray(sub)) emPartes(sub, caminho, ctx, saida, prof + 1, chave);
    return;
  }
  if (!ehObj(valor)) return;
  const c: Ctx = { pf: ctx.pf || ehPessoaFisicaMarcada(valor) };
  const pares: Array<[string, string]> = [];
  const filhos: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(valor)) {
    if (ehEscalar(v)) {
      const t = textoEscalar(k, v, c);
      if (t) pares.push([rotuloCampo(k), t]);
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

/** Blocos "entregues": folhas com valor "1" dentro de HEADER.DADOS_RETORNADOS (o nome do bloco é a última chave). */
function entreguesDe(header: Obj): string[] {
  const nomes: string[] = [];
  const andar = (v: unknown, k: string, prof: number): void => {
    if (prof > 5) return;
    if (ehObj(v)) { for (const [kk, x] of Object.entries(v)) andar(x, kk, prof + 1); return; }
    if (ehEscalar(v) && String(v).trim() === '1' && k) nomes.push(rotuloBloco(k));
  };
  andar(header.DADOS_RETORNADOS, '', 0);
  return [...new Set(nomes)];
}

function blocoSeguro(titulo: string, fazer: () => Parte[]): BlocoAnexo {
  try { return { titulo, partes: fazer() }; } catch { return { titulo, partes: [{ t: 'aviso', texto: 'bloco não renderizado' }] }; }
}

/** `pessoaFisica`: o documento consultado é CPF (todo contato da resposta é de pessoa física). */
export function montarAnexo(bruto: unknown, opts: { pessoaFisica: boolean }): Anexo | null {
  if (!ehObj(bruto)) return null;
  const dados = ehObj(bruto.dados) ? bruto.dados : null;
  const aux = ehObj(bruto.aux) ? bruto.aux : null;
  const link = aux && typeof aux.data === 'string' && /^https?:\/\/\S+$/i.test(aux.data.trim()) ? aux.data.trim() : null;
  if (!dados && !link) return null;

  const ctx: Ctx = { pf: opts.pessoaFisica };
  const anexo: Anexo = { entregues: [], parametros: [], blocos: [], linkOriginal: link };
  if (!dados) return anexo;

  for (const [chave, valor] of Object.entries(dados)) {
    if (chave === 'HEADER' && ehObj(valor)) {
      try {
        anexo.entregues = entreguesDe(valor);
        if (ehObj(valor.PARAMETROS)) {
          for (const [k, v] of Object.entries(valor.PARAMETROS)) {
            const t = textoCelula(k, v, ctx); if (t) anexo.parametros.push([rotuloCampo(k), t]);
          }
        }
        // demais chaves do cabeçalho (exceto o ruído) continuam visíveis
        const resto: Obj = {};
        for (const [k, v] of Object.entries(valor)) if (!['DADOS_RETORNADOS', 'CONTROLE', 'PARAMETROS'].includes(k.toUpperCase())) resto[k] = v;
        const partes: Parte[] = [];
        emPartes(resto, [], ctx, partes);
        if (partes.length) anexo.blocos.push({ titulo: 'Cabeçalho da resposta', partes });
      } catch { anexo.blocos.push({ titulo: 'Cabeçalho da resposta', partes: [{ t: 'aviso', texto: 'bloco não renderizado' }] }); }
      continue;
    }
    // Contêineres (CREDCADASTRAL e afins): cada filho é um bloco. Chave de nível 1 com filhos objeto/array vira bloco próprio.
    if (ehObj(valor) && chave.toUpperCase() === 'CREDCADASTRAL') {
      for (const [k, v] of Object.entries(valor)) {
        anexo.blocos.push(blocoSeguro(rotuloBloco(k), () => {
          const partes: Parte[] = []; emPartes(v, [], { pf: ctx.pf }, partes, 0, k); return partes;
        }));
      }
      continue;
    }
    anexo.blocos.push(blocoSeguro(rotuloBloco(chave), () => {
      const partes: Parte[] = []; emPartes(valor, [], ctx, partes, 0, chave); return partes;
    }));
  }
  return anexo;
}

/** Nº de registros (linhas de tabela, pares, itens) de uma parte, para o aviso de truncamento. */
export function registrosDaParte(p: Parte): number {
  switch (p.t) {
    case 'tabela': return p.continuacao ? 0 : p.linhas.length;
    case 'campos': return p.pares.length;
    case 'lista': return p.itens.length;
    default: return 0;
  }
}

const MESES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** HIST_CONSULTAS.QUANTIDADES (ano × mês) -> linhas [Ano, jan..dez]; só anos com algum valor. null se não houver. */
export function consultasPorMes(bruto: unknown): { colunas: string[]; linhas: string[][] } | null {
  if (!ehObj(bruto) || !ehObj(bruto.dados)) return null;
  const cred = ehObj(bruto.dados.CREDCADASTRAL) ? bruto.dados.CREDCADASTRAL : null;
  const hist = cred && ehObj(cred.HIST_CONSULTAS) ? cred.HIST_CONSULTAS : null;
  const q = hist?.QUANTIDADES;
  if (!Array.isArray(q)) return null;
  const linhas: string[][] = [];
  for (const o of q.filter(ehObj)) {
    const porMes = new Array<string>(12).fill('');
    let ano = '';
    for (const [k, v] of Object.entries(o)) {
      if (!ehEscalar(v)) continue;
      const nome = semAcento(k).trim();
      if (nome === 'ANO') { ano = String(v).trim(); continue; }
      const i = MESES3.indexOf(nome.slice(0, 3));
      if (i >= 0) porMes[i] = String(v).trim();
    }
    if (ano || porMes.some(Boolean)) linhas.push([ano || '—', ...porMes.map((m) => m || '-')]);
  }
  if (!linhas.length) return null;
  return { colunas: ['Ano', ...MESES3.map((m) => m.charAt(0) + m.slice(1).toLowerCase())], linhas };
}
