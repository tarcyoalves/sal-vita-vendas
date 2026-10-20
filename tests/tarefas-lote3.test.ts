/**
 * Lote 3 — tarefas/dashboard/TV/importação. Funções puras + testes de código-fonte.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isTaskOverdue, detalharAtrasadas, resumoAtrasadas, indexTasksBySeller, type TarefaAtrasavel, type AtendenteRef,
} from '../shared/tarefasAtrasadas';
import { ordenarTarefas } from '../client/src/lib/taskOrder';
import { computeDashboardAgg, isTaskOverdue as isTaskOverdueDash } from '../client/src/lib/dashboardAgg';
import { deduplicarNoArquivo, janelaLembretes } from '../server/lib/taskImport';

const ler = (p: string) => readFileSync(p, 'utf8');
const NOW = new Date('2026-10-20T15:00:00Z').getTime();
const DAY = 86_400_000;
const ago = (dias: number) => new Date(NOW - dias * DAY);

describe('item 6 — tasks.reminders filtra no SQL', () => {
  const fonte = ler('server/routers/tasks.ts');
  const i = fonte.indexOf('reminders: protectedProcedure');
  const trecho = fonte.slice(i, i + 2200);
  it('só pendentes, lembrete ligado (nulo conta como ligado) e janela ontem..+7 dias', () => {
    expect(trecho).toContain("eq(tasks.status, 'pending')");
    expect(trecho).toContain('IS DISTINCT FROM false');
    expect(trecho).toContain('lte(tasks.reminderDate, ateData)');
    expect(trecho.match(/\.where\(filtroLembrete\)|\.where\(and\(filter, filtroLembrete\)\)/g)?.length).toBe(2);
    expect(trecho).toContain('.limit(300)');
  });
  it('janelaLembretes: 24 h para trás, 7 dias para a frente', () => {
    const { de, ate } = janelaLembretes(new Date(NOW));
    expect(NOW - de.getTime()).toBe(DAY);
    expect(ate.getTime() - NOW).toBe(7 * DAY);
  });
});

describe('item 7 — "mais atrasadas primeiro" manda não pendentes para o fim', () => {
  const lista = [
    { id: 1, status: 'completed', reminderDate: ago(60) },
    { id: 2, status: 'pending', reminderDate: ago(3) },
    { id: 3, status: 'cancelled', reminderDate: ago(40) },
    { id: 4, status: 'pending', reminderDate: ago(10) },
    { id: 5, status: 'pending' },
  ];
  it('atrasadas: pendentes por antiguidade, depois o resto', () => {
    const ids = ordenarTarefas(lista, 'atrasadas', NOW, false).map((t) => t.id);
    expect(ids.slice(0, 2)).toEqual([4, 2]);
    expect(new Set(ids.slice(2))).toEqual(new Set([1, 3, 5]));
  });
  it('outras ordens continuam sem olhar o status', () => {
    expect(ordenarTarefas(lista, 'recentes', NOW, false).map((t) => t.id).slice(0, 2)).toEqual([2, 4]);
  });
  it('status ausente conta como pendente (listas antigas)', () => {
    const ids = ordenarTarefas([{ id: 1, reminderDate: ago(1) }, { id: 2, reminderDate: ago(5) }], 'atrasadas', NOW, false).map((t) => t.id);
    expect(ids).toEqual([2, 1]);
  });
});

describe('item 8 — atrasadas detalhadas no dashboard', () => {
  const sellers: AtendenteRef[] = [
    { id: 1, name: 'Ana', userId: 1, status: 'active' },
    { id: 2, name: 'Beto', userId: 2, status: 'inactive' },
  ];
  const tasks: TarefaAtrasavel[] = [
    { status: 'pending', assignedTo: ' ana ', reminderDate: ago(2) },
    { status: 'pending', assignedTo: 'Ana', reminderDate: ago(45), reminderEnabled: null },
    { status: 'pending', assignedTo: '', reminderDate: ago(31) },
    { status: 'pending', assignedTo: null, reminderDate: ago(1) },
    { status: 'pending', assignedTo: 'Beto', reminderDate: ago(5) },
    { status: 'pending', assignedTo: 'Fulano que saiu', reminderDate: ago(90) },
    { status: 'pending', assignedTo: 'Ana', reminderDate: ago(9), reminderEnabled: false }, // não conta
    { status: 'completed', assignedTo: 'Ana', reminderDate: ago(9) },                       // não conta
  ];
  it('total preservado; grupos somam o total; >30 dias é subconjunto', () => {
    const overdue = tasks.filter((t) => isTaskOverdue(t, NOW));
    const d = detalharAtrasadas(overdue, sellers, NOW);
    expect(d).toEqual({ total: 6, comAtendenteAtivo: 2, semAtendente: 2, atendenteInativo: 2, maisDe30Dias: 3 });
    expect(d.comAtendenteAtivo + d.semAtendente + d.atendenteInativo).toBe(d.total);
  });
  it('computeDashboardAgg expõe overdue (total) e overdueDetail', () => {
    const agg = computeDashboardAgg(tasks, sellers, NOW);
    expect(agg.overdue.length).toBe(6);
    expect(agg.overdueDetail.total).toBe(6);
  });
  it('reminderEnabled nulo conta como ligado em todo lugar (=== false desliga)', () => {
    expect(isTaskOverdue({ status: 'pending', reminderDate: ago(1), reminderEnabled: null }, NOW)).toBe(true);
    expect(isTaskOverdue({ status: 'pending', reminderDate: ago(1), reminderEnabled: false }, NOW)).toBe(false);
    const agg = computeDashboardAgg([{ status: 'pending', reminderDate: ago(1), reminderEnabled: null }], [], NOW);
    expect(agg.reminderOn).toBe(1);
    const tasksTsx = ler('client/src/pages/Tasks.tsx');
    expect(tasksTsx).not.toContain('!task.reminderEnabled');
  });
  it('dashboard e shared usam a MESMA função', () => {
    expect(isTaskOverdueDash).toBe(isTaskOverdue);
  });
  it('resumo textual só cita grupos presentes', () => {
    expect(resumoAtrasadas({ total: 3, comAtendenteAtivo: 3, semAtendente: 0, atendenteInativo: 0, maisDe30Dias: 0 })).toBe('3 com atendente ativo');
    expect(resumoAtrasadas({ total: 5, comAtendenteAtivo: 1, semAtendente: 2, atendenteInativo: 2, maisDe30Dias: 4 }))
      .toBe('1 com atendente ativo · 2 sem atendente · 2 com atendente inativo · 4 há mais de 30 dias');
  });
  it('a tela usa o detalhe no card "Exige ação agora" e no KPI', () => {
    const f = ler('client/src/pages/AdminDashboard.tsx');
    expect(f).toContain('resumoAtrasadas(overdueDetail)');
    expect(f).toContain('value={overdue.length}');
  });
});

describe('item 9 — TV usa a definição compartilhada', () => {
  const tv = ler('server/routers/tv.ts');
  it('importa a função compartilhada e seleciona reminderEnabled', () => {
    expect(tv).toContain("from '../../shared/tarefasAtrasadas'");
    expect(tv).toContain('reminderEnabled: tasks.reminderEnabled');
    expect(tv).not.toMatch(/t\.reminderDate && new Date\(t\.reminderDate\) < now && t\.status === 'pending'/);
  });
  it('total e por atendente passam por isTaskOverdue (e indexTasksBySeller)', () => {
    expect(tv).toContain('allTasks.filter(t => isTaskOverdue(t, nowMs))');
    expect(tv).toContain('porAtendente.get(seller.id)');
  });
  it('agrupamento por nome normalizado / userId (igual ao dashboard)', () => {
    const idx = indexTasksBySeller(
      [{ assignedTo: 'ANA ', userId: 9 }, { assignedTo: null, userId: 1 }],
      [{ id: 1, name: 'ana', userId: 1 }],
    );
    expect(idx.get(1)!.length).toBe(2);
  });
});

describe('item 10 — bulkCreate deduplica dentro do arquivo', () => {
  const vazio = () => ({ cnpjs: new Set<string>(), phones: new Set<string>() });
  it('mesmo CNPJ ou telefone normalizado entra uma vez (a primeira fica)', () => {
    const linhas = [
      { n: 1, cnpj: '111', phone: 'a' },
      { n: 2, cnpj: '111', phone: 'b' },   // CNPJ repetido
      { n: 3, cnpj: '222', phone: 'a' },   // telefone repetido
      { n: 4, cnpj: '333', phone: 'c' },
      { n: 5 },                             // sem identificador: nunca é duplicada
      { n: 6 },
    ];
    expect(deduplicarNoArquivo(linhas, vazio()).map((l) => l.n)).toEqual([1, 4, 5, 6]);
  });
  it('continua descartando o que já existe no banco', () => {
    const ja = { cnpjs: new Set(['111']), phones: new Set<string>() };
    expect(deduplicarNoArquivo([{ cnpj: '111' }, { cnpj: '222' }], ja)).toEqual([{ cnpj: '222' }]);
    expect(ja.cnpjs.size).toBe(1);
  });
  it('bulkCreate usa a função e conta duplicadas pelo que sobrou', () => {
    const f = ler('server/routers/tasks.ts');
    expect(f).toContain('deduplicarNoArquivo(');
    expect(f).toContain('const duplicadas = input.items.length - novos.length');
  });
});
