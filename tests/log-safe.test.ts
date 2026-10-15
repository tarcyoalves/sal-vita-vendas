import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { maskEmail, maskPhone, redact, safeErr } from '../server/lib/logSafe';

function listTs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? listTs(p) : p.endsWith('.ts') ? [p] : [];
  });
}

// Guarda de regressão: nenhuma linha de console.* interpola e-mail/telefone/nome crus.
describe('logs sem PII crua', () => {
  const files = [...listTs(join(__dirname, '..', 'server')), join(__dirname, '..', 'api', 'index.ts')]
    .filter((f) => !/(seed|update-admin)\.ts$/.test(f)); // scripts de CLI rodados pelo dono no terminal
  it('console.* não interpola e-mail/telefone/nome sem máscara', () => {
    const ruim = /\$\{\s*(recipientEmail|email|to|msg\.to|phone|clientPhone|ctx\.user\.name|ctx\.user\.email)\s*\}/;
    const achados: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/console\.(log|warn|error|info)\(/.test(l) && ruim.test(l)) achados.push(`${f}:${i + 1}`);
      });
    }
    expect(achados).toEqual([]);
  });
});

describe('maskEmail', () => {
  it('mantém só a inicial e o domínio', () => {
    expect(maskEmail('joao.silva@gmail.com')).toBe('j***@gmail.com');
  });
  it('não vaza quando o valor não é e-mail', () => {
    expect(maskEmail('semarroba')).toBe('***');
    expect(maskEmail('')).toBe('***');
    expect(maskEmail(null)).toBe('***');
    expect(maskEmail('@x.com')).toBe('***');
  });
});

describe('maskPhone', () => {
  it('mantém só os 4 últimos dígitos', () => {
    expect(maskPhone('(84) 99999-1234')).toBe('***1234');
    expect(maskPhone('5584999991234')).toBe('***1234');
  });
  it('vazio vira ***', () => {
    expect(maskPhone(undefined)).toBe('***');
  });
});

describe('redact', () => {
  it('mascara e-mail dentro de texto livre', () => {
    const out = redact('The to address maria@empresa.com.br is invalid');
    expect(out).not.toContain('maria@');
    expect(out).toContain('m***@empresa.com.br');
  });
  it('mascara CPF e CNPJ formatados', () => {
    const out = redact('doc 123.456.789-09 e 12.345.678/0001-95');
    expect(out).not.toContain('123.456.789-09');
    expect(out).not.toContain('12.345.678/0001-95');
  });
  it('mascara telefone formatado mas preserva ids numéricos', () => {
    expect(redact('tel (84) 99999-1234')).not.toContain('99999-1234');
    expect(redact('pagamento 1234567890123 do pedido 55')).toBe('pagamento 1234567890123 do pedido 55');
  });
  it('remove Bearer, JWT, pares secret=/token= e chaves de provedor', () => {
    expect(redact('Authorization: Bearer abcdef1234567890')).not.toContain('abcdef1234567890');
    expect(redact('https://x/api/brevo-webhook?secret=SuperSegredo123&a=1')).not.toContain('SuperSegredo123');
    expect(redact('?secret=SuperSegredo123&a=1')).toContain('a=1');
    expect(redact('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OA.abc123')).toBe('[jwt]');
    expect(redact('key re_AbCdEfGhIjKlMnOpQrSt')).not.toContain('AbCdEfGhIjKl');
  });
  it('limita o tamanho', () => {
    expect(redact('a'.repeat(1000)).length).toBeLessThanOrEqual(301);
  });
  it('aceita null/undefined', () => {
    expect(redact(undefined)).toBe('');
    expect(redact(null)).toBe('');
  });
});

describe('safeErr', () => {
  it('corta os parâmetros do SQL do Drizzle', () => {
    const e = new Error('Failed query: insert into "clients" ("email") values ($1)\nparams: ana@x.com,Ana Silva,84999991234');
    const out = safeErr(e);
    expect(out).not.toContain('ana@x.com');
    expect(out).not.toContain('Ana Silva');
    expect(out).not.toContain('84999991234');
    expect(out).toContain('Failed query');
  });
  it('inclui código e status, sem pilha', () => {
    const e = Object.assign(new Error('boom'), { code: '23505', status: 500 });
    const out = safeErr(e);
    expect(out).toContain('code=23505');
    expect(out).toContain('status=500');
    expect(out).not.toContain(' at ');
  });
  it('redige a causa (pg) e o e-mail dentro dela', () => {
    const e = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('duplicate key (email)=(a@b.com)'), { code: '23505' }),
    });
    const out = safeErr(e);
    expect(out).toContain('causa.code=23505');
    expect(out).not.toContain('a@b.com');
  });
  it('trata valores que não são Error', () => {
    expect(safeErr(undefined)).toBe('erro desconhecido');
    expect(safeErr('falhou para x@y.com')).not.toContain('x@y.com');
    expect(safeErr({})).toBe('erro desconhecido');
  });
});
