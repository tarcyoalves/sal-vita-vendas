// Monta a oferta pública da página /atacado a partir de dados já lidos. Função pura, para o teste
// provar que NADA além dos campos abaixo sai para o público (nem remetente, canal, modo, etc.).
import { referenciaMlVigente, type SalesSettings } from './sales';

/** Compra no site: a landing não aceita produto/quantidade por URL, então leva à seção de preços. */
export const LINK_COMPRA_PADRAO = '/sal-vita#preco';

export interface OfertaPublica {
  produto: string;
  kgPorCaixa: number;
  precoSiteCentavos: number;
  disponibilidade: { status: SalesSettings['disponibilidade']['status']; atualizadoEm: string | null };
  referenciaML: { precoCentavos: number; url: string | null; conferidoEm: string } | null;
  simuladorAtivo: boolean;
  linkCompra: string;
}

export function montarOferta(
  caixa: { price: number; kgPerUnit: number },
  settings: Pick<SalesSettings, 'disponibilidade' | 'referenciaMercadoLivre' | 'simuladorRevenda'>,
  agora: Date = new Date(),
): OfertaPublica {
  const kg = caixa.kgPerUnit;
  const ref = settings.referenciaMercadoLivre;
  const preco = ref.precoCentavos;
  const conferidoEm = ref.conferidoEm;
  const vigente = referenciaMlVigente(ref, agora) && preco !== null && conferidoEm !== null;
  return {
    produto: `Caixa Sal Vita ${kg} kg (${kg} × 1 kg)`,
    kgPorCaixa: kg,
    precoSiteCentavos: Math.round(caixa.price * 100),
    disponibilidade: { status: settings.disponibilidade.status, atualizadoEm: settings.disponibilidade.atualizadoEm },
    referenciaML: vigente && preco !== null && conferidoEm !== null
      ? { precoCentavos: preco, url: ref.url, conferidoEm }
      : null,
    simuladorAtivo: settings.simuladorRevenda.ativo,
    linkCompra: LINK_COMPRA_PADRAO,
  };
}
