// "Acompanhar" (0.7.23): etiqueta do CRM para clientes prestes a fechar. Botão na faixa do lead (adiciona/remove
// pelo alterarEtiquetas existente), converter tira a etiqueta, lista ordenada, consumo do CRM (sem polling,
// no máximo 1 consulta automática por 15 min) e fila offline. CRM falso: sem rede, sem conta real.

import { beforeEach, describe, expect, it } from 'vitest';
import { diasSemContato, emAcompanhamento, MINIMO_ACOMPANHANDO_MS, ordenarAcompanhando, resumoAcompanhando, textoSemContato } from '../src/shared/crm-acompanhar';
import { chavesDoVinculo, ETIQUETA_ACOMPANHAR, type LeadCrm } from '../src/shared/crm-remoto';
import { ServicoCrm } from '../src/shared/servico-crm';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, task, type CrmFalso } from './ajuda/crm-falso';

// 21/10/2026 14:30 em Fortaleza (UTC-3)
const AGORA = Date.UTC(2026, 9, 21, 17, 30);
const DIA = 86_400_000;
const ANA = { nome: 'Ana Souza', telefone: '5584999990000' };

let crm: CrmFalso;
let arm: ReturnType<typeof criarArmazemMemoria>;
let servico: ServicoCrm;
let agora = AGORA;

function lead(p: Partial<LeadCrm> & { id: number }): LeadCrm {
  return { titulo: `Lead ${p.id}`, telefone: null, etiquetas: [ETIQUETA_ACOMPANHAR], lembreteEm: null, lembreteAtivo: true, status: 'pending', ultimoContatoEm: null, contatos: 0, convertidoEm: null, notas: '', ...p };
}

async function conectado(): Promise<void> {
  await servico.definirUrl(BASE);
  expect((await servico.entrar(EMAIL, SENHA)).ok).toBe(true);
}

beforeEach(() => {
  agora = AGORA;
  crm = criarCrmFalso(
    [
      task({ id: 1, title: 'Padaria da Ana', phone: '84999990000', tags: ['quente'], reminderDate: new Date(AGORA + DIA) }),
      task({ id: 2, title: 'Mercado Sol', phone: '8433334444', tags: ['Acompanhar'], reminderDate: new Date(AGORA - 3_600_000), lastContactedAt: new Date(AGORA - 2 * DIA) }),
      task({ id: 3, title: 'Atacado Mar', phone: '84988887777', tags: ['Acompanhar', 'atacado'], reminderDate: new Date(AGORA + 2 * DIA), lastContactedAt: new Date(AGORA - 9 * DIA) }),
    ],
    () => agora,
  );
  arm = criarArmazemMemoria();
  servico = new ServicoCrm(arm, crm.transporte, () => agora);
});

describe('botão Acompanhar / Parar de acompanhar (alterarEtiquetas existente)', () => {
  it('Acompanhar adiciona a etiqueta e preserva as outras; Parar de acompanhar remove só ela', async () => {
    await conectado();
    await servico.leadDoContato(ANA);
    const r = await servico.alterarEtiquetas(ANA, { adicionar: [ETIQUETA_ACOMPANHAR] });
    expect(r.ok && r.lead.etiquetas).toEqual(['quente', 'Acompanhar']);
    expect(crm.tasks[0].tags).toEqual(['quente', 'Acompanhar']);
    const parou = await servico.alterarEtiquetas(ANA, { remover: [ETIQUETA_ACOMPANHAR] });
    expect(parou.ok && parou.lead.etiquetas).toEqual(['quente']);
    expect(crm.tasks[0].tags).toEqual(['quente']);
  });

  it('só chama o CRM no clique: ler a lista do cache não faz requisição', async () => {
    await conectado();
    await servico.leadDoContato(ANA);
    const antes = crm.requisicoes.length;
    await servico.alterarEtiquetas(ANA, { adicionar: [ETIQUETA_ACOMPANHAR] });
    const duranteClique = crm.requisicoes.length - antes;
    expect(duranteClique).toBe(2); // getById (estado atual das etiquetas) + update
    const depois = crm.requisicoes.length;
    await servico.acompanhando('cache');
    await servico.acompanhando('cache');
    expect(crm.requisicoes).toHaveLength(depois);
  });

  it('o lead que recebeu a etiqueta entra na lista sem nova consulta ao CRM e some ao parar', async () => {
    await conectado();
    await servico.leadDoContato(ANA);
    await servico.alterarEtiquetas(ANA, { adicionar: [ETIQUETA_ACOMPANHAR] });
    const n = crm.requisicoes.length;
    const r = await servico.acompanhando('cache');
    expect(r.ok && r.leads.map((l) => l.id)).toEqual([1]);
    await servico.alterarEtiquetas(ANA, { remover: [ETIQUETA_ACOMPANHAR] });
    const r2 = await servico.acompanhando('cache');
    expect(r2.ok && r2.leads).toEqual([]);
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(0);
    expect(crm.requisicoes.length).toBeGreaterThan(n); // só as chamadas do clique
  });
});

describe('Marcar convertido tira a etiqueta Acompanhar', () => {
  it('servidor novo: uma só chamada de escrita (toggleConverted) e a etiqueta sai', async () => {
    await conectado();
    await servico.leadDoContato(ANA);
    await servico.alterarEtiquetas(ANA, { adicionar: [ETIQUETA_ACOMPANHAR] });
    const antesUpdate = crm.chamadas('tasks.update').length;
    const r = await servico.marcarConvertido(ANA);
    expect(r.ok && r.lead.etiquetas).toEqual(['quente', 'ativo']);
    expect(crm.chamadas('tasks.toggleConverted')).toHaveLength(1);
    expect(crm.chamadas('tasks.update')).toHaveLength(antesUpdate); // sem chamada extra
    const l = await servico.acompanhando('cache');
    expect(l.ok && l.leads).toEqual([]);
  });

  it('servidor anterior (não tira a etiqueta): a extensão faz a segunda chamada só nesse caso', async () => {
    crm.conversaoTiraAcompanhar = false;
    await conectado();
    await servico.leadDoContato(ANA);
    await servico.alterarEtiquetas(ANA, { adicionar: [ETIQUETA_ACOMPANHAR] });
    const antesUpdate = crm.chamadas('tasks.update').length;
    const r = await servico.marcarConvertido(ANA);
    expect(r.ok && r.lead.etiquetas).toEqual(['quente', 'ativo']);
    expect(crm.tasks[0].tags).toEqual(['quente', 'ativo']);
    expect(crm.chamadas('tasks.update')).toHaveLength(antesUpdate + 1);
  });

  it('sem rede: a tela já mostra sem "Acompanhar" e a fila reenvia a conversão', async () => {
    await conectado();
    await servico.leadDoContato(ANA);
    await servico.alterarEtiquetas(ANA, { adicionar: [ETIQUETA_ACOMPANHAR] });
    crm.semRede = true;
    const r = await servico.marcarConvertido(ANA);
    expect(r).toMatchObject({ ok: true, pendente: true });
    expect(r.ok && r.lead.etiquetas).not.toContain(ETIQUETA_ACOMPANHAR);
    const lista = await servico.acompanhando('cache');
    expect(lista.ok && lista.leads).toEqual([]);
    crm.semRede = false;
    expect(await servico.reenviarFila()).toEqual({ enviados: 1, restantes: 0 });
    expect(crm.tasks[0].convertedAt).not.toBeNull();
  });
});

describe('lista Acompanhar: cache local + 1 consulta, sem polling', () => {
  it('sem login: erro de autenticação e nenhuma requisição', async () => {
    const r = await servico.acompanhando('aba');
    expect(r).toMatchObject({ ok: false, erro: { tipo: 'nao-autenticado' } });
    expect(crm.requisicoes).toHaveLength(0);
  });

  it('abrir a aba faz UMA consulta (tasks.acompanhando) e traz os leads com a etiqueta e as chaves das conversas', async () => {
    await conectado();
    const r = await servico.acompanhando('aba');
    expect(r).toMatchObject({ ok: true, desatualizado: false, atualizadoEm: AGORA });
    if (!r.ok) return;
    expect(r.leads.map((l) => l.id).sort()).toEqual([2, 3]);
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(1);
    expect(r.chaves).toEqual(expect.arrayContaining(chavesDoVinculo({ nome: '', telefone: '8433334444' })));
    expect(r.chaves).toEqual(expect.arrayContaining(chavesDoVinculo({ nome: '', telefone: '84988887777' })));
  });

  it('automática: no máximo 1 consulta a cada 15 min; o botão Atualizar ignora o limite', async () => {
    await conectado();
    await servico.acompanhando('aba');
    await servico.acompanhando('aba');
    await servico.acompanhando('aba');
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(1);
    agora += MINIMO_ACOMPANHANDO_MS - 1000;
    await servico.acompanhando('aba');
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(1);
    agora += 2000;
    await servico.acompanhando('aba');
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(2);
    await servico.acompanhando('botao');
    expect(crm.chamadas('tasks.acompanhando')).toHaveLength(3);
  });

  it('o CRM é a fonte: lead que perdeu a etiqueta no site sai da lista na consulta seguinte', async () => {
    await conectado();
    await servico.acompanhando('aba');
    crm.tasks[1].tags = [];
    const r = await servico.acompanhando('botao');
    expect(r.ok && r.leads.map((l) => l.id)).toEqual([3]);
  });

  it('falha na consulta (sem rede ou servidor antigo): mostra o que estava guardado, marcado como desatualizado, e não insiste', async () => {
    await conectado();
    await servico.acompanhando('aba');
    crm.semRede = true;
    agora += MINIMO_ACOMPANHANDO_MS + 1;
    const r = await servico.acompanhando('aba');
    expect(r).toMatchObject({ ok: true, desatualizado: true, aviso: { tipo: 'rede' } });
    expect(r.ok && r.leads).toHaveLength(2);
    const n = crm.requisicoes.length;
    await servico.acompanhando('aba'); // tentou agora há pouco: não repete
    expect(crm.requisicoes).toHaveLength(n);
  });

  it('servidor sem a procedure nova: mostra o cache e o erro, sem quebrar', async () => {
    crm.semProcedureAcompanhando = true;
    await conectado();
    await servico.leadDoContato({ nome: 'Mercado Sol', telefone: '558433334444' });
    await servico.alterarEtiquetas({ nome: 'Mercado Sol', telefone: '558433334444' }, { adicionar: ['Acompanhar'] });
    const r = await servico.acompanhando('aba');
    expect(r.ok && r.desatualizado).toBe(true);
  });

  it('sair apaga a lista guardada', async () => {
    await conectado();
    await servico.acompanhando('aba');
    expect(arm.dados.has('vz.crm.acompanhando')).toBe(true);
    await servico.sair();
    expect(arm.dados.has('vz.crm.acompanhando')).toBe(false);
  });

  it('registrar contato pela lista (por task) anexa a nota e atualiza o último contato', async () => {
    await conectado();
    await servico.acompanhando('aba');
    const r = await servico.registrarContatoNaTask(3, 'Confirmou 20 sacos');
    expect(r.ok).toBe(true);
    expect(crm.tasks[2].notes).toContain('Confirmou 20 sacos');
    const l = await servico.acompanhando('cache');
    expect(l.ok && l.leads.find((x) => x.id === 3)?.ultimoContatoEm).toBe(AGORA);
    expect(await servico.registrarContatoNaTask(3, '   ')).toMatchObject({ ok: false });
  });
});

describe('ordenação e textos', () => {
  const ref = new Date(AGORA);
  const d = (dias: number) => AGORA - dias * DIA;

  it('vencido primeiro; depois quem está há mais dias sem falar; nunca contatado é o mais esquecido', () => {
    const lista = [
      lead({ id: 1, titulo: 'A', ultimoContatoEm: d(1), lembreteEm: AGORA + DIA }),
      lead({ id: 2, titulo: 'B', ultimoContatoEm: d(10), lembreteEm: AGORA + DIA }),
      lead({ id: 3, titulo: 'C', ultimoContatoEm: d(2), lembreteEm: AGORA - 1000 }),
      lead({ id: 4, titulo: 'D', ultimoContatoEm: d(8), lembreteEm: AGORA - 5000 }),
      lead({ id: 5, titulo: 'E', ultimoContatoEm: null, lembreteEm: null }),
    ];
    expect(ordenarAcompanhando(lista, ref).map((l) => l.id)).toEqual([4, 3, 5, 2, 1]);
    expect(lista.map((l) => l.id)).toEqual([1, 2, 3, 4, 5]); // não altera a original
  });

  it('lembrete desligado não conta como vencido; empate cai no lembrete mais antigo e no título', () => {
    const lista = [
      lead({ id: 1, titulo: 'B', ultimoContatoEm: d(3), lembreteEm: AGORA - 1000, lembreteAtivo: false }),
      lead({ id: 2, titulo: 'A', ultimoContatoEm: d(3), lembreteEm: AGORA + 5 * DIA }),
      lead({ id: 3, titulo: 'C', ultimoContatoEm: d(3), lembreteEm: AGORA + DIA }),
    ];
    expect(ordenarAcompanhando(lista, ref).map((l) => l.id)).toEqual([1, 3, 2]);
    expect(resumoAcompanhando(lista, ref)).toEqual({ total: 3, vencidos: 0 });
  });

  it('contador: total e vencidos', () => {
    const lista = [lead({ id: 1, lembreteEm: AGORA - 1 }), lead({ id: 2, lembreteEm: AGORA + 1 }), lead({ id: 3, lembreteEm: AGORA - DIA })];
    expect(resumoAcompanhando(lista, ref)).toEqual({ total: 3, vencidos: 2 });
  });

  it('"há N dias sem falar" usa dias de calendário de Fortaleza', () => {
    expect(textoSemContato(lead({ id: 1, ultimoContatoEm: d(0) }), ref)).toBe('falou hoje');
    expect(textoSemContato(lead({ id: 1, ultimoContatoEm: d(1) }), ref)).toBe('há 1 dia sem falar');
    expect(textoSemContato(lead({ id: 1, ultimoContatoEm: d(9) }), ref)).toBe('há 9 dias sem falar');
    expect(textoSemContato(lead({ id: 1 }), ref)).toBe('sem contato registrado');
    expect(diasSemContato(lead({ id: 1, ultimoContatoEm: d(3) }), ref)).toBe(3);
  });

  it('só entra quem tem a etiqueta, não está convertido e está pendente', () => {
    expect(emAcompanhamento(lead({ id: 1 }))).toBe(true);
    expect(emAcompanhamento(lead({ id: 1, etiquetas: ['quente'] }))).toBe(false);
    expect(emAcompanhamento(lead({ id: 1, convertidoEm: AGORA }))).toBe(false);
    expect(emAcompanhamento(lead({ id: 1, status: 'cancelled' }))).toBe(false);
  });
});
