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

import { analisarSinais, atenuacaoDoItem, calcularVeredito as cv } from '../shared/credito';
describe('pontos de atenção do dono', () => {
  const AGORA = new Date('2026-10-15T12:00:00Z');
  const grupo = (itens: { data: string | null; descricao: string; valor: number | null; local: string | null; credor?: string | null }[]) =>
    ({ consultado: true, quantidade: itens.length, valorTotal: itens.reduce((s, i) => s + (i.valor ?? 0), 0), itens });
  const vazio = { consultado: true, quantidade: 0, valorTotal: null, itens: [] };
  const anot = (over = {}) => ({ protestos: vazio, pendenciasFinanceiras: vazio, chequesSemFundo: vazio, acoesJudiciais: vazio, falenciaRecuperacao: vazio, ...over });
  const score = (valor: number) => ({ valor, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null });

  it('restrição de órgão público, antiga ou pequena não reprova sozinha', () => {
    expect(atenuacaoDoItem({ data: '2026-09-01', descricao: 'Multa', valor: 9000, local: null, credor: 'ANTT' }, AGORA)).toBe('órgão público');
    expect(atenuacaoDoItem({ data: '2022-01-10', descricao: 'Duplicata', valor: 9000, local: null }, AGORA)).toMatch(/antiga/);
    expect(atenuacaoDoItem({ data: '2026-09-01', descricao: 'Duplicata', valor: 300, local: null }, AGORA)).toBe('valor pequeno');
    const r = cv({ score: score(700), anotacoes: anot({ protestos: grupo([{ data: '2026-09-01', descricao: 'Multa', valor: 9000, local: null, credor: 'ANTT' }]) }) }, AGORA);
    expect(r.veredito).toBe('COM_RESTRICAO');
    const real = cv({ score: score(700), anotacoes: anot({ protestos: grupo([{ data: '2026-09-01', descricao: 'Duplicata', valor: 9000, local: null }]) }) }, AGORA);
    expect(real.veredito).toBe('REPROVADO_A_PRAZO');
  });
  it('empresa nova, muitas consultas e sócio recente viram alerta e impedem aprovação automática', () => {
    const base = { score: score(800), anotacoes: anot() };
    expect(cv({ ...base, cadastro: { fundacao: '2026-03-01' } as never }, AGORA).veredito).toBe('COM_RESTRICAO');
    const consultas = Array.from({ length: 5 }, (_, i) => ({ data: `2026-10-0${i + 1}`, consultante: 'X', quantidade: 1 }));
    expect(analisarSinais({ ...base, consultasRecentes: consultas }, AGORA)[0].codigo).toBe('MUITAS_CONSULTAS');
    expect(cv({ ...base, consultasRecentes: consultas }, AGORA).veredito).toBe('COM_RESTRICAO');
    const socios = [{ documento: null, nome: 'Fulano', entrada: '2026-08-01', participacao: 50, cargo: null }];
    expect(analisarSinais({ ...base, socios }, AGORA)[0]).toMatchObject({ codigo: 'SOCIO_RECENTE', nivel: 'ALERTA' });
  });
  it('sinais positivos não alteram veredito', () => {
    const r = { score: score(800), anotacoes: anot(), cadastro: { fundacao: '1994-09-27' } as never,
      comportamento: { ultimaCompraEm: '2026-10-01', relacionamentoMaisAntigoEm: '1997-03-01', fontesConsultadas: 10, pagamentoPontualPct: 97 } };
    const s = analisarSinais(r, AGORA).map((x) => x.codigo);
    expect(s).toEqual(['EMPRESA_CONSOLIDADA', 'COMPRANDO_NORMALMENTE']);
    expect(cv(r, AGORA).veredito).toBe('APROVADO');
  });
  it('sem compras recentes é atenção', () => {
    const s = analisarSinais({ anotacoes: anot(), comportamento: { ultimaCompraEm: '2026-01-01', relacionamentoMaisAntigoEm: null, fontesConsultadas: null, pagamentoPontualPct: null } }, AGORA);
    expect(s[0].codigo).toBe('SEM_COMPRAS_RECENTES');
  });
});
