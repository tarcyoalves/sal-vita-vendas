// @vitest-environment jsdom
//
// WhatsApp Web ATUAL (campo, 0.2.1): o data-id é só o id da mensagem ("3EB0285DB0862B7F92F1CA"),
// sem true_/false_ e sem JID. A direção vem de .message-in/.message-out e o autor de
// data-pre-plain-text. Conservador: na dúvida → desconhecido (não cola).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autorDoPrePlainText, classificarConversa, type SinaisDom } from '../src/content/chat';
import { abrirEColar, compararComFoto, pararObservacao } from '../src/content/execucao';
import { textoDoCampo } from '../src/content/dom';
import { type ContatoFalso, montarWhatsAppFalso } from './_whatsapp-falso';

const IDS_NOVOS = ['3A0013AD41F0BD7A7696', '3EB0285DB0862B7F92F1CA', '3EB0CBFF3FBC12342052C', '3EB057E8A7BDDF6BE0EF66'];

function sinais(parcial: Partial<SinaisDom> & { recebidas?: Array<string | null>; enviadas?: number }): SinaisDom {
  const recebidas = (parcial.recebidas ?? []).map((autor) => ({ sua: false, recebida: true, autor, temElementoAutor: false }));
  const enviadas = Array.from({ length: parcial.enviadas ?? 0 }, () => ({ sua: true, recebida: false, autor: null, temElementoAutor: false }));
  return { titulo: parcial.titulo ?? 'Sal Vita Hermes', iconeGrupoNoCabecalho: parcial.iconeGrupoNoCabecalho ?? false, mensagens: parcial.mensagens ?? [...recebidas, ...enviadas] };
}

describe('autorDoPrePlainText', () => {
  it('lê o autor do formato "[hh:mm, dd/mm/aaaa] Autor: "', () => {
    expect(autorDoPrePlainText('[10:00, 19/10/2026] Sal Vita Hermes: ')).toBe('Sal Vita Hermes');
    expect(autorDoPrePlainText('[10:00, 19/10/2026] João: Silva: ')).toBe('João: Silva');
    expect(autorDoPrePlainText('texto qualquer')).toBeNull();
    expect(autorDoPrePlainText('[10:00, 19/10/2026] : ')).toBeNull();
  });
});

describe('classificarConversa — ids sem JID (formato atual)', () => {
  it('ids novos sozinhos continuam desconhecidos (sem sinais do DOM)', () => {
    expect(classificarConversa(IDS_NOVOS)).toBe('desconhecido');
  });

  it('individual: todo autor recebido é o título (ignora maiúsculas/espaços)', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Sal Vita Hermes', ' sal  vita hermes '], enviadas: 1 }))).toBe('individual');
  });

  it('individual: só mensagens suas e sem ícone de grupo', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ enviadas: 2 }))).toBe('individual');
  });

  it('desconhecido: nenhuma mensagem identificada', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({}))).toBe('desconhecido');
  });

  it('individual: nenhum autor legível (linhas virtualizadas) e sem sinal de grupo — risco residual no README', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: [null, null], enviadas: 1 }))).toBe('individual');
  });

  it('individual: 2 autores (eu e o contato), um deles igual ao título', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Tarcyo', 'Sal Vita Hermes', 'Tarcyo'] }))).toBe('individual');
  });

  it('grupo: 2 autores distintos e nenhum igual ao título', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Ana', 'Bia'], titulo: 'Equipe' }))).toBe('grupo');
  });

  it('grupo: mais de 2 autores distintos, mesmo com um igual ao título', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Tarcyo', 'Sal Vita Hermes', 'Carla'] }))).toBe('grupo');
  });

  it('desconhecido: 1 autor diferente do título (pode ser eu ou outro membro)', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Tarcyo'] }))).toBe('desconhecido');
  });

  it('grupo: ícone de grupo no cabeçalho', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Sal Vita Hermes'], iconeGrupoNoCabecalho: true }))).toBe('grupo');
  });

  it('grupo: autores diferentes entre si', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Ana', 'Bia'], titulo: 'Equipe' }))).toBe('grupo');
  });

  it('autor diferente do título sozinho não é nem grupo nem individual', () => {
    expect(classificarConversa(IDS_NOVOS, sinais({ recebidas: ['Ana'], titulo: 'Equipe' }))).toBe('desconhecido');
  });

  it('grupo: elemento de nome de autor dentro de mensagem recebida', () => {
    const s = sinais({ enviadas: 1 });
    s.mensagens.push({ sua: false, recebida: true, autor: 'Sal Vita Hermes', temElementoAutor: true });
    expect(classificarConversa(IDS_NOVOS, s)).toBe('grupo');
  });

  it('formato antigo com JID continua valendo, e JID de grupo vence qualquer sinal', () => {
    expect(classificarConversa(['false_558499990000@c.us_3EB0AA'])).toBe('individual');
    expect(classificarConversa(['false_558499990000@c.us_3EB0AA'], sinais({}))).toBe('individual');
    expect(classificarConversa(['false_1203@g.us_A_5584@c.us'], sinais({ recebidas: ['Sal Vita Hermes'] }))).toBe('grupo');
    expect(classificarConversa(['false_558499990000@c.us_A'], sinais({ iconeGrupoNoCabecalho: true }))).toBe('grupo');
  });
});

const HERMES: ContatoFalso = { nome: 'Sal Vita Hermes', jid: '5584111@c.us', formato: 'novo' };

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

describe('abrirEColar contra o WhatsApp falso no formato atual', () => {
  it('conversa individual (autor = título): cola, e percebe o Enter com mensagem .message-out', async () => {
    const w = montarWhatsAppFalso([HERMES]);
    const c = cb();
    const r = await rodar(abrirEColar(HERMES.nome, 'Oi Hermes', c));
    expect(r.ok).toBe(true);
    expect(textoDoCampo(w.caixa)).toBe('Oi Hermes');
    expect(w.idsDasMensagens().every((id) => !/^(true|false)_/.test(id))).toBe(true);
    w.enviarComoUsuario('Oi Hermes');
    await vi.advanceTimersByTimeAsync(1000);
    expect(c.aoDetectarEnvio).toHaveBeenCalledWith('Oi Hermes', true, null);
  });

  it('conversa só com mensagens suas e sem ícone de grupo: individual', async () => {
    const w = montarWhatsAppFalso([{ ...HERMES, semRecebidas: true }]);
    w.abrir({ ...HERMES, semRecebidas: true });
    w.enviarComoUsuario('antiga');
    const r = await rodar(abrirEColar(HERMES.nome, 'Oi', cb()));
    expect(r.ok).toBe(true);
  });

  it('mensagem recebida (.message-in) nova não é tratada como envio', async () => {
    const w = montarWhatsAppFalso([HERMES]);
    const c = cb();
    await rodar(abrirEColar(HERMES.nome, 'Oi Hermes', c));
    w.mensagens.insertAdjacentHTML('beforeend', '<div data-id="3EB0RECEBIDA1"><div class="message-in"><div class="copyable-text" data-pre-plain-text="[10:05, 19/10/2026] Sal Vita Hermes: "><span class="selectable-text"><span>oi</span></span></div></div></div>');
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.aoDetectarEnvio).not.toHaveBeenCalled();
  });

  it('a foto de data-ids (ids únicos sem prefixo) detecta mensagem nova depois de colar', async () => {
    const w = montarWhatsAppFalso([HERMES]);
    const r = await rodar(abrirEColar(HERMES.nome, 'Oi', cb()));
    const foto = r.ok ? (r.foto ?? []) : [];
    expect(foto).toHaveLength(2);
    expect(compararComFoto(foto)).toEqual({ estado: 'nenhuma' });
    w.enviarComoUsuario('Oi');
    expect(compararComFoto(foto)).toMatchObject({ estado: 'nova', texto: 'Oi' });
  });

  it('grupo: ícone no cabeçalho → grupo, nada é colado', async () => {
    const g: ContatoFalso = { ...HERMES, nome: 'Equipe', jid: '1203@g.us', iconeGrupoNoCabecalho: true };
    const w = montarWhatsAppFalso([g]);
    const r = await rodar(abrirEColar('Equipe', 'Oi', cb()));
    expect(r).toMatchObject({ ok: false, codigo: 'grupo' });
    expect(textoDoCampo(w.caixa)).toBe('');
  });

  it('grupo: autores diferentes nas recebidas → grupo', async () => {
    const g: ContatoFalso = { ...HERMES, nome: 'Equipe', jid: '1203@x', autores: ['Ana', 'Bia'] };
    montarWhatsAppFalso([g]);
    expect(await rodar(abrirEColar('Equipe', 'Oi', cb()))).toMatchObject({ ok: false, codigo: 'grupo' });
  });

  it('grupo: elemento de autor dentro da mensagem recebida → grupo', async () => {
    const g: ContatoFalso = { ...HERMES, autorEmElemento: true };
    montarWhatsAppFalso([g]);
    expect(await rodar(abrirEColar(HERMES.nome, 'Oi', cb()))).toMatchObject({ ok: false, codigo: 'grupo' });
  });

  it('autor diferente do título (não dá para confirmar) → recusa sem colar', async () => {
    const g: ContatoFalso = { ...HERMES, autores: ['Outro Nome'] };
    const w = montarWhatsAppFalso([g]);
    const r = await rodar(abrirEColar(HERMES.nome, 'Oi', cb()));
    expect(r.ok).toBe(false);
    expect(textoDoCampo(w.caixa)).toBe('');
  });
});
