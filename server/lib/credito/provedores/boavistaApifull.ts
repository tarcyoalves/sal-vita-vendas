// Adaptador Boa Vista (SCPC) via API Full — https://doc.apifull.com.br
//
// FATOS VERIFICADOS (OpenAPI oficial, 15/10/2026):
//  - Base https://api.apifull.com.br; auth `Authorization: Bearer <token>` + `Accept: application/json`.
//  - Consulta: POST /api/scpc-boavista, corpo { link: 'scpc-boavista', document: '<dígitos>' }. NÃO enviar `pdf`.
//  - Resposta 200: { status, "API Full", dados, aux }. `dados` NÃO tem schema documentado.
//  - Endpoints legados podem devolver ERRO com HTTP 200: o `status` do CORPO é quem manda.
//  - Erro: { status, message }.   Saldo: GET /api/get-balance (mesmo Bearer).
//
// SUPOSIÇÕES (não confirmadas — por isso o mapeador abaixo é mínimo e defensivo):
//  S1. O valor de `status` que indica sucesso é um destes (comparação sem caixa/acento): ver STATUS_SUCESSO.
//      Qualquer outro valor é tratado como ERRO (falha fechada: nada é gravado como relatório).
//  S2. O score, quando existir, é um número 0..1000 sob uma das chaves de CHAVES_SCORE, direto em `dados`.
//
// TODO(credito): o mapeamento FINAL (cadastro, sócios, protestos, pendências, cheques, ações, falência, consultas
// recentes) depende da documentação da API Full + de uma resposta real SANITIZADA (sem CPF/nome de pessoa) salva em
// tests/fixtures/credito/. Até lá todos esses grupos saem `consultado:false` (a tela mostra "Não informado pela
// fonte", nunca "Nada consta"), e o bruto completo fica em credit_reports.payload_bruto para o mapeamento futuro.
//
// O token nunca é logado nem incluído em mensagem de erro.
import type { GrupoAnotacao, RelatorioCredito, TipoDocumento } from '../../../../shared/credito';
import { ErroProvedorCredito, type ProvedorCredito } from './tipos';

export const APIFULL_BASE_PADRAO = 'https://api.apifull.com.br';
export const CUSTO_BOAVISTA_REAIS = 2.75; // preço informado pelo dono (spec 15/10/2026)
const TIMEOUT_CONSULTA_MS = 20_000;
const TIMEOUT_SALDO_MS = 10_000;

// S1 — valores de `status` aceitos como sucesso (a documentação não os lista; ajustar com a 1ª resposta real).
export const STATUS_SUCESSO = ['sucesso', 'success', 'ok'];
// S2 — chaves candidatas do score em `dados`.
export const CHAVES_SCORE = ['score', 'pontuacao'];

function config() {
  const token = process.env.APIFULL_API_TOKEN || process.env.CREDITO_API_TOKEN || '';
  const base = (process.env.CREDITO_API_URL || APIFULL_BASE_PADRAO).replace(/\/+$/, '');
  // Nome do endpoint configurável (fallback de CPF de produtor rural: 'e-boavista'). Só letras, dígitos e hífen.
  const endpointBruto = process.env.CREDITO_API_ENDPOINT || 'scpc-boavista';
  const endpoint = /^[a-z0-9-]+$/i.test(endpointBruto) ? endpointBruto : 'scpc-boavista';
  return { token, base, endpoint };
}

const normaliza = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const curto = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));

export function statusIndicaSucesso(status: unknown): boolean {
  return typeof status === 'string' && STATUS_SUCESSO.includes(normaliza(status));
}

const grupoNaoConsultado = (): GrupoAnotacao => ({ consultado: false, quantidade: 0, valorTotal: null, itens: [] });

export type ConteudoMapeado = Pick<RelatorioCredito, 'score' | 'cadastro' | 'socios' | 'consultasRecentes' | 'anotacoes'>;

/**
 * Converte o corpo da API Full em conteúdo do relatório. DEFENSIVO: estrutura desconhecida → nulls e
 * `consultado:false`. Hoje só reconhece o score (suposição S2); ver TODO no topo do arquivo.
 */
export function mapearRespostaBoaVista(json: unknown): ConteudoMapeado {
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

async function chamar(url: string, init: RequestInit, timeoutMs: number): Promise<{ http: number; corpo: unknown }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal });
    const texto = await resp.text();
    let corpo: unknown = null;
    try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = null; }
    return { http: resp.status, corpo };
  } finally {
    clearTimeout(timer);
  }
}

function cabecalhos(token: string, json: boolean): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}) };
}

/** Falha de transporte → erro seguro. Registra só o nome do erro (nunca a URL com credencial nem o token). */
function erroDeRede(e: unknown): ErroProvedorCredito {
  const nome = e instanceof Error ? e.name : 'Erro';
  return new ErroProvedorCredito(
    nome === 'AbortError' ? 'O provedor de crédito demorou demais para responder. Tente novamente.' : 'Não foi possível contatar o provedor de crédito.',
    `falha de rede: ${nome}`,
  );
}

export const provedorBoaVistaApifull: ProvedorCredito = {
  nome: 'boavista_apifull',
  produto: 'Boa Vista SCPC (API Full)',
  custoReais: CUSTO_BOAVISTA_REAIS,
  async consultar(documento: string, tipo: TipoDocumento) {
    const { token, base, endpoint } = config();
    if (!token) throw new ErroProvedorCredito('Provedor de crédito não configurado.', 'APIFULL_API_TOKEN ausente');
    let resposta: { http: number; corpo: unknown };
    try {
      resposta = await chamar(`${base}/api/${endpoint}`, {
        method: 'POST',
        headers: cabecalhos(token, true),
        // `document` (não `cnpj`); sem o campo `pdf` (pede o PDF ao provedor e pode atrasar/cobrar).
        body: JSON.stringify({ link: endpoint, document: documento }),
      }, TIMEOUT_CONSULTA_MS);
    } catch (e) {
      throw erroDeRede(e);
    }
    const corpo = resposta.corpo;
    const status = ehObjeto(corpo) ? corpo.status : undefined;
    const mensagem = ehObjeto(corpo) ? curto(corpo.message) : '';
    if (resposta.http < 200 || resposta.http >= 300) {
      throw new ErroProvedorCredito(
        resposta.http === 401 || resposta.http === 403 ? 'Credencial do provedor de crédito recusada.' : 'O provedor de crédito recusou a consulta.',
        `HTTP ${resposta.http} status=${curto(status, 60)} message=${mensagem}`,
      );
    }
    // HTTP 200 pode trazer ERRO no corpo: só `status` de sucesso vale. Nada é gravado como relatório.
    if (!statusIndicaSucesso(status)) {
      throw new ErroProvedorCredito(
        'O provedor de crédito não retornou a consulta.',
        `HTTP ${resposta.http} status=${curto(status, 60)} message=${mensagem}`,
      );
    }
    const conteudo = mapearRespostaBoaVista(corpo);
    const relatorio: RelatorioCredito = {
      documento, tipo, consultadoEm: new Date().toISOString(),
      fonte: { provedor: this.nome, produto: this.produto, custoReais: this.custoReais },
      ...conteudo,
    };
    return { relatorio, bruto: corpo };
  },
};

export interface SaldoApiFull { saldo: number | null; bruto: Record<string, string | number | boolean | null> }

const CHAVES_SALDO = ['saldo', 'balance', 'credito', 'creditos', 'credits'];

/** Extrai o saldo SEM inventar estrutura: procura um número nas chaves candidatas, na raiz ou em `dados`. */
export function extrairSaldo(json: unknown): SaldoApiFull {
  const bruto: SaldoApiFull['bruto'] = {};
  if (ehObjeto(json)) {
    for (const [k, v] of Object.entries(json)) {
      if (['string', 'number', 'boolean'].includes(typeof v) || v === null) bruto[k] = typeof v === 'string' ? v.slice(0, 120) : (v as number | boolean | null);
    }
  }
  const fontes = ehObjeto(json) ? [json, ...(ehObjeto(json.dados) ? [json.dados] : [])] : [];
  for (const fonte of fontes) {
    // A API devolve {"dados":{"Saldo":25.44}} (chave com maiúscula): comparar sem diferença de caixa.
    for (const k of CHAVES_SALDO) {
      const chave = Object.keys(fonte).find((x) => x.toLowerCase() === k);
      const v = chave === undefined ? undefined : fonte[chave];
      const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : NaN;
      if (Number.isFinite(n)) return { saldo: n, bruto };
    }
  }
  return { saldo: null, bruto };
}

export async function consultarSaldoApiFull(): Promise<SaldoApiFull> {
  const { token, base } = config();
  if (!token) throw new ErroProvedorCredito('Provedor de crédito não configurado.', 'APIFULL_API_TOKEN ausente');
  let r: { http: number; corpo: unknown };
  try {
    r = await chamar(`${base}/api/get-balance`, { method: 'GET', headers: cabecalhos(token, false) }, TIMEOUT_SALDO_MS);
  } catch (e) {
    throw erroDeRede(e);
  }
  if (r.http < 200 || r.http >= 300) throw new ErroProvedorCredito('Não foi possível consultar o saldo do provedor.', `HTTP ${r.http}`);
  return extrairSaldo(r.corpo);
}
