// Popover "E-mail" da faixa do lead: e-mail do lead (com sugestão tirada da conversa), mandar a apresentação por
// e-mail (Disparo Rápido do CRM) e colocar o lead numa sequência. É e-mail, nunca WhatsApp: nada aqui escreve
// nem envia mensagem no WhatsApp Web.
//
// CONSUMO DO BANCO (Neon): nada automático. Ao abrir o popover: 1 leitura do lead (e-mail) + 1 das inscrições.
// Modelos e sequências só são buscados ao expandir a seção e ficam 15 min em memória (por aba do WhatsApp).
// Salvar, Enviar e Inscrever são ações do usuário.

import { primeiroNome, rotuloStatus, sugerirEmail, emailValido, type InscricaoLead, type ModeloEmail, type SequenciaEmail } from '../../shared/crm-email';
import type { LeadCrm } from '../../shared/crm-remoto';
import type { ResultadoEmail } from '../../shared/servico-email';
import { encontrarTodos } from '../selectors';
import { type ContextoLead } from './painel-lead';
import { abrirPopover, mostrarAviso } from './popover';
import { h } from './ui';

export const VALIDADE_CACHE_EMAIL_MS = 15 * 60_000;
const MAX_MENSAGENS = 30;

interface Guardado<T> {
  em: number;
  valor: T;
}
const cache: { modelos: Guardado<ModeloEmail[]> | null; sequencias: Guardado<SequenciaEmail[]> | null } = { modelos: null, sequencias: null };

export function limparCacheEmail(): void {
  cache.modelos = null;
  cache.sequencias = null;
}

/** Texto das últimas mensagens que estão no HTML da conversa (só leitura). */
export function mensagensVisiveis(): string[] {
  const out: string[] = [];
  for (const m of encontrarTodos(document, 'mensagem').slice(-MAX_MENSAGENS)) {
    const texto = encontrarTodos(m, 'textoMensagem').map((t) => t.textContent ?? '').join(' ').trim();
    if (texto) out.push(texto);
  }
  return out;
}

type Seguro<T> = { ok: true; valor: T } | { ok: false; msg: string };

async function seguro<T>(fn: () => Promise<ResultadoEmail<T>>): Promise<Seguro<T>> {
  try {
    const r = await fn();
    return r.ok ? { ok: true, valor: r.valor } : { ok: false, msg: r.erro.mensagem };
  } catch (e) {
    return { ok: false, msg: e instanceof Error && e.message ? e.message : 'A extensão não respondeu. Recarregue a extensão e a aba do WhatsApp.' };
  }
}

async function comCache<T>(chave: 'modelos' | 'sequencias', agora: number, buscar: () => Promise<ResultadoEmail<T>>): Promise<Seguro<T>> {
  const g = cache[chave] as Guardado<T> | null;
  if (g && agora >= g.em && agora - g.em < VALIDADE_CACHE_EMAIL_MS) return { ok: true, valor: g.valor };
  const r = await seguro(buscar);
  if (r.ok) (cache as Record<string, Guardado<unknown> | null>)[chave] = { em: agora, valor: r.valor };
  return r;
}

export function abrirEmail(ancora: HTMLElement, ctx: ContextoLead, lead: LeadCrm): void {
  let fechado = false;
  const pop = abrirPopover({ ancora, titulo: 'E-mail do lead', largura: 380, aoFechar: () => { fechado = true; } });
  const nome = primeiroNome(lead.titulo);

  // ── Estado ──
  let salvo: string | null = null; // e-mail gravado no CRM
  let confirmado = false;
  let notas = lead.notas;
  let modelos: ModeloEmail[] | null = null;
  let sequencias: SequenciaEmail[] | null = null;
  let envioFeito = false;

  // ── 1. E-mail ──
  const campo = h('input', { class: 'campo', type: 'email', placeholder: 'nome@empresa.com.br', 'aria-label': 'E-mail do lead', autocomplete: 'off', disabled: true });
  const situacao = h('div', { class: 'dica' }, 'Carregando o e-mail do lead...');
  const msgEmail = h('div', { class: 'msg' });
  const salvar = h('button', { class: 'btn pri', type: 'button', disabled: true }, 'Salvar e-mail');

  const atual = (): string => campo.value.trim().toLowerCase();
  /** O e-mail do campo é exatamente o que está gravado E confirmado no CRM. */
  const podeUsar = (): boolean => confirmado && salvo !== null && atual() === salvo;

  // ── 4. Status (sequências em que o lead já está) ──
  const status = h('div', { class: 'dica' }, 'Carregando sequências do lead...');
  function mostrarStatus(i: InscricaoLead): void {
    const linhas: string[] = [
      ...i.sequencias.map((s) => `Sequência "${s.nome}" (${rotuloStatus(s.status)}, passo ${s.passo})`),
      ...i.campanhas.slice(0, 5).map((c) => `Campanha "${c.nome}" (${rotuloStatus(c.status)})`),
    ];
    status.replaceChildren(...(linhas.length > 0 ? linhas.map((l) => h('div', {}, l)) : ['Não está em nenhuma sequência nem recebeu campanha.']));
    pop.reposicionar();
  }

  /** "Salve o e-mail" nas seções que dependem dele (some quando o e-mail do campo está salvo e confirmado). */
  const avisos: HTMLElement[] = [];
  const avisoSalvar = (): HTMLElement => {
    const a = h('div', { class: 'dica' }, 'Salve o e-mail acima (confirmado) para liberar esta ação.');
    avisos.push(a);
    return a;
  };

  // ── 2. Enviar apresentação ──
  const secEnvio = h('div', { class: 'sec-email' });
  const msgEnvio = h('div', { class: 'msg' });
  const selModelo = h('select', { class: 'campo', 'aria-label': 'Modelo de e-mail' });
  const previa = h('div', { class: 'dica' });
  const mandar = h('button', { class: 'btn pri', type: 'button', disabled: true }, 'Mandar');
  let confirmando = false;
  const modeloAtual = (): ModeloEmail | undefined => modelos?.find((m) => String(m.id) === selModelo.value);

  // ── 3. Sequência ──
  const secSeq = h('div', { class: 'sec-email' });
  const msgSeq = h('div', { class: 'msg' });
  const selSeq = h('select', { class: 'campo', 'aria-label': 'Sequência' });
  const inscrever = h('button', { class: 'btn pri', type: 'button', disabled: true }, 'Inscrever');

  function atualizarBotoes(): void {
    salvar.disabled = !emailValido(atual()) || (podeUsar() && salvo === atual());
    const usar = podeUsar();
    mandar.disabled = !usar || !modeloAtual() || envioFeito;
    inscrever.disabled = !usar || !selSeq.value;
    for (const a of avisos) a.style.display = usar ? 'none' : 'block';
    if (confirmando) {
      confirmando = false;
      mandar.textContent = 'Mandar';
    }
  }
  campo.addEventListener('input', () => {
    msgEmail.textContent = '';
    atualizarBotoes();
  });

  function atualizarPrevia(): void {
    const m = modeloAtual();
    previa.textContent = m ? `Assunto: ${m.assunto.replace(/\{nome\}/gi, nome || 'cliente')}` : '';
    envioFeito = false;
    atualizarBotoes();
    pop.reposicionar();
  }
  selModelo.addEventListener('change', atualizarPrevia);
  selSeq.addEventListener('change', atualizarBotoes);

  salvar.addEventListener('click', () => {
    const digitado = atual();
    if (!emailValido(digitado)) {
      msgEmail.textContent = 'Digite um e-mail válido (nome@empresa.com.br).';
      return;
    }
    salvar.disabled = true;
    msgEmail.textContent = '';
    void seguro(async () => {
      const r = await ctx.leads.salvarEmailDoLead(lead.id, digitado);
      return r.ok ? { ok: true as const, valor: r.lead } : { ok: false as const, erro: r.erro };
    }).then((r) => {
      if (fechado) return;
      if (!r.ok) {
        msgEmail.textContent = r.msg;
        atualizarBotoes();
        return;
      }
      salvo = digitado;
      confirmado = true;
      notas = r.valor.notas;
      campo.value = digitado;
      situacao.textContent = 'E-mail salvo e confirmado.';
      situacao.className = 'dica ok';
      ctx.aplicar(r.valor, false);
      mostrarAviso('E-mail do lead salvo e confirmado.');
      atualizarBotoes();
    });
  });

  // ── Seções que só carregam quando expandidas ──
  function secao(titulo: string, corpo: HTMLElement, aoAbrir: () => void): HTMLElement {
    corpo.style.display = 'none';
    const cab = h('button', { class: 'btn', type: 'button', 'aria-expanded': 'false' }, `${titulo} ▾`);
    cab.addEventListener('click', () => {
      const abrir = corpo.style.display === 'none';
      corpo.style.display = abrir ? 'block' : 'none';
      cab.setAttribute('aria-expanded', String(abrir));
      if (abrir) aoAbrir();
      pop.reposicionar();
    });
    return h('div', { class: 'linha2', style: 'flex-direction:column;align-items:stretch' }, cab, corpo);
  }

  function carregarModelos(): void {
    if (modelos) return;
    msgEnvio.textContent = 'Carregando modelos...';
    void comCache('modelos', ctx.agora().getTime(), () => ctx.leads.modelosEmail()).then((r) => {
      if (fechado) return;
      if (!r.ok) {
        msgEnvio.textContent = r.msg;
        return;
      }
      modelos = r.valor;
      msgEnvio.textContent = modelos.length === 0 ? 'Nenhum modelo disponível (ou você não tem permissão de E-mail Marketing).' : '';
      selModelo.replaceChildren(...modelos.map((m) => h('option', { value: String(m.id) }, m.nome)));
      if (modelos.length > 0) selModelo.value = String(modelos[0].id);
      atualizarPrevia();
    });
  }

  function carregarSequencias(): void {
    if (sequencias) return;
    msgSeq.textContent = 'Carregando sequências...';
    void comCache('sequencias', ctx.agora().getTime(), () => ctx.leads.sequenciasEmail()).then((r) => {
      if (fechado) return;
      if (!r.ok) {
        msgSeq.textContent = r.msg;
        return;
      }
      sequencias = r.valor;
      msgSeq.textContent = sequencias.length === 0 ? 'Nenhuma sequência ativa (ou você não tem permissão de E-mail Marketing).' : '';
      selSeq.replaceChildren(...sequencias.map((s) => h('option', { value: String(s.id) }, s.nome)));
      atualizarBotoes();
      pop.reposicionar();
    });
  }

  mandar.addEventListener('click', () => {
    const m = modeloAtual();
    if (!m || !podeUsar() || salvo === null) return;
    // Duas etapas: e-mail enviado não volta atrás.
    if (!confirmando) {
      confirmando = true;
      mandar.textContent = `Confirmar envio para ${salvo}`;
      return;
    }
    confirmando = false;
    mandar.disabled = true;
    mandar.textContent = 'Enviando...';
    msgEnvio.textContent = '';
    msgEnvio.className = 'msg';
    void seguro(() => ctx.leads.mandarApresentacao({ taskId: lead.id, email: salvo!, nome, assunto: m.assunto, html: m.html, anexos: m.anexos })).then((r) => {
      if (fechado) return;
      mandar.textContent = 'Mandar';
      if (!r.ok) {
        msgEnvio.textContent = r.msg;
        atualizarBotoes();
        return;
      }
      const e = r.valor;
      if (e.enviados > 0 && e.falhas === 0) {
        envioFeito = true;
        msgEnvio.className = 'msg ok';
        msgEnvio.textContent = `Enviado para ${salvo}.`;
        mostrarAviso(`E-mail "${m.nome}" enviado para ${salvo}.`);
      } else if (e.limiteDiario) {
        msgEnvio.textContent = 'O limite diário das contas de e-mail foi atingido: não saiu. Tente mais tarde.';
      } else if (e.falhas > 0) {
        msgEnvio.textContent = 'O provedor recusou o envio para este e-mail. Confira o endereço.';
      } else if (e.pendentes > 0) {
        msgEnvio.textContent = 'O envio ficou na fila do CRM (ainda não saiu). Confira em E-mail Marketing.';
      } else {
        msgEnvio.textContent = 'Nenhum e-mail foi enviado (descadastrado ou domínio bloqueado). Confira no CRM.';
      }
      atualizarBotoes();
      pop.reposicionar();
    });
  });

  inscrever.addEventListener('click', () => {
    const id = Number(selSeq.value);
    const seq = sequencias?.find((s) => s.id === id);
    if (!seq || !podeUsar()) return;
    inscrever.disabled = true;
    msgSeq.textContent = '';
    msgSeq.className = 'msg';
    void seguro(() => ctx.leads.inscreverNaSequencia(id, lead.id)).then((r) => {
      if (fechado) return;
      if (!r.ok) {
        msgSeq.textContent = r.msg;
        atualizarBotoes();
        return;
      }
      const { inscritos, motivos } = r.valor;
      if (inscritos > 0) {
        msgSeq.className = 'msg ok';
        msgSeq.textContent = `Inscrito na sequência "${seq.nome}" (${inscritos}).`;
        status.append(h('div', {}, `Sequência "${seq.nome}" (ativa, passo 0)`));
      } else {
        msgSeq.textContent = motivos.length > 0 ? `Não inscrito: ${motivos.join('; ')}` : 'Não inscrito (já estava na sequência ou o e-mail está descadastrado).';
      }
      atualizarBotoes();
      pop.reposicionar();
    });
  });

  secEnvio.append(avisoSalvar(), selModelo, previa, h('div', { class: 'linha2' }, mandar), msgEnvio);
  secSeq.append(avisoSalvar(), selSeq, h('div', { class: 'linha2' }, inscrever), msgSeq);

  pop.corpo.append(
    h('div', { class: 'dica' }, `Lead: ${lead.titulo}`),
    campo,
    situacao,
    msgEmail,
    h('div', { class: 'linha2' }, salvar),
    h('h5', {}, 'Já está em'),
    status,
    secao('Mandar apresentação agora', secEnvio, carregarModelos),
    secao('Colocar numa sequência', secSeq, carregarSequencias),
  );
  pop.reposicionar();

  // ── Ao abrir: 2 leituras, e só ---
  void seguro(() => ctx.leads.emailDoLead(lead.id)).then((r) => {
    if (fechado) return;
    campo.disabled = false;
    if (!r.ok) {
      situacao.textContent = '';
      msgEmail.textContent = r.msg;
      return;
    }
    notas = r.valor.notas || notas;
    if (r.valor.email) {
      salvo = r.valor.email;
      confirmado = r.valor.confirmado;
      campo.value = r.valor.email;
      situacao.textContent = confirmado ? 'E-mail confirmado.' : 'E-mail ainda não confirmado: salve para liberar envios e sequências.';
      situacao.className = confirmado ? 'dica ok' : 'dica';
    } else {
      const sugestao = sugerirEmail({ mensagens: mensagensVisiveis(), notas, titulo: r.valor.titulo || lead.titulo });
      if (sugestao) {
        campo.value = sugestao;
        situacao.textContent = 'Sugestão achada nas mensagens/notas: confira e clique em Salvar.';
      } else {
        situacao.textContent = 'Este lead não tem e-mail. Digite o que o cliente informou e clique em Salvar.';
      }
    }
    atualizarBotoes();
    pop.reposicionar();
    campo.focus();
  });
  void seguro(() => ctx.leads.inscricoesDoLead(lead.id)).then((r) => {
    if (fechado) return;
    if (r.ok) mostrarStatus(r.valor);
    else status.textContent = r.msg;
  });
}
