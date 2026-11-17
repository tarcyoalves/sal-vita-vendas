// Trava de agendamento (0.7.56): regras puras de casamento + a ponte com o CRM (ServicoCrm → zapCrm.agendamentosFuturos),
// com o CRM falso. Agendamento FUTURO pendente no CRM (inclusive a 60 dias, fora da janela de 7 dias de tasks.reminders)
// bloqueia; passou a data ou foi concluído, o contato volta a ser elegível; CRM fora do ar = falha fechada.

import { beforeEach, describe, expect, it } from 'vitest';
import { ServicoCrm } from '../src/shared/servico-crm';
import { CHAVES_CRM } from '../src/shared/crm-remoto';
import { diaMes, listaDoServidor, nomesCompativeis, verificarTrava, VALIDADE_AGENDAMENTOS_MS, type ListaAgendamentos } from '../src/shared/trava-agendamento';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

const AGORA = Date.UTC(2026, 10, 17, 15, 0); // terça 12h em Fortaleza
const dia = (n: number) => AGORA + n * 86_400_000;
const lista = (...itens: Array<[number, string, string | null, number]>): ListaAgendamentos => ({
  itens: itens.map(([taskId, titulo, telefone, venceEm]) => ({ taskId, titulo, telefone, venceEm })),
  truncado: false,
  em: AGORA,
});

describe('nomesCompativeis (nome do WhatsApp x título da tarefa do CRM)', () => {
  it.each([
    ['Ana Souza', 'ana souza', true],
    ['CLIENTE - Ana Souza', 'Ana Souza', true],
    ['Ismael Roberto', 'Ismael Roberto - AGROPECUÁRIA PRADAL', true],
    ['Mercadinho Bom Preço', 'Mercadinho Bom Preço Cliente Natal RN', true],
    ['Maria', 'Maria Souza', false], // uma palavra só é comum demais
    ['Ana Souza', 'Ana Silva', false],
    ['Ana Souza', 'Souza Ana', false],
    ['', 'Ana', false],
  ])('%s x %s → %s', (a, b, esperado) => {
    expect(nomesCompativeis(a, b)).toBe(esperado);
  });
});

describe('verificarTrava', () => {
  const tel = '5584999990000';

  it('agendamento a 60 dias bloqueia (pelo telefone, com ou sem o 9 extra e o DDI) e diz até quando', () => {
    const l = lista([1, 'Padaria da Ana', '84999990000', dia(60)]);
    const r = verificarTrava({ nome: 'qualquer nome', telefone: tel }, l, {}, AGORA);
    expect(r).toMatchObject({ tipo: 'agendado', ate: dia(60), taskId: 1, como: 'telefone' });
    expect(r.tipo === 'agendado' && r.motivo).toBe(`agendado para ${diaMes(dia(60))} (o agendamento prevalece)`);
    expect(verificarTrava({ nome: 'x', telefone: '558499990000' }, l, {}, AGORA).tipo).toBe('agendado'); // sem o 9
  });

  it('pelo vínculo que a extensão já gravou (nome ou telefone → task)', () => {
    const l = lista([7, 'Fulano Sicrano Ltda', null, dia(30)]);
    expect(verificarTrava({ nome: 'CLIENTE Zé da Venda' }, l, { 'nome:cliente ze da venda': 7 }, AGORA)).toMatchObject({ tipo: 'agendado', como: 'vinculo' });
  });

  it('pelo nome, quando não há telefone nem vínculo', () => {
    const l = lista([3, 'Ana Souza', null, dia(10)]);
    expect(verificarTrava({ nome: 'Ana Souza' }, l, {}, AGORA)).toMatchObject({ tipo: 'agendado', como: 'nome' });
    expect(verificarTrava({ nome: 'Pedro Lima' }, l, {}, AGORA).tipo).toBe('livre');
  });

  it('agendamento que já passou (cache velho) NÃO bloqueia: volta a ser elegível', () => {
    const l = lista([1, 'Ana Souza', '84999990000', AGORA - 1000]);
    expect(verificarTrava({ nome: 'Ana Souza', telefone: tel }, l, {}, AGORA).tipo).toBe('livre');
  });

  it('vários agendamentos: vale o mais distante (só volta depois de todos)', () => {
    const l = lista([1, 'Ana Souza', '84999990000', dia(5)], [2, 'Ana Souza', '84999990000', dia(45)]);
    expect(verificarTrava({ nome: 'Ana Souza', telefone: tel }, l, {}, AGORA)).toMatchObject({ tipo: 'agendado', ate: dia(45) });
  });

  it('falha fechada: sem lista = indisponível; lista truncada sem achado = indisponível; truncada COM achado = agendado', () => {
    expect(verificarTrava({ nome: 'Ana' }, null, {}, AGORA).tipo).toBe('indisponivel');
    const corta: ListaAgendamentos = { ...lista([1, 'Ana Souza', '84999990000', dia(5)]), truncado: true };
    expect(verificarTrava({ nome: 'Pedro Lima' }, corta, {}, AGORA).tipo).toBe('indisponivel');
    expect(verificarTrava({ nome: 'Ana Souza' }, corta, {}, AGORA).tipo).toBe('agendado');
  });

  it('listaDoServidor lê datas como Date/string/número e descarta item fora do contrato', () => {
    const r = listaDoServidor({ itens: [{ taskId: 1, titulo: 'a', telefone: '', venceEm: new Date(dia(3)) }, { taskId: 2, titulo: 'b', telefone: '84', venceEm: new Date(dia(4)).toISOString() }, { taskId: 'x' }, null], truncado: false }, AGORA);
    expect(r?.itens).toEqual([
      { taskId: 1, titulo: 'a', telefone: null, venceEm: dia(3) },
      { taskId: 2, titulo: 'b', telefone: '84', venceEm: dia(4) },
    ]);
    expect(listaDoServidor('lixo', AGORA)).toBeNull();
    expect(listaDoServidor({ itens: 'x' }, AGORA)).toBeNull();
  });
});

describe('ServicoCrm.verificarAgendamentos (CRM falso)', () => {
  let crm: CrmFalso;
  let arm: ReturnType<typeof criarArmazemMemoria>;
  let servico: ServicoCrm;
  let agora = AGORA;

  beforeEach(async () => {
    agora = AGORA;
    crm = criarCrmFalso(
      [
        task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', reminderDate: new Date(dia(60)) }), // 60 dias: fora da janela de 7 dias do tasks.reminders
        task({ id: 2, title: 'Mercado Sol', phone: '8433334444', reminderDate: new Date(dia(-3)) }), // vencido
        task({ id: 3, title: 'Posto Norte', phone: '8433335555', reminderDate: new Date(dia(5)), status: 'completed' }), // concluído
        task({ id: 4, title: 'Loja Mar', phone: '8433336666', reminderDate: new Date(dia(5)), reminderEnabled: false }), // lembrete desligado
        task({ id: 5, title: 'Bar do Zé', phone: '8433337777' }), // sem agendamento
      ],
      () => agora,
    );
    arm = criarArmazemMemoria();
    servico = new ServicoCrm(arm, crm.transporte, () => agora);
    await servico.definirUrl(BASE);
    await servico.entrar(EMAIL, SENHA);
    crm.requisicoes.length = 0;
  });

  it('só o agendamento futuro, pendente e ligado trava; vencido, concluído, desligado e sem data ficam livres', async () => {
    const r = await servico.verificarAgendamentos([
      { nome: 'x', telefone: '5584999990000' },
      { nome: 'x', telefone: '558433334444' },
      { nome: 'x', telefone: '558433335555' },
      { nome: 'x', telefone: '558433336666' },
      { nome: 'x', telefone: '558433337777' },
    ]);
    expect(r.map((x) => x.tipo)).toEqual(['agendado', 'livre', 'livre', 'livre', 'livre']);
    expect(r[0]).toMatchObject({ ate: dia(60), taskId: 1 });
  });

  it('muitos contatos = UMA consulta ao CRM, e o cache de 5 min evita a segunda', async () => {
    const refs = Array.from({ length: 200 }, (_, i) => ({ nome: `Contato ${i}` }));
    await servico.verificarAgendamentos(refs);
    await servico.verificarAgendamentos(refs);
    expect(crm.chamadas('zapCrm.agendamentosFuturos')).toHaveLength(1);
    agora += VALIDADE_AGENDAMENTOS_MS + 1000;
    await servico.verificarAgendamentos(refs);
    expect(crm.chamadas('zapCrm.agendamentosFuturos')).toHaveLength(2);
    await servico.verificarAgendamentos(refs, { forcar: true });
    expect(crm.chamadas('zapCrm.agendamentosFuturos')).toHaveLength(3);
  });

  it('o agendamento novo criado no CRM entra na trava na consulta seguinte (forçada)', async () => {
    const livre = await servico.verificarAgendamentos([{ nome: 'x', telefone: '558433337777' }]);
    expect(livre[0].tipo).toBe('livre');
    crm.tasks.find((t) => t.id === 5)!.reminderDate = new Date(dia(40));
    expect((await servico.verificarAgendamentos([{ nome: 'x', telefone: '558433337777' }], { forcar: true }))[0]).toMatchObject({ tipo: 'agendado', ate: dia(40) });
  });

  it('a data passou: volta a ser elegível sem consultar de novo o que já está em cache (agora > venceEm)', async () => {
    await servico.verificarAgendamentos([{ nome: 'x', telefone: '5584999990000' }]);
    agora = dia(61);
    // o cache tem 61 dias: a consulta é refeita, mas mesmo o cache velho já não bloquearia uma data que passou
    expect((await servico.verificarAgendamentos([{ nome: 'x', telefone: '5584999990000' }]))[0].tipo).toBe('livre');
  });

  it('CRM fora do ar: falha fechada (indisponível para todos), sem lançar', async () => {
    crm.semRede = true;
    const r = await servico.verificarAgendamentos([{ nome: 'a' }, { nome: 'b' }]);
    expect(r.map((x) => x.tipo)).toEqual(['indisponivel', 'indisponivel']);
    expect(r[0].tipo === 'indisponivel' && r[0].motivo).toMatch(/CRM indisponível/);
  });

  it('servidor ainda sem a consulta (antes do deploy): indisponível, com o motivo claro', async () => {
    crm.semZapCrm = true;
    const r = await servico.verificarAgendamentos([{ nome: 'a' }]);
    expect(r[0].tipo === 'indisponivel' && r[0].motivo).toMatch(/ainda não tem a consulta de agendamentos/);
  });

  it('sem login: indisponível (nunca "livre")', async () => {
    await servico.sair();
    const r = await servico.verificarAgendamentos([{ nome: 'a' }]);
    expect(r[0]).toMatchObject({ tipo: 'indisponivel', motivo: 'sem login no CRM' });
  });

  it('lista truncada pelo servidor: quem não foi achado fica indisponível', async () => {
    crm.agendamentosTruncados = true;
    const r = await servico.verificarAgendamentos([{ nome: 'Fulano Qualquer' }, { nome: 'x', telefone: '5584999990000' }]);
    expect(r.map((x) => x.tipo)).toEqual(['indisponivel', 'agendado']);
  });

  it('sair do CRM apaga o cache dos agendamentos', async () => {
    await servico.verificarAgendamentos([{ nome: 'a' }]);
    expect(arm.dados.has(CHAVES_CRM.agendamentos)).toBe(true);
    await servico.sair();
    expect(arm.dados.has(CHAVES_CRM.agendamentos)).toBe(false);
  });

  it('chama uma QUERY (GET), sem dado de cliente na URL, com o cookie', async () => {
    await servico.verificarAgendamentos([{ nome: 'Ana Souza', telefone: '5584999990000' }]);
    const [req] = crm.chamadas('zapCrm.agendamentosFuturos');
    expect(req.metodo).toBe('GET');
    expect(req.url.search).toBe('');
    expect(req.credentials).toBe('include');
  });
});
