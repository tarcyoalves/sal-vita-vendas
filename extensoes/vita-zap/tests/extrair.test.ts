// @vitest-environment jsdom
//
// ⚠️ HTML SINTÉTICO, escrito à mão imitando a estrutura esperada do WhatsApp Web. Não é uma
// cópia do HTML real (não houve acesso a ele). Testa a LÓGICA de leitura; os seletores reais
// só são validados pelo checklist manual do README.

import { describe, expect, it } from 'vitest';
import { lerConversasVisiveis, lerLinha, posicaoDaLinha } from '../src/content/extrair';
import { classificarConversa } from '../src/content/execucao';

function linha(html: string, y: number | null): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'listitem');
  if (y != null) el.style.transform = `translateY(${y}px)`;
  el.innerHTML = html;
  return el;
}

const conversa = (nome: string, data: string, previa = 'Bom dia', extra = '') =>
  `<div><div><span dir="auto" title="${nome}">${nome}</span></div><div>${data}</div></div>
   <div><span title="${previa}"><span>${previa}</span></span>${extra}</div>`;

describe('lerLinha (HTML sintético)', () => {
  it('lê nome, data e posição', () => {
    const r = lerLinha(linha(conversa('João CLIENTE', 'Ontem'), 144));
    expect(r).toEqual({ tipo: 'conversa', linha: { nome: 'João CLIENTE', rotuloData: 'Ontem', posicao: 144, pareceGrupo: false } });
  });

  it('não confunde texto da prévia com data', () => {
    const r = lerLinha(linha(conversa('Ana', '17/09/2026', 'chego 14:30'), 0));
    expect(r.tipo === 'conversa' && r.linha.rotuloData).toBe('17/09/2026');
  });

  it('linha de contato sem conversa não tem data', () => {
    const el = linha('<div><span dir="auto" title="Bia CLIENTE">Bia CLIENTE</span></div><div><span title="Disponível">Disponível</span></div>', 0);
    const r = lerLinha(el);
    expect(r.tipo === 'conversa' && r.linha.rotuloData).toBeNull();
  });

  it('marca grupo pelo ícone padrão', () => {
    const r = lerLinha(linha(conversa('Clientes Sal', '10:00', 'oi', '<span data-icon="default-group"></span>'), 0));
    expect(r.tipo === 'conversa' && r.linha.pareceGrupo).toBe(true);
  });

  it('cabeçalho de seção "Contatos" é reconhecido', () => {
    expect(lerLinha(linha('<div>Contatos</div>', 300))).toEqual({ tipo: 'secaoSemConversa', texto: 'contatos' });
    expect(lerLinha(linha('<div>Conversas</div>', 0))).toEqual({ tipo: 'ignorar' });
  });

  it('posição sobe até o ancestral com transform', () => {
    const pai = document.createElement('div');
    pai.style.transform = 'translateY(72px)';
    const filho = document.createElement('div');
    pai.appendChild(filho);
    expect(posicaoDaLinha(filho)).toBe(72);
    expect(posicaoDaLinha(document.createElement('div'))).toBeNull();
  });
});

describe('lerConversasVisiveis', () => {
  it('ordena pela posição e corta tudo abaixo de "Contatos"', () => {
    const els = [
      linha(conversa('Bia CLIENTE', '10:00'), 144),
      linha('<div>Contatos</div>', 216),
      linha(conversa('Ana CLIENTE', 'Ontem'), 72),
      linha('<div><span dir="auto" title="Caio CLIENTE">Caio CLIENTE</span></div>', 288),
    ];
    const r = lerConversasVisiveis(els);
    expect(r.achouSecaoSemConversa).toBe(true);
    expect(r.conversas.map((c) => c.linha.nome)).toEqual(['Ana CLIENTE', 'Bia CLIENTE']);
  });
});

describe('classificarConversa (data-id das mensagens)', () => {
  it('individual, grupo, transmissão, canal e desconhecido', () => {
    expect(classificarConversa(['false_558499990000@c.us_3EB0AA', 'true_558499990000@c.us_3EB0BB'])).toBe('individual');
    expect(classificarConversa(['true_123456789@lid_ABC'])).toBe('individual');
    expect(classificarConversa(['false_120363000000@g.us_ABC_558499990000@c.us'])).toBe('grupo');
    expect(classificarConversa(['true_status@broadcast_ABC'])).toBe('grupo');
    expect(classificarConversa(['false_1203630@newsletter_ABC'])).toBe('grupo');
    expect(classificarConversa([])).toBe('desconhecido');
    expect(classificarConversa(['abc'])).toBe('desconhecido');
  });

  it('qualquer sinal de grupo vence', () => {
    expect(classificarConversa(['true_558499990000@c.us_A', 'false_120363@g.us_B_5584@c.us'])).toBe('grupo');
  });
});
