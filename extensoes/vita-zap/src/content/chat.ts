// Leitura (só leitura) da conversa aberta: título, mensagens, tipo (individual/grupo) e JID.

import { mensagensIguais } from '../shared/texto';
import { esperar, limparMarcas, textoDoNo } from './dom';
import { aprenderMeuNome, meuNomeAtual } from './meuNome';
import { encontrar, encontrarTodos, ROTULO_STATUS_MINHA, SELETORES } from './selectors';

export type TipoConversa = 'individual' | 'grupo' | 'desconhecido';

/** Uma mensagem da conversa aberta, como o DOM mostra. */
export interface MensagemLida {
  sua: boolean;
  recebida: boolean;
  /** Autor do data-pre-plain-text ("[hh:mm, dd/mm/aaaa] Autor: "), ou null (linha não renderizada). */
  autor: string | null;
  /** Existe um elemento com o nome do autor dentro da linha da mensagem (só em grupo). */
  temElementoAutor: boolean;
  /** A linha tem ícone/rótulo de status de entrega (✓, ✓✓, relógio…): só mensagens minhas têm. */
  comIcone?: boolean;
}

/** Sinais do DOM (só leitura) usados na classificação quando o data-id não traz o JID. */
export interface SinaisDom {
  titulo: string | null;
  iconeGrupoNoCabecalho: boolean;
  /** Mensagens de conversa (minhas e recebidas). Linhas de sistema não entram aqui. */
  mensagens: MensagemLida[];
  /** Meu nome no WhatsApp (autor das minhas mensagens), se já conhecido. */
  meuNome?: string | null;
  /** Quantas linhas de sistema (código de segurança, "carregar mais antigas"…) foram ignoradas. */
  sistema?: number;
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
 * Autores do "outro lado" da conversa: os autores distintos dos data-pre-plain-text SEM os meus.
 * Meus = `meuNome` (aprendido/configurado) + o autor das linhas que são minhas (ícone de status,
 * .message-out). Um "meu nome" igual ao título não separa nada. Sem nenhum nome meu conhecido
 * vale a regra da 0.3.0: 2 autores, um deles igual ao título → o outro sou eu.
 */
export function autoresDoOutroLado(sinais: SinaisDom): { outros: Set<string>; meuConhecido: boolean } {
  const titulo = sinais.titulo ? normalizarAutor(sinais.titulo) : '';
  const todos = new Set(sinais.mensagens.flatMap((m) => (m.autor ? [normalizarAutor(m.autor)] : [])));
  const meus = new Set<string>();
  if (sinais.meuNome) meus.add(normalizarAutor(sinais.meuNome));
  for (const m of sinais.mensagens) if (m.sua && m.autor) meus.add(normalizarAutor(m.autor));
  meus.delete(titulo);
  if (meus.size === 0) {
    if (todos.size === 2 && titulo !== '' && todos.has(titulo)) return { outros: new Set([titulo]), meuConhecido: false };
    return { outros: todos, meuConhecido: false };
  }
  return { outros: new Set([...todos].filter((a) => !meus.has(a))), meuConhecido: true };
}

/**
 * Classifica a conversa aberta. Conservador: na dúvida → 'desconhecido' ou 'grupo' (não cola).
 *
 * Formato antigo: o data-id traz o JID ("true_5584...@c.us_ABC"); @g.us/@broadcast/@newsletter
 * = grupo, @c.us/@lid = individual.
 *
 * Formato atual (20/10/2026): o data-id é só o id da mensagem e NÃO há .message-in/.message-out.
 * Minhas mensagens têm ícone de status; o autor delas (data-pre-plain-text) é o meu nome, que é
 * descontado: sobram os `autoresDoOutroLado`.
 *  - GRUPO: ícone de grupo/comunidade no cabeçalho; OU elemento de autor dentro de uma linha de
 *    mensagem; OU mais de 1 autor do outro lado; OU 1 autor do outro lado diferente do título.
 *  - INDIVIDUAL: nenhum sinal de grupo, o outro lado é vazio (só mensagens minhas) ou é só o
 *    título, e existe ao menos 1 mensagem (minha ou recebida).
 *  - Sem nenhuma mensagem → desconhecido.
 * Risco residual (README): grupo sem ícone cujas linhas renderizadas não mostram autor nenhum
 * parece individual — a varredura já exclui grupos pela lista.
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
  const titulo = sinais.titulo ? normalizarAutor(sinais.titulo) : '';
  const { outros } = autoresDoOutroLado(sinais);
  if (outros.size > 1) return 'grupo';
  if (outros.size === 1 && !outros.has(titulo)) return 'grupo';

  if (individualPeloJid) return 'individual';
  return sinais.mensagens.length > 0 ? 'individual' : 'desconhecido';
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

/** A linha tem ícone de status de entrega (✓, ✓✓, relógio) ou rótulo Lida/Entregue/Enviada/Pendente no rodapé? */
export function temIconeDeStatus(el: HTMLElement): boolean {
  if (SELETORES.iconeStatusMinha.some((s) => el.querySelector(s) !== null)) return true;
  for (const sel of SELETORES.metaMensagem) {
    const metas = [...(el.matches(sel) ? [el] : []), ...el.querySelectorAll<HTMLElement>(sel)];
    for (const meta of metas) {
      const comRotulo = [meta, ...meta.querySelectorAll<HTMLElement>('[aria-label]')];
      if (comRotulo.some((x) => ROTULO_STATUS_MINHA.test(x.getAttribute('aria-label') ?? ''))) return true;
    }
  }
  return false;
}

/** A linha foi renderizada por completo (tem contêiner, texto ou rodapé de mensagem)? */
function temConteudoDeMensagem(el: HTMLElement): boolean {
  return SELETORES.conteudoMensagem.some((s) => el.matches(s) || el.querySelector(s) !== null);
}

/**
 * Linha de sistema ("Seu código de segurança mudou", "Clique neste aviso…"): tem texto, mas não
 * tem msg-container/copyable-text. Não é mensagem. (Linha virtualizada, sem texto nenhum, não é
 * de sistema: é uma mensagem ainda não renderizada.)
 */
function ehLinhaDeSistema(el: HTMLElement): boolean {
  return !temConteudoDeMensagem(el) && textoDoNo(el).trim() !== '';
}

/** Lê os sinais do DOM da conversa aberta (só leitura). */
export function lerSinaisDaConversa(): SinaisDom {
  const cabecalho = encontrar(document, 'painelConversa')?.querySelector('header') ?? null;
  const iconeGrupoNoCabecalho = cabecalho ? SELETORES.iconeGrupo.some((s) => cabecalho.querySelector(s) !== null) : false;
  const mensagens: MensagemLida[] = [];
  let sistema = 0;
  for (const { el } of lerMensagens()) {
    const comIcone = temIconeDeStatus(el);
    const sua = comIcone || ehMensagemSua(el);
    const entrada = !sua && ehMensagemRecebida(el);
    if (!sua && !entrada && ehLinhaDeSistema(el)) {
      sistema += 1;
      continue;
    }
    mensagens.push({
      sua,
      recebida: entrada || (!sua && temConteudoDeMensagem(el)),
      autor: autorDaMensagem(el),
      temElementoAutor: temElementoDeAutor(el),
      comIcone,
    });
  }
  return { titulo: tituloAberto(), iconeGrupoNoCabecalho, mensagens, meuNome: meuNomeAtual(), sistema };
}

/**
 * Aprende meu nome: o autor das minhas mensagens (identificadas pelo ícone de status), quando é
 * um só e não é o título da conversa. Só preenche quando ainda não há nome.
 */
function aprenderComSinais(sinais: SinaisDom): void {
  if (meuNomeAtual() !== null) return;
  const titulo = sinais.titulo ? normalizarAutor(sinais.titulo) : '';
  const autores = new Map<string, string>();
  for (const m of sinais.mensagens) if (m.sua && m.autor) autores.set(normalizarAutor(m.autor), m.autor);
  if (autores.size !== 1) return;
  const [chave, nome] = [...autores.entries()][0];
  if (chave !== titulo) aprenderMeuNome(nome);
}

/** Classifica a conversa aberta agora (ids + sinais do DOM), aprendendo meu nome no caminho. */
export function classificarConversaAberta(ids: string[]): TipoConversa {
  const sinais = lerSinaisDaConversa();
  aprenderComSinais(sinais);
  return classificarConversa(ids, { ...sinais, meuNome: meuNomeAtual() });
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
  if (temIconeDeStatus(el)) return true; // ícone de status = é minha, qualquer que seja o autor lido
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
