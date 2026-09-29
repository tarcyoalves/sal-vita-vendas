import { describe, it, expect } from 'vitest';
import {
  retornoBodySchema, resolveRetornoUpdate, validarEstadoRetorno, heartbeatBodySchema,
  roboSemSinal, pedidosParaRobo, mapOrderToSmbiPayload,
} from '../server/lib/smbi';
import type { FatOrder } from '../server/db/schema';
import { SMBI_MOTIVO_CODIGOS, SMBI_MOTIVO_ROTULO, SMBI_ESTADOS, SMBI_ESTADO_ROTULO } from '../shared/smbiEstados';

const vazio = { smbiMovsaiId: null, numeroNfe: null, numeroCte: null };

describe('retorno com estado (contrato robô ⇄ CRM, rota 2)', () => {
  it('aceita estado sozinho (sem movsai/NF-e/CT-e)', () => {
    expect(retornoBodySchema.safeParse({ estado: 'PENDENTE', motivoCodigo: 'PRAZO_SEM_CODIGO' }).success).toBe(true);
  });

  it('continua exigindo ao menos um campo', () => {
    expect(retornoBodySchema.safeParse({}).success).toBe(false);
    expect(retornoBodySchema.safeParse({ tentativa: 1 }).success).toBe(false);
  });

  it('rejeita estado e motivo fora da lista do contrato', () => {
    expect(retornoBodySchema.safeParse({ estado: 'TALVEZ' }).success).toBe(false);
    expect(retornoBodySchema.safeParse({ estado: 'ERRO', motivoCodigo: 'INVENTADO' }).success).toBe(false);
  });

  it('todo estado e todo motivo do contrato tem texto para a tela', () => {
    for (const e of SMBI_ESTADOS) expect(SMBI_ESTADO_ROTULO[e]).toBeTruthy();
    for (const m of SMBI_MOTIVO_CODIGOS) expect(SMBI_MOTIVO_ROTULO[m]).toBeTruthy();
  });

  it('CRIADO exige movsai (no corpo ou já gravado)', () => {
    const body = retornoBodySchema.parse({ estado: 'CRIADO' });
    expect(validarEstadoRetorno(vazio, body)).toMatch(/exige smbiMovsaiId/);
    expect(validarEstadoRetorno({ smbiMovsaiId: '1071' }, body)).toBeNull();
    expect(validarEstadoRetorno(vazio, retornoBodySchema.parse({ estado: 'CRIADO', smbiMovsaiId: '1200' }))).toBeNull();
  });

  it('CRIADO não pode trazer motivo; motivo sem estado é inválido', () => {
    expect(validarEstadoRetorno(vazio, retornoBodySchema.parse({ estado: 'CRIADO', smbiMovsaiId: '1', motivoCodigo: 'CRIACAO_FALHOU' }))).toMatch(/não tem motivo/);
    expect(validarEstadoRetorno(vazio, retornoBodySchema.parse({ smbiMovsaiId: '1', motivoTexto: 'x' }))).toMatch(/só valem junto com estado/);
  });

  it('grava o estado inteiro (motivo antigo não sobra) e carimba a hora', () => {
    const { conflict, patch } = resolveRetornoUpdate(
      vazio,
      retornoBodySchema.parse({ estado: 'PENDENTE', motivoCodigo: 'PRAZO_SEM_CODIGO', motivoTexto: 'prazo 20/50/80', tentativa: 2 }),
    );
    expect(conflict).toBe(false);
    expect(patch).toMatchObject({
      smbiEstado: 'PENDENTE', smbiMotivoCodigo: 'PRAZO_SEM_CODIGO', smbiMotivoTexto: 'prazo 20/50/80', smbiTentativa: 2,
    });
    expect(typeof patch.smbiAtualizadoEm).toBe('string');

    const criado = resolveRetornoUpdate(vazio, retornoBodySchema.parse({ estado: 'CRIADO', smbiMovsaiId: '1300' }));
    expect(criado.patch).toMatchObject({ smbiEstado: 'CRIADO', smbiMotivoCodigo: null, smbiMotivoTexto: null, smbiMovsaiId: '1300' });
  });

  it('estado não muda o vínculo: movsai diferente continua sendo 409', () => {
    const r = resolveRetornoUpdate({ ...vazio, smbiMovsaiId: '1071' }, retornoBodySchema.parse({ estado: 'CRIADO', smbiMovsaiId: '1115' }));
    expect(r.conflict).toBe(true);
    expect(r.patch).toEqual({});
  });

  it('corpo antigo (só movsai) continua igual: nenhum campo de estado no patch', () => {
    const { patch } = resolveRetornoUpdate(vazio, retornoBodySchema.parse({ smbiMovsaiId: '1' }));
    expect(patch).toEqual({ smbiMovsaiId: '1' });
  });
});

describe('batimento e chave de parada do robô', () => {
  it('valida o corpo do heartbeat', () => {
    expect(heartbeatBodySchema.safeParse({ versao: '1.0', ciclo: 5, pendentes: 0, pulados: 1, criados: 2 }).success).toBe(true);
    expect(heartbeatBodySchema.safeParse({ versao: '', ciclo: 5, pendentes: 0, pulados: 1, criados: 2 }).success).toBe(false);
    expect(heartbeatBodySchema.safeParse({ versao: '1', ciclo: -1, pendentes: 0, pulados: 0, criados: 0 }).success).toBe(false);
  });

  it('sem sinal: nunca deu, ou passou de 10 minutos', () => {
    const agora = Date.parse('2026-09-29T15:00:00Z');
    expect(roboSemSinal(null, agora)).toBe(true);
    expect(roboSemSinal('lixo', agora)).toBe(true);
    expect(roboSemSinal('2026-09-29T14:55:00Z', agora)).toBe(false);
    expect(roboSemSinal('2026-09-29T14:50:00Z', agora)).toBe(false); // exatamente 10 min ainda vale
    expect(roboSemSinal('2026-09-29T14:49:59Z', agora)).toBe(true);
  });

  it('robô desligado: lista vazia (a trava é do servidor); simular mostra sem liberar', () => {
    const fila = [{ id: 'a' }, { id: 'b' }];
    expect(pedidosParaRobo(false, false, fila)).toEqual([]);
    expect(pedidosParaRobo(true, false, fila)).toEqual(fila);
    expect(pedidosParaRobo(false, true, fila)).toEqual(fila);
  });
});

describe('payload do robô: atualizadoEm', () => {
  const base = {
    id: 'p1', sellerName: 'F', cnpj: '1', razaoSocial: 'X', clienteNome: 'X', cidade: 'A', uf: 'RN', status: 'estimado',
    itens: [], valorFretePorUnidade: 0, observacoes: '', prazoPagamentoSal: '', prazoPagamentoFrete: '',
    previsaoFaturamentoEm: null, aprovadoEm: '2026-09-29T12:00:00.000Z', aprovadoPor: 'A',
    smbiCondpagSalCod: null, smbiCondpagFreteCod: null, smbiSolicitadoEm: '2026-09-29T14:00:00.000Z', smbiSolicitadoPor: 'T',
    criadoEm: '2026-09-28T10:00:00.000Z',
  };

  it('usa a última edição; sem edição registrada, cai para a criação', () => {
    expect(mapOrderToSmbiPayload({ ...base, atualizadoEm: '2026-09-29T14:30:00.000Z' } as unknown as FatOrder).atualizadoEm).toBe('2026-09-29T14:30:00.000Z');
    expect(mapOrderToSmbiPayload({ ...base, atualizadoEm: null } as unknown as FatOrder).atualizadoEm).toBe('2026-09-28T10:00:00.000Z');
  });
});
