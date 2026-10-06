import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { conditionalRadarTaskInsert } from '../server/lib/radar/convertInsert';

const base = {
  userId: 7, title: 'T', description: null, notes: 'n', email: null, tag: 'Radar',
  reminderDate: new Date('2026-10-06T12:00:00Z'), lastContactedAt: null, contactCount: 0,
  assignedTo: null, cnpj: '12345678000190', phone: '84999990000', dedupePhones: ['84999990000', '8433334444'],
};
const render = (v = base) => new PgDialect().sqlToQuery(conditionalRadarTaskInsert(v));

describe('conditionalRadarTaskInsert', () => {
  it('só insere se não existir tarefa com o CNPJ ou telefone, e devolve o id', () => {
    const q = render();
    expect(q.sql).toMatch(/INSERT INTO tasks/);
    expect(q.sql).toMatch(/WHERE NOT EXISTS/);
    expect(q.sql).toMatch(/cnpj = \$\d+ OR phone IN \(\$\d+, \$\d+\)/);
    expect(q.sql).toMatch(/RETURNING id/);
    expect(q.params).toContain('12345678000190');
    expect(q.params).toContain('8433334444');
  });

  it('sem telefones, deduplica só por CNPJ', () => {
    const q = render({ ...base, dedupePhones: [] });
    expect(q.sql).not.toMatch(/phone IN/);
    expect(q.sql).toMatch(/cnpj = \$\d+\s*\)/);
  });

  it('nunca grava e-mail como confirmado', () => {
    expect(render().sql).toMatch(/FALSE\s+WHERE NOT EXISTS/);
  });

  it('datas vão em ISO UTC com cast para timestamp', () => {
    const q = render();
    expect(q.params).toContain('2026-10-06T12:00:00.000Z');
    expect(q.sql).toContain('::timestamp');
  });
});
