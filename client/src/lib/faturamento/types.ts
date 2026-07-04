// ── Faturamento & Comissão — tipos (fase visual) ─────────────────────────────
// Estes tipos espelham o que virará tabela no banco em 02/07. Mantê-los estáveis
// permite trocar o store de localStorage por tRPC sem mexer nas telas.

export interface Produto {
  id: string;
  nome: string;            // ex: "SAL DO FAZENDEIRO MOÍDO 25 KG"
  pesoUnitarioKg: number;  // ex: 25
  valorUnitario: number;   // R$ por unidade/saco, ex: 6.00
  ativo: boolean;
  criadoEm: string;        // ISO
  // null/undefined = usa a comissão normal do atendente. Setado = sempre essa %
  // neste produto (ex: SAL MARINHO MOIDO INTEGRAL VITA PREMIUM 10X1 KG = sempre 10%).
  comissaoFixaPct?: number | null;
  isentoFrete?: boolean;   // true = frete nunca soma no preço deste produto
}

export interface ItemPedido {
  id: string;
  produtoId: string | null; // null = item digitado à mão (sem produto do catálogo)
  descricao: string;        // nome do produto
  quantidade: number;       // nº de unidades/sacos
  pesoKg: number;           // peso líquido, informativo (default = quantidade × pesoUnitário), editável
  valorUnitario: number;    // R$ por unidade. totalLinha = quantidade × valorUnitario
  pesoBrutoKg: number;      // peso bruto (com embalagem), informativo
  // Snapshot da regra do produto no momento em que foi adicionado — nunca
  // recalculado retroativamente, mesmo se o produto mudar depois.
  comissaoFixaPct: number | null;
  isentoFrete: boolean;
}

export type StatusPedido = 'estimado' | 'faturado';

export interface Pedido {
  id: string;
  taskId: number | null;    // vínculo com a task/lead que foi convertida
  sellerId: number | null;  // atendente dono do pedido
  sellerName: string;
  // Dados do cliente (puxados da task na criação; editáveis)
  clienteNome: string;
  cnpj: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  status: StatusPedido;
  comissaoPct: number;      // snapshot da % do atendente no momento da criação
  itens: ItemPedido[];      // valores atuais (estimados; viram reais ao faturar)
  // Congelado no momento de faturar, para comparar estimado × faturado no relatório.
  itensEstimadoSnapshot: ItemPedido[] | null;
  prazoPagamentoSal: string;
  prazoPagamentoFrete: string;
  valorFretePorUnidade: number; // R$ por TONELADA — o valor por saco/fardo é calculado a partir do peso de cada item
  observacoes: string;
  criadoEm: string;         // ISO
  faturadoEm: string | null;// ISO quando marcado como embarcado/faturado
  valorPago: number;        // valor efetivamente pago pelo cliente até o momento
  // Revisão do admin — informativa, não bloqueia nenhuma ação do atendente.
  aprovadoEm: string | null;
  aprovadoPor: string | null;
  createdByUserId: number | null;
  createdByRole: string | null;
}

// sellerId -> percentual de comissão (ex: 5 = 5%)
export type ComissaoMap = Record<number, number>;

// Linha agregada por atendente no panorama do admin.
export interface ResumoAtendente {
  sellerId: number | null;
  sellerName: string;
  comissaoPct: number;
  totalVendido: number;     // Σ totais estimados (pipeline do mês)
  totalEmbarcado: number;   // Σ totais faturados (realizado no mês)
  comissaoPrevista: number; // totalVendido × pct
  comissaoEmbarcada: number;// totalEmbarcado × pct (o que de fato se paga)
  qtdPedidos: number;
  qtdFaturados: number;
  pesoTotalKg: number;      // Σ peso estimado dos pedidos do mês (kg)
  pesoEmbarcadoKg: number;  // Σ peso dos pedidos faturados no mês (kg)
}

export interface FiltroMes {
  ano: number;
  mes: number; // 0-11 (Date.getMonth())
}
