import { describe, it, expect } from 'vitest';
import { calcularVeredito, relatorioValido, type GrupoAnotacao } from '../shared/credito';

const g = (q = 0, consultado = true): GrupoAnotacao => ({ consultado, quantidade: q, valorTotal: null, itens: [] });
const base = (valor: number | null, over: Partial<Record<string, GrupoAnotacao>> = {}) => ({
  score: { valor, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null },
  anotacoes: { protestos: g(), pendenciasFinanceiras: g(), chequesSemFundo: g(), acoesJudiciais: g(), falenciaRecuperacao: g(), ...over },
});

describe('veredito de crédito', () => {
  it('score baixo ou protesto reprova a prazo', () => {
    expect(calcularVeredito(base(320)).veredito).toBe('REPROVADO_A_PRAZO');
    expect(calcularVeredito(base(800, { protestos: g(1) })).veredito).toBe('REPROVADO_A_PRAZO');
  });
  it('faixa intermediária, pendência ou score ausente é restrição', () => {
    expect(calcularVeredito(base(550)).veredito).toBe('COM_RESTRICAO');
    expect(calcularVeredito(base(900, { pendenciasFinanceiras: g(2) })).veredito).toBe('COM_RESTRICAO');
    expect(calcularVeredito(base(null)).veredito).toBe('COM_RESTRICAO');
  });
  it('limpo aprova; grupo não consultado não conta como nada consta nem como restrição', () => {
    expect(calcularVeredito(base(620)).veredito).toBe('APROVADO');
    expect(calcularVeredito(base(620, { protestos: g(3, false) })).veredito).toBe('APROVADO');
  });
  it('pendências acima de R$ 5.000 reprovam a prazo; até R$ 5.000 ou sem valor só restringem', () => {
    const pend = (q: number, valorTotal: number | null): GrupoAnotacao => ({ consultado: true, quantidade: q, valorTotal, itens: [] });
    expect(calcularVeredito(base(900, { pendenciasFinanceiras: pend(1, 5000.01) })).veredito).toBe('REPROVADO_A_PRAZO');
    expect(calcularVeredito(base(900, { pendenciasFinanceiras: pend(1, 5000) })).veredito).toBe('COM_RESTRICAO');
    expect(calcularVeredito(base(900, { pendenciasFinanceiras: pend(2, null) })).veredito).toBe('COM_RESTRICAO');
    expect(calcularVeredito(base(900, { pendenciasFinanceiras: { consultado: false, quantidade: 3, valorTotal: 9999, itens: [] } })).veredito).toBe('APROVADO');
  });
  it('cache de 30 dias', () => {
    const agora = new Date('2026-10-15T12:00:00Z');
    expect(relatorioValido('2026-09-20T12:00:00Z', agora)).toBe(true);
    expect(relatorioValido('2026-09-10T12:00:00Z', agora)).toBe(false);
  });
});
