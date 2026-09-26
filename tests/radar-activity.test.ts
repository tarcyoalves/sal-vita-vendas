import { describe, it, expect } from 'vitest';
import { toRadarLeadActivity, buildTaskNotes } from '../server/lib/radar/leads';
import type { RadarLeadActionRow } from '../server/db/schema';
import { EMPTY_RADAR_ACTIVITY, discardReasonLabel } from '../shared/radar';

const base: RadarLeadActionRow = {
  cnpj: '12345678000195',
  contactedAt: null, contactedByUserId: null, contactedByName: null, contactChannel: null, contactCount: 0,
  discardedAt: null, discardedByUserId: null, discardedByName: null, discardReason: null, discardNote: null,
  updatedAt: new Date('2026-09-26T12:00:00Z'),
};

describe('toRadarLeadActivity', () => {
  it('sem linha = nada feito', () => {
    expect(toRadarLeadActivity(undefined)).toEqual(EMPTY_RADAR_ACTIVITY);
  });

  it('contato registrado', () => {
    const a = toRadarLeadActivity({
      ...base, contactedAt: new Date('2026-09-26T13:00:00Z'), contactedByName: 'Analice', contactChannel: 'whatsapp', contactCount: 2,
    });
    expect(a).toMatchObject({ contactedAt: '2026-09-26T13:00:00.000Z', contactedByName: 'Analice', contactChannel: 'whatsapp', contactCount: 2, discarded: null });
  });

  it('descarte com motivo; motivo/canal desconhecido não quebra', () => {
    const a = toRadarLeadActivity({
      ...base, contactedAt: new Date(), contactChannel: 'pombo-correio',
      discardedAt: new Date('2026-09-26T14:00:00Z'), discardedByName: 'Matheus', discardReason: 'motivo-novo', discardNote: 'x',
    });
    expect(a.contactChannel).toBeNull();
    expect(a.discarded).toEqual({ at: '2026-09-26T14:00:00.000Z', byName: 'Matheus', reason: 'outro', note: 'x' });
  });

  it('rótulos de motivo', () => {
    expect(discardReasonLabel('nao_contatar')).toBe('Pediu para não ser contatado');
    expect(discardReasonLabel('xyz')).toBe('xyz');
  });
});

describe('buildTaskNotes com contato feito pela lista', () => {
  const common = {
    originLabel: 'Barracão - PR', bags: 400, cnpj: '12345678000195', razaoSocial: 'AGRO X LTDA',
    endereco: null, sourceRelease: '2026-09', now: new Date('2026-09-26T15:00:00Z'),
  };

  it('registra quem contatou, por onde, e o resultado', () => {
    const notes = buildTaskNotes({
      ...common,
      contact: { at: new Date('2026-09-26T13:00:00Z'), byName: 'Analice', channel: 'whatsapp' },
      contactNote: 'Quer 200 sacos, pediu orçamento.',
      message: 'Olá!',
    });
    expect(notes).toContain('Contatado pelo Radar por WhatsApp em 26/09/2026 por Analice');
    expect(notes).toContain('Resultado do contato:\nQuer 200 sacos, pediu orçamento.');
    expect(notes).toContain('Mensagem usada no contato:\nOlá!');
    expect(notes).not.toContain('Mensagem sugerida');
  });

  it('sem contato continua como antes', () => {
    const notes = buildTaskNotes({ ...common, message: 'Olá!' });
    expect(notes).toContain('Mensagem sugerida:\nOlá!');
    expect(notes).not.toContain('Contatado pelo Radar');
  });
});
