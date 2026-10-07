import { describe, it, expect, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'teste-jwt-secret-apenas-para-vitest-0123456789';
  process.env.DATABASE_URL ||= 'postgres://u:p@localhost/x'; // neon() não conecta ao construir
});
vi.mock('../server/db/ordersDb', () => ({ ordersDb: {} }));

import { buildChatSystemPrompt, buildRecoveryPrompt } from '../server/routers/recovery';
import { CATALOG } from '../server/routers/shipping';

// O telefone do atendimento tem "84" (DDD); ele é exigido no prompt, então sai antes da checagem do "84".
const semTelefone = (t: string) => t.replaceAll('(84) 2140-8212', '');

const recovery = buildRecoveryPrompt({
  nome: 'Ana', telefone: '11999990000', quantidade: 1, etapa: 'chegou até o pagamento', cep: '59600000',
  abandonou: 'hoje', hora: 10, diaSemana: 'Segunda', cupom: null,
});
const chat = buildChatSystemPrompt();

describe.each([['chat', chat], ['recuperação de carrinho', recovery]])('prompt de %s — conformidade sanitária', (_nome, prompt) => {
  it('não contém alegações proibidas', () => {
    const t = semTelefone(prompt);
    expect(t).not.toMatch(/84/);
    expect(t).not.toMatch(/\+80/);
    expect(t.toLowerCase()).not.toContain('saudáve');
    expect(t.toLowerCase()).not.toContain('dieta natural');
    expect(t.toLowerCase()).not.toContain('iodo natural');
    expect(t.toLowerCase()).not.toContain('magnésio');
    expect(t.toLowerCase()).not.toContain('espontaneamente');
  });
  it('traz os ingredientes reais e o iodo adicionado', () => {
    expect(prompt).toContain('iodato de potássio');
    expect(prompt).toContain('INS-535');
    expect(prompt).toContain('25 mg/kg');
    expect(prompt).toContain('dezenas de minerais traço naturais');
  });
  it('manda para o WhatsApp o que não sabe (validade, prazos, políticas)', () => {
    expect(prompt).toContain('(84) 2140-8212');
  });
  it('preços vêm do CATALOG do servidor', () => {
    for (const p of Object.values(CATALOG)) expect(prompt).toContain(`R$ ${p.price.toFixed(2).replace('.', ',')}`);
  });
});

describe('prompt de chat', () => {
  it('responde ingredientes/aditivos com a verdade (não esconde)', () => {
    expect(chat).toMatch(/ingredientes ou aditivos, responda com a verdade/);
  });
});
