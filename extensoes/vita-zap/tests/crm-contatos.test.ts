// Identidade do contato (id interno x nome x telefone), vínculo, notas, etiquetas com cor e fase.

import { describe, expect, it } from 'vitest';
import {
  acharContato,
  adicionarNota,
  alternarEtiqueta,
  aliasDoNome,
  criarEtiqueta,
  definirFase,
  dispensarContato,
  editarNota,
  excluirEtiqueta,
  excluirNota,
  garantirContato,
  opcoesDeFiltro,
  reativarContato,
  registrarUltimoContatoEm,
  renomearEtiqueta,
  vincularContato,
} from '../src/shared/crm-contatos';
import { dadosVazios } from '../src/shared/crm-store';
import { contato } from './ajuda/fabrica';

const T = 1_700_000_000_000;

describe('achar e criar contatos', () => {
  it('cria com id interno que não é o nome, guardando nome e telefone normalizado', () => {
    const d = dadosVazios();
    const c = garantirContato(d, { nome: 'Ana Souza', telefone: '(84) 99999-0000' }, T);
    expect(c.id).not.toContain('ana');
    expect(c).toMatchObject({ nome: 'Ana Souza', telefone: '5584999990000', aliases: ['ana souza'] });
    expect(d.contatos[c.id]).toBe(c);
  });

  it('acha pelo id, pelo telefone ou pelo nome', () => {
    const d = dadosVazios();
    const c = garantirContato(d, { nome: 'Ana Souza', telefone: '5584999990000' }, T);
    expect(acharContato(d, { nome: 'qualquer coisa', contatoId: c.id })?.id).toBe(c.id);
    expect(acharContato(d, { nome: 'Aninha', telefone: '+55 84 99999-0000' })?.id).toBe(c.id); // nome mudou, telefone igual
    expect(acharContato(d, { nome: 'ANA  souza' })?.id).toBe(c.id); // só o nome (sem acento/caixa)
    expect(acharContato(d, { nome: 'Outra Pessoa' })).toBeUndefined();
  });

  it('o mesmo nome com telefones diferentes são pessoas diferentes', () => {
    const d = dadosVazios();
    const a = garantirContato(d, { nome: 'Carlos', telefone: '84 99999-0001' }, T);
    const b = garantirContato(d, { nome: 'Carlos', telefone: '84 99999-0002' }, T + 1);
    expect(b.id).not.toBe(a.id);
    expect(Object.keys(d.contatos)).toHaveLength(2);
    expect(acharContato(d, { nome: 'Carlos', telefone: '84 99999-0001' })?.id).toBe(a.id);
  });

  it('descobrir o telefone de um contato que só tinha nome grava o telefone no mesmo registro', () => {
    const d = dadosVazios();
    const c = garantirContato(d, { nome: 'Ana Souza' }, T);
    const de = garantirContato(d, { nome: 'Ana Souza', telefone: '5584999990000' }, T + 1);
    expect(de.id).toBe(c.id);
    expect(c.telefone).toBe('5584999990000');
  });

  it('contato salvo só com número no nome: o nome vira alias de telefone, não de nome', () => {
    const d = dadosVazios();
    const c = garantirContato(d, { nome: '+55 84 99999-0000' }, T);
    expect(c).toMatchObject({ telefone: '5584999990000', aliases: [] });
    expect(aliasDoNome('+55 84 99999-0000')).toBeNull();
    // depois que o usuário salva o contato com nome, o mesmo registro ganha o nome
    const salvo = garantirContato(d, { nome: 'Maria Lima', telefone: '5584999990000' }, T + 5);
    expect(salvo.id).toBe(c.id);
    expect(salvo).toMatchObject({ nome: 'Maria Lima', aliases: ['maria lima'] });
  });

  it('achou o telefone em outro registro: junta os dois (mesma pessoa)', () => {
    const d = dadosVazios();
    const porNome = garantirContato(d, { nome: 'Ana' }, T);
    adicionarNota(porNome, 'Nota do registro por nome', T);
    const porTelefone = garantirContato(d, { nome: '+55 84 99999-0000' }, T + 1);
    alternarEtiqueta(porTelefone, 'e1', T + 1);
    const r = garantirContato(d, { nome: 'Ana', telefone: '5584999990000', contatoId: porNome.id }, T + 2);
    expect(Object.keys(d.contatos)).toHaveLength(1);
    expect(r.id).toBe(porNome.id);
    expect(r).toMatchObject({ telefone: '5584999990000', etiquetas: ['e1'] });
    expect(r.notas).toHaveLength(1);
  });
});

describe('vincular', () => {
  it('a outro contato: notas, etiquetas, aliases e lembretes passam para o contato que fica', () => {
    const d = dadosVazios();
    const a = contato('Ana', { telefone: '5584999990000', fase: 'novo' });
    const b = contato('Aninha', { etiquetas: ['e1'], notas: [{ id: 'n1', texto: 'x', criadaEm: 5 }], fase: 'fechado', convertidoEm: 9, ultimoContatoEm: 50 });
    d.contatos[a.id] = a;
    d.contatos[b.id] = b;
    d.lembretes = [{ id: 'l', contatoId: b.id, nome: 'Aninha', venceEm: 1, criadoEm: 1, status: 'pendente' }];
    const r = vincularContato(d, a.id, { contatoId: b.id }, T);
    expect('contato' in r && r.contato.id).toBe(a.id);
    expect(Object.keys(d.contatos)).toEqual([a.id]);
    expect(a).toMatchObject({ etiquetas: ['e1'], fase: 'novo', convertidoEm: 9, ultimoContatoEm: 50 });
    expect(a.aliases.sort()).toEqual(['ana', 'aninha']);
    expect(a.notas).toHaveLength(1);
    expect(d.lembretes[0].contatoId).toBe(a.id);
  });

  it('a um telefone: grava normalizado; se já era de outro contato, junta; telefone inválido é recusado', () => {
    const d = dadosVazios();
    const a = contato('Ana');
    const b = contato('Ana Souza', { telefone: '5584999990000' });
    d.contatos[a.id] = a;
    d.contatos[b.id] = b;
    expect(vincularContato(d, a.id, { telefone: '123' }, T)).toEqual({ erro: 'Telefone inválido. Use DDD + número (ex.: 84 99999-0000).' });
    const r = vincularContato(d, a.id, { telefone: '(84) 99999-0000' }, T);
    expect('contato' in r && r.contato.telefone).toBe('5584999990000');
    expect(Object.keys(d.contatos)).toEqual([a.id]);
  });

  it('a outro nome: vira alias', () => {
    const d = dadosVazios();
    const a = contato('Ana');
    d.contatos[a.id] = a;
    vincularContato(d, a.id, { nome: 'Dona Ana (loja)' }, T);
    expect(acharContato(d, { nome: 'dona ana (loja)' })?.id).toBe(a.id);
    expect(vincularContato(d, a.id, { nome: '  ' }, T)).toEqual({ erro: 'Informe um nome.' });
    expect(vincularContato(d, 'nao-existe', { nome: 'x' }, T)).toEqual({ erro: 'Contato não encontrado.' });
  });
});

describe('notas', () => {
  it('adiciona (a mais nova primeiro), edita e exclui', () => {
    const c = contato('Ana');
    expect(adicionarNota(c, '   ', T)).toMatch(/Escreva/);
    expect(adicionarNota(c, 'Preço: R$ 38 o saco', T, 'n1')).toBeNull();
    expect(adicionarNota(c, 'Quer entrega na sexta', T + 1000, 'n2')).toBeNull();
    expect(c.notas.map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(editarNota(c, 'n1', 'Preço: R$ 40 o saco', T + 2000)).toBeNull();
    expect(c.notas[1]).toMatchObject({ texto: 'Preço: R$ 40 o saco', editadaEm: T + 2000 });
    expect(editarNota(c, 'n1', '', T)).toMatch(/vazia/);
    expect(editarNota(c, 'nada', 'x', T)).toMatch(/não encontrada/);
    excluirNota(c, 'n2', T + 3000);
    expect(c.notas.map((n) => n.id)).toEqual(['n1']);
  });

  it('limita o tamanho da nota', () => {
    expect(adicionarNota(contato('Ana'), 'x'.repeat(2001), T)).toMatch(/2000/);
  });
});

describe('etiquetas com cor', () => {
  it('cria, recusa nome vazio e repetido (sem diferenciar maiúscula/acento)', () => {
    const d = dadosVazios();
    expect('erro' in criarEtiqueta(d, '  ', '#00a884')).toBe(true);
    expect(criarEtiqueta(d, 'Cliente fiel', '#8e24aa', 'e1')).toEqual({ etiqueta: { id: 'e1', nome: 'Cliente fiel', cor: '#8e24aa' } });
    expect(criarEtiqueta(d, 'CLIENTE FIEL', '#00a884')).toEqual({ erro: 'Já existe uma etiqueta com esse nome.' });
    expect(criarEtiqueta(d, 'Orçamento enviado', 'cor-invalida', 'e2')).toMatchObject({ etiqueta: { cor: '#00a884' } });
    expect(d.etiquetas).toHaveLength(2);
  });

  it('liga e desliga no contato', () => {
    const c = contato('Ana');
    expect(alternarEtiqueta(c, 'e1', T)).toBe(true);
    expect(c.etiquetas).toEqual(['e1']);
    expect(alternarEtiqueta(c, 'e1', T)).toBe(false);
    expect(c.etiquetas).toEqual([]);
  });

  it('excluir a etiqueta tira de todos os contatos e do filtro salvo', () => {
    const d = dadosVazios();
    criarEtiqueta(d, 'Quente', '#c62828', 'e1');
    const c = contato('Ana', { etiquetas: ['e1'] });
    d.contatos[c.id] = c;
    d.config.filtroEtiquetas = ['e1', 'fase:novo'];
    excluirEtiqueta(d, 'e1');
    expect(d.etiquetas).toEqual([]);
    expect(c.etiquetas).toEqual([]);
    expect(d.config.filtroEtiquetas).toEqual(['fase:novo']);
  });

  it('renomear mantém o nome único', () => {
    const d = dadosVazios();
    criarEtiqueta(d, 'Quente', '#c62828', 'e1');
    criarEtiqueta(d, 'Frio', '#0288d1', 'e2');
    expect(renomearEtiqueta(d, 'e2', 'quente', '#0288d1')).toMatch(/Já existe/);
    expect(renomearEtiqueta(d, 'e2', 'Gelado', '#455a64')).toBeNull();
    expect(d.etiquetas[1]).toMatchObject({ nome: 'Gelado', cor: '#455a64' });
  });
});

describe('fase do funil, dispensa e último contato', () => {
  it('define e tira a fase; "Fechado" marca a conversão', () => {
    const c = contato('Ana');
    definirFase(c, 'negociando', T);
    expect(c.fase).toBe('negociando');
    expect(c.convertidoEm).toBeUndefined();
    definirFase(c, 'fechado', T + 1);
    expect(c.convertidoEm).toBe(T + 1);
    definirFase(c, 'fechado', T + 99); // de novo: mantém a primeira data
    expect(c.convertidoEm).toBe(T + 1);
    definirFase(c, 'perdido', T + 2);
    expect(c.convertidoEm).toBeUndefined();
    definirFase(c, null, T + 3);
    expect(c.fase).toBeUndefined();
  });

  it('as opções do filtro trazem as 5 fases e as etiquetas, com busca por texto', () => {
    const d = dadosVazios();
    criarEtiqueta(d, 'Cliente fiel', '#8e24aa', 'e1');
    expect(opcoesDeFiltro(d, '').map((o) => o.rotulo)).toEqual(['Novo', 'Orçamento', 'Negociando', 'Fechado', 'Perdido', 'Cliente fiel']);
    expect(opcoesDeFiltro(d, 'orcam').map((o) => o.id)).toEqual(['fase:orcamento']);
    expect(opcoesDeFiltro(d, 'fiel').map((o) => o.id)).toEqual(['e1']);
    expect(opcoesDeFiltro(d, 'zzz')).toEqual([]);
  });

  it('dispensar guarda a assinatura da conversa e permite voltar', () => {
    const c = contato('Ana');
    dispensarContato(c, 'obrigado|0', T);
    expect(c.dispensadaAss).toBe('obrigado|0');
    reativarContato(c, T + 1);
    expect(c.dispensadaAss).toBeUndefined();
  });

  it('último contato só avança', () => {
    const c = contato('Ana');
    expect(registrarUltimoContatoEm(c, 100)).toBe(true);
    expect(registrarUltimoContatoEm(c, 50)).toBe(false);
    expect(c.ultimoContatoEm).toBe(100);
    expect(registrarUltimoContatoEm(c, 200)).toBe(true);
  });
});
