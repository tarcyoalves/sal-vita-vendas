// Respostas rápidas: botão junto à caixa de digitação e menu de modelos (busca, atalho, criar,
// editar, excluir). Escolher um modelo só COLA o texto na caixa, com {nome} e {primeiro_nome}
// resolvidos. Quem manda é você, apertando Enter. Digitar /atalho na caixa também abre o menu.

import { renderizarModelo, buscarRespostas, variaveisDesconhecidas, VARIAVEIS } from '../../shared/crm-modelos';
import type { RespostaRapida } from '../../shared/crm-tipos';
import { acrescentarNoCampo, escreverNoCampo, textoDoCampo } from '../dom';
import type { Estado } from './estado';
import { abrirPopover, fecharPopover, mostrarAviso, popoverAbertoEm } from './popover';
import { criarHost, h, icone, isolarCliques, sincronizarTema, type Host } from './ui';

export interface ContextoRespostas {
  estado: Estado;
  nomeDaConversa: () => string | null;
  caixa: () => HTMLElement | null;
}

export interface MenuRespostas {
  /** Atualiza o filtro quando o texto "/atalho" da caixa muda. */
  atualizarConsulta: (q: string) => void;
}

function trecho(t: string, max = 110): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

type Tela = { tipo: 'lista' } | { tipo: 'form'; id: string | null } | { tipo: 'confirmar'; resposta: RespostaRapida };

export function abrirMenuRespostas(ancora: HTMLElement, ctx: ContextoRespostas, op: { consulta?: string; porAtalho?: boolean; aoFechar?: () => void } = {}): MenuRespostas {
  const pop = abrirPopover({ ancora, titulo: 'Respostas rápidas', largura: 360, acima: true, aoFechar: op.aoFechar });
  let tela: Tela = { tipo: 'lista' };
  let consulta = op.consulta ?? '';
  const busca = h('input', { class: 'campo', placeholder: 'Buscar resposta rápida', 'aria-label': 'Buscar resposta rápida', value: consulta });
  busca.addEventListener('input', () => {
    consulta = busca.value;
    render();
  });

  function inserir(r: RespostaRapida, modo: 'substituir' | 'acrescentar'): void {
    const caixa = ctx.caixa();
    if (!caixa) {
      mostrarAviso('Abra uma conversa para usar uma resposta rápida.', 'erro');
      return;
    }
    const texto = renderizarModelo(r.texto, ctx.nomeDaConversa() ?? '');
    if (modo === 'substituir') escreverNoCampo(caixa, texto);
    else acrescentarNoCampo(caixa, texto);
    fecharPopover();
    caixa.focus();
  }

  function aoEscolher(r: RespostaRapida): void {
    const caixa = ctx.caixa();
    const temTexto = caixa != null && textoDoCampo(caixa).trim() !== '';
    // Pelo atalho "/xx" a caixa só tem o próprio atalho: é para substituir, sem perguntar.
    if (!temTexto || op.porAtalho) inserir(r, 'substituir');
    else {
      tela = { tipo: 'confirmar', resposta: r };
      render();
    }
  }

  function telaLista(): Array<HTMLElement | null> {
    const lista = buscarRespostas(ctx.estado.dados.respostas, consulta);
    return [
      ...(op.porAtalho ? [h('div', { class: 'dica' }, `Atalho digitado: /${consulta}`)] : [busca]),
      h(
        'div',
        {},
        ...(lista.length === 0 ? [h('div', { class: 'vazio' }, ctx.estado.dados.respostas.length === 0 ? 'Nenhum modelo ainda.' : 'Sem resultados')] : []),
        ...lista.map((r) =>
          h(
            'div',
            { class: 'item' },
            h('div', { class: 'txt' }, h('strong', {}, r.titulo), r.atalho ? h('span', { class: 'dica' }, `  /${r.atalho}`) : null, h('div', { class: 'dica' }, trecho(r.texto))),
            h(
              'div',
              { class: 'linha2' },
              h('button', { class: 'btn pri', type: 'button', title: 'Coloca o texto na caixa. Você confere e aperta Enter.', onclick: () => aoEscolher(r) }, 'Inserir'),
              op.porAtalho ? null : h('button', { class: 'btn', type: 'button', onclick: () => { tela = { tipo: 'form', id: r.id }; render(); } }, 'Editar'),
            ),
          ),
        ),
      ),
      op.porAtalho ? null : h('div', { class: 'linha2' }, h('button', { class: 'btn', type: 'button', onclick: () => { tela = { tipo: 'form', id: null }; render(); } }, icone('mais', 12), ' Novo modelo')),
      h('div', { class: 'dica' }, 'Inserir só coloca o texto na caixa. Quem manda é você, com Enter.'),
    ];
  }

  function telaConfirmar(r: RespostaRapida): Array<HTMLElement | null> {
    return [
      h('div', {}, 'A caixa já tem texto. O que fazer com o modelo "', h('strong', {}, r.titulo), '"?'),
      h(
        'div',
        { class: 'linha2' },
        h('button', { class: 'btn pri', type: 'button', onclick: () => inserir(r, 'substituir') }, 'Substituir'),
        h('button', { class: 'btn', type: 'button', onclick: () => inserir(r, 'acrescentar') }, 'Adicionar'),
        h('button', { class: 'btn', type: 'button', onclick: () => { tela = { tipo: 'lista' }; render(); } }, 'Cancelar'),
      ),
    ];
  }

  function telaForm(id: string | null): Array<HTMLElement | null> {
    const atual = id ? ctx.estado.dados.respostas.find((r) => r.id === id) : undefined;
    const titulo = h('input', { class: 'campo', placeholder: 'Título (ex.: Orçamento)', maxlength: 120, value: atual?.titulo ?? '', 'aria-label': 'Título do modelo' });
    const atalho = h('input', { class: 'campo', placeholder: 'Atalho (ex.: orc) — digite /orc na caixa', maxlength: 25, value: atual?.atalho ?? '', 'aria-label': 'Atalho do modelo' });
    const texto = h('textarea', { class: 'campo', rows: 5, placeholder: 'Texto da mensagem', 'aria-label': 'Texto do modelo', value: atual?.texto ?? '' });
    const msg = h('div', { class: 'msg' });
    const aviso = h('div', { class: 'dica' });
    const conferirVariaveis = (): void => {
      const desconhecidas = variaveisDesconhecidas(texto.value);
      aviso.textContent = desconhecidas.length > 0 ? `Variável desconhecida: ${desconhecidas.join(', ')}. Use ${VARIAVEIS.join(' ou ')}.` : '';
    };
    texto.addEventListener('input', conferirVariaveis);
    conferirVariaveis();
    const inserirVariavel = (v: string): void => {
      texto.value = `${texto.value}${v}`;
      conferirVariaveis();
    };
    return [
      titulo,
      h('div', { style: 'height:6px' }),
      atalho,
      h('div', { style: 'height:6px' }),
      texto,
      h('div', { class: 'linha2' }, h('span', { class: 'dica' }, 'Variáveis:'), ...VARIAVEIS.map((v) => h('button', { class: 'chip', type: 'button', onclick: () => inserirVariavel(v) }, v))),
      aviso,
      msg,
      h(
        'div',
        { class: 'linha2' },
        h('button', { class: 'btn pri', type: 'button', onclick: () => void (async () => {
          const erro = await ctx.estado.fazer((r) => r.salvarResposta({ id: atual?.id, titulo: titulo.value, atalho: atalho.value, texto: texto.value }));
          if (erro) { msg.textContent = erro; return; }
          tela = { tipo: 'lista' };
          render();
        })() }, 'Salvar'),
        h('button', { class: 'btn', type: 'button', onclick: () => { tela = { tipo: 'lista' }; render(); } }, 'Cancelar'),
        atual
          ? h('button', { class: 'btn perigo', type: 'button', onclick: () => void ctx.estado.fazer((r) => r.excluirResposta(atual.id)).then(() => { tela = { tipo: 'lista' }; render(); }) }, 'Excluir')
          : null,
      ),
    ];
  }

  function render(): void {
    const conteudo = tela.tipo === 'lista' ? telaLista() : tela.tipo === 'confirmar' ? telaConfirmar(tela.resposta) : telaForm(tela.id);
    pop.corpo.replaceChildren(...conteudo.filter((x): x is HTMLElement => x != null));
    pop.reposicionar();
  }

  render();
  return {
    atualizarConsulta: (q) => {
      consulta = q;
      if (tela.tipo === 'lista') render();
    },
  };
}

/** Botão flutuante colado no canto superior direito da caixa de digitação. */
export class BotaoRespostas {
  readonly h: Host = criarHost('vita-zap-respostas');
  private menuPorAtalho: MenuRespostas | null = null;

  constructor(private readonly ctx: ContextoRespostas) {
    Object.assign(this.h.host.style, { position: 'fixed', zIndex: '2147482000', display: 'none' });
    isolarCliques(this.h.host);
    this.h.conteudo.append(
      h(
        'button',
        { class: 'flutuante', type: 'button', title: 'Respostas rápidas (ou digite / na caixa)', onclick: (e) => this.alternar(e.currentTarget as HTMLElement) },
        icone('balao', 15),
        'Respostas',
      ),
    );
  }

  private alternar(ancora: HTMLElement): void {
    if (popoverAbertoEm(ancora)) fecharPopover();
    else abrirMenuRespostas(ancora, this.ctx);
  }

  /** Posiciona o botão sobre a caixa; sem caixa (nenhuma conversa aberta, seletor quebrado) some. */
  posicionar(caixa: HTMLElement | null): void {
    if (!caixa) {
      this.remover();
      return;
    }
    if (!this.h.host.isConnected) document.body.append(this.h.host);
    sincronizarTema(this.h.host);
    const r = caixa.getBoundingClientRect();
    Object.assign(this.h.host.style, {
      display: 'block',
      left: `${Math.max(8, Math.round(r.right - 116))}px`,
      top: `${Math.max(8, Math.round(r.top - 36))}px`,
    });
  }

  remover(): void {
    this.h.host.remove();
  }

  /** Chamado a cada "input" na caixa: "/" + atalho abre o menu filtrado; outro texto fecha. */
  aoDigitar(consulta: string | null): void {
    const ancora = this.h.conteudo.querySelector<HTMLElement>('button');
    if (consulta === null) {
      if (this.menuPorAtalho) {
        this.menuPorAtalho = null;
        fecharPopover();
      }
      return;
    }
    if (!ancora) return;
    if (this.menuPorAtalho) this.menuPorAtalho.atualizarConsulta(consulta);
    else this.menuPorAtalho = abrirMenuRespostas(ancora, this.ctx, { consulta, porAtalho: true, aoFechar: () => (this.menuPorAtalho = null) });
  }
}
