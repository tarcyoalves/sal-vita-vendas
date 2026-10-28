// @vitest-environment jsdom
//
// Conversa individual exige SINAL POSITIVO (0.7.22). Sem JID no data-id (WhatsApp de 10/2026 usa hashes), "tem
// mensagens" não basta: individual quando não há sinal de grupo E (os autores das mensagens recebidas, lidos do
// data-pre-plain-text, são só o título, OU só há mensagens minhas). Na dúvida: `desconhecido` (não cola).
// ⚠️ HTML sintético: a validação no WhatsApp real é manual (README, seção 6).

import { describe, expect, it, vi } from 'vitest';
import { abrirEColar, classificarConversa, pararObservacao } from '../src/content/execucao';
import { lerLinha, linhaPareceGrupo } from '../src/content/extrair';
import { montarEnvioFalso } from './ajuda/whatsapp-envio-falso';

const HASH = 'ACEF999B99FB9999E9F99CC999999DF9';

interface Cab {
  titulo: string;
  sub?: string;
  icone?: boolean;
}
const msg = (id: string, opcoes: { autor?: string; minha?: boolean; elementoDeAutor?: boolean } = {}) =>
  `<div data-id="${id}" class="${opcoes.minha ? 'message-out' : 'message-in'}">${opcoes.elementoDeAutor ? `<span data-testid="author">${opcoes.autor}</span>` : ''}<div class="copyable-text"${
    opcoes.autor ? ` data-pre-plain-text="[10:30, 26/10/2026] ${opcoes.autor}: "` : ''
  }><span class="selectable-text"><span>texto</span></span></div></div>`;

function conversa(cab: Cab, mensagens: string[]): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = `<main id="main"><header>${cab.icone ? '<span data-icon="default-group"></span>' : ''}<div><span dir="auto" title="${cab.titulo}">${cab.titulo}</span></div>${
    cab.sub ? `<div><span>${cab.sub}</span></div>` : ''
  }</header>${mensagens.join('')}</main>`;
  return el;
}
const classificar = (cab: Cab, mensagens: string[], ids: string[] = mensagens.map((_, i) => `${HASH}${i}`)) => classificarConversa(ids, conversa(cab, mensagens));

describe('sem JID: individual exige sinal positivo', () => {
  it('todas as mensagens recebidas têm como autor o título → individual', () => {
    expect(classificar({ titulo: 'Ana Cliente', sub: 'online' }, [msg('a', { autor: 'Ana Cliente' }), msg('b', { autor: 'Ana Cliente' }), msg('c', { minha: true })])).toBe('individual');
  });

  it('só há mensagens minhas (e nenhum sinal de grupo) → individual', () => {
    expect(classificar({ titulo: 'Ana Cliente' }, [msg('a', { minha: true }), msg('b', { minha: true })])).toBe('individual');
  });

  it('"tem mensagens" NÃO basta: se todas as recebidas são sem autor legível (mídia, figurinha) → desconhecido', () => {
    expect(classificar({ titulo: 'Ana Cliente' }, [msg('a')])).toBe('desconhecido');
  });

  it('recebida com autor legível + mídia/anexo sem autor → individual (anexo de cliente não quebra classificação)', () => {
    expect(classificar({ titulo: 'Ana Cliente' }, [msg('a', { autor: 'Ana Cliente' }), msg('b')])).toBe('individual');
    // Caso real: título truncado com reticências no cabeçalho ("Victor Luan Cliente ...") e anexo
    expect(classificar({ titulo: 'Victor Luan Cliente ...' }, [msg('a', { autor: 'Victor Luan Cliente Bom Repouso Mg' }), msg('b')])).toBe('individual');
  });

  it('sem mensagem mas aceitaSemMensagens (contato da agenda recém-aberto) → individual', () => {
    expect(classificarConversa([], conversa({ titulo: 'Ismael Roberto' }, []), undefined, false, true)).toBe('individual');
    expect(classificarConversa([], conversa({ titulo: 'Grupo Amigos' }, []), undefined, false, true)).toBe('desconhecido');
  });

  it('sem nenhuma mensagem, ou sem título → desconhecido', () => {
    expect(classificar({ titulo: 'Ana Cliente' }, [], [])).toBe('desconhecido');
    expect(classificar({ titulo: '' }, [msg('a', { minha: true })])).toBe('desconhecido');
  });

  it('título com palavra de grupo ("Grupo", "Canal", "Comunidade") nunca vira individual sem JID', () => {
    for (const titulo of ['Grupo Vendas', 'Canal Sal Vita', 'Comunidade Mossoró']) {
      expect(classificar({ titulo }, [msg('a', { minha: true })]), titulo).toBe('desconhecido');
    }
  });

  it('mais de um autor do outro lado → grupo', () => {
    expect(classificar({ titulo: 'Equipe' }, [msg('a', { autor: 'Ana' }), msg('b', { autor: 'Pedro' })])).toBe('grupo');
  });

  it('autor diferente do título → grupo', () => {
    expect(classificar({ titulo: 'Ana Cliente' }, [msg('a', { autor: 'Pedro Souza' })])).toBe('grupo');
  });

  it('elemento de autor dentro da mensagem (só existe em grupo) → grupo, mesmo com autor = título', () => {
    expect(classificar({ titulo: 'Ana Cliente' }, [msg('a', { autor: 'Ana Cliente', elementoDeAutor: true })])).toBe('grupo');
  });

  it('ícone default-group ou default-community no cabeçalho → grupo, mesmo só com mensagens minhas', () => {
    expect(classificar({ titulo: 'Ana Cliente', icone: true }, [msg('a', { minha: true })])).toBe('grupo');
    const el = conversa({ titulo: 'Ana Cliente' }, [msg('a', { minha: true })]);
    el.querySelector('header')!.insertAdjacentHTML('afterbegin', '<svg><title>default-community</title></svg>');
    expect(classificarConversa([`${HASH}0`], el)).toBe('grupo');
  });

  it('subtítulo do cabeçalho: lista de nomes, "participantes" ou "clique para dados do grupo" → grupo', () => {
    for (const sub of ['Você, Ana, Pedro', 'Ana, Pedro, Carlos', '5 participantes', 'clique para dados do grupo', 'Click here for group info']) {
      expect(classificar({ titulo: 'Ana Cliente', sub }, [msg('a', { minha: true })]), sub).toBe('grupo');
    }
  });

  it('subtítulo de presença de contato ("online", "visto por último hoje, às 10:30") não é sinal de grupo', () => {
    for (const sub of ['online', 'visto por último hoje, às 10:30', 'last seen yesterday at 10:30', 'digitando...']) {
      expect(classificar({ titulo: 'Ana Cliente', sub }, [msg('a', { minha: true })]), sub).toBe('individual');
    }
  });
});

describe('com JID continua valendo, mas sinal de grupo vence', () => {
  it('JID individual puro → individual; @g.us/@broadcast/@newsletter → grupo', () => {
    expect(classificarConversa(['false_558499990000@c.us_A'], conversa({ titulo: 'Ana' }, []))).toBe('individual');
    expect(classificarConversa(['true_123@lid_A'], conversa({ titulo: 'Ana' }, []))).toBe('individual');
    expect(classificarConversa(['false_120363@g.us_A'], conversa({ titulo: 'Ana' }, []))).toBe('grupo');
    expect(classificarConversa(['true_status@broadcast_A'], conversa({ titulo: 'Ana' }, []))).toBe('grupo');
  });

  it('JID individual mas ícone de grupo no cabeçalho ou autor na mensagem → grupo', () => {
    expect(classificarConversa(['false_558499990000@c.us_A'], conversa({ titulo: 'Ana', icone: true }, []))).toBe('grupo');
    expect(classificarConversa(['false_558499990000@c.us_A'], conversa({ titulo: 'Ana' }, [msg('false_558499990000@c.us_A', { autor: 'Ana', elementoDeAutor: true })]))).toBe('grupo');
  });
});

describe('a linha da lista também denuncia grupo', () => {
  const linha = (html: string): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('role', 'listitem');
    el.innerHTML = html;
    return el;
  };
  it('ícone default-group/community/broadcast (data-icon ou <title>) ou id @g.us/@broadcast/@newsletter', () => {
    const nome = '<span dir="auto" title="Equipe">Equipe</span>';
    expect(linhaPareceGrupo(linha(`<span data-icon="default-group"></span>${nome}`))).toBe(true);
    expect(linhaPareceGrupo(linha(`<svg><title>default-community</title></svg>${nome}`))).toBe(true);
    expect(linhaPareceGrupo(linha(`<div data-id="120363000@g.us">${nome}</div>`))).toBe(true);
    expect(linhaPareceGrupo(linha(`<div data-id="status@broadcast">${nome}</div>`))).toBe(true);
    expect(linhaPareceGrupo(linha(`<div data-id="558499990000@c.us">${nome}</div>`))).toBe(false);
    const lida = lerLinha(linha(`<div data-id="120363000@g.us"><div>${nome}<div>11:40</div></div></div>`));
    expect(lida.tipo === 'conversa' && lida.linha.pareceGrupo).toBe(true);
  });
});

describe('abrirEColar não cola sem sinal positivo', () => {
  it('conversa sem prova de ser individual → nao_confirmado, nada colado (e não fica observando)', async () => {
    vi.useFakeTimers();
    try {
      const f = montarEnvioFalso({ nome: 'Ana Cliente', mensagens: [{ id: 'R1', texto: 'oi' }] }); // recebida sem autor legível
      const p = abrirEColar('Ana Cliente', 'Oi Ana', () => undefined, false);
      await vi.advanceTimersByTimeAsync(4000);
      expect(await p).toMatchObject({ ok: false, codigo: 'nao_confirmado' });
      expect(f.textoDaCaixa()).toBe('');
    } finally {
      pararObservacao();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('linha da lista com ícone de grupo → grupo, a conversa nem é aberta', async () => {
    vi.useFakeTimers();
    try {
      const f = montarEnvioFalso({ nome: 'Equipe Vendas', iconeGrupoNaLinha: true, mensagens: [{ id: 'R1', texto: 'oi', autor: 'Equipe Vendas' }] });
      const p = abrirEColar('Equipe Vendas', 'Oi', () => undefined, false);
      await vi.advanceTimersByTimeAsync(4000);
      expect(await p).toMatchObject({ ok: false, codigo: 'grupo' });
      expect(f.main().querySelector('header')).toBeNull(); // nada foi aberto
    } finally {
      pararObservacao();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe('0.7.28: envio automático usa a regra estrita', () => {
  const estrito = (cab: Cab, mensagens: string[]) =>
    classificarConversa(mensagens.map((_, i) => `${HASH}${i}`), conversa(cab, mensagens), undefined, true);
  it('recebida sem autor legível → desconhecido (não envia sozinho)', () => {
    expect(estrito({ titulo: 'Ana Cliente' }, [msg('a', { autor: 'Ana Cliente' }), msg('b')])).toBe('desconhecido');
  });
  it('autor contido no título não basta ("Ana" em "Ana e Equipe") → grupo', () => {
    expect(estrito({ titulo: 'Ana e Equipe' }, [msg('a', { autor: 'Ana' })])).toBe('grupo');
    expect(classificar({ titulo: 'Ana e Equipe' }, [msg('a', { autor: 'Ana' })])).toBe('grupo');
  });
  it('autor igual ao título → individual também no estrito', () => {
    expect(estrito({ titulo: 'Ana Cliente' }, [msg('a', { autor: 'Ana Cliente' }), msg('b', { minha: true })])).toBe('individual');
  });
});
