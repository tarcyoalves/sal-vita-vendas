/**
 * Radar de Cargas — funções puras de server/lib/radar/leads.ts.
 *
 * O ponto mais importante aqui é o formato de título/descrição da tarefa:
 * client/src/lib/tasks/location.ts é quem extrai cidade/UF de volta para os
 * filtros da tela de Tarefas, e essa extração nunca "inventa" localização —
 * se o formato não bater, a tarefa some dos filtros de cidade/estado
 * silenciosamente. Por isso o teste importa a função real de extração, não
 * uma cópia.
 */
import { describe, expect, it } from 'vitest';
import {
  isLikelyMobile,
  formatPhoneDigits,
  toRadarPhone,
  establishmentPhones,
  pickTaskPhone,
  segmentLabelsForCnaes,
  buildLead,
  taskTitle,
  taskDescription,
  buildTaskNotes,
} from '../server/lib/radar/leads';
import { extractLocation } from '../client/src/lib/tasks/location';
import type { RadarEstablishment } from '../server/db/schema';
import type { RadarCrmStatus, RadarMunicipality } from '../shared/radar';

function makeEstablishment(overrides: Partial<RadarEstablishment> = {}): RadarEstablishment {
  return {
    cnpj: '12345678000199',
    razaoSocial: 'ATACADO EXEMPLO LTDA',
    nomeFantasia: null,
    cnaePrincipal: '4623109',
    cnaesAlvo: ['4623109'],
    municipioIbge: 4102604,
    uf: 'PR',
    endereco: 'Rua Exemplo, 100',
    cep: '85750-000',
    telefone1: null,
    telefone2: null,
    email: null,
    porte: '01',
    dataInicio: '2010-01-01',
    sourceRelease: '2026-09',
    importedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

describe('radar leads — telefone', () => {
  it('reconhece celular (11 dígitos, 3º dígito 9) e não confunde com fixo', () => {
    expect(isLikelyMobile('49991234567')).toBe(true);
    expect(isLikelyMobile('4935441234')).toBe(false); // fixo, 10 dígitos
    expect(isLikelyMobile('49912345')).toBe(false); // curto demais
  });

  it('formata fixo e celular corretamente', () => {
    expect(formatPhoneDigits('4935441234')).toBe('(49) 3544-1234');
    expect(formatPhoneDigits('49991234567')).toBe('(49) 99123-4567');
  });

  it('descarta telefone com quantidade de dígitos inválida (lixo da base)', () => {
    expect(toRadarPhone('123')).toBeNull();
    expect(toRadarPhone('123456789012')).toBeNull();
    const valid = toRadarPhone('(49) 99123-4567');
    expect(valid).toEqual({ digits: '49991234567', formatted: '(49) 99123-4567', likelyMobile: true });
  });

  it('establishmentPhones ignora nulos e não duplica telefone repetido', () => {
    const row = makeEstablishment({ telefone1: '4935441234', telefone2: '4935441234' });
    expect(establishmentPhones(row)).toHaveLength(1);

    const rowNoPhones = makeEstablishment();
    expect(establishmentPhones(rowNoPhones)).toEqual([]);

    const rowTwo = makeEstablishment({ telefone1: '4935441234', telefone2: '49991234567' });
    expect(establishmentPhones(rowTwo).map((p) => p.digits)).toEqual(['4935441234', '49991234567']);
  });

  it('pickTaskPhone: override do atendente > provável celular > telefone1', () => {
    const phones = [
      { digits: '4935441234', formatted: '(49) 3544-1234', likelyMobile: false },
      { digits: '49991234567', formatted: '(49) 99123-4567', likelyMobile: true },
    ];
    expect(pickTaskPhone(phones, '49988887777')).toBe('49988887777');
    expect(pickTaskPhone(phones)).toBe('49991234567'); // prefere o celular
    expect(pickTaskPhone([phones[0]])).toBe('4935441234'); // só tem fixo
    expect(pickTaskPhone([])).toBeUndefined();
  });
});

describe('radar leads — segmentos e lead', () => {
  it('segmentLabelsForCnaes devolve só os rótulos casados', () => {
    expect(segmentLabelsForCnaes(['4623109'])).toEqual(['Atacado de rações']);
    expect(segmentLabelsForCnaes(['4623109', '1052000'])).toEqual(['Atacado de rações', 'Laticínios']);
    expect(segmentLabelsForCnaes(['9999999'])).toEqual([]);
  });

  it('buildLead monta o RadarLead com distância arredondada e status do CRM', () => {
    const row = makeEstablishment({ telefone1: '49991234567', email: 'contato@exemplo.com' });
    const municipio: RadarMunicipality = { ibge: 4102604, nome: 'Barracão', uf: 'PR' };
    const crm: RadarCrmStatus = { kind: 'novo' };
    const phones = establishmentPhones(row);
    const lead = buildLead(row, municipio, 12.6, true, phones, crm, false);

    expect(lead.cnpj).toBe(row.cnpj);
    expect(lead.distanceKm).toBe(13); // arredondado
    expect(lead.matchedByPrincipal).toBe(true);
    expect(lead.segments).toEqual(['racao_atacado']);
    expect(lead.phones).toHaveLength(1);
    expect(lead.crm).toEqual({ kind: 'novo' });
    expect(lead.emailSuppressed).toBe(false);
  });
});

describe('radar leads — título/descrição da tarefa e leitura de volta', () => {
  it('title e description no formato lido por extractLocation', () => {
    const title = taskTitle('Atacado Exemplo Ltda', 'Dionísio Cerqueira', 'SC');
    const description = taskDescription('Dionísio Cerqueira', 'SC');

    expect(title).toBe('Atacado Exemplo Ltda - Dionísio Cerqueira - SC');
    expect(description).toBe('Dionísio Cerqueira - SC');

    // A tela de Tarefas prioriza a description; confirma que ambas batem.
    expect(extractLocation({ description, title })).toEqual({ city: 'DIONÍSIO CERQUEIRA', state: 'SC' });
    expect(extractLocation({ description: null, title })).toEqual({ city: 'DIONÍSIO CERQUEIRA', state: 'SC' });
  });

  it('funciona mesmo quando o nome da empresa tem hífen sem espaços ao redor', () => {
    const title = taskTitle('Sal-Vita Comércio', 'Barracão', 'RS');
    expect(extractLocation({ description: null, title })).toEqual({ city: 'BARRACÃO', state: 'RS' });
  });
});

describe('radar leads — notas da tarefa', () => {
  it('inclui os campos obrigatórios e a mensagem sugerida quando informada', () => {
    const notes = buildTaskNotes({
      originLabel: 'Barracão - PR',
      bags: 400,
      cnpj: '12345678000199',
      razaoSocial: 'ATACADO EXEMPLO LTDA',
      endereco: 'Rua Exemplo, 100',
      sourceRelease: '2026-09',
      message: 'Olá, temos saldo de sal disponível.',
      now: new Date('2026-09-25T15:00:00-03:00'),
    });

    expect(notes).toContain('Radar de Cargas — completar carga de Barracão - PR (400 sacos de 25 kg)');
    expect(notes).toContain('25/09/2026');
    expect(notes).toContain('CNPJ: 12.345.678/0001-99');
    expect(notes).toContain('Razão social: ATACADO EXEMPLO LTDA');
    expect(notes).toContain('Endereço: Rua Exemplo, 100');
    expect(notes).toContain('Base Receita: 2026-09');
    expect(notes).toContain('Mensagem sugerida:');
    expect(notes).toContain('Olá, temos saldo de sal disponível.');
  });

  it('omite o bloco de mensagem sugerida quando não há mensagem', () => {
    const notes = buildTaskNotes({
      originLabel: 'Barracão - PR',
      bags: 400,
      cnpj: '12345678000199',
      razaoSocial: 'ATACADO EXEMPLO LTDA',
      endereco: null,
      sourceRelease: '2026-09',
      now: new Date('2026-09-25T15:00:00-03:00'),
    });

    expect(notes).not.toContain('Mensagem sugerida');
    expect(notes).toContain('Endereço: não informado');
  });
});
