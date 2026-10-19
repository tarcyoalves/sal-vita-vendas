import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  abrirBanco,
  exportarTudo,
  importarTudo,
  lerConfig,
  listarCampanhas,
  listarContatos,
  listarEnvios,
  listarNaoEnviar,
  marcarNaoEnviar,
  registrarEnvio,
  salvarCampanha,
  salvarConfig,
  salvarContatos,
} from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { linhasParaContatos } from '../src/shared/contatos';
import { celulaCsv, csvDasCampanhas, gerarCsv, lerBackup } from '../src/shared/exportar';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import { TETO_DIARIO_MAXIMO } from '../src/shared/constantes';

let n = 0;
const novoBanco = () => abrirBanco(`teste-${Date.now()}-${(n += 1)}`);
const AGORA = new Date('2026-10-19T15:00:00Z');

function campanha(id = 'c1'): Campanha {
  return {
    id,
    nome: 'Reativação; outubro',
    criadaEm: AGORA.toISOString(),
    aprovadaEm: AGORA.toISOString(),
    termoBusca: 'CLIENTE',
    filtros: FILTROS_PADRAO,
    modelos: ['Oi {primeiroNome}'],
    status: 'pausada',
    motivoPausa: null,
    itens: [
      { chave: 'joao cliente', nome: 'João CLIENTE', primeiroNome: 'João', modelo: 'Oi {primeiroNome}', status: 'enviado', motivo: null, atualizadoEm: AGORA.toISOString() },
      { chave: '=hack', nome: '=HYPERLINK("x")', primeiroNome: 'X', modelo: 'Oi {primeiroNome}', status: 'pendente', motivo: null, atualizadoEm: null },
    ],
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
  };
}

describe('IndexedDB', () => {
  it('grava e lista contatos, campanhas, envios e não-enviar', async () => {
    const db = await novoBanco();
    await salvarContatos(db, linhasParaContatos([{ nome: 'João CLIENTE', rotuloData: 'Ontem', posicao: 0, pareceGrupo: false }], AGORA));
    await salvarCampanha(db, campanha());
    await marcarNaoEnviar(db, { chave: 'x', nome: 'X', desde: AGORA.toISOString(), motivo: 'não enviar mais' });
    expect(await listarContatos(db)).toHaveLength(1);
    expect(await listarCampanhas(db)).toHaveLength(1);
    expect(await listarNaoEnviar(db)).toHaveLength(1);
  });

  it('envio é único por contato por campanha', async () => {
    const db = await novoBanco();
    const e = { campanhaId: 'c1', chave: 'joao', nome: 'João', enviadoEm: AGORA.toISOString(), textoConfere: true };
    expect(await registrarEnvio(db, e)).toBe(true);
    expect(await registrarEnvio(db, { ...e, enviadoEm: new Date().toISOString() })).toBe(false);
    expect(await registrarEnvio(db, { ...e, campanhaId: 'c2' })).toBe(true);
    const envios = await listarEnvios(db);
    expect(envios.map((x) => x.id).sort()).toEqual(['c1:joao', 'c2:joao']);
    expect(envios.find((x) => x.id === 'c1:joao')?.enviadoEm).toBe(AGORA.toISOString());
  });

  it('configuração gravada respeita os limites', async () => {
    const db = await novoBanco();
    expect((await lerConfig(db)).tetoDiario).toBe(30);
    await salvarConfig(db, { tetoDiario: 999, intervaloMinSeg: 1, intervaloMaxSeg: 2, numeroComMaisDe30Dias: true });
    const c = await lerConfig(db);
    expect(c.tetoDiario).toBe(TETO_DIARIO_MAXIMO);
    expect(c.intervaloMinSeg).toBe(60);
  });
});

describe('backup JSON', () => {
  it('exporta e importa (substituir) sem perder nada', async () => {
    const origem = await novoBanco();
    await salvarCampanha(origem, campanha());
    await registrarEnvio(origem, { campanhaId: 'c1', chave: 'joao cliente', nome: 'João CLIENTE', enviadoEm: AGORA.toISOString(), textoConfere: true });
    await marcarNaoEnviar(origem, { chave: 'x', nome: 'X', desde: AGORA.toISOString(), motivo: 'não é cliente' });
    const texto = JSON.stringify(await exportarTudo(origem, AGORA));

    const lido = lerBackup(texto);
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    const destino = await novoBanco();
    await salvarCampanha(destino, campanha('outra'));
    await importarTudo(destino, lido.backup, 'substituir');
    expect((await listarCampanhas(destino)).map((c) => c.id)).toEqual(['c1']);
    expect(await listarEnvios(destino)).toHaveLength(1);
    expect(await listarNaoEnviar(destino)).toHaveLength(1);
  });

  it('mesclar mantém o que já existia', async () => {
    const db = await novoBanco();
    await salvarCampanha(db, campanha('local'));
    const b = await exportarTudo(await novoBanco(), AGORA);
    await importarTudo(db, { ...b, campanhas: [campanha('importada')] }, 'mesclar');
    expect((await listarCampanhas(db)).map((c) => c.id).sort()).toEqual(['importada', 'local']);
  });

  it('recusa arquivo inválido', () => {
    expect(lerBackup('não é json')).toMatchObject({ ok: false });
    expect(lerBackup('{"formato":"outro"}')).toMatchObject({ ok: false });
    const r = lerBackup(JSON.stringify({ formato: 'vita-zap-backup', versao: 1, exportadoEm: 'x', contatos: [{}], campanhas: [], envios: [], naoEnviar: [], config: null }));
    expect(r.ok).toBe(false);
  });
});

describe('CSV', () => {
  it('escapa ; aspas, quebra de linha e fórmula', () => {
    expect(celulaCsv('a;b')).toBe('"a;b"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv('=SOMA(A1)')).toBe("'=SOMA(A1)");
    expect(celulaCsv('+5584')).toBe("'+5584");
    expect(celulaCsv(null)).toBe('');
    expect(celulaCsv(3)).toBe('3');
  });

  it('gera CSV com BOM e uma linha por contato', () => {
    const csv = csvDasCampanhas(
      [campanha()],
      [{ id: 'c1:joao cliente', campanhaId: 'c1', chave: 'joao cliente', nome: 'João CLIENTE', enviadoEm: AGORA.toISOString(), textoConfere: true }],
    );
    expect(csv.startsWith('﻿campanha;')).toBe(true);
    const linhas = csv.trim().split('\r\n');
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toContain('"Reativação; outubro"');
    expect(linhas[1]).toContain('enviado');
    expect(linhas[1]).toContain(AGORA.toISOString());
    expect(linhas[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(gerarCsv(['a'], [])).toBe('﻿a\r\n');
  });
});
