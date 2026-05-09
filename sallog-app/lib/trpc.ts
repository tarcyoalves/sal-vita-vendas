import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Type-only import — does not pull in server code at runtime
import type { AppRouter } from '../../server/routers';

export const trpc = createTRPCReact<AppRouter>();

const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'https://lembretes.salvitarn.com.br';

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
