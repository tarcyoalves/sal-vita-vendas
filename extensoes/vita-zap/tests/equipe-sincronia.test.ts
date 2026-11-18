// Sincronização com a equipe no painel (0.7.60): banco local + ServicoCrm + CRM falso. A lista local é cache/offline; o CRM é a fonte
// e a UNIÃO vale. Migração dos locais, opt-out de outro atendente, desfazer (nos dois lados), CRM fora do ar, conferência antes de
// cada envio (opt-out e contato recente de qualquer atendente) e o envio sobe com o tipo certo.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, lerEstadoEquipe, listarEnvios, listarNaoEnviar, marcarNaoEnviar, registrarEnvio, salvarCampanha, salvarContatos, type Banco } from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { hashDoNome, refDoContato } from '../src/shared/equipe';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import { ServicoCrm } from '../src/shared/servico-crm';
import {
  aoEnviar,
  atualizarContatados,
  conferirEquipeAntesDeEnviar,
  contatadoPelaEquipe,
  desmarcarNaEquipe,
  enviarContatos,
  indisponibilidadeDaEquipe,
  preparar,
  sincronizarOptOuts,
  sincronizarTudo,
  zerarEstadoDaEquipe,
  type DependenciasEquipe,
} from '../src/sidepanel/sincronia-equipe';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, type CrmFalso } from './ajuda/crm-falso';

const AGORA = new Date('2026-11-18T15:00:00.000Z');
let n = 0;
let agora = AGORA.getTime();
let crm: CrmFalso;
let servico: ServicoCrm;
let db: Banco;
let telefones: Record<string, string>;
let d: DependenciasEquipe;

beforeEach(async () => {
  zerarEstadoDaEquipe();
  agora = AGORA.getTime();
  crm = criarCrmFalso([], () => agora);
  servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte, () => agora);
  await servico.definirUrl(BASE);
  await servico.entrar(EMAIL, SENHA);
  db = await abrirBanco(`equipe-${Date.now()}-${(n += 1)}`);
  telefones = {};
  d = { db, repo: servico, telefoneDe: (_nome, chave) => telefones[chave] ?? null, agora: () => new Date(agora) };
  crm.requisicoes.length = 0;
});

const local = (nome: string, extra: Record<string, unknown> = {}) => ({ chave: nome.toLowerCase(), nome, desde: '2026-11-05T12:00:00.000Z', motivo: 'não enviar mais', ...extra });
const campanha = (id: string, extra: Partial<Campanha> = {}): Campanha => ({
  id,
  nome: id,
  criadaEm: '2026-11-10T12:00:00.000Z',
  aprovadaEm: '2026-11-10T12:00:00.000Z',
  termoBusca: '',
  filtros: FILTROS_PADRAO,
  modelos: [],
  status: 'concluida',
  motivoPausa: null,
  itens: [],
  problemasSeguidos: 0,
  ultimoEnvioEm: null,
  intervaloAtualSeg: null,
  ...extra,
});
const item = (nome: string) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo: 'Oi {primeiroNome}', status: 'pendente' as const, motivo: null, atualizadoEm: null });

describe('"não enviar mais": a união local + CRM', () => {
  it('primeira sincronização (migração): os locais sobem ao CRM com a data original e a origem, e ficam marcados como sincronizados', async () => {
    await marcarNaoEnviar(db, local('Ana', { motivo: 'pediu para sair (lido pela IA)' }), { semAvisar: true });
    await marcarNaoEnviar(db, local('Bia'), { semAvisar: true });
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: true, enviados: 2, novos: 0, mudou: false });
    expect(crm.equipe.optOuts.map((o) => [o.nome, o.origem]).sort()).toEqual([['Ana', 'ia'], ['Bia', 'manual']]);
    expect(crm.equipe.optOuts.find((o) => o.nome === 'Ana')?.criadoEm.toISOString()).toBe('2026-11-05T12:00:00.000Z');
    expect((await listarNaoEnviar(db)).every((x) => x.crm === true)).toBe(true);
    // De novo: nada mais sobe.
    crm.requisicoes.length = 0;
    const r2 = await sincronizarOptOuts(d, { forcar: true });
    expect(r2).toMatchObject({ ok: true, enviados: 0 });
    expect(crm.chamadas('zapContatos.marcarOptOuts')).toHaveLength(0);
  });

  it('o opt-out de outro atendente/computador passa a valer aqui (entra na lista local, com a origem)', async () => {
    crm.equipe.optOuts.push({ chave: 'n:x', telefone: null, nomeHash: hashDoNome('Carla Souza'), nome: 'Carla Souza', userId: 3, origem: 'ia', criadoEm: new Date('2026-11-10T12:00:00Z') });
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: true, novos: 1, mudou: true });
    const l = await listarNaoEnviar(db);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ chave: 'carla souza', origem: 'ia', crm: true });
  });

  it('marcado por TELEFONE: vale para o contato daqui que tem outro nome e o mesmo telefone', async () => {
    crm.equipe.optOuts.push({ chave: '558499990000', telefone: '558499990000', nomeHash: hashDoNome('Dona Carla'), nome: null, userId: 3, origem: 'manual', criadoEm: new Date('2026-11-10T12:00:00Z') });
    await salvarContatos(db, [{ chave: 'carla padaria', nome: 'Carla Padaria', rotuloData: null, ultimaConversa: null, revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, duplicado: false, varridoEm: AGORA.toISOString() }]);
    telefones['carla padaria'] = '84999990000';
    await sincronizarOptOuts(d, { forcar: true });
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['carla padaria']);
  });

  it('alguém desfez no CRM: a entrada que já estava sincronizada sai daqui; a que nunca subiu continua e sobe', async () => {
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    await sincronizarOptOuts(d, { forcar: true }); // sobe e marca crm: true
    crm.equipe.optOuts = []; // outro atendente desfez
    await marcarNaoEnviar(db, local('Bia'), { semAvisar: true }); // marcado depois, ainda não subiu
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: true, removidos: 1, enviados: 1, mudou: true });
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['bia']);
    expect(crm.equipe.optOuts.map((o) => o.nome)).toEqual(['Bia']);
  });

  it('lista do CRM cortada (limite): nada é removido daqui por ausência', async () => {
    await marcarNaoEnviar(db, local('Ana', { crm: true }), { semAvisar: true });
    crm.optOutsTruncados = true;
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r).toMatchObject({ ok: true, removidos: 0 });
    expect(await listarNaoEnviar(db)).toHaveLength(1);
  });

  it('CRM fora do ar: o opt-out LOCAL continua valendo, a equipe fica indisponível e nada se perde; voltou, sincroniza', async () => {
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    crm.semRede = true;
    const r = await sincronizarOptOuts(d, { forcar: true });
    expect(r.ok).toBe(false);
    expect(indisponibilidadeDaEquipe()).toMatch(/CRM indisponível/);
    expect(await listarNaoEnviar(db)).toHaveLength(1);
    crm.semRede = false;
    const r2 = await sincronizarOptOuts(d, { forcar: true });
    expect(r2).toMatchObject({ ok: true, enviados: 1 });
    expect(indisponibilidadeDaEquipe()).toBeNull();
  });

  it('desfazer: tira daqui E do CRM (senão a próxima sincronização traria de volta)', async () => {
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    await sincronizarOptOuts(d, { forcar: true });
    const r = await desmarcarNaEquipe(d, 'ana');
    expect(r.ok).toBe(true);
    expect(await listarNaoEnviar(db)).toEqual([]);
    expect(crm.equipe.optOuts).toEqual([]);
    await sincronizarOptOuts(d, { forcar: true });
    expect(await listarNaoEnviar(db)).toEqual([]);
  });

  it('desfazer com o CRM fora do ar: se já estava no CRM, NADA muda e avisa; se nunca subiu, sai só daqui', async () => {
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    await sincronizarOptOuts(d, { forcar: true });
    await marcarNaoEnviar(db, local('Bia'), { semAvisar: true });
    crm.semRede = true;
    const ana = await desmarcarNaEquipe(d, 'ana');
    expect(ana.ok).toBe(false);
    expect(!ana.ok && ana.mensagem).toMatch(/Nada foi alterado/);
    expect((await listarNaoEnviar(db)).map((x) => x.chave).sort()).toEqual(['ana', 'bia']);
    const bia = await desmarcarNaEquipe(d, 'bia');
    expect(bia.ok).toBe(true);
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['ana']);
  });

  it('marcar localmente avisa quem escuta (a sincronização sobe a marcação logo)', async () => {
    const { aoMarcarNaoEnviar } = await import('../src/shared/banco');
    let avisos = 0;
    const parar = aoMarcarNaoEnviar(() => (avisos += 1));
    await marcarNaoEnviar(db, local('Ana'));
    await marcarNaoEnviar(db, local('Ana')); // já existe: não avisa de novo
    await marcarNaoEnviar(db, local('Bia'), { semAvisar: true });
    parar();
    expect(avisos).toBe(1);
  });
});

describe('contato registrado: os envios daqui sobem com o tipo certo', () => {
  it('primeira vez: os dos últimos dias; depois só os novos (marca d\'água); tipo pela campanha', async () => {
    await salvarCampanha(db, campanha('c1'));
    await salvarCampanha(db, campanha('c2', { tipo: 'followup' }));
    await salvarCampanha(db, campanha('c3', { tipo: 'reativacao' }));
    telefones.ana = '84999990000';
    await registrarEnvio(db, { campanhaId: 'c1', chave: 'ana', nome: 'Ana', enviadoEm: '2026-11-17T12:00:00.000Z', textoConfere: true });
    await registrarEnvio(db, { campanhaId: 'c2', chave: 'bia', nome: 'Bia', enviadoEm: '2026-11-17T13:00:00.000Z', textoConfere: true });
    await registrarEnvio(db, { campanhaId: 'c3', chave: 'carla', nome: 'Carla', enviadoEm: '2026-11-17T14:00:00.000Z', textoConfere: true });
    await registrarEnvio(db, { campanhaId: 'c1', chave: 'velho', nome: 'Velho', enviadoEm: '2026-08-01T12:00:00.000Z', textoConfere: true }); // fora da migração
    const r = await enviarContatos(d);
    expect(r).toEqual({ ok: true, quantidade: 3 });
    expect(crm.equipe.envios.map((e) => e.tipo).sort()).toEqual(['campanha', 'cobranca', 'reativacao']);
    expect(crm.equipe.envios.find((e) => e.tipo === 'campanha')?.telefone).toBe('558499990000');
    expect((await lerEstadoEquipe(db)).enviosAte).toBe('2026-11-17T14:00:00.000Z');
    crm.requisicoes.length = 0;
    expect(await enviarContatos(d)).toEqual({ ok: true, quantidade: 0 });
    expect(crm.requisicoes).toHaveLength(0);
    await registrarEnvio(db, { campanhaId: 'c1', chave: 'dani', nome: 'Dani', enviadoEm: '2026-11-18T10:00:00.000Z', textoConfere: true });
    expect(await enviarContatos(d)).toEqual({ ok: true, quantidade: 1 });
  });

  it('CRM fora do ar: a marca d\'água NÃO avança (sobe depois)', async () => {
    await salvarCampanha(db, campanha('c1'));
    await registrarEnvio(db, { campanhaId: 'c1', chave: 'ana', nome: 'Ana', enviadoEm: '2026-11-17T12:00:00.000Z', textoConfere: true });
    crm.semRede = true;
    expect((await enviarContatos(d)).ok).toBe(false);
    expect((await lerEstadoEquipe(db)).enviosAte).toBeNull();
    crm.semRede = false;
    expect(await enviarContatos(d)).toEqual({ ok: true, quantidade: 1 });
  });

  it('aoEnviar avisa a equipe na hora (melhor esforço) e guarda o contato como "meu"', async () => {
    await aoEnviar(d, item('Ana'), {}, '2026-11-18T14:55:00.000Z');
    expect(crm.equipe.envios).toHaveLength(1);
    expect(contatadoPelaEquipe().get('ana')).toBe('2026-11-18T14:55:00.000Z');
    crm.semRede = true;
    await expect(aoEnviar(d, item('Bia'), {}, '2026-11-18T14:56:00.000Z')).resolves.toBeUndefined(); // não lança
  });

  it('sincronizarTudo: opt-outs e envios, nos dois sentidos', async () => {
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    await salvarCampanha(db, campanha('c1'));
    await registrarEnvio(db, { campanhaId: 'c1', chave: 'bia', nome: 'Bia', enviadoEm: '2026-11-17T12:00:00.000Z', textoConfere: true });
    const r = await sincronizarTudo(d, { forcar: true });
    expect(r.ok).toBe(true);
    expect(crm.equipe.optOuts).toHaveLength(1);
    expect(crm.equipe.envios).toHaveLength(1);
    expect(await listarEnvios(db)).toHaveLength(1); // o registro local não muda
  });
});

describe('quem a equipe contatou (para a prévia, o follow-up e a reativação)', () => {
  it('atualizarContatados guarda o último contato de qualquer atendente por chave, com cache de 5 min', async () => {
    crm.equipe.envios.push({ chave: 'n:x', telefone: null, nomeHash: hashDoNome('Ana'), tipo: 'campanha', enviadoEm: new Date(agora - 3 * 86_400_000), userId: 3 });
    const r = await atualizarContatados(d, [{ nome: 'Ana', chave: 'ana' }, { nome: 'Bia', chave: 'bia' }]);
    expect(r).toEqual({ ok: true });
    expect(contatadoPelaEquipe().get('ana')).toBe(new Date(agora - 3 * 86_400_000).toISOString());
    expect(contatadoPelaEquipe().has('bia')).toBe(false);
    crm.requisicoes.length = 0;
    await atualizarContatados(d, [{ nome: 'Ana', chave: 'ana' }]);
    expect(crm.requisicoes).toHaveLength(0); // cache
    agora += 6 * 60_000;
    await atualizarContatados(d, [{ nome: 'Ana', chave: 'ana' }]);
    expect(crm.chamadas('zapContatos.consultarContatados')).toHaveLength(1);
  });

  it('CRM fora do ar: devolve o motivo, marca indisponível e não apaga o que já se sabia', async () => {
    crm.equipe.envios.push({ chave: 'n:x', telefone: null, nomeHash: hashDoNome('Ana'), tipo: 'campanha', enviadoEm: new Date(agora - 86_400_000), userId: 3 });
    await atualizarContatados(d, [{ nome: 'Ana', chave: 'ana' }]);
    crm.semRede = true;
    const r = await atualizarContatados(d, [{ nome: 'Ana', chave: 'ana' }], { forcar: true });
    expect(r.ok).toBe(false);
    expect(indisponibilidadeDaEquipe()).not.toBeNull();
    expect(contatadoPelaEquipe().has('ana')).toBe(true);
  });

  it('preparar nunca lança e diz se a lista local mudou', async () => {
    crm.equipe.optOuts.push({ chave: 'n:x', telefone: null, nomeHash: hashDoNome('Carla'), nome: 'Carla', userId: 3, origem: 'manual', criadoEm: new Date(agora) });
    expect(await preparar(d, [{ nome: 'Ana', chave: 'ana' }])).toEqual({ mudouLista: true });
    crm.semRede = true;
    await expect(preparar(d, [{ nome: 'Ana', chave: 'ana' }], { forcar: true })).resolves.toEqual({ mudouLista: false });
  });
});

describe('conferência antes de cada envio (o Executor chama)', () => {
  it('livre: ninguém marcou nem contatou', async () => {
    expect(await conferirEquipeAntesDeEnviar(d, item('Ana'), 14)).toEqual({ tipo: 'livre' });
    expect(crm.requisicoes.filter((r) => r.url.pathname.includes('consultarContatados'))).toHaveLength(1);
  });

  it('"não enviar mais" de outro atendente, mesmo que ainda não esteja na lista local: bloqueia (e passa a valer localmente)', async () => {
    crm.equipe.optOuts.push({ chave: '558499990000', telefone: '558499990000', nomeHash: hashDoNome('Dona Ana'), nome: 'Dona Ana', userId: 3, origem: 'ia', criadoEm: new Date(agora) });
    telefones.ana = '84999990000';
    const r = await conferirEquipeAntesDeEnviar(d, item('Ana'), 14);
    expect(r).toMatchObject({ tipo: 'bloqueado', status: 'nao_enviar' });
    expect((await listarNaoEnviar(db)).map((x) => x.chave)).toEqual(['ana']);
  });

  it('contatado há menos do mínimo por OUTRO atendente: pula, com o motivo', async () => {
    crm.equipe.envios.push({ chave: 'n:x', telefone: null, nomeHash: hashDoNome('Ana'), tipo: 'cobranca', enviadoEm: new Date(agora - 5 * 86_400_000), userId: 3 });
    const r = await conferirEquipeAntesDeEnviar(d, item('Ana'), 14);
    expect(r).toMatchObject({ tipo: 'bloqueado', status: 'pulado' });
    expect(r.tipo === 'bloqueado' && r.motivo).toBe('contatado há 5 dia(s) por outro atendente (cobrança; mínimo 14)');
  });

  it('contatado há MAIS do mínimo: livre (o limite é o do contato: follow-up 5 dias, campanha 14)', async () => {
    crm.equipe.envios.push({ chave: 'n:x', telefone: null, nomeHash: hashDoNome('Ana'), tipo: 'campanha', enviadoEm: new Date(agora - 8 * 86_400_000), userId: 3 });
    expect((await conferirEquipeAntesDeEnviar(d, item('Ana'), 14)).tipo).toBe('bloqueado');
    expect((await conferirEquipeAntesDeEnviar(d, item('Ana'), 5)).tipo).toBe('livre');
  });

  it('CRM fora do ar: indisponível (falha fechada: o Executor pausa o automático e só avisa no manual)', async () => {
    crm.semRede = true;
    const r = await conferirEquipeAntesDeEnviar(d, item('Ana'), 14);
    expect(r.tipo).toBe('indisponivel');
    expect(indisponibilidadeDaEquipe()).toMatch(/CRM indisponível/);
  });

  it('antes de conferir, o que foi enviado aqui sobe (a equipe vê o contato anterior)', async () => {
    await salvarCampanha(db, campanha('c1'));
    await registrarEnvio(db, { campanhaId: 'c1', chave: 'bia', nome: 'Bia', enviadoEm: '2026-11-18T14:00:00.000Z', textoConfere: true });
    await conferirEquipeAntesDeEnviar(d, item('Ana'), 14);
    expect(crm.equipe.envios.map((e) => e.nomeHash)).toEqual([hashDoNome('Bia')]);
  });
});

// Cobertura da ponte entre o hash do contato e a ref (a chave local nunca vai ao servidor).
describe('o que vai ao servidor', () => {
  it('só telefone, hash do nome, nome (opt-out), origem, tipo e data: nunca a chave local nem texto', async () => {
    await marcarNaoEnviar(db, local('Ana'), { semAvisar: true });
    await sincronizarOptOuts(d, { forcar: true });
    const corpo = JSON.stringify(crm.chamadas('zapContatos.marcarOptOuts')[0].entrada);
    expect(corpo).toContain(refDoContato('Ana').nomeHash);
    expect(corpo).not.toMatch(/"chave"|motivo|texto|mensagem/);
  });
});
