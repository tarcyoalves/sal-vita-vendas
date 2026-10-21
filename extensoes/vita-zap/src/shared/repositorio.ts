// Interface ÚNICA de acesso aos dados do CRM (contatos, notas, etiquetas, fase, lembretes, último
// contato, respostas rápidas, conversas lidas da lista). Toda a UI (WhatsApp Web, painel lateral,
// service worker) fala só com ela, nunca com chrome.storage.
//
// Hoje a implementação é o RepositorioLocal (chrome.storage.local). Um segundo adaptador, que
// sincroniza com o CRM Lembretes (tasks: phone, notes, tags[], reminderDate, lastContactedAt,
// convertedAt), poderá implementar a mesma interface sem mexer na UI.
//
// Convenções:
// - `RefContato` identifica o contato por id interno, telefone e/ou nome exibido; o repositório
//   resolve (ver crm-contatos.ts) e cria o contato na primeira anotação;
// - telefone sempre normalizado (só dígitos, DDI 55) — ver telefone.ts;
// - nada aqui envia mensagem.

import type { ResumoImportacao } from './crm-importacao';
import type { ResultadoLembrete } from './crm-lembretes';
import type { Colecao } from './crm-store';
import type { AcaoPendente, ConfigCrm, Contato, Conversa, DadosCrm, Etiqueta, Fase, Lembrete, RefContato } from './crm-tipos';
import type { DestinoVinculo } from './crm-contatos';

export type { DestinoVinculo, RefContato };

/** O que mudou no armazenamento (por qualquer parte da extensão). */
export interface EventoRepositorio {
  colecoes: Colecao[];
  /** Chegou um pedido de abrir conversa (ver pedirAbertura). */
  abertura: boolean;
}

export interface ItemVisto {
  ref: RefContato;
  /** Instante estimado da última mensagem da conversa. */
  ultimoContatoEm?: number;
}

export type ModoImportacao = 'mesclar' | 'substituir';

export type ResultadoImportar = { ok: true; resumo: ResumoImportacao } | { ok: false; erro: string };

export interface RepositorioContatos {
  // ── Leitura ──
  /** Tudo (inclusive as conversas lidas da lista) ou só as coleções pedidas (as não pedidas vêm vazias). */
  carregar(colecoes?: readonly Colecao[]): Promise<DadosCrm>;
  listarContatos(): Promise<Contato[]>;
  obterContato(ref: RefContato): Promise<Contato | null>;
  listarLembretes(): Promise<Lembrete[]>;
  listarEtiquetas(): Promise<Etiqueta[]>;

  // ── Contatos ──
  /** Acha ou cria o contato (e grava telefone/nome descobertos). */
  registrarContato(ref: RefContato): Promise<Contato>;
  /** Vincula o contato a outro contato, a um telefone ou a outro nome (juntando registros da mesma pessoa). */
  vincular(contatoId: string, destino: DestinoVinculo): Promise<{ ok: true; contato: Contato } | { ok: false; erro: string }>;
  /** Contatos que a extensão VIU na lista: aprende telefone e último contato dos que já existem (não cria). */
  registrarVistos(itens: ItemVisto[]): Promise<void>;
  registrarUltimoContato(ref: RefContato, em: number): Promise<void>;

  // ── Notas ──
  /** Devolve o erro em texto, ou null se salvou. */
  adicionarNota(ref: RefContato, texto: string): Promise<string | null>;
  editarNota(ref: RefContato, notaId: string, texto: string): Promise<string | null>;
  excluirNota(ref: RefContato, notaId: string): Promise<void>;

  // ── Fase, etiquetas ──
  definirFase(ref: RefContato, fase: Fase | null): Promise<void>;
  criarEtiqueta(nome: string, cor: string): Promise<{ erro: string } | { etiqueta: Etiqueta }>;
  alternarEtiqueta(ref: RefContato, etiquetaId: string): Promise<boolean>;
  renomearEtiqueta(etiquetaId: string, nome: string, cor: string): Promise<string | null>;
  excluirEtiqueta(etiquetaId: string): Promise<void>;

  // ── Triagem ──
  /** Tira o contato de "Precisa de resposta" até a conversa mudar (a assinatura muda). */
  dispensar(ref: RefContato, assinaturaDaConversa: string): Promise<void>;
  reativar(ref: RefContato): Promise<void>;

  // ── Lembretes ──
  criarLembrete(entrada: { ref: RefContato; venceEm: number | null; rascunho?: string }, agora: Date): Promise<ResultadoLembrete>;
  /** Muda status ("concluido", "disparado") e/ou rascunho. */
  atualizarLembrete(id: string, patch: Partial<Pick<Lembrete, 'status' | 'rascunho' | 'disparadoEm'>>): Promise<void>;
  /** Volta a "pendente" no novo horário. */
  adiarLembrete(id: string, venceEm: number, agora: Date): Promise<void>;
  excluirLembrete(id: string): Promise<void>;

  // ── Respostas rápidas ──
  salvarResposta(entrada: { id?: string; titulo: string; atalho: string; texto: string }): Promise<string | null>;
  excluirResposta(id: string): Promise<void>;

  // ── Estado da tela ──
  /** Conversas lidas da lista do WhatsApp (estado derivado, recalculável). */
  salvarConversas(conversas: Record<string, Conversa>): Promise<void>;
  salvarConfig(config: ConfigCrm): Promise<void>;

  // ── Backup ──
  exportarJson(): Promise<string>;
  importar(texto: string, modo: ModoImportacao): Promise<ResultadoImportar>;

  // ── Abrir conversa (lembrete, painel) ──
  pedirAbertura(acao: Omit<AcaoPendente, 'tipo' | 'ts'>): Promise<void>;
  /** Devolve o pedido pendente (recente) e o apaga; null se não há. */
  consumirAbertura(): Promise<AcaoPendente | null>;

  // ── Mudanças ──
  /** Avisa quando algo mudou no armazenamento (inclusive por outra parte da extensão). Devolve a função que cancela. */
  aoMudar(cb: (e: EventoRepositorio) => void): () => void;
}
