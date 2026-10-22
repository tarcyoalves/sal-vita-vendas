// Painéis da barra superior: "+" (nova aba por etiqueta ou fase), ajustes de filtro (dias sem resposta, ocultar
// grupos, abas visíveis), guia curto de ajuda e menu da conta. Só mexem na configuração e filtram a lista:
// nenhum deles envia mensagem.

import { todasAsAbas } from '../../shared/crm-abas';
import { FASES, OPCOES_DIAS, type AbaPersonalizada, type ConfigCrm, type Etiqueta, type Fase } from '../../shared/crm-tipos';
import { abrirPopover } from './popover';
import { h } from './ui';

export interface ContextoAbas {
  config: () => ConfigCrm;
  etiquetas: () => Etiqueta[];
  criarAba: (aba: Omit<AbaPersonalizada, 'id'>) => string | null;
  excluirAba: (id: string) => void;
  escolherDias: (dias: number | null) => void;
  alternarGrupos: () => void;
  alternarAbaVisivel: (id: string) => void;
}

/** "+": cria uma aba que filtra por etiqueta e/ou fase. */
export function abrirNovaAba(ancora: HTMLElement, ctx: ContextoAbas): void {
  const pop = abrirPopover({ ancora, titulo: 'Nova aba', largura: 340 });
  const marcadasEtiquetas = new Set<string>();
  const marcadasFases = new Set<Fase>();
  const nome = h('input', { class: 'campo', placeholder: 'Nome da aba (ex.: Padarias)', maxlength: 40, 'aria-label': 'Nome da aba' });
  const msg = h('div', { class: 'msg' });

  const render = (): void => {
    const etiquetas = ctx.etiquetas();
    const proprias = ctx.config().abasPersonalizadas ?? [];
    pop.corpo.replaceChildren(
      h('div', { class: 'dica' }, 'A aba mostra as conversas dos contatos que têm alguma das etiquetas ou fases marcadas.'),
      h('div', { style: 'height:6px' }),
      nome,
      h('h5', {}, 'Etiquetas'),
      etiquetas.length === 0
        ? h('div', { class: 'dica' }, 'Nenhuma etiqueta ainda. Crie no botão Cliente do cabeçalho de uma conversa.')
        : h(
            'div',
            { class: 'grade' },
            etiquetas.map((e) =>
              h('button', { class: `chip${marcadasEtiquetas.has(e.id) ? ' ativo' : ''}`, type: 'button', onclick: () => { alternar(marcadasEtiquetas, e.id); render(); } }, e.nome),
            ),
          ),
      h('h5', {}, 'Fases do funil'),
      h(
        'div',
        { class: 'grade' },
        FASES.map((f) => h('button', { class: `chip${marcadasFases.has(f.id) ? ' ativo' : ''}`, type: 'button', onclick: () => { alternar(marcadasFases, f.id); render(); } }, f.rotulo)),
      ),
      msg,
      h(
        'div',
        { class: 'linha2' },
        h('button', {
          class: 'btn pri',
          type: 'button',
          onclick: () => {
            const erro = ctx.criarAba({ nome: nome.value.trim(), etiquetas: [...marcadasEtiquetas], fases: [...marcadasFases] });
            if (erro) msg.textContent = erro;
            else pop.fechar();
          },
        }, 'Criar aba'),
      ),
      ...(proprias.length > 0 ? [h('h5', {}, 'Suas abas')] : []),
      ...proprias.map((a) =>
        h('div', { class: 'item' }, h('div', { class: 'txt' }, h('strong', {}, a.nome)), h('button', { class: 'btn perigo', type: 'button', onclick: () => { ctx.excluirAba(a.id); render(); } }, 'Excluir')),
      ),
    );
    pop.reposicionar();
  };
  const alternar = <T>(conj: Set<T>, v: T): void => void (conj.has(v) ? conj.delete(v) : conj.add(v));
  render();
}

/** Ícone de ajustes: sem resposta há X dias, ocultar grupos e quais abas aparecem. */
export function abrirAjustesFiltro(ancora: HTMLElement, ctx: ContextoAbas): void {
  const pop = abrirPopover({ ancora, titulo: 'Ajustes de filtro', largura: 330 });
  const render = (): void => {
    const c = ctx.config();
    const ocultas = new Set(c.abasOcultas ?? []);
    pop.corpo.replaceChildren(
      h('h5', {}, 'Dias sem resposta (aba Aguardando resposta)'),
      h(
        'div',
        { class: 'grade' },
        h('button', { class: `chip${c.diasSemResposta == null ? ' ativo' : ''}`, type: 'button', onclick: () => { ctx.escolherDias(null); render(); } }, 'Qualquer prazo'),
        OPCOES_DIAS.map((d) => h('button', { class: `chip${c.diasSemResposta === d ? ' ativo' : ''}`, type: 'button', onclick: () => { ctx.escolherDias(d); render(); } }, `${d} ${d === 1 ? 'dia' : 'dias'}`)),
      ),
      h('h5', {}, 'Conversas'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: c.ocultarGrupos === true, onchange: () => { ctx.alternarGrupos(); render(); } }), 'Ocultar grupos da lista e dos contadores'),
      h('h5', {}, 'Abas visíveis'),
      ...todasAsAbas(c).map((a) =>
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', checked: a.id === 'todas' || !ocultas.has(a.id), disabled: a.id === 'todas', onchange: () => { ctx.alternarAbaVisivel(a.id); render(); } }),
          a.rotulo,
        ),
      ),
    );
    pop.reposicionar();
  };
  render();
}

/** "?": guia curto (o README completo está na pasta da extensão). */
export function abrirAjuda(ancora: HTMLElement): void {
  const pop = abrirPopover({ ancora, titulo: 'Como usar o Vita Zap', largura: 340 });
  pop.corpo.append(
    h(
      'ul',
      { class: 'guia' },
      h('li', {}, h('strong', {}, 'Abas'), ': filtram a lista de conversas. "Precisa de resposta" = o cliente falou por último; "Aguardando" = você falou por último.'),
      h('li', {}, h('strong', {}, 'Ponto verde'), ': a aba tem conversas novas desde a última vez que você clicou nela.'),
      h('li', {}, h('strong', {}, '+'), ': cria uma aba por etiqueta ou fase. O ícone de ajustes escolhe as abas visíveis, os dias sem resposta e oculta grupos.'),
      h('li', {}, h('strong', {}, 'Respostas rápidas'), ' (raio) e ', h('strong', {}, 'Lembrete'), ' (relógio) também estão na caixa de digitação. Só colam texto ou agendam: quem manda é você, com Enter.'),
      h('li', {}, h('strong', {}, 'Clientes'), ': abre o painel lateral com notas, etiquetas e fases.'),
      h('li', {}, h('strong', {}, 'Entrar no CRM'), ': liga o CRM Lembretes (login na aba Dados do painel). Sem login tudo funciona só neste computador.'),
    ),
    h('div', { class: 'dica', style: 'margin-top:8px' }, 'Detalhes completos: README.md na pasta da extensão. Dá para desligar esta barra em Dados, "Mostrar barra superior".'),
  );
  pop.reposicionar();
}

export interface ContextoConta {
  nome: string;
  email: string;
  abrirPainel: () => void;
  sair: () => void;
}

/** Menu da conta quando há login: quem está logado, abrir o painel e Sair. */
export function abrirMenuConta(ancora: HTMLElement, ctx: ContextoConta): void {
  const pop = abrirPopover({ ancora, titulo: 'CRM Lembretes', largura: 290 });
  pop.corpo.append(
    h('div', {}, h('strong', {}, ctx.nome), h('div', { class: 'dica' }, ctx.email)),
    h(
      'div',
      { class: 'linha2' },
      h('button', { class: 'btn', type: 'button', onclick: () => { pop.fechar(); ctx.abrirPainel(); } }, 'Abrir conta no painel'),
      h('button', { class: 'btn perigo', type: 'button', onclick: () => { pop.fechar(); ctx.sair(); } }, 'Sair'),
    ),
  );
  pop.reposicionar();
}
