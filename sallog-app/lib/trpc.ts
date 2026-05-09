import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Type-only import from the standalone SalLog API
import type { AppRouter } from '../../sallog/api/routers';

export const trpc = createTRPCReact<AppRouter>();

const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://sallog.salvitarn.com.br'; // SalLog API — separate from lembretes/premium

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/api/trpc`,
        transformer: superjson,
        async headers() {
          const token = await SecureStore.getItemAsync('sallog_token');
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
