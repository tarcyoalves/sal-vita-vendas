// Motor do "Pedir à IA" (0.7.57) com WhatsApp falso, IA falsa, CRM falso e o Executor REAL das campanhas.
// Garante: só leitura; regras de público; pré-filtro antes de gastar IA; falha fechada; trava de agendamento; nada sai sozinho;
// "enviar" só por prévia + campanha comum no Executor (com a política). Banco: fake-indexeddb.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { abrirBanco, lerPedidos, listarCampanhas, listarEnvios, listarNaoEnviar, marcarNaoEnviar, salvarConfig, salvarContatos } from '../src/shared/banco';
import { type Campanha, textoDoItem } from '../src/shared/campanha';
import type { ContatoVarrido } from '../src/shared/contatos';
import { instanteNoFuso } from '../src/shared/crm-lembretes';
import type { MensagemLida, PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import type { ConferenciaIa, ConversaParaPedido, PlanoPedido } from '../src/shared/pedido-ia';
import { CONFIG_PADRAO } from '../src/shared/politica';
import type { ResultadoIa } from '../src/shared/servico-ia';
import type { ResultadoTrava } from '../src/shared/trava-agendamento';
import { Executor } from '../src/sidepanel/executor';
import { MotorPedido, type TextosDoEnvio } from '../src/sidepanel/pedido-motor';

let n = 0;
const ISO = (d: string) => new Date(`${d}T12:00:00.000Z`).toISOString();
const eu = (texto: string, d = '2026-11-02'): MensagemLida => ({ de: 'eu', texto, quando: ISO(d) });
const cli = (texto: string, d = '2026-11-03'): MensagemLida => ({ de: 'cliente', texto, quando: ISO(d) });
const SEM_RESPOSTA: MensagemLida[] = [eu('Oi, tudo bem? Como está o estoque de sal por aí?')];
const RESPONDEU: MensagemLida[] = [eu('Como está o estoque?'), cli('Tenho de sobra, obrigado')];

const PLANO: PlanoPedido = { periodoDias: 30, quemFalouPorUltimo: 'eu', respondeu: false, assunto: 'perguntei sobre estoque', termosNomeContato: [] };
const TEXTOS: TextosDoEnvio = { modo: 'meus_textos', textos: ['Oi, {nome}! Passando para saber se você viu a minha pergunta sobre o estoque.', '{nome}, tudo bem? Conseguiu ver como está o estoque por aí?'], estilo: '' };

const contato = (nome: string, extra: Partial<ContatoVarrido> = {}): ContatoVarrido => ({
  chave: nome.toLowerCase(), nome, rotuloData: '02/11/2026', ultimaConversa: '2026-11-02', revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, ultimaDeMim: true, duplicado: false, varridoEm: '2026-11-17T12:00:00.000Z', ...extra,
});

type Conversa = { mensagens: MensagemLida[]; telefone?: string } | { erro: string; codigo: Extract<RespostaConteudo, { ok: false }>['codigo'] };

interface Opcoes {
  /** o que a IA responde por primeiro nome */
  confere?: Record<string, Partial<ConferenciaIa>>;
  iaOff?: boolean;
  cobrancaIa?: (nome: string) => ResultadoIa<string>;
  ajustes?: Record<string, Partial<ContatoVarrido>>;
}

async function montar(contatos: Record<string, Conversa>, opcoes: Opcoes = {}) {
  const db = await abrirBanco(`pedido-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  let agora = new Date('2026-11-17T13:00:00.000Z'); // terça 10h em Fortaleza
  await salvarContatos(db, Object.keys(contatos).map((nome) => contato(nome, opcoes.ajustes?.[nome])));

  const pedidos: PedidoConteudo[] = [];
  const colados: Array<{ nome: string; texto: string; envioAutomatico: boolean | undefined }> = [];
  const paraIa: ConversaParaPedido[][] = [];
  const planosIa: PlanoPedido[] = [];
  const escritas: Array<{ nome: string; mensagemCampanha: string; tentativa: number; estilo?: { estilo: string; exemplos: string[] } }> = [];
  const lembretes: Array<{ nome: string; venceEm: number }> = [];
  const travas = { agendamentos: new Map<string, number>(), fora: false };
  const estado = { iaOff: opcoes.iaOff === true, lembreteErro: null as string | null, parar: false };
  const agendados: Array<{ fn: () => void; ms: number }> = [];

  const pedir = async (p: PedidoConteudo): Promise<RespostaConteudo> => {
    pedidos.push(p);
    if (p.tipo === 'lerConversa') {
      const c = contatos[p.nome];
      if (c === undefined) return { ok: false, codigo: 'nao_encontrado', erro: `"${p.nome}" não apareceu` };
      if ('erro' in c) return { ok: false, codigo: c.codigo, erro: c.erro };
      return { ok: true, mensagens: c.mensagens, ...(c.telefone ? { telefone: c.telefone } : {}) };
    }
    if (p.tipo === 'abrirEColar') {
      colados.push({ nome: p.nome, texto: p.texto, envioAutomatico: p.envioAutomatico });
      return { ok: true, idsAntes: [] };
    }
    return { ok: true };
  };

  const ia = {
    async interpretarPedido(): Promise<never> {
      throw new Error('não deveria ser chamado aqui');
    },
    async conferirPedido(plano: PlanoPedido, cs: ConversaParaPedido[]): Promise<ResultadoIa<ConferenciaIa[]>> {
      paraIa.push(cs);
      planosIa.push(plano);
      if (estado.iaOff) return { ok: false, erro: { tipo: 'servidor', mensagem: 'A IA está indisponível agora' } };
      return {
        ok: true,
        valor: cs.map((c) => ({ ref: c.ref, corresponde: true, motivo: `Perguntei sobre estoque em 02/11; sem resposta (${c.primeiroNome})`, confianca: 'alta' as const, pediuParaSair: false, revisar: false, ...(opcoes.confere?.[c.primeiroNome] ?? {}) })),
      };
    },
    async escreverCobranca(nome: string, mensagemCampanha: string, tentativa: 1 | 2 | 3, estilo?: { estilo: string; exemplos: string[] }): Promise<ResultadoIa<string>> {
      escritas.push({ nome, mensagemCampanha, tentativa, estilo });
      return opcoes.cobrancaIa?.(nome) ?? { ok: true, valor: `Oi, ${nome}! Faz um tempinho que perguntei do estoque, conseguiu ver?` };
    },
  };

  const travar = async (cs: ReadonlyArray<{ nome: string; chave: string }>): Promise<ResultadoTrava[]> =>
    cs.map((c): ResultadoTrava => {
      if (travas.fora) return { tipo: 'indisponivel', motivo: 'CRM indisponível (teste)' };
      const ate = travas.agendamentos.get(c.chave);
      return ate != null && ate > agora.getTime() ? { tipo: 'agendado', ate, taskId: 1, titulo: c.nome, como: 'nome', motivo: 'agendado para 20/12 (o agendamento prevalece)' } : { tipo: 'livre' };
    });

  const motor = new MotorPedido({
    db,
    pedir,
    ia: ia as never,
    travar,
    criarLembrete: async (nome, venceEm) => {
      lembretes.push({ nome, venceEm });
      return estado.lembreteErro;
    },
    agora: () => agora,
    aleatorio: () => 0.5,
    esperar: async () => undefined,
  });

  const criarExecutor = (campanha: Campanha) =>
    new Executor(
      { db, pedir, agora: () => agora, aleatorio: () => 0.5, agendar: (fn, ms) => { agendados.push({ fn, ms }); return () => undefined; }, obterEnvioAutomatico: () => false, trava: async (item) => (await travar([{ nome: item.nome, chave: item.chave }]))[0] },
      campanha,
    );

  const contatosAtuais = async () => (await import('../src/shared/banco')).listarContatos(db);
  const rodar = async (plano: PlanoPedido = PLANO, texto = 'Filtre os clientes a quem perguntei sobre estoque e que não responderam', op: { parar?: () => boolean } = {}) => motor.rodar(texto, plano, await contatosAtuais(), op);
  return {
    db, motor, pedidos, colados, paraIa, planosIa, escritas, lembretes, travas, estado, agendados, rodar, criarExecutor,
    agora: () => agora,
    avancar: (ms: number) => { agora = new Date(agora.getTime() + ms); },
    ultimo: async () => (await lerPedidos(db)).ultimo!,
    item: async (nome: string) => (await lerPedidos(db)).ultimo!.itens.find((i) => i.nome === nome)!,
  };
}

const conv = (mensagens: MensagemLida[], telefone?: string): Conversa => ({ mensagens, ...(telefone ? { telefone } : {}) });

describe('rodar: só leitura, regras de público e pré-filtro antes da IA', () => {
  it('lê só as candidatas, descarta pelo plano sem gastar IA e manda à IA só primeiro nome + mensagens', async () => {
    const t = await montar({
      'CLIENTE Ana': conv(SEM_RESPOSTA, '5584999990000'),
      'CLIENTE Bia': conv(RESPONDEU),
      'CLIENTE Caio': conv(SEM_RESPOSTA),
      'Grupo Padarias': conv(SEM_RESPOSTA),
      'CLIENTE Opt': conv(SEM_RESPOSTA),
    }, { ajustes: { 'Grupo Padarias': { pareceGrupo: true }, 'CLIENTE Caio': { ultimaDeMim: false } } });
    await marcarNaoEnviar(t.db, { chave: 'cliente opt', nome: 'CLIENTE Opt', desde: '2026-11-01T00:00:00.000Z', motivo: 'teste' });
    const r = await t.rodar();
    // Bia: lida, mas o cliente respondeu (descartada pelo plano, sem IA). Caio: a lista já mostrava o cliente por último (nem lida). Grupo/opt-out: nunca.
    expect(t.pedidos.filter((p) => p.tipo === 'lerConversa').map((p) => (p as { nome: string }).nome).sort()).toEqual(['CLIENTE Ana', 'CLIENTE Bia']);
    expect(t.pedidos.every((p) => p.tipo === 'lerConversa')).toBe(true); // só leitura: nenhum abrirEColar, nenhum clique
    expect(t.paraIa).toHaveLength(1);
    expect(t.paraIa[0]).toHaveLength(1); // só a Ana foi à IA
    expect(t.paraIa[0][0]).toMatchObject({ ref: 'c1', primeiroNome: 'Ana' });
    const corpo = JSON.stringify(t.paraIa);
    expect(corpo).not.toMatch(/5584999990000|chave|CLIENTE/);
    expect(t.planosIa[0]).toEqual(PLANO);
    expect(r.lidas).toBe(2);
    expect(r.descartadas).toBe(1);
    expect(r.itens.map((i) => i.nome)).toEqual(['CLIENTE Ana']);
    expect(r.itens[0]).toMatchObject({ corresponde: true, confianca: 'alta', marcado: true, estado: 'aberto', trava: { tipo: 'livre' } });
    expect(r.itens[0].motivo).toMatch(/Perguntei sobre estoque em 02\/11/);
    expect(Object.fromEntries(r.fora)).toMatchObject({ 'grupo ou possível grupo': 1, 'marcado "Não enviar mais"': 1, 'a lista mostra o cliente falando por último': 1 });
  });

  it('o resultado fica salvo (e o pedido nos "pedidos salvos", sem duplicar quando repete)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA) });
    await t.rodar();
    await t.rodar();
    const e = await lerPedidos(t.db);
    expect(e.ultimo?.itens).toHaveLength(1);
    expect(e.salvos).toHaveLength(1);
    expect(e.salvos[0]).toMatchObject({ vezes: 2, plano: PLANO });
  });

  it('confiança baixa vem desmarcada; "revisar" da IA e identidade da conversa não conferida (falha fechada) também', async () => {
    const t = await montar({
      'CLIENTE Ana': conv(SEM_RESPOSTA),
      'CLIENTE Bia': conv(SEM_RESPOSTA),
      'CLIENTE Caio': conv(SEM_RESPOSTA),
      'CLIENTE Dora': { erro: 'A conversa aberta não é "CLIENTE Dora"', codigo: 'nome_diferente' as never },
      'CLIENTE Eva': conv(SEM_RESPOSTA),
    }, { confere: { Bia: { confianca: 'baixa' }, Caio: { corresponde: false, revisar: true, motivo: 'Revisar: a IA não devolveu uma conferência válida', confianca: 'baixa' }, Eva: { corresponde: false } } });
    const r = await t.rodar();
    const por = Object.fromEntries(r.itens.map((i) => [i.nome, i]));
    expect(por['CLIENTE Ana']).toMatchObject({ marcado: true, revisar: false });
    expect(por['CLIENTE Bia']).toMatchObject({ corresponde: true, confianca: 'baixa', marcado: false });
    expect(por['CLIENTE Caio']).toMatchObject({ corresponde: false, revisar: true, marcado: false });
    expect(por['CLIENTE Dora']).toMatchObject({ corresponde: false, revisar: true, marcado: false });
    expect(por['CLIENTE Dora'].motivo).toMatch(/Revisar: A conversa aberta/);
    expect(por['CLIENTE Eva']).toBeUndefined(); // a IA disse que não corresponde: some da lista (conta em "descartadas")
    expect(r.descartadas).toBe(1);
    // ordem: melhores primeiro, "revisar" por último
    expect(r.itens.map((i) => i.nome)).toEqual(['CLIENTE Ana', 'CLIENTE Bia', 'CLIENTE Caio', 'CLIENTE Dora']);
  });

  it('IA fora do ar: nada vira "corresponde"; fica contado como sem conferir, com aviso', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) }, { iaOff: true });
    const r = await t.rodar();
    expect(r.itens).toHaveLength(0);
    expect(r.semConferir).toBe(2);
    expect(r.avisos.join(' ')).toMatch(/A IA não respondeu.*sem conferir/);
  });

  it('erro geral do WhatsApp (seletor/não pronto/ocupado) para a rodada; "Parar" também', async () => {
    const t = await montar({ 'CLIENTE Ana': { erro: 'WhatsApp Web não carregou', codigo: 'nao_pronto' }, 'CLIENTE Bia': conv(SEM_RESPOSTA) });
    const r = await t.rodar();
    expect(r.lidas).toBe(0);
    expect(r.avisos[0]).toMatch(/WhatsApp Web não carregou/);
    expect(t.paraIa).toHaveLength(0);
    const t2 = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) });
    const r2 = await t2.rodar(PLANO, 'x', { parar: () => true });
    expect(r2.lidas).toBe(0);
    expect(r2.avisos.join(' ')).toMatch(/Parado por você/);
    expect(r2.semConferir).toBe(2);
  });

  it('plano inválido não lê nada; nenhuma candidata explica o porquê', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA) });
    const r = await t.rodar({ ...PLANO, assunto: '' });
    expect(r.avisos[0]).toMatch(/Plano incompleto/);
    expect(t.pedidos).toHaveLength(0);
    const r2 = await t.rodar({ ...PLANO, termosNomeContato: ['zzz'] });
    expect(r2.candidatos).toBe(0);
    expect(r2.avisos[0]).toMatch(/Nenhuma conversa da lista serve/);
    expect(t.pedidos).toHaveLength(0);
  });

  it('trava de agendamento: o item aparece marcado "agendado para dd/MM", desmarcado, e não pode receber mensagem', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) });
    t.travas.agendamentos.set('cliente ana', t.agora().getTime() + 30 * 86_400_000);
    await t.rodar();
    const ana = await t.item('CLIENTE Ana');
    expect(ana.trava).toMatchObject({ tipo: 'agendado', motivo: 'agendado para 20/12 (o agendamento prevalece)' });
    expect(ana.marcado).toBe(false);
    expect((await t.item('CLIENTE Bia')).trava.tipo).toBe('livre');
  });

  it('CRM fora do ar na trava: o item entra marcado como "não consegui conferir" (e não envia)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA) });
    t.travas.fora = true;
    await t.rodar();
    const ana = await t.item('CLIENTE Ana');
    expect(ana.trava.tipo).toBe('indisponivel');
    expect(ana.marcado).toBe(false);
  });

  it('lote de 10: 23 conversas viram 3 chamadas à IA', async () => {
    const todas: Record<string, Conversa> = {};
    for (let i = 0; i < 23; i++) todas[`CLIENTE C${String(i).padStart(2, '0')}`] = conv(SEM_RESPOSTA);
    const t = await montar(todas);
    const r = await t.rodar();
    expect(t.paraIa.map((l) => l.length)).toEqual([10, 10, 3]);
    expect(r.itens).toHaveLength(23);
  });
});

describe('ações por item e em lote (nada envia)', () => {
  it('"Não enviar mais" grava a lista de bloqueio; "Ignorar" só tira; marcar persiste', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA), 'CLIENTE Caio': conv(SEM_RESPOSTA) });
    await t.rodar();
    expect(await t.motor.naoEnviarMais(['cliente ana'])).toBe(1);
    await t.motor.ignorar(['cliente bia']);
    await t.motor.marcar('cliente caio', false);
    expect((await listarNaoEnviar(t.db)).map((x) => x.chave)).toEqual(['cliente ana']);
    expect((await t.item('CLIENTE Ana')).estado).toBe('nao_enviar');
    expect((await t.item('CLIENTE Bia')).estado).toBe('ignorado');
    expect(await t.item('CLIENTE Caio')).toMatchObject({ estado: 'aberto', marcado: false });
    // já decidido: não volta a mudar
    expect(await t.motor.naoEnviarMais(['cliente bia'])).toBe(0);
  });

  it('"Agendar no CRM": lembrete às 9h daqui a N dias (Fortaleza), sem mensagem; erro do CRM não marca como feito', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) });
    await t.rodar();
    const r = await t.motor.agendar(['cliente ana'], 15);
    expect(r).toEqual({ feitos: 1, erros: [] });
    expect(t.lembretes).toEqual([{ nome: 'CLIENTE Ana', venceEm: instanteNoFuso('2026-12-02', 9, 0) }]);
    expect((await t.item('CLIENTE Ana')).estado).toBe('agendado');
    t.estado.lembreteErro = 'CRM fora do ar';
    const r2 = await t.motor.agendar(['cliente bia'], 'abc'); // dias inválidos: padrão 7
    expect(r2.feitos).toBe(0);
    expect(r2.erros).toEqual([{ nome: 'CLIENTE Bia', erro: 'CRM fora do ar' }]);
    expect(t.lembretes[1].venceEm).toBe(instanteNoFuso('2026-11-24', 9, 0));
    expect((await t.item('CLIENTE Bia')).estado).toBe('aberto');
    expect(t.colados).toHaveLength(0);
  });

  it('não agenda quem já tem agendamento no CRM', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA) });
    t.travas.agendamentos.set('cliente ana', t.agora().getTime() + 30 * 86_400_000);
    await t.rodar();
    const r = await t.motor.agendar(['cliente ana'], 7);
    expect(r.feitos).toBe(0);
    expect(r.erros[0].erro).toMatch(/agendado para/);
    expect(t.lembretes).toHaveLength(0);
  });
});

describe('Enviar mensagem: prévia obrigatória e Executor das campanhas', () => {
  it('a prévia traz o texto exato, não grava nada e não manda nada', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) });
    await t.rodar();
    const p = await t.motor.montarPrevia(['cliente ana', 'cliente bia'], TEXTOS);
    expect(p.erro).toBeNull();
    expect(p.itens).toHaveLength(2);
    for (const i of p.itens) {
      expect(i.origem).toBe('meus_textos');
      expect(i.texto).toMatch(new RegExp(`${i.primeiroNome}`));
      expect(i.texto).not.toMatch(/\{/);
      expect(i.modelo).toContain('{primeiroNome}');
    }
    expect(await listarCampanhas(t.db)).toHaveLength(0);
    expect(t.colados).toHaveLength(0);
    expect((await t.item('CLIENTE Ana')).estado).toBe('aberto');
  });

  it('texto do dono inválido (sem {nome}, com link ou preço, termo proibido) não monta prévia', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA) });
    await t.rodar();
    for (const ruim of ['Oi! Veja o estoque.', 'Oi, {nome}! Veja www.salvita.com.br agora', 'Oi, {nome}! Sal por R$ 10 o saco', 'Oi, {nome}! Nosso sal é natural e puro, quer ver?']) {
      const p = await t.motor.montarPrevia(['cliente ana'], { ...TEXTOS, textos: [ruim] });
      expect(p.itens, ruim).toHaveLength(0);
      expect(p.erro, ruim).toMatch(/Escreva pelo menos um texto seu/);
    }
  });

  it('confere DE NOVO na hora: Não enviar mais, trava (consulta nova), pediu para sair, revisar, sem primeiro nome e leitura de mais de 12 h ficam de fora', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA), 'CLIENTE Caio': conv(SEM_RESPOSTA), 'CLIENTE Dora': conv(SEM_RESPOSTA), '11 99999-0000 Rua': conv(SEM_RESPOSTA) }, { confere: { Caio: { pediuParaSair: true } } });
    await t.rodar();
    await marcarNaoEnviar(t.db, { chave: 'cliente ana', nome: 'CLIENTE Ana', desde: t.agora().toISOString(), motivo: 'depois da leitura' });
    t.travas.agendamentos.set('cliente bia', t.agora().getTime() + 20 * 86_400_000); // agendou DEPOIS de ler
    const todas = ['cliente ana', 'cliente bia', 'cliente caio', 'cliente dora', '11 99999-0000 rua'];
    const p = await t.motor.montarPrevia(todas, TEXTOS);
    const motivos = Object.fromEntries(p.excluidos.map((x) => [x.nome, x.motivo]));
    expect(motivos['CLIENTE Ana']).toMatch(/Não enviar mais/);
    expect(motivos['CLIENTE Bia']).toMatch(/agendado para 20\/12/);
    expect(motivos['CLIENTE Caio']).toMatch(/não receber mais/);
    expect(p.itens.map((i) => i.nome)).toContain('CLIENTE Dora');
    // 13 horas depois a leitura não vale mais
    t.avancar(13 * 3_600_000);
    const p2 = await t.motor.montarPrevia(['cliente dora'], TEXTOS);
    expect(p2.itens).toHaveLength(0);
    expect(p2.excluidos[0].motivo).toMatch(/12 horas/);
  });

  it('falha ao conferir a trava na hora (CRM fora) = ninguém entra', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA) });
    await t.rodar();
    t.travas.fora = true;
    const p = await t.motor.montarPrevia(['cliente ana'], TEXTOS);
    expect(p.itens).toHaveLength(0);
    expect(p.excluidos[0].motivo).toMatch(/não consegui conferir os agendamentos/);
  });

  it('"IA no meu estilo": usa o estilo e os textos do dono; texto da IA recusado (link/preço) cai para um texto do dono', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) }, {
      cobrancaIa: (nome) => (nome === 'Bia' ? { ok: true, valor: 'Oi, Bia! Veja www.salvita.com.br' } : { ok: true, valor: `Oi, ${nome}! Faz um tempinho que perguntei do estoque, conseguiu ver?` }),
    });
    await t.rodar();
    const p = await t.motor.montarPrevia(['cliente ana', 'cliente bia'], { ...TEXTOS, modo: 'ia_estilo', estilo: 'curto e simpático, trate por você' });
    expect(t.escritas[0]).toEqual({ nome: 'Ana', mensagemCampanha: 'perguntei sobre estoque', tentativa: 1, estilo: { estilo: 'curto e simpático, trate por você', exemplos: TEXTOS.textos } });
    const por = Object.fromEntries(p.itens.map((i) => [i.nome, i]));
    expect(por['CLIENTE Ana']).toMatchObject({ origem: 'ia_estilo' });
    expect(por['CLIENTE Bia'].origem).toBe('meus_textos');
    expect(TEXTOS.textos.map((x) => x.replace('{nome}', 'Bia'))).toContain(por['CLIENTE Bia'].texto);
  });

  it('IA de texto fora do ar: usa os textos do dono (nunca genérico) e para de insistir', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) }, { cobrancaIa: () => ({ ok: false, erro: { tipo: 'servidor', mensagem: 'fora' } }) });
    await t.rodar();
    const p = await t.motor.montarPrevia(['cliente ana', 'cliente bia'], { ...TEXTOS, modo: 'ia_estilo', estilo: '' });
    expect(p.itens.every((i) => i.origem === 'meus_textos')).toBe(true);
    expect(t.escritas).toHaveLength(1);
  });

  it('aprovada a prévia: campanha COMUM (sem tipo), parada, com o texto da prévia; o item sai de "aberto"', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) });
    await t.rodar();
    const p = await t.motor.montarPrevia(['cliente ana', 'cliente bia'], TEXTOS);
    const c = await t.motor.criarCampanha(p);
    expect(c).not.toBeNull();
    const salvas = await listarCampanhas(t.db);
    expect(salvas).toHaveLength(1);
    expect(salvas[0].tipo).toBeUndefined();
    expect(salvas[0]).toMatchObject({ status: 'pausada', termoBusca: 'pedir à IA' });
    expect(salvas[0].itens.map((i) => textoDoItem(i))).toEqual(p.itens.map((i) => i.texto));
    expect((await t.item('CLIENTE Ana')).estado).toBe('na_campanha');
    expect(t.colados).toHaveLength(0); // nada foi colado nem enviado: quem inicia é o dono, na aba 3
    expect(await listarEnvios(t.db)).toHaveLength(0);
    // a mesma prévia aprovada de novo não duplica
    expect(await t.motor.criarCampanha(p)).toBeNull();
  });

  it('o Executor REAL conduz: cola o texto da prévia SEM enviar (o dono aperta o Enter) e a trava de agendamento posterior pausa antes de abrir o contato', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA), 'CLIENTE Bia': conv(SEM_RESPOSTA) });
    await t.rodar();
    const p = await t.motor.montarPrevia(['cliente ana', 'cliente bia'], TEXTOS);
    const campanha = (await t.motor.criarCampanha(p)) as Campanha;
    t.travas.agendamentos.set('cliente ana', t.agora().getTime() + 40 * 86_400_000); // o dono agendou entre a prévia e o envio
    const ex = t.criarExecutor(campanha);
    await ex.iniciar();
    // com envio manual a primeira conferência de trava vem antes de abrir a conversa: a Ana (agendada) não é aberta
    expect(ex.atual.campanha.itens[0]).toMatchObject({ nome: 'CLIENTE Ana', status: 'pulado', motivo: 'agendado para 20/12 (o agendamento prevalece)' });
    expect(t.colados).toEqual([{ nome: 'CLIENTE Bia', texto: p.itens[1].texto, envioAutomatico: false }]);
    expect(ex.atual.fase).toBe('aguardando_envio'); // espera o Enter do dono: nada foi enviado
    expect(await listarEnvios(t.db)).toHaveLength(0);
  });

  it('a política vale: quem recebeu campanha há menos de 14 dias é pulado pelo Executor, não por este painel', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(SEM_RESPOSTA) });
    await t.rodar();
    const p = await t.motor.montarPrevia(['cliente ana'], TEXTOS);
    const campanha = (await t.motor.criarCampanha(p)) as Campanha;
    const { registrarEnvio } = await import('../src/shared/banco');
    await registrarEnvio(t.db, { campanhaId: 'antiga', chave: 'cliente ana', nome: 'CLIENTE Ana', enviadoEm: new Date(t.agora().getTime() - 3 * 86_400_000).toISOString(), textoConfere: true });
    const ex = t.criarExecutor(campanha);
    await ex.iniciar();
    expect(t.colados).toHaveLength(0);
    expect(ex.atual.campanha.itens[0]).toMatchObject({ status: 'pulado', motivo: 'recebeu outra campanha recentemente' });
  });
});
