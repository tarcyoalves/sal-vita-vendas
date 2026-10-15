import { describe, expect, it } from 'vitest';
import {
  SEMAFOROS_MAX_DOCUMENTOS, documentosVisiveis, montarSemaforos, normalizarDocumentosSemaforo,
} from '../server/lib/credito/semaforos';

describe('normalizarDocumentosSemaforo', () => {
  it('mantém só dígitos, CNPJ/CPF, sem repetição', () => {
    expect(normalizarDocumentosSemaforo(['11.222.333/0001-81', '11222333000181', '123', '111.468.126-12', '', 'abc'])).toEqual([
      '11222333000181', '11146812612',
    ]);
  });
  it('limita a 200 documentos', () => {
    const muitos = Array.from({ length: 500 }, (_, i) => String(10_000_000_000_000 + i));
    const r = normalizarDocumentosSemaforo(muitos);
    expect(r).toHaveLength(SEMAFOROS_MAX_DOCUMENTOS);
    expect(r[0]).toBe('10000000000000');
  });
});

describe('documentosVisiveis', () => {
  const docs = ['11222333000181', '22333444000155'];
  it('staff vê todos', () => {
    expect(documentosVisiveis(docs, { staff: true, daCarteira: new Set() })).toEqual(docs);
  });
  it('atendente só os da carteira dele', () => {
    expect(documentosVisiveis(docs, { staff: false, daCarteira: new Set(['22333444000155']) })).toEqual(['22333444000155']);
    expect(documentosVisiveis(docs, { staff: false, daCarteira: new Set() })).toEqual([]);
  });
});

describe('montarSemaforos', () => {
  const agora = new Date('2026-10-15T12:00:00Z');
  it('usa a primeira linha de cada documento, marca vencido e simulado', () => {
    const r = montarSemaforos([
      { documento: 'A', veredito: 'REPROVADO_A_PRAZO', consultadoEm: '2026-10-10T00:00:00Z', provedor: 'simulado' },
      { documento: 'A', veredito: 'APROVADO', consultadoEm: '2026-01-01T00:00:00Z', provedor: 'simulado' },
      { documento: 'B', veredito: 'APROVADO', consultadoEm: '2026-08-01T00:00:00Z', provedor: 'boavista_apifull' },
    ], agora);
    expect(r.A).toEqual({ veredito: 'REPROVADO_A_PRAZO', semaforo: 'VERMELHO', valido: true, simulado: true });
    expect(r.B).toEqual({ veredito: 'APROVADO', semaforo: 'VERDE', valido: false, simulado: false });
  });
});
