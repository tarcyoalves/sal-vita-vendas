// Leitura (só leitura) da conversa aberta: título, mensagens, tipo (individual/grupo) e JID.

import { mensagensIguais } from '../shared/texto';
import { esperar, limparMarcas, textoDoNo } from './dom';
import { encontrar, encontrarTodos, SELETORES } from './selectors';

export type TipoConversa = 'individual' | 'grupo' | 'desconhecido';

/** Uma mensagem da conversa aberta, como o DOM mostra. */
export interface MensagemLida {
  sua: boolean;
  recebida: boolean;
  /** Autor do data-pre-plain-text ("[hh:mm, dd/mm/aaaa] Autor: "), ou null (linha não renderizada). */
  autor: string | null;
  /** Existe um elemento com o nome do autor dentro da linha da mensagem (só em grupo). */
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
 * = grupo, @c.us/@lid = individual.
 *
 * Formato atual (20/10/2026): o data-id é só o id da mensagem e NÃO há .message-in/.message-out,
 * então não dá para separar "eu" de "contato". Vale só o conjunto de autores dos
 * data-pre-plain-text das linhas renderizadas (a conversa é virtualizada):
 *  - GRUPO: ícone de grupo/comunidade no cabeçalho; OU elemento de autor dentro de uma linha de
 *    mensagem; OU mais de 2 autores distintos; OU 2 autores distintos e nenhum igual ao título.
 *  - INDIVIDUAL: nenhum sinal de grupo e (nenhum autor legível; OU ≤ 2 autores com ao menos um
 *    igual ao título).
 *  - Qualquer outra coisa (ex.: 1 autor diferente do título) → desconhecido.
 * Sinal de grupo vence sempre. Risco residual (README): grupo sem ícone cujas linhas renderizadas
 * não mostram autor nenhum parece individual — a varredura já exclui grupos pela lista.
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
  if (sinais.mensagens.some((m) => m.temElementoAutor)) return 'grupo';
  const autores = new Set(sinais.mensagens.flatMap((m) => (m.autor ? [normalizarAutor(m.autor)] : [])));
  const titulo = sinais.titulo ? normalizarAutor(sinais.titulo) : '';
  const tituloEntreOsAutores = titulo !== '' && autores.has(titulo);
  if (autores.size > 2) return 'grupo';
  if (autores.size === 2 && !tituloEntreOsAutores) return 'grupo';

  if (individualPeloJid) return 'individual';
  if (sinais.mensagens.length === 0) return 'desconhecido';
  if (autores.size === 0) return 'individual';
  return tituloEntreOsAutores ? 'individual' : 'desconhecido';
}

/** Elemento com o data-pre-plain-text da mensagem (nela, dentro dela ou acima dela). */
function elementoComAutor(el: HTMLElement): Element | null {
  return el.matches('[data-pre-plain-text]') ? el : (el.querySelector('[data-pre-plain-text]') ?? el.closest('[data-pre-plain-text]'));
}

/** Autor (data-pre-plain-text) de uma mensagem, ou null se a linha não foi renderizada por completo. */
export function autorDaMensagem(el: HTMLElement): string | null {
  const comAutor = elementoComAutor(el);
  return comAutor ? autorDoPrePlainText(comAutor.getAttribute('data-pre-plain-text') ?? '') : null;
}

/** Existe um elemento de nome de autor DENTRO da linha da mensagem (nunca no cabeçalho)? */
export function temElementoDeAutor(el: HTMLElement): boolean {
  return SELETORES.autorMensagem.some((s) => el.querySelector(s) !== null);
}

/** Lê os sinais do DOM da conversa aberta (só leitura). */
export function lerSinaisDaConversa(): SinaisDom {
  const cabecalho = encontrar(document, 'painelConversa')?.querySelector('header') ?? null;
  const iconeGrupoNoCabecalho = cabecalho ? SELETORES.iconeGrupo.some((s) => cabecalho.querySelector(s) !== null) : false;
  const mensagens = lerMensagens().map(({ el }): MensagemLida => {
    const sua = ehMensagemSua(el);
    return { sua, recebida: !sua && ehMensagemRecebida(el), autor: autorDaMensagem(el), temElementoAutor: temElementoDeAutor(el) };
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

const PREFIXO_MSG = 'conv-msg-';

/**
 * Id de uma mensagem: data-id (formato antigo, com ou sem true_/false_/JID) ou
 * data-testid="conv-msg-<ID>" (formato de 20/10/2026), no próprio elemento ou dentro dele.
 */
export function idDaMensagem(el: HTMLElement): string {
  const direto = el.getAttribute('data-id');
  if (direto) return direto;
  const testid = el.getAttribute('data-testid');
  if (testid?.startsWith(PREFIXO_MSG)) return testid.slice(PREFIXO_MSG.length);
  const interno = el.querySelector('[data-id]')?.getAttribute('data-id');
  if (interno) return interno;
  const filho = el.querySelector(`[data-testid^="${PREFIXO_MSG}"]`)?.getAttribute('data-testid');
  return filho ? filho.slice(PREFIXO_MSG.length) : '';
}

export interface MensagemDom {
  id: string;
  /** A linha da mensagem ([role="row"] quando existe; senão o próprio elemento do id). */
  el: HTMLElement;
}

/**
 * Mensagens presentes no DOM agora, em ordem, sem repetição de id. A conversa é virtualizada:
 * só algumas linhas estão renderizadas por completo (as demais só têm o id).
 */
export function lerMensagens(): MensagemDom[] {
  const vistos = new Set<string>();
  const linhas = new Set<HTMLElement>();
  const saida: MensagemDom[] = [];
  const linhaSel = SELETORES.linhaMensagem[0];
  for (const achado of encontrarTodos(document, 'mensagem')) {
    const el = achado.closest<HTMLElement>(linhaSel) ?? achado;
    const id = idDaMensagem(el) || idDaMensagem(achado);
    if (!id || vistos.has(id) || linhas.has(el)) continue;
    vistos.add(id);
    linhas.add(el);
    saida.push({ id, el });
  }
  return saida;
}

export function idsDasMensagens(): string[] {
  return lerMensagens().map((m) => m.id);
}

/** Mensagem sua pelo formato antigo: ".message-out" ou data-id "true_…". */
export function ehMensagemSua(el: HTMLElement): boolean {
  const saida = SELETORES.mensagemSua[0];
  if (el.matches(saida) || el.closest(saida) != null || el.querySelector(saida) != null) return true;
  return /^true_/.test(idDaMensagem(el));
}

/** Mensagem recebida pelo formato antigo: ".message-in" ou data-id "false_…". */
export function ehMensagemRecebida(el: HTMLElement): boolean {
  const entrada = SELETORES.mensagemRecebida[0];
  return /^false_/.test(idDaMensagem(el)) || el.matches(entrada) || el.closest(entrada) != null || el.querySelector(entrada) != null;
}

/** Texto de uma mensagem do chat (emoji incluído). */
export function textoDaMensagem(el: HTMLElement): string {
  const textoEl = encontrar(el, 'textoMensagem');
  return limparMarcas(textoDoNo(textoEl ?? el));
}

/** Todos os textos da mensagem (cada .selectable-text; uma resposta citada traz o seu). */
export function textosDaMensagem(el: HTMLElement): string[] {
  const textos = [...el.querySelectorAll<HTMLElement>('.selectable-text')].map((t) => limparMarcas(textoDoNo(t))).filter((t) => t !== '');
  return textos.length > 0 ? textos : [textoDaMensagem(el)].filter((t) => t !== '');
}

/** Texto da mensagem que bate com `textoColado` (normalizado, emoji incluído), ou null. */
export function textoQueBate(el: HTMLElement, textoColado: string): string | null {
  return textosDaMensagem(el).find((t) => mensagensIguais(t, textoColado)) ?? null;
}

/**
 * Esta mensagem pode ser a que COLAMOS e o usuário enviou? Critério do formato sem in/out: o
 * texto bate e ela não é do contato (nem .message-in/false_, nem tem como autor o título da
 * conversa). Quem chama também exige id NOVO (fora da foto tirada antes de colar) e, no
 * observador, a caixa de mensagem vazia.
 */
export function pareceEnvioNosso(el: HTMLElement, textoColado: string): boolean {
  if (textoQueBate(el, textoColado) === null) return false;
  if (ehMensagemRecebida(el)) return false;
  const autor = autorDaMensagem(el);
  const titulo = tituloAberto();
  if (autor && titulo && normalizarAutor(autor) === normalizarAutor(titulo)) return false;
  return true;
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
