import { describe, expect, it } from 'vitest';
import {
  seloPendenciaSmbi, contarPendenciasPorMotivo, textoPedidoCadastroHermes, clienteNaoCadastrado,
} from '../client/src/lib/faturamento/smbiPendencia';
import { SMBI_MOTIVO_CODIGOS } from '../shared/smbiEstados';

describe('seloPendenciaSmbi', () => {
  it('cliente não cadastrado', () => {
    const s = seloPendenciaSmbi({ smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'CLIENTE_NAO_CADASTRADO' });
    expect(s?.rotulo).toBe('Cliente não cadastrado no SMBI');
    expect(s?.tom).toBe('warning');
  });
  it('todos os motivos têm selo; outros usam "Pendente: "', () => {
    for (const c of SMBI_MOTIVO_CODIGOS) {
      const s = seloPendenciaSmbi({ smbiEstado: 'ERRO', smbiMotivoCodigo: c });
      expect(s).not.toBeNull();
      if (c !== 'CLIENTE_NAO_CADASTRADO') expect(s!.rotulo.startsWith('Pendente: ')).toBe(true);
    }
  });
  it('sem selo quando vinculado, criado, sem estado ou motivo desconhecido', () => {
    expect(seloPendenciaSmbi({ smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'PRECO_INVALIDO', smbiMovsaiId: '10' })).toBeNull();
    expect(seloPendenciaSmbi({ smbiEstado: 'CRIADO', smbiMotivoCodigo: 'PRECO_INVALIDO' })).toBeNull();
    expect(seloPendenciaSmbi({ smbiMotivoCodigo: 'PRECO_INVALIDO' })).toBeNull();
    expect(seloPendenciaSmbi({ smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'XYZ' })).toBeNull();
    expect(clienteNaoCadastrado({})).toBe(false);
  });
  it('conta por motivo', () => {
    const r = contarPendenciasPorMotivo([
      { smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'CLIENTE_NAO_CADASTRADO' },
      { smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'CLIENTE_NAO_CADASTRADO' },
      { smbiEstado: 'ERRO', smbiMotivoCodigo: 'CRIACAO_FALHOU' },
      {},
    ]);
    expect(r).toEqual({ CLIENTE_NAO_CADASTRADO: 2, CRIACAO_FALHOU: 1 });
  });
});

describe('textoPedidoCadastroHermes', () => {
  it('preenche dados reais e mantém as travas', () => {
    const t = textoPedidoCadastroHermes({
      id: 'abc', cnpj: '12345678000195', razaoSocial: 'Mercado X Ltda', clienteNome: 'X', cidade: 'Natal', uf: 'RN', sellerName: 'Ana',
    });
    expect(t).toContain('CNPJ 12.345.678/0001-95, Mercado X Ltda, Natal/RN, atendente Ana. Pedido CRM abc.');
    expect(t).toContain('só grave depois do meu "cadastra"');
    expect(t).toContain('Não crie o pedido');
  });
  it('tolera campos vazios', () => {
    const t = textoPedidoCadastroHermes({ id: '1', cnpj: '', clienteNome: 'Fulano', sellerName: '' });
    expect(t).toContain('CNPJ não informado, Fulano, cidade/UF não informadas, atendente não informado');
  });
});
