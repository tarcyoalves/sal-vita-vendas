// 0.7.65: anexos da campanha. Limites, loja IndexedDB aditiva, backup SEM blobs, apagar campanha apaga anexos e o Executor
// (texto primeiro, arquivos depois; retomar nunca reenvia o texto; falha do anexo = revisar + freio + pausa).

import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVISO_BACKUP_ANEXOS, MAX_BYTES_ARQUIVO, MAX_BYTES_TOTAL, validarAnexos, base64ParaBytes } from '../src/shared/anexos';
import { abrirBanco, apagarCampanha, exportarTudo, guardarAnexos, lerAnexoGuardado, lerCampanha, listarEnvios, salvarCampanha, salvarConfig, importarTudo, type Banco } from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { lerBackup } from '../src/shared/exportar';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import type { EventoConteudo, PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { Executor } from '../src/sidepanel/executor';

let n = 0;
const META = [
  { id: 'a1', nome: 'foto.jpg', tipo: 'image/jpeg', tamanho: 3, hash: 'h1' },
  { id: 'a2', nome: 'tabela.pdf', tipo: 'application/pdf', tamanho: 4, hash: 'h2' },
];

function campanha(nomes: string[], anexos: Campanha['anexos'] = META): Campanha {
  return {
    id: 'camp',
    nome: 'teste',
    criadaEm: '2026-10-19T12:00:00.000Z',
    aprovadaEm: '2026-10-19T12:00:00.000Z',
    termoBusca: 'CLIENTE',
    filtros: FILTROS_PADRAO,
    modelos: ['Oi {primeiroNome}'],
    status: 'pausada',
    motivoPausa: null,
    itens: nomes.map((nome) => ({ chave: nome.toLowerCase(), nome, primeiroNome: nome, modelo: 'Oi {primeiroNome}', status: 'pendente', motivo: null, atualizadoEm: null })),
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
    ...(anexos ? { anexos } : {}),
  };
}

async function banco(comArquivos = true): Promise<Banco> {
  const db = await abrirBanco(`anexos-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  if (comArquivos) {
    await guardarAnexos(db, 'camp', [
      { anexoId: 'a1', nome: 'foto.jpg', tipo: 'image/jpeg', blob: new Blob(['jpg'], { type: 'image/jpeg' }) },
      { anexoId: 'a2', nome: 'tabela.pdf', tipo: 'application/pdf', blob: new Blob(['%PDF'], { type: 'application/pdf' }) },
    ]);
  }
  return db;
}

function criar(db: Banco, c: Campanha, responder: (p: PedidoConteudo) => RespostaConteudo = () => ({ ok: true, idsAntes: [] })) {
  const pedidos: PedidoConteudo[] = [];
  const agendados: Array<() => void> = [];
  const ex = new Executor(
    {
      db,
      pedir: async (p) => {
        pedidos.push(p);
        return responder(p);
      },
      agora: () => new Date('2026-10-19T13:00:00Z'),
      aleatorio: () => 0.5,
      agendar: (fn) => {
        agendados.push(fn);
        return () => undefined;
      },
    },
    c,
  );
  return { ex, pedidos, agendados };
}

const detectado = (nome: string): EventoConteudo => ({ tipo: 'vitaZap:envioDetectado', nome, texto: `Oi ${nome}`, textoConfere: true });
const anexoOk = (nome: string, indice: number): EventoConteudo => ({ tipo: 'vitaZap:anexoEnviado', nome, indice });
const tipos = (ps: PedidoConteudo[]) => ps.map((p) => p.tipo);

describe('limites dos anexos', () => {
  const ok = (name: string, type: string, size = 100) => ({ name, type, size });
  it('aceita jpg/png/webp/pdf, até 3, 5 MB cada e 12 MB no total', () => {
    expect(validarAnexos([ok('a.jpg', 'image/jpeg'), ok('b.png', 'image/png'), ok('c.webp', 'image/webp'), ok('d.pdf', 'application/pdf')].slice(0, 3))).toEqual([]);
    expect(validarAnexos([ok('t.pdf', 'application/pdf', MAX_BYTES_ARQUIVO)])).toEqual([]);
    expect(validarAnexos([ok('t.pdf', '', 10)])).toEqual([]); // tipo deduzido pela extensão
  });
  it('recusa mais de 3, arquivo grande, total grande e tipo não aceito, com mensagem clara', () => {
    expect(validarAnexos([ok('a.jpg', 'image/jpeg'), ok('b.jpg', 'image/jpeg'), ok('c.jpg', 'image/jpeg'), ok('d.jpg', 'image/jpeg')])[0]).toMatch(/No máximo 3 anexos/);
    expect(validarAnexos([ok('g.pdf', 'application/pdf', MAX_BYTES_ARQUIVO + 1)])[0]).toMatch(/"g\.pdf" tem .*: o limite é 5,0 MB por arquivo/);
    const quatroMb = 4 * 1024 * 1024;
    expect(validarAnexos([ok('a.pdf', 'application/pdf', quatroMb), ok('b.pdf', 'application/pdf', quatroMb), ok('c.pdf', 'application/pdf', quatroMb + 1)]).join(' ')).toMatch(/limite é 12,0 MB no total/);
    expect(MAX_BYTES_TOTAL).toBe(12 * 1024 * 1024);
    expect(validarAnexos([ok('v.mp4', 'video/mp4')])[0]).toMatch(/tipo não aceito/);
    expect(validarAnexos([ok('v.pdf', 'application/pdf', 0)])[0]).toMatch(/vazio/);
  });
});

describe('loja de anexos, backup e apagar campanha', () => {
  it('guarda e lê o Blob; apagar a campanha apaga os anexos (e só os dela)', async () => {
    const db = await banco();
    await guardarAnexos(db, 'outra', [{ anexoId: 'x', nome: 'x.pdf', tipo: 'application/pdf', blob: new Blob(['x']) }]);
    await salvarCampanha(db, campanha(['Ana']));
    expect((await lerAnexoGuardado(db, 'camp', 'a2'))?.blob.size).toBe(4);
    await apagarCampanha(db, 'camp');
    expect(await lerCampanha(db, 'camp')).toBeUndefined();
    expect(await lerAnexoGuardado(db, 'camp', 'a1')).toBeUndefined();
    expect(await lerAnexoGuardado(db, 'camp', 'a2')).toBeUndefined();
    expect(await lerAnexoGuardado(db, 'outra', 'x')).toBeDefined();
  });

  it('o backup leva só os metadados (nome, tipo, tamanho, hash): nenhum Blob nem conteúdo, e a loja anexos fica de fora', async () => {
    const db = await banco();
    await salvarCampanha(db, campanha(['Ana']));
    const b = await exportarTudo(db, new Date('2026-10-19T13:00:00Z'), '0.7.65');
    expect(Object.keys(b.lojas)).not.toContain('anexos');
    const json = JSON.stringify(b);
    expect(json).toContain('"hash":"h2"');
    expect(json).not.toContain('%PDF');
    expect(json).not.toContain('blob');
    const lido = lerBackup(json);
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(lido.backup.campanhas[0].anexos).toEqual(META);
    // restaurar em outro perfil: metadados voltam, arquivos não
    const destino = await banco(false);
    await importarTudo(destino, lido.backup, 'mesclar');
    expect((await lerCampanha(destino, 'camp'))?.anexos).toEqual(META);
    expect(await lerAnexoGuardado(destino, 'camp', 'a1')).toBeUndefined();
  });

  it('a interface avisa que os anexos não vão no backup', () => {
    expect(AVISO_BACKUP_ANEXOS).toBe('Os anexos não vão no backup; anexe de novo após restaurar.');
    const ui = readFileSync(join(__dirname, '..', 'src/sidepanel/Anexos.tsx'), 'utf8');
    expect(ui).toContain('AVISO_BACKUP_ANEXOS');
  });

  it('o progresso por contato atravessa o backup (senão o texto sairia de novo)', async () => {
    const db = await banco();
    const c = campanha(['Ana']);
    c.itens[0] = { ...c.itens[0], progresso: { textoEnviado: true, anexosEnviados: 1 } };
    await salvarCampanha(db, c);
    const lido = lerBackup(JSON.stringify(await exportarTudo(db, new Date(), '0.7.65')));
    expect(lido.ok && lido.backup.campanhas[0].itens[0].progresso).toEqual({ textoEnviado: true, anexosEnviados: 1 });
  });
});

describe('Executor: texto primeiro, arquivos depois (modo único, legenda sempre vazia)', () => {
  it('texto → anexo 1 → anexo 2 → só então o contato vira enviado; o pedido do anexo não tem legenda', async () => {
    const db = await banco();
    const { ex, pedidos } = criar(db, campanha(['Ana']));
    await ex.iniciar();
    expect(tipos(pedidos)).toEqual(['abrirEColar']);
    await ex.aoReceberEvento(detectado('Ana'));
    let c = (await lerCampanha(db, 'camp'))!;
    expect(c.itens[0]).toMatchObject({ status: 'pendente', progresso: { textoEnviado: true, anexosEnviados: 0 } });
    expect(pedidos[1]).toMatchObject({ tipo: 'colarAnexo', nome: 'Ana', indice: 0, total: 2, arquivo: { nome: 'foto.jpg', tipo: 'image/jpeg' } });
    expect(Object.keys(pedidos[1])).not.toContain('legenda');
    expect(new TextDecoder().decode(base64ParaBytes((pedidos[1] as Extract<PedidoConteudo, { tipo: 'colarAnexo' }>).arquivo.base64))).toBe('jpg');
    await ex.aoReceberEvento(anexoOk('Ana', 0));
    expect(pedidos[2]).toMatchObject({ tipo: 'colarAnexo', indice: 1, arquivo: { nome: 'tabela.pdf' } });
    await ex.aoReceberEvento(anexoOk('Ana', 1));
    c = (await lerCampanha(db, 'camp'))!;
    expect(c.itens[0].status).toBe('enviado');
    expect(c.status).toBe('concluida');
    expect((await listarEnvios(db)).length).toBe(1);
    expect(pedidos.filter((p) => p.tipo === 'abrirEColar')).toHaveLength(1);
  });

  it('anexo que não abre a prévia: revisar, conta no freio, pausa, sem reenviar nada; retomar continua do anexo (texto NÃO duplica)', async () => {
    const db = await banco();
    let falhar = true;
    const { ex, pedidos } = criar(db, campanha(['Ana', 'Bia']), (p) => (p.tipo === 'colarAnexo' && falhar ? { ok: false, codigo: 'anexo_previa', erro: 'A prévia de mídia do WhatsApp não abriu em 8 s. Nada foi enviado.' } : { ok: true, idsAntes: [] }));
    await ex.iniciar();
    await ex.aoReceberEvento(detectado('Ana'));
    let c = (await lerCampanha(db, 'camp'))!;
    expect(c.itens[0].status).toBe('revisar');
    expect(c.itens[0].motivo).toMatch(/anexo 1: .*O texto já foi enviado/);
    expect(c.itens[0].progresso).toEqual({ textoEnviado: true, anexosEnviados: 0 });
    expect(c.problemasSeguidos).toBe(1);
    expect(c.status).toBe('pausada');
    expect(c.emVoo ?? null).toBeNull();
    // o atendente conferiu e recoloca o contato como pendente, depois retoma
    falhar = false;
    await ex.recolocarPendente('ana');
    await ex.iniciar();
    expect(pedidos.filter((p) => p.tipo === 'abrirEColar')).toHaveLength(1); // o texto NÃO foi colado de novo
    const colagens = pedidos.filter((p) => p.tipo === 'colarAnexo');
    expect(colagens).toHaveLength(2);
    expect(colagens[1]).toMatchObject({ indice: 0 });
    await ex.aoReceberEvento(anexoOk('Ana', 0));
    await ex.aoReceberEvento(anexoOk('Ana', 1));
    c = (await lerCampanha(db, 'camp'))!;
    expect(c.itens[0].status).toBe('enviado');
    expect((await listarEnvios(db)).length).toBe(1);
  });

  it('o segundo anexo falha (evento anexoFalhou): o primeiro fica registrado e a retomada manda só o segundo', async () => {
    const db = await banco();
    const { ex, pedidos } = criar(db, campanha(['Ana', 'Bia']));
    await ex.iniciar();
    await ex.aoReceberEvento(detectado('Ana'));
    await ex.aoReceberEvento(anexoOk('Ana', 0));
    await ex.aoReceberEvento({ tipo: 'vitaZap:anexoFalhou', nome: 'Ana', indice: 1, codigo: 'abriu_programar', motivo: 'abriu "Programar mensagem"', fechou: true });
    const c = (await lerCampanha(db, 'camp'))!;
    expect(c.itens[0]).toMatchObject({ status: 'revisar', progresso: { textoEnviado: true, anexosEnviados: 1 } });
    expect(c.itens[0].motivo).toMatch(/abriu_programar/);
    expect(c.status).toBe('pausada');
    await ex.recolocarPendente('ana');
    await ex.iniciar();
    expect(pedidos.filter((p) => p.tipo === 'abrirEColar')).toHaveLength(1);
    const colagens = pedidos.filter((p) => p.tipo === 'colarAnexo') as Array<Extract<PedidoConteudo, { tipo: 'colarAnexo' }>>;
    expect(colagens.map((p) => p.arquivo.nome)).toEqual(['foto.jpg', 'tabela.pdf', 'tabela.pdf']);
  });

  it('painel reaberto com o anexo em voo: vai para revisar e NADA é reenviado nem colado', async () => {
    const db = await banco();
    const c = campanha(['Ana']);
    c.itens[0] = { ...c.itens[0], progresso: { textoEnviado: true, anexosEnviados: 0 } };
    c.emVoo = { chave: 'ana', nome: 'Ana', texto: '', idsAntes: null, desde: '2026-10-19T12:59:00.000Z', anexoIndice: 0 };
    await salvarCampanha(db, c);
    const { ex, pedidos } = criar(db, c);
    expect(await ex.reconciliar()).toBe(true);
    expect(pedidos).toEqual([]);
    const lida = (await lerCampanha(db, 'camp'))!;
    expect(lida.itens[0]).toMatchObject({ status: 'revisar', progresso: { textoEnviado: true, anexosEnviados: 0 } });
    expect(lida.emVoo ?? null).toBeNull();
  });

  it('texto confirmado ao reabrir o painel (em voo do texto): continua pelos anexos, sem reenviar o texto', async () => {
    const db = await banco();
    const c = campanha(['Ana']);
    c.emVoo = { chave: 'ana', nome: 'Ana', texto: 'Oi Ana', idsAntes: ['M1'], desde: '2026-10-19T12:59:00.000Z' };
    await salvarCampanha(db, c);
    const { ex, pedidos } = criar(db, c, (p) => (p.tipo === 'consultarEnvio' ? { ok: true, situacao: 'enviado' } : { ok: true, idsAntes: [] }));
    await ex.reconciliar();
    expect((await lerCampanha(db, 'camp'))!.itens[0]).toMatchObject({ status: 'pendente', progresso: { textoEnviado: true, anexosEnviados: 0 } });
    await ex.iniciar();
    expect(pedidos.filter((p) => p.tipo === 'abrirEColar')).toHaveLength(0);
    expect(pedidos.filter((p) => p.tipo === 'colarAnexo')).toHaveLength(1);
  });

  it('arquivo ausente (backup restaurado): não inicia, não abre nem cola nada e diz para anexar de novo', async () => {
    const db = await banco(false);
    const { ex, pedidos } = criar(db, campanha(['Ana']));
    await ex.iniciar();
    expect(pedidos).toEqual([]);
    expect(ex.atual.mensagem).toMatch(/anexe de novo/);
  });

  it('em "não enviar mais" depois do texto: os anexos que faltam não saem (revisar)', async () => {
    const db = await banco();
    const { ex, pedidos } = criar(db, campanha(['Ana']));
    await ex.iniciar();
    await ex.aoReceberEvento(detectado('Ana'));
    await ex.pausar();
    const { marcarNaoEnviar } = await import('../src/shared/banco');
    await marcarNaoEnviar(db, { chave: 'ana', nome: 'Ana', desde: '2026-10-19T13:00:00.000Z', motivo: 'pediu', origem: 'manual' });
    await ex.recolocarPendente('ana'); // não faz nada: o item já é pendente
    await ex.iniciar();
    expect(pedidos.filter((p) => p.tipo === 'colarAnexo')).toHaveLength(1); // só a colagem antes do bloqueio
    expect((await lerCampanha(db, 'camp'))!.itens[0].status).toBe('revisar');
  });

  it('campanha sem anexos continua como antes (enviado direto no texto)', async () => {
    const db = await banco(false);
    const { ex, pedidos } = criar(db, campanha(['Ana'], []));
    await ex.iniciar();
    await ex.aoReceberEvento(detectado('Ana'));
    expect(tipos(pedidos)).toEqual(['abrirEColar']);
    expect((await lerCampanha(db, 'camp'))!.itens[0].status).toBe('enviado');
  });
});

describe('modo único (decisão do dono): sem legenda e sem seletor de modo', () => {
  it('o protocolo e a interface não têm legenda nem escolha de modo', () => {
    const raiz = join(__dirname, '..', 'src');
    const msgs = readFileSync(join(raiz, 'shared/mensagens.ts'), 'utf8');
    expect(/colarAnexo[^\n]*legenda/i.test(msgs)).toBe(false);
    const ui = readFileSync(join(raiz, 'sidepanel/Anexos.tsx'), 'utf8');
    expect(ui).not.toMatch(/type="radio"|<select/);
    expect(ui).toContain('EXPLICACAO_MODO_ANEXOS');
    const exec = readFileSync(join(raiz, 'content/execucao.ts'), 'utf8');
    const trecho = exec.slice(exec.indexOf('export async function colarAnexo'), exec.indexOf('export async function consultarEnvio'));
    expect(trecho).not.toMatch(/escreverNoCampo|colarComClipboard\(|acrescentarNoCampo/); // nunca escreve texto na prévia
  });
});
