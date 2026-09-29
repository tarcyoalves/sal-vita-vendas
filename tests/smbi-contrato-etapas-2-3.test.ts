import { describe, it, expect } from 'vitest';
import {
  faturamentoBodySchema, somarFiscal, alertaDescontoFiscal, numerosFiscais, resolverFaturamento,
  statusBodySchema, deveDesvincular, PATCH_DESVINCULAR, vinculoResultadoSchema, decidirVinculo,
  faturamentoDoVinculo, parseNumerosMovsai, reservaAte, reservaConfere, movsaisLigados, montarResultadoVinculo,
} from '../server/lib/smbiFaturamento';
import { isElegivelParaSmbi } from '../server/lib/smbi';
import type { SmbiMovsaiFiscal } from '../shared/smbiEstados';

const AGORA = new Date('2026-09-29T15:00:00.000Z');

const mov = (id: string, sal?: number, frete?: number, nfe = 'N' + id, cte = 'C' + id): SmbiMovsaiFiscal => ({
  id, pesoKg: 30000,
  nfe: { numero: nfe, valorSal: sal },
  cte: { numero: cte, valorFrete: frete },
});

const ligado = { smbiMovsaiId: '1071', smbiVinculoMovsais: null, status: 'estimado', faturadoEm: null };

describe('rota 3 — faturado espelhado', () => {
  it('valida o corpo do contrato', () => {
    const ok = faturamentoBodySchema.safeParse({
      movsais: [{ id: '1071', pesoKg: 30000, nfe: { numero: '1', chave: 'x', data: '2026-09-25', valorTotal: 10, valorSal: 8 }, cte: { numero: '2', valorFrete: 2 } }],
      faturadoEm: '2026-09-25T10:00:00-03:00', snapshotHash: 'abc',
    });
    expect(ok.success).toBe(true);
    expect(faturamentoBodySchema.safeParse({ movsais: [], faturadoEm: '2026-09-25' }).success).toBe(false);
    expect(faturamentoBodySchema.safeParse({ movsais: [{ id: '1' }], faturadoEm: 'ontem' }).success).toBe(false);
  });

  it('soma sal (NF-e) + frete (CT-e) de todos os movsais', () => {
    expect(somarFiscal([mov('1', 800, 200), mov('2', 400, 100)])).toEqual({ total: 1500, informado: true });
    expect(somarFiscal([{ id: '1' }])).toEqual({ total: 0, informado: false });
  });

  it('desconto: fiscal abaixo do acordado alerta; igual (realocação sal→frete) NÃO alerta; tolerância R$ 0,05', () => {
    expect(alertaDescontoFiscal(1000, 900, true)).toBe(true);
    expect(alertaDescontoFiscal(1000, 1000, true)).toBe(false);
    expect(alertaDescontoFiscal(1000, 999.96, true)).toBe(false);
    expect(alertaDescontoFiscal(1000, 999.9, true)).toBe(true);
    expect(alertaDescontoFiscal(1000, 1200, true)).toBe(false);
    expect(alertaDescontoFiscal(1000, 0, false)).toBe(false); // robô não informou valores: não compara
  });

  it('N movsais por pedido do CRM: números saem juntos, sem repetir', () => {
    expect(numerosFiscais([mov('1', 1, 1, '10', '20'), mov('2', 1, 1, '11', '20')])).toEqual({ numeroNfe: '10, 11', numeroCte: '20' });
    expect(numerosFiscais([{ id: '1' }])).toEqual({ numeroNfe: null, numeroCte: null });
  });

  it('pedido sem vínculo, ou movsais de outro pedido, não fatura (409)', () => {
    const body = faturamentoBodySchema.parse({ movsais: [mov('1071', 800, 200)], faturadoEm: '2026-09-25T10:00:00Z' });
    expect(resolverFaturamento({ ...ligado, smbiMovsaiId: null }, body, 1000, AGORA).erro).toMatch(/sem vínculo/);
    expect(resolverFaturamento({ ...ligado, smbiMovsaiId: '999' }, body, 1000, AGORA).erro).toMatch(/nenhum dos movsais/);
  });

  it('fatura: status, data, NF/CT e espelho; NUNCA valor comercial nem comissão', () => {
    const body = faturamentoBodySchema.parse({ movsais: [mov('1071', 800, 200)], faturadoEm: '2026-09-25T10:00:00Z' });
    const { erro, patch } = resolverFaturamento(ligado, body, 1000, AGORA);
    expect(erro).toBeNull();
    expect(patch).toMatchObject({ status: 'faturado', faturadoEm: '2026-09-25T10:00:00Z', numeroNfe: 'N1071', numeroCte: 'C1071', smbiAlertaDesconto: false });
    expect(patch.smbiEspelhoFiscal).toMatchObject({ totalFiscal: 1000, totalAcordado: 1000, recebidoEm: AGORA.toISOString() });
    const proibidas = ['itens', 'comissaoPct', 'comissaoComercialProtegida', 'valorFretePorUnidade', 'valorPago', 'itensEstimadoSnapshot'];
    for (const k of proibidas) expect(patch).not.toHaveProperty(k);
  });

  it('desconto real liga o alerta', () => {
    const body = faturamentoBodySchema.parse({ movsais: [mov('1071', 700, 200)], faturadoEm: '2026-09-25T10:00:00Z' });
    expect(resolverFaturamento(ligado, body, 1000, AGORA).patch.smbiAlertaDesconto).toBe(true);
  });

  it('já faturado por decisão humana: só o espelho muda; status e data ficam', () => {
    const body = faturamentoBodySchema.parse({ movsais: [mov('1071', 800, 200)], faturadoEm: '2026-09-25T10:00:00Z' });
    const { patch } = resolverFaturamento({ ...ligado, status: 'faturado', faturadoEm: '2026-09-20T00:00:00Z' }, body, 1000, AGORA);
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('faturadoEm');
    expect(patch.smbiEspelhoFiscal).toBeTruthy();
  });

  it('é idempotente: mesmo corpo, mesmo patch (fora a hora de recebimento)', () => {
    const body = faturamentoBodySchema.parse({ movsais: [mov('1071', 800, 200)], faturadoEm: '2026-09-25T10:00:00Z' });
    expect(resolverFaturamento(ligado, body, 1000, AGORA)).toEqual(resolverFaturamento(ligado, body, 1000, AGORA));
  });

  it('vários movsais ligados: qualquer um deles vale', () => {
    const lig = { ...ligado, smbiMovsaiId: '1071', smbiVinculoMovsais: ['1071', '1072'] };
    expect(movsaisLigados(lig)).toEqual(['1071', '1072']);
    const body = faturamentoBodySchema.parse({ movsais: [mov('1072', 400, 100)], faturadoEm: '2026-09-25T10:00:00Z' });
    expect(resolverFaturamento(lig, body, 500, AGORA).erro).toBeNull();
  });
});

describe('rota 7 — linha do tempo e EXCLUIDO_SMBI', () => {
  it('só aceita os eventos do contrato', () => {
    expect(statusBodySchema.safeParse({ evento: 'EM_OE', em: '2026-09-25T10:00:00Z' }).success).toBe(true);
    expect(statusBodySchema.safeParse({ evento: 'OUTRO', em: '2026-09-25T10:00:00Z' }).success).toBe(false);
    expect(statusBodySchema.safeParse({ evento: 'CIOT', em: 'lixo' }).success).toBe(false);
  });

  it('EXCLUIDO_SMBI desliga o vínculo; outros eventos não; movsai excluído diferente do ligado não desliga', () => {
    expect(deveDesvincular('EXCLUIDO_SMBI', undefined, ['1071'])).toBe(true);
    expect(deveDesvincular('EXCLUIDO_SMBI', { movsaiId: '1071' }, ['1071'])).toBe(true);
    expect(deveDesvincular('EXCLUIDO_SMBI', { movsaiId: '1115' }, ['1071'])).toBe(false);
    expect(deveDesvincular('CANCELADO_SMBI', undefined, ['1071'])).toBe(false);
    expect(deveDesvincular('FATURADO', undefined, ['1071'])).toBe(false);
  });

  it('desvincular zera clique, reserva, estado e vínculo: só volta ao robô com NOVO clique', () => {
    expect(PATCH_DESVINCULAR).toMatchObject({
      smbiMovsaiId: null, smbiSolicitadoEm: null, smbiSolicitadoPor: null, smbiReservaToken: null,
      smbiVinculoEstado: null, smbiEstado: null, smbiAlertaDesconto: false,
    });
    for (const k of ['status', 'faturadoEm', 'itens', 'comissaoPct', 'comissaoComercialProtegida']) {
      expect(PATCH_DESVINCULAR).not.toHaveProperty(k);
    }
  });
});

describe('rota 5 — conferência do vínculo manual', () => {
  const corpo = (over: Record<string, unknown> = {}) => vinculoResultadoSchema.parse({
    movsais: [{ id: '1071', cnpj: '1', cliente: 'X', itens: [{ produto: 'SAL', qtdKg: 30000 }], faturado: true, nfe: { numero: '9', valorSal: 800, data: '2026-09-25' }, cte: { numero: '8', valorFrete: 200 } }],
    confere: { cliente: true, produto: true, quantidade: true },
    ...over,
  });

  it('tudo confere e os movsais são exatamente os pedidos ⇒ CONFERIDO', () => {
    expect(decidirVinculo(['1071'], corpo())).toBe('CONFERIDO');
  });

  it('qualquer divergência (ou movsais diferentes dos pedidos) ⇒ VINCULO_COM_DIVERGENCIA', () => {
    expect(decidirVinculo(['1071'], corpo({ confere: { cliente: true, produto: true, quantidade: false } }))).toBe('VINCULO_COM_DIVERGENCIA');
    expect(decidirVinculo(['1071', '1072'], corpo())).toBe('VINCULO_COM_DIVERGENCIA');
    expect(decidirVinculo(['999'], corpo())).toBe('VINCULO_COM_DIVERGENCIA');
  });

  it('movsai faturado no SMBI vira corpo de faturamento; sem faturado, nada é espelhado', () => {
    const fb = faturamentoDoVinculo(corpo(), AGORA);
    expect(fb?.movsais[0]).toMatchObject({ id: '1071', nfe: { numero: '9' } });
    expect(fb?.faturadoEm).toBe('2026-09-25');
    const semFat = corpo({ movsais: [{ id: '1071', faturado: false }] });
    expect(faturamentoDoVinculo(semFat, AGORA)).toBeNull();
  });

  it('guarda NF/CT no resultado para o admin poder confirmar uma divergência depois', () => {
    const r = montarResultadoVinculo(corpo(), AGORA);
    expect(r.movsais[0].nfe?.numero).toBe('9');
    expect(faturamentoDoVinculo(r, AGORA)?.movsais[0].cte?.numero).toBe('8');
  });
});

describe('vincular: números do SMBI digitados pelo admin', () => {
  it('aceita um ou vários, sem repetir', () => {
    expect(parseNumerosMovsai('1071')).toEqual(['1071']);
    expect(parseNumerosMovsai('1071, 1072 ,1071;1073')).toEqual(['1071', '1072', '1073']);
  });
  it('recusa lixo, vazio e excesso', () => {
    expect(parseNumerosMovsai('')).toBeNull();
    expect(parseNumerosMovsai('10x71')).toBeNull();
    expect(parseNumerosMovsai('MOV-1')).toBeNull();
    expect(parseNumerosMovsai(Array.from({ length: 21 }, (_, i) => String(i + 1)).join(','))).toBeNull();
  });
});

describe('reserva anti-duplicidade', () => {
  it('a reserva dura 15 minutos', () => {
    expect(Date.parse(reservaAte(AGORA)) - AGORA.getTime()).toBe(15 * 60_000);
  });

  it('a re-checagem só vale com o token certo e a reserva em vigor', () => {
    const row = { smbiReservaToken: 'tok-1', smbiReservadoAte: reservaAte(AGORA) };
    expect(reservaConfere(row, 'tok-1', AGORA)).toBe(true);
    expect(reservaConfere(row, 'tok-2', AGORA)).toBe(false);          // outro ciclo
    expect(reservaConfere(row, undefined, AGORA)).toBe(false);        // sem token: falha fechado
    expect(reservaConfere(row, 'tok-1', new Date(AGORA.getTime() + 16 * 60_000))).toBe(false); // vencida
    expect(reservaConfere({ smbiReservaToken: null, smbiReservadoAte: null }, 'tok-1', AGORA)).toBe(false);
  });
});

describe('elegibilidade: sem retentativa automática', () => {
  const base = {
    aprovadoEm: '2026-09-29T12:00:00Z', smbiSolicitadoEm: '2026-09-29T14:00:00Z', smbiSolicitadoPor: 'Tarcyo',
    smbiMovsaiId: null, smbiEstado: null, smbiVinculoEstado: null,
  };
  it('clique válido e sem resposta do robô é elegível', () => {
    expect(isElegivelParaSmbi(base)).toBe(true);
  });
  it('PENDENTE, ERRO e DIVERGENTE tiram o pedido da lista até um novo clique', () => {
    for (const estado of ['PENDENTE', 'ERRO', 'DIVERGENTE']) expect(isElegivelParaSmbi({ ...base, smbiEstado: estado })).toBe(false);
  });
  it('pedido com vínculo manual nunca é criado pelo robô', () => {
    expect(isElegivelParaSmbi({ ...base, smbiVinculoEstado: 'PENDENTE_CONFERENCIA' })).toBe(false);
  });
});
