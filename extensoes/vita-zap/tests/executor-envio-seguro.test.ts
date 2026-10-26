// Executor (0.7.22): marcador "em voo" persistido, reabrir o painel sem recolar, eventos do envio automático
// (bloqueado, não confirmado, observação expirada), "revisar" e freio. WhatsApp falso por função `pedir`.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, lerCampanha, listarEnvios, salvarConfig, type Banco } from '../src/shared/banco';
import type { Campanha } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { Executor } from '../src/sidepanel/executor';

let n = 0;

function campanha(nomes: string[]): Campanha {
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
  };
}

type Responder = (p: PedidoConteudo, db: Banco) => RespostaConteudo | Promise<RespostaConteudo>;

async function montarBanco(): Promise<Banco> {
  const db = await abrirBanco(`em-voo-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  return db;
}

function criar(db: Banco, c: Campanha, responder: Responder = () => ({ ok: true, idsAntes: ['M1'] })) {
  const pedidos: PedidoConteudo[] = [];
  const agendados: Array<{ fn: () => void; ms: number }> = [];
  const ex = new Executor(
    {
      db,
      pedir: async (p) => {
        pedidos.push(p);
        return responder(p, db);
      },
      agora: () => new Date('2026-10-19T13:00:00Z'), // 10h em Fortaleza, segunda
      aleatorio: () => 0.5,
      agendar: (fn, ms) => {
        agendados.push({ fn, ms });
        return () => undefined;
      },
    },
    c,
  );
  return { ex, pedidos, agendados };
}

const abertos = (pedidos: PedidoConteudo[]) => pedidos.filter((p) => p.tipo === 'abrirEColar').map((p) => (p as { nome: string }).nome);
const status = (ex: Executor, nome: string) => ex.atual.campanha.itens.find((i) => i.nome === nome)?.status;

describe('envio automático é opcional: manual por padrão', () => {
  it('o executor nasce com envioAutomatico desligado e o pedido de colar não liga o clique', async () => {
    const db = await montarBanco();
    const t = criar(db, campanha(['Ana']));
    expect(t.ex.atual.envioAutomatico).toBe(false);
    await t.ex.iniciar();
    expect(t.pedidos[0]).toMatchObject({ tipo: 'abrirEColar', envioAutomatico: false });
    t.ex.setEnvioAutomatico(true);
    expect(t.ex.atual.envioAutomatico).toBe(true);
  });
});

describe('marcador "em voo" persistido', () => {
  it('é gravado ANTES de colar (campanha, item, texto) e ganha a foto dos ids depois de colar', async () => {
    const db = await montarBanco();
    let vistoNoBanco: Campanha | undefined;
    const t = criar(db, campanha(['Ana']), async (p, banco) => {
      if (p.tipo === 'abrirEColar') vistoNoBanco = await lerCampanha(banco, 'camp');
      return { ok: true, idsAntes: ['M1', 'M2'] };
    });
    await t.ex.iniciar();
    expect(vistoNoBanco?.emVoo).toEqual({ chave: 'ana', nome: 'Ana', texto: 'Oi Ana', idsAntes: null, desde: '2026-10-19T13:00:00.000Z' });
    expect((await lerCampanha(db, 'camp'))?.emVoo).toMatchObject({ chave: 'ana', texto: 'Oi Ana', idsAntes: ['M1', 'M2'] });
  });

  it('envio detectado apaga o marcador e registra o envio', async () => {
    const db = await montarBanco();
    const t = criar(db, campanha(['Ana', 'Bia']));
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    expect((await lerCampanha(db, 'camp'))?.emVoo ?? null).toBeNull();
    expect(await listarEnvios(db)).toHaveLength(1);
  });

  it('erro antes de colar (contato não achado) apaga o marcador; erro "interno" o mantém', async () => {
    const db = await montarBanco();
    const t = criar(db, campanha(['Ana']), () => ({ ok: false, codigo: 'nao_encontrado', erro: 'não achei' }));
    await t.ex.iniciar();
    expect((await lerCampanha(db, 'camp'))?.emVoo ?? null).toBeNull();

    const db2 = await montarBanco();
    const t2 = criar(db2, campanha(['Ana']), () => ({ ok: false, codigo: 'interno', erro: 'explodiu' }));
    await t2.ex.iniciar();
    expect((await lerCampanha(db2, 'camp'))?.emVoo).toMatchObject({ chave: 'ana' });
  });

  it('Pausar: marcador some só se a caixa foi mesmo limpa (limpou:true); caixa vazia/editada o mantém', async () => {
    for (const [limpou, fica] of [[true, false], [false, true]] as const) {
      const db = await montarBanco();
      const t = criar(db, campanha(['Ana']), (p) => (p.tipo === 'limparCaixa' ? { ok: true, limpou } : { ok: true, idsAntes: ['M1'] }));
      await t.ex.iniciar();
      await t.ex.pausar();
      expect(((await lerCampanha(db, 'camp'))?.emVoo ?? null) !== null, `limpou=${limpou}`).toBe(fica);
    }
  });

  it('Pular (decisão do atendente) apaga o marcador', async () => {
    const db = await montarBanco();
    const t = criar(db, campanha(['Ana', 'Bia']));
    await t.ex.iniciar();
    await t.ex.acao('pulado');
    expect((await lerCampanha(db, 'camp'))?.emVoo?.chave).toBe('bia'); // o de Ana saiu; o de Bia é o novo
  });
});

describe('reabrir o painel com mensagem em voo: NÃO recola, consulta a conversa', () => {
  async function reaberto(situacao: RespostaConteudo | null, nomes = ['Ana', 'Bia']) {
    const db = await montarBanco();
    // painel 1: cola para Ana e "fecha" (sem desfecho)
    const t1 = criar(db, campanha(nomes));
    await t1.ex.iniciar();
    const gravada = (await lerCampanha(db, 'camp'))!;
    expect(gravada.emVoo?.chave).toBe('ana');
    // painel 2: reabre a partir do banco
    const t2 = criar(db, gravada, (p) => (p.tipo === 'consultarEnvio' ? (situacao ?? { ok: false, codigo: 'nao_pronto', erro: 'WhatsApp fechado' }) : { ok: true, idsAntes: ['M1'] }));
    return { db, t2 };
  }

  it('saiu uma mensagem nossa com o texto → enviado (registrado), sem recolar para Ana', async () => {
    const { db, t2 } = await reaberto({ ok: true, situacao: 'enviado' });
    await t2.ex.reconciliar();
    expect(t2.pedidos.map((p) => p.tipo)).toEqual(['consultarEnvio']);
    expect(t2.pedidos[0]).toEqual({ tipo: 'consultarEnvio', nome: 'Ana', texto: 'Oi Ana', idsAntes: ['M1'] });
    expect(status(t2.ex, 'Ana')).toBe('enviado');
    expect(await listarEnvios(db)).toHaveLength(1);
    expect((await lerCampanha(db, 'camp'))?.emVoo ?? null).toBeNull();
  });

  it('não achou o envio → "revisar" (nunca reenvia sozinho), e o próximo contato segue', async () => {
    const { db, t2 } = await reaberto({ ok: true, situacao: 'nao_encontrado' });
    await t2.ex.iniciar();
    expect(status(t2.ex, 'Ana')).toBe('revisar');
    expect(t2.ex.atual.campanha.itens[0].motivo).toMatch(/não reenviei/);
    expect(abertos(t2.pedidos)).toEqual(['Bia']); // jamais 'Ana' de novo
    expect(await listarEnvios(db)).toHaveLength(0);
    expect(t2.ex.atual.campanha.problemasSeguidos).toBe(0); // revisar não conta no freio
  });

  it('não deu para consultar (WhatsApp fechado) → não anda, não cola, mantém o marcador e explica', async () => {
    const { db, t2 } = await reaberto(null);
    await t2.ex.iniciar();
    expect(abertos(t2.pedidos)).toEqual([]);
    expect(t2.ex.atual.mensagem).toMatch(/Não colei nada/);
    expect(status(t2.ex, 'Ana')).toBe('pendente');
    expect((await lerCampanha(db, 'camp'))?.emVoo?.chave).toBe('ana');
    expect(t2.ex.atual.fase).toBe('parada');
  });

  it('marcador órfão (item já resolvido) é só descartado, sem consultar nada', async () => {
    const db = await montarBanco();
    const c = { ...campanha(['Ana']), emVoo: { chave: 'ana', nome: 'Ana', texto: 'Oi Ana', idsAntes: ['M1'], desde: 'x' } };
    c.itens[0] = { ...c.itens[0], status: 'enviado' };
    const t = criar(db, c);
    expect(await t.ex.reconciliar()).toBe(true);
    expect(t.pedidos).toEqual([]);
    expect(t.ex.atual.campanha.emVoo ?? null).toBeNull();
  });
});

describe('eventos do envio automático', () => {
  async function aguardando(nomes = ['Ana', 'Bia', 'Cris', 'Dani']) {
    const db = await montarBanco();
    const t = criar(db, campanha(nomes));
    t.ex.setEnvioAutomatico(true);
    await t.ex.iniciar();
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    return { db, t };
  }

  it('envioBloqueado (reconferência falhou / sem botão): item vira problema com o motivo, conta no freio e a campanha PAUSA', async () => {
    const { db, t } = await aguardando();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioBloqueado', nome: 'Ana', codigo: 'botao_enviar_ausente', motivo: 'sem botão', limpou: true });
    expect(status(t.ex, 'Ana')).toBe('problema');
    expect(t.ex.atual.campanha.itens[0].motivo).toMatch(/botao_enviar_ausente.*sem botão/);
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(1);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.fase).toBe('parada');
    expect(abertos(t.pedidos)).toEqual(['Ana']); // não abriu a Bia
    expect((await lerCampanha(db, 'camp'))?.emVoo ?? null).toBeNull();
  });

  it('envioNaoConfirmado: item vira "revisar" (pode ter saído), conta no freio e PAUSA; nunca reenvia', async () => {
    const { t } = await aguardando();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioNaoConfirmado', nome: 'Ana', motivo: 'não vi sair em 20 s' });
    expect(status(t.ex, 'Ana')).toBe('revisar');
    expect(t.ex.atual.campanha.itens[0].motivo).toMatch(/envio_nao_confirmado/);
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(1);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(abertos(t.pedidos)).toEqual(['Ana']);
  });

  it('observacaoExpirada: item vira "revisar", NÃO conta no freio, campanha pausa com aviso', async () => {
    const { t } = await aguardando();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:observacaoExpirada', nome: 'Ana' });
    expect(status(t.ex, 'Ana')).toBe('revisar');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.mensagem).toMatch(/30 min/);
  });

  it('evento de outro contato ou com a campanha parada é ignorado', async () => {
    const { t } = await aguardando();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioNaoConfirmado', nome: 'Zé', motivo: 'x' });
    expect(status(t.ex, 'Ana')).toBe('pendente');
    await t.ex.pausar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:observacaoExpirada', nome: 'Ana' });
    expect(status(t.ex, 'Ana')).toBe('pendente');
  });
});

describe('conversa sem prova de ser individual: "revisar", não conta no freio', () => {
  it('nao_confirmado marca revisar e segue; quatro seguidos NÃO pausam a campanha', async () => {
    const db = await montarBanco();
    const t = criar(db, campanha(['A1', 'A2', 'A3', 'A4', 'A5']), (p) =>
      p.tipo === 'abrirEColar' && p.nome !== 'A5' ? { ok: false, codigo: 'nao_confirmado', erro: 'sem sinal positivo' } : { ok: true, idsAntes: [] },
    );
    await t.ex.iniciar();
    for (const nome of ['A1', 'A2', 'A3', 'A4']) expect(status(t.ex, nome)).toBe('revisar');
    expect(t.ex.atual.campanha.problemasSeguidos).toBe(0);
    expect(t.ex.atual.fase).toBe('aguardando_envio');
    expect(abertos(t.pedidos)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
  });

  it('"Conferi: não saiu" recoloca um item revisar como pendente (decisão humana); "Pular" também aceita revisar', async () => {
    const db = await montarBanco();
    const t = criar(db, campanha(['Ana', 'Bia']));
    t.ex.setEnvioAutomatico(true);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioNaoConfirmado', nome: 'Ana', motivo: 'x' });
    expect(status(t.ex, 'Ana')).toBe('revisar');
    await t.ex.recolocarPendente('ana');
    expect(status(t.ex, 'Ana')).toBe('pendente');
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioNaoConfirmado', nome: 'Ana', motivo: 'x' }); // parada: ignorado
    await t.ex.pularItem('bia');
    expect(status(t.ex, 'Bia')).toBe('pulado');
  });
});
