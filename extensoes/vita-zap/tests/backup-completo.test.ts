// Backup completo (formato 2): todas as lojas, sem token, restauração em outro perfil e merge seguro de bloqueios.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  abrirBanco,
  exportarTudo,
  importarTudo,
  listarAcoesIa,
  listarCampanhas,
  listarEnvios,
  listarFollowups,
  listarJulgamentos,
  listarNaoEnviar,
  listarReativacoes,
  listarResultadosTexto,
  lerConfig,
  lerConfigFollowup,
  lerConfigReativacao,
  lerPedidos,
  marcarNaoEnviar,
  registrarEnvio,
  salvarAcaoIa,
  salvarCampanha,
  salvarConfig,
  salvarConfigFollowup,
  salvarConfigReativacao,
  salvarContatos,
  salvarFollowups,
  salvarJulgamento,
  salvarPedidos,
  salvarReativacoes,
  registrarEnvioDoTexto,
  listarContatos,
  type Banco,
} from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { linhasParaContatos } from '../src/shared/contatos';
import { lerBackup, type NaoEnviar } from '../src/shared/exportar';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { CHAVES_CRM } from '../src/shared/crm-remoto';
import { instalarChromeFalso } from './ajuda/chrome-falso';

let n = 0;
const novoBanco = () => abrirBanco(`backup-${Date.now()}-${(n += 1)}`);
const AGORA = new Date('2026-10-19T15:00:00Z');
const TOKEN = 'tok_FICTICIO_9f8e7d6c5b4a';

function campanha(id = 'c1', status: 'pendente' | 'enviado' = 'enviado'): Campanha {
  return {
    id,
    nome: 'Reativação',
    criadaEm: AGORA.toISOString(),
    aprovadaEm: AGORA.toISOString(),
    termoBusca: 'CLIENTE',
    filtros: FILTROS_PADRAO,
    modelos: ['Oi {primeiroNome}'],
    status: 'pausada',
    motivoPausa: null,
    itens: [{ chave: 'joao', nome: 'João', primeiroNome: 'João', modelo: 'Oi', status, motivo: null, atualizadoEm: AGORA.toISOString() }],
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
  };
}

// Registros das lojas novas (campos extras de propósito: nada deve ser descartado).
const registro = <T,>(r: Record<string, unknown>): T => r as unknown as T;

async function popular(db: Banco): Promise<void> {
  await salvarContatos(db, linhasParaContatos([{ nome: 'João CLIENTE', rotuloData: 'Ontem', posicao: 0, pareceGrupo: false }], AGORA));
  await salvarCampanha(db, campanha());
  await registrarEnvio(db, { campanhaId: 'c1', chave: 'joao', nome: 'João', enviadoEm: AGORA.toISOString(), textoConfere: true });
  await marcarNaoEnviar(db, { chave: 'x', nome: 'X', desde: AGORA.toISOString(), motivo: 'não é cliente', origem: 'manual' });
  await salvarConfig(db, { tetoDiario: 20, intervaloMinSeg: 70, intervaloMaxSeg: 120, numeroComMaisDe30Dias: true });
  await salvarFollowups(db, [registro({ id: 'c1:joao', campanhaId: 'c1', chave: 'joao', nome: 'João', primeiroNome: 'João', mensagemCampanha: 'Oi', enviadoEm: AGORA.toISOString(), estado: 'aguardando', motivo: null, verificadoEm: null, cobrancas: [], cobrancaModelo: null, cobrancaOrigem: null, campoNovo: 'preservar' })]);
  await salvarConfigFollowup(db, { ...(await lerConfigFollowup(db)), diasSemResposta: 9 } as never);
  await salvarConfigReativacao(db, { ...(await lerConfigReativacao(db)) });
  await salvarReativacoes(db, [registro({ chave: 'maria', nome: 'Maria', primeiroNome: 'Maria', telefone: null, estado: 'aguardando', motivo: null, etapa: 1, baseConversa: '2026-09-01', extra: 1 })]);
  await salvarJulgamento(db, registro({ id: 'j1', origem: 'followup', tipo: 'cobrar', chave: 'joao', nome: 'João', resumo: 'cobrar', texto: null, criadoEm: AGORA.toISOString(), veredito: 'acertou', motivo: null, decisaoCerta: null, julgadoEm: AGORA.toISOString() }));
  await salvarAcaoIa(db, registro({ id: 'a1', criadoEm: AGORA.toISOString(), resumo: 'fez algo' }));
  await registrarEnvioDoTexto(db, registro({ id: 't1', chave: 'joao', enviadoEm: AGORA.toISOString(), respondeuEm: null }), AGORA);
  await salvarPedidos(db, { ...(await lerPedidos(db)) });
}

async function fotografia(db: Banco) {
  return {
    contatos: await listarContatos(db),
    campanhas: await listarCampanhas(db),
    envios: await listarEnvios(db),
    naoEnviar: await listarNaoEnviar(db),
    config: await lerConfig(db),
    followups: await listarFollowups(db),
    cfgFollowup: await lerConfigFollowup(db),
    cfgReativacao: await lerConfigReativacao(db),
    pedidos: await lerPedidos(db),
    reativacoes: await listarReativacoes(db),
    julgamentos: await listarJulgamentos(db),
    acoesIa: await listarAcoesIa(db),
    resultadosTexto: await listarResultadosTexto(db),
  };
}

describe('backup completo (formato 2)', () => {
  it('tem versão explícita e a versão da extensão', async () => {
    const b = await exportarTudo(await novoBanco(), AGORA, '9.9.9');
    expect(b).toMatchObject({ formato: 'vita-zap-backup', versao: 2, geradoEm: AGORA.toISOString(), versaoExtensao: '9.9.9' });
    expect(Object.keys(b.lojas).sort()).toEqual(
      ['acoesIa', 'campanhas', 'config', 'contatos', 'envios', 'followupConfig', 'followups', 'julgamentos', 'naoEnviar', 'pedidos', 'reativacaoConfig', 'reativacoes', 'resultadosTexto'].sort(),
    );
  });

  it('restaura em outro perfil (banco vazio) loja por loja', async () => {
    const origem = await novoBanco();
    await popular(origem);
    const antes = await fotografia(origem);
    expect(antes.followups).toHaveLength(1);
    expect(antes.julgamentos).toHaveLength(1);
    const texto = JSON.stringify(await exportarTudo(origem, AGORA, '0.7.62'));

    const lido = lerBackup(texto);
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    const destino = await novoBanco();
    await importarTudo(destino, lido.backup, 'mesclar');
    const depois = await fotografia(destino);
    for (const loja of Object.keys(antes) as Array<keyof typeof antes>) expect(depois[loja], loja).toEqual(antes[loja]);
    expect((depois.followups[0] as unknown as { campoNovo: string }).campoNovo).toBe('preservar');
  });

  it('não leva token, senha nem sessão (nem o valor do token do teste)', async () => {
    const chrome = instalarChromeFalso();
    chrome.dados.set(CHAVES_CRM.conta, { token: TOKEN, usuario: { email: 'a@b.c' } });
    const db = await novoBanco();
    await popular(db);
    const json = JSON.stringify(await exportarTudo(db, AGORA, '1.0.0'), null, 2);
    const jsonCrm = await new RepositorioLocal().exportarJson();
    for (const texto of [json, jsonCrm]) {
      expect(texto).not.toContain(TOKEN);
      expect(texto).not.toMatch(/"[^"]*(token|senha|password|authorization|secret|cookie|bearer)[^"]*"\s*:/i);
      expect(texto).not.toContain('vz.crm.conta');
    }
  });

  it('importa o backup ANTIGO (formato 1, sem versão de loja) e não toca nas lojas novas', async () => {
    const antigo = JSON.stringify({
      formato: 'vita-zap-backup',
      versao: 1,
      exportadoEm: AGORA.toISOString(),
      contatos: [],
      campanhas: [campanha('velha')],
      envios: [],
      naoEnviar: [{ chave: 'y', nome: 'Y', desde: '2026-01-01T00:00:00.000Z', motivo: 'm' }],
      config: null,
    });
    const lido = lerBackup(antigo);
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    const db = await novoBanco();
    await salvarFollowups(db, [registro({ id: 'f', campanhaId: 'c', chave: 'k', nome: 'K', primeiroNome: 'K', mensagemCampanha: '', enviadoEm: AGORA.toISOString(), estado: 'aguardando', motivo: null, verificadoEm: null, cobrancas: [], cobrancaModelo: null, cobrancaOrigem: null })]);
    await importarTudo(db, lido.backup, 'substituir');
    expect((await listarCampanhas(db)).map((c) => c.id)).toEqual(['velha']);
    expect(await listarFollowups(db)).toHaveLength(1); // loja que o backup antigo não tem: intacta
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['y']);
  });

  it('recusa formato mais novo que o conhecido e formato 2 malformado', () => {
    expect(lerBackup(JSON.stringify({ formato: 'vita-zap-backup', versao: 3 }))).toMatchObject({ ok: false });
    expect(lerBackup(JSON.stringify({ formato: 'vita-zap-backup', versao: 2, geradoEm: 'x', versaoExtensao: '1', lojas: { contatos: [] } }))).toMatchObject({ ok: false });
  });
});

describe('restaurar backup mais velho preserva bloqueios e progresso', () => {
  const bloqueio = (o: Partial<NaoEnviar> & { chave: string }): NaoEnviar => ({ nome: o.chave, desde: '2026-10-01T00:00:00.000Z', motivo: 'm', ...o });

  async function backupVelho(parcial: { naoEnviar?: NaoEnviar[]; campanhas?: Campanha[]; envios?: Array<{ campanhaId: string; chave: string }> }) {
    const origem = await novoBanco();
    for (const nn of parcial.naoEnviar ?? []) await marcarNaoEnviar(origem, nn);
    for (const c of parcial.campanhas ?? []) await salvarCampanha(origem, c);
    for (const e of parcial.envios ?? []) await registrarEnvio(origem, { ...e, nome: e.chave, enviadoEm: '2026-09-01T00:00:00.000Z', textoConfere: true });
    const lido = lerBackup(JSON.stringify(await exportarTudo(origem, AGORA)));
    if (!lido.ok) throw new Error(lido.erro);
    return lido.backup;
  }

  for (const modo of ['mesclar', 'substituir'] as const) {
    it(`(${modo}) nunca apaga opt-out existente e o mais recente vence, preservando campos desconhecidos`, async () => {
      const db = await novoBanco();
      await marcarNaoEnviar(db, registro<NaoEnviar>({ chave: 'novo', nome: 'Novo', desde: '2026-10-18T00:00:00.000Z', motivo: 'pediu', pendenteSincronizacao: true }));
      await marcarNaoEnviar(db, bloqueio({ chave: 'so-local' }));
      const velho = await backupVelho({
        naoEnviar: [bloqueio({ chave: 'novo', desde: '2026-09-01T00:00:00.000Z', motivo: 'motivo antigo' }), bloqueio({ chave: 'so-backup' })],
      });
      await importarTudo(db, velho, modo);
      const por = new Map((await listarNaoEnviar(db)).map((x) => [x.chave, x]));
      expect([...por.keys()].sort()).toEqual(['novo', 'so-backup', 'so-local']);
      expect(por.get('novo')).toMatchObject({ motivo: 'pediu', desde: '2026-10-18T00:00:00.000Z', pendenteSincronizacao: true });
    });
  }

  it('se o backup tem o bloqueio mais novo, ele vale e o marcador local não se perde', async () => {
    const db = await novoBanco();
    await marcarNaoEnviar(db, registro<NaoEnviar>({ chave: 'k', nome: 'K', desde: '2026-09-01T00:00:00.000Z', motivo: 'velho', pendenteSincronizacao: true }));
    const b = await backupVelho({ naoEnviar: [bloqueio({ chave: 'k', desde: '2026-10-10T00:00:00.000Z', motivo: 'novo' })] });
    await importarTudo(db, b, 'mesclar');
    expect((await listarNaoEnviar(db))[0]).toMatchObject({ motivo: 'novo', desde: '2026-10-10T00:00:00.000Z', pendenteSincronizacao: true });
  });

  it('campanhas e envios não duplicam e o progresso mais novo não volta para trás', async () => {
    const db = await novoBanco();
    await salvarCampanha(db, campanha('c1', 'enviado'));
    await registrarEnvio(db, { campanhaId: 'c1', chave: 'joao', nome: 'João', enviadoEm: '2026-10-19T10:00:00.000Z', textoConfere: true });
    const velho = await backupVelho({ campanhas: [campanha('c1', 'pendente')], envios: [{ campanhaId: 'c1', chave: 'joao' }, { campanhaId: 'c1', chave: 'maria' }] });
    await importarTudo(db, velho, 'mesclar');
    await importarTudo(db, velho, 'mesclar'); // duas vezes: idempotente
    const campanhas = await listarCampanhas(db);
    expect(campanhas).toHaveLength(1);
    expect(campanhas[0].itens[0].status).toBe('enviado');
    const envios = await listarEnvios(db);
    expect(envios.map((e) => e.id).sort()).toEqual(['c1:joao', 'c1:maria']);
    expect(envios.find((e) => e.id === 'c1:joao')?.enviadoEm).toBe('2026-10-19T10:00:00.000Z');
  });
});
