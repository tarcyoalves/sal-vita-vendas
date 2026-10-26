// Operações de e-mail do lead (botão "E-mail" da faixa) sobre o cliente do CRM. Separado do ServicoCrm só para
// não inflar o arquivo; quem chama é sempre o ServicoCrm (service worker), dentro de `exclusivo`.
//
// Consumo do banco: cada função aqui é UMA ação do usuário (abrir o popover, salvar, enviar, inscrever).
// Nada é periódico. O e-mail de apresentação sai pelo Disparo Rápido do CRM (e-mail, não WhatsApp).

import type { ErroCrm } from './crm-rede';
import { erroValidacao, leadDeTask, type LeadCrm } from './crm-remoto';
import { emailValido, inscricaoDe, inscricoesDe, modelosDe, sequenciasDe, type InscricaoLead, type ModeloEmail, type ResultadoInscricao, type SequenciaEmail } from './crm-email';

export type ResultadoEmail<T> = { ok: true; valor: T } | { ok: false; erro: ErroCrm };

export interface EmailDoLead {
  email: string | null;
  confirmado: boolean;
  titulo: string;
  notas: string;
}

export interface PedidoApresentacao {
  taskId: number;
  email: string;
  nome: string;
  assunto: string;
  html: string;
  anexos?: { filename: string; content: string }[];
}

export interface EnvioApresentacao {
  campanhaId: number;
  enviados: number;
  falhas: number;
  /** Ainda não enviados (limite diário das contas, por exemplo). */
  pendentes: number;
  limiteDiario: boolean;
}

export interface ApoioEmail {
  consultar<T>(caminho: string, entrada?: unknown): Promise<T>;
  alterar<T>(caminho: string, entrada?: unknown): Promise<T>;
  chamar<T>(fn: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; erro: ErroCrm }>;
  guardarNoCache(lead: LeadCrm): Promise<void>;
}

const MAX_LOTES = 3;

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

const idValido = (n: number): boolean => Number.isInteger(n) && n > 0;
const falha = (mensagem: string): { ok: false; erro: ErroCrm } => ({ ok: false, erro: erroValidacao(mensagem) });

export async function emailDoLead(ap: ApoioEmail, taskId: number): Promise<ResultadoEmail<EmailDoLead>> {
  if (!idValido(taskId)) return falha('Lead inválido.');
  const r = await ap.chamar(() => ap.consultar<unknown>('tasks.getById', { id: taskId }));
  if (!r.ok) return r;
  const t = obj(r.valor);
  return {
    ok: true,
    valor: {
      email: typeof t.email === 'string' && t.email.trim() !== '' ? t.email.trim().toLowerCase() : null,
      confirmado: t.emailConfirmed === true,
      titulo: typeof t.title === 'string' ? t.title : '',
      notas: typeof t.notes === 'string' ? t.notes : '',
    },
  };
}

/** Salvar = confirmar (decisão do dono): tasks.setEmailFromWhatsapp grava, marca confirmado e anota a data. */
export async function salvarEmailDoLead(ap: ApoioEmail, taskId: number, email: string): Promise<{ ok: true; lead: LeadCrm } | { ok: false; erro: ErroCrm }> {
  const e = email.trim().toLowerCase();
  if (!idValido(taskId)) return falha('Lead inválido.');
  if (!emailValido(e)) return falha('Digite um e-mail válido (nome@empresa.com.br).');
  const r = await ap.chamar(() => ap.alterar<unknown>('tasks.setEmailFromWhatsapp', { taskId, email: e }));
  if (!r.ok) return r;
  const lead = leadDeTask(r.valor);
  if (!lead) return { ok: false, erro: { tipo: 'servidor', mensagem: 'Resposta inesperada do CRM.' } };
  await ap.guardarNoCache(lead);
  return { ok: true, lead };
}

export async function modelosEmail(ap: ApoioEmail): Promise<ResultadoEmail<ModeloEmail[]>> {
  const r = await ap.chamar(() => ap.consultar<unknown>('emailMarketing.listTemplatesForAttendant'));
  return r.ok ? { ok: true, valor: modelosDe(r.valor) } : r;
}

export async function sequenciasEmail(ap: ApoioEmail): Promise<ResultadoEmail<SequenciaEmail[]>> {
  const r = await ap.chamar(() => ap.consultar<unknown>('emailMarketing.listSequencesForAttendant'));
  return r.ok ? { ok: true, valor: sequenciasDe(r.valor) } : r;
}

export async function inscricoesDoLead(ap: ApoioEmail, taskId: number): Promise<ResultadoEmail<InscricaoLead>> {
  if (!idValido(taskId)) return falha('Lead inválido.');
  const r = await ap.chamar(() => ap.consultar<unknown>('emailMarketing.enrollmentsByTaskIds', { taskIds: [taskId] }));
  return r.ok ? { ok: true, valor: inscricoesDe(r.valor, taskId) } : r;
}

export async function inscreverNaSequencia(ap: ApoioEmail, sequenceId: number, taskId: number): Promise<ResultadoEmail<ResultadoInscricao>> {
  if (!idValido(sequenceId) || !idValido(taskId)) return falha('Sequência ou lead inválido.');
  const r = await ap.chamar(() => ap.alterar<unknown>('emailMarketing.enrollTasksInSequence', { sequenceId, taskIds: [taskId] }));
  return r.ok ? { ok: true, valor: inscricaoDe(r.valor) } : r;
}

/**
 * Disparo Rápido para UM destinatário: attendantBroadcast cria a campanha (o servidor só aceita e-mail
 * CONFIRMADO de lead próprio, descadastrados são descartados e há teto diário) e processBatch envia.
 */
export async function enviarApresentacao(ap: ApoioEmail, p: PedidoApresentacao): Promise<ResultadoEmail<EnvioApresentacao>> {
  const email = p.email.trim().toLowerCase();
  if (!idValido(p.taskId)) return falha('Lead inválido.');
  if (!emailValido(email)) return falha('Digite um e-mail válido.');
  if (!p.assunto.trim() || !p.html.trim()) return falha('Escolha um modelo com assunto e texto.');
  const nome = p.nome.trim();
  const criada = await ap.chamar(() =>
    ap.alterar<unknown>('emailMarketing.attendantBroadcast', {
      subject: p.assunto,
      htmlBody: p.html,
      recipients: [{ email, ...(nome ? { name: nome } : {}) }],
      ...(p.anexos && p.anexos.length > 0 ? { attachments: p.anexos } : {}),
    }),
  );
  if (!criada.ok) return criada;
  const campanhaId = obj(criada.valor).campaignId;
  if (typeof campanhaId !== 'number') return { ok: false, erro: { tipo: 'servidor', mensagem: 'Resposta inesperada do CRM.' } };

  const envio: EnvioApresentacao = { campanhaId, enviados: 0, falhas: 0, pendentes: 1, limiteDiario: false };
  for (let i = 0; i < MAX_LOTES; i++) {
    const lote = await ap.chamar(() => ap.alterar<unknown>('emailMarketing.processBatch', { campaignId: campanhaId }));
    if (!lote.ok) {
      // A campanha foi criada mas o envio falhou: o erro precisa chegar ao atendente (não some como "enviado").
      return { ok: false, erro: { ...lote.erro, mensagem: `A campanha ${campanhaId} foi criada, mas o envio falhou: ${lote.erro.mensagem}` } };
    }
    const l = obj(lote.valor);
    envio.enviados += typeof l.sentNow === 'number' ? l.sentNow : 0;
    envio.falhas += typeof l.failedNow === 'number' ? l.failedNow : 0;
    envio.pendentes = typeof l.remaining === 'number' ? l.remaining : 0;
    if (l.reason === 'daily_limit_all') {
      envio.limiteDiario = true;
      break;
    }
    if (l.done === true) break;
  }
  return { ok: true, valor: envio };
}
