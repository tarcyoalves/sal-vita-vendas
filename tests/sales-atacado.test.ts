import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SALES_SETTINGS_DEFAULTS, type SalesSettings } from '../shared/sales';
import { LINK_COMPRA_PADRAO, montarOferta } from '../shared/salesOferta';
import { SIMULADOR_AVISO, reaisParaCentavos, simularRevenda } from '../shared/salesSimulador';
import { verificarTextoComercial } from '../server/lib/sales/conteudo';
import { todosOsTextos } from '../client/src/components/sales/atacadoCopy';

const CAIXA = { price: 149.9, kgPerUnit: 10 };
const AGORA = new Date('2026-11-28T12:00:00Z');

function settings(over: Partial<SalesSettings> = {}): Pick<SalesSettings, 'disponibilidade' | 'referenciaMercadoLivre' | 'simuladorRevenda'> {
  return { ...SALES_SETTINGS_DEFAULTS, ...over };
}

describe('simularRevenda', () => {
  const base = { quantidadeCaixas: 2, precoRevendaPorPacoteCentavos: 2500, freteCentavos: 3000, despesasCentavos: 1000 };

  it('aplica as fórmulas em centavos inteiros', () => {
    const r = simularRevenda(base, 14990);
    expect(r.pacotes).toBe(20);
    expect(r.custoTotalCentavos).toBe(14990 * 2 + 3000 + 1000); // 33980
    expect(r.custoPorPacoteCentavos).toBe(1699); // 33980 / 20 = 1699
    expect(r.receitaPotencialCentavos).toBe(50000);
    expect(r.resultadoCentavos).toBe(50000 - 33980);
    expect(r.margemPercentual).toBe(32); // 16020 / 50000 = 32,04%
  });

  it('traz o aviso fixo', () => {
    expect(simularRevenda(base, 14990).aviso).toBe(SIMULADOR_AVISO);
    expect(SIMULADOR_AVISO).toBe('Simulação. Não é promessa de lucro: depende de impostos, custos e venda efetiva das unidades.');
  });

  it('preço de revenda zero: receita zero, prejuízo e margem indefinida', () => {
    const r = simularRevenda({ ...base, precoRevendaPorPacoteCentavos: 0 }, 14990);
    expect(r.receitaPotencialCentavos).toBe(0);
    expect(r.resultadoCentavos).toBe(-r.custoTotalCentavos);
    expect(r.margemPercentual).toBeNull();
  });

  it('tudo zero (sem frete nem despesas) e preço da caixa zero não quebra', () => {
    const r = simularRevenda({ quantidadeCaixas: 1, precoRevendaPorPacoteCentavos: 0, freteCentavos: 0, despesasCentavos: 0 }, 0);
    expect(r.custoTotalCentavos).toBe(0);
    expect(r.custoPorPacoteCentavos).toBe(0);
    expect(r.resultadoCentavos).toBe(0);
    expect(r.margemPercentual).toBeNull();
  });

  it('arredonda o custo por pacote ao centavo mais próximo', () => {
    // 10001 / 10 = 1000,1 -> 1000 ; 10005 / 10 = 1000,5 -> 1001
    expect(simularRevenda({ quantidadeCaixas: 1, precoRevendaPorPacoteCentavos: 1, freteCentavos: 0, despesasCentavos: 0 }, 10001).custoPorPacoteCentavos).toBe(1000);
    expect(simularRevenda({ quantidadeCaixas: 1, precoRevendaPorPacoteCentavos: 1, freteCentavos: 0, despesasCentavos: 0 }, 10005).custoPorPacoteCentavos).toBe(1001);
  });

  it('sinal da margem: positiva, zero e negativa', () => {
    // custo 14990 por caixa; 10 pacotes
    const lucro = simularRevenda({ quantidadeCaixas: 1, precoRevendaPorPacoteCentavos: 2000, freteCentavos: 0, despesasCentavos: 0 }, 14990);
    expect(lucro.resultadoCentavos).toBe(5010);
    expect(lucro.margemPercentual).toBe(25.1);
    const zero = simularRevenda({ quantidadeCaixas: 1, precoRevendaPorPacoteCentavos: 1499, freteCentavos: 0, despesasCentavos: 0 }, 14990);
    expect(zero.resultadoCentavos).toBe(0);
    expect(zero.margemPercentual).toBe(0);
    const prejuizo = simularRevenda({ quantidadeCaixas: 1, precoRevendaPorPacoteCentavos: 1000, freteCentavos: 0, despesasCentavos: 0 }, 14990);
    expect(prejuizo.resultadoCentavos).toBe(-4990);
    expect(prejuizo.margemPercentual).toBe(-49.9);
  });

  it('só devolve inteiros nos valores em centavos', () => {
    const r = simularRevenda({ quantidadeCaixas: 7, precoRevendaPorPacoteCentavos: 1937, freteCentavos: 4321, despesasCentavos: 999 }, 14990);
    for (const v of [r.custoTotalCentavos, r.custoPorPacoteCentavos, r.receitaPotencialCentavos, r.resultadoCentavos]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('reaisParaCentavos', () => {
  it('interpreta formatos brasileiros e rejeita lixo', () => {
    expect(reaisParaCentavos('12,50')).toBe(1250);
    expect(reaisParaCentavos('12.5')).toBe(1250);
    expect(reaisParaCentavos('R$ 1.250,00')).toBe(125000);
    expect(reaisParaCentavos('0')).toBe(0);
    expect(reaisParaCentavos('')).toBeNull();
    expect(reaisParaCentavos('abc')).toBeNull();
    expect(reaisParaCentavos('-3')).toBeNull();
    expect(reaisParaCentavos('1,234')).toBeNull();
  });
});

describe('montarOferta (oferta pública)', () => {
  it('monta produto, preço e link a partir do catálogo', () => {
    const o = montarOferta(CAIXA, settings(), AGORA);
    expect(o.produto).toBe('Caixa Sal Vita 10 kg (10 × 1 kg)');
    expect(o.precoSiteCentavos).toBe(14990);
    expect(o.kgPorCaixa).toBe(10);
    expect(o.linkCompra).toBe(LINK_COMPRA_PADRAO);
    expect(o.simuladorAtivo).toBe(false);
    expect(o.referenciaML).toBeNull();
  });

  it('referência do ML vigente aparece; vencida ou incompleta some', () => {
    const vigente = settings({ referenciaMercadoLivre: { precoCentavos: 17990, url: 'https://ml.example/x', conferidoEm: '2026-11-20' } });
    expect(montarOferta(CAIXA, vigente, AGORA).referenciaML).toEqual({ precoCentavos: 17990, url: 'https://ml.example/x', conferidoEm: '2026-11-20' });
    const vencida = settings({ referenciaMercadoLivre: { precoCentavos: 17990, url: 'https://ml.example/x', conferidoEm: '2026-09-01' } });
    expect(montarOferta(CAIXA, vencida, AGORA).referenciaML).toBeNull();
    const semData = settings({ referenciaMercadoLivre: { precoCentavos: 17990, url: 'https://ml.example/x', conferidoEm: null } });
    expect(montarOferta(CAIXA, semData, AGORA).referenciaML).toBeNull();
    const semPreco = settings({ referenciaMercadoLivre: { precoCentavos: null, url: 'https://ml.example/x', conferidoEm: '2026-11-20' } });
    expect(montarOferta(CAIXA, semPreco, AGORA).referenciaML).toBeNull();
  });

  it('disponibilidade expõe só status e atualizadoEm', () => {
    const o = montarOferta(CAIXA, settings({
      disponibilidade: { status: 'disponivel', atualizadoEm: '2026-11-27', responsavel: 'Fulano Interno', observacao: 'nota interna' },
    }), AGORA);
    expect(o.disponibilidade).toEqual({ status: 'disponivel', atualizadoEm: '2026-11-27' });
  });

  it('nunca vaza outras configurações', () => {
    const suja = {
      ...SALES_SETTINGS_DEFAULTS,
      modo: 'AUTONOMOUS' as const,
      remetente: { nome: 'SEGREDO-NOME', razaoSocial: 'SEGREDO-RAZAO', cnpj: '00.000.000/0000-00', endereco: 'SEGREDO-END', linkSite: '', linkMercadoLivre: '' },
      canal: { ...SALES_SETTINGS_DEFAULTS.canal, remetenteEmail: 'segredo@interno.example', dominio: 'segredo.example' },
      disponibilidade: { status: 'em_falta' as const, atualizadoEm: null, responsavel: 'SEGREDO-RESP', observacao: 'SEGREDO-OBS' },
    };
    const json = JSON.stringify(montarOferta(CAIXA, suja, AGORA));
    expect(json).not.toMatch(/SEGREDO|segredo|AUTONOMOUS|00\.000/);
    expect(Object.keys(montarOferta(CAIXA, suja, AGORA)).sort()).toEqual(
      ['disponibilidade', 'kgPorCaixa', 'linkCompra', 'precoSiteCentavos', 'produto', 'referenciaML', 'simuladorAtivo'],
    );
  });
});

describe('conformidade do texto da página /atacado', () => {
  const dir = join(__dirname, '..', 'client', 'src', 'components', 'sales');
  const page = join(__dirname, '..', 'client', 'src', 'pages', 'Atacado.tsx');
  const arquivos = [page, ...readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => join(dir, f))];

  it('os textos centralizados passam nas travas comerciais', () => {
    for (const t of todosOsTextos()) {
      const r = verificarTextoComercial(t);
      expect(r.achados, t).toEqual([]);
    }
  });

  it('o código-fonte da página e dos componentes passa nas travas', () => {
    for (const f of arquivos) {
      const r = verificarTextoComercial(readFileSync(f, 'utf8'));
      expect(r.achados, f).toEqual([]);
    }
  });

  // Público do atacado inclui lojas de suplementação: nenhum texto pode tocar em esporte,
  // hidratação, sódio etc. (pedido do dono, 28/11/2026). Regras da trava + lista própria.
  const PROIBIDAS = ['treino', 'hidratação', 'eletrólito', 'câimbra', 'sódio', 'atleta', 'esporte', 'saudável', 'sem aditivos', '100% natural', 'minerais essenciais'];
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  it.each(PROIBIDAS)('nenhum texto menciona "%s"', (palavra) => {
    for (const t of todosOsTextos()) expect(norm(t), t).not.toContain(norm(palavra));
    for (const f of arquivos) expect(norm(readFileSync(f, 'utf8')), f).not.toContain(norm(palavra));
  });

  it('a própria trava reprova exemplos proibidos', () => {
    for (const ruim of ['Ajuda na hidratação do atleta', 'Menos sódio', 'Rico em minerais', 'Sem aditivos', 'Sal 100% natural', 'Previne câimbra', 'Eletrólitos para o treino']) {
      expect(verificarTextoComercial(ruim).ok, ruim).toBe(false);
    }
  });
});

describe('formulário inbound', () => {
  const src = readFileSync(join(__dirname, '..', 'client', 'src', 'components', 'sales', 'FormularioInbound.tsx'), 'utf8');

  it('continua enviando para /api/b2b/inbound com consent: true', () => {
    expect(src).toContain("fetch('/api/b2b/inbound'");
    expect(src).toMatch(/JSON\.stringify\(\{ \.\.\.form, consent: true \}\)/);
  });

  it('mantém o texto de consentimento e os segmentos originais', () => {
    expect(src).toContain('CONSENT_TEXT');
    const copy = readFileSync(join(__dirname, '..', 'client', 'src', 'components', 'sales', 'atacadoCopy.ts'), 'utf8');
    expect(copy).toContain('Concordo em ser contatado pela equipe Sal Vita Premium para receber informações comerciais sobre compras B2B, revenda ou atacado.');
    for (const s of ['Empório / loja natural', 'Casa de temperos', 'Mercado premium', 'Parrilla / churrascaria', 'Casa de carnes', 'Restaurante', 'Peixaria', 'Distribuidor', 'Outro']) {
      expect(src).toContain(`'${s}'`);
    }
  });

  it('a página monta o vendedor virtual (que nasce desligado e vira formulário)', () => {
    const p = readFileSync(join(__dirname, '..', 'client', 'src', 'pages', 'Atacado.tsx'), 'utf8');
    expect(p).toContain("import SalesAgentWidget from '../components/sales/SalesAgentWidget';");
    expect(p).toContain('<SalesAgentWidget />');
  });
});
