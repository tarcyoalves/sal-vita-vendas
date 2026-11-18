// Interface do que a extensão faz com o CRM Lembretes (leads = tasks), fora do RepositorioContatos.
// Quem implementa: ServicoCrm (service worker, com rede). Nas outras partes da extensão há um
// proxy que manda a chamada ao service worker por mensagem (crm-transporte.ts): só um lugar fala
// com o CRM e mexe na fila. Todos os resultados são JSON puro (podem atravessar sendMessage).

import type { ErroCrm } from './crm-rede';
import type { LeadCrm, UsuarioCrm } from './crm-remoto';
import type { InscricaoLead, ModeloEmail, ResultadoInscricao, SequenciaEmail } from './crm-email';
import type { RefContato } from './crm-tipos';
import type { ClassificacaoIa } from './followup';
import type { ConversaParaIa, EstiloDoDono, ResultadoIa } from './servico-ia';
import type { AvaliacaoReativacao, ConversaReativacaoParaIa } from './reativacao';
import type { PedidoRegistroReativacao, ResultadoDesfazerAgendamento, ResultadoRegistroReativacao } from './servico-agendamentos';
import type { RefTrava, ResultadoTrava } from './trava-agendamento';
import type { ConferenciaIa, ConversaParaPedido, PedidoInterpretado, PlanoPedido } from './pedido-ia';
import type { EmailDoLead, EnvioApresentacao, PedidoApresentacao, ResultadoEmail } from './servico-email';
import type { RefEquipe } from './equipe';
import type { ItemEnvioEquipe, ItemOptOutEquipe, ResultadoContatadosEquipe, ResultadoOptOutsEquipe, ResultadoSimplesEquipe } from './servico-equipe';

/** Chaves e valores guardados pela integração (só o RepositorioLocal toca em chrome.storage). */
export interface ArmazemChaves {
  lerChave<T>(chave: string): Promise<T | undefined>;
  gravarChave(chave: string, valor: unknown): Promise<void>;
  /** Apaga as chaves que começam com `prefixo`, exceto as de `manter`. */
  limparChaves(prefixo: string, manter: readonly string[]): Promise<void>;
}

export interface FalhaFila {
  /** Quando desistimos de reenviar. */
  em: number;
  taskId: number;
  /** O que o usuário tinha digitado/pedido (para ele refazer). */
  resumo: string;
  motivo: string;
}

export interface EstadoConta {
  baseUrl: string;
  usuario: UsuarioCrm | null;
  /** Por que a sessão caiu (401, IP...), se caiu. */
  erro?: ErroCrm;
  /** Ações guardadas para reenviar quando a rede voltar (do usuário logado). */
  pendentes: number;
  falhas: FalhaFila[];
  /** Última sincronização dos lembretes do CRM. */
  sincronizadoEm: number | null;
}

export type ResultadoConta = { ok: true; conta: EstadoConta } | { ok: false; erro: ErroCrm; conta: EstadoConta };

export type EstadoLead =
  /** Modo misto: sem login nada muda. `erro` = a sessão caiu e o usuário deve entrar de novo. */
  | { tipo: 'sem-login'; erro?: ErroCrm }
  /** `desatualizado`: veio do cache local (rede ou sessão com problema). */
  | { tipo: 'lead'; lead: LeadCrm; desatualizado: boolean; pendentes: number; aviso?: ErroCrm }
  | { tipo: 'nao-encontrado'; semTelefone: boolean }
  | { tipo: 'varios'; candidatos: LeadCrm[] }
  | { tipo: 'erro'; erro: ErroCrm };

export type ResultadoBusca = { ok: true; leads: LeadCrm[] } | { ok: false; erro: ErroCrm };

export type ResultadoLead = { ok: true; lead: LeadCrm } | { ok: false; erro: ErroCrm };

/** `pendente`: sem rede, ficou na fila local e será reenviado. `guardado`: deu erro, mas o texto foi guardado na fila. */
export type ResultadoAcao = { ok: true; lead: LeadCrm; pendente: boolean } | { ok: false; erro: ErroCrm; guardado: boolean };

/** Por que os lembretes estão sendo buscados: `login` e `botao` ignoram o mínimo de 60 min; `painel` e `aba-whatsapp` o respeitam. */
export type MotivoSync = 'login' | 'painel' | 'aba-whatsapp' | 'botao';

/**
 * Por que a lista "Acompanhar" é pedida: `cache` nunca vai ao CRM; `aba` (abrir a aba) só consulta se a última
 * tentativa tem mais de 15 min; `botao` (Atualizar) sempre consulta.
 */
export type MotivoAcompanhando = 'cache' | 'aba' | 'botao';

export interface Acompanhamento {
  /** Leads com a etiqueta "Acompanhar" (sem ordem: quem ordena é ordenarAcompanhando). */
  leads: LeadCrm[];
  /** Chaves de vínculo (tel:/nome:/id:) das conversas desses leads, para filtrar a lista do WhatsApp. */
  chaves: string[];
  /** Última consulta bem-sucedida ao CRM (null = nunca consultou: só há o que a extensão viu). */
  atualizadoEm: number | null;
  /** A consulta falhou: mostra o que estava guardado. */
  desatualizado: boolean;
  aviso?: ErroCrm;
}

export type ResultadoAcompanhando = ({ ok: true } & Acompanhamento) | { ok: false; erro: ErroCrm };

export interface LeadsCRM {
  conta(): Promise<EstadoConta>;
  /** Muda o endereço do CRM (derruba a sessão: o cookie é de outro servidor). */
  definirUrl(url: string): Promise<ResultadoConta>;
  /** A senha só passa por aqui: não é guardada em lugar nenhum. */
  entrar(email: string, senha: string): Promise<ResultadoConta>;
  /** Já está logado no site do CRM neste Chrome? Conecta sem senha (um auth.me). Sem sessão: erro `nao-autenticado`. */
  conectarPelaSessao(): Promise<ResultadoConta>;
  verificarSessao(): Promise<ResultadoConta>;
  sair(): Promise<EstadoConta>;

  /** Só consulta o CRM se o cache do contato tem mais de 30 min (ou com `forcar`). */
  leadDoContato(ref: RefContato, opcoes?: { forcar?: boolean }): Promise<EstadoLead>;
  procurarLeads(q: string): Promise<ResultadoBusca>;
  vincularLead(ref: RefContato, taskId: number): Promise<ResultadoLead>;
  desvincularLead(ref: RefContato): Promise<void>;
  criarLead(ref: RefContato, nome: string, telefone: string): Promise<ResultadoLead>;

  registrarContatoNoLead(ref: RefContato, texto: string): Promise<ResultadoAcao>;
  reagendar(ref: RefContato, em: number): Promise<ResultadoAcao>;
  alterarEtiquetas(ref: RefContato, mudanca: { adicionar?: string[]; remover?: string[] }): Promise<ResultadoAcao>;
  catalogoTags(): Promise<{ ok: true; tags: Array<{ id: number; name: string; color: string }> } | { ok: false; erro: ErroCrm }>;
  marcarConvertido(ref: RefContato, valor?: number): Promise<ResultadoAcao>;
  /** Como registrarContatoNoLead, mas pela task (a aba Acompanhar do painel não tem a conversa aberta). */
  registrarContatoNaTask(taskId: number, texto: string): Promise<ResultadoAcao>;
  /** Leads com a etiqueta "Acompanhar" (cache local + no máximo 1 consulta por vez, ver MotivoAcompanhando). */
  acompanhando(motivo?: MotivoAcompanhando): Promise<ResultadoAcompanhando>;
  /** Adia o lembrete de uma task do CRM (central: "Adiar"). */
  reagendarTask(taskId: number, em: number): Promise<{ ok: true } | { ok: false; erro: ErroCrm }>;

  /** Busca tasks.reminders e atualiza o cache que a central e os alarmes usam (sem motivo = botão "Atualizar do CRM"). */
  sincronizarLembretes(motivo?: MotivoSync): Promise<{ ok: true; quantidade: number } | { ok: false; erro: ErroCrm }>;
  reenviarFila(): Promise<{ enviados: number; restantes: number }>;

  // E-mail do lead (botão "E-mail" da faixa). Cada método é UMA ação do usuário; nada periódico.
  emailDoLead(taskId: number): Promise<ResultadoEmail<EmailDoLead>>;
  /** Salvar = confirmar (decisão do dono). Devolve o lead com a nota nova. */
  salvarEmailDoLead(taskId: number, email: string): Promise<ResultadoLead>;
  modelosEmail(): Promise<ResultadoEmail<ModeloEmail[]>>;
  sequenciasEmail(): Promise<ResultadoEmail<SequenciaEmail[]>>;
  inscricoesDoLead(taskId: number): Promise<ResultadoEmail<InscricaoLead>>;
  mandarApresentacao(pedido: PedidoApresentacao): Promise<ResultadoEmail<EnvioApresentacao>>;
  inscreverNaSequencia(sequenceId: number, taskId: number): Promise<ResultadoEmail<ResultadoInscricao>>;

  // IA do follow-up (zapIa.* no CRM). Só lê texto e devolve texto: nunca envia nada. Ver servico-ia.ts.
  classificarRespostas(conversas: ConversaParaIa[]): Promise<ResultadoIa<ClassificacaoIa[]>>;
  escreverCobranca(primeiroNome: string, mensagemCampanha: string, tentativa: 1 | 2 | 3, estilo?: EstiloDoDono, contexto?: 'reativacao'): Promise<ResultadoIa<string>>;

  // Reativação por inatividade e trava de agendamento (v0.7.56). Nada aqui envia mensagem de WhatsApp.
  /** A IA lê a ÚLTIMA conversa de quem está parado e decide o que fazer (zapIa.avaliarReativacao). */
  avaliarReativacao(conversas: ConversaReativacaoParaIa[]): Promise<ResultadoIa<AvaliacaoReativacao[]>>;
  /** Um resultado por contato: livre | agendado (data) | indisponivel (falha fechada). Cache de 5 min; `forcar` consulta o CRM. */
  verificarAgendamentos(refs: RefTrava[], opcoes?: { forcar?: boolean }): Promise<ResultadoTrava[]>;
  /** Grava o resumo da última conversa (e o agendamento) no lead do CRM, sem contar como contato. */
  registrarReativacao(pedido: PedidoRegistroReativacao): Promise<ResultadoRegistroReativacao>;
  /** Desfaz o agendamento que a IA criou (tela "O que a IA fez"): só remove o lembrete, e só se ainda for o que ela gravou. */
  desfazerAgendamento(pedido: { taskId: number; agendadoEm: number }): Promise<ResultadoDesfazerAgendamento>;

  // "Não enviar mais" e contato registrado da EQUIPE (v0.7.60, zapContatos.*). Nada aqui envia mensagem de WhatsApp nem guarda texto de mensagem.
  /** Todos os "não enviar mais" do time (cache de 5 min; `forcar` consulta o CRM). */
  optOutsDaEquipe(opcoes?: { forcar?: boolean }): Promise<ResultadoOptOutsEquipe>;
  marcarOptOutsDaEquipe(itens: ItemOptOutEquipe[]): Promise<ResultadoSimplesEquipe>;
  desmarcarOptOutsDaEquipe(refs: RefEquipe[]): Promise<ResultadoSimplesEquipe>;
  registrarEnviosDaEquipe(itens: ItemEnvioEquipe[]): Promise<ResultadoSimplesEquipe>;
  /** Quem foi contatado nos últimos N dias por QUALQUER atendente (e, se pedido, quem está em "não enviar mais"). Um resultado por contato. */
  contatadosDaEquipe(refs: RefEquipe[], dias: number, opcoes?: { incluirOptOut?: boolean }): Promise<ResultadoContatadosEquipe>;

  // "Pedir à IA" e orientações do dono (v0.7.57). Nada aqui envia mensagem de WhatsApp.
  /** Passo 1: o pedido em português vira um plano (zapIa.interpretarPedido). Não lê conversa nenhuma. */
  interpretarPedido(texto: string): Promise<ResultadoIa<PedidoInterpretado>>;
  /** Passo 2: a IA diz, para cada conversa lida, se corresponde ao plano (zapIa.conferirPedido). */
  conferirPedido(plano: PlanoPedido, conversas: ConversaParaPedido[]): Promise<ResultadoIa<ConferenciaIa[]>>;
  /** Orientações fixas do dono (até 1500 caracteres): o serviço as manda em TODA chamada de IA. */
  orientacoesIa(): Promise<string>;
  salvarOrientacoesIa(texto: string): Promise<string>;
}

export const METODOS_LEADS = [
  'conta', 'definirUrl', 'entrar', 'conectarPelaSessao', 'verificarSessao', 'sair', 'leadDoContato', 'procurarLeads', 'vincularLead', 'desvincularLead',
  'criarLead', 'registrarContatoNoLead', 'reagendar', 'alterarEtiquetas', 'catalogoTags', 'marcarConvertido', 'registrarContatoNaTask', 'acompanhando', 'reagendarTask', 'sincronizarLembretes', 'reenviarFila',
  'emailDoLead', 'salvarEmailDoLead', 'modelosEmail', 'sequenciasEmail', 'inscricoesDoLead', 'mandarApresentacao', 'inscreverNaSequencia',
  'classificarRespostas', 'escreverCobranca', 'avaliarReativacao', 'verificarAgendamentos', 'registrarReativacao', 'desfazerAgendamento',
  'interpretarPedido', 'conferirPedido', 'orientacoesIa', 'salvarOrientacoesIa',
  'optOutsDaEquipe', 'marcarOptOutsDaEquipe', 'desmarcarOptOutsDaEquipe', 'registrarEnviosDaEquipe', 'contatadosDaEquipe',
] as const satisfies ReadonlyArray<keyof LeadsCRM>;

export function ehLeadsCRM(r: unknown): r is LeadsCRM {
  return typeof r === 'object' && r !== null && typeof (r as LeadsCRM).leadDoContato === 'function';
}
