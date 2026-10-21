// RepositorioLocal: a implementação do RepositorioContatos em chrome.storage.local (com mock).

import { beforeEach, describe, expect, it } from 'vitest';
import { RepositorioLocal } from '../src/shared/repositorio-local';
import { CHAVE_ACAO_PENDENTE, CHAVES } from '../src/shared/crm-store';
import type { Contato, Lembrete } from '../src/shared/crm-tipos';
import type { EventoRepositorio, RepositorioContatos } from '../src/shared/repositorio';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { contato, porId } from './ajuda/fabrica';

const T = 1_700_000_000_000;
const AGORA = new Date('2026-10-21T15:00:00Z');

let chrome: ChromeFalso;
let repo: RepositorioLocal;
let relogio: number;

const contatos = (): Contato[] => Object.values((chrome.dados.get(CHAVES.contatos) as Record<string, Contato> | undefined) ?? {});

beforeEach(() => {
  chrome = instalarChromeFalso();
  relogio = T;
  repo = new RepositorioLocal(() => relogio++);
});

describe('leitura e gravação por coleção', () => {
  it('sem nada gravado, carrega o padrão (com o modelo de exemplo das respostas rápidas)', async () => {
    const d = await repo.carregar();
    expect(d.contatos).toEqual({});
    expect(d.lembretes).toEqual([]);
    expect(d.config).toEqual({ aba: 'todas', diasSemResposta: null, filtroEtiquetas: [] });
    expect(d.respostas.map((r) => r.atalho)).toEqual(['oi']);
    // semear duas vezes não duplica (id fixo)
    const outro = new RepositorioLocal();
    expect((await outro.carregar()).respostas).toHaveLength(1);
  });

  it('só grava as coleções que mudaram', async () => {
    await repo.carregar();
    chrome.gravacoes = 0;
    await repo.adicionarNota({ nome: 'Ana' }, 'oi');
    expect([...chrome.dados.keys()].sort()).toEqual(['vz.contatos', 'vz.respostas']);
    expect(chrome.gravacoes).toBe(1);
    await repo.excluirEtiqueta('nao-existe'); // nada muda: nenhuma gravação
    expect(chrome.gravacoes).toBe(1);
  });

  it('lixo no storage não derruba nada: itens inválidos são descartados', async () => {
    chrome.dados.set(CHAVES.contatos, { x: { id: 'x', nome: 'Ana', fase: 'inventada', etiquetas: 'x', notas: [{ id: 1 }], telefone: '(84) 99999-0000' }, ruim: 42 });
    chrome.dados.set(CHAVES.lembretes, [{ id: 'a' }, 'texto', null]);
    chrome.dados.set(CHAVES.config, { aba: 'outra', diasSemResposta: 'x' });
    const d = await repo.carregar();
    expect(d.contatos.x).toMatchObject({ id: 'x', nome: 'Ana', etiquetas: [], notas: [], aliases: [], telefone: '5584999990000' });
    expect(d.contatos.x.fase).toBeUndefined();
    expect(Object.keys(d.contatos)).toEqual(['x']);
    expect(d.lembretes).toEqual([]);
    expect(d.config).toEqual({ aba: 'todas', diasSemResposta: null, filtroEtiquetas: [] });
  });

  it('carregar só algumas coleções não lê as outras', async () => {
    chrome.dados.set(CHAVES.conversas, { a: { chave: 'a', nome: 'A' } });
    const d = await repo.carregar(['etiquetas']);
    expect(d.conversas).toEqual({});
  });
});

describe('contatos: id interno, telefone e vínculo', () => {
  it('registrarContato cria com id próprio e telefone normalizado; chamar de novo reaproveita', async () => {
    const a = await repo.registrarContato({ nome: 'Ana Souza', telefone: '(84) 99999-0000' });
    expect(a.id).not.toBe('ana souza');
    expect(a.telefone).toBe('5584999990000');
    const b = await repo.registrarContato({ nome: 'Ana Souza' });
    expect(b.id).toBe(a.id);
    expect(contatos()).toHaveLength(1);
  });

  it('obterContato acha por id, telefone ou nome', async () => {
    const a = await repo.registrarContato({ nome: 'Ana Souza', telefone: '5584999990000' });
    expect((await repo.obterContato({ nome: 'x', contatoId: a.id }))?.id).toBe(a.id);
    expect((await repo.obterContato({ nome: 'Aninha', telefone: '84 99999-0000' }))?.id).toBe(a.id);
    expect((await repo.obterContato({ nome: 'ana souza' }))?.id).toBe(a.id);
    expect(await repo.obterContato({ nome: 'Ninguém' })).toBeNull();
  });

  it('vincular: telefone novo, e junta dois registros da mesma pessoa', async () => {
    const porNome = await repo.registrarContato({ nome: 'Ana' });
    await repo.adicionarNota({ nome: 'Ana' }, 'nota 1');
    const porNumero = await repo.registrarContato({ nome: '+55 84 99999-0000' });
    await repo.definirFase({ contatoId: porNumero.id, nome: '+55 84 99999-0000' }, 'orcamento');
    expect(contatos()).toHaveLength(2);
    const r = await repo.vincular(porNome.id, { telefone: '84 99999-0000' });
    expect(r.ok).toBe(true);
    const todos = contatos();
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ id: porNome.id, telefone: '5584999990000', fase: 'orcamento' });
    expect(todos[0].notas).toHaveLength(1);
    expect(await repo.vincular(porNome.id, { telefone: '12' })).toMatchObject({ ok: false });
  });

  it('registrarVistos aprende telefone e último contato SÓ de quem já existe (não cria contato)', async () => {
    const ana = await repo.registrarContato({ nome: 'Ana' });
    await repo.registrarVistos([
      { ref: { nome: 'Ana', telefone: '5584999990000' }, ultimoContatoEm: 500 },
      { ref: { nome: 'Desconhecido', telefone: '5584888880000' }, ultimoContatoEm: 600 },
    ]);
    expect(contatos()).toHaveLength(1);
    expect(contatos()[0]).toMatchObject({ id: ana.id, telefone: '5584999990000', ultimoContatoEm: 500 });
    await repo.registrarVistos([{ ref: { nome: 'Ana' }, ultimoContatoEm: 100 }]); // mais antigo: não recua
    expect(contatos()[0].ultimoContatoEm).toBe(500);
  });
});

describe('notas, etiquetas, fase e triagem', () => {
  it('notas: adicionar, editar, excluir; nota inválida não cria contato', async () => {
    expect(await repo.adicionarNota({ nome: 'Ana' }, '   ')).toMatch(/Escreva/);
    expect(contatos()).toHaveLength(0);
    expect(await repo.adicionarNota({ nome: 'Ana' }, 'Quer 200 sacos')).toBeNull();
    const [c] = contatos();
    expect(await repo.editarNota({ nome: 'Ana' }, c.notas[0].id, 'Quer 300 sacos')).toBeNull();
    expect(contatos()[0].notas[0].texto).toBe('Quer 300 sacos');
    await repo.excluirNota({ nome: 'Ana' }, c.notas[0].id);
    expect(contatos()[0].notas).toEqual([]);
  });

  it('etiquetas com cor: criar, aplicar, recusar repetida, excluir', async () => {
    const r = await repo.criarEtiqueta('Cliente fiel', '#8e24aa');
    if ('erro' in r) throw new Error(r.erro);
    expect(await repo.criarEtiqueta('cliente FIEL', '#00a884')).toEqual({ erro: 'Já existe uma etiqueta com esse nome.' });
    expect(await repo.alternarEtiqueta({ nome: 'Ana' }, r.etiqueta.id)).toBe(true);
    expect(contatos()[0].etiquetas).toEqual([r.etiqueta.id]);
    expect((await repo.listarEtiquetas())[0]).toMatchObject({ nome: 'Cliente fiel', cor: '#8e24aa' });
    await repo.excluirEtiqueta(r.etiqueta.id);
    expect(contatos()[0].etiquetas).toEqual([]);
  });

  it('fase do funil e conversão', async () => {
    await repo.definirFase({ nome: 'Ana' }, 'fechado');
    expect(contatos()[0]).toMatchObject({ fase: 'fechado' });
    expect(contatos()[0].convertidoEm).toBeTypeOf('number');
    await repo.definirFase({ nome: 'Ana' }, null);
    expect(contatos()[0].fase).toBeUndefined();
  });

  it('dispensar e reativar', async () => {
    await repo.dispensar({ nome: 'Ana' }, 'obrigado|0');
    expect(contatos()[0].dispensadaAss).toBe('obrigado|0');
    await repo.reativar({ nome: 'Ana' });
    expect(contatos()[0].dispensadaAss).toBeUndefined();
  });

  it('último contato (lastContactedAt)', async () => {
    await repo.registrarUltimoContato({ nome: 'Ana' }, 12345);
    expect(contatos()[0].ultimoContatoEm).toBe(12345);
  });
});

describe('lembretes', () => {
  it('cria ligado ao id do contato (não ao nome), com o telefone', async () => {
    const r = await repo.criarLembrete({ ref: { nome: 'Ana Souza', telefone: '84 99999-0000' }, venceEm: AGORA.getTime() + 3_600_000, rascunho: 'Oi!' }, AGORA);
    if (!r.ok) throw new Error(r.erro);
    expect(r.lembrete).toMatchObject({ nome: 'Ana Souza', telefone: '5584999990000', status: 'pendente', rascunho: 'Oi!' });
    expect(r.lembrete.contatoId).toBe(contatos()[0].id);
    // o nome mudou no WhatsApp: o lembrete continua do mesmo contato
    const [l] = await repo.listarLembretes();
    expect((await repo.obterContato({ nome: 'Outro nome', telefone: '5584999990000' }))?.id).toBe(l.contatoId);
  });

  it('horário no passado é recusado e não cria contato', async () => {
    const r = await repo.criarLembrete({ ref: { nome: 'Ana' }, venceEm: AGORA.getTime() - 1 }, AGORA);
    expect(r.ok).toBe(false);
    expect(contatos()).toHaveLength(0);
    expect(await repo.listarLembretes()).toEqual([]);
  });

  it('atualizar, adiar e excluir', async () => {
    const r = await repo.criarLembrete({ ref: { nome: 'Ana' }, venceEm: AGORA.getTime() + 1000 }, AGORA);
    if (!r.ok) throw new Error(r.erro);
    const id = r.lembrete.id;
    await repo.atualizarLembrete(id, { status: 'disparado', disparadoEm: 5 });
    expect((await repo.listarLembretes())[0]).toMatchObject({ status: 'disparado', disparadoEm: 5 });
    await repo.adiarLembrete(id, AGORA.getTime() + 86_400_000, AGORA);
    const l = (await repo.listarLembretes())[0] as Lembrete;
    expect(l.status).toBe('pendente');
    expect(l.disparadoEm).toBeUndefined();
    await repo.excluirLembrete(id);
    expect(await repo.listarLembretes()).toEqual([]);
  });
});

describe('respostas rápidas, conversas e config', () => {
  it('salvar (criar/editar), atalho repetido recusado, excluir', async () => {
    expect(await repo.salvarResposta({ titulo: 'Orçamento', atalho: '/orc', texto: 'Segue.' })).toBeNull();
    const d = await repo.carregar();
    const id = d.respostas.find((r) => r.atalho === 'orc')?.id as string;
    expect(await repo.salvarResposta({ titulo: 'Outro', atalho: 'orc', texto: 'x' })).toMatch(/já existe/);
    expect(await repo.salvarResposta({ id, titulo: 'Orçamento 2', atalho: 'orc', texto: 'Novo' })).toBeNull();
    await repo.excluirResposta(id);
    expect((await repo.carregar()).respostas.map((r) => r.atalho)).toEqual(['oi']);
  });

  it('conversas lidas da lista e config', async () => {
    await repo.salvarConversas({ ana: { chave: 'ana', nome: 'Ana' } as never });
    await repo.salvarConfig({ aba: 'precisa', diasSemResposta: 7, filtroEtiquetas: ['e1'] });
    const d = await repo.carregar();
    expect(Object.keys(d.conversas)).toEqual(['ana']);
    expect(d.config).toEqual({ aba: 'precisa', diasSemResposta: 7, filtroEtiquetas: ['e1'] });
  });
});

describe('exportar e importar JSON', () => {
  it('ida e volta entre dois armazenamentos', async () => {
    await repo.adicionarNota({ nome: 'Ana', telefone: '84 99999-0000' }, 'nota');
    await repo.criarLembrete({ ref: { nome: 'Ana' }, venceEm: AGORA.getTime() + 1000, rascunho: 'Oi' }, AGORA);
    const json = await repo.exportarJson();
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['app', 'contatos', 'etiquetas', 'exportadoEm', 'lembretes', 'respostas', 'versao']);

    chrome = instalarChromeFalso();
    const outro = new RepositorioLocal();
    const r = await outro.importar(json, 'mesclar');
    expect(r).toEqual({ ok: true, resumo: { contatos: 1, etiquetas: 0, lembretes: 1, respostas: 1 } });
    expect(contatos()[0]).toMatchObject({ nome: 'Ana', telefone: '5584999990000' });
    expect((await outro.listarLembretes())[0].contatoId).toBe(contatos()[0].id);
  });

  it('mesclar junta o contato do arquivo ao existente (mesmo telefone, nome diferente) e reaponta o lembrete', async () => {
    const existente = await repo.registrarContato({ nome: 'Ana Souza', telefone: '5584999990000' });
    await repo.definirFase({ contatoId: existente.id, nome: 'Ana Souza' }, 'fechado');
    const arquivo = JSON.stringify({
      app: 'vita-zap-crm',
      versao: 1,
      contatos: { idx: contato('Aninha', { id: 'idx', telefone: '5584999990000', fase: 'perdido', notas: [{ id: 'n9', texto: 'do arquivo', criadaEm: 1 }] }) },
      lembretes: [{ id: 'lx', contatoId: 'idx', nome: 'Aninha', venceEm: 1, criadoEm: 1, status: 'pendente' }],
    });
    expect((await repo.importar(arquivo, 'mesclar')).ok).toBe(true);
    expect(contatos()).toHaveLength(1);
    expect(contatos()[0]).toMatchObject({ id: existente.id, fase: 'fechado' }); // o que existe vence
    expect(contatos()[0].notas.map((n) => n.id)).toEqual(['n9']);
    expect((await repo.listarLembretes())[0].contatoId).toBe(existente.id);
  });

  it('substituir troca tudo; arquivo inválido é recusado sem mexer em nada', async () => {
    await repo.adicionarNota({ nome: 'Ana' }, 'nota');
    expect(await repo.importar('{ quebrado', 'substituir')).toMatchObject({ ok: false });
    expect(await repo.importar('{"app":"outro"}', 'substituir')).toMatchObject({ ok: false });
    expect(contatos()).toHaveLength(1);
    const vazio = JSON.stringify({ app: 'vita-zap-crm', versao: 1, contatos: porId() });
    expect((await repo.importar(vazio, 'substituir')).ok).toBe(true);
    expect(contatos()).toHaveLength(0);
  });
});

describe('abrir conversa e avisos de mudança', () => {
  it('pedirAbertura / consumirAbertura: entrega uma vez só', async () => {
    expect(await repo.consumirAbertura()).toBeNull();
    await repo.pedirAbertura({ nome: 'Ana', telefone: '5584999990000', rascunho: 'Oi', lembreteId: 'l1' });
    expect(chrome.dados.get(CHAVE_ACAO_PENDENTE)).toMatchObject({ tipo: 'abrirConversa', nome: 'Ana' });
    expect(await repo.consumirAbertura()).toMatchObject({ nome: 'Ana', rascunho: 'Oi', lembreteId: 'l1' });
    expect(await repo.consumirAbertura()).toBeNull();
  });

  it('pedido com mais de 15 minutos é descartado', async () => {
    await repo.pedirAbertura({ nome: 'Ana' });
    relogio += 16 * 60_000;
    expect(await repo.consumirAbertura()).toBeNull();
    expect(chrome.dados.has(CHAVE_ACAO_PENDENTE)).toBe(false);
  });

  it('aoMudar avisa as coleções gravadas (por esta ou por outra parte da extensão) e o pedido de abertura', async () => {
    const eventos: EventoRepositorio[] = [];
    const parar = repo.aoMudar((e) => eventos.push(e));
    await repo.adicionarNota({ nome: 'Ana' }, 'x');
    expect(eventos.some((e) => e.colecoes.includes('contatos'))).toBe(true);
    eventos.length = 0;
    await repo.pedirAbertura({ nome: 'Ana' }); // vem pelo evento do próprio storage
    expect(eventos).toContainEqual({ colecoes: [], abertura: true });
    parar();
    eventos.length = 0;
    await repo.adicionarNota({ nome: 'Bia' }, 'y');
    expect(eventos).toEqual([]);
    expect(chrome.ouvintes.size).toBe(0); // soltou o ouvinte do storage
  });
});

describe('mutações em sequência não se atropelam', () => {
  it('várias ao mesmo tempo acabam todas gravadas', async () => {
    const operacoes: Array<Promise<unknown>> = [];
    for (let i = 0; i < 10; i += 1) operacoes.push(repo.adicionarNota({ nome: `Cliente ${i}` }, `nota ${i}`));
    operacoes.push(repo.criarEtiqueta('Quente', '#c62828'));
    await Promise.all(operacoes);
    expect(contatos()).toHaveLength(10);
    expect((await repo.listarEtiquetas()).length).toBe(1);
  });

  it('o tipo cumpre a interface única', () => {
    const r: RepositorioContatos = repo;
    expect(typeof r.carregar).toBe('function');
  });
});
