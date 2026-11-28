// Base homologada do vendedor virtual (tabela sales_agent_kb). ESTE ARQUIVO DEFINE O CONTRATO usado
// pelo painel; a implementação é do lote "vendedor virtual". Até lá, cada função lança NaoImplementado.
// Regra: só itens 'approved' chegam ao modelo. Editar um item aprovado volta ele a 'draft' (versão +1).
import { NaoImplementado } from '../operacoes';

export const KB_KINDS = ['produto', 'politica', 'objecao', 'resposta_padrao', 'proibido'] as const;
export type KbKind = (typeof KB_KINDS)[number];

export interface KbItem {
  id: number;
  kind: KbKind;
  key: string;
  title: string;
  content: string;
  status: 'draft' | 'approved' | 'archived';
  version: number;
  approvedBy: string | null;
  approvedAt: Date | null;
  updatedAt: Date;
}

export async function listarKb(): Promise<KbItem[]> { throw new NaoImplementado('listarKb'); }
export async function salvarKbItem(_i: { id?: number; kind: KbKind; key: string; title: string; content: string }, _por: string): Promise<KbItem> {
  throw new NaoImplementado('salvarKbItem');
}
export async function aprovarKbItem(_id: number, _por: string): Promise<KbItem> { throw new NaoImplementado('aprovarKbItem'); }
export async function arquivarKbItem(_id: number, _por: string): Promise<void> { throw new NaoImplementado('arquivarKbItem'); }
/** Importa uma lista (JSON colado no painel). Todos entram como 'draft'. */
export async function importarKb(_itens: Array<{ kind: KbKind; key: string; title: string; content: string }>, _por: string): Promise<{ criados: number; atualizados: number }> {
  throw new NaoImplementado('importarKb');
}

export interface ConversaResumo {
  id: string;
  profile: string | null;
  companyName: string | null;
  status: string;
  flagged: boolean;
  flagReason: string | null;
  messageCount: number;
  startedAt: Date;
  lastAt: Date;
}
export async function listarConversas(_f: { soMarcadas?: boolean; pagina: number; porPagina: number }): Promise<{ itens: ConversaResumo[]; total: number }> {
  throw new NaoImplementado('listarConversas');
}
export async function obterConversa(_id: string): Promise<{ conversa: ConversaResumo; mensagens: Array<{ role: string; content: string; toolName: string | null; blocked: boolean; blockReason: string | null; createdAt: Date }> } | null> {
  throw new NaoImplementado('obterConversa');
}
