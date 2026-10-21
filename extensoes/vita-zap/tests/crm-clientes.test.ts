// Lista de Clientes (lógica pura): fase, etiquetas, última interação, próximo lembrete, busca e ordem.

import { describe, expect, it } from 'vitest';
import { instanteDaUltima, montarClientes } from '../src/shared/crm-clientes';
import { instanteNoFuso } from '../src/shared/crm-lembretes';
import { dadosVazios } from '../src/shared/crm-store';
import type { Contato, Conversa, DadosCrm } from '../src/shared/crm-tipos';

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

function contato(nome: string, p: Partial<Contato> = {}): Contato {
  return { chave: nome.toLowerCase(), nome, etiquetas: [], notas: [], criadoEm: 1, atualizadoEm: 1, ...p };
}

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
  d.contatos.ana = contato('Ana', { fase: 'negociando', etiquetas: ['e1'], notas: [{ id: 'n', texto: 'Quer 200 sacos para dia 30', criadaEm: 1 }] });
  d.contatos.bruno = contato('Bruno', { etiquetas: ['e2'] });
  d.contatos.dani = contato('Dani', { fase: 'novo' }); // contato do CRM que nunca vimos na lista
  d.lembretes = [
    { id: 'l1', chave: 'ana', nome: 'Ana', venceEm: instanteNoFuso('2026-10-25', 9), criadoEm: 1, status: 'pendente' },
    { id: 'l2', chave: 'ana', nome: 'Ana', venceEm: instanteNoFuso('2026-10-22', 9), criadoEm: 1, status: 'pendente' },
    { id: 'l3', chave: 'ana', nome: 'Ana', venceEm: instanteNoFuso('2026-10-21', 8), criadoEm: 1, status: 'concluido' },
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
    d.contatos.carla = contato('Carla', { dispensadaAss: 'Carla|0' });
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
    d.contatos.eva = contato('Eva');
    d.lembretes = [{ id: 'x', chave: 'eva', nome: 'Eva', venceEm: 1, criadoEm: 1, status: 'concluido' }];
    expect(nomes(d, { soComDados: true })).toEqual([]);
  });
});
