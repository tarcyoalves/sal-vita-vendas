import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COLUNAS_DO_ROBO, montarSetUpsertPedido, type PedidoValores } from '../server/lib/pedidoUpsert';
import { atendenteEhDonoDoPedido } from '../server/lib/pedidoDono';

const base = {
  id: 'p1', clienteNome: 'Cliente', status: 'aberto', itens: [],
  smbiMovsaiId: 'LIDO-NO-INICIO', numeroNfe: '111', numeroCte: '222', comissaoComercialProtegida: 7,
} as unknown as PedidoValores;

describe('montarSetUpsertPedido — colunas do robô nunca entram no UPDATE', () => {
  it('não lista smbiMovsaiId, numeroNfe nem numeroCte, qualquer que seja o papel', () => {
    for (const isAdmin of [true, false]) {
      const set = montarSetUpsertPedido(base, '2026-10-20T00:00:00Z', { isAdmin });
      for (const c of COLUNAS_DO_ROBO) expect(Object.keys(set)).not.toContain(c);
    }
  });
  it('mantém os campos editáveis pela tela', () => {
    const set = montarSetUpsertPedido(base, 'agora', { isAdmin: false });
    expect(set.atualizadoEm).toBe('agora');
    expect(Object.keys(set)).toEqual(expect.arrayContaining(['clienteNome', 'status', 'itens', 'comissaoPct', 'faturadoEm']));
  });
  it('comissão protegida: só admin com valor explícito', () => {
    expect(montarSetUpsertPedido(base, 'x', { isAdmin: true }).comissaoComercialProtegida).toBe(7);
    expect('comissaoComercialProtegida' in montarSetUpsertPedido(base, 'x', { isAdmin: false })).toBe(false);
    const nulo = { ...base, comissaoComercialProtegida: null } as PedidoValores;
    expect('comissaoComercialProtegida' in montarSetUpsertPedido(nulo, 'x', { isAdmin: true })).toBe(false);
  });
});

describe('upsertPedido (código-fonte)', () => {
  const src = readFileSync('server/routers/faturamento.ts', 'utf8');
  const upsert = src.slice(src.indexOf('  upsertPedido:'), src.indexOf('  listarExcluidos:'));
  it('o set do banco não copia mais colunas do robô', () => {
    expect(upsert).not.toMatch(/smbiMovsaiId:\s*values\./);
    expect(upsert).not.toMatch(/numeroNfe:\s*values\./);
    expect(upsert).not.toMatch(/numeroCte:\s*values\./);
    expect(upsert).toMatch(/montarSetUpsertPedido\(values/);
  });
  it('pedido existente faz UPDATE; INSERT só para pedido novo (PED-n não pula número)', () => {
    expect(upsert).toMatch(/if \(existing\) \{\s*\[row\] = await db\.update\(fatOrders\)/);
    expect(upsert).toMatch(/if \(!row\) \{\s*\[row\] = await db\.insert\(fatOrders\)/);
  });
  it('não mexeu no DDL/versão do schema', () => {
    expect(src).not.toMatch(/SCHEMA_VERSION/);
  });
});

describe('atendenteEhDonoDoPedido — null não é dono de null', () => {
  it('só é dono com sellerId definido e igual', () => {
    expect(atendenteEhDonoDoPedido(5, 5)).toBe(true);
    expect(atendenteEhDonoDoPedido(5, 6)).toBe(false);
    expect(atendenteEhDonoDoPedido(null, null)).toBe(false);
    expect(atendenteEhDonoDoPedido(null, 5)).toBe(false);
    expect(atendenteEhDonoDoPedido(5, null)).toBe(false);
    expect(atendenteEhDonoDoPedido(undefined, undefined)).toBe(false);
  });
  it('removePedido, enviarPedidoEmail e baixarPedidoPdf usam a regra', () => {
    const src = readFileSync('server/routers/faturamento.ts', 'utf8');
    expect(src.match(/!atendenteEhDonoDoPedido\(mySellerId, (existing|pedido)\.sellerId\)/g)).toHaveLength(3);
    expect(src).not.toMatch(/\.sellerId !== mySellerId\) \{\s*throw new TRPCError\(\{ code: 'FORBIDDEN', message: 'Pedido de outro atendente' \}\);\s*\}\s*if \(!atendentePodeRemover/);
  });
});
