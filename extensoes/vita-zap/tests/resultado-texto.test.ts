// Resultado por texto do dono (0.7.60): regras puras, banco (loja nova, aditiva) e a migração v4 → v5 sem perder nada.

import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { abrirBanco, listarResultadosTexto, registrarEnvioDoTexto, registrarRespostaDoTexto, listarNaoEnviar, listarEnvios, lerConfig } from '../src/shared/banco';
import {
  AMOSTRA_MINIMA,
  acharEnvioDaResposta,
  comResposta,
  hashDoModelo,
  hashDoTextoDoDono,
  idsParaPodarEnvios,
  resultadoDoTexto,
  rotuloDoResultado,
  type EnvioDoTexto,
} from '../src/shared/resultado-texto';

let n = 0;
const envio = (id: string, hash: string, extra: Partial<EnvioDoTexto> = {}): EnvioDoTexto => ({ id, hash, chave: id.split(':')[1] ?? id, enviadoEm: '2026-11-17T13:00:00.000Z', respondeuEm: null, ...extra });
const H = hashDoTextoDoDono('Oi, {nome}! Tudo bem?');

describe('o texto é identificado pelo hash do conteúdo', () => {
  it('o texto do editor ({nome}) e o modelo da campanha ({primeiroNome}) têm o mesmo hash; espaços a mais não contam', () => {
    expect(hashDoTextoDoDono('Oi, {nome}!  Tudo   bem?')).toBe(hashDoModelo('Oi, {primeiroNome}! Tudo bem?'));
    expect(hashDoTextoDoDono('Oi, {Nome}! Tudo bem?')).toBe(hashDoTextoDoDono('Oi, {nome}! Tudo bem?'));
  });
  it('EDITAR o texto muda o hash: a contagem dele recomeça do zero', () => {
    const envios = [envio('c:a', H, { respondeuEm: '2026-11-18T10:00:00.000Z' }), envio('c:b', H)];
    expect(resultadoDoTexto(envios, H)).toMatchObject({ enviados: 2, responderam: 1 });
    expect(resultadoDoTexto(envios, hashDoTextoDoDono('Oi, {nome}! Tudo bem??'))).toMatchObject({ enviados: 0, responderam: 0, percentual: null });
  });
});

describe('contagem, taxa e amostra pequena', () => {
  it('"enviado 42 · respondeu 9 (21%)" e aviso de amostra pequena abaixo de 20', () => {
    const grande = [...Array.from({ length: 42 }, (_, i) => envio(`c:${i}`, H, i < 9 ? { respondeuEm: '2026-11-18T10:00:00.000Z' } : {}))];
    const r = resultadoDoTexto(grande, H);
    expect(r).toEqual({ enviados: 42, responderam: 9, percentual: 21, amostraPequena: false });
    expect(rotuloDoResultado(r)).toBe('enviado 42 · respondeu 9 (21%)');
    const pequeno = resultadoDoTexto(grande.slice(0, AMOSTRA_MINIMA - 1), H);
    expect(pequeno.amostraPequena).toBe(true);
    expect(resultadoDoTexto(grande.slice(0, AMOSTRA_MINIMA), H).amostraPequena).toBe(false);
  });
  it('sem envio: sem rótulo (o editor mostra "ainda sem envios")', () => {
    expect(rotuloDoResultado(resultadoDoTexto([], H))).toBeNull();
  });
});

describe('a resposta só conta uma vez e só dentro de 7 dias', () => {
  const e = envio('c:ana', H, { enviadoEm: '2026-11-10T13:00:00.000Z' });
  it('dentro da janela marca; fora não; já marcada não muda', () => {
    expect(comResposta(e, new Date('2026-11-17T13:00:00Z'))?.respondeuEm).toBe('2026-11-17T13:00:00.000Z'); // 7 dias: vale
    expect(comResposta(e, new Date('2026-11-18T13:00:00Z'))).toBeNull(); // 8 dias: não
    expect(comResposta({ ...e, respondeuEm: '2026-11-11T00:00:00.000Z' }, new Date('2026-11-12T00:00:00Z'))).toBeNull();
  });
  it('acha o envio pelo id exato; senão pelo mesmo contato mais perto da referência (até 15 min)', () => {
    const lista = [envio('c1:ana', H, { enviadoEm: '2026-11-10T13:00:00.000Z' }), envio('c2:ana', H, { enviadoEm: '2026-11-13T13:00:00.000Z' }), envio('c2:bia', H, { enviadoEm: '2026-11-13T13:00:00.000Z' })];
    expect(acharEnvioDaResposta(lista, { id: 'c1:ana', chave: 'ana', referencia: '2026-11-13T13:00:00.000Z' })?.id).toBe('c1:ana');
    expect(acharEnvioDaResposta(lista, { chave: 'ana', referencia: '2026-11-13T13:00:20.000Z' })?.id).toBe('c2:ana');
    expect(acharEnvioDaResposta(lista, { chave: 'ana', referencia: '2026-11-13T14:00:00.000Z' })).toBeNull();
    expect(acharEnvioDaResposta(lista, { chave: 'zé', referencia: '2026-11-13T13:00:00.000Z' })).toBeNull();
    expect(acharEnvioDaResposta(lista, { chave: 'ana', referencia: 'lixo' })).toBeNull();
  });
  it('poda os registros velhos demais', () => {
    expect(idsParaPodarEnvios([envio('c:velho', H, { enviadoEm: '2026-06-01T00:00:00.000Z' }), envio('c:novo', H)], new Date('2026-11-18T12:00:00Z'))).toEqual(['c:velho']);
  });
});

describe('banco: loja nova e aditiva', () => {
  it('registra o envio uma vez (idempotente), marca a resposta e poda os velhos', async () => {
    const db = await abrirBanco(`rt-${Date.now()}-${(n += 1)}`);
    const agora = new Date('2026-11-18T12:00:00Z');
    expect(await registrarEnvioDoTexto(db, envio('c:ana', H), agora)).toBe(true);
    expect(await registrarEnvioDoTexto(db, envio('c:ana', H), agora)).toBe(false);
    expect(await registrarEnvioDoTexto(db, envio('c:velho', H, { enviadoEm: '2026-06-01T00:00:00.000Z' }), agora)).toBe(true);
    expect((await listarResultadosTexto(db)).map((x) => x.id)).toEqual(['c:ana']); // o velho foi podado
    expect(await registrarRespostaDoTexto(db, { id: 'c:ana', chave: 'ana', referencia: '2026-11-17T13:00:00.000Z' }, agora)).toBe(true);
    expect(await registrarRespostaDoTexto(db, { id: 'c:ana', chave: 'ana', referencia: '2026-11-17T13:00:00.000Z' }, agora)).toBe(false); // uma vez só
    expect((await listarResultadosTexto(db))[0].respondeuEm).toBe(agora.toISOString());
  });

  it('IndexedDB v4 → v5: um banco v4 com dados de TODAS as lojas abre na v5 com tudo intacto e SÓ a loja nova (vazia) a mais', async () => {
    const nome = `migra5-${Date.now()}-${(n += 1)}`;
    const v4 = await openDB(nome, 4, {
      upgrade(db) {
        db.createObjectStore('contatos', { keyPath: 'chave' });
        db.createObjectStore('campanhas', { keyPath: 'id' });
        const e = db.createObjectStore('envios', { keyPath: 'id' });
        e.createIndex('porChave', 'chave');
        e.createIndex('porCampanha', 'campanhaId');
        db.createObjectStore('naoEnviar', { keyPath: 'chave' });
        db.createObjectStore('config', { keyPath: 'id' });
        db.createObjectStore('followups', { keyPath: 'id' });
        db.createObjectStore('followupConfig', { keyPath: 'id' });
        db.createObjectStore('reativacoes', { keyPath: 'chave' });
        db.createObjectStore('julgamentos', { keyPath: 'id' });
        db.createObjectStore('acoesIa', { keyPath: 'id' });
      },
    });
    await v4.put('contatos', { chave: 'ana', nome: 'Ana' });
    await v4.put('envios', { id: 'c1:ana', campanhaId: 'c1', chave: 'ana', nome: 'Ana', enviadoEm: '2026-11-01T12:00:00.000Z', textoConfere: true });
    await v4.put('naoEnviar', { chave: 'x', nome: 'X', desde: '2026-11-01', motivo: 'sair' }); // registro ANTIGO: sem origem nem crm
    await v4.put('config', { id: 'politica', valor: { tetoDiario: 20, intervaloMinSeg: 60, intervaloMaxSeg: 120, numeroComMaisDe30Dias: true } });
    await v4.put('julgamentos', { id: 'j1' });
    await v4.put('acoesIa', { id: 'a1' });
    v4.close();

    const db = await abrirBanco(nome);
    expect([...db.objectStoreNames].sort()).toEqual(['acoesIa', 'campanhas', 'config', 'contatos', 'envios', 'followupConfig', 'followups', 'julgamentos', 'naoEnviar', 'reativacoes', 'resultadosTexto']);
    expect(await db.getAll('resultadosTexto')).toEqual([]);
    expect(await db.getAll('contatos')).toHaveLength(1);
    expect(await listarEnvios(db)).toHaveLength(1);
    expect((await db.getAllFromIndex('envios', 'porChave', 'ana')).length).toBe(1);
    expect(await listarNaoEnviar(db)).toEqual([{ chave: 'x', nome: 'X', desde: '2026-11-01', motivo: 'sair' }]);
    expect((await lerConfig(db)).tetoDiario).toBe(20);
    expect(await db.getAll('julgamentos')).toHaveLength(1);
    expect(await db.getAll('acoesIa')).toHaveLength(1);
    db.close();
    // Reabrir na mesma versão não muda nada.
    const de_novo = await abrirBanco(nome);
    expect(await listarEnvios(de_novo)).toHaveLength(1);
  });
});
