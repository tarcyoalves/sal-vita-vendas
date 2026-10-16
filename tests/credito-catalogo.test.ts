import { describe, expect, it } from 'vitest';
import {
  CATALOGO_CREDITO, MAX_PRODUTOS_POR_CONSULTA, PRODUTO_PADRAO, calcularCustos, chaveDoProdutoGravado, itemDoCatalogo,
  itemSelecionavel, nomeDoProduto, saldoApos, tetoPorConsultaValido, validarProdutos, verificarLimitesCusto,
} from '../shared/creditoCatalogo';
import { CUSTO_CONSULTA_REAIS } from '../client/src/lib/credito/regras';
import { CUSTO_BOAVISTA_REAIS } from '../server/lib/credito/provedores/boavistaApifull';

describe('contrato do catálogo (preços medidos em 16/10/2026)', () => {
  it('preços medidos conferem', () => {
    expect(itemDoCatalogo('boavista')?.custoReais).toBe(2.75);
    expect(itemDoCatalogo('serasa_premium')?.custoReais).toBe(6.72);
    expect(itemDoCatalogo('define_risco')?.custoReais).toBe(15.09);
  });
  it('as constantes derivadas leem o catálogo (sem número duplicado)', () => {
    expect(CUSTO_CONSULTA_REAIS).toBe(2.75);
    expect(CUSTO_BOAVISTA_REAIS).toBe(2.75);
  });
  it('endpoints e padrão', () => {
    expect(PRODUTO_PADRAO).toBe('boavista');
    expect(itemDoCatalogo('boavista')?.endpoint).toBe('scpc-boavista');
    expect(itemDoCatalogo('serasa_premium')?.endpoint).toBe('serasa-premium');
    expect(itemDoCatalogo('define_risco')?.endpoint).toBe('pj-define-risco');
    expect(CATALOGO_CREDITO.filter((i) => i.recomendado).map((i) => i.chave)).toEqual(['boavista']);
  });
  it('chaves únicas e endpoints só com letras, dígitos e hífen', () => {
    expect(new Set(CATALOGO_CREDITO.map((i) => i.chave)).size).toBe(CATALOGO_CREDITO.length);
    for (const i of CATALOGO_CREDITO) expect(i.endpoint).toMatch(/^[a-z0-9-]+$/);
  });
  it('itens não medidos têm custo null e nunca são selecionáveis', () => {
    const nulos = CATALOGO_CREDITO.filter((i) => i.custoReais === null).map((i) => i.chave);
    expect(nulos).toEqual(['serasa_basica', 'protesto_nacional', 'cenprot', 'cnpj_cadastro', 'cndt']);
    for (const i of CATALOGO_CREDITO.filter((x) => x.custoReais === null)) {
      expect(itemSelecionavel(i)).toBe(false);
      expect(i.mostra.confirmado).toEqual([]); // nada foi confirmado sem medir
      expect(validarProdutos([i.chave]).ok).toBe(false);
    }
  });
  it('todo item medido tem preço positivo e o que mostra', () => {
    for (const i of CATALOGO_CREDITO.filter(itemSelecionavel)) {
      expect(i.custoReais as number).toBeGreaterThan(0);
      expect(i.mostra.confirmado.length).toBeGreaterThan(0);
      expect(i.quandoUsar.length).toBeGreaterThan(10);
    }
  });
});

describe('produto gravado (legado e chave)', () => {
  it('chave do catálogo passa direto; linhas antigas viram boavista', () => {
    expect(chaveDoProdutoGravado('serasa_premium', 'boavista_apifull')).toBe('serasa_premium');
    expect(chaveDoProdutoGravado('Boa Vista SCPC (API Full)', 'boavista_apifull')).toBe('boavista');
    expect(chaveDoProdutoGravado('Simulação (sem consulta real)', 'simulado')).toBe('boavista');
    expect(nomeDoProduto('define_risco')).toBe('Define Risco Positivo');
    expect(nomeDoProduto('Boa Vista SCPC (API Full)', 'boavista_apifull')).toBe('Consulta simples');
  });
});

describe('custos e bloqueios (compartilhados servidor/tela)', () => {
  const [bv, sp, dr] = ['boavista', 'serasa_premium', 'define_risco'].map((c) => itemDoCatalogo(c)!);
  it('soma só o que não é reaproveitado e arredonda em centavos', () => {
    expect(calcularCustos([bv, sp, dr], {}, false)).toEqual({ totalReais: 24.56, chamadas: 3, reaproveitados: 0 });
    expect(calcularCustos([bv, sp], { boavista: true }, false)).toEqual({ totalReais: 6.72, chamadas: 1, reaproveitados: 1 });
    expect(calcularCustos([bv], { boavista: true }, false)).toEqual({ totalReais: 0, chamadas: 0, reaproveitados: 1 });
  });
  it('provedor simulado nunca cobra', () => {
    expect(calcularCustos([bv, sp, dr], {}, true)).toEqual({ totalReais: 0, chamadas: 3, reaproveitados: 0 });
  });
  it('saldo após', () => {
    expect(saldoApos(25.44, 24.56)).toBe(0.88);
    expect(saldoApos(5, 6.72)).toBe(-1.72);
    expect(saldoApos(null, 6.72)).toBeNull();
  });
  const base = { totalReais: 9.47, chamadas: 2, saldo: 25.44, tetoPorConsultaReais: 30, usadasNoMes: 3, limiteMensal: 50 };
  it('libera quando tudo cabe', () => expect(verificarLimitesCusto(base).ok).toBe(true));
  it('recusa pelo teto por consulta', () => {
    const r = verificarLimitesCusto({ ...base, totalReais: 30.01 });
    expect(r).toMatchObject({ ok: false, codigo: 'TETO' });
    expect(verificarLimitesCusto({ ...base, totalReais: 30, saldo: 100 }).ok).toBe(true); // igual ao teto passa
  });
  it('recusa saldo conhecido menor que o total; saldo desconhecido não bloqueia (fail-open)', () => {
    expect(verificarLimitesCusto({ ...base, saldo: 9.46 })).toMatchObject({ ok: false, codigo: 'SALDO' });
    expect(verificarLimitesCusto({ ...base, saldo: 9.47 }).ok).toBe(true);
    expect(verificarLimitesCusto({ ...base, saldo: null }).ok).toBe(true);
  });
  it('limite mensal conta 1 por produto', () => {
    expect(verificarLimitesCusto({ ...base, usadasNoMes: 48, chamadas: 2 }).ok).toBe(true);
    expect(verificarLimitesCusto({ ...base, usadasNoMes: 49, chamadas: 2 })).toMatchObject({ ok: false, codigo: 'LIMITE_MENSAL' });
  });
  it('sem chamadas (tudo reaproveitado) nunca bloqueia', () => {
    expect(verificarLimitesCusto({ ...base, totalReais: 0, chamadas: 0, saldo: 0, usadasNoMes: 999 }).ok).toBe(true);
  });
  it('teto válido', () => {
    expect(tetoPorConsultaValido(30)).toBe(true);
    expect(tetoPorConsultaValido(0)).toBe(false);
    expect(tetoPorConsultaValido(-1)).toBe(false);
    expect(tetoPorConsultaValido(1000.01)).toBe(false);
    expect(tetoPorConsultaValido(2.755)).toBe(false);
    expect(tetoPorConsultaValido(Number.NaN)).toBe(false);
  });
  it('limite de produtos é 3', () => expect(MAX_PRODUTOS_POR_CONSULTA).toBe(3));
});
