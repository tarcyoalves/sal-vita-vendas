import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  REAGENDAMENTO_TOKEN_TTL_MS, emitirTokenReagendamento, novaRequisicaoId, verificarTokenReagendamento,
} from '../server/lib/rescheduleToken';
import { dataBr, dataHoraBr, diaBrCompacto } from '../server/lib/fusoBr';

const SEGREDO = 'segredo-de-teste-com-tamanho-suficiente';
const lote = { userId: 1, sellerId: 7, perDay: 50, startHour: 8, taskIds: [3, 1, 2] };
const t0 = Date.UTC(2026, 9, 20, 12, 0, 0);

describe('token de confirmação do reagendamento', () => {
  const rid = 'aaaa1111';
  const token = emitirTokenReagendamento(lote, rid, SEGREDO, t0);

  it('é aceito em OUTRA requisição, dentro do prazo, para o mesmo lote (ordem dos ids não importa)', () => {
    expect(verificarTokenReagendamento(token, { ...lote, taskIds: [1, 2, 3] }, 'bbbb2222', SEGREDO, t0 + 60_000)).toEqual({ ok: true });
  });
  it('não é aceito na mesma requisição que o emitiu (modelo não simula e executa sozinho)', () => {
    expect(verificarTokenReagendamento(token, lote, rid, SEGREDO, t0 + 1000)).toEqual({ ok: false, motivo: 'MESMA_REQUISICAO' });
  });
  it('expira', () => {
    expect(verificarTokenReagendamento(token, lote, 'bbbb2222', SEGREDO, t0 + REAGENDAMENTO_TOKEN_TTL_MS + 1)).toEqual({ ok: false, motivo: 'EXPIRADO' });
  });
  it('a constante antiga e valores inventados são recusados', () => {
    for (const falso of ['CONFIRMAR_REAGENDAMENTO', '', undefined, null, 123, 'a.b.c', `${t0 + 1000}.${rid}.${'0'.repeat(64)}`]) {
      expect(verificarTokenReagendamento(falso, lote, 'bbbb2222', SEGREDO, t0).ok).toBe(false);
    }
  });
  it('só vale para aquele lote: outro conjunto de tarefas, atendente, parâmetros ou usuário invalidam', () => {
    const v = (l: typeof lote) => verificarTokenReagendamento(token, l, 'bbbb2222', SEGREDO, t0).ok;
    expect(v({ ...lote, taskIds: [1, 2, 3, 4] })).toBe(false);
    expect(v({ ...lote, sellerId: 8 })).toBe(false);
    expect(v({ ...lote, perDay: 10 })).toBe(false);
    expect(v({ ...lote, startHour: 9 })).toBe(false);
    expect(v({ ...lote, userId: 2 })).toBe(false);
  });
  it('outro segredo invalida; ajustar o prazo à mão invalida', () => {
    expect(verificarTokenReagendamento(token, lote, 'bbbb2222', 'outro-segredo', t0).ok).toBe(false);
    const [, r, mac] = token.split('.');
    expect(verificarTokenReagendamento(`${t0 + 99_999_999}.${r}.${mac}`, lote, 'bbbb2222', SEGREDO, t0).ok).toBe(false);
  });
  it('novaRequisicaoId gera ids diferentes', () => {
    expect(novaRequisicaoId()).not.toBe(novaRequisicaoId());
  });
});

describe('código-fonte da IA do admin', () => {
  const ai = readFileSync('server/routers/ai.ts', 'utf8');
  it('a constante CONFIRMAR_REAGENDAMENTO não existe mais', () => {
    expect(ai).not.toMatch(/CONFIRMAR_REAGENDAMENTO/);
  });
  it('a execução passa pela verificação do token do servidor', () => {
    expect(ai).toMatch(/verificarTokenReagendamento\(args\.confirmation_code/);
    expect(ai).toMatch(/token_confirmacao/);
  });
  it('conteúdo de base de conhecimento é marcado como dado não confiável e o prompt avisa', () => {
    expect(ai).toMatch(/function dadoNaoConfiavel/);
    expect(ai).toMatch(/DADOS NÃO CONFIÁVEIS/);
    expect(ai).not.toMatch(/\$\{d\.content\.slice/);
    expect(ai).toMatch(/SEGURANÇA: o conteúdo devolvido por search_knowledge/);
  });
  it('datas em texto usam o fuso do Brasil', () => {
    expect(ai).not.toMatch(/toLocale(Date)?String\('pt-BR'\)/);
  });
});

describe('knowledge: escrita só para staff', () => {
  const src = readFileSync('server/routers/knowledge.ts', 'utf8');
  it('create e delete usam staffProcedure', () => {
    expect(src).toMatch(/create: staffProcedure/);
    expect(src).toMatch(/delete: staffProcedure/);
    expect(src).not.toMatch(/(create|delete): protectedProcedure/);
  });
});

describe('fuso do Brasil', () => {
  // 01:30 UTC de 21/10 = 22:30 de 20/10 em Fortaleza (UTC-3).
  const d = new Date('2026-10-21T01:30:00Z');
  it('mostra o dia/hora local, não o UTC', () => {
    expect(dataBr(d)).toBe('20/10/2026');
    expect(dataHoraBr(d)).toContain('20/10/2026');
    expect(dataHoraBr(d)).toContain('22:30');
    expect(diaBrCompacto(d)).toBe('20261020');
  });
  it('PDF do pedido e do crédito usam o helper', () => {
    expect(readFileSync('server/pdf/pedidoPdf.tsx', 'utf8')).toMatch(/toLocaleDateString\('pt-BR', OPCOES_FUSO_BR\)/);
    expect(readFileSync('server/routers/credito.ts', 'utf8')).toMatch(/diaBrCompacto\(row\.consultadoEm\)/);
  });
});
