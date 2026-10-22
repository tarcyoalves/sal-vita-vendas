// Comparar versões e o aviso de "Nova versão disponível" (no máximo 1 busca a cada 6 h; só com a permissão do CRM).

import { describe, expect, it, vi } from 'vitest';
import { compararVersoes, ehVersaoMaior, INTERVALO_CHECAGEM_MS, lerVersaoJson, versaoNovaDisponivel, type DependenciasVersao } from '../src/shared/versao';

describe('compararVersoes', () => {
  it('compara número a número, não texto', () => {
    expect(compararVersoes('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compararVersoes('0.7.0', '0.6.4')).toBeGreaterThan(0);
    expect(compararVersoes('0.6.4', '0.7.0')).toBeLessThan(0);
    expect(compararVersoes('1.0', '1.0.0')).toBe(0);
  });
  it('versão inválida nunca é "mais nova"', () => {
    expect(ehVersaoMaior('lixo', '0.1.0')).toBe(false);
    expect(ehVersaoMaior('', '0.1.0')).toBe(false);
    expect(ehVersaoMaior('0.7.1', '0.7.0')).toBe(true);
    expect(ehVersaoMaior('0.7.0', '0.7.0')).toBe(false);
  });
  it('lê só { versao } válido do versao.json', () => {
    expect(lerVersaoJson({ versao: '0.7.0', data: '2026-10-22' })).toBe('0.7.0');
    for (const ruim of [null, 'x', {}, { versao: 7 }, { versao: '<script>' }]) expect(lerVersaoJson(ruim)).toBeNull();
  });
});

function deps(parcial: Partial<DependenciasVersao> & { estado?: { em: number; versao: string } } = {}) {
  const estado = parcial.estado ?? { em: 0, versao: '' };
  const d: DependenciasVersao = {
    agora: () => 1_000_000_000,
    ultimaChecagem: () => estado.em,
    versaoGuardada: () => estado.versao,
    guardar: (em, v) => {
      estado.em = em;
      estado.versao = v;
    },
    podeBuscar: async () => true,
    buscar: vi.fn(async () => ({ versao: '0.8.0' })),
    versaoInstalada: () => '0.7.0',
    ...parcial,
  };
  return { d, estado };
}

describe('versaoNovaDisponivel', () => {
  it('primeira vez: busca e avisa quando a publicada é maior', async () => {
    const { d, estado } = deps();
    expect(await versaoNovaDisponivel(d)).toBe('0.8.0');
    expect(d.buscar).toHaveBeenCalledTimes(1);
    expect(estado).toEqual({ em: 1_000_000_000, versao: '0.8.0' });
  });

  it('dentro de 6 h não busca de novo, mas continua avisando pela versão guardada', async () => {
    const { d } = deps({ estado: { em: 1_000_000_000 - INTERVALO_CHECAGEM_MS + 1, versao: '0.8.0' } });
    expect(await versaoNovaDisponivel(d)).toBe('0.8.0');
    expect(d.buscar).not.toHaveBeenCalled();
  });

  it('passadas 6 h busca de novo', async () => {
    const { d } = deps({ estado: { em: 1_000_000_000 - INTERVALO_CHECAGEM_MS, versao: '0.7.0' } });
    expect(await versaoNovaDisponivel(d)).toBe('0.8.0');
    expect(d.buscar).toHaveBeenCalledTimes(1);
  });

  it('mesma versão ou mais velha: sem aviso', async () => {
    expect(await versaoNovaDisponivel(deps({ buscar: async () => ({ versao: '0.7.0' }) }).d)).toBeNull();
    expect(await versaoNovaDisponivel(deps({ buscar: async () => ({ versao: '0.6.0' }) }).d)).toBeNull();
  });

  it('sem a permissão do CRM não faz rede nem grava horário', async () => {
    const { d, estado } = deps({ podeBuscar: async () => false });
    expect(await versaoNovaDisponivel(d)).toBeNull();
    expect(d.buscar).not.toHaveBeenCalled();
    expect(estado.em).toBe(0);
  });

  it('sem rede ou arquivo ruim: sem aviso, e só tenta de novo daqui a 6 h', async () => {
    const { d, estado } = deps({
      buscar: async () => {
        throw new Error('offline');
      },
    });
    expect(await versaoNovaDisponivel(d)).toBeNull();
    expect(estado.em).toBe(1_000_000_000);
    expect(await versaoNovaDisponivel(deps({ buscar: async () => ({ versao: 'lixo' }) }).d)).toBeNull();
  });
});
