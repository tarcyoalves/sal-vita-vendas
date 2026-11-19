// "Não enviar mais" PENDENTE de sincronização (0.7.62): bloqueia na hora neste computador, sobrevive a recarregar, e só vira "para a
// equipe" depois que o CRM CONFIRMA aquele contato. Falha total, falha parcial, nova tentativa, persistência, segundo perfil, desfazer.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, listarNaoEnviar, marcarNaoEnviar, type Banco } from '../src/shared/banco';
import { estadoDoOptOut, LOTE_OPT_OUT, pendentesDeSincronia, ROTULO_BLOQUEIO_EQUIPE, ROTULO_BLOQUEIO_LOCAL, textoAoMarcarNaoEnviar } from '../src/shared/equipe';
import { ServicoCrm } from '../src/shared/servico-crm';
import {
  conferirEquipeAntesDeEnviar,
  desmarcarNaEquipe,
  falhaDoOptOut,
  indisponibilidadeDaEquipe,
  sincronizarOptOuts,
  zerarEstadoDaEquipe,
  type DependenciasEquipe,
} from '../src/sidepanel/sincronia-equipe';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, type CrmFalso } from './ajuda/crm-falso';

let agora = new Date('2026-11-18T15:00:00.000Z').getTime();
let n = 0;
let crm: CrmFalso;

const local = (nome: string) => ({ chave: nome.toLowerCase(), nome, desde: '2026-11-05T12:00:00.000Z', motivo: 'não enviar mais' });

async function perfil(nomeBanco?: string): Promise<{ db: Banco; nome: string; d: DependenciasEquipe }> {
  const servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte, () => agora);
  await servico.definirUrl(BASE);
  await servico.entrar(EMAIL, SENHA);
  const nome = nomeBanco ?? `optout-${Date.now()}-${(n += 1)}`;
  const db = await abrirBanco(nome);
  return { db, nome, d: { db, repo: servico, telefoneDe: () => null, agora: () => new Date(agora) } };
}

beforeEach(() => {
  zerarEstadoDaEquipe();
  agora = new Date('2026-11-18T15:00:00.000Z').getTime();
  crm = criarCrmFalso([], () => agora);
});

describe('estado por contato (puro)', () => {
  it('só crm === true é "para a equipe"; o resto é "neste computador · sincronização pendente" com o motivo da falha', () => {
    expect(estadoDoOptOut({ crm: true })).toMatchObject({ tipo: 'equipe', rotulo: ROTULO_BLOQUEIO_EQUIPE, detalhe: null });
    expect(estadoDoOptOut({})).toMatchObject({ tipo: 'neste_computador', rotulo: ROTULO_BLOQUEIO_LOCAL, detalhe: null });
    expect(estadoDoOptOut({ crm: false }, 'CRM indisponível (x)').detalhe).toBe('última falha: CRM indisponível (x)');
    expect(pendentesDeSincronia([{ crm: true }, {}, { crm: false }])).toBe(2);
  });
  it('a mensagem ao marcar não diz "equipe" antes da confirmação', () => {
    const t = textoAoMarcarNaoEnviar(2);
    expect(t).not.toMatch(/equipe/i);
    expect(t).toMatch(/neste computador/);
    expect(t).toMatch(/pendente/);
  });
});

describe('falha total', () => {
  it('CRM fora do ar: continua bloqueado aqui, fica PENDENTE com o motivo e a função reporta pendentes', async () => {
    const { db, d } = await perfil();
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    crm.semRede = true;
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: false, pendentes: 1 });
    const [ana] = await listarNaoEnviar(db);
    expect(ana.crm).not.toBe(true); // ainda vale neste computador
    expect(estadoDoOptOut(ana, falhaDoOptOut('ana')).rotulo).toBe(ROTULO_BLOQUEIO_LOCAL);
    expect(falhaDoOptOut('ana')).toMatch(/CRM indisponível/);
    expect(indisponibilidadeDaEquipe()).toMatch(/CRM indisponível/);
  });

  it('a leitura funciona mas GRAVAR falha: o erro NÃO é apagado e não devolve ok (o bug antigo)', async () => {
    const { db, d } = await perfil();
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    crm.marcarOptOutsFalhaNa = 1;
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r.ok).toBe(false);
    expect(r.pendentes).toBe(1);
    expect(indisponibilidadeDaEquipe()).not.toBeNull();
    expect(falhaDoOptOut('ana')).not.toBeNull();
    expect(crm.equipe.optOuts).toEqual([]);
    expect((await listarNaoEnviar(db))[0].crm).not.toBe(true);
  });
});

describe('nova tentativa com sucesso', () => {
  it('depois da falha, a próxima sincronização confirma, limpa o erro e vira "para a equipe"', async () => {
    const { db, d } = await perfil();
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    crm.marcarOptOutsFalhaNa = 1;
    expect((await sincronizarOptOuts(d, { forcar: true })).ok).toBe(false);
    crm.marcarOptOutsFalhaNa = null;
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: true, enviados: 1, pendentes: 0 });
    const [ana] = await listarNaoEnviar(db);
    expect(estadoDoOptOut(ana, falhaDoOptOut('ana')).tipo).toBe('equipe');
    expect(falhaDoOptOut('ana')).toBeNull();
    expect(indisponibilidadeDaEquipe()).toBeNull();
    expect(crm.equipe.optOuts.map((o) => o.nome)).toEqual(['Ana']);
  });
});

describe('falha parcial', () => {
  it('o CRM aceita o lote mas só guarda parte: só os confirmados viram "para a equipe"', async () => {
    const { db, d } = await perfil();
    for (const nome of ['Ana', 'Bia', 'Caio']) await marcarNaoEnviar(db, local(nome), { semAvisar: true });
    crm.marcarOptOutsIgnorar = (nome) => nome === 'Bia';
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: false, pendentes: 1, enviados: 2 });
    const porChave = new Map((await listarNaoEnviar(db)).map((x) => [x.chave, x]));
    expect(porChave.get('ana')?.crm).toBe(true);
    expect(porChave.get('caio')?.crm).toBe(true);
    expect(porChave.get('bia')?.crm).not.toBe(true);
    expect(falhaDoOptOut('bia')).not.toBeNull();
    expect(falhaDoOptOut('ana')).toBeNull();
    // Bia segue bloqueada aqui; a nova tentativa a confirma.
    crm.marcarOptOutsIgnorar = null;
    expect(await sincronizarOptOuts(d, { forcar: true })).toMatchObject({ ok: true, enviados: 1 });
    expect((await listarNaoEnviar(db)).every((x) => x.crm === true)).toBe(true);
  });

  it('vários lotes e o segundo falha: o primeiro lote fica confirmado, o resto pendente', async () => {
    const { db, d } = await perfil();
    const total = LOTE_OPT_OUT + 1;
    for (let i = 0; i < total; i += 1) await marcarNaoEnviar(db, local(`c${String(i).padStart(3, '0')}`), { semAvisar: true });
    crm.marcarOptOutsFalhaNa = 2;
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: false, pendentes: 1, enviados: LOTE_OPT_OUT });
    const lista = await listarNaoEnviar(db);
    expect(lista.filter((x) => x.crm === true)).toHaveLength(LOTE_OPT_OUT);
    expect(lista.filter((x) => x.crm !== true).map((x) => x.chave)).toEqual([`c${String(LOTE_OPT_OUT).padStart(3, '0')}`]);
    crm.marcarOptOutsFalhaNa = null;
    expect(await sincronizarOptOuts(d, { forcar: true })).toMatchObject({ ok: true, enviados: 1 });
  });
});

describe('persistência', () => {
  it('a pendência sobrevive a fechar o painel e reabrir o IndexedDB; a próxima sincronização tenta de novo', async () => {
    const a = await perfil();
    await marcarNaoEnviar(a.db, local('Ana'), { semAvisar: true });
    crm.semRede = true;
    expect((await sincronizarOptOuts(a.d, { forcar: true })).ok).toBe(false);
    a.db.close();
    zerarEstadoDaEquipe(); // painel novo: a memória do painel anterior se foi
    crm.semRede = false;
    const b = await perfil(a.nome);
    crm.semRede = true; // o CRM ainda está fora do ar quando o painel reabre
    const [ana] = await listarNaoEnviar(b.db);
    expect(ana).toMatchObject({ chave: 'ana' });
    expect(ana.crm).not.toBe(true);
    expect(estadoDoOptOut(ana).tipo).toBe('neste_computador');
    crm.semRede = false;
    expect(await sincronizarOptOuts(b.d, { forcar: true })).toMatchObject({ ok: true, enviados: 1 });
    expect((await listarNaoEnviar(b.db))[0].crm).toBe(true);
  });
});

describe('segundo perfil (outro computador) contra o mesmo CRM', () => {
  it('só enxerga o bloqueio depois que o CRM confirmou o contato', async () => {
    const A = await perfil();
    const B = await perfil();
    await marcarNaoEnviar(A.db, local('Ana'), { semAvisar: true });
    crm.marcarOptOutsFalhaNa = 1;
    expect((await sincronizarOptOuts(A.d, { forcar: true })).ok).toBe(false);
    // B ainda não vê nada: o CRM não confirmou.
    zerarEstadoDaEquipe();
    expect(await sincronizarOptOuts(B.d, { forcar: true })).toMatchObject({ ok: true, novos: 0 });
    expect(await listarNaoEnviar(B.db)).toEqual([]);
    expect(await conferirEquipeAntesDeEnviar(B.d, { nome: 'Ana', chave: 'ana' }, 14)).toEqual({ tipo: 'livre' });
    // A tenta de novo e o CRM confirma.
    crm.marcarOptOutsFalhaNa = null;
    expect(await sincronizarOptOuts(A.d, { forcar: true })).toMatchObject({ ok: true, enviados: 1 });
    // Agora B vê, já como "para a equipe".
    expect(await sincronizarOptOuts(B.d, { forcar: true })).toMatchObject({ ok: true, novos: 1 });
    const [ana] = await listarNaoEnviar(B.db);
    expect(estadoDoOptOut(ana).tipo).toBe('equipe');
    expect(await conferirEquipeAntesDeEnviar(B.d, { nome: 'Ana', chave: 'ana' }, 14)).toMatchObject({ tipo: 'bloqueado', status: 'nao_enviar' });
  });

  it('confirmação parcial: o segundo perfil vê só os confirmados', async () => {
    const A = await perfil();
    const B = await perfil();
    for (const nome of ['Ana', 'Bia']) await marcarNaoEnviar(A.db, local(nome), { semAvisar: true });
    crm.marcarOptOutsIgnorar = (nome) => nome === 'Bia';
    await sincronizarOptOuts(A.d, { forcar: true });
    zerarEstadoDaEquipe();
    await sincronizarOptOuts(B.d, { forcar: true });
    expect((await listarNaoEnviar(B.db)).map((x) => x.chave)).toEqual(['ana']);
  });
});

describe('desfazer', () => {
  it('confirmado + CRM fora do ar: nada muda e continua "para a equipe"; pendente: sai só daqui', async () => {
    const { db, d } = await perfil();
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    await sincronizarOptOuts(d, { forcar: true });
    await marcarNaoEnviar(db, local('Bia'), { semAvisar: true });
    crm.semRede = true;
    const ana = await desmarcarNaEquipe(d, 'ana');
    expect(ana.ok).toBe(false);
    const depois = new Map((await listarNaoEnviar(db)).map((x) => [x.chave, x]));
    expect(estadoDoOptOut(depois.get('ana') as never).tipo).toBe('equipe');
    expect(estadoDoOptOut(depois.get('bia') as never).tipo).toBe('neste_computador');
    expect((await desmarcarNaEquipe(d, 'bia')).ok).toBe(true);
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['ana']);
    crm.semRede = false;
    expect((await desmarcarNaEquipe(d, 'ana')).ok).toBe(true);
    expect(crm.equipe.optOuts).toEqual([]);
  });
});
