// Reativação por inatividade (0.7.56): regras PURAS. Etapas, datas, quem entra, o que cada decisão da IA faz, a sequência
// (25 → 30 → 40 dias, só para quem recebeu a anterior e não respondeu), fim da linha e o resultado do Executor.

import { describe, expect, it } from 'vitest';
import type { Campanha } from '../src/shared/campanha';
import type { ContatoVarrido } from '../src/shared/contatos';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import {
  AGENDA_LONGA_PADRAO,
  CONFIG_REATIVACAO_PADRAO,
  ESPERA_FINAL_DIAS,
  ETAPAS_PADRAO,
  INTERVALO_MIN_ENTRE_ETAPAS,
  MOTIVO_TRAVA_PREFIXO,
  aplicarDecisao,
  aplicarResultadoCampanhaReativacao,
  assinaturaReativacao,
  candidatosEtapa1,
  concluirSemResposta,
  conversaTemTexto,
  dataDaUltimaMensagem,
  devidoParaLer,
  followupDaReativacao,
  instanteDoAgendamento,
  linhaDoCrm,
  normalizarConfigReativacao,
  normalizarEtapas,
  novoRegistro,
  podeEntrar,
  podeLigarReativacao,
  separarListasReativacao,
  textosDaEtapa,
  type AvaliacaoReativacao,
  type ConfigReativacao,
  type Reativacao,
} from '../src/shared/reativacao';
import { instanteNoFuso } from '../src/shared/crm-lembretes';

const AGORA = new Date('2026-11-17T13:00:00.000Z'); // terça 10h em Fortaleza
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);
const TEXTO = 'Oi, {nome}! Faz um tempinho que não nos falamos. Precisa de sal?';
const CFG: ConfigReativacao = { ...CONFIG_REATIVACAO_PADRAO, textos1: [TEXTO] };

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
  varridoEm: AGORA.toISOString(),
  ...extra,
});

const ctx = (extra: { naoEnviar?: string[]; ultimo?: Record<string, string> } = {}) => ({
  agora: AGORA,
  naoEnviar: new Set(extra.naoEnviar ?? []),
  ultimoEnvioPorChave: new Map(Object.entries(extra.ultimo ?? {})),
});

const reg = (chave: string, extra: Partial<Reativacao> = {}): Reativacao => ({ ...novoRegistro({ chave, nome: chave, primeiroNome: 'Ana' }, '2026-10-20', AGORA), ...extra });

describe('etapas', () => {
  it('padrão 25, 30 e 40 dias', () => {
    expect(ETAPAS_PADRAO).toEqual([25, 30, 40]);
    expect(CONFIG_REATIVACAO_PADRAO.etapas).toEqual([25, 30, 40]);
    expect(normalizarEtapas(undefined)).toEqual([25, 30, 40]);
  });

  it('configurável, sempre crescente e com no mínimo 3 dias entre uma e outra', () => {
    expect(normalizarEtapas([20, 35, 60])).toEqual([20, 35, 60]);
    expect(normalizarEtapas([25, 26, 27])).toEqual([25, 28, 31]);
    expect(normalizarEtapas([40, 30, 25])).toEqual([40, 43, 46]); // ordem errada é corrigida para crescente, não reordenada
    expect(normalizarEtapas([1, 2, 3])).toEqual([7, 10, 13]); // piso de 7 dias
    expect(normalizarEtapas([300, 400, 500])).toEqual([300, 362, 365]); // teto de 365, sem quebrar o intervalo mínimo
    expect(normalizarEtapas(['a', null, NaN])).toEqual([25, 30, 40]);
    for (const e of [[25, 25, 25], [7, 8, 9], [360, 361, 362]]) {
      const [a, b, c] = normalizarEtapas(e);
      expect(b - a).toBeGreaterThanOrEqual(INTERVALO_MIN_ENTRE_ETAPAS);
      expect(c - b).toBeGreaterThanOrEqual(INTERVALO_MIN_ENTRE_ETAPAS);
    }
  });
});

describe('configuração: desligada de fábrica, só liga com risco confirmado e texto do dono', () => {
  it('padrão desligado, sem texto', () => {
    expect(CONFIG_REATIVACAO_PADRAO).toMatchObject({ ligado: false, confirmouRisco: false, textos1: [], agendaLonga: true, agendaLongaDias: AGENDA_LONGA_PADRAO, termo: 'CLIENTE', soMinha: true });
  });

  it('ligado sem confirmar o risco vira desligado; sem texto da etapa 1 também, com aviso', () => {
    expect(normalizarConfigReativacao({ ligado: true, confirmouRisco: false, textos1: [TEXTO] }).ligado).toBe(false);
    const semTexto = normalizarConfigReativacao({ ligado: true, confirmouRisco: true, textos1: [] });
    expect(semTexto).toMatchObject({ ligado: false, desligadaSemTexto: true });
    expect(normalizarConfigReativacao({ ligado: true, confirmouRisco: true, textos1: [TEXTO] }).ligado).toBe(true);
    expect(podeLigarReativacao({ textos1: [] }).ok).toBe(false);
    expect(podeLigarReativacao({ textos1: [TEXTO] }).ok).toBe(true);
  });

  it('texto inválido (sem {nome}, com link, com termo proibido) é descartado: não conta como texto salvo', () => {
    const c = normalizarConfigReativacao({ ligado: true, confirmouRisco: true, textos1: ['Oi sem marcador de nome nenhum aqui', 'Oi, {nome}! veja www.sal.com.br', 'Oi, {nome}! Nosso sal natural é bom'] });
    expect(c.textos1).toEqual([]);
    expect(c.ligado).toBe(false);
  });

  it('agenda longa: padrão 60 dias, limitada a 14-365', () => {
    expect(normalizarConfigReativacao({ agendaLongaDias: 5 }).agendaLongaDias).toBe(14);
    expect(normalizarConfigReativacao({ agendaLongaDias: 9999 }).agendaLongaDias).toBe(365);
    expect(normalizarConfigReativacao({ agendaLonga: false }).agendaLonga).toBe(false);
  });

  it('textos próprios por etapa; a etapa sem texto usa a anterior', () => {
    const t = { textos1: ['a {nome} um texto'], textos2: ['b {nome} outro texto'], textos3: [] as string[] };
    expect(textosDaEtapa(t, 1)).toEqual(t.textos1);
    expect(textosDaEtapa(t, 2)).toEqual(t.textos2);
    expect(textosDaEtapa(t, 3)).toEqual(t.textos2);
    expect(textosDaEtapa({ ...t, textos2: [] }, 3)).toEqual(t.textos1);
  });

  it('a assinatura muda com o modo, os textos e o estilo (texto velho nunca sai)', () => {
    const a = assinaturaReativacao(CFG);
    expect(assinaturaReativacao({ ...CFG, textos2: ['x {nome} y texto aqui'] })).not.toBe(a);
    expect(assinaturaReativacao({ ...CFG, modo: 'ia_estilo' })).not.toBe(a);
    expect(assinaturaReativacao({ ...CFG, estilo: 'só no modo meus_textos não conta' })).toBe(a);
    expect(assinaturaReativacao({ ...CFG, modo: 'ia_estilo', estilo: 'curto' })).not.toBe(assinaturaReativacao({ ...CFG, modo: 'ia_estilo', estilo: 'longo' }));
  });
});

describe('quem entra na etapa 1 (mesmas regras de público da política)', () => {
  const rodar = (contatos: ContatoVarrido[], c = CFG, registros: Reativacao[] = [], x = ctx()) => candidatosEtapa1(contatos, c, new Map(registros.map((r) => [r.chave, r])), x);

  it('entra quem tem a última conversa há 25+ dias, salvo, individual, com o termo no nome', () => {
    const r = rodar([contato('CLIENTE Ana'), contato('CLIENTE Bia', { ultimaConversa: '2026-10-23', rotuloData: '23/10/2026' })]);
    expect(r.elegiveis.map((c) => c.nome)).toEqual(['CLIENTE Ana', 'CLIENTE Bia']); // Bia: 25 dias exatos = entra
    const r2 = rodar([contato('CLIENTE Ana', { ultimaConversa: '2026-10-24', rotuloData: '24/10/2026' })]);
    expect(r2.elegiveis).toEqual([]); // 24 dias: ainda não
  });

  it('nunca grupo, nunca só número, nunca sem conversa, nunca fora do termo', () => {
    const r = rodar([
      contato('CLIENTE Grupo', { pareceGrupo: true }),
      contato('+55 84 99999-0000', { soNumero: true }),
      contato('CLIENTE Sem Conversa', { temConversa: false, ultimaConversa: null, rotuloData: null }),
      contato('Fornecedor Pedro'),
      contato('CLIENTE Ok'),
    ]);
    expect(r.elegiveis.map((c) => c.nome)).toEqual(['CLIENTE Ok']);
  });

  it('nunca quem está em "Não enviar mais"', () => {
    expect(rodar([contato('CLIENTE Ana')], CFG, [], ctx({ naoEnviar: ['cliente ana'] })).elegiveis).toEqual([]);
  });

  it('nome repetido, possível grupo e data incerta NÃO entram sozinhos (vão para "dúvida na varredura")', () => {
    const r = rodar([contato('CLIENTE Dup', { duplicado: true }), contato('CLIENTE Grupo?', { possivelGrupo: true }), contato('CLIENTE Data', { ultimaConversa: null, revisarData: 'dia da semana ambíguo' })]);
    expect(r.elegiveis).toEqual([]);
    expect(r.aRevisarNaVarredura).toBe(3);
  });

  it('quem recebeu campanha há menos de 14 dias fica de fora (não acumula com outra campanha)', () => {
    const r = rodar([contato('CLIENTE Ana')], CFG, [], ctx({ ultimo: { 'cliente ana': dias(-5).toISOString() } }));
    expect(r.elegiveis).toEqual([]);
  });

  it('"só quem eu já falei": sem sinal de mensagem minha, fica de fora; desligando a opção, entra', () => {
    const c = contato('CLIENTE Ana', { ultimaDeMim: false });
    expect(rodar([c]).elegiveis).toEqual([]);
    expect(rodar([c], { ...CFG, soMinha: false }).elegiveis).toHaveLength(1);
  });

  it('termo vazio = qualquer contato salvo', () => {
    expect(rodar([contato('Fornecedor Pedro')], { ...CFG, termo: '' }).elegiveis).toHaveLength(1);
  });

  it('os de conversa mais antiga primeiro (o histórico que está para sumir)', () => {
    const r = rodar([contato('CLIENTE Nova', { ultimaConversa: '2026-10-18' }), contato('CLIENTE Velha', { ultimaConversa: '2026-09-01' })]);
    expect(r.elegiveis.map((c) => c.nome)).toEqual(['CLIENTE Velha', 'CLIENTE Nova']);
  });

  it('o registro decide se pode voltar: em andamento/aguardando/precisa/saiu não; resolvido e agendado só depois da data', () => {
    for (const estado of ['pronto', 'aguardando', 'precisa', 'saiu'] as const) expect(podeEntrar(reg('a', { estado }), AGORA), estado).toBe(false);
    expect(podeEntrar(undefined, AGORA)).toBe(true);
    expect(podeEntrar(reg('a', { estado: 'travado' }), AGORA)).toBe(true); // reavalia: a trava confere de novo
    expect(podeEntrar(reg('a', { estado: 'agendado', reelegivelEm: dias(10).toISOString() }), AGORA)).toBe(false);
    expect(podeEntrar(reg('a', { estado: 'agendado', reelegivelEm: dias(-1).toISOString() }), AGORA)).toBe(true);
    expect(podeEntrar(reg('a', { estado: 'resolvido', reelegivelEm: dias(5).toISOString() }), AGORA)).toBe(false);
    expect(podeEntrar(reg('a', { estado: 'respondeu', reelegivelEm: dias(-1).toISOString() }), AGORA)).toBe(true);
    expect(podeEntrar(reg('a', { estado: 'travado', reelegivelEm: dias(20).toISOString() }), AGORA)).toBe(false); // agendamento futuro: só depois da data
    expect(podeEntrar(reg('a', { estado: 'saiu', reelegivelEm: dias(-1).toISOString() }), AGORA)).toBe(false); // opt-out nunca volta
  });
});

describe('o que cada decisão da IA faz (as regras são do código)', () => {
  const av = (decisao: AvaliacaoReativacao['decisao'], extra: Partial<AvaliacaoReativacao> = {}): AvaliacaoReativacao => ({ ref: 'c1', decisao, resumo: 'Comprou 40 sacos em setembro; sem pendência.', ...extra });

  it('precisa_agora → mensagem do dono (pronto), nota no CRM sem agendamento, cria o lead se faltar', () => {
    const p = aplicarDecisao(reg('a'), av('precisa_agora'), 25, AGORA);
    expect(p.registro.estado).toBe('pronto');
    expect(p.precisaTexto).toBe(true);
    expect(p.crm).toMatchObject({ agendarEm: null, criar: true });
    expect(p.crm?.linha).toMatch(/^Reativação 25d \(IA\): Comprou 40 sacos/);
    expect(p.optOut).toBe(false);
  });

  it('precisa_mais_tempo → agendamento no CRM para hoje + dias às 9h de Fortaleza, SEM mensagem', () => {
    const p = aplicarDecisao(reg('a'), av('precisa_mais_tempo', { diasSugeridos: 45 }), 25, AGORA);
    expect(p.registro.estado).toBe('agendado');
    expect(p.precisaTexto).toBe(false);
    expect(p.crm?.agendarEm).toBe(instanteNoFuso('2027-01-01', 9, 0)); // 17/11 + 45 dias
    expect(p.crm?.linha).toMatch(/Retomar em 45 dias/);
    expect(p.registro.diasSugeridos).toBe(45);
  });

  it('aguardando_cliente é tratado como precisa_mais_tempo com dias', () => {
    const p = aplicarDecisao(reg('a'), av('aguardando_cliente', { diasSugeridos: 14 }), 25, AGORA);
    expect(p.registro.estado).toBe('agendado');
    expect(p.crm?.agendarEm).toBe(instanteNoFuso('2026-12-01', 9, 0));
  });

  it('mais tempo SEM prazo válido nunca vira mensagem nem agendamento inventado: vai para "Precisa de você"', () => {
    for (const d of [undefined, 3, 200, 10.5]) {
      const p = aplicarDecisao(reg('a'), av('precisa_mais_tempo', { diasSugeridos: d }), 25, AGORA);
      expect(p.registro.estado, String(d)).toBe('precisa');
      expect(p.precisaTexto).toBe(false);
      expect(p.crm?.agendarEm).toBeNull();
    }
  });

  it('delicado → "Precisa de você" na lista do Follow-up, sem mensagem, resumo salvo no CRM', () => {
    const p = aplicarDecisao(reg('a'), av('delicado', { resumo: 'Reclamou de atraso na entrega.' }), 25, AGORA);
    expect(p).toMatchObject({ paraOLista: true, precisaTexto: false, optOut: false });
    expect(p.registro.estado).toBe('precisa');
    expect(p.crm?.linha).toMatch(/Reclamou de atraso/);
  });

  it('sem_contexto → "Precisa de você", sem nota no CRM', () => {
    const p = aplicarDecisao(reg('a'), av('sem_contexto', { resumo: '' }), 25, AGORA);
    expect(p).toMatchObject({ paraOLista: true, precisaTexto: false, crm: null });
    expect(p.registro.estado).toBe('precisa');
  });

  it('pediu_para_sair → opt-out, nunca cria lead', () => {
    const p = aplicarDecisao(reg('a'), av('pediu_para_sair'), 25, AGORA);
    expect(p).toMatchObject({ optOut: true, precisaTexto: false });
    expect(p.registro.estado).toBe('saiu');
    expect(p.crm?.criar).toBe(false);
  });

  it('a nota do CRM é curta e começa pelo carimbo da etapa', () => {
    expect(linhaDoCrm(25, 'x'.repeat(2000), 'precisa_agora').length).toBeLessThan(700);
    expect(linhaDoCrm(30, '', 'delicado')).toMatch(/^Reativação 30d \(IA\): assunto delicado/);
  });

  it('o agendamento às 9h de Fortaleza é o mesmo dos lembretes do CRM', () => {
    expect(instanteDoAgendamento(30, AGORA)).toBe(instanteNoFuso('2026-12-17', 9, 0));
  });
});

describe('ler a conversa', () => {
  it('data da última mensagem com carimbo (fuso de Fortaleza); sem carimbo = null', () => {
    expect(dataDaUltimaMensagem([{ de: 'eu', texto: 'a', quando: '2026-10-01T02:00:00.000Z' }, { de: 'cliente', texto: 'b', quando: '2026-10-20T12:00:00.000Z' }])).toBe('2026-10-20');
    expect(dataDaUltimaMensagem([{ de: 'eu', texto: 'a', quando: '2026-10-01T02:00:00.000Z' }])).toBe('2026-09-30'); // 23h do dia anterior em Fortaleza
    expect(dataDaUltimaMensagem([{ de: 'eu', texto: 'a', quando: null }])).toBeNull();
  });

  it('conversa só de mídia/figurinha/vazia não tem texto', () => {
    expect(conversaTemTexto([])).toBe(false);
    expect(conversaTemTexto([{ de: 'cliente', texto: '', quando: null }, { de: 'eu', texto: '  ', quando: null }])).toBe(false);
    expect(conversaTemTexto([{ de: 'cliente', texto: 'oi', quando: null }])).toBe(true);
  });
});

describe('a sequência: 25 → 30 → 40 dias, só para quem recebeu a anterior e não respondeu', () => {
  const enviado = (etapa: number, em: Date) => ({ etapa, em: em.toISOString(), texto: `texto ${etapa}` });
  // contato cuja última conversa real foi em 20/10 (28 dias antes de 17/11): etapa 1 enviada hoje
  // `conferido`: já leu a conversa depois do último envio (isola a regra da próxima etapa da "conferência de resposta").
  const aguardando = (etapa: number, ultimoEm: Date, conferido = true): Reativacao =>
    reg('a', {
      estado: 'aguardando',
      etapa,
      baseConversa: '2026-10-20',
      leituraRespostaEm: conferido ? new Date(ultimoEm.getTime() + 3_600_000).toISOString() : null,
      enviados: Array.from({ length: etapa }, (_, i) => enviado(i + 1, i === etapa - 1 ? ultimoEm : dias(-100))),
    });

  it('as etapas contam desde a ÚLTIMA conversa real: base 20/10 → etapa 2 em 19/11 (30 dias) e etapa 3 em 29/11 (40 dias)', () => {
    const r1 = aguardando(1, new Date('2026-11-14T13:00:00Z')); // enviada 14/11 (base 20/10: 25 dias na época)
    expect(devidoParaLer(r1, CFG, new Date('2026-11-18T13:00:00Z'))).toBeNull(); // 29 dias desde a conversa: ainda não é 30
    expect(devidoParaLer(r1, CFG, new Date('2026-11-19T13:00:00Z'))).toEqual({ tipo: 'proxima', etapa: 2 }); // 30
    const r2 = aguardando(2, new Date('2026-11-19T13:00:00Z'));
    expect(devidoParaLer(r2, CFG, new Date('2026-11-28T13:00:00Z'))).toBeNull(); // 39
    expect(devidoParaLer(r2, CFG, new Date('2026-11-29T13:00:00Z'))).toEqual({ tipo: 'proxima', etapa: 3 }); // 40
  });

  it('nunca duas mensagens em menos de 3 dias, mesmo que as etapas já tenham passado', () => {
    const r = aguardando(1, new Date('2026-11-18T13:00:00Z')); // enviada ontem; a etapa 2 (30 dias) já passou na data de 20/11
    expect(devidoParaLer(r, CFG, new Date('2026-11-20T13:00:00Z'))).toBeNull(); // 2 dias desde o envio
    expect(devidoParaLer(r, CFG, new Date('2026-11-21T13:00:00Z'))).toEqual({ tipo: 'proxima', etapa: 2 }); // 3 dias
  });

  it('confere se respondeu depois de 2 dias (uma vez por envio), sem esperar a próxima etapa', () => {
    const r = aguardando(1, new Date('2026-11-17T13:00:00Z'), false); // base 20/10, só 28 dias
    expect(devidoParaLer(r, CFG, new Date('2026-11-18T13:00:00Z'))).toBeNull(); // 1 dia
    expect(devidoParaLer(r, CFG, new Date('2026-11-19T13:00:00Z'))).toEqual({ tipo: 'conferir' }); // 2 dias
    const lido = { ...r, leituraRespostaEm: new Date('2026-11-19T14:00:00Z').toISOString() };
    expect(devidoParaLer(lido, CFG, new Date('2026-11-19T15:00:00Z'))).toBeNull(); // já conferiu depois do envio
  });

  it(`depois da última etapa espera ${ESPERA_FINAL_DIAS} dias por resposta e conclui`, () => {
    const r = aguardando(3, new Date('2026-12-01T13:00:00Z'), false);
    expect(devidoParaLer(r, CFG, new Date('2026-12-05T13:00:00Z'))).toEqual({ tipo: 'conferir' });
    expect(devidoParaLer({ ...r, leituraRespostaEm: '2026-12-05T13:00:00.000Z' }, CFG, new Date('2026-12-07T13:00:00Z'))).toBeNull();
    expect(devidoParaLer(r, CFG, new Date('2026-12-08T13:00:00Z'))).toEqual({ tipo: 'conclusao' });
  });

  it('só quem está "aguardando" é lido; pronto/precisa/resolvido/respondeu nunca avançam sozinhos', () => {
    for (const estado of ['pronto', 'precisa', 'resolvido', 'respondeu', 'saiu', 'travado', 'agendado'] as const) {
      expect(devidoParaLer({ ...aguardando(1, dias(-10)), estado }, CFG, AGORA), estado).toBeNull();
    }
  });

  it('etapas configuráveis valem na sequência', () => {
    const cfg = { ...CFG, etapas: [20, 35, 60] as [number, number, number] };
    const r = aguardando(1, new Date('2026-11-01T13:00:00Z')); // base 20/10
    expect(devidoParaLer(r, cfg, new Date('2026-11-23T13:00:00Z'))).toBeNull(); // 34 dias
    expect(devidoParaLer(r, cfg, new Date('2026-11-24T13:00:00Z'))).toEqual({ tipo: 'proxima', etapa: 2 }); // 35
  });

  it('depois da 3ª sem resposta: "resolvido/sem resposta" e agendamento longo (60 dias) configurável', () => {
    const base = aguardando(3, dias(-8));
    const fim = concluirSemResposta(base, CFG, AGORA);
    expect(fim.registro).toMatchObject({ estado: 'resolvido' });
    expect(fim.registro.motivo).toMatch(/sem resposta depois de 3/);
    expect(fim.crm).toMatchObject({ agendarEm: instanteNoFuso('2027-01-16', 9, 0), criar: false }); // 17/11 + 60
    expect(fim.crm?.linha).toMatch(/Nova tentativa em 60 dias/);
    const sem = concluirSemResposta(base, { ...CFG, agendaLonga: false }, AGORA);
    expect(sem.crm?.agendarEm).toBeNull();
    const curta = concluirSemResposta(base, { ...CFG, agendaLongaDias: 90 }, AGORA);
    expect(curta.crm?.agendarEm).toBe(instanteNoFuso('2027-02-15', 9, 0));
    // fica fora de uma nova reativação até a data da nova tentativa
    expect(podeEntrar(fim.registro, dias(30))).toBe(false);
    expect(podeEntrar(fim.registro, dias(61))).toBe(true);
  });
});

describe('resultado do Executor → registros', () => {
  const campanha = (itens: Campanha['itens']): Campanha => ({ id: 'camp', tipo: 'reativacao', nome: 'R', criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: '', filtros: FILTROS_PADRAO, modelos: [], status: 'concluida', motivoPausa: null, itens, problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null });
  const item = (chave: string, status: Campanha['itens'][number]['status'], motivo: string | null = null) => ({ chave, nome: chave, primeiroNome: 'Ana', modelo: 'Oi {primeiroNome}, tudo bem por aí hoje?', status, motivo, atualizadoEm: AGORA.toISOString() });
  const pronto = (chave: string, etapa = 1): Reativacao => reg(chave, { estado: 'pronto', etapa: etapa - 1, textoPronto: { etapa, modelo: 'Oi {primeiroNome}, tudo bem por aí hoje?', origem: 'meus_textos', assinatura: 'x' } });
  const envio = (chave: string) => ({ id: `camp:${chave}`, campanhaId: 'camp', chave, nome: chave, enviadoEm: AGORA.toISOString(), textoConfere: true });

  it('enviado → aguardando a etapa, com o texto e a hora; idempotente', () => {
    const c = campanha([item('a', 'enviado')]);
    const [r] = aplicarResultadoCampanhaReativacao([pronto('a')], c, [envio('a')], AGORA);
    expect(r).toMatchObject({ estado: 'aguardando', etapa: 1, textoPronto: null });
    expect(r.enviados).toEqual([{ etapa: 1, em: AGORA.toISOString(), texto: 'Oi Ana, tudo bem por aí hoje?' }]);
    const [denovo] = aplicarResultadoCampanhaReativacao([r], c, [envio('a')], AGORA);
    expect(denovo).toBe(r); // não conta duas vezes
  });

  it('etapa 2 enviada: mantém o histórico e a etapa certa', () => {
    const r2 = { ...pronto('a', 2), etapa: 1, enviados: [{ etapa: 1, em: dias(-5).toISOString(), texto: 'primeira' }] };
    const [r] = aplicarResultadoCampanhaReativacao([r2], campanha([item('a', 'enviado')]), [envio('a')], AGORA);
    expect(r.etapa).toBe(2);
    expect(r.enviados.map((e) => e.etapa)).toEqual([1, 2]);
  });

  it('pendente não muda; "Não enviar mais" → saiu; trava no envio → travado; problema/revisar → precisa', () => {
    const c = campanha([item('p', 'pendente'), item('n', 'nao_enviar', 'marcado "Não enviar mais"'), item('t', 'pulado', `${MOTIVO_TRAVA_PREFIXO}15/01 (o agendamento prevalece)`), item('x', 'problema', 'não achei'), item('r', 'revisar', 'pode ter saído')]);
    const antes = ['p', 'n', 't', 'x', 'r'].map((k) => pronto(k));
    const depois = aplicarResultadoCampanhaReativacao(antes, c, [], AGORA);
    expect(depois.map((r) => r.estado)).toEqual(['pronto', 'saiu', 'travado', 'precisa', 'precisa']);
    expect(depois[0]).toBe(antes[0]);
    expect(depois[2].motivo).toMatch(/^agendado para 15\/01/);
  });
});

describe('listas do painel e a lista "Precisa de você" do Follow-up', () => {
  it('separa por estado, mais recente primeiro', () => {
    const L = separarListasReativacao([reg('a', { estado: 'pronto', atualizadoEm: '2026-11-01T00:00:00Z' }), reg('b', { estado: 'pronto', atualizadoEm: '2026-11-02T00:00:00Z' }), reg('c', { estado: 'travado' }), reg('d', { estado: 'agendado' }), reg('e', { estado: 'precisa' })]);
    expect(L.pronto.map((r) => r.chave)).toEqual(['b', 'a']);
    expect([L.travado.length, L.agendado.length, L.precisa.length]).toEqual([1, 1, 1]);
  });

  it('o item do Follow-up vem marcado como da reativação e nunca vira "monitorando" (cobrança)', () => {
    const f = followupDaReativacao(reg('a', { resumo: 'Reclamou do prazo', enviados: [{ etapa: 1, em: AGORA.toISOString(), texto: 'oi' }] }), AGORA);
    expect(f).toMatchObject({ id: 'reat:a', origem: 'reativacao', estado: 'precisa', cobrancas: [], campanhaId: 'reativacao', mensagemCampanha: 'oi' });
  });
});
