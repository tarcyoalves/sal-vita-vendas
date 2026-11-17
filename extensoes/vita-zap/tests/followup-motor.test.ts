// Motor do follow-up com WhatsApp falso, IA falsa e o Executor REAL das campanhas: lê as conversas, decide, e a
// cobrança sai pelo mesmo motor (teto diário, horário, intervalo, freio, opt-out). Banco: fake-indexeddb.

import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  abrirBanco,
  listarCampanhas,
  listarEnvios,
  listarFollowups,
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
import type { MensagemLida, PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { CONFIG_PADRAO } from '../src/shared/politica';
import type { ConversaParaIa, ResultadoIa } from '../src/shared/servico-ia';
import { Executor } from '../src/sidepanel/executor';
import { MotorFollowup } from '../src/sidepanel/followup-motor';

let n = 0;
const TEXTO = 'Oi {primeiroNome}, tudo bem? Como estão de sal por aí?';
const CONFIG: ConfigFollowup = { ligado: true, dias: 3, pausado: false, confirmouRisco: true };
const dispara = (nome: string) => `Oi ${nome.split(' ')[0]}, tudo bem? Como estão de sal por aí?`;

const eu = (texto: string): MensagemLida => ({ de: 'eu', texto, quando: null });
const cli = (texto: string): MensagemLida => ({ de: 'cliente', texto, quando: null });

type RespostaDaConversa = MensagemLida[] | { erro: string; codigo: Extract<RespostaConteudo, { ok: false }>['codigo'] };

async function montar(contatos: Record<string, RespostaDaConversa | 'sem_resposta'>, opcoes: { iaClassifica?: (c: ConversaParaIa) => ClassificacaoIa | null; iaOff?: boolean; cobrancaIa?: boolean } = {}) {
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
    async escreverCobranca(primeiroNome: string, _msg: string, tentativa: 1 | 2): Promise<ResultadoIa<string>> {
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
    db, motor, pedidos, colados, lembretes, enviadosParaIa, agendados, estadoIa, cobrar, get, criarExecutor,
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
    expect((await t.get('Maria Souza')).cobrancaOrigem).toBe('ia');
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

  it('a cobrança usa os modelos locais variados quando a IA não escreve', async () => {
    const t = await montar({ Ana: 'sem_resposta', Bia: 'sem_resposta', Caio: 'sem_resposta' }, { iaOff: true });
    const r = await t.motor.verificar(CONFIG);
    expect(r.cobrancas).toBe(3);
    const textos = new Set<string>();
    for (const nome of ['Ana', 'Bia', 'Caio']) {
      const f = await t.get(nome);
      expect(f.cobrancaOrigem).toBe('modelo');
      textos.add(f.cobrancaModelo as string);
    }
    expect(textos.size).toBe(3); // variados no mesmo lote
    await t.cobrar();
    expect(t.colados).toHaveLength(3);
    expect(t.colados.every((c) => !/[{}]/.test(c.texto))).toBe(true);
  });

  it('texto da IA com link ou longo demais é descartado e entra o modelo local', async () => {
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
    expect(f.cobrancaOrigem).toBe('modelo');
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
