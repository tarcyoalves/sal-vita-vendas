// @vitest-environment jsdom
//
// 0.7.65: anexos no content script. Colagem do arquivo (ClipboardEvent + DataTransfer), prévia de mídia, botão Enviar DA PRÉVIA
// com as mesmas regras do rodapé (lista negativa "Programar", ambiguidade = não clica), rede de segurança do "Programar mensagem",
// legenda sempre vazia. HTML sintético (README: validar no WhatsApp real).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diagnosticarRodape, fecharPreviaDeMidia, localizarPrevia, previaMostraArquivo } from '../src/content/envio-humano';
import { colarAnexo, pararObservacao } from '../src/content/execucao';
import type { EventoConteudo } from '../src/shared/mensagens';
import { instalarAnexoFalso, type AnexoFalso, type ModoPrevia } from './ajuda/whatsapp-anexo-falso';
import { montarEnvioFalso, type EnvioFalso } from './ajuda/whatsapp-envio-falso';

const NOME = 'Ana Cliente';
const RECEBIDA = { id: 'R1', texto: 'bom dia', autor: NOME } as const;
const avancar = (ms: number) => vi.advanceTimersByTimeAsync(ms);

let f: EnvioFalso;
let a: AnexoFalso;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  a?.desinstalar();
  pararObservacao();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function pedido(nome = 'tabela.pdf', tipo = 'application/pdf') {
  return { nome, tipo, tamanho: 4, base64: btoa('%PDF') };
}

function montar(modo: ModoPrevia, opcoes: { rascunho?: string } = {}) {
  f = montarEnvioFalso({ nome: NOME, mensagens: [RECEBIDA], ...opcoes });
  f.trocarDeConversa(NOME);
  a = instalarAnexoFalso(f, modo);
  const eventos: EventoConteudo[] = [];
  return { eventos, emitir: (e: EventoConteudo) => eventos.push(e) };
}

async function colar(auto: boolean, emitir: (e: EventoConteudo) => void, arq?: Promise<Awaited<ReturnType<typeof pedido>>>) {
  const p = colarAnexo(NOME, await (arq ?? pedido()), 0, auto, emitir);
  await avancar(4000); // pausa humana (1,5-3 s) + espera da prévia
  return p;
}

describe('colagem do arquivo e prévia de mídia', () => {
  it('cola o File por ClipboardEvent/DataTransfer, a prévia abre mostrando o arquivo e a legenda fica VAZIA; manual não clica em nada', async () => {
    const { eventos, emitir } = montar('normal');
    const r = await colar(false, emitir);
    expect(r).toEqual({ ok: true });
    expect(a.colados).toHaveLength(1);
    expect(a.colados[0].name).toBe('tabela.pdf');
    expect(a.colados[0].type).toBe('application/pdf');
    expect(localizarPrevia(document)).not.toBeNull();
    expect(previaMostraArquivo(localizarPrevia(document)!, { nome: 'tabela.pdf', tipo: 'application/pdf' })).toBe(true);
    expect(a.previa()!.querySelector<HTMLElement>('[contenteditable]')!.textContent).toBe('');
    expect(f.textoDaCaixa()).toBe('');
    expect(a.cliques).toEqual({ enviar: 0, programar: 0, fechar: 0 });
    expect(eventos).toEqual([]);
  });

  it('manual: o atendente aperta o enviar da prévia e o evento anexoEnviado chega', async () => {
    const { eventos, emitir } = montar('normal');
    await colar(false, emitir);
    a.atendenteEnvia();
    await avancar(1000);
    expect(eventos).toEqual([{ tipo: 'vitaZap:anexoEnviado', nome: NOME, indice: 0 }]);
  });

  it('imagem: a miniatura prova o arquivo', async () => {
    const { emitir } = montar('normal');
    const r = await colar(false, emitir, pedido('foto.jpg', 'image/jpeg'));
    expect(r).toEqual({ ok: true });
  });

  it('prévia que NÃO abre em 8 s: erro anexo_previa, nada clicado, nada enviado', async () => {
    const { eventos, emitir } = montar('nao_abre');
    const p = colarAnexo(NOME, await pedido(), 0, true, emitir);
    await avancar(14000);
    const r = await p;
    expect(r).toMatchObject({ ok: false, codigo: 'anexo_previa' });
    expect(a.cliques).toEqual({ enviar: 0, programar: 0, fechar: 0 });
    expect(eventos).toEqual([]);
  });

  it('prévia que abre sem mostrar o arquivo: não envia e fecha pelo X', async () => {
    const { emitir } = montar('sem_arquivo');
    const p = colarAnexo(NOME, await pedido(), 0, true, emitir);
    await avancar(9000);
    const r = await p;
    expect(r).toMatchObject({ ok: false, codigo: 'anexo_previa' });
    expect(a.cliques.enviar).toBe(0);
    expect(a.cliques.fechar).toBe(1);
    expect(a.previa()).toBeNull();
  });

  it('texto na caixa (rascunho do atendente): não cola o arquivo', async () => {
    const { emitir } = montar('normal', { rascunho: 'meu rascunho' });
    const r = await colar(true, emitir);
    expect(r).toMatchObject({ ok: false, codigo: 'caixa_ocupada' });
    expect(a.colados).toHaveLength(0);
  });

  it('já havia prévia aberta: não mexe nela', async () => {
    const { emitir } = montar('normal');
    await colar(false, emitir);
    pararObservacao();
    const r = await colar(false, emitir);
    expect(r).toMatchObject({ ok: false, codigo: 'anexo_previa' });
    expect(a.colados).toHaveLength(1);
  });
});

describe('envio automático DA PRÉVIA: mesmas regras exatas do rodapé', () => {
  it('escolhe o Enviar da prévia e NÃO o Programar (que vem antes no DOM); confirma pela mídia na conversa', async () => {
    const { eventos, emitir } = montar('enviar_e_programar');
    expect(await colar(true, emitir)).toEqual({ ok: true });
    await avancar(8000);
    expect(a.cliques).toEqual({ enviar: 1, programar: 0, fechar: 0 });
    expect(eventos).toEqual([{ tipo: 'vitaZap:anexoEnviado', nome: NOME, indice: 0 }]);
    expect(a.previa()).toBeNull();
  });

  it('só Programar na prévia (sem Enviar): não clica em nada, fecha a prévia pelo X e avisa', async () => {
    const { eventos, emitir } = montar('so_programar');
    await colar(true, emitir);
    await avancar(8000);
    expect(a.cliques).toEqual({ enviar: 0, programar: 0, fechar: 1 });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:anexoFalhou', codigo: 'botao_enviar_ausente', fechou: true });
  });

  it('dois botões parecidos com Enviar: ambiguidade, não clica, fecha a prévia', async () => {
    const { eventos, emitir } = montar('dois_enviar');
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await colar(true, emitir);
    await avancar(8000);
    expect(a.cliques.enviar).toBe(0);
    expect(a.cliques.fechar).toBe(1);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:anexoFalhou', codigo: 'botao_enviar_ausente' });
    aviso.mockRestore();
  });

  it('o clique abriu "Programar mensagem": fecha o diálogo e a prévia sem programar, evento abriu_programar', async () => {
    const { eventos, emitir } = montar('abre_programar');
    await colar(true, emitir);
    await avancar(9000);
    expect(a.dialogoProgramar()).toBeNull();
    expect(a.previa()).toBeNull();
    expect(a.cliques.programar).toBe(0);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:anexoFalhou', codigo: 'abriu_programar', fechou: true });
    expect(document.querySelector('[data-id^="true_MIDIA"]')).toBeNull();
  });

  it('o atendente digitou legenda na prévia durante a janela: a reconferência veta e nada é clicado', async () => {
    const { eventos, emitir } = montar('normal');
    await colar(true, emitir);
    a.previa()!.querySelector<HTMLElement>('[contenteditable]')!.textContent = 'oi';
    await avancar(8000);
    expect(a.cliques.enviar).toBe(0);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:anexoFalhou', codigo: 'reconferencia_falhou' });
  });

  it('a conversa mudou na janela: a reconferência veta', async () => {
    const { eventos, emitir } = montar('normal');
    await colar(true, emitir);
    f.trocarDeConversa('Outra Pessoa');
    await avancar(8000);
    expect(a.cliques.enviar).toBe(0);
    expect(eventos[0]).toMatchObject({ tipo: 'vitaZap:anexoFalhou', codigo: 'reconferencia_falhou' });
  });
});

describe('diagnóstico e fechamento', () => {
  it('diagnosticarRodape lista também os botões da prévia aberta (aceito/descartado), sem texto de mensagem', async () => {
    const { emitir } = montar('enviar_e_programar');
    f.adicionarMensagem({ id: 'S1', texto: 'segredo da conversa', minha: true });
    await colar(false, emitir);
    const texto = diagnosticarRodape(document).join('\n');
    expect(texto).toContain('Prévia de mídia aberta:');
    expect(texto).toMatch(/prévia botão \d+: aria-label="Enviar".*=> aceito/);
    expect(texto).toMatch(/prévia botão \d+: aria-label="Programar mensagem".*=> negativa:/);
    expect(texto).not.toContain('segredo');
  });

  it('sem prévia aberta o diagnóstico é o do rodapé', () => {
    montar('normal');
    expect(diagnosticarRodape(document).join('\n')).not.toContain('Prévia de mídia');
  });

  it('fecharPreviaDeMidia usa só o X; sem X não clica em outro botão', async () => {
    const { emitir } = montar('sem_x');
    await colar(false, emitir);
    expect(await fecharPreviaDeMidia(document)).toBe(false);
    expect(a.cliques).toEqual({ enviar: 0, programar: 0, fechar: 0 });
  });
});
