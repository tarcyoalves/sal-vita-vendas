// Leitura (só leitura) da conversa aberta: título, mensagens, tipo (individual/grupo) e JID.

import { esperar, limparMarcas, textoDoNo } from './dom';
import { encontrar, encontrarTodos, SELETORES } from './selectors';

export type TipoConversa = 'individual' | 'grupo' | 'desconhecido';

/**
 * Classifica a conversa aberta pelo data-id das mensagens ("true_5584...@c.us_ABC").
 * Qualquer sinal de grupo/transmissão/canal vence; sem sinal nenhum → desconhecido.
 */
export function classificarConversa(dataIds: string[]): TipoConversa {
  let individual = false;
  for (const id of dataIds) {
    const m = /^(?:true|false)_([^_]+)_/.exec(id);
    if (!m) continue;
    const jid = m[1];
    if (/@g\.us$|@broadcast$|@newsletter$/.test(jid)) return 'grupo';
    if (/@c\.us$|@lid$|@s\.whatsapp\.net$/.test(jid)) individual = true;
  }
  return individual ? 'individual' : 'desconhecido';
}

/** JID(s) da conversa nos data-id (ordenados, sem repetição, juntados por vírgula); null se nenhum. */
export function jidDosIds(dataIds: string[]): string | null {
  const jids = new Set<string>();
  for (const id of dataIds) {
    const m = /^(?:true|false)_([^_]+)_/.exec(id);
    if (m) jids.add(m[1]);
  }
  return jids.size === 0 ? null : [...jids].sort().join(',');
}

export function tituloAberto(): string | null {
  const el = encontrar(document, 'tituloCabecalho');
  if (!el) return null;
  return limparMarcas(el.getAttribute('title') || el.textContent || '');
}

export function idsDasMensagens(): string[] {
  return encontrarTodos(document, 'mensagem')
    .map((el) => el.getAttribute('data-id') ?? '')
    .filter(Boolean);
}

/** Mensagem sua: data-id "true_…" (sinal principal) ou dentro de ".message-out" (secundário). */
export function ehMensagemSua(el: HTMLElement): boolean {
  if (/^true_/.test(el.getAttribute('data-id') ?? '')) return true;
  const saida = SELETORES.mensagemSua[0];
  return el.matches(saida) || el.closest(saida) != null || el.querySelector(saida) != null;
}

/** Texto de uma mensagem do chat (emoji incluído). */
export function textoDaMensagem(el: HTMLElement): string {
  const textoEl = encontrar(el, 'textoMensagem');
  return limparMarcas(textoDoNo(textoEl ?? el));
}

export interface LeituraConversa {
  tipo: TipoConversa;
  jid: string | null;
}

/**
 * Espera as mensagens da conversa `nome` carregarem e devolve a classificação só quando DUAS
 * leituras seguidas (com `passoMs` entre elas) dão o mesmo tipo e o mesmo JID, com o título
 * ainda sendo `nome`. Logo depois de abrir, o DOM pode ainda ter as mensagens da conversa
 * anterior — uma leitura só poderia classificar a conversa errada.
 */
export async function lerConversaEstavel(nome: string, limiteMs = 6000, passoMs = 400): Promise<LeituraConversa | null> {
  const fim = Date.now() + limiteMs;
  let anterior: LeituraConversa | null = null;
  for (;;) {
    let atual: LeituraConversa | null = null;
    if (tituloAberto() === nome) {
      const ids = idsDasMensagens();
      if (ids.length > 0) atual = { tipo: classificarConversa(ids), jid: jidDosIds(ids) };
    }
    if (atual && anterior && atual.tipo === anterior.tipo && atual.jid === anterior.jid) return atual;
    anterior = atual;
    if (Date.now() >= fim) return null;
    await esperar(passoMs);
  }
}
