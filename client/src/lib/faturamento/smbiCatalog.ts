// ── Catálogo e Mapeamento Oficial SMBI ───────────────────────────────────────
// Mapeamento direto com as tabelas do ERP SMBI (smbi.com.br) para integração
// autônoma de criação de pedidos via robô (smbi_criar_pedido_express.mjs).

export interface SmbiCondicaoPagamento {
  cod: string;
  descricao: string;
  parcelas: number;
}

export const SMBI_CONDICOES_PAGAMENTO: SmbiCondicaoPagamento[] = [
  { cod: '1', descricao: 'A VISTA', parcelas: 1 },
  { cod: '11', descricao: '15 DIAS', parcelas: 1 },
  { cod: '5', descricao: '20 DIAS', parcelas: 1 },
  { cod: '2', descricao: '30 DIAS', parcelas: 1 },
  { cod: '7', descricao: '30/45 DIAS', parcelas: 2 },
  { cod: '3', descricao: '30/60 DIAS', parcelas: 2 },
  { cod: '10', descricao: '30/45/60 DIAS', parcelas: 3 },
  { cod: '46', descricao: '30/60/90 DIAS', parcelas: 3 },
  { cod: '4', descricao: '45 DIAS', parcelas: 1 },
  { cod: '6', descricao: '60 DIAS', parcelas: 1 },
];

export interface SmbiProdutoRef {
  smbiId: string;
  nome: string;
  pesoUnitarioKg: number;
  tipoEmbalagem: 'saco' | 'fardo' | 'bigbag';
}

export const SMBI_PRODUTOS_CATALOGO: SmbiProdutoRef[] = [
  { smbiId: '1', nome: 'SAL DO FAZENDEIRO MOIDO 25 KG', pesoUnitarioKg: 25, tipoEmbalagem: 'saco' },
  { smbiId: '2', nome: 'SAL DO FAZENDEIRO TRITURADO 25 KG', pesoUnitarioKg: 25, tipoEmbalagem: 'saco' },
  { smbiId: '3', nome: 'SAL DO FAZENDEIRO GROSSO 25 KG', pesoUnitarioKg: 25, tipoEmbalagem: 'saco' },
  { smbiId: '51', nome: 'SAL REFINADO COM IODO VITA 25 KG', pesoUnitarioKg: 25, tipoEmbalagem: 'saco' },
  { smbiId: '52', nome: 'SAL REFINADO SEM IODO VITA 25 KG', pesoUnitarioKg: 25, tipoEmbalagem: 'saco' },
  { smbiId: '53', nome: 'SAL GRANULADO COM IODO VITA 25 KG', pesoUnitarioKg: 25, tipoEmbalagem: 'saco' },
  { smbiId: '54', nome: 'SAL GRANULADO SEM IODO VITA 25 KG', pesoUnitarioKg: 25, tipoEmbalagem: 'saco' },
  { smbiId: '43', nome: 'SAL REFINADO SAL VITA 30X1 KG', pesoUnitarioKg: 30, tipoEmbalagem: 'fardo' },
  { smbiId: '44', nome: 'SAL REFINADO SAL VITA 10X1 KG', pesoUnitarioKg: 10, tipoEmbalagem: 'fardo' },
  { smbiId: '65', nome: 'SAL MOIDO MARINHO INTEGRAL VITA PREMIUM 10X1 KG', pesoUnitarioKg: 10, tipoEmbalagem: 'fardo' },
  { smbiId: '68', nome: 'SAL REFINADO COM IODO EM BIG BAG 1.000 KG', pesoUnitarioKg: 1000, tipoEmbalagem: 'bigbag' },
];
