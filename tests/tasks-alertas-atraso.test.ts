// Alertas de atraso: um aviso agrupado e "já avisado hoje" por usuário e por dia (São Paulo), em localStorage.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  atrasadasParaAvisar, chaveAtrasada, chaveAvisados, chaveDia, chaveNaHora, gravarAvisados, lerAvisados, limparDiasAntigos,
  textoAvisoAtraso, type Armazenamento, type LembreteAlerta,
} from '../client/src/lib/tasks/alertasAtraso';

const AGORA = new Date('2026-11-23T17:30:00Z'); // 14:30 em São Paulo
const antes = (min: number) => new Date(AGORA.getTime() - min * 60_000);
const lembrete = (id: number, min: number, extra: Partial<LembreteAlerta> = {}): LembreteAlerta =>
  ({ id, title: `Cliente ${id}`, reminderDate: antes(min), reminderEnabled: true, status: 'pending', ...extra });

function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    getItem: (k) => dados.get(k) ?? null,
    setItem: (k, v) => void dados.set(k, v),
    removeItem: (k) => void dados.delete(k),
    key: (i) => [...dados.keys()][i] ?? null,
    get length() { return dados.size; },
  } as Armazenamento & { dados: Map<string, string> };
}

describe('chaveDia (fuso de São Paulo)', () => {
  it('o dia vira à meia-noite de Brasília, não à do UTC', () => {
    expect(chaveDia(new Date('2026-11-24T02:59:00Z'))).toBe('2026-11-23'); // 23:59 em SP
    expect(chaveDia(new Date('2026-11-24T03:00:00Z'))).toBe('2026-11-24'); // 00:00 em SP
    expect(chaveDia(new Date('2026-11-23T01:00:00Z'))).toBe('2026-11-22');
  });
  it('a chave separa usuário e dia', () => {
    expect(chaveAvisados(1, '2026-11-23')).not.toBe(chaveAvisados(2, '2026-11-23'));
    expect(chaveAvisados(1, '2026-11-23')).not.toBe(chaveAvisados(1, '2026-11-24'));
  });
});

describe('atrasadasParaAvisar: agrupa todas num aviso só', () => {
  it('12 atrasadas viram uma lista única, com o texto "12 tarefas atrasadas"', () => {
    const lista = Array.from({ length: 12 }, (_, i) => lembrete(i + 1, 30 + i));
    const r = atrasadasParaAvisar(lista, AGORA, new Set());
    expect(r).toHaveLength(12);
    expect(textoAvisoAtraso(r, false)).toBe('12 tarefas atrasadas');
  });
  it('uma só mostra o título', () => {
    const r = atrasadasParaAvisar([lembrete(7, 90)], AGORA, new Set());
    expect(textoAvisoAtraso(r, false)).toBe('Atrasada: Cliente 7');
    expect(textoAvisoAtraso(r, true)).toBe('Nova tarefa atrasada: Cliente 7');
    expect(textoAvisoAtraso([lembrete(1, 90), lembrete(2, 80)], true)).toBe('2 novas tarefas atrasadas');
  });
  it('ignora futuras, atrasadas há menos de 1 min, desligadas, concluídas e sem data', () => {
    const lista = [
      lembrete(1, -30), lembrete(2, 0.5), lembrete(3, 90, { reminderEnabled: false }),
      lembrete(4, 90, { status: 'completed' }), lembrete(5, 90, { reminderDate: null }), lembrete(6, 90, { reminderDate: 'lixo' }),
      lembrete(7, 90),
    ];
    expect(atrasadasParaAvisar(lista, AGORA, new Set()).map((r) => r.id)).toEqual([7]);
  });
  it('quem já foi avisado hoje não entra de novo; só as novas', () => {
    const avisados = new Set([chaveAtrasada(1), chaveAtrasada(2)]);
    const r = atrasadasParaAvisar([lembrete(1, 60), lembrete(2, 70), lembrete(3, 5)], AGORA, avisados);
    expect(r.map((x) => x.id)).toEqual([3]);
  });
  it('quem recebeu o aviso "na hora" não recebe o de atraso minutos depois', () => {
    const l = lembrete(9, 3);
    const t = new Date(l.reminderDate as Date).getTime();
    expect(atrasadasParaAvisar([l], AGORA, new Set([chaveNaHora(9, t)]))).toEqual([]);
    expect(atrasadasParaAvisar([l], AGORA, new Set())).toHaveLength(1);
  });
});

describe('"já avisado" em localStorage', () => {
  it('sobrevive a "reabrir o app" no mesmo dia (outra leitura) e não vale no dia seguinte', () => {
    const m = memoria();
    const hoje = chaveAvisados(5, chaveDia(AGORA));
    gravarAvisados(m, hoje, new Set([chaveAtrasada(1)]));
    expect(lerAvisados(m, hoje).has(chaveAtrasada(1))).toBe(true);
    const amanha = chaveAvisados(5, chaveDia(new Date(AGORA.getTime() + 86_400_000)));
    expect(lerAvisados(m, amanha).size).toBe(0);
    expect(lerAvisados(m, chaveAvisados(6, chaveDia(AGORA))).size).toBe(0);
  });
  it('conteúdo corrompido vira conjunto vazio', () => {
    const m = memoria();
    m.dados.set('k', '{ruim');
    expect(lerAvisados(m, 'k').size).toBe(0);
    m.dados.set('k', '{"a":1}');
    expect(lerAvisados(m, 'k').size).toBe(0);
    m.dados.set('k', JSON.stringify(['a', 3, null]));
    expect([...lerAvisados(m, 'k')]).toEqual(['a']);
  });
  it('armazenamento que lança ou ausente nunca quebra', () => {
    const ruim = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('y'); }, removeItem: () => { throw new Error('z'); } } as Armazenamento;
    expect(lerAvisados(ruim, 'k').size).toBe(0);
    expect(() => gravarAvisados(ruim, 'k', new Set(['a']))).not.toThrow();
    expect(() => limparDiasAntigos(ruim, 1, '2026-11-23')).not.toThrow();
    expect(lerAvisados(null, 'k').size).toBe(0);
    expect(() => gravarAvisados(null, 'k', new Set())).not.toThrow();
  });
  it('limparDiasAntigos apaga só os outros dias do mesmo usuário', () => {
    const m = memoria();
    gravarAvisados(m, chaveAvisados(1, '2026-11-20'), new Set(['a']));
    gravarAvisados(m, chaveAvisados(1, '2026-11-23'), new Set(['b']));
    gravarAvisados(m, chaveAvisados(2, '2026-11-20'), new Set(['c']));
    m.dados.set('outra_coisa', '1');
    limparDiasAntigos(m, 1, '2026-11-23');
    expect([...m.dados.keys()].sort()).toEqual([chaveAvisados(1, '2026-11-23'), chaveAvisados(2, '2026-11-20'), 'outra_coisa'].sort());
  });
});

describe('centralização no hook (sem duplicidade com a tela de tarefas)', () => {
  const ler = (p: string) => readFileSync(p, 'utf8');
  it('Tasks.tsx não agenda mais notificações próprias; o hook usa localStorage e não sessionStorage', () => {
    const tasks = ler('client/src/pages/Tasks.tsx');
    expect(tasks).not.toContain('scheduledRemindersRef');
    expect(tasks).not.toMatch(/showNotification\(/);
    const hook = ler('client/src/_core/hooks/useReminderNotifications.ts');
    expect(hook).not.toContain('sessionStorage');
    expect(hook).toContain('showNotification');
    expect(hook).toContain('Ver atrasadas');
  });
});
