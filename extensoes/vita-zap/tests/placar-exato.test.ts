// Placar (achado 07): a liberação compara a proporção EXATA (acertos/total >= 0,9); o arredondamento só vale para mostrar.
// E a aprovação do placar vale para as Orientações para a IA da época: mudou o texto, a aprovação anterior é cancelada.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { acertoSuficiente, avaliarLiberacao, hashDasOrientacoes, julgar, novaDecisao, percentualParaExibir, situacaoDaAprovacao, type Julgamento } from '../src/shared/automaticos';
import { abrirBanco, lerConfigFollowup, lerConfigReativacao, lerMarcoOrientacoes, salvarConfigFollowup, salvarConfigReativacao, salvarJulgamento } from '../src/shared/banco';
import { CONFIG_FOLLOWUP_PADRAO } from '../src/shared/followup';
import { CONFIG_REATIVACAO_PADRAO } from '../src/shared/reativacao';
import { carregarVisao, definirModo, sincronizarOrientacoes } from '../src/sidepanel/automaticos-motor';

const AGORA = new Date('2026-11-17T13:00:00.000Z');
const TEXTO = ['Oi, {nome}! Passando para saber se viu minha mensagem.'];
let n = 0;
const novoBanco = () => abrirBanco(`placar-${Date.now()}-${(n += 1)}`);

/** `total` julgamentos de "cobrar", `acertos` deles certos, julgados em `quando`. */
function julgados(total: number, acertos: number, quando: Date = AGORA, prefixo = 'j'): Julgamento[] {
  return Array.from({ length: total }, (_, i) => julgar(novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: `${prefixo}${i}`, nome: `C${i}`, contexto: 'x', resumo: 'r' }, quando), i < acertos ? 'acertou' : 'errou', new Date(quando.getTime() + i)));
}

describe('proporção exata, arredondamento só na exibição', () => {
  it('35 de 39 (89,7%) REPROVA, mesmo arredondando para 90%', () => {
    const l = avaliarLiberacao(julgados(39, 35));
    expect(l.percentual).toBe(90); // o arredondado existe, mas não decide
    expect(l.liberado).toBe(false);
    expect(l.motivo).toMatch(/89,7%.*mínimo é 90%/);
    expect(l.percentualTexto).toBe('89,7');
  });

  it('27 de 30 (90%) APROVA', () => {
    expect(avaliarLiberacao(julgados(30, 27))).toMatchObject({ liberado: true, percentual: 90, percentualTexto: '90', motivo: null });
  });

  it('29 de 29 (100%) reprova: falta o mínimo de 30 julgamentos', () => {
    expect(avaliarLiberacao(julgados(29, 29))).toMatchObject({ liberado: false, faltam: 1 });
  });

  it('26 de 30 (86,7%) reprova', () => {
    const l = avaliarLiberacao(julgados(30, 26));
    expect(l.liberado).toBe(false);
    expect(l.motivo).toMatch(/87%.*mínimo é 90%/);
  });

  it('acertoSuficiente em inteiros: 9/10 sim, 89/99 não, 0 de 0 não; exibição trunca só quando o arredondado enganaria', () => {
    expect(acertoSuficiente(9, 10)).toBe(true);
    expect(acertoSuficiente(8, 9)).toBe(false); // 88,9
    expect(acertoSuficiente(0, 0)).toBe(false);
    expect(acertoSuficiente(89, 99)).toBe(false); // 89,899
    expect(percentualParaExibir(89, 99)).toBe('89,8');
    expect(percentualParaExibir(26, 30)).toBe('87');
    expect(percentualParaExibir(0, 0)).toBeNull();
  });
});

describe('a aprovação vale para as Orientações da época', () => {
  async function aprovadoComLegado() {
    const db = await novoBanco();
    await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: TEXTO, automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: TEXTO, automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
    for (const j of julgados(30, 28)) await salvarJulgamento(db, j);
    return db;
  }

  it('hash das Orientações ignora espaços de borda e linhas em branco repetidas', () => {
    expect(hashDasOrientacoes('  Trate por você.  ')).toBe(hashDasOrientacoes('Trate por você.'));
    expect(hashDasOrientacoes('a\n\n\n\nb')).toBe(hashDasOrientacoes('a\n\nb'));
    expect(hashDasOrientacoes('Trate por você.')).not.toBe(hashDasOrientacoes('Trate por senhor.'));
    expect(hashDasOrientacoes('')).toBe(hashDasOrientacoes(undefined));
  });

  it('aprovação de registro antigo (sem hash) aparece como "anterior" e continua valendo enquanto as Orientações não mudam', async () => {
    const db = await aprovadoComLegado();
    const v = await carregarVisao(db, AGORA, 'Trate por você.');
    expect(v.aprovacao).toBe('anterior');
    expect(v.followup).toMatchObject({ automatico: 'ligado', placarAprovado: true });
    expect(await lerMarcoOrientacoes(db)).toMatchObject({ legado: true, desde: null, orientacoesHash: hashDasOrientacoes('Trate por você.') });
    // mesma Orientação (só espaços diferentes): nada muda
    const v2 = await carregarVisao(db, AGORA, '  Trate por você.\n');
    expect(v2.aprovacao).toBe('anterior');
    expect(v2.followup.automatico).toBe('ligado');
  });

  it('mudou a Orientação: a aprovação é INVALIDADA, quem estava Ligado cai para Observação e o placar recomeça', async () => {
    const db = await aprovadoComLegado();
    await carregarVisao(db, AGORA, 'Trate por você.');
    const depois = new Date(AGORA.getTime() + 3_600_000);
    const v = await carregarVisao(db, depois, 'Nunca falar de preço.');
    expect(v.aprovacao).toBe('nunca');
    expect(v.followup).toMatchObject({ automatico: 'observacao', placarAprovado: false });
    expect(v.reativacao).toMatchObject({ automatico: 'observacao', placarAprovado: false });
    expect(v.placarDesde).toBe(depois.toISOString());
    expect(v.liberacao).toMatchObject({ julgados: 0, faltam: 30, liberado: false }); // os 30 julgamentos antigos não valem para as regras novas
    expect(await lerConfigFollowup(db)).toMatchObject({ automatico: 'observacao', placarAprovado: false });
    expect(await lerConfigReativacao(db)).toMatchObject({ automatico: 'observacao', placarAprovado: false });
  });

  it('religar exige novo placar com as Orientações novas; depois a aprovação fica "válida" e amarrada ao hash', async () => {
    const db = await aprovadoComLegado();
    await carregarVisao(db, AGORA, 'Trate por você.');
    const depois = new Date(AGORA.getTime() + 3_600_000);
    const r1 = await definirModo(db, 'ligado', { confirmouRisco: true, orientacoes: 'Nunca falar de preço.', agora: depois });
    expect(r1).toMatchObject({ ok: false });
    expect((r1 as { motivo: string }).motivo).toMatch(/Orientações para a IA mudaram.*Faltam 30/s);

    for (const j of julgados(30, 27, new Date(depois.getTime() + 60_000), 'novo')) await salvarJulgamento(db, j);
    expect(await definirModo(db, 'ligado', { confirmouRisco: true, orientacoes: 'Nunca falar de preço.', agora: depois })).toEqual({ ok: true, modo: 'ligado' });
    const v = await carregarVisao(db, depois, 'Nunca falar de preço.');
    expect(v.aprovacao).toBe('valida');
    expect(await lerMarcoOrientacoes(db)).toMatchObject({ legado: false, orientacoesHash: hashDasOrientacoes('Nunca falar de preço.') });

    // mudar de novo cancela de novo
    const v3 = await carregarVisao(db, new Date(depois.getTime() + 9_000_000), 'Outra regra.');
    expect(v3.aprovacao).toBe('nunca');
    expect(v3.followup.automatico).toBe('observacao');
  });

  it('sem aprovação nada é invalidado; só o hash é guardado (o texto das Orientações não vai para o banco)', async () => {
    const db = await novoBanco();
    const a = await sincronizarOrientacoes(db, 'primeira', AGORA);
    expect(a.invalidou).toBe(false);
    const b = await sincronizarOrientacoes(db, 'segunda', new Date(AGORA.getTime() + 1000));
    expect(b.invalidou).toBe(false); // nada estava aprovado
    expect(b.marco.desde).toBe(new Date(AGORA.getTime() + 1000).toISOString());
    expect(JSON.stringify(await lerMarcoOrientacoes(db))).not.toContain('segunda');
  });

  it('situacaoDaAprovacao', () => {
    const h = hashDasOrientacoes('x');
    expect(situacaoDaAprovacao(false, null, h)).toBe('nunca');
    expect(situacaoDaAprovacao(true, null, h)).toBe('anterior');
    expect(situacaoDaAprovacao(true, { orientacoesHash: h, desde: null, legado: true }, h)).toBe('anterior');
    expect(situacaoDaAprovacao(true, { orientacoesHash: h, desde: null, legado: false }, h)).toBe('valida');
    expect(situacaoDaAprovacao(true, { orientacoesHash: 'outro', desde: null, legado: false }, h)).toBe('invalidada');
  });
});
