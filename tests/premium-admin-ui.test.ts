import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reviewLines, waNumber } from '../client/src/components/premium/admin/adminLogic';

const admin = readFileSync('client/src/pages/SalVitaAdmin.tsx', 'utf8');
const track = readFileSync('client/src/pages/TrackOrder.tsx', 'utf8');

describe('reviewLines — alertas [REVISAR] das observações', () => {
  it('devolve só as linhas com [REVISAR], sem o carimbo ISO', () => {
    const notes = [
      'Cliente pediu entrega à tarde',
      '[REVISAR] 2026-11-10T12:30:00.000Z pagamento duplicado (2 cobranças aprovadas)',
      '[REVISAR] 2026-11-10T13:00:00Z valor divergente: pago R$ 90,00, pedido R$ 100,00',
    ].join('\n');
    expect(reviewLines(notes)).toEqual([
      '[REVISAR] pagamento duplicado (2 cobranças aprovadas)',
      '[REVISAR] valor divergente: pago R$ 90,00, pedido R$ 100,00',
    ]);
  });

  it('aceita CRLF e linhas com espaços extras', () => {
    expect(reviewLines('  [REVISAR] 2026-11-10T12:30:00.000Z entrega com problema  \r\nobs')).toEqual([
      '[REVISAR] entrega com problema',
    ]);
  });

  it('mantém o texto de [REVISAR] sem data quando não há carimbo', () => {
    expect(reviewLines('[REVISAR] pedido cancelado com pagamento')).toEqual(['[REVISAR] pedido cancelado com pagamento']);
  });

  it('vazio, nulo ou sem marcador devolve lista vazia', () => {
    expect(reviewLines(null)).toEqual([]);
    expect(reviewLines(undefined)).toEqual([]);
    expect(reviewLines('')).toEqual([]);
    expect(reviewLines('só uma observação comum')).toEqual([]);
  });
});

describe('waNumber — número com DDI 55 para wa.me', () => {
  it('acrescenta 55 a DDD + número com máscara', () => {
    expect(waNumber('(84) 99999-9999')).toBe('5584999999999');
  });

  it('acrescenta 55 a número só com dígitos (fixo de 10 dígitos)', () => {
    expect(waNumber('8433221100')).toBe('558433221100');
  });

  it('não duplica quando já vem com 55 (12 ou 13 dígitos)', () => {
    expect(waNumber('+55 84 99999-9999')).toBe('5584999999999');
    expect(waNumber('558433221100')).toBe('558433221100');
  });

  it('vazio ou nulo devolve string vazia (não gera wa.me/55)', () => {
    expect(waNumber('')).toBe('');
    expect(waNumber(null)).toBe('');
    expect(waNumber(undefined)).toBe('');
  });
});

describe('SalVitaAdmin — regras de UI', () => {
  it('observações: textarea e envio de notes só quando alteradas', () => {
    expect(admin).toMatch(/<textarea value=\{form\.notes\}[^>]*rows=\{4\}/);
    expect(admin).toContain('notes !== initialNotes');
  });

  it('links do WhatsApp usam waNumber (sem DDD solto)', () => {
    expect(admin).not.toMatch(/wa\.me\/\$\{\(order\.customerPhone \|\| ''\)\.replace/);
    expect(admin.match(/wa\.me\/\$\{waNumber\(order\.customerPhone\)\}/g)?.length).toBe(2);
  });

  it('aba "Revisar" e banner de revisão no card', () => {
    expect(admin).toContain("key: 'review', label: 'Revisar'");
    expect(admin).toContain("if (filter === 'review') return hasReview(o);");
    expect(admin).toContain('reviewLines(order.notes)');
  });
});

describe('TrackOrder — regras de UI', () => {
  it('bloco "Pagar agora" não aparece para pedido cancelado', () => {
    expect(track).toMatch(/\(order\.paymentStatus === 'awaiting' \|\| order\.paymentStatus === 'failed'\) && order\.status !== 'cancelled'/);
  });

  it('item do pedido usa order.product com fallback', () => {
    expect(track).toContain("{order.quantity}x {order.product || 'Sal Vita Premium 1kg'}");
  });

  it('suporte no WhatsApp nas etapas pagas, com o mesmo número já usado na página', () => {
    expect(track).toContain('Dúvidas? Fale no WhatsApp');
    expect(track.match(/wa\.me\/558421408212/g)?.length).toBe(2);
  });
});
