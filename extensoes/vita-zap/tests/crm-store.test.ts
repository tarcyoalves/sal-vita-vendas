// Armazenamento do CRM em chrome.storage.local (com mock) e exportar/importar JSON.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHAVES,
  carregarDados,
  dadosVazios,
  exportarJson,
  garantirContato,
  gravar,
  gravarVarias,
  lerImportacao,
  mesclarDados,
  observarMudancas,
  sanearDados,
  substituirDados,
} from '../src/shared/crm-store';
import type { Contato, DadosCrm } from '../src/shared/crm-tipos';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';

const T = 1_700_000_000_000;

function comDados(): DadosCrm {
  const d = dadosVazios();
  d.etiquetas = [{ id: 'e1', nome: 'Quente', cor: '#c62828' }];
  d.contatos.ana = { chave: 'ana', nome: 'Ana', fase: 'orcamento', etiquetas: ['e1'], notas: [{ id: 'n1', texto: 'Quer 200 sacos', criadaEm: T }], criadoEm: T, atualizadoEm: T };
  d.lembretes = [{ id: 'l1', chave: 'ana', nome: 'Ana', venceEm: T + 86_400_000, criadoEm: T, status: 'pendente', rascunho: 'Oi Ana' }];
  d.respostas = [{ id: 'r1', titulo: 'Saudação', atalho: 'oi', texto: 'Olá, {primeiro_nome}!' }];
  return d;
}

let chrome: ChromeFalso;
beforeEach(() => {
  chrome = instalarChromeFalso();
});

describe('chrome.storage.local', () => {
  it('sem nada gravado, carrega o padrão', async () => {
    const d = await carregarDados();
    expect(d).toEqual(dadosVazios());
  });

  it('grava por coleção e lê de volta', async () => {
    const d = comDados();
    await gravar('contatos', d.contatos);
    await gravar('etiquetas', d.etiquetas);
    await gravar('lembretes', d.lembretes);
    await gravar('respostas', d.respostas);
    await gravar('config', { aba: 'precisa', diasSemResposta: 7, filtroEtiquetas: ['e1'] });
    expect([...chrome.dados.keys()].sort()).toEqual(['vz.config', 'vz.contatos', 'vz.etiquetas', 'vz.lembretes', 'vz.respostas']);
    const lido = await carregarDados();
    expect(lido.contatos).toEqual(d.contatos);
    expect(lido.etiquetas).toEqual(d.etiquetas);
    expect(lido.lembretes).toEqual(d.lembretes);
    expect(lido.respostas).toEqual(d.respostas);
    expect(lido.config).toEqual({ aba: 'precisa', diasSemResposta: 7, filtroEtiquetas: ['e1'] });
  });

  it('gravarVarias só escreve o que foi passado', async () => {
    await gravarVarias({ etiquetas: comDados().etiquetas });
    expect([...chrome.dados.keys()]).toEqual(['vz.etiquetas']);
  });

  it('lixo no storage não derruba nada: itens inválidos são descartados', async () => {
    chrome.dados.set(CHAVES.contatos, { ana: { chave: 'ana', nome: 'Ana', fase: 'inventada', etiquetas: 'x', notas: [{ id: 1 }] }, ruim: 42 });
    chrome.dados.set(CHAVES.lembretes, [{ id: 'a' }, 'texto', null]);
    chrome.dados.set(CHAVES.config, { aba: 'outra', diasSemResposta: 'x' });
    const d = await carregarDados();
    expect(d.contatos.ana).toMatchObject({ chave: 'ana', nome: 'Ana', etiquetas: [], notas: [] });
    expect(d.contatos.ana.fase).toBeUndefined();
    expect(Object.keys(d.contatos)).toEqual(['ana']);
    expect(d.lembretes).toEqual([]);
    expect(d.config).toEqual({ aba: 'todas', diasSemResposta: null, filtroEtiquetas: [] });
  });

  it('avisa quem escuta quando outra parte da extensão grava', async () => {
    const vistas: string[][] = [];
    const parar = observarMudancas((c) => vistas.push(c));
    await gravar('etiquetas', comDados().etiquetas);
    await chrome.dados.set('outra-coisa', 1);
    parar();
    await gravar('lembretes', []);
    expect(vistas).toEqual([['etiquetas']]);
  });

  it('garantirContato cria uma vez e reaproveita o telefone da conversa', () => {
    const d = dadosVazios();
    d.conversas['5584999990000'] = { chave: '5584999990000', nome: '+55 84 99999-0000', telefone: '5584999990000' } as never;
    const a = garantirContato(d, '5584999990000', '+55 84 99999-0000', T);
    expect(a.telefone).toBe('5584999990000');
    expect(garantirContato(d, '5584999990000', 'outro nome', T + 5)).toBe(a);
  });
});

describe('exportar e importar JSON', () => {
  it('exporta o que o usuário criou (e não as conversas lidas da lista)', () => {
    const d = comDados();
    d.conversas.x = { chave: 'x', nome: 'X' } as never;
    const json = JSON.parse(exportarJson(d, new Date('2026-10-21T15:00:00Z')));
    expect(json).toMatchObject({ app: 'vita-zap-crm', versao: 1, exportadoEm: '2026-10-21T15:00:00.000Z' });
    expect(Object.keys(json).sort()).toEqual(['app', 'contatos', 'etiquetas', 'exportadoEm', 'lembretes', 'respostas', 'versao']);
  });

  it('ida e volta: o que sai entra igual', () => {
    const d = comDados();
    const r = lerImportacao(exportarJson(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resumo).toEqual({ contatos: 1, etiquetas: 1, lembretes: 1, respostas: 1 });
    expect(r.dados.contatos).toEqual(d.contatos);
    expect(r.dados.lembretes).toEqual(d.lembretes);
  });

  it('recusa arquivo que não é do Vita Zap, JSON quebrado e versão mais nova', () => {
    expect(lerImportacao('{ não é json')).toEqual({ ok: false, erro: 'O arquivo não é um JSON válido.' });
    expect(lerImportacao('{"app":"outro"}')).toMatchObject({ ok: false });
    expect(lerImportacao('[]')).toMatchObject({ ok: false });
    expect(lerImportacao('{"app":"vita-zap-crm","versao":99}')).toMatchObject({ ok: false, erro: expect.stringContaining('mais nova') });
  });

  it('mesclar: o que existe vence; entra só o que falta', () => {
    const atual = comDados();
    atual.contatos.ana.fase = 'fechado';
    const importado = comDados();
    importado.contatos.ana.fase = 'perdido';
    importado.contatos.ana.etiquetas = ['e1', 'e2'];
    importado.contatos.ana.notas.push({ id: 'n2', texto: 'Nota do backup', criadaEm: T });
    importado.contatos.bia = { chave: 'bia', nome: 'Bia', etiquetas: [], notas: [], criadoEm: T, atualizadoEm: T } as Contato;
    importado.etiquetas.push({ id: 'e2', nome: 'Frio', cor: '#0288d1' });
    importado.lembretes.push({ id: 'l2', chave: 'bia', nome: 'Bia', venceEm: T + 1, criadoEm: T, status: 'pendente' });
    const r = mesclarDados(atual, importado);
    expect(r.contatos.ana.fase).toBe('fechado');
    expect(r.contatos.ana.etiquetas).toEqual(['e1', 'e2']);
    expect(r.contatos.ana.notas.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(Object.keys(r.contatos).sort()).toEqual(['ana', 'bia']);
    expect(r.etiquetas.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(r.lembretes.map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(r.respostas).toHaveLength(1);
  });

  it('substituir troca o que o usuário criou e mantém as conversas lidas', () => {
    const atual = comDados();
    atual.conversas.x = { chave: 'x', nome: 'X' } as never;
    const r = substituirDados(atual, { contatos: {}, etiquetas: [], lembretes: [], respostas: [] });
    expect(r.contatos).toEqual({});
    expect(r.lembretes).toEqual([]);
    expect(Object.keys(r.conversas)).toEqual(['x']);
  });

  it('sanearDados descarta o que não tem forma de dado válido', () => {
    expect(sanearDados({ respostas: [{ id: 'r', titulo: '', texto: 'x' }, { id: 'r2', titulo: 'ok', texto: 'x', atalho: '/Oi' }] }).respostas).toEqual([{ id: 'r2', titulo: 'ok', atalho: 'Oi', texto: 'x' }]);
  });
});
