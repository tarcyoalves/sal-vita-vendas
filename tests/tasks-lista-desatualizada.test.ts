// Aviso quando o refetch da lista falha mas há dados em cache.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Tasks: faixa de lista desatualizada', () => {
  const f = readFileSync('client/src/pages/Tasks.tsx', 'utf8');
  it('mostra "Não consegui atualizar a lista" com "Tentar de novo" quando isError e há tarefas', () => {
    expect(f).toMatch(/isError && tasks\.length > 0 && \(\s*<QueryError message="Não consegui atualizar a lista\."/);
  });
  it('sem dados em cache continua o erro de tela cheia', () => {
    expect(f).toMatch(/isError && tasks\.length === 0 \? \(\s*<QueryError onRetry/);
  });
});
