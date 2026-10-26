// @vitest-environment jsdom
//
// Envio automático OPCIONAL endurecido (0.7.22): reconferência antes do clique, botão Enviar só por rótulo/ícone exato
// e nunca o microfone, sem Enter sintético, confirmação depois do clique, detector que ignora mensagem recebida,
// expiração do observador e batimento do painel. Tudo em HTML sintético (README, seção 6: validar no WhatsApp real).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encontrarBotaoEnviar, enviarHumano, PRAZO_CONFIRMACAO_MS } from '../src/content/envio-humano';
import { abrirEColar, acharMensagemEnviada, LIMITE_OBSERVACAO_MS, pararObservacao, PRAZO_BATIMENTO_MS, reconferirAntesDoClique, registrarBatimento } from '../src/content/execucao';
import type { EventoConteudo } from '../src/shared/mensagens';
import { instalarEventosDeMouseSeguros, montarEnvioFalso, type EnvioFalso, type OpcoesConversaFalsa } from './ajuda/whatsapp-envio-falso';

const NOME = 'Ana Cliente';
const TEXTO = 'Oi Ana, tudo bem?';
const RECEBIDA = { id: 'R1', texto: 'bom dia', autor: NOME } as const;

let f: EnvioFalso;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  pararObservacao();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function rodar(op: Partial<OpcoesConversaFalsa>, auto: boolean, texto = TEXTO) {
  f = montarEnvioFalso({ nome: NOME, mensagens: [RECEBIDA], ...op });
  const eventos: EventoConteudo[] = [];
  const detectados: string[] = [];
  const p = abrirEColar(NOME, texto, (t) => detectados.push(t), auto, (e) => eventos.push(e));
  return { p, eventos, detectados };
}
const avancar = (ms: number) => vi.advanceTimersByTimeAsync(ms);
/** Cola (≈3 s) e deixa a janela de conferência terminar com folga (até 3,8 s + pressão do clique). */
async function colarEEsperarJanela(p: Promise<unknown>) {
  await avancar(3200);
  const r = await p;
  await avancar(4500);
  return r;
}

describe('botão Enviar: só rodapé, só com a caixa preenchida, só rótulo/ícone exato, nunca o microfone', () => {
  function rodape(html: string, textoCaixa: string): void {
    document.body.innerHTML = `<div id="main"><footer><div contenteditable="true" role="textbox">${textoCaixa}</div><div>${html}</div></footer></div>`;
  }

  it('acha por aria-label "Enviar" e "Send", por data-icon="send" e por <svg><title> send/wds-ic-send-filled', () => {
    rodape('<button id="b" aria-label="Enviar"></button>', 'oi');
    expect(encontrarBotaoEnviar()?.id).toBe('b');
    rodape('<button id="b" aria-label="Send"></button>', 'oi');
    expect(encontrarBotaoEnviar()?.id).toBe('b');
    rodape('<button id="b"><span data-icon="send"></span></button>', 'oi');
    expect(encontrarBotaoEnviar()?.id).toBe('b');
    rodape('<button id="b"><svg><title>wds-ic-send-filled</title></svg></button>', 'oi');
    expect(encontrarBotaoEnviar()?.id).toBe('b');
    rodape('<div role="button" id="b"><svg><title>send</title></svg></div>', 'oi');
    expect(encontrarBotaoEnviar()?.id).toBe('b');
  });

  it('com a caixa VAZIA não procura (ali o botão é o microfone): devolve null mesmo com rótulo "Enviar"', () => {
    rodape('<button aria-label="Enviar"></button>', '');
    expect(encontrarBotaoEnviar()).toBeNull();
    rodape('<button aria-label="Enviar"></button>', '   ');
    expect(encontrarBotaoEnviar()).toBeNull();
  });

  it('o seletor amplo "end" morreu: rótulos como "Tender", "Legend" ou "Sender" não são o botão Enviar', () => {
    for (const r of ['Tender', 'Legend', 'Sender', 'Attend', 'Enviar para todos']) {
      rodape(`<button aria-label="${r}"></button>`, 'oi');
      expect(encontrarBotaoEnviar(), r).toBeNull();
    }
  });

  it('sem fallback estrutural: o "último botão à direita da caixa" NÃO é adivinhado', () => {
    rodape('<button id="a"></button><button id="ultimo"></button>', 'oi');
    expect(encontrarBotaoEnviar()).toBeNull();
  });

  it('nunca devolve o microfone: botão de voz sozinho, ou rotulado "Enviar" mas com o ícone do microfone', () => {
    rodape('<button aria-label="Mensagem de voz"><span data-icon="ptt"></span></button>', 'oi');
    expect(encontrarBotaoEnviar()).toBeNull();
    rodape('<button aria-label="Enviar"><span data-icon="ptt"></span></button>', 'oi');
    expect(encontrarBotaoEnviar()).toBeNull();
    rodape('<button aria-label="Enviar"><svg><title>wds-ic-ptt</title></svg></button>', 'oi');
    expect(encontrarBotaoEnviar()).toBeNull();
    // com microfone E Enviar juntos, vem o Enviar
    rodape('<button id="mic" aria-label="Mensagem de voz"><span data-icon="ptt"></span></button><button id="b" aria-label="Enviar"></button>', 'oi');
    expect(encontrarBotaoEnviar()?.id).toBe('b');
  });

  it('só procura em #main footer: botão "Enviar" fora do rodapé da conversa é ignorado', () => {
    document.body.innerHTML = '<div id="main"><footer><div contenteditable="true">oi</div></footer></div><button aria-label="Enviar"></button>';
    expect(encontrarBotaoEnviar()).toBeNull();
    document.body.innerHTML = '<footer><div contenteditable="true">oi</div><button aria-label="Enviar"></button></footer>';
    expect(encontrarBotaoEnviar()).toBeNull();
  });
});

describe('enviarHumano: não devolve sucesso sem confirmação e nunca usa o teclado', () => {
  function pagina(botoes: string): { cliques: () => number; teclas: () => number } {
    instalarEventosDeMouseSeguros();
    document.body.innerHTML = `<div id="main"><footer><div contenteditable="true">oi</div><div>${botoes}</div></footer></div>`;
    let c = 0;
    let t = 0;
    document.querySelector('[aria-label="Enviar"]')?.addEventListener('click', () => (c += 1));
    for (const tipo of ['keydown', 'keypress', 'keyup']) document.addEventListener(tipo, () => (t += 1), true);
    return { cliques: () => c, teclas: () => t };
  }
  const rodarEnvio = async (op: Parameters<typeof enviarHumano>[1]) => {
    const p = enviarHumano(document, op);
    await avancar(PRAZO_CONFIRMACAO_MS + 1000);
    return p;
  };

  it('clica UMA vez e só devolve ok:true quando o detector confirma', async () => {
    const pg = pagina('<button aria-label="Enviar"></button>');
    let confirmou = false;
    setTimeout(() => (confirmou = true), 1500);
    const r = await rodarEnvio({ reconferir: () => null, confirmar: () => confirmou });
    expect(r).toEqual({ ok: true });
    expect(pg.cliques()).toBe(1);
    expect(pg.teclas()).toBe(0);
  });

  it('clicou e nada confirmou em 20 s → envio_nao_confirmado (um clique só, sem repetir, sem teclado)', async () => {
    const pg = pagina('<button aria-label="Enviar"></button>');
    const r = await rodarEnvio({ reconferir: () => null, confirmar: () => false });
    expect(r).toMatchObject({ ok: false, codigo: 'envio_nao_confirmado' });
    expect(pg.cliques()).toBe(1);
    expect(pg.teclas()).toBe(0);
    expect(PRAZO_CONFIRMACAO_MS).toBe(20_000);
  });

  it('sem botão confiável → botao_enviar_ausente, nada clicado e nenhum Enter sintético', async () => {
    const pg = pagina('<button aria-label="Mensagem de voz"><span data-icon="ptt"></span></button>');
    document.querySelector('[data-icon="ptt"]')!.closest('button')!.addEventListener('click', () => {
      throw new Error('clicou no microfone');
    });
    const r = await rodarEnvio({ reconferir: () => null, confirmar: () => true });
    expect(r).toMatchObject({ ok: false, codigo: 'botao_enviar_ausente' });
    expect(pg.teclas()).toBe(0);
  });

  it('veto na reconferência inicial: não procura nem clica', async () => {
    const pg = pagina('<button aria-label="Enviar"></button>');
    const r = await rodarEnvio({ reconferir: () => 'mudou', confirmar: () => true });
    expect(r).toEqual({ ok: false, codigo: 'reconferencia_falhou', motivo: 'mudou' });
    expect(pg.cliques()).toBe(0);
  });

  it('veto IMEDIATAMENTE antes do clique (depois do tempo de pressão): não clica', async () => {
    const pg = pagina('<button aria-label="Enviar"></button>');
    let chamadas = 0;
    const r = await rodarEnvio({ reconferir: () => (++chamadas >= 3 ? 'a caixa mudou' : null), confirmar: () => true });
    expect(r).toMatchObject({ ok: false, codigo: 'reconferencia_falhou' });
    expect(chamadas).toBe(3); // início, antes de apertar, e logo antes do clique
    expect(pg.cliques()).toBe(0);
  });
});

describe('reconferirAntesDoClique', () => {
  const montar = (op: Partial<OpcoesConversaFalsa> = {}) => {
    f = montarEnvioFalso({ nome: NOME, mensagens: [RECEBIDA], ...op });
    f.trocarDeConversa(NOME);
    f.digitar(TEXTO);
    registrarBatimento();
  };

  it('tudo confere → null', () => {
    montar();
    expect(reconferirAntesDoClique(NOME, TEXTO)).toBeNull();
  });

  it('título diferente do nome do item → veta', () => {
    montar();
    expect(reconferirAntesDoClique('Outra Pessoa', TEXTO)).toMatch(/conversa aberta mudou/);
  });

  it('conversa de grupo (ícone no cabeçalho) → veta; sem sinal positivo → veta', () => {
    montar({ iconeGrupoNoCabecalho: true });
    expect(reconferirAntesDoClique(NOME, TEXTO)).toMatch(/grupo/);
    montar({ mensagens: [{ id: 'R9', texto: 'oi' }] }); // recebida sem autor legível
    expect(reconferirAntesDoClique(NOME, TEXTO)).toMatch(/individual/);
  });

  it('caixa vazia → veta; texto diferente do colado (editado, acrescentado ou cortado) → veta', () => {
    montar();
    f.digitar('');
    expect(reconferirAntesDoClique(NOME, TEXTO)).toMatch(/vazia/);
    f.digitar(`${TEXTO} extra`);
    expect(reconferirAntesDoClique(NOME, TEXTO)).toMatch(/exatamente/);
    f.digitar('Oi Ana');
    expect(reconferirAntesDoClique(NOME, TEXTO)).toMatch(/exatamente/);
  });

  it('texto com emoji e quebra de linha confere (comparação emoji-aware, espaços colapsados)', () => {
    montar();
    const t = 'Olá 😀\nTudo bem 👍🏽?';
    f.digitar(t);
    expect(reconferirAntesDoClique(NOME, t)).toBeNull();
    f.digitar('Olá \nTudo bem ?');
    expect(reconferirAntesDoClique(NOME, t)).toMatch(/exatamente/);
  });

  it('aviso/janela do WhatsApp aberto → veta', () => {
    montar();
    f.abrirAviso();
    expect(reconferirAntesDoClique(NOME, TEXTO)).toMatch(/aviso/);
  });

  it('painel sem batimento há mais de 45 s → veta', () => {
    montar();
    registrarBatimento(Date.now() - PRAZO_BATIMENTO_MS - 1000);
    expect(reconferirAntesDoClique(NOME, TEXTO)).toMatch(/painel/);
    registrarBatimento(Date.now() - PRAZO_BATIMENTO_MS + 5000);
    expect(reconferirAntesDoClique(NOME, TEXTO)).toBeNull();
  });
});

describe('abrirEColar com envio automático (fluxo completo, relógio falso)', () => {
  it('caminho feliz: janela de conferência, UM clique, só conta como enviado depois que o detector vê a mensagem', async () => {
    const { p, eventos, detectados } = rodar({}, true);
    const r = await colarEEsperarJanela(p);
    expect(r).toMatchObject({ ok: true, idsAntes: ['R1'] });
    await avancar(1000);
    expect(f.cliques.enviar).toBe(1);
    expect(f.cliques.microfone).toBe(0);
    expect(f.teclado).toBe(0);
    expect(detectados).toEqual([TEXTO]);
    expect(eventos).toEqual([]);
  });

  it('envio MANUAL (padrão): cola, não clica em nada; o usuário envia e o detector percebe', async () => {
    const { p, eventos, detectados } = rodar({}, false);
    await colarEEsperarJanela(p);
    await avancar(10_000);
    expect(f.cliques.enviar).toBe(0);
    expect(f.textoDaCaixa()).toBe(TEXTO);
    f.enviarComoUsuario();
    await avancar(1000);
    expect(detectados).toEqual([TEXTO]);
    expect(eventos).toEqual([]);
  });

  it('usuário muda de conversa durante a janela → não clica, evento envioBloqueado, caixa do contato original limpa se for nossa', async () => {
    const { p, eventos, detectados } = rodar({}, true);
    await avancar(3200);
    await p;
    f.trocarDeConversa('Outra Pessoa');
    await avancar(4500);
    expect(f.cliques.enviar).toBe(0);
    expect(detectados).toEqual([]);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:envioBloqueado', nome: NOME, codigo: 'reconferencia_falhou' });
  });

  it('usuário edita o texto na janela → não clica, não apaga o que o usuário escreveu, avisa o painel', async () => {
    const { p, eventos } = rodar({}, true);
    await avancar(3200);
    await p;
    f.digitar(`${TEXTO} (editado)`);
    await avancar(4500);
    expect(f.cliques.enviar).toBe(0);
    expect(f.textoDaCaixa()).toBe(`${TEXTO} (editado)`);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:envioBloqueado', codigo: 'reconferencia_falhou', limpou: false });
  });

  it('aviso do WhatsApp na janela → não clica; o texto era nosso e a caixa é limpa (limpou:true)', async () => {
    const { p, eventos } = rodar({}, true);
    await avancar(3200);
    await p;
    f.abrirAviso();
    await avancar(4500);
    expect(f.cliques.enviar).toBe(0);
    expect(f.textoDaCaixa()).toBe('');
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:envioBloqueado', limpou: true });
  });

  it('painel some (sem batimento por mais de 45 s) → não clica', async () => {
    const { p, eventos } = rodar({}, true);
    await avancar(3200);
    await p;
    registrarBatimento(Date.now() - PRAZO_BATIMENTO_MS - 1);
    await avancar(4500);
    expect(f.cliques.enviar).toBe(0);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:envioBloqueado', codigo: 'painel_ausente' });
  });

  it('batimento regular mantém o painel vivo e o clique acontece', async () => {
    const { p, detectados } = rodar({}, true);
    await avancar(3200);
    await p;
    registrarBatimento();
    await avancar(5500);
    expect(f.cliques.enviar).toBe(1);
    expect(detectados).toEqual([TEXTO]);
  });

  it('sem botão Enviar (só microfone) → botao_enviar_ausente: NÃO clica no microfone, sem Enter, caixa limpa', async () => {
    const { p, eventos, detectados } = rodar({ botao: 'so_microfone' }, true);
    await colarEEsperarJanela(p);
    expect(f.cliques.microfone).toBe(0);
    expect(f.cliques.enviar).toBe(0);
    expect(f.teclado).toBe(0);
    expect(detectados).toEqual([]);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:envioBloqueado', codigo: 'botao_enviar_ausente', limpou: true });
    expect(f.textoDaCaixa()).toBe('');
  });

  it('rodapé só com botão de rótulo "Tender" e botão "Enviar" que é o microfone → nenhum clique', async () => {
    for (const botao of ['tender', 'enviar_no_microfone'] as const) {
      pararObservacao();
      const { p, eventos } = rodar({ botao }, true);
      await colarEEsperarJanela(p);
      expect(f.cliques, botao).toEqual({ enviar: 0, microfone: 0, outros: 0 });
      expect(eventos[0], botao).toMatchObject({ codigo: 'botao_enviar_ausente' });
    }
  });

  it('clicou e o WhatsApp não enviou (sem confirmação em 20 s) → envio_nao_confirmado, um clique só, não conta como enviado', async () => {
    const { p, eventos, detectados } = rodar({ envia: false }, true);
    await colarEEsperarJanela(p);
    await avancar(PRAZO_CONFIRMACAO_MS + 1000);
    expect(f.cliques.enviar).toBe(1);
    expect(detectados).toEqual([]);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:envioNaoConfirmado', nome: NOME });
    await avancar(60_000);
    expect(f.cliques.enviar).toBe(1); // não tenta de novo sozinho
  });

  it('usuário envia na mão durante a janela: o clique automático não acontece (sem envio duplicado)', async () => {
    const { p, detectados } = rodar({}, true);
    await avancar(3200);
    await p;
    f.enviarComoUsuario();
    await avancar(6000);
    expect(f.cliques.enviar).toBe(0);
    expect(detectados).toEqual([TEXTO]);
  });

  it('texto com emoji é colado, reconferido e detectado (img alt)', async () => {
    const texto = 'Olá 😀 tudo bem? 👍';
    const { p, detectados, eventos } = rodar({}, true, texto);
    const r = await colarEEsperarJanela(p);
    expect(r).toMatchObject({ ok: true });
    await avancar(1000);
    expect(f.cliques.enviar).toBe(1);
    expect(detectados).toEqual([texto]);
    expect(eventos).toEqual([]);
  });
});

describe('detector: só conta mensagem NOSSA nova com o texto colado', () => {
  const antes = new Set(['R1']);
  const montar = (m: Parameters<EnvioFalso['adicionarMensagem']>[0][]) => {
    f = montarEnvioFalso({ nome: NOME, mensagens: [RECEBIDA] });
    f.trocarDeConversa(NOME);
    for (const x of m) f.adicionarMensagem(x);
  };

  it('mensagem RECEBIDA com exatamente o mesmo texto não conta (era o `|| confere`)', () => {
    montar([{ id: 'N1', texto: TEXTO, autor: NOME }]);
    expect(acharMensagemEnviada(TEXTO, antes)).toBeNull();
  });

  it('mensagem com o mesmo texto mas SEM sinal de ser minha não conta', () => {
    montar([{ id: 'N1', texto: TEXTO, minha: true, sinal: 'nenhum' }]);
    expect(acharMensagemEnviada(TEXTO, antes)).toBeNull();
  });

  it('cada sinal de mensagem minha vale: ícone de status, .message-out, data-id true_', () => {
    for (const sinal of ['icone', 'classe', 'trueId'] as const) {
      montar([{ id: 'N1', texto: TEXTO, minha: true, sinal }]);
      expect(acharMensagemEnviada(TEXTO, antes), sinal).toBe(TEXTO);
    }
    f = montarEnvioFalso({ nome: NOME, mensagens: [RECEBIDA] });
    f.trocarDeConversa(NOME);
    f.adicionarMensagem({ id: 'N2', texto: TEXTO, minha: true, sinal: 'nenhum' });
    document.querySelector('[data-id="N2"]')!.insertAdjacentHTML('beforeend', '<svg><title>wds-ic-read</title></svg>');
    expect(acharMensagemEnviada(TEXTO, antes)).toBe(TEXTO);
  });

  it('texto diferente, ou id que já existia antes de colar, não contam', () => {
    montar([{ id: 'N1', texto: 'outra coisa', minha: true }]);
    expect(acharMensagemEnviada(TEXTO, antes)).toBeNull();
    montar([{ id: 'N1', texto: TEXTO, minha: true }]);
    expect(acharMensagemEnviada(TEXTO, new Set(['R1', 'N1']))).toBeNull();
  });

  it('a mensagem nossa pode não ser a última (cliente respondeu logo depois)', () => {
    montar([
      { id: 'N1', texto: TEXTO, minha: true },
      { id: 'N2', texto: 'obrigado!', autor: NOME },
    ]);
    expect(acharMensagemEnviada(TEXTO, antes)).toBe(TEXTO);
  });

  it('fluxo: recebida idêntica não dispara a detecção; a nossa dispara', async () => {
    const { p, detectados } = rodar({}, false);
    await colarEEsperarJanela(p);
    f.adicionarMensagem({ id: 'N1', texto: TEXTO, autor: NOME });
    f.digitar('');
    await avancar(1000);
    expect(detectados).toEqual([]);
    f.adicionarMensagem({ id: 'N2', texto: TEXTO, minha: true });
    await avancar(1000);
    expect(detectados).toEqual([TEXTO]);
  });
});

describe('observador: não desiste em silêncio', () => {
  it('30 min sem ver a mensagem sair → evento observacaoExpirada ao painel', async () => {
    const { p, eventos, detectados } = rodar({}, false);
    await colarEEsperarJanela(p);
    await avancar(LIMITE_OBSERVACAO_MS + 1000);
    expect(detectados).toEqual([]);
    expect(eventos).toEqual([{ tipo: 'vitaZap:observacaoExpirada', nome: NOME }]);
  });

  it('se o envio foi detectado antes, não há evento de expiração', async () => {
    const { p, eventos } = rodar({}, false);
    await colarEEsperarJanela(p);
    f.enviarComoUsuario();
    await avancar(LIMITE_OBSERVACAO_MS + 1000);
    expect(eventos).toEqual([]);
  });
});
