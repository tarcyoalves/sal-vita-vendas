// @vitest-environment jsdom
//
// WhatsApp Web de 20/10/2026 (conta do dono, coletado no console), 0.2.2:
//  - a busca é <input role="textbox" data-tab="3" aria-label=""> (rótulo VAZIO) e o X é
//    <button aria-label="End icon button"> dentro de #side;
//  - mensagens são '#main [role="row"]' virtualizadas, com um filho data-testid="conv-msg-<ID>",
//    sem .message-in/.message-out e sem ícones ✓. Só as linhas renderizadas têm texto e autor.
// O HTML aqui é sintético (tests/_whatsapp-falso.ts); a validação real é o checklist do README.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classificarConversaAberta, idsDasMensagens } from '../src/content/chat';
import { diagnosticarPagina } from '../src/content/diagnostico';
import { textoDoCampo } from '../src/content/dom';
import { abrirEColar, compararComFoto, limparBuscaPeloBotao, pararObservacao } from '../src/content/execucao';
import { buscar } from '../src/content/lista';
import { encontrar } from '../src/content/selectors';
import { type ContatoFalso, montarWhatsAppFalso } from './_whatsapp-falso';

const HERMES: ContatoFalso = { nome: 'Sal Vita Hermes', jid: '5584111@c.us', formato: 'real' };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  pararObservacao();
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
const montar = (contatos: ContatoFalso[] = [HERMES]) => montarWhatsAppFalso(contatos, { buscaSemRotulo: true });

function digitarNaBusca(w: ReturnType<typeof montar>, texto: string): void {
  w.busca.value = texto;
  w.busca.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('A — caixa de busca sem aria-label e X "End icon button"', () => {
  it('encontra o input de busca com aria-label VAZIO', () => {
    const w = montar();
    expect(w.busca.getAttribute('aria-label')).toBe('');
    expect(encontrar(document, 'caixaBusca')).toBe(w.busca);
  });

  it('escreve o termo, limpa pelo X e escreve de novo (2ª operação não dá erro de seletor)', async () => {
    const w = montar();
    await rodar(buscar('Sal Vita Hermes'));
    expect(w.busca.value).toBe('Sal Vita Hermes');
    expect(document.getElementById('x-busca')).not.toBeNull();
    await rodar(buscar('', limparBuscaPeloBotao));
    expect(w.cliques).toEqual(['limpar-busca']);
    expect(w.busca.value).toBe('');
    await rodar(buscar('Sal Vita Hermes'));
    expect(w.busca.value).toBe('Sal Vita Hermes');
  });

  it('sem texto na busca, o X não é clicado (o botão nem existe, e a função recusa)', () => {
    const w = montar();
    // Um botão com o mesmo rótulo, só para provar que NÃO é clicado com a busca vazia.
    document.querySelector('#side')?.insertAdjacentHTML('beforeend', '<button aria-label="End icon button" id="outro-x"></button>');
    const clicado = vi.fn();
    document.getElementById('outro-x')?.addEventListener('click', clicado);
    expect(limparBuscaPeloBotao()).toBe(false);
    expect(clicado).not.toHaveBeenCalled();
    expect(w.cliques).toEqual([]);
  });

  it('"End icon button" dentro de #pane-side ou de #main nunca é clicado', async () => {
    const w = montar();
    w.botaoX.remove();
    document.getElementById('lista')?.insertAdjacentHTML('beforeend', '<button aria-label="End icon button" id="na-lista"></button>');
    document.querySelector('#main footer')?.insertAdjacentHTML('beforeend', '<button aria-label="End icon button" id="no-rodape"></button>');
    document.getElementById('mensagens')?.insertAdjacentHTML('beforeend', '<button aria-label="End icon button" id="no-main"></button>');
    const clicado = vi.fn();
    for (const id of ['na-lista', 'no-rodape', 'no-main']) document.getElementById(id)?.addEventListener('click', clicado);
    w.busca.value = 'ana';
    expect(limparBuscaPeloBotao()).toBe(false);
    expect(clicado).not.toHaveBeenCalled();
    // Sem X válido, o fallback limpa o <input> pelo valor (setter nativo + evento input).
    await rodar(buscar('', limparBuscaPeloBotao));
    expect(w.busca.value).toBe('');
    expect(clicado).not.toHaveBeenCalled();
    expect(w.cliques).toEqual([]);
  });

  it('o botão "Dados do perfil" não é tocado', async () => {
    const w = montar();
    const clicado = vi.fn();
    document.getElementById('perfil')?.addEventListener('click', clicado);
    digitarNaBusca(w, 'ana');
    await rodar(buscar('', limparBuscaPeloBotao));
    expect(clicado).not.toHaveBeenCalled();
  });
});

describe('B/C — linhas virtualizadas com conv-msg, sem in/out', () => {
  it('lê os ids pelo data-testid conv-msg-<ID>, incluindo as linhas virtualizadas', () => {
    const w = montar();
    w.abrir(HERMES);
    expect(w.mensagens.querySelectorAll('[data-id]')).toHaveLength(0);
    expect(w.mensagens.querySelectorAll('[role="row"]')).toHaveLength(4);
    expect(idsDasMensagens()).toHaveLength(4);
    expect(idsDasMensagens()).toEqual(w.idsDasMensagens());
  });

  it('individual: 2 linhas renderizadas do contato (autor = título), sem ícone de grupo', () => {
    const w = montar();
    w.abrir(HERMES);
    expect(classificarConversaAberta(idsDasMensagens())).toBe('individual');
  });

  it('individual: eu e o contato (2 autores, um igual ao título)', () => {
    const w = montar();
    w.abrir(HERMES);
    w.enviarComoUsuario('Oi');
    expect(classificarConversaAberta(idsDasMensagens())).toBe('individual');
  });

  it('grupo por ícone, por 3 autores, por 2 autores sem o título e por elemento de autor', () => {
    const casos: ContatoFalso[] = [
      { ...HERMES, nome: 'Equipe', iconeGrupoNoCabecalho: true },
      { ...HERMES, nome: 'Equipe', autores: ['Ana', 'Bia'] },
      { ...HERMES, autorEmElemento: true },
    ];
    for (const c of casos) {
      const w = montar([c]);
      w.abrir(c);
      expect(classificarConversaAberta(idsDasMensagens())).toBe('grupo');
    }
  });

  it('grupo: 3 autores distintos nos data-pre-plain-text, mesmo com o título entre eles', () => {
    const w = montar();
    w.abrir(HERMES);
    w.enviarComoUsuario('Oi');
    w.mensagens.insertAdjacentHTML(
      'beforeend',
      '<div role="row"><div data-testid="conv-msg-3EB0X"><div class="copyable-text" data-pre-plain-text="[07:40, 20/10/2026] Carla: "><span class="selectable-text"><span>oi</span></span></div></div></div>',
    );
    expect(classificarConversaAberta(idsDasMensagens())).toBe('grupo');
  });

  it('um autor diferente do título (não dá para saber se sou eu) → desconhecido, nada é colado', async () => {
    const c: ContatoFalso = { ...HERMES, autores: ['Outro Nome'] };
    const w = montar([c]);
    const r = await rodar(abrirEColar(c.nome, 'Oi', cb()));
    expect(r).toMatchObject({ ok: false, codigo: 'nao_confirmado' });
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('risco residual documentado: só linhas virtualizadas, sem autor legível e sem ícone → individual', () => {
    const c: ContatoFalso = { ...HERMES, semRecebidas: true, linhasVirtualizadas: 3 };
    const w = montar([c]);
    w.abrir(c);
    expect(w.mensagens.querySelectorAll('.selectable-text')).toHaveLength(0);
    expect(classificarConversaAberta(idsDasMensagens())).toBe('individual');
  });

  it('cola em conversa individual e percebe o Enter pelo id novo + texto igual + caixa vazia', async () => {
    const w = montar();
    const c = cb();
    const r = await rodar(abrirEColar(HERMES.nome, 'Oi Hermes, tudo bem?', c));
    expect(r.ok).toBe(true);
    expect(textoDoCampo(w.caixa)).toBe('Oi Hermes, tudo bem?');
    w.enviarComoUsuario('Oi Hermes, tudo bem?');
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.aoDetectarEnvio).toHaveBeenCalledWith('Oi Hermes, tudo bem?', true, null);
  });

  it('texto com emoji também confere', async () => {
    const w = montar();
    const c = cb();
    await rodar(abrirEColar(HERMES.nome, 'Bom dia 😀', c));
    w.enviarComoUsuario('Bom dia 😀');
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.aoDetectarEnvio).toHaveBeenCalledWith('Bom dia 😀', true, null);
  });

  it('id novo com texto igual, mas a caixa ainda tem o texto (não enviou) → não detecta', async () => {
    const w = montar();
    const c = cb();
    await rodar(abrirEColar(HERMES.nome, 'Oi', c));
    w.mensagens.insertAdjacentHTML(
      'beforeend',
      '<div role="row"><div data-testid="conv-msg-3EB0NOVA"><div class="copyable-text" data-pre-plain-text="[07:40, 20/10/2026] Tarcyo: "><span class="selectable-text"><span>Oi</span></span></div></div></div>',
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('id novo com texto DIFERENTE do colado → não detecta', async () => {
    const w = montar();
    const c = cb();
    await rodar(abrirEColar(HERMES.nome, 'Oi', c));
    w.enviarComoUsuario('Outra coisa');
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('mensagem do CONTATO (autor = título) com o mesmo texto não conta como envio', async () => {
    const w = montar();
    const c = cb();
    await rodar(abrirEColar(HERMES.nome, 'Oi', c));
    w.enviarComoUsuario('Oi', false); // esvazia a caixa e põe a mensagem... trocada abaixo
    w.mensagens.lastElementChild?.remove();
    w.mensagens.insertAdjacentHTML(
      'beforeend',
      '<div role="row"><div data-testid="conv-msg-3EB0DELE"><div class="copyable-text" data-pre-plain-text="[07:41, 20/10/2026] Sal Vita Hermes: "><span class="selectable-text"><span>Oi</span></span></div></div></div>',
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('mensagem antiga (id da foto) com o mesmo texto não conta', async () => {
    const w = montar();
    w.abrir(HERMES);
    w.mensagens.insertAdjacentHTML(
      'beforeend',
      '<div role="row"><div data-testid="conv-msg-3EB0VELHA"><div class="copyable-text" data-pre-plain-text="[07:00, 20/10/2026] Tarcyo: "><span class="selectable-text"><span>Oi</span></span></div></div></div>',
    );
    const c = cb();
    await rodar(abrirEColar(HERMES.nome, 'Oi', c));
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('retomada: mensagem nova igual ao texto colado → ja_enviada (não cola de novo); sem ela, cola', async () => {
    const w = montar();
    const r1 = await rodar(abrirEColar(HERMES.nome, 'Oi', cb()));
    const foto = r1.ok ? (r1.foto ?? []) : [];
    expect(foto.length).toBe(4);
    expect(compararComFoto(foto, 'Oi')).toEqual({ estado: 'nenhuma' });
    w.enviarComoUsuario('Oi');
    expect(compararComFoto(foto, 'Oi')).toMatchObject({ estado: 'nova', texto: 'Oi' });
    expect(compararComFoto(foto, 'Outro texto')).toEqual({ estado: 'nenhuma' });
    pararObservacao();
    const r2 = await rodar(abrirEColar(HERMES.nome, 'Oi', cb(), foto));
    expect(r2).toMatchObject({ ok: false, codigo: 'ja_enviada', texto: 'Oi' });
  });
});

describe('E — diagnóstico da busca e das linhas (somente leitura, sem nomes)', () => {
  it('relata a caixa de busca sem rótulo e as linhas virtualizadas', () => {
    const w = montar();
    w.abrir(HERMES);
    const antes = document.body.innerHTML;
    const d = diagnosticarPagina(document);
    expect(document.body.innerHTML).toBe(antes);
    expect(d.caixaBusca).toEqual({ tag: 'input', role: 'textbox', ariaLabel: '', dataTab: '3', temTexto: false });
    expect(d.seletores.find((s) => s.chave === 'caixaBusca')?.casou).toBe('#side input[role="textbox"][data-tab="3"]');
    expect(d.linhasMensagem).toEqual({ convMsg: 4, renderizadas: 2, autores: ['sal'], elementosAutor: 0 });
    expect(JSON.stringify(d)).not.toContain('Hermes');
    expect(d.classificacao.tipo).toBe('individual');
  });

  it('informa que a busca tem texto, sem dizer qual', () => {
    const w = montar();
    digitarNaBusca(w, 'segredo');
    const d = diagnosticarPagina(document);
    expect(d.caixaBusca?.temTexto).toBe(true);
    expect(JSON.stringify(d)).not.toContain('segredo');
  });

  it('elemento data-testid="author" no CABEÇALHO não conta como autor de mensagem', () => {
    const w = montar();
    w.abrir(HERMES);
    document.querySelector('#main header')?.insertAdjacentHTML('beforeend', '<span data-testid="author">Alguém</span>');
    const d = diagnosticarPagina(document);
    expect(d.seletores.find((s) => s.chave === 'autorMensagem')).toEqual({ chave: 'autorMensagem', casou: null, quantidade: 0 });
    expect(d.classificacao.elementoAutor).toBe(false);
    expect(d.classificacao.tipo).toBe('individual');
  });

  it('com elemento de autor dentro das linhas: conta e classifica como grupo', () => {
    const c: ContatoFalso = { ...HERMES, autorEmElemento: true };
    const w = montar([c]);
    w.abrir(c);
    const d = diagnosticarPagina(document);
    expect(d.linhasMensagem.elementosAutor).toBe(2);
    expect(d.classificacao.tipo).toBe('grupo');
  });
});
