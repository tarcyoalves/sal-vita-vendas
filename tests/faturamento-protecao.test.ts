import { describe, it, expect } from 'vitest';
import { mergeProtegidoPeloEspelho, pedidoEspelhadoPeloSmbi, atendentePodeRemover } from '../server/lib/faturamentoProtecao';
import { parseBRL } from '../client/src/lib/faturamento/calc';

// O router importa server/db e trpc/auth (exigem env): mesmo workaround de tests/smbi-api.test.ts.
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost.invalid/db';
process.env.JWT_SECRET ??= 'test-jwt-secret';
const { pedidoSchema } = await import('../server/routers/faturamento');

const item = (q: number) => ({ id: 'i', produtoId: null, descricao: 'Sal', quantidade: q, pesoKg: q * 25, valorUnitario: 10, pesoBrutoKg: 0, comissaoFixaPct: null, isentoFrete: false });

// Banco: robô já espelhou o faturamento (37 t, comissão ajustada).
const noBanco = {
  status: 'faturado' as const, faturadoEm: '2026-09-30', itens: [item(1480)], comissaoPct: 3.5,
  valorFretePorUnidade: 120, itensEstimadoSnapshot: [item(1520)], valorPago: 500,
  smbiMovsaiId: '1112', smbiEspelhoFiscal: { movsais: [] } as never,
};
// Cache velho da tela: ainda estimado, com os itens e a % antigos.
const velho = {
  status: 'estimado' as const, faturadoEm: null, itens: [item(1520)], comissaoPct: 3,
  valorFretePorUnidade: 100, itensEstimadoSnapshot: null, valorPago: 0, observacoes: 'nova obs',
};

describe('mergeProtegidoPeloEspelho', () => {
  it('cache velho não desfaz o espelho, mas observações passam', () => {
    const r = mergeProtegidoPeloEspelho(noBanco, velho);
    expect(r.status).toBe('faturado');
    expect(r.faturadoEm).toBe('2026-09-30');
    expect(r.itens).toEqual(noBanco.itens);
    expect(r.comissaoPct).toBe(3.5);
    expect(r.valorFretePorUnidade).toBe(120);
    expect(r.itensEstimadoSnapshot).toEqual(noBanco.itensEstimadoSnapshot);
    expect(r.valorPago).toBe(500);
    expect(r.observacoes).toBe('nova obs');
  });
  it('"Desfazer faturamento" explícito passa, mas comissão e frete continuam os do banco', () => {
    const r = mergeProtegidoPeloEspelho(noBanco, velho, 'desfazer');
    expect(r.status).toBe('estimado');
    expect(r.itens).toEqual(velho.itens);
    expect(r.comissaoPct).toBe(3.5);
    expect(r.valorFretePorUnidade).toBe(120);
  });
  it('"Faturar" explícito só vale se o pedido ainda não está faturado', () => {
    expect(mergeProtegidoPeloEspelho(noBanco, { ...velho, status: 'faturado' as const }, 'faturar').itens).toEqual(noBanco.itens);
    const parcial = { ...noBanco, status: 'estimado' as const, faturadoEm: null };
    const r = mergeProtegidoPeloEspelho(parcial, { ...velho, status: 'faturado' as const, faturadoEm: '2026-10-01' }, 'faturar');
    expect(r.status).toBe('faturado');
    expect(r.faturadoEm).toBe('2026-10-01');
  });
  it('"Desfazer" num pedido não faturado é ignorado', () => {
    const parcial = { ...noBanco, status: 'estimado' as const, faturadoEm: null };
    expect(mergeProtegidoPeloEspelho(parcial, { ...velho, comissaoPct: 9 }, 'desfazer').comissaoPct).toBe(3.5);
  });
  it('pedido novo, sem espelho ou só ligado (não faturado) segue o payload', () => {
    expect(mergeProtegidoPeloEspelho(undefined, velho)).toBe(velho);
    const semEspelho = { ...noBanco, smbiEspelhoFiscal: null, smbiMovsaiId: null };
    expect(mergeProtegidoPeloEspelho(semEspelho, velho)).toBe(velho);
    const soLigado = { ...noBanco, smbiEspelhoFiscal: null, status: 'estimado' as const };
    expect(mergeProtegidoPeloEspelho(soLigado, velho)).toBe(velho);
  });
  it('faturado e ligado ao movsai (sem espelho) também é protegido', () => {
    expect(pedidoEspelhadoPeloSmbi({ smbiEspelhoFiscal: null, smbiMovsaiId: '9', status: 'faturado' })).toBe(true);
    expect(mergeProtegidoPeloEspelho({ ...noBanco, smbiEspelhoFiscal: null }, velho).status).toBe('faturado');
  });
});

describe('atendentePodeRemover', () => {
  it('bloqueia faturado e ligado ao SMBI', () => {
    expect(atendentePodeRemover({ status: 'estimado', smbiMovsaiId: null })).toBe(true);
    expect(atendentePodeRemover({ status: 'faturado', smbiMovsaiId: null })).toBe(false);
    expect(atendentePodeRemover({ status: 'estimado', smbiMovsaiId: '1' })).toBe(false);
  });
});

describe('itens do pedido não aceitam valores negativos', () => {
  const base = {
    id: 'p', taskId: null, sellerId: 1, sellerName: 'A', clienteNome: 'C', cnpj: '', razaoSocial: '', cidade: '', uf: '',
    status: 'estimado', comissaoPct: 3, itensEstimadoSnapshot: null, prazoPagamentoSal: '', prazoPagamentoFrete: '',
    valorFretePorUnidade: 0, observacoes: '', criadoEm: '2026-01-01', faturadoEm: null,
  };
  it('rejeita quantidade, peso e valor negativos', () => {
    expect(pedidoSchema.safeParse({ ...base, itens: [item(5)] }).success).toBe(true);
    expect(pedidoSchema.safeParse({ ...base, itens: [{ ...item(5), quantidade: -1 }] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [{ ...item(5), pesoKg: -1 }] }).success).toBe(false);
    expect(pedidoSchema.safeParse({ ...base, itens: [{ ...item(5), valorUnitario: -1 }] }).success).toBe(false);
  });
});

describe('parseBRL', () => {
  it('ponto com 3 dígitos sem vírgula é milhar', () => {
    expect(parseBRL('1.500')).toBe(1500);
    expect(parseBRL('1.234.567')).toBe(1234567);
  });
  it('ponto com outra quantidade de dígitos é decimal', () => {
    expect(parseBRL('1.5')).toBe(1.5);
    expect(parseBRL('6.00')).toBe(6);
    expect(parseBRL('0.500')).toBe(0.5);
  });
  it('vírgula é decimal e pontos são milhar', () => {
    expect(parseBRL('1,5')).toBe(1.5);
    expect(parseBRL('1.234,56')).toBe(1234.56);
    expect(parseBRL('R$ 1.234,56')).toBe(1234.56);
  });
  it('negativo, vazio e lixo viram 0', () => {
    expect(parseBRL('-5')).toBe(0);
    expect(parseBRL('')).toBe(0);
    expect(parseBRL('abc')).toBe(0);
  });
});

import { isNewContact } from '../server/lib/taskNotes';

describe('isNewContact', () => {
  const nota = 'Ligou, quer 30 t de sal em outubro';
  it('notas iguais (mesmo com espaços diferentes) não contam contato', () => {
    expect(isNewContact(nota, nota)).toBe(false);
    expect(isNewContact(nota, `  ${nota.replace(' ', '   ')}\n`)).toBe(false);
  });
  it('nota alterada e longa conta', () => {
    expect(isNewContact(nota, `${nota} - retornar sexta`)).toBe(true);
    expect(isNewContact(null, nota)).toBe(true);
  });
  it('nota curta ou vazia nunca conta', () => {
    expect(isNewContact(nota, 'ok')).toBe(false);
    expect(isNewContact(nota, '')).toBe(false);
    expect(isNewContact(nota, undefined)).toBe(false);
  });
});
