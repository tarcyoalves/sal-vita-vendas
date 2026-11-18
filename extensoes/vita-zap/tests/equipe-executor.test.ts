// A equipe no Executor (0.7.60): antes de abrir cada contato (campanha comum, cobrança, reativação) o "não enviar mais" e o contato
// recente de QUALQUER atendente são conferidos; CRM fora do ar = automático pausa (falha fechada), manual só avisa; depois do envio a
// equipe é avisada e o texto enviado entra na contagem local.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, listarCampanhas, listarEnvios, listarNaoEnviar, listarResultadosTexto, salvarCampanha, salvarConfig, salvarConfigFollowup, salvarConfigReativacao } from '../src/shared/banco';
import type { Campanha, ItemCampanha } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import { CONFIG_FOLLOWUP_PADRAO } from '../src/shared/followup';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { CONFIG_REATIVACAO_PADRAO } from '../src/shared/reativacao';
import { hashDoModelo } from '../src/shared/resultado-texto';
import { Executor, PREFIXO_PAUSA_CRM } from '../src/sidepanel/executor';
import type { ResultadoEquipe } from '../src/sidepanel/sincronia-equipe';

let n = 0;
const AGORA = new Date('2026-11-18T13:00:00.000Z'); // 10h em Fortaleza, quarta
const MODELO = 'Oi {primeiroNome}, tudo bem? Como estão de sal por aí?';

async function montar(tipo: Campanha['tipo'], nomes: string[], equipe: (i: ItemCampanha, limite: number) => ResultadoEquipe | Promise<ResultadoEquipe>, auto: boolean) {
  const db = await abrirBanco(`eq-exec-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  await salvarConfigFollowup(db, { ...CONFIG_FOLLOWUP_PADRAO, textos1: ['Oi, {nome}!'], automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
  await salvarConfigReativacao(db, { ...CONFIG_REATIVACAO_PADRAO, textos1: ['Oi, {nome}!'], automatico: 'ligado', placarAprovado: true, confirmouRisco: true });
  const itens: ItemCampanha[] = nomes.map((nome) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo: MODELO, status: 'pendente', motivo: null, atualizadoEm: null }));
  const filtros = tipo === 'followup' ? { ...FILTROS_PADRAO, excluirContatadosHaDias: 5 } : FILTROS_PADRAO;
  const campanha: Campanha = { id: 'c1', ...(tipo ? { tipo } : {}), nome: 'C', criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: 'CLIENTE', filtros, modelos: [], status: 'pausada', motivoPausa: null, itens, problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null };
  await salvarCampanha(db, campanha);
  const colados: string[] = [];
  const consultas: Array<{ nome: string; limite: number }> = [];
  const avisados: string[] = [];
  const ex = new Executor(
    {
      db,
      pedir: async (p) => {
        if (p.tipo === 'abrirEColar') colados.push(p.nome);
        if (p.tipo === 'lerConversa') return { ok: true, mensagens: [{ de: 'eu', texto: 'Oi, tudo bem?', quando: null }] };
        return p.tipo === 'abrirEColar' ? { ok: true, idsAntes: [] } : { ok: true };
      },
      agora: () => AGORA,
      aleatorio: () => 0.5,
      agendar: () => () => undefined,
      obterEnvioAutomatico: () => auto,
      equipe: async (item, _c, limite) => {
        consultas.push({ nome: item.nome, limite });
        return equipe(item, limite);
      },
      aoEnviar: (item) => void avisados.push(item.nome),
    },
    campanha,
  );
  return { db, ex, colados, consultas, avisados };
}

const livre = (): ResultadoEquipe => ({ tipo: 'livre' });
const optOut = (): ResultadoEquipe => ({ tipo: 'bloqueado', status: 'nao_enviar', motivo: 'marcado "Não enviar mais" (por outro atendente ou computador)' });
const recente = (): ResultadoEquipe => ({ tipo: 'bloqueado', status: 'pulado', motivo: 'contatado há 3 dia(s) por outro atendente (campanha; mínimo 14)' });

for (const tipo of [undefined, 'followup', 'reativacao'] as const) {
  const rotulo = tipo === undefined ? 'campanha comum' : tipo === 'followup' ? 'cobrança do follow-up' : 'reativação';
  describe(`Executor + equipe: ${rotulo}`, () => {
    it('"não enviar mais" de outro atendente: o contato NÃO é aberto e vai para "nao_enviar" com o motivo; o resto segue', async () => {
      const t = await montar(tipo, ['Ana', 'Bia'], (i) => (i.nome === 'Ana' ? optOut() : livre()), true);
      await t.ex.iniciar();
      expect(t.consultas[0].nome).toBe('Ana'); // conferiu ANTES de abrir
      expect(t.colados).toEqual(['Bia']);
      expect(t.ex.atual.campanha.itens.find((i) => i.nome === 'Ana')).toMatchObject({ status: 'nao_enviar', motivo: expect.stringContaining('Não enviar mais') });
      expect((await listarCampanhas(t.db))[0].itens.find((i) => i.nome === 'Ana')?.status).toBe('nao_enviar');
    });

    it('contatado há pouco por outro atendente: pulado, com o motivo', async () => {
      const t = await montar(tipo, ['Ana', 'Bia'], (i) => (i.nome === 'Ana' ? recente() : livre()), true);
      await t.ex.iniciar();
      expect(t.colados).toEqual(['Bia']);
      expect(t.ex.atual.campanha.itens.find((i) => i.nome === 'Ana')).toMatchObject({ status: 'pulado', motivo: expect.stringContaining('outro atendente') });
    });

    it('o limite de dias que o Executor passa é o do contato (follow-up: o intervalo escolhido; comum e reativação: a política)', async () => {
      const t = await montar(tipo, ['Ana'], livre, false);
      await t.ex.iniciar();
      expect(t.consultas[0].limite).toBe(tipo === 'followup' ? 5 : tipo === 'reativacao' ? 14 : 14);
    });

    it('CRM fora do ar no envio AUTOMÁTICO: pausa sem enviar (falha fechada) e a pausa é a "benigna" que o ciclo tenta de novo', async () => {
      const t = await montar(tipo, ['Ana'], () => ({ tipo: 'indisponivel', motivo: 'sem rede' }), true);
      await t.ex.iniciar();
      expect(t.colados).toEqual([]);
      expect(t.ex.atual.fase).toBe('parada');
      expect(t.ex.atual.mensagem).toMatch(new RegExp(`^${PREFIXO_PAUSA_CRM}`));
      expect(t.ex.atual.mensagem).toContain('não enviar mais');
    });

    it('CRM fora do ar no envio MANUAL: só avisa e cola (quem envia é você)', async () => {
      const t = await montar(tipo, ['Ana'], () => ({ tipo: 'indisponivel', motivo: 'sem rede' }), false);
      await t.ex.iniciar();
      expect(t.colados).toEqual(['Ana']);
      expect(t.ex.atual.fase).toBe('aguardando_envio');
      expect(t.ex.atual.avisoTrava).toMatch(/não enviar mais/);
    });
  });
}

describe('Executor + equipe: depois do envio', () => {
  it('avisa a equipe e conta o texto enviado (hash do modelo), uma vez por envio', async () => {
    const t = await montar(undefined, ['Ana'], livre, false);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    expect(t.avisados).toEqual(['Ana']);
    expect(await listarEnvios(t.db)).toHaveLength(1);
    const r = await listarResultadosTexto(t.db);
    expect(r).toEqual([{ id: 'c1:ana', hash: hashDoModelo(MODELO), chave: 'ana', enviadoEm: AGORA.toISOString(), respondeuEm: null }]);
  });

  it('o aviso à equipe que falha NÃO derruba o envio (já está registrado localmente)', async () => {
    const t = await montar(undefined, ['Ana'], livre, false);
    // Substitui o aviso por um que lança.
    (t.ex as unknown as { deps: { aoEnviar: () => never } }).deps.aoEnviar = () => {
      throw new Error('sem rede');
    };
    await t.ex.iniciar();
    await expect(t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true })).resolves.toBeUndefined();
    expect(await listarEnvios(t.db)).toHaveLength(1);
  });

  it('sem a dependência (testes antigos) nada é conferido', async () => {
    const db = await abrirBanco(`eq-exec-${Date.now()}-${(n += 1)}`);
    await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
    const itens: ItemCampanha[] = [{ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', modelo: MODELO, status: 'pendente', motivo: null, atualizadoEm: null }];
    const campanha: Campanha = { id: 'c1', nome: 'C', criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: '', filtros: FILTROS_PADRAO, modelos: [], status: 'pausada', motivoPausa: null, itens, problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null };
    const colados: string[] = [];
    const ex = new Executor({ db, pedir: async (p) => (p.tipo === 'abrirEColar' ? (colados.push(p.nome), { ok: true, idsAntes: [] }) : { ok: true }), agora: () => AGORA, aleatorio: () => 0.5, agendar: () => () => undefined }, campanha);
    await ex.iniciar();
    expect(colados).toEqual(['Ana']);
  });
});

describe('origem do "não enviar mais" marcado durante a campanha', () => {
  for (const [tipo, origem] of [[undefined, 'campanha'], ['followup', 'cobranca'], ['reativacao', 'reativacao']] as const) {
    it(`${tipo ?? 'comum'} → origem "${origem}" (vai para o CRM com ela)`, async () => {
      const t = await montar(tipo, ['Ana'], livre, false);
      await t.ex.bloquearItem('ana');
      expect(await listarNaoEnviar(t.db)).toMatchObject([{ chave: 'ana', origem }]);
    });
  }
});
