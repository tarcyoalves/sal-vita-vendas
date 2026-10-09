/**
 * Envio ao SMBI com escolha de empresa — decisões do CLIQUE (puras, sem banco).
 * Gate desligado = comportamento antigo; empresa obrigatória/homologada; troca só antes da primeira reserva;
 * envio × reserva × cancelamento × vínculo; hash da solicitação; campos empresariais fora do alcance da tela.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { FatOrder } from '../server/db/schema';
import {
  decidirEnvio, decidirVinculoEmpresa, hashSolicitacao, patchDesvincularEmpresa, PATCH_CANCELAR_ENVIO, solicitacaoObsoleta,
} from '../server/lib/smbiMultiempresa';
import { descartarCamposEmpresa, resolveRobotOwnedFields, SMBI_CAMPOS_EMPRESA } from '../server/lib/smbi';

const AS = '51422900000168';
const CALVES = '49748258000160';
const AGORA = new Date('2026-10-09T15:00:00.000Z');
const futuro = '2026-10-09T15:10:00.000Z';
const passado = '2026-10-09T14:00:00.000Z';

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i1', produtoId: 'p1', descricao: 'SAL MOIDO 25KG', quantidade: 100, pesoKg: 2500, valorUnitario: 12.5,
  pesoBrutoKg: 0, comissaoFixaPct: null, isentoFrete: false, ...over,
});

const pedido = (over: Partial<FatOrder> = {}): FatOrder => ({
  id: 'ped1', taskId: null, sellerId: 5, sellerName: 'Ana', clienteNome: 'Mercado X', cnpj: '11.222.333/0001-81',
  razaoSocial: 'MERCADO X LTDA', cidade: 'Mossoró', uf: 'RN', status: 'estimado', comissaoPct: 3,
  itens: [item()], itensEstimadoSnapshot: null, prazoPagamentoSal: '30 DIAS', prazoPagamentoFrete: '20 DIAS',
  valorFretePorUnidade: 100, observacoes: '', criadoEm: '2026-10-01T00:00:00.000Z', previsaoFaturamentoEm: null, faturadoEm: null,
  valorPago: 0, aprovadoEm: '2026-10-02T00:00:00.000Z', aprovadoPor: 'Admin', smbiMovsaiId: null, numeroNfe: null, numeroCte: null,
  smbiCondpagSalCod: '2', smbiCondpagFreteCod: '5', comissaoComercialProtegida: null,
  smbiSolicitadoEm: null, smbiSolicitadoPor: null, smbiEstado: null, smbiMotivoCodigo: null, smbiMotivoTexto: null, smbiTentativa: null,
  smbiAtualizadoEm: null, smbiConferidoEm: null, atualizadoEm: '2026-10-03T00:00:00.000Z', smbiReservaToken: null, smbiReservadoAte: null,
  smbiEspelhoFiscal: null, smbiAlertaDesconto: false, smbiVinculoEstado: null, smbiVinculoMovsais: null, smbiVinculoPor: null,
  smbiVinculoEm: null, smbiVinculoResultado: null,
  smbiEmpresaCnpj: null, smbiSolicitacaoId: null, smbiSolicitacaoHash: null, smbiEmpresaTravadaEm: null, smbiEscritaIniciadaEm: null,
  smbiEmpresaOrigem: null, createdByUserId: 1, createdByRole: 'user',
  ...over,
} as unknown as FatOrder);

const envio = (over: Partial<Parameters<typeof decidirEnvio>[0]> = {}) =>
  decidirEnvio({ multiempresaAtivo: true, empresaCnpj: AS, pedido: pedido(), agora: AGORA, ...over });

describe('gate desligado = comportamento antigo', () => {
  it('o input antigo (sem empresa) segue valendo e nada empresarial é gravado', () => {
    expect(envio({ multiempresaAtivo: false, empresaCnpj: undefined })).toEqual({ ok: true, modo: 'LEGADO' });
  });
  it('empresa enviada com o gate desligado é ignorada (nem validada): não vira escolha', () => {
    expect(envio({ multiempresaAtivo: false, empresaCnpj: CALVES })).toEqual({ ok: true, modo: 'LEGADO' });
    expect(envio({ multiempresaAtivo: false, empresaCnpj: 'lixo' })).toEqual({ ok: true, modo: 'LEGADO' });
  });
  it('pedido que já tem empresa não é reenviado pelo caminho antigo (ficaria preso fora da fila)', () => {
    expect(envio({ multiempresaAtivo: false, pedido: pedido({ smbiEmpresaCnpj: AS }) })).toMatchObject({ ok: false, codigo: 'EMPRESA_JA_ESCOLHIDA' });
  });
});

describe('gate ligado: a empresa é escolhida no clique, sem pré-seleção', () => {
  it('sem empresa → recusa (nada é assumido)', () => {
    for (const vazio of [undefined, null, '']) {
      expect(envio({ empresaCnpj: vazio })).toMatchObject({ ok: false, status: 400, codigo: 'EMPRESA_OBRIGATORIA' });
    }
  });
  it('empresa fora do catálogo ou mal formatada → recusa; o CNPJ do comprador não é empresa', () => {
    for (const ruim of ['11222333000181', '51.422.900/0001-68', ' 51422900000168', 'A S Comércio', 51422900000168]) {
      expect(envio({ empresaCnpj: ruim })).toMatchObject({ ok: false, codigo: 'EMPRESA_INVALIDA' });
    }
  });
  it('C Alves ainda não está homologada → recusa com mensagem clara', () => {
    const r = envio({ empresaCnpj: CALVES });
    expect(r).toMatchObject({ ok: false, status: 400, codigo: 'EMPRESA_NAO_HOMOLOGADA' });
    expect(!r.ok && r.erro).toBe('C Alves ainda não está habilitada');
  });
  it('A S Comércio → ok, com o hash da solicitação calculado sobre o pedido lido', () => {
    const p = pedido();
    const r = envio({ pedido: p });
    expect(r).toMatchObject({ ok: true, modo: 'MULTIEMPRESA', trocaEmpresa: false });
    expect(r.ok && r.modo === 'MULTIEMPRESA' && r.solicitacaoHash).toBe(hashSolicitacao(p, AS));
  });
});

describe('troca de empresa: só antes da primeira reserva', () => {
  // A C Alves não está homologada, então a troca é testada na direção C Alves → A S (empresa que já pode receber).
  it('antes da reserva (travada nula) a troca é permitida', () => {
    const p = pedido({ smbiEmpresaCnpj: CALVES, smbiSolicitadoEm: passado });
    expect(envio({ pedido: p })).toMatchObject({ ok: true, trocaEmpresa: true });
  });
  it('depois da primeira reserva a empresa está travada: troca recusada, mesmo com a reserva vencida', () => {
    const p = pedido({ smbiEmpresaCnpj: CALVES, smbiEmpresaTravadaEm: passado, smbiReservaToken: 't', smbiReservadoAte: passado });
    expect(envio({ pedido: p })).toMatchObject({ ok: false, codigo: 'EMPRESA_TRAVADA' });
  });
  it('travada sem empresa gravada é inconsistência: não deixa escolher', () => {
    expect(envio({ pedido: pedido({ smbiEmpresaTravadaEm: passado }) })).toMatchObject({ ok: false, codigo: 'EMPRESA_TRAVADA' });
  });
  it('reenviar para a MESMA empresa depois de travada é permitido (nova solicitação), com a reserva vencida', () => {
    const p = pedido({ smbiEmpresaCnpj: AS, smbiEmpresaTravadaEm: passado, smbiReservaToken: 't', smbiReservadoAte: passado });
    expect(envio({ pedido: p })).toMatchObject({ ok: true, modo: 'MULTIEMPRESA', trocaEmpresa: false });
  });
});

describe('envio × reserva × cancelamento × risco de escrita', () => {
  it('reserva vigente bloqueia o clique (o robô está processando)', () => {
    expect(envio({ pedido: pedido({ smbiEmpresaCnpj: AS, smbiReservaToken: 't', smbiReservadoAte: futuro }) })).toMatchObject({ ok: false, codigo: 'RESERVA_VIGENTE' });
  });
  it('reserva VENCIDA nunca libera a troca nem a recriação depois de /iniciar: o marcador de risco segura', () => {
    const p = pedido({ smbiEmpresaCnpj: AS, smbiEmpresaTravadaEm: passado, smbiEscritaIniciadaEm: passado, smbiReservaToken: 't', smbiReservadoAte: passado });
    expect(envio({ pedido: p })).toMatchObject({ ok: false, codigo: 'RISCO_DE_ESCRITA' });
    expect(envio({ pedido: p, empresaCnpj: CALVES })).toMatchObject({ ok: false }); // nem outra empresa
  });
  it('com movsai gravado o marcador deixa de ser risco (o resultado é conhecido)', () => {
    const p = pedido({ smbiEmpresaCnpj: AS, smbiEscritaIniciadaEm: passado, smbiMovsaiId: '1200' });
    expect(envio({ pedido: p })).toMatchObject({ ok: true }); // (o router recusa antes: "já criado no SMBI")
  });
  it('cancelar zera só o clique e o estado: empresa, solicitação, travamento e risco ficam', () => {
    expect(Object.keys(PATCH_CANCELAR_ENVIO).sort()).toEqual([
      'smbiAtualizadoEm', 'smbiConferidoEm', 'smbiEstado', 'smbiMotivoCodigo', 'smbiMotivoTexto', 'smbiSolicitadoEm', 'smbiSolicitadoPor', 'smbiTentativa',
    ]);
    for (const k of [...SMBI_CAMPOS_EMPRESA, 'smbiReservaToken', 'smbiReservadoAte']) expect(PATCH_CANCELAR_ENVIO).not.toHaveProperty(k);
  });
});

describe('vincular com a reserva e a empresa', () => {
  const vinc = (over: Partial<Parameters<typeof decidirVinculoEmpresa>[0]> = {}) =>
    decidirVinculoEmpresa({ multiempresaAtivo: true, empresaCnpj: AS, pedido: pedido(), agora: AGORA, ...over });

  it('pedido com reserva vigente é recusado, com o gate ligado ou desligado', () => {
    const p = pedido({ smbiReservaToken: 't', smbiReservadoAte: futuro });
    expect(vinc({ pedido: p })).toMatchObject({ ok: false, codigo: 'RESERVA_VIGENTE' });
    expect(vinc({ pedido: p, multiempresaAtivo: false })).toMatchObject({ ok: false, codigo: 'RESERVA_VIGENTE' });
  });
  it('reserva vencida não impede o vínculo (é o caminho de reconciliação)', () => {
    expect(vinc({ pedido: pedido({ smbiReservaToken: 't', smbiReservadoAte: passado }) })).toMatchObject({ ok: true });
  });
  it('gate desligado: comportamento antigo, empresa não é gravada', () => {
    expect(vinc({ multiempresaAtivo: false, empresaCnpj: undefined })).toEqual({ ok: true, empresa: null, gravarEmpresa: false });
  });
  it('gate ligado exige a empresa quando o pedido ainda não tem; grava (origem do vínculo)', () => {
    expect(vinc({ empresaCnpj: undefined })).toMatchObject({ ok: false, codigo: 'EMPRESA_OBRIGATORIA' });
    expect(vinc({ empresaCnpj: 'x' })).toMatchObject({ ok: false, codigo: 'EMPRESA_INVALIDA' });
    expect(vinc()).toMatchObject({ ok: true, gravarEmpresa: true, empresa: { cnpj: AS } });
  });
  it('usa a empresa do pedido quando já escolhida; informar outra é recusado (travada ou não)', () => {
    const escolhido = pedido({ smbiEmpresaCnpj: AS });
    expect(vinc({ pedido: escolhido, empresaCnpj: undefined })).toMatchObject({ ok: true, gravarEmpresa: false, empresa: { cnpj: AS } });
    expect(vinc({ pedido: escolhido, empresaCnpj: CALVES })).toMatchObject({ ok: false, codigo: 'EMPRESA_DIVERGENTE' });
    expect(vinc({ pedido: pedido({ smbiEmpresaCnpj: AS, smbiEmpresaTravadaEm: passado }), empresaCnpj: CALVES })).toMatchObject({ ok: false, codigo: 'EMPRESA_TRAVADA' });
  });
  it('desvincular: o marcador de risco só cai quando o movsai veio do próprio robô (resultado conhecido)', () => {
    expect(patchDesvincularEmpresa({ smbiEmpresaCnpj: AS, smbiMovsaiId: '1200', smbiVinculoEstado: null })).toEqual({ smbiEscritaIniciadaEm: null });
    expect(patchDesvincularEmpresa({ smbiEmpresaCnpj: AS, smbiMovsaiId: '1200', smbiVinculoEstado: 'CONFERIDO' })).toEqual({});
    expect(patchDesvincularEmpresa({ smbiEmpresaCnpj: AS, smbiMovsaiId: null, smbiVinculoEstado: null })).toEqual({});
    expect(patchDesvincularEmpresa({ smbiEmpresaCnpj: null, smbiMovsaiId: '1', smbiVinculoEstado: null })).toEqual({});
  });
});

describe('hash da solicitação', () => {
  const h = (p: FatOrder, e = AS) => hashSolicitacao(p, e);

  it('é estável (mesma entrada, mesmo hash) e não depende da ordem dos itens', () => {
    const a = item({ id: 'a', descricao: 'SAL A' });
    const b = item({ id: 'b', descricao: 'SAL B', quantidade: 5 });
    expect(h(pedido())).toBe(h(pedido()));
    expect(h(pedido({ itens: [a, b] }))).toBe(h(pedido({ itens: [b, a] })));
    expect(h(pedido())).toMatch(/^[0-9a-f]{64}$/);
  });
  it('muda com qualquer alteração de item, valor, prazo, frete, comprador ou empresa', () => {
    const base = h(pedido());
    const mudancas: Array<Partial<FatOrder>> = [
      { itens: [item({ quantidade: 101 })] },
      { itens: [item({ valorUnitario: 12.6 })] },
      { itens: [item({ pesoKg: 2600 })] },
      { itens: [item({ descricao: 'SAL REFINADO' })] },
      { itens: [item(), item({ id: 'i2', descricao: 'OUTRO' })] },
      { prazoPagamentoSal: '60 DIAS', smbiCondpagSalCod: '9' },
      { smbiCondpagFreteCod: '6' },
      { valorFretePorUnidade: 101 },
      { cnpj: '11444777000161' },
      { razaoSocial: 'OUTRO LTDA' },
      { cidade: 'Natal' },
    ];
    for (const m of mudancas) expect(h(pedido(m))).not.toBe(base);
    expect(h(pedido(), CALVES)).not.toBe(base);
  });
  it('ignora o que o robô não digita (observações, comissão, marcas de tempo) e a pontuação do CNPJ', () => {
    const base = h(pedido());
    expect(h(pedido({ observacoes: 'ligar antes', comissaoPct: 9, atualizadoEm: '2027-01-01T00:00:00.000Z' }))).toBe(base);
    expect(h(pedido({ cnpj: '11222333000181' }))).toBe(base);
  });
  it('solicitação obsoleta: item editado depois do clique, ou pedido tocado depois do clique', () => {
    const p = pedido({ smbiEmpresaCnpj: AS, smbiSolicitacaoId: 'u', smbiSolicitacaoHash: h(pedido()), smbiSolicitadoEm: '2026-10-09T10:00:00.000Z', atualizadoEm: '2026-10-03T00:00:00.000Z' });
    expect(solicitacaoObsoleta(p)).toBe(false);
    expect(solicitacaoObsoleta({ ...p, itens: [item({ quantidade: 99 })] })).toBe(true);
    expect(solicitacaoObsoleta({ ...p, atualizadoEm: '2026-10-09T11:00:00.000Z' })).toBe(true);
    expect(solicitacaoObsoleta({ ...p, smbiSolicitacaoHash: null })).toBe(true);
    expect(solicitacaoObsoleta({ ...p, smbiEmpresaCnpj: CALVES })).toBe(true); // hash é da outra empresa
  });
});

describe('upsertPedido / importLocal / cache antigo não escrevem nem limpam campo empresarial', () => {
  it('descartarCamposEmpresa remove só os campos empresariais', () => {
    const entrada = { id: 'x', cnpj: '1', smbiEmpresaCnpj: AS, smbiSolicitacaoId: 'u', smbiSolicitacaoHash: 'h', smbiEmpresaTravadaEm: 't', smbiEscritaIniciadaEm: 'e', smbiEmpresaOrigem: 'ESCOLHA_ENVIO' };
    expect(descartarCamposEmpresa(entrada)).toEqual({ id: 'x', cnpj: '1' });
    expect(SMBI_CAMPOS_EMPRESA).toHaveLength(6);
  });
  it('resolveRobotOwnedFields segue devolvendo só os 4 campos de sempre (nada empresarial pela tela)', () => {
    const r = resolveRobotOwnedFields({ smbiMovsaiId: '1', numeroNfe: null, numeroCte: null, comissaoComercialProtegida: null }, {}, true);
    expect(Object.keys(r).sort()).toEqual(['comissaoComercialProtegida', 'numeroCte', 'numeroNfe', 'smbiMovsaiId']);
  });
  it('o `set` do upsertPedido não lista nenhum campo empresarial (então um save da tela nunca os limpa)', () => {
    const fonte = readFileSync('server/routers/faturamento.ts', 'utf8');
    const ini = fonte.indexOf('.onConflictDoUpdate({\n          target: fatOrders.id,');
    const fim = fonte.indexOf('.returning();', ini);
    expect(ini).toBeGreaterThan(0);
    const bloco = fonte.slice(ini, fim);
    for (const campo of SMBI_CAMPOS_EMPRESA) expect(bloco).not.toContain(campo);
  });
});

describe('pedidoSchema (entrada da tela / importLocal) descarta campos empresariais', async () => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
  process.env.JWT_SECRET ??= 'test-jwt-secret';
  const { pedidoSchema } = await import('../server/routers/faturamento');
  it('um cache antigo ou malicioso não consegue injetar empresa, solicitação, travamento ou marcador', () => {
    const r = pedidoSchema.parse({
      id: 'p1', taskId: null, sellerId: 5, sellerName: 'F', clienteNome: 'C', cnpj: '1', razaoSocial: 'R', cidade: 'M', uf: 'RN',
      status: 'estimado', comissaoPct: 5, itens: [], itensEstimadoSnapshot: null, prazoPagamentoSal: '30', prazoPagamentoFrete: '20',
      valorFretePorUnidade: 1, observacoes: '', criadoEm: '2026-09-01T00:00:00.000Z', faturadoEm: null,
      smbiEmpresaCnpj: AS, smbiSolicitacaoId: 'u', smbiSolicitacaoHash: 'h', smbiEmpresaTravadaEm: 't', smbiEscritaIniciadaEm: 'e', smbiEmpresaOrigem: 'ESCOLHA_ENVIO',
    });
    for (const campo of SMBI_CAMPOS_EMPRESA) expect(r).not.toHaveProperty(campo);
  });
});
