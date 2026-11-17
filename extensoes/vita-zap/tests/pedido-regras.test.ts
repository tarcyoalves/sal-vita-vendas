// Regras PURAS do "Pedir à IA" (0.7.57): plano, candidatas da lista, pré-filtro pela conversa lida, itens e pedidos salvos.

import { describe, expect, it } from 'vitest';
import type { ContatoVarrido } from '../src/shared/contatos';
import {
  MAX_LEITURAS_PEDIDO,
  MAX_PEDIDOS_SALVOS,
  VALIDADE_LEITURA_PEDIDO_MS,
  candidatosDoPedido,
  conferenciaDoServidor,
  descreverPlano,
  diasDeAgendamentoValidos,
  errosDoPlano,
  guardarPedido,
  leituraVelha,
  nasceMarcado,
  normalizarEstadoPedidos,
  normalizarPlano,
  normalizarTermos,
  planoDoServidor,
  podeReceberMensagem,
  recusaPeloPlano,
  removerPedido,
  type ItemPedido,
  type PlanoPedido,
} from '../src/shared/pedido-ia';
import { MAX_ORIENTACOES, normalizarOrientacoes, orientacoesParaEnvio } from '../src/shared/orientacoes';

const HOJE = '2026-11-17';
const plano = (p: Partial<PlanoPedido> = {}): PlanoPedido => ({ periodoDias: 30, quemFalouPorUltimo: 'eu', respondeu: false, assunto: 'perguntei sobre estoque', termosNomeContato: [], ...p });
const contato = (nome: string, extra: Partial<ContatoVarrido> = {}): ContatoVarrido => ({
  chave: nome.toLowerCase(), nome, rotuloData: '10/11/2026', ultimaConversa: '2026-11-10', revisarData: null, soNumero: false, pareceGrupo: false, temConversa: true, ultimaDeMim: true, duplicado: false, varridoEm: '2026-11-17T12:00:00.000Z', ...extra,
});
const ctx = (naoEnviar: string[] = []) => ({ hoje: HOJE, naoEnviar: new Set(naoEnviar) });

describe('normalizarPlano', () => {
  it('limita o período a 1-60 (padrão 30) e arredonda', () => {
    expect(normalizarPlano({ periodoDias: 400, assunto: 'x' }).periodoDias).toBe(60);
    expect(normalizarPlano({ periodoDias: 0, assunto: 'x' }).periodoDias).toBe(1);
    expect(normalizarPlano({ periodoDias: 12.6, assunto: 'x' }).periodoDias).toBe(13);
    expect(normalizarPlano({ assunto: 'x' }).periodoDias).toBe(30);
    expect(normalizarPlano({ periodoDias: Number.NaN, assunto: 'x' }).periodoDias).toBe(30);
    expect(normalizarPlano({ periodoDias: '20' as unknown as number, assunto: 'x' }).periodoDias).toBe(30);
  });
  it('"não respondeu" força "eu falei por último"; valores fora do contrato viram "tanto faz"/null', () => {
    expect(normalizarPlano({ respondeu: false, quemFalouPorUltimo: 'cliente' }).quemFalouPorUltimo).toBe('eu');
    expect(normalizarPlano({ quemFalouPorUltimo: 'ninguém', respondeu: 'sim' })).toMatchObject({ quemFalouPorUltimo: 'tanto_faz', respondeu: null });
  });
  it('termos do nome: únicos, 2 a 40 caracteres, no máximo 5; aceita lista ou texto com vírgulas', () => {
    expect(normalizarTermos('Padaria, padaria; a, Central')).toEqual(['Padaria', 'Central']);
    expect(normalizarTermos(['a', 'b', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh'])).toEqual(['cc', 'dd', 'ee', 'ff', 'gg']);
    expect(normalizarTermos(42)).toEqual([]);
  });
  it('assunto cortado em 200 caracteres e sem espaços repetidos', () => {
    expect(normalizarPlano({ assunto: `  a   b ${'x'.repeat(300)}` }).assunto).toHaveLength(200);
  });
});

describe('planoDoServidor / errosDoPlano / descreverPlano', () => {
  it('lê o contrato do servidor, com as perguntas; fora do contrato → null', () => {
    const r = planoDoServidor({ periodoDias: 20, quemFalouPorUltimo: 'eu', respondeu: false, assunto: 'estoque', termosNomeContato: ['padaria'], perguntas: ['Quanto tempo?', '', 7] });
    expect(r).toEqual({ plano: { periodoDias: 20, quemFalouPorUltimo: 'eu', respondeu: false, assunto: 'estoque', termosNomeContato: ['padaria'] }, perguntas: ['Quanto tempo?'] });
    expect(planoDoServidor(null)).toBeNull();
    expect(planoDoServidor('texto')).toBeNull();
    expect(planoDoServidor({})).toBeNull();
  });
  it('erros: assunto curto, período inválido, não respondeu sem "eu falei por último"', () => {
    expect(errosDoPlano(plano())).toEqual([]);
    expect(errosDoPlano(plano({ assunto: ' ' }))).toHaveLength(1);
    expect(errosDoPlano(plano({ periodoDias: 90 }))).toHaveLength(1);
    expect(errosDoPlano(plano({ periodoDias: 2.5 }))).toHaveLength(1);
    expect(errosDoPlano(plano({ respondeu: false, quemFalouPorUltimo: 'cliente' }))).toHaveLength(1);
  });
  it('descreve o plano em uma frase', () => {
    expect(descreverPlano(plano())).toBe('Conversas dos últimos 30 dia(s), em que eu falei por último e o cliente não respondeu, sobre: perguntei sobre estoque.');
    expect(descreverPlano(plano({ respondeu: true, quemFalouPorUltimo: 'cliente', termosNomeContato: ['padaria'] }))).toContain('com "padaria" no nome');
    expect(descreverPlano(plano({ assunto: '' }))).toContain('(assunto em branco)');
  });
});

describe('candidatosDoPedido (regras de público da política)', () => {
  it('nunca entram: Não enviar mais, só número, grupo, possível grupo, sem conversa, nome repetido, data incerta', () => {
    const r = candidatosDoPedido(
      [
        contato('Ana'), contato('Opt'), contato('+55 84 99999-0000', { soNumero: true }), contato('Grupo', { pareceGrupo: true }), contato('Fulano Grupo', { possivelGrupo: true }),
        contato('Agenda', { temConversa: false, ultimaConversa: null }), contato('Repetido', { duplicado: true }), contato('Incerta', { ultimaConversa: null }),
      ],
      plano(),
      ctx(['opt']),
    );
    expect(r.candidatos.map((c) => c.nome)).toEqual(['Ana']);
    expect(Object.fromEntries(r.fora)).toMatchObject({ 'marcado "Não enviar mais"': 1, 'só número (não salvo na agenda)': 1, 'grupo ou possível grupo': 2, 'sem conversa (só agenda)': 1, 'mais de uma conversa com este nome': 1 });
  });
  it('período: só conversas dentro dos últimos N dias (inclusive o primeiro dia)', () => {
    const r = candidatosDoPedido([contato('A', { ultimaConversa: '2026-10-18' }), contato('B', { ultimaConversa: '2026-10-17' }), contato('C', { ultimaConversa: '2026-11-17' })], plano({ periodoDias: 30 }), ctx());
    expect(r.candidatos.map((c) => c.nome)).toEqual(['C', 'A']);
    expect(r.fora[0][0]).toMatch(/fora dos últimos 30 dias/);
    expect(candidatosDoPedido([contato('B', { ultimaConversa: '2026-10-17' })], plano({ periodoDias: 31 }), ctx()).candidatos).toHaveLength(1);
  });
  it('termos do nome: TODOS precisam estar no nome (sem acento/maiúscula)', () => {
    const lista = [contato('Padaria Central'), contato('Padaria Sol'), contato('Mercado Central')];
    expect(candidatosDoPedido(lista, plano({ termosNomeContato: ['padaria', 'CENTRAL'] }), ctx()).candidatos.map((c) => c.nome)).toEqual(['Padaria Central']);
    expect(candidatosDoPedido([contato('Pão & Café')], plano({ termosNomeContato: ['pao'] }), ctx()).candidatos).toHaveLength(1);
  });
  it('pré-filtro barato por quem falou por último: só descarta quando a lista SABE', () => {
    const lista = [contato('Meu', { ultimaDeMim: true }), contato('Dele', { ultimaDeMim: false }), contato('Sei', { ultimaDeMim: null }), contato('Antigo', { ultimaDeMim: undefined })];
    expect(candidatosDoPedido(lista, plano({ quemFalouPorUltimo: 'eu' }), ctx()).candidatos.map((c) => c.nome).sort()).toEqual(['Antigo', 'Meu', 'Sei']);
    expect(candidatosDoPedido(lista, plano({ quemFalouPorUltimo: 'cliente', respondeu: null }), ctx()).candidatos.map((c) => c.nome).sort()).toEqual(['Antigo', 'Dele', 'Sei']);
    expect(candidatosDoPedido(lista, plano({ quemFalouPorUltimo: 'tanto_faz', respondeu: null }), ctx()).candidatos).toHaveLength(4);
    // não respondeu implica eu
    expect(candidatosDoPedido(lista, plano({ quemFalouPorUltimo: 'tanto_faz', respondeu: false }), ctx()).candidatos.map((c) => c.nome)).not.toContain('Dele');
  });
  it('mais recentes primeiro e no máximo MAX_LEITURAS_PEDIDO por rodada', () => {
    const muitos = Array.from({ length: MAX_LEITURAS_PEDIDO + 7 }, (_, i) => contato(`C${String(i).padStart(3, '0')}`, { ultimaConversa: i % 2 ? '2026-11-16' : '2026-11-01' }));
    const r = candidatosDoPedido(muitos, plano(), ctx());
    expect(r.candidatos).toHaveLength(MAX_LEITURAS_PEDIDO);
    expect(r.cortados).toBe(7);
    expect(r.candidatos[0].ultimaConversa).toBe('2026-11-16');
  });
});

describe('recusaPeloPlano (a conversa lida; espelho do servidor)', () => {
  const eu = { de: 'eu' as const };
  const cl = { de: 'cliente' as const };
  it.each([
    [[], { quemFalouPorUltimo: 'tanto_faz', respondeu: null }, /sem mensagens/],
    [[eu], { quemFalouPorUltimo: 'eu', respondeu: false }, null],
    [[eu, cl], { quemFalouPorUltimo: 'eu', respondeu: false }, /cliente falou por último/],
    [[cl], { quemFalouPorUltimo: 'tanto_faz', respondeu: false }, /cliente falou por último/],
    [[cl, eu], { quemFalouPorUltimo: 'cliente', respondeu: null }, /você falou por último/],
    [[eu, cl], { quemFalouPorUltimo: 'cliente', respondeu: true }, null],
    [[eu], { quemFalouPorUltimo: 'tanto_faz', respondeu: true }, /não respondeu/],
    [[cl], { quemFalouPorUltimo: 'tanto_faz', respondeu: false }, /falou por último/],
    [[eu, cl, eu], { quemFalouPorUltimo: 'tanto_faz', respondeu: true }, null],
    [[cl], { quemFalouPorUltimo: 'eu', respondeu: null }, /falou por último/],
  ] as const)('%j com %j', (msgs, p, esperado) => {
    const r = recusaPeloPlano([...msgs], p);
    if (esperado === null) expect(r).toBeNull();
    else expect(r).toMatch(esperado);
  });
});

describe('conferenciaDoServidor', () => {
  it('lê o contrato; confiança inválida vira baixa; sem ref ou sem boolean → null', () => {
    expect(conferenciaDoServidor({ ref: 'c1', corresponde: true, motivo: 'Perguntei em 02/11', confianca: 'alta' })).toEqual({ ref: 'c1', corresponde: true, motivo: 'Perguntei em 02/11', confianca: 'alta', pediuParaSair: false, revisar: false });
    expect(conferenciaDoServidor({ ref: 'c1', corresponde: false, confianca: 'certeza', pediuParaSair: true, revisar: true })).toMatchObject({ confianca: 'baixa', motivo: '', pediuParaSair: true, revisar: true });
    expect(conferenciaDoServidor({ ref: 'c1', corresponde: 'sim' })).toBeNull();
    expect(conferenciaDoServidor({ corresponde: true })).toBeNull();
    expect(conferenciaDoServidor(null)).toBeNull();
  });
});

describe('itens: pré-marcação e quem pode receber mensagem', () => {
  const agora = new Date('2026-11-17T13:00:00.000Z');
  const item = (e: Partial<ItemPedido> = {}): ItemPedido => ({ chave: 'ana', nome: 'Ana', primeiroNome: 'Ana', ultimaConversa: '2026-11-10', corresponde: true, revisar: false, motivo: 'm', confianca: 'alta', pediuParaSair: false, trava: { tipo: 'livre' }, marcado: true, estado: 'aberto', lidoEm: '2026-11-17T12:00:00.000Z', atualizadoEm: '2026-11-17T12:00:00.000Z', ...e });
  it('confiança baixa, revisar e pediu para sair nascem desmarcados', () => {
    expect(nasceMarcado('alta', false, false)).toBe(true);
    expect(nasceMarcado('media', false, false)).toBe(true);
    expect(nasceMarcado('baixa', false, false)).toBe(false);
    expect(nasceMarcado('alta', true, false)).toBe(false);
    expect(nasceMarcado('alta', false, true)).toBe(false);
  });
  it('livre e recente pode; cada barreira tem o seu motivo', () => {
    expect(podeReceberMensagem(item(), agora)).toEqual({ ok: true });
    expect(podeReceberMensagem(item({ estado: 'ignorado' }), agora)).toMatchObject({ ok: false });
    expect(podeReceberMensagem(item({ pediuParaSair: true }), agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/não receber mais/) });
    expect(podeReceberMensagem(item({ revisar: true, corresponde: false }), agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/leia a conversa/) });
    expect(podeReceberMensagem(item({ trava: { tipo: 'agendado', ate: '2026-12-01T12:00:00.000Z', motivo: 'agendado para 01/12 (o agendamento prevalece)' } }), agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/agendado para 01\/12/) });
    expect(podeReceberMensagem(item({ trava: { tipo: 'indisponivel', motivo: 'CRM fora' } }), agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/CRM fora/) });
    expect(podeReceberMensagem(item({ lidoEm: '2026-11-17T00:00:00.000Z' }), agora)).toMatchObject({ ok: false, motivo: expect.stringMatching(/12 horas/) });
  });
  it('a leitura vale 12 horas; data ilegível = velha', () => {
    expect(leituraVelha({ lidoEm: new Date(agora.getTime() - VALIDADE_LEITURA_PEDIDO_MS + 1000).toISOString() }, agora)).toBe(false);
    expect(leituraVelha({ lidoEm: new Date(agora.getTime() - VALIDADE_LEITURA_PEDIDO_MS - 1000).toISOString() }, agora)).toBe(true);
    expect(leituraVelha({ lidoEm: 'x' }, agora)).toBe(true);
  });
});

describe('pedidos salvos e estado gravado', () => {
  const t0 = new Date('2026-11-17T10:00:00.000Z');
  it('o mesmo pedido (sem acento/maiúscula/espaços) não duplica: sobe para o topo e conta as vezes', () => {
    let l = guardarPedido([], 'Quem perguntei sobre estoque', plano(), t0);
    l = guardarPedido(l, 'Outro pedido', null, t0);
    l = guardarPedido(l, '  quem  PERGUNTEI sobre estoque ', plano(), new Date(t0.getTime() + 1000));
    expect(l.map((p) => p.texto)).toEqual(['quem PERGUNTEI sobre estoque', 'Outro pedido']);
    expect(l[0].vezes).toBe(2);
  });
  it('guarda no máximo 20 e ignora texto vazio', () => {
    let l: ReturnType<typeof guardarPedido> = [];
    for (let i = 0; i < MAX_PEDIDOS_SALVOS + 5; i++) l = guardarPedido(l, `pedido ${i}`, null, new Date(t0.getTime() + i));
    expect(l).toHaveLength(MAX_PEDIDOS_SALVOS);
    expect(l[0].texto).toBe(`pedido ${MAX_PEDIDOS_SALVOS + 4}`);
    expect(guardarPedido(l, '   ', null, t0)).toHaveLength(MAX_PEDIDOS_SALVOS);
    expect(removerPedido(l, l[0].id)).toHaveLength(MAX_PEDIDOS_SALVOS - 1);
  });
  it('estado gravado lixo vira vazio; sem perder o que é válido', () => {
    expect(normalizarEstadoPedidos(undefined)).toEqual({ salvos: [], ultimo: null });
    expect(normalizarEstadoPedidos({ salvos: [{ id: 1 }, { id: 'a', texto: 'ok', plano: { periodoDias: 99, assunto: 'x' } }], ultimo: { id: 3 } })).toMatchObject({ salvos: [{ id: 'a', texto: 'ok', plano: { periodoDias: 60 } }], ultimo: null });
  });
  it('dias do agendamento: 1 a 120, padrão 7', () => {
    expect(diasDeAgendamentoValidos('15')).toBe(15);
    expect(diasDeAgendamentoValidos(0)).toBe(1);
    expect(diasDeAgendamentoValidos(500)).toBe(120);
    expect(diasDeAgendamentoValidos('abc')).toBe(7);
  });
});

describe('orientações do dono (texto)', () => {
  it('normaliza, corta em 1500 e remove controles; vazio não vai ao servidor', () => {
    expect(normalizarOrientacoes('  não cobrar quem comprou\r\n\r\n\r\n\r\nnunca falar de preço\u0007  ')).toBe('não cobrar quem comprou\n\nnunca falar de preço');
    expect(normalizarOrientacoes('x'.repeat(2000))).toHaveLength(MAX_ORIENTACOES);
    expect(normalizarOrientacoes(42)).toBe('');
    expect(orientacoesParaEnvio('   ')).toEqual({});
    expect(orientacoesParaEnvio('trate por você')).toEqual({ orientacoes: 'trate por você' });
  });
});
