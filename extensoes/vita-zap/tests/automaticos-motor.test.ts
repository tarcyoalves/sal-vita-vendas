// Lote 1 (0.7.59), o que mora no IndexedDB: migração v3 → v4 sem perda, decisões/julgamentos, "O que a IA fez", o modo global e o Desfazer.

import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { MAX_ACOES_IA, MAX_JULGAMENTOS, julgar, novaAcao, novaDecisao } from '../src/shared/automaticos';
import {
  abrirBanco,
  lerConfigFollowup,
  lerConfigReativacao,
  listarAcoesIa,
  listarEnvios,
  listarFollowups,
  listarJulgamentos,
  listarNaoEnviar,
  listarReativacoes,
  marcarNaoEnviar,
  registrarAcaoIa,
  registrarDecisao,
  registrarEnvio,
  salvarConfigFollowup,
  salvarConfigReativacao,
  salvarFollowups,
  salvarJulgamento,
  salvarReativacoes,
} from '../src/shared/banco';
import { CONFIG_FOLLOWUP_PADRAO, type Followup } from '../src/shared/followup';
import { CONFIG_REATIVACAO_PADRAO, novoRegistro } from '../src/shared/reativacao';
import { carregarVisao, definirModo, desfazerAcao, julgarDecisao, modoGlobal, reiniciarObservados, reabrirJulgamento } from '../src/sidepanel/automaticos-motor';

let n = 0;
const AGORA = new Date('2026-11-17T13:00:00.000Z');
const novoBanco = () => abrirBanco(`auto-${Date.now()}-${(n += 1)}`);
const TEXTO = ['Oi, {nome}! Passando para saber se viu minha mensagem.'];

describe('IndexedDB v4: só ACRESCENTA duas lojas, nada do que existe é perdido', () => {
  it('um banco v3 com dados de todas as lojas abre na v4 com tudo intacto, as lojas novas vazias e a config antiga migrada para Observação', async () => {
    const nome = `migra4-${Date.now()}-${(n += 1)}`;
    const v3 = await openDB(nome, 3, {
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
        db.createObjectStore('reativacoes', { keyPath: 'chave' });
      },
    });
    await v3.put('contatos', { chave: 'ana', nome: 'Ana' });
    await v3.put('campanhas', { id: 'c1', nome: 'Campanha', itens: [] });
    await v3.put('envios', { id: 'c1:ana', campanhaId: 'c1', chave: 'ana', nome: 'Ana', enviadoEm: '2026-11-01T12:00:00.000Z', textoConfere: true });
    await v3.put('naoEnviar', { chave: 'x', nome: 'X', desde: '2026-11-01', motivo: 'sair' });
    await v3.put('config', { id: 'politica', valor: { tetoDiario: 20, intervaloMinSeg: 60, intervaloMaxSeg: 120, numeroComMaisDe30Dias: true } });
    await v3.put('followups', { id: 'o:ana', chave: 'ana' });
    await v3.put('followupConfig', { id: 'followup', valor: { ligado: true, dias: 5, pausado: false, confirmouRisco: true, modo: 'meus_textos', textos1: TEXTO, textos2: [], estilo: '', desligadaSemTexto: false } });
    // config da 0.7.58: ainda sem os campos do modo (automatico, migradoParaObservacao, placarAprovado)
    const { automatico: _a, migradoParaObservacao: _m, placarAprovado: _p, ...antiga } = CONFIG_REATIVACAO_PADRAO;
    await v3.put('followupConfig', { id: 'reativacao', valor: { ...antiga, ligado: true, confirmouRisco: true, textos1: TEXTO } });
    await v3.put('reativacoes', novoRegistro({ chave: 'bia', nome: 'Bia', primeiroNome: 'Bia' }, '2026-10-20', AGORA));
    v3.close();

    const db = await abrirBanco(nome);
    expect([...db.objectStoreNames].sort()).toEqual(['acoesIa', 'campanhas', 'config', 'contatos', 'envios', 'followupConfig', 'followups', 'julgamentos', 'naoEnviar', 'reativacoes']);
    expect(await db.getAll('contatos')).toHaveLength(1);
    expect(await db.getAll('campanhas')).toHaveLength(1);
    expect(await listarEnvios(db)).toHaveLength(1);
    expect((await db.getAllFromIndex('envios', 'porChave', 'ana')).length).toBe(1); // os índices continuam
    expect(await listarNaoEnviar(db)).toHaveLength(1);
    expect(await db.get('config', 'politica')).toMatchObject({ valor: { tetoDiario: 20 } });
    expect(await listarFollowups(db)).toHaveLength(1);
    expect(await listarReativacoes(db)).toHaveLength(1);
    expect(await listarJulgamentos(db)).toEqual([]);
    expect(await listarAcoesIa(db)).toEqual([]);
    // quem estava ligado numa versão anterior cai para Observação, com aviso (nada é enviado até o placar aprovar)
    expect(await lerConfigFollowup(db)).toMatchObject({ dias: 5, automatico: 'observacao', ligado: true, migradoParaObservacao: true });
    expect(await lerConfigReativacao(db)).toMatchObject({ automatico: 'observacao', migradoParaObservacao: true });
    db.close();
    // reabrir (mesma versão) não mexe em nada
    const de_novo = await abrirBanco(nome);
    expect(await listarFollowups(de_novo)).toHaveLength(1);
  });
});

describe('decisões, julgamentos e ações guardados localmente', () => {
  it('a mesma decisão nunca vira dois itens; julgar grava o veredito e o motivo; reabrir volta a pendente', async () => {
    const db = await novoBanco();
    const d = novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: 'ana', nome: 'Ana', contexto: 'o:ana:0', resumo: 'Cobraria agora', texto: 'Oi, Ana!' }, AGORA);
    expect(await registrarDecisao(db, d)).toBe(true);
    expect(await registrarDecisao(db, { ...d, resumo: 'outra' })).toBe(false);
    expect(await listarJulgamentos(db)).toHaveLength(1);
    const j = await julgarDecisao(db, d.id, 'errou', AGORA, { motivo: 'já comprou', decisaoCerta: 'nada' });
    expect(j).toMatchObject({ veredito: 'errou', motivo: 'já comprou', decisaoCerta: 'nada' });
    expect((await listarJulgamentos(db))[0]).toMatchObject({ veredito: 'errou' });
    await reabrirJulgamento(db, d.id);
    expect((await listarJulgamentos(db))[0]).toMatchObject({ veredito: null, motivo: null });
    expect(await julgarDecisao(db, 'inexistente', 'acertou', AGORA)).toBeNull();
  });

  it('guarda só os últimos 200 julgamentos', async () => {
    const db = await novoBanco();
    for (let i = 0; i < MAX_JULGAMENTOS + 15; i++) {
      const d = novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: `c${i}`, nome: `C${i}`, contexto: 'x', resumo: 'r' }, new Date(AGORA.getTime() + i));
      await salvarJulgamento(db, julgar(d, 'acertou', new Date(AGORA.getTime() + i)));
    }
    await registrarDecisao(db, novaDecisao({ origem: 'followup', tipo: 'sair', chave: 'z', nome: 'Z', contexto: 'z', resumo: 'r' }, new Date(AGORA.getTime() + 999_999)));
    const todos = await listarJulgamentos(db);
    expect(todos.filter((j) => j.veredito != null)).toHaveLength(MAX_JULGAMENTOS);
    expect(todos.find((j) => j.chave === 'c0')).toBeUndefined(); // o mais antigo saiu
    expect(todos.find((j) => j.chave === 'c214')).toBeTruthy();
  });

  it('"O que a IA fez": idempotente por id, mais recentes primeiro, máximo de 300', async () => {
    const db = await novoBanco();
    const a = novaAcao({ tipo: 'enviou', origem: 'followup', chave: 'ana', nome: 'Ana', resumo: 'Cobrança 1 enviada', id: 'enviou:followup:o:ana:2026-11-17' }, AGORA);
    expect(await registrarAcaoIa(db, a)).toBe(true);
    expect(await registrarAcaoIa(db, a)).toBe(false);
    for (let i = 0; i < MAX_ACOES_IA + 5; i++) await registrarAcaoIa(db, novaAcao({ tipo: 'nao_enviar', origem: 'reativacao', chave: `c${i}`, nome: `C${i}`, resumo: 'x', desfazer: { tipo: 'nao_enviar' } }, new Date(AGORA.getTime() + (i + 1) * 1000)));
    const lista = await listarAcoesIa(db);
    expect(lista).toHaveLength(MAX_ACOES_IA);
    expect(lista[0].chave).toBe(`c${MAX_ACOES_IA + 4}`);
  });
});

describe('modo global dos automáticos', () => {
  it('Observação exige texto do dono (em algum dos dois); depois liga os dois que têm texto', async () => {
    const db = await novoBanco();
    expect(await definirModo(db, 'observacao')).toMatchObject({ ok: false });
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO });
    expect(await definirModo(db, 'observacao')).toEqual({ ok: true, modo: 'observacao' });
    expect(await lerConfigFollowup(db)).toMatchObject({ automatico: 'observacao', ligado: true, migradoParaObservacao: false });
    expect(await lerConfigReativacao(db)).toMatchObject({ automatico: 'desligado', ligado: false }); // sem texto da etapa 1
    const v = await carregarVisao(db, AGORA);
    expect(v.modo).toBe('observacao');
    expect(modoGlobal({ automatico: 'desligado' }, { automatico: 'desligado' })).toBe('desligado');
  });

  it('Ligado: abaixo de 30 julgamentos explica o que falta; sem confirmar o risco não liga; com o placar aprovado liga uma vez e não pergunta de novo', async () => {
    const db = await novoBanco();
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO });
    await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: TEXTO });
    await definirModo(db, 'observacao');

    const cedo = await definirModo(db, 'ligado', { confirmouRisco: true });
    expect(cedo).toMatchObject({ ok: false });
    expect((cedo as { motivo: string }).motivo).toMatch(/Faltam 30/);
    expect((await lerConfigFollowup(db)).automatico).toBe('observacao');

    for (let i = 0; i < 30; i++) {
      const d = novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: `c${i}`, nome: `C${i}`, contexto: 'x', resumo: 'r' }, new Date(AGORA.getTime() + i));
      await salvarJulgamento(db, julgar(d, i < 28 ? 'acertou' : 'errou', AGORA)); // 28/30 = 93%
    }
    expect(await definirModo(db, 'ligado')).toMatchObject({ ok: false, motivo: expect.stringMatching(/confirmar o risco/) });
    expect(await definirModo(db, 'ligado', { confirmouRisco: true })).toEqual({ ok: true, modo: 'ligado' });
    expect(await lerConfigFollowup(db)).toMatchObject({ automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    expect(await lerConfigReativacao(db)).toMatchObject({ automatico: 'ligado', placarAprovado: true });

    // voltou para Observação e o placar piorou: "pela primeira vez" já passou, liga de novo só com a confirmação
    await definirModo(db, 'observacao');
    for (let i = 0; i < 30; i++) await salvarJulgamento(db, julgar(novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: `d${i}`, nome: 'D', contexto: 'y', resumo: 'r' }, AGORA), 'errou', new Date(AGORA.getTime() + 10_000 + i)));
    expect(await definirModo(db, 'ligado', { confirmouRisco: true })).toEqual({ ok: true, modo: 'ligado' });
  });

  it('90% é o mínimo: 26 de 30 não libera', async () => {
    const db = await novoBanco();
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO });
    for (let i = 0; i < 30; i++) await salvarJulgamento(db, julgar(novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: `c${i}`, nome: 'C', contexto: 'x', resumo: 'r' }, AGORA), i < 26 ? 'acertou' : 'errou', AGORA));
    const r = await definirModo(db, 'ligado', { confirmouRisco: true });
    expect(r).toMatchObject({ ok: false });
    expect((r as { motivo: string }).motivo).toMatch(/87%.*mínimo é 90%/);
  });

  it('Desligado desliga os dois', async () => {
    const db = await novoBanco();
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO });
    await definirModo(db, 'observacao');
    expect(await definirModo(db, 'desligado')).toEqual({ ok: true, modo: 'desligado' });
    expect(await lerConfigFollowup(db)).toMatchObject({ automatico: 'desligado', ligado: false });
  });

  it('ao sair da Observação para Ligado, o que ficou só "no papel" é refeito (follow-up relido; reativação sem envio reavaliada; com envio volta a esperar resposta)', async () => {
    const db = await novoBanco();
    const f: Followup = { id: 'o:ana', campanhaId: 'o', chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', mensagemCampanha: 'Oi', enviadoEm: AGORA.toISOString(), estado: 'revisar', motivo: 'Observação', verificadoEm: AGORA.toISOString(), cobrancas: [], cobrancaModelo: null, cobrancaOrigem: null, observado: true, atualizadoEm: AGORA.toISOString() };
    const deReativacao: Followup = { ...f, id: 'reat:bia', chave: 'bia', nome: 'Bia', origem: 'reativacao' };
    await salvarFollowups(db, [f, deReativacao]);
    const semEnvio = { ...novoRegistro({ chave: 'bia', nome: 'Bia', primeiroNome: 'Bia' }, '2026-10-20', AGORA), estado: 'agendado' as const, observado: true };
    const comEnvio = { ...novoRegistro({ chave: 'caio', nome: 'Caio', primeiroNome: 'Caio' }, '2026-10-20', AGORA), estado: 'respondeu' as const, observado: true, etapa: 1, enviados: [{ etapa: 1, em: '2026-11-01T12:00:00.000Z', texto: 'oi' }] };
    const normal = { ...novoRegistro({ chave: 'dani', nome: 'Dani', primeiroNome: 'Dani' }, '2026-10-20', AGORA), estado: 'agendado' as const };
    await salvarReativacoes(db, [semEnvio, comEnvio, normal]);

    expect(await reiniciarObservados(db)).toBe(4);
    const fs = await listarFollowups(db);
    expect(fs.map((x) => x.id)).toEqual(['o:ana']);
    expect(fs[0]).toMatchObject({ estado: 'monitorando', verificadoEm: null });
    expect(fs[0].observado).toBeUndefined();
    const regs = await listarReativacoes(db);
    expect(regs.map((r) => r.chave).sort()).toEqual(['caio', 'dani']); // Bia (sem envio) foi apagada e será reavaliada
    expect(regs.find((r) => r.chave === 'caio')).toMatchObject({ estado: 'aguardando', leituraRespostaEm: null });
    expect(regs.find((r) => r.chave === 'dani')?.estado).toBe('agendado'); // o que não era de Observação não muda
  });
});

describe('Desfazer (O que a IA fez)', () => {
  const deps = (db: Awaited<ReturnType<typeof novoBanco>>, chamadas: Array<{ taskId: number; agendadoEm: number }>, resposta: { ok: true } | { ok: false; mensagem: string } = { ok: true }) => ({
    db,
    agora: () => AGORA,
    desfazerAgendamento: async (p: { taskId: number; agendadoEm: number }) => {
      chamadas.push(p);
      return resposta;
    },
  });

  it('opt-out automático: tira da lista "Não enviar mais" e dos estados "saiu" (sem reenviar nada)', async () => {
    const db = await novoBanco();
    await marcarNaoEnviar(db, { chave: 'ana', nome: 'Ana', desde: AGORA.toISOString(), motivo: 'pediu para sair (lido pela IA)' });
    await salvarReativacoes(db, [{ ...novoRegistro({ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana' }, '2026-10-20', AGORA), estado: 'saiu' }]);
    await registrarAcaoIa(db, novaAcao({ tipo: 'nao_enviar', origem: 'reativacao', chave: 'ana', nome: 'Ana', resumo: 'Pediu para sair', desfazer: { tipo: 'nao_enviar' } }, AGORA));
    const id = (await listarAcoesIa(db))[0].id;
    const chamadas: Array<{ taskId: number; agendadoEm: number }> = [];
    expect(await desfazerAcao(deps(db, chamadas), id)).toMatchObject({ ok: true });
    expect(await listarNaoEnviar(db)).toEqual([]);
    expect((await listarReativacoes(db))[0].estado).toBe('resolvido');
    expect((await listarAcoesIa(db))[0].desfeitaEm).not.toBeNull();
    expect(chamadas).toEqual([]); // o CRM nem é chamado
    expect(await desfazerAcao(deps(db, chamadas), id)).toMatchObject({ ok: false, mensagem: expect.stringMatching(/já foi desfeita/) });
  });

  it('agendamento criado pela IA: chama o CRM com o id da tarefa e o instante EXATO; o contato volta para "Precisa de você"', async () => {
    const db = await novoBanco();
    const quando = Date.UTC(2027, 0, 1, 12, 0);
    await salvarReativacoes(db, [{ ...novoRegistro({ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana' }, '2026-10-20', AGORA), estado: 'agendado', agendadoPara: new Date(quando).toISOString(), reelegivelEm: '2027-02-01T00:00:00.000Z' }]);
    await registrarAcaoIa(db, novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'ana', nome: 'Ana', resumo: 'Agendou', desfazer: { tipo: 'agendamento', taskId: 42, agendadoEm: quando } }, AGORA));
    const id = (await listarAcoesIa(db))[0].id;
    const chamadas: Array<{ taskId: number; agendadoEm: number }> = [];
    expect(await desfazerAcao(deps(db, chamadas), id)).toMatchObject({ ok: true });
    expect(chamadas).toEqual([{ taskId: 42, agendadoEm: quando }]);
    expect((await listarReativacoes(db))[0]).toMatchObject({ estado: 'precisa', agendadoPara: null });
    expect((await listarFollowups(db)).find((f) => f.id === 'reat:ana')).toMatchObject({ estado: 'revisar' });
    expect((await listarAcoesIa(db))[0].desfeitaEm).not.toBeNull();
  });

  it('o CRM recusa (o atendente mudou a data): nada muda aqui, o aviso fica na ação e dá para tentar de novo', async () => {
    const db = await novoBanco();
    const quando = Date.UTC(2027, 0, 1, 12, 0);
    await salvarReativacoes(db, [{ ...novoRegistro({ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana' }, '2026-10-20', AGORA), estado: 'agendado', agendadoPara: new Date(quando).toISOString() }]);
    await registrarAcaoIa(db, novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'ana', nome: 'Ana', resumo: 'Agendou', desfazer: { tipo: 'agendamento', taskId: 42, agendadoEm: quando } }, AGORA));
    const id = (await listarAcoesIa(db))[0].id;
    const r = await desfazerAcao(deps(db, [], { ok: false, mensagem: 'O agendamento já foi alterado' }), id);
    expect(r).toMatchObject({ ok: false, mensagem: 'O agendamento já foi alterado' });
    const a = (await listarAcoesIa(db))[0];
    expect(a.desfeitaEm).toBeNull();
    expect(a.avisoDesfazer).toBe('O agendamento já foi alterado');
    expect((await listarReativacoes(db))[0].estado).toBe('agendado');
  });

  it('envio não tem desfazer: a ação não aceita', async () => {
    const db = await novoBanco();
    await registrarAcaoIa(db, novaAcao({ tipo: 'enviou', origem: 'followup', chave: 'ana', nome: 'Ana', resumo: 'Cobrança enviada' }, AGORA));
    const r = await desfazerAcao(deps(db, []), (await listarAcoesIa(db))[0].id);
    expect(r).toMatchObject({ ok: false, mensagem: expect.stringMatching(/não tem como ser desfeita/) });
    expect(await registrarEnvio(db, { campanhaId: 'x', chave: 'a', nome: 'A', enviadoEm: AGORA.toISOString(), textoConfere: true })).toBe(true);
  });
});
