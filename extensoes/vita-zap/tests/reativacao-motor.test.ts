// Motor da reativação com WhatsApp falso, IA falsa, CRM falso e o Executor REAL das campanhas: lê a última conversa (só
// leitura), decide, guarda o resumo no CRM e manda a mensagem do dono pelo MESMO Executor (teto, horário, intervalo, freio,
// opt-out, trava de agendamento antes de abrir cada contato). Banco: fake-indexeddb.

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  abrirBanco,
  listarAcoesIa,
  listarJulgamentos,
  listarCampanhas,
  listarEnvios,
  listarFollowups,
  listarNaoEnviar,
  listarReativacoes,
  marcarNaoEnviar,
  registrarEnvio,
  salvarConfig,
  salvarConfigReativacao,
  salvarContatos,
  salvarFollowups,
  salvarReativacoes,
} from '../src/shared/banco';
import { type Campanha, textoDoItem } from '../src/shared/campanha';
import type { ContatoVarrido } from '../src/shared/contatos';
import { instanteNoFuso } from '../src/shared/crm-lembretes';
import type { ClassificacaoIa } from '../src/shared/followup';
import type { MensagemLida, PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import { CONFIG_REATIVACAO_PADRAO, MOTIVO_TRAVA_PREFIXO, assinaturaReativacao, novoRegistro, type AvaliacaoReativacao, type ConfigReativacao, type DecisaoReativacao } from '../src/shared/reativacao';
import type { PedidoRegistroReativacao, ResultadoRegistroReativacao } from '../src/shared/servico-agendamentos';
import type { ConversaParaIa, ResultadoIa } from '../src/shared/servico-ia';
import type { ResultadoTrava } from '../src/shared/trava-agendamento';
import { Executor } from '../src/sidepanel/executor';
import { MotorReativacao } from '../src/sidepanel/reativacao-motor';

let n = 0;
const TEXTOS1 = ['Oi, {nome}! Faz um tempinho que não nos falamos. Precisa de sal?', '{nome}, tudo bem? Passando para saber se precisa de sal por aí.'];
const TEXTOS2 = ['{nome}, só reforçando: estou à disposição para o que precisar de sal.'];
const TEXTOS3 = ['Oi, {nome}! Deixo meu contato aberto, é só chamar.'];
const CONFIG: ConfigReativacao = { ...CONFIG_REATIVACAO_PADRAO, ligado: true, automatico: 'ligado', placarAprovado: true, confirmouRisco: true, textos1: TEXTOS1, textos2: TEXTOS2, textos3: TEXTOS3 };

const ISO = (d: string) => new Date(`${d}T12:00:00.000Z`).toISOString();
const eu = (texto: string, quando = ISO('2026-10-20')): MensagemLida => ({ de: 'eu', texto, quando });
const cli = (texto: string, quando = ISO('2026-10-20')): MensagemLida => ({ de: 'cliente', texto, quando });
const CONVERSA_NORMAL: MensagemLida[] = [eu('Oi, tudo bem? Segue o pedido de 40 sacos.'), cli('Recebi, obrigado!'), eu('Qualquer coisa me chama.')];

const contato = (nome: string, extra: Partial<ContatoVarrido> = {}): ContatoVarrido => ({
  chave: nome.toLowerCase(),
  nome,
  rotuloData: '20/10/2026',
  ultimaConversa: '2026-10-20', // 28 dias antes de 17/11
  revisarData: null,
  soNumero: false,
  pareceGrupo: false,
  temConversa: true,
  ultimaDeMim: true,
  duplicado: false,
  varridoEm: '2026-11-17T12:00:00.000Z',
  ...extra,
});

type Conversa = { mensagens: MensagemLida[]; telefone?: string } | { erro: string; codigo: Extract<RespostaConteudo, { ok: false }>['codigo'] };

interface Opcoes {
  /** decisão da IA por primeiro nome */
  decisao?: Record<string, { decisao: DecisaoReativacao; diasSugeridos?: number; resumo?: string }>;
  iaOff?: boolean;
  crm?: (p: PedidoRegistroReativacao) => ResultadoRegistroReativacao;
  classifica?: (c: ConversaParaIa) => ClassificacaoIa;
  cobrancaIa?: boolean;
}

async function montar(contatos: Record<string, Conversa>, opcoes: Opcoes = {}, ajustes: Partial<ContatoVarrido> = {}) {
  const db = await abrirBanco(`reativacao-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  await salvarConfigReativacao(db, CONFIG); // modo Ligado: só ele deixa o Executor enviar (v0.7.59)
  let agora = new Date('2026-11-17T13:00:00.000Z'); // terça 10h em Fortaleza
  const conversas: Record<string, Conversa> = { ...contatos };
  const lista = Object.keys(contatos).map((nome) => contato(nome, ajustes));
  await salvarContatos(db, lista);

  const pedidos: PedidoConteudo[] = [];
  const colados: Array<{ nome: string; texto: string; envioAutomatico: boolean | undefined }> = [];
  const enviadosParaIa: Array<{ ref: string; primeiroNome: string; diasSemConversa: number; mensagens: unknown[] }> = [];
  const chamadasEscrever: Array<{ nome: string; etapa: number; estilo?: { estilo: string; exemplos: string[] }; contexto?: string; mensagemCampanha: string }> = [];
  const pedidosCrm: PedidoRegistroReativacao[] = [];
  const lembretes: Array<{ nome: string; venceEm: number }> = [];
  const travas = { agendamentos: new Map<string, number>(), fora: false, consultas: [] as Array<{ chaves: string[]; forcar: boolean; telefones: Array<string | null | undefined> }> };
  const agendados: Array<{ fn: () => void; ms: number }> = [];
  const est = { iaOff: opcoes.iaOff === true, cobrancaIa: opcoes.cobrancaIa !== false };

  const pedir = async (p: PedidoConteudo): Promise<RespostaConteudo> => {
    pedidos.push(p);
    if (p.tipo === 'lerConversa') {
      const c = conversas[p.nome];
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
    async avaliarReativacao(cs: Array<{ ref: string; primeiroNome: string; diasSemConversa: number; mensagens: unknown[] }>): Promise<ResultadoIa<AvaliacaoReativacao[]>> {
      enviadosParaIa.push(...cs);
      if (est.iaOff) return { ok: false, erro: { tipo: 'servidor', mensagem: 'A IA está indisponível agora' } };
      return {
        ok: true,
        valor: cs.map((c) => {
          const d = opcoes.decisao?.[c.primeiroNome] ?? { decisao: 'precisa_agora' as const };
          return { ref: c.ref, decisao: d.decisao, resumo: d.resumo ?? `Resumo de ${c.primeiroNome}: pediu 40 sacos em setembro.`, ...(d.diasSugeridos != null ? { diasSugeridos: d.diasSugeridos } : {}) };
        }),
      };
    },
    async classificarRespostas(cs: ConversaParaIa[]): Promise<ResultadoIa<ClassificacaoIa[]>> {
      return { ok: true, valor: cs.map((c) => opcoes.classifica?.(c) ?? { ref: c.ref, classe: 'pediu_preco', precisaAtencao: true, resumo: 'Pediu o preço', sugestao: 'Oi! Já te passo o valor. Qual a quantidade?' }) };
    },
    async escreverCobranca(primeiroNome: string, mensagemCampanha: string, etapa: 1 | 2 | 3, estilo?: { estilo: string; exemplos: string[] }, contexto?: 'reativacao'): Promise<ResultadoIa<string>> {
      chamadasEscrever.push({ nome: primeiroNome, etapa, estilo, contexto, mensagemCampanha });
      if (est.iaOff || !est.cobrancaIa) return { ok: false, erro: { tipo: 'servidor', mensagem: 'fora' } };
      return { ok: true, valor: `Oi, ${primeiroNome}! Faz tempo que não conversamos, precisa de sal? (etapa ${etapa})` };
    },
    async registrarReativacao(p: PedidoRegistroReativacao): Promise<ResultadoRegistroReativacao> {
      pedidosCrm.push(p);
      return opcoes.crm?.(p) ?? { ok: true, taskId: 10 + pedidosCrm.length, criou: false, agendou: p.agendarEm != null };
    },
  };

  const travar = async (cs: ReadonlyArray<{ nome: string; chave: string; telefone?: string | null }>, forcar: boolean): Promise<ResultadoTrava[]> => {
    travas.consultas.push({ chaves: cs.map((c) => c.chave), forcar, telefones: cs.map((c) => c.telefone) });
    return cs.map((c): ResultadoTrava => {
      if (travas.fora) return { tipo: 'indisponivel', motivo: 'CRM indisponível (teste)' };
      const ate = travas.agendamentos.get(c.chave);
      return ate != null && ate > agora.getTime() ? { tipo: 'agendado', ate, taskId: 1, titulo: c.nome, como: 'nome', motivo: `agendado para ${new Date(ate - 3 * 3_600_000).toISOString().slice(8, 10)}/${new Date(ate - 3 * 3_600_000).toISOString().slice(5, 7)} (o agendamento prevalece)` } : { tipo: 'livre' };
    });
  };

  const motor = new MotorReativacao({
    db,
    pedir,
    ia,
    travar,
    criarLembrete: async (nome, venceEm) => {
      lembretes.push({ nome, venceEm });
      return null;
    },
    agora: () => agora,
    aleatorio: () => 0.5,
    esperar: async () => undefined,
  });

  const contatosAtuais = () => listarContatosDb();
  const listarContatosDb = async () => (await import('../src/shared/banco')).listarContatos(db);

  const criarExecutor = (campanha: Campanha) =>
    new Executor(
      {
        db,
        pedir,
        agora: () => agora,
        aleatorio: () => 0.5,
        agendar: (fn, ms) => {
          agendados.push({ fn, ms });
          return () => undefined;
        },
        obterEnvioAutomatico: () => true,
        trava: async (item) => (await travar([{ nome: item.nome, chave: item.chave }], false))[0],
      },
      campanha,
    );

  /** Monta a campanha e roda o Executor até parar, "digitando" o Enter de cada mensagem. */
  async function enviar(config: ConfigReativacao = CONFIG): Promise<Executor | null> {
    const campanha = await motor.montarCampanha(config);
    if (!campanha) return null;
    const ex = criarExecutor(campanha);
    ex.setEnvioAutomatico(true);
    let pendente: Promise<void> = Promise.resolve();
    ex.assinar((e) => {
      pendente = pendente.then(() => motor.aplicarCampanha(e.campanha));
    });
    await ex.iniciar();
    for (let guarda = 0; guarda < 60; guarda++) {
      const e = ex.atual;
      if (e.fase === 'aguardando_envio' && e.itemAtual) {
        await ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: e.itemAtual.nome, texto: textoDoItem(e.itemAtual), textoConfere: true });
      } else if (e.fase === 'intervalo' && e.liberaEm) {
        agora = new Date(e.liberaEm + 1000);
        agendados.pop()?.fn();
        await new Promise((r) => setTimeout(r, 15));
      } else break;
    }
    await pendente;
    return ex;
  }

  const rodada = async (config: ConfigReativacao = CONFIG, opcoesRodada: { manual?: boolean } = {}) => motor.rodada(config, await contatosAtuais(), opcoesRodada);
  const registro = async (nome: string) => {
    const r = (await listarReativacoes(db)).find((x) => x.chave === nome.toLowerCase());
    if (!r) throw new Error(`sem registro de ${nome}`);
    return r;
  };

  return {
    db, motor, pedidos, colados, enviadosParaIa, chamadasEscrever, pedidosCrm, lembretes, travas, agendados, est, conversas, enviar, rodada, registro, criarExecutor, contatosAtuais,
    agora: () => agora,
    definirAgora: (iso: string) => {
      agora = new Date(iso);
    },
    leituras: () => pedidos.filter((p) => p.tipo === 'lerConversa').length,
  };
}

const conv = (mensagens: MensagemLida[], telefone?: string): Conversa => ({ mensagens, ...(telefone ? { telefone } : {}) });

describe('etapa 1: precisa_agora → mensagem do dono, pelo mesmo Executor das campanhas', () => {
  it('lê (só leitura), a IA decide, o resumo vai para o CRM e a mensagem sai pelo Executor com envio automático', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000'), 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    const r = await t.rodada();
    expect(r).toMatchObject({ lidas: 2, prontos: 2, aviso: null, parou: false });
    expect(t.pedidos.every((p) => p.tipo === 'lerConversa')).toBe(true); // "Avaliar" nunca cola nem envia
    // A IA recebe a conversa com dias desde a última, sem nome completo, telefone nem chave
    expect(t.enviadosParaIa.map((c) => c.ref)).toEqual(['c1', 'c2']);
    expect(JSON.stringify(t.enviadosParaIa)).not.toMatch(/CLIENTE|5584|chave/);
    expect(t.enviadosParaIa[0]).toMatchObject({ primeiroNome: 'Ana', diasSemConversa: 28 });
    // Contexto no CRM: resumo + decisão, ligado ao cliente pelo telefone lido da conversa
    expect(t.pedidosCrm).toHaveLength(2);
    expect(t.pedidosCrm[0]).toMatchObject({ nome: 'CLIENTE Ana', telefone: '5584999990000', agendarEm: null, criar: true });
    expect(t.pedidosCrm[0].linha).toMatch(/^Reativação 25d \(IA\): Resumo de Ana.* Decisão: retomar agora\.$/);
    expect((await t.registro('CLIENTE Ana')).crmSalvoEm).not.toBeNull();

    const ex = await t.enviar();
    expect(ex?.atual.fase).toBe('concluida');
    expect(t.colados).toHaveLength(2);
    expect(t.colados.every((c) => c.envioAutomatico === true)).toBe(true); // mesma rotina do envio automático das campanhas
    expect(TEXTOS1.map((x) => x.replace('{nome}', 'Ana'))).toContain(t.colados[0].texto); // texto do DONO, nunca genérico
    const envios = await listarEnvios(t.db);
    expect(envios).toHaveLength(2); // contam no MESMO teto diário (contarEnviosHoje olha todos os envios)
    const campanhas = await listarCampanhas(t.db);
    expect(campanhas[0].tipo).toBe('reativacao');
    const ana = await t.registro('CLIENTE Ana');
    expect(ana).toMatchObject({ estado: 'aguardando', etapa: 1, textoPronto: null });
    expect(ana.enviados).toHaveLength(1);
    expect(ana.baseConversa).toBe('2026-10-20');
  });

  it('só avalia: a mesma rodada não repete a leitura nem reenvia ninguém', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    await t.enviar();
    const lidasAntes = t.leituras();
    await t.rodada();
    expect(t.leituras()).toBe(lidasAntes); // já está aguardando (resposta só é conferida depois de 2 dias)
    expect(await t.enviar()).toBeNull();
    expect(t.colados).toHaveLength(1);
  });

  it('o intervalo entre contatos é o da política (60–120 s) e o freio de 3 problemas vale', async () => {
    const t = await montar({ 'CLIENTE Aaa': conv(CONVERSA_NORMAL), 'CLIENTE Bbb': conv(CONVERSA_NORMAL), 'CLIENTE Ccc': conv(CONVERSA_NORMAL), 'CLIENTE Ddd': conv(CONVERSA_NORMAL) });
    await t.rodada();
    const campanha = (await t.motor.montarCampanha(CONFIG)) as Campanha;
    const ex = new Executor(
      { db: t.db, pedir: async (p) => (p.tipo === 'abrirEColar' ? { ok: false, codigo: 'nao_encontrado', erro: 'não achei' } : p.tipo === 'lerConversa' ? { ok: true, mensagens: CONVERSA_NORMAL } : { ok: true }), agora: t.agora, aleatorio: () => 0.5, agendar: () => () => undefined, obterEnvioAutomatico: () => true },
      campanha,
    );
    await ex.iniciar();
    await t.motor.aplicarCampanha(ex.atual.campanha);
    expect(ex.atual.campanha.status).toBe('pausada');
    expect(ex.atual.campanha.problemasSeguidos).toBe(3);
    const estados = await Promise.all(['CLIENTE Aaa', 'CLIENTE Bbb', 'CLIENTE Ccc', 'CLIENTE Ddd'].map(async (x) => (await t.registro(x)).estado));
    expect(estados.filter((e) => e === 'precisa')).toHaveLength(3);
    expect(estados.filter((e) => e === 'pronto')).toHaveLength(1);
  });

  it('teto diário compartilhado: o que já saiu hoje (de qualquer campanha) conta, e o resto fica para amanhã', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    for (let i = 0; i < 30; i++) await registrarEnvio(t.db, { campanhaId: 'outra', chave: `x${i}`, nome: `x${i}`, enviadoEm: t.agora().toISOString(), textoConfere: true });
    await t.rodada(CONFIG, { manual: true });
    const ex = await t.enviar();
    expect(t.colados).toHaveLength(0);
    expect(ex?.atual.campanha.motivoPausa).toMatch(/teto diário/);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('pronto'); // continua na fila
  });

  it('fora do horário e domingo não abrem ninguém', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    const campanha = (await t.motor.montarCampanha(CONFIG)) as Campanha;
    const fora = new Executor({ db: t.db, pedir: async () => ({ ok: true }), agora: () => new Date('2026-11-17T22:00:00Z'), aleatorio: () => 0.5, agendar: () => () => undefined, obterEnvioAutomatico: () => true }, campanha);
    await fora.iniciar();
    expect(fora.atual.campanha.motivoPausa).toMatch(/fora do horário/);
    const dom = new Executor({ db: t.db, pedir: async () => ({ ok: true }), agora: () => new Date('2026-11-22T13:00:00Z'), aleatorio: () => 0.5, agendar: () => () => undefined, obterEnvioAutomatico: () => true }, campanha);
    await dom.iniciar();
    expect(dom.atual.campanha.motivoPausa).toMatch(/domingo/);
  });

  it('opt-out revalidado no Executor: quem foi para "Não enviar mais" depois de preparado não recebe', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL), 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    await t.rodada();
    await marcarNaoEnviar(t.db, { chave: 'cliente ana', nome: 'CLIENTE Ana', desde: t.agora().toISOString(), motivo: 'pediu' });
    await t.enviar();
    expect(t.colados.map((c) => c.nome)).toEqual(['CLIENTE Bia']);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('saiu');
  });
});

describe('etapa 1: as outras decisões NUNCA mandam mensagem', () => {
  it('precisa_mais_tempo → agendamento no CRM (hoje + dias, 9h de Fortaleza) com o resumo; sem mensagem', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') }, { decisao: { Ana: { decisao: 'precisa_mais_tempo', diasSugeridos: 45, resumo: 'Tem estoque até janeiro.' } } });
    const r = await t.rodada();
    expect(r).toMatchObject({ agendados: 1, prontos: 0 });
    expect(t.pedidosCrm[0]).toMatchObject({ agendarEm: instanteNoFuso('2027-01-01', 9, 0), criar: true, telefone: '5584999990000' });
    expect(t.pedidosCrm[0].linha).toMatch(/Tem estoque até janeiro\. Decisão: precisa de mais tempo\. Retomar em 45 dias\./);
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
    expect(t.colados).toHaveLength(0);
    expect(await t.registro('CLIENTE Ana')).toMatchObject({ estado: 'agendado', diasSugeridos: 45 });
  });

  it('aguardando_cliente é tratado como precisa_mais_tempo (agendamento com dias)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') }, { decisao: { Ana: { decisao: 'aguardando_cliente', diasSugeridos: 14 } } });
    await t.rodada();
    expect(t.pedidosCrm[0].agendarEm).toBe(instanteNoFuso('2026-12-01', 9, 0));
    expect((await t.registro('CLIENTE Ana')).estado).toBe('agendado');
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
  });

  it('agendamento que o CRM não aceita de forma definitiva (sem telefone) → "Precisa de você", nunca mensagem', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) }, { decisao: { Ana: { decisao: 'precisa_mais_tempo', diasSugeridos: 30 } }, crm: () => ({ ok: false, codigo: 'sem_telefone', mensagem: 'Sem telefone válido para criar o lead no CRM.' }) });
    const r = await t.rodada();
    expect(r.precisam).toBe(1);
    const reg = await t.registro('CLIENTE Ana');
    expect(reg.estado).toBe('precisa');
    expect(reg.motivo).toMatch(/não consegui criar o agendamento no CRM/);
    expect((await listarFollowups(t.db)).find((f) => f.id === 'reat:cliente ana')).toMatchObject({ estado: 'revisar', origem: 'reativacao' });
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
  });

  it('CRM fora do ar na hora de agendar: nada é gravado (a próxima rodada refaz) e o aviso aparece', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') }, { decisao: { Ana: { decisao: 'precisa_mais_tempo', diasSugeridos: 30 } }, crm: () => ({ ok: false, codigo: 'crm', mensagem: 'CRM indisponível (sem rede)' }) });
    const r = await t.rodada();
    expect(r.aviso).toMatch(/CRM/);
    expect(await listarReativacoes(t.db)).toHaveLength(0);
  });

  it('o CRM já tinha agendamento futuro (a trava não pegou por nome/telefone): ele prevalece e o contato fica travado', async () => {
    const ate = instanteNoFuso('2027-01-20', 9, 0);
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') }, {
      decisao: { Ana: { decisao: 'precisa_mais_tempo', diasSugeridos: 30 } },
      crm: () => ({ ok: true, taskId: 5, criou: false, agendou: false, semAgenda: 'agendamento_existente', agendamentoExistente: ate }),
    });
    const r = await t.rodada();
    expect(r.travados).toBe(1);
    expect(await t.registro('CLIENTE Ana')).toMatchObject({ estado: 'travado', agendadoPara: new Date(ate).toISOString() });
  });

  it('delicado → "Precisa de você" (a lista do Follow-up), com o resumo e sem mensagem; o resumo vai ao CRM', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) }, { decisao: { Ana: { decisao: 'delicado', resumo: 'Reclamou de atraso na entrega.' } } });
    const r = await t.rodada();
    expect(r).toMatchObject({ precisam: 1, prontos: 0 });
    const f = (await listarFollowups(t.db)).find((x) => x.id === 'reat:cliente ana');
    expect(f).toMatchObject({ estado: 'precisa', origem: 'reativacao', resumo: 'Reclamou de atraso na entrega.' });
    expect(t.pedidosCrm[0].linha).toMatch(/Reclamou de atraso/);
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
    expect(t.colados).toHaveLength(0);
  });

  it('conversa vazia/ilegível → sem_contexto: nem chama a IA, vai para "Precisa de você" (revisar)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv([]), 'CLIENTE Bia': conv([eu('', ISO('2026-10-20')), cli('', ISO('2026-10-20'))]) });
    const r = await t.rodada();
    expect(r.precisam).toBe(2);
    expect(t.enviadosParaIa).toHaveLength(0);
    const f = (await listarFollowups(t.db)).filter((x) => x.origem === 'reativacao');
    expect(f.map((x) => x.estado)).toEqual(['revisar', 'revisar']);
    expect(f[0].motivo).toMatch(/nenhuma mensagem de texto/);
  });

  it('pediu_para_sair → opt-out ("Não enviar mais"), nunca cria lead, nunca recebe mensagem', async () => {
    const t = await montar({ 'CLIENTE Ana': conv([eu('Oi!'), cli('não tenho interesse, me tira da lista')]) }, { decisao: { Ana: { decisao: 'pediu_para_sair' } } });
    const r = await t.rodada();
    expect(r.saidas).toBe(1);
    expect((await listarNaoEnviar(t.db)).map((x) => x.chave)).toEqual(['cliente ana']);
    expect(t.pedidosCrm[0].criar).toBe(false);
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
    expect((await t.registro('CLIENTE Ana')).estado).toBe('saiu');
  });

  it('grupo, nome repetido ou conversa que não confere (identidade estrita): falha fechada, "revisar", nunca mensagem', async () => {
    const t = await montar({ 'CLIENTE Grupo': { erro: '"CLIENTE Grupo" é grupo', codigo: 'grupo' }, 'CLIENTE Dup': { erro: 'mais de uma conversa', codigo: 'ambiguo' }, 'CLIENTE Outro': { erro: 'a conversa aberta não é a dele', codigo: 'cabecalho' } });
    const r = await t.rodada();
    expect(r.precisam).toBe(3);
    expect(t.enviadosParaIa).toHaveLength(0);
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
  });

  it('erro geral (WhatsApp não pronto): a rodada para sem marcar ninguém', async () => {
    const t = await montar({ 'CLIENTE Ana': { erro: 'Abra o WhatsApp Web', codigo: 'nao_pronto' }, 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    const r = await t.rodada();
    expect(r).toMatchObject({ parou: true, aviso: 'Abra o WhatsApp Web', lidas: 1 });
    expect(await listarReativacoes(t.db)).toHaveLength(0);
  });

  it('IA fora do ar: nada é gravado e a próxima rodada tenta de novo', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) }, { iaOff: true });
    const r = await t.rodada();
    expect(r.aviso).toMatch(/IA não respondeu/);
    expect(await listarReativacoes(t.db)).toHaveLength(0);
    expect(t.pedidosCrm).toHaveLength(0);
    t.est.iaOff = false;
    expect((await t.rodada()).prontos).toBe(1);
  });

  it('a conversa lida é mais recente do que a lista dizia: nada a fazer agora (e a IA nem é chamada)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv([eu('Oi', ISO('2026-11-10')), cli('Oi, tudo bem', ISO('2026-11-12'))]) });
    const r = await t.rodada();
    expect(r).toMatchObject({ recentes: 1, prontos: 0 });
    expect(t.enviadosParaIa).toHaveLength(0);
    expect(await listarReativacoes(t.db)).toHaveLength(0);
  });

  it('o resumo no CRM falhando por rede NÃO bloqueia a decisão: fica pendente e é reenviado na rodada seguinte', async () => {
    let ligado = false;
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') }, { crm: (p) => (ligado ? { ok: true, taskId: 3, criou: false, agendou: p.agendarEm != null } : { ok: false, codigo: 'crm', mensagem: 'sem rede' }) });
    await t.rodada();
    let reg = await t.registro('CLIENTE Ana');
    expect(reg.estado).toBe('pronto');
    expect(reg.crmPendente).toMatchObject({ criar: true });
    ligado = true;
    await t.rodada();
    reg = await t.registro('CLIENTE Ana');
    expect(reg.crmPendente).toBeNull();
    expect(reg.crmSalvoEm).not.toBeNull();
  });

  it('o telefone lido da conversa vai para o registro e para a trava (casamento por telefone)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') });
    await t.rodada();
    expect((await t.registro('CLIENTE Ana')).telefone).toBe('5584999990000');
    expect(t.travas.consultas.some((c) => c.telefones.includes('5584999990000'))).toBe(true);
  });
});

describe('TRAVA DE AGENDAMENTO na reativação', () => {
  it('cliente com agendamento a 60 dias NÃO é lido, avaliado nem recebe mensagem; mostra o motivo; volta quando a data passa', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL), 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    t.travas.agendamentos.set('cliente ana', t.agora().getTime() + 60 * 86_400_000);
    const r = await t.rodada();
    expect(r.travados).toBe(1);
    expect(t.pedidos.filter((p) => p.tipo === 'lerConversa').map((p) => (p as { nome: string }).nome)).toEqual(['CLIENTE Bia']); // Ana nem foi aberta
    expect(t.enviadosParaIa.map((c) => c.primeiroNome)).toEqual(['Bia']);
    const ana = await t.registro('CLIENTE Ana');
    expect(ana.estado).toBe('travado');
    expect(ana.motivo).toMatch(/^agendado para \d\d\/\d\d \(o agendamento prevalece\)$/);
    await t.enviar();
    expect(t.colados.map((c) => c.nome)).toEqual(['CLIENTE Bia']);
    // Depois que a data passa, volta a ser elegível
    t.definirAgora('2027-01-20T13:00:00.000Z'); // terça
    const depois = await t.rodada();
    expect(depois.lidas).toBeGreaterThanOrEqual(1);
    expect(t.pedidos.filter((p) => p.tipo === 'lerConversa' && (p as { nome: string }).nome === 'CLIENTE Ana')).toHaveLength(1);
    expect((await t.registro('CLIENTE Ana')).estado).not.toBe('travado');
  });

  it('CRM indisponível: ninguém é lido nem avaliado nem enviado (falha fechada), com aviso', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL), 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    t.travas.fora = true;
    const r = await t.rodada();
    expect(r).toMatchObject({ lidas: 0, semConferencia: 2 });
    expect(r.aviso).toMatch(/nada foi avaliado nem enviado/);
    expect(t.leituras()).toBe(0);
    expect(await listarReativacoes(t.db)).toHaveLength(0);
  });

  it('a lista do CRM é consultada FRESCA no começo da rodada (forçar) e de novo se o telefone for novo', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') });
    await t.rodada();
    expect(t.travas.consultas[0].forcar).toBe(true);
    expect(t.travas.consultas[1]).toMatchObject({ forcar: false, telefones: ['5584999990000'] });
  });

  it('o telefone lido da conversa pega o agendamento que o nome não pegou: vira travado e a IA nem é chamada', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') });
    // a trava só enxerga o agendamento quando recebe o telefone
    const original = t.travas.consultas;
    void original;
    let ctr = 0;
    const m2 = new MotorReativacao({
      db: t.db,
      pedir: async (p) => (p.tipo === 'lerConversa' ? { ok: true, mensagens: CONVERSA_NORMAL, telefone: '5584999990000' } : { ok: true }),
      ia: { avaliarReativacao: async () => { throw new Error('não deveria chamar a IA'); }, classificarRespostas: async () => ({ ok: true, valor: [] }), escreverCobranca: async () => ({ ok: false, erro: { tipo: 'servidor', mensagem: 'x' } }), registrarReativacao: async () => ({ ok: true, taskId: 1, criou: false, agendou: false }) },
      travar: async (cs) => cs.map((c): ResultadoTrava => (c.telefone ? { tipo: 'agendado', ate: t.agora().getTime() + 30 * 86_400_000, taskId: 1, titulo: 'x', como: 'telefone', motivo: 'agendado para 17/12 (o agendamento prevalece)' } : (ctr++, { tipo: 'livre' }))),
      criarLembrete: async () => null,
      agora: t.agora,
      aleatorio: () => 0.5,
      esperar: async () => undefined,
    });
    const r = await m2.rodada(CONFIG, await t.contatosAtuais());
    expect(r.travados).toBe(1);
    expect(ctr).toBe(1);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('travado');
  });

  it('REVALIDA antes de cada envio automático: agendamento criado depois de preparado → pulado, nada colado, registro "travado"', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL), 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    await t.rodada();
    t.travas.agendamentos.set('cliente ana', t.agora().getTime() + 30 * 86_400_000); // o atendente agendou no CRM nesse meio tempo
    await t.enviar();
    expect(t.colados.map((c) => c.nome)).toEqual(['CLIENTE Bia']);
    const ana = await t.registro('CLIENTE Ana');
    expect(ana.estado).toBe('travado');
    expect(ana.motivo?.startsWith(MOTIVO_TRAVA_PREFIXO)).toBe(true);
    const camp = (await listarCampanhas(t.db))[0];
    expect(camp.itens.find((i) => i.chave === 'cliente ana')).toMatchObject({ status: 'pulado' });
  });

  it('CRM cai na hora do envio: a campanha PAUSA ("CRM indisponível"), nada é colado e o contato continua na fila', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    t.travas.fora = true;
    const ex = await t.enviar();
    expect(t.colados).toHaveLength(0);
    expect(ex?.atual.campanha.motivoPausa).toMatch(/^CRM indisponível: não envio sem conferir os agendamentos/);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('pronto');
    // voltou: retoma e envia
    t.travas.fora = false;
    await t.enviar();
    expect(t.colados).toHaveLength(1);
  });
});

describe('a sequência 25 → 30 → 40: só para quem recebeu a anterior e NÃO respondeu', () => {
  async function comEtapa1(opcoes: Opcoes = {}) {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') }, opcoes);
    await t.rodada();
    await t.enviar();
    expect(t.colados).toHaveLength(1);
    return t;
  }
  /** O que o cliente vê na conversa depois do envio: a nossa mensagem (e, opcionalmente, algo mais). */
  const naConversa = (t: Awaited<ReturnType<typeof montar>>, mais: MensagemLida[] = []) => {
    t.conversas['CLIENTE Ana'] = conv([...CONVERSA_NORMAL, eu(t.colados[t.colados.length - 1].texto, t.agora().toISOString()), ...mais], '5584999990000');
  };

  it('etapa 2 aos 30 dias desde a última conversa (e 3 dias depois do envio): texto PRÓPRIO da etapa 2; etapa 3 aos 40 dias; depois, encerra com agendamento longo', async () => {
    const t = await comEtapa1();
    // 17/11: etapa 1. Base da conversa: 20/10. Etapa 2 = 19/11 (30 dias), mas só 3 dias depois do envio = 20/11.
    t.definirAgora('2026-11-19T13:00:00.000Z');
    naConversa(t);
    // quinta: só 2 dias desde o envio: a etapa 2 ainda não pode sair; só confere se respondeu (uma vez) e segue esperando
    expect(await t.rodada()).toMatchObject({ lidas: 1, prontos: 0 });
    expect((await t.registro('CLIENTE Ana')).estado).toBe('aguardando');
    t.definirAgora('2026-11-20T13:00:00.000Z'); // sexta
    naConversa(t);
    expect(await t.rodada()).toMatchObject({ lidas: 1, prontos: 1 });
    await t.enviar();
    expect(t.colados).toHaveLength(2);
    expect(t.colados[1].texto).toBe(TEXTOS2[0].replace('{nome}', 'Ana')); // texto próprio da etapa 2
    let ana = await t.registro('CLIENTE Ana');
    expect(ana).toMatchObject({ estado: 'aguardando', etapa: 2 });
    expect(ana.enviados.map((e) => e.etapa)).toEqual([1, 2]);

    // etapa 3 = 40 dias desde 20/10 = 29/11 (domingo): sai na segunda 30/11
    t.definirAgora('2026-11-30T13:00:00.000Z');
    naConversa(t);
    expect(await t.rodada()).toMatchObject({ lidas: 1, prontos: 1 });
    await t.enviar();
    expect(t.colados[2].texto).toBe(TEXTOS3[0].replace('{nome}', 'Ana'));
    expect((await t.registro('CLIENTE Ana')).etapa).toBe(3);

    // depois da 3ª: espera 7 dias e encerra com o agendamento longo (60 dias) no CRM
    t.definirAgora('2026-12-07T13:00:00.000Z');
    naConversa(t);
    const antes = t.pedidosCrm.length;
    expect(await t.rodada()).toMatchObject({ concluidos: 1, prontos: 0 });
    ana = await t.registro('CLIENTE Ana');
    expect(ana.estado).toBe('resolvido');
    expect(ana.motivo).toMatch(/sem resposta depois de 3/);
    expect(t.pedidosCrm[antes]).toMatchObject({ agendarEm: instanteNoFuso('2027-02-05', 9, 0), criar: false }); // 07/12 + 60 dias
    expect(t.pedidosCrm[antes].linha).toMatch(/Nova tentativa em 60 dias/);
    expect(t.colados).toHaveLength(3); // nada a mais
  });

  it('respondeu → sai da sequência e vai para a classificação do follow-up de respostas (nada de etapa 2)', async () => {
    const t = await comEtapa1();
    t.definirAgora('2026-11-20T13:00:00.000Z');
    naConversa(t, [cli('Oi! Quanto está o saco de 25kg?', t.agora().toISOString())]);
    const r = await t.rodada();
    expect(r).toMatchObject({ respostas: 1, precisam: 1, prontos: 0 });
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
    const f = (await listarFollowups(t.db)).find((x) => x.id === 'reat:cliente ana');
    expect(f).toMatchObject({ estado: 'precisa', classe: 'pediu_preco', origem: 'reativacao', sugestao: expect.stringMatching(/valor/) });
    expect(f?.cobrancas).toEqual([]); // nunca vira cobrança
    expect(await t.registro('CLIENTE Ana')).toMatchObject({ estado: 'respondeu' });
    // e não volta a ser avaliada tão cedo
    t.definirAgora('2026-11-30T13:00:00.000Z');
    naConversa(t, [cli('Oi! Quanto está o saco de 25kg?')]);
    expect((await t.rodada()).lidas).toBe(0);
  });

  it('resultado por texto (0.7.60): o envio conta para o texto DO DONO (mesmo hash do editor) e a resposta lida em até 7 dias marca respondeu', async () => {
    const { listarResultadosTexto } = await import('../src/shared/banco');
    const { hashDoTextoDoDono, resultadoDoTexto } = await import('../src/shared/resultado-texto');
    const t = await comEtapa1();
    const enviadoCom = TEXTOS1.find((x) => x.replace('{nome}', 'Ana') === t.colados[0].texto) as string;
    expect(enviadoCom).toBeDefined();
    let reg = await listarResultadosTexto(t.db);
    expect(reg).toHaveLength(1);
    expect(reg[0].hash).toBe(hashDoTextoDoDono(enviadoCom)); // o editor identifica o texto pelo MESMO hash
    expect(resultadoDoTexto(reg, hashDoTextoDoDono(enviadoCom))).toMatchObject({ enviados: 1, responderam: 0 });
    t.definirAgora('2026-11-20T13:00:00.000Z');
    naConversa(t, [cli('Oi! Quanto está o saco de 25kg?', t.agora().toISOString())]);
    await t.rodada();
    reg = await listarResultadosTexto(t.db);
    expect(resultadoDoTexto(reg, hashDoTextoDoDono(enviadoCom))).toMatchObject({ enviados: 1, responderam: 1, percentual: 100, amostraPequena: true });
    // Editar o texto (mesmo uma vírgula) é OUTRO texto: a contagem dele começa do zero.
    expect(resultadoDoTexto(reg, hashDoTextoDoDono(`${enviadoCom}!`))).toMatchObject({ enviados: 0, responderam: 0, percentual: null });
  });

  it('respondeu pedindo para sair → opt-out ("Não enviar mais"), sem etapa 2', async () => {
    const t = await comEtapa1({ classifica: (c) => ({ ref: c.ref, classe: 'pediu_para_sair', precisaAtencao: false, resumo: 'Pediu para sair', sugestao: '' }) });
    t.definirAgora('2026-11-20T13:00:00.000Z');
    naConversa(t, [cli('me tira da lista por favor', t.agora().toISOString())]);
    const r = await t.rodada(CONFIG);
    expect(r).toMatchObject({ respostas: 1, prontos: 0 });
    expect((await listarNaoEnviar(t.db)).map((x) => x.chave)).toEqual(['cliente ana']);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('saiu');
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
  });

  it('respondeu "compro depois": o lembrete é criado e a resposta vai para a lista, nunca para a etapa 2', async () => {
    const t = await comEtapa1({ classifica: (c) => ({ ref: c.ref, classe: 'compra_depois', precisaAtencao: true, resumo: 'Compra em 15 dias', sugestao: '', lembreteDias: 15 }) });
    t.definirAgora('2026-11-20T13:00:00.000Z');
    naConversa(t, [cli('só daqui a 15 dias', t.agora().toISOString())]);
    await t.rodada(CONFIG);
    expect(t.lembretes).toHaveLength(1);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('respondeu');
  });

  it('o atendente falou com o cliente depois do envio → resolvido, sem etapa 2', async () => {
    const t = await comEtapa1();
    t.definirAgora('2026-11-20T13:00:00.000Z');
    naConversa(t, [eu('Oi Ana, vi que você respondeu no telefone, tudo certo!', t.agora().toISOString())]);
    await t.rodada();
    expect(await t.registro('CLIENTE Ana')).toMatchObject({ estado: 'resolvido' });
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
  });

  it('nossa mensagem não achada na conversa → dúvida: "Precisa de você", nunca a etapa 2', async () => {
    const t = await comEtapa1();
    t.definirAgora('2026-11-20T13:00:00.000Z');
    t.conversas['CLIENTE Ana'] = conv(CONVERSA_NORMAL); // nossa mensagem sumiu
    await t.rodada();
    expect((await t.registro('CLIENTE Ana')).estado).toBe('precisa');
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
  });

  it('agendamento criado no meio da sequência: a sequência PARA (travado/resolvido) e nada é lido', async () => {
    const t = await comEtapa1();
    t.definirAgora('2026-11-20T13:00:00.000Z');
    t.travas.agendamentos.set('cliente ana', t.agora().getTime() + 45 * 86_400_000);
    const lidasAntes = t.leituras();
    const r = await t.rodada();
    expect(r.travados).toBe(1);
    expect(t.leituras()).toBe(lidasAntes);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('resolvido');
    expect((await t.registro('CLIENTE Ana')).motivo).toMatch(/agendado para/);
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
  });
});

describe('a mensagem é do dono (mesmo sistema da 0.7.55)', () => {
  it('modo "meus textos": sorteia entre os textos da etapa, sem IA', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada(CONFIG);
    expect(t.chamadasEscrever).toHaveLength(0);
    expect((await t.registro('CLIENTE Ana')).textoPronto?.origem).toBe('meus_textos');
  });

  it('modo "IA no meu estilo": pede à IA com o estilo e os textos DO DONO como exemplos, no contexto de reativação e na etapa certa', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada({ ...CONFIG, modo: 'ia_estilo', estilo: 'curto e informal' });
    expect(t.chamadasEscrever).toEqual([{ nome: 'Ana', etapa: 1, estilo: { estilo: 'curto e informal', exemplos: TEXTOS1 }, contexto: 'reativacao', mensagemCampanha: '' }]);
    const reg = await t.registro('CLIENTE Ana');
    expect(reg.textoPronto?.origem).toBe('ia_estilo');
    await t.enviar({ ...CONFIG, modo: 'ia_estilo', estilo: 'curto e informal' });
    expect(t.colados[0].texto).toBe('Oi, Ana! Faz tempo que não conversamos, precisa de sal? (etapa 1)');
  });

  it('IA de texto fora do ar: sai um texto do dono, nunca um genérico', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) }, { cobrancaIa: false });
    await t.rodada({ ...CONFIG, modo: 'ia_estilo', estilo: 'x' });
    const reg = await t.registro('CLIENTE Ana');
    expect(reg.textoPronto?.origem).toBe('meus_textos');
    await t.enviar({ ...CONFIG, modo: 'ia_estilo', estilo: 'x' });
    expect(TEXTOS1.map((x) => x.replace('{nome}', 'Ana'))).toContain(t.colados[0].texto);
  });

  it('texto da IA com termo proibido é recusado (vira texto do dono)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    const original = t.motor;
    void original;
    // IA devolve um texto com termo da conformidade sanitária
    const m = new MotorReativacao({
      db: t.db,
      pedir: async () => ({ ok: true, mensagens: CONVERSA_NORMAL }),
      ia: { avaliarReativacao: async (cs) => ({ ok: true, valor: cs.map((c) => ({ ref: c.ref, decisao: 'precisa_agora' as const, resumo: 'ok' })) }), classificarRespostas: async () => ({ ok: true, valor: [] }), escreverCobranca: async (nome) => ({ ok: true, valor: `Oi, ${nome}! Nosso sal natural é o melhor.` }), registrarReativacao: async () => ({ ok: true, taskId: 1, criou: false, agendou: false }) },
      travar: async (cs) => cs.map(() => ({ tipo: 'livre' as const })),
      criarLembrete: async () => null,
      agora: t.agora,
      aleatorio: () => 0.5,
      esperar: async () => undefined,
    });
    await m.rodada({ ...CONFIG, modo: 'ia_estilo', estilo: 'x' }, await t.contatosAtuais());
    expect((await t.registro('CLIENTE Ana')).textoPronto?.origem).toBe('meus_textos');
  });

  it('sem texto da etapa 1 não há campanha (a tela também não deixa ligar)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    expect(await t.motor.montarCampanha({ ...CONFIG, textos1: [] })).toBeNull();
  });

  it('o dono mudou os textos: o texto já preparado é refeito antes de sair (nunca sai texto da configuração antiga)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    const antes = (await t.registro('CLIENTE Ana')).textoPronto;
    const nova = { ...CONFIG, textos1: ['Bom dia, {nome}! Como estão de sal por aí esta semana?'] };
    await t.motor.salvarConfig(nova);
    const depois = (await t.registro('CLIENTE Ana')).textoPronto;
    expect(depois?.assinatura).not.toBe(antes?.assinatura);
    await t.enviar(nova);
    expect(t.colados[0].texto).toBe('Bom dia, Ana! Como estão de sal por aí esta semana?');
  });

  it('contato sem primeiro nome utilizável vai para "Precisa de você" (os textos usam {nome})', async () => {
    const t = await montar({ CLIENTE: conv(CONVERSA_NORMAL) });
    await t.rodada();
    expect((await t.registro('CLIENTE')).estado).toBe('precisa');
  });

  it('{nome} é opcional: contato sem primeiro nome recebe um texto SEM {nome} (nunca marcador sobrando)', async () => {
    const SEM_NOME = 'Bom dia, tudo bem? Conseguiu dar uma olhada no estoque por aí?';
    const t = await montar({ CLIENTE: conv(CONVERSA_NORMAL) });
    await t.rodada({ ...CONFIG, textos1: ['Oi, {nome}! Faz tempo que não nos falamos.', SEM_NOME] });
    const r = await t.registro('CLIENTE');
    expect(r.estado).toBe('pronto');
    expect(r.textoPronto?.modelo).toBe(SEM_NOME);
  });
});

describe('limites e ritmo da rodada', () => {
  it('lê no máximo 30 conversas por rodada', async () => {
    const nomes = Object.fromEntries(Array.from({ length: 36 }, (_, i) => [`CLIENTE P${i}`, conv(CONVERSA_NORMAL)]));
    const t = await montar(nomes);
    const r = await t.rodada(CONFIG, { manual: true });
    expect(r.lidas).toBe(30);
  });

  it('automática: não acumula "prontos" além do que cabe no teto de hoje; "Avaliar agora" avalia todos', async () => {
    const t = await montar(Object.fromEntries(['Paula', 'Pedro', 'Pablo', 'Paulo', 'Pietro'].map((nome) => [`CLIENTE ${nome}`, conv(CONVERSA_NORMAL)])));
    await salvarConfig(t.db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true, tetoDiario: 2 });
    expect((await t.rodada(CONFIG)).lidas).toBe(2); // só cabem 2 hoje
    expect((await t.rodada(CONFIG)).lidas).toBe(0); // os 2 prontos já ocupam as vagas
    expect((await t.rodada(CONFIG, { manual: true })).lidas).toBe(3); // o resto, a pedido do atendente
  });

  it('o atendente pode parar a rodada', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL), 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    let pare = false;
    const r = await t.motor.rodada(CONFIG, await t.contatosAtuais(), { parar: () => pare, aoProgredir: () => { pare = true; } });
    expect(r.parou).toBe(true);
    expect(t.leituras()).toBe(1);
  });

  it('leitura velha (mais de 12 h) volta a ser avaliada antes de mandar a mensagem', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    t.definirAgora('2026-11-18T14:00:00.000Z'); // 25 h depois
    expect(await t.motor.montarCampanha(CONFIG)).toBeNull();
    const ana = await t.registro('CLIENTE Ana');
    expect(ana.estado).toBe('resolvido');
    expect(ana.motivo).toMatch(/será avaliado de novo/);
    const r = await t.rodada(CONFIG);
    expect(r.lidas).toBe(1);
  });

  it('o dono resolveu/mandou sair pela lista do Follow-up: o registro da reativação acompanha', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL), 'CLIENTE Bia': conv(CONVERSA_NORMAL) }, { decisao: { Ana: { decisao: 'delicado' }, Bia: { decisao: 'delicado' } } });
    await t.rodada();
    const fs = await listarFollowups(t.db);
    await salvarFollowups(t.db, [{ ...fs.find((f) => f.chave === 'cliente ana')!, estado: 'resolvido', motivo: 'resolvido por você' }, { ...fs.find((f) => f.chave === 'cliente bia')!, estado: 'saiu', motivo: 'você marcou "não enviar mais"' }]);
    await t.motor.carregar();
    expect((await t.registro('CLIENTE Ana')).estado).toBe('resolvido');
    expect((await t.registro('CLIENTE Bia')).estado).toBe('saiu');
  });
});

// ── Lote 1 (0.7.59): modo Observação, releitura antes de enviar, prioridade e "O que a IA fez" ───────────────────

describe('modo Observação (0.7.59): a IA decide, mas NADA é enviado, agendado no CRM nem marcado', () => {
  const OBS: ConfigReativacao = { ...CONFIG, automatico: 'observacao', placarAprovado: false };

  it('retomar agora: prepara o texto e guarda o julgamento, mas não grava nada no CRM e o Executor se recusa a enviar', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') });
    await salvarConfigReativacao(t.db, OBS);
    const r = await t.rodada(OBS);
    expect(r).toMatchObject({ lidas: 1, prontos: 1 });
    expect(t.pedidosCrm).toEqual([]); // nem o resumo vai para o CRM
    expect((await t.registro('CLIENTE Ana')).estado).toBe('pronto');
    const js = await listarJulgamentos(t.db);
    expect(js).toHaveLength(1);
    expect(js[0]).toMatchObject({ tipo: 'retomar', origem: 'reativacao', veredito: null });
    expect(js[0].texto).toMatch(/^(Oi, Ana!|Ana,)/);

    const ex = await t.enviar(OBS);
    expect(t.colados).toHaveLength(0);
    expect(ex?.atual.campanha.motivoPausa).toMatch(/^automático em Observação/);
    expect((await listarEnvios(t.db)).length).toBe(0);
  });

  it('precisa_mais_tempo: NÃO agenda no CRM; o julgamento diz "agendaria em N dias"', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000') }, { decisao: { Ana: { decisao: 'precisa_mais_tempo', diasSugeridos: 45, resumo: 'Tem estoque até janeiro.' } } });
    await salvarConfigReativacao(t.db, OBS);
    await t.rodada(OBS);
    expect(t.pedidosCrm).toEqual([]);
    expect(await t.registro('CLIENTE Ana')).toMatchObject({ estado: 'agendado', observado: true });
    const j = (await listarJulgamentos(t.db))[0];
    expect(j.tipo).toBe('agendar');
    expect(j.resumo).toMatch(/Agendaria o retorno no CRM em 45 dia/);
    expect(await listarAcoesIa(t.db)).toEqual([]);
  });

  it('pediu_para_sair: NÃO marca "Não enviar mais"; fica em "Precisa de você" e vira julgamento "sair"', async () => {
    const t = await montar({ 'CLIENTE Ana': conv([eu('Oi!'), cli('não tenho interesse, me tira da lista')]) }, { decisao: { Ana: { decisao: 'pediu_para_sair' } } });
    await salvarConfigReativacao(t.db, OBS);
    await t.rodada(OBS);
    expect(await listarNaoEnviar(t.db)).toEqual([]);
    expect(t.pedidosCrm).toEqual([]);
    expect(await t.registro('CLIENTE Ana')).toMatchObject({ estado: 'precisa', observado: true });
    expect((await listarJulgamentos(t.db)).map((j) => j.tipo)).toEqual(['sair']);
  });

  it('delicado vira julgamento "precisa" (chamar você)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) }, { decisao: { Ana: { decisao: 'delicado', resumo: 'Reclamou de atraso.' } } });
    await salvarConfigReativacao(t.db, OBS);
    await t.rodada(OBS);
    expect((await listarJulgamentos(t.db)).map((j) => j.tipo)).toEqual(['precisa']);
    expect(t.pedidosCrm).toEqual([]);
  });

  it('em Observação a sequência não é encerrada nem agenda nova tentativa no CRM (nem lê o contato à toa)', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    await t.enviar();
    t.definirAgora('2026-12-10T13:00:00.000Z'); // bem depois da etapa 1 e do prazo de espera final
    const reg = await t.registro('CLIENTE Ana');
    await salvarReativacoes(t.db, [{ ...reg, etapa: 3, enviados: [...reg.enviados, { etapa: 2, em: '2026-11-20T12:00:00.000Z', texto: 'x' }, { etapa: 3, em: '2026-11-30T12:00:00.000Z', texto: 'y' }] }]);
    await salvarConfigReativacao(t.db, OBS);
    const antes = t.leituras();
    await t.rodada(OBS);
    expect(t.leituras()).toBe(antes);
    expect(t.pedidosCrm.filter((p) => p.linha.startsWith('Reativação concluída'))).toEqual([]);
    expect((await t.registro('CLIENTE Ana')).estado).toBe('aguardando');
  });

  it('respondeu a uma etapa: em Observação NÃO marca opt-out nem cria lembrete; vira julgamento', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    await t.enviar();
    const ana = await t.registro('CLIENTE Ana');
    t.conversas['CLIENTE Ana'] = conv([...CONVERSA_NORMAL, eu(ana.enviados[0].texto, '2026-11-17T13:00:00.000Z'), cli('não quero mais, me tira da lista', '2026-11-19T13:00:00.000Z')]);
    t.definirAgora('2026-11-20T13:00:00.000Z');
    await salvarConfigReativacao(t.db, OBS);
    await t.rodada(OBS);
    expect(await listarNaoEnviar(t.db)).toEqual([]);
  });
});

describe('modo Ligado: "O que a IA fez" guarda o agendamento (com como desfazer), o opt-out e o envio', () => {
  it('agendamento criado pela IA guarda o id da tarefa e o instante EXATO; opt-out guarda o desfazer; envio não tem desfazer', async () => {
    const t = await montar(
      { 'CLIENTE Ana': conv(CONVERSA_NORMAL, '5584999990000'), 'CLIENTE Bia': conv([eu('Oi!'), cli('me tira da lista')]), 'CLIENTE Caio': conv(CONVERSA_NORMAL) },
      { decisao: { Ana: { decisao: 'precisa_mais_tempo', diasSugeridos: 30, resumo: 'Volta em dezembro' }, Bia: { decisao: 'pediu_para_sair' } }, crm: (p) => ({ ok: true, taskId: p.nome === 'CLIENTE Ana' ? 77 : 78, criou: false, agendou: p.agendarEm != null }) },
    );
    await t.rodada();
    await t.enviar();
    const acoes = await listarAcoesIa(t.db);
    const agendou = acoes.find((a) => a.tipo === 'agendou');
    expect(agendou).toMatchObject({ chave: 'cliente ana', desfazer: { tipo: 'agendamento', taskId: 77, agendadoEm: instanteNoFuso('2026-12-17', 9, 0) } });
    expect(acoes.find((a) => a.tipo === 'nao_enviar')).toMatchObject({ chave: 'cliente bia', desfazer: { tipo: 'nao_enviar' } });
    expect(acoes.find((a) => a.tipo === 'enviou')).toMatchObject({ chave: 'cliente caio', desfazer: null });
    expect(await listarJulgamentos(t.db)).toEqual([]);
  });
});

describe('releitura antes do envio e prioridade da reativação', () => {
  it('relê a conversa antes de colar; se o cliente respondeu desde a decisão, não envia e o contato será avaliado de novo', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    expect((await t.registro('CLIENTE Ana')).estado).toBe('pronto');
    t.conversas['CLIENTE Ana'] = conv([...CONVERSA_NORMAL, cli('oi, preciso de 30 sacos', '2026-11-17T13:05:00.000Z')]);
    const ex = await t.enviar();
    expect(t.colados).toHaveLength(0);
    expect(ex?.atual.campanha.itens[0].motivo).toMatch(/^o cliente respondeu desde a decisão/);
    const ana = await t.registro('CLIENTE Ana');
    expect(ana).toMatchObject({ estado: 'resolvido', textoPronto: null });
    expect(new Date(ana.reelegivelEm as string).getTime()).toBeLessThanOrEqual(t.agora().getTime());
    // a conversa agora é recente (o cliente acabou de escrever): a próxima rodada não manda nada automático para ele
    const r = await t.rodada();
    expect(r).toMatchObject({ recentes: 1, prontos: 0 });
    expect(t.colados).toHaveLength(0);
  });

  it('relê ANTES de colar: a ordem dos pedidos é lerConversa e só depois abrirEColar', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL) });
    await t.rodada();
    const antes = t.pedidos.length;
    await t.enviar();
    const tipos = t.pedidos.slice(antes).map((p) => p.tipo);
    expect(tipos.indexOf('lerConversa')).toBeGreaterThanOrEqual(0);
    expect(tipos.indexOf('lerConversa')).toBeLessThan(tipos.indexOf('abrirEColar'));
  });

  it('prioridade: na mesma campanha, etapas 2 e 3 saem antes da etapa 1', async () => {
    const t = await montar({ 'CLIENTE Ana': conv(CONVERSA_NORMAL), 'CLIENTE Bia': conv(CONVERSA_NORMAL) });
    const pronto = (chave: string, nome: string, etapa: number, base: string) => ({ ...novoRegistro({ chave, nome, primeiroNome: nome.split(' ')[1] }, base, t.agora()), estado: 'pronto' as const, etapa: etapa - 1, textoPronto: { etapa, modelo: 'Oi, {primeiroNome}!', origem: 'meus_textos' as const, assinatura: assinaturaReativacao(CONFIG) }, verificadoEm: t.agora().toISOString() });
    await salvarReativacoes(t.db, [pronto('cliente ana', 'CLIENTE Ana', 1, '2026-10-01'), pronto('cliente bia', 'CLIENTE Bia', 2, '2026-10-20')]);
    const campanha = await t.motor.montarCampanha(CONFIG);
    expect(campanha?.itens.map((i) => i.nome)).toEqual(['CLIENTE Bia', 'CLIENTE Ana']); // etapa 2 antes da 1, mesmo a da etapa 1 sendo mais antiga
  });
});
