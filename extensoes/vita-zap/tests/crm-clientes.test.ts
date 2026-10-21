// Lista de Clientes (lógica pura): fase, etiquetas, última interação, próximo lembrete, busca e ordem.

import { describe, expect, it } from 'vitest';
import { instanteDaUltima, montarClientes } from '../src/shared/crm-clientes';
import { instanteNoFuso } from '../src/shared/crm-lembretes';
import { dadosVazios } from '../src/shared/crm-store';
import type { Conversa, DadosCrm, Lembrete } from '../src/shared/crm-tipos';
import { contato as fabricaContato } from './ajuda/fabrica';

const AGORA = new Date('2026-10-21T15:00:00Z'); // 12:00 em Fortaleza

function conversa(nome: string, p: Partial<Conversa> = {}): Conversa {
  return {
    chave: nome.toLowerCase(),
    nome,
    ultimaDeMim: false,
    naoLida: false,
    naoLidas: 0,
    grupo: false,
    arquivada: false,
    rotuloData: null,
    dataMsg: '2026-10-20',
    hora: null,
    previa: 'oi',
    ass: `${nome}|0`,
    desdeEm: 0,
    vistaEm: 0,
    ...p,
  };
}

const contato = fabricaContato;
const lembrete = (id: string, de: string, venceEm: number, status: Lembrete['status']): Lembrete => ({ id, contatoId: `id-${de}`, nome: de, venceEm, criadoEm: 1, status });

function cenario(): DadosCrm {
  const d = dadosVazios();
  d.etiquetas = [
    { id: 'e1', nome: 'Quente', cor: '#c62828' },
    { id: 'e2', nome: 'Cliente fiel', cor: '#8e24aa' },
  ];
  for (const c of [
    conversa('Ana', { dataMsg: '2026-10-20' }), // 1 dia
    conversa('Bruno', { dataMsg: '2026-10-01', ultimaDeMim: true }), // 20 dias
    conversa('Carla', { dataMsg: '2026-10-15' }), // 6 dias
    conversa('Clientes Sal', { dataMsg: '2026-09-01', grupo: true }),
  ]) d.conversas[c.chave] = c;
  const ana = contato('Ana', { fase: 'negociando', etiquetas: ['e1'], notas: [{ id: 'n', texto: 'Quer 200 sacos para dia 30', criadaEm: 1 }] });
  const bruno = contato('Bruno', { etiquetas: ['e2'] });
  const dani = contato('Dani', { fase: 'novo' }); // contato do CRM que nunca vimos na lista
  for (const c of [ana, bruno, dani]) d.contatos[c.id] = c;
  d.lembretes = [
    lembrete('l1', 'ana', instanteNoFuso('2026-10-25', 9), 'pendente'),
    lembrete('l2', 'ana', instanteNoFuso('2026-10-22', 9), 'pendente'),
    lembrete('l3', 'ana', instanteNoFuso('2026-10-21', 8), 'concluido'),
  ];
  return d;
}

const nomes = (d: DadosCrm, op = {}) => montarClientes(d, AGORA, op).map((c) => c.nome);

describe('montar a lista de clientes', () => {
  it('traz fase, etiquetas, notas, última interação e o PRÓXIMO lembrete pendente', () => {
    const ana = montarClientes(cenario(), AGORA).find((c) => c.nome === 'Ana');
    expect(ana).toMatchObject({ fase: 'negociando', notas: 1, ultimaInteracaoTexto: 'há 1 dia', dias: 1, precisaResposta: true });
    expect(ana?.etiquetas.map((e) => e.nome)).toEqual(['Quente']);
    expect(ana?.proximoLembrete?.id).toBe('l2'); // o de 22/10; o concluído não conta
  });

  it('grupos ficam de fora; contato do CRM sem conversa lida aparece sem última interação', () => {
    const lista = montarClientes(cenario(), AGORA);
    expect(lista.map((c) => c.nome)).not.toContain('Clientes Sal');
    const dani = lista.find((c) => c.nome === 'Dani');
    expect(dani).toMatchObject({ fase: 'novo', ultimaInteracaoEm: null, ultimaInteracaoTexto: '', dias: null, precisaResposta: false });
  });

  it('"Precisa de resposta" respeita a dispensa', () => {
    const d = cenario();
    const carla = contato('Carla', { dispensadaAss: 'Carla|0' });
    d.contatos[carla.id] = carla;
    const lista = montarClientes(d, AGORA);
    expect(lista.find((c) => c.nome === 'Carla')?.precisaResposta).toBe(false);
    expect(lista.find((c) => c.nome === 'Bruno')?.precisaResposta).toBe(false); // última foi minha
  });
});

describe('ordenação', () => {
  it('padrão: mais tempo sem contato primeiro; quem nunca vimos vai para o fim', () => {
    expect(nomes(cenario())).toEqual(['Bruno', 'Carla', 'Ana', 'Dani']);
  });

  it('contato mais recente, nome e próximo lembrete', () => {
    const d = cenario();
    expect(nomes(d, { ordem: 'recentes' })).toEqual(['Ana', 'Carla', 'Bruno', 'Dani']);
    expect(nomes(d, { ordem: 'nome' })).toEqual(['Ana', 'Bruno', 'Carla', 'Dani']);
    expect(nomes(d, { ordem: 'proximoLembrete' })).toEqual(['Ana', 'Bruno', 'Carla', 'Dani']); // só a Ana tem lembrete
  });

  it('a hora do rótulo desempata o mesmo dia', () => {
    const d = dadosVazios();
    for (const c of [conversa('Tarde', { dataMsg: '2026-10-21', hora: '15:00' }), conversa('Manha', { dataMsg: '2026-10-21', hora: '08:00' })]) d.conversas[c.chave] = c;
    expect(nomes(d)).toEqual(['Manha', 'Tarde']);
    expect(instanteDaUltima(conversa('X', { dataMsg: '2026-10-21', hora: '08:00' }))).toBe(instanteNoFuso('2026-10-21', 8, 0));
  });
});

describe('busca e filtros', () => {
  it('busca por nome, etiqueta, fase e texto das notas (sem acento, sem diferenciar maiúscula)', () => {
    const d = cenario();
    expect(nomes(d, { busca: 'BRUN' })).toEqual(['Bruno']);
    expect(nomes(d, { busca: 'fiel' })).toEqual(['Bruno']);
    expect(nomes(d, { busca: 'negociando' })).toEqual(['Ana']);
    expect(nomes(d, { busca: '200 sacos' })).toEqual(['Ana']);
    expect(nomes(d, { busca: 'zzz' })).toEqual([]);
  });

  it('por fase e por etiqueta', () => {
    const d = cenario();
    expect(nomes(d, { fase: 'novo' })).toEqual(['Dani']);
    expect(nomes(d, { etiquetaId: 'e2' })).toEqual(['Bruno']);
    expect(nomes(d, { fase: 'negociando', etiquetaId: 'e2' })).toEqual([]);
  });

  it('"só com dados" tira quem a extensão só viu na lista, sem nada anotado', () => {
    const d = cenario();
    expect(nomes(d, { soComDados: true })).toEqual(['Bruno', 'Ana', 'Dani']); // Carla só foi vista
  });

  it('lembrete concluído não conta como "dado do usuário"', () => {
    const d = dadosVazios();
    d.conversas.eva = conversa('Eva');
    const eva = contato('Eva');
    d.contatos[eva.id] = eva;
    d.lembretes = [lembrete('x', 'eva', 1, 'concluido')];
    expect(nomes(d, { soComDados: true })).toEqual([]);
  });
});

describe('identidade do contato (nome x telefone)', () => {
  it('liga a conversa ao contato pelo telefone mesmo que o nome exibido tenha mudado', () => {
    const d = dadosVazios();
    const c = contato('Ana Souza', { telefone: '5584999990000', fase: 'orcamento' });
    d.contatos[c.id] = c;
    // a lista agora mostra outro nome (o cliente renomeou o contato), mas o telefone é o mesmo
    d.conversas.novo = conversa('Aninha', { telefone: '5584999990000' });
    const lista = montarClientes(d, AGORA);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: c.id, nome: 'Ana Souza', fase: 'orcamento', ultimaInteracaoTexto: 'há 1 dia' });
  });

  it('o mesmo nome com telefones diferentes são pessoas diferentes', () => {
    const d = dadosVazios();
    const a = contato('Carlos', { telefone: '5584999990001' });
    const b = contato('Carlos', { id: 'id-carlos-2', telefone: '5584999990002' });
    d.contatos[a.id] = a;
    d.contatos[b.id] = b;
    d.conversas.x = conversa('Carlos', { telefone: '5584999990002', dataMsg: '2026-10-20' });
    const lista = montarClientes(d, AGORA);
    expect(lista).toHaveLength(2);
    expect(lista.find((l) => l.id === 'id-carlos-2')?.ultimaInteracaoTexto).toBe('há 1 dia');
    expect(lista.find((l) => l.id === a.id)?.ultimaInteracaoTexto).toBe('');
  });
});
