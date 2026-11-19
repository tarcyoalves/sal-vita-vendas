// CRM Lembretes falso para os testes: um `fetch` que fala o protocolo tRPC + superjson (GET ?input= e POST
// com o input no corpo), com sessão por cookie, tasks em memória e registro de todas as requisições.
// Nenhuma conta nem senha reais: o usuário e a senha abaixo existem só aqui.

import superjson from 'superjson';
import { executarTrpc, type Transporte } from '../../src/shared/crm-rede';
import type { ArmazemChaves } from '../../src/shared/leads';
// O servidor REAL decide o casamento do contato (telefone/hash do nome) e as janelas: o falso usa as mesmas funções (contrato de ponta a ponta).
import { casarContatados, casarOptOuts, chaveDoContato, normalizarRef, prepararEnvios, type LinhaEnvio, type LinhaOptOut } from '../../../../server/lib/zapContatos';

export const BASE = 'https://crm.teste.local';
export const EMAIL = 'ana@teste.local';
export const SENHA = 'senha-de-teste';

export interface TaskFalsa {
  id: number;
  title: string;
  phone: string | null;
  notes: string | null;
  tags: string[];
  reminderDate: Date | null;
  reminderEnabled: boolean;
  status: string;
  lastContactedAt: Date | null;
  contactCount: number;
  convertedAt: Date | null;
  orderValue?: string | null;
  /** O servidor só devolve para o admin na busca do vincular. */
  assignedTo?: string | null;
}

export interface Requisicao {
  url: URL;
  metodo: string;
  credentials: RequestCredentials | undefined;
  contentType: string | null;
  /** Cabeçalho Authorization enviado (null = sem). */
  authorization?: string | null;
  entrada: unknown;
}

export interface CrmFalso {
  tasks: TaskFalsa[];
  requisicoes: Requisicao[];
  logado: boolean;
  /** Derruba a rede (fetch rejeita). */
  semRede: boolean;
  /** Força um status HTTP em todas as chamadas (ex.: 429). */
  forcarStatus: number | null;
  /** O login passa, mas a sessão não é reconhecida depois (IP restrito / cookie não enviado). */
  sessaoInvisivel: boolean;
  /** Token que o servidor devolve no login e no auth.me (null = servidor que não devolve token). */
  token: string | null;
  /** Servidor da 0.7.23: converter já tira a etiqueta "Acompanhar" na mesma chamada. Falso = servidor anterior. */
  conversaoTiraAcompanhar: boolean;
  /** tasks.acompanhando não existe (servidor anterior). */
  semProcedureAcompanhando: boolean;
  /** IA do follow-up (zapIa.*): o teste define o que o servidor devolve. null = procedure inexistente (servidor anterior). */
  zapIa: { classificar: (conversas: unknown[]) => unknown; cobranca: (entrada: Record<string, unknown>) => unknown; reativacao?: (conversas: unknown[]) => unknown; interpretar?: (entrada: Record<string, unknown>) => unknown; conferir?: (entrada: Record<string, unknown>) => unknown } | null;
  /** zapCrm.* não existe (servidor anterior à 0.7.56). */
  semZapCrm: boolean;
  /** O servidor devolve a lista cortada (limite). */
  agendamentosTruncados: boolean;
  /** zapContatos.* não existe (servidor anterior à 0.7.60). */
  semZapContatos: boolean;
  /** "Não enviar mais" e contato registrado da equipe (espelho do servidor; userId 7 = o usuário do login falso). */
  equipe: { optOuts: Array<LinhaOptOut & { chave: string; nome: string | null; criadoEm: Date }>; envios: Array<LinhaEnvio & { chave: string }> };
  /** A lista de opt-outs vem cortada (limite). */
  optOutsTruncados: boolean;
  /** marcarOptOuts: a N-ésima chamada (1 = primeira, contando desde que isto foi definido) devolve erro 500; null = nunca. */
  marcarOptOutsFalhaNa: number | null;
  /** marcarOptOuts: o servidor responde ok mas NÃO guarda os itens cujo nome passa neste teste (confirmação parcial). */
  marcarOptOutsIgnorar: ((nome: string) => boolean) | null;
  /** Chamadas a marcarOptOuts desde que o contador foi zerado. */
  marcarOptOutsChamadas: number;
  fetch: typeof fetch;
  transporte: Transporte;
  chamadas(caminho: string): Requisicao[];
}

export function task(parcial: Partial<TaskFalsa> & { id: number; title: string }): TaskFalsa {
  return { phone: null, notes: null, tags: [], reminderDate: null, reminderEnabled: true, status: 'pending', lastContactedAt: null, contactCount: 0, convertedAt: null, ...parcial };
}

const resposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
const ok = (dados: unknown) => resposta(200, { result: { data: superjson.serialize(dados) } });
const erroTrpc = (status: number, code: string, message: string) => resposta(status, { error: { json: { message, code: -32001, data: { code, httpStatus: status } } } });

export function criarCrmFalso(tasks: TaskFalsa[] = [], agora: () => number = Date.now): CrmFalso {
  const crm: CrmFalso = {
    tasks,
    requisicoes: [],
    logado: false,
    semRede: false,
    forcarStatus: null,
    sessaoInvisivel: false,
    token: null,
    conversaoTiraAcompanhar: true,
    semProcedureAcompanhando: false,
    zapIa: null,
    semZapCrm: false,
    agendamentosTruncados: false,
    semZapContatos: false,
    equipe: { optOuts: [], envios: [] },
    optOutsTruncados: false,
    marcarOptOutsFalhaNa: null,
    marcarOptOutsIgnorar: null,
    marcarOptOutsChamadas: 0,
    fetch: undefined as unknown as typeof fetch,
    transporte: undefined as unknown as Transporte,
    chamadas: (c) => crm.requisicoes.filter((r) => r.url.pathname === `/api/trpc/${c}`),
  };

  crm.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    if (crm.semRede) throw new TypeError('Failed to fetch');
    const url = new URL(String(entrada));
    const metodo = init?.method ?? 'GET';
    const caminho = url.pathname.replace('/api/trpc/', '');
    const bruto = metodo === 'GET' ? url.searchParams.get('input') : (init?.body as string | undefined);
    const entradaSer = bruto ? JSON.parse(bruto) : undefined;
    const dados = entradaSer && entradaSer.json !== null ? superjson.deserialize<Record<string, unknown>>(entradaSer) : undefined;
    const headers = new Headers(init?.headers);
    crm.requisicoes.push({ url, metodo, credentials: init?.credentials, contentType: headers.get('Content-Type'), authorization: headers.get('Authorization'), entrada: dados });
    if (crm.forcarStatus) return resposta(crm.forcarStatus, { error: 'Muitas tentativas. Tente novamente em 15 minutos.' });

    if (caminho === 'auth.login') {
      if (dados?.email !== EMAIL || dados?.password !== SENHA) return erroTrpc(401, 'UNAUTHORIZED', 'Email ou senha inválidos');
      crm.logado = true;
      return ok({ id: 7, name: 'Ana', email: EMAIL, role: 'user', ...(crm.token ? { token: crm.token } : {}) });
    }
    if (caminho === 'auth.logout') {
      crm.logado = false;
      return ok({ success: true });
    }
    if (caminho === 'auth.me') return ok(crm.logado && !crm.sessaoInvisivel ? { id: 7, name: 'Ana', email: EMAIL, role: 'user', mustChangePassword: false, ...(crm.token ? { token: crm.token } : {}) } : null);
    if (!crm.logado || crm.sessaoInvisivel) return erroTrpc(401, 'UNAUTHORIZED', 'UNAUTHORIZED');

    if (caminho === 'tasks.findForWhatsapp') {
      const d = dados as { phone?: string; q?: string };
      const digitos = (d.phone ?? '').replace(/\D/g, '').replace(/^55/, '');
      const achadas = crm.tasks.filter((t) => {
        if (digitos && (t.phone ?? '').replace(/\D/g, '').replace(/^55/, '') === digitos) return true;
        if (!d.q) return false;
        const qFolded = d.q.toLowerCase().trim();
        const tFolded = (t.title + ' ' + (t.notes ?? '')).toLowerCase();
        if (tFolded.includes(qFolded)) return true;
        const qTerms = qFolded.split(/\s+/).filter((w) => w.length >= 2);
        if (qTerms.some((term) => tFolded.includes(term))) return true;
        const qDigits = d.q.replace(/\D/g, '');
        if (qDigits.length >= 4 && (t.phone ?? '').replace(/\D/g, '').includes(qDigits)) return true;
        return false;
      });
      return ok(achadas.slice(0, 20).map((t) => ({ ...t, notes: (t.notes ?? '').slice(-500) })));
    }
    if (caminho === 'tasks.getById') {
      const t = crm.tasks.find((x) => x.id === (dados as { id: number }).id);
      return t ? ok(t) : erroTrpc(404, 'NOT_FOUND', 'NOT_FOUND');
    }
    if (caminho === 'tasks.update') {
      const { id, ...resto } = dados as { id: number } & Partial<TaskFalsa>;
      const t = crm.tasks.find((x) => x.id === id);
      if (!t) return erroTrpc(403, 'FORBIDDEN', 'Tarefa não encontrada ou sem permissão');
      if (typeof resto.notes === 'string' && resto.notes.length > 5000) return erroTrpc(400, 'BAD_REQUEST', 'notes muito longo');
      if (typeof resto.notes === 'string' && resto.notes.replace(/\s+/g, ' ').trim().length > 15 && resto.notes !== t.notes) {
        t.lastContactedAt = new Date(agora());
        t.contactCount += 1;
      }
      Object.assign(t, resto);
      return ok({ ...t, burstWarning: false, burstCount: 0 });
    }
    if (caminho === 'tasks.toggleConverted') {
      const d = dados as { id: number; converted: boolean; orderValue?: number };
      const t = crm.tasks.find((x) => x.id === d.id);
      if (!t) return erroTrpc(403, 'FORBIDDEN', 'Tarefa não encontrada ou sem permissão');
      t.convertedAt ??= new Date(agora());
      if (!t.tags.includes('ativo')) t.tags = [...t.tags, 'ativo'];
      if (crm.conversaoTiraAcompanhar) t.tags = t.tags.filter((x) => x !== 'Acompanhar');
      if (d.orderValue !== undefined) t.orderValue = d.orderValue.toFixed(2);
      return ok(t);
    }
    if (caminho === 'tasks.create') {
      const d = dados as { title: string; phone?: string; reminderDate: Date };
      const nova = task({ id: 1000 + crm.tasks.length, title: d.title, phone: d.phone?.replace(/^55/, '') ?? null, reminderDate: d.reminderDate });
      crm.tasks.push(nova);
      return ok(nova);
    }
    if (caminho === 'tasks.acompanhando' && !crm.semProcedureAcompanhando) {
      return ok(crm.tasks.filter((t) => t.tags.includes('Acompanhar') && t.status === 'pending' && !t.convertedAt).map((t) => ({ ...t, notes: (t.notes ?? '').slice(-500) })));
    }
    if (caminho === 'tasks.reminders') {
      return ok(crm.tasks.filter((t) => t.reminderDate && t.reminderEnabled && t.status === 'pending').map((t) => ({ id: t.id, title: t.title, reminderDate: t.reminderDate, reminderEnabled: t.reminderEnabled, status: t.status, notes: null, assignedTo: null, phone: t.phone })));
    }
    if (caminho === 'zapIa.classificarConversas' && crm.zapIa) return ok(crm.zapIa.classificar((dados as { conversas: unknown[] }).conversas));
    if (caminho === 'zapIa.gerarCobranca' && crm.zapIa) return ok(crm.zapIa.cobranca(dados as Record<string, unknown>));
    if (caminho === 'zapIa.interpretarPedido' && crm.zapIa?.interpretar) return ok(crm.zapIa.interpretar(dados as Record<string, unknown>));
    if (caminho === 'zapIa.conferirPedido' && crm.zapIa?.conferir) return ok(crm.zapIa.conferir(dados as Record<string, unknown>));
    if (caminho === 'zapIa.avaliarReativacao' && crm.zapIa?.reativacao) return ok(crm.zapIa.reativacao((dados as { conversas: unknown[] }).conversas));
    if (caminho === 'zapCrm.agendamentosFuturos' && !crm.semZapCrm) {
      // Igual ao servidor: pendente, lembrete ligado (nulo conta como ligado) e data FUTURA, sem teto de antecedência.
      const futuros = crm.tasks.filter((t) => t.reminderDate && t.reminderDate.getTime() > agora() && t.reminderEnabled !== false && t.status === 'pending');
      return ok({ itens: futuros.map((t) => ({ taskId: t.id, titulo: t.title, telefone: t.phone, venceEm: t.reminderDate })), truncado: crm.agendamentosTruncados, consultadoEm: new Date(agora()) });
    }
    if (caminho === 'zapCrm.registrarReativacao' && !crm.semZapCrm) {
      // Espelho do servidor: acha por id ou telefone, anexa a nota SEM contar contato e só agenda se não houver agendamento futuro.
      const d = dados as { taskId?: number; telefone?: string; titulo: string; linha: string; agendarEm?: Date | null; criar: boolean };
      const digitos = (d.telefone ?? '').replace(/\D/g, '').replace(/^55/, '');
      let t = crm.tasks.find((x) => x.id === d.taskId) ?? (digitos ? crm.tasks.find((x) => (x.phone ?? '').replace(/\D/g, '').replace(/^55/, '') === digitos) : undefined);
      const linha = `[carimbo] ${d.linha}`;
      let criou = false;
      if (!t) {
        if (!d.criar) return ok({ ok: false, codigo: 'sem_lead', mensagem: 'Este contato não tem lead no CRM.' });
        if (!digitos) return ok({ ok: false, codigo: 'sem_telefone', mensagem: 'Sem telefone válido para criar o lead no CRM.' });
        t = task({ id: 2000 + crm.tasks.length, title: d.titulo, phone: digitos, reminderDate: d.agendarEm ?? null, reminderEnabled: d.agendarEm != null });
        crm.tasks.push(t);
        criou = true;
      }
      t.notes = t.notes ? `${t.notes}\n${linha}` : linha;
      const futuro = t.reminderDate && t.reminderDate.getTime() > agora() && t.reminderEnabled !== false && t.status === 'pending' ? t.reminderDate : null;
      let agendou = criou && d.agendarEm != null;
      let semAgenda: string | undefined;
      if (d.agendarEm && !criou) {
        if (futuro) semAgenda = 'agendamento_existente';
        else if (t.status !== 'pending') semAgenda = 'tarefa_encerrada';
        else {
          t.reminderDate = d.agendarEm;
          t.reminderEnabled = true;
          agendou = true;
        }
      }
      return ok({ ok: true, taskId: t.id, criou, agendou, ...(semAgenda ? { semAgenda } : {}), ...(semAgenda && futuro ? { agendamentoExistente: futuro } : {}) });
    }
    if (caminho === 'zapCrm.desfazerAgendamento' && !crm.semZapCrm) {
      // Espelho do servidor: só remove o lembrete se ele ainda for EXATAMENTE o instante que a IA gravou e a tarefa seguir pendente.
      const d = dados as { taskId: number; agendadoEm: Date };
      const t = crm.tasks.find((x) => x.id === d.taskId);
      if (!t) return ok({ ok: false, codigo: 'sem_tarefa', mensagem: 'A tarefa não existe mais no CRM (ou não é sua). Nada foi alterado.' });
      if (t.status === 'pending' && t.reminderDate && t.reminderDate.getTime() === new Date(d.agendadoEm).getTime()) {
        t.reminderDate = null;
        t.reminderEnabled = false;
        return ok({ ok: true, taskId: t.id });
      }
      return ok({ ok: false, codigo: 'mudou', mensagem: 'O agendamento já foi alterado ou concluído depois que a IA o criou. Não mexi em nada.' });
    }
    if (caminho.startsWith('zapContatos.') && !crm.semZapContatos) {
      const UID = 7;
      const d = (dados ?? {}) as Record<string, unknown>;
      if (caminho === 'zapContatos.listarOptOuts') return ok({ itens: crm.equipe.optOuts, truncado: crm.optOutsTruncados, consultadoEm: new Date(agora()) });
      if (caminho === 'zapContatos.marcarOptOuts') {
        crm.marcarOptOutsChamadas += 1;
        if (crm.marcarOptOutsFalhaNa === crm.marcarOptOutsChamadas) return erroTrpc(500, 'INTERNAL_SERVER_ERROR', 'falha ao gravar');
        let criados = 0;
        for (const it of d.itens as Array<{ telefone?: string; nomeHash: string; nome?: string; origem: string; marcadoEm?: Date }>) {
          if (crm.marcarOptOutsIgnorar?.(it.nome ?? '')) continue;
          const ref = normalizarRef(it);
          const chave = chaveDoContato(ref.telefone, ref.nomeHash);
          if (crm.equipe.optOuts.some((o) => o.chave === chave)) continue;
          crm.equipe.optOuts.push({ chave, telefone: ref.telefone, nomeHash: ref.nomeHash, nome: it.nome ?? null, userId: UID, origem: it.origem, criadoEm: it.marcadoEm ?? new Date(agora()) });
          criados += 1;
        }
        return ok({ recebidos: (d.itens as unknown[]).length, criados });
      }
      if (caminho === 'zapContatos.desmarcarOptOuts') {
        const refs = (d.itens as Array<{ telefone?: string; nomeHash: string }>).map(normalizarRef);
        const antes = crm.equipe.optOuts.length;
        crm.equipe.optOuts = crm.equipe.optOuts.filter((o) => !refs.some((r) => (r.telefone && o.telefone ? r.telefone === o.telefone : r.nomeHash === o.nomeHash)));
        return ok({ removidos: antes - crm.equipe.optOuts.length });
      }
      if (caminho === 'zapContatos.registrarEnvios') {
        const linhas = prepararEnvios(d.itens as Parameters<typeof prepararEnvios>[0], new Date(agora()));
        for (const l of linhas) {
          const atual = crm.equipe.envios.find((e) => e.chave === l.chave && e.tipo === l.tipo);
          if (!atual) crm.equipe.envios.push({ chave: l.chave, telefone: l.telefone, nomeHash: l.nomeHash, tipo: l.tipo, enviadoEm: l.enviadoEm, userId: UID });
          else if (l.enviadoEm > atual.enviadoEm) Object.assign(atual, { enviadoEm: l.enviadoEm, userId: UID });
        }
        return ok({ recebidos: (d.itens as unknown[]).length, gravados: linhas.length });
      }
      if (caminho === 'zapContatos.consultarContatados') {
        const refs = (d.contatos as Array<{ telefone?: string; nomeHash: string }>).map(normalizarRef);
        const desde = agora() - (d.dias as number) * 86_400_000;
        const itens = casarContatados(refs, crm.equipe.envios.filter((e) => e.enviadoEm.getTime() >= desde), UID);
        return ok({ itens, truncado: false, consultadoEm: new Date(agora()), dias: d.dias, ...(d.incluirOptOut ? { optOuts: casarOptOuts(refs, crm.equipe.optOuts, UID) } : {}) });
      }
    }
    if (caminho === 'tags.list') {
      return ok([
        { id: 1, name: 'Cliente Ativo', color: '#16a34a' },
        { id: 2, name: 'Acompanhar', color: '#0284c7' },
        { id: 3, name: 'Quente', color: '#ef4444' },
        { id: 4, name: 'Reativar', color: '#ea580c' },
      ]);
    }
    return erroTrpc(404, 'NOT_FOUND', `procedure ${caminho} desconhecida`);
  }) as typeof fetch;

  crm.transporte = (p) => executarTrpc(crm.fetch, p);
  return crm;
}

/** Armazenamento em memória no lugar do RepositorioLocal (para testar o ServicoCrm sozinho). */
export function criarArmazemMemoria(): ArmazemChaves & { dados: Map<string, unknown>; gravacoes: string[] } {
  const dados = new Map<string, unknown>();
  const gravacoes: string[] = [];
  const copia = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
  return {
    dados,
    gravacoes,
    async lerChave<T>(chave: string) {
      return copia(dados.get(chave)) as T | undefined;
    },
    async gravarChave(chave, valor) {
      gravacoes.push(chave);
      dados.set(chave, copia(valor));
    },
    async limparChaves(prefixo, manter) {
      for (const k of [...dados.keys()]) if (k.startsWith(prefixo) && !manter.includes(k)) dados.delete(k);
    },
  };
}
