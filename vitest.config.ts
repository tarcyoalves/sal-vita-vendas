// Configuração do `npm test` do CRM. Herda tudo de vite.config.ts (alias `@`, plugins)
// e só acrescenta exclusões.
//
// `extensoes/**`: projetos separados (ex.: extensoes/vita-zap), cada um com o seu
// package.json, dependências e testes próprios (`npm test` dentro da pasta). Sem esta
// exclusão o vitest da raiz tentaria rodá-los sem as dependências deles e o portão de
// deploy (`vercel-build`) quebraria.
import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, 'extensoes/**'],
    },
  }),
);
