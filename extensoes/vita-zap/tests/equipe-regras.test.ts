// "Não enviar mais" e contato registrado da EQUIPE (0.7.60): regras puras (sem rede, sem banco).

import { describe, expect, it } from 'vitest';
import {
  contatadosDoServidor,
  hashDoNome,
  indiceDeRefs,
  listaOptOutsDoServidor,
  maisRecenteDaEquipe,
  maisRecenteIso,
  mesmoContatoEquipe,
  motivoContatoDaEquipe,
  origemDoMotivo,
  planejarOptOuts,
  refDoContato,
  telefoneCanonico,
  telefoneNoFio,
  tipoDoEnvio,
  type ListaOptOuts,
  type OptOutCrm,
} from '../src/shared/equipe';
import type { NaoEnviar } from '../src/shared/exportar';
import { hashTexto } from '../src/shared/hash';

const AGORA = new Date('2026-11-18T15:00:00Z');
const local = (nome: string, extra: Partial<NaoEnviar> = {}): NaoEnviar => ({ chave: nome.toLowerCase(), nome, desde: '2026-11-01T12:00:00.000Z', motivo: 'não enviar mais', ...extra });
const crmItem = (nome: string | null, tel: string | null, extra: Partial<OptOutCrm> = {}): OptOutCrm => ({
  chave: tel ?? `n:${hashDoNome(nome ?? 'x')}`,
  telefone: tel,
  nomeHash: hashDoNome(nome ?? 'x'),
  nome,
  userId: 3,
  origem: 'manual',
  em: Date.parse('2026-11-10T12:00:00Z'),
  ...extra,
});
const lista = (itens: OptOutCrm[], truncado = false): ListaOptOuts => ({ itens, truncado, em: AGORA.getTime() });
const semTel = () => null;

describe('hash e referência do contato', () => {
  it('o hash é estável, tem 28 hexadecimais e muda com o texto', () => {
    expect(hashTexto('ana')).toBe(hashTexto('ana'));
    expect(hashTexto('ana')).toMatch(/^[0-9a-f]{28}$/);
    expect(hashTexto('ana')).not.toBe(hashTexto('ana '));
    expect(hashTexto('')).toMatch(/^[0-9a-f]{28}$/);
  });
  it('o hash do nome usa a MESMA normalização da chave local (acento, maiúscula, espaços)', () => {
    expect(hashDoNome('  João   Silva ')).toBe(hashDoNome('joao silva'));
    expect(hashDoNome('João Silva')).not.toBe(hashDoNome('João Silvia'));
  });
  it('o telefone vira canônico: com ou sem DDI, formatado, com ou sem o 9 extra', () => {
    expect(telefoneCanonico('(84) 99999-0000')).toBe('558499990000');
    expect(telefoneCanonico('+55 84 99999-0000')).toBe('558499990000');
    expect(telefoneCanonico('558499990000')).toBe('558499990000');
    expect(telefoneCanonico('')).toBeNull();
    expect(telefoneCanonico('123')).toBeNull();
    expect(telefoneCanonico(null)).toBeNull();
  });
  it('no fio, número fora do Brasil leva "+" (o servidor não presume o DDI 55)', () => {
    expect(telefoneNoFio('558499990000')).toBe('558499990000');
    expect(telefoneNoFio('14155550100')).toBe('+14155550100');
    expect(telefoneNoFio(null)).toBeUndefined();
  });
  it('mesmo contato: os dois com telefone vale o telefone; senão o hash do nome', () => {
    const a = refDoContato('Ana', '84999990000');
    expect(mesmoContatoEquipe(a, refDoContato('Ana Outra', '558499990000'))).toBe(true);
    expect(mesmoContatoEquipe(a, refDoContato('Ana', '84988887777'))).toBe(false);
    expect(mesmoContatoEquipe(a, refDoContato('ANA'))).toBe(true);
    expect(mesmoContatoEquipe(refDoContato('Ana'), refDoContato('Bia'))).toBe(false);
  });
  it('o índice acha o contato como a regra manda (sem comparar todos com todos)', () => {
    const ix = indiceDeRefs([refDoContato('Ana', '84999990000'), refDoContato('Bia')]);
    expect(ix.acha(refDoContato('Outro nome', '558499990000'))).toBeDefined();
    expect(ix.acha(refDoContato('Ana', '84911112222'))).toBeUndefined(); // mesmo nome, telefone diferente
    expect(ix.acha(refDoContato('Bia', '84933334444'))).toBeDefined(); // um lado sem telefone: vale o nome
    expect(ix.acha(refDoContato('Carla'))).toBeUndefined();
  });
});

describe('leitura defensiva do que o servidor devolve', () => {
  it('lista de opt-outs: ignora lixo, normaliza origem e datas', () => {
    const r = listaOptOutsDoServidor(
      { itens: [{ chave: 'n:x', telefone: '', nomeHash: 'a'.repeat(28), nome: ' ', userId: 3, origem: 'hacker', criadoEm: '2026-11-10T12:00:00.000Z' }, { chave: 1 }, null, { chave: 'k', nomeHash: 'h', userId: 1, origem: 'ia', criadoEm: 'não é data' }], truncado: true },
      5,
    );
    expect(r?.itens).toHaveLength(1);
    expect(r?.itens[0]).toMatchObject({ telefone: null, nome: null, origem: 'manual', em: Date.parse('2026-11-10T12:00:00Z') });
    expect(r?.truncado).toBe(true);
    expect(listaOptOutsDoServidor(null, 1)).toBeNull();
    expect(listaOptOutsDoServidor({}, 1)).toBeNull();
  });
  it('contatados: só tipos e datas válidos; opt-outs opcionais', () => {
    const r = contatadosDoServidor({ itens: [{ i: 0, tipo: 'cobranca', enviadoEm: '2026-11-10T12:00:00.000Z', meu: true }, { i: 1, tipo: 'mensagem', enviadoEm: '2026-11-10T12:00:00.000Z' }, { tipo: 'campanha' }], optOuts: [{ i: 0, origem: 'ia', meu: false }, { x: 1 }] });
    expect(r?.itens).toEqual([{ i: 0, tipo: 'cobranca', enviadoEm: Date.parse('2026-11-10T12:00:00Z'), meu: true }]);
    expect(r?.optOuts).toEqual([{ i: 0, origem: 'ia', meu: false }]);
    expect(contatadosDoServidor({ itens: [] })?.optOuts).toEqual([]);
    expect(contatadosDoServidor('x')).toBeNull();
  });
});

describe('planejarOptOuts: a união local + CRM', () => {
  it('migração: o que só existe aqui sobe; o que o CRM já tem é só confirmado', () => {
    const p = planejarOptOuts([local('Ana'), local('Bia')], lista([crmItem('Bia', null)]), [], semTel);
    expect(p.paraEnviar.map((n) => n.nome)).toEqual(['Ana']);
    expect(p.confirmar).toEqual(['bia']);
    expect(p.novosLocais).toEqual([]);
    expect(p.removerLocais).toEqual([]);
  });
  it('o opt-out de outro atendente passa a valer aqui (chave local = nome gravado no CRM) e leva a origem', () => {
    const p = planejarOptOuts([], lista([crmItem('Carla Souza', '558499990000', { origem: 'ia' })]), [], semTel);
    expect(p.novosLocais).toHaveLength(1);
    expect(p.novosLocais[0]).toMatchObject({ chave: 'carla souza', nome: 'Carla Souza', origem: 'ia', crm: true });
    expect(p.novosLocais[0].desde).toBe('2026-11-10T12:00:00.000Z');
  });
  it('marcado por telefone: acha o contato daqui que tem outro nome mas o mesmo telefone', () => {
    const p = planejarOptOuts([], lista([crmItem('Dona Carla', '558499990000')]), [{ chave: 'carla padaria', nome: 'Carla Padaria', telefone: '558499990000' }], semTel);
    expect(p.novosLocais.map((n) => n.chave)).toEqual(['carla padaria']);
  });
  it('sem nome no CRM e sem contato conhecido: nada local (o Executor confere por telefone antes de enviar)', () => {
    const p = planejarOptOuts([], lista([crmItem(null, '558499990000')]), [], semTel);
    expect(p.novosLocais).toEqual([]);
  });
  it('já tem local para o mesmo contato (pelo telefone): não duplica', () => {
    const p = planejarOptOuts([local('Carla Padaria')], lista([crmItem('Dona Carla', '558499990000')]), [], (n) => (n.chave === 'carla padaria' ? '558499990000' : null));
    expect(p.novosLocais).toEqual([]);
    expect(p.confirmar).toEqual(['carla padaria']);
  });
  it('alguém desfez: o que já estava sincronizado e o CRM não tem mais sai daqui', () => {
    const p = planejarOptOuts([local('Ana', { crm: true }), local('Bia', { crm: true })], lista([crmItem('Bia', null)]), [], semTel);
    expect(p.removerLocais).toEqual(['ana']);
    expect(p.paraEnviar).toEqual([]);
  });
  it('lista do CRM cortada (limite): a ausência NÃO prova que desfizeram: nada sai daqui', () => {
    const p = planejarOptOuts([local('Ana', { crm: true })], lista([], true), [], semTel);
    expect(p.removerLocais).toEqual([]);
  });
  it('quem nunca subiu e o CRM não tem NÃO é apagado: sobe', () => {
    const p = planejarOptOuts([local('Ana')], lista([]), [], semTel);
    expect(p.removerLocais).toEqual([]);
    expect(p.paraEnviar.map((n) => n.nome)).toEqual(['Ana']);
  });
  it('várias marcações do mesmo nome no CRM viram uma só entrada local', () => {
    const p = planejarOptOuts([], lista([crmItem('Ana', null), crmItem('Ana', '558499990000')]), [], semTel);
    expect(p.novosLocais).toHaveLength(1);
  });
});

describe('contato registrado: o mais recente, o motivo e o tipo', () => {
  it('o mais recente entre vários tipos', () => {
    const m = maisRecenteDaEquipe([
      { i: 0, tipo: 'campanha', enviadoEm: Date.parse('2026-11-01T10:00:00Z'), meu: true },
      { i: 0, tipo: 'cobranca', enviadoEm: Date.parse('2026-11-12T10:00:00Z'), meu: false },
    ]);
    expect(m).toEqual({ em: '2026-11-12T10:00:00.000Z', tipo: 'cobranca', meu: false });
    expect(maisRecenteDaEquipe([])).toBeNull();
  });
  it('maisRecenteIso escolhe o maior e aceita ausentes', () => {
    expect(maisRecenteIso('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z')).toBe('2026-11-02T00:00:00Z');
    expect(maisRecenteIso(undefined, 'x')).toBe('x');
    expect(maisRecenteIso('y', undefined)).toBe('y');
    expect(maisRecenteIso(undefined, undefined)).toBeUndefined();
  });
  it('o motivo diz há quantos dias, por quem e o tipo; passou do limite, não bloqueia', () => {
    const c = { em: '2026-11-12T10:00:00.000Z', tipo: 'cobranca' as const, meu: false };
    expect(motivoContatoDaEquipe(c, AGORA, 14)).toBe('contatado há 6 dia(s) por outro atendente (cobrança; mínimo 14)');
    expect(motivoContatoDaEquipe({ ...c, meu: true }, AGORA, 14)).toContain('por você em outro computador');
    expect(motivoContatoDaEquipe(c, AGORA, 6)).toBeNull();
    expect(motivoContatoDaEquipe(c, AGORA, 7)).not.toBeNull();
  });
  it('origem pelo motivo (registros antigos) e tipo pelo tipo da campanha', () => {
    expect(origemDoMotivo('pediu para sair (lido pela IA)')).toBe('ia');
    expect(origemDoMotivo('não enviar mais (reativação)')).toBe('reativacao');
    expect(origemDoMotivo('não enviar mais (follow-up)')).toBe('cobranca');
    expect(origemDoMotivo('não enviar mais')).toBe('manual');
    expect(tipoDoEnvio({})).toBe('campanha');
    expect(tipoDoEnvio({ tipo: 'followup' })).toBe('cobranca');
    expect(tipoDoEnvio({ tipo: 'reativacao' })).toBe('reativacao');
  });
});
