// @vitest-environment jsdom
//
// Botão "E-mail" da faixa do lead: e-mail do lead (sugestão da conversa, salvar = confirmar), enviar a
// apresentação por e-mail, colocar numa sequência, status e CONSUMO (nada de rede sem o usuário abrir/clicar).
// CRM falso com os procedimentos de e-mail embrulhado aqui (o crm-falso.ts compartilhado não muda).
// Nenhuma mensagem de WhatsApp é enviada em nenhum caminho.

import superjson from 'superjson';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { iniciarCrm, type ControladorCrm } from '../src/content/crm';
import { limparCacheEmail } from '../src/content/crm/painel-email';
import { limparAvisos } from '../src/content/crm/ui';
import { executarTrpc } from '../src/shared/crm-rede';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { criarRepositorioCRM } from '../src/shared/repositorio-crm';
import { ServicoCrm } from '../src/shared/servico-crm';
import { instalarChromeFalso } from './ajuda/chrome-falso';
import { BASE, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';
import { montarWhatsApp, type LinhaFalsa } from './ajuda/whatsapp-falso';

let agora = new Date('2026-10-21T15:00:00Z');
const LINHAS: LinhaFalsa[] = [{ nome: 'Ana Souza Cliente', data: '11:40', previa: 'Quanto fica?' }];

interface Estado {
  email: string | null;
  confirmado: boolean;
  modelos: unknown[];
  sequencias: unknown[];
  inscricoes: { sequences: unknown[]; campaigns: unknown[] };
  /** Resposta forçada por procedimento: [status, code, mensagem]. */
  erros: Record<string, [number, string, string]>;
  processBatch: Record<string, unknown>;
  enroll: Record<string, unknown>;
}

let ctrl: ControladorCrm | null = null;
let crm: CrmFalso;
let servico: ServicoCrm;
let repo: ReturnType<typeof criarRepositorioCRM>;
let est: Estado;
const chamadasEmail: Array<{ caminho: string; entrada: Record<string, unknown> | undefined }> = [];

const faixa = (): ShadowRoot | null => document.getElementById('vita-zap-lead')?.shadowRoot ?? null;
const textoFaixa = (): string => faixa()?.textContent ?? '';
const overlay = (): ShadowRoot => document.getElementById('vita-zap-overlay')!.shadowRoot!;
const botao = (raiz: ParentNode, texto: string): HTMLButtonElement => {
  const todos = [...raiz.querySelectorAll<HTMLButtonElement>('button')];
  // texto exato primeiro ("Mandar" não pode pegar "Enviar apresentação agora ▾")
  const b = todos.find((x) => x.textContent?.trim() === texto) ?? todos.find((x) => x.textContent?.trim().startsWith(texto));
  if (!b) throw new Error(`botão "${texto}" não encontrado`);
  return b;
};
const campoEmail = (): HTMLInputElement => overlay().querySelector<HTMLInputElement>('input[type="email"]')!;
const digitar = (el: HTMLInputElement, v: string): void => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const chamou = (caminho: string) => chamadasEmail.filter((c) => c.caminho === caminho);

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Embrulha o fetch do CRM falso com os procedimentos de e-mail. */
function instalarEmailNoCrm(): void {
  const original = crm.fetch;
  const ok = (d: unknown) => resposta(200, { result: { data: superjson.serialize(d) } });
  crm.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const caminho = url.pathname.replace('/api/trpc/', '');
    const proprios = ['tasks.getById', 'tasks.setEmailFromWhatsapp', 'emailMarketing.'];
    if (!crm.logado || !proprios.some((p) => caminho.startsWith(p))) return original(entrada, init);
    const metodo = init?.method ?? 'GET';
    const bruto = metodo === 'GET' ? url.searchParams.get('input') : (init?.body as string | undefined);
    const ser = bruto ? JSON.parse(bruto) : undefined;
    const dados = ser && ser.json !== null ? superjson.deserialize<Record<string, unknown>>(ser) : undefined;
    crm.requisicoes.push({ url, metodo, credentials: init?.credentials, contentType: null, entrada: dados });
    chamadasEmail.push({ caminho, entrada: dados });
    const erro = est.erros[caminho];
    if (erro) return resposta(erro[0], { error: { json: { message: erro[2], code: -32001, data: { code: erro[1], httpStatus: erro[0] } } } });

    if (caminho === 'tasks.getById') {
      const t = crm.tasks.find((x) => x.id === (dados as { id: number }).id)!;
      return ok({ ...t, email: est.email, emailConfirmed: est.confirmado });
    }
    if (caminho === 'tasks.setEmailFromWhatsapp') {
      const d = dados as { taskId: number; email: string };
      const t = crm.tasks.find((x) => x.id === d.taskId)!;
      est.email = d.email;
      est.confirmado = true;
      t.notes = `${t.notes ?? ''}\nE-mail informado pelo atendente via WhatsApp em 21/10/2026`.trim();
      if (!t.tags.includes('Email Confirmado')) t.tags = [...t.tags, 'Email Confirmado'];
      return ok({ ...t, email: d.email, emailConfirmed: true });
    }
    if (caminho === 'emailMarketing.listTemplatesForAttendant') return ok(est.modelos);
    if (caminho === 'emailMarketing.listSequencesForAttendant') return ok(est.sequencias);
    if (caminho === 'emailMarketing.enrollmentsByTaskIds') return ok({ 1: est.inscricoes });
    if (caminho === 'emailMarketing.attendantBroadcast') return ok({ campaignId: 77, recipientCount: 1 });
    if (caminho === 'emailMarketing.processBatch') return ok(est.processBatch);
    if (caminho === 'emailMarketing.enrollTasksInSequence') return ok(est.enroll);
    return resposta(404, { error: { json: { message: 'x', code: -32004, data: { code: 'NOT_FOUND', httpStatus: 404 } } } });
  }) as typeof fetch;
  crm.transporte = (p) => executarTrpc(crm.fetch, p);
}

async function iniciar(): Promise<void> {
  await servico.definirUrl(BASE);
  expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
  ctrl = await iniciarCrm({ agora: () => agora, periodicoMs: 0, repositorio: repo });
  await vi.waitFor(() => expect(textoFaixa()).toContain('Lead: Padaria da Ana'));
}

async function abrir(): Promise<void> {
  botao(faixa()!, 'E-mail').click();
  await vi.waitFor(() => expect(campoEmail().disabled).toBe(false));
}

beforeEach(() => {
  agora = new Date('2026-10-21T15:00:00Z');
  limparAvisos();
  limparCacheEmail();
  instalarChromeFalso();
  chamadasEmail.length = 0;
  est = {
    email: null,
    confirmado: false,
    modelos: [
      { id: 3, name: 'Apresentação Sal Vita', slug: 'apresentacao', subject: '{nome}, conheça o Sal Vita', htmlBody: '<p>Olá, {nome}!</p>', attachments: [{ filename: 'tabela.pdf', content: 'QUJD' }] },
      { id: 4, name: 'Tabela de preços', slug: 'tabela', subject: 'Tabela 2026', htmlBody: '<p>Preços</p>', attachments: null },
    ],
    sequencias: [{ id: 9, name: 'Pós-venda', active: true }, { id: 10, name: 'Reativação', active: true }],
    inscricoes: { sequences: [], campaigns: [] },
    erros: {},
    processBatch: { done: true, sentNow: 1, failedNow: 0, remaining: 0 },
    enroll: { enrolled: 1, skippedNoEmail: 0, skippedUnconfirmed: 0, skippedDuplicateOrSuppressed: 0, skipReasons: [] },
  };
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', notes: 'Pediu tabela.', tags: ['quente'], reminderDate: new Date('2026-10-22T12:00:00Z') })], () => agora.getTime());
  instalarEmailNoCrm();
  const local = new RepositorioLocal();
  servico = new ServicoCrm(local, crm.transporte);
  repo = criarRepositorioCRM(local, servico);
  montarWhatsApp(LINHAS, 'Ana Souza Cliente');
});

afterEach(() => {
  ctrl?.parar();
  ctrl = null;
});

describe('botão E-mail: abrir (consumo)', () => {
  it('a faixa tem o botão, mas sem clicar nenhuma chamada de e-mail é feita', async () => {
    await iniciar();
    expect([...faixa()!.querySelectorAll('button')].some((b) => b.textContent === 'E-mail')).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(chamadasEmail).toHaveLength(0);
  });

  it('abrir faz só 2 leituras (e-mail do lead e inscrições); modelos e sequências não são buscados', async () => {
    await iniciar();
    await abrir();
    await vi.waitFor(() => expect(chamou('emailMarketing.enrollmentsByTaskIds')).toHaveLength(1));
    expect(chamadasEmail.map((c) => c.caminho).sort()).toEqual(['emailMarketing.enrollmentsByTaskIds', 'tasks.getById']);
    expect(chamou('emailMarketing.enrollmentsByTaskIds')[0].entrada).toEqual({ taskIds: [1] });
  });

  it('mostra em quais sequências o lead já está', async () => {
    est.inscricoes = { sequences: [{ enrollmentId: 5, sequenceId: 9, name: 'Pós-venda', status: 'active', currentStep: 2 }], campaigns: [{ recipientId: 1, campaignId: 4, name: 'Campanha Outubro', status: 'sent' }] };
    await iniciar();
    await abrir();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Sequência "Pós-venda" (ativa, passo 2)'));
    expect(overlay().textContent).toContain('Campanha "Campanha Outubro" (enviada)');
  });

  it('lead sem inscrição: avisa', async () => {
    await iniciar();
    await abrir();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Não está em nenhuma sequência'));
  });
});

describe('botão E-mail: e-mail do lead', () => {
  it('preenche com o e-mail do CRM, que não é sugestão', async () => {
    est.email = 'ana@padaria.com.br';
    est.confirmado = true;
    await iniciar();
    await abrir();
    expect(campoEmail().value).toBe('ana@padaria.com.br');
    expect(overlay().textContent).toContain('E-mail confirmado');
    expect(botao(overlay(), 'Salvar e-mail').disabled).toBe(true);
  });

  it('sem e-mail: sugere o da última mensagem visível da conversa (o usuário edita)', async () => {
    document.getElementById('main')!.insertAdjacentHTML('beforeend',
      '<div data-id="false_5584999990000@c.us_M1"><span class="selectable-text">manda no antigo@x.com</span></div>' +
      '<div data-id="false_5584999990000@c.us_M2"><span class="selectable-text">Meu email: Ana.Souza@Padaria.com.br, obrigada</span></div>');
    await iniciar();
    await abrir();
    expect(campoEmail().value).toBe('ana.souza@padaria.com.br');
    expect(overlay().textContent).toContain('Sugestão');
    expect(chamou('tasks.setEmailFromWhatsapp')).toHaveLength(0); // sugerir não grava
  });

  it('sem mensagens com e-mail: sugere o das notas e, por fim, o do título', async () => {
    crm.tasks[0].notes = 'Falar com Ana\ncontato: vendas@padaria.com.br';
    await iniciar();
    await abrir();
    expect(campoEmail().value).toBe('vendas@padaria.com.br');
  });

  it('nada para sugerir: campo vazio e instrução', async () => {
    await iniciar();
    await abrir();
    expect(campoEmail().value).toBe('');
    expect(overlay().textContent).toContain('não tem e-mail');
  });

  it('Salvar e-mail: tasks.setEmailFromWhatsapp com o e-mail editado; confirma e a nota entra na faixa', async () => {
    await iniciar();
    await abrir();
    digitar(campoEmail(), '  Dono@Padaria.com.br ');
    botao(overlay(), 'Salvar e-mail').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('E-mail salvo e confirmado'));
    expect(chamou('tasks.setEmailFromWhatsapp')[0].entrada).toEqual({ taskId: 1, email: 'dono@padaria.com.br' });
    expect(crm.tasks[0].tags).toContain('Email Confirmado');
    await vi.waitFor(() => expect(textoFaixa()).toContain('E-mail informado pelo atendente via WhatsApp em 21/10/2026'));
  });

  it('e-mail inválido: não chama o CRM', async () => {
    await iniciar();
    await abrir();
    digitar(campoEmail(), 'sem-arroba');
    expect(botao(overlay(), 'Salvar e-mail').disabled).toBe(true);
    botao(overlay(), 'Salvar e-mail').click();
    expect(chamou('tasks.setEmailFromWhatsapp')).toHaveLength(0);
  });

  it('erro do CRM ao salvar aparece e o texto digitado fica', async () => {
    est.erros['tasks.setEmailFromWhatsapp'] = [400, 'BAD_REQUEST', 'Este domínio de e-mail não é aceito.'];
    await iniciar();
    await abrir();
    digitar(campoEmail(), 'x@salina.com.br');
    botao(overlay(), 'Salvar e-mail').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Este domínio de e-mail não é aceito.'));
    expect(campoEmail().value).toBe('x@salina.com.br');
  });
});

describe('botão E-mail: enviar apresentação', () => {
  async function abrirEnvio(): Promise<void> {
    est.email = 'ana@padaria.com.br';
    est.confirmado = true;
    await iniciar();
    await abrir();
    botao(overlay(), 'Mandar apresentação agora').click();
    await vi.waitFor(() => expect(overlay().querySelectorAll('select[aria-label="Modelo de e-mail"] option')).toHaveLength(2));
  }

  it('lista os modelos, mostra a prévia do assunto com o primeiro nome e só envia depois de confirmar', async () => {
    await abrirEnvio();
    expect(overlay().textContent).toContain('Assunto: Padaria, conheça o Sal Vita');
    botao(overlay(), 'Mandar').click(); // 1º clique: pede confirmação
    expect(chamou('emailMarketing.attendantBroadcast')).toHaveLength(0);
    expect(overlay().textContent).toContain('Confirmar envio para ana@padaria.com.br');
    botao(overlay(), 'Confirmar envio').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Enviado para ana@padaria.com.br'));
    expect(chamou('emailMarketing.attendantBroadcast')).toHaveLength(1);
    expect(chamou('emailMarketing.attendantBroadcast')[0].entrada).toEqual({
      subject: '{nome}, conheça o Sal Vita',
      htmlBody: '<p>Olá, {nome}!</p>',
      recipients: [{ email: 'ana@padaria.com.br', name: 'Padaria' }],
      attachments: [{ filename: 'tabela.pdf', content: 'QUJD' }],
    });
    expect(chamou('emailMarketing.processBatch')[0].entrada).toEqual({ campaignId: 77 });
    // não reenvia por engano: o botão fica travado até trocar de modelo
    expect(botao(overlay(), 'Mandar').disabled).toBe(true);
  });

  it('sem permissão de e-mail marketing: o erro do servidor aparece e nada é processado', async () => {
    est.erros['emailMarketing.attendantBroadcast'] = [403, 'FORBIDDEN', 'Você não tem permissão para Email Marketing'];
    await abrirEnvio();
    botao(overlay(), 'Mandar').click();
    botao(overlay(), 'Confirmar envio').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Você não tem permissão para Email Marketing'));
    expect(chamou('emailMarketing.processBatch')).toHaveLength(0);
  });

  it('e-mail descadastrado/recusado pelo servidor: avisa que nada saiu', async () => {
    est.erros['emailMarketing.attendantBroadcast'] = [400, 'BAD_REQUEST', 'Nenhum destinatário válido. Só é possível enviar para e-mails confirmados das suas próprias tarefas.'];
    await abrirEnvio();
    botao(overlay(), 'Mandar').click();
    botao(overlay(), 'Confirmar envio').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Nenhum destinatário válido'));
  });

  it('limite diário das contas: não diz que enviou', async () => {
    est.processBatch = { done: false, sentNow: 0, failedNow: 0, remaining: 1, reason: 'daily_limit_all' };
    await abrirEnvio();
    botao(overlay(), 'Mandar').click();
    botao(overlay(), 'Confirmar envio').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('limite diário'));
    expect(overlay().textContent).not.toContain('Enviado para');
  });

  it('falha do provedor: avisa', async () => {
    est.processBatch = { done: true, sentNow: 0, failedNow: 1, remaining: 0 };
    await abrirEnvio();
    botao(overlay(), 'Mandar').click();
    botao(overlay(), 'Confirmar envio').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('recusou o envio'));
  });

  it('e-mail ainda não confirmado: o envio fica bloqueado e nada é chamado', async () => {
    est.email = 'ana@padaria.com.br';
    est.confirmado = false;
    await iniciar();
    await abrir();
    botao(overlay(), 'Mandar apresentação agora').click();
    await vi.waitFor(() => expect(overlay().querySelectorAll('select[aria-label="Modelo de e-mail"] option')).toHaveLength(2));
    expect(botao(overlay(), 'Mandar').disabled).toBe(true);
    expect(overlay().textContent).toContain('Salve o e-mail acima');
  });

  it('editar o campo depois de salvo bloqueia o envio (não manda para um endereço não salvo)', async () => {
    await abrirEnvio();
    expect(botao(overlay(), 'Mandar').disabled).toBe(false);
    digitar(campoEmail(), 'outro@padaria.com.br');
    expect(botao(overlay(), 'Mandar').disabled).toBe(true);
  });

  it('sem modelos (ou sem permissão): mensagem clara', async () => {
    est.modelos = [];
    est.email = 'ana@padaria.com.br';
    est.confirmado = true;
    await iniciar();
    await abrir();
    botao(overlay(), 'Mandar apresentação agora').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Nenhum modelo disponível'));
  });

  it('modelos ficam 15 min em memória: reabrir não busca de novo; depois de 15 min busca', async () => {
    await abrirEnvio();
    expect(chamou('emailMarketing.listTemplatesForAttendant')).toHaveLength(1);
    botao(overlay(), 'Mandar apresentação agora').click(); // recolhe
    document.querySelector<HTMLElement>('body')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // clique fora fecha
    await abrir();
    botao(overlay(), 'Mandar apresentação agora').click();
    await vi.waitFor(() => expect(overlay().querySelectorAll('select[aria-label="Modelo de e-mail"] option')).toHaveLength(2));
    expect(chamou('emailMarketing.listTemplatesForAttendant')).toHaveLength(1);

    agora = new Date(agora.getTime() + 16 * 60_000);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await abrir();
    botao(overlay(), 'Mandar apresentação agora').click();
    await vi.waitFor(() => expect(chamou('emailMarketing.listTemplatesForAttendant')).toHaveLength(2));
  });
});

describe('botão E-mail: colocar numa sequência', () => {
  async function abrirSequencia(): Promise<void> {
    est.email = 'ana@padaria.com.br';
    est.confirmado = true;
    await iniciar();
    await abrir();
    botao(overlay(), 'Colocar numa sequência').click();
    await vi.waitFor(() => expect(overlay().querySelectorAll('select[aria-label="Sequência"] option')).toHaveLength(2));
  }

  it('Inscrever chama enrollTasksInSequence com o lead e mostra o resultado', async () => {
    await abrirSequencia();
    const sel = overlay().querySelector<HTMLSelectElement>('select[aria-label="Sequência"]')!;
    sel.value = '10';
    sel.dispatchEvent(new Event('change'));
    botao(overlay(), 'Inscrever').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Inscrito na sequência "Reativação"'));
    expect(chamou('emailMarketing.enrollTasksInSequence')[0].entrada).toEqual({ sequenceId: 10, taskIds: [1] });
  });

  it('não inscrito: mostra os motivos (skipReasons)', async () => {
    est.enroll = { enrolled: 0, skippedNoEmail: 0, skippedUnconfirmed: 0, skippedDuplicateOrSuppressed: 1, skipReasons: ['ana@padaria.com.br: já inscrito'] };
    await abrirSequencia();
    botao(overlay(), 'Inscrever').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Não inscrito: ana@padaria.com.br: já inscrito'));
  });

  it('erro do servidor aparece', async () => {
    est.erros['emailMarketing.enrollTasksInSequence'] = [403, 'FORBIDDEN', 'Você não tem permissão para Email Marketing'];
    await abrirSequencia();
    botao(overlay(), 'Inscrever').click();
    await vi.waitFor(() => expect(overlay().textContent).toContain('Você não tem permissão para Email Marketing'));
  });
});
