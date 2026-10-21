// Armazenamento do CRM: SÓ chrome.storage.local, uma chave por coleção. Sem servidor, sem login.
// Também: exportar/importar JSON (aba Dados do painel).

import { CORES_ETIQUETA, ehFase, type AbaId, type AcaoPendente, type ConfigCrm, type Contato, type Conversa, type DadosCrm, type Etiqueta, type Lembrete, type Nota, type RespostaRapida } from './crm-tipos';

export const CHAVES = {
  contatos: 'vz.contatos',
  conversas: 'vz.conversas',
  etiquetas: 'vz.etiquetas',
  lembretes: 'vz.lembretes',
  respostas: 'vz.respostas',
  config: 'vz.config',
} as const;

export type Colecao = keyof typeof CHAVES;

/** Pedido gravado pelo service worker/painel e consumido pelo content script (abrir conversa + colar rascunho). */
export const CHAVE_ACAO_PENDENTE = 'vz.acaoPendente';

export const CONFIG_PADRAO: ConfigCrm = { aba: 'todas', diasSemResposta: null, filtroEtiquetas: [] };

const COLECOES = Object.keys(CHAVES) as Colecao[];

export function dadosVazios(): DadosCrm {
  return { contatos: {}, conversas: {}, etiquetas: [], lembretes: [], respostas: [], config: { ...CONFIG_PADRAO } };
}

export function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// ── chrome.storage.local ─────────────────────────────────────────────────────

export async function carregarDados(): Promise<DadosCrm> {
  const bruto = (await chrome.storage.local.get(Object.values(CHAVES))) as Record<string, unknown>;
  const d = dadosVazios();
  const lido = {
    contatos: bruto[CHAVES.contatos],
    conversas: bruto[CHAVES.conversas],
    etiquetas: bruto[CHAVES.etiquetas],
    lembretes: bruto[CHAVES.lembretes],
    respostas: bruto[CHAVES.respostas],
    config: bruto[CHAVES.config],
  };
  const san = sanearDados(lido);
  return { ...d, ...san, config: { ...CONFIG_PADRAO, ...san.config } };
}

export async function gravar<K extends Colecao>(colecao: K, valor: DadosCrm[K]): Promise<void> {
  await chrome.storage.local.set({ [CHAVES[colecao]]: valor });
}

export async function gravarVarias(dados: Partial<DadosCrm>): Promise<void> {
  const obj: Record<string, unknown> = {};
  for (const c of COLECOES) if (dados[c] !== undefined) obj[CHAVES[c]] = dados[c];
  await chrome.storage.local.set(obj);
}

/** Avisa quando outra parte da extensão (painel, service worker) mudou uma coleção. */
export function observarMudancas(cb: (colecoes: Colecao[], mudancas: Record<string, chrome.storage.StorageChange>) => void): () => void {
  const ouvinte = (mudancas: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local') return;
    const tocadas = COLECOES.filter((c) => CHAVES[c] in mudancas);
    if (tocadas.length > 0 || CHAVE_ACAO_PENDENTE in mudancas) cb(tocadas, mudancas);
  };
  chrome.storage.onChanged.addListener(ouvinte);
  return () => chrome.storage.onChanged.removeListener(ouvinte);
}

export async function pedirAberturaDeConversa(nome: string, rascunho?: string, lembreteId?: string): Promise<void> {
  const acao: AcaoPendente = { tipo: 'abrirConversa', nome, rascunho, lembreteId, ts: Date.now() };
  await chrome.storage.local.set({ [CHAVE_ACAO_PENDENTE]: acao });
}

export function ehAcaoPendente(v: unknown): v is AcaoPendente {
  return typeof v === 'object' && v !== null && (v as AcaoPendente).tipo === 'abrirConversa' && typeof (v as AcaoPendente).nome === 'string' && typeof (v as AcaoPendente).ts === 'number';
}

// ── Sanitização (leitura do storage e da importação) ─────────────────────────

function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const str = (v: unknown, max = 5000): string | null => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sanearNota(v: unknown): Nota | null {
  const o = obj(v);
  const id = str(o?.id, 80);
  const texto = str(o?.texto);
  const criadaEm = num(o?.criadaEm);
  if (!o || !id || texto == null || criadaEm == null) return null;
  const editadaEm = num(o.editadaEm);
  return { id, texto, criadaEm, ...(editadaEm != null ? { editadaEm } : {}) };
}

function sanearContato(v: unknown): Contato | null {
  const o = obj(v);
  const chave = str(o?.chave, 200);
  const nome = str(o?.nome, 300);
  if (!o || !chave || nome == null) return null;
  const agora = Date.now();
  const notas = (Array.isArray(o.notas) ? o.notas : []).map(sanearNota).filter((n): n is Nota => n != null);
  const etiquetas = (Array.isArray(o.etiquetas) ? o.etiquetas : []).filter((e): e is string => typeof e === 'string');
  const c: Contato = { chave, nome, etiquetas, notas, criadoEm: num(o.criadoEm) ?? agora, atualizadoEm: num(o.atualizadoEm) ?? agora };
  const telefone = str(o.telefone, 40);
  if (telefone) c.telefone = telefone;
  if (ehFase(o.fase)) c.fase = o.fase;
  const ass = str(o.dispensadaAss, 2000);
  if (ass != null) {
    c.dispensadaAss = ass;
    const em = num(o.dispensadaEm);
    if (em != null) c.dispensadaEm = em;
  }
  return c;
}

function sanearConversa(v: unknown): Conversa | null {
  const o = obj(v);
  const chave = str(o?.chave, 200);
  const nome = str(o?.nome, 300);
  if (!o || !chave || nome == null) return null;
  const c: Conversa = {
    chave,
    nome,
    ultimaDeMim: typeof o.ultimaDeMim === 'boolean' ? o.ultimaDeMim : null,
    naoLida: o.naoLida === true,
    naoLidas: num(o.naoLidas) ?? 0,
    grupo: o.grupo === true,
    arquivada: o.arquivada === true,
    rotuloData: str(o.rotuloData, 40),
    dataMsg: str(o.dataMsg, 10),
    hora: str(o.hora, 5),
    previa: str(o.previa, 300) ?? '',
    ass: str(o.ass, 400) ?? '',
    desdeEm: num(o.desdeEm) ?? Date.now(),
    vistaEm: num(o.vistaEm) ?? Date.now(),
  };
  const telefone = str(o.telefone, 40);
  if (telefone) c.telefone = telefone;
  return c;
}

function sanearEtiqueta(v: unknown): Etiqueta | null {
  const o = obj(v);
  const id = str(o?.id, 80);
  const nome = str(o?.nome, 60);
  if (!o || !id || !nome) return null;
  const cor = str(o.cor, 20);
  return { id, nome, cor: cor && /^#[0-9a-f]{3,8}$/i.test(cor) ? cor : CORES_ETIQUETA[0] };
}

function sanearLembrete(v: unknown): Lembrete | null {
  const o = obj(v);
  const id = str(o?.id, 80);
  const chave = str(o?.chave, 200);
  const nome = str(o?.nome, 300);
  const venceEm = num(o?.venceEm);
  if (!o || !id || !chave || nome == null || venceEm == null) return null;
  const status = o.status === 'disparado' || o.status === 'concluido' ? o.status : 'pendente';
  const l: Lembrete = { id, chave, nome, venceEm, criadoEm: num(o.criadoEm) ?? Date.now(), status };
  const rascunho = str(o.rascunho);
  if (rascunho) l.rascunho = rascunho;
  const disparadoEm = num(o.disparadoEm);
  if (disparadoEm != null) l.disparadoEm = disparadoEm;
  return l;
}

function sanearResposta(v: unknown): RespostaRapida | null {
  const o = obj(v);
  const id = str(o?.id, 80);
  const titulo = str(o?.titulo, 120);
  const texto = str(o?.texto);
  if (!o || !id || !titulo || !texto) return null;
  return { id, titulo, atalho: (str(o.atalho, 40) ?? '').replace(/^\/+/, '').trim(), texto };
}

function sanearConfig(v: unknown): ConfigCrm {
  const o = obj(v);
  const abas: AbaId[] = ['todas', 'naoLidas', 'precisa', 'aguardando'];
  return {
    aba: abas.includes(o?.aba as AbaId) ? (o?.aba as AbaId) : 'todas',
    diasSemResposta: num(o?.diasSemResposta),
    filtroEtiquetas: (Array.isArray(o?.filtroEtiquetas) ? (o?.filtroEtiquetas as unknown[]) : []).filter((e): e is string => typeof e === 'string'),
  };
}

function mapa<T extends { chave: string }>(v: unknown, san: (x: unknown) => T | null): Record<string, T> {
  const o = obj(v);
  const r: Record<string, T> = {};
  if (!o) return r;
  for (const item of Object.values(o)) {
    const s = san(item);
    if (s) r[s.chave] = s;
  }
  return r;
}

function lista<T>(v: unknown, san: (x: unknown) => T | null): T[] {
  return (Array.isArray(v) ? v : []).map(san).filter((x): x is T => x != null);
}

/** Aceita qualquer coisa e devolve só o que tem forma válida. */
export function sanearDados(bruto: Partial<Record<Colecao, unknown>>): Partial<DadosCrm> {
  const r: Partial<DadosCrm> = {};
  if (bruto.contatos !== undefined) r.contatos = mapa(bruto.contatos, sanearContato);
  if (bruto.conversas !== undefined) r.conversas = mapa(bruto.conversas, sanearConversa);
  if (bruto.etiquetas !== undefined) r.etiquetas = lista(bruto.etiquetas, sanearEtiqueta);
  if (bruto.lembretes !== undefined) r.lembretes = lista(bruto.lembretes, sanearLembrete);
  if (bruto.respostas !== undefined) r.respostas = lista(bruto.respostas, sanearResposta);
  if (bruto.config !== undefined) r.config = sanearConfig(bruto.config);
  return r;
}

// ── Contatos ─────────────────────────────────────────────────────────────────

/** Contato da chave (cria vazio se não existir). Mexe no objeto `dados` em memória. */
export function garantirContato(dados: DadosCrm, chave: string, nome: string, agora = Date.now()): Contato {
  const atual = dados.contatos[chave];
  if (atual) return atual;
  const conversa = dados.conversas[chave];
  const novo: Contato = { chave, nome, telefone: conversa?.telefone, etiquetas: [], notas: [], criadoEm: agora, atualizadoEm: agora };
  dados.contatos[chave] = novo;
  return novo;
}

// ── Exportar / importar (JSON) ───────────────────────────────────────────────

export const VERSAO_EXPORTACAO = 1;

/** Exporta o que o usuário criou (conversas lidas da lista são derivadas e ficam de fora). */
export function exportarJson(dados: DadosCrm, agora: Date = new Date()): string {
  return JSON.stringify(
    {
      app: 'vita-zap-crm',
      versao: VERSAO_EXPORTACAO,
      exportadoEm: agora.toISOString(),
      contatos: dados.contatos,
      etiquetas: dados.etiquetas,
      lembretes: dados.lembretes,
      respostas: dados.respostas,
    },
    null,
    2,
  );
}

export interface ResumoImportacao {
  contatos: number;
  etiquetas: number;
  lembretes: number;
  respostas: number;
}

export type ResultadoImportacao = { ok: true; dados: Partial<DadosCrm>; resumo: ResumoImportacao } | { ok: false; erro: string };

export function lerImportacao(texto: string): ResultadoImportacao {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return { ok: false, erro: 'O arquivo não é um JSON válido.' };
  }
  const o = obj(bruto);
  if (!o || o.app !== 'vita-zap-crm') return { ok: false, erro: 'Este arquivo não é uma exportação do CRM do Vita Zap.' };
  if (typeof o.versao === 'number' && o.versao > VERSAO_EXPORTACAO) return { ok: false, erro: 'Exportação de uma versão mais nova da extensão. Atualize o Vita Zap.' };
  const dados = sanearDados({ contatos: o.contatos ?? {}, etiquetas: o.etiquetas ?? [], lembretes: o.lembretes ?? [], respostas: o.respostas ?? [] });
  return {
    ok: true,
    dados,
    resumo: {
      contatos: Object.keys(dados.contatos ?? {}).length,
      etiquetas: dados.etiquetas?.length ?? 0,
      lembretes: dados.lembretes?.length ?? 0,
      respostas: dados.respostas?.length ?? 0,
    },
  };
}

function mesclarPorId<T extends { id: string }>(atual: T[], novos: T[]): T[] {
  const mapaAtual = new Map(atual.map((x) => [x.id, x]));
  for (const n of novos) if (!mapaAtual.has(n.id)) mapaAtual.set(n.id, n);
  return [...mapaAtual.values()];
}

/** Mescla: o que já existe vence; entra só o que falta (contato novo, nota nova, etiqueta nova...). */
export function mesclarDados(atual: DadosCrm, importado: Partial<DadosCrm>): DadosCrm {
  const contatos: Record<string, Contato> = { ...atual.contatos };
  for (const [k, c] of Object.entries(importado.contatos ?? {})) {
    const existente = contatos[k];
    if (!existente) {
      contatos[k] = c;
      continue;
    }
    contatos[k] = {
      ...existente,
      fase: existente.fase ?? c.fase,
      etiquetas: [...new Set([...existente.etiquetas, ...c.etiquetas])],
      notas: mesclarPorId(existente.notas, c.notas),
      telefone: existente.telefone ?? c.telefone,
    };
  }
  return {
    ...atual,
    contatos,
    etiquetas: mesclarPorId(atual.etiquetas, importado.etiquetas ?? []),
    lembretes: mesclarPorId(atual.lembretes, importado.lembretes ?? []),
    respostas: mesclarPorId(atual.respostas, importado.respostas ?? []),
  };
}

/** Substitui o que o usuário criou pelo conteúdo importado (as conversas lidas ficam). */
export function substituirDados(atual: DadosCrm, importado: Partial<DadosCrm>): DadosCrm {
  return {
    ...atual,
    contatos: importado.contatos ?? {},
    etiquetas: importado.etiquetas ?? [],
    lembretes: importado.lembretes ?? [],
    respostas: importado.respostas ?? [],
  };
}
