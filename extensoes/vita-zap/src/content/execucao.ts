// Modo "uma tecla": abre a conversa, cola o texto e PARA. Quem envia é o usuário (Enter).
// Depois, só observa o chat para perceber que a mensagem saiu e avisa o painel.
//
// Este arquivo não tem — e não pode ter — nada que envie: nem clique no botão de enviar,
// nem evento de teclado. tests/sem-envio-automatico.test.ts falha se aparecer.

import type { CodigoErro, RespostaConteudo } from '../shared/mensagens';
import { normalizarParaComparar, validarModelo } from '../shared/texto';
import { limparBuscaPeloX, abrirLinhaDaLista } from './abrir-conversa';
import {
  classificarConversa,
  classificarConversaAberta,
  ehMensagemSua,
  idsDasMensagens,
  jidDosIds,
  lerConversaEstavel,
  textoDaMensagem,
  tituloAberto,
  type TipoConversa,
} from './chat';
import { campoVazio, escreverNoCampo, esperar, esperarAte, limparCampo, textoDoCampo, usuarioDigitando } from './dom';
import { lerConversasVisiveis } from './extrair';
import { buscar, exigir, linhasDaLista } from './lista';
import { encontrar, encontrarTodos, SELETORES } from './selectors';

export { classificarConversa };
export type { TipoConversa };

function erro(codigo: CodigoErro, mensagem: string, extra: { texto?: string; jid?: string | null } = {}): RespostaConteudo {
  return { ok: false, codigo, erro: mensagem, ...extra };
}

// ── Botão X que limpa a busca ────────────────────────────────────────────────

/**
 * Limpa a busca clicando no X do próprio WhatsApp (o único clique permitido fora da linha da
 * lista). Procura só na coluna da esquerda e FORA da lista de conversas; nunca no rodapé.
 */
export function limparBuscaPeloBotao(): boolean {
  const coluna = encontrar(document, 'colunaEsquerda');
  if (!coluna) return false;
  const lista = encontrar(document, 'painelLateral');
  for (const seletor of SELETORES.limparBusca) {
    for (const achado of coluna.querySelectorAll<HTMLElement>(seletor)) {
      const botao = achado.closest<HTMLElement>('button, [role="button"]') ?? achado;
      if (lista?.contains(botao) || botao.closest('footer')) continue;
      limparBuscaPeloX(botao);
      return true;
    }
  }
  return false;
}

// ── Observação do envio ──────────────────────────────────────────────────────

interface Observacao {
  observador: MutationObserver;
  timer: ReturnType<typeof setTimeout> | null;
  limite: ReturnType<typeof setTimeout>;
}

let observacao: Observacao | null = null;
/** Depois disto sem perceber o envio, a observação expira (e o painel é avisado). */
export const LIMITE_OBSERVACAO_MS = 30 * 60 * 1000;

export function pararObservacao(): void {
  if (!observacao) return;
  observacao.observador.disconnect();
  if (observacao.timer) clearTimeout(observacao.timer);
  clearTimeout(observacao.limite);
  observacao = null;
}

/**
 * Detecta "a mensagem saiu": na conversa de `nome`, a ÚLTIMA mensagem é sua (data-id true_ ou
 * dentro de .message-out), é nova (não estava na foto tirada antes de colar) e a caixa de texto
 * ficou vazia.
 */
function observarEnvio(
  nome: string,
  textoColado: string,
  antes: Set<string>,
  aoDetectar: (texto: string, confere: boolean, jid: string | null) => void,
  aoExpirar: () => void,
): void {
  pararObservacao();
  const verificar = (): void => {
    if (!observacao) return;
    observacao.timer = null;
    if (tituloAberto() !== nome) return; // usuário está em outra conversa; segue observando
    const mensagens = encontrarTodos(document, 'mensagem');
    const ultima = mensagens[mensagens.length - 1];
    if (!ultima) return;
    const id = ultima.getAttribute('data-id') ?? '';
    if (antes.has(id) || !ehMensagemSua(ultima)) return;
    const caixa = encontrar(document, 'caixaMensagem');
    if (caixa && !campoVazio(caixa)) return;
    const texto = textoDaMensagem(ultima);
    const confere = normalizarParaComparar(texto) === normalizarParaComparar(textoColado);
    const jid = jidDosIds(idsDasMensagens());
    pararObservacao();
    aoDetectar(texto, confere, jid);
  };
  const observador = new MutationObserver(() => {
    if (observacao && !observacao.timer) observacao.timer = setTimeout(verificar, 400);
  });
  const limite = setTimeout(() => {
    pararObservacao();
    aoExpirar();
  }, LIMITE_OBSERVACAO_MS);
  observacao = { observador, timer: null, limite };
  observador.observe(document.body, { childList: true, subtree: true });
}

// ── Cancelamento (Pausar durante "abrindo") ──────────────────────────────────

interface Token {
  cancelado: boolean;
}
let tokenAtual: Token | null = null;

/** Pausar enquanto a conversa abre: a abertura em andamento desiste e limpa a caixa ao fim. */
export function cancelarAbertura(): void {
  if (tokenAtual) tokenAtual.cancelado = true;
}

// ── Conferências ─────────────────────────────────────────────────────────────

/**
 * Compara a conversa com a "foto" de uma tentativa anterior: existe mensagem SUA depois da
 * última mensagem conhecida? (Mensagens mais antigas que só agora carregaram não contam.)
 */
export function compararComFoto(foto: string[]): { estado: 'nova'; texto: string } | { estado: 'nenhuma' | 'indeterminado' } {
  const conhecidas = new Set(foto);
  const mensagens = encontrarTodos(document, 'mensagem');
  let ultimaConhecida = -1;
  mensagens.forEach((m, i) => {
    if (conhecidas.has(m.getAttribute('data-id') ?? '')) ultimaConhecida = i;
  });
  if (ultimaConhecida === -1) return { estado: 'indeterminado' };
  const novas = mensagens.slice(ultimaConhecida + 1).filter(ehMensagemSua);
  const ultima = novas[novas.length - 1];
  return ultima ? { estado: 'nova', texto: textoDaMensagem(ultima) } : { estado: 'nenhuma' };
}

/**
 * Última checagem, no instante de colar (e de novo logo depois): o cabeçalho é exatamente o
 * contato, a conversa é individual e é a MESMA (mesmo JID) que foi confirmada, e a caixa de
 * mensagem está vazia.
 */
function conferirConversa(nome: string, jidEsperado: string | null, exigirCaixaVazia: boolean): RespostaConteudo | null {
  if (tituloAberto() !== nome) return erro('cabecalho', `A conversa aberta deixou de ser "${nome}".`);
  const ids = idsDasMensagens();
  const tipo = classificarConversaAberta(ids);
  if (tipo === 'grupo') return erro('grupo', `"${nome}" é grupo, comunidade ou lista de transmissão.`);
  if (tipo !== 'individual') return erro('nao_confirmado', `Não consegui confirmar que "${nome}" é conversa individual.`);
  if (jidDosIds(ids) !== jidEsperado) return erro('cabecalho', `A conversa de "${nome}" mudou enquanto eu preparava o texto.`);
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return erro('seletor', 'Caixa de mensagem não encontrada.');
  if (exigirCaixaVazia && !campoVazio(caixa)) {
    return erro('caixa_ocupada', `A conversa de "${nome}" já tem um rascunho na caixa. Não mexi nele.`);
  }
  return null;
}

/** Tira o texto colado se ele ainda for exatamente o nosso (sem pedir foco a quem digita). */
function desfazerColagem(texto: string): void {
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return;
  if (normalizarParaComparar(textoDoCampo(caixa)) === normalizarParaComparar(texto)) limparCampo(caixa);
}

interface LeituraDaLista {
  /** O que clicar para abrir: o título de cada linha candidata (ou a linha, sem título). */
  candidatas: HTMLElement[];
  pareceGrupo: boolean[];
}

function lerCandidatas(nome: string): { assinatura: string; leitura: LeituraDaLista } {
  const { conversas } = lerConversasVisiveis(linhasDaLista());
  const assinatura = conversas.map((c) => `${c.linha.nome}|${c.linha.rotuloData ?? ''}|${c.linha.posicao ?? ''}|${c.linha.pareceGrupo ? 'g' : ''}`).join('\n');
  const achadas = conversas.filter((c) => c.linha.nome === nome && c.linha.rotuloData);
  return {
    assinatura,
    leitura: {
      candidatas: achadas.map((c) => encontrar(c.el, 'tituloLinha') ?? c.el),
      pareceGrupo: achadas.map((c) => c.linha.pareceGrupo),
    },
  };
}

/** Espera os resultados da busca ficarem iguais em duas leituras seguidas antes de decidir. */
async function listaEstabilizada(nome: string, limiteMs = 8000, passoMs = 400): Promise<LeituraDaLista | null> {
  const fim = Date.now() + limiteMs;
  let anterior: string | null = null;
  for (;;) {
    const { assinatura, leitura } = lerCandidatas(nome);
    if (leitura.candidatas.length > 0 && assinatura === anterior) return leitura;
    anterior = leitura.candidatas.length > 0 ? assinatura : null;
    if (Date.now() >= fim) return null;
    await esperar(passoMs);
  }
}

// ── Abrir e colar ────────────────────────────────────────────────────────────

export interface AoAbrir {
  aoDetectarEnvio: (texto: string, confere: boolean, jid: string | null) => void;
  aoExpirar: () => void;
}

export async function abrirEColar(nome: string, texto: string, cb: AoAbrir, fotoAntes?: string[]): Promise<RespostaConteudo> {
  pararObservacao();
  const token: Token = { cancelado: false };
  tokenAtual = token;
  try {
    return await abrir(nome, texto, cb, fotoAntes, token);
  } finally {
    if (tokenAtual === token) tokenAtual = null;
  }
}

async function abrir(nome: string, texto: string, cb: AoAbrir, fotoAntes: string[] | undefined, token: Token): Promise<RespostaConteudo> {
  const cancelou = erro('cancelado', 'Pausado durante a abertura da conversa.');

  // 0. O texto precisa passar na validação AGORA (link, tamanho, quebra de linha), mesmo que
  //    tenha vindo de um backup importado.
  const errosTexto = validarModelo(texto);
  if (errosTexto.length > 0) return erro('texto_invalido', `Texto recusado: ${errosTexto.join('; ')}`);

  exigir(encontrar(document, 'painelLateral'), 'lista de conversas');
  if (usuarioDigitando()) {
    return erro('usuario_digitando', 'O WhatsApp tem um campo com texto que você está digitando. Termine ou apague e clique de novo — não mudo o foco enquanto você digita.');
  }

  // 1. Achar a conversa pela busca: a lista precisa estabilizar; exatamente uma linha com este nome.
  await buscar(nome);
  const lista = await listaEstabilizada(nome);
  if (token.cancelado) return cancelou;
  if (!lista) return erro('nao_encontrado', `"${nome}" não apareceu (de forma estável) entre as conversas da busca.`);
  if (lista.candidatas.length > 1) return erro('ambiguo', `Há ${lista.candidatas.length} conversas chamadas "${nome}".`);
  if (lista.pareceGrupo[0]) return erro('grupo', `"${nome}" parece ser grupo (ícone ou prévia "Fulano: …" na lista).`);

  // 2. Abrir e conferir o cabeçalho.
  const candidatas = lista.candidatas;
  abrirLinhaDaLista(candidatas[0]);
  const abriu = await esperarAte(() => tituloAberto() === nome, 6000);
  if (token.cancelado) return cancelou;
  if (!abriu) {
    if (!encontrar(document, 'painelConversa')) return erro('seletor', 'Painel da conversa não encontrado (seletor #main).');
    return erro('cabecalho', `A conversa aberta não é "${nome}".`);
  }

  // 3. Só conversa individual — classificada depois das mensagens carregarem (duas leituras iguais).
  const leitura = await lerConversaEstavel(nome);
  if (token.cancelado) return cancelou;
  if (!leitura) return erro('nao_confirmado', `Não consegui ler as mensagens de "${nome}" com segurança.`);
  if (leitura.tipo === 'grupo') return erro('grupo', `"${nome}" é grupo, comunidade ou lista de transmissão.`);
  if (leitura.tipo === 'desconhecido') return erro('nao_confirmado', `Não consegui confirmar que "${nome}" é conversa individual.`);

  // 4. Retomada: já existe mensagem nossa nova nesta conversa? Então NÃO cola de novo.
  if (fotoAntes) {
    const comparacao = compararComFoto(fotoAntes);
    if (comparacao.estado === 'nova') {
      return erro('ja_enviada', `Já existe uma mensagem sua nova na conversa de "${nome}".`, { texto: comparacao.texto, jid: leitura.jid });
    }
    if (comparacao.estado === 'indeterminado') {
      return erro('nao_confirmado', `Não consegui conferir se a mensagem anterior para "${nome}" já saiu. Confira no WhatsApp; não colei nada.`);
    }
  }

  // 5. Colar o texto (sem sobrescrever rascunho do usuário), conferindo tudo de novo antes e depois.
  await esperar(800); // deixa o histórico carregar antes da "foto"
  if (token.cancelado) return cancelou;
  const antesDeColar = conferirConversa(nome, leitura.jid, true);
  if (antesDeColar) return antesDeColar;
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return erro('seletor', 'Caixa de mensagem não encontrada.');
  const foto = idsDasMensagens();
  if (!escreverNoCampo(caixa, texto)) {
    return erro('usuario_digitando', 'Você está digitando em outro campo do WhatsApp. Não colei nada.');
  }
  await esperar(300);
  if (token.cancelado) {
    desfazerColagem(texto);
    return cancelou;
  }
  const depoisDeColar = conferirConversa(nome, leitura.jid, false);
  if (depoisDeColar) {
    desfazerColagem(texto);
    return depoisDeColar;
  }
  if (normalizarParaComparar(textoDoCampo(caixa)) !== normalizarParaComparar(texto)) {
    limparCampo(caixa);
    return erro('colar_falhou', 'O texto não ficou na caixa de mensagem.');
  }

  // 6. Esperar o usuário enviar.
  observarEnvio(nome, texto, new Set(foto), cb.aoDetectarEnvio, cb.aoExpirar);
  return { ok: true, foto, jid: leitura.jid };
}

/** Tira o texto colado da caixa (ao Pular/Pausar), se ele ainda for exatamente o nosso. */
export function limparCaixa(texto: string): RespostaConteudo {
  pararObservacao();
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return { ok: true, avisos: ['caixa de mensagem não encontrada'] };
  const atual = textoDoCampo(caixa);
  if (campoVazio(caixa)) return { ok: true };
  if (normalizarParaComparar(atual) !== normalizarParaComparar(texto)) {
    return { ok: true, avisos: ['o texto da caixa foi editado; deixei como está'] };
  }
  if (!limparCampo(caixa)) return { ok: true, avisos: ['há texto seu em outro campo; não mexi na caixa'] };
  return { ok: true };
}
