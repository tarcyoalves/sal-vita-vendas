// Textos e padrões puros usados pelo content script para reconhecer avisos do WhatsApp e
// conversas de grupo. Ficam aqui (testáveis sem DOM) e não têm nenhuma ação: só classificam texto.

/** Texto de um modal/aviso que significa "a mensagem não saiu". */
const PADRAO_FALHA = /n[ãa]o foi poss[ií]vel enviar|n[ãa]o conseguimos enviar|couldn.?t send|could not send|failed to send|unable to send/i;

/** Texto de aviso de telefone desconectado / restrição / conta. */
const PADRAO_RESTRICAO =
  /telefone\s+(n[ãa]o\s+(est[áa]\s+)?conectado|desconectado)|phone\s+(is\s+)?not\s+connected|computador\s+n[ãa]o\s+(est[áa]\s+)?conectado|sua conta (foi|est[áa]) (restrita|banida|bloqueada)|account (is )?(restricted|banned)|restri[çc][ãa]o|temporariamente (bloquead|restrit)/i;

export function ehTextoDeFalha(texto: string): boolean {
  return PADRAO_FALHA.test(texto);
}

export function ehTextoDeRestricao(texto: string): boolean {
  return PADRAO_RESTRICAO.test(texto);
}

/** Quem fala por você na prévia da lista: não indica grupo. */
const REMETENTES_PROPRIOS = new Set(['você', 'voce', 'you']);

/**
 * Na lista de conversas, a prévia da última mensagem de um GRUPO começa com o nome de quem
 * falou ("Maria: bom dia"). Numa conversa individual não há esse prefixo (nas suas próprias
 * mensagens aparece "Você:", que não conta). Vale como sinal EXTRA de grupo; a favor da
 * segurança, texto individual com "Algo: ..." também é tratado como grupo e fica de fora.
 */
export function previaTemPrefixoDeGrupo(previa: string): boolean {
  const t = previa.replace(/[‎‏‪-‮]/g, '').trim();
  const m = /^([^\n:]{1,40}):\s+\S/u.exec(t);
  if (!m) return false;
  const quem = m[1].trim();
  if (REMETENTES_PROPRIOS.has(quem.toLowerCase())) return false;
  if (/\d{1,2}:\d{2}/.test(t.slice(0, m[0].length))) return false; // "14:30 ..." é hora, não remetente
  return /\p{L}/u.test(quem);
}
