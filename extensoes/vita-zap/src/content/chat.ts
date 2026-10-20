// Leitura (só leitura) da conversa aberta: título, mensagens, tipo (individual/grupo) e JID.

import { esperar, limparMarcas, textoDoNo } from './dom';
import { encontrar, encontrarTodos, SELETORES } from './selectors';

export type TipoConversa = 'individual' | 'grupo' | 'desconhecido';

/** Uma mensagem da conversa aberta, como o DOM mostra. */
export interface MensagemLida {
  sua: boolean;
  recebida: boolean;
  /** Autor do data-pre-plain-text ("[hh:mm, dd/mm/aaaa] Autor: "), ou null. */
  autor: string | null;
  /** Existe um elemento com o nome do autor dentro da mensagem recebida (só em grupo). */
  temElementoAutor: boolean;
}

/** Sinais do DOM (só leitura) usados na classificação quando o data-id não traz o JID. */
export interface SinaisDom {
  titulo: string | null;
  iconeGrupoNoCabecalho: boolean;
  mensagens: MensagemLida[];
}

function normalizarAutor(s: string): string {
  return limparMarcas(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Autor de um data-pre-plain-text: "[10:00, 19/10/2026] Fulano: " → "Fulano". */
export function autorDoPrePlainText(valor: string): string | null {
  const m = /^\[[^\]]*\]\s*([\s\S]*?):\s*$/.exec(valor);
  const autor = m ? limparMarcas(m[1]) : '';
  return autor === '' ? null : autor;
}

/**
 * Classifica a conversa aberta. Conservador: na dúvida → 'desconhecido' (não cola).
 *
 * Formato antigo: o data-id traz o JID ("true_5584...@c.us_ABC"); @g.us/@broadcast/@newsletter
 * = grupo, @c.us/@lid = individual. Formato atual: o data-id é só o id da mensagem, então vem
 * dos `sinais` do DOM: grupo se há ícone de grupo no cabeçalho, nome de autor dentro de
 * mensagem recebida, autores diferentes entre si ou diferentes do título; individual se nenhum
 * sinal de grupo, todo autor recebido é o título e existe ao menos uma mensagem. Sinal de grupo
 * vence sempre.
 */
export function classificarConversa(dataIds: string[], sinais?: SinaisDom): TipoConversa {
  let individualPeloJid = false;
  for (const id of dataIds) {
    const m = /^(?:true|false)_([^_]+)_/.exec(id);
    if (!m) continue;
    const jid = m[1];
    if (/@g\.us$|@broadcast$|@newsletter$/.test(jid)) return 'grupo';
    if (/@c\.us$|@lid$|@s\.whatsapp\.net$/.test(jid)) individualPeloJid = true;
  }
  if (!sinais) return individualPeloJid ? 'individual' : 'desconhecido';

  if (sinais.iconeGrupoNoCabecalho) return 'grupo';
  const recebidas = sinais.mensagens.filter((m) => m.recebida);
  if (recebidas.some((m) => m.temElementoAutor)) return 'grupo';
  const autores = recebidas.flatMap((m) => (m.autor ? [normalizarAutor(m.autor)] : []));
  if (new Set(autores).size > 1) return 'grupo';
  const titulo = sinais.titulo ? normalizarAutor(sinais.titulo) : '';
  if (titulo !== '' && autores.some((a) => a !== titulo)) return 'grupo';

  if (individualPeloJid) return 'individual';
  if (sinais.mensagens.filter((m) => m.sua || m.recebida).length === 0) return 'desconhecido';
  // Recebidas sem nenhum autor legível (ou sem título para comparar): não dá para confirmar.
  if (recebidas.length > 0 && (autores.length === 0 || titulo === '')) return 'desconhecido';
  return 'individual';
}

/** Lê os sinais do DOM da conversa aberta (só leitura). */
export function lerSinaisDaConversa(): SinaisDom {
  const cabecalho = encontrar(document, 'painelConversa')?.querySelector('header') ?? null;
  const iconeGrupoNoCabecalho = cabecalho ? SELETORES.iconeGrupo.some((s) => cabecalho.querySelector(s) !== null) : false;
  const mensagens = encontrarTodos(document, 'mensagem').map((el): MensagemLida => {
    const sua = ehMensagemSua(el);
    const recebidaSel = SELETORES.mensagemRecebida[0];
    const recebida = !sua && (/^false_/.test(el.getAttribute('data-id') ?? '') || el.matches(recebidaSel) || el.closest(recebidaSel) != null || el.querySelector(recebidaSel) != null);
    const comAutor = el.matches('[data-pre-plain-text]') ? el : (el.querySelector('[data-pre-plain-text]') ?? el.closest('[data-pre-plain-text]'));
    const autor = comAutor ? autorDoPrePlainText(comAutor.getAttribute('data-pre-plain-text') ?? '') : null;
    const temElementoAutor = recebida && SELETORES.autorMensagem.some((s) => el.querySelector(s) !== null);
    return { sua, recebida, autor, temElementoAutor };
  });
  return { titulo: tituloAberto(), iconeGrupoNoCabecalho, mensagens };
}

/** Classifica a conversa aberta agora (ids + sinais do DOM). */
export function classificarConversaAberta(ids: string[]): TipoConversa {
  return classificarConversa(ids, lerSinaisDaConversa());
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

/** Mensagem sua: ".message-out" (sinal principal hoje) ou data-id "true_…" (formato antigo). */
export function ehMensagemSua(el: HTMLElement): boolean {
  const saida = SELETORES.mensagemSua[0];
  if (el.matches(saida) || el.closest(saida) != null || el.querySelector(saida) != null) return true;
  return /^true_/.test(el.getAttribute('data-id') ?? '');
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
      if (ids.length > 0) atual = { tipo: classificarConversaAberta(ids), jid: jidDosIds(ids) };
    }
    if (atual && anterior && atual.tipo === anterior.tipo && atual.jid === anterior.jid) return atual;
    anterior = atual;
    if (Date.now() >= fim) return null;
    await esperar(passoMs);
  }
}
