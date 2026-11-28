// Decisões puras do ciclo, da fila do Hermes, da caixa de entrada e do relatório (Sales AI).
// Sem banco: cada regra que o código de banco aplica com UPDATE condicional é testada aqui.
// Inclui os cenários da V3.1 (seção 16): descadastro/resposta/compra/pausa entre reserva e despacho,
// autorizações concorrentes, conexão perdida depois do aceite, evento duplicado, evento fora de ordem
// e falha na consulta de supressão.
import { describe, expect, it } from 'vitest';
import { MODELO_EMAIL_RASCUNHO, SALES_SETTINGS_DEFAULTS, type SalesCanal, type SalesLimites, type SalesRemetente } from '../shared/sales';
import {
  agregarPorDimensao, aprovacaoHerdada, canalDoContato, centavosDeTexto, chaveHeartbeatAusente, codificarExcertoRadar,
  confiancaDaFonte, contarMotivos, decidirCadencia, estadoDaJornada, estadoNaPonte, executorAtrasado, filtrarReservaveis,
  fonteDoCanal, fonteEmailDoRadar, intervaloRelatorio, lerExcertoRadar, lerPayloadTarefa, marcadorSales,
  montarEntradaElegibilidade, montarRelatorio, montarTarefaCrm, motivoSemReserva, planejarConciliacao, planejarEvento,
  preRequisitoMensagem, proximaAcaoAposEnvio, qualifica, resultadoGravadoDe, selecionarLote, statusDaMensagem, tipoDeAtor,
  totalPassos, vagasDoLote, ESPERA_FINAL_DIAS, type AgregadosRelatorio, type CandidataReserva, type ContextoJornada,
} from '../server/lib/sales/operacoesPuro';
import { cabecalhosDescadastro, linkDescadastroNoCorpo, linkDescadastroProspeccao, MOTIVO_SEM_LINK_DESCADASTRO } from '../server/lib/sales/descadastro';
import { decidirAutorizacao, decidirConciliacao, decidirResultado, hashToken, novoToken, podeSerReservada, type EntradaAutorizacao } from '../server/lib/sales/despacho';
import { transicionar } from '../server/lib/sales/estados';
import { avaliarElegibilidade } from '../server/lib/sales/elegibilidade';

const limites: SalesLimites = SALES_SETTINGS_DEFAULTS.limites;
const AGORA = new Date('2026-11-28T15:00:00Z');
const remetente: SalesRemetente = { nome: 'Sal Vita', razaoSocial: 'Sal Vita Ltda', cnpj: '00.000.000/0001-00', endereco: 'Mossoró/RN', linkSite: 'https://www.premium.salvitarn.com.br/atacado', linkMercadoLivre: 'https://ml.example.com/x' };
const canal: SalesCanal = { ...SALES_SETTINGS_DEFAULTS.canal, ativo: true, politicaAprovada: true, dominio: 'salvitarn.com.br', remetenteEmail: 'vendas@salvitarn.com.br' };
const aprovado = { ...MODELO_EMAIL_RASCUNHO, status: 'aprovado' as const };

describe('ponte Radar → prospecção', () => {
  it('fonte do Radar → fonte da elegibilidade (busca vira "outra")', () => {
    expect(fonteEmailDoRadar('site')).toBe('site');
    expect(fonteEmailDoRadar('receita')).toBe('receita');
    expect(fonteEmailDoRadar('busca')).toBe('outra');
    expect(fonteEmailDoRadar('qualquer')).toBe('outra');
  });
  it('canal do contato guarda a fonte e volta igual', () => {
    expect(canalDoContato('maps')).toBe('email:maps');
    expect(fonteDoCanal('email:maps')).toBe('maps');
    expect(fonteDoCanal('whatsapp')).toBeNull();
    expect(fonteDoCanal(null)).toBeNull();
  });
  it('confiança por origem: Receita > site > maps > social > busca', () => {
    expect(confiancaDaFonte('receita')).toBeGreaterThan(confiancaDaFonte('site'));
    expect(confiancaDaFonte('site')).toBeGreaterThan(confiancaDaFonte('maps'));
    expect(confiancaDaFonte('maps')).toBeGreaterThan(confiancaDaFonte('social'));
    expect(confiancaDaFonte('social')).toBeGreaterThan(confiancaDaFonte('busca'));
  });
  it('evidências gravadas em public_sources voltam iguais; texto estranho = null', () => {
    const raw = codificarExcertoRadar(['loja_natural'], ['nome:emporio', 'maps_categoria:Loja']);
    expect(lerExcertoRadar(raw)).toEqual({ origem: 'radar_premium', segmentos: ['loja_natural'], sinais: ['nome:emporio', 'maps_categoria:Loja'] });
    expect(lerExcertoRadar('{"volumeInterest":"10"}')).toBeNull();
    expect(lerExcertoRadar('não é json')).toBeNull();
    expect(lerExcertoRadar(null)).toBeNull();
  });
  it('QUALIFICAR exige segmento E evidência', () => {
    expect(qualifica(['loja_natural'], ['nome:emporio'])).toBe(true);
    expect(qualifica(['loja_natural'], [])).toBe(false);
    expect(qualifica([], ['nome:emporio'])).toBe(false);
  });
  it('a ponte só move IDENTIFIED ↔ QUALIFIED; estado adiante nunca regride', () => {
    expect(estadoNaPonte('IDENTIFIED', true)).toBe('QUALIFIED');
    expect(estadoNaPonte('IDENTIFIED', false)).toBe('IDENTIFIED');
    expect(estadoNaPonte('QUALIFIED', false)).toBe('IDENTIFIED');
    expect(estadoNaPonte('QUALIFIED', true)).toBe('QUALIFIED');
    for (const e of ['CONTACT_REVIEW', 'CONTACTED', 'INTERESTED', 'CUSTOMER', 'CLOSED', 'SUPPRESSED'] as const) {
      expect(estadoNaPonte(e, false)).toBe(e);
      expect(estadoNaPonte(e, true)).toBe(e);
    }
  });
  it('contexto → entrada da elegibilidade: e-mail compartilhado e fonte Receita barram', () => {
    const ctx: ContextoJornada = {
      journeyId: 1, companyId: 2, contactId: 3, email: 'contato@emporio.com.br', fonte: 'site', urlFonte: 'https://emporio.com.br',
      uf: 'RN', cidade: 'Natal', empresa: 'Empório', empresaAtiva: true, segmentos: ['loja_natural'], evidencias: ['nome:emporio'], temSite: true,
    };
    const base = { compartilhadoPor: 1, supressao: { premium: false, crm: false }, passo: 0, jaProspectado: false, canal, ufsDaOnda: ['RN'] };
    expect(avaliarElegibilidade(montarEntradaElegibilidade(ctx, base)).ok).toBe(true);
    expect(avaliarElegibilidade(montarEntradaElegibilidade(ctx, { ...base, compartilhadoPor: 3 })).motivos).toContain('email_compartilhado');
    expect(avaliarElegibilidade(montarEntradaElegibilidade({ ...ctx, fonte: 'receita' }, base)).motivos).toContain('email_do_cadastro_cnpj');
    expect(avaliarElegibilidade(montarEntradaElegibilidade({ ...ctx, fonte: null }, base)).ok).toBe(true); // 'outra', domínio próprio
    expect(avaliarElegibilidade(montarEntradaElegibilidade(ctx, { ...base, compartilhadoPor: 0 })).ok).toBe(true); // nunca abaixo de 1
  });
});

describe('contagem e lote do dia', () => {
  it('cada motivo conta uma vez por contato', () => {
    expect(contarMotivos([['a', 'b', 'a'], ['a'], []])).toEqual({ a: 2, b: 1 });
  });
  it('vagas: cortadas também contam (o corte não é reposto)', () => {
    expect(vagasDoLote(20, 0)).toBe(20);
    expect(vagasDoLote(20, 18)).toBe(2);
    expect(vagasDoLote(20, 25)).toBe(0);
  });
  it('maior score primeiro, um contato por empresa, só elegíveis e empresas nunca prospectadas', () => {
    const c = [
      { journeyId: 1, companyId: 10, score: 50, elegivel: true, pausada: false },
      { journeyId: 2, companyId: 10, score: 90, elegivel: true, pausada: false },  // mesma empresa, score maior
      { journeyId: 3, companyId: 11, score: 95, elegivel: false, pausada: false }, // inelegível
      { journeyId: 4, companyId: 12, score: 80, elegivel: true, pausada: false },  // já prospectada
      { journeyId: 5, companyId: 13, score: 70, elegivel: true, pausada: true },   // pausada
      { journeyId: 6, companyId: 14, score: 70, elegivel: true, pausada: false },
      { journeyId: 7, companyId: 15, score: 70, elegivel: true, pausada: false },
      { journeyId: 8, companyId: 16, score: null, elegivel: true, pausada: false },
    ];
    const lote = selecionarLote(c, 10, new Set([12]));
    expect(lote.map((x) => x.journeyId)).toEqual([2, 6, 7, 8]); // empate de score: menor id primeiro; sem score por último
    expect(selecionarLote(c, 2, new Set([12])).map((x) => x.journeyId)).toEqual([2, 6]);
    expect(selecionarLote(c, 0, new Set())).toEqual([]);
  });
  it('mensagem só com modelo aprovado, remetente completo e domínio do canal', () => {
    expect(preRequisitoMensagem(MODELO_EMAIL_RASCUNHO, remetente, canal, 0)).toBe('modelo_rascunho');
    expect(preRequisitoMensagem(aprovado, { ...remetente, cnpj: '' }, canal, 0)).toBe('remetente_incompleto');
    expect(preRequisitoMensagem(aprovado, remetente, { ...canal, dominio: null }, 0)).toBe('dominio_do_canal_ausente');
    expect(preRequisitoMensagem(aprovado, remetente, canal, 9)).toBe('modelo_sem_passo');
    expect(preRequisitoMensagem(aprovado, remetente, canal, 0)).toBeNull();
  });
});

describe('descadastro', () => {
  it('sem token reconhecido por /api/unsubscribe: NÃO gera mensagem', () => {
    const r = linkDescadastroProspeccao({ token: null, baseUrl: 'https://www.premium.salvitarn.com.br' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe(MOTIVO_SEM_LINK_DESCADASTRO);
  });
  it('com token, só origem https', () => {
    const t = '00000000-0000-4000-8000-000000000000';
    expect(linkDescadastroProspeccao({ token: t, baseUrl: 'https://www.premium.salvitarn.com.br/' })).toEqual({ ok: true, url: `https://www.premium.salvitarn.com.br/api/unsubscribe?t=${t}` });
    expect(linkDescadastroProspeccao({ token: t, baseUrl: 'http://x.com' }).ok).toBe(false);
  });
  it('List-Unsubscribe: mailto + https, e one-click só com https; nada = null', () => {
    const link = 'https://www.premium.salvitarn.com.br/api/unsubscribe?t=00000000-0000-4000-8000-000000000000';
    expect(cabecalhosDescadastro(link, 'Vendas@SalVitaRN.com.br')).toEqual({
      'List-Unsubscribe': `<mailto:vendas@salvitarn.com.br?subject=sair>, <${link}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(cabecalhosDescadastro(null, 'vendas@salvitarn.com.br')).toEqual({ 'List-Unsubscribe': '<mailto:vendas@salvitarn.com.br?subject=sair>' });
    expect(cabecalhosDescadastro(null, null)).toBeNull();
    expect(linkDescadastroNoCorpo(`Sair: ${link}\nfim`)).toBe(link);
    expect(linkDescadastroNoCorpo('sem link')).toBeNull();
  });
});

describe('cadência', () => {
  it('total de passos = menor entre cadência, teto por empresa e modelo', () => {
    expect(totalPassos(limites, aprovado)).toBe(3);
    expect(totalPassos({ ...limites, maxMensagensPorEmpresa: 1 }, aprovado)).toBe(1);
    expect(totalPassos(limites, { ...aprovado, passos: aprovado.passos.slice(0, 2) })).toBe(2);
  });
  it('depois do aceite: próximo passo pela cadência; no último, encerra após a espera final', () => {
    const p0 = proximaAcaoAposEnvio(0, AGORA, limites, 3);
    expect(p0).toEqual({ tipo: 'passo', em: new Date(AGORA.getTime() + 4 * 86_400_000) });
    const p2 = proximaAcaoAposEnvio(2, AGORA, limites, 3);
    expect(p2).toEqual({ tipo: 'encerrar', em: new Date(AGORA.getTime() + ESPERA_FINAL_DIAS * 86_400_000) });
    expect(proximaAcaoAposEnvio(0, AGORA, limites, 1).tipo).toBe('encerrar');
  });
  it('decisão por jornada CONTACTED vencida', () => {
    const base = { estado: 'CONTACTED' as const, cadenceStep: 0, total: 3, pausada: false, nextActionAt: new Date(AGORA.getTime() - 1), agora: AGORA, statusDoProximo: null };
    expect(decidirCadencia(base)).toEqual({ tipo: 'gerar', passo: 1 });
    expect(decidirCadencia({ ...base, cadenceStep: 2 })).toEqual({ tipo: 'encerrar', motivo: 'fim_cadencia' });
    expect(decidirCadencia({ ...base, statusDoProximo: 'PENDING' })).toEqual({ tipo: 'nada' });
    expect(decidirCadencia({ ...base, statusDoProximo: 'UNKNOWN' })).toEqual({ tipo: 'nada' });
    expect(decidirCadencia({ ...base, statusDoProximo: 'CANCELLED' })).toEqual({ tipo: 'encerrar', motivo: 'cadencia_interrompida' });
    expect(decidirCadencia({ ...base, pausada: true })).toEqual({ tipo: 'nada' });
    expect(decidirCadencia({ ...base, nextActionAt: new Date(AGORA.getTime() + 1) })).toEqual({ tipo: 'nada' });
    expect(decidirCadencia({ ...base, estado: 'INTERESTED' })).toEqual({ tipo: 'nada' });
  });
  it('herança de aprovação explícita: só se o passo 0 foi aprovado', () => {
    expect(aprovacaoHerdada({ id: 5, approvedAt: AGORA, batchId: 9 }, AGORA)).toEqual({ approvedAt: AGORA, approvedBy: 'heranca:passo0:5:lote:9' });
    expect(aprovacaoHerdada({ id: 5, approvedAt: null, batchId: 9 }, AGORA)).toEqual({ approvedAt: null, approvedBy: null });
    expect(aprovacaoHerdada(null, AGORA)).toEqual({ approvedAt: null, approvedBy: null });
  });
});

describe('conciliação', () => {
  it('reserva vencida → liberar; despacho vencido → desconhecido; resto → nada', () => {
    const passou = new Date(AGORA.getTime() - 1000);
    const rows = [
      { id: 1, status: 'RESERVED' as const, fence: 2, reservedUntil: passou, dispatchExpiresAt: null },
      { id: 2, status: 'DISPATCHING' as const, fence: 3, reservedUntil: passou, dispatchExpiresAt: passou },
      { id: 3, status: 'RESERVED' as const, fence: 1, reservedUntil: new Date(AGORA.getTime() + 1000), dispatchExpiresAt: null },
      { id: 4, status: 'ACCEPTED' as const, fence: 1, reservedUntil: passou, dispatchExpiresAt: passou },
    ];
    const p = planejarConciliacao(rows, AGORA);
    expect(p.liberar.map((r) => r.id)).toEqual([1]);
    expect(p.desconhecer.map((r) => r.id)).toEqual([2]);
  });
  it('EXPIRED (conciliação) não é resultado gravado: o executor ainda pode informar', () => {
    expect(resultadoGravadoDe('EXPIRED')).toBeNull();
    expect(resultadoGravadoDe(null)).toBeNull();
    expect(resultadoGravadoDe('ACCEPTED')).toBe('ACCEPTED');
  });
  it('texto do banco → status/estado válidos', () => {
    expect(statusDaMensagem('RESERVED')).toBe('RESERVED');
    expect(statusDaMensagem('reserved')).toBeNull();
    expect(estadoDaJornada('CONTACTED')).toBe('CONTACTED');
    expect(estadoDaJornada('X')).toBeNull();
  });
});

describe('reserva', () => {
  const c = (x: Partial<CandidataReserva>): CandidataReserva => ({
    id: 1, status: 'PENDING', nextRetryAt: null, approvedAt: AGORA, step: 0, email: 'a@b.com', journeyState: 'CONTACT_REVIEW',
    journeyPausada: false, segmentos: ['loja_natural'], ...x,
  });
  const o = { modo: 'REVIEW' as const, segmentosValidados: [] as string[], agora: AGORA, suprimidos: new Set<string>() };
  it('modo e canal fecham a fila', () => {
    expect(motivoSemReserva('DRY_RUN', { ativo: true, politicaAprovada: true })).toMatch(/DRY_RUN/);
    expect(motivoSemReserva('PAUSED', { ativo: true, politicaAprovada: true })).toMatch(/PAUSED/);
    expect(motivoSemReserva('REVIEW', { ativo: false, politicaAprovada: true })).toMatch(/desligado/);
    expect(motivoSemReserva('REVIEW', { ativo: true, politicaAprovada: false })).toMatch(/política/);
    expect(motivoSemReserva('AUTONOMOUS', { ativo: true, politicaAprovada: true })).toBeNull();
  });
  it('REVIEW: só aprovada; jornada pausada ou fora do estado do passo fica de fora', () => {
    const r = filtrarReservaveis([
      c({ id: 1 }),
      c({ id: 2, approvedAt: null }),
      c({ id: 3, journeyPausada: true }),
      c({ id: 4, journeyState: 'INTERESTED' }),
      c({ id: 5, step: 1, journeyState: 'CONTACTED' }),
      c({ id: 6, step: 1, journeyState: 'CONTACT_REVIEW' }),
      c({ id: 7, journeyState: null }),
    ], o);
    expect(r.ids).toEqual([1, 5]);
  });
  it('SEMI_AUTONOMOUS: aprovada OU todos os segmentos validados', () => {
    const r = filtrarReservaveis([c({ id: 1, approvedAt: null, segmentos: ['loja_natural'] }), c({ id: 2, approvedAt: null, segmentos: ['loja_natural', 'conservas'] })],
      { ...o, modo: 'SEMI_AUTONOMOUS', segmentosValidados: ['loja_natural'] });
    expect(r.ids).toEqual([1]);
  });
  it('RETRYABLE só depois do backoff; UNKNOWN, DISPATCHING e ACCEPTED nunca', () => {
    const r = filtrarReservaveis([
      c({ id: 1, status: 'RETRYABLE_FAILURE', nextRetryAt: new Date(AGORA.getTime() - 1) }),
      c({ id: 2, status: 'RETRYABLE_FAILURE', nextRetryAt: new Date(AGORA.getTime() + 60_000) }),
      c({ id: 3, status: 'UNKNOWN' }),
      c({ id: 4, status: 'DISPATCHING' }),
      c({ id: 5, status: 'ACCEPTED' }),
    ], o);
    expect(r.ids).toEqual([1]);
  });
  it('suprimida no CRM sai da reserva (e é separada para cancelar)', () => {
    const r = filtrarReservaveis([c({ id: 1, email: 'X@B.com' }), c({ id: 2, email: 'y@b.com' })], { ...o, suprimidos: new Set(['x@b.com']) });
    expect(r).toEqual({ ids: [2], suprimidas: [1], motivo: null });
  });
});

// ── Cenários V3.1 ────────────────────────────────────────────────────────────────────────────

const token = novoToken();
const autorizacao = (x: Partial<EntradaAutorizacao> = {}): EntradaAutorizacao => ({
  agora: AGORA, modo: 'REVIEW', canal: { ativo: true, politicaAprovada: true },
  mensagem: { status: 'RESERVED', reservedBy: 'exec-1', reservedUntil: new Date(AGORA.getTime() + 60_000), reservationTokenHash: hashToken(token), fence: 4, approvedAt: AGORA, step: 0 },
  pedido: { executor: 'exec-1', reservaToken: token, fence: 4 },
  jornada: { state: 'CONTACT_REVIEW', pausedReason: null },
  segmentosEmpresa: ['loja_natural'], segmentosValidados: [],
  supressao: { premium: false, crm: false }, arbitro: { ok: true }, elegibilidade: { ok: true, motivos: [] },
  ...x,
});

describe('V3.1: algo muda entre a reserva e o despacho → negado', () => {
  it('base: tudo certo autoriza', () => {
    expect(decidirAutorizacao(autorizacao())).toEqual({ ok: true });
  });
  it('descadastro depois da reserva: 403 e cancela', () => {
    const d = decidirAutorizacao(autorizacao({ supressao: { premium: true, crm: false } }));
    expect(d).toMatchObject({ ok: false, http: 403, codigo: 'suprimido', cancelar: true });
  });
  it('resposta depois da reserva (INTERESTED/CLOSED): 409 e cancela', () => {
    expect(decidirAutorizacao(autorizacao({ jornada: { state: 'INTERESTED', pausedReason: null } }))).toMatchObject({ ok: false, codigo: 'estado_mudou', cancelar: true });
    expect(decidirAutorizacao(autorizacao({ jornada: { state: 'CLOSED', pausedReason: null } }))).toMatchObject({ ok: false, codigo: 'estado_mudou', cancelar: true });
  });
  it('compra depois da reserva (CUSTOMER): 409 e cancela', () => {
    expect(decidirAutorizacao(autorizacao({ jornada: { state: 'CUSTOMER', pausedReason: null } }))).toMatchObject({ ok: false, codigo: 'estado_mudou', cancelar: true });
  });
  it('pausa da jornada ou da operação depois da reserva: 423 e libera a reserva', () => {
    expect(decidirAutorizacao(autorizacao({ jornada: { state: 'CONTACT_REVIEW', pausedReason: 'auto_resposta' } }))).toMatchObject({ ok: false, http: 423, liberarReserva: true });
    expect(decidirAutorizacao(autorizacao({ modo: 'PAUSED' }))).toMatchObject({ ok: false, http: 423, codigo: 'pausado', liberarReserva: true });
  });
  it('a planificação da caixa de entrada faz exatamente isso: resposta cancela pendentes e muda o estado', () => {
    const p = planejarEvento({ tipo: 'RESPOSTA', classificacao: 'pediu_preco', temJornada: true, duplicado: false });
    expect(p.tipo).toBe('aplicar');
    if (p.tipo === 'aplicar') {
      expect(p.acoes.map((a) => a.tipo)).toEqual(['transicao', 'cancelar_pendentes', 'excecao']);
      expect(p.acoes[0]).toMatchObject({ evento: 'RESPOSTA_INTERESSE' });
      expect(p.acoes[2]).toMatchObject({ kind: 'resposta_humana', criarTarefaCrm: true, severity: 'alta' });
    }
  });
});

describe('V3.1: duas autorizações concorrentes → só o fence certo vence', () => {
  it('fence antigo perde; depois da 1ª autorização (DISPATCHING) a 2ª com o mesmo fence perde', () => {
    expect(decidirAutorizacao(autorizacao({ pedido: { executor: 'exec-1', reservaToken: token, fence: 3 } }))).toMatchObject({ ok: false, codigo: 'fence_antigo', cancelar: false, liberarReserva: false });
    const depois = autorizacao();
    depois.mensagem = { ...depois.mensagem, status: 'DISPATCHING', reservationTokenHash: null };
    expect(decidirAutorizacao(depois)).toMatchObject({ ok: false, http: 409, codigo: 'nao_reservada' });
  });
  it('outro executor ou outro token: 409 sem mexer na reserva alheia', () => {
    expect(decidirAutorizacao(autorizacao({ pedido: { executor: 'exec-2', reservaToken: token, fence: 4 } }))).toMatchObject({ ok: false, codigo: 'outro_executor', cancelar: false, liberarReserva: false });
    expect(decidirAutorizacao(autorizacao({ pedido: { executor: 'exec-1', reservaToken: novoToken(), fence: 4 } }))).toMatchObject({ ok: false, codigo: 'token_invalido', cancelar: false, liberarReserva: false });
  });
});

describe('V3.1: conexão perdida depois do aceite do SMTP → UNKNOWN, nunca reenviada', () => {
  it('despacho vencido vira desconhecido; UNKNOWN não é reservável; resultado tardio aplica uma vez', () => {
    const venceu = new Date(AGORA.getTime() - 1);
    expect(decidirConciliacao('DISPATCHING', null, venceu, AGORA)).toEqual({ tipo: 'marcar_desconhecido' });
    expect(podeSerReservada('UNKNOWN', null, AGORA)).toBe(false);
    const d = novoToken();
    const base = { status: 'UNKNOWN' as const, dispatchTokenHash: hashToken(d), dispatchExpiresAt: venceu, despachoToken: d, resultado: 'ACCEPTED' as const, attempts: 1, maxTentativas: 3, agora: AGORA };
    expect(decidirResultado({ ...base, resultadoGravado: resultadoGravadoDe('EXPIRED') })).toEqual({ tipo: 'aplicar', novoStatus: 'ACCEPTED', agendarRetentativaEmMs: null });
    expect(decidirResultado({ ...base, status: 'ACCEPTED', resultadoGravado: 'ACCEPTED' })).toEqual({ tipo: 'repeticao' });
    expect(decidirResultado({ ...base, status: 'ACCEPTED', resultadoGravado: 'ACCEPTED', resultado: 'PERMANENT_FAILURE' })).toMatchObject({ tipo: 'conflito', http: 409 });
  });
});

describe('V3.1: evento duplicado → sem efeito duplo', () => {
  it('a mesma chave de evento vira "duplicado" sem nenhuma ação', () => {
    expect(planejarEvento({ tipo: 'RECLAMACAO', classificacao: null, temJornada: true, duplicado: true })).toEqual({ tipo: 'duplicado' });
  });
  it('as chaves derivadas do evento são estáveis (exceção e tarefa não duplicam)', () => {
    expect(marcadorSales('tarefa:resposta_humana:<a@b>')).toBe('[sales:tarefa:resposta_humana:<a@b>]');
    expect(chaveHeartbeatAusente('exec-1', AGORA)).toBe(chaveHeartbeatAusente('exec-1', new Date(AGORA.getTime() + 30 * 60_000 - 1)));
  });
  it('e-mail sem jornada: guardado e ignorado', () => {
    expect(planejarEvento({ tipo: 'PEDIU_PARA_SAIR', classificacao: null, temJornada: false, duplicado: false })).toEqual({ tipo: 'ignorado', motivo: 'email_sem_jornada' });
  });
});

describe('V3.1: evento de estado fora de ordem → sem regressão', () => {
  it('aceite do passo 0 depois de a resposta chegar não volta a CONTACTED', () => {
    expect(transicionar('INTERESTED', 'PRIMEIRO_ENVIO').ok).toBe(false);
    expect(transicionar('CUSTOMER', 'PRIMEIRO_ENVIO').ok).toBe(false);
  });
  it('resposta negativa depois da compra não fecha o cliente; nada tira de SUPPRESSED', () => {
    expect(transicionar('CUSTOMER', 'RESPOSTA_NEGATIVA').ok).toBe(false);
    expect(transicionar('SUPPRESSED', 'RESPOSTA_INTERESSE').ok).toBe(false);
  });
  it('resposta recusada pela máquina (ex.: já INTERESTED) cai em pausa, não em estado novo', () => {
    const p = planejarEvento({ tipo: 'RESPOSTA', classificacao: 'sem_interesse', temJornada: true, duplicado: false });
    if (p.tipo !== 'aplicar') throw new Error('esperava aplicar');
    expect(p.acoes[0]).toEqual({ tipo: 'transicao', evento: 'RESPOSTA_NEGATIVA', aoRecusar: 'pausar' });
  });
});

describe('V3.1: falha na consulta de supressão → nada reservado, nada autorizado', () => {
  it('reserva: consulta do CRM falhou = lista vazia com motivo', () => {
    const r = filtrarReservaveis([{ id: 1, status: 'PENDING', nextRetryAt: null, approvedAt: AGORA, step: 0, email: 'a@b.com', journeyState: 'CONTACT_REVIEW', journeyPausada: false, segmentos: [] }],
      { modo: 'AUTONOMOUS', segmentosValidados: [], agora: AGORA, suprimidos: null });
    expect(r).toEqual({ ids: [], suprimidas: [], motivo: 'supressao_indisponivel' });
  });
  it('autorização: qualquer banco sem resposta = 503 e a reserva é liberada', () => {
    expect(decidirAutorizacao(autorizacao({ supressao: { premium: null, crm: false } }))).toMatchObject({ ok: false, http: 503, codigo: 'supressao_indisponivel', liberarReserva: true });
    expect(decidirAutorizacao(autorizacao({ supressao: { premium: false, crm: null } }))).toMatchObject({ ok: false, http: 503, liberarReserva: true });
  });
});

describe('caixa de entrada: demais eventos', () => {
  it('resposta sem classe pausa (um humano decide)', () => {
    const p = planejarEvento({ tipo: 'RESPOSTA', classificacao: null, temJornada: true, duplicado: false });
    if (p.tipo !== 'aplicar') throw new Error('esperava aplicar');
    expect(p.acoes[0]).toEqual({ tipo: 'pausar', motivo: 'resposta_humana' });
    expect(p.acoes.some((a) => a.tipo === 'transicao')).toBe(false);
  });
  it('auto-resposta: pausa, exceção baixa, sem tarefa e sem mudar estado', () => {
    const p = planejarEvento({ tipo: 'AUTO_RESPOSTA', classificacao: null, temJornada: true, duplicado: false });
    expect(p).toEqual({ tipo: 'aplicar', acoes: [{ tipo: 'pausar', motivo: 'auto_resposta' }, { tipo: 'excecao', kind: 'outro', severity: 'baixa', criarTarefaCrm: false }] });
  });
  it('reclamação: suprime, pausa a operação inteira e abre exceção crítica', () => {
    const p = planejarEvento({ tipo: 'RECLAMACAO', classificacao: null, temJornada: true, duplicado: false });
    if (p.tipo !== 'aplicar') throw new Error('esperava aplicar');
    expect(p.acoes).toEqual([
      { tipo: 'suprimir', reason: 'complaint' },
      { tipo: 'pausar_operacao', motivo: 'reclamacao' },
      { tipo: 'excecao', kind: 'reclamacao', severity: 'critica', criarTarefaCrm: true },
    ]);
  });
  it('pedido de saída e devolução suprimem', () => {
    expect(planejarEvento({ tipo: 'PEDIU_PARA_SAIR', classificacao: null, temJornada: true, duplicado: false })).toEqual({ tipo: 'aplicar', acoes: [{ tipo: 'suprimir', reason: 'unsubscribe' }] });
    expect(planejarEvento({ tipo: 'DEVOLVIDO', classificacao: null, temJornada: true, duplicado: false })).toEqual({ tipo: 'aplicar', acoes: [{ tipo: 'suprimir', reason: 'bounce' }] });
  });
});

describe('executores, tarefa do CRM e auditoria', () => {
  it('executor atrasado: mais de 10 minutos sem sinal', () => {
    expect(executorAtrasado(new Date(AGORA.getTime() - 10 * 60_000), AGORA)).toBe(false);
    expect(executorAtrasado(new Date(AGORA.getTime() - 10 * 60_000 - 1), AGORA)).toBe(true);
    expect(chaveHeartbeatAusente('exec-1', AGORA)).not.toBe(chaveHeartbeatAusente('exec-1', new Date(AGORA.getTime() + 3_600_000)));
  });
  it('tarefa do CRM: marcador nas notas, sem e-mail na coluna (não entra em disparo do CRM)', () => {
    const p = lerPayloadTarefa({ titulo: 'Resposta de x', descricao: 'E-mail: a@b.com', prioridade: 'high', excecaoId: 3 });
    expect(p).toEqual({ titulo: 'Resposta de x', descricao: 'E-mail: a@b.com', prioridade: 'high' });
    const t = montarTarefaCrm(p!, { crmUserId: 7, nomeAtendente: 'Ana', idempotencyKey: 'tarefa:k', agora: AGORA });
    expect(t).toMatchObject({ userId: 7, assignedTo: 'Ana', status: 'pending', priority: 'high', reminderDate: AGORA, clientId: 0 });
    expect(t.notes).toContain('[sales:tarefa:k]');
    expect('email' in t).toBe(false);
    expect(lerPayloadTarefa({ descricao: 'sem título' })).toBeNull();
    expect(lerPayloadTarefa({ titulo: 'x', prioridade: 'urgente' })?.prioridade).toBe('medium');
  });
  it('tipo de ator da auditoria', () => {
    expect(tipoDeAtor('hermes:caixa')).toBe('ai_agent');
    expect(tipoDeAtor('sistema')).toBe('system');
    expect(tipoDeAtor('premium-admin')).toBe('human');
  });
});

describe('relatório', () => {
  const ag: AgregadosRelatorio = {
    de: '2026-11-01', ate: '2026-11-28',
    empresas: { pesquisadas: 100, elegiveis: 30, contatadas: 20 },
    mensagens: { tentadas: 25, aceitas: 22, devolvidas: 1, desconhecidas: 1, falhas: 2 },
    respostas: { humanas: 5, positivas: 2, pedidosDeSaida: 1, reclamacoes: 0 },
    agente: { conversas: 3, linksDePedido: 1, encaminhadas: 1, respostasBarradas: 0 },
    confirmadas: { pedidos: 1, caixas: 2, receitaCentavos: 39_800 },
    pedidosComCupomCampanha: null,
    jornadasClientes: 1,
    porSegmento: [], porUf: [],
  };
  it('confirmado, cupom de campanha e indício ficam separados; rentabilidade nunca é calculada', () => {
    const r = montarRelatorio(ag);
    expect(r.rentabilidade).toBe('nao_calculavel');
    expect(r.vendas).toEqual({ pedidosSiteComCupomCampanha: 0, caixasSite: 2, receitaSiteCentavos: 39_800 });
    expect(r.indicios.some((i) => /Mercado Livre/.test(i))).toBe(true);
    expect(r.indicios.some((i) => /cupom de campanha/.test(i))).toBe(true);
    expect(r.indicios.some((i) => /interesse não é venda/.test(i))).toBe(true);
    expect(montarRelatorio({ ...ag, pedidosComCupomCampanha: 4 }).vendas.pedidosSiteComCupomCampanha).toBe(4);
  });
  it('por dimensão: conta jornadas contatadas e se responderam', () => {
    const l = agregarPorDimensao(
      [{ email: 'a@x.com', chaves: ['loja_natural', 'granel_cerealista'] }, { email: 'b@x.com', chaves: ['loja_natural'] }, { email: 'c@x.com', chaves: [] }],
      [{ email: 'A@x.com', positiva: true }, { email: 'a@x.com', positiva: false }, { email: 'z@x.com', positiva: true }],
    );
    expect(l).toEqual([
      { chave: 'loja_natural', contatadas: 2, respostas: 1, positivas: 1 },
      { chave: 'granel_cerealista', contatadas: 1, respostas: 1, positivas: 1 },
      { chave: 'nao_informado', contatadas: 1, respostas: 0, positivas: 0 },
    ]);
  });
  it('período em dias de São Paulo, validado', () => {
    const i = intervaloRelatorio('2026-11-01', '2026-11-28');
    expect(i).toEqual({ ok: true, inicio: new Date('2026-11-01T03:00:00.000Z'), fim: new Date('2026-11-29T02:59:59.999Z') });
    expect(intervaloRelatorio('2026-11-28', '2026-11-01').ok).toBe(false);
    expect(intervaloRelatorio('01/11/2026', '2026-11-28').ok).toBe(false);
    expect(intervaloRelatorio('2020-01-01', '2026-11-28').ok).toBe(false);
  });
  it('valor do pedido em centavos, sem inventar', () => {
    expect(centavosDeTexto('199.00')).toBe(19_900);
    expect(centavosDeTexto('199,90')).toBe(19_990);
    expect(centavosDeTexto('R$ 1.234,56')).toBe(123_456);
    expect(centavosDeTexto('abc')).toBe(0);
    expect(centavosDeTexto(null)).toBe(0);
  });
});
