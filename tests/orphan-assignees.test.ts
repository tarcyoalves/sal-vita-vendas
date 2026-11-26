import { describe, expect, it } from 'vitest';
import { orphanLabel, orphanWarning, pickOrphans } from '../shared/orphanAssignees';
import { applyAssigneeFilter, buildMyIdentity } from '../client/src/lib/myTasks';

describe('responsáveis sem cadastro', () => {
  const registered = ['Ana Teste', ' BETO TESTE '];
  it('descarta nomes cadastrados (trim, sem diferenciar maiúsculas) e vazios', () => {
    const r = pickOrphans([
      { name: 'ana teste', count: 5 },
      { name: 'beto teste ', count: 2 },
      { name: '   ', count: 9 },
      { name: 'ZETA', count: 3 },
    ], registered);
    expect(r).toEqual([{ name: 'ZETA', count: 3 }]);
  });
  it('junta variações de caixa, ordena por contagem desc. e respeita o limite', () => {
    const r = pickOrphans([
      { name: 'Zeta', count: 2 }, { name: ' ZETA', count: 3 }, { name: 'Omega', count: 4 }, { name: 'Alfa', count: 1 },
    ], registered, 2);
    expect(r).toEqual([{ name: 'Zeta', count: 5 }, { name: 'Omega', count: 4 }]);
  });
  it('rótulo e aviso', () => {
    expect(orphanLabel({ name: 'ZETA', count: 123 })).toBe('ZETA (sem cadastro · 123)');
    expect(orphanWarning([])).toBeNull();
    expect(orphanWarning([{ name: 'ZETA', count: 123 }])).toContain('(ex.: ZETA – 123)');
  });
  it('o filtro por nome órfão casa assignedTo sem diferenciar maiúsculas/espaços', () => {
    const me = buildMyIdentity({ id: 1, name: 'Admin' }, []);
    const tasks = [{ assignedTo: 'zeta ' }, { assignedTo: 'ZETA' }, { assignedTo: 'Outro' }];
    expect(applyAssigneeFilter(tasks, 'ZETA', me)).toHaveLength(2);
  });
});
