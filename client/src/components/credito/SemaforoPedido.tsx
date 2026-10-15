import { soDigitos } from '../../lib/credito/documento';
import type { Veredito } from '../../../../shared/credito';
import { CreditoSemaforo } from './CreditoSemaforo';

export type MapaSemaforos = Record<string, { veredito: Veredito; valido: boolean; simulado: boolean }>;

/** Bolinha pequena ao lado da razão social nas listas; os dados vêm de UMA query (`credito.semaforos`). */
export function SemaforoPedido({ semaforos, cnpj }: { semaforos: MapaSemaforos | undefined; cnpj: string | null | undefined }) {
  return <CreditoSemaforo size="sm" relatorio={semaforos?.[soDigitos(cnpj)] ?? null} className="mr-1.5" />;
}
