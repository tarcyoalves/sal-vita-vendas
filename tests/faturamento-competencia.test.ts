/**
 * Competência da comissão: em qual MÊS cada pedido entra.
 *
 * A regra do negócio é que pedido fechado num mês e embarcado no seguinte é
 * comissão do mês em que fatura. Antes disso o pipeline usava a data de criação,
 * então um pedido de 28/08 com embarque em setembro inflava agosto e desaparecia
 * de setembro — os dois meses ficavam errados de uma vez.
 *
 * Estes testes fixam o contrato em cálculo puro (sem banco e sem React), que é
 * onde a decisão realmente acontece: `dataCompetenciaPedido` é a única fonte
 * usada por resumoAtendente, pela lista do atendente e pelo relatório.
 */

import { describe, expect, it, test } from 'vitest';
import {
  dataCompetenciaPedido,
  pedidoNoMes,
  resumoAtendente,
  dataInputLocal,
  formatDataBR,
  isoNoMes,
  totalItens,
} from '../client/src/lib/faturamento/calc';
import type { ItemPedido, Pedido } from '../client/src/lib/faturamento/types';

const AGOSTO = { ano: 2026, mes: 7 };
const SETEMBRO = { ano: 2026, mes: 8 };
const OUTUBRO = { ano: 2026, mes: 9 };

function item(valor: number, quantidade = 1): ItemPedido {
  return {
    id: 'i1',
    produtoId: null,
    descricao: 'SAL 25KG',
    quantidade,
    pesoKg: 25 * quantidade,
    valorUnitario: valor,
    pesoBrutoKg: 25 * quantidade,
    comissaoFixaPct: null,
    isentoFrete: false,
  };
}

/** Pedido mínimo; cada teste sobrescreve só o que está exercitando. */
function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1',
    taskId: 1,
    sellerId: 10,
    sellerName: 'Ana',
    clienteNome: 'Cliente',
    cnpj: '',
    razaoSocial: '',
    cidade: '',
    uf: '',
    status: 'estimado',
    comissaoPct: 5,
    itens: [item(1000)],
    itensEstimadoSnapshot: null,
    prazoPagamentoSal: '30',
    prazoPagamentoFrete: '30',
    valorFretePorUnidade: 0,
    observacoes: '',
    criadoEm: '2026-08-28T10:00:00.000Z',
    previsaoFaturamentoEm: null,
    faturadoEm: null,
    valorPago: 0,
    aprovadoEm: null,
    aprovadoPor: null,
    createdByUserId: null,
    createdByRole: null,
    ...over,
  };
}

describe('pedido criado em agosto com embarque previsto para setembro', () => {
  const p = pedido({ previsaoFaturamentoEm: '2026-09-10' });

  test('conta em setembro, não em agosto', () => {
    expect(pedidoNoMes(p, SETEMBRO)).toBe(true);
    expect(pedidoNoMes(p, AGOSTO)).toBe(false);
  });

  test('a comissão prevista sai do mês da digitação e vai para o mês do faturamento', () => {
    // O caso que originou a mudança: agosto não pode receber comissão de um
    // pedido que só vai faturar em setembro.
    const agosto = resumoAtendente([p], 10, 'Ana', 5, AGOSTO);
    const setembro = resumoAtendente([p], 10, 'Ana', 5, SETEMBRO);

    expect(agosto.comissaoPrevista).toBe(0);
    expect(agosto.qtdPedidos).toBe(0);
    expect(setembro.comissaoPrevista).toBeCloseTo(50, 6);
    expect(setembro.totalVendido).toBe(1000);
    expect(setembro.qtdPedidos).toBe(1);
  });
});

describe('pedido faturado', () => {
  test('a data real do embarque manda, mesmo divergindo da previsão', () => {
    // Previsto para setembro, embarcado de fato em outubro: a comissão a pagar
    // é de outubro e setembro não fica com um resíduo do pedido.
    const p = pedido({
      status: 'faturado',
      previsaoFaturamentoEm: '2026-09-10',
      faturadoEm: '2026-10-02',
    });

    expect(dataCompetenciaPedido(p)).toBe('2026-10-02');
    expect(pedidoNoMes(p, OUTUBRO)).toBe(true);
    expect(pedidoNoMes(p, SETEMBRO)).toBe(false);

    const outubro = resumoAtendente([p], 10, 'Ana', 5, OUTUBRO);
    expect(outubro.totalEmbarcado).toBe(1000);
    expect(outubro.comissaoEmbarcada).toBeCloseTo(50, 6);
    expect(resumoAtendente([p], 10, 'Ana', 5, SETEMBRO).totalEmbarcado).toBe(0);
  });

  test('entra uma única vez: nunca em dois meses ao mesmo tempo', () => {
    const p = pedido({
      status: 'faturado',
      criadoEm: '2026-08-28T10:00:00.000Z',
      previsaoFaturamentoEm: '2026-09-10',
      faturadoEm: '2026-10-02',
    });
    const meses = [AGOSTO, SETEMBRO, OUTUBRO].filter((m) => pedidoNoMes(p, m));
    expect(meses).toEqual([OUTUBRO]);
  });
});

describe('pedidos legados (importados antes do campo existir)', () => {
  test('sem previsão, continuam no mês de criação em vez de desaparecer', () => {
    const p = pedido({ previsaoFaturamentoEm: null });
    expect(dataCompetenciaPedido(p)).toBe('2026-08-28T10:00:00.000Z');
    expect(pedidoNoMes(p, AGOSTO)).toBe(true);
  });

  test('faturado sem data de faturamento cai no fallback, não some do relatório', () => {
    // Não deveria acontecer, mas dado ruim não pode zerar um pedido embarcado.
    const p = pedido({ status: 'faturado', faturadoEm: null, previsaoFaturamentoEm: '2026-09-10' });
    expect(pedidoNoMes(p, SETEMBRO)).toBe(true);
  });
});

describe('o que o diálogo "Marcar como faturado" grava', () => {
  // Simula o handleConfirm do InvoiceDialog: o atendente escolhe a data no
  // <input type="date"> (que entrega 'YYYY-MM-DD') e ela vira a competência.
  // `itensReais` são os itens já editados no diálogo; quando omitidos, o
  // atendente confirmou sem mexer nas quantidades.
  function confirmarFaturamento(
    p: Pedido,
    dataEscolhida: string,
    itensReais: ItemPedido[] = p.itens,
  ): Pedido {
    return {
      ...p,
      itensEstimadoSnapshot: p.itensEstimadoSnapshot ?? p.itens,
      itens: itensReais,
      status: 'faturado',
      faturadoEm: dataEscolhida,
    };
  }

  test('a data escolhida no diálogo decide o mês da comissão a pagar', () => {
    // Embarque de setembro sendo lançado em outubro: o atendente escolhe 30/09
    // e a comissão fica em setembro, não no mês em que ele digitou.
    const estimado = pedido({ previsaoFaturamentoEm: '2026-09-10' });
    const faturado = confirmarFaturamento(estimado, '2026-09-30');

    expect(pedidoNoMes(faturado, SETEMBRO)).toBe(true);
    expect(pedidoNoMes(faturado, OUTUBRO)).toBe(false);
    expect(resumoAtendente([faturado], 10, 'Ana', 5, SETEMBRO).comissaoEmbarcada)
      .toBeCloseTo(50, 6);
  });

  test('o valor sugerido ao abrir é editável e cai no mês escolhido', () => {
    // O diálogo pré-preenche com hoje (ou com a data já gravada, ao refaturar);
    // trocar para outro mês tem que mudar a competência de fato.
    const estimado = pedido({ previsaoFaturamentoEm: '2026-09-10' });
    const sugerido = dataInputLocal(estimado.faturadoEm) || '2026-10-15';
    expect(sugerido).toBe('2026-10-15'); // sem faturadoEm, o diálogo cai no fallback

    const corrigido = confirmarFaturamento(estimado, '2026-09-30');
    expect(pedidoNoMes(corrigido, SETEMBRO)).toBe(true);
  });

  test('refaturar preserva a data já registrada em vez de pular para hoje', () => {
    const jaFaturado = pedido({ status: 'faturado', faturadoEm: '2026-09-30' });
    // É este valor que o diálogo carrega no input ao reabrir.
    expect(dataInputLocal(jaFaturado.faturadoEm)).toBe('2026-09-30');

    // Reabrir e confirmar sem mexer na data mantém a competência.
    const refaturado = confirmarFaturamento(jaFaturado, '2026-09-30');
    expect(pedidoNoMes(refaturado, SETEMBRO)).toBe(true);
    expect(pedidoNoMes(refaturado, OUTUBRO)).toBe(false);
  });

  test('o snapshot do estimado sobrevive ao faturamento (comparação no diálogo)', () => {
    // Estimado 1000, embarcou 800: o estimado original não pode ser perdido,
    // é o que alimenta o "Estimado vs Faturado vs Diferença".
    const estimado = pedido({ itens: [item(1000)] });
    const faturado = confirmarFaturamento(estimado, '2026-09-30', [item(800)]);

    expect(totalItens(faturado.itensEstimadoSnapshot!)).toBe(1000);
    expect(totalItens(faturado.itens)).toBe(800);
    expect(faturado.status).toBe('faturado');
    // A comissão a pagar segue o que embarcou de fato, não o estimado.
    expect(resumoAtendente([faturado], 10, 'Ana', 5, SETEMBRO).comissaoEmbarcada)
      .toBeCloseTo(40, 6);
  });
});

describe('desfazer faturamento', () => {
  // Espelha desfazerFaturamento() do store: volta para estimado, restaura os
  // itens do snapshot e limpa a data do embarque.
  function desfazer(p: Pedido): Pedido {
    return {
      ...p,
      itens: p.itensEstimadoSnapshot ?? p.itens,
      itensEstimadoSnapshot: null,
      status: 'estimado',
      faturadoEm: null,
      valorPago: 0,
    };
  }

  test('o pedido sai do faturamento do mês e volta para o pipeline', () => {
    const faturado = pedido({
      status: 'faturado',
      faturadoEm: '2026-09-30',
      previsaoFaturamentoEm: '2026-09-10',
    });
    expect(resumoAtendente([faturado], 10, 'Ana', 5, SETEMBRO).comissaoEmbarcada)
      .toBeCloseTo(50, 6);

    const revertido = desfazer(faturado);
    const resumo = resumoAtendente([revertido], 10, 'Ana', 5, SETEMBRO);
    // Nada mais embarcado, mas continua previsto no mês da previsão.
    expect(resumo.comissaoEmbarcada).toBe(0);
    expect(resumo.comissaoPrevista).toBeCloseTo(50, 6);
    expect(revertido.status).toBe('estimado');
    expect(revertido.faturadoEm).toBeNull();
  });

  test('restaura as quantidades estimadas, descartando as reais do embarque', () => {
    // Estimado 1000, embarcou 800: ao desfazer, volta a valer o estimado.
    const faturado = pedido({
      status: 'faturado',
      faturadoEm: '2026-09-30',
      itens: [item(800)],
      itensEstimadoSnapshot: [item(1000)],
    });
    const revertido = desfazer(faturado);
    expect(totalItens(revertido.itens)).toBe(1000);
    // Snapshot limpo: um novo faturamento não pode comparar contra o de antes.
    expect(revertido.itensEstimadoSnapshot).toBeNull();
  });

  test('a previsão sobrevive, senão o pedido cairia no mês da digitação', () => {
    const faturado = pedido({
      criadoEm: '2026-08-28',
      previsaoFaturamentoEm: '2026-09-10',
      status: 'faturado',
      faturadoEm: '2026-09-30',
    });
    const revertido = desfazer(faturado);
    expect(dataCompetenciaPedido(revertido)).toBe('2026-09-10');
    expect(pedidoNoMes(revertido, SETEMBRO)).toBe(true);
    expect(pedidoNoMes(revertido, AGOSTO)).toBe(false);
  });

  test('desfazer e refaturar em outro mês move a competência', () => {
    const faturado = pedido({ status: 'faturado', faturadoEm: '2026-09-30' });
    const revertido = desfazer(faturado);
    // Refaturado com a data correta de outubro.
    const refaturado: Pedido = { ...revertido, status: 'faturado', faturadoEm: '2026-10-05' };
    expect(pedidoNoMes(refaturado, OUTUBRO)).toBe(true);
    expect(pedidoNoMes(refaturado, SETEMBRO)).toBe(false);
  });
});

describe('fuso e fronteira de ano', () => {
  test('data pura de 1º do mês não escorrega para o mês anterior', () => {
    // `new Date('2026-09-01')` é UTC e, em UTC-3, viraria 31/08 — o erro de um
    // mês que esta regra existe para evitar.
    const p = pedido({ previsaoFaturamentoEm: '2026-09-01' });
    expect(pedidoNoMes(p, SETEMBRO)).toBe(true);
    expect(pedidoNoMes(p, AGOSTO)).toBe(false);
  });

  test('dezembro para janeiro atravessa o ano corretamente', () => {
    const p = pedido({
      criadoEm: '2026-12-29T10:00:00.000Z',
      previsaoFaturamentoEm: '2027-01-05',
    });
    expect(pedidoNoMes(p, { ano: 2026, mes: 11 })).toBe(false);
    expect(pedidoNoMes(p, { ano: 2027, mes: 0 })).toBe(true);
  });

  test('ida e volta entre input date e exibição preserva o dia', () => {
    expect(dataInputLocal('2026-09-01')).toBe('2026-09-01');
    expect(formatDataBR('2026-09-01')).toBe('01/09/2026');
    expect(formatDataBR(null)).toBe('--');
  });
});

/**
 * Regressão: a página de progresso do atendente quebrava inteira com
 * "TypeError: e.trim is not a function".
 *
 * `isoNoMes` passou a delegar para `parseDataLocal`, que fazia `valor.trim()`
 * assumindo string. Mas `lastContactedAt` chega do tRPC/superjson como `Date`,
 * e AttendantProgress o repassa através de `tasks as any[]` — o cast apaga o
 * tipo, então o typecheck não pegava e só estourava em produção.
 */
describe('parseDataLocal aceita o que os chamadores realmente passam', () => {
  const marco = { ano: 2026, mes: 2 }; // março (0-based)

  it('aceita Date sem lançar', () => {
    const data = new Date(2026, 2, 15);
    expect(() => isoNoMes(data, marco)).not.toThrow();
    expect(isoNoMes(data, marco)).toBe(true);
  });

  it('aceita epoch em número', () => {
    expect(isoNoMes(new Date(2026, 2, 15).getTime(), marco)).toBe(true);
  });

  it('continua tratando string pura e ISO', () => {
    expect(isoNoMes('2026-03-15', marco)).toBe(true);
    expect(isoNoMes('2026-03-15T10:00:00.000Z', marco)).toBe(true);
  });

  it('devolve false para vazio, undefined e lixo, sem lançar', () => {
    for (const v of [null, undefined, '', 'abc', {} as never]) {
      expect(() => isoNoMes(v as never, marco)).not.toThrow();
      expect(isoNoMes(v as never, marco)).toBe(false);
    }
  });

  it('formatDataBR e dataInputLocal também aceitam Date', () => {
    const d = new Date(2026, 2, 15);
    expect(formatDataBR(d)).toBe('15/03/2026');
    expect(dataInputLocal(d)).toBe('2026-03-15');
  });
});
