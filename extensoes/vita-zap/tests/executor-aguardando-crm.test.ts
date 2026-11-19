// Envio MANUAL com o CRM indisponível (0.7.62): a conferência da equipe ("não enviar mais"/contatados) ou da trava de agendamento sem
// resposta NÃO deixa abrir nem colar. O item vai para 'aguardando_crm' (distinto de bloqueado e de enviado), a campanha segue para o
// próximo e nada se perde nem duplica. "Conferir CRM novamente" (e o Retomar) devolvem esses itens a 'pendente'.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, listarCampanhas, listarEnvios, marcarNaoEnviar, salvarCampanha, salvarConfig, type Banco } from '../src/shared/banco';
import { resumo, type Campanha, type ItemCampanha, type StatusItem } from '../src/shared/campanha';
import { csvDasCampanhas } from '../src/shared/exportar';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { ServicoCrm } from '../src/shared/servico-crm';
import { verificarTrava, type ListaAgendamentos, type ResultadoTrava } from '../src/shared/trava-agendamento';
import { Executor, JANELA_CRM_FORA_MS, MOTIVO_AGUARDANDO_CRM } from '../src/sidepanel/executor';
import { conferirEquipeAntesDeEnviar, zerarEstadoDaEquipe, type ResultadoEquipe } from '../src/sidepanel/sincronia-equipe';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA } from './ajuda/crm-falso';

let n = 0;
let AGORA = new Date('2026-11-18T13:00:00.000Z'); // 10h em Fortaleza, quarta
const MODELO = 'Oi {primeiroNome}, tudo bem? Como estão de sal por aí?';

interface Opcoes {
  nomes: string[];
  status?: Record<string, StatusItem>;
  auto?: boolean;
  emVoo?: { nome: string } | null;
  equipe?: (i: ItemCampanha) => ResultadoEquipe | Promise<ResultadoEquipe>;
  trava?: (i: ItemCampanha) => ResultadoTrava | Promise<ResultadoTrava>;
  consultaEnvio?: 'enviado' | 'nao_encontrado';
}

async function montar(o: Opcoes) {
  AGORA = new Date('2026-11-18T13:00:00.000Z');
  const db = await abrirBanco(`aguarda-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  const itens: ItemCampanha[] = o.nomes.map((nome) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo: MODELO, status: o.status?.[nome] ?? 'pendente', motivo: null, atualizadoEm: null }));
  const campanha: Campanha = {
    id: 'c1', nome: 'C', criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: 'CLIENTE', filtros: FILTROS_PADRAO, modelos: [], status: 'pausada', motivoPausa: null, itens,
    problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null,
    ...(o.emVoo ? { emVoo: { chave: o.emVoo.nome.toLowerCase(), nome: o.emVoo.nome, texto: `Oi ${o.emVoo.nome}`, idsAntes: [], desde: AGORA.toISOString() } } : {}),
  };
  await salvarCampanha(db, campanha);
  const colados: string[] = [];
  const consultas: string[] = [];
  const agendados: Array<() => void> = [];
  const ctl = { equipe: o.equipe, trava: o.trava };
  const ex = new Executor(
    {
      db,
      pedir: async (p) => {
        if (p.tipo === 'abrirEColar') colados.push(p.nome);
        if (p.tipo === 'consultarEnvio') return { ok: true, situacao: o.consultaEnvio === 'enviado' ? 'enviado' : 'nao_encontrado' };
        return p.tipo === 'abrirEColar' ? { ok: true, idsAntes: [] } : { ok: true };
      },
      agora: () => AGORA,
      aleatorio: () => 0.5,
      agendar: (fn) => {
        agendados.push(fn);
        return () => undefined;
      },
      obterEnvioAutomatico: () => o.auto === true,
      equipe: async (item) => {
        consultas.push(`equipe:${item.nome}`);
        return ctl.equipe ? ctl.equipe(item) : { tipo: 'livre' };
      },
      trava: async (item) => {
        consultas.push(`trava:${item.nome}`);
        return ctl.trava ? ctl.trava(item) : { tipo: 'livre' };
      },
    },
    campanha,
  );
  /** Vence o intervalo entre contatos. */
  const liberar = async () => {
    AGORA = new Date(AGORA.getTime() + 300_000); // passa o intervalo mínimo entre contatos
    agendados.pop()?.();
    await new Promise((r) => setTimeout(r, 20));
  };
  return { db, ex, colados, consultas, ctl, liberar };
}

const fora = (motivo = 'CRM indisponível (sem rede)'): ResultadoEquipe => ({ tipo: 'indisponivel', motivo });
const statusDe = (ex: Executor) => Object.fromEntries(ex.atual.campanha.itens.map((i) => [i.nome, i.status]));

describe('CRM fora do ar (envio manual)', () => {
  it('ninguém é aberto/colado; todos ficam aguardando o CRM, com o motivo; a campanha não conclui nem perde ninguém', async () => {
    const t = await montar({ nomes: ['Ana', 'Bia', 'Caio'], equipe: () => fora() });
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(statusDe(t.ex)).toEqual({ Ana: 'aguardando_crm', Bia: 'aguardando_crm', Caio: 'aguardando_crm' });
    const ana = t.ex.atual.campanha.itens[0];
    expect(ana.motivo).toContain(MOTIVO_AGUARDANDO_CRM);
    expect(ana.motivo).toContain('sem rede');
    expect(t.ex.atual.campanha.status).toBe('pausada'); // não 'concluida'
    expect(t.ex.atual.campanha.motivoPausa).toContain(MOTIVO_AGUARDANDO_CRM);
    expect(t.ex.atual.fase).toBe('parada');
    expect(await listarEnvios(t.db)).toEqual([]);
    expect((await listarCampanhas(t.db))[0].itens.map((i) => i.status)).toEqual(['aguardando_crm', 'aguardando_crm', 'aguardando_crm']);
    // O CRM caído não é consultado a cada contato da fila (janela curta).
    expect(t.consultas.filter((c) => c.startsWith('equipe:'))).toEqual(['equipe:Ana']);
    expect(JANELA_CRM_FORA_MS).toBeGreaterThan(0);
  });

  it('só a trava de agendamento fora do ar também segura o contato', async () => {
    const t = await montar({ nomes: ['Ana'], trava: () => ({ tipo: 'indisponivel', motivo: 'não consegui consultar os agendamentos do CRM' }) });
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(t.ex.atual.campanha.itens[0]).toMatchObject({ status: 'aguardando_crm', motivo: expect.stringMatching(/agendamentos/) });
  });

  it('o automático continua PAUSANDO (contato segue pendente, nunca "aguardando")', async () => {
    const t = await montar({ nomes: ['Ana'], equipe: () => fora(), auto: true });
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(t.ex.atual.campanha.itens[0].status).toBe('pendente');
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.campanha.motivoPausa).toMatch(/^CRM indisponível/);
  });
});

describe('login expirado (erro de autenticação)', () => {
  it('com a conferência REAL da equipe e o CRM sem sessão: nada é colado, o contato aguarda o CRM', async () => {
    zerarEstadoDaEquipe();
    const crm = criarCrmFalso([], () => AGORA.getTime());
    const servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte, () => AGORA.getTime());
    await servico.definirUrl(BASE);
    await servico.entrar(EMAIL, SENHA);
    crm.logado = false; // a sessão caiu (401 do servidor)
    let dbRef: Banco | null = null;
    const t = await montar({ nomes: ['Ana'] });
    dbRef = t.db;
    const d = { db: dbRef, repo: servico, telefoneDe: () => null, agora: () => AGORA };
    t.ctl.equipe = (item) => conferirEquipeAntesDeEnviar(d, item, 14);
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(t.ex.atual.campanha.itens[0].status).toBe('aguardando_crm');
    expect(t.ex.atual.campanha.itens[0].motivo).toMatch(/CRM indisponível|sem login|UNAUTHORIZED/i);
  });
});

describe('retorno incompleto (truncado) da trava', () => {
  const corta: ListaAgendamentos = { itens: [{ taskId: 1, titulo: 'Ana Souza', telefone: '84999990000', venceEm: AGORA.getTime() + 5 * 86_400_000 }], truncado: true, em: AGORA.getTime() };
  it('lista truncada SEM achado = aguardando o CRM; COM achado = agendado (pulado), que é bloqueio e não espera', async () => {
    const t = await montar({ nomes: ['Pedro Lima', 'Ana Souza'], trava: (i) => verificarTrava({ nome: i.nome }, corta, {}, AGORA.getTime()) });
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(statusDe(t.ex)).toEqual({ 'Pedro Lima': 'aguardando_crm', 'Ana Souza': 'pulado' });
    expect(t.ex.atual.campanha.itens[0].motivo).toContain('incompleta');
  });
});

describe('opt-out já conhecido neste computador', () => {
  it('continua bloqueando mesmo com o CRM fora: vai para "nao_enviar", não para "aguardando"', async () => {
    const t = await montar({ nomes: ['Ana', 'Bia'], equipe: () => fora() });
    await marcarNaoEnviar(t.db, { chave: 'ana', nome: 'Ana', desde: AGORA.toISOString(), motivo: 'não enviar mais' }, { semAvisar: true }); // pendente de sincronização
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(statusDe(t.ex)).toEqual({ Ana: 'nao_enviar', Bia: 'aguardando_crm' });
    expect(t.consultas).not.toContain('equipe:Ana'); // nem precisou do CRM
  });
});

describe('retomar e "Conferir CRM novamente"', () => {
  it('Retomar com o CRM de volta reconsidera os que aguardavam: cada um é colado UMA vez e nada se perde', async () => {
    const t = await montar({ nomes: ['Ana', 'Bia'], equipe: () => fora() });
    await t.ex.iniciar();
    expect(Object.values(statusDe(t.ex))).toEqual(['aguardando_crm', 'aguardando_crm']);
    t.ctl.equipe = undefined; // o CRM voltou
    await t.ex.iniciar();
    expect(t.colados).toEqual(['Ana']);
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    await t.liberar();
    expect(t.colados).toEqual(['Ana', 'Bia']);
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Bia', texto: 'Oi Bia', textoConfere: true });
    expect(statusDe(t.ex)).toEqual({ Ana: 'enviado', Bia: 'enviado' });
    expect((await listarEnvios(t.db)).map((e) => e.nome).sort()).toEqual(['Ana', 'Bia']);
    expect(t.colados).toEqual(['Ana', 'Bia']);
    expect(t.ex.atual.campanha.status).toBe('concluida');
  });

  it('"Conferir CRM novamente" com sucesso devolve a pendente e tenta já; com o CRM ainda fora, volta a aguardar (sem duplicar)', async () => {
    const t = await montar({ nomes: ['Ana', 'Bia'], equipe: () => fora() });
    await t.ex.iniciar();
    expect(await t.ex.conferirCrmNovamente()).toBe(2);
    expect(Object.values(statusDe(t.ex))).toEqual(['aguardando_crm', 'aguardando_crm']); // ainda fora
    expect(t.colados).toEqual([]);
    t.ctl.equipe = undefined;
    expect(await t.ex.conferirCrmNovamente()).toBe(2);
    expect(t.colados).toEqual(['Ana']);
    expect(statusDe(t.ex)).toEqual({ Ana: 'pendente', Bia: 'pendente' });
    expect(await t.ex.conferirCrmNovamente()).toBe(0); // nada aguardando; não mexe em quem está em andamento
  });

  it('enviado nunca volta: quem já saiu antes fica enviado e não é colado de novo', async () => {
    const t = await montar({ nomes: ['Ana', 'Bia'], status: { Ana: 'enviado' }, equipe: () => fora() });
    await t.ex.iniciar();
    expect(statusDe(t.ex)).toEqual({ Ana: 'enviado', Bia: 'aguardando_crm' });
    t.ctl.equipe = undefined;
    await t.ex.conferirCrmNovamente();
    expect(t.colados).toEqual(['Bia']);
    expect(statusDe(t.ex).Ana).toBe('enviado');
  });

  it('a reconciliação de envio interrompido continua valendo (saiu → enviado, sem colar de novo), e o resto aguarda o CRM', async () => {
    const t = await montar({ nomes: ['Ana', 'Bia'], emVoo: { nome: 'Ana' }, consultaEnvio: 'enviado', equipe: () => fora() });
    await t.ex.iniciar();
    expect(t.colados).toEqual([]);
    expect(statusDe(t.ex).Ana).toBe('enviado');
    await t.liberar(); // vence o intervalo depois do envio reconciliado
    expect(statusDe(t.ex)).toEqual({ Ana: 'enviado', Bia: 'aguardando_crm' });
    expect(t.colados).toEqual([]);
    expect((await listarEnvios(t.db)).map((e) => e.nome)).toEqual(['Ana']);
    expect(t.ex.atual.campanha.emVoo ?? null).toBeNull();
  });
});

describe('contadores e exportação', () => {
  it('resumo conta aguardando_crm à parte; o CSV rotula; o backup aceita o status', async () => {
    const t = await montar({ nomes: ['Ana', 'Bia'], status: { Bia: 'pendente' }, equipe: () => fora() });
    await t.ex.iniciar();
    const r = resumo(t.ex.atual.campanha);
    expect(r).toMatchObject({ aguardando_crm: 2, pendente: 0, pulado: 0, nao_enviar: 0, enviado: 0 });
    expect(csvDasCampanhas([t.ex.atual.campanha], [])).toContain('aguardando verificação do CRM');
    const { lerBackup } = await import('../src/shared/exportar');
    const json = JSON.stringify({ formato: 'vita-zap-backup', versao: 1, exportadoEm: AGORA.toISOString(), contatos: [], campanhas: [t.ex.atual.campanha], envios: [], naoEnviar: [], config: null });
    expect(lerBackup(json).ok).toBe(true);
  });

  it('itens antigos (sem o novo status) não mudam', async () => {
    const t = await montar({ nomes: ['Ana'], status: { Ana: 'revisar' } });
    expect(resumo(t.ex.atual.campanha)).toMatchObject({ revisar: 1, aguardando_crm: 0 });
  });
});
