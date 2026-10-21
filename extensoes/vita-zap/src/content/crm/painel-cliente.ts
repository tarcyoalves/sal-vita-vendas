// Painel do cliente (botão de etiqueta no cabeçalho da conversa): fase do funil, etiquetas com
// cor, notas, telefone/vínculo. Também o chip "Etiquetas" da barra: filtro da lista.
// Os dados passam sempre pelo repositório (estado.fazer); aqui não há acesso direto ao storage.

import { acharContato, opcoesDeFiltro } from '../../shared/crm-contatos';
import { chaveDaConversa, classificar, estaDispensada } from '../../shared/crm-regras';
import { CORES_ETIQUETA, FASES, type Contato, type RefContato } from '../../shared/crm-tipos';
import type { Estado } from './estado';
import { abrirPopover } from './popover';
import { h, icone } from './ui';

export interface ContextoCliente {
  estado: Estado;
  agora: () => Date;
}

function dataCurta(ms: number): string {
  return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza' });
}

export function abrirPainelCliente(ancora: HTMLElement, ctx: ContextoCliente, ref: RefContato): void {
  const pop = abrirPopover({ ancora, titulo: ref.nome, largura: 360 });
  const dados = () => ctx.estado.dados;
  const contato = (): Contato | undefined => acharContato(dados(), ref);
  /** Referência com o id interno, assim que o contato existe (o nome pode mudar; o id não). */
  const refAtual = (): RefContato => ({ ...ref, contatoId: contato()?.id });

  const secDispensa = h('div', {});
  const secFase = h('div', { class: 'linha2' });
  const secEtiquetas = h('div', {});
  const secNotas = h('div', {});
  const secTelefone = h('div', {});
  const msgNota = h('div', { class: 'msg' });
  const campoNota = h('textarea', { class: 'campo', rows: 3, placeholder: 'Preço combinado, prazo, objeção, o que o cliente pediu...', 'aria-label': 'Nova nota' });
  let editando: string | null = null;
  let confirmandoExclusao: string | null = null;
  let criandoEtiqueta = false;

  // Depois de cada gravação o estado local já foi atualizado (estado.fazer): só redesenhar.
  const redesenhar = (...partes: Array<() => void>): void => {
    for (const p of partes) p();
    renderBadge();
    pop.reposicionar();
  };

  // ── Dispensar de "Precisa de resposta" ──
  const renderDispensa = (): void => {
    const conversa = dados().conversas[chaveDaConversa(ref.nome)];
    if (!conversa || conversa.grupo || conversa.arquivada) {
      secDispensa.replaceChildren();
      return;
    }
    const c = contato();
    if (c && estaDispensada(conversa, c)) {
      secDispensa.replaceChildren(
        h('div', { class: 'linha2' }, h('span', { class: 'dica' }, 'Dispensada de "Precisa de resposta" até chegar mensagem nova.'), h('button', { class: 'btn', type: 'button', onclick: () => void ctx.estado.fazer((r) => r.reativar(refAtual())).then(() => redesenhar(renderDispensa)) }, 'Voltar para a lista')),
      );
    } else if (classificar(conversa, c).precisa) {
      secDispensa.replaceChildren(
        h('div', { class: 'linha2' }, h('button', { class: 'btn', type: 'button', title: 'Some de "Precisa de resposta" até chegar mensagem nova', onclick: () => void ctx.estado.fazer((r) => r.dispensar(refAtual(), conversa.ass)).then(() => redesenhar(renderDispensa)) }, 'Dispensar: não preciso responder')),
      );
    } else secDispensa.replaceChildren();
  };

  // ── Fase do funil (etiqueta especial) ──
  const renderFase = (): void => {
    const atual = contato()?.fase;
    secFase.replaceChildren(
      ...FASES.map((f) =>
        h(
          'button',
          {
            class: 'tag',
            type: 'button',
            style: atual === f.id ? `background:${f.cor}` : `background:var(--fundo2);color:var(--texto);border:1px solid ${f.cor}`,
            'aria-pressed': atual === f.id ? 'true' : 'false',
            onclick: () => void ctx.estado.fazer((r) => r.definirFase(refAtual(), atual === f.id ? null : f.id)).then(() => redesenhar(renderFase)),
          },
          f.rotulo,
        ),
      ),
    );
  };

  // ── Etiquetas ──
  const renderEtiquetas = (): void => {
    const marcadas = new Set(contato()?.etiquetas ?? []);
    const nomeNova = h('input', { class: 'campo', placeholder: 'Nome da etiqueta', maxlength: 30, 'aria-label': 'Nome da nova etiqueta' });
    let corNova: string = CORES_ETIQUETA[0];
    const msg = h('div', { class: 'msg' });
    const paleta = h('div', { class: 'cores' });
    const pintar = (): void => {
      paleta.replaceChildren(
        ...CORES_ETIQUETA.map((c) =>
          h('button', { class: `cor${c === corNova ? ' sel' : ''}`, type: 'button', style: `background:${c}`, title: c, onclick: () => { corNova = c; pintar(); } }),
        ),
      );
    };
    pintar();
    const lista = dados().etiquetas;
    secEtiquetas.replaceChildren(
      h(
        'div',
        { class: 'linha2' },
        ...(lista.length === 0 ? [h('span', { class: 'dica' }, 'Nenhuma etiqueta criada ainda.')] : []),
        ...lista.map((e) =>
          h(
            'button',
            {
              class: marcadas.has(e.id) ? 'tag' : 'tag fora',
              type: 'button',
              style: marcadas.has(e.id) ? `background:${e.cor}` : `border-color:${e.cor}`,
              'aria-pressed': marcadas.has(e.id) ? 'true' : 'false',
              onclick: () => void ctx.estado.fazer((r) => r.alternarEtiqueta(refAtual(), e.id)).then(() => redesenhar(renderEtiquetas)),
            },
            e.nome,
          ),
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => { criandoEtiqueta = !criandoEtiqueta; redesenhar(renderEtiquetas); } }, icone('mais', 12), ' Nova'),
      ),
      ...(criandoEtiqueta
        ? [
            h(
              'div',
              {},
              nomeNova,
              paleta,
              h(
                'div',
                { class: 'linha2' },
                h(
                  'button',
                  {
                    class: 'btn pri',
                    type: 'button',
                    onclick: () =>
                      void (async () => {
                        const r = await ctx.estado.fazer((repo) => repo.criarEtiqueta(nomeNova.value, corNova));
                        if ('erro' in r) {
                          msg.textContent = r.erro;
                          return;
                        }
                        await ctx.estado.fazer((repo) => repo.alternarEtiqueta(refAtual(), r.etiqueta.id));
                        criandoEtiqueta = false;
                        redesenhar(renderEtiquetas);
                      })(),
                  },
                  'Criar e aplicar',
                ),
              ),
              msg,
            ),
          ]
        : []),
    );
  };

  // ── Notas ──
  const renderNotas = (): void => {
    const notas = contato()?.notas ?? [];
    secNotas.replaceChildren(
      ...(notas.length === 0 ? [h('div', { class: 'dica' }, 'Nenhuma nota ainda.')] : []),
      ...notas.map((n) => {
        if (editando === n.id) {
          const campo = h('textarea', { class: 'campo', rows: 3, value: n.texto, 'aria-label': 'Editar nota' });
          const erro = h('div', { class: 'msg' });
          return h(
            'div',
            { class: 'item' },
            h(
              'div',
              { class: 'txt' },
              campo,
              erro,
              h(
                'div',
                { class: 'linha2' },
                h('button', { class: 'btn pri', type: 'button', onclick: () => void (async () => {
                  const e = await ctx.estado.fazer((r) => r.editarNota(refAtual(), n.id, campo.value));
                  if (e) { erro.textContent = e; return; }
                  editando = null;
                  redesenhar(renderNotas);
                })() }, 'Salvar'),
                h('button', { class: 'btn', type: 'button', onclick: () => { editando = null; redesenhar(renderNotas); } }, 'Cancelar'),
              ),
            ),
          );
        }
        return h(
          'div',
          { class: 'item' },
          h('div', { class: 'txt' }, n.texto, h('div', { class: 'dica' }, `${dataCurta(n.criadaEm)}${n.editadaEm ? ' (editada)' : ''}`)),
          h(
            'div',
            { class: 'linha2' },
            h('button', { class: 'btn', type: 'button', onclick: () => { editando = n.id; confirmandoExclusao = null; redesenhar(renderNotas); } }, 'Editar'),
            confirmandoExclusao === n.id
              ? h('button', { class: 'btn perigo', type: 'button', onclick: () => void ctx.estado.fazer((r) => r.excluirNota(refAtual(), n.id)).then(() => { confirmandoExclusao = null; redesenhar(renderNotas); }) }, 'Confirmar')
              : h('button', { class: 'btn perigo', type: 'button', onclick: () => { confirmandoExclusao = n.id; redesenhar(renderNotas); } }, 'Excluir'),
          ),
        );
      }),
    );
  };

  const salvarNota = async (): Promise<void> => {
    const e = await ctx.estado.fazer((r) => r.adicionarNota(refAtual(), campoNota.value));
    msgNota.textContent = e ?? '';
    if (e) return;
    campoNota.value = '';
    redesenhar(renderNotas);
  };

  // ── Telefone e vínculo ──
  const renderTelefone = (): void => {
    const c = contato();
    const campo = h('input', { class: 'campo', placeholder: 'DDD + número (ex.: 84 99999-0000)', value: c?.telefone ? `+${c.telefone}` : '', 'aria-label': 'Telefone do contato' });
    const msg = h('div', { class: 'msg' });
    secTelefone.replaceChildren(
      campo,
      h(
        'div',
        { class: 'linha2' },
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            title: 'Guarda o telefone (só dígitos, com 55). Se já houver outro contato com ele, os dois viram um só.',
            onclick: () =>
              void (async () => {
                const base = await ctx.estado.fazer((r) => r.registrarContato(refAtual()));
                const r = await ctx.estado.fazer((repo) => repo.vincular(base.id, { telefone: campo.value }));
                if (!r.ok) {
                  msg.textContent = r.erro;
                  return;
                }
                redesenhar(renderTelefone, renderNotas, renderEtiquetas, renderFase, renderDispensa);
              })(),
          },
          'Vincular telefone',
        ),
      ),
      msg,
      h('div', { class: 'dica' }, 'O telefone liga este contato ao mesmo cliente em outros sistemas e junta registros duplicados.'),
    );
  };

  const badge = h('span', { class: 'dica' });
  const renderBadge = (): void => {
    const c = contato();
    badge.textContent = c ? `${c.notas.length} nota${c.notas.length === 1 ? '' : 's'} · ${c.etiquetas.length} etiqueta${c.etiquetas.length === 1 ? '' : 's'}` : '';
  };

  pop.corpo.append(
    badge,
    secDispensa,
    h('h5', {}, 'Fase do funil'),
    secFase,
    h('h5', {}, 'Etiquetas'),
    secEtiquetas,
    h('h5', {}, 'Notas'),
    campoNota,
    msgNota,
    h('div', { class: 'linha2' }, h('button', { class: 'btn pri', type: 'button', onclick: () => void salvarNota() }, 'Salvar nota')),
    secNotas,
    h('h5', {}, 'Telefone'),
    secTelefone,
  );
  renderBadge();
  renderDispensa();
  renderFase();
  renderEtiquetas();
  renderNotas();
  renderTelefone();
  pop.reposicionar();
}

// ── Chip "Etiquetas" da barra: filtro por etiqueta/fase ──────────────────────

export interface ContextoFiltroEtiquetas {
  estado: Estado;
  marcadas: () => string[];
  aoMudar: (ids: string[]) => void;
}

export function abrirFiltroEtiquetas(ancora: HTMLElement, ctx: ContextoFiltroEtiquetas): void {
  const pop = abrirPopover({ ancora, titulo: 'Filtrar por etiqueta', largura: 300 });
  const busca = h('input', { class: 'campo', placeholder: 'Buscar etiquetas', 'aria-label': 'Buscar etiquetas' });
  const lista = h('div', {});

  const render = (): void => {
    const marcadas = new Set(ctx.marcadas());
    const opcoes = opcoesDeFiltro(ctx.estado.dados, busca.value);
    lista.replaceChildren(
      ...(opcoes.length === 0 ? [h('div', { class: 'vazio' }, 'Sem resultados')] : []),
      h(
        'div',
        { class: 'linha2' },
        ...opcoes.map((o) =>
          h(
            'button',
            {
              class: marcadas.has(o.id) ? 'tag' : 'tag fora',
              type: 'button',
              style: marcadas.has(o.id) ? `background:${o.cor}` : `border-color:${o.cor}`,
              'aria-pressed': marcadas.has(o.id) ? 'true' : 'false',
              title: o.tipo === 'fase' ? 'Fase do funil' : 'Etiqueta',
              onclick: () => {
                const proximas = marcadas.has(o.id) ? [...marcadas].filter((x) => x !== o.id) : [...marcadas, o.id];
                ctx.aoMudar(proximas);
                render();
              },
            },
            o.rotulo,
          ),
        ),
      ),
      ...(marcadas.size > 0 ? [h('div', { class: 'linha2' }, h('button', { class: 'btn', type: 'button', onclick: () => { ctx.aoMudar([]); render(); } }, 'Limpar filtro'))] : []),
    );
    pop.reposicionar();
  };
  busca.addEventListener('input', render);
  pop.corpo.append(busca, lista, h('div', { class: 'dica' }, 'Mostra só as conversas de contatos com alguma das marcas escolhidas. Crie etiquetas no painel do cliente (cabeçalho da conversa).'));
  render();
}
