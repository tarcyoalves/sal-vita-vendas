import { foldText } from '../../../shared/searchText';

export type OrdemTarefas = 'atrasadas' | 'proximas' | 'recentes';

export const ROTULO_ORDEM: Record<OrdemTarefas, string> = {
  atrasadas: 'Mais atrasadas primeiro',
  proximas: 'Próximas primeiro',
  recentes: 'Mais novas primeiro',
};

interface TarefaOrdenavel {
  hotLead?: boolean | null;
  reminderDate?: Date | string | null;
  reminderEnabled?: boolean | null;
  tags?: string[] | null;
  convertedAt?: Date | string | null;
}

/** 2 = "compra muito"; 1 = cliente ativo (tag "ativo"/"Cliente ativo" ou convertido); 0 = os demais. */
export function pontosCliente(t: Pick<TarefaOrdenavel, 'tags' | 'convertedAt'>): number {
  const tags = (t.tags ?? []).map((x) => foldText(x).trim());
  if (tags.some((x) => x.includes('compra muito'))) return 2;
  if (t.convertedAt || tags.some((x) => x === 'ativo' || x === 'cliente ativo')) return 1;
  return 0;
}

const dataLembrete = (t: TarefaOrdenavel): number | null =>
  t.reminderDate && t.reminderEnabled !== false ? new Date(t.reminderDate).getTime() : null;

/**
 * Ordem da lista de tarefas. Lead quente sempre primeiro (marcação manual). Com `melhoresPrimeiro`, os melhores
 * clientes vêm antes dentro de cada grupo. Depois a data do lembrete: "atrasadas" = da mais antiga para a mais
 * nova; "proximas" = agendadas (mais perto primeiro) e depois atrasadas (mais recente primeiro); "recentes" =
 * da mais nova para a mais antiga. Sem lembrete vai por último.
 */
export function ordenarTarefas<T extends TarefaOrdenavel>(lista: T[], ordem: OrdemTarefas, agora: number, melhoresPrimeiro: boolean): T[] {
  return [...lista].sort((a, b) => {
    if (!!a.hotLead !== !!b.hotLead) return a.hotLead ? -1 : 1;
    if (melhoresPrimeiro) {
      const d = pontosCliente(b) - pontosCliente(a);
      if (d) return d;
    }
    const da = dataLembrete(a), db = dataLembrete(b);
    if (da === null || db === null) return da === db ? 0 : da === null ? 1 : -1;
    if (ordem === 'atrasadas') return da - db;
    if (ordem === 'recentes') return db - da;
    const fa = da >= agora, fb = db >= agora;
    if (fa !== fb) return fa ? -1 : 1;
    return fa ? da - db : db - da;
  });
}
