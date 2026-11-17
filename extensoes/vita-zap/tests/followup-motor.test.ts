// Motor do follow-up com WhatsApp falso, IA falsa e o Executor REAL das campanhas: lê as conversas, decide, e a
// cobrança sai pelo mesmo motor (teto diário, horário, intervalo, freio, opt-out). Banco: fake-indexeddb.

import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  abrirBanco,
  listarCampanhas,
  listarEnvios,
  listarFollowups,
  lerConfigFollowup,
  listarNaoEnviar,
  marcarNaoEnviar,
  registrarEnvio,
  salvarCampanha,
  salvarConfig,
  salvarFollowups,
} from '../src/shared/banco';
import { type Campanha, textoDoItem } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import { type ClassificacaoIa, type ConfigFollowup, type Followup, MAX_LEITURAS_POR_RODADA } from '../src/shared/followup';
import { assinaturaTextos } from '../src/shared/followup-estilo';
import type { MensagemLida, PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import type { ConversaParaIa, ResultadoIa } from '../src/shared/servico-ia';
import { Executor } from '../src/sidepanel/executor';
import type { ResultadoTrava } from '../src/shared/trava-agendamento';
import { MotorFollowup } from '../src/sidepanel/followup-motor';

let n = 0;
const TEXTO = 'Oi {primeiroNome}, tudo bem? Como estão de sal por aí?';
const TEXTOS1 = ['Oi, {nome}! Passando para saber se você viu minha mensagem. Qualquer coisa me chama.', '{nome}, tudo certo por aí? Fico no aguardo.', 'Olá, {nome}! Conseguiu ver o que mandei? Estou à disposição.'];
const TEXTOS2 = ['{nome}, última lembrança: fico à disposição se precisar de sal.', 'Oi, {nome}! Deixo meu contato aberto, é só chamar.'];
const BASE: ConfigFollowup = { ligado: true, dias: 3, pausado: false, confirmouRisco: true, modo: 'meus_textos', textos1: TEXTOS1, textos2: TEXTOS2, estilo: '', desligadaSemTexto: false };
// A maioria dos testes usa a IA no estilo do dono (a IA falsa escreve "Oi, Nome! Passando para saber...").
const CONFIG: ConfigFollowup = { ...BASE, modo: 'ia_estilo', estilo: 'curto e informal' };
const dispara = (nome: string) => `Oi ${nome.split(' ')[0]}, tudo bem? Como estão de sal por aí?`;

const eu = (texto: string): MensagemLida => ({ de: 'eu', texto, quando: null });
const cli = (texto: string): MensagemLida => ({ de: 'cliente', texto, quando: null });

type RespostaDaConversa = MensagemLida[] | { erro: string; codigo: Extract<RespostaConteudo, { ok: false }>['codigo'] };

async function montar(contatos: Record<string, RespostaDaConversa | 'sem_resposta'>, opcoes: { iaClassifica?: (c: ConversaParaIa) => ClassificacaoIa | null; iaOff?: boolean; cobrancaIa?: boolean; trava?: (nome: string) => ResultadoTrava } = {}) {
  const db = await abrirBanco(`followup-${Date.now()}-${(n += 1)}`);
  await salvarConfig(db, { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true });
  let agora = new Date('2026-11-17T13:00:00.000Z'); // terça 10h em Fortaleza
  const enviadoEm = new Date(agora.getTime() - 3 * 86_400_000).toISOString();

  const itens = Object.keys(contatos).map((nome) => ({
    chave: nome.toLowerCase(),
    nome,
    primeiroNome: nome.split(' ')[0],
    modelo: TEXTO,
    status: 'enviado' as const,
    motivo: null,
    atualizadoEm: enviadoEm,
  }));
  const origem: Campanha = {
    id: 'origem',
    nome: 'Campanha de origem',
    criadaEm: enviadoEm,
    aprovadaEm: enviadoEm,
    termoBusca: 'CLIENTE',
    filtros: FILTROS_PADRAO,
    modelos: [TEXTO],
    status: 'concluida',
    motivoPausa: null,
    itens,
    problemasSeguidos: 0,
    ultimoEnvioEm: enviadoEm,
    intervaloAtualSeg: 90,
  };
  await salvarCampanha(db, origem);
  for (const i of itens) await registrarEnvio(db, { campanhaId: 'origem', chave: i.chave, nome: i.nome, enviadoEm, textoConfere: true });

  const pedidos: PedidoConteudo[] = [];
  const colados: Array<{ nome: string; texto: string; envioAutomatico: boolean | undefined }> = [];
  const lembretes: Array<{ nome: string; venceEm: number }> = [];
  const enviadosParaIa: ConversaParaIa[][] = [];
  const chamadasCobranca: Array<{ nome: string; tentativa: number; estilo?: { estilo: string; exemplos: string[] } }> = [];
  const agendados: Array<{ fn: () => void; ms: number }> = [];
  const estadoIa = { fora: opcoes.iaOff === true, cobrancaIa: opcoes.cobrancaIa !== false };

  const pedir = async (p: PedidoConteudo): Promise<RespostaConteudo> => {
    pedidos.push(p);
    if (p.tipo === 'lerConversa') {
      const c = contatos[p.nome];
      if (c === undefined) return { ok: false, codigo: 'nao_encontrado', erro: `"${p.nome}" não apareceu` };
      if (c === 'sem_resposta') return { ok: true, mensagens: [eu(dispara(p.nome))] };
      if (Array.isArray(c)) return { ok: true, mensagens: c };
      return { ok: false, codigo: c.codigo, erro: c.erro };
    }
    if (p.tipo === 'abrirEColar') {
      colados.push({ nome: p.nome, texto: p.texto, envioAutomatico: p.envioAutomatico });
      return { ok: true, idsAntes: [] };
    }
    return { ok: true };
  };

  const ia = {
    async classificarRespostas(conversas: ConversaParaIa[]): Promise<ResultadoIa<ClassificacaoIa[]>> {
      enviadosParaIa.push(conversas);
      if (estadoIa.fora) return { ok: false, erro: { tipo: 'servidor', mensagem: 'A IA está indisponível agora' } };
      return {
        ok: true,
        valor: conversas.map((c) => opcoes.iaClassifica?.(c) ?? { ref: c.ref, classe: 'sem_relacao', precisaAtencao: false, resumo: 'só um ok', sugestao: '' }).filter((x): x is ClassificacaoIa => x !== null),
      };
    },
    async escreverCobranca(primeiroNome: string, _msg: string, tentativa: 1 | 2, estilo?: { estilo: string; exemplos: string[] }): Promise<ResultadoIa<string>> {
      chamadasCobranca.push({ nome: primeiroNome, tentativa, estilo });
      if (estadoIa.fora || !estadoIa.cobrancaIa) return { ok: false, erro: { tipo: 'servidor', mensagem: 'fora' } };
      return { ok: true, valor: `Oi, ${primeiroNome}! Passando para saber se ainda precisa de sal (tentativa ${tentativa}).` };
    },
  };

  const motor = new MotorFollowup({
    db,
    pedir,
    ia,
    criarLembrete: async (nome, venceEm) => {
      lembretes.push({ nome, venceEm });
      return null;
    },
    agora: () => agora,
    aleatorio: () => 0.5,
    esperar: async () => undefined,
    travar: opcoes.trava ? async (cs) => cs.map((c) => (opcoes.trava as (n: string) => ResultadoTrava)(c.nome)) : undefined,
  });

  const criarExecutor = (campanha: Campanha) =>
    new Executor(
      { db, pedir, agora: () => agora, aleatorio: () => 0.5, agendar: (fn, ms) => { agendados.push({ fn, ms }); return () => undefined; }, obterEnvioAutomatico: () => true },
      campanha,
    );

  /** Monta a campanha de cobrança e roda o Executor até parar, "digitando" o Enter de cada cobrança. */
  async function cobrar(config: ConfigFollowup = CONFIG): Promise<Executor | null> {
    const campanha = await motor.montarCampanhaDeCobranca(config);
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

  const get = async (nome: string): Promise<Followup> => {
    const f = (await listarFollowups(db)).find((x) => x.chave === nome.toLowerCase());
    if (!f) throw new Error(`sem acompanhamento de ${nome}`);
    return f;
  };

  return {
    db, motor, pedidos, colados, lembretes, enviadosParaIa, chamadasCobranca, agendados, estadoIa, cobrar, get, criarExecutor,
    agora: () => agora,
    avancarDias: (d: number) => {
      agora = new Date(agora.getTime() + d * 86_400_000);
    },
    leituras: () => pedidos.filter((p) => p.tipo === 'lerConversa').length,
  };
}

describe('quem NÃO respondeu é cobrado sozinho, pelo mesmo motor das campanhas', () => {
  it('lê, escreve com a IA, e o Executor envia com envio automático e registra no teto compartilhado', async () => {
    const t = await montar({ 'Maria Souza': 'sem_resposta', 'Pedro Lima': 'sem_resposta' });
    const r = await t.motor.verificar(CONFIG);
    expect(r).toMatchObject({ lidas: 2, cobrancas: 2, aviso: null, parou: false });
    expect((await t.get('Maria Souza')).estado).toBe('cobranca');
    expect((await t.get('Maria Souza')).cobrancaOrigem).toBe('ia_estilo');
    expect(t.pedidos.every((p) => p.tipo === 'lerConversa')).toBe(true); // ler não cola nada

    const ex = await t.cobrar();
    expect(ex?.atual.fase).toBe('concluida');
    expect(t.colados).toHaveLength(2);
    expect(t.colados.every((c) => c.envioAutomatico === true)).toBe(true); // mesma rotina do envio automático das campanhas
    expect(t.colados[0].texto).toBe('Oi, Maria! Passando para saber se ainda precisa de sal (tentativa 1).');
    // O intervalo entre as duas cobranças é o da política: 60–120 s.
    const entre = ex?.atual.campanha.ultimoEnvioEm;
    expect(entre).toBeTruthy();
    const envios = await listarEnvios(t.db);
    const dasCobrancas = envios.filter((e) => e.campanhaId !== 'origem');
    expect(dasCobrancas).toHaveLength(2); // contam no MESMO teto diário (contarEnviosHoje olha todos os envios)
    const campanhas = await listarCampanhas(t.db);
    expect(campanhas.find((c) => c.id === dasCobrancas[0].campanhaId)?.tipo).toBe('followup');
    const maria = await t.get('Maria Souza');
    expect(maria.estado).toBe('monitorando');
    expect(maria.cobrancas).toHaveLength(1);
    expect(maria.cobrancas[0].texto).toBe(t.colados[0].texto);
  });

  it('o intervalo entre cobranças respeita 60–120 s da política', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    const campanha = await t.motor.montarCampanhaDeCobranca(CONFIG);
    const ex = t.criarExecutor(campanha as Campanha);
    await ex.iniciar();
    await ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: textoDoItem(ex.atual.campanha.itens[0]), textoConfere: true });
    expect(ex.atual.fase).toBe('intervalo');
    const ms = t.agendados.at(-1)?.ms ?? 0;
    expect(ms).toBeGreaterThanOrEqual(60_000);
    expect(ms).toBeLessThanOrEqual(120_000);
  });

  it('a campanha de cobrança ignora o piso de 14 dias (o disparo é recente), a campanha comum não', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    // a MESMA conversa numa campanha comum seria pulada ("recebeu outra campanha recentemente")
    const comum: Campanha = { ...(await listarCampanhas(t.db)).find((c) => c.id === 'origem') as Campanha, id: 'nova', status: 'pausada', itens: [{ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', modelo: 'Oi {primeiroNome}', status: 'pendente', motivo: null, atualizadoEm: null }] };
    const exComum = t.criarExecutor(comum);
    await exComum.iniciar();
    expect(exComum.atual.campanha.itens[0].status).toBe('pulado');
    expect(t.colados).toHaveLength(0);
    await t.cobrar();
    expect(t.colados).toHaveLength(1);
  });

  it('X dias entre cobranças: antes disso nem lê; e se a cobrança que enviamos não aparece na conversa, não cobra de novo (revisar)', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    await t.cobrar();
    expect(t.colados).toHaveLength(1);

    // Dois dias depois: ainda não passou X (3) desde a cobrança.
    t.avancarDias(2);
    expect((await t.motor.verificar(CONFIG)).lidas).toBe(0);

    // Quatro dias depois: a conversa falsa só mostra o disparo (a cobrança "não saiu" de verdade): falha fechada.
    t.avancarDias(2);
    const r = await t.motor.verificar(CONFIG);
    expect(r).toMatchObject({ lidas: 1, cobrancas: 0, revisar: 1 });
    expect((await t.get('Ana')).estado).toBe('revisar');
    expect(t.colados).toHaveLength(1);
  });
});

describe('ciclo completo de duas cobranças (a conversa mostra o que enviamos)', () => {
  it('cobra, cobra de novo e para: nunca uma terceira', async () => {
    const conversa: MensagemLida[] = [eu(dispara('Ana'))];
    const t = await montar({ Ana: conversa });
    const pedir0 = t.pedidos;
    void pedir0;
    await t.motor.verificar(CONFIG);
    await t.cobrar();
    const f1 = await t.get('Ana');
    expect(f1.cobrancas).toHaveLength(1);
    conversa.push(eu(f1.cobrancas[0].texto)); // o WhatsApp mostra a cobrança que saiu

    t.avancarDias(3);
    const r2 = await t.motor.verificar(CONFIG);
    expect(r2.cobrancas).toBe(1);
    await t.cobrar();
    const f2 = await t.get('Ana');
    expect(f2.cobrancas).toHaveLength(2);
    expect(f2.cobrancas[1].texto).toContain('tentativa 2');
    expect(f2.cobrancas[1].texto).not.toBe(f2.cobrancas[0].texto);
    conversa.push(eu(f2.cobrancas[1].texto));

    t.avancarDias(3);
    const r3 = await t.motor.verificar(CONFIG);
    expect(r3.cobrancas).toBe(0);
    const f3 = await t.get('Ana');
    expect(f3.estado).toBe('resolvido');
    expect(f3.motivo).toMatch(/depois de 2 cobranças/);
    expect(await t.motor.montarCampanhaDeCobranca(CONFIG)).toBeNull();
    expect(t.colados).toHaveLength(2);
  });
});

describe('quem respondeu NUNCA é cobrado: vai para a IA e depois para uma lista', () => {
  const classifica = (mapa: Record<string, Partial<ClassificacaoIa>>) => (c: ConversaParaIa): ClassificacaoIa | null => {
    const ultima = [...c.mensagens].reverse().find((m) => m.de === 'cliente')?.texto ?? '';
    const base: ClassificacaoIa = { ref: c.ref, classe: 'sem_relacao', precisaAtencao: false, resumo: 'sem assunto', sugestao: '' };
    for (const [trecho, extra] of Object.entries(mapa)) if (ultima.includes(trecho)) return { ...base, ...extra };
    return base;
  };

  it('preço/interesse → "Precisa de você" com sugestão; ok → Resolvido; nada é colado nem enviado', async () => {
    const t = await montar(
      {
        Ana: [eu(dispara('Ana')), cli('quanto custa o saco?')],
        Bia: [eu(dispara('Bia')), cli('👍')],
        Caio: [eu(dispara('Caio')), cli('tenho interesse, me liga')],
      },
      { iaClassifica: classifica({ 'quanto custa': { classe: 'pediu_preco', precisaAtencao: true, resumo: 'Pediu o preço do saco', sugestao: 'Oi Ana, qual a quantidade?' }, interesse: { classe: 'interessado', precisaAtencao: true, resumo: 'Quer ligação', sugestao: 'Oi Caio, já te ligo.' } }) },
    );
    const r = await t.motor.verificar(CONFIG);
    expect(r).toMatchObject({ lidas: 3, precisam: 2, resolvidos: 1, cobrancas: 0 });
    const ana = await t.get('Ana');
    expect(ana).toMatchObject({ estado: 'precisa', classe: 'pediu_preco', sugestao: 'Oi Ana, qual a quantidade?' });
    expect((await t.get('Bia')).estado).toBe('resolvido');
    expect(await t.motor.montarCampanhaDeCobranca(CONFIG)).toBeNull();
    expect(t.colados).toHaveLength(0);
    expect(t.pedidos.some((p) => p.tipo === 'abrirEColar')).toBe(false);
  });

  it('pediu para sair → opt-out automático (Não enviar mais) e nunca entra em cobrança', async () => {
    const t = await montar({ Ana: [eu(dispara('Ana')), cli('não, obrigado')], Bia: 'sem_resposta' }, { iaClassifica: classifica({ 'não, obrigado': { classe: 'pediu_para_sair', precisaAtencao: false, resumo: 'Não quer', sugestao: '' } }) });
    const r = await t.motor.verificar(CONFIG);
    expect(r.saidas).toBe(1);
    expect((await t.get('Ana')).estado).toBe('saiu');
    const naoEnviar = await listarNaoEnviar(t.db);
    expect(naoEnviar.map((x) => x.chave)).toEqual(['ana']);
    expect(naoEnviar[0].motivo).toMatch(/pediu para sair/);
    await t.cobrar();
    expect(t.colados.map((c) => c.nome)).toEqual(['Bia']);
  });

  it('compra_depois → "Precisa de você" e lembrete criado com o prazo da IA (9h de Fortaleza)', async () => {
    const t = await montar({ Ana: [eu(dispara('Ana')), cli('compro só mês que vem')] }, { iaClassifica: classifica({ 'mês que vem': { classe: 'compra_depois', precisaAtencao: true, resumo: 'Compra mês que vem', sugestao: 'Combinado, Ana!', lembreteDias: 20 } }) });
    await t.motor.verificar(CONFIG);
    expect(t.lembretes).toEqual([{ nome: 'Ana', venceEm: Date.UTC(2026, 11, 7, 12, 0) }]); // 07/12/2026 09:00 BRT
    const f = await t.get('Ana');
    expect(f.estado).toBe('precisa');
    expect(f.lembreteCriadoEm).toBeTruthy();
  });

  it('o atendente já respondeu depois do cliente: resolvido, sem chamar a IA', async () => {
    const t = await montar({ Ana: [eu(dispara('Ana')), cli('quanto custa?'), eu('R$ 30 o saco')] });
    await t.motor.verificar(CONFIG);
    expect((await t.get('Ana')).estado).toBe('resolvido');
    expect(t.enviadosParaIa).toHaveLength(0);
  });

  it('LGPD: para a IA vai só "c1", "c2"... (nada de nome, chave ou telefone) e o primeiro nome', async () => {
    const t = await montar({ 'Maria Souza': [eu(dispara('Maria')), cli('oi')], 'Pedro Lima': [eu(dispara('Pedro')), cli('bom dia')] });
    await t.motor.verificar(CONFIG);
    const lote = t.enviadosParaIa[0];
    expect(lote.map((c) => c.ref)).toEqual(['c1', 'c2']);
    const bruto = JSON.stringify(lote);
    expect(bruto).not.toMatch(/Souza|Lima|maria souza|origem/);
    expect(lote.map((c) => c.primeiroNome).sort()).toEqual(['Maria', 'Pedro']);
  });

  it('manda a IA em lotes e um item sem classificação vai para revisar (sem derrubar os outros)', async () => {
    const nomes = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`Cliente${String.fromCharCode(65 + i)}`, [eu(dispara(`Cliente${String.fromCharCode(65 + i)}`)), cli('oi')]]));
    const t = await montar(nomes, { iaClassifica: (c) => ({ ref: c.ref === 'c3' ? 'c3-inexistente' : c.ref, classe: 'sem_relacao', precisaAtencao: false, resumo: 'ok', sugestao: '' }) });
    const r = await t.motor.verificar(CONFIG);
    expect(t.enviadosParaIa.map((l) => l.length)).toEqual([10, 2]);
    expect(r.revisar).toBe(1);
    expect(r.resolvidos).toBe(11);
  });
});

describe('IA fora do ar', () => {
  it('as respostas continuam "monitorando" (sem inventar classe) e a próxima rodada tenta de novo', async () => {
    const t = await montar({ Ana: [eu(dispara('Ana')), cli('quanto custa?')] }, { iaOff: true });
    const r = await t.motor.verificar(CONFIG);
    expect(r.aviso).toMatch(/IA não respondeu/);
    const f = await t.get('Ana');
    expect(f.estado).toBe('monitorando');
    expect(f.verificadoEm).toBeNull();
    expect(await listarNaoEnviar(t.db)).toHaveLength(0);
    t.estadoIa.fora = false;
    const r2 = await t.motor.verificar(CONFIG);
    expect(r2.lidas).toBe(1);
    expect((await t.get('Ana')).estado).toBe('resolvido');
  });

  it('IA fora do ar: a cobrança sai com os textos do DONO (nunca um modelo genérico), variados', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta', Caio: 'sem_resposta' }, { iaOff: true });
    const r = await t.motor.verificar(CONFIG);
    expect(r.cobrancas).toBe(3);
    expect(r.aviso).toMatch(/seus textos/);
    const modelos: string[] = [];
    for (const nome of ['Ana', 'Bia', 'Caio']) {
      const f = await t.get(nome);
      expect(f.cobrancaOrigem).toBe('meus_textos');
      modelos.push(f.cobrancaModelo as string);
      expect(TEXTOS1.map((x) => x.replace('{nome}', '{primeiroNome}'))).toContain(f.cobrancaModelo);
    }
    for (let i = 1; i < modelos.length; i++) expect(modelos[i]).not.toBe(modelos[i - 1]); // nunca a mesma em sequência
    await t.cobrar();
    expect(t.colados).toHaveLength(3);
    expect(t.colados.every((c) => !/[{}]/.test(c.texto))).toBe(true);
    expect(t.colados.some((c) => /Passando só para saber se você viu a minha mensagem\. Se precisar de sal/.test(c.texto))).toBe(false);
  });

  it('texto da IA com link ou longo demais é descartado e entra um texto do dono', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    t.estadoIa.cobrancaIa = true;
    // sobrescreve a IA do motor com uma que devolve link
    const motor = new MotorFollowup({
      db: t.db,
      pedir: async (p) => (p.tipo === 'lerConversa' ? { ok: true, mensagens: [eu(dispara('Ana'))] } : { ok: true }),
      ia: { classificarRespostas: async () => ({ ok: true, valor: [] }), escreverCobranca: async () => ({ ok: true, valor: 'Oi, Ana! Veja www.salvita.com.br' }) },
      criarLembrete: async () => null,
      agora: t.agora,
      aleatorio: () => 0.5,
      esperar: async () => undefined,
    });
    await motor.verificar(CONFIG);
    const f = await t.get('Ana');
    expect(f.cobrancaOrigem).toBe('meus_textos');
    expect(f.cobrancaModelo).not.toMatch(/www|http/);
  });
});

describe('falha fechada: na dúvida NÃO cobra', () => {
  it('grupo, nome repetido, conversa não confirmada, contato não achado → revisar, sem colar nada', async () => {
    const t = await montar({
      Grupo: { codigo: 'grupo', erro: '"Grupo" é grupo' },
      Dupla: { codigo: 'ambiguo', erro: 'Há 2 conversas chamadas "Dupla"' },
      Incerta: { codigo: 'nao_confirmado', erro: 'não consegui confirmar' },
      Sumido: { codigo: 'cabecalho', erro: 'a conversa aberta não é "Sumido"' },
    });
    const r = await t.motor.verificar(CONFIG);
    expect(r.revisar).toBe(4);
    for (const nome of ['Grupo', 'Dupla', 'Incerta', 'Sumido']) {
      const f = await t.get(nome);
      expect(f.estado, nome).toBe('revisar');
      expect(f.motivo).toBeTruthy();
    }
    expect(await t.motor.montarCampanhaDeCobranca(CONFIG)).toBeNull();
    expect(t.colados).toHaveLength(0);
  });

  it('a mensagem do disparo não está na conversa (apagada/editada/fora do trecho) → revisar, nunca cobra', async () => {
    const t = await montar({ Ana: [cli('oi'), eu('outra coisa qualquer')] });
    await t.motor.verificar(CONFIG);
    expect((await t.get('Ana')).estado).toBe('revisar');
    expect(t.colados).toHaveLength(0);
  });

  it('erro geral (layout mudou, WhatsApp fechado) para a rodada sem mexer em ninguém', async () => {
    const t = await montar({ Ana: { codigo: 'seletor', erro: 'layout mudou' }, Bia: 'sem_resposta' });
    const r = await t.motor.verificar(CONFIG);
    expect(r).toMatchObject({ parou: true, aviso: 'layout mudou', lidas: 1 });
    expect((await t.get('Ana')).estado).toBe('monitorando');
    expect((await t.get('Bia')).estado).toBe('monitorando');
    expect(t.leituras()).toBe(1);
  });

  it('quem já está em "Não enviar mais" nunca é cobrado (nem lido de novo depois)', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
    await marcarNaoEnviar(t.db, { chave: 'ana', nome: 'Ana', desde: t.agora().toISOString(), motivo: 'não enviar mais' });
    await t.motor.verificar(CONFIG);
    expect((await t.get('Ana')).estado).toBe('saiu');
    await t.cobrar();
    expect(t.colados.map((c) => c.nome)).toEqual(['Bia']);
  });

  it('o opt-out feito depois de preparar a cobrança vale na hora do envio (o Executor revalida)', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    await marcarNaoEnviar(t.db, { chave: 'ana', nome: 'Ana', desde: t.agora().toISOString(), motivo: 'não enviar mais' });
    await t.cobrar();
    expect(t.colados.map((c) => c.nome)).toEqual(['Bia']);
    expect((await t.get('Ana')).estado).toBe('saiu');
  });
});

describe('a política das campanhas vale para a cobrança', () => {
  it('teto diário compartilhado: envios de campanhas comuns de hoje contam e a cobrança espera', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await salvarConfig(t.db, { ...CONFIG_PADRAO, tetoDiario: 2, numeroComMaisDe30Dias: true });
    for (const k of ['x', 'y']) await registrarEnvio(t.db, { campanhaId: 'comum', chave: k, nome: k, enviadoEm: '2026-11-17T12:00:00.000Z', textoConfere: true });
    await t.motor.verificar(CONFIG);
    const ex = await t.cobrar();
    expect(t.colados).toHaveLength(0);
    expect(ex?.atual.campanha.motivoPausa).toMatch(/teto diário/);
    expect((await t.get('Ana')).estado).toBe('cobranca'); // continua na fila para amanhã
  });

  it('fora do horário (ou domingo) não abre ninguém', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    const campanha = (await t.motor.montarCampanhaDeCobranca(CONFIG)) as Campanha;
    const ex = new Executor({ db: t.db, pedir: async () => ({ ok: true }), agora: () => new Date('2026-11-17T22:00:00Z'), aleatorio: () => 0.5, agendar: () => () => undefined, obterEnvioAutomatico: () => true }, campanha);
    await ex.iniciar();
    expect(ex.atual.campanha.motivoPausa).toMatch(/fora do horário/);
    const dom = new Executor({ db: t.db, pedir: async () => ({ ok: true }), agora: () => new Date('2026-11-22T13:00:00Z'), aleatorio: () => 0.5, agendar: () => () => undefined, obterEnvioAutomatico: () => true }, campanha);
    await dom.iniciar();
    expect(dom.atual.campanha.motivoPausa).toMatch(/domingo/);
  });

  it('freio: 3 problemas seguidos pausam a cobrança e os itens não voltam sozinhos', async () => {
    const t = await montar({ A1: 'sem_resposta', B2: 'sem_resposta', C3: 'sem_resposta', D4: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    const campanha = (await t.motor.montarCampanhaDeCobranca(CONFIG)) as Campanha;
    const ex = new Executor(
      { db: t.db, pedir: async (p) => (p.tipo === 'abrirEColar' ? { ok: false, codigo: 'nao_encontrado', erro: 'não achei' } : { ok: true }), agora: t.agora, aleatorio: () => 0.5, agendar: () => () => undefined, obterEnvioAutomatico: () => true },
      campanha,
    );
    await ex.iniciar();
    await t.motor.aplicarCampanha(ex.atual.campanha);
    expect(ex.atual.campanha.status).toBe('pausada');
    expect(ex.atual.campanha.problemasSeguidos).toBe(3);
    const estados = await Promise.all(['A1', 'B2', 'C3', 'D4'].map(async (n) => (await t.get(n)).estado));
    expect(estados.filter((e) => e === 'revisar')).toHaveLength(3); // problema → revisar (o atendente confere)
    expect(estados.filter((e) => e === 'cobranca')).toHaveLength(1); // o 4º nem chegou a ser aberto
  });
});

describe('desligado, pausado e frequência de leitura', () => {
  it('com a cobrança automática desligada, quem não respondeu só fica anotado: nada entra na fila', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    const r = await t.motor.verificar({ ...CONFIG, ligado: false });
    expect(r.cobrancas).toBe(0);
    const f = await t.get('Ana');
    expect(f.estado).toBe('monitorando');
    expect(f.motivo).toMatch(/desligada/);
    expect(await t.motor.montarCampanhaDeCobranca(CONFIG)).toBeNull();
  });

  it('a mesma conversa não é lida de novo em menos de 12 h, a não ser pelo botão "verificar agora"', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar({ ...CONFIG, ligado: false });
    expect(t.leituras()).toBe(1);
    await t.motor.verificar({ ...CONFIG, ligado: false });
    expect(t.leituras()).toBe(1);
    await t.motor.verificar({ ...CONFIG, ligado: false }, { forcar: true });
    expect(t.leituras()).toBe(2);
  });

  it('só lê quem passou de X dias (o disparo de ontem não é lido), exceto no "verificar agora"', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.sincronizar();
    const f = await t.get('Ana');
    await salvarFollowups(t.db, [{ ...f, enviadoEm: new Date(t.agora().getTime() - 86_400_000).toISOString() }]);
    expect((await t.motor.verificar(CONFIG)).lidas).toBe(0);
    expect((await t.motor.verificar(CONFIG, { recentes: true, forcar: true })).lidas).toBe(1);
  });

  it(`lê no máximo ${MAX_LEITURAS_POR_RODADA} conversas por rodada, as mais antigas primeiro`, async () => {
    const nomes = Object.fromEntries(Array.from({ length: MAX_LEITURAS_POR_RODADA + 5 }, (_, i) => [`Pessoa${i}`, 'sem_resposta' as const]));
    const t = await montar(nomes);
    const r = await t.motor.verificar({ ...CONFIG, ligado: false });
    expect(r.lidas).toBe(MAX_LEITURAS_POR_RODADA);
  });

  it('o atendente pode parar a rodada', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
    let pare = false;
    const r = await t.motor.verificar(CONFIG, { parar: () => pare, aoProgredir: () => { pare = true; } });
    expect(r.parou).toBe(true);
    expect(r.lidas).toBe(1); // parou depois da leitura em andamento; a segunda nem começou
    expect(t.leituras()).toBe(1);
  });
});

describe('leitura velha e retomada', () => {
  it('cobrança preparada há mais de 12 h volta a ser lida antes de enviar (o cliente pode ter respondido)', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    t.avancarDias(1);
    expect(await t.motor.montarCampanhaDeCobranca(CONFIG)).toBeNull();
    expect((await t.get('Ana')).estado).toBe('monitorando');
  });

  it('campanha de cobrança com mensagem em voo é retomada (nunca substituída) e confere a conversa antes de colar', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    const campanha = (await t.motor.montarCampanhaDeCobranca(CONFIG)) as Campanha;
    await salvarCampanha(t.db, { ...campanha, status: 'pausada', emVoo: { chave: 'ana', nome: 'Ana', texto: 'x', idsAntes: [], desde: t.agora().toISOString() } });
    expect((await t.motor.campanhaEmVoo())?.id).toBe(campanha.id);
    const de_novo = await t.motor.montarCampanhaDeCobranca(CONFIG);
    expect(de_novo?.id).toBe(campanha.id);
  });

  it('a mesma lista de pendentes retoma a campanha aberta em vez de criar outra a cada rodada', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    const a = (await t.motor.montarCampanhaDeCobranca(CONFIG)) as Campanha;
    const b = (await t.motor.montarCampanhaDeCobranca(CONFIG)) as Campanha;
    expect(b.id).toBe(a.id);
  });
});

describe('ações do atendente', () => {
  it('Resolvido, Não enviar mais e "conferi: voltar a acompanhar"', async () => {
    const t = await montar({ Ana: [eu(dispara('Ana')), cli('quanto custa?')], Bia: { codigo: 'ambiguo', erro: 'dois' } }, { iaClassifica: (c) => ({ ref: c.ref, classe: 'pediu_preco', precisaAtencao: true, resumo: 'preço', sugestao: 'Oi' }) });
    await t.motor.verificar(CONFIG);
    const ana = await t.get('Ana');
    const bia = await t.get('Bia');
    await t.motor.voltarAMonitorar(bia.id);
    expect((await t.get('Bia')).estado).toBe('monitorando');
    await t.motor.voltarAMonitorar(ana.id); // só vale para "revisar"
    expect((await t.get('Ana')).estado).toBe('precisa');
    await t.motor.marcarResolvido(ana.id, 'respondi por telefone');
    expect(await t.get('Ana')).toMatchObject({ estado: 'resolvido', motivo: 'respondi por telefone' });
    await t.motor.naoEnviarMais(bia.id);
    expect((await t.get('Bia')).estado).toBe('saiu');
    expect((await listarNaoEnviar(t.db)).map((x) => x.chave)).toEqual(['bia']);
  });

  it('carregar() devolve as listas e as cobranças de hoje', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    await t.cobrar();
    const v = await t.motor.carregar();
    expect(v.enviadasHoje).toBe(1);
    expect(v.listas.monitorando).toHaveLength(1);
    expect(vi.isMockFunction(t.motor.carregar)).toBe(false);
  });
});


describe('a mensagem é do dono (0.7.55): textos dele, IA no estilo dele, nunca modelo genérico', () => {
  const NOMES = { Ana: 'sem_resposta', Bia: 'sem_resposta', Caio: 'sem_resposta', Dani: 'sem_resposta', Eva: 'sem_resposta', Fabi: 'sem_resposta' } as const;
  const doDono1 = TEXTOS1.map((x) => x.replace('{nome}', '{primeiroNome}'));
  const doDono2 = TEXTOS2.map((x) => x.replace('{nome}', '{primeiroNome}'));

  it('modo "meus textos": não chama a IA para escrever, sorteia só entre os textos do dono e nunca repete a mesma em sequência', async () => {
    let chamouIa = 0;
    const t = await montar({ ...NOMES });
    // sorteio "ruim": sempre o índice 0 da lista que sobrou; o código tem de pular a variação anterior
    const motor = new MotorFollowup({ db: t.db, pedir: async (p) => (p.tipo === 'lerConversa' ? { ok: true, mensagens: [eu(dispara(p.nome))] } : { ok: true }), ia: { classificarRespostas: async () => ({ ok: true, valor: [] }), escreverCobranca: async () => { chamouIa += 1; return { ok: false, erro: { tipo: 'servidor', mensagem: 'não deveria ser chamada' } }; } }, criarLembrete: async () => null, agora: t.agora, aleatorio: () => 0, esperar: async () => undefined });
    await motor.verificar({ ...BASE, modo: 'meus_textos' });
    expect(chamouIa).toBe(0);
    const modelos: string[] = [];
    for (const nome of Object.keys(NOMES)) {
      const f = await t.get(nome);
      expect(f.cobrancaOrigem).toBe('meus_textos');
      expect(doDono1).toContain(f.cobrancaModelo);
      modelos.push(f.cobrancaModelo as string);
    }
    for (let i = 1; i < modelos.length; i++) expect(modelos[i]).not.toBe(modelos[i - 1]);
  });

  it('1 só texto: a mesma variação repetida é inevitável (e permitida)', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
    await t.motor.verificar({ ...BASE, textos1: [TEXTOS1[0]] });
    expect((await t.get('Ana')).cobrancaModelo).toBe(doDono1[0]);
    expect((await t.get('Bia')).cobrancaModelo).toBe(doDono1[0]);
  });

  it('a 2ª cobrança usa a lista da 2ª; sem lista própria, usa a da 1ª sem repetir o que o contato já recebeu', async () => {
    const conversas: Record<string, 'sem_resposta' | MensagemLida[]> = { Ana: 'sem_resposta' };
    const t = await montar(conversas);
    await t.motor.verificar({ ...BASE });
    await t.cobrar(BASE);
    const primeira = (await t.get('Ana')).cobrancas[0].texto;
    conversas.Ana = [eu(dispara('Ana')), eu(primeira)]; // a conversa agora mostra a nossa cobrança
    expect(TEXTOS1.map((x) => x.replace('{nome}', 'Ana'))).toContain(primeira);
    t.avancarDias(4);
    await t.motor.verificar(BASE, { forcar: true });
    const f2 = await t.get('Ana');
    expect(f2.estado).toBe('cobranca');
    expect(doDono2).toContain(f2.cobrancaModelo);

    // sem textos2: usa a lista da 1ª, mas nunca o texto que ela já recebeu
    const conversasU: Record<string, 'sem_resposta' | MensagemLida[]> = { Ana: 'sem_resposta' };
    const u = await montar(conversasU);
    await u.motor.verificar({ ...BASE, textos2: [] });
    await u.cobrar({ ...BASE, textos2: [] });
    const recebida = (await u.get('Ana')).cobrancas[0].texto;
    conversasU.Ana = [eu(dispara('Ana')), eu(recebida)];
    u.avancarDias(4);
    await u.motor.verificar({ ...BASE, textos2: [] }, { forcar: true });
    const f3 = await u.get('Ana');
    expect(f3.estado).toBe('cobranca');
    expect(f3.cobrancaModelo?.replace('{primeiroNome}', 'Ana')).not.toBe(recebida);
  });

  it('modo IA no estilo: manda o estilo e os textos do dono como exemplos, e o texto da IA entra rotulado "ia_estilo"', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar({ ...BASE, modo: 'ia_estilo', estilo: 'curto e informal' });
    expect(t.chamadasCobranca).toEqual([{ nome: 'Ana', tentativa: 1, estilo: { estilo: 'curto e informal', exemplos: TEXTOS1 } }]);
    expect(await t.get('Ana')).toMatchObject({ estado: 'cobranca', cobrancaOrigem: 'ia_estilo' });
  });

  it('modo IA: IA fora do ar, texto recusado ou cópia literal do dono → texto do dono ("seu texto"); nunca modelo genérico', async () => {
    const fora = await montar({ Ana: 'sem_resposta' }, { iaOff: true });
    await fora.motor.verificar({ ...BASE, modo: 'ia_estilo' });
    expect(await fora.get('Ana')).toMatchObject({ cobrancaOrigem: 'meus_textos' });
    expect(doDono1).toContain((await fora.get('Ana')).cobrancaModelo);

    for (const ruim of ['Oi, Ana! Nosso sal é natural.', 'Oi, Ana! R$ 20 o saco.', `Oi, Ana! ${'muito '.repeat(60)}`]) {
      const t = await montar({ Ana: 'sem_resposta' });
      const motor = new MotorFollowup({ db: t.db, pedir: async (p) => (p.tipo === 'lerConversa' ? { ok: true, mensagens: [eu(dispara('Ana'))] } : { ok: true }), ia: { classificarRespostas: async () => ({ ok: true, valor: [] }), escreverCobranca: async () => ({ ok: true, valor: ruim }) }, criarLembrete: async () => null, agora: t.agora, aleatorio: () => 0.5, esperar: async () => undefined });
      await motor.verificar({ ...BASE, modo: 'ia_estilo' });
      const f = await t.get('Ana');
      expect(f.cobrancaOrigem, ruim).toBe('meus_textos');
      expect(doDono1).toContain(f.cobrancaModelo);
    }

    const copia = await montar({ Ana: 'sem_resposta' });
    const m = new MotorFollowup({ db: copia.db, pedir: async (p) => (p.tipo === 'lerConversa' ? { ok: true, mensagens: [eu(dispara('Ana'))] } : { ok: true }), ia: { classificarRespostas: async () => ({ ok: true, valor: [] }), escreverCobranca: async () => ({ ok: true, valor: 'Ana, tudo certo por aí? Fico no aguardo.' }) }, criarLembrete: async () => null, agora: copia.agora, aleatorio: () => 0.5, esperar: async () => undefined });
    await m.verificar({ ...BASE, modo: 'ia_estilo' });
    expect(await copia.get('Ana')).toMatchObject({ cobrancaOrigem: 'meus_textos' }); // é palavra por palavra um texto do dono
  });

  it('contato sem primeiro nome não é cobrado com {nome}: vai para revisar', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.sincronizar();
    const f = await t.get('Ana');
    await (await import('../src/shared/banco')).salvarFollowups(t.db, [{ ...f, primeiroNome: '' }]);
    await t.motor.verificar(BASE, { forcar: true });
    expect(await t.get('Ana')).toMatchObject({ estado: 'revisar' });
  });

  it('sem texto da 1ª cobrança nada é montado nem enviado (mesmo que alguém force a config)', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(BASE);
    expect(await t.motor.montarCampanhaDeCobranca({ ...BASE, textos1: [] })).toBeNull();
  });

  describe('mudou o texto/modo/estilo com gente já na fila: o texto é refeito antes do envio', () => {
    it('salvarConfig refaz a fila agora; cada item guarda a assinatura da config nova', async () => {
      const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
      await t.motor.salvarConfig(BASE);
      await t.motor.verificar(BASE);
      const antes = await t.get('Ana');
      expect(antes.cobrancaAssinatura).toBe(assinaturaTextos(BASE));
      const nova = await t.motor.salvarConfig({ ...BASE, textos1: ['Bom dia, {nome}! Tudo certo por aí?'], textos2: [] });
      expect(nova.textos1).toEqual(['Bom dia, {nome}! Tudo certo por aí?']);
      for (const nome of ['Ana', 'Bia']) {
        const f = await t.get(nome);
        expect(f.estado).toBe('cobranca');
        expect(f.cobrancaModelo).toBe('Bom dia, {primeiroNome}! Tudo certo por aí?');
        expect(f.cobrancaAssinatura).toBe(assinaturaTextos(nova));
      }
    });

    it('trocar de "meus textos" para "IA no estilo" refaz com a IA; voltar refaz sem IA', async () => {
      const t = await montar({ Ana: 'sem_resposta' });
      await t.motor.salvarConfig(BASE);
      await t.motor.verificar(BASE);
      expect(t.chamadasCobranca).toHaveLength(0);
      await t.motor.salvarConfig({ ...BASE, modo: 'ia_estilo', estilo: 'formal' });
      expect(t.chamadasCobranca).toHaveLength(1);
      expect(await t.get('Ana')).toMatchObject({ cobrancaOrigem: 'ia_estilo' });
      await t.motor.salvarConfig({ ...BASE, modo: 'meus_textos' });
      expect(t.chamadasCobranca).toHaveLength(1);
      expect(await t.get('Ana')).toMatchObject({ cobrancaOrigem: 'meus_textos' });
    });

    it('mudar só o estilo (modo IA) refaz; mudar o estilo no modo "meus textos" não mexe na fila', async () => {
      const t = await montar({ Ana: 'sem_resposta' });
      await t.motor.salvarConfig({ ...BASE, modo: 'ia_estilo', estilo: 'a' });
      await t.motor.verificar({ ...BASE, modo: 'ia_estilo', estilo: 'a' });
      const n = t.chamadasCobranca.length;
      await t.motor.salvarConfig({ ...BASE, modo: 'ia_estilo', estilo: 'b' });
      expect(t.chamadasCobranca.length).toBe(n + 1);
      expect(t.chamadasCobranca.at(-1)?.estilo?.estilo).toBe('b');

      const u = await montar({ Ana: 'sem_resposta' });
      await u.motor.salvarConfig({ ...BASE, estilo: 'a' });
      await u.motor.verificar({ ...BASE, estilo: 'a' });
      const antes = await u.get('Ana');
      await u.motor.salvarConfig({ ...BASE, estilo: 'b' });
      expect(await u.get('Ana')).toEqual(antes);
    });

    it('texto preparado pela 0.7.54 (sem assinatura, origem "modelo") nunca é enviado: é refeito ao montar a campanha', async () => {
      const t = await montar({ Ana: 'sem_resposta' });
      await t.motor.verificar(BASE);
      const f = await t.get('Ana');
      await (await import('../src/shared/banco')).salvarFollowups(t.db, [{ ...f, cobrancaModelo: 'Oi, {primeiroNome}! Passando só para saber se você viu a minha mensagem. Se precisar de sal, é só me chamar. 😊', cobrancaOrigem: 'modelo', cobrancaAssinatura: null }]);
      await t.cobrar(BASE);
      expect(t.colados).toHaveLength(1);
      expect(t.colados[0].texto).not.toMatch(/Passando só para saber/);
      expect(TEXTOS1.map((x) => x.replace('{nome}', 'Ana'))).toContain(t.colados[0].texto);
    });

    it('campanha de cobrança já montada (pendente) recebe o texto novo; quem saiu da fila é pulado', async () => {
      const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' });
      await t.motor.salvarConfig(BASE);
      await t.motor.verificar(BASE);
      const c1 = (await t.motor.montarCampanhaDeCobranca(BASE)) as Campanha;
      expect(c1.itens.map((i) => i.modelo).every((m) => doDono1.includes(m))).toBe(true);
      const novoTexto = ['Bom dia, {nome}! Tudo certo por aí?'];
      const cfg = await t.motor.salvarConfig({ ...BASE, textos1: novoTexto });
      const c2 = (await t.motor.montarCampanhaDeCobranca(cfg)) as Campanha;
      expect(c2.id).toBe(c1.id); // mesma campanha, texto atualizado
      expect(c2.itens.every((i) => i.modelo === 'Bom dia, {primeiroNome}! Tudo certo por aí?')).toBe(true);
      expect((await listarCampanhas(t.db)).find((c) => c.id === c1.id)?.itens.every((i) => i.modelo.startsWith('Bom dia'))).toBe(true);
    });

    it('apagou todos os textos: a fila volta a "monitorando" e a cobrança desliga', async () => {
      const t = await montar({ Ana: 'sem_resposta' });
      await t.motor.salvarConfig(BASE);
      await t.motor.verificar(BASE);
      const nova = await t.motor.salvarConfig({ ...BASE, textos1: [], textos2: [] });
      expect(nova).toMatchObject({ ligado: false, desligadaSemTexto: true });
      expect(await t.get('Ana')).toMatchObject({ estado: 'monitorando', cobrancaModelo: null });
      expect(await t.motor.montarCampanhaDeCobranca(nova)).toBeNull();
    });
  });

  describe('persistência e migração (IndexedDB followupConfig)', () => {
    it('salva e lê textos, modo e estilo', async () => {
      const t = await montar({ Ana: 'sem_resposta' });
      await t.motor.salvarConfig({ ...BASE, modo: 'ia_estilo', estilo: '  curto   e informal ' });
      expect(await lerConfigFollowup(t.db)).toMatchObject({ modo: 'ia_estilo', estilo: 'curto e informal', textos1: TEXTOS1, textos2: TEXTOS2, ligado: true });
    });

    it('config da 0.7.54 (sem os campos novos): modo "meus textos" vazio e, se estava ligada, fica DESLIGADA com aviso', async () => {
      const t = await montar({ Ana: 'sem_resposta' });
      await t.db.put('followupConfig', { id: 'followup', valor: { ligado: true, dias: 5, pausado: false, confirmouRisco: true } as unknown as ConfigFollowup });
      const c = await lerConfigFollowup(t.db);
      expect(c).toMatchObject({ modo: 'meus_textos', textos1: [], textos2: [], estilo: '', ligado: false, desligadaSemTexto: true, dias: 5, confirmouRisco: true });
      // desligada na leitura: o ciclo não prepara nem envia nada
      await t.motor.verificar(c);
      expect(await t.motor.montarCampanhaDeCobranca(c)).toBeNull();
    });

    it('config antiga que já estava desligada não ganha aviso', async () => {
      const t = await montar({ Ana: 'sem_resposta' });
      await t.db.put('followupConfig', { id: 'followup', valor: { ligado: false, dias: 3, pausado: false, confirmouRisco: false } as unknown as ConfigFollowup });
      expect(await lerConfigFollowup(t.db)).toMatchObject({ ligado: false, desligadaSemTexto: false });
    });
  });
});


describe('TRAVA DE AGENDAMENTO na cobrança (0.7.56): o agendamento prevalece', () => {
  const agendado = (): ResultadoTrava => ({ tipo: 'agendado', ate: new Date('2027-01-16T12:00:00Z').getTime(), taskId: 1, titulo: 'x', como: 'telefone', motivo: 'agendado para 16/01 (o agendamento prevalece)' });

  it('quem não respondeu MAS tem agendamento futuro no CRM NÃO é cobrado: vai para "Resolvido" com o motivo', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta' }, { trava: (nome) => (nome === 'Ana' ? agendado() : { tipo: 'livre' }) });
    const r = await t.motor.verificar(CONFIG);
    expect(r).toMatchObject({ lidas: 2, cobrancas: 1, resolvidos: 1 });
    const ana = await t.get('Ana');
    expect(ana.estado).toBe('resolvido');
    expect(ana.motivo).toBe('agendado para 16/01 (o agendamento prevalece)');
    expect((await t.get('Bia')).estado).toBe('cobranca');
    await t.cobrar();
    expect(t.colados.map((c) => c.nome)).toEqual(['Bia']);
  });

  it('CRM indisponível: ninguém é cobrado (falha fechada), o aviso aparece e a leitura se repete na próxima rodada', async () => {
    const t = await montar({ Ana: 'sem_resposta' }, { trava: () => ({ tipo: 'indisponivel', motivo: 'CRM indisponível (sem rede)' }) });
    const r = await t.motor.verificar(CONFIG);
    expect(r.cobrancas).toBe(0);
    expect(r.aviso).toMatch(/nada foi cobrado/);
    const ana = await t.get('Ana');
    expect(ana.estado).toBe('monitorando');
    expect(ana.verificadoEm).toBeNull(); // lê de novo já na próxima rodada
    expect(await t.motor.montarCampanhaDeCobranca(CONFIG)).toBeNull();
    expect(t.colados).toHaveLength(0);
  });

  it('a trava só barra a COBRANÇA: quem respondeu continua indo para a IA e para "Precisa de você"', async () => {
    const t = await montar({ Ana: [eu(dispara('Ana')), cli('quanto custa?')] }, { trava: agendado, iaClassifica: (c) => ({ ref: c.ref, classe: 'pediu_preco', precisaAtencao: true, resumo: 'Pediu preço', sugestao: 'Oi Ana, já te passo o valor.' }) });
    await t.motor.verificar(CONFIG);
    expect((await t.get('Ana')).estado).toBe('precisa');
  });

  it('o Executor também confere antes do clique: agendamento criado depois de a cobrança ser preparada → pulado', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await t.motor.verificar(CONFIG);
    const campanha = (await t.motor.montarCampanhaDeCobranca(CONFIG)) as Campanha;
    const ex = new Executor(
      { db: t.db, pedir: async (p) => { if (p.tipo === 'abrirEColar') t.colados.push({ nome: p.nome, texto: p.texto, envioAutomatico: p.envioAutomatico }); return { ok: true, idsAntes: [] }; }, agora: t.agora, aleatorio: () => 0.5, agendar: () => () => undefined, obterEnvioAutomatico: () => true, trava: async () => agendado() },
      campanha,
    );
    await ex.iniciar();
    await t.motor.aplicarCampanha(ex.atual.campanha);
    expect(t.colados).toHaveLength(0);
    expect(ex.atual.campanha.itens[0]).toMatchObject({ status: 'pulado', motivo: expect.stringMatching(/^agendado para/) });
  });

  it('item da reativação no Follow-up nunca volta a "monitorando" (seria cobrado)', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    await salvarFollowups(t.db, [{ id: 'reat:zeca', campanhaId: 'reativacao', chave: 'zeca', nome: 'Zeca', primeiroNome: 'Zeca', mensagemCampanha: '', enviadoEm: t.agora().toISOString(), estado: 'revisar', motivo: 'leia', verificadoEm: null, cobrancas: [], cobrancaModelo: null, cobrancaOrigem: null, origem: 'reativacao', atualizadoEm: t.agora().toISOString() }]);
    await t.motor.voltarAMonitorar('reat:zeca');
    expect((await listarFollowups(t.db)).find((f) => f.id === 'reat:zeca')?.estado).toBe('revisar');
  });

  it('campanhas de reativação não geram acompanhamento de cobrança (o follow-up só acompanha disparos comuns)', async () => {
    const t = await montar({ Ana: 'sem_resposta' });
    const existentes = await listarFollowups(t.db);
    const reativ: Campanha = { id: 'r1', tipo: 'reativacao', nome: 'R', criadaEm: t.agora().toISOString(), aprovadaEm: t.agora().toISOString(), termoBusca: '', filtros: FILTROS_PADRAO, modelos: [], status: 'concluida', motivoPausa: null, itens: [{ chave: 'zeca', nome: 'Zeca', primeiroNome: 'Zeca', modelo: 'Oi {primeiroNome}, tudo bem?', status: 'enviado', motivo: null, atualizadoEm: t.agora().toISOString() }], problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null };
    await salvarCampanha(t.db, reativ);
    await registrarEnvio(t.db, { campanhaId: 'r1', chave: 'zeca', nome: 'Zeca', enviadoEm: t.agora().toISOString(), textoConfere: true });
    const todos = await t.motor.sincronizar();
    expect(todos.filter((f) => f.campanhaId === 'r1')).toEqual([]);
    expect(todos.some((f) => f.chave === 'zeca')).toBe(false);
    expect(existentes).toBeDefined();
  });
});
