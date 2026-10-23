import { describe, expect, it } from 'vitest';
import { deduplicarLinhas, linhasParaContatos, type ContatoVarrido, type LinhaBruta } from '../src/shared/contatos';
import { aplicarFiltros, avaliarContato, FILTROS_PADRAO, type Filtros, ultimoEnvioPorChave } from '../src/shared/filtros';
import { chaveContato, pareceSoNumero, primeiroNome, separarTermos } from '../src/shared/nomes';

const AGORA = new Date('2026-10-19T15:00:00Z'); // segunda, 12h em Fortaleza

function contato(nome: string, parcial: Partial<ContatoVarrido> = {}): ContatoVarrido {
  return {
    chave: chaveContato(nome),
    nome,
    rotuloData: '10/09/2026',
    ultimaConversa: '2026-09-10',
    revisarData: null,
    soNumero: false,
    pareceGrupo: false,
    temConversa: true,
    duplicado: false,
    varridoEm: AGORA.toISOString(),
    ...parcial,
  };
}

const ctxVazio = { agora: AGORA, naoEnviar: new Set<string>(), ultimoEnvioPorChave: new Map<string, string>() };

function filtros(p: Partial<Filtros> = {}): Filtros {
  return { ...FILTROS_PADRAO, ...p };
}

describe('nomes', () => {
  it('detecta contato só com número', () => {
    expect(pareceSoNumero('+55 84 99999-0000')).toBe(true);
    expect(pareceSoNumero('(84) 3321-4567')).toBe(true);
    expect(pareceSoNumero('‪+55 84 99999-0000‬')).toBe(true);
    expect(pareceSoNumero('João CLIENTE')).toBe(false);
    expect(pareceSoNumero('Loja 22')).toBe(false);
    expect(pareceSoNumero('190')).toBe(false);
  });

  it('primeiro nome ignora o termo do filtro, tratamentos e números', () => {
    expect(primeiroNome('CLIENTE - JOÃO SILVA', ['CLIENTE'])).toBe('João');
    expect(primeiroNome('João Silva CLIENTE', ['CLIENTE'])).toBe('João');
    expect(primeiroNome('Cliente: Maria', ['CLIENTE'])).toBe('Maria');
    expect(primeiroNome('CLIENTES Ana Paula', ['cliente'])).toBe('Ana');
    expect(primeiroNome('Sr. Antônio (cliente)', ['CLIENTE'])).toBe('Antônio');
    expect(primeiroNome('Dona Francisca', [])).toBe('Francisca');
    expect(primeiroNome('🧂 José 2', [])).toBe('José');
    expect(primeiroNome('CLIENTE 123', ['CLIENTE'])).toBe('');
  });

  it('separa termos por vírgula', () => {
    expect(separarTermos('CLIENTE, ATACADO ;  ')).toEqual(['CLIENTE', 'ATACADO']);
    expect(separarTermos('')).toEqual([]);
  });
});

describe('deduplicação', () => {
  const linha = (nome: string, posicao: number | null, rotuloData: string | null = '14:00'): LinhaBruta => ({
    nome,
    rotuloData,
    posicao,
    pareceGrupo: false,
  });

  it('a mesma linha lida várias vezes na rolagem vira um contato só', () => {
    const r = deduplicarLinhas([linha('João CLIENTE', 0), linha('Maria CLIENTE', 72), linha('João CLIENTE', 0), linha('Maria CLIENTE', 72)]);
    expect(r).toHaveLength(2);
    expect(r.every((x) => !x.duplicado)).toBe(true);
  });

  it('mesmo nome em posições diferentes = dois chats → duplicado', () => {
    const r = deduplicarLinhas([linha('João CLIENTE', 0), linha('João CLIENTE', 144)]);
    expect(r).toHaveLength(1);
    expect(r[0].duplicado).toBe(true);
  });

  it('compara nome sem caixa/acento/espaço extra', () => {
    const r = deduplicarLinhas([linha('José  CLIENTE', 0), linha('jose cliente', 0)]);
    expect(r).toHaveLength(1);
  });

  it('não perde a marca de grupo nem a data de leituras posteriores', () => {
    const r = deduplicarLinhas([linha('Grupo CLIENTE', 0, null), { ...linha('Grupo CLIENTE', 0), pareceGrupo: true }]);
    expect(r[0].pareceGrupo).toBe(true);
    expect(r[0].rotuloData).toBe('14:00');
  });

  it('linhas → contatos com data interpretada', () => {
    const c = linhasParaContatos([linha('João CLIENTE', 0, 'Ontem'), linha('+55 84 99999-0000', 72), linha('Ana CLIENTE', 144, null)], AGORA);
    expect(c.find((x) => x.nome === 'João CLIENTE')).toMatchObject({ ultimaConversa: '2026-10-18', temConversa: true });
    expect(c.find((x) => x.nome.startsWith('+55'))?.soNumero).toBe(true);
    expect(c.find((x) => x.nome === 'Ana CLIENTE')).toMatchObject({ temConversa: false, ultimaConversa: null });
  });
});

describe('filtros', () => {
  it('nome contém / não contém, sem diferenciar caixa e acento', () => {
    const f = filtros({ contem: ['cliente'], naoContem: ['fornecedor'] });
    expect(avaliarContato(contato('João CLIENTE'), f, ctxVazio).situacao).toBe('incluido');
    expect(avaliarContato(contato('João Client'), f, ctxVazio).situacao).toBe('excluido');
    expect(avaliarContato(contato('Ana Clíente'), filtros({ contem: ['CLIENTE'] }), ctxVazio).situacao).toBe('incluido');
    expect(avaliarContato(contato('Pedro'), f, ctxVazio).motivo).toMatch(/não contém "cliente"/);
    expect(avaliarContato(contato('CLIENTE e FORNECEDOR'), f, ctxVazio).motivo).toMatch(/contém "fornecedor"/);
  });

  it('última conversa antes de / depois de (inclusive)', () => {
    const antes = filtros({ ultimaConversaAntesDe: '2026-09-17' });
    expect(avaliarContato(contato('A', { ultimaConversa: '2026-09-16' }), antes, ctxVazio).situacao).toBe('incluido');
    expect(avaliarContato(contato('A', { ultimaConversa: '2026-09-17' }), antes, ctxVazio).situacao).toBe('incluido');
    expect(avaliarContato(contato('A', { ultimaConversa: '2026-09-18' }), antes, ctxVazio).situacao).toBe('excluido');
    const depois = filtros({ ultimaConversaDepoisDe: '2026-09-01' });
    expect(avaliarContato(contato('A', { ultimaConversa: '2026-09-02' }), depois, ctxVazio).situacao).toBe('incluido');
    expect(avaliarContato(contato('A', { ultimaConversa: '2026-09-01' }), depois, ctxVazio).situacao).toBe('incluido');
    expect(avaliarContato(contato('A', { ultimaConversa: '2026-08-31' }), depois, ctxVazio).situacao).toBe('excluido');
  });

  it('data incerta com filtro de data → revisar, nunca incluído', () => {
    const f = filtros({ ultimaConversaAntesDe: '2026-09-17' });
    const d = avaliarContato(contato('A', { ultimaConversa: null, revisarData: 'dia da semana ambíguo' }), f, ctxVazio);
    expect(d.situacao).toBe('revisar');
    expect(d.motivo).toMatch(/ambíguo/);
  });

  it('exclui só número, grupo, sem conversa e "não enviar mais"', () => {
    expect(avaliarContato(contato('+55 84 9999-0000', { soNumero: true }), filtros(), ctxVazio).situacao).toBe('excluido');
    expect(avaliarContato(contato('Clientes Sal', { pareceGrupo: true }), filtros(), ctxVazio).situacao).toBe('excluido');
    expect(avaliarContato(contato('A', { temConversa: false }), filtros(), ctxVazio).situacao).toBe('excluido');
    const ctx = { ...ctxVazio, naoEnviar: new Set([chaveContato('João')]) };
    expect(avaliarContato(contato('João'), filtros(), ctx).motivo).toMatch(/Não enviar mais/);
  });

  it('nome duplicado → revisar', () => {
    expect(avaliarContato(contato('A', { duplicado: true }), filtros(), ctxVazio).situacao).toBe('revisar');
  });

  it('exclui quem recebeu campanha há menos de 14 dias (piso não pode ser reduzido)', () => {
    const c = contato('João');
    const ha13 = new Map([[c.chave, '2026-10-06T15:00:00Z']]);
    const ha14 = new Map([[c.chave, '2026-10-05T15:00:00Z']]);
    expect(avaliarContato(c, filtros(), { ...ctxVazio, ultimoEnvioPorChave: ha13 }).situacao).toBe('excluido');
    expect(avaliarContato(c, filtros(), { ...ctxVazio, ultimoEnvioPorChave: ha14 }).situacao).toBe('incluido');
    // Tentar baixar para 3 dias não funciona: continua 14.
    expect(avaliarContato(c, filtros({ excluirContatadosHaDias: 3 }), { ...ctxVazio, ultimoEnvioPorChave: ha13 }).situacao).toBe('excluido');
    // Subir para 30 vale.
    expect(avaliarContato(c, filtros({ excluirContatadosHaDias: 30 }), { ...ctxVazio, ultimoEnvioPorChave: ha14 }).situacao).toBe('excluido');
  });

  it('dias da regra de 14 contam no calendário de Fortaleza', () => {
    const c = contato('João');
    // Enviado 05/10 às 23:30 de Fortaleza (= 06/10 02:30 UTC) conta como dia 05/10 → 14 dias.
    const m = new Map([[c.chave, '2026-10-06T02:30:00Z']]);
    expect(avaliarContato(c, filtros(), { ...ctxVazio, ultimoEnvioPorChave: m }).situacao).toBe('incluido');
  });

  it('aplicarFiltros ordena incluídos, revisar, excluídos', () => {
    const r = aplicarFiltros(
      [contato('Zé', { soNumero: true }), contato('Bia', { duplicado: true }), contato('Ana')],
      filtros(),
      ctxVazio,
    );
    expect(r.map((x) => x.decisao.situacao)).toEqual(['incluido', 'revisar', 'excluido']);
  });

  it('aplicarFiltros ordena por data decrescente e desempata por nome', () => {
    const r = aplicarFiltros(
      [
        contato('Helton', { ultimaConversa: '2026-08-25' }),
        contato('Logans', { ultimaConversa: '2026-08-17' }),
        contato('Carlos', { ultimaConversa: '2026-09-10' }),
        contato('Andre', { ultimaConversa: '2026-09-10' }),
        contato('Sem Data', { ultimaConversa: null, temConversa: true }),
      ],
      filtros({ incluirSemConversa: true }),
      ctxVazio,
    );
    expect(r.map((x) => x.contato.nome)).toEqual(['Andre', 'Carlos', 'Helton', 'Logans', 'Sem Data']);
  });

  it('último envio por chave pega o mais recente', () => {
    const m = ultimoEnvioPorChave([
      { chave: 'a', enviadoEm: '2026-10-01T12:00:00.000Z' },
      { chave: 'a', enviadoEm: '2026-10-10T12:00:00.000Z' },
      { chave: 'b', enviadoEm: '2026-09-01T12:00:00.000Z' },
    ]);
    expect(m.get('a')).toBe('2026-10-10T12:00:00.000Z');
    expect(m.get('b')).toBe('2026-09-01T12:00:00.000Z');
  });
});
