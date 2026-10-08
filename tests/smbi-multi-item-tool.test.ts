// Regras PURAS da ferramenta multi-item do robô SMBI (scripts/smbi-robo). Nada aqui toca o ERP.
import { describe, it, expect } from 'vitest';
// @ts-expect-error — módulo .mjs sem tipos
import * as tool from '../scripts/smbi-robo/smbi_criar_pedido_express.multi_item.mjs';

const { parseDataBR, numeroBR, validarItensPedido, localizarLinha, conferirLinha, conferirItensSalvos, SUPORTA_MULTI_ITEM } = tool;

// Pedido real do CRM 2d7z7ng22ub5: 51 × 1.920 a R$ 12 e 55 × 80 a R$ 15.
const ITENS = [
  { produtoId: 51, quantidade: 1920, valorSalUnitario: 12 },
  { produtoId: 55, quantidade: 80, valorSalUnitario: 15 },
];
const linha = (cod: string, desc: string, qtd: string, valor: string, sub: string) =>
  ({ 'Cód.': cod, 'Descrição': desc, 'Qtd': qtd, 'Valor (R$)': valor, 'Subtotal (R$)': sub });
const LINHAS_OK = [
  linha('51', 'SAL REFINADO COM IODO VITA 25 KG', '1.920', '12,00', '23.040,00'),
  linha('55', 'SAL CHURRASCO COM IODO VITA 25 KG', '80', '15,00', '1.200,00'),
];

describe('ferramenta multi-item', () => {
  it('declara suporte (o daemon libera a criação múltipla por esta marca)', () => {
    expect(SUPORTA_MULTI_ITEM).toBe(true);
  });

  it('anti-duplicidade reconhece data brasileira (regressão do candidato: devolvia 0)', () => {
    expect(parseDataBR('08/10/2026 11:00')).toBe(Date.parse('2026-10-08T11:00:00-03:00'));
    expect(parseDataBR('08/10/2026')).toBe(Date.parse('2026-10-08T00:00:00-03:00'));
    expect(parseDataBR('sem data')).toBe(0);
  });

  it('números no formato brasileiro', () => {
    expect(numeroBR('1.920')).toBe(1920);
    expect(numeroBR('R$ 1.234,56')).toBeCloseTo(1234.56);
    expect(numeroBR('12,00')).toBe(12);
    expect(numeroBR('')).toBeNaN();
  });

  describe('validação ANTES da primeira escrita', () => {
    it('aceita o pedido real de 2 itens', () => expect(validarItensPedido(ITENS)).toEqual([]));
    it('recusa vazio, mais de 6, produto repetido, quantidade/preço inválidos ou fora do limite', () => {
      expect(validarItensPedido([])).toHaveLength(1);
      expect(validarItensPedido(Array.from({ length: 7 }, (_, i) => ({ produtoId: i + 1, quantidade: 1, valorSalUnitario: 1 })))[0]).toMatch(/limite máximo de 6/);
      expect(validarItensPedido([ITENS[0], { ...ITENS[0] }]).join()).toMatch(/repetido/);
      expect(validarItensPedido([{ produtoId: 51, quantidade: 0, valorSalUnitario: 12 }]).join()).toMatch(/quantidade inválida/);
      expect(validarItensPedido([{ produtoId: 51, quantidade: 10, valorSalUnitario: -1 }]).join()).toMatch(/valorSalUnitario inválido/);
      expect(validarItensPedido([{ produtoId: 'abc', quantidade: 10, valorSalUnitario: 1 }]).join()).toMatch(/produtoId inválido/);
      expect(validarItensPedido([{ produtoId: 51, quantidade: 9e9, valorSalUnitario: 1 }]).join()).toMatch(/acima do limite/);
      expect(validarItensPedido([{ produtoId: 51, quantidade: 1, valorSalUnitario: 9e9 }]).join()).toMatch(/acima do limite/);
    });
    it('relata TODOS os erros de uma vez (nada é gravado)', () => {
      const e = validarItensPedido([{ produtoId: 'x', quantidade: 0, valorSalUnitario: 0 }, { produtoId: 55, quantidade: 5, valorSalUnitario: 0 }]);
      expect(e.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('conferência das linhas gravadas', () => {
    it('pedido correto: sem divergência', () => {
      expect(conferirItensSalvos(LINHAS_OK, ITENS, ['SAL REFINADO COM IODO VITA 25 KG', 'SAL CHURRASCO COM IODO VITA 25 KG'])).toEqual([]);
    });
    it('localiza por CÓDIGO exato e nunca por substring de descrição', () => {
      const linhas = [linha('99', 'SAL REFINADO COM IODO VITA 25 KG', '1', '1,00', '1,00')];
      // produto 51 pedido, SMBI trouxe o código 99 com descrição igual: há código e não bate → não adivinha
      expect(localizarLinha(linhas, { produtoId: 51 }, 'SAL REFINADO COM IODO VITA 25 KG')).toBeNull();
    });
    it('sem coluna de código, usa descrição EXATA (não parcial)', () => {
      const semCod = [{ 'Descrição': 'SAL REFINADO COM IODO VITA 25 KG', 'Qtd': '1', 'Valor (R$)': '1,00', 'Subtotal (R$)': '1,00' }];
      expect(localizarLinha(semCod, { produtoId: 51 }, 'SAL REFINADO COM IODO VITA 25 KG')).not.toBeNull();
      expect(localizarLinha(semCod, { produtoId: 51 }, 'SAL REFINADO')).toBeNull();
    });
    it('detecta quantidade, preço, subtotal e contagem de linhas divergentes', () => {
      expect(conferirLinha(linha('51', 'x', '1.900', '12,00', '22.800,00'), ITENS[0]).join()).toMatch(/quantidade/);
      expect(conferirLinha(linha('51', 'x', '1.920', '11,00', '21.120,00'), ITENS[0]).join()).toMatch(/valor unitário/);
      expect(conferirLinha(linha('51', 'x', '1.920', '12,00', '20.000,00'), ITENS[0]).join()).toMatch(/subtotal/);
      expect(conferirItensSalvos([LINHAS_OK[0]], ITENS).join()).toMatch(/1 linha\(s\) no SMBI \(esperado 2\)/);
      expect(conferirItensSalvos([LINHAS_OK[0], linha('54', 'OUTRO', '80', '15,00', '1.200,00')], ITENS).join()).toMatch(/não encontrado/);
    });
  });
});
