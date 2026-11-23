/**
 * Rascunho automático do formulário de tarefa (localStorage, por usuário e por tarefa / "nova").
 * Funções puras: o armazenamento entra por parâmetro e todo acesso é protegido (iOS em aba privada, cota cheia).
 *
 * Regra de segurança com tasks.update (ver textoEditado.ts): só enviamos `limparNotas`/`limparDescricao` quando
 * o texto carregado do servidor tinha conteúdo e o campo ficou vazio. Por isso o rascunho NUNCA restaura um
 * campo vazio por cima de um texto que existe no servidor: o texto do servidor fica, e o campo não parece
 * "apagado de propósito" só porque um rascunho antigo estava vazio.
 */
export interface CamposTarefa {
  clientId: number;
  title: string;
  description: string;
  notes: string;
  email: string;
  tags: string[];
  reminderDate: string;
  reminderTime: string;
  reminderEnabled: boolean;
  priority: 'low' | 'medium' | 'high';
  assignedTo: string;
}

export interface TextosServidor { notes: string; description: string }

export interface Rascunho {
  v: 1;
  campos: CamposTarefa;
  /** Textos como estavam no servidor quando o rascunho foi salvo (para saber o que o usuário realmente mexeu). */
  base: TextosServidor;
  salvoEm: number;
}

export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const VALIDADE_RASCUNHO_MS = 7 * 24 * 3_600_000;
const PREFIXO = 'sv_rascunho_tarefa_v1';

export function chaveRascunho(usuario: number | string | null | undefined, tarefaId: number | null): string {
  return `${PREFIXO}:${usuario ?? 'anon'}:${tarefaId ?? 'nova'}`;
}

/** localStorage do navegador, ou null se o acesso for bloqueado. */
export function armazenamentoLocal(): Armazenamento | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function formularioAlterado(base: CamposTarefa, atual: CamposTarefa): boolean {
  return (
    base.clientId !== atual.clientId ||
    base.title !== atual.title ||
    base.description !== atual.description ||
    base.notes !== atual.notes ||
    base.email !== atual.email ||
    base.reminderDate !== atual.reminderDate ||
    base.reminderTime !== atual.reminderTime ||
    base.reminderEnabled !== atual.reminderEnabled ||
    base.priority !== atual.priority ||
    base.assignedTo !== atual.assignedTo ||
    base.tags.length !== atual.tags.length ||
    base.tags.some((t, i) => t !== atual.tags[i])
  );
}

export function salvarRascunho(arm: Armazenamento | null, chave: string, campos: CamposTarefa, base: TextosServidor, agora: number): boolean {
  if (!arm) return false;
  try {
    const r: Rascunho = { v: 1, campos, base, salvoEm: agora };
    arm.setItem(chave, JSON.stringify(r));
    return true;
  } catch {
    return false;
  }
}

export function limparRascunho(arm: Armazenamento | null, chave: string): void {
  if (!arm) return;
  try { arm.removeItem(chave); } catch { /* sem acesso: nada a limpar */ }
}

const texto = (v: unknown) => typeof v === 'string';

function valido(r: unknown): r is Rascunho {
  const x = r as Rascunho | null;
  if (!x || x.v !== 1 || typeof x.salvoEm !== 'number' || !x.campos || !x.base) return false;
  const c = x.campos;
  return (
    typeof c.clientId === 'number' && texto(c.title) && texto(c.description) && texto(c.notes) && texto(c.email) &&
    texto(c.reminderDate) && texto(c.reminderTime) && typeof c.reminderEnabled === 'boolean' && texto(c.assignedTo) &&
    (c.priority === 'low' || c.priority === 'medium' || c.priority === 'high') &&
    Array.isArray(c.tags) && c.tags.every(texto) && texto(x.base.notes) && texto(x.base.description)
  );
}

/** Lê o rascunho; descarta (e apaga) o que está corrompido ou passou da validade. */
export function lerRascunho(arm: Armazenamento | null, chave: string, agora: number): Rascunho | null {
  if (!arm) return null;
  try {
    const cru = arm.getItem(chave);
    if (!cru) return null;
    const r = JSON.parse(cru) as unknown;
    if (!valido(r) || agora - r.salvoEm > VALIDADE_RASCUNHO_MS || r.salvoEm > agora + 3_600_000) {
      limparRascunho(arm, chave);
      return null;
    }
    return r;
  } catch {
    limparRascunho(arm, chave);
    return null;
  }
}

/** Texto de um campo (anotações/descrição) ao restaurar: nunca vazio sobre texto existente, nunca por cima de texto novo do servidor. */
export function restaurarTexto(rascunho: string, baseDoRascunho: string, servidor: string): string {
  if (rascunho === baseDoRascunho) return servidor; // o usuário não mexeu neste campo: vale o do servidor
  if (rascunho === '' && servidor !== '') return servidor; // apagar não se restaura
  if (servidor === baseDoRascunho || servidor === rascunho) return rascunho; // servidor não mudou desde o rascunho
  // Os dois mudaram: mantém o texto do servidor e acrescenta o que o usuário escreveu depois.
  const acrescimo = rascunho.startsWith(baseDoRascunho) ? rascunho.slice(baseDoRascunho.length).replace(/^\s+/, '') : rascunho;
  if (!acrescimo) return servidor;
  return servidor ? `${servidor.replace(/\s+$/, '')}\n${acrescimo}` : acrescimo;
}

/** Formulário a mostrar ao reabrir: campos do rascunho, com os textos reconciliados com o que o servidor tem hoje. */
export function aplicarRascunho(r: Rascunho, servidor: TextosServidor): CamposTarefa {
  return {
    ...r.campos,
    notes: restaurarTexto(r.campos.notes, r.base.notes, servidor.notes),
    description: restaurarTexto(r.campos.description, r.base.description, servidor.description),
  };
}
