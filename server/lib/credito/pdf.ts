// PLACEHOLDER: este arquivo é de outro agente e será substituído na integração.
import type { RelatorioCredito, Veredito } from '../../../shared/credito';

export async function gerarPdfCredito(
  _relatorio: RelatorioCredito,
  _meta: { veredito: Veredito; motivos: string[]; consultadoPor: string | null },
): Promise<Buffer> {
  throw new Error('PDF ainda não implementado');
}
