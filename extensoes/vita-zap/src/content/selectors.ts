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
// PROIBIDO: seletor do botão de enviar. A extensão não toca nele (teste em
// tests/sem-envio-automatico.test.ts).

export const SELETORES = {
  /** Coluna da esquerda inteira (cabeçalho + busca + lista ou resultados da busca). */
  colunaEsquerda: ['#side'],

  /** Lista de conversas dentro da coluna da esquerda. */
  painelLateral: ['#pane-side', '[aria-label="Lista de conversas"]', '[aria-label="Chat list"]'],

  /** Uma linha da lista de conversas (ou de resultados da busca). */
  linhaConversa: ['[role="listitem"]', '[role="row"]'],

  /** Nome da conversa dentro da linha: o primeiro span com title. */
  tituloLinha: ['span[dir="auto"][title]', 'span[title]'],

  /** Ícones que só aparecem em grupo / comunidade / lista de transmissão (foto padrão). */
  iconeGrupo: ['[data-icon="default-group"]', '[data-icon="default-community"]', '[data-icon="default-broadcast"]'],

  /** Caixa de busca da lista de conversas (input novo ou contenteditable antigo). */
  caixaBusca: [
    'input[role="textbox"][aria-label*="esquisar"]',
    'input[aria-label*="esquisar"]',
    'div[contenteditable="true"][role="textbox"][aria-label*="esquisar"]',
    'div[contenteditable="true"][data-tab="3"]',
    'input[role="textbox"][aria-label*="earch"]',
    // Variações vistas em contas diferentes (22/10/2026): rótulo só no placeholder, idioma inglês,
    // ou campo sem aria-label. Por último, qualquer campo de texto no topo da coluna de conversas.
    'input[placeholder*="esquisar"]',
    'input[placeholder*="earch"]',
    'input[aria-label*="uscar"]',
    'div[contenteditable="true"][aria-label*="earch"]',
    '#side input[type="text"]',
    '#side div[contenteditable="true"][role="textbox"]',
  ],

  /** Painel da conversa aberta. */
  painelConversa: ['#main'],

  /** Nome no cabeçalho da conversa aberta. */
  tituloCabecalho: ['#main header span[dir="auto"][title]', '#main header span[dir="auto"]'],

  /** Caixa de digitação da conversa aberta (rodapé). */
  caixaMensagem: [
    '#main footer div[contenteditable="true"][role="textbox"]',
    '#main footer div[contenteditable="true"][data-tab="10"]',
    '#main footer div[contenteditable="true"]',
  ],

  /**
   * Mensagens da conversa aberta. O data-id tem a forma "<true|false>_<jid>_<id>":
   * true = enviada por você; o jid termina em @c.us/@lid (individual), @g.us (grupo) ou
   * @broadcast (transmissão).
   */
  mensagem: ['#main [data-id]'],

  /** Texto de uma mensagem. */
  textoMensagem: ['span.selectable-text', '.copyable-text span[dir]'],

  // ── CRM (barra de abas, lembretes, notas, respostas rápidas) ─────────────────

  /**
   * Ícones de status (entrega/leitura/relógio) que a linha da lista mostra SÓ quando a última
   * mensagem foi minha. Qualquer um que exista na linha conta como "última mensagem é minha".
   */
  iconeMinhaMensagem: [
    '[data-icon="msg-check"]',
    '[data-icon="msg-dblcheck"]',
    '[data-icon="msg-dblcheck-ack"]',
    '[data-icon="msg-time"]',
    '[data-icon="status-check"]',
    '[data-icon="status-dblcheck"]',
    '[data-icon="status-time"]',
    '[data-icon*="check"]',
  ],

  /** Selo de "não lida" da linha (o número dentro dele é a quantidade). */
  seloNaoLida: ['span[aria-label*="não lida"]', 'span[aria-label*="nao lida"]', 'span[aria-label*="unread"]'],

  /** Linha-atalho "Arquivadas" no topo da lista: não é uma conversa. */
  linhaArquivadas: ['[data-icon="archived"]', '[data-icon="archive"]', '[data-icon="archived-chat"]'],

  /** Algum elemento da linha com o id da conversa (ex.: 5584999990000@c.us, ...@g.us), se o WhatsApp expuser. */
  idDaLinha: ['[data-id*="@"]'],

  /** Textos do cabeçalho da coluna esquerda (para saber se a visão "Arquivadas" está aberta). */
  cabecalhoColunaEsquerda: ['#side header', '#side [role="heading"]'],

  /** Cabeçalho da conversa aberta (onde entram os botões Lembrete e Cliente). */
  cabecalhoConversa: ['#main header'],

  /** Painel "Dados do contato" (à direita), quando aberto: pode mostrar o telefone do contato. */
  painelDadosContato: ['[data-testid="contact-info-drawer"]', 'section[aria-label*="Dados do contato"]', 'section[aria-label*="Contact info"]'],

  /** Rodapé da conversa aberta (a caixa de digitação mora aqui). */
  rodapeConversa: ['#main footer'],

  /** Contêiner raiz do WhatsApp Web: a barra superior diminui a altura dele para caber acima. Se falhar, a barra flutua. */
  raizApp: ['#app'],

  /** Botão do microfone na caixa de digitação: nossos ícones entram à esquerda dele. */
  microfone: ['#main footer [data-icon="ptt"]', '#main footer button[aria-label*="Mensagem de voz"]', '#main footer button[aria-label*="Voice message"]'],

  /** Indica o tema escuro do WhatsApp (classe "dark" no body/html). */
  temaEscuro: ['body.dark', 'html.dark', '.dark #app', '[data-theme="dark"]'],
} as const;

export type ChaveSeletor = keyof typeof SELETORES;

/**
 * Ícones por nome: desde 10/2026 o WhatsApp Web desenha os ícones como <svg><title>nome</title>
 * (ex.: "wds-ic-read", "ic-push-pin") sem `data-icon`. O CSS não casa texto, então estas chaves
 * também são procuradas pelo <title> do svg. Visto no WhatsApp real em 22/10/2026: "wds-ic-read".
 */
export const TITULOS_ICONE: Partial<Record<ChaveSeletor, RegExp>> = {
  iconeMinhaMensagem: /^(wds-)?(ic-)?(msg-|status-)?(read|delivered|sent|check|dblcheck|double-check|pending|time|clock)\b/i,
  iconeGrupo: /^(wds-)?(ic-)?default-(group|community|broadcast)\b/i,
  linhaArquivadas: /^(wds-)?(ic-)?archived?(-chat)?\b/i,
  microfone: /^(wds-)?(ic-)?(ptt|mic|keyboard-voice)\b/i,
};

function svgPorTitulo(raiz: ParentNode, chave: ChaveSeletor): HTMLElement | null {
  const rx = TITULOS_ICONE[chave];
  if (!rx) return null;
  for (const t of raiz.querySelectorAll('svg > title')) {
    if (rx.test((t.textContent ?? '').trim())) return t.parentElement?.parentElement ?? null;
  }
  return null;
}

/** Primeiro elemento que bate com alguma alternativa, ou null. */
export function encontrar(raiz: ParentNode, chave: ChaveSeletor): HTMLElement | null {
  for (const s of SELETORES[chave]) {
    const el = raiz.querySelector<HTMLElement>(s);
    if (el) return el;
  }
  return svgPorTitulo(raiz, chave);
}

/** Verdadeiro se QUALQUER alternativa bate com algum elemento. */
export function existeAlgum(raiz: ParentNode, chave: ChaveSeletor): boolean {
  return SELETORES[chave].some((s) => raiz.querySelector(s) != null) || svgPorTitulo(raiz, chave) != null;
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
