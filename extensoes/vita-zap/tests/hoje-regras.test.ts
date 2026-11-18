// Tela "Hoje" (0.7.60), regras puras: cartões (sai hoje, precisa de você, a IA agendou, para julgar, histórico sumindo) e alertas
// (CRM/IA indisponível, freio, pausas). Só leitura: nada é enviado, lido do WhatsApp ou gravado.

import { describe, expect, it } from 'vitest';
import { avaliarLiberacao, novaAcao, novaDecisao } from '../src/shared/automaticos';
import type { Campanha } from '../src/shared/campanha';
import type { ContatoVarrido } from '../src/shared/contatos';
import { preverFila } from '../src/shared/fila';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import type { Followup } from '../src/shared/followup';
import { resumirHoje, type EntradaHoje } from '../src/shared/hoje';
import { CONFIG_REATIVACAO_PADRAO, novoRegistro, type Reativacao } from '../src/shared/reativacao';
import { ABAS, LINHAS_DE_ABAS } from '../src/sidepanel/abas';

const AGORA = new Date('2026-11-18T15:00:00Z');
const f = (chave: string, estado: Followup['estado'], extra: Partial<Followup> = {}): Followup => ({ id: `o:${chave}`, campanhaId: 'o', chave, nome: chave, primeiroNome: chave, mensagemCampanha: 'x', enviadoEm: AGORA.toISOString(), estado, motivo: null, verificadoEm: null, cobrancas: [], cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: AGORA.toISOString(), ...extra });
const r = (chave: string, estado: Reativacao['estado'], extra: Partial<Reativacao> = {}): Reativacao => ({ ...novoRegistro({ chave, nome: chave, primeiroNome: chave }, '2026-10-20', AGORA), estado, ...extra });
const camp = (id: string, extra: Partial<Campanha> = {}): Campanha => ({ id, nome: id, criadaEm: AGORA.toISOString(), aprovadaEm: AGORA.toISOString(), termoBusca: '', filtros: FILTROS_PADRAO, modelos: [], status: 'concluida', motivoPausa: null, itens: [], problemasSeguidos: 0, ultimoEnvioEm: null, intervaloAtualSeg: null, ...extra });

function entrada(extra: Partial<EntradaHoje> = {}): EntradaHoje {
  return {
    agora: AGORA,
    modo: 'observacao',
    previsao: preverFila({ cobranca: 0, reativacao_2_3: 0, reativacao_1: 0 }, 30, 0),
    followups: [],
    reativacoes: [],
    campanhas: [],
    acoes: [],
    pendentes: [],
    liberacao: avaliarLiberacao([]),
    contatos: [],
    naoEnviar: [],
    envios: [],
    configReativacao: CONFIG_REATIVACAO_PADRAO,
    followupPausado: false,
    reativacaoPausada: false,
    logadoNoCrm: true,
    crmIndisponivel: null,
    falhaDaIa: null,
    ...extra,
  };
}
const cartao = (e: Partial<EntradaHoje>, id: string) => resumirHoje(entrada(e)).cartoes.find((c) => c.id === id)!;

describe('cartões', () => {
  it('são cinco, na ordem pedida, cada um leva a uma aba', () => {
    const { cartoes } = resumirHoje(entrada());
    expect(cartoes.map((c) => c.id)).toEqual(['sai', 'precisa', 'agendou', 'julgar', 'sumindo']);
    expect(cartoes.map((c) => c.destino)).toEqual(['automaticos', 'followup', 'reativacao', 'automaticos', 'reativacao']);
  });

  it('"Sai hoje sozinho": a previsão da fila (teto, quem já saiu) e o modo', () => {
    const previsao = preverFila({ cobranca: 5, reativacao_2_3: 3, reativacao_1: 40 }, 30, 10);
    const c = cartao({ previsao, modo: 'ligado' }, 'sai');
    expect(c.numero).toBe(20);
    expect(c.detalhe).toContain('Hoje saem até 20 (teto 30, já saíram 10); ficam 28 na fila para os próximos dias.');
    expect(c.detalhe).toContain('Modo: Ligado.');
    expect(cartao({ previsao, modo: 'observacao' }, 'sai').detalhe).toContain('Modo: Observação (nada sai sozinho)');
    expect(cartao({ previsao, modo: 'desligado' }, 'sai').detalhe).toContain('Modo: Desligado (nada sai sozinho)');
  });

  it('"Precisa de você" soma follow-up, reativação e revisar SEM contar o mesmo contato duas vezes', () => {
    const followups = [f('ana', 'precisa'), f('bia', 'revisar'), f('caio', 'precisa', { origem: 'reativacao' }), f('dani', 'revisar', { origem: 'reativacao' }), f('edu', 'resolvido')];
    const reativacoes = [r('caio', 'precisa'), r('dani', 'precisa'), r('fabi', 'precisa'), r('gabi', 'pronto')];
    const res = resumirHoje(entrada({ followups, reativacoes }));
    // ana: follow-up; bia: revisar; caio: reativação (aparece nos dois); dani: revisar (aparece nos dois); fabi: reativação.
    expect(res.precisa).toEqual({ total: 5, followup: 1, reativacao: 2, revisar: 2 });
    const c = res.cartoes.find((x) => x.id === 'precisa')!;
    expect(c.numero).toBe(5);
    expect(c.detalhe).toBe('Follow-up 1 · Reativação 2 · Revisar 2');
    expect(c.extras?.map((x) => x.destino)).toEqual(['followup', 'reativacao']);
  });

  it('"A IA agendou": só os próximos (não desfeitos, no futuro), sem repetir contato', () => {
    const futuro = AGORA.getTime() + 20 * 86_400_000;
    const acoes = [
      novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'ana', nome: 'Ana', resumo: 'x', desfazer: { tipo: 'agendamento', taskId: 1, agendadoEm: futuro } }, AGORA),
      { ...novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'bia', nome: 'Bia', resumo: 'x', desfazer: { tipo: 'agendamento', taskId: 2, agendadoEm: futuro } }, AGORA), desfeitaEm: AGORA.toISOString() },
      novaAcao({ tipo: 'agendou', origem: 'reativacao', chave: 'caio', nome: 'Caio', resumo: 'x', desfazer: { tipo: 'agendamento', taskId: 3, agendadoEm: AGORA.getTime() - 1000 } }, AGORA),
      novaAcao({ tipo: 'enviou', origem: 'followup', chave: 'dani', nome: 'Dani', resumo: 'x' }, AGORA),
    ];
    const reativacoes = [r('ana', 'agendado', { agendadoPara: new Date(futuro).toISOString() }), r('edu', 'agendado', { agendadoPara: new Date(AGORA.getTime() + 5 * 86_400_000).toISOString() })];
    const c = cartao({ acoes, reativacoes }, 'agendou');
    expect(c.numero).toBe(2); // ana (uma vez só) e edu
    expect(c.detalhe).toContain('Próximo: 23/11');
    expect(cartao({}, 'agendou').numero).toBe(0);
  });

  it('"Para julgar": decisões em observação sem julgamento, com o placar', () => {
    const d = (i: number) => novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: `c${i}`, nome: `C${i}`, contexto: `x${i}`, resumo: 'Cobraria', texto: 'Oi' }, AGORA);
    const c = cartao({ pendentes: [d(1), d(2), d(3)] }, 'julgar');
    expect(c.numero).toBe(3);
    expect(c.detalhe).toContain('Placar: sem julgamentos.');
    const lib = { ...avaliarLiberacao([]), julgados: 10, acertos: 9, percentual: 90 };
    expect(cartao({ liberacao: lib }, 'julgar').detalhe).toContain('Placar: 9 de 10 (90%).');
  });

  it('"Histórico sumindo": conversas entre a etapa 1 e 5 dias depois, ainda não lidas pela reativação', () => {
    const ct = (nome: string, ultima: string): ContatoVarrido => ({ chave: nome.toLowerCase(), nome, rotuloData: null, ultimaConversa: ultima, revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, duplicado: false, varridoEm: AGORA.toISOString(), ultimaDeMim: true });
    // etapa 1 = 25 dias: 24/10 tem 25 dias em 18/11 (em risco); 20/10 tem 29 (em risco); 01/11 tem 17 (cedo demais); 10/10 tem 39 (já passou)
    const contatos = [ct('CLIENTE Ana', '2026-10-24'), ct('CLIENTE Bia', '2026-10-20'), ct('CLIENTE Caio', '2026-11-01'), ct('CLIENTE Dani', '2026-10-10')];
    const c = cartao({ contatos }, 'sumindo');
    expect(c.numero).toBe(2);
    expect(c.detalhe).toMatch(/2 conversas precisam ser lidas até \d\d\/\d\d/);
    expect(cartao({}, 'sumindo').detalhe).toBe('Nenhuma conversa em risco de sumir do WhatsApp Web.');
  });
});

describe('erros e pausas', () => {
  it('tudo certo: nenhum alerta', () => {
    expect(resumirHoje(entrada()).alertas).toEqual([]);
  });
  it('CRM indisponível e sem login levam à aba Dados', () => {
    const a = resumirHoje(entrada({ crmIndisponivel: 'sem rede' })).alertas;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ tipo: 'crm', destino: 'dados' });
    expect(a[0].texto).toContain('o envio automático pausa');
    expect(resumirHoje(entrada({ logadoNoCrm: false })).alertas[0]).toMatchObject({ tipo: 'crm', destino: 'dados' });
  });
  it('IA indisponível: mostra o motivo e a hora', () => {
    const a = resumirHoje(entrada({ falhaDaIa: { motivo: 'limite diário', em: AGORA.getTime() } })).alertas;
    expect(a[0]).toMatchObject({ tipo: 'ia', destino: 'automaticos' });
    expect(a[0].texto).toMatch(/IA indisponível desde \d\d:\d\d \(limite diário\)/);
  });
  it('freio acionado e campanha parada por erro aparecem; pausas esperadas (horário, teto, modo, "por você") não', () => {
    const campanhas = [
      camp('a', { tipo: 'followup', status: 'pausada', motivoPausa: '3 problemas seguidos — confira o WhatsApp antes de continuar' }),
      camp('b', { status: 'pausada', motivoPausa: 'teto diário atingido (30/30) — continue amanhã' }),
      camp('c', { tipo: 'reativacao', status: 'pausada', motivoPausa: 'fora do horário (segunda a sexta: 8h às 18h, horário de Fortaleza)' }),
      camp('d', { status: 'pausada', motivoPausa: 'pausada por você' }),
      camp('e', { tipo: 'reativacao', status: 'pausada', motivoPausa: 'automático em Observação: o envio automático só acontece no modo Ligado' }),
      camp('f', { tipo: 'followup', status: 'pausada', motivoPausa: 'CRM indisponível: não envio sem conferir (sem rede)' }),
      camp('g', { status: 'pausada', motivoPausa: 'envio_nao_confirmado: não vi sair' }),
      camp('h', { status: 'em_execucao' }),
    ];
    const a = resumirHoje(entrada({ campanhas })).alertas;
    expect(a.map((x) => x.id)).toEqual(['campanha:a', 'campanha:f', 'campanha:g']);
    expect(a.map((x) => x.tipo)).toEqual(['freio', 'crm', 'pausa']);
    expect(a.map((x) => x.destino)).toEqual(['followup', 'followup', 'execucao']);
    expect(a[0].texto).toMatch(/^Freio acionado/);
  });
  it('follow-up e reativação pausados por você', () => {
    const a = resumirHoje(entrada({ followupPausado: true, reativacaoPausada: true })).alertas;
    expect(a.map((x) => x.destino)).toEqual(['followup', 'reativacao']);
  });
});

describe('barra de abas (a 400 px sem cortar e sem remover função)', () => {
  it('toda aba aparece em exatamente uma linha; a Hoje é a primeira das campanhas', () => {
    const ids = LINHAS_DE_ABAS.flatMap((l) => l.ids);
    expect([...ids].sort()).toEqual(ABAS.map((a) => a.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
    expect(LINHAS_DE_ABAS[1].ids[0]).toBe('hoje');
  });
  it('nenhuma linha passa de 5 abas (cabe em 400 px com o texto inteiro)', () => {
    for (const l of LINHAS_DE_ABAS) expect(l.ids.length).toBeLessThanOrEqual(5);
    expect(LINHAS_DE_ABAS).toHaveLength(3);
  });
  it('as abas que já existiam continuam todas lá', () => {
    for (const id of ['lembretes', 'acompanhar', 'clientes', 'varredura', 'previa', 'execucao', 'followup', 'reativacao', 'automaticos', 'pedir', 'dados']) expect(ABAS.map((a) => a.id)).toContain(id);
  });
});
