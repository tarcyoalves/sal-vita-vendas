// Regras PURAS do lote 1 (0.7.59): modo Observação e placar da IA, releitura antes de enviar, fila e histórico sumindo.

import { describe, expect, it } from 'vitest';
import {
  MAX_JULGAMENTOS,
  MAX_PENDENTES_JULGAMENTO,
  MIN_ACERTO_PERCENTUAL,
  MIN_JULGAMENTOS,
  avaliarLiberacao,
  calcularPlacar,
  idsParaPodar,
  julgar,
  normalizarModo,
  novaDecisao,
  reabrir,
  type Julgamento,
  type TipoDecisao,
} from '../src/shared/automaticos';
import type { ContatoVarrido } from '../src/shared/contatos';
import { MOTIVO_CLIENTE_RESPONDEU } from '../src/shared/constantes';
import { ORDEM_DA_FILA, compararProntosDaReativacao, contarFila, preverFila, reativacaoDeveEsperar, textoDaPrevisao } from '../src/shared/fila';
import { CONFIG_FOLLOWUP_PADRAO, aplicarResultadoCampanha, normalizarConfigFollowup, type Followup } from '../src/shared/followup';
import { JANELA_AVISO_DIAS, historicoSumindo, textoDoAviso } from '../src/shared/historico-sumindo';
import type { MensagemLida } from '../src/shared/mensagens';
import { CONFIG_REATIVACAO_PADRAO, aplicarResultadoCampanhaReativacao, normalizarConfigReativacao, novoRegistro, type Reativacao } from '../src/shared/reativacao';
import { conferirAntesDeEnviar } from '../src/shared/reler-antes';
import type { Campanha } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';

const AGORA = new Date('2026-11-17T13:00:00.000Z');
const TEXTO = ['Oi, {nome}! Passando para saber se viu minha mensagem.'];

function decisao(i: number, tipo: TipoDecisao = 'cobrar'): Julgamento {
  return novaDecisao({ origem: 'followup', tipo, chave: `c${i}`, nome: `Contato ${i}`, contexto: `x${i}`, resumo: 'resumo' }, new Date(AGORA.getTime() + i * 1000));
}
const julgados = (n: number, acertos: number, tipo: TipoDecisao = 'cobrar'): Julgamento[] =>
  Array.from({ length: n }, (_, i) => julgar(decisao(i, tipo), i < acertos ? 'acertou' : 'errou', new Date(AGORA.getTime() + i * 1000)));

describe('modo dos automáticos (Desligado | Observação | Ligado)', () => {
  it('config antiga LIGADA (confirmou o risco) cai para Observação, com aviso; antiga desligada continua desligada', () => {
    const antigaLigada = normalizarConfigFollowup({ ligado: true, confirmouRisco: true, textos1: TEXTO });
    expect(antigaLigada).toMatchObject({ automatico: 'observacao', ligado: true, migradoParaObservacao: true, placarAprovado: false });
    expect(normalizarConfigFollowup({ ligado: false, textos1: TEXTO })).toMatchObject({ automatico: 'desligado', ligado: false, migradoParaObservacao: false });
    const reat = normalizarConfigReativacao({ ligado: true, confirmouRisco: true, textos1: TEXTO });
    expect(reat).toMatchObject({ automatico: 'observacao', migradoParaObservacao: true });
  });

  it('o aviso de migração some quando o dono escolhe outro modo', () => {
    const migrada = normalizarConfigFollowup({ ligado: true, confirmouRisco: true, textos1: TEXTO });
    expect(normalizarConfigFollowup({ ...migrada, automatico: 'desligado', migradoParaObservacao: false }).migradoParaObservacao).toBe(false);
    expect(normalizarConfigFollowup({ ...migrada }).migradoParaObservacao).toBe(true); // reler a mesma config mantém o aviso
  });

  it('"Ligado" só existe com a confirmação do risco E o placar aprovado; sem isso vira Observação', () => {
    const base = { textos1: TEXTO, automatico: 'ligado' as const };
    expect(normalizarConfigFollowup({ ...base, confirmouRisco: true, placarAprovado: true }).automatico).toBe('ligado');
    expect(normalizarConfigFollowup({ ...base, confirmouRisco: true }).automatico).toBe('observacao');
    expect(normalizarConfigFollowup({ ...base, placarAprovado: true }).automatico).toBe('observacao');
    expect(normalizarConfigReativacao({ ...base, confirmouRisco: true }).automatico).toBe('observacao');
  });

  it('sem texto do dono nada roda, em nenhum modo', () => {
    expect(normalizarConfigFollowup({ automatico: 'observacao' })).toMatchObject({ automatico: 'desligado', ligado: false });
    expect(normalizarConfigReativacao({ automatico: 'ligado', confirmouRisco: true, placarAprovado: true })).toMatchObject({ automatico: 'desligado', ligado: false });
    expect(normalizarModo({ automatico: 'lixo' }, true).automatico).toBe('desligado');
  });

  it('os padrões nascem desligados', () => {
    expect(CONFIG_FOLLOWUP_PADRAO).toMatchObject({ ligado: false, automatico: 'desligado', placarAprovado: false });
    expect(CONFIG_REATIVACAO_PADRAO).toMatchObject({ ligado: false, automatico: 'desligado', placarAprovado: false });
  });
});

describe('placar da IA e liberação do envio', () => {
  it('constantes do dono: 30 julgamentos, 90% de acerto', () => {
    expect(MIN_JULGAMENTOS).toBe(30);
    expect(MIN_ACERTO_PERCENTUAL).toBe(90);
    expect(MAX_JULGAMENTOS).toBe(200);
  });

  it('abaixo de 30 julgamentos NÃO libera e mostra "faltam N"', () => {
    const l = avaliarLiberacao(julgados(12, 12));
    expect(l).toMatchObject({ liberado: false, julgados: 12, faltam: 18 });
    expect(l.motivo).toMatch(/Faltam 18 julgamento\(s\)/);
  });

  it('30 julgamentos com 90% libera; 29 de 30 libera; 26 de 30 (87%) não, e explica o percentual', () => {
    expect(avaliarLiberacao(julgados(30, 27))).toMatchObject({ liberado: true, percentual: 90, faltam: 0, motivo: null });
    expect(avaliarLiberacao(julgados(30, 30)).liberado).toBe(true);
    const ruim = avaliarLiberacao(julgados(30, 26));
    expect(ruim).toMatchObject({ liberado: false, percentual: 87, faltam: 0 });
    expect(ruim.motivo).toMatch(/87%.*mínimo é 90%/);
  });

  it('só as decisões que GERAM ENVIO (cobrar, retomar) contam; sair/precisa/agendar não liberam nada', () => {
    const outras = [...julgados(40, 40, 'sair'), ...julgados(40, 40, 'precisa'), ...julgados(40, 40, 'agendar')];
    expect(avaliarLiberacao(outras)).toMatchObject({ liberado: false, julgados: 0, faltam: 30 });
    const misto = [...julgados(20, 20, 'cobrar'), ...julgados(10, 10, 'retomar').map((j, i) => ({ ...j, id: `r${i}` }))];
    expect(avaliarLiberacao(misto)).toMatchObject({ liberado: true, julgados: 30 });
  });

  it('decisão ainda não julgada não conta', () => {
    expect(avaliarLiberacao([...julgados(29, 29), decisao(99)])).toMatchObject({ liberado: false, julgados: 29, faltam: 1 });
  });

  it('placar por tipo de decisão: acertos/total e percentual', () => {
    const p = calcularPlacar([...julgados(4, 3, 'cobrar'), ...julgados(2, 2, 'sair').map((j, i) => ({ ...j, id: `s${i}` }))]);
    expect(p.find((l) => l.tipo === 'cobrar')).toMatchObject({ acertos: 3, total: 4, percentual: 75 });
    expect(p.find((l) => l.tipo === 'sair')).toMatchObject({ acertos: 2, total: 2, percentual: 100 });
    expect(p.find((l) => l.tipo === 'agendar')).toMatchObject({ total: 0, percentual: null });
  });

  it('"Errou" guarda motivo curto e a decisão certa; "Acertou" descarta; reabrir volta a pendente', () => {
    const j = decisao(1);
    const errou = julgar(j, 'errou', AGORA, { motivo: '  o cliente já tinha comprado  ', decisaoCerta: 'nada' });
    expect(errou).toMatchObject({ veredito: 'errou', motivo: 'o cliente já tinha comprado', decisaoCerta: 'nada' });
    expect(julgar(errou, 'acertou', AGORA, { motivo: 'x', decisaoCerta: 'sair' })).toMatchObject({ veredito: 'acertou', motivo: null, decisaoCerta: null });
    expect(julgar(j, 'errou', AGORA, { motivo: 'a'.repeat(500) }).motivo).toHaveLength(160);
    expect(reabrir(errou)).toMatchObject({ veredito: null, motivo: null, decisaoCerta: null, julgadoEm: null });
  });

  it('guarda só os últimos 200 julgamentos (e 100 pendentes): a poda devolve os ids mais antigos', () => {
    const todos = [...julgados(210, 200), ...Array.from({ length: 105 }, (_, i) => decisao(1000 + i, 'sair'))];
    const apagar = new Set(idsParaPodar(todos));
    expect(apagar.size).toBe(10 + 5);
    // os apagados são os mais antigos de cada grupo
    expect(apagar.has(todos[0].id)).toBe(true);
    expect(apagar.has(todos[209].id)).toBe(false);
    expect(MAX_PENDENTES_JULGAMENTO).toBe(100);
  });

  it('a mesma decisão tem sempre o mesmo id (nunca vira dois itens)', () => {
    expect(decisao(7).id).toBe(decisao(7).id);
    expect(decisao(7).id).not.toBe(decisao(8).id);
  });
});

describe('reler a conversa antes de enviar (regra pura)', () => {
  const eu = (texto: string, quando: string | null = null): MensagemLida => ({ de: 'eu', texto, quando });
  const cli = (texto: string, quando: string | null = null): MensagemLida => ({ de: 'cliente', texto, quando });
  const ANCORA = 'Oi Ana, tudo bem? Como estão de sal por aí?';
  const base = { desde: '2026-11-17T12:00:00.000Z', ancoraTexto: ANCORA, ancoraEm: '2026-11-14T12:00:00.000Z' };

  it('a última é nossa e o cliente não escreveu: pode enviar', () => {
    expect(conferirAntesDeEnviar([eu(ANCORA, '2026-11-14T12:00:00.000Z')], base)).toEqual({ ok: true });
  });

  it('a última mensagem é do cliente: não envia (respondeu)', () => {
    const r = conferirAntesDeEnviar([eu(ANCORA), cli('quanto custa?')], base);
    expect(r).toMatchObject({ ok: false, respondeu: true });
  });

  it('cliente escreveu DEPOIS da leitura da decisão (mesmo com a última sendo nossa): não envia', () => {
    const r = conferirAntesDeEnviar([eu(ANCORA), cli('oi', '2026-11-17T12:30:00.000Z'), eu('já te respondo', '2026-11-17T12:40:00.000Z')], base);
    expect(r).toMatchObject({ ok: false, respondeu: true });
  });

  it('mensagem do cliente ANTES da decisão não bloqueia por si só (a âncora decide)', () => {
    expect(conferirAntesDeEnviar([cli('bom dia', '2026-11-10T12:00:00.000Z'), eu(ANCORA)], base)).toEqual({ ok: true });
  });

  it('cliente respondeu à nossa mensagem e ainda falamos depois: o atendente já atendeu, não envia', () => {
    const r = conferirAntesDeEnviar([eu(ANCORA), cli('quero 10 sacos'), eu('Perfeito, já separo!')], { ...base, desde: '2026-11-18T12:00:00.000Z' });
    expect(r).toMatchObject({ ok: false, respondeu: false }); // atendido: nada a cobrar (o Executor manda para "revisar")
  });

  it('não achou a nossa mensagem ou conversa vazia: falha fechada', () => {
    expect(conferirAntesDeEnviar([], base)).toMatchObject({ ok: false, respondeu: false });
    expect(conferirAntesDeEnviar([eu('outra coisa')], base)).toMatchObject({ ok: false, respondeu: false });
  });

  it('sem âncora (reativação etapa 1): basta a última ser nossa e nada do cliente depois da leitura', () => {
    expect(conferirAntesDeEnviar([cli('ok', '2026-10-01T12:00:00.000Z'), eu('qualquer coisa me chama')], { desde: '2026-11-17T12:00:00.000Z' })).toEqual({ ok: true });
    expect(conferirAntesDeEnviar([eu('x'), cli('olá')], { desde: null })).toMatchObject({ ok: false, respondeu: true });
  });
});

describe('o item que o Executor pulou porque o cliente respondeu volta para a classificação', () => {
  const camp = (motivo: string): Campanha => ({ id: 'cob', tipo: 'followup', nome: 'F', criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: '', filtros: FILTROS_PADRAO, modelos: [], status: 'pausada', motivoPausa: null, itens: [{ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', modelo: 'x', status: 'pulado', motivo, atualizadoEm: AGORA.toISOString() }], problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null });
  const followup = (): Followup => ({ id: 'o:ana', campanhaId: 'o', chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', mensagemCampanha: 'Oi', enviadoEm: AGORA.toISOString(), estado: 'cobranca', motivo: null, verificadoEm: AGORA.toISOString(), cobrancas: [], cobrancaModelo: 'Oi', cobrancaOrigem: 'meus_textos', atualizadoEm: AGORA.toISOString() });

  it('follow-up: cliente respondeu → volta a "monitorando" e será lido de novo (não vai para "revisar")', () => {
    const [f] = aplicarResultadoCampanha([followup()], camp(`${MOTIVO_CLIENTE_RESPONDEU}: a última mensagem é do cliente`), [], AGORA);
    expect(f).toMatchObject({ estado: 'monitorando', verificadoEm: null, cobrancaModelo: null });
    // outro motivo de "pulado" continua indo para revisar (comportamento de antes)
    const [g] = aplicarResultadoCampanha([followup()], camp('recebeu outra campanha recentemente'), [], AGORA);
    expect(g.estado).toBe('revisar');
  });

  it('reativação: etapa 1 será avaliada de novo; etapas 2/3 voltam a ler a resposta', () => {
    const c = camp(`${MOTIVO_CLIENTE_RESPONDEU}: x`);
    const reg0: Reativacao = { ...novoRegistro({ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana' }, '2026-10-20', AGORA), estado: 'pronto', textoPronto: { etapa: 1, modelo: 'x', origem: 'meus_textos', assinatura: 'a' } };
    const [a] = aplicarResultadoCampanhaReativacao([reg0], { ...c, tipo: 'reativacao' }, [], AGORA);
    expect(a).toMatchObject({ estado: 'resolvido', textoPronto: null });
    expect(new Date(a.reelegivelEm as string).getTime()).toBeLessThanOrEqual(AGORA.getTime());
    const reg2: Reativacao = { ...reg0, etapa: 1, enviados: [{ etapa: 1, em: '2026-11-10T12:00:00.000Z', texto: 'oi' }], textoPronto: { etapa: 2, modelo: 'x', origem: 'meus_textos', assinatura: 'a' } };
    const [b] = aplicarResultadoCampanhaReativacao([reg2], { ...c, tipo: 'reativacao' }, [], AGORA);
    expect(b).toMatchObject({ estado: 'aguardando', leituraRespostaEm: null, textoPronto: null });
  });
});

describe('fila: prioridade fixa e previsão com o teto compartilhado', () => {
  const pronto = (chave: string, etapa: number, base = '2026-10-20'): Reativacao => ({ ...novoRegistro({ chave, nome: chave, primeiroNome: chave }, base, AGORA), estado: 'pronto', etapa: etapa - 1, textoPronto: { etapa, modelo: 'x', origem: 'meus_textos', assinatura: 'a' } });
  const cobranca = (chave: string): Followup => ({ id: `o:${chave}`, campanhaId: 'o', chave, nome: chave, primeiroNome: chave, mensagemCampanha: 'Oi', enviadoEm: AGORA.toISOString(), estado: 'cobranca', motivo: null, verificadoEm: null, cobrancas: [], cobrancaModelo: 'x', cobrancaOrigem: 'meus_textos', atualizadoEm: AGORA.toISOString() });

  it('ordem documentada: 1 cobrança, 2 reativação etapas 2 e 3, 3 reativação etapa 1', () => {
    expect(ORDEM_DA_FILA).toEqual(['cobranca', 'reativacao_2_3', 'reativacao_1']);
  });

  it('dentro da reativação, etapas 2 e 3 vêm antes da etapa 1; depois, a conversa mais antiga primeiro', () => {
    const lista = [pronto('a1', 1, '2026-10-10'), pronto('b3', 3, '2026-10-25'), pronto('c2', 2, '2026-10-15'), pronto('d1', 1, '2026-10-05')];
    expect(lista.sort(compararProntosDaReativacao).map((r) => r.chave)).toEqual(['c2', 'b3', 'd1', 'a1']);
  });

  it('previsão: "Hoje saem até N (teto X, já saíram Y); ficam Z", respeitando a prioridade', () => {
    const porGrupo = contarFila([cobranca('a'), cobranca('b'), cobranca('c')], [pronto('d', 2), pronto('e', 1), pronto('f', 1)]);
    expect(porGrupo).toEqual({ cobranca: 3, reativacao_2_3: 1, reativacao_1: 2 });
    const p = preverFila(porGrupo, 30, 25, 4);
    expect(p).toMatchObject({ vagasHoje: 5, saemHoje: 5, ficam: 1, comunsPendentes: 4 });
    expect(p.hojePorGrupo).toEqual({ cobranca: 3, reativacao_2_3: 1, reativacao_1: 1 });
    expect(textoDaPrevisao(p)).toBe('Hoje saem até 5 (teto 30, já saíram 25); ficam 1 na fila para os próximos dias.');
  });

  it('teto já atingido: nada sai hoje e tudo fica; fila menor que o teto: sai tudo', () => {
    expect(preverFila({ cobranca: 2, reativacao_2_3: 0, reativacao_1: 1 }, 30, 30)).toMatchObject({ saemHoje: 0, ficam: 3 });
    expect(preverFila({ cobranca: 2, reativacao_2_3: 0, reativacao_1: 1 }, 30, 0)).toMatchObject({ saemHoje: 3, ficam: 0 });
    expect(preverFila({ cobranca: 1, reativacao_2_3: 0, reativacao_1: 0 }, 30, 99).vagasHoje).toBe(0);
  });

  it('a reativação espera enquanto a cobrança está mandando de verdade (Ligado, sem pausa, com fila)', () => {
    expect(reativacaoDeveEsperar({ automatico: 'ligado', pausado: false }, 2)).toBe(true);
    expect(reativacaoDeveEsperar({ automatico: 'ligado', pausado: false }, 0)).toBe(false);
    expect(reativacaoDeveEsperar({ automatico: 'ligado', pausado: true }, 2)).toBe(false);
    expect(reativacaoDeveEsperar({ automatico: 'observacao', pausado: false }, 2)).toBe(false);
  });
});

describe('aviso de histórico sumindo (regra pura)', () => {
  const contato = (nome: string, ultimaConversa: string, extra: Partial<ContatoVarrido> = {}): ContatoVarrido => ({
    chave: nome.toLowerCase(), nome, rotuloData: '', ultimaConversa, revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, ultimaDeMim: true, duplicado: false, varridoEm: AGORA.toISOString(), ...extra,
  });
  const config = { etapas: [25, 30, 40] as [number, number, number], termo: 'CLIENTE', soMinha: true };
  const ctx = { agora: AGORA, naoEnviar: new Set<string>(), ultimoEnvioPorChave: new Map<string, string>() };
  // 17/11: 25 dias antes = 23/10; 30 dias antes = 18/10; 31 dias antes = 17/10
  it('conta quem está entre a etapa 1 e etapa 1 + 5 dias sem ter sido lido, e dá a data-limite do mais urgente', () => {
    const contatos = [contato('CLIENTE Ana', '2026-10-23'), contato('CLIENTE Bia', '2026-10-18'), contato('CLIENTE Caio', '2026-10-17'), contato('CLIENTE Dani', '2026-11-10')];
    const h = historicoSumindo(contatos, config, [], ctx);
    expect(h.total).toBe(2); // Ana (25 dias) e Bia (30 dias); Caio (31) já passou da janela; Dani é recente
    expect(h.ate).toBe('2026-11-17'); // Bia (18/10): 25 + 5 dias = hoje é o último dia
    expect(JANELA_AVISO_DIAS).toBe(5);
    expect(textoDoAviso(h)).toBe('2 conversas precisam ser lidas até 17/11 senão o histórico some do WhatsApp Web.');
  });

  it('quem já foi lido/avaliado (tem registro), está em "Não enviar mais" ou não é cliente não conta', () => {
    const contatos = [contato('CLIENTE Ana', '2026-10-23'), contato('CLIENTE Bia', '2026-10-22'), contato('CLIENTE Caio', '2026-10-22'), contato('Fornecedor Zé', '2026-10-22')];
    const registros = [novoRegistro({ chave: 'cliente ana', nome: 'CLIENTE Ana', primeiroNome: 'Ana' }, '2026-10-23', AGORA)];
    const h = historicoSumindo(contatos, config, registros, { ...ctx, naoEnviar: new Set(['cliente bia']) });
    expect(h.total).toBe(1); // só Caio
    expect(textoDoAviso(h)).toMatch(/^1 conversa precisa ser lida até \d\d\/\d\d senão o histórico some do WhatsApp Web\.$/);
  });

  it('ninguém em risco: nenhum aviso (null)', () => {
    const h = historicoSumindo([contato('CLIENTE Ana', '2026-11-10')], config, [], ctx);
    expect(h).toEqual({ total: 0, ate: null });
    expect(textoDoAviso(h)).toBeNull();
  });

  it('respeita a etapa 1 configurada pelo dono', () => {
    const h = historicoSumindo([contato('CLIENTE Ana', '2026-11-03')], { ...config, etapas: [14, 20, 30] }, [], ctx); // 14 dias
    expect(h.total).toBe(1);
  });
});
