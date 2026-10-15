import { cn } from '../../lib/utils';
import { estadoSemaforo, type CorSemaforoTela } from '../../lib/credito/regras';
import type { Veredito } from '../../../../shared/credito';

const COR: Record<CorSemaforoTela, string> = {
  VERDE: 'bg-green-500', AMARELO: 'bg-amber-400', VERMELHO: 'bg-red-600', CINZA: 'bg-slate-300',
};
const TAMANHO = { sm: 'size-3', md: 'size-4', lg: 'size-6' } as const;

export interface CreditoSemaforoProps {
  /** null/undefined = sem análise (cinza). */
  relatorio?: { veredito: Veredito; valido: boolean; simulado?: boolean } | null;
  size?: keyof typeof TAMANHO;
  className?: string;
}

/** Bolinha do semáforo de crédito. O texto vai em `title` (mouse) e `aria-label` (leitor de tela). */
export function CreditoSemaforo({ relatorio, size = 'md', className }: CreditoSemaforoProps) {
  const e = estadoSemaforo(relatorio);
  return (
    <span
      role="img"
      aria-label={e.rotulo}
      title={e.rotulo}
      className={cn(
        'inline-block shrink-0 rounded-full align-middle',
        COR[e.cor], TAMANHO[size],
        // simulação: contorno tracejado, para nunca parecer um dado real
        relatorio?.simulado && 'outline outline-2 outline-offset-1 outline-dashed outline-slate-600',
        className,
      )}
    />
  );
}
