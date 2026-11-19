// Tela de erro do painel quando algo quebra antes (ou durante) a montagem do React.
//
// Montada com createElement/textContent/addEventListener: a CSP das páginas de extensão (MV3) bloqueia handlers inline (atributo onclick),
// e `innerHTML` com texto de erro dentro seria injeção de HTML. Nada aqui interpreta HTML.

import { hashTexto } from '../shared/hash';

/** Atributo que isenta o botão do bloqueio global de Enter (o Enter do fluxo "uma tecla" é do WhatsApp, não do painel). */
export const ATRIBUTO_RECARREGAR = 'data-vz-recarregar';

/** Código curto e estável para o atendente ler ao suporte (não revela o erro; o detalhe vai para o console). */
export function codigoDeSuporte(detalhe: string): string {
  return `VZ-${hashTexto(detalhe).slice(0, 6).toUpperCase()}`;
}

/** Ação de recarregar, trocável nos testes (o `location.reload` do jsdom não pode ser espiado). */
export const acoes = { recarregar: (): void => window.location.reload() };

export function recarregarPainel(): void {
  acoes.recarregar();
}

/** Tecla que aciona o botão de recarregar: Enter ou Espaço. */
export function teclaDeAcionar(e: Pick<KeyboardEvent, 'key'>): boolean {
  return e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, estilo: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = estilo;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Substitui o conteúdo de `raiz` pela tela de erro. `recarregar` existe para os testes; no painel é o reload da página. */
export function exibirErroFatal(raiz: HTMLElement, detalhe: string, recarregar: () => void = recarregarPainel): string {
  const codigo = codigoDeSuporte(detalhe);
  const caixa = el('div', 'padding:16px;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;background:#fff;min-height:100vh;box-sizing:border-box;');
  caixa.append(el('strong', 'display:block;font-size:15px;color:#dc2626;margin-bottom:12px;', 'O painel do Vita Zap não abriu'));
  caixa.append(el('p', 'font-size:13px;color:#475569;margin:0 0 8px 0;', 'Clique em "Recarregar painel". Se continuar assim, fale com o suporte e informe o código abaixo.'));
  caixa.append(el('p', 'font-size:12px;color:#64748b;margin:0 0 12px 0;', `Código de suporte: ${codigo}`));

  const botao = el('button', 'background:#059669;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;', 'Recarregar painel');
  botao.type = 'button';
  botao.setAttribute(ATRIBUTO_RECARREGAR, '1');
  botao.addEventListener('click', recarregar);
  // Enter/Espaço também recarregam (o Enter nativo é bloqueado no painel; aqui é decisão explícita do atendente).
  botao.addEventListener('keydown', (e) => {
    if (!teclaDeAcionar(e)) return;
    e.preventDefault();
    recarregar();
  });
  caixa.append(botao);

  raiz.replaceChildren(caixa);
  botao.focus();
  return codigo;
}

function detalheDe(erro: unknown): string {
  if (erro instanceof Error) return erro.stack || erro.message;
  return String(erro ?? 'Erro desconhecido');
}

/** Registra os ouvintes globais: erro antes do React montar → tela de erro; o detalhe vai só para o console. */
export function instalarTratamentoDeErroFatal(): void {
  window.addEventListener('error', (e) => {
    console.error('[Vita Zap Painel] Erro:', e.error ?? e.message);
    const raiz = document.getElementById('raiz');
    if (raiz && !raiz.hasChildNodes()) exibirErroFatal(raiz, detalheDe(e.error ?? e.message));
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[Vita Zap Painel] Promessa rejeitada:', e.reason);
  });
  // Enter no painel nunca aciona botão (um Enter distraído poderia "Pular" o contato). Exceção: o botão de recarregar do erro.
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' && e.target instanceof HTMLButtonElement && !e.target.hasAttribute(ATRIBUTO_RECARREGAR)) e.preventDefault();
    },
    true,
  );
}
