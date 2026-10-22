// Lembretes dentro do WhatsApp Web: o painel de novo lembrete (botão do cabeçalho da conversa) e a
// central "Vencidos / Hoje / Próximos" (sino da barra de abas).
// O lembrete só avisa. Ao abrir pelo aviso, o rascunho é COLADO na caixa e o usuário aperta Enter.
// Os dados passam sempre pelo repositório (estado.fazer).

import { acharContato, lembretesDoContato } from '../../shared/crm-contatos';
import { agruparLembretes, formatarVencimento, lerDataHoraLocal, paraInputDataHora, prazoRapido, PRAZOS_RAPIDOS, textoAtualizadoHa, type PrazoRapido } from '../../shared/crm-lembretes';
import type { Lembrete, RefContato } from '../../shared/crm-tipos';
import { ehLembreteCrm } from '../../shared/crm-remoto';
import { ehLeadsCRM } from '../../shared/leads';
import type { Estado } from './estado';
import { abrirPopover, fecharPopover, mostrarAviso } from './popover';
import { h } from './ui';

export interface ContextoLembretes {
  estado: Estado;
  agora: () => Date;
  /** `remoto`: lembrete que veio do CRM Lembretes (abre a conversa pelo telefone). */
  abrirConversa: (pedido: { nome: string; telefone?: string; rascunho?: string; remoto?: boolean }) => void;
}

function trecho(t: string, max = 80): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const concluir = (ctx: ContextoLembretes, id: string) => ctx.estado.fazer((r) => r.atualizarLembrete(id, { status: 'concluido' }));
const excluir = (ctx: ContextoLembretes, id: string) => ctx.estado.fazer((r) => r.excluirLembrete(id));
const adiar = (ctx: ContextoLembretes, id: string, ate: number) => ctx.estado.fazer((r) => r.adiarLembrete(id, ate, ctx.agora()));

// ── Novo lembrete para a conversa aberta ─────────────────────────────────────

export function abrirPainelNovoLembrete(ancora: HTMLElement, ctx: ContextoLembretes, ref: RefContato, acima = false): void {
  const pop = abrirPopover({ ancora, titulo: 'Lembrete de follow-up', largura: 350, acima });
  let venceEm: number | null = null;
  let escolhido: PrazoRapido | 'custom' | null = null;

  const resumo = h('div', { class: 'dica' });
  const msg = h('div', { class: 'msg' });
  const custom = h('input', { class: 'campo', type: 'datetime-local', 'aria-label': 'Data e hora personalizadas' });
  const rascunho = h('textarea', {
    class: 'campo',
    rows: 3,
    placeholder: 'Rascunho opcional. Aceita {primeiro_nome} e {nome}.',
    'aria-label': 'Rascunho opcional',
  });
  const lista = h('div', {});
  const botoesPrazo = new Map<string, HTMLButtonElement>();

  const atualizarResumo = (): void => {
    for (const [id, b] of botoesPrazo) b.classList.toggle('sel', id === escolhido);
    resumo.textContent = venceEm ? `Avisar em: ${formatarVencimento(venceEm, ctx.agora())}` : 'Escolha quando avisar.';
  };

  for (const p of PRAZOS_RAPIDOS) {
    const b = h('button', {
      class: 'btn',
      type: 'button',
      onclick: () => {
        escolhido = p.id;
        venceEm = prazoRapido(p.id, ctx.agora());
        custom.value = paraInputDataHora(venceEm);
        msg.textContent = '';
        atualizarResumo();
      },
    }, p.rotulo);
    botoesPrazo.set(p.id, b);
  }
  custom.addEventListener('input', () => {
    escolhido = 'custom';
    venceEm = lerDataHoraLocal(custom.value);
    msg.textContent = '';
    atualizarResumo();
  });

  const depois = (): void => {
    renderLista();
    pop.reposicionar();
  };

  const renderLista = (): void => {
    const contato = acharContato(ctx.estado.dados, ref);
    const doContato = (contato ? lembretesDoContato(ctx.estado.dados, contato.id) : []).sort((a, b) => a.venceEm - b.venceEm);
    lista.replaceChildren(
      ...(doContato.length === 0
        ? []
        : [
            h('h5', {}, 'Lembretes deste contato'),
            ...doContato.map((l) =>
              h(
                'div',
                { class: 'item' },
                h('div', { class: 'txt' }, h('span', { class: l.venceEm <= ctx.agora().getTime() ? 'vencido' : '' }, formatarVencimento(l.venceEm, ctx.agora())), l.rascunho ? h('div', { class: 'dica' }, trecho(l.rascunho)) : null),
                h('button', { class: 'btn', type: 'button', onclick: () => void concluir(ctx, l.id).then(depois) }, 'Concluir'),
                h('button', { class: 'btn perigo', type: 'button', title: 'Excluir', onclick: () => void excluir(ctx, l.id).then(depois) }, 'Excluir'),
              ),
            ),
          ]),
    );
  };

  const salvar = async (): Promise<void> => {
    const r = await ctx.estado.fazer((repo) => repo.criarLembrete({ ref, venceEm, rascunho: rascunho.value }, ctx.agora()));
    if (!r.ok) {
      msg.textContent = r.erro;
      return;
    }
    fecharPopover();
    mostrarAviso(`Você será avisado sobre ${ref.nome} em ${formatarVencimento(r.lembrete.venceEm, ctx.agora())}.`);
  };

  pop.corpo.append(
    h('div', { class: 'dica' }, ref.nome),
    h('div', { class: 'linha2' }, [...botoesPrazo.values()]),
    h('div', { class: 'linha2' }, h('span', { class: 'dica' }, 'Personalizada:'), custom),
    resumo,
    h('h5', {}, 'Rascunho (opcional)'),
    rascunho,
    h('div', { class: 'dica' }, 'No aviso, a conversa abre e o texto é colado na caixa. Você confere e aperta Enter: a extensão nunca manda sozinha.'),
    msg,
    h('div', { class: 'linha2' }, h('button', { class: 'btn pri', type: 'button', onclick: () => void salvar() }, 'Salvar lembrete')),
    lista,
  );
  atualizarResumo();
  renderLista();
  pop.reposicionar();
}

// ── Central de lembretes (sino da barra) ─────────────────────────────────────

export function abrirCentral(ancora: HTMLElement, ctx: ContextoLembretes): void {
  const pop = abrirPopover({ ancora, titulo: 'Lembretes', largura: 360 });
  const depois = (): void => {
    render();
    pop.reposicionar();
  };

  /** "Atualizar do CRM" (ignora o mínimo de 60 min) + "atualizado há X min"; só com login no CRM. */
  const rodape = (): HTMLElement | null => {
    const leads = ehLeadsCRM(ctx.estado.repo) ? ctx.estado.repo : null;
    if (!leads) return null;
    const texto = h('span', { class: 'dica' }, '');
    const botao = h('button', { class: 'btn', type: 'button' }, 'Atualizar do CRM');
    const caixa = h('div', { class: 'linha2' }, botao, texto);
    caixa.hidden = true;
    const mostrarIdade = (): void =>
      void leads.conta().then(
        (c) => {
          caixa.hidden = !c.usuario;
          texto.textContent = textoAtualizadoHa(c.sincronizadoEm, ctx.agora().getTime());
        },
        () => undefined,
      );
    botao.addEventListener('click', () => {
      botao.disabled = true;
      texto.textContent = 'Atualizando…';
      void leads
        .sincronizarLembretes('botao')
        .then(
          (r) => (r.ok ? undefined : void (texto.textContent = r.erro.mensagem)),
          () => void (texto.textContent = 'Não consegui falar com a extensão.'),
        )
        .then(() => ctx.estado.recarregar())
        .then(() => depois());
    });
    mostrarIdade();
    return caixa;
  };

  const render = (): void => {
    const agora = ctx.agora();
    const g = agruparLembretes(ctx.estado.dados.lembretes, agora);
    const secao = (titulo: string, itens: Lembrete[], vencidos = false): HTMLElement[] => [
      h('h5', {}, `${titulo} (${itens.length})`),
      ...(itens.length === 0 ? [h('div', { class: 'dica' }, 'Nada aqui.')] : []),
      ...itens.map((l) =>
        h(
          'div',
          { class: 'item' },
          h(
            'div',
            { class: 'txt' },
            h('strong', {}, l.nome),
            h('div', { class: vencidos ? 'vencido' : 'dica' }, formatarVencimento(l.venceEm, agora)),
            l.rascunho ? h('div', { class: 'dica' }, trecho(l.rascunho)) : null,
          ),
          h('div', { class: 'linha2' },
            h('button', { class: 'btn pri', type: 'button', onclick: () => { fecharPopover(); ctx.abrirConversa({ nome: l.nome, telefone: l.telefone, rascunho: l.rascunho, remoto: ehLembreteCrm(l.id) }); } }, 'Abrir'),
            h('button', { class: 'btn', type: 'button', onclick: () => void concluir(ctx, l.id).then(depois) }, 'Concluir'),
            h('button', { class: 'btn', type: 'button', title: 'Adiar para amanhã às 9h', onclick: () => void adiar(ctx, l.id, prazoRapido('amanha9h', ctx.agora())).then(depois) }, 'Adiar'),
          ),
        ),
      ),
    ];
    const total = g.vencidos.length + g.hoje.length + g.proximos.length;
    pop.corpo.replaceChildren(
      ...(total === 0
        ? [h('div', { class: 'vazio' }, 'Nenhum lembrete. Use o botão do relógio no cabeçalho de uma conversa.')]
        : [...secao('Vencidos', g.vencidos, true), ...secao('Hoje', g.hoje), ...secao('Próximos', g.proximos)]),
      ...[rodape()].filter((x): x is HTMLElement => x !== null),
    );
  };
  render();
  pop.reposicionar();
}
