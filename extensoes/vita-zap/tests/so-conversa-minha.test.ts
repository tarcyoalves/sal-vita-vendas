// @vitest-environment jsdom
//
// "Só contatos com conversa já feita por mim (atendente)" (v0.7.21): campo marcado por padrão na aba Varredura.
// Entra quem tem QUALQUER sinal: (a) prévia da última mensagem na lista é minha, (b) está no histórico de envios,
// (c) tem registro do atendente no CRM da extensão. Quem não passa fica na prévia como excluído, com o motivo.
// ⚠️ HTML sintético: a validação no WhatsApp real é manual (README, seção 6).

import { beforeEach, describe, expect, it } from 'vitest';
import { lerLinha, ultimaDeMimDaLinha } from '../src/content/extrair';
import { deduplicarLinhas, linhasParaContatos, type ContatoVarrido } from '../src/shared/contatos';
import { aplicarFiltros, avaliarContato, falouComOContato, FILTROS_PADRAO, MOTIVO_SEM_MENSAGEM_MINHA, temRegistroDoAtendente, ultimoEnvioPorChave, type ContextoFiltro, type Filtros } from '../src/shared/filtros';
import { chaveContato } from '../src/shared/nomes';
import { lerSoComConversaMinha, salvarSoComConversaMinha } from '../src/sidepanel/preferencias';

const AGORA = new Date('2026-10-26T15:00:00Z');

function linha(html: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'listitem');
  el.innerHTML = html;
  return el;
}
const base = (nome: string, data: string, previaHtml: string, extra = '') =>
  `<div><div><span dir="auto" title="${nome}">${nome}</span></div><div>${data}</div></div><div>${extra}${previaHtml}</div>`;
const previa = (t: string) => `<span title="${t}"><span>${t}</span></span>`;
const minhaDaLinha = (el: HTMLElement): boolean | null | undefined => {
  const r = lerLinha(el);
  return r.tipo === 'conversa' ? r.linha.ultimaDeMim : undefined;
};

describe('(a) a prévia da última mensagem na linha é minha', () => {
  it('ícone antigo data-icon (msg-check, msg-dblcheck, msg-dblcheck-ack, msg-time)', () => {
    for (const icone of ['msg-check', 'msg-dblcheck', 'msg-dblcheck-ack', 'msg-time']) {
      expect(minhaDaLinha(linha(base('Ana', '11:40', previa('Obrigada!'), `<span data-icon="${icone}"></span>`)))).toBe(true);
    }
  });

  it('ícone novo <svg><title> (wds-ic-read, wds-ic-delivered, ic-msg-check)', () => {
    for (const t of ['wds-ic-read', 'wds-ic-delivered', 'ic-msg-check']) {
      expect(minhaDaLinha(linha(base('Ana', '11:40', previa('Obrigada!'), `<span><svg><title>${t}</title></svg></span>`)))).toBe(true);
    }
  });

  it('prefixo "Você:" (junto ou em span separado do texto) e "You:"', () => {
    expect(minhaDaLinha(linha(base('Grupo Cliente', '11:40', previa('Você: bom dia'))))).toBe(true);
    expect(minhaDaLinha(linha(base('Ana', '11:40', '<span>Você:</span><span title="bom dia"><span>bom dia</span></span>')))).toBe(true);
    expect(minhaDaLinha(linha(base('Ana', '11:40', previa('You: hello'))))).toBe(true);
  });

  it('mensagem do cliente (sem ícone nem "Você:") não conta', () => {
    expect(minhaDaLinha(linha(base('Ana', '11:40', previa('Quanto fica o saco?'))))).toBe(false);
    expect(ultimaDeMimDaLinha(linha(base('Ana', '11:40', previa('Você precisa de sal?'))), document.createElement('span'))).toBe(false); // "Você" sem os dois pontos
  });

  it('selo de não lida: o cliente falou por último', () => {
    expect(minhaDaLinha(linha(base('Ana', '11:40', previa('oi'), '<span aria-label="2 mensagens não lidas"><span>2</span></span>')))).toBe(false);
  });

  it('contato da agenda sem prévia: não dá para saber (null)', () => {
    expect(minhaDaLinha(linha('<div><span dir="auto" title="Bia Cliente">Bia Cliente</span></div>'))).toBeNull();
  });

  it('o sinal vai da linha ao contato varrido (e a deduplicação não o perde)', () => {
    const l = (ultimaDeMim: boolean | null, posicao: number) => ({ nome: 'Ana Cliente', rotuloData: '11:40', posicao, pareceGrupo: false, ultimaDeMim });
    expect(linhasParaContatos([l(true, 0)], AGORA)[0].ultimaDeMim).toBe(true);
    expect(deduplicarLinhas([l(false, 0), l(true, 0)])[0].ultimaDeMim).toBe(true);
    expect(deduplicarLinhas([l(null, 0), l(false, 0)])[0].ultimaDeMim).toBe(false);
    // varredura antiga (sem o campo) continua válida
    expect('ultimaDeMim' in linhasParaContatos([{ nome: 'X Cliente', rotuloData: '11:40', posicao: 0, pareceGrupo: false }], AGORA)[0]).toBe(false);
  });
});

function contato(nome: string, p: Partial<ContatoVarrido> = {}): ContatoVarrido {
  return {
    chave: chaveContato(nome),
    nome,
    rotuloData: '10/09/2026',
    ultimaConversa: '2026-09-10',
    revisarData: null,
    soNumero: false,
    pareceGrupo: false,
    temConversa: true,
    duplicado: false,
    varridoEm: AGORA.toISOString(),
    ...p,
  };
}
const ctx = (p: Partial<ContextoFiltro> = {}): ContextoFiltro => ({ agora: AGORA, naoEnviar: new Set(), ultimoEnvioPorChave: new Map(), ...p });
const filtros = (p: Partial<Filtros> = {}): Filtros => ({ ...FILTROS_PADRAO, ...p });
const SO_MINHA = filtros({ soComMensagemMinha: true });

describe('filtro "só contatos com conversa já feita por mim"', () => {
  it('(a) a última mensagem da lista é minha: entra', () => {
    expect(avaliarContato(contato('Ana Cliente', { ultimaDeMim: true }), SO_MINHA, ctx()).situacao).toBe('incluido');
  });

  it('(b) está no histórico de envios da extensão (mesmo com a lista mostrando o cliente por último): entra', () => {
    const c = contato('Bia Cliente', { ultimaDeMim: false });
    const envios = ultimoEnvioPorChave([{ chave: c.chave, enviadoEm: '2026-08-01T12:00:00.000Z' }]);
    expect(avaliarContato(c, SO_MINHA, ctx({ ultimoEnvioPorChave: envios })).situacao).toBe('incluido');
  });

  it('(c) tem registro do atendente no CRM da extensão (nota, fase ou conversão): entra', () => {
    const c = contato('Caio Cliente', { ultimaDeMim: false });
    expect(avaliarContato(c, SO_MINHA, ctx({ comRegistroDoAtendente: new Set([c.chave]) })).situacao).toBe('incluido');
    expect(temRegistroDoAtendente({ notas: [{ id: '1', texto: 'x', criadaEm: 1 }], fase: undefined, convertidoEm: undefined })).toBe(true);
    expect(temRegistroDoAtendente({ notas: [], fase: 'orcamento', convertidoEm: undefined })).toBe(true);
    expect(temRegistroDoAtendente({ notas: [], fase: undefined, convertidoEm: 5 })).toBe(true);
    expect(temRegistroDoAtendente({ notas: [], fase: undefined, convertidoEm: undefined })).toBe(false);
  });

  it('nenhum sinal e cliente por último (ultimaDeMim: false): fica FORA, com o motivo visível', () => {
    const d = avaliarContato(contato('Duda Cliente', { ultimaDeMim: false }), SO_MINHA, ctx());
    expect(d).toEqual({ situacao: 'excluido', motivo: MOTIVO_SEM_MENSAGEM_MINHA });
    expect(MOTIVO_SEM_MENSAGEM_MINHA).toContain('sem mensagem sua');
  });

  it('contato legado da memória (sem ultimaDeMim / undefined): NÃO exclui como sem mensagem sua, entra em revisar', () => {
    for (const ultimaDeMim of [undefined, null]) {
      const d = avaliarContato(contato('Duda Cliente', { ultimaDeMim }), SO_MINHA, ctx());
      expect(d).toEqual({ situacao: 'revisar', motivo: 'sinal de conversa sua desconhecido — varra de novo' });
    }
  });

  it('desmarcado: volta ao comportamento atual (todos os que passam nos outros filtros)', () => {
    const c = contato('Duda Cliente', { ultimaDeMim: false });
    expect(avaliarContato(c, filtros(), ctx()).situacao).toBe('incluido');
    expect(avaliarContato(c, filtros({ soComMensagemMinha: false }), ctx()).situacao).toBe('incluido');
    expect(FILTROS_PADRAO.soComMensagemMinha).toBe(false);
  });

  it('também tira da lista "revisar" (data incerta) quem não tem sinal, mas não esconde outras exclusões', () => {
    const f = filtros({ soComMensagemMinha: true, ultimaConversaAntesDe: '2026-10-01' });
    const incerto = contato('Eva Cliente', { ultimaConversa: null, revisarData: 'sem data', ultimaDeMim: false });
    expect(avaliarContato(incerto, f, ctx()).motivo).toBe(MOTIVO_SEM_MENSAGEM_MINHA);
    expect(avaliarContato({ ...incerto, ultimaDeMim: true }, f, ctx()).situacao).toBe('revisar');
    // grupo continua com o motivo próprio
    expect(avaliarContato(contato('Grupo', { pareceGrupo: true }), SO_MINHA, ctx()).motivo).toMatch(/grupo/);
  });

  it('na prévia, os que não passam aparecem como excluídos (e o filtro desmarcado os devolve)', () => {
    const lista = [contato('Ana Cliente', { ultimaDeMim: true }), contato('Bia Cliente', { ultimaDeMim: false })];
    const com = aplicarFiltros(lista, SO_MINHA, ctx());
    expect(com.map((a) => [a.contato.nome, a.decisao.situacao])).toEqual([
      ['Ana Cliente', 'incluido'],
      ['Bia Cliente', 'excluido'],
    ]);
    const sem = aplicarFiltros(lista, filtros(), ctx());
    expect(sem.every((a) => a.decisao.situacao === 'incluido')).toBe(true);
  });

  it('falouComOContato: só os três sinais contam', () => {
    const c = contato('Fabi Cliente', { ultimaDeMim: false });
    expect(falouComOContato(c, ctx())).toBe(false);
    expect(falouComOContato({ ...c, ultimaDeMim: true }, ctx())).toBe(true);
  });
});

describe('preferência do campo', () => {
  beforeEach(() => localStorage.clear());

  it('vem marcada por padrão', () => {
    expect(lerSoComConversaMinha()).toBe(true);
  });

  it('persiste quando o usuário desmarca e marca de novo', () => {
    salvarSoComConversaMinha(false);
    expect(lerSoComConversaMinha()).toBe(false);
    salvarSoComConversaMinha(true);
    expect(lerSoComConversaMinha()).toBe(true);
  });
});
