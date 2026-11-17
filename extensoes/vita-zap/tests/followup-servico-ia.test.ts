// A ponte da IA do follow-up: ServicoCrm (service worker) → zapIa.* no CRM (tRPC), com o CRM falso.
// Contrato: tests/zap-ia.test.ts na raiz do repositório cobre o servidor; aqui, o lado da extensão.

import { beforeEach, describe, expect, it } from 'vitest';
import { itemDaIa } from '../src/shared/servico-ia';
import { ServicoCrm } from '../src/shared/servico-crm';
import { METODOS_LEADS } from '../src/shared/leads';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, type CrmFalso } from './ajuda/crm-falso';

let crm: CrmFalso;
let servico: ServicoCrm;

const conversa = (ref: string) => ({
  ref,
  primeiroNome: 'Maria',
  mensagemCampanha: 'Oi Maria, tudo bem?',
  mensagens: [
    { de: 'eu' as const, texto: 'Oi Maria, tudo bem?', quando: '2026-11-14T13:00:00.000Z' },
    { de: 'cliente' as const, texto: 'quanto custa?' },
  ],
});

beforeEach(async () => {
  crm = criarCrmFalso([]);
  servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte);
  await servico.definirUrl(BASE);
  await servico.entrar(EMAIL, SENHA);
});

describe('classificarRespostas', () => {
  it('é um método do contrato LeadsCRM (passa pelo service worker, nunca direto do painel)', () => {
    expect(METODOS_LEADS).toContain('classificarRespostas');
    expect(METODOS_LEADS).toContain('escreverCobranca');
  });

  it('manda só o que a IA precisa e lê a resposta; item fora do contrato é descartado', async () => {
    crm.zapIa = {
      classificar: () => ({
        ok: true,
        itens: [
          { ref: 'c1', classe: 'pediu_preco', precisaAtencao: true, resumo: 'Pediu preço', sugestao: 'Oi Maria', lembreteDias: null },
          { ref: 'c2', classe: 'classe-inventada', precisaAtencao: true },
          { classe: 'pergunta' },
        ],
        restantesHoje: 297,
      }),
      cobranca: () => ({ ok: false }),
    };
    const r = await servico.classificarRespostas([conversa('c1'), conversa('c2')]);
    expect(r).toEqual({ ok: true, valor: [{ ref: 'c1', classe: 'pediu_preco', precisaAtencao: true, resumo: 'Pediu preço', sugestao: 'Oi Maria' }] });
    const [req] = crm.chamadas('zapIa.classificarConversas');
    expect(req.metodo).toBe('POST'); // mutation: nada de texto de cliente na URL
    expect(req.url.search).toBe('');
    expect(req.credentials).toBe('include');
    const corpo = JSON.stringify(req.entrada);
    expect(corpo).toContain('c1');
    expect(corpo).not.toMatch(/telefone|phone|chave/i);
  });

  it('IA fora do ar / limite diário: erro amigável, sem lançar', async () => {
    crm.zapIa = { classificar: () => ({ ok: false, codigo: 'ia_indisponivel', mensagem: 'A IA está indisponível agora.' }), cobranca: () => ({}) };
    expect(await servico.classificarRespostas([conversa('c1')])).toMatchObject({ ok: false, erro: { mensagem: 'A IA está indisponível agora.' } });
  });

  it('servidor sem a procedure (versão anterior do CRM): erro claro, sem lançar', async () => {
    crm.zapIa = null;
    const r = await servico.classificarRespostas([conversa('c1')]);
    expect(r.ok).toBe(false);
  });

  it('sem login: erro de autenticação, nada é enviado', async () => {
    await servico.sair();
    const r = await servico.classificarRespostas([conversa('c1')]);
    expect(r.ok).toBe(false);
  });

  it('lote vazio não chama o CRM; lote grande demais é recusado antes de sair', async () => {
    crm.zapIa = { classificar: () => ({ ok: true, itens: [] }), cobranca: () => ({}) };
    expect(await servico.classificarRespostas([])).toEqual({ ok: true, valor: [] });
    expect(crm.chamadas('zapIa.classificarConversas')).toHaveLength(0);
    const r = await servico.classificarRespostas(Array.from({ length: 11 }, (_, i) => conversa(`c${i}`)));
    expect(r.ok).toBe(false);
    expect(crm.chamadas('zapIa.classificarConversas')).toHaveLength(0);
  });

  it('corta o texto e as mensagens antes de mandar', async () => {
    crm.zapIa = { classificar: () => ({ ok: true, itens: [] }), cobranca: () => ({}) };
    const longa = { ...conversa('c1'), mensagens: Array.from({ length: 30 }, () => ({ de: 'cliente' as const, texto: 'x'.repeat(5000) })) };
    await servico.classificarRespostas([longa]);
    const enviado = (crm.chamadas('zapIa.classificarConversas')[0].entrada as { conversas: Array<{ mensagens: Array<{ texto: string }> }> }).conversas[0];
    expect(enviado.mensagens).toHaveLength(12);
    expect(enviado.mensagens[0].texto.length).toBeLessThanOrEqual(1000);
  });
});

describe('escreverCobranca', () => {
  it('devolve o texto da IA', async () => {
    crm.zapIa = { classificar: () => ({}), cobranca: (e) => ({ ok: true, texto: `Oi, ${String(e.primeiroNome)}! Passando para saber de você.` }) };
    expect(await servico.escreverCobranca('Maria', 'Oi Maria', 2)).toEqual({ ok: true, valor: 'Oi, Maria! Passando para saber de você.' });
    expect((crm.chamadas('zapIa.gerarCobranca')[0].entrada as { tentativa: number }).tentativa).toBe(2);
  });

  it('texto inválido ou IA fora do ar: erro (a extensão usa o modelo local)', async () => {
    crm.zapIa = { classificar: () => ({}), cobranca: () => ({ ok: false, codigo: 'texto_invalido', mensagem: 'Use o modelo local.' }) };
    expect(await servico.escreverCobranca('Maria', 'x', 1)).toMatchObject({ ok: false });
    crm.zapIa = { classificar: () => ({}), cobranca: () => ({ ok: true, texto: '   ' }) };
    expect(await servico.escreverCobranca('Maria', 'x', 1)).toMatchObject({ ok: false });
  });
});

describe('itemDaIa', () => {
  it('só aceita classes conhecidas e normaliza os campos', () => {
    expect(itemDaIa({ ref: 'c1', classe: 'interessado', precisaAtencao: true, resumo: 'r', sugestao: 's', lembreteDias: 7 })).toEqual({ ref: 'c1', classe: 'interessado', precisaAtencao: true, resumo: 'r', sugestao: 's', lembreteDias: 7 });
    expect(itemDaIa({ ref: 'c1', classe: 'x' })).toBeNull();
    expect(itemDaIa(null)).toBeNull();
    expect(itemDaIa({ ref: 'c1', classe: 'pergunta' })).toEqual({ ref: 'c1', classe: 'pergunta', precisaAtencao: false, resumo: '', sugestao: '' });
  });
});
