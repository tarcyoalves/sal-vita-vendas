import { describe, it, expect } from 'vitest';
import { cnpjsDeClientesAtivos } from '../server/lib/radar/clientesAtivos';

const cand = (cnpj: string, ...phones: string[]) => ({ cnpj, phones });

describe('cnpjsDeClientesAtivos', () => {
  it('pedido faturado marca o CNPJ (com ou sem pontuação)', () => {
    const r = cnpjsDeClientesAtivos([cand('11222333000181'), cand('99888777000166')], ['11.222.333/0001-81'], []);
    expect([...r]).toEqual(['11222333000181']);
  });

  it('tarefa convertida marca por CNPJ ou por telefone', () => {
    const r = cnpjsDeClientesAtivos(
      [cand('11111111000191', '84999990000'), cand('22222222000191', '84988887777'), cand('33333333000191')],
      [],
      [{ cnpj: '11111111000191', phone: null }, { cnpj: null, phone: '(84) 98888-7777' }],
    );
    expect([...r].sort()).toEqual(['11111111000191', '22222222000191']);
  });

  it('lead que ninguém comprou nem converteu não é ativo', () => {
    expect(cnpjsDeClientesAtivos([cand('44444444000191', '84911112222')], [], []).size).toBe(0);
  });

  it('valores vazios ou nulos não marcam ninguém', () => {
    expect(cnpjsDeClientesAtivos([cand('55555555000191', '84900001111')], [null, undefined, ''], [{ cnpj: null, phone: null }]).size).toBe(0);
  });
});
