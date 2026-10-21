// Lembretes dentro do WhatsApp Web: o painel de novo lembrete (botão do cabeçalho da conversa) e a
// central "Vencidos / Hoje / Próximos" (sino da barra de abas).
// O lembrete só avisa. Ao abrir pelo aviso, o rascunho é COLADO na caixa e o usuário aperta Enter.

import { adiarLembrete, agruparLembretes, criarLembrete, formatarVencimento, lerDataHoraLocal, paraInputDataHora, prazoRapido, PRAZOS_RAPIDOS, type PrazoRapido } from '../../shared/crm-lembretes';
import { novoId } from '../../shared/crm-store';
import type { Lembrete } from '../../shared/crm-tipos';
import type { Estado } from './estado';
import { abrirPopover, fecharPopover, mostrarAviso } from './popover';
import { h } from './ui';

export interface ContextoLembretes {
  estado: Estado;
  agora: () => Date;
  abrirConversa: (nome: string, rascunho?: string) => void;
}

function trecho(t: string, max = 80): string {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function concluir(ctx: ContextoLembretes, id: string): void {
  const l = ctx.estado.dados.lembretes.find((x) => x.id === id);
  if (!l) return;
  l.status = 'concluido';
  ctx.estado.mudou('lembretes');
  void ctx.estado.salvarAgora();
}

function excluir(ctx: ContextoLembretes, id: string): void {
  ctx.estado.dados.lembretes = ctx.estado.dados.lembretes.filter((x) => x.id !== id);
  ctx.estado.mudou('lembretes');
  void ctx.estado.salvarAgora();
}

function adiar(ctx: ContextoLembretes, id: string, ate: number): void {
  const i = ctx.estado.dados.lembretes.findIndex((x) => x.id === id);
  if (i < 0) return;
  ctx.estado.dados.lembretes[i] = adiarLembrete(ctx.estado.dados.lembretes[i], ate, ctx.agora());
  ctx.estado.mudou('lembretes');
  void ctx.estado.salvarAgora();
}

// ── Novo lembrete para a conversa aberta ─────────────────────────────────────

export function abrirPainelNovoLembrete(ancora: HTMLElement, ctx: ContextoLembretes, nome: string, chave: string): void {
  const pop = abrirPopover({ ancora, titulo: 'Lembrete de follow-up', largura: 350 });
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

  const renderLista = (): void => {
    const doContato = ctx.estado.dados.lembretes.filter((l) => l.chave === chave && l.status !== 'concluido').sort((a, b) => a.venceEm - b.venceEm);
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
                h('button', { class: 'btn', type: 'button', onclick: () => { concluir(ctx, l.id); renderLista(); pop.reposicionar(); } }, 'Concluir'),
                h('button', { class: 'btn perigo', type: 'button', title: 'Excluir', onclick: () => { excluir(ctx, l.id); renderLista(); pop.reposicionar(); } }, 'Excluir'),
              ),
            ),
          ]),
    );
  };

  const salvar = (): void => {
    const r = criarLembrete({ chave, nome, venceEm, rascunho: rascunho.value }, ctx.agora(), novoId());
    if (!r.ok) {
      msg.textContent = r.erro;
      return;
    }
    ctx.estado.dados.lembretes.push(r.lembrete);
    ctx.estado.mudou('lembretes');
    void ctx.estado.salvarAgora();
    fecharPopover();
    mostrarAviso(`Você será avisado sobre ${nome} em ${formatarVencimento(r.lembrete.venceEm, ctx.agora())}.`);
  };

  pop.corpo.append(
    h('div', { class: 'dica' }, nome),
    h('div', { class: 'linha2' }, [...botoesPrazo.values()]),
    h('div', { class: 'linha2' }, h('span', { class: 'dica' }, 'Personalizada:'), custom),
    resumo,
    h('h5', {}, 'Rascunho (opcional)'),
    rascunho,
    h('div', { class: 'dica' }, 'No aviso, a conversa abre e o texto é colado na caixa. Você confere e aperta Enter: a extensão nunca manda sozinha.'),
    msg,
    h('div', { class: 'linha2' }, h('button', { class: 'btn pri', type: 'button', onclick: salvar }, 'Salvar lembrete')),
    lista,
  );
  atualizarResumo();
  renderLista();
  pop.reposicionar();
}

// ── Central de lembretes (sino da barra) ─────────────────────────────────────

export function abrirCentral(ancora: HTMLElement, ctx: ContextoLembretes): void {
  const pop = abrirPopover({ ancora, titulo: 'Lembretes', largura: 360 });

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
            h('button', { class: 'btn pri', type: 'button', onclick: () => { fecharPopover(); ctx.abrirConversa(l.nome, l.rascunho); } }, 'Abrir'),
            h('button', { class: 'btn', type: 'button', onclick: () => { concluir(ctx, l.id); render(); pop.reposicionar(); } }, 'Concluir'),
            h('button', { class: 'btn', type: 'button', title: 'Adiar para amanhã às 9h', onclick: () => { adiar(ctx, l.id, prazoRapido('amanha9h', ctx.agora())); render(); pop.reposicionar(); } }, 'Adiar'),
          ),
        ),
      ),
    ];
    const total = g.vencidos.length + g.hoje.length + g.proximos.length;
    pop.corpo.replaceChildren(
      ...(total === 0
        ? [h('div', { class: 'vazio' }, 'Nenhum lembrete. Use o botão do relógio no cabeçalho de uma conversa.')]
        : [...secao('Vencidos', g.vencidos, true), ...secao('Hoje', g.hoje), ...secao('Próximos', g.proximos)]),
    );
  };
  render();
  pop.reposicionar();
}
