import { trpc } from '../../lib/trpc';

/** Modelo de mensagem salvo do atendente (null = usa o padrão da empresa). */
export function useContactTemplate(): string | null {
  const q = trpc.prospectingRadar.messageTemplate.useQuery(undefined, { staleTime: 5 * 60_000 });
  return q.data?.template ?? null;
}
