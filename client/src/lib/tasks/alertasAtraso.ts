/**
 * Alertas de lembrete: agrupa as tarefas atrasadas em UM aviso e lembra, por usuário e por dia (fuso de
 * São Paulo), o que já foi avisado, para não repetir toda vez que o app é reaberto.
 */
export interface LembreteAlerta {
  id: number;
  title: string;
  reminderDate?: Date | string | null;
  reminderEnabled?: boolean | null;
  status?: string | null;
}

export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>;

/** 'AAAA-MM-DD' em São Paulo (a virada do dia é à meia-noite de Brasília, não do aparelho/UTC). */
export function chaveDia(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

const PREFIXO = 'sv_avisados_v4';
export const chaveAvisados = (usuario: number | string | null | undefined, dia: string) => `${PREFIXO}:${usuario ?? 'anon'}:${dia}`;

export function lerAvisados(arm: Armazenamento | null, chave: string): Set<string> {
  if (!arm) return new Set();
  try {
    const v = JSON.parse(arm.getItem(chave) || '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function gravarAvisados(arm: Armazenamento | null, chave: string, avisados: Set<string>): void {
  if (!arm) return;
  try { arm.setItem(chave, JSON.stringify([...avisados])); } catch { /* cota cheia/aba privada: o aviso pode repetir, nada quebra */ }
}

/** Apaga as chaves de outros dias do mesmo usuário (o armazenamento não cresce para sempre). */
export function limparDiasAntigos(arm: Armazenamento | null, usuario: number | string | null | undefined, dia: string): void {
  if (!arm || typeof arm.key !== 'function' || typeof arm.length !== 'number') return;
  try {
    const prefixo = `${PREFIXO}:${usuario ?? 'anon'}:`;
    const apagar: string[] = [];
    for (let i = 0; i < arm.length; i++) {
      const k = arm.key(i);
      if (k && k.startsWith(prefixo) && k !== `${prefixo}${dia}`) apagar.push(k);
    }
    apagar.forEach((k) => arm.removeItem(k));
  } catch { /* ignora */ }
}

export const chaveAtrasada = (id: number) => `o:${id}`;
export const chaveAviso = (id: number, ms: number) => `w:${id}:${ms}`;
export const chaveNaHora = (id: number, ms: number) => `f:${id}:${ms}`;

/**
 * Atrasadas há mais de 1 min, pendentes, com lembrete ligado, ainda não avisadas hoje. Quem já recebeu o aviso
 * "na hora" não recebe também o de atraso minutos depois.
 */
export function atrasadasParaAvisar(lembretes: readonly LembreteAlerta[], agora: Date, avisados: ReadonlySet<string>): LembreteAlerta[] {
  const out: LembreteAlerta[] = [];
  for (const r of lembretes) {
    if (!r.reminderDate || r.reminderEnabled === false || r.status !== 'pending') continue;
    const t = new Date(r.reminderDate).getTime();
    if (Number.isNaN(t)) continue;
    if (t - agora.getTime() < -60_000 && !avisados.has(chaveAtrasada(r.id)) && !avisados.has(chaveNaHora(r.id, t))) out.push(r);
  }
  return out;
}

/** Texto do aviso único. `jaAvisouHoje`: já houve aviso de atraso hoje, então estas são novas. */
export function textoAvisoAtraso(atrasadas: readonly LembreteAlerta[], jaAvisouHoje: boolean): string {
  const n = atrasadas.length;
  if (n === 1) return `${jaAvisouHoje ? 'Nova tarefa atrasada' : 'Atrasada'}: ${atrasadas[0].title}`;
  return jaAvisouHoje ? `${n} novas tarefas atrasadas` : `${n} tarefas atrasadas`;
}
