// E-mail do lead (botão "E-mail" da faixa): regras puras. Sugestão de e-mail a partir do texto, leitura
// defensiva do que o servidor devolve (modelos, sequências, inscrições) e primeiro nome. Sem rede.

export const REGEX_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailValido(texto: string): boolean {
  const t = texto.trim();
  return t.length <= 200 && EMAIL_VALIDO.test(t);
}

/** Todos os e-mails de um texto (minúsculos, sem repetir, na ordem em que aparecem). */
export function extrairEmails(texto: string): string[] {
  const achados = texto.match(REGEX_EMAIL) ?? [];
  const out: string[] = [];
  for (const e of achados) {
    const m = e.toLowerCase().replace(/[.]+$/, '');
    if (emailValido(m) && !out.includes(m)) out.push(m);
  }
  return out;
}

/**
 * Sugestão para o campo: o e-mail mais recente das mensagens visíveis (a última mensagem primeiro), depois
 * o das notas (última linha primeiro) e por fim o do título. Só sugere; quem confirma é o atendente.
 */
export function sugerirEmail(fontes: { mensagens?: readonly string[]; notas?: string; titulo?: string }): string | null {
  for (const m of [...(fontes.mensagens ?? [])].reverse()) {
    const e = extrairEmails(m);
    if (e.length > 0) return e[e.length - 1];
  }
  for (const l of (fontes.notas ?? '').split('\n').reverse()) {
    const e = extrairEmails(l);
    if (e.length > 0) return e[e.length - 1];
  }
  return extrairEmails(fontes.titulo ?? '')[0] ?? null;
}

/** "Padaria da Ana - Maria" → "Padaria". Mesma ideia do CRM (primeiro pedaço do título), sem inventar nome. */
export function primeiroNome(titulo: string): string {
  const pedaco = titulo.split(/[-–—|/(,]/)[0] ?? titulo;
  return pedaco.trim().split(/\s+/)[0] ?? '';
}

export interface ModeloEmail {
  id: number;
  nome: string;
  assunto: string;
  html: string;
  anexos: { filename: string; content: string }[];
}

export interface SequenciaEmail {
  id: number;
  nome: string;
}

export interface InscricaoLead {
  sequencias: { sequenceId: number; nome: string; status: string; passo: number }[];
  campanhas: { nome: string; status: string }[];
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

export function modelosDe(bruto: unknown): ModeloEmail[] {
  if (!Array.isArray(bruto)) return [];
  const out: ModeloEmail[] = [];
  for (const b of bruto) {
    const t = obj(b);
    if (typeof t.id !== 'number' || typeof t.name !== 'string' || typeof t.subject !== 'string' || typeof t.htmlBody !== 'string') continue;
    const anexos = Array.isArray(t.attachments)
      ? t.attachments.map(obj).filter((a): a is { filename: string; content: string } => typeof a.filename === 'string' && typeof a.content === 'string' && a.content !== '')
      : [];
    out.push({ id: t.id, nome: t.name, assunto: t.subject, html: t.htmlBody, anexos });
  }
  return out;
}

export function sequenciasDe(bruto: unknown): SequenciaEmail[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.map(obj).filter((s) => typeof s.id === 'number' && typeof s.name === 'string').map((s) => ({ id: s.id as number, nome: s.name as string }));
}

export function inscricoesDe(bruto: unknown, taskId: number): InscricaoLead {
  const e = obj(obj(bruto)[String(taskId)]);
  const seqs = Array.isArray(e.sequences) ? e.sequences.map(obj) : [];
  const camps = Array.isArray(e.campaigns) ? e.campaigns.map(obj) : [];
  return {
    sequencias: seqs
      .filter((s) => typeof s.sequenceId === 'number' && typeof s.name === 'string')
      .map((s) => ({ sequenceId: s.sequenceId as number, nome: s.name as string, status: typeof s.status === 'string' ? s.status : '', passo: typeof s.currentStep === 'number' ? s.currentStep : 0 })),
    campanhas: camps.filter((c) => typeof c.name === 'string').map((c) => ({ nome: c.name as string, status: typeof c.status === 'string' ? c.status : '' })),
  };
}

export interface ResultadoInscricao {
  inscritos: number;
  motivos: string[];
}

export function inscricaoDe(bruto: unknown): ResultadoInscricao {
  const r = obj(bruto);
  return {
    inscritos: typeof r.enrolled === 'number' ? r.enrolled : 0,
    motivos: Array.isArray(r.skipReasons) ? r.skipReasons.filter((x): x is string => typeof x === 'string') : [],
  };
}

const ROTULO_STATUS: Record<string, string> = { active: 'ativa', paused: 'pausada', completed: 'concluída', cancelled: 'cancelada', draft: 'rascunho', sending: 'enviando', sent: 'enviada', scheduled: 'agendada' };
export const rotuloStatus = (s: string): string => ROTULO_STATUS[s] ?? s;
