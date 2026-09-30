import { describe, it, expect } from 'vitest';
import { RADAR_SEGMENTS, RADAR_ALL_CNAES, segmentsForCnaes } from '../shared/radar';

describe('segmentos do Radar', () => {
  it('nenhum CNAE aparece em dois segmentos', () => {
    expect(new Set(RADAR_ALL_CNAES).size).toBe(RADAR_ALL_CNAES.length);
  });
  it('todo CNAE tem 7 dígitos', () => {
    for (const c of RADAR_ALL_CNAES) expect(c).toMatch(/^\d{7}$/);
  });
  it('minimercados, mercearias e armazéns (4712100) não entram na base', () => {
    expect(RADAR_ALL_CNAES).not.toContain('4712100');
  });
  it('supermercado e frigorífico de aves/suínos casam pelos CNAEs novos', () => {
    expect(segmentsForCnaes(['4711302'])).toEqual(['supermercado']);
    expect(segmentsForCnaes(['1012101'])).toEqual(['frigorifico']);
    expect(segmentsForCnaes(['1012103'])).toEqual(['frigorifico']);
  });
  it('as chaves são únicas', () => {
    const keys = RADAR_SEGMENTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
