// ServicoCrm: tudo o que a extensão faz com o CRM Lembretes (login, lead da conversa, registrar contato,
// reagendar, etiquetas, converter, lembretes) e a fila local de reenvio. Roda SÓ no service worker
// (único lugar com rede e dono da fila); o resto da extensão o chama por mensagem (crm-transporte.ts).
//
// - A senha só existe na chamada `entrar`: não é guardada. Fica a sessão (cookie do navegador).
// - Nada aqui envia mensagem de WhatsApp.
// - Sem login a extensão segue 100% local (modo misto); com login o lead vem do CRM e o que está em
//   chrome.storage é só cache (vz.crm.*).
// - Rede fora do ar: a ação do usuário entra numa fila local e é reenviada (alarme de 5 min, login,
//   próxima ação). Nada digitado é perdido; o que o CRM recusar de vez vai para "falhas" com o resumo.

import { URL_CRM_PADRAO } from './constantes';
import { instanteNoFuso } from './crm-lembretes';
import { criarClienteTrpc, ErroDoCrm, normalizarBaseUrl, type ClienteTrpc, type ErroCrm, type Transporte } from './crm-rede';
import {
  anexarNota,
  CHAVES_CRM,
  chavesDoVinculo,
  erroValidacao,
  leadDeTask,
  lembreteDeTask,
  idLembreteCrm,
  LIMITE_TEXTO_CONTATO,
  linhaDeContato,
  MANTER_AVISADOS_MS,
  TOLERANCIA_AVISO_MS,
  type LeadCrm,
  type LembreteCrm,
  type UsuarioCrm,
} from './crm-remoto';
import type { RefContato } from './crm-tipos';
import { hojeNoFuso, somarDias } from './datas';
import { novoId } from './id';
import type { ArmazemChaves, EstadoConta, EstadoLead, FalhaFila, LeadsCRM, ResultadoAcao, ResultadoBusca, ResultadoConta, ResultadoLead } from './leads';
import { normalizarTelefone } from './telefone';

const MAX_FILA = 200;
const MAX_FALHAS = 20;
const MAX_CACHE_LEADS = 200;
/** Etiquetas que o próprio CRM gerencia (conversão e e-mail confirmado): a extensão não mexe. */
const ETIQUETAS_RESERVADAS = ['ativo', 'Email Confirmado'];

interface ContaGravada {
  baseUrl: string;
  usuario: UsuarioCrm | null;
  erro?: ErroCrm;
}

export type OpFila =
  | { tipo: 'contato'; linha: string }
  | { tipo: 'reagendar'; em: number }
  | { tipo: 'etiquetas'; adicionar: string[]; remover: string[] }
  | { tipo: 'converter'; valor?: number };

export interface ItemFila {
  id: string;
  usuarioId: number;
  taskId: number;
  criadoEm: number;
  op: OpFila;
}

interface CacheLead {
  lead: LeadCrm;
  em: number;
}

type Chamada<T> = { ok: true; valor: T } | { ok: false; erro: ErroCrm };

function usuarioDe(bruto: unknown): UsuarioCrm | null {
  const o = (typeof bruto === 'object' && bruto !== null ? bruto : {}) as Record<string, unknown>;
  if (typeof o.id !== 'number' || typeof o.email !== 'string') return null;
  return { id: o.id, name: typeof o.name === 'string' ? o.name : o.email, email: o.email, role: typeof o.role === 'string' ? o.role : 'user' };
}

function resumoDaOp(op: OpFila): string {
  if (op.tipo === 'contato') return `Contato: ${op.linha}`;
  if (op.tipo === 'reagendar') return `Reagendar lembrete para ${new Date(op.em).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`;
  if (op.tipo === 'etiquetas') return `Etiquetas: +${op.adicionar.join(', ') || '-'} / -${op.remover.join(', ') || '-'}`;
  return `Marcar convertido${op.valor != null ? ` (R$ ${op.valor})` : ''}`;
}

/** O que a tela deve mostrar enquanto a ação não chegou ao CRM. */
export function aplicarLocal(lead: LeadCrm, item: Pick<ItemFila, 'op' | 'criadoEm'>): LeadCrm {
  const op = item.op;
  if (op.tipo === 'contato') return { ...lead, notas: anexarNota(lead.notas, op.linha), contatos: lead.contatos + 1, ultimoContatoEm: item.criadoEm };
  if (op.tipo === 'reagendar') return { ...lead, lembreteEm: op.em, lembreteAtivo: true };
  if (op.tipo === 'etiquetas') return { ...lead, etiquetas: calcularEtiquetas(lead.etiquetas, op.adicionar, op.remover) };
  return { ...lead, convertidoEm: lead.convertidoEm ?? item.criadoEm, etiquetas: calcularEtiquetas(lead.etiquetas, ['ativo'], []) };
}

export function calcularEtiquetas(atuais: string[], adicionar: string[], remover: string[]): string[] {
  const fora = new Set(remover);
  const saida = atuais.filter((t) => !fora.has(t));
  for (const t of adicionar) if (!saida.includes(t)) saida.push(t);
  return saida;
}

export class ServicoCrm implements LeadsCRM {
  private cadeia: Promise<unknown> = Promise.resolve();
  private readonly cliente: ClienteTrpc;

  constructor(
    private readonly arm: ArmazemChaves,
    transporte: Transporte,
    private readonly relogio: () => number = Date.now,
  ) {
    this.cliente = criarClienteTrpc(transporte, async () => (await this.lerConta()).baseUrl);
  }

  // ── Infraestrutura ─────────────────────────────────────────────────────────

  /** Uma operação de cada vez (as chamadas chegam de vários contextos da extensão). */
  private exclusivo<T>(fn: () => Promise<T>): Promise<T> {
    const t = this.cadeia.then(fn, fn);
    this.cadeia = t.catch(() => undefined);
    return t;
  }

  private async ler<T>(chave: string, padrao: T): Promise<T> {
    return (await this.arm.lerChave<T>(chave)) ?? padrao;
  }

  private async lerConta(): Promise<ContaGravada> {
    return this.ler<ContaGravada>(CHAVES_CRM.conta, { baseUrl: URL_CRM_PADRAO, usuario: null });
  }

  private gravarConta(c: ContaGravada): Promise<void> {
    return this.arm.gravarChave(CHAVES_CRM.conta, c);
  }

  private async gravarSeDiferente(chave: string, valor: unknown): Promise<void> {
    const atual = await this.arm.lerChave<unknown>(chave);
    if (JSON.stringify(atual ?? null) !== JSON.stringify(valor)) await this.arm.gravarChave(chave, valor);
  }

  private async estadoConta(): Promise<EstadoConta> {
    const c = await this.lerConta();
    const fila = await this.ler<ItemFila[]>(CHAVES_CRM.fila, []);
    const lembretes = await this.ler<{ em: number } | null>(CHAVES_CRM.lembretes, null);
    return {
      baseUrl: c.baseUrl,
      usuario: c.usuario,
      ...(c.erro ? { erro: c.erro } : {}),
      pendentes: c.usuario ? fila.filter((i) => i.usuarioId === c.usuario!.id).length : 0,
      falhas: await this.ler<FalhaFila[]>(CHAVES_CRM.falhas, []),
      sincronizadoEm: lembretes?.em ?? null,
    };
  }

  /** Chama o CRM sem lançar. Se a sessão caiu (401), registra e o app volta ao modo local. */
  private async chamar<T>(fn: () => Promise<T>): Promise<Chamada<T>> {
    try {
      return { ok: true, valor: await fn() };
    } catch (e) {
      const erro: ErroCrm = e instanceof ErroDoCrm ? e.erro : { tipo: 'servidor', mensagem: 'Falha inesperada ao falar com o CRM.' };
      if (erro.tipo === 'nao-autenticado' || erro.tipo === 'ip') {
        const c = await this.lerConta();
        if (c.usuario) await this.gravarConta({ ...c, usuario: null, erro });
      }
      return { ok: false, erro };
    }
  }

  private async resultadoConta(r: { ok: true } | { ok: false; erro: ErroCrm }): Promise<ResultadoConta> {
    const conta = await this.estadoConta();
    return r.ok ? { ok: true, conta } : { ok: false, erro: r.erro, conta };
  }

  // ── Conta ──────────────────────────────────────────────────────────────────

  conta(): Promise<EstadoConta> {
    return this.estadoConta();
  }

  definirUrl(url: string): Promise<ResultadoConta> {
    return this.exclusivo(async () => {
      const base = normalizarBaseUrl(url);
      if (!base) return this.resultadoConta({ ok: false, erro: erroValidacao('Endereço inválido. Use https://... (ou http://localhost).') });
      const c = await this.lerConta();
      if (base !== c.baseUrl) {
        // O cookie e os ids são do outro servidor: recomeça (vínculos, cache e fila ficam para trás).
        await this.arm.limparChaves('vz.crm.', [CHAVES_CRM.conta]);
        await this.gravarConta({ baseUrl: base, usuario: null });
      }
      return this.resultadoConta({ ok: true });
    });
  }

  entrar(email: string, senha: string): Promise<ResultadoConta> {
    return this.exclusivo(async () => {
      const e = email.trim();
      if (!e || !senha) return this.resultadoConta({ ok: false, erro: erroValidacao('Informe o e-mail e a senha.') });
      const r = await this.chamar(async () => {
        await this.cliente.alterar('auth.login', { email: e, password: senha });
        return this.cliente.consultar<unknown>('auth.me');
      });
      if (!r.ok) return this.resultadoConta(r);
      const c = await this.lerConta();
      const u = usuarioDe(r.valor);
      if (!u) {
        const erro: ErroCrm = {
          tipo: 'nao-autenticado',
          mensagem: 'O CRM aceitou o login, mas não reconheceu a sessão em seguida: o seu IP pode não estar liberado para este usuário, ou o Chrome não enviou o cookie da sessão.',
        };
        await this.gravarConta({ ...c, usuario: null, erro });
        return this.resultadoConta({ ok: false, erro });
      }
      await this.gravarConta({ baseUrl: c.baseUrl, usuario: u });
      await this.sincronizarInterno();
      await this.reenviarInterno();
      return this.resultadoConta({ ok: true });
    });
  }

  verificarSessao(): Promise<ResultadoConta> {
    return this.exclusivo(async () => {
      const c = await this.lerConta();
      if (!c.usuario) return this.resultadoConta(c.erro ? { ok: false, erro: c.erro } : { ok: true });
      const r = await this.chamar(() => this.cliente.consultar<unknown>('auth.me'));
      if (!r.ok) return this.resultadoConta(r);
      const u = usuarioDe(r.valor);
      if (!u) {
        const erro: ErroCrm = { tipo: 'nao-autenticado', mensagem: 'A sessão no CRM expirou. Entre de novo.' };
        await this.gravarConta({ ...c, usuario: null, erro });
        return this.resultadoConta({ ok: false, erro });
      }
      await this.gravarConta({ baseUrl: c.baseUrl, usuario: u });
      return this.resultadoConta({ ok: true });
    });
  }

  sair(): Promise<EstadoConta> {
    return this.exclusivo(async () => {
      const c = await this.lerConta();
      if (c.usuario) await this.chamar(() => this.cliente.alterar('auth.logout'));
      // Some o cache do usuário (leads, lembretes). Ficam vínculos e a fila (do usuário certo, para quando ele voltar).
      await this.arm.limparChaves('vz.crm.', [CHAVES_CRM.conta, CHAVES_CRM.vinculos, CHAVES_CRM.fila, CHAVES_CRM.falhas]);
      await this.gravarConta({ baseUrl: c.baseUrl, usuario: null });
      return this.estadoConta();
    });
  }

  // ── Vínculo e cache ────────────────────────────────────────────────────────

  private async taskDoVinculo(ref: RefContato): Promise<number | null> {
    const v = await this.ler<Record<string, number>>(CHAVES_CRM.vinculos, {});
    for (const k of chavesDoVinculo(ref)) if (typeof v[k] === 'number') return v[k];
    return null;
  }

  private async gravarVinculo(ref: RefContato, taskId: number): Promise<void> {
    const v = await this.ler<Record<string, number>>(CHAVES_CRM.vinculos, {});
    for (const k of chavesDoVinculo(ref)) v[k] = taskId;
    await this.arm.gravarChave(CHAVES_CRM.vinculos, v);
  }

  async desvincularLead(ref: RefContato): Promise<void> {
    await this.exclusivo(async () => {
      const v = await this.ler<Record<string, number>>(CHAVES_CRM.vinculos, {});
      const alvo = await this.taskDoVinculo(ref);
      for (const k of Object.keys(v)) if (v[k] === alvo) delete v[k];
      await this.arm.gravarChave(CHAVES_CRM.vinculos, v);
    });
  }

  private async guardarNoCache(lead: LeadCrm): Promise<void> {
    const c = await this.ler<Record<string, CacheLead>>(CHAVES_CRM.leads, {});
    c[String(lead.id)] = { lead, em: this.relogio() };
    const ids = Object.keys(c);
    if (ids.length > MAX_CACHE_LEADS) {
      for (const id of ids.sort((a, b) => c[a].em - c[b].em).slice(0, ids.length - MAX_CACHE_LEADS)) delete c[id];
    }
    await this.arm.gravarChave(CHAVES_CRM.leads, c);
  }

  private async doCache(taskId: number): Promise<LeadCrm | null> {
    return (await this.ler<Record<string, CacheLead>>(CHAVES_CRM.leads, {}))[String(taskId)]?.lead ?? null;
  }

  private async filaDe(taskId: number, usuarioId: number): Promise<ItemFila[]> {
    return (await this.ler<ItemFila[]>(CHAVES_CRM.fila, [])).filter((i) => i.taskId === taskId && i.usuarioId === usuarioId);
  }

  // ── Lead da conversa ───────────────────────────────────────────────────────

  leadDoContato(ref: RefContato): Promise<EstadoLead> {
    return this.exclusivo(async () => {
      const c = await this.lerConta();
      if (!c.usuario) return { tipo: 'sem-login', ...(c.erro ? { erro: c.erro } : {}) } as EstadoLead;
      const uid = c.usuario.id;
      const mostrar = async (lead: LeadCrm, desatualizado: boolean, aviso?: ErroCrm): Promise<EstadoLead> => {
        const pend = await this.filaDe(lead.id, uid);
        const comFila = pend.reduce((l, i) => aplicarLocal(l, i), lead);
        return { tipo: 'lead', lead: comFila, desatualizado, pendentes: pend.length, ...(aviso ? { aviso } : {}) };
      };

      const taskId = await this.taskDoVinculo(ref);
      if (taskId != null) {
        const r = await this.chamar(() => this.cliente.consultar<unknown>('tasks.getById', { id: taskId }));
        if (r.ok) {
          const lead = leadDeTask(r.valor);
          if (lead) {
            await this.guardarNoCache(lead);
            return mostrar(lead, false);
          }
        } else if (r.erro.tipo === 'nao-encontrado' || r.erro.tipo === 'proibido') {
          await this.removerVinculo(taskId); // a task sumiu ou não é mais sua: procura de novo pelo telefone
        } else {
          const guardado = await this.doCache(taskId);
          return guardado ? mostrar(guardado, true, r.erro) : { tipo: 'erro', erro: r.erro };
        }
      }

      const tel = normalizarTelefone(ref.telefone);
      if (!tel) return { tipo: 'nao-encontrado', semTelefone: true };
      const r = await this.chamar(() => this.cliente.consultar<unknown[]>('tasks.findForWhatsapp', { phone: tel }));
      if (!r.ok) return { tipo: 'erro', erro: r.erro };
      const leads = (Array.isArray(r.valor) ? r.valor : []).map(leadDeTask).filter((l): l is LeadCrm => l != null);
      if (leads.length === 0) return { tipo: 'nao-encontrado', semTelefone: false };
      if (leads.length > 1) return { tipo: 'varios', candidatos: leads };
      await this.gravarVinculo(ref, leads[0].id);
      await this.guardarNoCache(leads[0]);
      return mostrar(leads[0], false);
    });
  }

  private async removerVinculo(taskId: number): Promise<void> {
    const v = await this.ler<Record<string, number>>(CHAVES_CRM.vinculos, {});
    for (const k of Object.keys(v)) if (v[k] === taskId) delete v[k];
    await this.arm.gravarChave(CHAVES_CRM.vinculos, v);
  }

  procurarLeads(q: string): Promise<ResultadoBusca> {
    return this.exclusivo(async () => {
      const texto = q.trim();
      if (texto.length < 2) return { ok: false, erro: erroValidacao('Digite pelo menos 2 letras.') } as ResultadoBusca;
      const r = await this.chamar(() => this.cliente.consultar<unknown[]>('tasks.findForWhatsapp', { q: texto.slice(0, 100) }));
      if (!r.ok) return { ok: false, erro: r.erro };
      return { ok: true, leads: (Array.isArray(r.valor) ? r.valor : []).map(leadDeTask).filter((l): l is LeadCrm => l != null) };
    });
  }

  vincularLead(ref: RefContato, taskId: number): Promise<ResultadoLead> {
    return this.exclusivo(async () => {
      const r = await this.chamar(() => this.cliente.consultar<unknown>('tasks.getById', { id: taskId }));
      if (!r.ok) return { ok: false, erro: r.erro };
      const lead = leadDeTask(r.valor);
      if (!lead) return { ok: false, erro: { tipo: 'servidor', mensagem: 'Resposta inesperada do CRM.' } };
      await this.gravarVinculo(ref, lead.id);
      await this.guardarNoCache(lead);
      return { ok: true, lead };
    });
  }

  criarLead(ref: RefContato, nome: string, telefone: string): Promise<ResultadoLead> {
    return this.exclusivo(async () => {
      const titulo = nome.replace(/\s+/g, ' ').trim().slice(0, 500);
      const tel = normalizarTelefone(telefone);
      if (!titulo) return { ok: false, erro: erroValidacao('Informe o nome do lead.') } as ResultadoLead;
      if (!tel) return { ok: false, erro: erroValidacao('Informe o telefone com DDD (ex.: 84 99999-0000).') } as ResultadoLead;
      // Já existe um lead com esse telefone? Usa o existente em vez de duplicar.
      const antes = await this.chamar(() => this.cliente.consultar<unknown[]>('tasks.findForWhatsapp', { phone: tel }));
      if (!antes.ok) return { ok: false, erro: antes.erro };
      const achado = (Array.isArray(antes.valor) ? antes.valor : []).map(leadDeTask).find((l): l is LeadCrm => l != null);
      let lead = achado ?? null;
      if (!lead) {
        // O CRM exige data de lembrete: amanhã às 9h (Fortaleza), para o lead novo não ficar esquecido.
        const amanha9h = instanteNoFuso(somarDias(hojeNoFuso(new Date(this.relogio())), 1), 9, 0);
        const r = await this.chamar(() => this.cliente.alterar<unknown>('tasks.create', { title: titulo, phone: tel, reminderDate: new Date(amanha9h), reminderEnabled: true }));
        if (!r.ok) return { ok: false, erro: r.erro };
        lead = leadDeTask(r.valor);
        if (!lead) return { ok: false, erro: { tipo: 'servidor', mensagem: 'Resposta inesperada do CRM.' } };
      }
      await this.gravarVinculo(ref, lead.id);
      await this.guardarNoCache(lead);
      await this.sincronizarInterno();
      return { ok: true, lead };
    });
  }

  // ── Ações no lead (com fila offline) ───────────────────────────────────────

  /** Aplica a ação no CRM. Sempre parte do estado ATUAL da task (notas e etiquetas lidas de novo). */
  private async aplicarRemoto(taskId: number, op: OpFila): Promise<LeadCrm> {
    const ler = async (): Promise<Record<string, unknown>> => ((await this.cliente.consultar<unknown>('tasks.getById', { id: taskId })) ?? {}) as Record<string, unknown>;
    const comoLead = (bruto: unknown): LeadCrm => {
      const l = leadDeTask(bruto);
      if (!l) throw new ErroDoCrm({ tipo: 'servidor', mensagem: 'Resposta inesperada do CRM.' });
      return l;
    };
    if (op.tipo === 'contato') {
      const atual = await ler();
      const notas = typeof atual.notes === 'string' ? atual.notes : '';
      if (notas.includes(op.linha)) return comoLead(atual); // reenvio de algo que já chegou: não duplica a linha
      return comoLead(await this.cliente.alterar<unknown>('tasks.update', { id: taskId, notes: anexarNota(notas, op.linha) }));
    }
    if (op.tipo === 'reagendar') {
      return comoLead(await this.cliente.alterar<unknown>('tasks.update', { id: taskId, reminderDate: new Date(op.em), reminderEnabled: true }));
    }
    if (op.tipo === 'etiquetas') {
      const atual = await ler();
      const tags = Array.isArray(atual.tags) ? atual.tags.filter((t): t is string => typeof t === 'string') : [];
      return comoLead(await this.cliente.alterar<unknown>('tasks.update', { id: taskId, tags: calcularEtiquetas(tags, op.adicionar, op.remover) }));
    }
    return comoLead(await this.cliente.alterar<unknown>('tasks.toggleConverted', { id: taskId, converted: true, ...(op.valor !== undefined ? { orderValue: op.valor } : {}) }));
  }

  private async enfileirar(usuarioId: number, taskId: number, op: OpFila): Promise<boolean> {
    const fila = await this.ler<ItemFila[]>(CHAVES_CRM.fila, []);
    if (fila.length >= MAX_FILA) return false;
    fila.push({ id: novoId(), usuarioId, taskId, criadoEm: this.relogio(), op });
    await this.arm.gravarChave(CHAVES_CRM.fila, fila);
    return true;
  }

  /** Tenta agora; sem rede (ou sessão caída) guarda na fila e mostra o resultado esperado. */
  private async executar(taskId: number, op: OpFila): Promise<ResultadoAcao> {
    const c = await this.lerConta();
    if (!c.usuario) return { ok: false, erro: c.erro ?? { tipo: 'nao-autenticado', mensagem: 'Entre no CRM na aba Dados.' }, guardado: false };
    const uid = c.usuario.id;
    const cache = (await this.doCache(taskId)) ?? { id: taskId, titulo: '', telefone: null, etiquetas: [], lembreteEm: null, lembreteAtivo: true, status: 'pending', ultimoContatoEm: null, contatos: 0, convertidoEm: null, notas: '' };
    const otimista = (): LeadCrm => aplicarLocal(cache, { op, criadoEm: this.relogio() });

    // Mantém a ordem: se já há coisa pendente desta task, tenta esvaziar a fila antes de passar na frente.
    if ((await this.filaDe(taskId, uid)).length > 0) await this.reenviarInterno();
    if ((await this.filaDe(taskId, uid)).length > 0) {
      const cabe = await this.enfileirar(uid, taskId, op);
      return cabe ? { ok: true, lead: otimista(), pendente: true } : { ok: false, erro: erroValidacao('Há ações demais esperando a conexão voltar. Tente de novo mais tarde.'), guardado: false };
    }

    const r = await this.chamar(() => this.aplicarRemoto(taskId, op));
    if (r.ok) {
      await this.guardarNoCache(r.valor);
      return { ok: true, lead: r.valor, pendente: false };
    }
    if (r.erro.tipo === 'rede') {
      const cabe = await this.enfileirar(uid, taskId, op);
      const lead = otimista();
      if (cabe) await this.guardarNoCache(lead);
      return cabe ? { ok: true, lead, pendente: true } : { ok: false, erro: r.erro, guardado: false };
    }
    if (r.erro.tipo === 'nao-autenticado' || r.erro.tipo === 'ip') {
      // Sessão caída: guarda o que o usuário digitou; sai sozinho quando ele entrar de novo.
      return { ok: false, erro: r.erro, guardado: await this.enfileirar(uid, taskId, op) };
    }
    return { ok: false, erro: r.erro, guardado: false };
  }

  private async daTask(ref: RefContato): Promise<number | ResultadoAcao> {
    const taskId = await this.taskDoVinculo(ref);
    return taskId ?? { ok: false, erro: erroValidacao('Este contato ainda não está ligado a um lead do CRM.'), guardado: false };
  }

  registrarContatoNoLead(ref: RefContato, texto: string): Promise<ResultadoAcao> {
    return this.exclusivo(async () => {
      const t = texto.replace(/\s+/g, ' ').trim();
      if (!t) return { ok: false, erro: erroValidacao('Escreva o que foi combinado com o cliente.'), guardado: false } as ResultadoAcao;
      if (t.length > LIMITE_TEXTO_CONTATO) return { ok: false, erro: erroValidacao(`Texto longo demais (máximo ${LIMITE_TEXTO_CONTATO} caracteres).`), guardado: false } as ResultadoAcao;
      const taskId = await this.daTask(ref);
      if (typeof taskId !== 'number') return taskId;
      return this.executar(taskId, { tipo: 'contato', linha: linhaDeContato(t, new Date(this.relogio())) });
    });
  }

  reagendar(ref: RefContato, em: number): Promise<ResultadoAcao> {
    return this.exclusivo(async () => {
      if (!Number.isFinite(em) || em <= this.relogio()) return { ok: false, erro: erroValidacao('Escolha uma data futura.'), guardado: false } as ResultadoAcao;
      const taskId = await this.daTask(ref);
      if (typeof taskId !== 'number') return taskId;
      return this.executar(taskId, { tipo: 'reagendar', em });
    });
  }

  alterarEtiquetas(ref: RefContato, mudanca: { adicionar?: string[]; remover?: string[] }): Promise<ResultadoAcao> {
    return this.exclusivo(async () => {
      const limpa = (l?: string[]) => [...new Set((l ?? []).map((t) => t.trim().slice(0, 40)).filter(Boolean))];
      const adicionar = limpa(mudanca.adicionar);
      const remover = limpa(mudanca.remover);
      if (adicionar.length + remover.length === 0) return { ok: false, erro: erroValidacao('Nenhuma etiqueta para mudar.'), guardado: false } as ResultadoAcao;
      if ([...adicionar, ...remover].some((t) => ETIQUETAS_RESERVADAS.some((r) => r.toLowerCase() === t.toLowerCase()))) {
        return { ok: false, erro: erroValidacao('As etiquetas "ativo" e "Email Confirmado" são controladas pelo CRM.'), guardado: false } as ResultadoAcao;
      }
      const taskId = await this.daTask(ref);
      if (typeof taskId !== 'number') return taskId;
      return this.executar(taskId, { tipo: 'etiquetas', adicionar, remover });
    });
  }

  marcarConvertido(ref: RefContato, valor?: number): Promise<ResultadoAcao> {
    return this.exclusivo(async () => {
      if (valor !== undefined && (!Number.isFinite(valor) || valor < 0 || valor > 999999.99)) {
        return { ok: false, erro: erroValidacao('Valor inválido (de 0 a 999.999,99).'), guardado: false } as ResultadoAcao;
      }
      const taskId = await this.daTask(ref);
      if (typeof taskId !== 'number') return taskId;
      return this.executar(taskId, { tipo: 'converter', ...(valor !== undefined ? { valor: Math.round(valor * 100) / 100 } : {}) });
    });
  }

  reagendarTask(taskId: number, em: number): Promise<{ ok: true } | { ok: false; erro: ErroCrm }> {
    return this.exclusivo(async () => {
      const r = await this.executar(taskId, { tipo: 'reagendar', em });
      if (!r.ok) return { ok: false as const, erro: r.erro };
      await this.sincronizarInterno();
      return { ok: true as const };
    });
  }

  // ── Fila ───────────────────────────────────────────────────────────────────

  private async reenviarInterno(): Promise<{ enviados: number; restantes: number }> {
    const c = await this.lerConta();
    let enviados = 0;
    if (!c.usuario) return { enviados, restantes: (await this.ler<ItemFila[]>(CHAVES_CRM.fila, [])).length };
    const uid = c.usuario.id;
    for (;;) {
      const fila = await this.ler<ItemFila[]>(CHAVES_CRM.fila, []);
      const item = fila.find((i) => i.usuarioId === uid);
      if (!item) break;
      const r = await this.chamar(() => this.aplicarRemoto(item.taskId, item.op));
      if (!r.ok && (r.erro.tipo === 'rede' || r.erro.tipo === 'nao-autenticado' || r.erro.tipo === 'ip')) break;
      // Tira só este item (outras partes podem ter acrescentado à fila enquanto isso).
      const atual = await this.ler<ItemFila[]>(CHAVES_CRM.fila, []);
      await this.arm.gravarChave(CHAVES_CRM.fila, atual.filter((i) => i.id !== item.id));
      if (r.ok) {
        enviados += 1;
        await this.guardarNoCache(r.valor);
      } else {
        const falhas = await this.ler<FalhaFila[]>(CHAVES_CRM.falhas, []);
        falhas.unshift({ em: this.relogio(), taskId: item.taskId, resumo: resumoDaOp(item.op), motivo: r.erro.mensagem });
        await this.arm.gravarChave(CHAVES_CRM.falhas, falhas.slice(0, MAX_FALHAS));
      }
    }
    const restantes = (await this.ler<ItemFila[]>(CHAVES_CRM.fila, [])).filter((i) => i.usuarioId === uid).length;
    return { enviados, restantes };
  }

  reenviarFila(): Promise<{ enviados: number; restantes: number }> {
    return this.exclusivo(() => this.reenviarInterno());
  }

  // ── Lembretes do CRM ───────────────────────────────────────────────────────

  private async sincronizarInterno(): Promise<{ ok: true; quantidade: number } | { ok: false; erro: ErroCrm }> {
    const c = await this.lerConta();
    if (!c.usuario) return { ok: true, quantidade: 0 };
    const r = await this.chamar(() => this.cliente.consultar<unknown[]>('tasks.reminders'));
    if (!r.ok) return { ok: false, erro: r.erro };
    const agora = this.relogio();
    const itens: LembreteCrm[] = (Array.isArray(r.valor) ? r.valor : []).map(lembreteDeTask).filter((l): l is LembreteCrm => l != null);
    const avisados = await this.ler<Record<string, number>>(CHAVES_CRM.avisados, {});
    const dispensados = await this.ler<Record<string, number>>(CHAVES_CRM.dispensados, {});
    for (const l of itens) {
      const id = idLembreteCrm(l.taskId, l.venceEm);
      // Já vencido há tempo, visto pela 1ª vez: aparece como vencido na central, mas sem notificação.
      if (!(id in avisados) && l.venceEm < agora - TOLERANCIA_AVISO_MS) avisados[id] = agora;
    }
    for (const mapa of [avisados, dispensados]) for (const id of Object.keys(mapa)) if (agora - mapa[id] > MANTER_AVISADOS_MS) delete mapa[id];
    await this.gravarSeDiferente(CHAVES_CRM.avisados, avisados);
    await this.gravarSeDiferente(CHAVES_CRM.dispensados, dispensados);
    // Só regrava se a lista mudou (ou passou 30 min): cada gravação acorda a central e os alarmes.
    const antes = await this.ler<{ em: number; itens: LembreteCrm[] } | null>(CHAVES_CRM.lembretes, null);
    if (!antes || agora - antes.em > 30 * 60_000 || JSON.stringify(antes.itens) !== JSON.stringify(itens)) {
      await this.arm.gravarChave(CHAVES_CRM.lembretes, { em: agora, itens });
    }
    return { ok: true, quantidade: itens.length };
  }

  sincronizarLembretes(): Promise<{ ok: true; quantidade: number } | { ok: false; erro: ErroCrm }> {
    return this.exclusivo(async () => {
      const r = await this.sincronizarInterno();
      if (r.ok) await this.reenviarInterno(); // a rede voltou: aproveita para esvaziar a fila
      return r;
    });
  }
}
