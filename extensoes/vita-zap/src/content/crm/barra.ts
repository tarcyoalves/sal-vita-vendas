// Barra injetada acima da lista de conversas. No layout antigo (barra superior desligada) traz as abas
// Todas | Não lidas | Precisa de resposta | Aguardando resposta com contadores e o sino de lembretes.
// Com a barra superior ligada (padrão) as abas moram lá (barra-superior.ts) e aqui sobra só a linha de
// chips: "Etiquetas", o filtro "sem resposta há X dias" e os avisos.

import { ABAS, OPCOES_DIAS, type AbaId } from '../../shared/crm-tipos';
import type { Contagens } from '../../shared/crm-regras';
import { criarHost, h, icone, sincronizarTema, type Host } from './ui';

export interface EstadoBarra {
  /** true = a barra superior mostra as abas: aqui só ficam os chips. */
  compacta: boolean;
  aba: string;
  contagens: Contagens;
  dias: number | null;
  /** Quantas etiquetas/fases estão marcadas no filtro. */
  etiquetasMarcadas: number;
  vencidos: number;
  emArquivadas: boolean;
  lendoLista: boolean;
  avisos: string[];
}

export interface AcoesBarra {
  escolherAba: (id: AbaId) => void;
  escolherDias: (dias: number | null) => void;
  abrirEtiquetas: (ancora: HTMLElement) => void;
  abrirLembretes: (ancora: HTMLElement) => void;
  lerLista: () => void;
}

export class Barra {
  readonly h: Host = criarHost('vita-zap-barra');
  private chaveRender = '';

  constructor() {
    Object.assign(this.h.host.style, { display: 'block', flex: '0 0 auto' });
  }

  /** Coloca a barra imediatamente antes da lista de conversas (se ainda não estiver lá). */
  garantirNoLugar(lista: HTMLElement): void {
    const pai = lista.parentElement;
    if (!pai) return;
    if (this.h.host.parentElement === pai && this.h.host.nextElementSibling === lista) return;
    pai.insertBefore(this.h.host, lista);
    this.chaveRender = '';
  }

  remover(): void {
    this.h.host.remove();
    this.chaveRender = '';
  }

  render(e: EstadoBarra, acoes: AcoesBarra): void {
    sincronizarTema(this.h.host);
    const chave = JSON.stringify(e);
    if (chave === this.chaveRender) return;
    this.chaveRender = chave;
    const c = e.contagens;
    const numero = (id: AbaId): number => (id === 'todas' ? c.todas : id === 'naoLidas' ? c.naoLidas : id === 'precisa' ? c.precisa : c.aguardando);

    const abas = e.compacta ? null : h(
      'div',
      { class: 'abas', role: 'tablist' },
      ABAS.map((a) =>
        h(
          'button',
          {
            class: `aba${a.id === e.aba ? ' ativa' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': a.id === e.aba ? 'true' : 'false',
            title: a.id === 'precisa' ? 'O cliente falou por último (sem grupos nem arquivadas)' : a.id === 'aguardando' ? 'Você falou por último' : undefined,
            onclick: () => acoes.escolherAba(a.id),
          },
          a.rotulo,
          h('span', { class: 'n' }, String(numero(a.id))),
        ),
      ),
      h('span', { class: 'esp' }),
      h(
        'button',
        {
          class: 'iconebtn',
          type: 'button',
          title: e.vencidos > 0 ? `Lembretes (${e.vencidos} vencido${e.vencidos > 1 ? 's' : ''})` : 'Lembretes',
          onclick: (ev) => acoes.abrirLembretes(ev.currentTarget as HTMLElement),
        },
        icone('sino'),
        e.vencidos > 0 ? h('span', { class: 'selo' }, e.vencidos > 99 ? '99+' : String(e.vencidos)) : null,
      ),
    );

    const chips = h(
      'div',
      { class: e.compacta ? 'chips compacta' : 'chips' },
      h(
        'button',
        { class: `chip${e.etiquetasMarcadas > 0 ? ' ativo' : ''}`, type: 'button', onclick: (ev) => acoes.abrirEtiquetas(ev.currentTarget as HTMLElement) },
        e.etiquetasMarcadas > 0 ? `Etiquetas (${e.etiquetasMarcadas})` : 'Etiquetas',
        icone('seta', 12),
      ),
      e.aba === 'aguardando'
        ? [
            h('span', { class: 'chip rotulo' }, 'Sem resposta há:'),
            h('button', { class: `chip${e.dias == null ? ' ativo' : ''}`, type: 'button', onclick: () => acoes.escolherDias(null) }, 'qualquer prazo'),
            OPCOES_DIAS.map((d) =>
              h('button', { class: `chip${e.dias === d ? ' ativo' : ''}`, type: 'button', onclick: () => acoes.escolherDias(d) }, `${d} ${d === 1 ? 'dia' : 'dias'}`),
            ),
          ]
        : null,
    );

    const nota = e.emArquivadas
      ? h('div', { class: 'nota' }, 'Conversas arquivadas: o filtro fica desligado aqui e elas não entram nos contadores.')
      : h(
          'div',
          { class: 'nota' },
          `Contadores das ${c.todas} conversas já vistas (a lista do WhatsApp carrega aos poucos). `,
          h('button', { type: 'button', onclick: () => acoes.lerLista() }, e.lendoLista ? 'parar leitura' : 'ler a lista toda'),
        );

    this.h.conteudo.replaceChildren(
      h('div', { class: 'barra' }, abas, chips, ...e.avisos.map((a) => h('div', { class: 'aviso' }, a)), nota),
    );
  }
}
