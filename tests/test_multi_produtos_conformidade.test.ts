import { describe, it, expect } from 'vitest';
import {
  espelharPedidoDoSmbi,
  resolverFaturamento,
  faturamentoDoVinculo,
  type PedidoParaFaturar,
  type FaturamentoBody
} from '../server/lib/smbiFaturamento';

describe('Conformidade de Pedidos com Vários Tipos de Produto (Multi-Itens)', () => {
  const pedidoMultiItens: PedidoParaFaturar = {
    id: 'ped_multi_123',
    smbiMovsaiId: '2001',
    status: 'estimado',
    valorFretePorUnidade: 400,
    itens: [
      {
        id: 'item_1',
        descricao: 'SAL DO FAZENDEIRO MOIDO 25 KG',
        quantidade: 600,
        pesoKg: 15000,
        pesoBrutoKg: 15000,
        valorUnitario: 10,
        isentoFrete: false,
        produtoId: 'prod_1',
        comissaoFixaPct: null
      },
      {
        id: 'item_2',
        descricao: 'SAL REFINADO COM IODO VITA 25 KG',
        quantidade: 400,
        pesoKg: 10000,
        pesoBrutoKg: 10000,
        valorUnitario: 12,
        isentoFrete: false,
        produtoId: 'prod_2',
        comissaoFixaPct: null
      }
    ],
    itensEstimadoSnapshot: null
  };

  const faturamentoMulti: FaturamentoBody = {
    movsais: [
      {
        id: '2001',
        pesoKg: 25000,
        nfe: {
          numero: '999',
          chave: '24260951422900000168550010000009991234567890',
          data: '2026-10-01',
          valorTotal: 10800,
          valorSal: 10800
        },
        cte: {
          numero: '998',
          chave: '24260951422900000168570010000009981234567890',
          valorFrete: 10000
        }
      }
    ],
    faturadoEm: '2026-10-01'
  };

  it('1) espelharPedidoDoSmbi RECUSA reescrita automática quando pedido tem mais de 1 item', () => {
    const espelho = espelharPedidoDoSmbi(
      { itens: pedidoMultiItens.itens, valorFretePorUnidade: pedidoMultiItens.valorFretePorUnidade },
      faturamentoMulti.movsais
    );
    expect(espelho).toBeNull();
  });

  it('2) resolverFaturamento fatura o pedido mantendo os múltiplos itens originais intactos', () => {
    const totalAcordado = 20800; // (600*10) + (400*12) + (25t*400)
    const pesoPedidoKg = 25000;

    const { erro, patch } = resolverFaturamento(
      pedidoMultiItens,
      faturamentoMulti,
      totalAcordado,
      new Date('2026-10-01T20:00:00Z'),
      pesoPedidoKg
    );

    expect(erro).toBeNull();
    expect(patch.status).toBe('faturado');
    expect(patch.faturadoEm).toBe('2026-10-01');

    // CONFORMIDADE: itens originais NÃO sofrem reescrita arbitrária
    expect(patch.itens).toBeUndefined();
    expect(patch.itensEstimadoSnapshot).toBeUndefined();

    // Espelho fiscal preenchido corretamente
    expect(patch.smbiEspelhoFiscal).toBeDefined();
    expect(patch.smbiEspelhoFiscal?.totalFiscal).toBe(20800);
    expect(patch.smbiEspelhoFiscal?.pesoFaturadoKg).toBe(25000);
    expect(patch.smbiAlertaDesconto).toBe(false);
  });

  it('3) se comissaoPct for enviado em pedido multi-itens, preserva itens e aplica percentual', () => {
    const faturamentoComComissao: FaturamentoBody = {
      ...faturamentoMulti,
      comissaoPct: 5
    };

    const { erro, patch } = resolverFaturamento(
      pedidoMultiItens,
      faturamentoComComissao,
      20800,
      new Date('2026-10-01T20:00:00Z'),
      25000
    );

    expect(erro).toBeNull();
    expect(patch.comissaoPct).toBe(5);
    expect(patch.itens).toHaveLength(2);
    expect(patch.itens?.[0].quantidade).toBe(600);
    expect(patch.itens?.[0].valorUnitario).toBe(10);
    expect(patch.itens?.[0].comissaoFixaPct).toBe(5);
    expect(patch.itens?.[1].quantidade).toBe(400);
    expect(patch.itens?.[1].valorUnitario).toBe(12);
    expect(patch.itens?.[1].comissaoFixaPct).toBe(5);
  });
});
