import { describe, it, expect, afterEach } from 'vitest';
import { calcularVeredito } from '../shared/credito';
import { relatorioSimulado, provedorSimulado } from '../server/lib/credito/provedores/simulado';
import { getProvedorCredito } from '../server/lib/credito/provedores';
import {
  mapearRespostaBoaVista, statusIndicaSucesso, extrairSaldo,
} from '../server/lib/credito/provedores/boavistaApifull';

const AGORA = '2026-10-15T12:00:00.000Z';
const doc = (fim: string) => `1122233300${fim.padStart(4, '0')}`; // 14 dígitos terminando em `fim`

describe('provedor simulado', () => {
  it('é determinístico para o mesmo documento', () => {
    expect(relatorioSimulado(doc('0081'), 'CNPJ', AGORA)).toEqual(relatorioSimulado(doc('0081'), 'CNPJ', AGORA));
  });
  it('custo 0, provedor simulado e sem rede', async () => {
    const { relatorio } = await provedorSimulado.consultar(doc('0085'), 'CNPJ');
    expect(relatorio.fonte).toMatchObject({ provedor: 'simulado', custoReais: 0 });
    expect(provedorSimulado.custoReais).toBe(0);
  });
  it('o último dígito define as anotações', () => {
    expect(calcularVeredito(relatorioSimulado(doc('0090'), 'CNPJ', AGORA)).veredito).toBe('REPROVADO_A_PRAZO'); // protesto
    expect(relatorioSimulado(doc('0091'), 'CNPJ', AGORA).anotacoes.chequesSemFundo.quantidade).toBe(1);
    expect(calcularVeredito(relatorioSimulado(doc('0092'), 'CNPJ', AGORA)).veredito).toBe('REPROVADO_A_PRAZO'); // R$ 7.500
    expect(relatorioSimulado(doc('0093'), 'CNPJ', AGORA).anotacoes.pendenciasFinanceiras.valorTotal).toBe(1200);
    expect(relatorioSimulado(doc('0094'), 'CNPJ', AGORA).anotacoes.acoesJudiciais.quantidade).toBe(1);
    const limpo = relatorioSimulado(doc('0095'), 'CNPJ', AGORA);
    expect(Object.values(limpo.anotacoes).every((g) => g.consultado && g.quantidade === 0)).toBe(true);
  });
});

describe('seleção do provedor', () => {
  const original = process.env.CREDITO_PROVEDOR;
  afterEach(() => { if (original === undefined) delete process.env.CREDITO_PROVEDOR; else process.env.CREDITO_PROVEDOR = original; });
  it('simulado por padrão e para qualquer valor diferente de boavista_apifull', () => {
    delete process.env.CREDITO_PROVEDOR;
    expect(getProvedorCredito().nome).toBe('simulado');
    process.env.CREDITO_PROVEDOR = 'qualquer';
    expect(getProvedorCredito().nome).toBe('simulado');
    process.env.CREDITO_PROVEDOR = 'boavista_apifull';
    expect(getProvedorCredito().nome).toBe('boavista_apifull');
  });
});

describe('mapeador defensivo da Boa Vista (API Full)', () => {
  const desconhecidos: unknown[] = [null, undefined, 42, 'texto', [], {}, { dados: null }, { dados: 'x' }, { dados: { qualquerCoisa: { a: 1 } } }];
  it.each(desconhecidos.map((j) => [JSON.stringify(j) ?? 'undefined', j]))('estrutura desconhecida %s → nulls e consultado:false', (_n, json) => {
    const m = mapearRespostaBoaVista(json);
    expect(m.score.valor).toBeNull();
    expect(Object.values(m.cadastro).every((v) => v === null)).toBe(true);
    expect(m.socios).toEqual([]);
    expect(Object.values(m.anotacoes).every((g) => g.consultado === false && g.quantidade === 0 && g.valorTotal === null && g.itens.length === 0)).toBe(true);
  });
  it('score fora de 0..1000 ou não numérico é ignorado', () => {
    expect(mapearRespostaBoaVista({ dados: { score: 1500 } }).score.valor).toBeNull();
    expect(mapearRespostaBoaVista({ dados: { score: 'abc' } }).score.valor).toBeNull();
    expect(mapearRespostaBoaVista({ dados: { score: 640 } }).score.valor).toBe(640);
  });
  it('veredito de resposta desconhecida é restrição (nunca "nada consta")', () => {
    expect(calcularVeredito(mapearRespostaBoaVista({ dados: {} })).veredito).toBe('COM_RESTRICAO');
  });
});

describe('status do corpo da API Full', () => {
  it('só status de sucesso conhecido vale; erro com HTTP 200 não', () => {
    expect(statusIndicaSucesso('sucesso')).toBe(true);
    expect(statusIndicaSucesso(' Sucesso ')).toBe(true);
    expect(statusIndicaSucesso('erro')).toBe(false);
    expect(statusIndicaSucesso('ERRO')).toBe(false);
    expect(statusIndicaSucesso(undefined)).toBe(false);
    expect(statusIndicaSucesso(200)).toBe(false);
  });
});

describe('saldo', () => {
  it('extrai número das chaves candidatas e devolve bruto mínimo (só primitivos)', () => {
    const r = extrairSaldo({ status: 'sucesso', saldo: 12.5, dados: { x: { y: 1 } } });
    expect(r.saldo).toBe(12.5);
    expect(r.bruto).toEqual({ status: 'sucesso', saldo: 12.5 });
  });
  it('estrutura desconhecida → saldo null', () => {
    expect(extrairSaldo({ dados: { foo: 1 } }).saldo).toBeNull();
    expect(extrairSaldo(null).saldo).toBeNull();
  });
});
