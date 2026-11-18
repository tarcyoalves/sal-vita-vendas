// "Não enviar mais" e contato registrado da equipe pelo ServicoCrm com o CRM falso (que usa a MESMA lógica de casamento do servidor):
// contrato, lotes, cache de 5 minutos, nada de texto de mensagem no fio, servidor antigo e CRM fora do ar.

import { beforeEach, describe, expect, it } from 'vitest';
import { hashDoNome, refDoContato } from '../src/shared/equipe';
import { METODOS_LEADS } from '../src/shared/leads';
import { ServicoCrm } from '../src/shared/servico-crm';
import { BASE, criarArmazemMemoria, criarCrmFalso, EMAIL, SENHA, type CrmFalso } from './ajuda/crm-falso';

const AGORA = new Date('2026-11-18T15:00:00.000Z');
let crm: CrmFalso;
let servico: ServicoCrm;
let agora = AGORA.getTime();

beforeEach(async () => {
  agora = AGORA.getTime();
  crm = criarCrmFalso([], () => agora);
  servico = new ServicoCrm(criarArmazemMemoria(), crm.transporte, () => agora);
  await servico.definirUrl(BASE);
  await servico.entrar(EMAIL, SENHA);
  crm.requisicoes.length = 0;
});

const ana = refDoContato('Ana Silva', '84999990000');
const bia = refDoContato('Bia');

describe('contrato LeadsCRM', () => {
  it('os métodos novos passam pelo service worker', () => {
    for (const m of ['optOutsDaEquipe', 'marcarOptOutsDaEquipe', 'desmarcarOptOutsDaEquipe', 'registrarEnviosDaEquipe', 'contatadosDaEquipe']) expect(METODOS_LEADS).toContain(m);
  });
});

describe('"não enviar mais" da equipe', () => {
  it('marca, lista e desmarca; o telefone vai canônico e NUNCA texto de mensagem', async () => {
    const r = await servico.marcarOptOutsDaEquipe([{ ...ana, nome: 'Ana Silva', origem: 'ia', marcadoEm: agora - 86_400_000 }, { ...bia, nome: 'Bia', origem: 'manual' }]);
    expect(r).toEqual({ ok: true, quantidade: 2 });
    const corpo = JSON.stringify(crm.chamadas('zapContatos.marcarOptOuts')[0].entrada);
    expect(corpo).toContain('558499990000');
    expect(corpo).toContain(hashDoNome('Ana Silva'));
    expect(corpo).not.toMatch(/texto|mensagem/i);
    const lista = await servico.optOutsDaEquipe({ forcar: true });
    expect(lista.ok && lista.lista.itens.map((i) => i.nome).sort()).toEqual(['Ana Silva', 'Bia']);
    expect(lista.ok && lista.lista.itens.find((i) => i.nome === 'Ana Silva')?.origem).toBe('ia');
    const d = await servico.desmarcarOptOutsDaEquipe([ana]);
    expect(d).toEqual({ ok: true, quantidade: 1 });
    const depois = await servico.optOutsDaEquipe({ forcar: true });
    expect(depois.ok && depois.lista.itens.map((i) => i.nome)).toEqual(['Bia']);
  });

  it('marcar é idempotente (quem já está na lista não duplica)', async () => {
    await servico.marcarOptOutsDaEquipe([{ ...bia, nome: 'Bia', origem: 'manual' }]);
    const r = await servico.marcarOptOutsDaEquipe([{ ...bia, nome: 'Bia', origem: 'ia' }]);
    expect(r).toEqual({ ok: true, quantidade: 0 });
    expect(crm.equipe.optOuts).toHaveLength(1);
  });

  it('a lista fica em cache por 5 minutos (uma consulta ao CRM); forçar consulta de novo; marcar invalida o cache', async () => {
    await servico.optOutsDaEquipe();
    await servico.optOutsDaEquipe();
    expect(crm.chamadas('zapContatos.listarOptOuts')).toHaveLength(1);
    agora += 4 * 60_000;
    await servico.optOutsDaEquipe();
    expect(crm.chamadas('zapContatos.listarOptOuts')).toHaveLength(1);
    agora += 2 * 60_000;
    await servico.optOutsDaEquipe();
    expect(crm.chamadas('zapContatos.listarOptOuts')).toHaveLength(2);
    await servico.optOutsDaEquipe({ forcar: true });
    expect(crm.chamadas('zapContatos.listarOptOuts')).toHaveLength(3);
    await servico.marcarOptOutsDaEquipe([{ ...bia, origem: 'manual' }]);
    const l = await servico.optOutsDaEquipe();
    expect(crm.chamadas('zapContatos.listarOptOuts')).toHaveLength(4);
    expect(l.ok && l.lista.itens).toHaveLength(1);
  });

  it('marcações em lotes de 200', async () => {
    const itens = Array.from({ length: 450 }, (_, i) => ({ ...refDoContato(`Contato ${i}`), origem: 'manual' as const }));
    const r = await servico.marcarOptOutsDaEquipe(itens);
    expect(r).toEqual({ ok: true, quantidade: 450 });
    expect(crm.chamadas('zapContatos.marcarOptOuts')).toHaveLength(3);
  });

  it('servidor sem o zapContatos: explica que o CRM precisa estar atualizado (e não quebra)', async () => {
    crm.semZapContatos = true;
    const r = await servico.optOutsDaEquipe({ forcar: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/precisa estar atualizado/);
    const m = await servico.marcarOptOutsDaEquipe([{ ...bia, origem: 'manual' }]);
    expect(m.ok).toBe(false);
  });

  it('CRM fora do ar: devolve o motivo (a extensão decide o que fazer)', async () => {
    crm.semRede = true;
    const r = await servico.optOutsDaEquipe({ forcar: true });
    expect(!r.ok && r.motivo).toMatch(/CRM indisponível/);
  });
});

describe('contato registrado da equipe', () => {
  it('registra o envio (tipo e data, nunca o texto) e a consulta devolve por contato, de qualquer atendente', async () => {
    const dez = agora - 10 * 86_400_000;
    const r = await servico.registrarEnviosDaEquipe([{ ...ana, tipo: 'cobranca', enviadoEm: dez }, { ...bia, tipo: 'campanha', enviadoEm: agora - 2 * 86_400_000 }]);
    expect(r).toEqual({ ok: true, quantidade: 2 });
    expect(JSON.stringify(crm.chamadas('zapContatos.registrarEnvios')[0].entrada)).not.toMatch(/texto|mensagem/i);
    const c = await servico.contatadosDaEquipe([ana, bia, refDoContato('Carla')], 14);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.porContato[0].map((x) => x.tipo)).toEqual(['cobranca']);
    expect(c.porContato[1].map((x) => x.tipo)).toEqual(['campanha']);
    expect(c.porContato[2]).toEqual([]);
    // Janela: só os últimos N dias.
    const curto = await servico.contatadosDaEquipe([ana, bia], 5);
    expect(curto.ok && curto.porContato[0]).toEqual([]);
    expect(curto.ok && curto.porContato[1]).toHaveLength(1);
  });

  it('o contato é achado pelo telefone mesmo com outro nome, e pelo nome quando falta telefone', async () => {
    await servico.registrarEnviosDaEquipe([{ ...ana, tipo: 'campanha', enviadoEm: agora - 86_400_000 }]);
    const porTel = await servico.contatadosDaEquipe([refDoContato('Padaria da Ana', '(84) 99999-0000')], 14);
    expect(porTel.ok && porTel.porContato[0]).toHaveLength(1);
    const porNome = await servico.contatadosDaEquipe([refDoContato('Ana Silva')], 14);
    expect(porNome.ok && porNome.porContato[0]).toHaveLength(1);
    const outro = await servico.contatadosDaEquipe([refDoContato('Ana Silva', '84911112222')], 14);
    expect(outro.ok && outro.porContato[0]).toEqual([]); // mesmo nome, telefone diferente
  });

  it('guarda só o envio mais recente de cada tipo (um envio velho reenviado na migração nunca apaga o novo)', async () => {
    await servico.registrarEnviosDaEquipe([{ ...ana, tipo: 'campanha', enviadoEm: agora - 86_400_000 }]);
    await servico.registrarEnviosDaEquipe([{ ...ana, tipo: 'campanha', enviadoEm: agora - 20 * 86_400_000 }]);
    const c = await servico.contatadosDaEquipe([ana], 30);
    expect(c.ok && c.porContato[0][0].enviadoEm).toBe(agora - 86_400_000);
  });

  it('com incluirOptOut a mesma consulta diz quem está em "não enviar mais" (uma ida ao CRM antes de cada envio)', async () => {
    await servico.marcarOptOutsDaEquipe([{ ...ana, nome: 'Ana Silva', origem: 'ia' }]);
    crm.requisicoes.length = 0;
    const c = await servico.contatadosDaEquipe([ana, bia], 14, { incluirOptOut: true });
    expect(c.ok && c.optOuts).toEqual([{ i: 0, origem: 'ia', meu: true }, null]);
    expect(crm.requisicoes).toHaveLength(1);
  });

  it('consulta em lotes de 500 contatos', async () => {
    const refs = Array.from({ length: 1100 }, (_, i) => refDoContato(`Contato ${i}`));
    const c = await servico.contatadosDaEquipe(refs, 14);
    expect(c.ok && c.porContato).toHaveLength(1100);
    expect(crm.chamadas('zapContatos.consultarContatados')).toHaveLength(3);
  });

  it('sem login: não consulta nada', async () => {
    await servico.sair();
    crm.requisicoes.length = 0;
    const c = await servico.contatadosDaEquipe([ana], 14);
    expect(!c.ok && c.motivo).toMatch(/sem login/);
    expect(crm.requisicoes).toHaveLength(0);
  });
});
