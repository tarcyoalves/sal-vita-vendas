// Lógica compartilhada da 0.2: quebra de linha (A8), textos de aviso/grupo (I1/A12), intervalo
// global (P1), JID no envio (A6), banco v2 (A2) e protocolo.

import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { ehTextoDeFalha, ehTextoDeRestricao, previaTemPrefixoDeGrupo } from '../src/shared/avisos';
import { abrirBanco, gravarEmAndamento, lerEmAndamento, limparEmAndamento, salvarContatos } from '../src/shared/banco';
import { lerBackup } from '../src/shared/exportar';
import { ehEventoConteudo } from '../src/shared/mensagens';
import { ultimoEnvioParaIntervalo } from '../src/shared/politica';
import { validarModelo, validarModelos } from '../src/shared/texto';

describe('A8 — validarModelo rejeita quebra de linha', () => {
  it.each([['Oi\nTudo bem?'], ['Oi\r\nTudo bem?'], ['Oi\rTudo'], ['Oi Tudo'], ['Linha 1\n\nLinha 2']])('rejeita %j', (texto) => {
    const erros = validarModelo(texto);
    expect(erros).toHaveLength(1);
    expect(erros[0]).toMatch(/quebra de linha não é suportada nesta versão \(0\.2\)/);
    expect(erros[0]).toMatch(/uma linha só/);
  });

  it('quebra só nas pontas (aparada) e texto corrido passam', () => {
    expect(validarModelo('  Oi {primeiroNome}, tudo bem?\n')).toEqual([]);
    expect(validarModelo('Oi, tudo bem? Aqui é da Sal Vita.')).toEqual([]);
  });

  it('o erro aparece na validação do texto base e das variações', () => {
    const r = validarModelos('Oi\nAna', ['Olá', 'Bom\ndia']);
    expect(r.erros.some((e) => e.startsWith('Texto base:') && /quebra de linha/.test(e))).toBe(true);
    expect(r.erros.some((e) => e.startsWith('Variação 2:') && /quebra de linha/.test(e))).toBe(true);
  });
});

describe('textos de aviso do WhatsApp (I1)', () => {
  it.each([
    'Não foi possível enviar a mensagem',
    "Couldn't send message",
    'Could not send the message',
    'Não conseguimos enviar sua mensagem',
  ])('falha de envio: %s', (t) => expect(ehTextoDeFalha(t)).toBe(true));

  it.each(['Telefone não conectado', 'Phone not connected', 'Sua conta está restrita', 'Your account is restricted', 'Restrição temporária'])(
    'restrição/desconexão: %s',
    (t) => expect(ehTextoDeRestricao(t)).toBe(true),
  );

  it.each(['Deseja sair do grupo?', 'Copiar link', 'Mensagem apagada'])('texto comum não é aviso: %s', (t) => {
    expect(ehTextoDeFalha(t)).toBe(false);
    expect(ehTextoDeRestricao(t)).toBe(false);
  });
});

describe('prévia com prefixo de grupo (A12)', () => {
  it.each([
    ['Maria: bom dia', true],
    ['Maria Souza: bom dia', true],
    ['‎Pedro: oi', true],
    ['Você: oi', false],
    ['voce: oi', false],
    ['You: ok', false],
    ['bom dia', false],
    ['14:30: chegando', false],
    ['http://x.com', false],
    [': oi', false],
  ])('%j → %s', (previa, esperado) => expect(previaTemPrefixoDeGrupo(previa)).toBe(esperado));
});

describe('P1 — último envio GLOBAL para o intervalo', () => {
  const camp = { ultimoEnvioEm: '2026-10-19T13:00:00.000Z', intervaloAtualSeg: 90 };

  it('sem envios em lugar nenhum: nada', () => {
    expect(ultimoEnvioParaIntervalo([], { ultimoEnvioEm: null, intervaloAtualSeg: null })).toEqual({ ultimoEnvioEm: null, intervaloAtualSeg: null });
  });

  it('o último é da própria campanha: mantém o intervalo sorteado', () => {
    expect(ultimoEnvioParaIntervalo([{ enviadoEm: '2026-10-19T12:00:00.000Z' }, { enviadoEm: camp.ultimoEnvioEm }], camp)).toEqual(camp);
  });

  it('o último é de OUTRA campanha (mais recente): usa a data dele e o mínimo da política', () => {
    expect(ultimoEnvioParaIntervalo([{ enviadoEm: '2026-10-19T13:00:45.000Z' }], camp)).toEqual({
      ultimoEnvioEm: '2026-10-19T13:00:45.000Z',
      intervaloAtualSeg: null,
    });
  });

  it('campanha sem envio próprio, mas com envio global', () => {
    expect(ultimoEnvioParaIntervalo([{ enviadoEm: '2026-10-19T13:00:45.000Z' }], { ultimoEnvioEm: null, intervaloAtualSeg: null })).toEqual({
      ultimoEnvioEm: '2026-10-19T13:00:45.000Z',
      intervaloAtualSeg: null,
    });
  });

  it('datas inválidas são ignoradas', () => {
    expect(ultimoEnvioParaIntervalo([{ enviadoEm: 'lixo' }], camp)).toEqual(camp);
  });
});

describe('A6 — JID gravado no envio e no backup', () => {
  const base = {
    formato: 'vita-zap-backup',
    versao: 1,
    exportadoEm: '2026-10-19T12:00:00.000Z',
    contatos: [],
    campanhas: [],
    naoEnviar: [],
    config: null,
  };

  it('backup com jid no envio é aceito; sem jid (backup da 0.1) também', () => {
    const comJid = lerBackup(JSON.stringify({ ...base, envios: [{ id: 'c:a', campanhaId: 'c', chave: 'a', nome: 'A', enviadoEm: '2026-10-19T12:00:00.000Z', textoConfere: true, jid: '5584@c.us' }] }));
    expect(comJid.ok && comJid.backup.envios[0].jid).toBe('5584@c.us');
    const semJid = lerBackup(JSON.stringify({ ...base, envios: [{ id: 'c:a', campanhaId: 'c', chave: 'a', nome: 'A', enviadoEm: '2026-10-19T12:00:00.000Z', textoConfere: true }] }));
    expect(semJid.ok).toBe(true);
  });

  it('jid de tipo errado é recusado', () => {
    const r = lerBackup(JSON.stringify({ ...base, envios: [{ id: 'c:a', campanhaId: 'c', chave: 'a', nome: 'A', enviadoEm: 'x', textoConfere: true, jid: 5 }] }));
    expect(r.ok).toBe(false);
  });
});

describe('A2 — banco versão 2 (item em andamento)', () => {
  it('grava, lê e apaga o item em andamento, um por campanha', async () => {
    const db = await abrirBanco(`v2-${Date.now()}-a`);
    const item = { campanhaId: 'c1', chave: 'ana', nome: 'Ana', texto: 'Oi Ana', foto: ['x1', 'x2'], jid: '5584@c.us', iniciadoEm: '2026-10-19T13:00:00.000Z' };
    expect(await lerEmAndamento(db, 'c1')).toBeUndefined();
    await gravarEmAndamento(db, item);
    await gravarEmAndamento(db, { ...item, chave: 'bia', nome: 'Bia' });
    expect(await lerEmAndamento(db, 'c1')).toMatchObject({ chave: 'bia', foto: ['x1', 'x2'] });
    await gravarEmAndamento(db, { ...item, campanhaId: 'c2' });
    await limparEmAndamento(db, 'c1');
    expect(await lerEmAndamento(db, 'c1')).toBeUndefined();
    expect(await lerEmAndamento(db, 'c2')).toBeDefined();
  });

  it('um banco criado pela 0.1 (versão 1) sobe para a versão atual sem perder dados', async () => {
    const nome = `v1-${Date.now()}-b`;
    const antigo = await openDB(nome, 1, {
      upgrade(db) {
        db.createObjectStore('contatos', { keyPath: 'chave' });
        db.createObjectStore('campanhas', { keyPath: 'id' });
        const envios = db.createObjectStore('envios', { keyPath: 'id' });
        envios.createIndex('porChave', 'chave');
        envios.createIndex('porCampanha', 'campanhaId');
        db.createObjectStore('naoEnviar', { keyPath: 'chave' });
        db.createObjectStore('config', { keyPath: 'id' });
      },
    });
    await antigo.put('contatos', { chave: 'ana', nome: 'Ana' });
    antigo.close();

    const db = await abrirBanco(nome);
    expect(db.version).toBe(4);
    expect([...db.objectStoreNames].sort()).toEqual(['automatico', 'campanhas', 'config', 'contatos', 'diagnostico', 'emAndamento', 'envios', 'naoEnviar']);
    expect(await db.get('contatos', 'ana')).toMatchObject({ nome: 'Ana' });
    await salvarContatos(db, []); // continua utilizável
  });
});

describe('protocolo — novos eventos', () => {
  it.each(['vitaZap:envioDetectado', 'vitaZap:progressoVarredura', 'vitaZap:observacaoExpirou', 'vitaZap:aviso'])('reconhece %s', (tipo) => {
    expect(ehEventoConteudo({ tipo })).toBe(true);
  });
  it('ignora o que não é evento nosso', () => {
    expect(ehEventoConteudo({ tipo: 'outra:coisa' })).toBe(false);
    expect(ehEventoConteudo(null)).toBe(false);
    expect(ehEventoConteudo('x')).toBe(false);
  });
});
