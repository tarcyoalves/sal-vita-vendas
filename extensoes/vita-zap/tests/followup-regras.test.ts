// Regras PURAS do follow-up (shared/followup.ts): quem cobrar, quando, máximo de tentativas, opt-out, falha fechada
// e o que fazer com cada classe devolvida pela IA.

import { describe, expect, it } from 'vitest';
import type { Campanha, ItemCampanha } from '../src/shared/campanha';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import {
  CONFIG_FOLLOWUP_PADRAO,
  JANELA_DIAS,
  MAX_COBRANCAS,
  aplicarClassificacao,
  aplicarResultadoCampanha,
  analisarLeitura,
  decidirCobranca,
  devidoParaVerificar,
  lerCarimbo,
  normalizarConfigFollowup,
  novosFollowups,
  paraModelo,
  separarListas,
  type ClassificacaoIa,
  type ClasseIa,
  type Followup,
} from '../src/shared/followup';
import type { Envio } from '../src/shared/exportar';
import type { MensagemLida } from '../src/shared/mensagens';

// 17/11/2026 10:00 em Fortaleza (UTC-3), terça
const AGORA = new Date('2026-11-17T13:00:00.000Z');
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

const TEXTO = 'Oi Maria, tudo bem? Como estão de sal por aí?';

function followup(parcial: Partial<Followup> = {}): Followup {
  return {
    id: 'camp1:maria',
    campanhaId: 'camp1',
    chave: 'maria',
    nome: 'Maria Cliente',
    primeiroNome: 'Maria',
    mensagemCampanha: TEXTO,
    enviadoEm: dias(3),
    estado: 'monitorando',
    motivo: null,
    verificadoEm: null,
    cobrancas: [],
    cobrancaModelo: null,
    cobrancaOrigem: null,
    atualizadoEm: dias(3),
    ...parcial,
  };
}

const eu = (texto: string, quando: string | null = null): MensagemLida => ({ de: 'eu', texto, quando });
const cli = (texto: string, quando: string | null = null): MensagemLida => ({ de: 'cliente', texto, quando });

describe('configuração', () => {
  it('padrão desligado, 3 dias, sem confirmação do risco', () => {
    expect(CONFIG_FOLLOWUP_PADRAO).toEqual({ ligado: false, dias: 3, pausado: false, confirmouRisco: false, modo: 'meus_textos', textos1: [], textos2: [], estilo: '', desligadaSemTexto: false });
  });

  it('nunca fica ligado sem a confirmação do risco e prende os dias em 1–30', () => {
    expect(normalizarConfigFollowup({ ligado: true, confirmouRisco: false }).ligado).toBe(false);
    expect(normalizarConfigFollowup({ ligado: true, confirmouRisco: true, textos1: ['Oi, {nome}! Conseguiu ver a minha mensagem?'] }).ligado).toBe(true);
    expect(normalizarConfigFollowup({ dias: 0 }).dias).toBe(1);
    expect(normalizarConfigFollowup({ dias: 999 }).dias).toBe(30);
    expect(normalizarConfigFollowup({ dias: 4.9 }).dias).toBe(4);
    expect(normalizarConfigFollowup({ dias: Number.NaN }).dias).toBe(3);
    expect(normalizarConfigFollowup(null)).toEqual(CONFIG_FOLLOWUP_PADRAO);
  });
});

describe('lerCarimbo (data-pre-plain-text)', () => {
  it('lê hora e data do WhatsApp em português (Fortaleza = UTC-3)', () => {
    expect(lerCarimbo('[10:30, 26/10/2026] Ana Cliente: ')).toBe('2026-10-26T13:30:00.000Z');
    expect(lerCarimbo('[23:59, 31/12/2026] Ana: ')).toBe('2027-01-01T02:59:00.000Z');
  });

  it('aceita 12 horas', () => {
    expect(lerCarimbo('[10:30 AM, 26/10/2026] Ana: ')).toBe('2026-10-26T13:30:00.000Z');
    expect(lerCarimbo('[12:05 AM, 26/10/2026] Ana: ')).toBe('2026-10-26T03:05:00.000Z');
    expect(lerCarimbo('[12:05 PM, 26/10/2026] Ana: ')).toBe('2026-10-26T15:05:00.000Z');
    expect(lerCarimbo('[1:07 PM, 26/10/2026] Ana: ')).toBe('2026-10-26T16:07:00.000Z');
  });

  it('o que não é carimbo (ou é data impossível) vira null', () => {
    for (const x of [null, undefined, '', 'Ana: oi', '[25:00, 26/10/2026] A: ', '[10:30, 31/02/2026] A: ', '[10:30, 26/13/2026] A: ', '[10:30 PM, 26/10/2026]x'.replace('PM', 'XX')]) {
      expect(lerCarimbo(x as string | null | undefined), String(x)).toBeNull();
    }
  });
});

describe('devidoParaVerificar: X dias de calendário', () => {
  it('só lê quem está monitorando e já passou de X dias desde o disparo', () => {
    expect(devidoParaVerificar(followup({ enviadoEm: dias(3) }), 3, AGORA)).toBe(true);
    expect(devidoParaVerificar(followup({ enviadoEm: dias(2) }), 3, AGORA)).toBe(false);
    expect(devidoParaVerificar(followup({ enviadoEm: dias(10) }), 3, AGORA)).toBe(true);
  });

  it('a referência é a última cobrança, não o disparo', () => {
    const f = followup({ enviadoEm: dias(10), cobrancas: [{ em: dias(1), texto: 'x' }] });
    expect(devidoParaVerificar(f, 3, AGORA)).toBe(false);
    expect(devidoParaVerificar({ ...f, cobrancas: [{ em: dias(3), texto: 'x' }] }, 3, AGORA)).toBe(true);
  });

  it('estados que não são "monitorando" nunca são lidos', () => {
    for (const estado of ['cobranca', 'precisa', 'revisar', 'saiu', 'resolvido'] as const) {
      expect(devidoParaVerificar(followup({ estado, enviadoEm: dias(10) }), 3, AGORA), estado).toBe(false);
    }
  });

  it('o botão "verificar agora" lê os recentes a partir de 2 horas', () => {
    const duasHoras = new Date(AGORA.getTime() - 2 * 3_600_000).toISOString();
    const umaHora = new Date(AGORA.getTime() - 3_600_000).toISOString();
    expect(devidoParaVerificar(followup({ enviadoEm: duasHoras }), 3, AGORA, true)).toBe(true);
    expect(devidoParaVerificar(followup({ enviadoEm: umaHora }), 3, AGORA, true)).toBe(false);
    expect(devidoParaVerificar(followup({ enviadoEm: duasHoras }), 3, AGORA, false)).toBe(false);
  });
});

describe('analisarLeitura: o cliente respondeu depois do nosso disparo?', () => {
  const ref = dias(3);

  it('ninguém escreveu depois da nossa mensagem → sem resposta', () => {
    expect(analisarLeitura([cli('oi antigo'), eu(TEXTO)], TEXTO, ref)).toEqual({ tipo: 'sem_resposta' });
  });

  it('resposta antes do disparo não conta', () => {
    expect(analisarLeitura([cli('tem sal?'), eu('tenho sim'), eu(TEXTO)], TEXTO, ref)).toEqual({ tipo: 'sem_resposta' });
  });

  it('cliente escreveu depois e a última é dele → respondeu (conversa desde o disparo)', () => {
    const l = analisarLeitura([cli('antigo'), eu(TEXTO), cli('quanto custa?')], TEXTO, ref);
    expect(l).toEqual({ tipo: 'respondeu', mensagens: [eu(TEXTO), cli('quanto custa?')] });
  });

  it('mídia sem texto do cliente também é resposta (nunca cobra)', () => {
    expect(analisarLeitura([eu(TEXTO), cli('')], TEXTO, ref).tipo).toBe('respondeu');
  });

  it('o atendente já respondeu depois do cliente → atendido (não vai para a IA nem para cobrança)', () => {
    expect(analisarLeitura([eu(TEXTO), cli('quanto custa?'), eu('R$ ...')], TEXTO, ref).tipo).toBe('atendido');
  });

  it('o atendente já escreveu depois do disparo e o cliente não respondeu → atendido (não cobra por cima)', () => {
    expect(analisarLeitura([eu(TEXTO), eu('liguei para você')], TEXTO, ref).tipo).toBe('atendido');
  });

  it('acha a mensagem por texto normalizado (espaços, emoji) e usa a ÚLTIMA ocorrência', () => {
    const msgs = [eu(TEXTO), cli('quero'), eu('  Oi Maria,  tudo bem? Como estão de sal por aí? '), cli('depois')];
    expect(analisarLeitura(msgs, TEXTO, ref)).toEqual({ tipo: 'respondeu', mensagens: [msgs[2], msgs[3]] });
  });

  it('FALHA FECHADA: não achou a mensagem do disparo e não há resposta datada → dúvida (não cobra)', () => {
    const l = analisarLeitura([cli('oi'), eu('outra coisa')], TEXTO, ref);
    expect(l.tipo).toBe('duvida');
    expect(analisarLeitura([], TEXTO, ref).tipo).toBe('duvida');
  });

  it('sem texto igual, a hora do envio ancora a nossa mensagem (texto editado antes de enviar)', () => {
    const quando = new Date(new Date(ref).getTime() + 30_000).toISOString();
    const msgs = [eu('Oi Maria, tudo bem? (editado)', quando), cli('manda o preço')];
    expect(analisarLeitura(msgs, TEXTO, ref).tipo).toBe('respondeu');
    expect(analisarLeitura([eu('Oi Maria, tudo bem? (editado)', quando)], TEXTO, ref).tipo).toBe('sem_resposta');
  });

  it('sem âncora, resposta DATADA depois do envio basta para saber que respondeu', () => {
    const depois = new Date(new Date(ref).getTime() + 3_600_000).toISOString();
    expect(analisarLeitura([cli('oi', depois)], TEXTO, ref).tipo).toBe('respondeu');
    const antes = new Date(new Date(ref).getTime() - 3_600_000).toISOString();
    expect(analisarLeitura([cli('oi', antes)], TEXTO, ref).tipo).toBe('duvida');
  });

  it('limita a conversa que vai para a IA às últimas 12 mensagens', () => {
    const msgs = [eu(TEXTO), ...Array.from({ length: 30 }, (_, i) => cli(`m${i}`))];
    const l = analisarLeitura(msgs, TEXTO, ref);
    expect(l.tipo === 'respondeu' && l.mensagens.length).toBe(12);
  });
});

describe('decidirCobranca', () => {
  const ctx = (extra: Partial<Parameters<typeof decidirCobranca>[1]> = {}) => ({
    agora: AGORA,
    dias: 3,
    naoEnviar: new Set<string>(),
    ultimoEnvioPorChave: new Map<string, string>([['maria', dias(3)]]),
    ...extra,
  });

  it('cobra quem não respondeu há X dias', () => {
    expect(decidirCobranca(followup(), ctx())).toEqual({ pode: true });
  });

  it(`no máximo ${MAX_COBRANCAS} cobranças por contato: depois disso, resolvido`, () => {
    const f = followup({ cobrancas: [{ em: dias(6), texto: 'a' }, { em: dias(3), texto: 'b' }] });
    const d = decidirCobranca(f, ctx({ ultimoEnvioPorChave: new Map([['maria', dias(3)]]) }));
    expect(d).toMatchObject({ pode: false, destino: 'resolvido' });
    expect(decidirCobranca(followup({ cobrancas: [{ em: dias(3), texto: 'a' }] }), ctx())).toEqual({ pode: true });
  });

  it('opt-out: quem está em "Não enviar mais" nunca é cobrado', () => {
    expect(decidirCobranca(followup(), ctx({ naoEnviar: new Set(['maria']) }))).toMatchObject({ pode: false, destino: 'saiu' });
  });

  it('intervalo mínimo de X dias desde o último contato (de qualquer campanha)', () => {
    expect(decidirCobranca(followup(), ctx({ ultimoEnvioPorChave: new Map([['maria', dias(1)]]) }))).toMatchObject({ pode: false, destino: 'espera' });
    expect(decidirCobranca(followup(), ctx({ ultimoEnvioPorChave: new Map([['maria', dias(3)]]) }))).toEqual({ pode: true });
  });
});

describe('texto da cobrança', () => {
  it('paraModelo troca o primeiro nome pelo marcador, sem mexer em outras palavras', () => {
    expect(paraModelo('Oi, Ana! Passando para saber da banana.', 'Ana')).toBe('Oi, {primeiroNome}! Passando para saber da banana.');
    expect(paraModelo('Passando para saber se precisa de sal.', 'Ana')).toBe('Passando para saber se precisa de sal.'); // nome opcional: nada é injetado
    expect(paraModelo('Oi, Ana!', '')).toBe('Oi, Ana!');
    expect(paraModelo('Olá {link} Ana', 'Ana')).not.toMatch(/\{link\}/);
  });
});

describe('aplicarClassificacao: o que fazer com cada classe', () => {
  const ia = (classe: ClasseIa, extra: Partial<ClassificacaoIa> = {}): ClassificacaoIa => ({ ref: 'c1', classe, precisaAtencao: true, resumo: 'Resumo', sugestao: 'Oi Maria, qual a quantidade?', ...extra });

  it.each(['interessado', 'pediu_preco', 'tem_estoque', 'compra_depois', 'reclamacao', 'pergunta'] as const)('%s → "Precisa de você" com a sugestão (nada é enviado)', (classe) => {
    const e = aplicarClassificacao(followup(), ia(classe), AGORA);
    expect(e.followup).toMatchObject({ estado: 'precisa', classe, resumo: 'Resumo', sugestao: 'Oi Maria, qual a quantidade?' });
    expect(e.optOut).toBe(false);
    expect(e.followup.cobrancaModelo).toBeNull();
  });

  it('pediu_para_sair → opt-out automático, sem sugestão e fora de qualquer cobrança', () => {
    const e = aplicarClassificacao(followup(), ia('pediu_para_sair', { precisaAtencao: false }), AGORA);
    expect(e.optOut).toBe(true);
    expect(e.followup).toMatchObject({ estado: 'saiu', sugestao: '' });
  });

  it('compra_depois/tem_estoque com prazo criam lembrete às 9h de Fortaleza; as outras não', () => {
    const e = aplicarClassificacao(followup(), ia('compra_depois', { lembreteDias: 15 }), AGORA);
    expect(e.lembrete).toEqual({ venceEm: Date.UTC(2026, 11, 2, 12, 0), dias: 15, rascunho: '' }); // 02/12/2026 09:00 BRT
    expect(e.followup.lembreteDias).toBe(15);
    expect(aplicarClassificacao(followup(), ia('tem_estoque', { lembreteDias: 30 }), AGORA).lembrete).toBeDefined();
    expect(aplicarClassificacao(followup(), ia('pediu_preco', { lembreteDias: 15 }), AGORA).lembrete).toBeUndefined();
    expect(aplicarClassificacao(followup(), ia('compra_depois'), AGORA).lembrete).toBeUndefined();
    expect(aplicarClassificacao(followup(), ia('compra_depois', { lembreteDias: 0 }), AGORA).lembrete).toBeUndefined();
    expect(aplicarClassificacao(followup(), ia('compra_depois', { lembreteDias: 1000 }), AGORA).lembrete).toBeUndefined();
  });

  it('só emoji/ok (sem_relacao sem atenção) → Resolvido', () => {
    const e = aplicarClassificacao(followup(), ia('sem_relacao', { precisaAtencao: false, sugestao: '' }), AGORA);
    expect(e.followup.estado).toBe('resolvido');
    expect(e.optOut).toBe(false);
  });

  it('IA em dúvida (sem_relacao com atenção) e "sem_resposta" quando houve resposta → revisar, nunca cobrança', () => {
    expect(aplicarClassificacao(followup(), ia('sem_relacao', { resumo: 'Revisar: IA sem resposta válida' }), AGORA).followup.estado).toBe('revisar');
    expect(aplicarClassificacao(followup(), ia('sem_resposta', { precisaAtencao: false }), AGORA).followup.estado).toBe('revisar');
  });
});

describe('novosFollowups e resultado da campanha de cobrança', () => {
  const item = (chave: string, status: ItemCampanha['status'], extra: Partial<ItemCampanha> = {}): ItemCampanha => ({
    chave,
    nome: `Nome ${chave}`,
    primeiroNome: chave,
    modelo: 'Oi {primeiroNome}, tudo bem?',
    status,
    motivo: null,
    atualizadoEm: dias(2),
    ...extra,
  });
  const campanha = (id: string, itens: ItemCampanha[], tipo?: 'followup'): Campanha => ({
    id,
    ...(tipo ? { tipo } : {}),
    nome: id,
    criadaEm: dias(5),
    aprovadaEm: dias(5),
    termoBusca: 'x',
    filtros: FILTROS_PADRAO,
    modelos: [],
    status: 'concluida',
    motivoPausa: null,
    itens,
    problemasSeguidos: 0,
    ultimoEnvioEm: null,
    intervaloAtualSeg: null,
  });
  const envio = (campanhaId: string, chave: string, enviadoEm: string): Envio => ({ id: `${campanhaId}:${chave}`, campanhaId, chave, nome: chave, enviadoEm, textoConfere: true });

  it('cria acompanhamento só dos itens ENVIADOS de campanhas comuns, dentro da janela, uma vez', () => {
    const c = campanha('A', [item('ana', 'enviado'), item('bia', 'pendente'), item('cai', 'pulado'), item('dai', 'enviado')]);
    const seguimento = campanha('F', [item('ana', 'enviado')], 'followup');
    const novos = novosFollowups([c, seguimento], [envio('A', 'ana', dias(4))], [], AGORA);
    expect(novos.map((f) => f.id)).toEqual(['A:ana', 'A:dai']);
    expect(novos[0]).toMatchObject({ estado: 'monitorando', enviadoEm: dias(4), mensagemCampanha: 'Oi ana, tudo bem?', cobrancas: [] });
    expect(novos[1].enviadoEm).toBe(dias(2)); // sem registro de envio: usa a marca do item
    expect(novosFollowups([c], [], novos, AGORA)).toEqual([]);
  });

  it(`ignora disparos com mais de ${JANELA_DIAS} dias`, () => {
    const c = campanha('A', [item('ana', 'enviado')]);
    expect(novosFollowups([c], [envio('A', 'ana', dias(JANELA_DIAS + 1))], [], AGORA)).toEqual([]);
    expect(novosFollowups([c], [envio('A', 'ana', dias(JANELA_DIAS))], [], AGORA)).toHaveLength(1);
  });

  it('cobrança enviada: registra uma vez (idempotente), volta a monitorar e conta para o máximo de 2', () => {
    const f = followup({ estado: 'cobranca', cobrancaModelo: 'Oi {primeiroNome}, tudo bem?' });
    const c = campanha('F1', [item('maria', 'enviado', { primeiroNome: 'Maria' })], 'followup');
    const e = [envio('F1', 'maria', AGORA.toISOString())];
    const [um] = aplicarResultadoCampanha([f], c, e, AGORA);
    expect(um).toMatchObject({ estado: 'monitorando', cobrancaModelo: null });
    expect(um.cobrancas).toEqual([{ em: AGORA.toISOString(), texto: 'Oi Maria, tudo bem?' }]);
    const [dois] = aplicarResultadoCampanha([um], c, e, AGORA);
    expect(dois.cobrancas).toHaveLength(1); // aplicar de novo (o Executor publica várias vezes) não conta duas vezes
    // mesmo que o acompanhamento já tenha voltado a "monitorando", uma cobrança que saiu NUNCA deixa de ser contada
    const [tres] = aplicarResultadoCampanha([{ ...f, estado: 'monitorando' }], c, e, AGORA);
    expect(tres.cobrancas).toHaveLength(1);
  });

  it('não enviar / problema / pulado / revisar: nunca tenta de novo sozinho', () => {
    const f = followup({ estado: 'cobranca', cobrancaModelo: 'x' });
    const r = (status: ItemCampanha['status']) => aplicarResultadoCampanha([f], campanha('F', [item('maria', status, { motivo: 'm' })], 'followup'), [], AGORA)[0];
    expect(r('nao_enviar').estado).toBe('saiu');
    expect(r('nao_cliente').estado).toBe('saiu');
    for (const s of ['problema', 'pulado', 'revisar'] as const) expect(r(s).estado, s).toBe('revisar');
    expect(r('pendente').estado).toBe('cobranca'); // ainda não processado
  });
});

describe('separarListas', () => {
  it('agrupa por lista do painel; "revisar" aparece junto de "Precisa de você"', () => {
    const l = separarListas([
      followup({ id: '1', estado: 'cobranca' }),
      followup({ id: '2', estado: 'precisa' }),
      followup({ id: '3', estado: 'revisar' }),
      followup({ id: '4', estado: 'saiu' }),
      followup({ id: '5', estado: 'resolvido' }),
      followup({ id: '6', estado: 'monitorando' }),
    ]);
    expect(l.cobranca.map((f) => f.id)).toEqual(['1']);
    expect(l.precisa.map((f) => f.id).sort()).toEqual(['2', '3']);
    expect(l.saiu).toHaveLength(1);
    expect(l.resolvido).toHaveLength(1);
    expect(l.monitorando).toHaveLength(1);
  });
});
