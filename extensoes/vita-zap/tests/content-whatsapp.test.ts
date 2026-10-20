// @vitest-environment jsdom
//
// Content script contra um WhatsApp FALSO (HTML sintético, tests/_whatsapp-falso.ts) com
// relógio simulado. Prova a lógica; NÃO prova os seletores do WhatsApp real (checklist do README).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RespostaConteudo } from '../src/shared/mensagens';
import { abrirEColar, cancelarAbertura, LIMITE_OBSERVACAO_MS, limparBuscaPeloBotao, limparCaixa, pararObservacao } from '../src/content/execucao';
import { buscar } from '../src/content/lista';
import { textoDoCampo } from '../src/content/dom';
import { montarWhatsAppFalso, type ContatoFalso, type OpcoesFalso } from './_whatsapp-falso';

const ANA: ContatoFalso = { nome: 'Ana CLIENTE', jid: '5584111@c.us' };
const BIA: ContatoFalso = { nome: 'Bia CLIENTE', jid: '5584222@c.us' };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  pararObservacao();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** Avança o relógio simulado até a promessa terminar. */
async function rodar<T>(p: Promise<T>, passoMs = 100): Promise<T> {
  let fim = false;
  p.then(
    () => (fim = true),
    () => (fim = true),
  );
  for (let i = 0; i < 600 && !fim; i += 1) await vi.advanceTimersByTimeAsync(passoMs);
  return p;
}

function callbacks() {
  return { aoDetectarEnvio: vi.fn(), aoExpirar: vi.fn() };
}

/** Agenda `fn` para `ms` depois de a conversa abrir (o cabeçalho mudar). */
function depoisDeAbrir(ms: number, fn: () => void): void {
  const cab = document.querySelector('#main header span') as HTMLElement;
  const mo = new MutationObserver(() => {
    mo.disconnect();
    setTimeout(fn, ms);
  });
  mo.observe(cab, { attributes: true });
}

function erroDe(r: RespostaConteudo): string {
  return r.ok ? 'ok' : r.codigo;
}

function montar(contatos: ContatoFalso[], opcoes?: OpcoesFalso) {
  return montarWhatsAppFalso(contatos, opcoes);
}

describe('abrir e colar — caminho feliz', () => {
  it('abre, cola o texto, devolve a foto e o JID, e percebe o Enter do usuário', async () => {
    const w = montar([ANA, BIA]);
    const cb = callbacks();
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', cb));
    expect(r).toMatchObject({ ok: true, jid: ANA.jid });
    expect(r.ok && r.foto).toEqual([`false_${ANA.jid}_M1`, `false_${ANA.jid}_M2`]);
    expect(textoDoCampo(w.caixa)).toBe('Oi Ana');
    // Nada é enviado sozinho.
    await vi.advanceTimersByTimeAsync(5000);
    expect(cb.aoDetectarEnvio).not.toHaveBeenCalled();

    w.enviarComoUsuario('Oi Ana');
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb.aoDetectarEnvio).toHaveBeenCalledWith('Oi Ana', true, ANA.jid);
  });

  it('I4: mensagem dentro de .message-out também conta como sua (sinal secundário)', async () => {
    const w = montar([ANA]);
    const cb = callbacks();
    await rodar(abrirEColar(ANA.nome, 'Oi Ana', cb));
    w.enviarComoUsuario('Oi Ana', true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb.aoDetectarEnvio).toHaveBeenCalledTimes(1);
  });

  it('mensagem recebida (nem true_ nem .message-out) não é tratada como envio', async () => {
    const w = montar([ANA]);
    const cb = callbacks();
    await rodar(abrirEColar(ANA.nome, 'Oi Ana', cb));
    w.caixa.innerHTML = '';
    w.mensagens.insertAdjacentHTML('beforeend', `<div data-id="false_${ANA.jid}_R9"><span class="selectable-text"><span>oi</span></span></div>`);
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('A7: o clique de abrir a conversa cai no TÍTULO da linha (e sobe até a linha)', async () => {
    const w = montar([ANA]);
    await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(w.cliques).toEqual(['linha:span']);
  });
});

describe('A4 — emoji', () => {
  it('cola texto com emoji e a caixa (com <img alt>) confere com o texto', async () => {
    const w = montar([ANA]);
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana 😀 tudo bem?', callbacks()));
    expect(r.ok).toBe(true);
    expect(w.caixa.querySelector('img')).not.toBeNull();
    expect(textoDoCampo(w.caixa)).toBe('Oi Ana 😀 tudo bem?');
  });

  it('rascunho só com emoji NÃO é caixa vazia: não cola por cima', async () => {
    const w = montar([ANA]);
    depoisDeAbrir(900, () => w.digitar('😀'));
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('caixa_ocupada');
    expect(w.caixa.querySelector('img')?.getAttribute('alt')).toBe('😀');
    expect(textoDoCampo(w.caixa)).toBe('😀');
  });

  it('o texto da mensagem enviada com emoji é lido (alt) e confere', async () => {
    const w = montar([ANA]);
    const cb = callbacks();
    await rodar(abrirEColar(ANA.nome, 'Oi 😀', cb));
    w.enviarComoUsuario('Oi 😀');
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb.aoDetectarEnvio).toHaveBeenCalledWith('Oi 😀', true, ANA.jid);
  });
});

describe('A1 — nunca mexer no foco de quem está digitando', () => {
  it('campo com texto do usuário focado: não busca, não cola, não muda o foco', async () => {
    const w = montar([ANA]);
    w.digitar('rascunho do usuário');
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('usuario_digitando');
    expect(document.activeElement).toBe(w.caixa);
    expect(textoDoCampo(w.caixa)).toBe('rascunho do usuário');
    expect(w.busca.value).toBe('');
    expect(w.cliques).toEqual([]);
  });

  it('usuário digitando na própria busca: também não mexe', async () => {
    const w = montar([ANA]);
    w.busca.focus();
    w.busca.value = 'maria';
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('usuario_digitando');
    expect(w.busca.value).toBe('maria');
  });

  it('o termo que a própria extensão escreveu na busca não conta como "usuário digitando"', async () => {
    const w = montar([ANA, BIA]);
    const cb = callbacks();
    expect(erroDe(await rodar(abrirEColar(ANA.nome, 'Oi Ana', cb)))).toBe('ok');
    // Zera a caixa como se o usuário tivesse enviado; o foco está na caixa (vazia) e a busca ainda tem "Ana CLIENTE".
    w.enviarComoUsuario('Oi Ana');
    await vi.advanceTimersByTimeAsync(1000);
    expect(erroDe(await rodar(abrirEColar(BIA.nome, 'Oi Bia', callbacks())))).toBe('ok');
  });
});

describe('A5 — reconferir imediatamente antes e depois de colar', () => {
  it('rascunho que aparece na janela de espera não é sobrescrito', async () => {
    const w = montar([ANA]);
    depoisDeAbrir(900, () => w.digitar('estou escrevendo aqui'));
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('caixa_ocupada');
    expect(textoDoCampo(w.caixa)).toBe('estou escrevendo aqui');
  });

  it('se a conversa mudar antes de colar, nada é colado', async () => {
    const w = montar([ANA, BIA]);
    depoisDeAbrir(900, () => w.trocarParaOutraConversa(BIA));
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('cabecalho');
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('se a conversa mudar logo DEPOIS de colar, o texto é retirado', async () => {
    const w = montar([ANA, BIA]);
    depoisDeAbrir(1300, () => w.trocarParaOutraConversa(BIA));
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('cabecalho');
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('se o JID mudar com o mesmo título (outra conversa de mesmo nome), recusa', async () => {
    const w = montar([ANA]);
    depoisDeAbrir(900, () => {
      w.mensagens.innerHTML = '<div data-id="false_outrojid@c.us_Q1"><span class="selectable-text"><span>oi</span></span></div>';
    });
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('cabecalho');
    expect(textoDoCampo(w.caixa)).toBe('');
  });
});

describe('A6 — classificar só depois das mensagens carregarem', () => {
  it('mensagens da conversa anterior ainda no DOM não decidem: vale a leitura estável', async () => {
    montar([ANA], { mensagensAntigasPorMs: 300 });
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(r).toMatchObject({ ok: true, jid: ANA.jid });
  });

  it('grupo reconhecido só pelos ids das mensagens é recusado', async () => {
    const w = montar([{ nome: 'Turma CLIENTE', jid: '1203@g.us' }]);
    const r = await rodar(abrirEColar('Turma CLIENTE', 'Oi', callbacks()));
    expect(erroDe(r)).toBe('grupo');
    expect(textoDoCampo(w.caixa)).toBe('');
  });
});

describe('A12 — lista estável, homônimos e grupos', () => {
  it('homônimo que aparece tarde na busca é pego (ambíguo), não abre a primeira linha', async () => {
    const w = montar([ANA], { homonimoTardio: { nome: ANA.nome, aposMs: 2000 } });
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('ambiguo');
    expect(w.cliques).toEqual([]);
  });

  it('prévia "Fulano: texto" indica grupo: não abre', async () => {
    const w = montar([{ nome: 'Clientes CLIENTE', jid: '9@c.us', previa: 'Maria: bom dia pessoal' }]);
    const r = await rodar(abrirEColar('Clientes CLIENTE', 'Oi', callbacks()));
    expect(erroDe(r)).toBe('grupo');
    expect(w.cliques).toEqual([]);
  });

  it('prévia "Você: texto" (mensagem sua) NÃO indica grupo', async () => {
    montar([{ nome: ANA.nome, jid: ANA.jid, previa: 'Você: Oi, tudo bem?' }]);
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('ok');
  });

  it('contato inexistente: nao_encontrado', async () => {
    montar([ANA]);
    expect(erroDe(await rodar(abrirEColar('Zé CLIENTE', 'Oi', callbacks())))).toBe('nao_encontrado');
  });
});

describe('A9 — pausar durante "abrindo"', () => {
  it('cancelar antes de colar: nada é colado', async () => {
    const w = montar([ANA]);
    depoisDeAbrir(100, () => cancelarAbertura());
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    expect(erroDe(r)).toBe('cancelado');
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('cancelar depois de colar: a caixa é limpa e não há observação', async () => {
    const w = montar([ANA]);
    const cb = callbacks();
    depoisDeAbrir(1250, () => cancelarAbertura());
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', cb));
    expect(erroDe(r)).toBe('cancelado');
    expect(textoDoCampo(w.caixa)).toBe('');
    w.enviarComoUsuario('Oi Ana');
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('cancelar sem abertura em andamento não faz nada', () => {
    montar([ANA]);
    expect(() => cancelarAbertura()).not.toThrow();
  });
});

describe('A10 — a observação expira e avisa', () => {
  it('depois de 30 minutos sem envio chama aoExpirar uma vez e para de observar', async () => {
    const w = montar([ANA]);
    const cb = callbacks();
    await rodar(abrirEColar(ANA.nome, 'Oi Ana', cb));
    await vi.advanceTimersByTimeAsync(LIMITE_OBSERVACAO_MS - 1000);
    expect(cb.aoExpirar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cb.aoExpirar).toHaveBeenCalledTimes(1);
    w.enviarComoUsuario('Oi Ana');
    await vi.advanceTimersByTimeAsync(1000);
    expect(cb.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('parar a observação de propósito NÃO dispara o aviso de expiração', async () => {
    montar([ANA]);
    const cb = callbacks();
    await rodar(abrirEColar(ANA.nome, 'Oi Ana', cb));
    pararObservacao();
    await vi.advanceTimersByTimeAsync(LIMITE_OBSERVACAO_MS + 1000);
    expect(cb.aoExpirar).not.toHaveBeenCalled();
  });
});

describe('A2 — retomada: nunca colar de novo no mesmo contato', () => {
  it('mensagem nossa nova desde a foto → ja_enviada, sem colar', async () => {
    const w = montar([ANA]);
    const primeira = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    const foto = primeira.ok ? (primeira.foto ?? []) : [];
    // Painel fechou; o usuário apertou Enter (ninguém observando); a caixa esvaziou.
    pararObservacao();
    w.enviarComoUsuario('Oi Ana');
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks(), foto));
    expect(r).toMatchObject({ ok: false, codigo: 'ja_enviada', texto: 'Oi Ana', jid: ANA.jid });
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('sem mensagem nova desde a foto → cola normalmente', async () => {
    const w = montar([ANA]);
    const primeira = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    const foto = primeira.ok ? (primeira.foto ?? []) : [];
    expect(limparCaixa('Oi Ana')).toEqual({ ok: true });
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks(), foto));
    expect(r.ok).toBe(true);
    expect(textoDoCampo(w.caixa)).toBe('Oi Ana');
  });

  it('foto que não bate com nada da conversa → nao_confirmado (não cola, não assume)', async () => {
    const w = montar([ANA]);
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks(), ['id-que-nao-existe']));
    expect(erroDe(r)).toBe('nao_confirmado');
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('mensagens antigas que só agora carregaram (antes da foto) não contam como envio', async () => {
    const w = montar([ANA]);
    const r0 = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks()));
    const foto = r0.ok ? (r0.foto ?? []) : [];
    limparCaixa('Oi Ana');
    w.mensagens.insertAdjacentHTML('afterbegin', `<div data-id="true_${ANA.jid}_VELHA"><span class="selectable-text"><span>de ontem</span></span></div>`);
    const r = await rodar(abrirEColar(ANA.nome, 'Oi Ana', callbacks(), foto));
    expect(r.ok).toBe(true);
  });
});

describe('A8 — texto revalidado antes de colar', () => {
  it.each([
    ['quebra de linha', 'Oi\nAna'],
    ['link', 'Veja www.salvita.com.br'],
    ['grande demais', 'x'.repeat(501)],
  ])('%s: recusa sem tocar na busca nem na caixa', async (_nome, texto) => {
    const w = montar([ANA]);
    const r = await rodar(abrirEColar(ANA.nome, texto, callbacks()));
    expect(erroDe(r)).toBe('texto_invalido');
    expect(w.busca.value).toBe('');
    expect(textoDoCampo(w.caixa)).toBe('');
  });
});

describe('I3 — limpar a busca pelo X do WhatsApp (único clique além da linha da lista)', () => {
  it('termo vazio: clica no X (aria-label "Limpar…") e não precisa do fallback', async () => {
    const w = montar([ANA]);
    w.busca.value = 'ana';
    await rodar(buscar('', limparBuscaPeloBotao));
    expect(w.cliques).toEqual(['limpar-busca']);
    expect(w.busca.value).toBe('');
  });

  it('sem o botão X, cai no fallback de limpar o campo', async () => {
    const w = montar([ANA]);
    w.botaoX.remove();
    w.busca.value = 'ana';
    await rodar(buscar('', limparBuscaPeloBotao));
    expect(w.busca.value).toBe('');
    expect(w.cliques).toEqual([]);
  });

  it('botão com "Limpar" DENTRO da lista de conversas não é clicado', async () => {
    const w = montar([ANA]);
    w.botaoX.remove();
    w.lista.insertAdjacentHTML('beforeend', '<button aria-label="Limpar conversa" id="perigo"></button>');
    const clicado = vi.fn();
    document.getElementById('perigo')?.addEventListener('click', clicado);
    w.busca.value = 'ana';
    await rodar(buscar('', limparBuscaPeloBotao));
    expect(clicado).not.toHaveBeenCalled();
  });

  it('o clique no X é só mouse na própria busca e nunca no botão de enviar do rodapé', async () => {
    const w = montar([ANA]);
    const rodape = document.querySelector('footer') as HTMLElement;
    rodape.insertAdjacentHTML('beforeend', '<button aria-label="Limpar" id="rodape-btn"></button>');
    const clicado = vi.fn();
    document.getElementById('rodape-btn')?.addEventListener('click', clicado);
    w.busca.value = 'ana';
    await rodar(buscar('', limparBuscaPeloBotao));
    expect(clicado).not.toHaveBeenCalled();
    expect(w.cliques).toEqual(['limpar-busca']);
  });
});
