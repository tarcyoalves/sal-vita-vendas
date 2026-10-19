import { trpc } from '../../lib/trpc';

/**
 * Sessão do admin da loja Premium. Só chama `premiumAuth.*`: o servidor valida o cookie da
 * loja sem consultar o banco do CRM, então a loja segue de pé mesmo com o CRM fora do ar.
 */
export function usePremiumAuth() {
  const meQuery = trpc.premiumAuth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  return {
    admin: meQuery.data ?? null,
    isAuthenticated: Boolean(meQuery.data),
    loading: meQuery.isLoading,
  };
}
