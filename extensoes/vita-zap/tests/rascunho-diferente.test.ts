// @vitest-environment jsdom
//
// Rascunho na caixa (achado 02): caixa vazia → cola; EXATAMENTE o texto da campanha → pronto; qualquer outra coisa
// (prefixo, complemento, texto diferente) → não mexe e devolve 'rascunho_diferente'. Só o clique explícito "Substituir"
// (envio manual) troca o texto, e só escreve na caixa. Ao pausar só se limpa o que a PRÓPRIA extensão inseriu e continua intacto.
// O WhatsApp é o sintético de tests/ajuda/whatsapp-web-2026.ts.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirEColar, abrirEPrepararRascunho, lerConversa, limparCaixa, pararObservacao } from '../src/content/execucao';
import { montarWhatsAppWeb2026, rodar, type ChatFalso, type WhatsAppWeb2026 } from './ajuda/whatsapp-web-2026';

const TEXTO = 'Boa tarde, Ana, tudo bem? Como estão de sal por aí?';

const CHATS: ChatFalso[] = [
  { nome: 'Ana Cliente', data: '15/11/2026', icone: 'msg-dblcheck', previa: 'Segue a tabela' },
  { nome: 'Bia Cliente', data: '14/11/2026', icone: 'msg-dblcheck', previa: 'Segue a tabela' },
];

let wa: WhatsAppWeb2026;
let execCalls: string[];

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: new Date('2026-11-17T13:00:00Z') });
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
beforeEach(() => {
  pararObservacao();
  wa = montarWhatsAppWeb2026(CHATS);
  execCalls = [];
  const original = (document as unknown as { execCommand: (c: string, u: boolean, v?: string) => boolean }).execCommand;
  (document as unknown as { execCommand: unknown }).execCommand = (c: string, u: boolean, v?: string) => {
    execCalls.push(`${c}:${v ?? ''}`);
    return original(c, u, v);
  };
});

const caixa = (): HTMLElement => document.querySelector<HTMLElement>('#main footer div[contenteditable="true"]')!;

/** O atendente digita/cola na caixa (o WhatsApp renderiza um <p>). */
function atendenteDigita(texto: string): void {
  const el = caixa();
  el.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = texto;
  el.append(p);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Abre a conversa (só leitura) e deixa o atendente com `rascunho` na caixa. */
async function abrirComRascunho(nome: string, rascunho: string): Promise<void> {
  await rodar(lerConversa(nome));
  atendenteDigita(rascunho);
}

const colar = (nome = 'Ana Cliente', texto = TEXTO, auto = false, substituir = false) =>
  rodar(abrirEColar(nome, texto, () => undefined, auto, () => undefined, substituir));

describe('abrirEColar: o que fazer com o que já está na caixa', () => {
  it('caixa vazia: cola', async () => {
    const r = await colar();
    expect(r.ok).toBe(true);
    expect(wa.textoDaCaixa()).toBe(TEXTO);
    expect(execCalls.some((c) => c.startsWith('insertText:'))).toBe(true);
  });

  it('texto EXATAMENTE igual: deixa como está (pronto), sem reescrever, e não é "nosso" (pausar não apaga)', async () => {
    await abrirComRascunho('Ana Cliente', TEXTO);
    execCalls = [];
    const r = await colar();
    expect(r.ok).toBe(true);
    expect(wa.textoDaCaixa()).toBe(TEXTO);
    expect(execCalls).toEqual([]); // nada foi escrito nem apagado
    const p = limparCaixa(TEXTO);
    expect(p).toMatchObject({ ok: true, limpou: false });
    expect(wa.textoDaCaixa()).toBe(TEXTO);
  });

  it('prefixo do texto (rascunho a meio): NÃO mexe e devolve rascunho_diferente', async () => {
    await abrirComRascunho('Ana Cliente', 'Boa tarde, Ana, tudo bem?');
    execCalls = [];
    const r = await colar();
    expect(r).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
    expect(wa.textoDaCaixa()).toBe('Boa tarde, Ana, tudo bem?');
    expect(execCalls).toEqual([]);
  });

  it('complemento (o rascunho tem o texto da campanha E mais alguma coisa): NÃO mexe', async () => {
    const rascunho = `${TEXTO} Abraço do Pedro`;
    await abrirComRascunho('Ana Cliente', rascunho);
    execCalls = [];
    const r = await colar();
    expect(r).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
    expect(wa.textoDaCaixa()).toBe(rascunho);
    expect(execCalls).toEqual([]);
  });

  it('texto totalmente diferente: NÃO mexe', async () => {
    await abrirComRascunho('Ana Cliente', 'preciso falar sobre o frete');
    const r = await colar();
    expect(r).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
    expect(wa.textoDaCaixa()).toBe('preciso falar sobre o frete');
  });

  it('quebra de linha: só espaço em branco diferente é o MESMO texto (normalização de sempre); palavra a mais na outra linha é diferente', async () => {
    await abrirComRascunho('Ana Cliente', 'Boa tarde, Ana, tudo bem?\nComo estão de sal por aí?');
    execCalls = [];
    expect((await colar()).ok).toBe(true);
    expect(execCalls).toEqual([]);

    await abrirComRascunho('Ana Cliente', 'Boa tarde, Ana, tudo bem?\n\nComo estão de sal por aí?\nPedro');
    const r = await colar();
    expect(r).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
  });

  it('emoji: o mesmo emoji é igual; outro emoji é diferente', async () => {
    const com = 'Oi, Ana! 😀 Tudo bem?';
    await abrirComRascunho('Ana Cliente', com);
    execCalls = [];
    expect((await colar('Ana Cliente', com)).ok).toBe(true);
    expect(execCalls).toEqual([]);
    const r = await colar('Ana Cliente', 'Oi, Ana! 🙂 Tudo bem?');
    expect(r).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
    expect(wa.textoDaCaixa()).toBe(com);
  });

  it('Substituir (clique explícito, manual): troca o rascunho pelo texto da campanha, sem teclado nem clique', async () => {
    await abrirComRascunho('Ana Cliente', 'rascunho do atendente');
    const r = await colar('Ana Cliente', TEXTO, false, true);
    expect(r.ok).toBe(true);
    expect(wa.textoDaCaixa()).toBe(TEXTO);
    expect(wa.proibido).toEqual([]); // nenhum teclado, nenhum clique no rodapé
    pararObservacao();
  });

  it('envio AUTOMÁTICO com rascunho diferente: não clica, não substitui (nem se pedirem substituir)', async () => {
    await abrirComRascunho('Ana Cliente', 'rascunho do atendente');
    execCalls = [];
    const r1 = await colar('Ana Cliente', TEXTO, true, false);
    const r2 = await colar('Ana Cliente', TEXTO, true, true);
    expect(r1).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
    expect(r2).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
    expect(wa.textoDaCaixa()).toBe('rascunho do atendente');
    expect(execCalls).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000); // se houvesse envio agendado, já teria disparado
    expect(wa.proibido).toEqual([]);
    expect(wa.textosNoChat().some((t) => t.includes('rascunho do atendente'))).toBe(false);
  });

  it('o atendente digita DURANTE a espera de 0,8 s: a extensão percebe e não sobrescreve', async () => {
    await rodar(lerConversa('Ana Cliente'));
    const p = abrirEColar('Ana Cliente', TEXTO, () => undefined, false, () => undefined, false);
    let pronto = false;
    void p.then(() => (pronto = true));
    for (let i = 0; i < 40 && !wa.textoDaCaixa() && !pronto; i += 1) {
      await vi.advanceTimersByTimeAsync(50);
      if (i === 2) atendenteDigita('digitei agora');
    }
    const r = await rodar(p);
    expect(r).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
    expect(wa.textoDaCaixa()).toBe('digitei agora');
  });
});

describe('pausar (limparCaixa): só limpa o que a extensão inseriu e continua intacto', () => {
  it('texto colado por nós e intacto: limpa', async () => {
    await colar();
    expect(wa.textoDaCaixa()).toBe(TEXTO);
    expect(limparCaixa(TEXTO)).toEqual({ ok: true, limpou: true });
    expect(wa.textoDaCaixa()).toBe('');
  });

  it('atendente editou depois da colagem: NÃO limpa', async () => {
    await colar();
    atendenteDigita(`${TEXTO} Abraço!`);
    const r = limparCaixa(TEXTO);
    expect(r).toMatchObject({ ok: true, limpou: false });
    expect(wa.textoDaCaixa()).toBe(`${TEXTO} Abraço!`);
  });

  it('a conversa mudou antes da pausa: NÃO limpa (nem se a outra caixa tiver o mesmo texto)', async () => {
    await colar('Ana Cliente');
    await rodar(lerConversa('Bia Cliente'));
    expect(wa.aberta()).toBe('Bia Cliente');
    atendenteDigita(TEXTO); // texto idêntico, mas digitado pelo atendente na conversa da Bia
    const r = limparCaixa(TEXTO);
    expect(r).toMatchObject({ ok: true, limpou: false });
    expect(wa.textoDaCaixa()).toBe(TEXTO);
  });

  it('nunca colamos nada: limparCaixa não apaga o rascunho do atendente, mesmo igual ao texto', async () => {
    await abrirComRascunho('Ana Cliente', TEXTO);
    expect(limparCaixa(TEXTO)).toMatchObject({ ok: true, limpou: false });
    expect(wa.textoDaCaixa()).toBe(TEXTO);
  });

  it('depois de substituir, o texto passa a ser nosso e a pausa limpa', async () => {
    await abrirComRascunho('Ana Cliente', 'rascunho antigo');
    await colar('Ana Cliente', TEXTO, false, true);
    expect(limparCaixa(TEXTO)).toEqual({ ok: true, limpou: true });
    expect(wa.textoDaCaixa()).toBe('');
  });
});

describe('abrirEPrepararRascunho (lembretes): mesma regra', () => {
  it('vazia cola; igual deixa; diferente/prefixo/complemento não mexe; substituir troca', async () => {
    expect((await rodar(abrirEPrepararRascunho('Ana Cliente', TEXTO))).ok).toBe(true);
    expect(wa.textoDaCaixa()).toBe(TEXTO);

    execCalls = [];
    expect((await rodar(abrirEPrepararRascunho('Ana Cliente', TEXTO))).ok).toBe(true); // igual
    expect(execCalls).toEqual([]);

    for (const rascunho of ['Boa tarde, Ana', `${TEXTO} Pedro`, 'outra coisa']) {
      atendenteDigita(rascunho);
      const r = await rodar(abrirEPrepararRascunho('Ana Cliente', TEXTO));
      expect(r).toMatchObject({ ok: false, codigo: 'rascunho_diferente' });
      expect(wa.textoDaCaixa()).toBe(rascunho);
    }

    const r = await rodar(abrirEPrepararRascunho('Ana Cliente', TEXTO, true));
    expect(r.ok).toBe(true);
    expect(wa.textoDaCaixa()).toBe(TEXTO);
    expect(wa.proibido).toEqual([]);
  });
});
