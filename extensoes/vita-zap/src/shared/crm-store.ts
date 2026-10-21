// Formato dos dados do CRM no armazenamento: chaves, valores padrão e sanitização (o que vem do
// storage ou de um arquivo importado só entra se tiver forma válida). Quem LÊ e GRAVA é o
// repositório (repositorio-local.ts): este arquivo não acessa o storage.

import { normalizarTelefone } from './telefone';
import { CORES_ETIQUETA, ehFase, type AbaId, type AcaoPendente, type ConfigCrm, type Contato, type Conversa, type DadosCrm, type Etiqueta, type Lembrete, type Nota, type RespostaRapida } from './crm-tipos';
import { novoId } from './id';

export { novoId };

export const CHAVES = {
  contatos: 'vz.contatos',
  conversas: 'vz.conversas',
  etiquetas: 'vz.etiquetas',
  lembretes: 'vz.lembretes',
  respostas: 'vz.respostas',
  config: 'vz.config',
} as const;

export type Colecao = keyof typeof CHAVES;

/** Pedido "abrir a conversa e colar o rascunho", gravado pelo service worker/painel e consumido pelo content script. */
export const CHAVE_ACAO_PENDENTE = 'vz.acaoPendente';

export const CONFIG_PADRAO: ConfigCrm = { aba: 'todas', diasSemResposta: null, filtroEtiquetas: [] };

export const COLECOES = Object.keys(CHAVES) as Colecao[];

export function dadosVazios(): DadosCrm {
  return { contatos: {}, conversas: {}, etiquetas: [], lembretes: [], respostas: [], config: { ...CONFIG_PADRAO } };
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
  const id = str(o?.id, 80);
  const nome = str(o?.nome, 300);
  if (!o || !id || nome == null) return null;
  const agora = Date.now();
  const notas = (Array.isArray(o.notas) ? o.notas : []).map(sanearNota).filter((n): n is Nota => n != null);
  const etiquetas = (Array.isArray(o.etiquetas) ? o.etiquetas : []).filter((e): e is string => typeof e === 'string');
  const aliases = (Array.isArray(o.aliases) ? o.aliases : []).filter((a): a is string => typeof a === 'string' && a !== '').slice(0, 50);
  const c: Contato = { id, nome, aliases, etiquetas, notas, criadoEm: num(o.criadoEm) ?? agora, atualizadoEm: num(o.atualizadoEm) ?? agora };
  const telefone = normalizarTelefone(str(o.telefone, 40));
  if (telefone) c.telefone = telefone;
  const ultimo = num(o.ultimoContatoEm);
  if (ultimo != null) c.ultimoContatoEm = ultimo;
  const convertido = num(o.convertidoEm);
  if (convertido != null) c.convertidoEm = convertido;
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
  const telefone = normalizarTelefone(str(o.telefone, 40));
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
  const contatoId = str(o?.contatoId, 80);
  const nome = str(o?.nome, 300);
  const venceEm = num(o?.venceEm);
  if (!o || !id || !contatoId || nome == null || venceEm == null) return null;
  const status = o.status === 'disparado' || o.status === 'concluido' ? o.status : 'pendente';
  const l: Lembrete = { id, contatoId, nome, venceEm, criadoEm: num(o.criadoEm) ?? Date.now(), status };
  const rascunho = str(o.rascunho);
  if (rascunho) l.rascunho = rascunho;
  const telefone = normalizarTelefone(str(o.telefone, 40));
  if (telefone) l.telefone = telefone;
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

function mapa<T>(v: unknown, san: (x: unknown) => T | null, chaveDe: (x: T) => string): Record<string, T> {
  const o = obj(v);
  const r: Record<string, T> = {};
  if (!o) return r;
  for (const item of Object.values(o)) {
    const s = san(item);
    if (s) r[chaveDe(s)] = s;
  }
  return r;
}

function lista<T>(v: unknown, san: (x: unknown) => T | null): T[] {
  return (Array.isArray(v) ? v : []).map(san).filter((x): x is T => x != null);
}

/** Aceita qualquer coisa e devolve só o que tem forma válida. */
export function sanearDados(bruto: Partial<Record<Colecao, unknown>>): Partial<DadosCrm> {
  const r: Partial<DadosCrm> = {};
  if (bruto.contatos !== undefined) r.contatos = mapa(bruto.contatos, sanearContato, (c) => c.id);
  if (bruto.conversas !== undefined) r.conversas = mapa(bruto.conversas, sanearConversa, (c) => c.chave);
  if (bruto.etiquetas !== undefined) r.etiquetas = lista(bruto.etiquetas, sanearEtiqueta);
  if (bruto.lembretes !== undefined) r.lembretes = lista(bruto.lembretes, sanearLembrete);
  if (bruto.respostas !== undefined) r.respostas = lista(bruto.respostas, sanearResposta);
  if (bruto.config !== undefined) r.config = sanearConfig(bruto.config);
  return r;
}

