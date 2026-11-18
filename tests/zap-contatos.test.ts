import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

// "Não enviar mais" e contato registrado do time (Vita Zap 0.7.60). O banco é mockado; o SQL gerado é conferido.
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'teste-jwt-secret-apenas-para-vitest-0123456789';
  return {
    /** Respostas das próximas leituras (limit) e dos returning, na ordem. */
    leituras: [] as unknown[][],
    retornos: [] as unknown[][],
    valores: [] as Array<unknown>,
    conflitos: [] as Array<Record<string, unknown>>,
    wheres: [] as unknown[],
    limites: [] as number[],
    chamadas: [] as string[],
  };
});
vi.mock('../server/db', () => {
  const cadeia: Record<string, unknown> = {
    select: () => cadeia,
    from: () => cadeia,
    where: (w: unknown) => (m.wheres.push(w), cadeia),
    orderBy: () => cadeia,
    limit: (n: number) => (m.limites.push(n), Promise.resolve(m.leituras.shift() ?? [])),
    insert: () => (m.chamadas.push('insert'), cadeia),
    values: (v: unknown) => (m.valores.push(v), cadeia),
    onConflictDoNothing: (c: Record<string, unknown>) => (m.conflitos.push({ tipo: 'nada', ...c }), cadeia),
    onConflictDoUpdate: (c: Record<string, unknown>) => (m.conflitos.push({ tipo: 'atualiza', ...c }), Promise.resolve([])),
    delete: () => (m.chamadas.push('delete'), cadeia),
    returning: () => Promise.resolve(m.retornos.shift() ?? []),
  };
  return { db: cadeia, sql: vi.fn() };
});

import { zapContatosRouter } from '../server/routers/zapContatos';
import {
  chaveDoContato,
  chaveTelefone,
  casarContatados,
  dataDoEnvio,
  ENVIO_MAX_IDADE_MS,
  LIMITE_LISTA_OPT_OUT,
  LIMITE_LOTE_CONSULTA,
  LIMITE_LOTE_OPT_OUT,
  mesmoContato,
  prepararEnvios,
} from '../server/lib/zapContatos';

const H1 = 'a'.repeat(32);
const H2 = 'b'.repeat(32);
const chamador = (id = 7) => zapContatosRouter.createCaller({ user: { id, email: 'a@b.c', name: 'Ana', role: 'user', mustChangePassword: false }, req: { headers: {} }, res: {} } as never);
const semUsuario = () => zapContatosRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as never);
const sqlDe = (x: unknown) => new PgDialect().sqlToQuery(x as never).sql;

beforeEach(() => {
  m.leituras = [];
  m.retornos = [];
  m.valores = [];
  m.conflitos = [];
  m.wheres = [];
  m.limites = [];
  m.chamadas = [];
});

describe('chaveTelefone', () => {
  it('canoniza: com ou sem DDI, com ou sem o 9 extra, formatado', () => {
    expect(chaveTelefone('(84) 99999-0000')).toBe('558499990000');
    expect(chaveTelefone('84999990000')).toBe('558499990000');
    expect(chaveTelefone('+55 84 99999-0000')).toBe('558499990000');
    expect(chaveTelefone('558499990000')).toBe('558499990000'); // sem o 9: igual
    expect(chaveTelefone('5584999990000')).toBe('558499990000');
  });
  it('inválidos e curtos viram null; número de outro país com + é mantido', () => {
    expect(chaveTelefone('99990000')).toBeNull();
    expect(chaveTelefone('')).toBeNull();
    expect(chaveTelefone(null)).toBeNull();
    expect(chaveTelefone('abc')).toBeNull();
    expect(chaveTelefone('+1 415 555 0100')).toBe('14155550100');
  });
  it('a chave do contato é o telefone, ou n:<hash> sem telefone', () => {
    expect(chaveDoContato('558499990000', H1)).toBe('558499990000');
    expect(chaveDoContato(null, H1)).toBe(`n:${H1}`);
  });
});

describe('mesmoContato', () => {
  it('os dois com telefone: vale o telefone (mesmo nome, telefones diferentes = pessoas diferentes)', () => {
    expect(mesmoContato({ telefone: '5584111', nomeHash: H1 }, { telefone: '5584111', nomeHash: H2 })).toBe(true);
    expect(mesmoContato({ telefone: '5584111', nomeHash: H1 }, { telefone: '5584222', nomeHash: H1 })).toBe(false);
  });
  it('um sem telefone: vale o hash do nome', () => {
    expect(mesmoContato({ telefone: null, nomeHash: H1 }, { telefone: '5584111', nomeHash: H1 })).toBe(true);
    expect(mesmoContato({ telefone: '5584111', nomeHash: H2 }, { telefone: null, nomeHash: H1 })).toBe(false);
  });
});

describe('dataDoEnvio e prepararEnvios', () => {
  const agora = new Date('2026-11-18T15:00:00Z');
  it('sem data ou no futuro: agora; velha demais: descarta; senão mantém', () => {
    expect(dataDoEnvio(undefined, agora)).toBe(agora);
    expect(dataDoEnvio(new Date(agora.getTime() + 3_600_000), agora)).toBe(agora);
    expect(dataDoEnvio(new Date(agora.getTime() - ENVIO_MAX_IDADE_MS - 1000), agora)).toBeNull();
    const ok = new Date('2026-11-10T10:00:00Z');
    expect(dataDoEnvio(ok, agora)).toBe(ok);
  });
  it('junta repetidos da mesma chave+tipo (fica o mais recente) e não mistura tipos', () => {
    const r = prepararEnvios(
      [
        { telefone: '84999990000', nomeHash: H1, tipo: 'cobranca', enviadoEm: new Date('2026-11-10T10:00:00Z') },
        { telefone: '558499990000', nomeHash: H1, tipo: 'cobranca', enviadoEm: new Date('2026-11-12T10:00:00Z') },
        { nomeHash: H2, tipo: 'campanha', enviadoEm: new Date('2026-11-12T10:00:00Z') },
        { telefone: '84999990000', nomeHash: H1, tipo: 'reativacao', enviadoEm: new Date('2026-11-01T10:00:00Z') },
      ],
      agora,
    );
    expect(r).toHaveLength(3);
    expect(r.find((x) => x.tipo === 'cobranca')?.enviadoEm.toISOString()).toBe('2026-11-12T10:00:00.000Z');
    expect(r.find((x) => x.tipo === 'campanha')?.chave).toBe(`n:${H2}`);
  });
});

describe('casarContatados', () => {
  const t0 = new Date('2026-11-10T10:00:00Z');
  const t1 = new Date('2026-11-12T10:00:00Z');
  it('devolve o mais recente de cada tipo e marca quem enviou', () => {
    const r = casarContatados(
      [{ telefone: '558499990000', nomeHash: H1 }, { telefone: null, nomeHash: H2 }],
      [
        { telefone: '558499990000', nomeHash: H1, tipo: 'cobranca', enviadoEm: t0, userId: 3 },
        { telefone: null, nomeHash: H1, tipo: 'cobranca', enviadoEm: t1, userId: 7 },
        { telefone: null, nomeHash: H2, tipo: 'campanha', enviadoEm: t0, userId: 3 },
      ],
      7,
    );
    expect(r).toEqual([
      { i: 0, tipo: 'cobranca', enviadoEm: t1, meu: true },
      { i: 1, tipo: 'campanha', enviadoEm: t0, meu: false },
    ]);
  });
  it('mesmo nome com telefone diferente não casa', () => {
    expect(casarContatados([{ telefone: '5584111', nomeHash: H1 }], [{ telefone: '5584222', nomeHash: H1, tipo: 'campanha', enviadoEm: t0, userId: 1 }], 7)).toEqual([]);
  });
});

describe('zapContatos.listarOptOuts', () => {
  it('exige login', async () => {
    await expect(semUsuario().listarOptOuts()).rejects.toThrow();
  });
  it('lista todos do time, com limite e aviso de truncamento', async () => {
    m.leituras = [[{ chave: '558499990000', telefone: '558499990000', nomeHash: H1, nome: 'Ana', userId: 3, origem: 'ia', criadoEm: new Date() }]];
    const r = await chamador().listarOptOuts();
    expect(r.itens).toHaveLength(1);
    expect(r.truncado).toBe(false);
    expect(m.limites[0]).toBe(LIMITE_LISTA_OPT_OUT + 1);
    m.leituras = [Array.from({ length: LIMITE_LISTA_OPT_OUT + 1 }, (_, i) => ({ chave: `n:${i}`, telefone: null, nomeHash: H1, nome: null, userId: 1, origem: 'manual', criadoEm: new Date() }))];
    const t = await chamador().listarOptOuts();
    expect(t.truncado).toBe(true);
    expect(t.itens).toHaveLength(LIMITE_LISTA_OPT_OUT);
  });
});

describe('zapContatos.marcarOptOuts', () => {
  it('grava com quem marcou, canoniza o telefone, não duplica a chave e é idempotente (ON CONFLICT DO NOTHING na chave)', async () => {
    m.retornos = [[{ id: 1 }, { id: 2 }]];
    const r = await chamador(7).marcarOptOuts({
      itens: [
        { telefone: '(84) 99999-0000', nomeHash: H1, nome: 'Ana', origem: 'ia' },
        { telefone: '558499990000', nomeHash: H1, nome: 'Ana', origem: 'manual' },
        { nomeHash: H2, nome: 'Pedro', origem: 'campanha' },
      ],
    });
    expect(r).toEqual({ recebidos: 2, criados: 2 });
    const linhas = m.valores[0] as Array<Record<string, unknown>>;
    expect(linhas.map((l) => l.chave)).toEqual(['558499990000', `n:${H2}`]);
    expect(linhas.every((l) => l.userId === 7)).toBe(true);
    expect(linhas[0]).toMatchObject({ origem: 'ia', nomeHash: H1, telefone: '558499990000' });
    expect(m.conflitos[0].tipo).toBe('nada');
  });
  it('rejeita lote vazio, grande demais, hash inválido e origem desconhecida', async () => {
    await expect(chamador().marcarOptOuts({ itens: [] })).rejects.toThrow();
    await expect(chamador().marcarOptOuts({ itens: Array.from({ length: LIMITE_LOTE_OPT_OUT + 1 }, () => ({ nomeHash: H1, origem: 'manual' as const })) })).rejects.toThrow();
    await expect(chamador().marcarOptOuts({ itens: [{ nomeHash: 'curto', origem: 'manual' }] })).rejects.toThrow();
    await expect(chamador().marcarOptOuts({ itens: [{ nomeHash: H1, origem: 'hacker' as never }] })).rejects.toThrow();
    expect(m.chamadas).toEqual([]);
  });
  it('a data informada no futuro vira agora', async () => {
    m.retornos = [[{ id: 1 }]];
    await chamador().marcarOptOuts({ itens: [{ nomeHash: H1, origem: 'manual', marcadoEm: new Date(Date.now() + 86_400_000) }] });
    const l = (m.valores[0] as Array<{ criadoEm: Date }>)[0];
    expect(l.criadoEm.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('zapContatos.desmarcarOptOuts', () => {
  it('remove por telefone (ou nome, quando uma das pontas não tem telefone) e conta', async () => {
    m.retornos = [[{ id: 1 }]];
    const r = await chamador().desmarcarOptOuts({ itens: [{ telefone: '84999990000', nomeHash: H1 }, { nomeHash: H2 }] });
    expect(r).toEqual({ removidos: 1 });
    const q = sqlDe(m.wheres[0]);
    expect(q).toMatch(/"telefone" in \(/i);
    expect(q).toMatch(/"nome_hash" in \(/i);
    expect(q).toMatch(/"telefone" IS NULL/);
  });
  it('só com telefone: não gera IN vazio', async () => {
    m.retornos = [[]];
    await chamador().desmarcarOptOuts({ itens: [{ telefone: '84999990000', nomeHash: H1 }] });
    expect(sqlDe(m.wheres[0])).not.toMatch(/in \(\)/i);
  });
});

describe('zapContatos.registrarEnvios', () => {
  it('upsert por (chave, tipo) que só avança no tempo, com quem enviou', async () => {
    const r = await chamador(7).registrarEnvios({
      itens: [
        { telefone: '84999990000', nomeHash: H1, tipo: 'cobranca' },
        { telefone: '84999990000', nomeHash: H1, tipo: 'cobranca' },
        { nomeHash: H2, tipo: 'campanha', enviadoEm: new Date(Date.now() - 86_400_000) },
      ],
    });
    expect(r).toEqual({ recebidos: 3, gravados: 2 });
    const linhas = m.valores[0] as Array<Record<string, unknown>>;
    expect(linhas.every((l) => l.userId === 7)).toBe(true);
    const c = m.conflitos[0] as { tipo: string; target: unknown[]; set: Record<string, unknown> };
    expect(c.tipo).toBe('atualiza');
    expect(c.target).toHaveLength(2);
    expect(sqlDe(c.set.enviadoEm)).toMatch(/GREATEST\(excluded\.enviado_em/);
    expect(sqlDe(c.set.userId)).toMatch(/CASE WHEN excluded\.enviado_em >/);
  });
  it('descarta envio velho demais sem tocar no banco', async () => {
    const r = await chamador().registrarEnvios({ itens: [{ nomeHash: H1, tipo: 'campanha', enviadoEm: new Date(Date.now() - ENVIO_MAX_IDADE_MS - 86_400_000) }] });
    expect(r.gravados).toBe(0);
    expect(m.chamadas).toEqual([]);
  });
  it('rejeita tipo desconhecido (nunca texto de mensagem) e campos extras são ignorados', async () => {
    await expect(chamador().registrarEnvios({ itens: [{ nomeHash: H1, tipo: 'mensagem' as never }] })).rejects.toThrow();
    await chamador().registrarEnvios({ itens: [{ nomeHash: H1, tipo: 'campanha', texto: 'olá cliente' } as never] });
    expect(JSON.stringify(m.valores)).not.toContain('olá cliente');
  });
});

describe('zapContatos.consultarContatados', () => {
  it('filtra pelos últimos N dias (para qualquer atendente) e devolve só quem foi contatado', async () => {
    const t = new Date(Date.now() - 2 * 86_400_000);
    m.leituras = [[{ telefone: '558499990000', nomeHash: H1, tipo: 'cobranca', enviadoEm: t, userId: 3 }]];
    const r = await chamador(7).consultarContatados({ contatos: [{ telefone: '84999990000', nomeHash: H1 }, { nomeHash: H2 }], dias: 14 });
    expect(r.itens).toEqual([{ i: 0, tipo: 'cobranca', enviadoEm: t, meu: false }]);
    expect(r.truncado).toBe(false);
    const q = sqlDe(m.wheres[0]);
    expect(q).toMatch(/"enviado_em" >= \$/);
    expect(q).toMatch(/"telefone" in \(/i);
    expect(q).toMatch(/"nome_hash" in \(/i);
    expect(q).not.toMatch(/"user_id"/); // não filtra por atendente
  });
  it('só nomes: não gera IN vazio de telefone', async () => {
    await chamador().consultarContatados({ contatos: [{ nomeHash: H1 }], dias: 7 });
    expect(sqlDe(m.wheres[0])).not.toMatch(/in \(\)/i);
  });
  it('limites: lote, dias e vazio', async () => {
    await expect(chamador().consultarContatados({ contatos: [], dias: 14 })).rejects.toThrow();
    await expect(chamador().consultarContatados({ contatos: Array.from({ length: LIMITE_LOTE_CONSULTA + 1 }, () => ({ nomeHash: H1 })), dias: 14 })).rejects.toThrow();
    await expect(chamador().consultarContatados({ contatos: [{ nomeHash: H1 }], dias: 0 })).rejects.toThrow();
    await expect(chamador().consultarContatados({ contatos: [{ nomeHash: H1 }], dias: 9999 })).rejects.toThrow();
  });
});
