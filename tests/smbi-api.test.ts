/**
 * Integração CRM → SMBI (`/api/smbi/*`, server/lib/smbi.ts).
 *
 * Cobre só as partes puras: autenticação (Bearer SMBI_SYNC_SECRET, fail
 * closed), validação do corpo do retorno do robô, a regra de conflito do
 * `smbiMovsaiId`, e o mapeamento linha → payload. As rotas em si (api/index.ts)
 * fazem I/O no Neon e não têm banco disponível neste ambiente de testes — não
 * são exercitadas aqui, só typechecadas (`npm run check`).
 *
 * Também confere que `pedidoSchema` (server/routers/faturamento.ts) preserva
 * os 6 campos SMBI depois do parse — essa foi exatamente a falha do caso M do
 * HANDOFF-HERMES.md: um campo ausente do schema de entrada zod é descartado
 * em silêncio pelo tRPC.
 */
import { describe, expect, it } from 'vitest';
import {
  constantTimeEqual,
  extractBearerToken,
  isAuthorized,
  mapOrderToSmbiPayload,
  resolveRetornoUpdate,
  retornoBodySchema,
  type SmbiPedidoPayload,
} from '../server/lib/smbi';
import type { FatOrder } from '../server/db/schema';

// ── Autenticação ──────────────────────────────────────────────────────────

describe('constantTimeEqual', () => {
  it('compara strings iguais como verdadeiro', () => {
    expect(constantTimeEqual('segredo-123', 'segredo-123')).toBe(true);
  });

  it('rejeita strings diferentes do mesmo tamanho', () => {
    expect(constantTimeEqual('segredo-123', 'segredo-456')).toBe(false);
  });

  it('rejeita strings de tamanhos diferentes sem lançar', () => {
    expect(constantTimeEqual('a', 'abc')).toBe(false);
    expect(constantTimeEqual('', 'x')).toBe(false);
  });
});

describe('extractBearerToken', () => {
  it('extrai o token de um header Bearer válido', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('aceita espaços extras em volta do token', () => {
    expect(extractBearerToken('Bearer   abc123  ')).toBe('abc123');
  });

  it('retorna null sem header, sem prefixo Bearer, ou header duplicado', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('abc123')).toBeNull();
    expect(extractBearerToken('Basic abc123')).toBeNull();
    expect(extractBearerToken(['Bearer abc123', 'Bearer abc123'])).toBeNull();
  });
});

describe('isAuthorized', () => {
  const SECRET = 'meu-segredo-do-robo';

  it('autoriza com o token correto', () => {
    expect(isAuthorized(SECRET, `Bearer ${SECRET}`)).toBe(true);
  });

  it('recusa token ausente', () => {
    expect(isAuthorized(SECRET, undefined)).toBe(false);
  });

  it('recusa token errado', () => {
    expect(isAuthorized(SECRET, 'Bearer token-errado')).toBe(false);
  });

  it('falha fechado quando SMBI_SYNC_SECRET não está configurado — mesmo se o header bater com algo', () => {
    expect(isAuthorized(undefined, 'Bearer qualquer-coisa')).toBe(false);
    expect(isAuthorized('', 'Bearer ')).toBe(false);
  });
});

// ── Corpo do retorno (POST /api/smbi/pedidos/:id/retorno) ───────────────────

describe('retornoBodySchema', () => {
  it('aceita só smbiMovsaiId', () => {
    const result = retornoBodySchema.safeParse({ smbiMovsaiId: 'MOVSAI-1' });
    expect(result.success).toBe(true);
  });

  it('aceita os três campos juntos e faz trim', () => {
    const result = retornoBodySchema.safeParse({
      smbiMovsaiId: '  MOVSAI-1  ',
      numeroNfe: ' 12345 ',
      numeroCte: ' 67890 ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ smbiMovsaiId: 'MOVSAI-1', numeroNfe: '12345', numeroCte: '67890' });
    }
  });

  it('rejeita corpo vazio — precisa de ao menos um campo', () => {
    expect(retornoBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejeita string vazia (ou só espaços) no único campo enviado', () => {
    expect(retornoBodySchema.safeParse({ smbiMovsaiId: '' }).success).toBe(false);
    expect(retornoBodySchema.safeParse({ smbiMovsaiId: '   ' }).success).toBe(false);
  });

  it('rejeita valor acima de 40 caracteres', () => {
    const tooLong = 'x'.repeat(41);
    expect(retornoBodySchema.safeParse({ numeroNfe: tooLong }).success).toBe(false);
  });

  it('aceita exatamente 40 caracteres', () => {
    const exact = 'x'.repeat(40);
    expect(retornoBodySchema.safeParse({ numeroNfe: exact }).success).toBe(true);
  });

  it('rejeita campo desconhecido? — não: zod ignora extras por padrão, mas os obrigatórios continuam valendo', () => {
    // Confirma que o schema não é `strict()` de propósito: o robô pode evoluir
    // o payload sem quebrar a rota antes de o servidor ser atualizado.
    const result = retornoBodySchema.safeParse({ smbiMovsaiId: 'X', outraCoisa: 'y' });
    expect(result.success).toBe(true);
  });
});

// ── Regra de conflito (smbiMovsaiId nunca é sobrescrito em silêncio) ────────

describe('resolveRetornoUpdate', () => {
  it('sem smbiMovsaiId gravado ainda, aceita o novo valor sem conflito', () => {
    const existing = { smbiMovsaiId: null, numeroNfe: null, numeroCte: null };
    const body = { smbiMovsaiId: 'MOVSAI-1' };
    const result = resolveRetornoUpdate(existing, body);
    expect(result.conflict).toBe(false);
    expect(result.patch).toEqual({ smbiMovsaiId: 'MOVSAI-1' });
  });

  it('reenviar o MESMO valor já gravado é idempotente — sem conflito', () => {
    const existing = { smbiMovsaiId: 'MOVSAI-1', numeroNfe: null, numeroCte: null };
    const body = { smbiMovsaiId: 'MOVSAI-1' };
    const result = resolveRetornoUpdate(existing, body);
    expect(result.conflict).toBe(false);
    expect(result.patch).toEqual({ smbiMovsaiId: 'MOVSAI-1' });
  });

  it('enviar um valor DIFERENTE do já gravado é conflito — 409, nunca sobrescreve', () => {
    const existing = { smbiMovsaiId: 'MOVSAI-1', numeroNfe: null, numeroCte: null };
    const body = { smbiMovsaiId: 'MOVSAI-2' };
    const result = resolveRetornoUpdate(existing, body);
    expect(result.conflict).toBe(true);
    expect(result.patch).toEqual({});
  });

  it('numeroNfe/numeroCte não têm a mesma trava — sempre atualizam', () => {
    const existing = { smbiMovsaiId: 'MOVSAI-1', numeroNfe: '111', numeroCte: null };
    const body = { numeroNfe: '222', numeroCte: '333' };
    const result = resolveRetornoUpdate(existing, body);
    expect(result.conflict).toBe(false);
    expect(result.patch).toEqual({ numeroNfe: '222', numeroCte: '333' });
  });

  it('atualiza só os campos presentes no corpo, mesmo com smbiMovsaiId já gravado igual', () => {
    const existing = { smbiMovsaiId: 'MOVSAI-1', numeroNfe: null, numeroCte: null };
    const body = { smbiMovsaiId: 'MOVSAI-1', numeroNfe: '999' };
    const result = resolveRetornoUpdate(existing, body);
    expect(result.conflict).toBe(false);
    expect(result.patch).toEqual({ smbiMovsaiId: 'MOVSAI-1', numeroNfe: '999' });
  });
});

// ── Mapeamento linha → payload (GET /api/smbi/pedidos) ───────────────────────

function makeFatOrder(overrides: Partial<FatOrder> = {}): FatOrder {
  return {
    id: 'p1',
    taskId: null,
    sellerId: 5,
    sellerName: 'Fulano',
    clienteNome: 'Cliente X',
    cnpj: '12345678000100',
    razaoSocial: 'Cliente X LTDA',
    cidade: 'Mossoró',
    uf: 'RN',
    status: 'estimado',
    comissaoPct: 5,
    itens: [],
    itensEstimadoSnapshot: null,
    prazoPagamentoSal: '30 DIAS',
    prazoPagamentoFrete: '20 DIAS',
    valorFretePorUnidade: 100,
    observacoes: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    previsaoFaturamentoEm: '2026-09-15',
    faturadoEm: null,
    valorPago: 0,
    aprovadoEm: '2026-09-02T00:00:00.000Z',
    aprovadoPor: 'Admin',
    smbiMovsaiId: null,
    numeroNfe: null,
    numeroCte: null,
    smbiCondpagSalCod: '2',
    smbiCondpagFreteCod: '5',
    comissaoComercialProtegida: null,
    createdByUserId: 1,
    createdByRole: 'user',
    ...overrides,
  };
}

describe('mapOrderToSmbiPayload', () => {
  it('inclui os campos que o robô precisa, com os nomes esperados', () => {
    const row = makeFatOrder();
    const payload: SmbiPedidoPayload = mapOrderToSmbiPayload(row);
    expect(payload).toEqual({
      id: 'p1',
      sellerName: 'Fulano',
      cnpj: '12345678000100',
      razaoSocial: 'Cliente X LTDA',
      clienteNome: 'Cliente X',
      cidade: 'Mossoró',
      uf: 'RN',
      status: 'estimado',
      itens: [],
      prazoPagamentoSal: '30 DIAS',
      prazoPagamentoFrete: '20 DIAS',
      smbiCondpagSalCod: '2',
      smbiCondpagFreteCod: '5',
      valorFretePorUnidade: 100,
      observacoes: '',
      previsaoFaturamentoEm: '2026-09-15',
      aprovadoEm: '2026-09-02T00:00:00.000Z',
      aprovadoPor: 'Admin',
    });
  });

  it('nunca ecoa smbiMovsaiId/numeroNfe/numeroCte de volta ao robô', () => {
    const row = makeFatOrder({ smbiMovsaiId: 'MOVSAI-1', numeroNfe: '111', numeroCte: '222' });
    const payload = mapOrderToSmbiPayload(row) as Record<string, unknown>;
    expect(payload.smbiMovsaiId).toBeUndefined();
    expect(payload.numeroNfe).toBeUndefined();
    expect(payload.numeroCte).toBeUndefined();
  });
});

// ── pedidoSchema preserva os 6 campos SMBI (regressão do caso M) ────────────
//
// server/routers/faturamento.ts importa `server/db` (que chama `neon()` no
// carregamento do módulo, de propósito — todo router faz o mesmo), então
// precisa de um DATABASE_URL no processo antes do import — mesmo workaround
// de tests/radar-enrichment.test.ts. `neon()` só confere que a string existe,
// nunca conecta de fato aqui. Import dinâmico porque a variável precisa estar
// setada antes do módulo carregar — um `import` estático seria içado (hoisted)
// para antes desta linha.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
// server/routers/faturamento.ts importa `router`/`protectedProcedure` de
// server/trpc.ts, que importa server/auth.ts — este último lança na
// importação sem JWT_SECRET (checagem de propósito, não um bug). Mesmo
// motivo do DATABASE_URL acima: um valor fictício basta, nada aqui autentica
// de verdade.
process.env.JWT_SECRET ??= 'test-jwt-secret';
const { pedidoSchema } = await import('../server/routers/faturamento');

function basePedidoInput() {
  return {
    id: 'p1',
    taskId: null,
    sellerId: 5,
    sellerName: 'Fulano',
    clienteNome: 'Cliente X',
    cnpj: '12345678000100',
    razaoSocial: 'Cliente X LTDA',
    cidade: 'Mossoró',
    uf: 'RN',
    status: 'estimado' as const,
    comissaoPct: 5,
    itens: [],
    itensEstimadoSnapshot: null,
    prazoPagamentoSal: '30 DIAS',
    prazoPagamentoFrete: '20 DIAS',
    valorFretePorUnidade: 100,
    observacoes: '',
    criadoEm: '2026-09-01T00:00:00.000Z',
    faturadoEm: null,
  };
}

describe('pedidoSchema — campos SMBI', () => {
  it('preserva os 6 campos SMBI quando enviados', () => {
    const input = {
      ...basePedidoInput(),
      smbiMovsaiId: 'MOVSAI-1',
      numeroNfe: '111',
      numeroCte: '222',
      smbiCondpagSalCod: '2',
      smbiCondpagFreteCod: '5',
      comissaoComercialProtegida: 3.5,
    };
    const result = pedidoSchema.parse(input);
    expect(result.smbiMovsaiId).toBe('MOVSAI-1');
    expect(result.numeroNfe).toBe('111');
    expect(result.numeroCte).toBe('222');
    expect(result.smbiCondpagSalCod).toBe('2');
    expect(result.smbiCondpagFreteCod).toBe('5');
    expect(result.comissaoComercialProtegida).toBe(3.5);
  });

  it('tem default null nos 6 campos quando ausentes (payload legado)', () => {
    const result = pedidoSchema.parse(basePedidoInput());
    expect(result.smbiMovsaiId).toBeNull();
    expect(result.numeroNfe).toBeNull();
    expect(result.numeroCte).toBeNull();
    expect(result.smbiCondpagSalCod).toBeNull();
    expect(result.smbiCondpagFreteCod).toBeNull();
    expect(result.comissaoComercialProtegida).toBeNull();
  });
});
