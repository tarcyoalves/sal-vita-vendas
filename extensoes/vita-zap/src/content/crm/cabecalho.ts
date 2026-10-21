// Botões no cabeçalho da conversa aberta (Lembrete, Cliente). Host em Shadow DOM dentro do
// <header> do WhatsApp; se o WhatsApp recriar o cabeçalho, o próximo ciclo o coloca de volta.

import { criarHost, h, icone, isolarCliques, sincronizarTema } from './ui';

export interface InfoCabecalho {
  nome: string;
  chave: string;
  /** Lembretes ainda não concluídos deste contato. */
  lembretes: number;
  /** Quantas notas/etiquetas o contato tem (selo no botão Cliente). */
  anotacoes: number;
  vencido: boolean;
}

export interface AcoesCabecalho {
  abrirLembrete: (ancora: HTMLElement) => void;
  abrirCliente?: (ancora: HTMLElement) => void;
}

export class Cabecalho {
  readonly h = criarHost('vita-zap-cabecalho');
  private chaveRender = '';
  chaveAtual = '';

  constructor() {
    Object.assign(this.h.host.style, { display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', margin: '0 4px' });
    isolarCliques(this.h.host);
  }

  remover(): void {
    this.h.host.remove();
    this.chaveRender = '';
    this.chaveAtual = '';
  }

  /** `header` null = nenhuma conversa aberta (ou seletor quebrado): some em silêncio. */
  atualizar(header: HTMLElement | null, info: InfoCabecalho | null, acoes: AcoesCabecalho): void {
    if (!header || !info) {
      this.remover();
      return;
    }
    if (this.h.host.parentElement !== header) {
      header.append(this.h.host);
      this.chaveRender = '';
    }
    sincronizarTema(this.h.host);
    this.chaveAtual = info.chave;
    const chave = JSON.stringify(info);
    if (chave === this.chaveRender) return;
    this.chaveRender = chave;
    const selo = (n: number, vencido = false): HTMLElement | null => (n > 0 ? h('span', { class: 'selo', style: vencido ? '' : 'background:var(--verde)' }, String(n)) : null);
    const botoes = h('div', { style: 'display:flex' });
    this.h.conteudo.replaceChildren(botoes);
    botoes.append(
      h(
        'button',
        { class: 'topbtn', type: 'button', title: 'Lembrete de follow-up', onclick: (e) => acoes.abrirLembrete(e.currentTarget as HTMLElement) },
        icone('relogio', 20),
        selo(info.lembretes, info.vencido),
      ),
      ...(acoes.abrirCliente
        ? [h(
            'button',
            { class: 'topbtn', type: 'button', title: 'Cliente: notas, etiquetas e fase', onclick: (e) => acoes.abrirCliente?.(e.currentTarget as HTMLElement) },
            icone('etiqueta', 20),
            selo(info.anotacoes),
          )]
        : []),
    );
  }
}
