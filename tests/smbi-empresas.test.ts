import { describe, it, expect } from 'vitest';
import { SMBI_EMPRESAS, SMBI_EMPRESA_CNPJS, empresaPorCnpj, formatarCnpj } from '../shared/smbiEmpresas';
import { cnpjValido } from '../server/lib/smbiCadastro';

describe('catálogo de empresas do SMBI', () => {
  it('tem as duas empresas, com CNPJ válido, e só a A S homologada', () => {
    expect(SMBI_EMPRESAS.map((e) => e.curto)).toEqual(['A S Comércio', 'C Alves']);
    for (const e of SMBI_EMPRESAS) expect(cnpjValido(e.cnpj)).toBe(true);
    expect(empresaPorCnpj('51422900000168')?.homologada).toBe(true);
    expect(empresaPorCnpj('49748258000160')?.homologada).toBe(false);
    expect(SMBI_EMPRESA_CNPJS).toEqual(['51422900000168', '49748258000160']);
  });

  it('empresaPorCnpj aceita só a string exata (sem reparar)', () => {
    expect(empresaPorCnpj('51422900000168')?.curto).toBe('A S Comércio');
    expect(empresaPorCnpj('49748258000160')?.curto).toBe('C Alves');
    for (const ruim of ['51.422.900/0001-68', ' 51422900000168', '51422900000168 ', '5142290000016', '051422900000168', 'a s', '']) {
      expect(empresaPorCnpj(ruim)).toBeNull();
    }
  });

  it('entrada ausente ou de outro tipo é inválida', () => {
    for (const ruim of [undefined, null, 51422900000168, {}, [], true]) expect(empresaPorCnpj(ruim)).toBeNull();
  });

  it('o CNPJ do comprador nunca é confundido com empresa', () => {
    expect(empresaPorCnpj('11222333000181')).toBeNull();
    expect(empresaPorCnpj('12345678000100')).toBeNull();
  });

  it('a formatação é só de apresentação e não altera entrada inválida', () => {
    expect(formatarCnpj('51422900000168')).toBe('51.422.900/0001-68');
    expect(formatarCnpj('49748258000160')).toBe('49.748.258/0001-60');
    expect(formatarCnpj('123')).toBe('123');
    expect(empresaPorCnpj(formatarCnpj('51422900000168'))).toBeNull();
  });
});
