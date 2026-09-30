import { describe, it, expect } from 'vitest';
import { consolidarCarteira, parseCidadeUf, type CarteiraEntrada } from '../server/lib/radar/portfolio';
import { municipioByNomeUf } from '../server/lib/radar/geo';

const mossoro = municipioByNomeUf('Mossoró', 'RN')!;

describe('parseCidadeUf', () => {
  it('lê "CIDADE - UF" e "NOME - CIDADE - UF"', () => {
    expect(parseCidadeUf('MOSSORÓ - RN')).toEqual({ cidade: 'MOSSORÓ', uf: 'RN' });
    expect(parseCidadeUf('SUPERMERCADO X - Mossoró - rn')).toEqual({ cidade: 'Mossoró', uf: 'RN' });
    expect(parseCidadeUf('A - B - C - Apodi - RN')).toEqual({ cidade: 'Apodi', uf: 'RN' });
  });
  it('recusa o que não tem UF de 2 letras', () => {
    expect(parseCidadeUf('Mossoró')).toBeNull();
    expect(parseCidadeUf('Mossoró - Rio Grande')).toBeNull();
    expect(parseCidadeUf(null)).toBeNull();
    expect(parseCidadeUf('')).toBeNull();
  });
});

describe('municipioByNomeUf', () => {
  it('ignora acento e caixa, e exige a UF certa', () => {
    expect(municipioByNomeUf('MOSSORO', 'rn')?.ibge).toBe(mossoro.ibge);
    expect(municipioByNomeUf('Mossoró', 'PR')).toBeUndefined();
    expect(municipioByNomeUf('Mossoró', 'Rio Grande do Norte')).toBeUndefined();
  });
});

const ped = (nome: string, cidade: string, cnpj: string, faturado: boolean, data: string, valor: number, uf = 'RN'): CarteiraEntrada => ({
  fonte: 'pedido', nome, cnpj, cidade, uf, atendente: 'Analice', pedido: { faturado, data, valor },
});

describe('consolidarCarteira', () => {
  it('junta pedidos do mesmo CNPJ: conta compras, soma faturado e guarda a última data', () => {
    const r = consolidarCarteira([
      ped('MERCADO A', 'Mossoró', '11222333000181', true, '2026-05-10T00:00:00Z', 1000),
      ped('MERCADO A LTDA', 'Mossoró', '11.222.333/0001-81', true, '2026-08-20T00:00:00Z', 500),
      ped('MERCADO A', 'Mossoró', '11222333000181', false, '2026-09-01T00:00:00Z', 9999),
    ], mossoro, 50);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ pedidos: 3, faturados: 2, totalFaturado: 1500, ultimaCompraEm: '2026-08-20T00:00:00Z', nome: 'MERCADO A LTDA' });
  });

  it('cliente sem CNPJ agrupa por nome + município (sem acento/caixa)', () => {
    const r = consolidarCarteira([
      { fonte: 'cliente', nome: 'Padaria São José', cidade: 'Mossoró', uf: 'RN', telefone: '(84) 99999-1234' },
      { fonte: 'tarefa', nome: 'PADARIA SAO JOSE', cidade: 'Mossoró', uf: 'RN', tarefa: { id: 7, convertida: false } },
    ], mossoro, 50);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].fontes.sort()).toEqual(['cliente', 'tarefa']);
    expect(r.itens[0].telefone).toBe('84999991234');
    expect(r.itens[0].tarefas).toEqual([{ id: 7, convertida: false }]);
  });

  it('respeita o raio e ordena do mais perto para o mais longe', () => {
    const r = consolidarCarteira([
      ped('LONGE', 'Natal', '11111111000191', true, '2026-01-01T00:00:00Z', 1),
      ped('PERTO', 'Mossoró', '22222222000191', true, '2026-01-01T00:00:00Z', 1),
    ], mossoro, 400);
    expect(r.itens.map((i) => i.nome)).toEqual(['PERTO', 'LONGE']);
    expect(r.itens[0].distanceKm).toBe(0);
    const curto = consolidarCarteira([ped('LONGE', 'Natal', '11111111000191', true, '2026-01-01T00:00:00Z', 1)], mossoro, 50);
    expect(curto.itens).toHaveLength(0);
  });

  it('cidade que não bate com o mapa é contada, nunca chutada', () => {
    const r = consolidarCarteira([ped('X', 'Mosoro', '33333333000191', true, '2026-01-01T00:00:00Z', 1)], mossoro, 400);
    expect(r.itens).toHaveLength(0);
    expect(r.semLocalizacao).toBe(1);
  });

  it('telefone inválido é ignorado e o mesmo nome em cidades diferentes não se mistura', () => {
    const r = consolidarCarteira([
      { fonte: 'cliente', nome: 'Casa', cidade: 'Mossoró', uf: 'RN', telefone: '123' },
      { fonte: 'cliente', nome: 'Casa', cidade: 'Apodi', uf: 'RN' },
    ], mossoro, 200);
    expect(r.itens.find((i) => i.cidade === 'Mossoró')?.telefone).toBeNull();
    expect(r.itens).toHaveLength(2);
  });

  it('o telefone de um registro vale para o mesmo cliente que aparece sem CNPJ em outro', () => {
    const r = consolidarCarteira([
      ped('Mercado Boa Vista', 'Mossoró', '12345678000195', true, '2026-08-01', 100),
      { fonte: 'tarefa', nome: 'MERCADO BOA VISTA', cidade: 'Mossoró', uf: 'RN', telefone: '(84) 99999-1234', tarefa: { id: 7, convertida: false } },
    ], mossoro, 50);
    const comCnpj = r.itens.find((i) => i.cnpj === '12345678000195');
    expect(comCnpj?.telefone).toBe('84999991234');
  });
  it('pedido com telefone e tarefa achados pelo CNPJ mostra os dois no mesmo cartão', () => {
    const r = consolidarCarteira([
      { ...ped('Mercado Sol', 'Mossoró', '12345678000195', true, '2026-08-01', 100), telefone: '84988887777', tarefa: { id: 9, convertida: true } },
    ], mossoro, 50);
    expect(r.itens[0].telefone).toBe('84988887777');
    expect(r.itens[0].tarefas).toEqual([{ id: 9, convertida: true }]);
  });
});
