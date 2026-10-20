// @vitest-environment jsdom
//
// 0.3.1 — campo (WhatsApp real, modo automático): conversa só com mensagens MINHAS (balão verde,
// ✓✓ no rodapé da mensagem) + mensagens de sistema. Sem .message-in/.message-out, o único autor
// do data-pre-plain-text era o meu nome (≠ título) e a conversa virava "desconhecido".
// Agora: a mensagem é minha pelo ícone de status, o meu nome é aprendido e descontado dos autores.
// O HTML é sintético (tests/_whatsapp-falso.ts); a validação no WhatsApp real é o checklist do README.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoresDoOutroLado, classificarConversa, classificarConversaAberta, idsDasMensagens, lerSinaisDaConversa, temIconeDeStatus } from '../src/content/chat';
import { diagnosticarPagina } from '../src/content/diagnostico';
import { textoDoCampo } from '../src/content/dom';
import { abrirEColar, pararObservacao } from '../src/content/execucao';
import { definirMeuNome, meuNomeAtual } from '../src/content/meuNome';
import { SELETORES } from '../src/content/selectors';
import { resumirPagina, textoDiagnostico } from '../src/shared/diagnostico';
import { type ContatoFalso, montarWhatsAppFalso } from './_whatsapp-falso';

const CLIENTE: ContatoFalso = {
  nome: 'Mercearia Boa Vista',
  jid: '5584222@c.us',
  formato: 'real',
  semRecebidas: true,
  linhasVirtualizadas: 0,
  minhasIniciais: 2,
  mensagensSistema: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  definirMeuNome(null);
});
afterEach(() => {
  pararObservacao();
  definirMeuNome(null);
  vi.useRealTimers();
  document.body.innerHTML = '';
});

async function rodar<T>(p: Promise<T>): Promise<T> {
  let fim = false;
  p.then(
    () => (fim = true),
    () => (fim = true),
  );
  for (let i = 0; i < 600 && !fim; i += 1) await vi.advanceTimersByTimeAsync(100);
  return p;
}

const cb = () => ({ aoDetectarEnvio: vi.fn(), aoExpirar: vi.fn() });
const montar = (contatos: ContatoFalso[]) => montarWhatsAppFalso(contatos, { buscaSemRotulo: true });

function linha(html: string): HTMLElement {
  document.body.innerHTML = `<div id="main"><div id="mensagens">${html}</div></div>`;
  return document.querySelector<HTMLElement>('[role="row"]') as HTMLElement;
}

describe('1 — mensagem minha pelo ícone/rótulo de status', () => {
  it.each(['msg-check', 'msg-dblcheck', 'msg-dblcheck-ack', 'msg-time', 'msg-check-light', 'msg-dblcheck-light'])('data-icon="%s" dentro da linha = minha', (icone) => {
    const el = linha(`<div role="row"><div data-testid="conv-msg-A1"><div data-testid="msg-container"><div data-testid="msg-meta"><span data-icon="${icone}"></span></div></div></div></div>`);
    expect(temIconeDeStatus(el)).toBe(true);
  });

  it.each(['Lida', 'Entregue', 'Enviada', 'Pendente', 'Read', 'Delivered', 'Sent', 'Pending', ' lida '])('aria-label "%s" em msg-meta = minha', (rotulo) => {
    const el = linha(`<div role="row"><div data-testid="conv-msg-A1"><div data-testid="msg-container"><div data-testid="msg-meta"><span aria-label="${rotulo}"></span></div></div></div></div>`);
    expect(temIconeDeStatus(el)).toBe(true);
  });

  it('o próprio msg-meta com aria-label de status também vale', () => {
    const el = linha(`<div role="row"><div data-testid="conv-msg-A1"><div data-testid="msg-container"><div data-testid="msg-meta" aria-label="Entregue"></div></div></div></div>`);
    expect(temIconeDeStatus(el)).toBe(true);
  });

  it('mensagem recebida (sem ícone) e aria-label fora de msg-meta não contam', () => {
    const recebida = linha(
      `<div role="row"><div data-testid="conv-msg-A1"><div data-testid="msg-container"><div class="copyable-text" data-pre-plain-text="[10:00, 20/10/2026] Ana: "><span class="selectable-text">oi</span></div><div data-testid="msg-meta"><span>10:00</span></div></div></div></div>`,
    );
    expect(temIconeDeStatus(recebida)).toBe(false);
    const fora = linha(`<div role="row"><div data-testid="conv-msg-A2"><div aria-label="Lida"></div><div data-testid="msg-container"></div></div></div>`);
    expect(temIconeDeStatus(fora)).toBe(false);
    const outroIcone = linha(`<div role="row"><div data-testid="conv-msg-A3"><div data-testid="msg-meta"><span data-icon="forward"></span></div></div></div>`);
    expect(temIconeDeStatus(outroIcone)).toBe(false);
  });

  it('os seletores de status não mencionam o botão de enviar nem o ícone de enviar', () => {
    expect(JSON.stringify(SELETORES.iconeStatusMinha)).not.toMatch(/send|enviar/i);
  });
});

describe('2/3 — conversa só com mensagens minhas + sistema → individual (o caso do campo)', () => {
  it('aprende meu nome (autor das linhas com ícone) e classifica como individual', () => {
    const w = montar([CLIENTE]);
    w.abrir(CLIENTE);
    expect(meuNomeAtual()).toBeNull();
    expect(classificarConversaAberta(idsDasMensagens())).toBe('individual');
    expect(meuNomeAtual()).toBe('Tarcyo');
  });

  it('as linhas de sistema (sem msg-container/copyable-text) são ignoradas', () => {
    const w = montar([CLIENTE]);
    w.abrir(CLIENTE);
    const sinais = lerSinaisDaConversa();
    expect(sinais.sistema).toBe(2);
    expect(sinais.mensagens).toHaveLength(2);
    expect(sinais.mensagens.every((m) => m.sua && m.comIcone && !m.recebida)).toBe(true);
  });

  it('só mensagens de sistema e nenhuma mensagem → desconhecido', () => {
    const c: ContatoFalso = { ...CLIENTE, minhasIniciais: 0 };
    const w = montar([c]);
    w.abrir(c);
    expect(lerSinaisDaConversa()).toMatchObject({ sistema: 2, mensagens: [] });
    expect(classificarConversaAberta(idsDasMensagens())).toBe('desconhecido');
  });

  it('o status só por aria-label (sem data-icon) também identifica as minhas', () => {
    const c: ContatoFalso = { ...CLIENTE, statusMinhas: 'rotulo' };
    const w = montar([c]);
    w.abrir(c);
    expect(classificarConversaAberta(idsDasMensagens())).toBe('individual');
    expect(meuNomeAtual()).toBe('Tarcyo');
  });

  it('abrirEColar cola na conversa do campo (antes: nao_confirmado) e não manda nada', async () => {
    const w = montar([CLIENTE]);
    const r = await rodar(abrirEColar(CLIENTE.nome, 'Oi, tudo bem?', cb()));
    expect(r.ok).toBe(true);
    expect(textoDoCampo(w.caixa)).toBe('Oi, tudo bem?');
    expect(w.cliques.filter((c) => c === 'enviar')).toHaveLength(0);
  });

  it('individual normal: minhas + recebidas do contato (autor = título)', () => {
    const c: ContatoFalso = { ...CLIENTE, semRecebidas: false, autores: [CLIENTE.nome] };
    const w = montar([c]);
    w.abrir(c);
    expect(classificarConversaAberta(idsDasMensagens())).toBe('individual');
  });

  it('o nome configurado vale mais que o aprendido e separa os autores mesmo sem ícones', () => {
    definirMeuNome('Tarcyo');
    const c: ContatoFalso = { ...CLIENTE, minhasIniciais: 0, mensagensSistema: false, semRecebidas: false, autores: ['Tarcyo'], linhasVirtualizadas: 0 };
    const w = montar([c]);
    w.abrir(c);
    // As linhas "recebidas" aqui trazem o autor Tarcyo, sem ícone: o meu nome configurado as descarta.
    expect(classificarConversaAberta(idsDasMensagens())).toBe('individual');
    expect(meuNomeAtual()).toBe('Tarcyo');
  });

  it('não aprende o nome quando as minhas linhas têm 2 autores diferentes (ambíguo)', () => {
    const w = montar([CLIENTE]);
    w.abrir(CLIENTE);
    w.mensagens.insertAdjacentHTML(
      'beforeend',
      '<div role="row"><div data-testid="conv-msg-OUTRO"><div data-testid="msg-container"><div class="copyable-text" data-pre-plain-text="[10:00, 20/10/2026] Maria: "><span class="selectable-text">x</span></div><div data-testid="msg-meta"><span data-icon="msg-check"></span></div></div></div></div>',
    );
    classificarConversaAberta(idsDasMensagens());
    expect(meuNomeAtual()).toBeNull();
  });

  it('não aprende um nome igual ao título da conversa', () => {
    const c: ContatoFalso = { ...CLIENTE, meuNome: CLIENTE.nome };
    const w = montar([c]);
    w.abrir(c);
    classificarConversaAberta(idsDasMensagens());
    expect(meuNomeAtual()).toBeNull();
  });
});

describe('3 — grupo', () => {
  it('2 autores do outro lado (além de mim) → grupo', () => {
    const c: ContatoFalso = { ...CLIENTE, nome: 'Equipe Vendas', semRecebidas: false, autores: ['Ana', 'Bia'] };
    const w = montar([c]);
    w.abrir(c);
    expect(classificarConversaAberta(idsDasMensagens())).toBe('grupo');
    expect(autoresDoOutroLado(lerSinaisDaConversa()).outros.size).toBe(2);
  });

  it('1 autor do outro lado diferente do título → grupo', () => {
    const c: ContatoFalso = { ...CLIENTE, nome: 'Equipe Vendas', semRecebidas: false, autores: ['Ana'] };
    const w = montar([c]);
    w.abrir(c);
    expect(classificarConversaAberta(idsDasMensagens())).toBe('grupo');
  });

  it('ícone de grupo no cabeçalho e elemento de autor dentro da linha continuam sendo grupo', () => {
    for (const extra of [{ iconeGrupoNoCabecalho: true }, { semRecebidas: false, autorEmElemento: true }] as Array<Partial<ContatoFalso>>) {
      const c: ContatoFalso = { ...CLIENTE, ...extra };
      const w = montar([c]);
      w.abrir(c);
      expect(classificarConversaAberta(idsDasMensagens())).toBe('grupo');
    }
  });

  it('abrirEColar recusa o grupo sem colar nada', async () => {
    const c: ContatoFalso = { ...CLIENTE, nome: 'Equipe Vendas', semRecebidas: false, autores: ['Ana', 'Bia'] };
    const w = montar([c]);
    const r = await rodar(abrirEColar(c.nome, 'Oi', cb()));
    expect(r).toMatchObject({ ok: false, codigo: 'grupo' });
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('classificarConversa pura: meuNome tira o meu autor; título igual ao meu nome não separa nada', () => {
    const msgs = (autores: string[]) => autores.map((autor) => ({ sua: false, recebida: true, autor, temElementoAutor: false }));
    expect(classificarConversa(['x'], { titulo: 'Ana', iconeGrupoNoCabecalho: false, mensagens: msgs(['Ana', 'Tarcyo', 'Bia']), meuNome: 'Tarcyo' })).toBe('grupo');
    expect(classificarConversa(['x'], { titulo: 'Ana', iconeGrupoNoCabecalho: false, mensagens: msgs(['Ana', 'Tarcyo']), meuNome: 'Tarcyo' })).toBe('individual');
    expect(classificarConversa(['x'], { titulo: 'Ana', iconeGrupoNoCabecalho: false, mensagens: msgs(['Ana']), meuNome: 'Ana' })).toBe('individual');
    expect(classificarConversa(['x'], { titulo: 'Ana', iconeGrupoNoCabecalho: false, mensagens: [], meuNome: 'Tarcyo' })).toBe('desconhecido');
  });
});

describe('5 — detector de envio aceita o ícone de status como "é minha"', () => {
  it('id novo + texto igual + caixa vazia + ícone → detectado, mesmo se o autor lido parecer o contato', async () => {
    const w = montar([{ nome: 'Sal Vita Hermes', jid: '5584111@c.us', formato: 'real' }]);
    const c = cb();
    await rodar(abrirEColar('Sal Vita Hermes', 'Oi Hermes', c));
    w.caixa.innerHTML = '';
    w.mensagens.insertAdjacentHTML(
      'beforeend',
      '<div role="row"><div data-testid="conv-msg-3EB0ICONE"><div data-testid="msg-container"><div class="copyable-text" data-pre-plain-text="[07:40, 20/10/2026] Sal Vita Hermes: "><span class="selectable-text"><span>Oi Hermes</span></span></div><div data-testid="msg-meta"><span data-icon="msg-dblcheck"></span></div></div></div></div>',
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.aoDetectarEnvio).toHaveBeenCalledWith('Oi Hermes', true, null);
  });

  it('o mesmo texto SEM ícone e com autor igual ao título continua não contando', async () => {
    const w = montar([{ nome: 'Sal Vita Hermes', jid: '5584111@c.us', formato: 'real' }]);
    const c = cb();
    await rodar(abrirEColar('Sal Vita Hermes', 'Oi Hermes', c));
    w.caixa.innerHTML = '';
    w.mensagens.insertAdjacentHTML(
      'beforeend',
      '<div role="row"><div data-testid="conv-msg-3EB0SEMICONE"><div data-testid="msg-container"><div class="copyable-text" data-pre-plain-text="[07:40, 20/10/2026] Sal Vita Hermes: "><span class="selectable-text"><span>Oi Hermes</span></span></div><div data-testid="msg-meta"><span>07:40</span></div></div></div></div>',
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('o Enter do usuário no WhatsApp falso (linha com ✓✓) é percebido', async () => {
    const w = montar([CLIENTE]);
    const c = cb();
    await rodar(abrirEColar(CLIENTE.nome, 'Oi, tudo bem?', c));
    w.enviarComoUsuario('Oi, tudo bem?');
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.aoDetectarEnvio).toHaveBeenCalledWith('Oi, tudo bem?', true, null);
  });
});

describe('6 — diagnóstico', () => {
  it('conta minhas (com ícone), recebidas, sistema, mostra o meu nome (3 letras) e os data-icon das linhas', () => {
    const c: ContatoFalso = { ...CLIENTE, semRecebidas: false, autores: [CLIENTE.nome] };
    const w = montar([c]);
    w.abrir(c);
    classificarConversaAberta(idsDasMensagens());
    const antes = document.body.innerHTML;
    const d = diagnosticarPagina(document);
    expect(document.body.innerHTML).toBe(antes);
    expect(d.classificacao).toMatchObject({
      tipo: 'individual',
      comIconeDeStatus: 2,
      enviadas: 2,
      recebidas: 2,
      sistema: 2,
      meuNome: 'tar',
      autoresDoOutroLado: 1,
      iconesNasLinhas: ['msg-dblcheck'],
    });
    const texto = textoDiagnostico(
      [{ id: '1', quando: '2026-10-20T10:00:00Z', fase: 'abrindo', pedido: 'diagnosticar', resposta: { ok: true }, versao: '0.3.1', item: null, pagina: resumirPagina(d) }],
      '0.3.1',
    );
    expect(texto).toContain('"meuNome":"tar"');
    expect(texto).toContain('msg-dblcheck');
    expect(texto).not.toContain('Tarcyo');
    expect(JSON.stringify(d)).not.toContain('Opaa');
  });
});
