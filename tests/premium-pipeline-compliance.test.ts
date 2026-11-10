import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ESTADO-DO-PROJETO.md §4: sem contagem de minerais, sem alegação de saúde, sem escassez falsa.
const PROIBIDO = [/\b84\s*\+/, /\+\s*80\b/, /minerais naturais/i, /estoque (é|e|&eacute;) limitado/i, /esgotar/i, /reservado por tempo limitado/i, /colhido artesanalmente/i];

describe('conformidade dos textos da loja (código)', () => {
  for (const f of ['server/email/resend.ts', 'server/lib/orderConfirmation.ts', 'server/lib/ownerAlert.ts', 'server/lib/recoveryCadence.ts']) {
    it(`${f} sem alegações proibidas`, () => {
      const src = readFileSync(f, 'utf8');
      for (const re of PROIBIDO) expect(src, String(re)).not.toMatch(re);
    });
  }
  it('e-mail de carrinho usa a redação fiel ao rótulo', () => {
    expect(readFileSync('server/email/resend.ts', 'utf8')).toContain('Sal marinho n&atilde;o refinado de Mossor&oacute;/RN, seco por evapora&ccedil;&atilde;o solar.');
  });
  it('mensagens inline do cron de pedidos não trazem as alegações', () => {
    const api = readFileSync('api/index.ts', 'utf8');
    const trecho = api.slice(api.indexOf('async function processUnpaidFollowups'), api.indexOf('// Cron endpoint'));
    for (const re of PROIBIDO) expect(trecho, String(re)).not.toMatch(re);
  });
});
