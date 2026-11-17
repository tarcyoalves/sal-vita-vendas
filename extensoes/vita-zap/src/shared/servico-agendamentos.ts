// Agendamentos do CRM para a reativação e a trava (v0.7.56): consulta (zapCrm.agendamentosFuturos) e registro do resumo da
// última conversa + agendamento (zapCrm.registrarReativacao). Quem chama é o ServicoCrm (service worker), dentro de `exclusivo`.
// Cada chamada é uma ação do atendente ou do ciclo do painel aberto: nada periódico por conta própria.
//
// CONSUMO DO BANCO DO CRM: a lista de agendamentos fica em cache por 5 minutos (VALIDADE_AGENDAMENTOS_MS); muitos contatos
// são conferidos de uma vez, com UMA consulta. `forcar` ignora o cache (começo de rodada, Prévia, "Avaliar agora").

import { type ErroCrm } from './crm-rede';
import { CHAVES_CRM } from './crm-remoto';
import type { RefContato } from './crm-tipos';
import { listaDoServidor, VALIDADE_AGENDAMENTOS_MS, verificarTrava, type ListaAgendamentos, type RefTrava, type ResultadoTrava } from './trava-agendamento';

export interface ApoioAgendamentos {
  consultar<T>(caminho: string, entrada?: unknown): Promise<T>;
  alterar<T>(caminho: string, entrada?: unknown): Promise<T>;
  chamar<T>(fn: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; erro: ErroCrm }>;
  ler<T>(chave: string, padrao: T): Promise<T>;
  gravar(chave: string, valor: unknown): Promise<void>;
  relogio(): number;
  temLogin(): Promise<boolean>;
  taskDoVinculo(ref: RefContato): Promise<number | null>;
  gravarVinculo(ref: RefContato, taskId: number): Promise<void>;
}

const todos = (n: number, r: ResultadoTrava): ResultadoTrava[] => Array.from({ length: n }, () => r);

function motivoDoErro(e: ErroCrm): string {
  if (e.tipo === 'nao-encontrado') return 'o servidor do CRM ainda não tem a consulta de agendamentos (o CRM precisa estar atualizado)';
  return `CRM indisponível (${e.mensagem})`;
}

/**
 * Lista de agendamentos futuros: do cache (se tem menos de 5 min) ou do CRM. null = não deu para saber (falha fechada).
 */
export async function listarAgendamentos(ap: ApoioAgendamentos, forcar: boolean): Promise<{ lista: ListaAgendamentos } | { erro: string }> {
  if (!(await ap.temLogin())) return { erro: 'sem login no CRM' };
  const agora = ap.relogio();
  const cache = await ap.ler<ListaAgendamentos | null>(CHAVES_CRM.agendamentos, null);
  const valido = cache != null && Array.isArray(cache.itens) && typeof cache.em === 'number' && cache.em <= agora && agora - cache.em < VALIDADE_AGENDAMENTOS_MS;
  if (valido && !forcar) return { lista: cache };
  const r = await ap.chamar(() => ap.consultar<unknown>('zapCrm.agendamentosFuturos'));
  if (!r.ok) return { erro: motivoDoErro(r.erro) };
  const lista = listaDoServidor(r.valor, agora);
  if (lista === null) return { erro: 'resposta inesperada do CRM ao consultar os agendamentos' };
  await ap.gravar(CHAVES_CRM.agendamentos, lista);
  return { lista };
}

/** Um resultado por contato, na mesma ordem. Qualquer falha de leitura → `indisponivel` para todos (falha fechada). */
export async function verificarAgendamentos(ap: ApoioAgendamentos, refs: RefTrava[], opcoes: { forcar?: boolean } = {}): Promise<ResultadoTrava[]> {
  if (refs.length === 0) return [];
  const r = await listarAgendamentos(ap, opcoes.forcar === true);
  if ('erro' in r) return todos(refs.length, { tipo: 'indisponivel', motivo: r.erro });
  const vinculos = await ap.ler<Record<string, number>>(CHAVES_CRM.vinculos, {});
  const agora = ap.relogio();
  return refs.map((ref) => verificarTrava(ref, r.lista, vinculos, agora));
}

// ── Registrar a reativação no CRM ───────────────────────────────────────────

export interface PedidoRegistroReativacao {
  nome: string;
  /** Telefone conhecido do contato (qualquer formato). Sem ele, só acha lead já vinculado. */
  telefone: string | null;
  /** O texto da nota (sem data; o servidor põe o carimbo). Sem telefone/CPF. */
  linha: string;
  /** Agendamento (epoch ms) ou null. O agendamento futuro que já existe prevalece no servidor. */
  agendarEm: number | null;
  /** Cria o lead se não achar. */
  criar: boolean;
}

export type ResultadoRegistroReativacao =
  | {
      ok: true;
      taskId: number;
      criou: boolean;
      agendou: boolean;
      semAgenda?: 'agendamento_existente' | 'tarefa_encerrada' | 'data_invalida';
      agendamentoExistente?: number;
    }
  | { ok: false; codigo: 'sem_lead' | 'sem_telefone' | 'varios' | 'conflito' | 'crm'; mensagem: string };

export const LIMITE_LINHA_REATIVACAO = 700;

export async function registrarReativacao(ap: ApoioAgendamentos, p: PedidoRegistroReativacao): Promise<ResultadoRegistroReativacao> {
  if (!(await ap.temLogin())) return { ok: false, codigo: 'crm', mensagem: 'Entre no CRM na aba Dados.' };
  const linha = p.linha.replace(/\s+/g, ' ').trim().slice(0, LIMITE_LINHA_REATIVACAO);
  if (linha === '') return { ok: false, codigo: 'crm', mensagem: 'Nada a salvar.' };
  const ref: RefContato = { nome: p.nome, ...(p.telefone ? { telefone: p.telefone } : {}) };
  const taskId = await ap.taskDoVinculo(ref);
  const entrada = {
    ...(taskId != null ? { taskId } : {}),
    ...(p.telefone ? { telefone: p.telefone } : {}),
    titulo: p.nome.slice(0, 200),
    linha,
    agendarEm: p.agendarEm != null ? new Date(p.agendarEm) : null,
    criar: p.criar,
  };
  const r = await ap.chamar(() => ap.alterar<unknown>('zapCrm.registrarReativacao', entrada));
  if (!r.ok) return { ok: false, codigo: 'crm', mensagem: motivoDoErro(r.erro) };
  const o = (typeof r.valor === 'object' && r.valor !== null ? r.valor : {}) as Record<string, unknown>;
  if (o.ok !== true || typeof o.taskId !== 'number') {
    const codigo = o.codigo === 'sem_lead' || o.codigo === 'sem_telefone' || o.codigo === 'varios' || o.codigo === 'conflito' ? o.codigo : 'crm';
    return { ok: false, codigo, mensagem: typeof o.mensagem === 'string' ? o.mensagem : 'O CRM não aceitou o registro.' };
  }
  await ap.gravarVinculo(ref, o.taskId);
  const existente = o.agendamentoExistente instanceof Date ? o.agendamentoExistente.getTime() : typeof o.agendamentoExistente === 'string' ? new Date(o.agendamentoExistente).getTime() : undefined;
  const semAgenda = o.semAgenda === 'agendamento_existente' || o.semAgenda === 'tarefa_encerrada' || o.semAgenda === 'data_invalida' ? o.semAgenda : undefined;
  return {
    ok: true,
    taskId: o.taskId,
    criou: o.criou === true,
    agendou: o.agendou === true,
    ...(semAgenda ? { semAgenda } : {}),
    ...(existente != null && Number.isFinite(existente) ? { agendamentoExistente: existente } : {}),
  };
}
