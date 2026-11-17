// A ponte da IA do "Pedir à IA" e das orientações do dono: ServicoCrm (service worker) → zapIa.* no CRM falso.
// Garante que as orientações são repassadas em TODAS as chamadas de IA e que só o necessário sai da extensão.

import { beforeEach, describe, expect, it } from 'vitest';
import { METODOS_LEADS } from '../src/shared/leads';
import { MAX_ORIENTACOES } from '../src/shared/orientacoes';
import { ServicoCrm } from '../src/shared/servico-crm';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, type CrmFalso } from './ajuda/crm-falso';

let crm: CrmFalso;
let servico: ServicoCrm;

const ORIENT = 'Não cobrar quem comprou nos últimos 15 dias. Nunca falar de preço. Trate por você.';
const plano = { periodoDias: 30, quemFalouPorUltimo: 'eu' as const, respondeu: false, assunto: 'perguntei sobre estoque', termosNomeContato: [] };
const conversa = { ref: 'c1', primeiroNome: 'Maria', mensagens: [{ de: 'eu' as const, texto: 'Tem estoque?', quando: '2026-11-02T13:00:00.000Z' }] };

beforeEach(async () => {
  crm = criarCrmFalso([]);
  servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte);
  await servico.definirUrl(BASE);
  await servico.entrar(EMAIL, SENHA);
  crm.zapIa = {
    classificar: () => ({ ok: true, itens: [{ ref: 'c1', classe: 'pediu_preco', precisaAtencao: true, resumo: 'r', sugestao: 's' }] }),
    cobranca: () => ({ ok: true, texto: 'Oi, Maria! Conseguiu ver?' }),
    reativacao: () => ({ ok: true, itens: [{ ref: 'c1', decisao: 'precisa_agora', resumo: 'r' }] }),
    interpretar: () => ({ ok: true, plano: { ...plano, perguntas: [] } }),
    conferir: () => ({ ok: true, itens: [{ ref: 'c1', corresponde: true, motivo: 'Perguntei sobre estoque em 02/11; sem resposta', confianca: 'alta' }] }),
  };
});

const reat = [{ ref: 'c1', primeiroNome: 'Maria', diasSemConversa: 30, mensagens: [{ de: 'eu' as const, texto: 'Oi' }] }];
const classif = [{ ref: 'c1', primeiroNome: 'Maria', mensagemCampanha: 'Oi', mensagens: [{ de: 'cliente' as const, texto: 'quanto?' }] }];

const chamarTodas = async () => {
  await servico.classificarRespostas(classif);
  await servico.escreverCobranca('Maria', 'Oi', 1);
  await servico.escreverCobranca('Maria', '', 1, undefined, 'reativacao');
  await servico.avaliarReativacao(reat);
  await servico.interpretarPedido('quem perguntei sobre estoque e não respondeu');
  await servico.conferirPedido(plano, [conversa]);
};
const CAMINHOS = ['zapIa.classificarConversas', 'zapIa.gerarCobranca', 'zapIa.avaliarReativacao', 'zapIa.interpretarPedido', 'zapIa.conferirPedido'];

describe('contrato LeadsCRM', () => {
  it('os 4 métodos novos passam pelo service worker', () => {
    for (const m of ['interpretarPedido', 'conferirPedido', 'orientacoesIa', 'salvarOrientacoesIa']) expect(METODOS_LEADS).toContain(m);
  });
});

describe('orientações do dono', () => {
  it('salvar e ler: normaliza e corta em 1500; começa vazio', async () => {
    expect(await servico.orientacoesIa()).toBe('');
    expect(await servico.salvarOrientacoesIa(`  ${ORIENT}  `)).toBe(ORIENT);
    expect(await servico.orientacoesIa()).toBe(ORIENT);
    expect((await servico.salvarOrientacoesIa('x'.repeat(5000))).length).toBe(MAX_ORIENTACOES);
    expect(await servico.salvarOrientacoesIa('   ')).toBe('');
  });

  it('são repassadas em TODAS as chamadas de IA (parâmetro opcional `orientacoes`)', async () => {
    await servico.salvarOrientacoesIa(ORIENT);
    await chamarTodas();
    for (const c of CAMINHOS) {
      const chamadas = crm.chamadas(c);
      expect(chamadas.length, c).toBeGreaterThan(0);
      for (const req of chamadas) expect((req.entrada as Record<string, unknown>).orientacoes, c).toBe(ORIENT);
    }
    expect(crm.chamadas('zapIa.gerarCobranca')).toHaveLength(2); // cobrança e reativação
  });

  it('sem orientações o campo nem é enviado (o servidor mantém o prompt de antes)', async () => {
    await chamarTodas();
    for (const c of CAMINHOS) for (const req of crm.chamadas(c)) expect(Object.keys(req.entrada as object)).not.toContain('orientacoes');
  });

  it('apagar vale na próxima chamada (o serviço lê a cada chamada, não guarda cópia)', async () => {
    await servico.salvarOrientacoesIa(ORIENT);
    await servico.escreverCobranca('Maria', 'Oi', 1);
    await servico.salvarOrientacoesIa('');
    await servico.escreverCobranca('Maria', 'Oi', 1);
    const [a, b] = crm.chamadas('zapIa.gerarCobranca');
    expect((a.entrada as Record<string, unknown>).orientacoes).toBe(ORIENT);
    expect(Object.keys(b.entrada as object)).not.toContain('orientacoes');
  });
});

describe('interpretarPedido', () => {
  it('manda só o texto do pedido (mutation, nada na URL) e lê o plano com as perguntas', async () => {
    crm.zapIa!.interpretar = () => ({ ok: true, plano: { periodoDias: 90, quemFalouPorUltimo: 'cliente', respondeu: false, assunto: ' perguntei  sobre estoque ', termosNomeContato: ['padaria'], perguntas: ['De quando?'] } });
    const r = await servico.interpretarPedido('  quem   perguntei sobre estoque  ');
    expect(r).toEqual({ ok: true, valor: { plano: { periodoDias: 60, quemFalouPorUltimo: 'eu', respondeu: false, assunto: 'perguntei sobre estoque', termosNomeContato: ['padaria'] }, perguntas: ['De quando?'] } });
    const [req] = crm.chamadas('zapIa.interpretarPedido');
    expect(req.metodo).toBe('POST');
    expect(req.url.search).toBe('');
    expect(req.entrada).toEqual({ texto: 'quem perguntei sobre estoque' });
  });
  it('pedido curto demais não chama o CRM; resposta fora do formato e erro do servidor viram erro amigável', async () => {
    expect(await servico.interpretarPedido(' ab ')).toMatchObject({ ok: false });
    expect(crm.chamadas('zapIa.interpretarPedido')).toHaveLength(0);
    crm.zapIa!.interpretar = () => ({ ok: true, plano: 'texto solto' });
    expect(await servico.interpretarPedido('quem perguntei sobre estoque')).toMatchObject({ ok: false });
    crm.zapIa!.interpretar = () => ({ ok: false, codigo: 'texto_invalido', mensagem: 'A IA não conseguiu entender o pedido.' });
    expect(await servico.interpretarPedido('quem perguntei sobre estoque')).toMatchObject({ ok: false, erro: { tipo: 'validacao', mensagem: 'A IA não conseguiu entender o pedido.' } });
    crm.zapIa!.interpretar = () => ({ ok: false, codigo: 'limite_diario', mensagem: 'Limite diário' });
    expect(await servico.interpretarPedido('quem perguntei sobre estoque')).toMatchObject({ ok: false, erro: { tipo: 'servidor' } });
  });
  it('servidor sem a procedure (versão anterior do CRM) e sem login: erro sem lançar', async () => {
    crm.zapIa = null;
    expect((await servico.interpretarPedido('quem perguntei sobre estoque')).ok).toBe(false);
    await servico.sair();
    expect((await servico.conferirPedido(plano, [conversa])).ok).toBe(false);
  });
});

describe('conferirPedido', () => {
  it('manda o plano e só primeiro nome + mensagens (nada de telefone, chave ou nome completo) e lê os itens', async () => {
    const r = await servico.conferirPedido(plano, [{ ...conversa, primeiroNome: 'Maria'.padEnd(80, 'a') }]);
    expect(r).toEqual({ ok: true, valor: [{ ref: 'c1', corresponde: true, motivo: 'Perguntei sobre estoque em 02/11; sem resposta', confianca: 'alta', pediuParaSair: false, revisar: false }] });
    const [req] = crm.chamadas('zapIa.conferirPedido');
    const e = req.entrada as { assunto: string; quemFalouPorUltimo: string; respondeu: boolean; conversas: Array<{ primeiroNome: string }> };
    expect(e).toMatchObject({ assunto: 'perguntei sobre estoque', quemFalouPorUltimo: 'eu', respondeu: false });
    expect(e.conversas[0].primeiroNome).toHaveLength(60);
    expect(JSON.stringify(req.entrada)).not.toMatch(/telefone|phone|chave|termosNomeContato/i);
  });
  it('item fora do contrato é descartado (quem chama trata a falta como "revisar"); lote vazio não chama; lote grande é recusado', async () => {
    crm.zapIa!.conferir = () => ({ ok: true, itens: [{ ref: 'c1', corresponde: 'sim' }, { corresponde: true }, { ref: 'c2', corresponde: false, motivo: 'não', confianca: 'media' }] });
    const r = await servico.conferirPedido(plano, [conversa]);
    expect(r).toEqual({ ok: true, valor: [{ ref: 'c2', corresponde: false, motivo: 'não', confianca: 'media', pediuParaSair: false, revisar: false }] });
    expect(await servico.conferirPedido(plano, [])).toEqual({ ok: true, valor: [] });
    expect(await servico.conferirPedido(plano, Array.from({ length: 11 }, (_, i) => ({ ...conversa, ref: `c${i}` })))).toMatchObject({ ok: false, erro: { tipo: 'validacao' } });
  });
  it('IA fora do ar / limite diário: erro amigável', async () => {
    crm.zapIa!.conferir = () => ({ ok: false, codigo: 'ia_indisponivel', mensagem: 'A IA está indisponível agora.' });
    expect(await servico.conferirPedido(plano, [conversa])).toMatchObject({ ok: false, erro: { mensagem: 'A IA está indisponível agora.' } });
  });
});
