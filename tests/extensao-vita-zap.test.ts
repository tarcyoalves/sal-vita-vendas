import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { csrfRejection } from '../server/lib/csrfGuard';
import { ACOMPANHANDO_LIMITE, buscaDoVincularVeTodos, ETIQUETA_ACOMPANHAR, etiquetasAoConverter, extrairTermosBusca, findForWhatsappInput, phoneVariants, trechoDasNotas } from '../server/lib/whatsappLead';
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
    // Individual, exceto a busca do vincular feita pelo admin (26/10/2026): decidida SÓ pela função pura abaixo.
    expect(corpo).not.toContain("ctx.user.role === 'admin'");
    expect(corpo).toContain('buscaDoVincularVeTodos(ctx.user.role, input)');
    expect(corpo).toContain('meusLeadsFilter(ctx.user.id');
    expect(corpo).toContain('.limit(FIND_WHATSAPP_LIMITE)');
    for (const proibido of ['email', 'cnpj', 'orderValue']) expect(corpo).not.toContain(`${proibido}: tasks.`);
  });
});

describe('tasks.findForWhatsapp: vincular lead para o admin', () => {
  it('admin buscando por texto (q) vê todos os leads', () => {
    expect(buscaDoVincularVeTodos('admin', { q: 'Padaria' })).toBe(true);
  });
  it('admin consultando por telefone (faixa do lead) continua só com os próprios', () => {
    expect(buscaDoVincularVeTodos('admin', { phone: '5584999990000' })).toBe(false);
    expect(buscaDoVincularVeTodos('admin', { phone: '5584999990000', q: 'Padaria' })).toBe(false);
  });
  it('gerente, atendente e sem papel continuam só com os próprios', () => {
    for (const role of ['manager', 'user', '', null, undefined]) expect(buscaDoVincularVeTodos(role, { q: 'Padaria' })).toBe(false);
  });
  it('o responsável só é devolvido na busca ampliada; lembretes seguem com meusLeadsFilter', () => {
    const fonte = readFileSync('server/routers/tasks.ts', 'utf8');
    const i = fonte.indexOf('findForWhatsapp: protectedProcedure');
    const corpo = fonte.slice(i, fonte.indexOf('getById: protectedProcedure', i));
    expect(corpo).toContain('assignedTo: tasks.assignedTo');
    expect(corpo).toMatch(/veTodos \? \{ assignedTo/);
    expect(fonte).toContain('.where(and(await meusLeadsFilter(ctx.user.id, ctx.user.name ?? \'\'), filtroLembrete))');
  });
});

describe('tasks.findForWhatsapp: busca flexível por frase', () => {
  it('extrai termos relevantes e ignora stop words quando houver outros termos', () => {
    expect(extrairTermosBusca('Guilherme Cliente Gtex')).toEqual(['guilherme', 'cliente', 'gtex']);
    expect(extrairTermosBusca('Padaria do Zé')).toEqual(['padaria', 'ze']);
    expect(extrairTermosBusca('do')).toEqual(['do']);
    expect(extrairTermosBusca('')).toEqual([]);
  });
});

describe('tasks.acompanhando e conversão (Vita Zap 0.7.23, etiqueta "Acompanhar")', () => {
  const fonte = readFileSync('server/routers/tasks.ts', 'utf8');
  const i = fonte.indexOf('acompanhando: protectedProcedure');
  const corpo = fonte.slice(i, fonte.indexOf('getById: protectedProcedure', i));

  it('só os leads do próprio atendente, pendentes, não convertidos, com a etiqueta e com limite', () => {
    expect(i).toBeGreaterThan(0);
    expect(corpo).toContain('meusLeadsFilter(ctx.user.id');
    expect(corpo).not.toContain("ctx.user.role === 'admin'");
    expect(corpo).toContain('ETIQUETA_ACOMPANHAR');
    expect(corpo).toContain("eq(tasks.status, 'pending')");
    expect(corpo).toContain('isNull(tasks.convertedAt)');
    expect(corpo).toContain('.limit(ACOMPANHANDO_LIMITE)');
    expect(ACOMPANHANDO_LIMITE).toBeLessThanOrEqual(100);
    for (const proibido of ['email', 'cnpj', 'orderValue']) expect(corpo).not.toContain(`${proibido}: tasks.`);
  });

  it('converter tira "Acompanhar" e põe "ativo" na mesma gravação (toggleConverted)', () => {
    expect(etiquetasAoConverter(['Acompanhar', 'atacado'])).toEqual(['atacado', 'ativo']);
    expect(etiquetasAoConverter(['ativo', ETIQUETA_ACOMPANHAR])).toEqual(['ativo']);
    expect(etiquetasAoConverter([])).toEqual(['ativo']);
    const t = fonte.slice(fonte.indexOf('toggleConverted: protectedProcedure'));
    expect(t.slice(0, 1500)).toContain('etiquetasAoConverter(currentTags)');
  });
});
