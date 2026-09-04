/**
 * Lembretes do CRM — comportamento real, importado de client/src/lib/tasks/reminders.ts.
 *
 * A versão anterior desta suíte reimplementava cada filtro em arrays locais
 * (`reminders.filter(r => r.assignedTo === attendant)`) e depois testava a
 * própria reimplementação. Passava verde sem tocar em uma linha do código de
 * produção — se o dashboard trocasse a regra, o teste continuava verde. Agora
 * tudo abaixo chama as funções que o AdminDashboard, o Tasks e o
 * useReminderNotifications realmente usam.
 */

import { describe, expect, test } from 'vitest';
import {
  ADMIN_FILTER,
  ALERT_WINDOWS,
  DASHBOARD_CATEGORY_LIMIT,
  alertKey,
  alertableReminders,
  buildLocalReminderDate,
  classifyAlert,
  filterAndSortReminders,
  isOverdue,
  isUpcoming,
  matchesReminderFilter,
  parseReminderDate,
  splitDashboardReminders,
  toReminderFormFields,
  type ReminderRow,
} from '../client/src/lib/tasks/reminders';

/** Fábrica: só o que o teste precisa declarar fica explícito. */
function row(over: Partial<ReminderRow> & { id: number }): ReminderRow {
  return {
    title: `Tarefa ${over.id}`,
    reminderDate: new Date('2026-04-20T14:30:00'),
    status: 'pending',
    ...over,
  };
}

const NOW = new Date('2026-04-20T12:00:00');
const minutes = (n: number) => n * 60_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe('parseReminderDate', () => {
  test('aceita Date e string, e rejeita ausente ou inválido', () => {
    const d = new Date('2026-04-20T14:30:00');
    expect(parseReminderDate(d)).toEqual(d);
    // O cache do TanStack Query pode devolver string onde a API devolveu Date.
    expect(parseReminderDate('2026-04-20T14:30:00')?.getHours()).toBe(14);
    expect(parseReminderDate(null)).toBeNull();
    expect(parseReminderDate(undefined)).toBeNull();
    // Um valor corrompido não pode virar Invalid Date solto: toda comparação
    // de data passaria a devolver false silenciosamente.
    expect(parseReminderDate('não é data')).toBeNull();
  });
});

describe('data local do lembrete (a armadilha do UTC)', () => {
  test('buildLocalReminderDate preserva o que o atendente digitou', () => {
    const d = buildLocalReminderDate('2026-04-20', '14:30');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth() + 1).toBe(4);
    expect(d!.getDate()).toBe(20);
    expect(d!.getHours()).toBe(14);
    expect(d!.getMinutes()).toBe(30);
  });

  test('não usa toISOString: meia-noite não escorrega para o dia anterior', () => {
    // Este é o bug histórico. Em UTC-3, toISOString() de 2026-04-20T00:00
    // produz 2026-04-20T03:00Z; o caminho inverso (ler a parte de data do ISO
    // em fuso negativo) devolvia dia 19. Aqui a ida e volta tem de fechar.
    const d = buildLocalReminderDate('2026-04-20', '00:00')!;
    expect(d.getDate()).toBe(20);
    const back = toReminderFormFields(d);
    expect(back.reminderDate).toBe('2026-04-20');
    expect(back.reminderTime).toBe('00:00');
  });

  test('ida e volta é estável para qualquer hora do dia', () => {
    for (const time of ['00:00', '00:30', '09:00', '12:00', '21:45', '23:59']) {
      const d = buildLocalReminderDate('2026-04-20', time)!;
      expect(toReminderFormFields(d)).toEqual({
        reminderDate: '2026-04-20',
        reminderTime: time,
      });
    }
  });

  test('editar a data mantém a hora e move só o dia', () => {
    const original = buildLocalReminderDate('2026-04-20', '14:30')!;
    const fields = toReminderFormFields(original);
    const edited = buildLocalReminderDate('2026-04-21', fields.reminderTime)!;
    expect(edited.getDate()).toBe(21);
    expect(edited.getHours()).toBe(14);
    expect(edited.getMinutes()).toBe(30);
  });

  test('sem data devolve campo vazio e a hora padrão do formulário', () => {
    expect(toReminderFormFields(null)).toEqual({ reminderDate: '', reminderTime: '09:00' });
    expect(toReminderFormFields(null, '08:00').reminderTime).toBe('08:00');
  });

  test('dia e mês de um dígito saem com zero à esquerda', () => {
    const d = buildLocalReminderDate('2026-01-05', '07:05')!;
    expect(toReminderFormFields(d)).toEqual({
      reminderDate: '2026-01-05',
      reminderTime: '07:05',
    });
  });

  test('data ou hora em branco não gera lembrete', () => {
    expect(buildLocalReminderDate('', '14:30')).toBeNull();
    expect(buildLocalReminderDate('2026-04-20', '')).toBeNull();
  });
});

describe('filtro do dropdown do dashboard', () => {
  const rows = [
    row({ id: 1, assignedTo: null }),
    row({ id: 2, assignedTo: '' }),
    row({ id: 3, assignedTo: 'John' }),
    row({ id: 4, assignedTo: 'Jane' }),
    row({ id: 5, assignedTo: 'John' }),
  ];

  test('"all" devolve tudo', () => {
    expect(filterAndSortReminders(rows, 'all')).toHaveLength(5);
  });

  test('__admin__ pega só o que não tem responsável', () => {
    const got = filterAndSortReminders(rows, ADMIN_FILTER);
    expect(got.map((r) => r.id)).toEqual([1, 2]);
  });

  test('__admin__ trata responsável só com espaços como vazio', () => {
    expect(matchesReminderFilter(row({ id: 9, assignedTo: '   ' }), ADMIN_FILTER)).toBe(true);
  });

  test('nome de atendente pega só os dele', () => {
    const got = filterAndSortReminders(rows, 'John');
    expect(got.map((r) => r.id)).toEqual([3, 5]);
  });

  test('o filtro por nome é sensível a caixa (comportamento atual do dashboard)', () => {
    // Documenta o que o código faz hoje: a comparação é `===`, então o valor do
    // dropdown precisa ser idêntico ao gravado em assigned_to. Se um dia isso
    // virar case-insensitive, é aqui que o teste avisa.
    expect(matchesReminderFilter(row({ id: 9, assignedTo: 'John' }), 'john')).toBe(false);
  });

  test('ordena por data crescente e joga sem data para o fim', () => {
    const unordered = [
      row({ id: 1, reminderDate: at(minutes(60)) }),
      row({ id: 2, reminderDate: at(-minutes(60)) }),
      row({ id: 3, reminderDate: null }),
      row({ id: 4, reminderDate: at(minutes(10)) }),
    ];
    expect(filterAndSortReminders(unordered, 'all').map((r) => r.id)).toEqual([2, 4, 1, 3]);
  });
});

describe('classificação atrasado / próximo', () => {
  test('vencido e pendente é atrasado', () => {
    const r = row({ id: 1, reminderDate: at(-minutes(60)) });
    expect(isOverdue(r, NOW)).toBe(true);
    expect(isUpcoming(r, NOW)).toBe(false);
  });

  test('futuro e pendente é próximo', () => {
    const r = row({ id: 1, reminderDate: at(minutes(60)) });
    expect(isUpcoming(r, NOW)).toBe(true);
    expect(isOverdue(r, NOW)).toBe(false);
  });

  test('concluído nunca é atrasado, mesmo vencido', () => {
    const r = row({ id: 1, reminderDate: at(-minutes(60)), status: 'completed' });
    expect(isOverdue(r, NOW)).toBe(false);
    expect(isUpcoming(r, NOW)).toBe(false);
  });

  test('cancelado também sai das duas listas', () => {
    const r = row({ id: 1, reminderDate: at(-minutes(60)), status: 'cancelled' });
    expect(isOverdue(r, NOW)).toBe(false);
    expect(isUpcoming(r, NOW)).toBe(false);
  });

  test('exatamente agora conta como atrasado, não como próximo', () => {
    // O dashboard usa `<= now` para atrasado; sem isso o lembrete do minuto
    // exato ficaria fora das duas listas.
    const r = row({ id: 1, reminderDate: new Date(NOW.getTime()) });
    expect(isOverdue(r, NOW)).toBe(true);
    expect(isUpcoming(r, NOW)).toBe(false);
  });

  test('sem data não entra em nenhuma lista', () => {
    const r = row({ id: 1, reminderDate: null });
    expect(isOverdue(r, NOW)).toBe(false);
    expect(isUpcoming(r, NOW)).toBe(false);
  });
});

describe('card de lembretes do dashboard', () => {
  test('separa atrasados de próximos e ignora concluídos', () => {
    const rows = [
      row({ id: 1, reminderDate: at(-minutes(1440)), assignedTo: 'John' }),
      row({ id: 2, reminderDate: at(-minutes(60)), assignedTo: null }),
      row({ id: 3, reminderDate: at(minutes(60)), assignedTo: 'Jane' }),
      row({ id: 4, reminderDate: at(minutes(1440)), assignedTo: 'John' }),
      row({ id: 5, reminderDate: at(-minutes(30)), status: 'completed' }),
    ];
    const got = splitDashboardReminders(rows, 'all', NOW);
    expect(got.overdue.map((r) => r.id)).toEqual([1, 2]);
    expect(got.upcoming.map((r) => r.id)).toEqual([3, 4]);
    expect(got.overdueCount).toBe(2);
    expect(got.upcomingCount).toBe(2);
  });

  test('mostra no máximo 5 por categoria mas conta o total', () => {
    // O badge do card exibe a contagem completa; a lista corta em 5. Se os dois
    // saíssem do mesmo array cortado, o atendente veria "ATRASADOS (5)" tendo 12.
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ id: i + 1, reminderDate: at(-minutes(i + 1)) }),
    );
    const got = splitDashboardReminders(rows, 'all', NOW);
    expect(got.overdue).toHaveLength(DASHBOARD_CATEGORY_LIMIT);
    expect(got.overdueCount).toBe(12);
  });

  test('os mais antigos aparecem primeiro entre os atrasados', () => {
    const rows = [
      row({ id: 1, reminderDate: at(-minutes(10)) }),
      row({ id: 2, reminderDate: at(-minutes(600)) }),
      row({ id: 3, reminderDate: at(-minutes(60)) }),
    ];
    expect(splitDashboardReminders(rows, 'all', NOW).overdue.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  test('o filtro se aplica antes da separação', () => {
    const rows = [
      row({ id: 1, reminderDate: at(-minutes(60)), assignedTo: 'John' }),
      row({ id: 2, reminderDate: at(-minutes(30)), assignedTo: 'Jane' }),
      row({ id: 3, reminderDate: at(minutes(60)), assignedTo: 'John' }),
    ];
    const got = splitDashboardReminders(rows, 'John', NOW);
    expect(got.overdue.map((r) => r.id)).toEqual([1]);
    expect(got.upcoming.map((r) => r.id)).toEqual([3]);
  });

  test('lista vazia não quebra', () => {
    const got = splitDashboardReminders([], 'all', NOW);
    expect(got.filtered).toEqual([]);
    expect(got.overdueCount).toBe(0);
    expect(got.upcomingCount).toBe(0);
  });
});

describe('quem recebe alerta', () => {
  const rows = [
    row({ id: 1, assignedTo: 'Ana' }),
    row({ id: 2, assignedTo: 'Bruno' }),
    row({ id: 3, assignedTo: null }),
  ];

  test('atendente recebe tudo que a query devolveu', () => {
    // O servidor já limitou via userTaskFilter; o cliente não filtra de novo.
    expect(alertableReminders(rows, 'Ana', false)).toHaveLength(3);
  });

  test('admin só recebe alerta do que está atribuído a ele', () => {
    // Admin vê a equipe toda na query. Sem este corte, seria bombardeado pelos
    // lembretes de todos os atendentes.
    expect(alertableReminders(rows, 'Ana', true).map((r) => r.id)).toEqual([1]);
  });

  test('admin sem nada atribuído não recebe alerta nenhum', () => {
    expect(alertableReminders(rows, 'Carla', true)).toEqual([]);
  });
});

describe('janelas de disparo do alerta', () => {
  test('mais de 1 min no passado → atrasado', () => {
    expect(classifyAlert(row({ id: 1, reminderDate: at(-minutes(30)) }), NOW)).toBe('overdue');
  });

  test('na hora → dispara', () => {
    expect(classifyAlert(row({ id: 1, reminderDate: at(0) }), NOW)).toBe('fire');
    expect(classifyAlert(row({ id: 1, reminderDate: at(-minutes(0.5)) }), NOW)).toBe('fire');
    expect(classifyAlert(row({ id: 1, reminderDate: at(minutes(0.5)) }), NOW)).toBe('fire');
  });

  test('a janela de fire é -60s..+60s, não os ±2 min do comentário original', () => {
    // Achado desta refatoração: `ALERT_WINDOWS.fireFrom` é -120s, mas `overdue`
    // é avaliado antes e pega tudo abaixo de -60s. Então 90s atrasado sai como
    // "Atrasada", não como "Lembrete" — o hook prometia ±2 min e entrega ±1.
    // O teste registra o comportamento real; mudar isso é decisão de produto.
    expect(classifyAlert(row({ id: 1, reminderDate: at(-minutes(1.5)) }), NOW)).toBe('overdue');
    expect(classifyAlert(row({ id: 1, reminderDate: at(-minutes(0.9)) }), NOW)).toBe('fire');
  });

  test('entre 1 e 5 min à frente → aviso prévio', () => {
    expect(classifyAlert(row({ id: 1, reminderDate: at(minutes(3)) }), NOW)).toBe('warn');
    expect(classifyAlert(row({ id: 1, reminderDate: at(minutes(5)) }), NOW)).toBe('warn');
  });

  test('longe demais no futuro → nenhum alerta', () => {
    expect(classifyAlert(row({ id: 1, reminderDate: at(minutes(30)) }), NOW)).toBeNull();
  });

  test('atrasado tem prioridade sobre a janela de disparo', () => {
    // -3 min cai fora de fire (que vai até -2) e dentro de overdue.
    expect(classifyAlert(row({ id: 1, reminderDate: at(-minutes(3)) }), NOW)).toBe('overdue');
  });

  test('as janelas não deixam buraco entre fire e warn', () => {
    // Exatamente +1 min: é o limite superior de fire. Se a ordem das checagens
    // mudasse, esse minuto ficaria sem alerta nenhum.
    expect(classifyAlert(row({ id: 1, reminderDate: at(ALERT_WINDOWS.fireTo) }), NOW)).toBe('fire');
  });

  test('lembrete desativado nunca alerta, mesmo atrasado', () => {
    const r = row({ id: 1, reminderDate: at(-minutes(60)), reminderEnabled: false });
    expect(classifyAlert(r, NOW)).toBeNull();
  });

  test('não-pendente nunca alerta', () => {
    const r = row({ id: 1, reminderDate: at(-minutes(60)), status: 'completed' });
    expect(classifyAlert(r, NOW)).toBeNull();
  });

  test('sem data nunca alerta', () => {
    expect(classifyAlert(row({ id: 1, reminderDate: null }), NOW)).toBeNull();
  });
});

describe('dedupe do alerta', () => {
  test('atrasado repete no dia seguinte, não no mesmo dia', () => {
    const r = row({ id: 7, reminderDate: at(-minutes(600)) });
    const hoje = alertKey(r, 'overdue', NOW);
    const maisTarde = alertKey(r, 'overdue', new Date('2026-04-20T18:00:00'));
    const amanha = alertKey(r, 'overdue', new Date('2026-04-21T09:00:00'));
    expect(maisTarde).toBe(hoje);
    expect(amanha).not.toBe(hoje);
  });

  test('reagendar libera o alerta de novo', () => {
    // A chave de fire/warn carrega o timestamp do lembrete: mudar a data gera
    // chave nova, então o lembrete volta a poder tocar.
    const antes = alertKey(row({ id: 7, reminderDate: at(0) }), 'fire', NOW);
    const depois = alertKey(row({ id: 7, reminderDate: at(minutes(90)) }), 'fire', NOW);
    expect(depois).not.toBe(antes);
  });

  test('warn e fire do mesmo lembrete são chaves distintas', () => {
    const r = row({ id: 7, reminderDate: at(minutes(3)) });
    expect(alertKey(r, 'warn', NOW)).not.toBe(alertKey(r, 'fire', NOW));
  });

  test('lembretes diferentes não compartilham chave', () => {
    const a = row({ id: 1, reminderDate: at(0) });
    const b = row({ id: 2, reminderDate: at(0) });
    expect(alertKey(a, 'fire', NOW)).not.toBe(alertKey(b, 'fire', NOW));
  });
});
