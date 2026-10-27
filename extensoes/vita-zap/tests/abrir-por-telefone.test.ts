// @vitest-environment jsdom
//
// Abrir a conversa pelo TELEFONE sem recarregar o WhatsApp Web (v0.7.21): regras puras, content script (WhatsApp
// falso com busca) e o caminho do painel/service worker (mensagem ao content script; endereço só como fallback).
// ⚠️ HTML sintético: a validação no WhatsApp real é manual (README, seção 6).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirConversaPorTelefoneSemRecarregar } from '../src/content/abrir-por-telefone';
import { esquecerTelefones, telefoneConhecido } from '../src/content/crm/telefone-conhecido';
import { TEMPOS_BUSCA } from '../src/content/lista';
import { AVISO_FALLBACK_ENDERECO, escolherResultado, formatosDeBusca } from '../src/shared/abrir-por-telefone';
import { abrirConversaPorTelefone, textoDaAbertura } from '../src/shared/crm-acoes';
import type { PedidoConteudo, RespostaConteudo } from '../src/shared/mensagens';
import { instalarChromeFalso, type ChromeFalso } from './ajuda/chrome-falso';
import { montarWhatsAppComBusca, type ContatoFalso } from './ajuda/whatsapp-busca-falso';

describe('formatos de busca do telefone', () => {
  it('celular com DDI: completo, nacional, sem o 9 extra, últimos 9 e últimos 8', () => {
    expect(formatosDeBusca('+55 (84) 99999-0000')).toEqual(['5584999990000', '84999990000', '8499990000', '999990000', '99990000']);
  });

  it('fixo/celular antigo sem o 9: tenta também com o 9 extra', () => {
    expect(formatosDeBusca('558499990000')).toEqual(['558499990000', '8499990000', '84999990000', '499990000', '99990000']);
  });

  it('sem DDI (11 dígitos) vira o mesmo conjunto; telefone inválido não gera formato', () => {
    expect(formatosDeBusca('84999990000')[0]).toBe('5584999990000');
    expect(formatosDeBusca('123')).toEqual([]);
    expect(formatosDeBusca('')).toEqual([]);
  });
});

describe('escolher o resultado da busca', () => {
  it('um contato só: abre', () => {
    expect(escolherResultado([{ nome: 'Ana' }])).toEqual({ tipo: 'um', indice: 0 });
  });
  it('a mesma pessoa em "Conversas" e em "Contatos" conta como uma', () => {
    expect(escolherResultado([{ nome: 'Ana Souza' }, { nome: 'ana souza' }])).toEqual({ tipo: 'um', indice: 0 });
  });
  it('nenhum resultado: nenhum', () => {
    expect(escolherResultado([])).toEqual({ tipo: 'nenhum' });
  });
  it('vários contatos sem dica: ambíguo', () => {
    expect(escolherResultado([{ nome: 'Ana' }, { nome: 'Bia' }])).toEqual({ tipo: 'ambiguo' });
  });
  it('vários contatos: abre o único cujo título bate com a dica (sem acento/caixa)', () => {
    expect(escolherResultado([{ nome: 'Ana' }, { nome: 'Padaria Zé Cliente' }], 'padaria ze')).toEqual({ tipo: 'um', indice: 1 });
  });
  it('vários contatos e a dica bate com mais de um: ambíguo', () => {
    expect(escolherResultado([{ nome: 'Padaria A Cliente' }, { nome: 'Padaria B Cliente' }], 'padaria')).toEqual({ tipo: 'ambiguo' });
  });
  it('formato curto exige o nome: um resultado que não bate com a dica NÃO abre', () => {
    expect(escolherResultado([{ nome: 'Outra Pessoa' }], 'Ana', true)).toEqual({ tipo: 'nenhum' });
    expect(escolherResultado([{ nome: 'Ana Souza' }], 'Ana', true)).toEqual({ tipo: 'um', indice: 0 });
    expect(escolherResultado([{ nome: 'Outra' }], undefined, true)).toEqual({ tipo: 'nenhum' });
  });
  it('com dica que não bate e um único resultado (formato completo): abre (o nome do lead pode ser outro)', () => {
    expect(escolherResultado([{ nome: 'Maria da Padaria' }], 'Lead 123')).toEqual({ tipo: 'um', indice: 0 });
  });
  it('dica de lead com cidade/CNPJ bate com contato contendo os termos principais (D ENERGY e GTEX)', () => {
    expect(
      escolherResultado(
        [{ nome: 'Outro Contato' }, { nome: 'Calixto D ENERGY Brasil Cliente Itaboraí' }],
        'D ENERGY - RIO DE JANEIRO - RJ'
      )
    ).toEqual({ tipo: 'um', indice: 1 });

    expect(
      escolherResultado(
        [{ nome: 'Outro Contato' }, { nome: 'Guilherme GTEX' }],
        'GTEX - GUILHERME / RAILA - ITUPEVA - SP'
      )
    ).toEqual({ tipo: 'um', indice: 1 });
  });
});

const ANA: ContatoFalso = { nome: 'Ana Souza Cliente', telefone: '5584999990000', conversa: true };
const BIA: ContatoFalso = { nome: 'Bia Cliente', telefone: '5584911112222', conversa: true };

beforeEach(() => {
  Object.assign(TEMPOS_BUSCA, { minimo: 5, passo: 5, estaveis: 2, limite: 400 });
  esquecerTelefones();
  instalarChromeFalso();
});

describe('content script: abrirConversaPorTelefoneSemRecarregar', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('abre a conversa pela busca, confere o cabeçalho, limpa a busca e não recarrega', async () => {
    const wa = montarWhatsAppComBusca([ANA, BIA]);
    const r = await abrirConversaPorTelefoneSemRecarregar('+55 84 99999-0000');
    expect(r).toEqual({ ok: true, nome: 'Ana Souza Cliente' });
    expect(wa.aberta()).toBe('Ana Souza Cliente');
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(wa.eventos).toEqual(['abriu:Ana Souza Cliente']);
  });

  it('contato salvo só na agenda (seção "Contatos", sem conversa) também abre', async () => {
    const wa = montarWhatsAppComBusca([{ ...ANA, conversa: false }, BIA]);
    const r = await abrirConversaPorTelefoneSemRecarregar('5584999990000');
    expect(r.ok).toBe(true);
    expect(wa.aberta()).toBe('Ana Souza Cliente');
  });

  it('achado dentro de mensagens e grupos não contam como contato', async () => {
    const wa = montarWhatsAppComBusca([{ nome: 'Grupo da Padaria', telefone: '5584999990000', conversa: true, grupo: true }]);
    const r = await abrirConversaPorTelefoneSemRecarregar('5584999990000');
    expect(r).toMatchObject({ ok: false, codigo: 'nao_encontrado' });
    expect(wa.aberta()).toBeNull();
  });

  it('número que não existe: não achou, nada é aberto e a busca é limpa', async () => {
    const wa = montarWhatsAppComBusca([ANA, BIA]);
    const r = await abrirConversaPorTelefoneSemRecarregar('5511988887777');
    expect(r).toMatchObject({ ok: false, codigo: 'nao_encontrado' });
    expect(wa.aberta()).toBeNull();
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('dois contatos para o mesmo número: ambíguo, não abre nenhum', async () => {
    const wa = montarWhatsAppComBusca([ANA, { nome: 'Ana (outro chip)', telefone: '5584999990000', conversa: true }]);
    const r = await abrirConversaPorTelefoneSemRecarregar('5584999990000');
    expect(r).toMatchObject({ ok: false, codigo: 'ambiguo' });
    expect(wa.aberta()).toBeNull();
  });

  it('dois contatos para o mesmo número: a dica de nome decide', async () => {
    const wa = montarWhatsAppComBusca([ANA, { nome: 'Ana (outro chip)', telefone: '5584999990000', conversa: true }]);
    const r = await abrirConversaPorTelefoneSemRecarregar('5584999990000', 'ana souza');
    expect(r).toEqual({ ok: true, nome: 'Ana Souza Cliente' });
    expect(wa.aberta()).toBe('Ana Souza Cliente');
  });

  it('formato curto (últimos dígitos) só abre se o nome bate: outro DDD com o mesmo final NÃO é aberto', async () => {
    // O contato salvo tem o DDD 11; o telefone pedido é do DDD 84 com o mesmo final. Os formatos completos não casam.
    const wa = montarWhatsAppComBusca([{ nome: 'Carlos Cliente', telefone: '5511999990000', conversa: true }]);
    const sem = await abrirConversaPorTelefoneSemRecarregar('5584999990000');
    expect(sem.ok).toBe(false);
    expect(wa.aberta()).toBeNull();
    const com = await abrirConversaPorTelefoneSemRecarregar('5584999990000', 'Carlos');
    expect(com).toEqual({ ok: true, nome: 'Carlos Cliente' });
  });

  it('memoriza o telefone da conversa aberta (o contato salvo só mostra o nome)', async () => {
    montarWhatsAppComBusca([ANA]);
    expect(telefoneConhecido('Ana Souza Cliente')).toBeNull();
    await abrirConversaPorTelefoneSemRecarregar('84 99999-0000');
    expect(telefoneConhecido('Ana Souza Cliente')).toBe('5584999990000');
  });

  it('sem caixa de busca: falha por seletor (o chamador cai no endereço)', async () => {
    montarWhatsAppComBusca([ANA]);
    document.querySelector('input')!.remove();
    await expect(abrirConversaPorTelefoneSemRecarregar('5584999990000')).rejects.toThrow(/caixa de busca/);
  });

  it('telefone inválido não mexe na página', async () => {
    const wa = montarWhatsAppComBusca([ANA]);
    expect(await abrirConversaPorTelefoneSemRecarregar('123')).toMatchObject({ ok: false });
    expect(wa.eventos).toEqual([]);
  });
});

describe('painel / service worker: mensagem ao content script; endereço só como fallback', () => {
  let c: ChromeFalso;
  let atualizacoes: Array<{ id: number; props: Record<string, unknown> }>;
  let enviados: PedidoConteudo[];
  const instalar = (resposta: () => Promise<RespostaConteudo | undefined>): void => {
    const tabs = (c.chrome as { tabs: Record<string, unknown> }).tabs;
    tabs.update = async (id: number, props: Record<string, unknown>) => {
      atualizacoes.push({ id, props });
    };
    tabs.sendMessage = async (_id: number, pedido: PedidoConteudo) => {
      enviados.push(pedido);
      return resposta();
    };
  };
  beforeEach(() => {
    c = instalarChromeFalso();
    atualizacoes = [];
    enviados = [];
    c.abas.push({ id: 7, windowId: 1, active: true, url: 'https://web.whatsapp.com/' });
  });
  afterEach(() => vi.useRealTimers());

  it('a busca achou: pede ao content script e NÃO troca a URL da aba (não recarrega)', async () => {
    instalar(async () => ({ ok: true, nome: 'Ana' }));
    const r = await abrirConversaPorTelefone('+55 84 99999-0000', 'Ana');
    expect(r).toEqual({ via: 'busca' });
    expect(enviados).toEqual([{ tipo: 'abrirPorTelefone', telefone: '+55 84 99999-0000', nomeDica: 'Ana' }]);
    expect(atualizacoes).toEqual([{ id: 7, props: { active: true } }]); // só traz a aba para a frente
    expect(atualizacoes.some((a) => 'url' in a.props)).toBe(false);
    expect(textoDaAbertura(r!, 'Ana')).toContain('sem recarregar');
  });

  it('a busca não achou: cai no endereço /send?phone= e avisa que recarrega', async () => {
    instalar(async () => ({ ok: false, codigo: 'nao_encontrado', erro: 'x' }));
    const r = await abrirConversaPorTelefone('5584999990000');
    expect(r).toEqual({ via: 'endereco', aviso: AVISO_FALLBACK_ENDERECO });
    expect(atualizacoes.at(-1)).toEqual({ id: 7, props: { url: 'https://web.whatsapp.com/send?phone=5584999990000', active: true } });
    expect(AVISO_FALLBACK_ENDERECO).toBe('Não achei pela busca; abrindo pelo endereço do WhatsApp (recarrega a página).');
    expect(textoDaAbertura(r!, 'Ana')).toBe(AVISO_FALLBACK_ENDERECO);
  });

  it('busca ambígua: também cai no endereço', async () => {
    instalar(async () => ({ ok: false, codigo: 'ambiguo', erro: 'x' }));
    expect((await abrirConversaPorTelefone('5584999990000'))?.via).toBe('endereco');
  });

  it('content script não responde (aba antiga): cai no endereço', async () => {
    instalar(async () => {
      throw new Error('Receiving end does not exist');
    });
    expect((await abrirConversaPorTelefone('5584999990000'))?.via).toBe('endereco');
    instalar(async () => undefined);
    expect((await abrirConversaPorTelefone('5584999990000'))?.via).toBe('endereco');
  });

  it('página ocupada com outra abertura: não recarrega nada', async () => {
    instalar(async () => ({ ok: false, codigo: 'ocupado', erro: 'x' }));
    const r = await abrirConversaPorTelefone('5584999990000');
    expect(r).toEqual({ via: 'ocupado' });
    expect(atualizacoes.some((a) => 'url' in a.props)).toBe(false);
  });

  it('sem aba do WhatsApp Web: abre uma nova já no endereço (não há página para recarregar)', async () => {
    c.abas.length = 0;
    instalar(async () => ({ ok: true }));
    expect(await abrirConversaPorTelefone('5584999990000')).toEqual({ via: 'nova-aba' });
    expect(c.abasCriadas).toEqual(['https://web.whatsapp.com/send?phone=5584999990000']);
    expect(enviados).toEqual([]);
  });

  it('telefone inválido: não faz nada', async () => {
    instalar(async () => ({ ok: true }));
    expect(await abrirConversaPorTelefone('123')).toBeNull();
    expect(enviados).toEqual([]);
    expect(atualizacoes).toEqual([]);
  });
});
