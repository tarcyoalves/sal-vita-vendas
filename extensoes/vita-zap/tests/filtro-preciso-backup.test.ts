// 0.7.63: os campos novos do filtro (palavraInteira, regiao) sobrevivem ao backup; backup antigo (sem eles) continua valendo.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, exportarTudo, importarTudo, listarCampanhas, salvarCampanha } from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { lerBackup } from '../src/shared/exportar';
import { FILTROS_PADRAO } from '../src/shared/filtros';

const AGORA = new Date('2026-11-26T15:00:00Z');
let n = 0;

function campanha(filtros: object): Campanha {
  return {
    id: 'c1',
    nome: 'Paraná',
    criadaEm: AGORA.toISOString(),
    aprovadaEm: null,
    termoBusca: 'CLIENTE',
    filtros: filtros as Campanha['filtros'],
    modelos: ['Oi'],
    status: 'pausada',
    motivoPausa: null,
    itens: [],
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
    emVoo: null,
  } as Campanha;
}

describe('backup com o filtro de palavra inteira e região', () => {
  it('ida e volta mantém palavraInteira e regiao', async () => {
    const origem = await abrirBanco(`bk063-${(n += 1)}`);
    await salvarCampanha(origem, campanha({ ...FILTROS_PADRAO, contem: ['CLIENTE', 'PR'], palavraInteira: true, regiao: ['PR', '41', '45'] }));
    const lido = lerBackup(JSON.stringify(await exportarTudo(origem, AGORA, '0.7.63')));
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    const destino = await abrirBanco(`bk063-${(n += 1)}`);
    await importarTudo(destino, lido.backup, 'mesclar');
    const [c] = await listarCampanhas(destino);
    expect(c.filtros.palavraInteira).toBe(true);
    expect(c.filtros.regiao).toEqual(['PR', '41', '45']);
  });

  it('backup antigo (filtro sem os campos) é aceito e continua sem eles (comportamento antigo)', async () => {
    const origem = await abrirBanco(`bk063-${(n += 1)}`);
    const antigo: Record<string, unknown> = { ...FILTROS_PADRAO, contem: ['PR'] };
    delete antigo.palavraInteira;
    delete antigo.regiao;
    await salvarCampanha(origem, campanha(antigo));
    const lido = lerBackup(JSON.stringify({ formato: 'vita-zap-backup', versao: 1, exportadoEm: AGORA.toISOString(), contatos: [], campanhas: await listarCampanhas(origem), envios: [], naoEnviar: [], config: null }));
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(lido.backup.campanhas[0].filtros.palavraInteira).toBeUndefined();
    expect(lido.backup.campanhas[0].filtros.regiao).toBeUndefined();
  });

  it('regiao com item que não é texto é recusada', () => {
    const c = campanha({ ...FILTROS_PADRAO, regiao: [45] });
    const lido = lerBackup(JSON.stringify({ formato: 'vita-zap-backup', versao: 1, exportadoEm: AGORA.toISOString(), contatos: [], campanhas: [c], envios: [], naoEnviar: [], config: null }));
    expect(lido.ok).toBe(false);
  });
});
