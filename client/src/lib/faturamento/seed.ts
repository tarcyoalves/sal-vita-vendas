// ── Faturamento & Comissão — dados de exemplo (opcional) ─────────────────────
// Use para popular as telas durante a fase visual. NÃO roda automaticamente —
// chame seedFaturamento() a partir de um botão "carregar exemplo" no admin.

import { produtos, pedidos, comissoes } from './store';
import type { ItemPedido } from './types';

function item(descricao: string, quantidade: number, pesoUnit: number, valor: number): ItemPedido {
  return {
    id: Math.random().toString(36).slice(2, 10),
    produtoId: null,
    descricao,
    quantidade,
    pesoKg: quantidade * pesoUnit,
    valorUnitario: valor,
  };
}

export function seedFaturamento(): void {
  // Catálogo de produtos
  const catalogo = [
    { nome: 'SAL DO FAZENDEIRO MOÍDO 25 KG', pesoUnitarioKg: 25, valorUnitario: 6.0 },
    { nome: 'SAL GROSSO MARINHO 25 KG', pesoUnitarioKg: 25, valorUnitario: 9.5 },
    { nome: 'SAL REFINADO 1 KG (FARDO 30un)', pesoUnitarioKg: 30, valorUnitario: 42.0 },
  ];
  catalogo.forEach((p) => produtos.upsert({ ...p, ativo: true }));

  // Comissões de exemplo (sellerId fictícios — ajuste conforme seus atendentes)
  comissoes.set(1, 5);
  comissoes.set(2, 4);

  // Pedidos de exemplo
  pedidos.upsert({
    taskId: null, sellerId: 1, sellerName: 'Atendente Exemplo 1',
    clienteNome: 'Mercado Central', cnpj: '12.345.678/0001-90',
    razaoSocial: 'Mercado Central LTDA', cidade: 'Mossoró', uf: 'RN',
    status: 'faturado', comissaoPct: 5,
    itens: [item('SAL DO FAZENDEIRO MOÍDO 25 KG', 200, 25, 6.0)],
    itensEstimadoSnapshot: [item('SAL DO FAZENDEIRO MOÍDO 25 KG', 180, 25, 6.0)],
    faturadoEm: new Date().toISOString(),
  });
  pedidos.upsert({
    taskId: null, sellerId: 2, sellerName: 'Atendente Exemplo 2',
    clienteNome: 'Distribuidora Norte', cnpj: '98.765.432/0001-10',
    razaoSocial: 'Distribuidora Norte ME', cidade: 'Natal', uf: 'RN',
    status: 'estimado', comissaoPct: 4,
    itens: [
      item('SAL GROSSO MARINHO 25 KG', 100, 25, 9.5),
      item('SAL REFINADO 1 KG (FARDO 30un)', 50, 30, 42.0),
    ],
  });
}

export function clearFaturamento(): void {
  produtos.list().forEach((p) => produtos.remove(p.id));
  pedidos.list().forEach((p) => pedidos.remove(p.id));
}
