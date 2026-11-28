// Decisões puras do ciclo, da fila do Hermes e do relatório (sem banco). Testadas em
// tests/sales-operacoes.test.ts. Quem toca o banco (ciclo.ts, hermes.ts, operacoes.ts) consulta,
// chama estas funções e grava com UPDATE condicional.
import type {
  DispatchOutcome, ExceptionKind, ExceptionSeverity, InboxEventType, JourneyState, MessageStatus, ReplyClass,
  SalesCanal, SalesLimites, SalesMode, SalesModeloEmail, SalesRemetente,
} from '../../../shared/sales';
import { DISPATCH_OUTCOMES, JOURNEY_STATES, MESSAGE_STATUSES } from '../../../shared/sales';
import { transicionar, estadoPermiteProspeccao, type JourneyEvent } from './estados';
import { decidirConciliacao, modoPermiteDespacho, modoPermiteReserva, podeSerReservada } from './despacho';
import type { EntradaElegibilidade, FonteEmail } from './elegibilidade';
import { proximoPassoEm } from './arbitro';
import { montarMessageId, remetenteCompleto } from './mensagem';
import type { RelatorioVendas } from './operacoes';

// ── Fonte dos e-mails do Radar ───────────────────────────────────────────────────────────────

/** Fonte do Radar (`receita` | `busca` | `site` | `maps` | `social`) → fonte da elegibilidade. */
export function fonteEmailDoRadar(fonte: string): FonteEmail {
  switch (fonte) {
    case 'site': case 'maps': case 'social': case 'receita': return fonte;
    default: return 'outra'; // 'busca' (resultado de buscador) e qualquer valor novo
  }
}

/** Confiança (0–100) de cada origem, gravada em `public_sources.confidence`. */
export function confiancaDaFonte(fonte: string): number {
  switch (fonte) {
    case 'receita': return 90; // cadastro oficial do CNPJ (dado da empresa, não do contato)
    case 'site': return 80;
    case 'maps': return 70;
    case 'social': return 60;
    default: return 50;
  }
}

/** `contacts.channel_type` guarda o canal e a fonte do e-mail: `email:<fonte>`. */
export function canalDoContato(fonte: FonteEmail): string {
  return `email:${fonte}`;
}

export function fonteDoCanal(channelType: string | null | undefined): FonteEmail | null {
  const m = /^email:(site|maps|social|receita|inbound|outra)$/.exec(channelType ?? '');
  return m ? (m[1] as FonteEmail) : null;
}

/** `public_sources.raw_excerpt` da linha `radar_receita`: JSON com segmentos e sinais (evidências). */
export interface ExcertoRadar { origem: 'radar_premium'; segmentos: string[]; sinais: string[] }

export function codificarExcertoRadar(segmentos: readonly string[], sinais: readonly string[]): string {
  const x: ExcertoRadar = { origem: 'radar_premium', segmentos: [...segmentos], sinais: [...sinais] };
  return JSON.stringify(x);
}

export function lerExcertoRadar(raw: string | null | undefined): ExcertoRadar | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ExcertoRadar>;
    if (v?.origem !== 'radar_premium') return null;
    const arr = (a: unknown) => (Array.isArray(a) ? a.filter((s): s is string => typeof s === 'string') : []);
    return { origem: 'radar_premium', segmentos: arr(v.segmentos), sinais: arr(v.sinais) };
  } catch {
    return null;
  }
}

// ── Qualificação na ponte ────────────────────────────────────────────────────────────────────

export function qualifica(segmentos: readonly string[], evidencias: readonly string[]): boolean {
  return segmentos.length > 0 && evidencias.length > 0;
}

/**
 * Estado que a ponte aplica a uma jornada que está em IDENTIFIED ou QUALIFIED, pela máquina de
 * estados: IDENTIFIED + qualifica → QUALIFICAR; QUALIFIED + perdeu evidência → DESQUALIFICAR.
 * Qualquer outro estado não é tocado pela ponte.
 */
export function estadoNaPonte(atual: JourneyState, qualificaAgora: boolean): JourneyState {
  const evento: JourneyEvent | null = atual === 'IDENTIFIED' && qualificaAgora ? 'QUALIFICAR'
    : atual === 'QUALIFIED' && !qualificaAgora ? 'DESQUALIFICAR' : null;
  if (!evento) return atual;
  const t = transicionar(atual, evento);
  return t.ok ? t.para : atual;
}

/** O que se sabe de uma jornada para avaliar a elegibilidade (lido de contacts/companies/public_sources). */
export interface ContextoJornada {
  journeyId: number;
  companyId: number;
  contactId: number;
  email: string;
  fonte: FonteEmail | null;
  urlFonte: string | null;
  uf: string | null;
  cidade: string | null;
  empresa: string;
  empresaAtiva: boolean;
  segmentos: string[];
  evidencias: string[];
  temSite: boolean;
}

/** Monta a entrada de `avaliarElegibilidade`. Fonte desconhecida conta como 'outra' (sem bônus, sem exceção). */
export function montarEntradaElegibilidade(
  c: ContextoJornada,
  o: {
    compartilhadoPor: number;
    supressao: { premium: boolean | null; crm: boolean | null };
    passo: number;
    jaProspectado: boolean;
    canal: { ativo: boolean; politicaAprovada: boolean };
    ufsDaOnda: readonly string[];
  },
): EntradaElegibilidade {
  return {
    email: c.email,
    fonteEmail: c.fonte ?? 'outra',
    urlFonte: c.urlFonte,
    compartilhadoPor: Math.max(1, o.compartilhadoPor),
    empresaAtiva: c.empresaAtiva,
    segmentos: c.segmentos,
    evidencias: c.evidencias,
    uf: c.uf,
    ufsDaOnda: [...o.ufsDaOnda],
    supressao: o.supressao,
    passo: o.passo,
    jaProspectado: o.jaProspectado,
    canal: { ativo: o.canal.ativo, politicaAprovada: o.canal.politicaAprovada },
  };
}

// ── Contagem de motivos ──────────────────────────────────────────────────────────────────────

/** Conta cada motivo uma vez por item (ex.: por contato avaliado). */
export function contarMotivos(listas: Iterable<readonly string[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const motivos of listas) for (const m of new Set(motivos)) out[m] = (out[m] ?? 0) + 1;
  return out;
}

export function somar(acc: Record<string, number>, chave: string, n = 1): void {
  acc[chave] = (acc[chave] ?? 0) + n;
}

// ── Lote do dia ──────────────────────────────────────────────────────────────────────────────

export interface CandidatoLote {
  journeyId: number;
  companyId: number;
  score: number | null;
  elegivel: boolean;
  pausada: boolean;
}

/** Quantas mensagens novas cabem hoje. Cortadas também contam: o corte do dono não é reposto. */
export function vagasDoLote(novasEmpresasDia: number, mensagensJaNoLote: number): number {
  return Math.max(0, novasEmpresasDia - mensagensJaNoLote);
}

/**
 * Escolhe as jornadas do lote: maior score primeiro (desempate pelo id, estável), só elegíveis e
 * não pausadas, no máximo UM contato por empresa e só empresas nunca prospectadas antes.
 */
export function selecionarLote(candidatos: readonly CandidatoLote[], vagas: number, empresasJaProspectadas: ReadonlySet<number>): CandidatoLote[] {
  if (vagas <= 0) return [];
  const ordenados = candidatos
    .filter((c) => c.elegivel && !c.pausada && !empresasJaProspectadas.has(c.companyId))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.journeyId - b.journeyId);
  const empresas = new Set<number>();
  const out: CandidatoLote[] = [];
  for (const c of ordenados) {
    if (empresas.has(c.companyId)) continue;
    empresas.add(c.companyId);
    out.push(c);
    if (out.length >= vagas) break;
  }
  return out;
}

/**
 * Cancelar o passo 0 sem aprovação de lote de dia anterior só faz sentido onde a aprovação é exigida
 * (REVIEW) ou nada sai (DRY_RUN, PAUSED). Em SEMI_AUTONOMOUS/AUTONOMOUS o passo 0 nunca recebe
 * `approved_at`: expirar apagaria o lote todo dia.
 */
export function modoExpiraLotes(modo: SalesMode): boolean {
  return modo === 'REVIEW' || modo === 'DRY_RUN' || modo === 'PAUSED';
}

/** Pré-requisitos para gerar QUALQUER mensagem (modelo aprovado, remetente completo, domínio do canal). */
export function preRequisitoMensagem(modelo: SalesModeloEmail, remetente: SalesRemetente, canal: SalesCanal, passo: number): string | null {
  if (modelo.status !== 'aprovado') return 'modelo_rascunho';
  if (!remetenteCompleto(remetente)) return 'remetente_incompleto';
  if (!montarMessageId('verificacao', 'verificacao', canal)) return 'dominio_do_canal_ausente';
  if (!modelo.passos[passo]) return 'modelo_sem_passo';
  return null;
}

// ── Cadência ─────────────────────────────────────────────────────────────────────────────────

/** Espera depois do ÚLTIMO passo antes de encerrar a jornada sem resposta (FIM_CADENCIA). */
export const ESPERA_FINAL_DIAS = 7;

/** Passos que a cadência pode ter: o menor entre a cadência, o teto por empresa e o modelo. */
export function totalPassos(limites: SalesLimites, modelo: SalesModeloEmail): number {
  return Math.max(0, Math.min(limites.cadenciaDias.length, limites.maxMensagensPorEmpresa, modelo.passos.length));
}

/** Depois de um envio aceito: quando age a cadência (próximo passo, ou encerrar sem resposta). */
export function proximaAcaoAposEnvio(passo: number, enviadoEm: Date, limites: SalesLimites, total: number): { tipo: 'passo' | 'encerrar'; em: Date } {
  const prox = passo + 1 < total ? proximoPassoEm(passo, enviadoEm, limites) : null;
  if (prox) return { tipo: 'passo', em: prox };
  return { tipo: 'encerrar', em: new Date(enviadoEm.getTime() + ESPERA_FINAL_DIAS * 86_400_000) };
}

export type DecisaoCadencia =
  | { tipo: 'nada' }
  | { tipo: 'gerar'; passo: number }
  | { tipo: 'encerrar'; motivo: 'fim_cadencia' | 'cadencia_interrompida' };

/**
 * O que a cadência faz com uma jornada CONTACTED. `cadenceStep` = último passo ACEITO.
 * `statusDoProximo` = status da mensagem do próximo passo, se já existir.
 */
export function decidirCadencia(e: {
  estado: JourneyState; cadenceStep: number; total: number; pausada: boolean;
  nextActionAt: Date | null; agora: Date; statusDoProximo: MessageStatus | null;
}): DecisaoCadencia {
  if (e.estado !== 'CONTACTED' || e.pausada || !e.nextActionAt || e.nextActionAt.getTime() > e.agora.getTime()) return { tipo: 'nada' };
  const prox = e.cadenceStep + 1;
  if (prox >= e.total) return { tipo: 'encerrar', motivo: 'fim_cadencia' };
  if (e.statusDoProximo === null) return { tipo: 'gerar', passo: prox };
  if (e.statusDoProximo === 'CANCELLED' || e.statusDoProximo === 'PERMANENT_FAILURE') return { tipo: 'encerrar', motivo: 'cadencia_interrompida' };
  return { tipo: 'nada' }; // pendente, em voo, UNKNOWN (conciliação humana) ou aceita aguardando gravar
}

/**
 * Herança de aprovação: um passo da cadência (≥1) só nasce aprovado se o passo 0 da mesma jornada
 * foi aprovado (lote aprovado). O registro fica explícito em `approved_by`.
 */
export function aprovacaoHerdada(passo0: { id: number; approvedAt: Date | null; batchId: number | null } | null, agora: Date): { approvedAt: Date | null; approvedBy: string | null } {
  if (!passo0?.approvedAt) return { approvedAt: null, approvedBy: null };
  return { approvedAt: agora, approvedBy: `heranca:passo0:${passo0.id}${passo0.batchId !== null ? `:lote:${passo0.batchId}` : ''}` };
}

// ── Conciliação ──────────────────────────────────────────────────────────────────────────────

/** Texto do banco → status da mensagem (desconhecido = null; quem chama decide o que fazer). */
export function statusDaMensagem(s: string | null | undefined): MessageStatus | null {
  return (MESSAGE_STATUSES as readonly string[]).includes(s ?? '') ? (s as MessageStatus) : null;
}

/** Texto do banco → estado da jornada (desconhecido = null). */
export function estadoDaJornada(s: string | null | undefined): JourneyState | null {
  return (JOURNEY_STATES as readonly string[]).includes(s ?? '') ? (s as JourneyState) : null;
}

export interface MensagemConciliacao { id: number; status: MessageStatus; fence: number; reservedUntil: Date | null; dispatchExpiresAt: Date | null }

export function planejarConciliacao<T extends MensagemConciliacao>(rows: readonly T[], agora: Date): { liberar: T[]; desconhecer: T[] } {
  const liberar: T[] = [];
  const desconhecer: T[] = [];
  for (const r of rows) {
    const d = decidirConciliacao(r.status, r.reservedUntil, r.dispatchExpiresAt, agora);
    if (d.tipo === 'liberar_reserva') liberar.push(r);
    else if (d.tipo === 'marcar_desconhecido') desconhecer.push(r);
  }
  return { liberar, desconhecer };
}

/** `sales_message_attempts.outcome` → resultado já gravado. EXPIRED (conciliação) não conta: o executor ainda pode informar. */
export function resultadoGravadoDe(outcome: string | null | undefined): DispatchOutcome | null {
  return (DISPATCH_OUTCOMES as readonly string[]).includes(outcome ?? '') ? (outcome as DispatchOutcome) : null;
}

// ── Reserva ──────────────────────────────────────────────────────────────────────────────────

/** Por que a fila não entrega nada agora (null = pode reservar). */
export function motivoSemReserva(modo: SalesMode, canal: { ativo: boolean; politicaAprovada: boolean }): string | null {
  if (!modoPermiteReserva(modo)) return `modo ${modo} não permite reservar`;
  if (!canal.ativo) return 'canal de prospecção desligado';
  if (!canal.politicaAprovada) return 'política do canal não aprovada pelo dono';
  return null;
}

export interface CandidataReserva {
  id: number;
  status: MessageStatus;
  nextRetryAt: Date | null;
  approvedAt: Date | null;
  step: number;
  email: string;
  journeyState: JourneyState | null;
  journeyPausada: boolean;
  segmentos: string[];
}

/**
 * Pré-filtro (em memória) das mensagens que podem ser reservadas. O UPDATE atômico confere tudo
 * de novo no banco. `suprimidos` = e-mails suprimidos no banco do CRM; null = a consulta falhou
 * → NADA é reservado.
 */
export function filtrarReservaveis(
  cands: readonly CandidataReserva[],
  o: { modo: SalesMode; segmentosValidados: readonly string[]; agora: Date; suprimidos: ReadonlySet<string> | null },
): { ids: number[]; suprimidas: number[]; motivo: string | null } {
  if (o.suprimidos === null) return { ids: [], suprimidas: [], motivo: 'supressao_indisponivel' };
  const ids: number[] = [];
  const suprimidas: number[] = [];
  for (const c of cands) {
    if (!podeSerReservada(c.status, c.nextRetryAt, o.agora)) continue;
    if (o.suprimidos.has(c.email.trim().toLowerCase())) { suprimidas.push(c.id); continue; }
    if (!c.journeyState || c.journeyPausada || !estadoPermiteProspeccao(c.journeyState, c.step)) continue;
    if (!modoPermiteDespacho(o.modo, c.approvedAt !== null, c.segmentos, [...o.segmentosValidados])) continue;
    ids.push(c.id);
  }
  return { ids, suprimidas, motivo: null };
}

// ── Eventos da caixa de entrada ──────────────────────────────────────────────────────────────

export const CLASSES_POSITIVAS: readonly ReplyClass[] = ['interessado', 'pediu_preco', 'pediu_informacao', 'compra_depois'];
export const CLASSES_NEGATIVAS: readonly ReplyClass[] = ['sem_interesse', 'ja_tem_fornecedor'];

export type AcaoEvento =
  | { tipo: 'transicao'; evento: JourneyEvent; aoRecusar: 'pausar' | 'nada' }
  | { tipo: 'cancelar_pendentes'; motivo: string }
  | { tipo: 'pausar'; motivo: string }
  | { tipo: 'excecao'; kind: ExceptionKind; severity: ExceptionSeverity; criarTarefaCrm: boolean }
  | { tipo: 'suprimir'; reason: 'unsubscribe' | 'complaint' | 'bounce' }
  | { tipo: 'pausar_operacao'; motivo: string };

export type PlanoEvento = { tipo: 'duplicado' } | { tipo: 'ignorado'; motivo: string } | { tipo: 'aplicar'; acoes: AcaoEvento[] };

/**
 * Efeitos de um evento da caixa de entrada. Idempotência: evento repetido (mesma chave) = nada.
 * Saída, reclamação e devolução valem SEMPRE, com ou sem jornada (a supressão protege o endereço
 * em todas as listas; a reclamação pausa a operação). Só RESPOSTA e AUTO_RESPOSTA de um e-mail
 * sem jornada são guardadas e ignoradas (não há cadência para parar).
 */
export function planejarEvento(e: { tipo: InboxEventType; classificacao: ReplyClass | null; temJornada: boolean; duplicado: boolean }): PlanoEvento {
  if (e.duplicado) return { tipo: 'duplicado' };
  if (!e.temJornada && (e.tipo === 'RESPOSTA' || e.tipo === 'AUTO_RESPOSTA')) return { tipo: 'ignorado', motivo: 'email_sem_jornada' };
  switch (e.tipo) {
    case 'RESPOSTA': {
      const c = e.classificacao;
      const tarefa: AcaoEvento = { tipo: 'excecao', kind: 'resposta_humana', severity: c && CLASSES_POSITIVAS.includes(c) ? 'alta' : 'normal', criarTarefaCrm: true };
      const cancelar: AcaoEvento = { tipo: 'cancelar_pendentes', motivo: 'resposta_humana' };
      if (c && CLASSES_POSITIVAS.includes(c)) return { tipo: 'aplicar', acoes: [{ tipo: 'transicao', evento: 'RESPOSTA_INTERESSE', aoRecusar: 'pausar' }, cancelar, tarefa] };
      if (c && CLASSES_NEGATIVAS.includes(c)) return { tipo: 'aplicar', acoes: [{ tipo: 'transicao', evento: 'RESPOSTA_NEGATIVA', aoRecusar: 'pausar' }, cancelar, tarefa] };
      // Sem classe (ou 'outro'): a cadência para e um humano decide.
      return { tipo: 'aplicar', acoes: [{ tipo: 'pausar', motivo: 'resposta_humana' }, cancelar, tarefa] };
    }
    case 'AUTO_RESPOSTA':
      // Pausa sem mudar o estado e NUNCA retoma sozinha.
      return { tipo: 'aplicar', acoes: [{ tipo: 'pausar', motivo: 'auto_resposta' }, { tipo: 'excecao', kind: 'outro', severity: 'baixa', criarTarefaCrm: false }] };
    case 'PEDIU_PARA_SAIR':
      return { tipo: 'aplicar', acoes: [{ tipo: 'suprimir', reason: 'unsubscribe' }] };
    case 'RECLAMACAO':
      // No piloto, UMA reclamação pausa toda a operação.
      return { tipo: 'aplicar', acoes: [
        { tipo: 'suprimir', reason: 'complaint' },
        { tipo: 'pausar_operacao', motivo: 'reclamacao' },
        { tipo: 'excecao', kind: 'reclamacao', severity: 'critica', criarTarefaCrm: true },
      ] };
    case 'DEVOLVIDO':
      return { tipo: 'aplicar', acoes: [{ tipo: 'suprimir', reason: 'bounce' }] };
  }
}

// ── Executores (heartbeat) ───────────────────────────────────────────────────────────────────

export const HEARTBEAT_LIMITE_MS = 10 * 60_000;

export function executorAtrasado(ultimoSinal: Date, agora: Date): boolean {
  return agora.getTime() - ultimoSinal.getTime() > HEARTBEAT_LIMITE_MS;
}

/** Janela em que um heartbeat conta como "executor ainda pode estar informando resultados". */
export const JANELA_RESULTADOS_PENDENTES_MS = 15 * 60_000;

/**
 * Executores que, num heartbeat dos últimos 15 min, disseram ter resultado de envio guardado no
 * diário local e ainda não confirmado pelo servidor. O executor manda as duas contagens:
 * `diario_pendentes` (total no diário, RESULT_PENDING) e `resultados_pendentes` (os que ficaram
 * sem resposta do servidor neste ciclo). Qualquer uma > 0 conta.
 */
export function executoresComResultadosPendentes(
  hbs: ReadonlyArray<{ executor: string; lastSeenAt: Date; payload: unknown }>, agora: Date,
): string[] {
  const out: string[] = [];
  for (const h of hbs) {
    if (agora.getTime() - h.lastSeenAt.getTime() > JANELA_RESULTADOS_PENDENTES_MS) continue;
    const p = h.payload as { contagens?: unknown } | null;
    const c = p && typeof p === 'object' && p.contagens && typeof p.contagens === 'object' ? (p.contagens as Record<string, unknown>) : null;
    if (!c) continue;
    const n = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : 0);
    if (n('resultados_pendentes') > 0 || n('diario_pendentes') > 0) out.push(h.executor);
  }
  return out;
}

/** Uma exceção por executor por hora (UTC). */
export function chaveHeartbeatAusente(executor: string, agora: Date): string {
  return `heartbeat:${executor}:${agora.toISOString().slice(0, 13)}`;
}

// ── Saída para o CRM (tarefa do atendente) ───────────────────────────────────────────────────

export function marcadorSales(idempotencyKey: string): string {
  return `[sales:${idempotencyKey}]`;
}

export interface PayloadTarefa { titulo: string; descricao: string; prioridade: 'low' | 'medium' | 'high' }

export function lerPayloadTarefa(v: unknown): PayloadTarefa | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as { titulo?: unknown; descricao?: unknown; prioridade?: unknown };
  if (typeof p.titulo !== 'string' || !p.titulo.trim()) return null;
  const prioridade = p.prioridade === 'low' || p.prioridade === 'high' ? p.prioridade : 'medium';
  return { titulo: p.titulo, descricao: typeof p.descricao === 'string' ? p.descricao : '', prioridade };
}

/**
 * Campos mínimos válidos de uma tarefa do CRM (os mesmos que `tasks.create` grava). Sem e-mail na
 * coluna `email`: a tarefa não entra em nenhum disparo do e-mail marketing do CRM.
 */
export function montarTarefaCrm(p: PayloadTarefa, o: { crmUserId: number; nomeAtendente: string; idempotencyKey: string; agora: Date }) {
  return {
    userId: o.crmUserId,
    clientId: 0,
    title: `[Vendas B2B] ${p.titulo}`.slice(0, 500),
    description: p.descricao.slice(0, 2000) || null,
    notes: `${marcadorSales(o.idempotencyKey)} Criada pelo Sal Vita Sales AI.`,
    tags: ['vendas-b2b'],
    reminderDate: o.agora,
    reminderEnabled: true,
    status: 'pending',
    priority: p.prioridade,
    assignedTo: o.nomeAtendente,
  };
}

// ── Auditoria ────────────────────────────────────────────────────────────────────────────────

/** `audit_logs.actor_type` a partir de `por` ('hermes:...' | 'sistema' | nome/id do admin). */
export function tipoDeAtor(por: string): 'ai_agent' | 'system' | 'human' {
  if (por.startsWith('hermes:') || por.startsWith('agente')) return 'ai_agent';
  if (por === 'sistema' || por.startsWith('sistema:')) return 'system';
  return 'human';
}

// ── Relatório ────────────────────────────────────────────────────────────────────────────────

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const RELATORIO_MAX_DIAS = 366;

/** Período do relatório em dias de São Paulo (inclusive). */
export function intervaloRelatorio(de: string, ate: string): { ok: true; inicio: Date; fim: Date } | { ok: false; erro: string } {
  if (!DIA_RE.test(de) || !DIA_RE.test(ate)) return { ok: false, erro: 'use datas YYYY-MM-DD' };
  const inicio = new Date(`${de}T00:00:00.000-03:00`);
  const fim = new Date(`${ate}T23:59:59.999-03:00`);
  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime())) return { ok: false, erro: 'data inválida' };
  if (inicio.getTime() > fim.getTime()) return { ok: false, erro: '"de" depois de "ate"' };
  if ((fim.getTime() - inicio.getTime()) / 86_400_000 > RELATORIO_MAX_DIAS) return { ok: false, erro: `período maior que ${RELATORIO_MAX_DIAS} dias` };
  return { ok: true, inicio, fim };
}

/** "123.45" / "123,45" / "R$ 1.234,56" → centavos. Inválido → 0 (nunca inventa valor). */
export function centavosDeTexto(v: string | null | undefined): number {
  if (!v) return 0;
  let s = v.replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

export interface LinhaDimensao { chave: string; contatadas: number; respostas: number; positivas: number }

/**
 * Agrega por segmento ou UF. `contatadas`: jornadas contatadas no período, cada uma com as suas
 * chaves (segmentos, ou [uf]). `respostas`: respostas humanas do período, por e-mail.
 */
export function agregarPorDimensao(
  contatadas: ReadonlyArray<{ email: string; chaves: readonly string[] }>,
  respostas: ReadonlyArray<{ email: string; positiva: boolean }>,
): LinhaDimensao[] {
  const porEmail = new Map<string, { respostas: number; positivas: number }>();
  for (const r of respostas) {
    const k = r.email.toLowerCase();
    const a = porEmail.get(k) ?? { respostas: 0, positivas: 0 };
    a.respostas += 1;
    if (r.positiva) a.positivas += 1;
    porEmail.set(k, a);
  }
  const out = new Map<string, LinhaDimensao>();
  for (const c of contatadas) {
    const r = porEmail.get(c.email.toLowerCase());
    for (const chave of new Set(c.chaves.length ? c.chaves : ['nao_informado'])) {
      const l = out.get(chave) ?? { chave, contatadas: 0, respostas: 0, positivas: 0 };
      l.contatadas += 1;
      if (r) { l.respostas += r.respostas > 0 ? 1 : 0; l.positivas += r.positivas > 0 ? 1 : 0; }
      out.set(chave, l);
    }
  }
  return [...out.values()].sort((a, b) => b.contatadas - a.contatadas || a.chave.localeCompare(b.chave));
}

export interface AgregadosRelatorio {
  de: string;
  ate: string;
  empresas: { pesquisadas: number; elegiveis: number; contatadas: number };
  mensagens: { tentadas: number; aceitas: number; devolvidas: number; desconhecidas: number; falhas: number };
  respostas: { humanas: number; positivas: number; pedidosDeSaida: number; reclamacoes: number };
  agente: { conversas: number; linksDePedido: number; encaminhadas: number; respostasBarradas: number };
  /** Vendas CONFIRMADAS por e-mail: pedido pago no site com o e-mail de um contato que recebeu mensagem antes. */
  confirmadas: { pedidos: number; caixas: number; receitaCentavos: number };
  /** Pedidos com cupom de campanha. null = não há cupom de campanha configurado. */
  pedidosComCupomCampanha: number | null;
  jornadasClientes: number;
  porSegmento: LinhaDimensao[];
  porUf: LinhaDimensao[];
}

/**
 * Monta o relatório mantendo SEPARADOS: confirmado (pedido pago com o mesmo e-mail), associado a
 * cupom de campanha, e indício (o que não prova venda). Rentabilidade nunca é calculada.
 */
export function montarRelatorio(a: AgregadosRelatorio): RelatorioVendas {
  const indicios: string[] = [];
  indicios.push('O Mercado Livre não informa a origem do comprador: vendas lá não são atribuídas à prospecção.');
  if (a.pedidosComCupomCampanha === null) indicios.push('Nenhum cupom de campanha configurado: "pedidos com cupom de campanha" fica 0.');
  if (a.jornadasClientes > 0) indicios.push(`${a.jornadasClientes} jornada(s) prospectada(s) estão como cliente (o estado não prova que a venda veio do e-mail).`);
  if (a.respostas.positivas > 0) indicios.push(`${a.respostas.positivas} resposta(s) com interesse no período (interesse não é venda).`);
  if (a.confirmadas.pedidos > 0) indicios.push(`${a.confirmadas.pedidos} pedido(s) pago(s) no site com o e-mail de um contato que recebeu mensagem antes (confirmado só pelo e-mail).`);
  return {
    de: a.de,
    ate: a.ate,
    empresas: a.empresas,
    mensagens: a.mensagens,
    respostas: a.respostas,
    agente: a.agente,
    vendas: {
      pedidosSiteComCupomCampanha: a.pedidosComCupomCampanha ?? 0,
      caixasSite: a.confirmadas.caixas,
      receitaSiteCentavos: a.confirmadas.receitaCentavos,
    },
    indicios,
    porSegmento: a.porSegmento.map((l) => ({ segmento: l.chave, contatadas: l.contatadas, respostas: l.respostas, positivas: l.positivas })),
    porUf: a.porUf.map((l) => ({ uf: l.chave, contatadas: l.contatadas, respostas: l.respostas, positivas: l.positivas })),
    rentabilidade: 'nao_calculavel',
  };
}
