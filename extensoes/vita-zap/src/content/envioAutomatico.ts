// ⚠️ ÚNICO arquivo da extensão que aciona o envio de uma mensagem (modo automático, 0.3.0).
//
// Envio automático pelo WhatsApp Web viola os Termos do WhatsApp e pode bloquear o número de
// forma permanente — decisão escrita do dono, opt-in, volume baixo, só clientes que já conversam
// com ele. Este arquivo exporta UMA função, `enviarSeAutorizado`, e só o handler do pedido
// `enviarAutomatico` (content/index.ts) a importa. tests/envio-so-no-automatico-autorizado.test.ts
// reprova o build se aparecer outro caminho de envio, evento de teclado ou outro clique.
//
// Não usa teclado: aciona o botão de enviar do RODAPÉ da conversa aberta, nada mais.

import { type AlvoEnvio, recusaDoToken, type TokenEnvio } from '../shared/automatico';
import type { CodigoErro, RespostaConteudo } from '../shared/mensagens';
import { classificarConversaAberta, idsDasMensagens, jidDosIds, tituloAberto } from './chat';
import { contextoValido } from './contexto';
import { textoDoCampo } from './dom';
import { modoAutomaticoLigado } from './modoAutomatico';
import { encontrar } from './selectors';
import { lerAvisoWhatsApp, novoEstadoVigia } from './vigia';

export interface ContextoEnvio extends AlvoEnvio {
  jid: string | null;
  token: TokenEnvio;
}

/** Botão de enviar do rodapé de #main, nesta ordem. Qualquer coisa fora do rodapé é ignorada. */
const BOTAO_PELO_ROTULO_PT = '#main footer button[aria-label="Enviar"]';
const ICONE_DE_ENVIAR = '#main footer [data-icon="send"]';
const BOTAO_PELO_ROTULO_EN = '#main footer button[aria-label="Send"]';

/** Tokens já usados (uso único). Em memória; o content script novo começa vazio, e o painel emite tokens novos. */
const tokensUsados = new Set<string>();
const MAX_TOKENS_GUARDADOS = 200;

function recusa(codigo: CodigoErro, mensagem: string): RespostaConteudo {
  return { ok: false, codigo, erro: mensagem };
}

function achouBotaoDeEnviar(): HTMLButtonElement | null {
  const candidatos: Array<HTMLElement | null> = [
    document.querySelector<HTMLElement>(BOTAO_PELO_ROTULO_PT),
    document.querySelector<HTMLElement>(ICONE_DE_ENVIAR)?.closest<HTMLElement>('button') ?? null,
    document.querySelector<HTMLElement>(BOTAO_PELO_ROTULO_EN),
  ];
  for (const el of candidatos) {
    if (el instanceof HTMLButtonElement && el.closest('#main footer') && !el.disabled && el.getAttribute('aria-disabled') !== 'true') return el;
  }
  return null;
}

/** Igualdade EXATA do texto da caixa com o colado (só ignora espaço nas pontas e caracteres invisíveis). */
function textoIgualExato(naCaixa: string, colado: string): boolean {
  const limpo = (t: string): string => t.replace(/[​-‏⁠﻿]/g, '').replace(/ /g, ' ').trim();
  return limpo(naCaixa) === limpo(colado);
}

/**
 * Aciona o botão de enviar da conversa aberta SE, e só se, tudo isto valer neste instante:
 * token do painel válido para este nome+texto+campanha (uso único, 30 s) · modo automático
 * ligado e renovado há pouco · contexto da extensão vivo (painel aberto) · cabeçalho é o
 * contato · conversa individual e a mesma de quando colamos · texto da caixa EXATAMENTE o
 * colado · nenhum aviso do WhatsApp na tela · botão de enviar do rodapé encontrado.
 * Tudo é síncrono: nada acontece entre a última conferência e o clique.
 */
export async function enviarSeAutorizado(ctx: ContextoEnvio): Promise<RespostaConteudo> {
  const motivo = recusaDoToken(ctx.token, { campanhaId: ctx.campanhaId, nome: ctx.nome, texto: ctx.texto }, Date.now(), tokensUsados);
  if (motivo) return recusa('envio_nao_autorizado', `Envio recusado: ${motivo}.`);
  // Uso único: o token é queimado já aqui, qualquer que seja o resultado das conferências.
  if (tokensUsados.size >= MAX_TOKENS_GUARDADOS) tokensUsados.clear();
  tokensUsados.add(ctx.token.id);

  if (!modoAutomaticoLigado()) return recusa('envio_nao_autorizado', 'Envio recusado: o modo automático não está ligado (ou o painel não o renovou).');
  if (!contextoValido()) return recusa('envio_nao_autorizado', 'Envio recusado: a extensão perdeu a conexão com o painel.');

  if (tituloAberto() !== ctx.nome) return recusa('cabecalho', `A conversa aberta deixou de ser "${ctx.nome}". Nada foi enviado.`);
  const ids = idsDasMensagens();
  const tipo = classificarConversaAberta(ids);
  if (tipo === 'grupo') return recusa('grupo', `"${ctx.nome}" é grupo, comunidade ou lista de transmissão. Nada foi enviado.`);
  if (tipo !== 'individual') return recusa('nao_confirmado', `Não consegui confirmar que "${ctx.nome}" é conversa individual. Nada foi enviado.`);
  if (jidDosIds(ids) !== ctx.jid) return recusa('cabecalho', `A conversa de "${ctx.nome}" mudou depois de colar o texto. Nada foi enviado.`);

  const caixa = encontrar(document, 'caixaMensagem');
  if (!caixa) return recusa('seletor', 'Caixa de mensagem não encontrada. Nada foi enviado.');
  if (!textoIgualExato(textoDoCampo(caixa), ctx.texto)) {
    return recusa('texto_alterado', `O texto da caixa de "${ctx.nome}" não é mais o que foi colado. Nada foi enviado.`);
  }

  const aviso = lerAvisoWhatsApp(novoEstadoVigia(), Date.now());
  if (aviso) return recusa('aviso_whatsapp', `${aviso} Nada foi enviado.`);

  const botao = achouBotaoDeEnviar();
  if (!botao) return recusa('botao_enviar_ausente', 'Não encontrei o botão de enviar no rodapé da conversa. Nada foi enviado.');

  botao.click();
  return { ok: true, jid: ctx.jid };
}
