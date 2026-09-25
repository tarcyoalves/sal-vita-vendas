/**
 * Rascunho de mensagem do Radar de Cargas (server/lib/radar/messageDraft.ts).
 *
 * A mensagem sempre é enviada à mão pelo atendente (wa.me) — o que importa aqui é
 * que ela nunca invente preço/desconto/prazo, nunca fale de saúde/aditivo/mineral
 * (ESTADO-DO-PROJETO.md seção 4) e sempre caia para o template fixo quando a IA
 * falhar ou fugir do combinado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDeterministicRadarMessage,
  draftRadarMessage,
  passesRadarMessageGuard,
  type RadarDraftInput,
} from '../server/lib/radar/messageDraft';

const baseInput: RadarDraftInput = {
  companyName: 'Mercado Bom Preço',
  cityLabel: 'Dionísio Cerqueira - SC',
  segmentLabels: ['Supermercados'],
  originLabel: 'Barracão - PR',
  bags: 300,
  attendantName: 'Carla',
};

const ENV_KEYS = ['ANTIGRAVITY_BASE_URL', 'ANTIGRAVITY_API_KEY', 'ANTIGRAVITY_MODEL', 'GROQ_API_KEY'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

describe('buildDeterministicRadarMessage', () => {
  it('gera um template que passa no próprio guard', () => {
    const msg = buildDeterministicRadarMessage(baseInput);
    expect(passesRadarMessageGuard(msg, baseInput)).toBe(true);
  });

  it('menciona a data só quando ela é informada', () => {
    const semData = buildDeterministicRadarMessage(baseInput);
    expect(semData).not.toMatch(/\bdia\b/);

    const comData = buildDeterministicRadarMessage({ ...baseInput, loadDate: '2026-10-12' });
    expect(comData).toContain('12/10');
    expect(passesRadarMessageGuard(comData, { ...baseInput, loadDate: '2026-10-12' })).toBe(true);
  });

  it('só fala de frete quando o atendente escreveu freightNote', () => {
    const semFrete = buildDeterministicRadarMessage(baseInput);
    expect(semFrete.toLowerCase()).not.toContain('frete grátis');

    const comFrete = buildDeterministicRadarMessage({ ...baseInput, freightNote: 'frete rateado entre os pedidos da carga' });
    expect(comFrete).toContain('frete rateado entre os pedidos da carga');
    expect(passesRadarMessageGuard(comFrete, { ...baseInput, freightNote: 'frete rateado entre os pedidos da carga' })).toBe(true);
  });
});

describe('passesRadarMessageGuard', () => {
  it('aceita uma mensagem simples e correta', () => {
    expect(passesRadarMessageGuard('Olá! Temos 300 sacos de 25 kg de sal disponíveis. Quer um orçamento?', baseInput)).toBe(true);
  });

  it('rejeita mensagem vazia', () => {
    expect(passesRadarMessageGuard('', baseInput)).toBe(false);
  });

  it('rejeita mensagem maior que 700 caracteres', () => {
    expect(passesRadarMessageGuard('a'.repeat(701), baseInput)).toBe(false);
  });

  it('rejeita preço em R$ que o atendente não escreveu', () => {
    expect(passesRadarMessageGuard('Temos 300 sacos por R$ 20 cada. Quer orçamento?', baseInput)).toBe(false);
  });

  it('aceita R$ quando ele vem do freightNote do atendente', () => {
    const input = { ...baseInput, freightNote: 'frete a partir de R$ 300' };
    expect(passesRadarMessageGuard('Temos 300 sacos. Condição: frete a partir de R$ 300. Quer orçamento?', input)).toBe(true);
  });

  it('rejeita percentual inventado', () => {
    expect(passesRadarMessageGuard('300 sacos com 10% de desconto. Fechado?', baseInput)).toBe(false);
  });

  it('rejeita número de sacos diferente do combinado', () => {
    expect(passesRadarMessageGuard('Temos 500 sacos de 25 kg disponíveis. Quer orçamento?', baseInput)).toBe(false);
  });

  it('rejeita dígito de dinheiro que não está no freightNote nem é o saldo/peso combinado', () => {
    expect(passesRadarMessageGuard('300 sacos de 25 kg, entrega em 15 dias. Quer orçamento?', baseInput)).toBe(false);
  });

  for (const term of ['saúde', 'saudável', 'benefício', 'aditivo', 'natural', 'puro', 'pureza', 'mineral', 'iodo', 'cura', 'previne', 'medicinal', 'orgânico']) {
    it(`rejeita termo proibido "${term}"`, () => {
      expect(passesRadarMessageGuard(`Nosso sal é ${term} e temos 300 sacos disponíveis.`, baseInput)).toBe(false);
    });
  }

  it('rejeita link', () => {
    expect(passesRadarMessageGuard('300 sacos disponíveis, veja mais em https://salvitarn.com.br', baseInput)).toBe(false);
  });
});

describe('draftRadarMessage', () => {
  it('cai para o template fixo quando nenhum provedor de IA está configurado', async () => {
    const result = await draftRadarMessage(baseInput);
    expect(result.provider).toBe('modelo-fixo');
    expect(passesRadarMessageGuard(result.message, baseInput)).toBe(true);
  });

  it('cai para o template fixo quando a chamada à IA falha', async () => {
    process.env.GROQ_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await draftRadarMessage(baseInput);
    expect(result.provider).toBe('modelo-fixo');
    expect(result.message).toBe(buildDeterministicRadarMessage(baseInput));
  });

  it('cai para o template fixo quando a IA devolve algo que fura o guard', async () => {
    process.env.GROQ_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Nosso sal é 100% natural, com +80 minerais!' } }] }),
    }));

    const result = await draftRadarMessage(baseInput);
    expect(result.provider).toBe('modelo-fixo');
  });

  it('usa o texto da IA quando ele passa no guard', async () => {
    process.env.GROQ_API_KEY = 'g';
    const modelText = 'Olá! Aqui é Carla, da Sal Vita. Temos espaço para 300 sacos de 25 kg numa carreta para Barracão - PR. Quer um orçamento?';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: `"${modelText}"` } }] }),
    }));

    const result = await draftRadarMessage(baseInput);
    expect(result.provider).toBe('groq');
    expect(result.message).toBe(modelText); // aspas em volta removidas
  });
});

describe('guard — números que já estão nos dados reais', () => {
  it('aceita número do nome da empresa (ex.: "2 IRMÃOS")', () => {
    const msg = 'Olá, pessoal da Agropecuária 2 Irmãos! Tenho espaço para 400 sacos de 25 kg. Querem um orçamento?';
    expect(passesRadarMessageGuard(msg, { bags: 400, companyName: 'AGROPECUARIA 2 IRMAOS' })).toBe(true);
    expect(passesRadarMessageGuard(msg, { bags: 400 })).toBe(false);
  });
});
