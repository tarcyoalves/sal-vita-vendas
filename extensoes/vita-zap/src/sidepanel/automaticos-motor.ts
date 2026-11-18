// Lógica da aba "Automáticos" (v0.7.59), sem React: modo global (Desligado | Observação | Ligado), julgamento do que a IA faria,
// previsão da fila e "O que a IA fez" com Desfazer. Só mexe no IndexedDB local e, no desfazer do agendamento, no CRM (por um
// método do contrato LeadsCRM). Nunca fala com o WhatsApp.

import {
  type AcaoIa,
  type DecisaoCerta,
  type Julgamento,
  type Liberacao,
  type LinhaPlacar,
  type ModoAutomatico,
  avaliarLiberacao,
  calcularPlacar,
  julgar,
  reabrir,
} from '../shared/automaticos';
import {
  type Banco,
  apagarFollowup,
  apagarReativacao,
  desmarcarNaoEnviar,
  lerConfig,
  lerConfigFollowup,
  lerConfigReativacao,
  listarAcoesIa,
  listarCampanhas,
  listarEnvios,
  listarFollowups,
  listarJulgamentos,
  listarReativacoes,
  salvarAcaoIa,
  salvarConfigFollowup,
  salvarConfigReativacao,
  salvarFollowups,
  salvarJulgamento,
  salvarReativacoes,
} from '../shared/banco';
import { type ConfigFollowup } from '../shared/followup';
import { contarFila, preverFila, type PrevisaoDaFila } from '../shared/fila';
import { followupDaReativacao, type ConfigReativacao } from '../shared/reativacao';
import { contarEnviosHoje } from '../shared/politica';

/** O painel avisa as abas Follow-up, Reativação e Automáticos de que o modo mudou (elas recarregam a configuração). */
const ouvintesDoModo = new Set<() => void>();
export function aoMudarModo(fn: () => void): () => void {
  ouvintesDoModo.add(fn);
  return () => void ouvintesDoModo.delete(fn);
}
export const avisarMudancaDeModo = (): void => {
  for (const fn of [...ouvintesDoModo]) fn();
};

export interface VisaoAutomaticos {
  followup: ConfigFollowup;
  reativacao: ConfigReativacao;
  /** O modo que vale para os dois (o mais permissivo dos dois que estiver ativo; sem nada ativo = Desligado). */
  modo: ModoAutomatico;
  julgamentos: Julgamento[];
  pendentes: Julgamento[];
  placar: LinhaPlacar[];
  liberacao: Liberacao;
  acoes: AcaoIa[];
  fila: PrevisaoDaFila;
  /** Algum dos dois tinha o automático ligado numa versão anterior e caiu para Observação. */
  migrado: boolean;
}

export function modoGlobal(f: Pick<ConfigFollowup, 'automatico'>, r: Pick<ConfigReativacao, 'automatico'>): ModoAutomatico {
  if (f.automatico === 'ligado' || r.automatico === 'ligado') return 'ligado';
  if (f.automatico === 'observacao' || r.automatico === 'observacao') return 'observacao';
  return 'desligado';
}

export async function carregarVisao(db: Banco, agora: Date): Promise<VisaoAutomaticos> {
  const [followup, reativacao, julgamentos, acoes, followups, reativacoes, campanhas, envios, politica] = await Promise.all([
    lerConfigFollowup(db),
    lerConfigReativacao(db),
    listarJulgamentos(db),
    listarAcoesIa(db),
    listarFollowups(db),
    listarReativacoes(db),
    listarCampanhas(db),
    listarEnvios(db),
    lerConfig(db),
  ]);
  const comuns = campanhas.filter((c) => c.tipo == null && c.status !== 'concluida').reduce((s, c) => s + c.itens.filter((i) => i.status === 'pendente').length, 0);
  const ordenados = [...julgamentos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return {
    followup,
    reativacao,
    modo: modoGlobal(followup, reativacao),
    julgamentos: ordenados,
    pendentes: ordenados.filter((j) => j.veredito == null),
    placar: calcularPlacar(julgamentos),
    liberacao: avaliarLiberacao(julgamentos),
    acoes,
    fila: preverFila(contarFila(followups, reativacoes), politica.tetoDiario, contarEnviosHoje(envios, agora), comuns),
    migrado: followup.migradoParaObservacao || reativacao.migradoParaObservacao,
  };
}

// ── Modo global ──────────────────────────────────────────────────────────────

export type ResultadoModo = { ok: true; modo: ModoAutomatico } | { ok: false; motivo: string };

export const MSG_SEM_TEXTO = 'Escreva a mensagem de cobrança (aba Follow-up) ou a de reativação (aba Reativação) antes de ligar.';

/**
 * Muda o modo dos dois automáticos de uma vez.
 *  - Observação e Ligado só valem para quem tem texto do dono (sem texto, aquele automático fica Desligado).
 *  - Ligado exige `confirmouRisco` (o painel pergunta) e, pela PRIMEIRA vez, o placar: MIN_JULGAMENTOS julgamentos com
 *    MIN_ACERTO_PERCENTUAL% de acerto nas decisões que geram envio. Depois de aprovado uma vez, não pergunta de novo.
 *  - Saindo da Observação para Ligado, o que ficou só "no papel" (opt-out/agendamento/lembrete não aplicados) é reavaliado.
 */
export async function definirModo(db: Banco, modo: ModoAutomatico, opcoes: { confirmouRisco?: boolean } = {}): Promise<ResultadoModo> {
  const [f, r, julgamentos] = await Promise.all([lerConfigFollowup(db), lerConfigReativacao(db), listarJulgamentos(db)]);
  if (modo !== 'desligado' && f.textos1.length === 0 && r.textos1.length === 0) return { ok: false, motivo: MSG_SEM_TEXTO };
  const antes = modoGlobal(f, r);
  let aprovado = f.placarAprovado || r.placarAprovado;
  if (modo === 'ligado') {
    if (opcoes.confirmouRisco !== true) return { ok: false, motivo: 'É preciso confirmar o risco do envio automático para ligar.' };
    const lib = avaliarLiberacao(julgamentos);
    if (!aprovado && !lib.liberado) return { ok: false, motivo: lib.motivo ?? 'O placar da IA ainda não liberou o envio automático.' };
    aprovado = true;
  }
  const comum = { automatico: modo, migradoParaObservacao: false, placarAprovado: aprovado, ...(modo === 'ligado' ? { confirmouRisco: true, pausado: false } : {}) };
  await salvarConfigFollowup(db, { ...f, ...comum });
  await salvarConfigReativacao(db, { ...r, ...comum });
  if (modo === 'ligado' && antes !== 'ligado') await reiniciarObservados(db);
  avisarMudancaDeModo();
  return { ok: true, modo };
}

/**
 * O que foi decidido em Observação sem ser aplicado (opt-out, agendamento, lembrete) é refeito: itens do follow-up voltam a ser
 * lidos; contatos da reativação sem mensagem enviada são reavaliados do zero; os que já receberam etapa voltam a esperar resposta.
 */
export async function reiniciarObservados(db: Banco): Promise<number> {
  const [followups, registros] = await Promise.all([listarFollowups(db), listarReativacoes(db)]);
  let n = 0;
  for (const f of followups) {
    if (!f.observado) continue;
    n += 1;
    if (f.origem === 'reativacao') await apagarFollowup(db, f.id);
    else await salvarFollowups(db, [{ ...f, estado: 'monitorando', motivo: null, verificadoEm: null, observado: undefined, lembreteCriadoEm: undefined, atualizadoEm: new Date().toISOString() }]);
  }
  for (const r of registros) {
    if (!r.observado) continue;
    n += 1;
    if (r.enviados.length === 0) await apagarReativacao(db, r.chave);
    else await salvarReativacoes(db, [{ ...r, estado: 'aguardando', motivo: null, textoPronto: null, leituraRespostaEm: null, observado: undefined, atualizadoEm: new Date().toISOString() }]);
  }
  return n;
}

// ── Julgamento ───────────────────────────────────────────────────────────────

export async function julgarDecisao(db: Banco, id: string, veredito: 'acertou' | 'errou', agora: Date, extra: { motivo?: string; decisaoCerta?: DecisaoCerta | null } = {}): Promise<Julgamento | null> {
  const j = (await listarJulgamentos(db)).find((x) => x.id === id);
  if (!j) return null;
  const novo = julgar(j, veredito, agora, extra);
  await salvarJulgamento(db, novo);
  return novo;
}

export async function reabrirJulgamento(db: Banco, id: string): Promise<void> {
  const j = (await listarJulgamentos(db)).find((x) => x.id === id);
  if (j) await salvarJulgamento(db, reabrir(j));
}

// ── Desfazer ─────────────────────────────────────────────────────────────────

export interface DependenciasDesfazer {
  db: Banco;
  agora: () => Date;
  /** zapCrm.desfazerAgendamento (pelo contrato LeadsCRM). */
  desfazerAgendamento: (p: { taskId: number; agendadoEm: number }) => Promise<{ ok: true } | { ok: false; mensagem: string }>;
  /**
   * Tira do "não enviar mais" também no CRM (v0.7.60: a lista é da equipe; se só saísse daqui, a próxima sincronização a traria de volta).
   * Ausente (testes antigos): só a lista local.
   */
  desmarcarNaoEnviar?: (chave: string) => Promise<{ ok: true; mensagem: string } | { ok: false; mensagem: string }>;
}

export type ResultadoDesfazer = { ok: true; mensagem: string } | { ok: false; mensagem: string };

export async function desfazerAcao(d: DependenciasDesfazer, id: string): Promise<ResultadoDesfazer> {
  const a = (await listarAcoesIa(d.db)).find((x) => x.id === id);
  if (!a) return { ok: false, mensagem: 'Ação não encontrada.' };
  if (a.desfeitaEm) return { ok: false, mensagem: 'Esta ação já foi desfeita.' };
  if (!a.desfazer) return { ok: false, mensagem: 'Esta ação não tem como ser desfeita (uma mensagem enviada não volta).' };
  const agora = d.agora();

  if (a.desfazer.tipo === 'nao_enviar') {
    if (d.desmarcarNaoEnviar) {
      const r = await d.desmarcarNaoEnviar(a.chave);
      if (!r.ok) {
        await salvarAcaoIa(d.db, { ...a, avisoDesfazer: r.mensagem });
        return { ok: false, mensagem: r.mensagem };
      }
    } else await desmarcarNaoEnviar(d.db, a.chave);
    // O contato volta a poder receber: sai do estado "saiu" nas duas listas (não é reavaliado para enviar sozinho: você decide).
    for (const f of await listarFollowups(d.db)) {
      if (f.chave === a.chave && f.estado === 'saiu') await salvarFollowups(d.db, [{ ...f, estado: 'resolvido', motivo: 'você desfez o "não enviar mais" feito pela IA', atualizadoEm: agora.toISOString() }]);
    }
    for (const r of await listarReativacoes(d.db)) {
      if (r.chave === a.chave && r.estado === 'saiu') await salvarReativacoes(d.db, [{ ...r, estado: 'resolvido', motivo: 'você desfez o "não enviar mais" feito pela IA', reelegivelEm: agora.toISOString(), atualizadoEm: agora.toISOString() }]);
    }
    await salvarAcaoIa(d.db, { ...a, desfeitaEm: agora.toISOString(), avisoDesfazer: null });
    return { ok: true, mensagem: `${a.nome} saiu da lista "Não enviar mais".` };
  }

  const { taskId, agendadoEm } = a.desfazer;
  const r = await d.desfazerAgendamento({ taskId, agendadoEm });
  if (!r.ok) {
    await salvarAcaoIa(d.db, { ...a, avisoDesfazer: r.mensagem });
    return { ok: false, mensagem: r.mensagem };
  }
  // O contato volta para "Precisa de você": a IA não decide de novo sozinha o que o dono acabou de desfazer.
  for (const reg of await listarReativacoes(d.db)) {
    if (reg.chave !== a.chave || reg.agendadoPara == null || new Date(reg.agendadoPara).getTime() !== agendadoEm) continue;
    const novo = { ...reg, estado: 'precisa' as const, motivo: 'você desfez o agendamento feito pela IA: decida você', agendadoPara: null, diasSugeridos: undefined, reelegivelEm: null, atualizadoEm: agora.toISOString() };
    await salvarReativacoes(d.db, [novo]);
    await salvarFollowups(d.db, [followupDaReativacao(novo, agora, { estado: 'revisar', motivo: novo.motivo })]);
  }
  await salvarAcaoIa(d.db, { ...a, desfeitaEm: agora.toISOString(), avisoDesfazer: null });
  return { ok: true, mensagem: `O agendamento de ${a.nome} foi removido do CRM.` };
}
