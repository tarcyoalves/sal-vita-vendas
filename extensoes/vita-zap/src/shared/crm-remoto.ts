// Dados e regras puras da integração com o CRM Lembretes (tasks): formas que a extensão usa,
// leitura defensiva do que o servidor devolve, linha de contato das notas e vínculo contato→task.
// Sem rede e sem armazenamento (ver servico-crm.ts, que usa isto).

import { partesNoFuso } from './datas';
import type { ErroCrm } from './crm-rede';
import type { Lembrete, RefContato } from './crm-tipos';
import { chaveDoTelefone, normalizarTelefone } from './telefone';

export interface UsuarioCrm {
  id: number;
  name: string;
  email: string;
  role: string;
}

/** A task do CRM (lead) como a extensão a usa. Datas em epoch ms. */
export interface LeadCrm {
  id: number;
  titulo: string;
  /** Como está no CRM (dígitos, em geral sem DDI). */
  telefone: string | null;
  etiquetas: string[];
  lembreteEm: number | null;
  lembreteAtivo: boolean;
  status: string;
  ultimoContatoEm: number | null;
  contatos: number;
  convertidoEm: number | null;
  /** Notas (a busca devolve só os últimos 500 caracteres). */
  notas: string;
  /** Dono do lead. O servidor só informa na busca do admin para vincular (admin vê todos os leads). */
  responsavel?: string | null;
}

/** Item de tasks.reminders (janela de ontem até +7 dias). */
export interface LembreteCrm {
  taskId: number;
  titulo: string;
  telefone: string | null;
  venceEm: number;
}

/** Tudo o que a integração guarda em chrome.storage.local (só o RepositorioLocal lê e grava). */
export const PREFIXO_CHAVES_CRM = 'vz.crm.';
export const CHAVES_CRM = {
  /** { baseUrl, usuario, erro? }: a sessão em si é o cookie do navegador. A senha NUNCA é guardada. */
  conta: 'vz.crm.conta',
  /** chave do contato (id/telefone/nome) → id da task. */
  vinculos: 'vz.crm.vinculos',
  /** cache dos leads vistos (taskId → lead): só cache. */
  leads: 'vz.crm.leads',
  /** ações esperando a rede voltar. */
  fila: 'vz.crm.fila',
  falhas: 'vz.crm.falhas',
  /** "não achei" / "vários" por contato, com a hora da busca (não repete a consulta por 30 min). */
  buscas: 'vz.crm.buscas',
  /** tasks.reminders da última sincronização (`em` = última busca bem-sucedida). */
  lembretes: 'vz.crm.lembretes',
  /** ids de lembrete do CRM já notificados (dedupe). */
  avisados: 'vz.crm.avisados',
  /** ids de lembrete do CRM que o usuário concluiu/excluiu na extensão (some só aqui; o CRM não muda). */
  dispensados: 'vz.crm.dispensados',
} as const;

export const LIMITE_NOTAS = 5000;
export const LIMITE_TEXTO_CONTATO = 1000;

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function ms(v: unknown): number | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'string' || typeof v === 'number') {
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/** Lê uma task devolvida pelo CRM (findForWhatsapp, getById, update...). Sem id ou título válido → null. */
export function leadDeTask(bruto: unknown): LeadCrm | null {
  const t = obj(bruto);
  if (typeof t.id !== 'number' || typeof t.title !== 'string') return null;
  return {
    id: t.id,
    titulo: t.title,
    telefone: typeof t.phone === 'string' && t.phone !== '' ? t.phone : null,
    etiquetas: Array.isArray(t.tags) ? t.tags.filter((x): x is string => typeof x === 'string') : [],
    lembreteEm: ms(t.reminderDate),
    lembreteAtivo: t.reminderEnabled !== false,
    status: typeof t.status === 'string' ? t.status : 'pending',
    ultimoContatoEm: ms(t.lastContactedAt),
    contatos: typeof t.contactCount === 'number' ? t.contactCount : 0,
    convertidoEm: ms(t.convertedAt),
    notas: typeof t.notes === 'string' ? t.notes : '',
    ...(typeof t.assignedTo === 'string' && t.assignedTo.trim() !== '' ? { responsavel: t.assignedTo.trim() } : {}),
  };
}

export function lembreteDeTask(bruto: unknown): LembreteCrm | null {
  const t = obj(bruto);
  const venceEm = ms(t.reminderDate);
  if (typeof t.id !== 'number' || typeof t.title !== 'string' || venceEm == null) return null;
  return { taskId: t.id, titulo: t.title, telefone: typeof t.phone === 'string' && t.phone !== '' ? t.phone : null, venceEm };
}

// ── Lembretes do CRM dentro da central/alarmes ───────────────────────────────

/** Id do lembrete do CRM: task + horário. Se o horário mudar no CRM, é outro id (avisa de novo). */
export function idLembreteCrm(taskId: number, venceEm: number): string {
  return `crm:${taskId}:${venceEm}`;
}

export function ehLembreteCrm(id: string): boolean {
  return /^crm:\d+:\d+$/.test(id);
}

export function taskIdDoLembrete(id: string): number | null {
  const m = /^crm:(\d+):\d+$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Lembrete do CRM no formato do Lembrete local (a central e os alarmes só conhecem esse). */
export function lembreteParaCentral(l: LembreteCrm, status: Lembrete['status'], disparadoEm?: number): Lembrete {
  const tel = normalizarTelefone(l.telefone);
  return {
    id: idLembreteCrm(l.taskId, l.venceEm),
    contatoId: `crm:${l.taskId}`,
    nome: l.titulo,
    ...(tel ? { telefone: tel } : {}),
    venceEm: l.venceEm,
    criadoEm: l.venceEm,
    status,
    ...(disparadoEm != null ? { disparadoEm } : {}),
  };
}

/** Tolerância: lembrete já vencido há mais que isto, ao ser visto pela 1ª vez, não gera notificação (só aparece como vencido). */
export const TOLERANCIA_AVISO_MS = 15 * 60_000;

export const MANTER_AVISADOS_MS = 14 * 24 * 3_600_000;

// ── Notas: "Registrar contato" ───────────────────────────────────────────────

const dois = (n: number) => String(n).padStart(2, '0');

/** "[21/10/2026 14:30] texto" (fuso de Fortaleza), uma linha só. */
export function linhaDeContato(texto: string, agora: Date): string {
  const p = partesNoFuso(agora);
  const corpo = texto.replace(/\s+/g, ' ').trim();
  return `[${dois(p.dia)}/${dois(p.mes)}/${p.ano} ${dois(p.hora)}:${dois(p.minuto)}] ${corpo}`;
}

/**
 * Anexa a linha ao fim das notas; se passar do limite do CRM (5000), descarta do INÍCIO linhas INTEIRAS
 * (as mais antigas), nunca cortando uma linha no meio. A linha nova é sempre mantida; só se ela sozinha
 * passar do limite é que o fim do texto dela é encurtado (com "…"), preservando o carimbo de data.
 *
 * ⚠️ Risco de sobrescrita concorrente: o CRM só aceita as notas inteiras (`tasks.update` com `notes`), então
 * isto é ler → anexar → gravar. Se outra pessoa (ou o próprio CRM) alterar as notas dessa task entre a leitura
 * e a gravação, a edição dela se perde. A extensão sempre relê as notas imediatamente antes de anexar
 * (aplicarRemoto) para encurtar a janela, mas não elimina o risco. Linhas cortadas do início também somem do CRM.
 */
export function anexarNota(notas: string, linha: string, max = LIMITE_NOTAS): string {
  const base = notas.replace(/\s+$/, '');
  const junto = base ? `${base}\n${linha}` : linha;
  if (junto.length <= max) return junto;
  const nova = linha.length > max ? `${linha.slice(0, Math.max(0, max - 1)).trimEnd()}…` : linha;
  const linhas = base ? [...base.split('\n'), nova] : [nova];
  while (linhas.length > 1 && linhas.join('\n').length > max) linhas.shift();
  return linhas.join('\n');
}

// ── Vínculo contato → task ───────────────────────────────────────────────────

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Chaves sob as quais o vínculo é guardado/achado: id interno do contato, telefone (sem o 9 extra) e nome. */
export function chavesDoVinculo(ref: RefContato): string[] {
  const out: string[] = [];
  if (ref.contatoId) out.push(`id:${ref.contatoId}`);
  const tel = normalizarTelefone(ref.telefone);
  if (tel) out.push(`tel:${chaveDoTelefone(tel)}`);
  const nome = semAcento(ref.nome ?? '');
  if (nome) out.push(`nome:${nome}`);
  return out;
}

export function erroValidacao(mensagem: string): ErroCrm {
  return { tipo: 'validacao', mensagem };
}
