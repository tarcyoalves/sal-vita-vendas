import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csrfRejection } from '../server/lib/csrfGuard';
import { findForWhatsappInput, phoneVariants, trechoDasNotas } from '../server/lib/whatsappLead';
import { EXTENSAO_VITA_ZAP_ID, EXTENSAO_VITA_ZAP_ORIGIN, origensDeExtensao } from '../shared/extensao';

const PROD = ['https://lembretes.salvitarn.com.br', ...origensDeExtensao(undefined)];
const post = (origin?: string) => ({ method: 'POST', contentType: 'application/json', origin });

describe('origem da extensão Vita Zap no csrfGuard/CORS', () => {
  it('o ID fixo corresponde à chave pública do manifest da extensão', () => {
    const manifest = JSON.parse(readFileSync('extensoes/vita-zap/public/manifest.json', 'utf8'));
    const der = Buffer.from(manifest.key, 'base64');
    const id = createHash('sha256').update(der).digest('hex').slice(0, 32).replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
    expect(id).toBe(EXTENSAO_VITA_ZAP_ID);
  });

  it('aceita a extensão e continua aceitando o site', () => {
    expect(csrfRejection(post(EXTENSAO_VITA_ZAP_ORIGIN), PROD)).toBeNull();
    expect(csrfRejection(post('https://lembretes.salvitarn.com.br'), PROD)).toBeNull();
  });

  it('recusa outra extensão, outro site e variações da origem', () => {
    expect(csrfRejection(post('chrome-extension://' + 'a'.repeat(32)), PROD)).toBe('Origem não permitida');
    expect(csrfRejection(post(`${EXTENSAO_VITA_ZAP_ORIGIN}.evil.com`), PROD)).toBe('Origem não permitida');
    expect(csrfRejection(post('chrome-extension://*'), PROD)).toBe('Origem não permitida');
    expect(csrfRejection(post('https://evil.example'), PROD)).toBe('Origem não permitida');
  });

  it('continua exigindo JSON e bloqueando cross-site', () => {
    expect(csrfRejection({ method: 'POST', contentType: 'text/plain', origin: EXTENSAO_VITA_ZAP_ORIGIN }, PROD)).toBe('Content-Type inválido');
    expect(csrfRejection({ ...post(EXTENSAO_VITA_ZAP_ORIGIN), secFetchSite: 'cross-site' }, PROD)).toBe('Origem cruzada não permitida');
  });

  it('EXTENSION_ORIGINS substitui o padrão, só com origens de extensão bem formadas', () => {
    const outra = 'chrome-extension://' + 'b'.repeat(32);
    expect(origensDeExtensao(undefined)).toEqual([EXTENSAO_VITA_ZAP_ORIGIN]);
    expect(origensDeExtensao('')).toEqual([EXTENSAO_VITA_ZAP_ORIGIN]);
    expect(origensDeExtensao(`${outra}, ${EXTENSAO_VITA_ZAP_ORIGIN}`)).toEqual([outra, EXTENSAO_VITA_ZAP_ORIGIN]);
    expect(origensDeExtensao(`*, chrome-extension://*, https://evil.example, chrome-extension://${'z'.repeat(32)}`)).toEqual([EXTENSAO_VITA_ZAP_ORIGIN]);
    expect(origensDeExtensao(outra)).toEqual([outra]);
  });
});

describe('tasks.findForWhatsapp: entrada', () => {
  it('exige phone ou q', () => {
    expect(findForWhatsappInput.safeParse({}).success).toBe(false);
    expect(findForWhatsappInput.safeParse({ phone: '' }).success).toBe(false);
    expect(findForWhatsappInput.safeParse({ phone: '5584999990000' }).success).toBe(true);
    expect(findForWhatsappInput.safeParse({ q: 'Padaria' }).success).toBe(true);
  });

  it('q: mínimo 2 e máximo 100 caracteres (depois de aparar)', () => {
    expect(findForWhatsappInput.safeParse({ q: 'a' }).success).toBe(false);
    expect(findForWhatsappInput.safeParse({ q: ' a ' }).success).toBe(false);
    expect(findForWhatsappInput.safeParse({ q: 'ab' }).success).toBe(true);
    expect(findForWhatsappInput.safeParse({ q: 'x'.repeat(100) }).success).toBe(true);
    expect(findForWhatsappInput.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
  });

  it('phone: limite de tamanho e tipo', () => {
    expect(findForWhatsappInput.safeParse({ phone: '9'.repeat(41) }).success).toBe(false);
    expect(findForWhatsappInput.safeParse({ phone: 5584999990000 }).success).toBe(false);
  });
});

describe('tasks.findForWhatsapp: telefone e notas', () => {
  it('variantes: com e sem 55, com e sem o 9 extra', () => {
    expect(phoneVariants('+55 (84) 99999-0000').sort()).toEqual(['84999990000', '8499990000', '558499990000', '5584999990000'].sort());
    expect(phoneVariants('558499990000')).toContain('84999990000');
    expect(phoneVariants('1234')).toEqual([]);
    expect(phoneVariants(null)).toEqual([]);
  });

  it('trecho das notas: últimos 500 caracteres', () => {
    expect(trechoDasNotas(null)).toBe('');
    expect(trechoDasNotas('curta')).toBe('curta');
    const longa = 'a'.repeat(300) + 'b'.repeat(500);
    expect(trechoDasNotas(longa)).toBe('b'.repeat(500));
  });

  it('a procedure respeita o filtro de dono, tem limite e não devolve campos além dos combinados', () => {
    const fonte = readFileSync('server/routers/tasks.ts', 'utf8');
    const i = fonte.indexOf('findForWhatsapp: protectedProcedure');
    const corpo = fonte.slice(i, fonte.indexOf('getById: protectedProcedure', i));
    expect(i).toBeGreaterThan(0);
    expect(corpo).toContain("ctx.user.role === 'admin'");
    expect(corpo).toContain('userTaskFilter(ctx.user.id');
    expect(corpo).toContain('.limit(FIND_WHATSAPP_LIMITE)');
    for (const proibido of ['email', 'cnpj', 'assignedTo', 'orderValue']) expect(corpo).not.toContain(`${proibido}: tasks.`);
  });
});
