// Content script do WhatsApp Web: recebe pedidos do painel lateral e responde.
// Pedidos possíveis: verificar, diagnosticar (só leitura), varrer (só leitura), abrirEColar, limparCaixa, pararObservacao,
// cancelarAbertura, consultarPendencias, confirmarPendencias, modoAutomatico e enviarAutomatico.
// No modo manual (padrão) nada aciona o envio. O ÚNICO caminho de envio é `enviarAutomatico`
// (modo automático opt-in, 0.3.0): exige o modo ligado e um token do painel por envio.

import { ehTokenEnvio } from '../shared/automatico';
import type { EventoConteudo, PedidoConteudo, PendenciaEnvio, RespostaConteudo } from '../shared/mensagens';
import { contextoValido, emitirSeguro, idDaExtensao, iniciarVigiaDeContexto } from './contexto';
import { diagnosticarPagina } from './diagnostico';
import { abrirEColar, cancelarAbertura, limparBuscaPeloBotao, limparCaixa, pararObservacao } from './execucao';
import { assumirGeracao } from './geracao';
import { enviarSeAutorizado } from './envioAutomatico';
import { ErroSeletor, ErroUsuarioDigitando } from './lista';
import { definirMeuNome, meuNomeAtual } from './meuNome';
import { definirModoAutomatico, modoAutomaticoLigado } from './modoAutomatico';
import { encontrar } from './selectors';
import { varrerLista } from './varredura';
import { iniciarVigia, lerAvisoWhatsApp, novoEstadoVigia, pararVigia } from './vigia';

// Pode ser injetado de novo pelo painel (aba aberta antes da atualização): a geração mais nova
// encerra o que a antiga deixou rodando, e os ouvintes antigos passam a ignorar os pedidos.
let vigiaContexto: { parar: () => void } | null = null;
let encerrado = false;

const geracao = assumirGeracao(() => {
  definirModoAutomatico(false);
  pararObservacao();
  pararVigia();
  vigiaContexto?.parar();
});

/** Contexto da extensão morreu (recarregada/desativada): desliga observer, timers e ouvinte, em silêncio. */
function encerrar(): void {
  if (encerrado) return;
  encerrado = true;
  try {
    definirModoAutomatico(false);
    pararObservacao();
    pararVigia();
    vigiaContexto?.parar();
    if (contextoValido()) chrome.runtime.onMessage.removeListener(ouvir);
  } catch {
    // silêncio: a página não pode ganhar erro por causa de uma extensão morta
  }
}

let ocupado = false;
const MAX_PENDENCIAS = 50;

function novoId(): string {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Entrega um evento ao painel. Devolve false se não há painel ouvindo (fechado). */
function emitir(evento: EventoConteudo): Promise<boolean> {
  return emitirSeguro(evento, encerrar);
}

/** Envio percebido: fica guardado até o painel confirmar (painel fechado ou recarregado não perde). */
function guardarEEmitirEnvio(nome: string, texto: string, textoConfere: boolean, jid: string | null): void {
  const pendencia: PendenciaEnvio = { id: novoId(), nome, texto, textoConfere, jid, detectadoEm: new Date().toISOString() };
  const fila = geracao.estado.pendencias;
  fila.push(pendencia);
  while (fila.length > MAX_PENDENCIAS) fila.shift();
  void emitir({ tipo: 'vitaZap:envioDetectado', ...pendencia });
}

function idiomaSuportado(): string | null {
  const lang = document.documentElement.lang?.trim().toLowerCase();
  if (!lang || lang.startsWith('pt')) return null;
  return `O WhatsApp Web está em "${lang}". Use em português: as datas da lista são lidas como dia/mês.`;
}

function verificar(): RespostaConteudo {
  if (!encontrar(document, 'painelLateral')) {
    return { ok: false, codigo: 'nao_pronto', erro: 'WhatsApp Web não carregado (ou sem login). Abra e espere a lista de conversas aparecer.' };
  }
  const avisos: string[] = [];
  if (!encontrar(document, 'caixaBusca')) avisos.push('Caixa de busca não encontrada (seletor caixaBusca).');
  const idioma = idiomaSuportado();
  if (idioma) avisos.push(idioma);
  const aviso = lerAvisoWhatsApp(novoEstadoVigia(), Date.now());
  if (aviso) avisos.push(aviso);
  return { ok: true, avisos };
}

async function tratar(pedido: PedidoConteudo): Promise<RespostaConteudo> {
  switch (pedido.tipo) {
    case 'verificar':
      return verificar();
    case 'diagnosticar':
      return { ok: true, diagnostico: diagnosticarPagina(document) };
    case 'pararObservacao':
      pararObservacao();
      pararVigia();
      return { ok: true };
    case 'cancelarAbertura':
      cancelarAbertura();
      return { ok: true };
    case 'limparCaixa':
      return limparCaixa(pedido.texto);
    case 'consultarPendencias':
      return { ok: true, pendencias: [...geracao.estado.pendencias], avisoWhatsApp: lerAvisoWhatsApp(novoEstadoVigia(), Date.now()) };
    case 'confirmarPendencias': {
      const ids = new Set(pedido.ids);
      geracao.estado.pendencias = geracao.estado.pendencias.filter((p) => !ids.has(p.id));
      return { ok: true };
    }
    case 'modoAutomatico':
      definirModoAutomatico(pedido.ligado);
      return { ok: true };
    case 'enviarAutomatico': {
      // Dupla trava no handler: modo ligado e token presente. A função ainda valida o token
      // (nome+texto+campanha, uso único, 30 s) e reconfere a conversa.
      if (!modoAutomaticoLigado() || !ehTokenEnvio(pedido.token)) {
        return { ok: false, codigo: 'envio_nao_autorizado', erro: 'Envio recusado: modo automático desligado ou sem token do painel.' };
      }
      return enviarSeAutorizado({ nome: pedido.nome, texto: pedido.texto, campanhaId: pedido.campanhaId, jid: pedido.jid, token: pedido.token });
    }
    case 'varrer': {
      const idioma = idiomaSuportado();
      if (idioma) return { ok: false, codigo: 'seletor', erro: idioma };
      const r = await varrerLista(
        pedido.termo,
        (lidas, unicas) => void emitir({ tipo: 'vitaZap:progressoVarredura', lidas, unicas }),
        limparBuscaPeloBotao,
      );
      return { ok: true, linhas: r.linhas, avisos: r.avisos };
    }
    case 'abrirEColar': {
      iniciarVigia((texto) => void emitir({ tipo: 'vitaZap:aviso', texto }));
      if (pedido.meuNome) definirMeuNome(pedido.meuNome);
      const r = await abrirEColar(
        pedido.nome,
        pedido.texto,
        {
          aoDetectarEnvio: (texto, textoConfere, jid) => guardarEEmitirEnvio(pedido.nome, texto, textoConfere, jid),
          aoExpirar: () => void emitir({ tipo: 'vitaZap:observacaoExpirou', nome: pedido.nome }),
        },
        pedido.fotoAntes,
      );
      // O painel guarda o nome aprendido ("meuNomeWhatsApp") para as próximas conversas.
      return { ...r, meuNome: meuNomeAtual() };
    }
  }
}

function ouvir(mensagem: PedidoConteudo, remetente: { id?: string }, responder: (r: RespostaConteudo) => void): boolean {
  // Injeção antiga (a página recebeu content.js de novo): só a geração atual responde.
  if (!geracao.atual()) return false;
  const meuId = idDaExtensao();
  if (meuId === null) {
    encerrar();
    return false;
  }
  if (remetente.id !== meuId) return false;
  const longo = mensagem.tipo === 'varrer' || mensagem.tipo === 'abrirEColar' || mensagem.tipo === 'enviarAutomatico';
  if (longo && ocupado) {
    responder({ ok: false, codigo: 'ocupado', erro: 'Outra operação ainda está em andamento.' });
    return false;
  }
  if (longo) ocupado = true;
  tratar(mensagem)
    .then(responder)
    .catch((e: unknown) => {
      if (e instanceof ErroSeletor) responder({ ok: false, codigo: 'seletor', erro: e.message });
      else if (e instanceof ErroUsuarioDigitando) responder({ ok: false, codigo: 'usuario_digitando', erro: e.message });
      else responder({ ok: false, codigo: 'interno', erro: e instanceof Error ? e.message : String(e) });
    })
    .finally(() => {
      if (longo) ocupado = false;
    });
  return true; // resposta assíncrona
}

if (contextoValido()) {
  try {
    chrome.runtime.onMessage.addListener(ouvir);
    vigiaContexto = iniciarVigiaDeContexto(encerrar);
  } catch {
    encerrar();
  }
}
