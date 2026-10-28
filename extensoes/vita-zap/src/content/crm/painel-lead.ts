// Painéis (popovers) das ações do lead do CRM Lembretes: registrar contato, reagendar lembrete, etiquetas,
// marcar convertido, vincular a um lead (busca) e criar lead. Tudo vai pelo LeadsCRM (service worker);
// se algo der errado o texto digitado fica no campo e o erro aparece em português. Nada envia mensagem.

import { lerDataHoraLocal, paraInputDataHora, prazoRapido, PRAZOS_RAPIDOS, formatarVencimento, type PrazoRapido } from '../../shared/crm-lembretes';
import { ETIQUETA_ACOMPANHAR, LIMITE_TEXTO_CONTATO, type LeadCrm } from '../../shared/crm-remoto';
import type { RefContato } from '../../shared/crm-tipos';
import type { LeadsCRM, ResultadoAcao, ResultadoLead } from '../../shared/leads';
import { abrirPopover, fecharPopover, mostrarAviso } from './popover';
import { h } from './ui';

export interface ContextoLead {
  leads: LeadsCRM;
  agora: () => Date;
  /** O lead mudou (ação concluída ou vínculo novo): a faixa se redesenha. */
  aplicar: (lead: LeadCrm, pendentes: boolean) => void;
  /** Busca o estado do lead de novo (depois de vincular/criar). */
  recarregar: () => void;
  /** Lê o telefone no painel "Dados do contato" (abre, lê e fecha o painel). Só leitura de dados. */
  lerTelefoneDosDados?: () => Promise<string | null>;
}

const SEM_RESPOSTA = 'A extensão não respondeu. Recarregue a extensão e a aba do WhatsApp.';

async function protegido<T>(fn: () => Promise<T>, msg: HTMLElement): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    msg.textContent = e instanceof Error && e.message ? e.message : SEM_RESPOSTA;
    return null;
  }
}

/** Mostra o resultado de uma ação; devolve true se deu certo (o painel pode fechar). */
function resultado(r: ResultadoAcao | null, msg: HTMLElement, ctx: ContextoLead, okTexto: string): boolean {
  if (!r) return false;
  if (!r.ok) {
    msg.textContent = r.guardado ? `${r.erro.mensagem} O que você digitou foi guardado e será enviado quando a sessão voltar.` : r.erro.mensagem;
    return false;
  }
  ctx.aplicar(r.lead, r.pendente);
  mostrarAviso(r.pendente ? 'Sem conexão com o CRM: guardei a ação e reenvio sozinho quando a internet voltar.' : okTexto);
  return true;
}

// ── Acompanhar ───────────────────────────────────────────────────────────────

/**
 * Botão "Acompanhar" / "Parar de acompanhar" da faixa do lead: põe ou tira a etiqueta "Acompanhar" do CRM pelo
 * mesmo alterarEtiquetas das Etiquetas. Um clique, uma ação: nada de consulta extra ao CRM.
 */
export async function alternarAcompanhar(ctx: ContextoLead, ref: RefContato, lead: LeadCrm): Promise<void> {
  const parar = lead.etiquetas.includes(ETIQUETA_ACOMPANHAR);
  try {
    const r = await ctx.leads.alterarEtiquetas(ref, parar ? { remover: [ETIQUETA_ACOMPANHAR] } : { adicionar: [ETIQUETA_ACOMPANHAR] });
    if (!r.ok) {
      mostrarAviso(r.guardado ? `${r.erro.mensagem} A ação foi guardada e será enviada quando a sessão voltar.` : r.erro.mensagem, 'erro');
      return;
    }
    ctx.aplicar(r.lead, r.pendente);
    mostrarAviso(
      r.pendente
        ? 'Sem conexão com o CRM: guardei a ação e reenvio sozinho quando a internet voltar.'
        : parar
          ? 'Deixei de acompanhar este lead.'
          : 'Lead em acompanhamento. Ele aparece na aba Acompanhar até o fechamento.',
    );
  } catch (e) {
    mostrarAviso(e instanceof Error && e.message ? e.message : SEM_RESPOSTA, 'erro');
  }
}

// ── Registrar contato ────────────────────────────────────────────────────────

export function abrirRegistrarContato(ancora: HTMLElement, ctx: ContextoLead, ref: RefContato): void {
  const pop = abrirPopover({ ancora, titulo: 'Registrar contato', largura: 360 });
  const msg = h('div', { class: 'msg' });
  const texto = h('textarea', { class: 'campo', rows: 4, maxlength: LIMITE_TEXTO_CONTATO, placeholder: 'O que foi combinado? (preço, quantidade, prazo, retorno...)', 'aria-label': 'Texto do contato' });
  const salvar = h('button', { class: 'btn pri', type: 'button' }, 'Registrar no CRM');
  salvar.addEventListener('click', () => {
    salvar.disabled = true;
    msg.textContent = '';
    void protegido(() => ctx.leads.registrarContatoNoLead(ref, texto.value), msg).then((r) => {
      salvar.disabled = false;
      if (resultado(r, msg, ctx, 'Contato registrado nas notas do lead.')) fecharPopover();
      else pop.reposicionar();
    });
  });
  pop.corpo.append(
    h('div', { class: 'dica' }, 'Anexa uma linha com data, hora e o texto às notas do lead no CRM. Conta como contato feito.'),
    texto,
    msg,
    h('div', { class: 'linha2' }, salvar),
  );
  pop.reposicionar();
  texto.focus();
}

// ── Reagendar lembrete ───────────────────────────────────────────────────────

export function abrirReagendar(ancora: HTMLElement, ctx: ContextoLead, ref: RefContato, lead: LeadCrm): void {
  const pop = abrirPopover({ ancora, titulo: 'Reagendar lembrete', largura: 350 });
  const msg = h('div', { class: 'msg' });
  let em: number | null = null;
  const resumo = h('div', { class: 'dica' }, lead.lembreteEm ? `Agora: ${formatarVencimento(lead.lembreteEm, ctx.agora())}` : 'Sem lembrete agora.');
  const custom = h('input', { class: 'campo', type: 'datetime-local', 'aria-label': 'Data e hora personalizadas' });
  const botoes = new Map<string, HTMLButtonElement>();
  const marcar = (id: string, quando: number | null): void => {
    em = quando;
    for (const [k, b] of botoes) b.classList.toggle('sel', k === id);
    resumo.textContent = quando ? `Novo lembrete: ${formatarVencimento(quando, ctx.agora())}` : 'Escolha quando lembrar.';
  };
  for (const p of PRAZOS_RAPIDOS) {
    const b = h('button', {
      class: 'btn',
      type: 'button',
      onclick: () => {
        const q = prazoRapido(p.id as PrazoRapido, ctx.agora());
        custom.value = paraInputDataHora(q);
        marcar(p.id, q);
      },
    }, p.rotulo);
    botoes.set(p.id, b);
  }
  custom.addEventListener('input', () => marcar('custom', lerDataHoraLocal(custom.value)));
  const salvar = h('button', { class: 'btn pri', type: 'button' }, 'Reagendar no CRM');
  salvar.addEventListener('click', () => {
    if (em == null) {
      msg.textContent = 'Escolha a data e a hora.';
      return;
    }
    const quando = em;
    salvar.disabled = true;
    msg.textContent = '';
    void protegido(() => ctx.leads.reagendar(ref, quando), msg).then((r) => {
      salvar.disabled = false;
      if (resultado(r, msg, ctx, 'Lembrete reagendado no CRM.')) fecharPopover();
      else pop.reposicionar();
    });
  });
  pop.corpo.append(h('div', { class: 'linha2' }, [...botoes.values()]), h('div', { class: 'linha2' }, h('span', { class: 'dica' }, 'Personalizada:'), custom), resumo, msg, h('div', { class: 'linha2' }, salvar));
  pop.reposicionar();
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

const RESERVADAS = ['ativo', 'Email Confirmado'];

const TAGS_PADRAO_CRM: Array<{ name: string; color: string }> = [
  { name: 'Cliente Ativo', color: '#16a34a' },
  { name: 'Acompanhar', color: '#0284c7' },
  { name: 'Quente', color: '#ef4444' },
  { name: 'Reativar', color: '#ea580c' },
];

export function abrirEtiquetas(ancora: HTMLElement, ctx: ContextoLead, ref: RefContato, lead: LeadCrm): void {
  const pop = abrirPopover({ ancora, titulo: 'Etiquetas do lead', largura: 360 });
  const msg = h('div', { class: 'msg' });
  const lista = h('div', { class: 'linha2', style: 'display: flex; flex-wrap: wrap; gap: 4px;' });
  const catalogoEl = h('div', { style: 'margin-top: 8px;' });
  let atuais = [...lead.etiquetas];
  let catalogo: Array<{ name: string; color: string }> = [...TAGS_PADRAO_CRM];
  for (const t of atuais) {
    if (!catalogo.some((c) => c.name.toLowerCase() === t.toLowerCase()) && !RESERVADAS.includes(t)) {
      catalogo.push({ name: t, color: '#6366f1' });
    }
  }

  // Carrega catálogo atualizado do CRM se disponível
  void ctx.leads.catalogoTags().then((r) => {
    if (r?.ok && Array.isArray(r.tags) && r.tags.length > 0) {
      catalogo = r.tags.map((s) => ({ name: s.name, color: s.color || '#6366f1' }));
      desenhar();
    }
  }).catch(() => undefined);

  const mudar = async (mudanca: { adicionar?: string[]; remover?: string[] }): Promise<void> => {
    msg.textContent = '';
    const r = await protegido(() => ctx.leads.alterarEtiquetas(ref, mudanca), msg);
    if (resultado(r, msg, ctx, 'Etiquetas atualizadas no CRM.') && r?.ok) {
      atuais = [...r.lead.etiquetas];
      if (mudanca.adicionar) {
        for (const add of mudanca.adicionar) {
          if (!catalogo.some((c) => c.name.toLowerCase() === add.toLowerCase())) {
            catalogo.push({ name: add, color: '#6366f1' });
          }
        }
      }
      desenhar();
    }
  };

  const desenhar = (): void => {
    lista.replaceChildren(
      ...(atuais.length === 0 ? [h('span', { class: 'dica' }, 'Nenhuma etiqueta.')] : []),
      ...atuais.map((t) => {
        if (RESERVADAS.includes(t)) {
          return h('span', { class: 'tag neutra', title: 'Controlada pelo CRM' }, t);
        }
        const itemCat = catalogo.find((c) => c.name.toLowerCase() === t.toLowerCase());
        const cor = itemCat?.color || '#6366f1';
        return h(
          'span',
          { class: 'tag', style: `background: ${cor};` },
          t,
          h('button', {
            type: 'button',
            title: 'Tirar esta etiqueta',
            style: 'background: transparent; border: none; color: #fff; cursor: pointer; padding: 0 0 0 4px; font-weight: bold;',
            onclick: () => void mudar({ remover: [t] }),
          }, '×'),
        );
      }),
    );

    const disponiveis = catalogo.filter(
      (c) => !atuais.some((a) => a.toLowerCase() === c.name.toLowerCase()) && !RESERVADAS.includes(c.name),
    );

    catalogoEl.replaceChildren(
      h('div', { class: 'dica', style: 'margin-bottom: 4px; font-weight: 500;' }, 'Catálogo de tags do CRM:'),
      h(
        'div',
        { class: 'linha2', style: 'display: flex; flex-wrap: wrap; gap: 4px; max-height: 100px; overflow-y: auto;' },
        ...disponiveis.map((c) =>
          h(
            'button',
            {
              class: 'btn',
              type: 'button',
              style: 'font-size: 11px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px;',
              title: `Adicionar "${c.name}"`,
              onclick: () => void mudar({ adicionar: [c.name] }),
            },
            h('span', { style: `width: 8px; height: 8px; border-radius: 50%; background: ${c.color}; display: inline-block;` }),
            `+ ${c.name}`,
          ),
        ),
      ),
    );
    pop.reposicionar();
  };

  const campo = h('input', { class: 'campo', type: 'text', maxlength: 40, placeholder: 'Outra etiqueta (ex.: atacado)', 'aria-label': 'Nova etiqueta' });
  const adicionar = (): void => {
    const t = campo.value.trim();
    if (!t) return;
    campo.value = '';
    void mudar({ adicionar: [t] });
  };
  const form = h('form', { class: 'linha2', style: 'margin-top: 8px;' }, campo, h('button', { class: 'btn pri', type: 'submit' }, 'Adicionar'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    adicionar();
  });
  pop.corpo.append(lista, catalogoEl, form, msg);
  desenhar();
}

// ── Marcar convertido ────────────────────────────────────────────────────────

export function abrirConverter(ancora: HTMLElement, ctx: ContextoLead, ref: RefContato): void {
  const pop = abrirPopover({ ancora, titulo: 'Marcar como convertido', largura: 330 });
  const msg = h('div', { class: 'msg' });
  const valor = h('input', { class: 'campo', type: 'text', inputmode: 'decimal', placeholder: 'Valor do pedido em R$ (opcional)', 'aria-label': 'Valor do pedido' });
  const salvar = h('button', { class: 'btn pri', type: 'button' }, 'Marcar convertido');
  salvar.addEventListener('click', () => {
    const bruto = valor.value.trim();
    // "1.234,50" e "1234,50" e "1234.50"
    const n = bruto === '' ? undefined : Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto);
    if (n !== undefined && !Number.isFinite(n)) {
      msg.textContent = 'Valor inválido. Use números, ex.: 1500,00.';
      return;
    }
    salvar.disabled = true;
    msg.textContent = '';
    void protegido(() => ctx.leads.marcarConvertido(ref, n), msg).then((r) => {
      salvar.disabled = false;
      if (resultado(r, msg, ctx, 'Lead marcado como convertido no CRM.')) fecharPopover();
      else pop.reposicionar();
    });
  });
  pop.corpo.append(h('div', { class: 'dica' }, 'O CRM registra a conversão (e a etiqueta "ativo") para este lead.'), valor, msg, h('div', { class: 'linha2' }, salvar));
  pop.reposicionar();
}

// ── Vincular a um lead / criar lead ──────────────────────────────────────────

function aposLead(r: ResultadoLead | null, msg: HTMLElement, ctx: ContextoLead, texto: string): void {
  if (!r) return;
  if (!r.ok) {
    msg.textContent = r.erro.mensagem;
    return;
  }
  ctx.aplicar(r.lead, false);
  ctx.recarregar();
  fecharPopover();
  mostrarAviso(texto);
}

/** `candidatos` (telefone com mais de um lead): a lista já vem pronta; sem eles, a busca é por texto. */
export function abrirVincular(ancora: HTMLElement, ctx: ContextoLead, ref: RefContato, candidatos?: LeadCrm[]): void {
  const pop = abrirPopover({ ancora, titulo: candidatos ? 'Qual é o lead desta conversa?' : 'Vincular a um lead', largura: 360 });
  const msg = h('div', { class: 'msg' });
  const resultados = h('div', {});
  const mostrar = (leads: LeadCrm[]): void => {
    resultados.replaceChildren(
      ...(leads.length === 0 ? [h('div', { class: 'vazio' }, 'Nenhum lead encontrado.')] : []),
      ...leads.map((l) =>
        h('div', { class: 'item' },
          h('div', { class: 'txt' }, h('strong', {}, l.titulo), h('div', { class: 'dica' }, [l.telefone, l.etiquetas.join(', '), l.responsavel ? `Responsável: ${l.responsavel}` : ''].filter(Boolean).join(' · '))),
          h('button', { class: 'btn pri', type: 'button', onclick: () => void protegido(() => ctx.leads.vincularLead(ref, l.id), msg).then((r) => aposLead(r, msg, ctx, `Conversa ligada ao lead "${l.titulo}".`)) }, 'Vincular'),
        ),
      ),
    );
    pop.reposicionar();
  };
  if (candidatos) {
    mostrar(candidatos);
    pop.corpo.append(resultados, msg);
    return;
  }
  const campo = h('input', { class: 'campo', type: 'text', maxlength: 100, placeholder: 'Nome do lead (mínimo 2 letras)', value: ref.nome, 'aria-label': 'Buscar lead' });
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const buscar = (): void => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const q = campo.value.trim();
    if (q.length < 2) {
      msg.textContent = '';
      resultados.replaceChildren();
      pop.reposicionar();
      return;
    }
    const atual = ++seq;
    msg.textContent = '';
    void protegido(() => ctx.leads.procurarLeads(q), msg).then((r) => {
      if (atual !== seq || !r) return;
      if (!r.ok) msg.textContent = r.erro.mensagem;
      else mostrar(r.leads);
    });
  };
  campo.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(buscar, 250);
  });
  const form = h('form', { class: 'linha2' }, campo, h('button', { class: 'btn pri', type: 'submit' }, 'Buscar'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    buscar();
  });
  pop.corpo.append(h('div', { class: 'dica' }, 'Procura entre os leads que você pode ver no CRM.'), form, resultados, msg);
  pop.reposicionar();
  campo.focus();
  if (campo.value.trim().length >= 2) {
    buscar();
  }
}

export function abrirCriarLead(ancora: HTMLElement, ctx: ContextoLead, ref: RefContato): void {
  const pop = abrirPopover({ ancora, titulo: 'Criar lead no CRM', largura: 350 });
  const msg = h('div', { class: 'msg' });
  const nome = h('input', { class: 'campo', type: 'text', maxlength: 200, value: ref.nome, 'aria-label': 'Nome do lead' });
  const tel = h('input', { class: 'campo', type: 'tel', value: ref.telefone ?? '', placeholder: 'Telefone com DDD (84 99999-0000)', 'aria-label': 'Telefone do lead' });
  const criar = h('button', { class: 'btn pri', type: 'button' }, 'Criar lead');
  const origemTel = h('div', { class: 'dica' });
  if (!ref.telefone && ctx.lerTelefoneDosDados) {
    // Contato salvo: o WhatsApp só mostra o nome. O número fica em "Dados do contato": abre, lê e fecha.
    tel.placeholder = 'Lendo o telefone nos dados do contato…';
    const original = 'Telefone com DDD (84 99999-0000)';
    void ctx.lerTelefoneDosDados().then(
      (t) => {
        tel.placeholder = original;
        if (!tel.isConnected) return;
        if (t && tel.value.trim() === '') {
          tel.value = t;
          origemTel.textContent = 'Telefone lido dos dados do contato — confira.';
        } else if (!t) {
          origemTel.textContent = 'Não consegui ler o telefone nos dados do contato. Digite com DDD.';
        }
        pop.reposicionar();
      },
      () => {
        tel.placeholder = original;
        if (tel.isConnected) origemTel.textContent = 'Não consegui ler o telefone nos dados do contato. Digite com DDD.';
      },
    );
  }
  criar.addEventListener('click', () => {
    criar.disabled = true;
    msg.textContent = '';
    void protegido(() => ctx.leads.criarLead(ref, nome.value, tel.value), msg).then((r) => {
      criar.disabled = false;
      aposLead(r, msg, ctx, 'Lead criado no CRM, com lembrete para amanhã às 9h.');
      pop.reposicionar();
    });
  });
  pop.corpo.append(
    h('div', { class: 'dica' }, 'Cria o lead no CRM com este nome e telefone e um lembrete para amanhã às 9h (o CRM exige uma data).'),
    h('h5', {}, 'Nome'),
    nome,
    h('h5', {}, 'Telefone'),
    tel,
    origemTel,
    msg,
    h('div', { class: 'linha2' }, criar),
  );
  pop.reposicionar();
}
