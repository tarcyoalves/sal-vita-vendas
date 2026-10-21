// Popover flutuante (menus, painéis) num host próprio no <body>, em Shadow DOM.
// Fica fora das colunas do WhatsApp para não ser cortado por overflow/z-index deles.

import { criarHost, h, icone, isolarCliques, sincronizarTema, type Host } from './ui';

let overlay: Host | null = null;
let aberto: { ancora: HTMLElement; el: HTMLElement; aoFechar?: () => void; desligar: () => void } | null = null;

function garantirOverlay(): Host {
  if (overlay && overlay.host.isConnected) return overlay;
  overlay = criarHost('vita-zap-overlay');
  Object.assign(overlay.host.style, { position: 'fixed', inset: '0', zIndex: '2147483000', pointerEvents: 'none' });
  document.body.append(overlay.host);
  return overlay;
}

export function fecharPopover(): void {
  if (!aberto) return;
  const a = aberto;
  aberto = null;
  a.desligar();
  a.el.remove();
  a.aoFechar?.();
}

export function popoverAbertoEm(ancora: HTMLElement): boolean {
  return aberto?.ancora === ancora;
}

export interface OpcoesPopover {
  ancora: HTMLElement;
  largura?: number;
  /** Abre acima da âncora (caixa de digitação). */
  acima?: boolean;
  titulo?: string;
  aoFechar?: () => void;
}

export interface PopoverAberto {
  /** Onde montar o conteúdo. */
  corpo: HTMLElement;
  fechar: () => void;
  /** Reposiciona (depois de o conteúdo mudar de altura). */
  reposicionar: () => void;
}

export function abrirPopover(op: OpcoesPopover): PopoverAberto {
  fecharPopover();
  const o = garantirOverlay();
  sincronizarTema(o.host);
  const largura = op.largura ?? 340;
  const corpo = h('div', {});
  const el = h(
    'div',
    { class: 'pop', style: `width:${largura}px` },
    op.titulo
      ? h('div', { class: 'cab' }, h('strong', {}, op.titulo), h('button', { class: 'x', type: 'button', title: 'Fechar', onclick: () => fecharPopover() }, icone('fechar', 14)))
      : null,
    corpo,
  );
  isolarCliques(el);
  o.conteudo.append(el);

  const reposicionar = (): void => {
    const r = op.ancora.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(largura, vw - 16);
    el.style.width = `${w}px`;
    const esq = Math.max(8, Math.min(r.left, vw - w - 8));
    el.style.left = `${esq}px`;
    if (op.acima) {
      el.style.top = 'auto';
      el.style.bottom = `${Math.max(8, vh - r.top + 6)}px`;
    } else {
      el.style.bottom = 'auto';
      el.style.top = `${Math.max(8, Math.min(r.bottom + 6, vh - 120))}px`;
    }
  };
  reposicionar();

  const aoClicarFora = (e: Event): void => {
    const caminho = e.composedPath();
    if (caminho.includes(el) || caminho.includes(op.ancora)) return;
    fecharPopover();
  };
  document.addEventListener('mousedown', aoClicarFora, true);
  window.addEventListener('resize', fecharPopover);
  aberto = {
    ancora: op.ancora,
    el,
    aoFechar: op.aoFechar,
    desligar: () => {
      document.removeEventListener('mousedown', aoClicarFora, true);
      window.removeEventListener('resize', fecharPopover);
    },
  };
  return { corpo, fechar: fecharPopover, reposicionar };
}

/** Aviso curto no rodapé da tela (some sozinho). */
export function mostrarAviso(texto: string, tipo: 'info' | 'erro' = 'info'): void {
  const o = garantirOverlay();
  sincronizarTema(o.host);
  const el = h('div', { class: `toast${tipo === 'erro' ? ' erro' : ''}`, role: 'status' }, texto);
  o.conteudo.append(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? 9000 : 6000);
}
