// Reativação (0.7.56), as pontas que o motor usa: banco (v2 → v3 sem perder nada), IA e CRM pelo ServicoCrm com o CRM
// falso (contrato do servidor, LGPD, resumo nas notas SEM contar contato), e a trava no Executor das campanhas comuns.

import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, lerConfigFollowup, lerConfigReativacao, listarCampanhas, listarNaoEnviar, listarReativacoes, salvarCampanha, salvarConfig, salvarConfigFollowup, salvarConfigReativacao, salvarReativacoes } from '../src/shared/banco';
import type { Campanha, ItemCampanha } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import { CONFIG_FOLLOWUP_PADRAO } from '../src/shared/followup';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { CONFIG_REATIVACAO_PADRAO, novoRegistro } from '../src/shared/reativacao';
import { METODOS_LEADS } from '../src/shared/leads';
import { ServicoCrm } from '../src/shared/servico-crm';
import { avaliacaoDaIa } from '../src/shared/servico-ia';
import type { ResultadoTrava } from '../src/shared/trava-agendamento';
import { Executor } from '../src/sidepanel/executor';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

let n = 0;
const AGORA = new Date('2026-11-17T13:00:00.000Z');

describe('IndexedDB v3: a reativação só ACRESCENTA, nada do que existe é perdido', () => {
  it('um banco v2 (com dados do follow-up) abre na v3 com tudo intacto e a loja nova vazia', async () => {
    const nome = `migra-${Date.now()}-${(n += 1)}`;
    const v2 = await openDB(nome, 2, {
      upgrade(db) {
        db.createObjectStore('contatos', { keyPath: 'chave' });
        db.createObjectStore('campanhas', { keyPath: 'id' });
        const e = db.createObjectStore('envios', { keyPath: 'id' });
        e.createIndex('porChave', 'chave');
        e.createIndex('porCampanha', 'campanhaId');
        db.createObjectStore('naoEnviar', { keyPath: 'chave' });
        db.createObjectStore('config', { keyPath: 'id' });
        db.createObjectStore('followups', { keyPath: 'id' });
        db.createObjectStore('followupConfig', { keyPath: 'id' });
      },
    });
    await v2.put('naoEnviar', { chave: 'x', nome: 'X', desde: '2026-11-01', motivo: 'sair' });
    await v2.put('followupConfig', { id: 'followup', valor: { ligado: true, dias: 5, pausado: false, confirmouRisco: true, modo: 'meus_textos', textos1: ['Oi, {nome}! Passando para saber se você viu minha mensagem.'], textos2: [], estilo: '', desligadaSemTexto: false } });
    v2.close();

    const db = await abrirBanco(nome);
    expect(await listarNaoEnviar(db)).toHaveLength(1);
    expect(await lerConfigFollowup(db)).toMatchObject({ ligado: true, dias: 5 });
    expect(await listarReativacoes(db)).toEqual([]);
    expect(await lerConfigReativacao(db)).toMatchObject({ ligado: false, etapas: [25, 30, 40] });
  });

  it('a config da reativação mora ao lado da do follow-up sem uma pisar na outra', async () => {
    const db = await abrirBanco(`cfg-${Date.now()}-${(n += 1)}`);
    await salvarConfigFollowup(db, { ...(await lerConfigFollowup(db)), dias: 7 });
    await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: ['Oi, {nome}! Faz um tempinho que não nos falamos.'], etapas: [20, 33, 50] });
    expect((await lerConfigFollowup(db)).dias).toBe(7);
    expect(await lerConfigReativacao(db)).toMatchObject({ etapas: [20, 33, 50], ligado: false });
  });

  it('registros da reativação ficam por contato e sobrevivem', async () => {
    const db = await abrirBanco(`reg-${Date.now()}-${(n += 1)}`);
    await salvarReativacoes(db, [novoRegistro({ chave: 'a', nome: 'A', primeiroNome: 'A' }, '2026-10-20', AGORA)]);
    expect((await listarReativacoes(db)).map((r) => r.chave)).toEqual(['a']);
  });
});

describe('ponte com o CRM (ServicoCrm → zapIa.avaliarReativacao e zapCrm.registrarReativacao)', () => {
  let crm: CrmFalso;
  let servico: ServicoCrm;
  let agora = AGORA.getTime();

  beforeEach(async () => {
    agora = AGORA.getTime();
    crm = criarCrmFalso([task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', notes: 'Cliente antigo.', contactCount: 3 })], () => agora);
    servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte, () => agora);
    await servico.definirUrl(BASE);
    await servico.entrar(EMAIL, SENHA);
    crm.requisicoes.length = 0;
  });

  it('os métodos novos passam pelo service worker (contrato LeadsCRM)', () => {
    for (const m of ['avaliarReativacao', 'verificarAgendamentos', 'registrarReativacao', 'desfazerAgendamento']) expect(METODOS_LEADS).toContain(m);
  });

  it('avaliarReativacao: manda só o que a IA precisa (ref opaco, primeiro nome, dias, mensagens) e lê a resposta; item inválido é descartado', async () => {
    crm.zapIa = {
      classificar: () => ({ ok: true, itens: [] }),
      cobranca: () => ({ ok: false }),
      reativacao: () => ({
        ok: true,
        itens: [
          { ref: 'c1', decisao: 'precisa_mais_tempo', diasSugeridos: 45, resumo: 'Tem estoque.' },
          { ref: 'c2', decisao: 'inventada' },
          { decisao: 'delicado' },
        ],
        restantesHoje: 398,
      }),
    };
    const r = await servico.avaliarReativacao([
      { ref: 'c1', primeiroNome: 'Maria', diasSemConversa: 28, mensagens: [{ de: 'eu', texto: 'Oi', quando: '2026-10-20T12:00:00.000Z' }, { de: 'cliente', texto: 'tenho estoque' }] },
      { ref: 'c2', primeiroNome: 'Pedro', diasSemConversa: 30, mensagens: [] },
    ]);
    expect(r).toEqual({ ok: true, valor: [{ ref: 'c1', decisao: 'precisa_mais_tempo', resumo: 'Tem estoque.', diasSugeridos: 45 }] });
    const [req] = crm.chamadas('zapIa.avaliarReativacao');
    expect(req.metodo).toBe('POST'); // mutation: nada de texto de cliente na URL
    expect(req.url.search).toBe('');
    expect(req.credentials).toBe('include');
    expect(JSON.stringify(req.entrada)).not.toMatch(/telefone|phone|chave|nome completo/i);
  });

  it('avaliarReativacao: servidor sem o procedimento (antes do deploy) → erro amigável, sem lançar; mais de 10 por lote é recusado', async () => {
    const r = await servico.avaliarReativacao([{ ref: 'c1', primeiroNome: 'Maria', diasSemConversa: 28, mensagens: [] }]);
    expect(r.ok).toBe(false);
    const grande = Array.from({ length: 11 }, (_, i) => ({ ref: `c${i}`, primeiroNome: 'A', diasSemConversa: 28, mensagens: [] }));
    expect(await servico.avaliarReativacao(grande)).toMatchObject({ ok: false, erro: { tipo: 'validacao' } });
  });

  it('avaliacaoDaIa: dias não inteiros são ignorados e decisão desconhecida vira null', () => {
    expect(avaliacaoDaIa({ ref: 'c1', decisao: 'precisa_mais_tempo', diasSugeridos: 10.5, resumo: 'x' })).toEqual({ ref: 'c1', decisao: 'precisa_mais_tempo', resumo: 'x' });
    expect(avaliacaoDaIa({ ref: 'c1', decisao: 'outra' })).toBeNull();
    expect(avaliacaoDaIa(null)).toBeNull();
  });

  it('escreverCobranca com contexto "reativacao" (etapas 1 a 3, mensagem anterior vazia) e estilo do dono', async () => {
    crm.zapIa = { classificar: () => ({}), cobranca: (e) => ({ ok: true, texto: `Oi, ${(e.primeiroNome as string).split(' ')[0]}! Faz tempo, precisa de sal?` }) };
    const r = await servico.escreverCobranca('Maria', '', 3, { estilo: 'curto', exemplos: ['Oi, {nome}!'] }, 'reativacao');
    expect(r).toEqual({ ok: true, valor: 'Oi, Maria! Faz tempo, precisa de sal?' });
    const [req] = crm.chamadas('zapIa.gerarCobranca');
    expect(req.entrada).toMatchObject({ primeiroNome: 'Maria', tentativa: 3, contexto: 'reativacao', estilo: 'curto', exemplos: ['Oi, {nome}!'], mensagemCampanha: '' });
    // cobrança comum continua sem o campo novo
    await servico.escreverCobranca('Maria', 'Oi Maria', 1);
    expect(crm.chamadas('zapIa.gerarCobranca')[1].entrada).not.toHaveProperty('contexto');
  });

  it('registrarReativacao: o RESUMO vai para as notas do lead (achado pelo telefone) e NÃO conta como contato', async () => {
    const r = await servico.registrarReativacao({ nome: 'CLIENTE Ana', telefone: '5584999990000', linha: 'Reativação 25d (IA): Pediu 40 sacos em setembro. Decisão: retomar agora.', agendarEm: null, criar: true });
    expect(r).toMatchObject({ ok: true, taskId: 1, criou: false, agendou: false });
    const t = crm.tasks[0];
    expect(t.notes).toMatch(/^Cliente antigo\.\n\[carimbo\] Reativação 25d \(IA\): Pediu 40 sacos/);
    expect(t.contactCount).toBe(3); // nada de "contato" registrado pelo robô
    expect(t.lastContactedAt).toBeNull();
    // o vínculo fica guardado: da próxima vez o servidor recebe o taskId
    await servico.registrarReativacao({ nome: 'CLIENTE Ana', telefone: null, linha: 'Segunda linha', agendarEm: null, criar: false });
    expect(crm.chamadas('zapCrm.registrarReativacao')[1].entrada).toMatchObject({ taskId: 1 });
  });

  it('desfazerAgendamento: remove SÓ o lembrete que a IA criou, e só se ainda for o mesmo (notas e tarefa ficam)', async () => {
    const quando = agora + 45 * 86_400_000;
    const criou = await servico.registrarReativacao({ nome: 'CLIENTE Ana', telefone: '5584999990000', linha: 'Resumo da IA', agendarEm: quando, criar: true });
    expect(criou).toMatchObject({ ok: true, agendou: true });
    const taskId = (criou as { taskId: number }).taskId;
    const ok = await servico.desfazerAgendamento({ taskId, agendadoEm: quando });
    expect(ok).toEqual({ ok: true });
    expect(crm.tasks[0].reminderDate).toBeNull();
    expect(crm.tasks[0].reminderEnabled).toBe(false);
    expect(crm.tasks[0].notes).toContain('Resumo da IA'); // a nota fica
    expect(crm.tasks[0].status).toBe('pending');
    expect(crm.chamadas('zapCrm.desfazerAgendamento')[0].entrada).toMatchObject({ taskId });
  });

  it('desfazerAgendamento: se o atendente mudou a data depois, nada é tocado e o motivo volta', async () => {
    const quando = agora + 45 * 86_400_000;
    const criou = await servico.registrarReativacao({ nome: 'CLIENTE Ana', telefone: '5584999990000', linha: 'x', agendarEm: quando, criar: true });
    const taskId = (criou as { taskId: number }).taskId;
    crm.tasks[0].reminderDate = new Date(quando + 86_400_000); // o atendente remarcou
    const r = await servico.desfazerAgendamento({ taskId, agendadoEm: quando });
    expect(r).toMatchObject({ ok: false, mensagem: expect.stringMatching(/já foi alterado/) });
    expect(crm.tasks[0].reminderDate?.getTime()).toBe(quando + 86_400_000);
  });

  it('desfazerAgendamento: CRM antigo (sem a procedure), fora do ar ou sem login → erro claro, sem lançar', async () => {
    crm.semZapCrm = true;
    expect(await servico.desfazerAgendamento({ taskId: 1, agendadoEm: agora + 1 })).toMatchObject({ ok: false, mensagem: expect.stringMatching(/CRM precisa estar atualizado/) });
    crm.semZapCrm = false;
    crm.semRede = true;
    expect(await servico.desfazerAgendamento({ taskId: 1, agendadoEm: agora + 1 })).toMatchObject({ ok: false });
    crm.semRede = false;
    await servico.sair();
    expect(await servico.desfazerAgendamento({ taskId: 1, agendadoEm: agora + 1 })).toMatchObject({ ok: false, mensagem: expect.stringMatching(/Entre no CRM/) });
  });

  it('agendamento: hoje + dias às 9h; se já há agendamento futuro ele PREVALECE (nada é sobrescrito)', async () => {
    const quando = agora + 45 * 86_400_000;
    const r = await servico.registrarReativacao({ nome: 'CLIENTE Ana', telefone: '5584999990000', linha: 'x', agendarEm: quando, criar: true });
    expect(r).toMatchObject({ ok: true, agendou: true });
    expect(crm.tasks[0].reminderDate?.getTime()).toBe(quando);
    const de = await servico.registrarReativacao({ nome: 'CLIENTE Ana', telefone: '5584999990000', linha: 'y', agendarEm: agora + 10 * 86_400_000, criar: true });
    expect(de).toMatchObject({ ok: true, agendou: false, semAgenda: 'agendamento_existente', agendamentoExistente: quando });
    expect(crm.tasks[0].reminderDate?.getTime()).toBe(quando);
  });

  it('sem lead no CRM: cria (com telefone) quando pedido; sem telefone não cria; sem permissão de criar devolve sem_lead', async () => {
    const criado = await servico.registrarReativacao({ nome: 'CLIENTE Bia', telefone: '5584988887777', linha: 'resumo', agendarEm: agora + 30 * 86_400_000, criar: true });
    expect(criado).toMatchObject({ ok: true, criou: true, agendou: true });
    expect(crm.tasks.find((t) => t.title === 'CLIENTE Bia')).toMatchObject({ phone: '84988887777', reminderEnabled: true });
    expect(await servico.registrarReativacao({ nome: 'CLIENTE Caio', telefone: null, linha: 'resumo', agendarEm: null, criar: true })).toMatchObject({ ok: false, codigo: 'sem_telefone' });
    expect(await servico.registrarReativacao({ nome: 'CLIENTE Dani', telefone: '5584977776666', linha: 'resumo', agendarEm: null, criar: false })).toMatchObject({ ok: false, codigo: 'sem_lead' });
  });

  it('CRM fora do ar ou servidor antigo: erro (codigo crm), sem lançar; sem login também', async () => {
    crm.semRede = true;
    expect(await servico.registrarReativacao({ nome: 'A', telefone: '5584999990000', linha: 'x', agendarEm: null, criar: true })).toMatchObject({ ok: false, codigo: 'crm' });
    crm.semRede = false;
    crm.semZapCrm = true;
    expect(await servico.registrarReativacao({ nome: 'A', telefone: '5584999990000', linha: 'x', agendarEm: null, criar: true })).toMatchObject({ ok: false, codigo: 'crm' });
    await servico.sair();
    expect(await servico.registrarReativacao({ nome: 'A', telefone: '5584999990000', linha: 'x', agendarEm: null, criar: true })).toMatchObject({ ok: false, codigo: 'crm' });
  });
});

describe('a trava vale para a CAMPANHA COMUM e para a cobrança: o Executor confere antes de abrir cada contato', () => {
  async function montar(tipo: Campanha['tipo'], nomes: string[], trava: (i: ItemCampanha) => ResultadoTrava, auto: boolean) {
    const db = await abrirBanco(`trava-${Date.now()}-${(n += 1)}`);
    await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
    // Modo Ligado nos dois automáticos: só ele deixa o Executor enviar (v0.7.59).
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: ['Oi, {nome}!'], automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: ['Oi, {nome}!'], automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    const itens: ItemCampanha[] = nomes.map((nome) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo: 'Oi {primeiroNome}, tudo bem? Como estão de sal por aí?', status: 'pendente', motivo: null, atualizadoEm: null }));
    const campanha: Campanha = { id: 'c1', ...(tipo ? { tipo } : {}), nome: 'C', criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: 'CLIENTE', filtros: FILTROS_PADRAO, modelos: [], status: 'pausada', motivoPausa: null, itens, problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null };
    await salvarCampanha(db, campanha);
    const colados: string[] = [];
    const consultas: string[] = [];
    const agendados: Array<() => void> = [];
    const ex = new Executor(
      {
        db,
        pedir: async (p) => {
          if (p.tipo === 'abrirEColar') colados.push(p.nome);
          if (p.tipo === 'lerConversa') return { ok: true, mensagens: [{ de: 'eu', texto: 'Oi, tudo bem?', quando: null }] }; // releitura antes do envio automático
          return p.tipo === 'abrirEColar' ? { ok: true, idsAntes: [] } : { ok: true };
        },
        agora: () => AGORA,
        aleatorio: () => 0.5,
        agendar: (fn) => {
          agendados.push(fn);
          return () => undefined;
        },
        obterEnvioAutomatico: () => auto,
        trava: async (item) => {
          consultas.push(item.nome);
          return trava(item);
        },
      },
      campanha,
    );
    return { db, ex, colados, consultas };
  }
  const livre = (): ResultadoTrava => ({ tipo: 'livre' });
  const agendado = (): ResultadoTrava => ({ tipo: 'agendado', ate: AGORA.getTime() + 60 * 86_400_000, taskId: 1, titulo: 'x', como: 'telefone', motivo: 'agendado para 16/01 (o agendamento prevalece)' });

  for (const tipo of [undefined, 'followup', 'reativacao'] as const) {
    const rotulo = tipo === undefined ? 'campanha comum' : tipo === 'followup' ? 'cobrança do follow-up' : 'reativação';
    it(`${rotulo}: contato com agendamento futuro é PULADO, com o motivo, e o resto segue`, async () => {
      const t = await montar(tipo, ['Ana', 'Bia'], (i) => (i.nome === 'Ana' ? agendado() : livre()), true);
      await t.ex.iniciar();
      expect(t.consultas[0]).toBe('Ana'); // conferiu ANTES de abrir
      expect(t.colados).toEqual(['Bia']);
      const ana = t.ex.atual.campanha.itens.find((i) => i.nome === 'Ana');
      expect(ana).toMatchObject({ status: 'pulado', motivo: 'agendado para 16/01 (o agendamento prevalece)' });
      expect((await listarCampanhas(t.db))[0].itens.find((i) => i.nome === 'Ana')?.status).toBe('pulado');
    });

    it(`${rotulo}: CRM indisponível no envio AUTOMÁTICO → pausa sem enviar (falha fechada)`, async () => {
      const t = await montar(tipo, ['Ana'], () => ({ tipo: 'indisponivel', motivo: 'sem rede' }), true);
      await t.ex.iniciar();
      expect(t.colados).toEqual([]);
      expect(t.ex.atual.campanha.status).toBe('pausada');
      expect(t.ex.atual.campanha.motivoPausa).toMatch(/^CRM indisponível: não envio sem conferir os agendamentos \(sem rede\)/);
      expect(t.ex.atual.campanha.itens[0].status).toBe('pendente'); // continua na fila
    });
  }

  it('campanha comum em envio MANUAL com o CRM indisponível (0.7.62): não abre nem cola; fica aguardando o CRM, com o motivo', async () => {
    const t = await montar(undefined, ['Ana'], () => ({ tipo: 'indisponivel', motivo: 'sem rede' }), false);
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(t.ex.atual.campanha.itens[0]).toMatchObject({ status: 'aguardando_crm', motivo: expect.stringMatching(/agendamentos \(sem rede\)/) });
  });

  it('campanha comum em envio MANUAL com agendamento: também pula (o agendamento prevalece sempre)', async () => {
    const t = await montar(undefined, ['Ana'], agendado, false);
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(t.ex.atual.campanha.itens[0].status).toBe('pulado');
  });

  it('se a trava LANÇA, é falha fechada (nunca "livre")', async () => {
    const t = await montar(undefined, ['Ana'], () => {
      throw new Error('explodiu');
    }, true);
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(t.ex.atual.campanha.motivoPausa).toMatch(/CRM indisponível.*explodiu/);
  });

  it('sem a dependência (testes antigos) nada é conferido: comportamento de antes', async () => {
    const db = await abrirBanco(`sem-trava-${Date.now()}-${(n += 1)}`);
    await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
    const colados: string[] = [];
    const campanha: Campanha = { id: 'c1', nome: 'C', criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: '', filtros: FILTROS_PADRAO, modelos: [], status: 'pausada', motivoPausa: null, itens: [{ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', modelo: 'Oi {primeiroNome}, tudo bem?', status: 'pendente', motivo: null, atualizadoEm: null }], problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null };
    const ex = new Executor({ db, pedir: async (p) => { if (p.tipo === 'abrirEColar') colados.push(p.nome); return p.tipo === 'abrirEColar' ? { ok: true, idsAntes: [] } : { ok: true }; }, agora: () => AGORA, aleatorio: () => 0.5, agendar: () => () => undefined }, campanha);
    await ex.iniciar();
    expect(colados).toEqual(['Ana']);
  });
});

