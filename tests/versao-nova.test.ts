import { describe, it, expect } from 'vitest';
import { ehErroDeChunk, podeRecuperar } from '../client/src/lib/versaoNova';

describe('recuperação de versão antiga', () => {
  it('reconhece erros de arquivo de versão antiga', () => {
    expect(ehErroDeChunk(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Home-abc.js'))).toBe(true);
    expect(ehErroDeChunk(new Error('Importing a module script failed.'))).toBe(true);
    expect(ehErroDeChunk('ChunkLoadError: Loading chunk 12 failed')).toBe(true);
    expect(ehErroDeChunk(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(ehErroDeChunk(null)).toBe(false);
  });
  it('só tenta recuperar uma vez por minuto (sem loop)', () => {
    const mem: Record<string, string> = {};
    const st = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    expect(podeRecuperar(1_000_000, st)).toBe(true);
    expect(podeRecuperar(1_030_000, st)).toBe(false);
    expect(podeRecuperar(1_061_000, st)).toBe(true);
  });
});
