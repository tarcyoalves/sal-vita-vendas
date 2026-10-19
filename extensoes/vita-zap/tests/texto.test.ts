import { describe, expect, it } from 'vitest';
import { criarItens, textoDoItem, validarParaAprovar } from '../src/shared/campanha';
import { contemLink, montarMensagem, sortearModelo, validarModelo, validarModelos } from '../src/shared/texto';

describe('bloqueio de link na primeira mensagem', () => {
  it.each([
    'Veja https://salvitarn.com.br',
    'veja http://x.co',
    'acesse www.salvita.com',
    'chama no wa.me/5584999990000',
    'site salvitarn.com.br',
    'loja.com',
    'bit.ly/abc',
    'SALVITA.COM.BR',
    'premium.salvitarn.com.br/atacado',
  ])('bloqueia: %s', (t) => {
    expect(contemLink(t)).toBe(true);
    expect(validarModelo(t).join(' ')).toMatch(/link/);
  });

  it.each([
    'Boa tarde, {primeiroNome}, tudo bem? Como estão de sal por aí?',
    'O preço é R$ 1.50 o quilo',
    'Bom dia! Tudo certo. Precisa de sal?',
    'Sr. João, tudo bem?',
    'Entrega em 3.5 dias',
  ])('aceita: %s', (t) => {
    expect(contemLink(t)).toBe(false);
  });
});

describe('validação do texto', () => {
  it('vazio, longo demais e marcador desconhecido', () => {
    expect(validarModelo('   ')).toContain('texto vazio');
    expect(validarModelo('a'.repeat(501)).join(' ')).toMatch(/longo demais/);
    expect(validarModelo('Oi {nome}').join(' ')).toMatch(/marcador desconhecido \{nome\}/);
    expect(validarModelo('Oi {primeiroNome}')).toEqual([]);
  });

  it('texto não traz linha "responda SAIR" (decisão do dono) — nada é acrescentado', () => {
    expect(montarMensagem('Oi {primeiroNome}, tudo bem?', 'Ana')).toBe('Oi Ana, tudo bem?');
  });

  it('base + até 3 variações; vazias são ignoradas', () => {
    const r = validarModelos('Oi {primeiroNome}', ['Olá {primeiroNome}', '', '  ']);
    expect(r.modelos).toEqual(['Oi {primeiroNome}', 'Olá {primeiroNome}']);
    expect(r.erros).toEqual([]);
    expect(validarModelos('Oi', ['a', 'b', 'c', 'd']).erros.join(' ')).toMatch(/no máximo 3/);
    expect(validarModelos('Oi', ['veja www.x.com']).erros.join(' ')).toMatch(/Variação 1: .*link/);
  });
});

describe('sorteio e montagem', () => {
  it('sorteia entre os modelos', () => {
    const m = ['a', 'b', 'c'];
    expect(sortearModelo(m, () => 0)).toBe('a');
    expect(sortearModelo(m, () => 0.5)).toBe('b');
    expect(sortearModelo(m, () => 0.9999)).toBe('c');
    expect(sortearModelo(m, () => 1)).toBe('c');
  });

  it('substitui todas as ocorrências de {primeiroNome}', () => {
    expect(montarMensagem('{primeiroNome}! Oi, {primeiroNome}', 'Zé')).toBe('Zé! Oi, Zé');
  });

  it('criarItens: um item por contato, primeiro nome extraído, modelo sorteado', () => {
    const itens = criarItens(
      [
        { chave: 'joao cliente', nome: 'João CLIENTE' },
        { chave: 'joao cliente', nome: 'João CLIENTE' },
        { chave: 'cliente maria', nome: 'CLIENTE Maria' },
      ],
      ['Oi {primeiroNome}', 'Olá {primeiroNome}'],
      ['CLIENTE'],
      () => 0.9,
    );
    expect(itens).toHaveLength(2);
    expect(itens.map(textoDoItem)).toEqual(['Olá João', 'Olá Maria']);
  });

  it('aprovação exige primeiro nome quando o texto usa {primeiroNome}', () => {
    const itens = criarItens([{ chave: 'cliente 22', nome: 'CLIENTE 22' }], ['Oi {primeiroNome}'], ['CLIENTE']);
    expect(validarParaAprovar({ itens, modelos: ['Oi {primeiroNome}'] }).join(' ')).toMatch(/preencha o primeiro nome/);
    expect(validarParaAprovar({ itens: [], modelos: ['Oi'] })).toContain('nenhum contato na campanha');
  });

  it('aprovação bloqueia link mesmo vindo do primeiro nome editado', () => {
    const itens = criarItens([{ chave: 'a', nome: 'Ana' }], ['Oi {primeiroNome}'], []);
    itens[0].primeiroNome = 'www.golpe.com';
    expect(validarParaAprovar({ itens, modelos: ['Oi {primeiroNome}'] }).join(' ')).toMatch(/link/);
  });
});
