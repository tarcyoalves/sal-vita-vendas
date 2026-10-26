// Regras puras de tasks.setEmailFromWhatsapp (extensão Vita Zap): o atendente digita o e-mail do lead no
// WhatsApp e salvar = confirmar (decisão do dono). Sem banco aqui para poder testar tudo isolado.
import { z } from 'zod';
import { isBlockedEmail } from '../../shared/blockedEmailDomains';

/** Mesma tag que tasks.confirmEmail/update mantêm sincronizada com tasks.emailConfirmed. */
export const TAG_EMAIL_CONFIRMADO = 'Email Confirmado';
export const LIMITE_NOTAS = 5000;

export const emailDoWhatsappInput = z.object({
  taskId: z.number().int().positive(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(200).refine((e) => !isBlockedEmail(e), 'Este domínio de e-mail não é aceito.'),
});

/** dd/mm/aaaa no fuso de Fortaleza (o mesmo do atendente). */
export function dataBr(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function notaEmailInformado(d: Date): string {
  return `E-mail informado pelo atendente via WhatsApp em ${dataBr(d)}`;
}

/** Anexa a linha ao fim das notas; passando de 5000 descarta linhas INTEIRAS do início (a nova nunca é cortada). */
export function anexarLinhaNota(notas: string | null | undefined, linha: string, max = LIMITE_NOTAS): string {
  const base = (notas ?? '').replace(/\s+$/, '');
  const linhas = base ? [...base.split('\n'), linha] : [linha];
  while (linhas.length > 1 && linhas.join('\n').length > max) linhas.shift();
  return linhas.join('\n').slice(0, max);
}

export function comTagConfirmado(tags: readonly string[] | null | undefined): string[] {
  const t = [...(tags ?? [])];
  return t.includes(TAG_EMAIL_CONFIRMADO) ? t : [...t, TAG_EMAIL_CONFIRMADO];
}

export interface TarefaEmail {
  email: string | null;
  emailConfirmed: boolean;
  tags: string[] | null;
  notes: string | null;
}

export interface PlanoEmail {
  /** false = o e-mail já era esse e já estava confirmado: não grava nada (idempotente). */
  mudou: boolean;
  emailAnterior: string | null;
  set: { email: string; emailConfirmed: true; emailConfirmedAt: Date; emailConfirmedBy: string; tags: string[]; notes: string; updatedAt: Date };
}

export function planejarEmail(t: TarefaEmail, emailNovo: string, agora: Date, quem: string): PlanoEmail {
  const anterior = t.email?.toLowerCase().trim() || null;
  const mudou = !(anterior === emailNovo && t.emailConfirmed);
  return {
    mudou,
    emailAnterior: anterior,
    set: {
      email: emailNovo,
      emailConfirmed: true,
      emailConfirmedAt: agora,
      emailConfirmedBy: quem,
      tags: comTagConfirmado(t.tags),
      notes: anexarLinhaNota(t.notes, notaEmailInformado(agora)),
      updatedAt: agora,
    },
  };
}
