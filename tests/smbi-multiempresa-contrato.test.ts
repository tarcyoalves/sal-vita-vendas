/**
 * Contrato v2 do robô (docs/SMBI-MULTIEMPRESA.md) — regras PURAS: protocolo, fila, /iniciar, retorno,
 * referência ERP (empresa, movsai) e faturamento. Sem banco, sem rede.
 */
import { describe, it, expect } from 'vitest';
import type { FatOrder } from '../server/db/schema';
import {
  chaveErp, decidirIniciar, decidirRetorno, exigeProtocolo2, filaBloqueadaPorProtocolo, hashSolicitacao, montarLigados,
  montarVinculos, motivoForaDaFila, protocoloDoRobo, validarEmpresaDoRobo,
} from '../server/lib/smbiMultiempresa';
import { mapOrderToSmbiPayload, retornoBodySchema } from '../server/lib/smbi';
import {
  faturamentoBodySchema, faturamentoDoVinculo, montarResultadoVinculo, resolverFaturamento, statusBodySchema, vinculoResultadoSchema,
} from '../server/lib/smbiFaturamento';

const AS = '51422900000168';
const CALVES = '49748258000160';
const AGORA = new Date('2026-10-09T15:00:00.000Z');
const CLIQUE = '2026-10-09T14:00:00.000Z';
const futuro = '2026-10-09T15:10:00.000Z';
const passado = '2026-10-09T14:30:00.000Z';
const GATES = { multiempresaAtivo: true, roboAtivo: true };

const item = () => ({
  id: 'i1', produtoId: 'p1', descricao: 'SAL MOIDO 25KG', quantidade: 100, pesoKg: 2500, valorUnitario: 12.5,
  pesoBrutoKg: 0, comissaoFixaPct: null, isentoFrete: false,
});

/** Pedido enviado para a A S Comércio, com solicitação vigente e reserva viva (estado do /iniciar). */
const pedido = (over: Partial<FatOrder> = {}): FatOrder => {
  const base = {
    id: 'ped1', taskId: null, sellerId: 5, sellerName: 'Ana', clienteNome: 'Mercado X', cnpj: '11222333000181',
    razaoSocial: 'MERCADO X LTDA', cidade: 'Mossoró', uf: 'RN', status: 'estimado', comissaoPct: 3,
    itens: [item()], itensEstimadoSnapshot: null, prazoPagamentoSal: '30 DIAS', prazoPagamentoFrete: '20 DIAS',
    valorFretePorUnidade: 100, observacoes: '', criadoEm: '2026-10-01T00:00:00.000Z', previsaoFaturamentoEm: null, faturadoEm: null,
    valorPago: 0, aprovadoEm: '2026-10-02T00:00:00.000Z', aprovadoPor: 'Admin', smbiMovsaiId: null, numeroNfe: null, numeroCte: null,
    smbiCondpagSalCod: '2', smbiCondpagFreteCod: '5', comissaoComercialProtegida: null,
    smbiSolicitadoEm: CLIQUE, smbiSolicitadoPor: 'Tarcyo', smbiEstado: null, smbiMotivoCodigo: null, smbiMotivoTexto: null,
    smbiTentativa: null, smbiAtualizadoEm: null, smbiConferidoEm: null, atualizadoEm: '2026-10-03T00:00:00.000Z',
    smbiReservaToken: 'tok-1', smbiReservadoAte: futuro, smbiEspelhoFiscal: null, smbiAlertaDesconto: false,
    smbiVinculoEstado: null, smbiVinculoMovsais: null, smbiVinculoPor: null, smbiVinculoEm: null, smbiVinculoResultado: null,
    smbiEmpresaCnpj: AS, smbiSolicitacaoId: 'sol-1', smbiSolicitacaoHash: '', smbiEmpresaTravadaEm: passado,
    smbiEscritaIniciadaEm: null, smbiEmpresaOrigem: 'ESCOLHA_ENVIO', createdByUserId: 1, createdByRole: 'user',
  } as unknown as FatOrder;
  const row = { ...base, ...over };
  // O hash gravado é o do pedido no momento do clique, salvo se o teste quiser outro.
  return over.smbiSolicitacaoHash !== undefined
    ? row
    : { ...row, smbiSolicitacaoHash: hashSolicitacao(row, row.smbiEmpresaCnpj ?? AS) };
};

const entrada = (p = pedido()) => ({ empresaCnpj: AS, solicitacaoId: 'sol-1', solicitacaoHash: p.smbiSolicitacaoHash! });
const iniciar = (p = pedido(), over: Partial<ReturnType<typeof entrada>> = {}, token: string | null = 'tok-1', gates = GATES, protocolo = 2, agora = AGORA) =>
  decidirIniciar(p, { ...entrada(p), ...over }, token ?? undefined, gates, protocolo, agora);

describe('protocolo (header X-SMBI-Protocolo)', () => {
  it('ausente, inválido ou 1 = worker antigo; 2 = contrato v2', () => {
    expect(protocoloDoRobo(undefined)).toBe(1);
    expect(protocoloDoRobo(['2'])).toBe(1);
    expect(protocoloDoRobo('abc')).toBe(1);
    expect(protocoloDoRobo('1')).toBe(1);
    expect(protocoloDoRobo('2')).toBe(2);
    expect(protocoloDoRobo(' 2 ')).toBe(2);
  });
  it('worker sem header não reserva nem recebe pedido quando a multiempresa está ligada', () => {
    expect(filaBloqueadaPorProtocolo(true, protocoloDoRobo(undefined))).toBe(true);
    expect(filaBloqueadaPorProtocolo(true, protocoloDoRobo('2'))).toBe(false);
  });
  it('gate desligado: o worker antigo segue exatamente como hoje', () => {
    expect(filaBloqueadaPorProtocolo(false, 1)).toBe(false);
    expect(filaBloqueadaPorProtocolo(false, 2)).toBe(false);
  });
  it('rotas operacionais: pedido COM empresa exige protocolo 2; pedido legado não', () => {
    expect(exigeProtocolo2({ smbiEmpresaCnpj: AS }, 1)).toMatchObject({ ok: false, codigo: 'PROTOCOLO_2_OBRIGATORIO' });
    expect(exigeProtocolo2({ smbiEmpresaCnpj: AS }, 2)).toBeNull();
    expect(exigeProtocolo2({ smbiEmpresaCnpj: null }, 1)).toBeNull();
  });
});

describe('payload do pedido', () => {
  it('gate desligado: nenhum campo novo (payload idêntico ao de sempre)', () => {
    const p = mapOrderToSmbiPayload(pedido()) as unknown as Record<string, unknown>;
    for (const k of ['empresaCnpj', 'solicitacaoId', 'solicitacaoHash']) expect(p).not.toHaveProperty(k);
  });
  it('gate ligado: leva empresaCnpj, solicitacaoId e solicitacaoHash', () => {
    const row = pedido();
    expect(mapOrderToSmbiPayload(row, { multiempresa: true })).toMatchObject({ empresaCnpj: AS, solicitacaoId: 'sol-1', solicitacaoHash: row.smbiSolicitacaoHash });
  });
});

describe('fila com a multiempresa ligada', () => {
  it('pedido válido (empresa homologada, solicitação vigente) é entregue', () => {
    expect(motivoForaDaFila(pedido())).toBeNull();
  });
  it('mantém as regras de sempre: aprovação, prova do clique, sem movsai, sem vínculo, sem estado que para', () => {
    expect(motivoForaDaFila(pedido({ aprovadoEm: null }))).toBe('NAO_ELEGIVEL');
    expect(motivoForaDaFila(pedido({ smbiSolicitadoPor: null }))).toBe('NAO_ELEGIVEL');
    expect(motivoForaDaFila(pedido({ smbiMovsaiId: '1200' }))).toBe('NAO_ELEGIVEL');
    expect(motivoForaDaFila(pedido({ smbiVinculoEstado: 'CONFERIDO' }))).toBe('NAO_ELEGIVEL');
    expect(motivoForaDaFila(pedido({ smbiEstado: 'PENDENTE' }))).toBe('NAO_ELEGIVEL');
  });
  it('pedido sem empresa (legado) não sai com a multiempresa ligada', () => {
    expect(motivoForaDaFila(pedido({ smbiEmpresaCnpj: null }))).toBe('SEM_EMPRESA');
    expect(motivoForaDaFila(pedido({ smbiEmpresaCnpj: '11222333000181' }))).toBe('SEM_EMPRESA'); // CNPJ de comprador não é empresa
  });
  it('empresa não homologada (C Alves) não sai', () => {
    expect(motivoForaDaFila(pedido({ smbiEmpresaCnpj: CALVES }))).toBe('EMPRESA_NAO_HOMOLOGADA');
  });
  it('solicitação obsoleta: pedido editado depois do envio, hash adulterado ou sem solicitação', () => {
    const ok = pedido();
    expect(motivoForaDaFila({ ...ok, itens: [{ ...item(), quantidade: 99 }] })).toBe('SOLICITACAO_OBSOLETA');
    expect(motivoForaDaFila({ ...ok, atualizadoEm: '2026-10-09T14:10:00.000Z' })).toBe('SOLICITACAO_OBSOLETA');
    expect(motivoForaDaFila({ ...ok, smbiSolicitacaoHash: 'f'.repeat(64) })).toBe('SOLICITACAO_OBSOLETA');
    expect(motivoForaDaFila({ ...ok, smbiSolicitacaoId: null })).toBe('SOLICITACAO_OBSOLETA');
  });
  it('risco de escrita (começou e não há movsai): não volta à fila, mesmo com a reserva vencida', () => {
    expect(motivoForaDaFila(pedido({ smbiEscritaIniciadaEm: passado, smbiReservadoAte: passado }))).toBe('RISCO_DE_ESCRITA');
  });
});

describe('POST /api/smbi/pedidos/:id/iniciar', () => {
  it('tudo certo: libera a primeira escrita', () => {
    expect(iniciar()).toEqual({ ok: true, jaIniciado: false });
  });
  it('worker sem protocolo 2, ou gates desligados: recusa', () => {
    expect(iniciar(pedido(), {}, 'tok-1', GATES, 1)).toMatchObject({ ok: false, codigo: 'PROTOCOLO_2_OBRIGATORIO' });
    expect(iniciar(pedido(), {}, 'tok-1', { multiempresaAtivo: false, roboAtivo: true })).toMatchObject({ codigo: 'GATE_DESLIGADO' });
    expect(iniciar(pedido(), {}, 'tok-1', { multiempresaAtivo: true, roboAtivo: false })).toMatchObject({ codigo: 'GATE_DESLIGADO' });
  });
  it('empresa errada, não homologada ou ausente: recusa', () => {
    expect(iniciar(pedido(), { empresaCnpj: CALVES })).toMatchObject({ codigo: 'EMPRESA_DIVERGENTE' });
    expect(iniciar(pedido({ smbiEmpresaCnpj: CALVES }), { empresaCnpj: CALVES })).toMatchObject({ codigo: 'EMPRESA_NAO_HOMOLOGADA' });
    expect(iniciar(pedido({ smbiEmpresaCnpj: null }))).toMatchObject({ codigo: 'SEM_EMPRESA' });
  });
  it('solicitação de outro clique, hash diferente ou pedido editado: obsoleta', () => {
    expect(iniciar(pedido(), { solicitacaoId: 'sol-0' })).toMatchObject({ codigo: 'SOLICITACAO_OBSOLETA' });
    expect(iniciar(pedido(), { solicitacaoHash: 'f'.repeat(64) })).toMatchObject({ codigo: 'SOLICITACAO_OBSOLETA' });
    const clicado = pedido();
    const editado = { ...clicado, itens: [{ ...item(), valorUnitario: 13 }] }; // editado DEPOIS do clique: o hash gravado é o antigo
    expect(iniciar(editado, entrada(clicado))).toMatchObject({ codigo: 'SOLICITACAO_OBSOLETA' });
  });
  it('lease: token errado, ausente ou reserva vencida não autorizam escrita', () => {
    expect(iniciar(pedido(), {}, 'outro')).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
    expect(iniciar(pedido(), {}, null)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
    expect(iniciar(pedido({ smbiReservadoAte: passado }))).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
  });
  it('pedido que já tem movsai, vínculo ou foi faturado não inicia', () => {
    expect(iniciar(pedido({ smbiMovsaiId: '1200' }))).toMatchObject({ codigo: 'PEDIDO_NAO_ELEGIVEL' });
    expect(iniciar(pedido({ smbiVinculoEstado: 'CONFERIDO' }))).toMatchObject({ codigo: 'PEDIDO_NAO_ELEGIVEL' });
    expect(iniciar(pedido({ status: 'faturado' }))).toMatchObject({ codigo: 'PEDIDO_NAO_ELEGIVEL' });
  });
  it('repetição com a reserva viva devolve jaIniciado=true (o worker reconcilia, não escreve de novo)', () => {
    expect(iniciar(pedido({ smbiEscritaIniciadaEm: passado }))).toEqual({ ok: true, jaIniciado: true });
    expect(iniciar(pedido({ smbiEscritaIniciadaEm: passado }), {}, 'outro')).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
  });
});

describe('POST /api/smbi/pedidos/:id/retorno — pedido com empresa', () => {
  const ret = (p: FatOrder, body: Record<string, unknown>, token: string | null = 'tok-1', protocolo = 2) =>
    decidirRetorno(p, body, token ?? undefined, protocolo);
  const certo = { empresaCnpj: AS, solicitacaoId: 'sol-1', estado: 'CRIADO', smbiMovsaiId: '1200' };

  it('empresa + solicitação + token correspondentes: aceita e exige o token no UPDATE', () => {
    expect(ret(pedido(), certo)).toEqual({ ok: true, legado: false, exigirToken: true });
  });
  it('retorno tardio de uma solicitação anterior é rejeitado (antes de qualquer UPDATE)', () => {
    const p = pedido();
    const antes = { ...p };
    expect(ret(p, { ...certo, solicitacaoId: 'sol-0' })).toMatchObject({ ok: false, status: 409, codigo: 'SOLICITACAO_OBSOLETA' });
    expect(p).toEqual(antes); // a decisão é pura: o token atual segue intacto
    expect(p.smbiReservaToken).toBe('tok-1');
  });
  it('empresa errada é rejeitada sem tocar o token atual', () => {
    const p = pedido();
    expect(ret(p, { ...certo, empresaCnpj: CALVES })).toMatchObject({ ok: false, codigo: 'EMPRESA_DIVERGENTE' });
    expect(p.smbiReservaToken).toBe('tok-1');
  });
  it('sem empresa/solicitação no corpo, ou com token de outra reserva: rejeita', () => {
    expect(ret(pedido(), { estado: 'CRIADO', smbiMovsaiId: '1', solicitacaoId: 'sol-1' })).toMatchObject({ codigo: 'EMPRESA_OBRIGATORIA' });
    expect(ret(pedido(), { estado: 'CRIADO', smbiMovsaiId: '1', empresaCnpj: AS })).toMatchObject({ codigo: 'SOLICITACAO_OBRIGATORIA' });
    expect(ret(pedido(), certo, 'outro')).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
    expect(ret(pedido(), certo, null)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
  });
  it('worker de protocolo 1 não devolve resultado de pedido com empresa', () => {
    expect(ret(pedido(), certo, 'tok-1', 1)).toMatchObject({ ok: false, codigo: 'PROTOCOLO_2_OBRIGATORIO' });
  });
  it('repetição idêntica depois que o token foi liberado continua idempotente; resultado diferente não', () => {
    const liberado = pedido({ smbiReservaToken: null, smbiReservadoAte: null, smbiMovsaiId: '1200', smbiEstado: 'CRIADO' });
    expect(ret(liberado, certo, null)).toEqual({ ok: true, legado: false, exigirToken: false });
    expect(ret(liberado, { ...certo, smbiMovsaiId: '1201', estado: 'ERRO' }, null)).toMatchObject({ codigo: 'RESERVA_INVALIDA' });
  });
  it('NF-e/CT-e (sem encerrar a tentativa) exigem empresa e solicitação, mas não o token', () => {
    const criado = pedido({ smbiReservaToken: null, smbiReservadoAte: null, smbiMovsaiId: '1200', smbiEstado: 'CRIADO' });
    expect(ret(criado, { empresaCnpj: AS, solicitacaoId: 'sol-1', numeroNfe: '10' }, null)).toEqual({ ok: true, legado: false, exigirToken: false });
    expect(ret(criado, { empresaCnpj: CALVES, solicitacaoId: 'sol-1', numeroNfe: '10' }, null)).toMatchObject({ codigo: 'EMPRESA_DIVERGENTE' });
  });
  it('pedido legado (sem empresa): regra antiga, sem exigências novas', () => {
    const legado = pedido({ smbiEmpresaCnpj: null, smbiSolicitacaoId: null });
    expect(ret(legado, { estado: 'CRIADO', smbiMovsaiId: '1200' }, null, 1)).toEqual({ ok: true, legado: true, exigirToken: false });
    expect(ret(legado, { ...certo }, null)).toMatchObject({ codigo: 'PEDIDO_SEM_EMPRESA' });
  });
  it('o zod do retorno aceita os campos novos (sem eles o v1 continua válido)', () => {
    expect(retornoBodySchema.safeParse({ estado: 'PENDENTE', empresaCnpj: AS, solicitacaoId: 'sol-1' }).success).toBe(true);
    expect(retornoBodySchema.safeParse({ smbiMovsaiId: '1200' }).success).toBe(true);
    expect(retornoBodySchema.safeParse({ empresaCnpj: AS }).success).toBe(false); // só empresa não é um retorno
  });
});

describe('referência ERP = (empresa, movsai)', () => {
  const linha = (pedidoId: string, empresaCnpj: string | null, movsai: string) => ({
    pedidoId, movsaiPrincipal: movsai, movsaiVinculo: null, estado: null, cnpj: '11222333000181', comissaoPct: 3, empresaCnpj,
  });

  it('/ligados leva a empresa e o mesmo número de movsai em duas empresas não se mistura', () => {
    const { ligados } = montarLigados([linha('a', AS, '1071'), linha('b', CALVES, '1071')], 2);
    expect(ligados.map((l) => [l.pedidoId, l.empresaCnpj, l.movsaiNumeros])).toEqual([['a', AS, ['1071']], ['b', CALVES, ['1071']]]);
    expect(chaveErp(AS, '1071')).not.toBe(chaveErp(CALVES, '1071'));
    expect(new Set(ligados.map((l) => chaveErp(l.empresaCnpj, l.movsaiNumeros[0]))).size).toBe(2);
  });
  it('/ligados e /vinculos: worker v1 não recebe pedido que tenha empresa (legado segue igual)', () => {
    const rows = [linha('a', AS, '1071'), linha('l', null, '900')];
    expect(montarLigados(rows, 1)).toMatchObject({ omitidos: 1, ligados: [{ pedidoId: 'l', empresaCnpj: null }] });
    expect(montarLigados(rows, 2).omitidos).toBe(0);
    const v = [{ pedidoId: 'a', empresaCnpj: AS, movsaiNumeros: ['1'] }, { pedidoId: 'l', empresaCnpj: null, movsaiNumeros: null }];
    expect(montarVinculos(v, 1)).toEqual({ omitidos: 1, vinculos: [{ pedidoId: 'l', empresaCnpj: null, movsaiNumeros: [] }] });
    expect(montarVinculos(v, 2).vinculos.map((x) => x.empresaCnpj)).toEqual([AS, null]);
  });

  const fat = (empresaCnpj: string | undefined, movsais: string[]) => faturamentoBodySchema.parse({
    ...(empresaCnpj ? { empresaCnpj } : {}),
    movsais: movsais.map((id) => ({ id, pesoKg: 25000, nfe: { numero: `N${id}`, valorSal: 800 }, cte: { numero: `C${id}`, valorFrete: 200 } })),
    faturadoEm: '2026-10-09T12:00:00Z',
  });
  const ligado = { smbiMovsaiId: '1071', smbiVinculoMovsais: null as string[] | null, status: 'estimado', faturadoEm: null, smbiEmpresaCnpj: AS as string | null };

  it('resolverFaturamento rejeita faturamento lido na outra empresa (mesmo número de movsai)', () => {
    expect(resolverFaturamento(ligado, fat(CALVES, ['1071']), 1000, AGORA).erro).toMatch(/empresa divergente/);
    expect(resolverFaturamento(ligado, fat(undefined, ['1071']), 1000, AGORA).erro).toMatch(/empresa divergente/);
    const certo = resolverFaturamento(ligado, fat(AS, ['1071']), 1000, AGORA);
    expect(certo.erro).toBeNull();
    expect(certo.patch.status).toBe('faturado');
  });
  it('resolverFaturamento rejeita números extras que não pertencem ao vínculo (pedido com empresa)', () => {
    expect(resolverFaturamento(ligado, fat(AS, ['1071', '1099']), 1000, AGORA).erro).toMatch(/fora do vínculo.*1099/);
  });
  it('faltando documento esperado continua PARCIAL: não fatura, sem alerta', () => {
    const duplo = { ...ligado, smbiVinculoMovsais: ['1071', '1072'] };
    const r = resolverFaturamento(duplo, fat(AS, ['1071']), 1000, AGORA);
    expect(r.erro).toBeNull();
    expect(r.patch.smbiEspelhoFiscal?.parcial).toBe(true);
    expect(r.patch.status).toBeUndefined();
    expect(r.patch.smbiAlertaDesconto).toBe(false);
  });
  it('pedido legado (sem empresa): comportamento de sempre, e o corpo não pode trazer empresa', () => {
    const legado = { ...ligado, smbiEmpresaCnpj: null };
    expect(resolverFaturamento(legado, fat(undefined, ['1071']), 1000, AGORA).erro).toBeNull();
    expect(resolverFaturamento(legado, fat(undefined, ['1071', '1099']), 1000, AGORA).erro).toBeNull(); // extras: legado intacto
    expect(resolverFaturamento(legado, fat(AS, ['1071']), 1000, AGORA).erro).toMatch(/sem empresa/);
  });
  it('status e resultado do vínculo: a empresa do corpo tem que ser a do pedido', () => {
    expect(validarEmpresaDoRobo({ id: 'p', smbiEmpresaCnpj: AS }, AS, 2)).toBeNull();
    expect(validarEmpresaDoRobo({ id: 'p', smbiEmpresaCnpj: AS }, CALVES, 2)).toMatchObject({ codigo: 'EMPRESA_DIVERGENTE' });
    expect(validarEmpresaDoRobo({ id: 'p', smbiEmpresaCnpj: AS }, undefined, 2)).toMatchObject({ codigo: 'EMPRESA_OBRIGATORIA' });
    expect(validarEmpresaDoRobo({ id: 'p', smbiEmpresaCnpj: AS }, AS, 1)).toMatchObject({ codigo: 'PROTOCOLO_2_OBRIGATORIO' });
    expect(validarEmpresaDoRobo({ id: 'p', smbiEmpresaCnpj: null }, undefined, 1)).toBeNull();
    expect(validarEmpresaDoRobo({ id: 'p', smbiEmpresaCnpj: null }, AS, 2)).toMatchObject({ codigo: 'PEDIDO_SEM_EMPRESA' });
    expect(statusBodySchema.safeParse({ evento: 'EXCLUIDO_SMBI', em: '2026-10-09T12:00:00Z', empresaCnpj: AS }).success).toBe(true);
  });
  it('a empresa lida no vínculo é guardada e reaproveitada na confirmação do administrador', () => {
    const corpo = vinculoResultadoSchema.parse({
      empresaCnpj: AS, confere: { cliente: true, produto: true, quantidade: false },
      movsais: [{ id: '1071', faturado: true, pesoKg: 25000, nfe: { numero: '1', data: '2026-10-09', valorSal: 800 }, cte: { numero: '2', valorFrete: 200 } }],
    });
    const guardado = montarResultadoVinculo(corpo, AGORA);
    expect(guardado.empresaCnpj).toBe(AS);
    expect(faturamentoDoVinculo(guardado)?.empresaCnpj).toBe(AS);
    const r = resolverFaturamento(ligado, faturamentoDoVinculo(guardado)!, 1000, AGORA);
    expect(r.erro).toBeNull();
    expect(resolverFaturamento({ ...ligado, smbiEmpresaCnpj: CALVES }, faturamentoDoVinculo(guardado)!, 1000, AGORA).erro).toMatch(/empresa divergente/);
  });
});
