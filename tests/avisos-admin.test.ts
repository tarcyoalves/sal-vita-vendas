import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AVISOS_ADMIN, avisosVisiveis, hojeFortaleza, urgenciaAviso } from '../client/src/lib/avisosAdmin';

describe('urgenciaAviso', () => {
  it('hoje é âmbar', () => expect(urgenciaAviso('2026-10-26', '2026-10-26')).toMatchObject({ dias: 0, urgencia: 'ambar', rotulo: 'hoje' }));
  it('véspera é âmbar, singular', () => expect(urgenciaAviso('2026-10-26', '2026-10-25')).toMatchObject({ urgencia: 'ambar', rotulo: 'faltam 1 dia' }));
  it('2 dias âmbar, 3 neutro', () => {
    expect(urgenciaAviso('2026-10-26', '2026-10-24').urgencia).toBe('ambar');
    expect(urgenciaAviso('2026-10-26', '2026-10-23')).toMatchObject({ urgencia: 'neutro', rotulo: 'faltam 3 dias' });
  });
  it('passado é vencido', () => {
    expect(urgenciaAviso('2026-10-26', '2026-10-27')).toMatchObject({ urgencia: 'vencido', rotulo: 'venceu há 1 dia' });
    expect(urgenciaAviso('2026-10-26', '2026-11-02').rotulo).toBe('venceu há 7 dias');
  });
  it('vira o mês sem erro', () => expect(urgenciaAviso('2026-11-01', '2026-10-30').dias).toBe(2));
});

describe('hojeFortaleza', () => {
  it('instante UTC já no dia seguinte ainda é o dia anterior em Fortaleza (UTC-3)', () => {
    expect(hojeFortaleza(new Date('2026-10-27T02:30:00Z'))).toBe('2026-10-26');
    expect(hojeFortaleza(new Date('2026-10-27T03:00:00Z'))).toBe('2026-10-27');
  });
});

describe('avisosVisiveis', () => {
  const a = (data: string) => ({ id: data, data, titulo: 't', texto: 'x', tom: 'info' as const });
  it('mostra até 7 dias depois e esconde no 8º', () => {
    expect(avisosVisiveis([a('2026-10-26')], '2026-11-02')).toHaveLength(1);
    expect(avisosVisiveis([a('2026-10-26')], '2026-11-03')).toHaveLength(0);
  });
  it('mostra desde já (futuro)', () => expect(avisosVisiveis(AVISOS_ADMIN, '2026-10-19')).toHaveLength(2));
  it('ids únicos e datas puras', () => {
    expect(new Set(AVISOS_ADMIN.map((x) => x.id)).size).toBe(AVISOS_ADMIN.length);
    for (const x of AVISOS_ADMIN) expect(x.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('AvisosAdmin é puro cliente', () => {
  const src = ['client/src/components/AvisosAdmin.tsx', 'client/src/lib/avisosAdmin.ts']
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  it('sem trpc, fetch, refetchInterval ou setInterval', () => {
    expect(src).not.toMatch(/trpc|fetch\(|refetchInterval|setInterval/);
  });
});
