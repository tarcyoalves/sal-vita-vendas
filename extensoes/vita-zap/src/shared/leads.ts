// Interface do que a extensão faz com o CRM Lembretes (leads = tasks), fora do RepositorioContatos.
// Quem implementa: ServicoCrm (service worker, com rede). Nas outras partes da extensão há um
// proxy que manda a chamada ao service worker por mensagem (crm-transporte.ts): só um lugar fala
// com o CRM e mexe na fila. Todos os resultados são JSON puro (podem atravessar sendMessage).

import type { ErroCrm } from './crm-rede';
import type { LeadCrm, UsuarioCrm } from './crm-remoto';
import type { RefContato } from './crm-tipos';

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

export interface LeadsCRM {
  conta(): Promise<EstadoConta>;
  /** Muda o endereço do CRM (derruba a sessão: o cookie é de outro servidor). */
  definirUrl(url: string): Promise<ResultadoConta>;
  /** A senha só passa por aqui: não é guardada em lugar nenhum. */
  entrar(email: string, senha: string): Promise<ResultadoConta>;
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
  marcarConvertido(ref: RefContato, valor?: number): Promise<ResultadoAcao>;
  /** Adia o lembrete de uma task do CRM (central: "Adiar"). */
  reagendarTask(taskId: number, em: number): Promise<{ ok: true } | { ok: false; erro: ErroCrm }>;

  /** Busca tasks.reminders e atualiza o cache que a central e os alarmes usam (sem motivo = botão "Atualizar do CRM"). */
  sincronizarLembretes(motivo?: MotivoSync): Promise<{ ok: true; quantidade: number } | { ok: false; erro: ErroCrm }>;
  reenviarFila(): Promise<{ enviados: number; restantes: number }>;
}

export const METODOS_LEADS = [
  'conta', 'definirUrl', 'entrar', 'verificarSessao', 'sair', 'leadDoContato', 'procurarLeads', 'vincularLead', 'desvincularLead',
  'criarLead', 'registrarContatoNoLead', 'reagendar', 'alterarEtiquetas', 'marcarConvertido', 'reagendarTask', 'sincronizarLembretes', 'reenviarFila',
] as const satisfies ReadonlyArray<keyof LeadsCRM>;

export function ehLeadsCRM(r: unknown): r is LeadsCRM {
  return typeof r === 'object' && r !== null && typeof (r as LeadsCRM).leadDoContato === 'function';
}
