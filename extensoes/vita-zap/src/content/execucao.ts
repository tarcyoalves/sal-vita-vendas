// Modo "uma tecla": abre a conversa, cola o texto e PARA. Quem envia é o usuário (Enter).
// Depois, só observa o chat para perceber que a mensagem saiu e avisa o painel.
//
// Este arquivo não tem — e não pode ter — nada que envie: nem clique no botão de enviar,
// nem evento de teclado. tests/sem-envio-automatico.test.ts falha se aparecer.

import type { RespostaConteudo } from '../shared/mensagens';
import { normalizarParaComparar } from '../shared/texto';
import { abrirLinhaDaLista } from './abrir-conversa';
import { escreverNoCampo, esperar, esperarAte, limparCampo, limparMarcas, textoDoCampo } from './dom';
import { lerConversasVisiveis } from './extrair';
import { buscar, exigir, linhasDaLista } from './lista';
import { encontrar, encontrarTodos, existeAlgum } from './selectors';
import { agendarEnvioHumano, enviarHumano } from './envio-humano';

export type TipoConversa = 'individual' | 'grupo' | 'desconhecido';

/**
 * Classifica a conversa aberta pelo data-id das mensagens ("true_5584...@c.us_ABC").
 * Qualquer sinal de grupo/transmissão/canal vence; sem sinal nenhum → desconhecido.
 */
export function classificarConversa(dataIds: string[], raiz: ParentNode = document): TipoConversa {
  let individual = false;
  let teveJid = false;
  for (const id of dataIds) {
    const m = /^(?:true|false)_([^_]+)_/.exec(id);
    if (!m) continue;
    teveJid = true;
    const jid = m[1];
    if (/@g\.us$|@broadcast$|@newsletter$/.test(jid)) return 'grupo';
    if (/@c\.us$|@lid$|@s\.whatsapp\.net$/.test(jid)) individual = true;
  }
  if (teveJid) {
    return individual ? 'individual' : 'desconhecido';
  }

  const cabecalho = encontrar(raiz, 'cabecalhoConversa');
  if (cabecalho) {
    if (existeAlgum(cabecalho, 'iconeGrupo')) return 'grupo';
    const textoCabecalho = (cabecalho.textContent ?? '').toLowerCase();
    if (/\b(participantes?|participants?|membros?|members?)\b/i.test(textoCabecalho)) return 'grupo';
    if (/\b(grupo|group|comunidade|community|canal|channel)\b/i.test(textoCabecalho)) return 'grupo';
    if (dataIds.length > 0) return 'individual';
  }

  return 'desconhecido';
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

// ── Observação do envio ──────────────────────────────────────────────────────

interface Observacao {
  observador: MutationObserver;
  timer: ReturnType<typeof setTimeout> | null;
  limite: ReturnType<typeof setTimeout>;
}

let observacao: Observacao | null = null;
let cancelarEnvioAuto: (() => void) | null = null;
const LIMITE_OBSERVACAO_MS = 30 * 60 * 1000;

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

/**
 * Detecta "a mensagem saiu": na conversa de `nome`, a ÚLTIMA mensagem é sua (data-id true_),
 * é nova (não estava na foto tirada antes de colar) e a caixa de texto ficou vazia.
 */
function observarEnvio(nome: string, textoColado: string, antes: Set<string>, aoDetectarEnvio: (texto: string, confere: boolean) => void): void {
  pararObservacao();
  const verificar = (): void => {
    if (!observacao) return;
    observacao.timer = null;
    if (tituloAberto() !== nome) return; // usuário está em outra conversa; segue observando
    const mensagens = encontrarTodos(document, 'mensagem');
    const ultima = mensagens[mensagens.length - 1];
    const id = ultima?.getAttribute('data-id') ?? '';
    if (antes.has(id)) return;
    const caixa = encontrar(document, 'caixaMensagem');
    if (caixa && textoDoCampo(caixa).trim() !== '') return;
    const textoEl = encontrar(ultima, 'textoMensagem');
    const texto = limparMarcas(textoEl?.innerText ?? textoEl?.textContent ?? '');
    const confere = normalizarParaComparar(texto) === normalizarParaComparar(textoColado);
    const ehMinha = id.startsWith('true_') || existeAlgum(ultima, 'iconeMinhaMensagem') || confere;
    if (!ehMinha) return;
    pararObservacao();
    aoDetectarEnvio(texto, confere);
  };
  const observador = new MutationObserver(() => {
    if (observacao && !observacao.timer) observacao.timer = setTimeout(verificar, 400);
  });
  observacao = { observador, timer: null, limite: setTimeout(pararObservacao, LIMITE_OBSERVACAO_MS) };
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
    const achadas = lerConversasVisiveis(linhasDaLista())
      .conversas.filter((c) => c.linha.nome === nome && c.linha.rotuloData)
      .map((c) => c.el);
    return achadas.length > 0 ? achadas : null;
  }, 5000);
  if (!candidatas) return erro('nao_encontrado', `"${nome}" não apareceu entre as conversas da busca.`);
  if (candidatas.length > 1) return erro('ambiguo', `Há ${candidatas.length} conversas chamadas "${nome}".`);

  // 2. Abrir e conferir o cabeçalho.
  abrirLinhaDaLista(candidatas[0]);
  const abriu = await esperarAte(() => tituloAberto() === nome, 6000);
  if (!abriu) {
    if (!encontrar(document, 'painelConversa')) return erro('seletor', 'Painel da conversa não encontrado (seletor #main).');
    return erro('cabecalho', `A conversa aberta não é "${nome}".`);
  }
  return null;
}

export async function abrirEColar(nome: string, texto: string, aoDetectarEnvio: (texto: string, confere: boolean) => void, envioAutomatico = false): Promise<RespostaConteudo> {
  pararObservacao();
  const falha = await abrirConversaPorNome(nome);
  if (falha) return falha;

  // 3. Só conversa individual.
  const ids = await esperarAte(() => {
    const v = idsDasMensagens();
    return v.length > 0 ? v : null;
  }, 5000);
  const tipo = classificarConversa(ids ?? []);
  if (tipo === 'grupo') return erro('grupo', `"${nome}" é grupo, comunidade ou lista de transmissão.`);
  if (tipo === 'desconhecido') return erro('nao_confirmado', `Não consegui confirmar que "${nome}" é conversa individual.`);

  // 4. Colar o texto (sem sobrescrever rascunho do usuário).
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return erro('seletor', 'Caixa de mensagem não encontrada.');
  if (textoDoCampo(caixa).trim() !== '') return erro('caixa_ocupada', `A conversa de "${nome}" já tem um rascunho na caixa. Não mexi nele.`);
  await esperar(800); // deixa o histórico carregar antes da "foto"
  const antes = new Set(idsDasMensagens());
  escreverNoCampo(caixa, texto);
  await esperar(300);
  if (normalizarParaComparar(textoDoCampo(caixa)) !== normalizarParaComparar(texto)) {
    limparCampo(caixa);
    return erro('colar_falhou', 'O texto não ficou na caixa de mensagem.');
  }
  caixa.focus();

  // 5. Esperar o envio (observador).
  observarEnvio(nome, texto, antes, (textoEnviado, confere) => {
    if (cancelarEnvioAuto) {
      cancelarEnvioAuto();
      cancelarEnvioAuto = null;
    }
    aoDetectarEnvio(textoEnviado, confere);
  });

  // 6. Envio humano automático (quando ativado).
  if (envioAutomatico) {
    let enviado = false;
    cancelarEnvioAuto = agendarEnvioHumano(async () => {
      cancelarEnvioAuto = null;
      if (enviado || tituloAberto() !== nome) return;
      enviado = true;
      await enviarHumano(document);
    });
  }

  return { ok: true };
}

/** Tira o texto colado da caixa (ao Pular/Pausar), se ele ainda for exatamente o nosso. */
export function limparCaixa(texto: string): RespostaConteudo {
  pararObservacao();
  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return { ok: true, avisos: ['caixa de mensagem não encontrada'] };
  const atual = textoDoCampo(caixa);
  if (atual.trim() === '') return { ok: true };
  if (normalizarParaComparar(atual) !== normalizarParaComparar(texto)) {
    return { ok: true, avisos: ['o texto da caixa foi editado; deixei como está'] };
  }
  limparCampo(caixa);
  return { ok: true };
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
  if (textoDoCampo(caixa).trim() !== '') return erro('caixa_ocupada', `A conversa de "${nome}" já tem um rascunho na caixa. Não mexi nele.`);
  escreverNoCampo(caixa, rascunho);
  await esperar(300);
  if (normalizarParaComparar(textoDoCampo(caixa)) !== normalizarParaComparar(rascunho)) {
    limparCampo(caixa);
    return erro('colar_falhou', 'O texto não ficou na caixa de mensagem.');
  }
  caixa.focus();
  return { ok: true };
}
