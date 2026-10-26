// Barra superior de largura total (48 px) acima de TODO o WhatsApp Web, em Shadow DOM.
//
// Esquerda: logo, abas (Todas, Não lidas, Aguardando, Precisa, funil e personalizadas), "+" e ajustes de filtro.
// Direita: respostas rápidas, lembretes, clientes, ajuda e "Conectar ao CRM" / conta.
//
// Layout: a barra é fixa no topo e o contêiner raiz do WhatsApp (#app) ganha altura calc(100vh - 48px) e
// margem de 48 px (revertidos ao desligar). Se o seletor da raiz falhar, não empurramos nada: a barra
// flutua por cima, com sombra, e há um console.warn (uma vez). Nada aqui envia mensagem.

import { encontrar } from '../selectors';
import { avisarUmaVez, criarHost, h, icone, isolarCliques, logoVz, sincronizarTema, type Host } from './ui';

export const ALTURA_BARRA = 48;

export interface AbaTopo {
  id: string;
  rotulo: string;
  n: number;
  ativa: boolean;
  /** Ponto verde: mais conversas do que na última vez que o usuário clicou nesta aba. */
  novidade: boolean;
  /** Contador em vermelho: há algo vencido (aba Acompanhar com lembrete vencido). */
  alerta?: boolean;
  tipo: 'fixa' | 'funil' | 'personalizada';
  /** Cor da fase (funil). */
  cor?: string;
  dica?: string;
}

export type ContaTopo = { tipo: 'oculta' } | { tipo: 'sem-login' } | { tipo: 'logado'; nome: string; email: string; iniciais: string };

export interface EstadoTopo {
  abas: AbaTopo[];
  vencidos: number;
  conta: ContaTopo;
}

export interface AcoesTopo {
  escolherAba: (id: string) => void;
  novaAba: (ancora: HTMLElement) => void;
  ajustes: (ancora: HTMLElement) => void;
  respostas: (ancora: HTMLElement) => void;
  lembretes: (ancora: HTMLElement) => void;
  clientes: () => void;
  ajuda: (ancora: HTMLElement) => void;
  conta: (ancora: HTMLElement) => void;
}

export function iniciaisDe(nome: string, email = ''): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length >= 2 ? partes[0][0] + partes[partes.length - 1][0] : (partes[0] ?? email).slice(0, 2);
  return letras.toUpperCase() || '?';
}

interface Original {
  altura: string;
  prioridadeAltura: string;
  margem: string;
  prioridadeMargem: string;
}

const MARCA = 'data-vita-zap-empurrado';

export class BarraSuperior {
  readonly h: Host = criarHost('vita-zap-topo');
  private chaveRender = '';
  private raiz: HTMLElement | null = null;
  private original: Original | null = null;
  /** 'empurrando' = a raiz foi encolhida; 'flutuando' = seletor falhou e a barra cobre o topo. */
  modo: 'empurrando' | 'flutuando' | null = null;

  constructor() {
    Object.assign(this.h.host.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      height: `${ALTURA_BARRA}px`,
      zIndex: '2147482000',
      display: 'block',
    });
    isolarCliques(this.h.host);
  }

  /** Coloca a barra no <body> e ajusta a raiz do WhatsApp (ou flutua, se a raiz não existe). Seguro de repetir. */
  garantirNoLugar(): void {
    sincronizarTema(this.h.host);
    if (!this.h.host.isConnected) {
      document.body.prepend(this.h.host);
      this.chaveRender = '';
    }
    const raiz = encontrar(document, 'raizApp');
    if (!raiz) {
      if (this.raiz) this.soltarRaiz();
      if (this.modo !== 'flutuando') {
        this.modo = 'flutuando';
        this.h.host.classList.add('flutuando');
        avisarUmaVez('topo-raiz', 'Não achei o contêiner raiz do WhatsApp (seletor raizApp): a barra superior flutua por cima, sem empurrar a tela.');
      }
      return;
    }
    this.h.host.classList.remove('flutuando');
    this.modo = 'empurrando';
    if (this.raiz !== raiz) {
      if (this.raiz) this.soltarRaiz();
      this.raiz = raiz;
      this.original = {
        altura: raiz.style.getPropertyValue('height'),
        prioridadeAltura: raiz.style.getPropertyPriority('height'),
        margem: raiz.style.getPropertyValue('margin-top'),
        prioridadeMargem: raiz.style.getPropertyPriority('margin-top'),
      };
    }
    if (raiz.getAttribute(MARCA) !== String(ALTURA_BARRA)) raiz.setAttribute(MARCA, String(ALTURA_BARRA));
    if (raiz.style.getPropertyValue('height') !== `calc(100vh - ${ALTURA_BARRA}px)`) raiz.style.setProperty('height', `calc(100vh - ${ALTURA_BARRA}px)`, 'important');
    if (raiz.style.getPropertyValue('margin-top') !== `${ALTURA_BARRA}px`) raiz.style.setProperty('margin-top', `${ALTURA_BARRA}px`, 'important');
  }

  /** Devolve à raiz do WhatsApp a altura e a margem que ela tinha. */
  private soltarRaiz(): void {
    const raiz = this.raiz;
    const o = this.original;
    this.raiz = null;
    this.original = null;
    if (!raiz) return;
    raiz.removeAttribute(MARCA);
    if (o?.altura) raiz.style.setProperty('height', o.altura, o.prioridadeAltura);
    else raiz.style.removeProperty('height');
    if (o?.margem) raiz.style.setProperty('margin-top', o.margem, o.prioridadeMargem);
    else raiz.style.removeProperty('margin-top');
    if (raiz.getAttribute('style') === '') raiz.removeAttribute('style');
  }

  /** Tira a barra e restaura o layout do WhatsApp. */
  remover(): void {
    this.soltarRaiz();
    this.h.host.remove();
    this.h.host.classList.remove('flutuando');
    this.modo = null;
    this.chaveRender = '';
  }

  render(e: EstadoTopo, a: AcoesTopo): void {
    sincronizarTema(this.h.host);
    const chave = JSON.stringify(e);
    if (chave === this.chaveRender) return;
    this.chaveRender = chave;

    // Mantém a rolagem horizontal das abas entre redesenhos.
    const rolagemAntes = this.h.conteudo.querySelector<HTMLElement>('.topo-abas')?.scrollLeft ?? 0;
    const abas = h(
      'div',
      { class: 'topo-abas', role: 'tablist' },
      e.abas.map((t) =>
        h(
          'button',
          {
            class: `taba${t.ativa ? ' ativa' : ''}${t.alerta ? ' alerta' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': t.ativa ? 'true' : 'false',
            'data-aba': t.id,
            title: t.alerta ? `${t.dica ?? t.rotulo} (há lembrete vencido)` : t.dica,
            onclick: () => a.escolherAba(t.id),
          },
          t.tipo === 'funil' && t.cor ? h('span', { class: 'fase', style: `background:${t.cor}` }) : null,
          t.rotulo,
          h('span', { class: 'n' }, String(t.n)),
          t.novidade ? h('span', { class: 'ponto', title: 'Novidade desde a última vez que você abriu esta aba' }) : null,
        ),
      ),
    );

    const btn = (rotulo: string, nome: Parameters<typeof icone>[0], aoClicar: (ancora: HTMLElement) => void, extra: Array<Node | null> = [], tam = 22): HTMLButtonElement =>
      h('button', { class: 'tbtn', type: 'button', 'data-tip': rotulo, 'aria-label': rotulo, onclick: (ev) => aoClicar(ev.currentTarget as HTMLElement) }, icone(nome, tam), ...extra);

    const conta =
      e.conta.tipo === 'logado'
        ? h(
            'button',
            { class: 'conta', type: 'button', 'data-tip': `${e.conta.nome} (${e.conta.email})`, 'aria-label': 'Conta do CRM', onclick: (ev) => a.conta(ev.currentTarget as HTMLElement) },
            h('span', { class: 'avatar' }, e.conta.iniciais),
            h('span', { class: 'ok-crm' }, 'CRM ✓'),
          )
        : e.conta.tipo === 'sem-login'
          ? h('button', { class: 'cta', type: 'button', 'data-tip': 'Conecte ao CRM Lembretes (se você já está logado no site, não pede senha)', onclick: (ev) => a.conta(ev.currentTarget as HTMLElement) }, 'Conectar ao CRM')
          : null;

    this.h.conteudo.replaceChildren(
      h(
        'div',
        { class: 'topo' },
        h('span', { class: 'logo' }, logoVz(32)),
        abas,
        btn('Nova aba', 'mais', a.novaAba),
        btn('Ajustes de filtro', 'ajustes', a.ajustes),
        h('span', { class: 'topo-esp' }),
        h(
          'div',
          { class: 'topo-dir' },
          btn('Respostas rápidas', 'raio', a.respostas),
          btn(
            e.vencidos > 0 ? `Lembretes (${e.vencidos} vencido${e.vencidos > 1 ? 's' : ''})` : 'Lembretes',
            'sino',
            a.lembretes,
            [e.vencidos > 0 ? h('span', { class: 'selo' }, e.vencidos > 99 ? '99+' : String(e.vencidos)) : null],
          ),
          btn('Clientes', 'clientes', () => a.clientes()),
          btn('Ajuda', 'ajuda', a.ajuda),
          conta,
        ),
      ),
    );
    const novo = this.h.conteudo.querySelector<HTMLElement>('.topo-abas');
    if (novo && rolagemAntes > 0) novo.scrollLeft = rolagemAntes;
  }
}
