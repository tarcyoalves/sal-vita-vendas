// Tipos e constantes do CRM dentro do WhatsApp Web. Tudo local (chrome.storage.local), sem servidor.

export type Fase = 'novo' | 'orcamento' | 'negociando' | 'fechado' | 'perdido';

export const FASES: ReadonlyArray<{ id: Fase; rotulo: string; cor: string }> = [
  { id: 'novo', rotulo: 'Novo', cor: '#0288d1' },
  { id: 'orcamento', rotulo: 'Orçamento', cor: '#c77800' },
  { id: 'negociando', rotulo: 'Negociando', cor: '#8e24aa' },
  { id: 'fechado', rotulo: 'Fechado', cor: '#2e7d32' },
  { id: 'perdido', rotulo: 'Perdido', cor: '#c62828' },
];

export function rotuloDaFase(f: Fase | undefined): string {
  return FASES.find((x) => x.id === f)?.rotulo ?? '';
}

export function corDaFase(f: Fase | undefined): string {
  return FASES.find((x) => x.id === f)?.cor ?? '#667781';
}

export function ehFase(v: unknown): v is Fase {
  return typeof v === 'string' && FASES.some((f) => f.id === v);
}

/** Paleta de etiquetas (todas legíveis com texto branco). */
export const CORES_ETIQUETA = ['#00a884', '#0288d1', '#8e24aa', '#d84315', '#c62828', '#c77800', '#455a64', '#ad1457'] as const;

export type AbaId = 'todas' | 'naoLidas' | 'precisa' | 'aguardando' | 'acompanhar';

export const ABAS: ReadonlyArray<{ id: AbaId; rotulo: string }> = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'naoLidas', rotulo: 'Não lidas' },
  { id: 'precisa', rotulo: 'Precisa de resposta' },
  { id: 'aguardando', rotulo: 'Aguardando resposta' },
];

/** Opções do filtro "sem resposta há X dias" na aba Aguardando resposta. */
export const OPCOES_DIAS = [1, 3, 7, 15] as const;

export interface Nota {
  id: string;
  texto: string;
  criadaEm: number;
  editadaEm?: number;
}

/** Como se refere a um contato: o id interno, se já se sabe, ou o que o WhatsApp mostra (nome e/ou telefone). */
export interface RefContato {
  contatoId?: string;
  nome: string;
  /** Qualquer formato; o repositório normaliza (dígitos com DDI 55). */
  telefone?: string | null;
}

export interface Contato {
  /** Id interno, opaco e imutável. NÃO é o nome nem o telefone: ambos podem mudar ou ser vinculados depois. */
  id: string;
  /** Nome exibido no WhatsApp. */
  nome: string;
  /** Só dígitos, com DDI 55 (ver telefone.ts). Pode faltar: contato salvo só com nome. */
  telefone?: string;
  /** Nomes (normalizados) pelos quais este contato já foi visto na lista. */
  aliases: string[];
  fase?: Fase;
  /** Ids de Etiqueta. */
  etiquetas: string[];
  notas: Nota[];
  /** Assinatura da conversa no momento em que foi dispensada de "Precisa de resposta". */
  dispensadaAss?: string;
  dispensadaEm?: number;
  /** Instante estimado da última mensagem da conversa (qualquer lado), lido da lista. */
  ultimoContatoEm?: number;
  /** Quando a fase passou a "Fechado". */
  convertidoEm?: number;
  criadoEm: number;
  atualizadoEm: number;
}

/** O que a lista do WhatsApp mostrou da conversa (estado derivado, recalculável). */
export interface Conversa {
  /** Chave de leitura da lista: nome normalizado (ou o telefone, se o nome exibido é um número). Não é o id do contato. */
  chave: string;
  nome: string;
  telefone?: string;
  /** true = a última mensagem é minha; false = do cliente; null = não deu para saber. */
  ultimaDeMim: boolean | null;
  naoLida: boolean;
  naoLidas: number;
  grupo: boolean;
  arquivada: boolean;
  rotuloData: string | null;
  /** Data da última mensagem ('AAAA-MM-DD', fuso de Fortaleza) lida do rótulo da linha. */
  dataMsg: string | null;
  /** 'HH:MM' (24 h) quando o rótulo era uma hora. */
  hora: string | null;
  previa: string;
  /** Assinatura (prévia + não lidas): muda quando chega ou sai mensagem. */
  ass: string;
  /** Primeira vez que vimos a conversa neste estado (quem falou por último). */
  desdeEm: number;
  vistaEm: number;
}

export interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
}

export interface Lembrete {
  id: string;
  /** Id interno do contato (não o nome). */
  contatoId: string;
  /** Nome exibido, para achar a conversa na hora de abrir. */
  nome: string;
  telefone?: string;
  /** Instante do aviso (epoch ms). */
  venceEm: number;
  /** Texto que será COLADO (nunca enviado) na caixa ao abrir a conversa. */
  rascunho?: string;
  criadoEm: number;
  status: 'pendente' | 'disparado' | 'concluido';
  disparadoEm?: number;
}

export interface RespostaRapida {
  id: string;
  titulo: string;
  /** Sem a barra: "oi" é chamado digitando /oi. */
  atalho: string;
  texto: string;
}

/** Aba criada pelo usuário no "+" da barra superior: filtra as conversas por etiqueta e/ou fase (basta uma bater). */
export interface AbaPersonalizada {
  id: string;
  nome: string;
  /** Ids de Etiqueta. */
  etiquetas: string[];
  fases: Fase[];
}

/** Pedido "abrir o painel lateral nesta aba": a página grava, o painel lê (ver sidepanel/App.tsx). */
export interface PedidoPainel {
  aba: 'clientes' | 'dados' | 'lembretes';
  ts: number;
}

export interface ConfigCrm {
  /** Aba ativa da barra: uma fixa (AbaId), `fase:<id>` (funil) ou `p:<id>` (personalizada). */
  aba: AbaId | string;
  diasSemResposta: number | null;
  filtroEtiquetas: string[];
  /** Barra superior de largura total (padrão: ligada). Desligada, as abas ficam acima da lista (layout da v0.5). */
  barraSuperior?: boolean;
  /** Esconde conversas de grupo da lista e dos contadores. */
  ocultarGrupos?: boolean;
  /** Ids de abas (fixas ou de funil) que o usuário escondeu. */
  abasOcultas?: string[];
  abasPersonalizadas?: AbaPersonalizada[];
  /** Por aba: quantas conversas ela tinha na última vez que o usuário clicou nela (ponto verde = novidade desde então). */
  abasVistas?: Record<string, number>;
  pedidoPainel?: PedidoPainel;
}

export interface DadosCrm {
  /** Por id interno. */
  contatos: Record<string, Contato>;
  conversas: Record<string, Conversa>;
  etiquetas: Etiqueta[];
  lembretes: Lembrete[];
  respostas: RespostaRapida[];
  config: ConfigCrm;
}

export interface AcaoPendente {
  tipo: 'abrirConversa';
  nome: string;
  telefone?: string;
  rascunho?: string;
  lembreteId?: string;
  /** Identifica o pedido (evita executar duas vezes). */
  ts: number;
}
