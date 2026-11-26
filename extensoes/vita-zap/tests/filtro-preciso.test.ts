// 0.7.63: palavra inteira nos termos do nome e região por UF/DDD (módulos puros: nomes.ts, regiao.ts, filtros.ts).
import { describe, expect, it } from 'vitest';
import type { ContatoVarrido } from '../src/shared/contatos';
import { dadosVazios } from '../src/shared/crm-store';
import { telefonesConhecidosPorChave } from '../src/shared/crm-telefone-conhecido';
import { aplicarFiltros, avaliarContato, FILTROS_PADRAO, MOTIVO_SEM_TELEFONE_PARA_DDD, type ContextoFiltro, type Filtros } from '../src/shared/filtros';
import { chaveContato, nomeTemTermo, palavrasDoNome } from '../src/shared/nomes';
import { candidatosDoPedido, normalizarPlano } from '../src/shared/pedido-ia';
import { DDDS_BRASIL, DDDS_POR_UF, dddDoTelefone, ddsDaUf, incluirDddsDaUf, lerRegiao, UFS_BRASIL } from '../src/shared/regiao';
import { CONFIG_REATIVACAO_PADRAO, filtrosDaReativacao, normalizarConfigReativacao } from '../src/shared/reativacao';
import { normalizarTelefone } from '../src/shared/telefone';

const AGORA = new Date('2026-11-26T15:00:00Z');

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

const ctx = (extra: Partial<ContextoFiltro> = {}): ContextoFiltro => ({ agora: AGORA, naoEnviar: new Set(), ultimoEnvioPorChave: new Map(), ...extra });
const filtros = (p: Partial<Filtros> = {}): Filtros => ({ ...FILTROS_PADRAO, ...p });
const situacao = (nome: string, f: Filtros, c: ContextoFiltro = ctx()) => avaliarContato(contato(nome), f, c).situacao;

describe('palavra inteira (nomes.ts)', () => {
  it('"PR" casa com a palavra PR e não com pedaços (COMPRAS, PRECISA)', () => {
    expect(nomeTemTermo('CLIENTE PENSO SALTO DO LONTRA PR', 'PR', true)).toBe(true);
    expect(nomeTemTermo('Loja COMPRAS Brasil', 'PR', true)).toBe(false);
    expect(nomeTemTermo('Maria PRECISA de sal', 'PR', true)).toBe(false);
    expect(nomeTemTermo('Loja COMPRAS Brasil', 'PR', false)).toBe(true); // comportamento antigo
  });

  it('separadores: ponto, hífen, parênteses, barra, vírgula e espaços', () => {
    for (const nome of ['Fulano PR.', 'Fulano -PR', 'Fulano (PR)', 'Fulano/PR', 'Fulano,PR', 'Fulano  PR', 'PR-Fulano', 'Fulano_PR']) {
      expect(nomeTemTermo(nome, 'PR', true), nome).toBe(true);
    }
  });

  it('sem acento nem maiúscula, nos dois lados', () => {
    expect(nomeTemTermo('Cliente São João', 'sao', true)).toBe(true);
    expect(nomeTemTermo('Cliente SAO Joao', 'São', true)).toBe(true);
    expect(nomeTemTermo('Cliente Açúcar', 'ACUCAR', true)).toBe(true);
    expect(nomeTemTermo('Cliente São João', 'sa', true)).toBe(false);
  });

  it('termo com várias palavras casa como SEQUÊNCIA de palavras inteiras', () => {
    const nome = 'CLIENTE PENSO SALTO DO LONTRA PR';
    expect(nomeTemTermo(nome, 'salto do lontra', true)).toBe(true);
    expect(nomeTemTermo(nome, 'Salto  do-Lontra', true)).toBe(true);
    expect(nomeTemTermo(nome, 'do salto', true)).toBe(false); // fora de ordem
    expect(nomeTemTermo(nome, 'salto lontra', true)).toBe(false); // não é sequência
    expect(nomeTemTermo(nome, 'salto do lont', true)).toBe(false); // palavra cortada
    expect(palavrasDoNome('  Ações (RN)  ')).toEqual(['acoes', 'rn']);
  });

  it('termo vazio ou só pontuação não restringe', () => {
    expect(nomeTemTermo('Qualquer', '', true)).toBe(true);
    expect(nomeTemTermo('Qualquer', ' - ', true)).toBe(true);
  });
});

describe('filtros "contém" / "não contém" por palavra inteira', () => {
  it('contém: PR entra, COMPRAS não; motivo diz "a palavra"', () => {
    const f = filtros({ contem: ['PR'], palavraInteira: true });
    const entra = avaliarContato(contato('Ana (PR)'), f, ctx());
    expect(entra.situacao).toBe('incluido');
    expect(entra.motivo).toContain('contém a palavra "PR"');
    const fora = avaliarContato(contato('Loja COMPRAS'), f, ctx());
    expect(fora).toEqual({ situacao: 'excluido', motivo: 'nome não contém a palavra "PR"' });
  });

  it('exemplo do dono: CLIENTE + PR', () => {
    const f = filtros({ contem: ['CLIENTE', 'PR'], palavraInteira: true });
    expect(situacao('CLIENTE PENSO SALTO DO LONTRA PR', f)).toBe('incluido');
    expect(situacao('CLIENTE COMPRAS SP', f)).toBe('excluido');
    expect(situacao('CLIENTE PRECISA SP', f)).toBe('excluido');
  });

  it('sequência: motivo no plural', () => {
    const f = filtros({ contem: ['salto do lontra'], palavraInteira: true });
    expect(avaliarContato(contato('CLIENTE SALTO DO LONTRA PR'), f, ctx()).motivo).toContain('contém as palavras "salto do lontra"');
    expect(avaliarContato(contato('CLIENTE SALTO LONTRA'), f, ctx()).motivo).toBe('nome não contém as palavras "salto do lontra"');
  });

  it('não contém por palavra inteira: "PR" não tira COMPRAS, tira "X PR"', () => {
    const f = filtros({ naoContem: ['PR'], palavraInteira: true });
    expect(situacao('Loja COMPRAS', f)).toBe('incluido');
    const d = avaliarContato(contato('Loja X-PR'), f, ctx());
    expect(d).toEqual({ situacao: 'excluido', motivo: 'nome contém a palavra "PR"' });
    expect(situacao('Loja COMPRAS', filtros({ naoContem: ['PR'] }))).toBe('excluido'); // antigo
    expect(situacao('Loja', filtros({ naoContem: [' - '], palavraInteira: true }))).toBe('incluido'); // termo só de pontuação não tira ninguém
  });

  it('filtro ANTIGO (sem o campo) mantém o pedaço e o motivo antigo', () => {
    const antigo = { ...FILTROS_PADRAO, contem: ['PR'] } as Filtros;
    delete (antigo as { palavraInteira?: boolean }).palavraInteira;
    const d = avaliarContato(contato('Loja COMPRAS'), antigo, ctx());
    expect(d.situacao).toBe('incluido');
    expect(d.motivo).toContain('contém "PR"');
    expect(avaliarContato(contato('Pedro'), antigo, ctx()).motivo).toBe('nome não contém "PR"');
  });
});

describe('região: tabela UF → DDD', () => {
  it('27 UFs, cada DDD em uma só UF, 67 DDDs, todos de 2 dígitos', () => {
    expect(UFS_BRASIL.size).toBe(27);
    const todos = Object.values(DDDS_POR_UF).flat();
    expect(new Set(todos).size).toBe(todos.length);
    expect(DDDS_BRASIL.size).toBe(67);
    expect(todos.every((d) => /^\d{2}$/.test(d))).toBe(true);
  });

  it('valores conhecidos', () => {
    expect(ddsDaUf('PR')).toEqual(['41', '42', '43', '44', '45', '46']);
    expect(ddsDaUf('rn')).toEqual(['84']);
    expect(ddsDaUf('SP')).toHaveLength(9);
    expect(ddsDaUf('MG')).toHaveLength(7);
    expect(ddsDaUf('XX')).toEqual([]);
  });

  it('atalho "incluir os DDDs de PR" não repete o que já está no campo', () => {
    expect(incluirDddsDaUf('PR', 'PR')).toBe('PR, 41, 42, 43, 44, 45, 46');
    expect(incluirDddsDaUf('PR, 45', 'PR')).toBe('PR, 45, 41, 42, 43, 44, 46');
    expect(incluirDddsDaUf('PR, 41, 42, 43, 44, 45, 46', 'PR')).toBe('PR, 41, 42, 43, 44, 45, 46');
    expect(incluirDddsDaUf('', 'RN')).toBe('84');
  });
});

describe('região: leitura e validação do campo', () => {
  it('lê UFs e DDDs, sem repetir, ignorando caixa e parênteses', () => {
    expect(lerRegiao('PR, 41, 45, 46')).toEqual({ ufs: ['PR'], ddds: ['41', '45', '46'], erros: [] });
    expect(lerRegiao('pr; (45)\nsc 45 PR')).toEqual({ ufs: ['PR', 'SC'], ddds: ['45'], erros: [] });
    expect(lerRegiao('')).toEqual({ ufs: [], ddds: [], erros: [] });
    expect(lerRegiao(undefined).erros).toEqual([]);
  });

  it('item inválido vira ERRO (não é ignorado em silêncio)', () => {
    const r = lerRegiao('PR, XX, 10, 100, 4, Paraná, 45');
    expect(r.ufs).toEqual(['PR']);
    expect(r.ddds).toEqual(['45']);
    expect(r.erros).toEqual([
      '"XX" não é UF nem DDD do Brasil',
      '"10" não é UF nem DDD do Brasil',
      '"100" não é UF nem DDD do Brasil',
      '"4" não é UF nem DDD do Brasil',
      '"Paraná" não é UF nem DDD do Brasil',
    ]);
    expect(lerRegiao('00, 20, 23').erros).toHaveLength(3); // DDDs que não existem
  });

  it('DDD do telefone, com e sem o 9º dígito', () => {
    expect(dddDoTelefone('5545999112233')).toBe('45');
    expect(dddDoTelefone('554533112233')).toBe('45');
    expect(dddDoTelefone('14155550100')).toBeNull(); // fora do Brasil
    expect(dddDoTelefone(null)).toBeNull();
    expect(dddDoTelefone('5500999112233')).toBeNull(); // DDD inexistente
  });
});

describe('região no filtro', () => {
  const NOME = 'CLIENTE PENSO SALTO DO LONTRA PR';
  const tel = (chave: string, numero: string) => new Map([[chave, normalizarTelefone(numero)!]]);

  it('UF no nome atende (palavra inteira, mesmo com "Palavra inteira" desligada); motivo "UF PR no nome"', () => {
    for (const palavraInteira of [true, false]) {
      const d = avaliarContato(contato(NOME), filtros({ contem: ['CLIENTE'], palavraInteira, regiao: ['PR'] }), ctx());
      expect(d.situacao).toBe('incluido');
      expect(d.motivo).toContain('UF PR no nome');
    }
    // PR dentro de COMPRAS não é UF no nome → sem telefone: revisar
    expect(avaliarContato(contato('CLIENTE COMPRAS'), filtros({ regiao: ['PR'] }), ctx()).situacao).toBe('revisar');
  });

  it('DDD do telefone conhecido atende (com e sem o 9º dígito); motivo "DDD 45"', () => {
    const f = filtros({ regiao: ['41', '45', '46'] });
    const c = contato('CLIENTE Foz');
    for (const numero of ['(45) 99911-2233', '(45) 3311-2233', '+55 45 99911 2233']) {
      const d = avaliarContato(c, f, ctx({ telefonePorChave: tel(c.chave, numero) }));
      expect(d.situacao, numero).toBe('incluido');
      expect(d.motivo).toContain('DDD 45');
    }
  });

  it('telefone de outro DDD → excluído "fora da região (DDD 11)"; de fora do Brasil também', () => {
    const f = filtros({ regiao: ['PR', '41', '45'] });
    const c = contato('CLIENTE Sampa');
    expect(avaliarContato(c, f, ctx({ telefonePorChave: tel(c.chave, '(11) 98888-7777') }))).toEqual({ situacao: 'excluido', motivo: 'fora da região (DDD 11)' });
    expect(avaliarContato(c, f, ctx({ telefonePorChave: tel(c.chave, '+1 415 555 0100') })).motivo).toBe('fora da região (telefone fora do Brasil)');
  });

  it('sem telefone conhecido (e sem a UF no nome): vai para REVISAR, nunca entra nem some', () => {
    const d = avaliarContato(contato('CLIENTE Foz'), filtros({ regiao: ['41', '45'] }), ctx());
    expect(d).toEqual({ situacao: 'revisar', motivo: MOTIVO_SEM_TELEFONE_PARA_DDD });
    expect(MOTIVO_SEM_TELEFONE_PARA_DDD).toBe('sem telefone conhecido para conferir o DDD');
    // região só de DDDs e nome com UF: o nome não vale (só vale a UF pedida)
    expect(avaliarContato(contato(NOME), filtros({ regiao: ['45'] }), ctx()).situacao).toBe('revisar');
  });

  it('região vazia ou ausente: nada muda', () => {
    const base = avaliarContato(contato('CLIENTE Foz'), filtros({ contem: ['CLIENTE'] }), ctx());
    expect(avaliarContato(contato('CLIENTE Foz'), filtros({ contem: ['CLIENTE'], regiao: [] }), ctx())).toEqual(base);
    expect(base.motivo).not.toContain('DDD');
  });

  it('outras exclusões prevalecem sobre o revisar da região', () => {
    const f = filtros({ regiao: ['45'], contem: ['ZZZ'] });
    expect(avaliarContato(contato('CLIENTE Foz'), f, ctx()).situacao).toBe('excluido');
    const c = contato('CLIENTE Foz');
    const recente = ctx({ ultimoEnvioPorChave: new Map([[c.chave, '2026-11-25T10:00:00Z']]) });
    expect(avaliarContato(c, filtros({ regiao: ['45'] }), recente).situacao).toBe('excluido');
  });

  it('aplicarFiltros agrupa: incluídos primeiro, depois revisar, depois excluídos', () => {
    const a = contato('A CLIENTE PR');
    const b = contato('B CLIENTE Foz');
    const c = contato('C CLIENTE Sampa');
    const r = aplicarFiltros([c, b, a], filtros({ regiao: ['PR', '45'] }), ctx({ telefonePorChave: tel(c.chave, '(11) 98888-7777') }));
    expect(r.map((x) => [x.contato.nome, x.decisao.situacao])).toEqual([
      ['A CLIENTE PR', 'incluido'],
      ['B CLIENTE Foz', 'revisar'],
      ['C CLIENTE Sampa', 'excluido'],
    ]);
  });

  it('telefone vem do CRM da extensão (contato e conversa), um índice só', () => {
    const dados = dadosVazios();
    dados.contatos.x = { id: 'x', nome: 'Ana CLIENTE', telefone: '5545999112233', aliases: ['ana cliente'], etiquetas: [], notas: [], criadoEm: 1, atualizadoEm: 1 };
    const m = telefonesConhecidosPorChave(dados, [{ chave: 'ana cliente', nome: 'Ana CLIENTE' }, { chave: 'bia', nome: 'Bia' }]);
    expect(m.get('ana cliente')).toBe('5545999112233');
    expect(m.has('bia')).toBe(false);
    expect(telefonesConhecidosPorChave(null, [{ chave: 'a', nome: 'A' }]).size).toBe(0);
  });
});

describe('os mesmos termos na Reativação e no "Pedir à IA"', () => {
  it('config da reativação: padrão novo = palavra inteira; config já salva sem o campo mantém o comportamento antigo', () => {
    expect(CONFIG_REATIVACAO_PADRAO.palavraInteira).toBe(true);
    expect(normalizarConfigReativacao(undefined).palavraInteira).toBe(true);
    expect(normalizarConfigReativacao({ termo: 'PR' }).palavraInteira).toBe(false);
    expect(normalizarConfigReativacao({ termo: 'PR', palavraInteira: true }).palavraInteira).toBe(true);
    const f = filtrosDaReativacao(normalizarConfigReativacao({ termo: 'PR', palavraInteira: true }), AGORA);
    expect(f.palavraInteira).toBe(true);
    expect(situacao('Loja COMPRAS', { ...f, ultimaConversaAntesDe: null, soComMensagemMinha: false })).toBe('excluido');
    const antigo = filtrosDaReativacao(normalizarConfigReativacao({ termo: 'PR' }), AGORA);
    expect(situacao('Loja COMPRAS', { ...antigo, ultimaConversaAntesDe: null, soComMensagemMinha: false })).toBe('incluido');
  });

  it('candidatosDoPedido: palavra inteira só quando pedida', () => {
    const plano = normalizarPlano({ periodoDias: 30, termosNomeContato: ['PR'] });
    const lista = [contato('Loja COMPRAS', { ultimaConversa: '2026-11-20' }), contato('Ana (PR)', { ultimaConversa: '2026-11-20' })];
    const c = { hoje: '2026-11-26', naoEnviar: new Set<string>() };
    expect(candidatosDoPedido(lista, plano, c).candidatos.map((x) => x.nome)).toEqual(['Loja COMPRAS', 'Ana (PR)'].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    const inteira = candidatosDoPedido(lista, plano, { ...c, palavraInteira: true });
    expect(inteira.candidatos.map((x) => x.nome)).toEqual(['Ana (PR)']);
    expect(inteira.fora).toEqual([['o nome não tem os termos pedidos', 1]]);
  });
});
