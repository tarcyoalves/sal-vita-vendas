// Cotação de frete para o vendedor virtual. `quoteShipping` (server/routers/shipping.ts) não é exportada;
// em vez de editar o arquivo, usamos o MESMO caminho que a loja usa para cotar (shipping.calculate, procedure
// pública sem middleware) por um caller interno. Mesmo código, mesmos preços do checkout.
import { MAX_CAIXAS_COTACAO, type CotacaoFrete } from './ferramentas';

/** A caixa de 10 kg: o shipping trabalha em kg (`quantity` = caixas × 10, `productId: 'caixa'`). */
export async function cotarFreteCaixas(cep: string, quantidadeCaixas: number): Promise<CotacaoFrete> {
  // shipping.calculate aceita até 100 kg. Acima disso a ferramenta já encaminhou para uma pessoa;
  // isto é só a rede de segurança (nunca cotar parcial nem mandar um peso que a loja recusa).
  if (!Number.isInteger(quantidadeCaixas) || quantidadeCaixas < 1 || quantidadeCaixas > MAX_CAIXAS_COTACAO) {
    throw new Error(`frete: ${quantidadeCaixas} caixas fora do limite cotável (1 a ${MAX_CAIXAS_COTACAO})`);
  }
  const { shippingRouter } = await import('../../../routers/shipping');
  // A procedure `calculate` não lê o contexto; o caller só exige o objeto.
  const caller = shippingRouter.createCaller({} as never);
  const r = await caller.calculate({ cep, quantity: quantidadeCaixas * 10, productId: 'caixa' });
  return { source: r.source, options: r.options };
}

/** Dados do produto vendido (preço do CATALOG do servidor, nunca do navegador nem do modelo). */
export async function produtoCaixa(): Promise<{ nome: string; precoCentavos: number }> {
  const { CATALOG } = await import('../../../routers/shipping');
  return { nome: CATALOG.caixa.name, precoCentavos: Math.round(CATALOG.caixa.price * 100) };
}
