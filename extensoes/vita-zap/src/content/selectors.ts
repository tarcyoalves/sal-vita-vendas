// TODOS os seletores do WhatsApp Web ficam aqui. Quando o WhatsApp mudar o HTML, só este
// arquivo muda.
//
// ⚠️ NÃO VALIDADOS contra o WhatsApp Web real: foram escritos sem acesso a ele, a partir de
// atributos que historicamente são estáveis. Rode o checklist manual do README antes da
// primeira campanha e a cada atualização do WhatsApp Web.
//
// Preferência, nesta ordem: id fixo (#pane-side, #main) > role/aria-label > data-* > classe.
// Classes geradas (ex.: "_ak8l") NUNCA — mudam a cada versão.
//
// Cada entrada é uma lista de alternativas, tentadas em ordem. Se nenhuma bater, a operação
// para com erro 'seletor' (falha fechada) — nunca "tenta outra coisa".
//
// data-testid estáveis valem como alternativa; classes com hash (_ak72 etc.) nunca.
//
// PROIBIDO: seletor do botão de enviar. A extensão não toca nele (teste em
// tests/sem-envio-automatico.test.ts).

export const SELETORES = {
  /** Coluna da esquerda inteira (cabeçalho + busca + lista ou resultados da busca). */
  colunaEsquerda: ['#side'],

  /** Lista de conversas dentro da coluna da esquerda. */
  painelLateral: [
    '#pane-side',
    '[aria-label="Lista de conversas"]',
    '[aria-label="Chat list"]',
    '[data-testid="chat-list"]',
  ],

  /** Uma linha da lista de conversas (ou de resultados da busca). */
  linhaConversa: ['[role="listitem"]', '[role="row"]'],

  /** Nome da conversa dentro da linha: o primeiro span com title. */
  tituloLinha: ['span[dir="auto"][title]', 'span[title]', '[data-testid="cell-frame-title"] span'],

  /** Ícones que só aparecem em grupo / comunidade / lista de transmissão (foto padrão). */
  iconeGrupo: ['[data-icon="default-group"]', '[data-icon="default-community"]', '[data-icon="default-broadcast"]'],

  /** Caixa de busca da lista de conversas (input novo ou contenteditable antigo). */
  caixaBusca: [
    'input[role="textbox"][aria-label*="esquisar"]',
    'input[aria-label*="esquisar"]',
    'div[contenteditable="true"][role="textbox"][aria-label*="esquisar"]',
    'div[contenteditable="true"][data-tab="3"]',
    'input[role="textbox"][aria-label*="earch"]',
    'div[role="textbox"][data-testid="chat-list-search"]',
    // WhatsApp Web de 20/10/2026: <input role="textbox" data-tab="3" aria-label=""> (aria-label VAZIO).
    '#side input[role="textbox"][data-tab="3"]',
    '#side input[role="textbox"]',
    '#side input[type="text"]',
  ],

  /**
   * Botão X do próprio WhatsApp que limpa a busca (NÃO é o botão de enviar nem de cancelar
   * mensagem). Procurado só na coluna da esquerda, fora da lista e de #main, e só quando a
   * caixa de busca tem texto; veja `limparBuscaPeloBotao`. "End icon button" é o rótulo que o
   * WhatsApp de 20/10/2026 deu ao X da busca.
   */
  limparBusca: ['button[aria-label*="Limpar"]', 'button[aria-label*="Clear search"]', '[data-icon="x-alt"]', 'button[aria-label="End icon button"]'],

  /** Painel da conversa aberta. */
  painelConversa: ['#main'],

  /** Nome no cabeçalho da conversa aberta. */
  tituloCabecalho: ['#main header span[dir="auto"][title]', '#main header span[dir="auto"]'],

  /** Caixa de digitação da conversa aberta (rodapé). */
  caixaMensagem: [
    '#main footer div[contenteditable="true"][role="textbox"]',
    '#main footer div[contenteditable="true"][data-tab="10"]',
    '#main footer div[contenteditable="true"]',
    'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
  ],

  /**
   * Mensagens da conversa aberta. O data-id tem a forma "<true|false>_<jid>_<id>":
   * true = enviada por você; o jid termina em @c.us/@lid (individual), @g.us (grupo) ou
   * @broadcast (transmissão). No formato de 20/10/2026 o id vem de data-id ou de
   * data-testid="conv-msg-<ID>" (sem true_/false_ nem JID).
   */
  mensagem: ['#main [data-id], #main [data-testid^="conv-msg-"]', '[data-testid="conversation-panel-messages"] [data-id]'],

  /**
   * Linha virtualizada da conversa (WhatsApp de 20/10/2026): '#main [role="row"]', com um filho
   * data-testid="conv-msg-<ID>". Só as linhas renderizadas por completo têm texto e autor.
   */
  linhaMensagem: ['[role="row"]'],

  /** Mensagem sua: sinal PRINCIPAL no WhatsApp atual (o data-id novo não tem "true_"). Classe semântica, não gerada. */
  mensagemSua: ['.message-out'],

  /** Mensagem recebida. */
  mensagemRecebida: ['.message-in'],

  /** Nome do autor mostrado dentro de uma mensagem recebida (só aparece em grupo). */
  autorMensagem: ['[data-testid="author"]', '[data-testid="msg-author"]'],

  /** Relógio de "ainda não saiu" dentro de uma mensagem sua. */
  relogioPendente: ['[data-icon="msg-time"]'],

  /** Avisos do WhatsApp que pausam a campanha. */
  avisoTelefone: ['[data-testid="alert-phone-not-connected"]', '[data-icon="alert-computer"]', '[data-icon="alert-phone"]'],
  avisoBanner: ['div[role="alert"]'],
  modal: ['[role="dialog"]', 'div[data-animate-modal-popup="true"]'],

  /** Texto de uma mensagem. */
  textoMensagem: ['span.selectable-text', '.copyable-text span[dir]'],
} as const;

export type ChaveSeletor = keyof typeof SELETORES;

/** Primeiro elemento que bate com alguma alternativa, ou null. */
export function encontrar(raiz: ParentNode, chave: ChaveSeletor): HTMLElement | null {
  for (const s of SELETORES[chave]) {
    const el = raiz.querySelector<HTMLElement>(s);
    if (el) return el;
  }
  return null;
}

/** Todos os elementos da primeira alternativa que tiver algum resultado. */
export function encontrarTodos(raiz: ParentNode, chave: ChaveSeletor): HTMLElement[] {
  for (const s of SELETORES[chave]) {
    const els = raiz.querySelectorAll<HTMLElement>(s);
    if (els.length > 0) return [...els];
  }
  return [];
}

/** Rótulos de seção nos resultados da busca a partir dos quais NÃO há conversa existente. */
export const SECOES_SEM_CONVERSA = [
  'contatos',
  'contacts',
  'outros contatos',
  'other contacts',
  'mensagens',
  'messages',
  'nao esta nos seus contatos',
  'not in your contacts',
];
