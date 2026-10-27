// Modo "uma tecla": abre a conversa, cola o texto e PARA. Quem envia é o usuário (Enter), a menos que o
// ENVIO AUTOMÁTICO opcional esteja ligado no painel (desligado por padrão): aí, depois de uma janela de
// conferência de 2 a 4 s, o clique é feito por envio-humano.ts, sempre depois de reconferir conversa,
// texto e caixa, e só vale como enviado se o detector vir a mensagem sair.
//
// Este arquivo não clica nem usa teclado: o único clique no botão Enviar mora em envio-humano.ts.
// tests/envio-isolado.test.ts falha se aparecer outro lugar.

import type { EventoConteudo, RespostaConteudo } from '../shared/mensagens';
import { normalizarTexto } from '../shared/nomes';
import { normalizarParaComparar } from '../shared/texto';
import { abrirLinhaDaLista } from './abrir-conversa';
import { escreverNoCampo, esperar, esperarAte, limparCampo, limparMarcas, textoComEmoji, textoDoCampoComEmoji } from './dom';
import { lerConversasVisiveis } from './extrair';
import { buscar, exigir, linhasDaLista } from './lista';
import { encontrar, encontrarTodos, existeAlgum, SELETORES } from './selectors';
import { agendarEnvioHumano, enviarHumano, PRAZO_CONFIRMACAO_MS } from './envio-humano';

export type TipoConversa = 'individual' | 'grupo' | 'desconhecido';

const JID_GRUPO = /@g\.us$|@broadcast$|@newsletter$/;
const JID_INDIVIDUAL = /@c\.us$|@lid$|@s\.whatsapp\.net$/;
const TITULO_COM_PALAVRA_DE_GRUPO = /\b(grupo|group|comunidade|community|canal|channel)\b/i;
const SUBTITULO_DE_GRUPO = /\b(participantes?|participants?|membros?|members?)\b|dados do grupo|group info|informa[cç][oõ]es do grupo/i;
const SUBTITULO_DE_PRESENCA = /visto|last seen|online|digitando|typing|gravando|recording|hoje|today|ontem|yesterday|dispon[ií]vel|available/i;

/** A mensagem é MINHA? Sinais positivos: data-id "true_", classe message-out ou ícone de status (✓/✓✓/relógio). */
export function mensagemEhMinha(el: HTMLElement): boolean {
  if ((el.getAttribute('data-id') ?? '').startsWith('true_')) return true;
  if (el.matches('.message-out') || el.closest('.message-out') || existeAlgum(el, 'mensagemMinhaClasse')) return true;
  return existeAlgum(el, 'iconeMinhaMensagem');
}

/** Autor lido do data-pre-plain-text ("[10:30, 26/10/2026] Ana Cliente: "), ou null. */
function autorDaMensagem(el: HTMLElement): string | null {
  const dono = el.hasAttribute('data-pre-plain-text') ? el : el.querySelector<HTMLElement>('[data-pre-plain-text]');
  const m = /^\s*\[[^\]]*\]\s*(.*?)\s*:\s*$/s.exec(dono?.getAttribute('data-pre-plain-text') ?? '');
  const autor = m ? limparMarcas(m[1]) : '';
  return autor === '' ? null : autor;
}

/** Textos folha do cabeçalho que não são o título: o subtítulo ("online", "Ana, Pedro, você"...). */
function subtituloDoCabecalho(cabecalho: HTMLElement, titulo: HTMLElement | null): string {
  const partes: string[] = [];
  for (const f of cabecalho.querySelectorAll<HTMLElement>('*')) {
    if (f.children.length > 0 || (titulo && (titulo.contains(f) || f.contains(titulo)))) continue;
    const t = limparMarcas(f.textContent ?? '');
    if (t) partes.push(t);
  }
  return partes.join(' | ');
}

/** Primeiro sinal de GRUPO no cabeçalho ou nas mensagens, ou null. */
function sinalDeGrupo(raiz: ParentNode, mensagens: HTMLElement[]): string | null {
  const cabecalho = encontrar(raiz, 'cabecalhoConversa');
  if (cabecalho) {
    if (existeAlgum(cabecalho, 'iconeGrupo')) return 'ícone de grupo/comunidade no cabeçalho';
    const sub = subtituloDoCabecalho(cabecalho, encontrar(raiz, 'tituloCabecalho'));
    if (SUBTITULO_DE_GRUPO.test(sub)) return 'subtítulo do cabeçalho fala em grupo/participantes';
    const nomes = sub.split(/[,|]/).map((x) => x.trim()).filter(Boolean);
    if (sub.includes(',') && nomes.length >= 2 && !SUBTITULO_DE_PRESENCA.test(sub)) return 'subtítulo do cabeçalho é uma lista de nomes';
  }
  if (mensagens.some((m) => existeAlgum(m, 'autorMensagem'))) return 'mensagem com nome de autor (só existe em grupo)';
  return null;
}

/**
 * Classifica a conversa aberta. `individual` exige SINAL POSITIVO; na dúvida é `desconhecido` (não cola).
 *
 * 1. data-id com JID ("true_5584...@c.us_ABC"): @g.us/@broadcast/@newsletter = grupo; @c.us/@lid = individual.
 *    Qualquer sinal de grupo (ícone, subtítulo, autor dentro da mensagem) vence, mesmo com JID individual.
 * 2. Sem JID (WhatsApp de 10/2026 usa hashes): individual só se NÃO há sinal de grupo E (os autores das
 *    mensagens recebidas, lidos do data-pre-plain-text, são só o título da conversa, OU só há mensagens minhas).
 *    Mais de um autor, autor diferente do título ou mensagem recebida sem autor legível → grupo/desconhecido.
 */
export function classificarConversa(
  dataIds: string[],
  raiz: ParentNode = document,
  titulo?: string | null,
  /** Envio automático: recebida sem autor legível → desconhecido; autor tem de ser o título (só truncamento "…"). */
  estrito = false,
): TipoConversa {
  let individual = false;
  let teveJid = false;
  for (const id of dataIds) {
    const m = /^(?:true|false)_([^_]+)_/.exec(id);
    if (!m) continue;
    teveJid = true;
    if (JID_GRUPO.test(m[1])) return 'grupo';
    if (JID_INDIVIDUAL.test(m[1])) individual = true;
  }
  const mensagens = encontrarTodos(raiz, 'mensagem');
  if (sinalDeGrupo(raiz, mensagens)) return 'grupo';
  if (teveJid) return individual ? 'individual' : 'desconhecido';

  // Sem JID: precisa de sinal positivo.
  const tituloEl = encontrar(raiz, 'tituloCabecalho');
  const tituloLido = limparMarcas(titulo ?? tituloEl?.getAttribute('title') ?? tituloEl?.textContent ?? '');
  if (tituloLido === '' || TITULO_COM_PALAVRA_DE_GRUPO.test(tituloLido)) return 'desconhecido';
  if (mensagens.length === 0) return 'desconhecido';
  const recebidas = mensagens.filter((m) => !mensagemEhMinha(m));
  if (recebidas.length === 0) return 'individual'; // só mensagens minhas e nenhum sinal de grupo
  const autores = new Set<string>();
  let semAutor = 0;
  for (const r of recebidas) {
    const a = autorDaMensagem(r);
    if (a !== null) autores.add(normalizarTexto(a));
    else semAutor++;
  }
  if (autores.size > 1) return 'grupo';
  // Envio automático (0.7.28, revisão da 0.7.26): recebida sem autor legível volta a ser dúvida.
  if (estrito && semAutor > 0) return 'desconhecido';
  if (autores.size === 1) return autorBateComTitulo(Array.from(autores)[0], tituloLido, estrito) ? 'individual' : 'grupo';
  return 'desconhecido';
}

const SEM_RETICENCIAS = /\.{2,}|…/g;
const MIN_PREFIXO = 5;

/**
 * Autor da mensagem recebida (já normalizado) x título da conversa. Igualdade exata depois de normalizar; título ou
 * autor cortado com "…" aceita prefixo de pelo menos 5 letras. Nunca `includes` (0.7.26 aceitava "Ana" em
 * "Ana e Equipe" e string vazia batia com tudo). No modo estrito, só o TÍTULO cortado aceita prefixo.
 */
export function autorBateComTitulo(autorNormalizado: string, tituloLido: string, estrito: boolean): boolean {
  const autor = autorNormalizado.replace(SEM_RETICENCIAS, '').trim();
  const tit = normalizarTexto(tituloLido).replace(SEM_RETICENCIAS, '').trim();
  if (autor === '' || tit === '') return false;
  if (autor === tit) return true;
  const tituloCortado = SEM_RETICENCIAS.test(tituloLido);
  SEM_RETICENCIAS.lastIndex = 0;
  if (tituloCortado && tit.length >= MIN_PREFIXO && autor.startsWith(tit)) return true;
  if (estrito) return false;
  const autorCortado = /\.{2,}|…/.test(autorNormalizado);
  return autorCortado && autor.length >= MIN_PREFIXO && tit.startsWith(autor);
}

function tituloAberto(): string | null {
  const el = encontrar(document, 'tituloCabecalho');
  if (!el) return null;
  return limparMarcas(el.getAttribute('title') || el.textContent || '');
}

function idsDasMensagens(): string[] {
  return encontrarTodos(document, 'mensagem')
    .map((el) => el.getAttribute('data-id') ?? '')
    .filter(Boolean);
}

function erro(codigo: Extract<RespostaConteudo, { ok: false }>['codigo'], mensagem: string): RespostaConteudo {
  return { ok: false, codigo, erro: mensagem };
}

// ── Detecção e observação do envio ───────────────────────────────────────────

/**
 * Procura, na conversa aberta, uma mensagem que seja NOSSO envio: id novo (fora da foto `antes`, e não vazio)
 * + sinal de mensagem minha (ícone de status, message-out ou data-id true_) + texto igual ao colado.
 * Mensagem recebida nunca conta, nem com o mesmo texto.
 */
export function acharMensagemEnviada(textoColado: string, antes: ReadonlySet<string>): string | null {
  const alvo = normalizarParaComparar(textoColado);
  for (const el of encontrarTodos(document, 'mensagem')) {
    const id = el.getAttribute('data-id') ?? '';
    if (id === '' || antes.has(id)) continue;
    if (!mensagemEhMinha(el)) continue;
    const textoEl = encontrar(el, 'textoMensagem');
    const texto = limparMarcas(textoEl ? textoComEmoji(textoEl) : '');
    if (normalizarParaComparar(texto) === alvo) return texto;
  }
  return null;
}

interface Observacao {
  observador: MutationObserver;
  timer: ReturnType<typeof setTimeout> | null;
  limite: ReturnType<typeof setTimeout>;
}

let observacao: Observacao | null = null;
let cancelarEnvioAuto: (() => void) | null = null;
let batimentoEm = 0;
export const LIMITE_OBSERVACAO_MS = 30 * 60 * 1000;
/** Sem batimento do painel por este tempo, o content script não clica mais (painel fechado/travado). */
export const PRAZO_BATIMENTO_MS = 45_000;

/** O painel avisa que está vivo. Chamado a cada pedido do painel e a cada `batimento`. */
export function registrarBatimento(agora: number = Date.now()): void {
  batimentoEm = agora;
}

function painelVivo(): boolean {
  return Date.now() - batimentoEm <= PRAZO_BATIMENTO_MS;
}

export function pararObservacao(): void {
  if (cancelarEnvioAuto) {
    cancelarEnvioAuto();
    cancelarEnvioAuto = null;
  }
  if (!observacao) return;
  observacao.observador.disconnect();
  if (observacao.timer) clearTimeout(observacao.timer);
  clearTimeout(observacao.limite);
  observacao = null;
}

/** Detecta "a mensagem saiu" (ver acharMensagemEnviada) com a caixa vazia, na conversa de `nome`. */
function detectarEnvio(nome: string, textoColado: string, antes: ReadonlySet<string>): string | null {
  if (tituloAberto() !== nome) return null; // usuário está em outra conversa
  const caixa = encontrar(document, 'caixaMensagem');
  if (caixa && textoDoCampoComEmoji(caixa).trim() !== '') return null;
  return acharMensagemEnviada(textoColado, antes);
}

function observarEnvio(nome: string, textoColado: string, antes: ReadonlySet<string>, aoDetectar: (texto: string) => void, aoExpirar: () => void): void {
  pararObservacao();
  const verificar = (): void => {
    if (!observacao) return;
    observacao.timer = null;
    const texto = detectarEnvio(nome, textoColado, antes);
    if (texto === null) return;
    aoDetectar(texto);
  };
  const observador = new MutationObserver(() => {
    if (observacao && !observacao.timer) observacao.timer = setTimeout(verificar, 400);
  });
  const expirar = (): void => {
    if (!observacao) return;
    pararObservacao();
    aoExpirar(); // não desiste em silêncio: o painel precisa saber
  };
  observacao = { observador, timer: null, limite: setTimeout(expirar, LIMITE_OBSERVACAO_MS) };
  observador.observe(document.body, { childList: true, subtree: true });
}

// ── Abrir e colar ────────────────────────────────────────────────────────────

/** Nome da conversa aberta agora (cabeçalho), ou null. */
export function nomeDaConversaAberta(): string | null {
  return tituloAberto();
}

/**
 * Abre a conversa de `nome` pela busca da lista (exatamente uma linha com esse nome e com
 * conversa) e confere o cabeçalho. Devolve null quando abriu; senão, o erro.
 * Com `usarSeJaAberta`, se a conversa já está aberta nem mexe na busca.
 */
async function abrirConversaPorNome(nome: string, usarSeJaAberta = false): Promise<RespostaConteudo | null> {
  exigir(encontrar(document, 'painelLateral'), 'lista de conversas');
  if (usarSeJaAberta && tituloAberto() === nome) return null;

  // 1. Achar a conversa pela busca: exatamente uma linha com este nome e com conversa.
  await buscar(nome);
  const candidatas = await esperarAte(() => {
    const achadas = lerConversasVisiveis(linhasDaLista()).conversas.filter((c) => c.linha.nome === nome && c.linha.rotuloData);
    return achadas.length > 0 ? achadas : null;
  }, 5000);
  if (!candidatas) return erro('nao_encontrado', `"${nome}" não apareceu entre as conversas da busca.`);
  if (candidatas.length > 1) return erro('ambiguo', `Há ${candidatas.length} conversas chamadas "${nome}".`);
  // A própria linha da lista já pode denunciar grupo (ícone, id @g.us): nem abre.
  if (candidatas[0].linha.pareceGrupo) return erro('grupo', `"${nome}" é grupo, comunidade ou lista de transmissão.`);

  // 2. Abrir e conferir o cabeçalho.
  abrirLinhaDaLista(candidatas[0].el);
  const abriu = await esperarAte(() => tituloAberto() === nome, 6000);
  if (!abriu) {
    if (!encontrar(document, 'painelConversa')) return erro('seletor', 'Painel da conversa não encontrado (seletor #main).');
    return erro('cabecalho', `A conversa aberta não é "${nome}".`);
  }
  return null;
}

/** Existe uma janela/aviso do WhatsApp aberto sobre a conversa? */
function avisoDoWhatsAppAberto(): boolean {
  for (const el of document.querySelectorAll<HTMLElement>(SELETORES.avisoWhatsApp.join(','))) {
    if (!el.hidden && el.getAttribute('aria-hidden') !== 'true') return true;
  }
  return false;
}

/**
 * Reconferência imediatamente antes do clique do envio automático. Devolve o motivo do veto, ou null se tudo
 * confere: painel vivo, título da conversa === nome, conversa individual (MESMO critério da hora de colar),
 * caixa com EXATAMENTE o texto colado (normalizado, emoji incluído) e nenhum aviso do WhatsApp na tela.
 */
export function reconferirAntesDoClique(nome: string, textoColado: string): string | null {
  if (!painelVivo()) return 'o painel parou de responder (fechado ou travado)';
  if (tituloAberto() !== nome) return `a conversa aberta mudou: não é mais "${nome}"`;
  const tipo = classificarConversa(idsDasMensagens(), document, nome, true);
  if (tipo === 'grupo') return `"${nome}" parece grupo, comunidade ou transmissão`;
  if (tipo === 'desconhecido') return `não consegui confirmar que "${nome}" é conversa individual`;
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return 'a caixa de mensagem sumiu';
  const atual = textoDoCampoComEmoji(caixa);
  if (atual.trim() === '') return 'a caixa de mensagem está vazia';
  if (normalizarParaComparar(atual) !== normalizarParaComparar(textoColado)) return 'o texto da caixa não é mais exatamente o que foi colado';
  if (avisoDoWhatsAppAberto()) return 'o WhatsApp está mostrando um aviso/janela';
  return null;
}

type Emitir = (evento: EventoConteudo) => void;

/** Apaga a caixa SÓ se o texto dela ainda é exatamente o nosso. */
function limparSeForNosso(texto: string): boolean {
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return false;
  const atual = textoDoCampoComEmoji(caixa);
  if (atual.trim() === '' || normalizarParaComparar(atual) !== normalizarParaComparar(texto)) return false;
  limparCampo(caixa);
  return true;
}

export async function abrirEColar(
  nome: string,
  texto: string,
  aoDetectarEnvio: (texto: string, confere: boolean) => void,
  envioAutomatico = false,
  emitir: Emitir = () => undefined,
): Promise<RespostaConteudo> {
  pararObservacao();
  registrarBatimento(); // o próprio pedido do painel prova que ele está vivo
  const falha = await abrirConversaPorNome(nome);
  if (falha) return falha;

  // 3. Só conversa individual, com sinal positivo (ver classificarConversa).
  await esperarAte(() => (idsDasMensagens().length > 0 ? true : null), 5000);
  const tipo = classificarConversa(idsDasMensagens(), document, undefined, envioAutomatico);
  if (tipo === 'grupo') return erro('grupo', `"${nome}" é grupo, comunidade ou lista de transmissão.`);
  if (tipo === 'desconhecido') return erro('nao_confirmado', `Não consegui confirmar que "${nome}" é conversa individual. Não colei nada.`);

  // 4. Colar o texto (sem sobrescrever rascunho do usuário).
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return erro('seletor', 'Caixa de mensagem não encontrada.');
  if (textoDoCampoComEmoji(caixa).trim() !== '') return erro('caixa_ocupada', `A conversa de "${nome}" já tem um rascunho na caixa. Não mexi nele.`);
  await esperar(800); // deixa o histórico carregar antes da "foto"
  const idsAntes = idsDasMensagens();
  const antes = new Set(idsAntes);
  escreverNoCampo(caixa, texto);
  await esperar(300);
  if (normalizarParaComparar(textoDoCampoComEmoji(caixa)) !== normalizarParaComparar(texto)) {
    limparCampo(caixa);
    return erro('colar_falhou', 'O texto não ficou na caixa de mensagem.');
  }
  caixa.focus();

  // 5. Esperar o envio (observador). Cada desfecho é entregue UMA vez.
  let resolvido = false;
  const detectado = (textoEnviado: string): void => {
    if (resolvido) return;
    resolvido = true;
    pararObservacao(); // também cancela o envio automático ainda agendado
    aoDetectarEnvio(textoEnviado, true);
  };
  observarEnvio(nome, texto, antes, detectado, () => {
    if (resolvido) return;
    resolvido = true;
    emitir({ tipo: 'vitaZap:observacaoExpirada', nome });
  });

  // 6. Envio automático OPCIONAL: janela de conferência → reconferência → clique → confirmação.
  if (envioAutomatico) {
    let disparou = false;
    cancelarEnvioAuto = agendarEnvioHumano(async () => {
      cancelarEnvioAuto = null;
      if (disparou || resolvido) return;
      disparou = true;
      const r = await enviarHumano(document, {
        reconferir: () => reconferirAntesDoClique(nome, texto),
        confirmar: () => {
          if (resolvido) return true; // o observador já entregou a detecção
          const t = detectarEnvio(nome, texto, antes);
          if (t === null) return false;
          detectado(t);
          return true;
        },
        prazoConfirmacaoMs: PRAZO_CONFIRMACAO_MS,
      });
      if (r.ok || resolvido) return;
      resolvido = true;
      pararObservacao();
      if (r.codigo === 'envio_nao_confirmado') {
        emitir({ tipo: 'vitaZap:envioNaoConfirmado', nome, motivo: r.motivo });
        return;
      }
      const limpou = limparSeForNosso(texto);
      const codigo = r.codigo === 'botao_enviar_ausente' ? 'botao_enviar_ausente' : /painel parou/.test(r.motivo) ? 'painel_ausente' : 'reconferencia_falhou';
      emitir({ tipo: 'vitaZap:envioBloqueado', nome, codigo, motivo: r.motivo, limpou });
    });
  }

  return { ok: true, idsAntes };
}

/**
 * Consulta só-leitura para o painel que reabriu com mensagem "em voo": abre a conversa de `nome` (sem mexer na
 * caixa) e diz se há mensagem NOSSA nova (id fora de `idsAntes`) com exatamente `texto`. Sem a foto `idsAntes`
 * não dá para provar que a mensagem é nova: devolve `nao_encontrado` (o painel manda para "revisar").
 */
export async function consultarEnvio(nome: string, texto: string, idsAntes: string[] | null): Promise<RespostaConteudo> {
  const falha = await abrirConversaPorNome(nome, true);
  if (falha) return falha;
  await esperar(800);
  if (idsAntes === null) return { ok: true, situacao: 'nao_encontrado', avisos: ['sem a foto das mensagens: não dá para provar que é nova'] };
  return { ok: true, situacao: acharMensagemEnviada(texto, new Set(idsAntes)) !== null ? 'enviado' : 'nao_encontrado' };
}

/**
 * Tira o texto colado da caixa (ao Pular/Pausar), se ele ainda for exatamente o nosso.
 * `limpou` só é true se apagou agora: o painel usa isso para saber que nada ficou em voo.
 */
export function limparCaixa(texto: string): RespostaConteudo {
  pararObservacao();
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return { ok: true, limpou: false, avisos: ['caixa de mensagem não encontrada'] };
  const atual = textoDoCampoComEmoji(caixa);
  if (atual.trim() === '') return { ok: true, limpou: false };
  if (normalizarParaComparar(atual) !== normalizarParaComparar(texto)) {
    return { ok: true, limpou: false, avisos: ['o texto da caixa foi editado; deixei como está'] };
  }
  limparCampo(caixa);
  return { ok: true, limpou: true };
}

/**
 * Lembrete de follow-up: abre a conversa e COLA o rascunho na caixa (se houver). Para aí:
 * o usuário confere e aperta Enter. Não observa nem registra envio. Não sobrescreve texto
 * que o usuário já tenha na caixa.
 */
export async function abrirEPrepararRascunho(nome: string, rascunho: string | null): Promise<RespostaConteudo> {
  const jaAberta = tituloAberto() === nome;
  const falha = await abrirConversaPorNome(nome, true);
  if (falha) return falha;
  if (!jaAberta) await buscar(''); // limpa a busca que usamos para achar a conversa
  if (!rascunho || rascunho.trim() === '') return { ok: true };
  const caixa = await esperarAte(() => encontrar(document, 'caixaMensagem'), 4000);
  if (!caixa) return erro('seletor', 'Caixa de mensagem não encontrada.');
  if (textoDoCampoComEmoji(caixa).trim() !== '') return erro('caixa_ocupada', `A conversa de "${nome}" já tem um rascunho na caixa. Não mexi nele.`);
  escreverNoCampo(caixa, rascunho);
  await esperar(300);
  if (normalizarParaComparar(textoDoCampoComEmoji(caixa)) !== normalizarParaComparar(rascunho)) {
    limparCampo(caixa);
    return erro('colar_falhou', 'O texto não ficou na caixa de mensagem.');
  }
  caixa.focus();
  return { ok: true };
}
