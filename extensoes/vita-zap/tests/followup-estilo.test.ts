// Mensagem de cobrança do dono (0.7.55): validação (espelho do servidor), sorteio, config/migração, rascunho do editor.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_FOLLOWUP_PADRAO, normalizarConfigFollowup, textoDaFilaDesatualizado } from '../src/shared/followup';
import {
  MAX_COBRANCA,
  MAX_ESTILO,
  MAX_TEXTOS,
  MSG_ESCREVA_ANTES,
  SUGESTOES_1,
  SUGESTOES_2,
  TERMOS_PROIBIDOS,
  assinaturaTextos,
  errosDoRascunho,
  montarTextoCobranca,
  normalizarTextos,
  podeLigar,
  previaDosTextos,
  rascunhoDeConfig,
  rascunhoMudou,
  rotuloOrigem,
  sortearTexto,
  textoCobrancaValido,
  textoParaModelo,
  textosDaTentativa,
  validarTextoCobranca,
} from '../src/shared/followup-estilo';

const OK = 'Oi, {nome}! Passando para saber se você viu minha mensagem.';

describe('validarTextoCobranca (espelha o servidor)', () => {
  it('texto bom passa; o marcador é {nome}', () => {
    expect(validarTextoCobranca(OK)).toEqual([]);
    expect(validarTextoCobranca('Oi, { nome }! Tudo certo por aí?')).toEqual([]);
    expect(montarTextoCobranca(OK, 'Ana')).toBe('Oi, Ana! Passando para saber se você viu minha mensagem.');
    expect(textoParaModelo(OK)).toBe('Oi, {primeiroNome}! Passando para saber se você viu minha mensagem.');
  });

  it.each([
    ['sem {nome}', 'Oi! Passando para saber se você viu minha mensagem.', /precisa conter \{nome\}/],
    ['vazio', '   ', /vazio/],
    ['outra chave', 'Oi, {nome}! Veja {link} aqui por favor.', /outras chaves/],
    ['o marcador antigo não vale na tela', 'Oi, {primeiroNome}! Tudo certo por aí hoje?', /precisa conter|outras chaves/],
    ['link', 'Oi, {nome}! Veja www.salvita.com.br para saber mais.', /link/],
    ['link sem www', 'Oi, {nome}! Acesse salvitarn.com.br e confira.', /link/],
    ['wa.me', 'Oi, {nome}! Me chama em wa.me/5584999999999 por favor.', /link/],
    ['R$', 'Oi, {nome}! O saco está R$ 20 hoje, quer?', /preço/],
    ['percentual', 'Oi, {nome}! Desconto de 10% só hoje, viu?', /preço|porcentagem/],
    ['colchetes', 'Oi, {nome}! [link] aqui para você ver.', /colchetes/],
    ['curto', '{nome}!', /curto/],
    ['longo', `Oi, {nome}! ${'muito '.repeat(60)}`, /longo demais/],
    ['responda SAIR', 'Oi, {nome}! Se não quiser, responda SAIR para parar.', /SAIR/],
  ])('recusa: %s', (_n, texto, esperado) => {
    const erros = validarTextoCobranca(texto);
    expect(erros.length).toBeGreaterThan(0);
    expect(erros.join(' | ')).toMatch(esperado);
    expect(textoCobrancaValido(texto)).toBe(false);
  });

  it.each(TERMOS_PROIBIDOS.map((t) => [t]))('termo proibido da conformidade sanitária: %s', (termo) => {
    expect(validarTextoCobranca(`Oi, {nome}! Nosso sal tem ${termo} de verdade, viu.`).join(' ')).toMatch(/conformidade sanitária/);
  });

  it('o limite de 280 conta DEPOIS de trocar o nome', () => {
    const base = 'Oi, {nome}! ';
    const justo = base + 'a'.repeat(MAX_COBRANCA - 'Oi, Maria! '.length);
    expect(montarTextoCobranca(justo, 'Maria')).toHaveLength(MAX_COBRANCA);
    expect(validarTextoCobranca(justo)).toEqual([]);
    expect(validarTextoCobranca(justo + 'a').join(' ')).toMatch(/longo demais/);
    // nome maior que o fictício estoura na hora do envio (o motor valida com o nome real)
    expect(validarTextoCobranca(justo, 'Maximiliano')).not.toEqual([]);
  });

  it('a lista de termos proibidos é a MESMA do servidor', () => {
    const servidor = readFileSync(join(__dirname, '../../../server/lib/zapIa.ts'), 'utf8');
    const bloco = /const TERMOS_PROIBIDOS = \[([\s\S]*?)\];/.exec(servidor)?.[1] ?? '';
    const doServidor = [...bloco.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(doServidor.length).toBeGreaterThan(10);
    expect([...TERMOS_PROIBIDOS].sort()).toEqual([...doServidor].sort());
  });

  it('as sugestões de ponto de partida também passam na validação (e não são usadas para envio)', () => {
    for (const s of [...SUGESTOES_1, ...SUGESTOES_2]) expect(validarTextoCobranca(s), s).toEqual([]);
  });
});

describe('normalizarTextos', () => {
  it('tira vazios, inválidos e repetidos (ignorando maiúsculas) e limita a 10', () => {
    expect(normalizarTextos([OK, '  ', 'sem marcador aqui mesmo', OK.toUpperCase().replace('{NOME}', '{nome}'), 'Olá, {nome}! Fico à disposição por aqui.'])).toEqual([
      OK,
      'Olá, {nome}! Fico à disposição por aqui.',
    ]);
    const muitos = Array.from({ length: 15 }, (_, i) => `Oi, {nome}! Variação número ${i} para você.`);
    expect(normalizarTextos(muitos)).toHaveLength(MAX_TEXTOS);
    expect(normalizarTextos('x')).toEqual([]);
    expect(normalizarTextos([1, null, OK])).toEqual([OK]);
  });
});

describe('sortearTexto: sem repetir a mesma em sequência', () => {
  const lista = ['a', 'b', 'c'];
  it('nunca devolve a anterior quando há 2 ou mais', () => {
    for (let i = 0; i < 100; i++) {
      const r = i / 100;
      for (const ant of lista) expect(sortearTexto(lista, () => r, ant)).not.toBe(ant);
    }
  });
  it('cobre todas as variações ao longo do tempo', () => {
    const vistos = new Set<string>();
    let ant: string | null = null;
    for (let i = 0; i < 200; i++) {
      ant = sortearTexto(lista, Math.random, ant) as string;
      vistos.add(ant);
    }
    expect(vistos.size).toBe(3);
  });
  it('com 1 texto repete (não há alternativa); com 0 devolve null; aleatório extremo não sai do vetor', () => {
    expect(sortearTexto(['a'], () => 0.5, 'a')).toBe('a');
    expect(sortearTexto([], () => 0.5)).toBeNull();
    expect(sortearTexto(lista, () => 0.9999999)).toBe('c');
    expect(sortearTexto(lista, () => 1)).toBe('c');
  });
  it('excluir: o que o contato já recebeu nunca volta; se não sobra nenhum, null', () => {
    expect(sortearTexto(lista, () => 0, null, ['a', 'b'])).toBe('c');
    expect(sortearTexto(lista, () => 0, null, ['A', 'b', 'c'])).toBeNull();
  });
});

describe('configuração: normalização e migração', () => {
  it('config da 0.7.54 ligada vira desligada, modo meus textos, com aviso', () => {
    const c = normalizarConfigFollowup({ ligado: true, dias: 4, pausado: false, confirmouRisco: true });
    expect(c).toEqual({ ...CONFIG_FOLLOWUP_PADRAO, dias: 4, confirmouRisco: true, desligadaSemTexto: true });
  });
  it('config da 0.7.54 desligada: sem aviso', () => {
    expect(normalizarConfigFollowup({ ligado: false, dias: 3, pausado: false, confirmouRisco: false }).desligadaSemTexto).toBe(false);
  });
  it('com texto da 1ª cobrança fica ligada; só com texto da 2ª não', () => {
    expect(normalizarConfigFollowup({ ligado: true, confirmouRisco: true, textos1: [OK] })).toMatchObject({ ligado: true, desligadaSemTexto: false });
    expect(normalizarConfigFollowup({ ligado: true, confirmouRisco: true, textos2: [OK] })).toMatchObject({ ligado: false, desligadaSemTexto: true });
  });
  it('o aviso some quando o dono salva um texto, mesmo sem ligar', () => {
    const avisada = normalizarConfigFollowup({ ligado: false, desligadaSemTexto: true });
    expect(avisada.desligadaSemTexto).toBe(true);
    expect(normalizarConfigFollowup({ ...avisada, textos1: [OK] }).desligadaSemTexto).toBe(false);
  });
  it('o aviso é idempotente (normalizar de novo não muda)', () => {
    const c = normalizarConfigFollowup({ ligado: true, confirmouRisco: true });
    expect(normalizarConfigFollowup(c)).toEqual(c);
  });
  it('modo desconhecido volta para "meus textos"; estilo é cortado em 500; textos inválidos guardados são descartados', () => {
    const c = normalizarConfigFollowup({ modo: 'xyz' as never, estilo: 'a'.repeat(900), textos1: ['sem marcador', OK] });
    expect(c.modo).toBe('meus_textos');
    expect(c.estilo).toHaveLength(MAX_ESTILO);
    expect(c.textos1).toEqual([OK]);
  });
});

describe('bloqueio de ligar sem texto', () => {
  it('podeLigar exige 1 texto da 1ª cobrança (a 2ª e o estilo não bastam)', () => {
    expect(podeLigar({ textos1: [] })).toEqual({ ok: false, motivo: MSG_ESCREVA_ANTES });
    expect(MSG_ESCREVA_ANTES).toBe('Escreva sua mensagem de cobrança antes de ligar');
    expect(podeLigar({ textos1: [OK] })).toEqual({ ok: true });
  });
});

describe('assinatura: texto da fila velho', () => {
  const base = { modo: 'meus_textos' as const, textos1: [OK], textos2: [], estilo: '' };
  it('muda com modo, textos e (só no modo IA) estilo', () => {
    const a = assinaturaTextos(base);
    expect(assinaturaTextos({ ...base })).toBe(a);
    expect(assinaturaTextos({ ...base, textos1: [OK, 'Olá, {nome}! Fico à disposição.'] })).not.toBe(a);
    expect(assinaturaTextos({ ...base, textos2: ['Olá, {nome}! Fico à disposição.'] })).not.toBe(a);
    expect(assinaturaTextos({ ...base, modo: 'ia_estilo' })).not.toBe(a);
    expect(assinaturaTextos({ ...base, estilo: 'formal' })).toBe(a); // estilo não conta no modo "meus textos"
    expect(assinaturaTextos({ ...base, modo: 'ia_estilo', estilo: 'formal' })).not.toBe(assinaturaTextos({ ...base, modo: 'ia_estilo', estilo: 'informal' }));
  });
  it('textoDaFilaDesatualizado: só quem está em "cobranca" e tem assinatura diferente ou nenhuma', () => {
    const config = normalizarConfigFollowup({ textos1: [OK] });
    const a = assinaturaTextos(config);
    expect(textoDaFilaDesatualizado({ estado: 'cobranca', cobrancaModelo: 'x', cobrancaAssinatura: a }, config)).toBe(false);
    expect(textoDaFilaDesatualizado({ estado: 'cobranca', cobrancaModelo: 'x', cobrancaAssinatura: 'outra' }, config)).toBe(true);
    expect(textoDaFilaDesatualizado({ estado: 'cobranca', cobrancaModelo: 'x' }, config)).toBe(true);
    expect(textoDaFilaDesatualizado({ estado: 'cobranca', cobrancaModelo: null, cobrancaAssinatura: a }, config)).toBe(true);
    expect(textoDaFilaDesatualizado({ estado: 'monitorando', cobrancaModelo: null, cobrancaAssinatura: null }, config)).toBe(false);
  });
});

describe('textosDaTentativa e rótulos', () => {
  it('2ª cobrança usa os textos da 2ª; sem eles, os da 1ª', () => {
    const c = { modo: 'meus_textos' as const, textos1: ['um'], textos2: ['dois'], estilo: '' };
    expect(textosDaTentativa(c, 1)).toEqual(['um']);
    expect(textosDaTentativa(c, 2)).toEqual(['dois']);
    expect(textosDaTentativa({ ...c, textos2: [] }, 2)).toEqual(['um']);
  });
  it('rótulos na fila: "seu texto" / "IA no seu estilo"; o legado é marcado para refazer', () => {
    expect(rotuloOrigem('meus_textos')).toBe('seu texto');
    expect(rotuloOrigem('ia_estilo')).toBe('IA no seu estilo');
    expect(rotuloOrigem('modelo')).toMatch(/refeito/);
    expect(rotuloOrigem(null)).toMatch(/refeito/);
  });
});

describe('rascunho do editor', () => {
  const salvo = normalizarConfigFollowup({ textos1: [OK], textos2: [] });
  it('começa com a config salva (e uma linha vazia se não há texto)', () => {
    expect(rascunhoDeConfig(salvo).textos1).toEqual([OK]);
    expect(rascunhoDeConfig(CONFIG_FOLLOWUP_PADRAO).textos1).toEqual(['']);
    expect(rascunhoMudou(rascunhoDeConfig(salvo), salvo)).toBe(false);
  });
  it('detecta mudança de texto, de modo e de estilo (no modo IA)', () => {
    const r = rascunhoDeConfig(salvo);
    expect(rascunhoMudou({ ...r, textos1: [OK, 'Olá, {nome}! Fico à disposição.'] }, salvo)).toBe(true);
    expect(rascunhoMudou({ ...r, modo: 'ia_estilo' }, salvo)).toBe(true);
    expect(rascunhoMudou({ ...r, textos1: [OK, '   '] }, salvo)).toBe(false); // linha vazia não conta
  });
  it('erros por linha, repetidos e estilo > 500', () => {
    const e = errosDoRascunho({ modo: 'ia_estilo', textos1: [OK, 'sem marcador', OK, ''], textos2: [], estilo: 'a'.repeat(501) });
    expect(e.textos1[0]).toEqual([]);
    expect(e.textos1[1].join(' ')).toMatch(/\{nome\}/);
    expect(e.textos1[2].join(' ')).toMatch(/repetido/);
    expect(e.textos1[3]).toEqual([]);
    expect(e.estilo).toMatch(/500/);
    expect(e.ok).toBe(false);
    expect(errosDoRascunho({ modo: 'meus_textos', textos1: [OK], textos2: [], estilo: '' }).ok).toBe(true);
  });
  it('prévia com nome fictício, ignorando linhas vazias', () => {
    expect(previaDosTextos([OK, ' '])).toEqual(['Oi, Maria! Passando para saber se você viu minha mensagem.']);
  });
});
