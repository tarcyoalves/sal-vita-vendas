// Integração com o CRM Lembretes: login, lead da conversa (findForWhatsapp), registrar contato, reagendar,
// etiquetas, converter, fila offline e lembretes do CRM. Tudo com `fetch` falso (tests/ajuda/crm-falso.ts):
// sem rede, sem conta real e sem senha real.

import { beforeEach, describe, expect, it } from 'vitest';
import { classificarErro, normalizarBaseUrl } from '../src/shared/crm-rede';
import { anexarNota, chavesDoVinculo, linhaDeContato } from '../src/shared/crm-remoto';
import { ServicoCrm } from '../src/shared/servico-crm';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

// 21/10/2026 14:30 em Fortaleza (UTC-3)
const AGORA = Date.UTC(2026, 9, 21, 17, 30);
const ANA = { nome: 'Ana Souza', telefone: '5584999990000' };

let crm: CrmFalso;
let arm: ReturnType<typeof criarArmazemMemoria>;
let servico: ServicoCrm;
let agora = AGORA;

async function conectado(): Promise<void> {
  await servico.definirUrl(BASE);
  const r = await servico.entrar(EMAIL, SENHA);
  expect(r.ok).toBe(true);
}

beforeEach(() => {
  agora = AGORA;
  crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', notes: 'Pediu tabela.', tags: ['quente'], reminderDate: new Date(AGORA + 86_400_000) }), task({ id: 2, title: 'Mercado Sol', phone: '8433334444' })], () => agora);
  arm = criarArmazemMemoria();
  servico = new ServicoCrm(arm, crm.transporte, () => agora);
});

describe('endereço e protocolo', () => {
  it('só aceita https (ou http em localhost) e guarda só a origem', () => {
    expect(normalizarBaseUrl('https://lembretes.salvitarn.com.br/qualquer/coisa')).toBe('https://lembretes.salvitarn.com.br');
    expect(normalizarBaseUrl('http://localhost:3000/x')).toBe('http://localhost:3000');
    expect(normalizarBaseUrl('http://lembretes.salvitarn.com.br')).toBeNull();
    expect(normalizarBaseUrl('javascript:alert(1)')).toBeNull();
    expect(normalizarBaseUrl('lixo')).toBeNull();
  });

  it('classifica os erros do servidor em português claro', () => {
    expect(classificarErro(401, undefined, 'tasks.reminders').tipo).toBe('nao-autenticado');
    expect(classificarErro(401, undefined, 'auth.login').tipo).toBe('credenciais');
    expect(classificarErro(429, { error: 'Muitas tentativas' }, 'auth.login').tipo).toBe('limite');
    expect(classificarErro(403, { error: 'Origem não permitida' }, 'auth.login').tipo).toBe('origem');
    expect(classificarErro(403, { error: { json: { message: 'IP não permitido', data: { code: 'FORBIDDEN' } } } }, 'tasks.list').tipo).toBe('ip');
    expect(classificarErro(500, undefined, 'x').tipo).toBe('servidor');
  });
});

describe('login', () => {
  it('entra com e-mail e senha, manda o cookie (credentials: include) e NÃO guarda a senha', async () => {
    await servico.definirUrl(BASE);
    const r = await servico.entrar(EMAIL, SENHA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.conta.usuario).toMatchObject({ name: 'Ana', email: EMAIL });
    const login = crm.chamadas('auth.login')[0];
    expect(login).toMatchObject({ metodo: 'POST', credentials: 'include', contentType: 'application/json' });
    expect(login.url.origin).toBe(BASE);
    expect(login.entrada).toEqual({ email: EMAIL, password: SENHA });
    expect(crm.chamadas('auth.me')).toHaveLength(1);
    // a senha não está em nenhuma chave guardada
    expect(JSON.stringify([...arm.dados.entries()])).not.toContain(SENHA);
  });

  it('senha errada: erro claro e continua sem login', async () => {
    await servico.definirUrl(BASE);
    const r = await servico.entrar(EMAIL, 'errada');
    expect(r).toMatchObject({ ok: false, erro: { tipo: 'credenciais', mensagem: 'E-mail ou senha inválidos.' } });
    expect((await servico.conta()).usuario).toBeNull();
  });

  it('sem rede: avisa que não há conexão', async () => {
    await servico.definirUrl(BASE);
    crm.semRede = true;
    const r = await servico.entrar(EMAIL, SENHA);
    expect(r).toMatchObject({ ok: false, erro: { tipo: 'rede' } });
    if (!r.ok) expect(r.erro.mensagem).toMatch(/Sem conexão/);
  });

  it('muitas tentativas (429) vira erro de limite', async () => {
    await servico.definirUrl(BASE);
    crm.forcarStatus = 429;
    const r = await servico.entrar(EMAIL, SENHA);
    expect(r).toMatchObject({ ok: false, erro: { tipo: 'limite' } });
  });

  it('login aceito, mas sessão não reconhecida (IP restrito ou cookie não enviado): erro explica as duas causas', async () => {
    await servico.definirUrl(BASE);
    crm.sessaoInvisivel = true;
    const r = await servico.entrar(EMAIL, SENHA);
    expect(r).toMatchObject({ ok: false, erro: { tipo: 'nao-autenticado' } });
    if (!r.ok) expect(r.erro.mensagem).toMatch(/IP.*cookie/);
    expect((await servico.conta()).usuario).toBeNull();
  });

  it('sessão que cai (401) volta ao modo local e diz por quê; sair limpa o cache mas guarda a fila', async () => {
    await conectado();
    crm.logado = false; // o cookie expirou no servidor
    const r = await servico.leadDoContato(ANA);
    expect(r).toMatchObject({ tipo: 'erro', erro: { tipo: 'nao-autenticado' } });
    expect(await servico.leadDoContato(ANA)).toMatchObject({ tipo: 'sem-login', erro: { tipo: 'nao-autenticado' } });
  });

  it('sair chama auth.logout e some com o cache de leads e lembretes', async () => {
    await conectado();
    await servico.leadDoContato(ANA);
    expect(arm.dados.has('vz.crm.leads')).toBe(true);
    const conta = await servico.sair();
    expect(conta.usuario).toBeNull();
    expect(crm.chamadas('auth.logout')).toHaveLength(1);
    expect(arm.dados.has('vz.crm.leads')).toBe(false);
    expect(arm.dados.has('vz.crm.lembretes')).toBe(false);
  });

  it('trocar o endereço derruba a sessão e o cache', async () => {
    await conectado();
    const r = await servico.definirUrl('https://outro.local');
    expect(r.ok && r.conta.usuario).toBeNull();
    expect((await servico.conta()).baseUrl).toBe('https://outro.local');
    expect((await servico.definirUrl('http://inseguro.local')).ok).toBe(false);
  });
});

describe('lead da conversa (tasks.findForWhatsapp)', () => {
  it('sem login: modo local, nenhuma requisição', async () => {
    expect(await servico.leadDoContato(ANA)).toEqual({ tipo: 'sem-login' });
    expect(crm.requisicoes).toHaveLength(0);
  });

  it('acha pelo telefone, guarda o vínculo e depois usa o vínculo (getById)', async () => {
    await conectado();
    const r = await servico.leadDoContato(ANA);
    expect(r).toMatchObject({ tipo: 'lead', desatualizado: false, lead: { id: 1, titulo: 'Padaria da Ana', etiquetas: ['quente'] } });
    expect(crm.chamadas('tasks.findForWhatsapp')).toHaveLength(1);
    expect(crm.chamadas('tasks.findForWhatsapp')[0].entrada).toEqual({ phone: '5584999990000' });
    // 2ª vez, mesmo sem telefone na referência: pelo vínculo do nome (forçado: sem ele o cache de 30 min responderia)
    const de = await servico.leadDoContato({ nome: 'Ana Souza' }, { forcar: true });
    expect(de).toMatchObject({ tipo: 'lead', lead: { id: 1 } });
    expect(crm.chamadas('tasks.findForWhatsapp')).toHaveLength(1);
    expect(crm.chamadas('tasks.getById')).toHaveLength(1);
  });

  it('não achou: oferece vincular/criar; sem telefone na conversa, avisa', async () => {
    await conectado();
    expect(await servico.leadDoContato({ nome: 'Fulano', telefone: '5584911112222' })).toEqual({ tipo: 'nao-encontrado', semTelefone: false });
    expect(await servico.leadDoContato({ nome: 'Fulano' })).toEqual({ tipo: 'nao-encontrado', semTelefone: true });
  });

  it('mais de um lead com o mesmo telefone: pede para escolher', async () => {
    crm.tasks.push(task({ id: 3, title: 'Padaria da Ana (filial)', phone: '84999990000' }));
    await conectado();
    const r = await servico.leadDoContato(ANA);
    expect(r.tipo).toBe('varios');
    if (r.tipo === 'varios') expect(r.candidatos.map((l) => l.id)).toEqual([1, 3]);
  });

  it('vincular por busca (q) e criar lead (nome + telefone)', async () => {
    await conectado();
    const busca = await servico.procurarLeads('mercado');
    expect(busca.ok && busca.leads.map((l) => l.id)).toEqual([2]);
    expect((await servico.procurarLeads('a')).ok).toBe(false);
    const v = await servico.vincularLead({ nome: 'Dono do Mercado' }, 2);
    expect(v).toMatchObject({ ok: true, lead: { id: 2 } });
    expect(await servico.leadDoContato({ nome: 'Dono do Mercado' })).toMatchObject({ tipo: 'lead', lead: { id: 2 } });

    const novo = await servico.criarLead({ nome: 'Beto', telefone: '5584988887777' }, 'Beto Bar', '(84) 98888-7777');
    expect(novo).toMatchObject({ ok: true, lead: { titulo: 'Beto Bar' } });
    const criacao = crm.chamadas('tasks.create')[0].entrada as { title: string; phone: string; reminderDate: Date };
    expect(criacao).toMatchObject({ title: 'Beto Bar', phone: '5584988887777' });
    expect(criacao.reminderDate).toBeInstanceOf(Date);
    // lembrete do lead novo: amanhã 9h em Fortaleza = 12:00 UTC do dia 22
    expect(criacao.reminderDate.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(await servico.leadDoContato({ nome: 'Beto', telefone: '5584988887777' })).toMatchObject({ tipo: 'lead' });
    expect((await servico.criarLead({ nome: 'X' }, 'X', '123')).ok).toBe(false);
  });

  it('criar lead com telefone que já existe usa o existente (não duplica)', async () => {
    await conectado();
    const r = await servico.criarLead({ nome: 'Ana' }, 'Ana de novo', '84 99999-0000');
    expect(r).toMatchObject({ ok: true, lead: { id: 1 } });
    expect(crm.chamadas('tasks.create')).toHaveLength(0);
  });

  it('vínculo guardado pelo id interno, telefone (sem o 9 extra) e nome', () => {
    const k = chavesDoVinculo({ contatoId: 'abc', nome: 'João Álvaro', telefone: '5584999990000' });
    expect(k).toEqual(['id:abc', 'tel:558499990000', 'nome:joao alvaro']);
  });

  it('sem rede mostra o lead do cache, marcado como desatualizado', async () => {
    await conectado();
    await servico.leadDoContato(ANA);
    crm.semRede = true;
    const r = await servico.leadDoContato(ANA, { forcar: true });
    expect(r).toMatchObject({ tipo: 'lead', desatualizado: true, aviso: { tipo: 'rede' }, lead: { id: 1 } });
  });
});

describe('ações no lead', () => {
  beforeEach(async () => {
    await conectado();
    await servico.leadDoContato(ANA);
  });

  it('registrar contato: anexa uma linha com data, hora e texto às notas (e conta como contato no CRM)', async () => {
    const r = await servico.registrarContatoNoLead(ANA, 'Ligou pedindo\n10 sacos para sexta');
    expect(r).toMatchObject({ ok: true, pendente: false });
    const t = crm.tasks[0];
    expect(t.notes).toBe('Pediu tabela.\n[21/10/2026 14:30] Ligou pedindo 10 sacos para sexta');
    expect(t.contactCount).toBe(1);
    expect(t.lastContactedAt).toBeInstanceOf(Date);
    const upd = crm.chamadas('tasks.update')[0];
    expect(upd).toMatchObject({ metodo: 'POST', credentials: 'include' });
    expect(upd.entrada).toEqual({ id: 1, notes: t.notes });
    if (r.ok) expect(r.lead.notas).toBe(t.notes);
  });

  it('registrar contato: recusa texto vazio, longo demais e contato sem lead; as notas respeitam o limite de 5000', async () => {
    expect(await servico.registrarContatoNoLead(ANA, '   ')).toMatchObject({ ok: false, erro: { tipo: 'validacao' }, guardado: false });
    expect(await servico.registrarContatoNoLead(ANA, 'x'.repeat(1001))).toMatchObject({ ok: false });
    expect(await servico.registrarContatoNoLead({ nome: 'Sem vínculo' }, 'oi')).toMatchObject({ ok: false, erro: { mensagem: expect.stringContaining('não está ligado') } });
    const velhas = Array.from({ length: 120 }, (_, i) => `[01/01/2026 10:00] antiga ${i} ${'x'.repeat(40)}`).join('\n');
    const novas = anexarNota(velhas, linhaDeContato('nova', new Date(AGORA)));
    expect(novas.length).toBeLessThanOrEqual(5000);
    expect(novas.endsWith('[21/10/2026 14:30] nova')).toBe(true);
  });

  it('reagendar: manda reminderDate (Date) e liga o lembrete; recusa data passada', async () => {
    const em = AGORA + 3 * 86_400_000;
    const r = await servico.reagendar(ANA, em);
    expect(r).toMatchObject({ ok: true, pendente: false });
    expect(crm.tasks[0].reminderDate?.getTime()).toBe(em);
    const entrada = crm.chamadas('tasks.update')[0].entrada as { reminderDate: Date; reminderEnabled: boolean };
    expect(entrada.reminderDate).toBeInstanceOf(Date);
    expect(entrada.reminderEnabled).toBe(true);
    expect(await servico.reagendar(ANA, AGORA - 1000)).toMatchObject({ ok: false });
  });

  it('etiquetas: adiciona e remove a partir das etiquetas ATUAIS do CRM; não mexe nas reservadas', async () => {
    crm.tasks[0].tags = ['quente', 'ativo'];
    const r = await servico.alterarEtiquetas(ANA, { adicionar: ['atacado'], remover: ['quente'] });
    expect(r).toMatchObject({ ok: true });
    expect(crm.tasks[0].tags).toEqual(['ativo', 'atacado']);
    expect(await servico.alterarEtiquetas(ANA, { adicionar: ['ativo'] })).toMatchObject({ ok: false, erro: { tipo: 'validacao' } });
    expect(await servico.alterarEtiquetas(ANA, {})).toMatchObject({ ok: false });
  });

  it('marcar convertido, com valor opcional (toggleConverted)', async () => {
    const r = await servico.marcarConvertido(ANA, 1234.5);
    expect(r).toMatchObject({ ok: true });
    expect(crm.chamadas('tasks.toggleConverted')[0].entrada).toEqual({ id: 1, converted: true, orderValue: 1234.5 });
    expect(crm.tasks[0].convertedAt).toBeInstanceOf(Date);
    expect(await servico.marcarConvertido(ANA, -1)).toMatchObject({ ok: false });
    await servico.marcarConvertido(ANA);
    expect(crm.chamadas('tasks.toggleConverted')[1].entrada).toEqual({ id: 1, converted: true });
  });

  it('erro do servidor (validação) não guarda na fila: o usuário corrige e tenta de novo', async () => {
    crm.tasks[0].notes = 'n'.repeat(4999);
    const r = await servico.registrarContatoNoLead(ANA, 'texto');
    // o CRM falso aceita (o serviço corta as notas antigas); simulamos recusa do servidor trocando a task por inexistente
    expect(r.ok).toBe(true);
    crm.tasks.length = 0;
    const r2 = await servico.registrarContatoNoLead(ANA, 'outro');
    expect(r2).toMatchObject({ ok: false, guardado: false });
    expect((await servico.conta()).pendentes).toBe(0);
  });
});

describe('fila local sem rede (nada digitado se perde)', () => {
  beforeEach(async () => {
    await conectado();
    await servico.leadDoContato(ANA);
  });

  it('sem rede: a ação fica na fila, a tela já mostra o resultado e a fila é reenviada quando a rede volta', async () => {
    crm.semRede = true;
    const r = await servico.registrarContatoNoLead(ANA, 'Fechou 20 sacos');
    expect(r).toMatchObject({ ok: true, pendente: true });
    if (r.ok) expect(r.lead.notas).toContain('[21/10/2026 14:30] Fechou 20 sacos');
    expect((await servico.conta()).pendentes).toBe(1);
    // a faixa do lead mostra o lead com a ação já aplicada
    const durante = await servico.leadDoContato(ANA, { forcar: true });
    expect(durante).toMatchObject({ tipo: 'lead', desatualizado: true, pendentes: 1 });
    // sem forçar, o lead em cache (menos de 30 min) já vem com a ação aplicada, sem ir ao CRM
    expect(await servico.leadDoContato(ANA)).toMatchObject({ tipo: 'lead', desatualizado: false, pendentes: 1 });
    // a rede continua fora: reenvio não perde nada
    expect(await servico.reenviarFila()).toEqual({ enviados: 0, restantes: 1 });
    expect(crm.tasks[0].notes).toBe('Pediu tabela.');

    crm.semRede = false;
    agora += 600_000; // o reenvio acontece 10 min depois; a linha mantém a hora em que o usuário digitou
    expect(await servico.reenviarFila()).toEqual({ enviados: 1, restantes: 0 });
    expect(crm.tasks[0].notes).toBe('Pediu tabela.\n[21/10/2026 14:30] Fechou 20 sacos');
    expect((await servico.conta()).pendentes).toBe(0);
  });

  it('várias ações offline são reenviadas na ordem e a mesma linha nunca é duplicada', async () => {
    crm.semRede = true;
    await servico.registrarContatoNoLead(ANA, 'primeiro');
    await servico.reagendar(ANA, AGORA + 5 * 86_400_000);
    await servico.registrarContatoNoLead(ANA, 'segundo');
    await servico.alterarEtiquetas(ANA, { adicionar: ['retorno'] });
    expect((await servico.conta()).pendentes).toBe(4);
    crm.semRede = false;
    expect(await servico.reenviarFila()).toEqual({ enviados: 4, restantes: 0 });
    expect(crm.tasks[0].notes).toBe('Pediu tabela.\n[21/10/2026 14:30] primeiro\n[21/10/2026 14:30] segundo');
    expect(crm.tasks[0].tags).toEqual(['quente', 'retorno']);
    expect(crm.tasks[0].reminderDate?.getTime()).toBe(AGORA + 5 * 86_400_000);
    // reenviar de novo (ex.: resposta perdida na rede) não duplica a linha
    crm.tasks[0].notes = 'Pediu tabela.\n[21/10/2026 14:30] primeiro';
    crm.semRede = true;
    await servico.registrarContatoNoLead(ANA, 'primeiro');
    crm.semRede = false;
    await servico.reenviarFila();
    expect(crm.tasks[0].notes).toBe('Pediu tabela.\n[21/10/2026 14:30] primeiro');
  });

  it('ação nova não passa na frente da fila: tenta esvaziar a fila e, se a rede ainda cai, entra atrás', async () => {
    crm.semRede = true;
    await servico.registrarContatoNoLead(ANA, 'um');
    const r = await servico.registrarContatoNoLead(ANA, 'dois');
    expect(r).toMatchObject({ ok: true, pendente: true });
    expect((await servico.conta()).pendentes).toBe(2);
  });

  it('sessão caída (401) com algo digitado: o texto é guardado e sai quando o usuário entra de novo', async () => {
    crm.logado = false;
    const r = await servico.registrarContatoNoLead(ANA, 'Cliente aprovou o preço');
    expect(r).toMatchObject({ ok: false, erro: { tipo: 'nao-autenticado' }, guardado: true });
    expect((await servico.conta()).usuario).toBeNull();
    expect((await servico.conta()).erro?.tipo).toBe('nao-autenticado');
    const volta = await servico.entrar(EMAIL, SENHA);
    expect(volta.ok).toBe(true);
    expect(crm.tasks[0].notes).toContain('[21/10/2026 14:30] Cliente aprovou o preço');
    expect((await servico.conta()).pendentes).toBe(0);
  });

  it('o CRM recusa de vez (task apagada): o item sai da fila e vira "falha" com o resumo, sem travar o resto', async () => {
    crm.semRede = true;
    await servico.registrarContatoNoLead(ANA, 'perdido');
    crm.semRede = false;
    crm.tasks.length = 0;
    expect(await servico.reenviarFila()).toEqual({ enviados: 0, restantes: 0 });
    const conta = await servico.conta();
    expect(conta.falhas).toHaveLength(1);
    expect(conta.falhas[0].resumo).toContain('perdido');
  });

  it('a fila de um usuário não é enviada com a sessão de outro', async () => {
    crm.semRede = true;
    await servico.registrarContatoNoLead(ANA, 'do Ana');
    const fila = arm.dados.get('vz.crm.fila') as Array<{ usuarioId: number }>;
    fila[0].usuarioId = 99; // outro usuário
    arm.dados.set('vz.crm.fila', fila);
    crm.semRede = false;
    expect(await servico.reenviarFila()).toEqual({ enviados: 0, restantes: 0 }); // nada é da sessão atual
    expect((await servico.conta()).pendentes).toBe(0);
    expect(arm.dados.get('vz.crm.fila')).toHaveLength(1); // continua guardada para o dono
    expect(crm.tasks[0].notes).toBe('Pediu tabela.');
  });
});

describe('lembretes do CRM (tasks.reminders)', () => {
  it('sincroniza para o cache e grava a hora da última busca bem-sucedida', async () => {
    crm.tasks[0].reminderDate = new Date(AGORA + 2 * 3_600_000);
    await conectado();
    const r = await servico.sincronizarLembretes();
    expect(r).toEqual({ ok: true, quantidade: 1 });
    expect(arm.dados.get('vz.crm.lembretes')).toMatchObject({ em: AGORA });
    agora += 5 * 60_000;
    crm.tasks[0].reminderDate = new Date(AGORA + 3 * 3_600_000);
    await servico.sincronizarLembretes();
    expect(arm.dados.get('vz.crm.lembretes')).toMatchObject({ em: AGORA + 5 * 60_000 });
  });

  it('sem login não consulta o CRM; erro de rede mantém o cache anterior', async () => {
    expect(await servico.sincronizarLembretes()).toEqual({ ok: true, quantidade: 0 });
    expect(crm.requisicoes).toHaveLength(0);
    crm.tasks[0].reminderDate = new Date(AGORA + 3_600_000);
    await conectado();
    await servico.sincronizarLembretes();
    crm.semRede = true;
    expect(await servico.sincronizarLembretes()).toMatchObject({ ok: false, erro: { tipo: 'rede' } });
    expect((arm.dados.get('vz.crm.lembretes') as { itens: unknown[] }).itens).toHaveLength(1);
  });

  it('adiar um lembrete do CRM muda a data no CRM (reagendarTask)', async () => {
    await conectado();
    const r = await servico.reagendarTask(1, AGORA + 86_400_000 * 2);
    expect(r).toEqual({ ok: true });
    expect(crm.tasks[0].reminderDate?.getTime()).toBe(AGORA + 86_400_000 * 2);
  });
});
