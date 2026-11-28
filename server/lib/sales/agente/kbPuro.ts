// Regras puras da base homologada do vendedor virtual (sem banco): testáveis sem ordersDb.
// Regra de ouro: só item 'approved' chega ao modelo; editar item aprovado volta para 'draft' (versão +1).
import { verificarTextoComercial } from '../conteudo';
import type { KbItem, KbKind } from './kb';

export type KbEntrada = { kind: KbKind; key: string; title: string; content: string };
export type KbEstado = Pick<KbItem, 'kind' | 'key' | 'title' | 'content' | 'status' | 'version' | 'approvedBy' | 'approvedAt'>;

/** Kinds cujo texto o cliente pode acabar lendo: passam pelas travas de conteúdo na aprovação. */
export const KB_KINDS_VERIFICADOS: ReadonlyArray<KbKind> = ['produto', 'politica', 'objecao', 'resposta_padrao'];

export function mesmoConteudo(a: KbEntrada, b: KbEntrada): boolean {
  return a.kind === b.kind && a.key === b.key && a.title === b.title && a.content === b.content;
}

/**
 * Estado resultante de salvar uma edição. Item novo → draft v1. Item existente com texto igual → inalterado.
 * Item existente com texto diferente → 'draft'; a versão sobe quando ele estava aprovado ou arquivado
 * (rascunho editado de novo continua na mesma versão, ainda não aprovada).
 */
export function aplicarEdicao(atual: KbEstado | null, novo: KbEntrada): { estado: KbEstado; mudou: boolean } {
  if (!atual) {
    return { estado: { ...novo, status: 'draft', version: 1, approvedBy: null, approvedAt: null }, mudou: true };
  }
  if (mesmoConteudo(atual, novo)) return { estado: atual, mudou: false };
  const sobe = atual.status === 'approved' || atual.status === 'archived';
  return {
    estado: { ...novo, status: 'draft', version: sobe ? atual.version + 1 : atual.version, approvedBy: null, approvedAt: null },
    mudou: true,
  };
}

/** Aprovação: item arquivado não aprova; texto que o cliente pode ler precisa passar nas travas de conteúdo. */
export function validarAprovacao(item: Pick<KbEstado, 'kind' | 'content' | 'title' | 'status'>): { ok: true } | { ok: false; motivo: string } {
  if (item.status === 'archived') return { ok: false, motivo: 'Item arquivado: edite-o antes de aprovar.' };
  if (KB_KINDS_VERIFICADOS.includes(item.kind)) {
    const r = verificarTextoComercial(`${item.title}\n${item.content}`);
    if (!r.ok) return { ok: false, motivo: `Texto reprovado nas travas de conteúdo: ${r.achados.join('; ')}` };
  }
  return { ok: true };
}

export function soAprovados<T extends { status: string }>(itens: T[]): T[] {
  return itens.filter((i) => i.status === 'approved');
}
