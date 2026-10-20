import { describe, expect, it } from 'vitest';
import { piorVeredito } from '../shared/credito';
import { itemDoCatalogo } from '../shared/creditoCatalogo';
import {
  chipsDosProdutos, escolherEfetivo, planoDeCache, resumirResultados, resumoParaBloqueio, validarProdutos, type ResultadoProduto,
} from '../server/lib/credito/produtos';
import { montarSemaforos } from '../server/lib/credito/semaforos';
import { decidirBloqueioCredito } from '../server/lib/credito/bloqueioSmbi';
import { mapeadorDoProduto, MAPEADORES } from '../server/lib/credito/provedores/mapeadores';
import { CATALOGO_CREDITO } from '../shared/creditoCatalogo';
import { tetoPorConsultaValido } from '../server/lib/credito/politica';

const AGORA = new Date('2026-10-16T12:00:00Z');
const L = (produto: string, veredito: string, consultadoEm: string, extra = {}) =>
  ({ produto, veredito, consultadoEm, provedor: 'boavista_apifull', custoReais: 1, id: 1, ...extra });

describe('validarProdutos', () => {
  it('sem produtos = só o boavista (compatibilidade)', () => {
    const r = validarProdutos(undefined);
    expect(r.ok && r.itens.map((i) => i.chave)).toEqual(['boavista']);
  });
  it('aceita 1 a 3 chaves medidas', () => {
    expect(validarProdutos(['serasa_premium']).ok).toBe(true);
    expect(validarProdutos(['boavista', 'serasa_premium', 'define_risco']).ok).toBe(true);
  });
  it('recusa vazio, mais de 3, repetido e desconhecido', () => {
    expect(validarProdutos([])).toMatchObject({ ok: false });
    expect(validarProdutos(['boavista', 'serasa_premium', 'define_risco', 'cndt']).ok).toBe(false);
    expect(validarProdutos(['boavista', 'boavista'])).toMatchObject({ ok: false, erro: expect.stringContaining('repetida') });
    expect(validarProdutos(['xpto'])).toMatchObject({ ok: false, erro: expect.stringContaining('desconhecida') });
  });
  it('recusa item com custo null (BAD_REQUEST no router)', () => {
    for (const c of ['serasa_basica', 'protesto_nacional', 'cenprot', 'cnpj_cadastro', 'cndt']) {
      expect(validarProdutos(['boavista', c])).toMatchObject({ ok: false, erro: expect.stringContaining('não medido') });
    }
  });
});

describe('teto por consulta', () => {
  it('valida o que o admin pode gravar', () => {
    expect(tetoPorConsultaValido(30)).toBe(true);
    expect(tetoPorConsultaValido(0)).toBe(false);
    expect(tetoPorConsultaValido(5000)).toBe(false);
  });
});

describe('pior veredito', () => {
  it('REPROVADO > COM_RESTRICAO > APROVADO', () => {
    expect(piorVeredito(['APROVADO', 'COM_RESTRICAO'])).toBe('COM_RESTRICAO');
    expect(piorVeredito(['APROVADO', 'REPROVADO_A_PRAZO', 'COM_RESTRICAO'])).toBe('REPROVADO_A_PRAZO');
    expect(piorVeredito(['APROVADO'])).toBe('APROVADO');
    expect(piorVeredito([])).toBeNull();
  });
  it('efetivo considera só relatórios válidos (<30 dias) de qualquer produto', () => {
    const linhas = [
      L('boavista', 'APROVADO', '2026-10-15T00:00:00Z'),
      L('serasa_premium', 'REPROVADO_A_PRAZO', '2026-10-10T00:00:00Z'),
      L('define_risco', 'REPROVADO_A_PRAZO', '2026-08-01T00:00:00Z'), // vencido: não conta
    ];
    const e = escolherEfetivo(linhas, AGORA);
    expect(e).toMatchObject({ veredito: 'REPROVADO_A_PRAZO', valido: true });
    expect(e?.principal.produto).toBe('serasa_premium');
  });
  it('sem nenhum válido: o mais recente, marcado vencido', () => {
    const e = escolherEfetivo([L('boavista', 'APROVADO', '2026-08-01T00:00:00Z'), L('serasa_premium', 'REPROVADO_A_PRAZO', '2026-07-01T00:00:00Z')], AGORA);
    expect(e).toMatchObject({ veredito: 'APROVADO', valido: false });
    expect(escolherEfetivo([], AGORA)).toBeNull();
  });
  it('semáforos usam o pior vigente por documento', () => {
    const r = montarSemaforos([
      { documento: 'A', veredito: 'APROVADO', consultadoEm: '2026-10-15T00:00:00Z', provedor: 'boavista_apifull', produto: 'boavista' },
      { documento: 'A', veredito: 'COM_RESTRICAO', consultadoEm: '2026-10-12T00:00:00Z', provedor: 'boavista_apifull', produto: 'serasa_premium' },
      { documento: 'B', veredito: 'REPROVADO_A_PRAZO', consultadoEm: '2026-05-01T00:00:00Z', provedor: 'boavista_apifull' },
    ], AGORA);
    expect(r.A).toMatchObject({ veredito: 'COM_RESTRICAO', semaforo: 'AMARELO', valido: true });
    expect(r.B).toMatchObject({ veredito: 'REPROVADO_A_PRAZO', valido: false });
  });
  it('o bloqueio no SMBI usa o pior vigente', () => {
    const linhas = [L('boavista', 'APROVADO', '2026-10-15T00:00:00Z'), L('serasa_premium', 'REPROVADO_A_PRAZO', '2026-10-10T00:00:00Z')];
    const ultimo = resumoParaBloqueio(linhas, AGORA);
    expect(ultimo?.veredito).toBe('REPROVADO_A_PRAZO');
    const d = decidirBloqueioCredito({ bloqueioAtivo: true, prazoSal: '30 dias', prazoFrete: null, ultimoRelatorio: ultimo, liberadoEm: null }, AGORA);
    expect(d.bloquear).toBe(true);
    // só o Boa Vista aprovado: segue
    const ok = resumoParaBloqueio([linhas[0]], AGORA);
    expect(decidirBloqueioCredito({ bloqueioAtivo: true, prazoSal: '30 dias', prazoFrete: null, ultimoRelatorio: ok, liberadoEm: null }, AGORA).bloquear).toBe(false);
    expect(resumoParaBloqueio([], AGORA)).toBeNull();
  });
});

describe('chips por produto', () => {
  it('um chip por produto (o mais recente), na ordem do catálogo, com legado mapeado', () => {
    const chips = chipsDosProdutos([
      L('serasa_premium', 'COM_RESTRICAO', '2026-10-14T00:00:00Z', { custoReais: 6.72 }),
      L('Boa Vista SCPC (API Full)', 'APROVADO', '2026-10-13T00:00:00Z', { custoReais: 2.75 }),
      L('boavista', 'REPROVADO_A_PRAZO', '2026-08-01T00:00:00Z'), // mais antigo do mesmo produto: ignorado
    ], AGORA);
    expect(chips.map((c) => c.produto)).toEqual(['boavista', 'serasa_premium']);
    expect(chips[0]).toMatchObject({ nome: 'Consulta simples', valido: true, veredito: 'APROVADO', custoReais: 2.75 });
  });
});

describe('cache por (documento, produto)', () => {
  const itens = ['boavista', 'serasa_premium'].map((c) => itemDoCatalogo(c)!);
  it('reaproveita só o produto que tem relatório válido do mesmo provedor', () => {
    const { reaproveita } = planoDeCache(itens, [L('boavista', 'APROVADO', '2026-10-10T00:00:00Z')], { provedorAtual: 'boavista_apifull', agora: AGORA });
    expect(reaproveita).toEqual({ boavista: true, serasa_premium: false });
  });
  it('forçar nova, vencido e outro provedor consultam de novo', () => {
    const ls = [L('boavista', 'APROVADO', '2026-10-10T00:00:00Z')];
    expect(planoDeCache(itens, ls, { provedorAtual: 'boavista_apifull', forcarNova: true, agora: AGORA }).reaproveita.boavista).toBe(false);
    expect(planoDeCache(itens, [L('boavista', 'APROVADO', '2026-08-01T00:00:00Z')], { provedorAtual: 'boavista_apifull', agora: AGORA }).reaproveita.boavista).toBe(false);
    expect(planoDeCache(itens, ls, { provedorAtual: 'simulado', agora: AGORA }).reaproveita.boavista).toBe(false);
  });
  it('relatório legado (nome do provedor) vale como boavista', () => {
    const { reaproveita } = planoDeCache(itens, [L('Boa Vista SCPC (API Full)', 'APROVADO', '2026-10-10T00:00:00Z')], { provedorAtual: 'boavista_apifull', agora: AGORA });
    expect(reaproveita.boavista).toBe(true);
  });
});

describe('resultado parcial', () => {
  const ok = (produto: string, extra: Partial<ResultadoProduto> = {}): ResultadoProduto => ({ produto, ok: true, reaproveitado: false, cobrado: true, custoReais: 2.75, ...extra });
  const falha = (produto: string, extra: Partial<ResultadoProduto> = {}): ResultadoProduto => ({ produto, ok: false, reaproveitado: false, cobrado: false, custoReais: 0, erro: 'x', ...extra });
  it('tudo certo: não é parcial e soma só o cobrado', () => {
    expect(resumirResultados([ok('boavista'), ok('serasa_premium', { custoReais: 6.72 }), ok('define_risco', { reaproveitado: true, cobrado: false, custoReais: 0 })]))
      .toEqual({ custoCobradoReais: 9.47, falhas: 0, parcial: false, falhouSemCobranca: false });
  });
  it('um falhou e outro já cobrou: parcial, mostrando a cobrança', () => {
    const r = resumirResultados([ok('boavista'), falha('serasa_premium')]);
    expect(r).toMatchObject({ custoCobradoReais: 2.75, falhas: 1, parcial: true, falhouSemCobranca: false });
  });
  it('tudo falhou sem cobrança: o router responde com erro', () => {
    expect(resumirResultados([falha('boavista'), falha('serasa_premium')])).toMatchObject({ falhouSemCobranca: true, custoCobradoReais: 0 });
  });
  it('tudo falhou, mas houve cobrança sem relatório gravado: nunca vira erro "limpo"', () => {
    const r = resumirResultados([falha('boavista', { cobrado: true, custoReais: 2.75 }), falha('serasa_premium')]);
    expect(r).toMatchObject({ falhouSemCobranca: false, parcial: true, custoCobradoReais: 2.75 });
  });
});

describe('mapeadores por produto', () => {
  it('há um mapeador para cada item do catálogo (hoje todos defensivos)', () => {
    for (const i of CATALOGO_CREDITO) expect(MAPEADORES[i.chave]).toBeTypeOf('function');
    const m = mapeadorDoProduto('serasa_premium')({ dados: { score: 640 } });
    expect(m.score.valor).toBe(640);
    expect(m.anotacoes.protestos.consultado).toBe(false);
    expect(mapeadorDoProduto('desconhecido')({ dados: {} }).score.valor).toBeNull();
  });
});
