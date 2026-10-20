// Fila editável (0.3.3): editar texto/primeiro nome, remover, reordenar e desfazer durante a execução.
// O item em andamento é travado; tudo é gravado no IndexedDB na hora.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { listarCampanhas, listarEnvios } from '../src/shared/banco';
import { resumo, textoDoItem } from '../src/shared/campanha';
import { TAMANHO_MAX_TEXTO } from '../src/shared/constantes';
import { abertos, esperarFila, montar } from './_executor-helpers';

const chaves = (t: Awaited<ReturnType<typeof montar>>) => t.ex.atual.campanha.itens.filter((i) => i.status === 'pendente').map((i) => i.chave);

/** Dá o Enter do usuário em `nome` e deixa o intervalo passar, até o "Abrir próximo". */
async function enviarEAbrirProximo(t: Awaited<ReturnType<typeof montar>>, nome: string, texto: string) {
  await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome, texto, textoConfere: true });
  t.avancarRelogio(100_000);
  t.agendados.at(-1)?.fn();
  await esperarFila();
  await t.ex.abrirProximo();
}

describe('editar texto e primeiro nome', () => {
  it('o texto editado e o primeiro nome novo são os que vão para a caixa', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai']);
    expect(await t.ex.editarItem('bia', { primeiroNome: 'Bibi', texto: 'Oi Bibi' })).toEqual({ ok: true });
    expect(await t.ex.editarItem('cai', { primeiroNome: 'Cai', texto: 'Bom dia, Cai! Como está o estoque de sal?' })).toEqual({ ok: true });
    await t.ex.iniciar();
    await enviarEAbrirProximo(t, 'Ana', 'Oi Ana');
    await enviarEAbrirProximo(t, 'Bia', 'Oi Bibi');
    const pedidos = t.pedidos.filter((p) => p.tipo === 'abrirEColar');
    expect(pedidos.map((p) => [p.nome, p.texto])).toEqual([
      ['Ana', 'Oi Ana'],
      ['Bia', 'Oi Bibi'],
      ['Cai', 'Bom dia, Cai! Como está o estoque de sal?'],
    ]);
  });

  it('texto igual ao do modelo não vira override; {primeiroNome} digitado é resolvido', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.editarItem('ana', { primeiroNome: 'Aninha', texto: 'Oi Aninha' });
    expect(t.ex.atual.campanha.itens[0].textoPersonalizado).toBeNull();
    expect(textoDoItem(t.ex.atual.campanha.itens[0])).toBe('Oi Aninha');
    await t.ex.editarItem('bia', { primeiroNome: 'Bi', texto: 'Olá {primeiroNome}, tudo bem?' });
    expect(t.ex.atual.campanha.itens[1].textoPersonalizado).toBe('Olá Bi, tudo bem?');
  });

  it('o executor lê a versão nova mesmo editando enquanto outro contato espera o Enter', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.iniciar(); // Ana colada, aguardando Enter
    expect(await t.ex.editarItem('bia', { primeiroNome: 'Bia', texto: 'Texto novo da Bia' })).toEqual({ ok: true });
    await enviarEAbrirProximo(t, 'Ana', 'Oi Ana');
    expect(t.pedidos.filter((p) => p.tipo === 'abrirEColar').map((p) => p.texto)).toEqual(['Oi Ana', 'Texto novo da Bia']);
  });
});

describe('validação ao salvar', () => {
  it.each([
    ['link', 'Veja www.salvita.com.br agora', /link/],
    ['quebra de linha', 'Oi Bia\ntudo bem?', /quebra de linha/],
    ['texto vazio', '   ', /vazio/],
    ['tamanho máximo', 'x'.repeat(TAMANHO_MAX_TEXTO + 1), /longo demais/],
    ['marcador desconhecido', 'Oi {nome}', /marcador desconhecido/],
  ])('recusa %s e não grava', async (_nome, texto, erro) => {
    const t = await montar(['Ana', 'Bia']);
    const antes = t.ex.atual.campanha;
    const r = await t.ex.editarItem('bia', { primeiroNome: 'Bia', texto });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.erros.join(' ')).toMatch(erro);
    expect(t.ex.atual.campanha).toBe(antes);
    expect((await listarCampanhas(t.db)).length).toBe(0); // nada foi gravado
  });

  it('primeiro nome vazio é recusado', async () => {
    const t = await montar(['Ana']);
    const r = await t.ex.editarItem('ana', { primeiroNome: '  ', texto: 'Oi' });
    expect(r).toEqual({ ok: false, erros: ['o primeiro nome não pode ficar vazio'] });
  });
});

describe('remover', () => {
  it('vira "removido" por você, não é problema, não conta em teto nem no freio e a campanha conclui', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai']);
    await t.ex.iniciar();
    expect(await t.ex.removerItem('bia')).toEqual({ ok: true });
    const bia = t.ex.atual.campanha.itens[1];
    expect(bia).toMatchObject({ status: 'removido', motivo: 'removido por você' });
    await enviarEAbrirProximo(t, 'Ana', 'Oi Ana');
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Cai']);
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Cai', texto: 'Oi Cai', textoConfere: true });
    expect(t.ex.atual.fase).toBe('concluida'); // era o último pendente: removido não segura a campanha
    const r = resumo(t.ex.atual.campanha);
    expect(r).toMatchObject({ enviado: 2, removido: 1, problema: 0, pulado: 0 });
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect((await listarEnvios(t.db)).map((e) => e.nome).sort()).toEqual(['Ana', 'Cai']); // teto: só 2 envios
    expect(t.ex.atual.mensagem).toBe('Campanha concluída.');
  });

  it('removidos em sequência não acionam o freio', async () => {
    const t = await montar(['A', 'B', 'C', 'D', 'E']);
    for (const k of ['a', 'b', 'c', 'd']) await t.ex.removerItem(k);
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual(['E']);
  });

  it('Desfazer remover devolve o contato à fila, na mesma posição, enquanto não foi executado', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai']);
    await t.ex.removerItem('bia');
    expect(chaves(t)).toEqual(['ana', 'cai']);
    expect(await t.ex.desfazerRemocaoItem('bia')).toEqual({ ok: true });
    expect(chaves(t)).toEqual(['ana', 'bia', 'cai']);
    expect(t.ex.atual.campanha.itens[1]).toMatchObject({ status: 'pendente', motivo: null });
    // Só desfaz o que está removido.
    expect((await t.ex.desfazerRemocaoItem('ana')).ok).toBe(false);
  });
});

describe('reordenar', () => {
  it('↑ / ↓ e "Enviar este a seguir" mudam a ordem de execução', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai', 'Dedé']);
    await t.ex.moverItem('cai', 'cima');
    expect(chaves(t)).toEqual(['ana', 'cai', 'bia', 'dedé']);
    await t.ex.moverItem('ana', 'baixo');
    expect(chaves(t)).toEqual(['cai', 'ana', 'bia', 'dedé']);
    await t.ex.moverItem('dedé', 'topo');
    expect(chaves(t)).toEqual(['dedé', 'cai', 'ana', 'bia']);
    expect((await t.ex.moverItem('dedé', 'cima')).ok).toBe(false); // já no topo
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual(['Dedé']);
    await enviarEAbrirProximo(t, 'Dedé', 'Oi Dedé');
    expect(abertos(t.pedidos)).toEqual(['Dedé', 'Cai']);
  });

  it('campanha pausada: a fila é editável e Retomar segue a nova ordem', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai']);
    await t.ex.iniciar();
    await t.ex.pausar();
    expect(t.ex.atual.campanha.status).toBe('pausada');
    // Ana ficou colada/em andamento: travada; as outras reordenam.
    await t.ex.moverItem('cai', 'topo');
    expect(chaves(t)).toEqual(['ana', 'cai', 'bia']);
    expect(await t.ex.editarItem('cai', { primeiroNome: 'Cai', texto: 'Voltei, Cai' })).toEqual({ ok: true });
    await t.ex.jaEnviei();
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('intervalo');
    t.avancarRelogio(100_000);
    t.agendados.at(-1)?.fn();
    await esperarFila();
    await t.ex.abrirProximo();
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Cai']);
    expect(t.pedidos.filter((p) => p.tipo === 'abrirEColar').at(-1)?.texto).toBe('Voltei, Cai');
  });

  it('"Enviar este a seguir" nunca passa na frente do item em andamento', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai']);
    await t.ex.iniciar();
    await t.ex.moverItem('cai', 'topo');
    expect(chaves(t)).toEqual(['ana', 'cai', 'bia']);
    await enviarEAbrirProximo(t, 'Ana', 'Oi Ana');
    expect(abertos(t.pedidos)).toEqual(['Ana', 'Cai']);
  });
});

describe('item em andamento é travado', () => {
  it('colado/aguardando Enter: não edita, não remove, não move', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    expect(t.ex.chavesTravadas().has('ana')).toBe(true);
    const antes = t.ex.atual.campanha;
    for (const r of [
      await t.ex.editarItem('ana', { primeiroNome: 'Ana', texto: 'outro texto' }),
      await t.ex.removerItem('ana'),
      await t.ex.moverItem('ana', 'baixo'),
    ]) {
      expect(r).toEqual({ ok: false, erros: ['este contato está em andamento e não pode ser alterado'] });
    }
    expect(t.ex.atual.campanha).toBe(antes);
    expect(t.pedidos.filter((p) => p.tipo === 'abrirEColar').map((p) => p.texto)).toEqual(['Oi Ana']);
  });

  it('pausado com o texto já colado (registro "em andamento" no banco): continua travado, mesmo num painel reaberto', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.iniciar();
    await t.ex.pausar();
    const reaberto = t.novoExecutor(t.ex.atual.campanha); // sem preparar(): vale o registro do IndexedDB
    expect((await reaberto.editarItem('ana', { primeiroNome: 'Ana', texto: 'trocado' })).ok).toBe(false);
    expect((await reaberto.removerItem('ana')).ok).toBe(false);
    expect((await reaberto.editarItem('bia', { primeiroNome: 'Bia', texto: 'ok' })).ok).toBe(true);
  });

  it('contato já enviado ou removido não é editável', async () => {
    const t = await montar(['Ana', 'Bia']);
    await t.ex.removerItem('bia');
    expect((await t.ex.editarItem('bia', { primeiroNome: 'Bia', texto: 'x' })).ok).toBe(false);
    expect((await t.ex.moverItem('bia', 'topo')).ok).toBe(false);
  });
});

describe('persistência', () => {
  it('as edições ficam no IndexedDB na hora: painel fechado e reaberto mostra tudo igual', async () => {
    const t = await montar(['Ana', 'Bia', 'Cai']);
    await t.ex.editarItem('bia', { primeiroNome: 'Bibi', texto: 'Oi Bibi, tudo certo?' });
    await t.ex.removerItem('cai');
    await t.ex.moverItem('bia', 'topo');
    const gravada = (await listarCampanhas(t.db)).find((c) => c.id === 'camp');
    expect(gravada?.itens.map((i) => [i.chave, i.status, i.primeiroNome, i.textoPersonalizado ?? null])).toEqual([
      ['bia', 'pendente', 'Bibi', 'Oi Bibi, tudo certo?'],
      ['ana', 'pendente', 'Ana', null],
      ['cai', 'removido', 'Cai', null],
    ]);
    // "Painel reaberto": outro executor a partir do que está no banco.
    const reaberto = t.novoExecutor(gravada!);
    await reaberto.iniciar();
    expect(t.pedidos.filter((p) => p.tipo === 'abrirEColar').map((p) => [p.nome, p.texto])).toEqual([['Bia', 'Oi Bibi, tudo certo?']]);
  });
});
