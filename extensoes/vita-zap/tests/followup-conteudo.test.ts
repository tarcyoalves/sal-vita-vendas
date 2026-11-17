// @vitest-environment jsdom
//
// Follow-up, lado do WhatsApp Web: `lerConversa` (só leitura) contra o DOM sintético montado a partir do que foi
// coletado em campo (tests/ajuda/whatsapp-web-2026.ts). Não prova que o WhatsApp de amanhã continua igual.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { lerConversa } from '../src/content/execucao';
import { analisarLeitura } from '../src/shared/followup';
import { montarWhatsAppWeb2026, rodar, type ChatFalso, type WhatsAppWeb2026 } from './ajuda/whatsapp-web-2026';

const DISPARO = 'Oi Ana, tudo bem? Como estão de sal por aí?';

const CHATS: ChatFalso[] = [
  {
    nome: 'Ana Cliente',
    data: '15/11/2026',
    previa: 'quanto custa?',
    mensagens: [
      { id: '3EB0A1', texto: DISPARO, minha: true, hora: '10:00', data: '14/11/2026' },
      { id: '3EB0A2', texto: 'quanto custa o saco?', autor: 'Ana Cliente', hora: '11:05', data: '15/11/2026' },
    ],
  },
  {
    nome: 'Bia Cliente',
    data: '14/11/2026',
    icone: 'msg-dblcheck',
    previa: DISPARO,
    mensagens: [{ id: '3EB0B1', texto: DISPARO.replace('Ana', 'Bia'), minha: true, hora: '10:01', data: '14/11/2026' }],
  },
  {
    nome: 'Caio Cliente',
    data: '14/11/2026',
    previa: 'ok',
    mensagens: [
      { id: '3EB0C1', texto: DISPARO.replace('Ana', 'Caio'), minha: true, hora: '10:02', data: '14/11/2026' },
      { id: '3EB0C2', texto: '', autor: 'Caio Cliente', hora: '12:00', data: '14/11/2026' }, // áudio/figurinha: sem texto
    ],
  },
  { nome: 'Grupo Atacado', data: '14/11/2026', grupo: 'icone', previa: 'Pedro: tabela nova' },
  { nome: 'Dupla Cliente', data: '13/11/2026', previa: 'oi' },
  { nome: 'Dupla Cliente', data: '12/11/2026', previa: 'oi' },
];

let wa: WhatsAppWeb2026;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: new Date('2026-11-17T13:00:00Z') });
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
beforeEach(() => {
  wa = montarWhatsAppWeb2026(CHATS);
});

describe('lerConversa (só leitura)', () => {
  it('devolve as mensagens com quem falou, o texto e o carimbo (UTC-3), sem escrever nem clicar em nada', async () => {
    const r = await rodar(lerConversa('Ana Cliente'));
    expect(r).toEqual({
      ok: true,
      mensagens: [
        { de: 'eu', texto: DISPARO, quando: '2026-11-14T13:00:00.000Z' },
        { de: 'cliente', texto: 'quanto custa o saco?', quando: '2026-11-15T14:05:00.000Z' },
      ],
    });
    expect(wa.aberta()).toBe('Ana Cliente');
    expect(wa.textoDaCaixa()).toBe('');
    expect(wa.buscaTexto()).toBe(''); // a busca usada para achar a conversa foi limpa
    expect(wa.proibido).toEqual([]); // nada de teclado, nenhum recarregamento
  });

  it('a leitura alimenta a regra pura: respondeu / sem resposta / mídia do cliente conta como resposta', async () => {
    const ana = await rodar(lerConversa('Ana Cliente'));
    const bia = await rodar(lerConversa('Bia Cliente'));
    const caio = await rodar(lerConversa('Caio Cliente'));
    if (!ana.ok || !bia.ok || !caio.ok) throw new Error('esperava ok');
    const ref = '2026-11-14T13:00:00.000Z';
    expect(analisarLeitura(ana.mensagens ?? [], DISPARO, ref).tipo).toBe('respondeu');
    expect(analisarLeitura(bia.mensagens ?? [], DISPARO.replace('Ana', 'Bia'), ref).tipo).toBe('sem_resposta');
    // áudio/figurinha do cliente (sem texto): resposta → nunca cobra
    expect(analisarLeitura(caio.mensagens ?? [], DISPARO.replace('Ana', 'Caio'), ref).tipo).toBe('respondeu');
  });

  it('não cola nada na caixa mesmo se houver texto do atendente antes (só lê)', async () => {
    await rodar(lerConversa('Bia Cliente'));
    expect(wa.textoDaCaixa()).toBe('');
    expect(wa.proibido).toEqual([]);
  });

  it('FALHA FECHADA: grupo, nome repetido e contato inexistente não devolvem mensagens', async () => {
    expect(await rodar(lerConversa('Grupo Atacado'))).toMatchObject({ ok: false, codigo: 'grupo' });
    expect(await rodar(lerConversa('Dupla Cliente'))).toMatchObject({ ok: false, codigo: 'ambiguo' });
    expect(await rodar(lerConversa('Zé Inexistente'))).toMatchObject({ ok: false, codigo: 'nao_encontrado' });
    expect(wa.textoDaCaixa()).toBe('');
    expect(wa.proibido).toEqual([]);
  });

  it('identidade estrita: um nome PARECIDO não abre a conversa de outra pessoa', async () => {
    const r = await rodar(lerConversa('Ana Clien'));
    expect(r.ok).toBe(false);
    expect(wa.aberta()).not.toBe('Ana Cliente');
  });
});
