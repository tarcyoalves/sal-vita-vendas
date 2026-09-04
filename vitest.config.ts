import { defineConfig } from 'vitest/config';

// Runner dos testes. Separado do vite.config.ts porque aquele é o build do
// client (root em `client/`, PWA, chunking) e não tem nada a ver com testes.
//
// `tsconfig.json` exclui `tests/` de propósito: o typecheck é portão de deploy e
// os testes rodam por outro caminho. Quem checa os tipos daqui é o próprio
// Vitest ao transformar o arquivo.
export default defineConfig({
  test: {
    // Node, não jsdom: o que se testa aqui é lógica pura (datas, filtros,
    // classificação). Nenhum teste monta componente. Se um dia precisar de DOM,
    // instale jsdom e troque o environment neste arquivo.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // As datas nos testes são locais de propósito — o bug histórico de lembrete
    // era justamente conversão para UTC. Fixar o fuso mantém o teste honesto em
    // qualquer máquina e no CI (que roda em UTC).
    env: { TZ: 'America/Sao_Paulo' },
  },
});
