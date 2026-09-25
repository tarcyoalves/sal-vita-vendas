import { describe, it, expect } from 'vitest';
import {
  MUNICIPIOS, municipioByIbge, municipioBySiafi, searchMunicipios, haversineKm, municipiosWithinRadius,
} from '../server/lib/radar/geo';

describe('radar geo', () => {
  it('carrega todos os municípios com código SIAFI único', () => {
    expect(MUNICIPIOS.length).toBe(5571);
    expect(new Set(MUNICIPIOS.map((m) => m.siafi)).size).toBe(MUNICIPIOS.length);
  });

  it('diferencia municípios homônimos pelo código IBGE', () => {
    const r = searchMunicipios('barracao');
    expect(r.map((m) => m.uf).sort()).toEqual(['PR', 'RS']);
    expect(searchMunicipios('Barracão', 'PR')).toHaveLength(1);
    expect(municipioByIbge(4102604)?.uf).toBe('PR');
    expect(municipioBySiafi('7449')?.nome).toBe('Barracão');
  });

  it('calcula distância em linha reta', () => {
    // Barracão/PR ↔ Barracão/RS: centros a ~270 km
    const d = haversineKm(-26.2502, -53.6324, -27.6739, -51.4585);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(290);
  });

  it('inclui a origem, cruza divisa de estado e ordena por distância', () => {
    const origin = municipioByIbge(4102604)!;
    const r = municipiosWithinRadius(origin, 30);
    expect(r[0].ibge).toBe(origin.ibge);
    expect(r[0].distanceKm).toBe(0);
    expect(new Set(r.map((m) => m.uf)).has('SC')).toBe(true); // Dionísio Cerqueira fica colado
    for (let i = 1; i < r.length; i++) expect(r[i].distanceKm).toBeGreaterThanOrEqual(r[i - 1].distanceKm);
  });
});
