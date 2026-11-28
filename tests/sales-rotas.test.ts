// Rotas do Hermes (server/salesRoutes.ts): autenticação por escopo, validação, limites de corpo e
// testes de código-fonte (autentica antes de aguardar schema; nada do Sales AI usa Resend/Brevo).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HERMES_SCOPES, reservarBodySchema, eventoCaixaBodySchema } from '../shared/sales';
import {
  corpoExcedeLimite, decidirAutenticacao, idDaRota, segredoDoEscopo, tamanhoJson, validarCorpo, LIMITE_CORPO, SEGREDO_MIN,
} from '../server/lib/sales/rotasPuro';
import { rotaMapeada } from '../server/lib/schemasNecessarios';

const raiz = join(__dirname, '..');
const SEGREDO = 'segredo-longo-de-teste-123456';

describe('autenticação por escopo', () => {
  it('variável ausente, vazia ou curta → 503 "escopo desativado" (falha fechado)', () => {
    for (const s of [undefined, '', '   ', 'curto']) {
      expect(decidirAutenticacao(s, `Bearer ${s ?? 'x'}`)).toEqual({ ok: false, http: 503, corpo: { error: 'escopo desativado' } });
    }
    expect(SEGREDO_MIN).toBeGreaterThanOrEqual(16);
  });
  it('sem cabeçalho, formato errado ou segredo errado → 401', () => {
    for (const h of [undefined, '', SEGREDO, `Basic ${SEGREDO}`, `Bearer ${SEGREDO} extra`, `Bearer ${SEGREDO}x`, `Bearer ${SEGREDO.slice(1)}`]) {
      expect(decidirAutenticacao(SEGREDO, h)).toEqual({ ok: false, http: 401, corpo: { error: 'Unauthorized' } });
    }
  });
  it('segredo certo → ok (também com cabeçalho repetido)', () => {
    expect(decidirAutenticacao(SEGREDO, `Bearer ${SEGREDO}`)).toEqual({ ok: true });
    expect(decidirAutenticacao(SEGREDO, [`Bearer ${SEGREDO}`, 'Bearer outro'])).toEqual({ ok: true });
  });
  it('cada escopo lê a própria variável; um segredo não abre outro escopo', () => {
    const env = { [HERMES_SCOPES.leitura]: SEGREDO, [HERMES_SCOPES.despacho]: 'outro-segredo-de-despacho-9' };
    expect(segredoDoEscopo('leitura', env)).toBe(SEGREDO);
    expect(segredoDoEscopo('operacao', env)).toBeUndefined();
    expect(decidirAutenticacao(segredoDoEscopo('despacho', env), `Bearer ${SEGREDO}`)).toMatchObject({ ok: false, http: 401 });
    expect(decidirAutenticacao(segredoDoEscopo('operacao', env), `Bearer ${SEGREDO}`)).toMatchObject({ ok: false, http: 503 });
  });
});

describe('validação e limites de corpo', () => {
  it('corpo com campo a mais ou tipo errado → 400', () => {
    expect(validarCorpo(reservarBodySchema, { executor: 'exec-1', max: 5 })).toEqual({ ok: true, dados: { executor: 'exec-1', max: 5 } });
    expect(validarCorpo(reservarBodySchema, { executor: 'exec-1', max: 5, x: 1 })).toMatchObject({ ok: false, http: 400 });
    expect(validarCorpo(reservarBodySchema, { executor: 'e', max: 5 })).toMatchObject({ ok: false, http: 400 });
    expect(validarCorpo(reservarBodySchema, { executor: 'exec-1', max: 50 })).toMatchObject({ ok: false, http: 400 });
    expect(validarCorpo(reservarBodySchema, undefined)).toMatchObject({ ok: false, http: 400 });
  });
  it('evento: e-mail normalizado pelo schema', () => {
    const v = validarCorpo(eventoCaixaBodySchema, { idempotencyKey: '<abc@x.com>', tipo: 'RESPOSTA', email: ' Fulano@X.com ' });
    expect(v.ok && v.dados.email).toBe('fulano@x.com');
  });
  it('Content-Length acima do teto (ou inválido) → recusa; sem cabeçalho confere depois', () => {
    expect(corpoExcedeLimite('100', LIMITE_CORPO.pequeno)).toBe(false);
    expect(corpoExcedeLimite(String(LIMITE_CORPO.pequeno + 1), LIMITE_CORPO.pequeno)).toBe(true);
    expect(corpoExcedeLimite('abc', LIMITE_CORPO.pequeno)).toBe(true);
    expect(corpoExcedeLimite(undefined, LIMITE_CORPO.pequeno)).toBe(false);
    expect(tamanhoJson({ a: 'é' })).toBe(Buffer.byteLength('{"a":"é"}'));
  });
  it(':id da rota: só inteiro positivo', () => {
    expect(idDaRota('12')).toBe(12);
    for (const v of [undefined, '', '0', '-1', '1.5', 'abc', '99999999999']) expect(idDaRota(v)).toBeNull();
  });
});

describe('server/salesRoutes.ts — código-fonte', () => {
  const fonte = readFileSync(join(raiz, 'server/salesRoutes.ts'), 'utf8');
  const rotas = [...fonte.matchAll(/\bapp\.(get|post)\(\s*'([^']+)'([^\n]*)/g)].map((m) => ({ metodo: m[1].toUpperCase(), caminho: m[2], resto: m[3] }));

  it('as rotas do contrato, com o escopo certo', () => {
    const esperado = [
      ['GET', '/api/sales/modo', 'leitura'],
      ['POST', '/api/sales/fila/reservar', 'despacho'],
      ['POST', '/api/sales/envio/:id/autorizar', 'despacho'],
      ['POST', '/api/sales/envio/:id/resultado', 'despacho'],
      ['POST', '/api/sales/caixa/eventos', 'despacho'],
      ['GET', '/api/sales/relatorio', 'leitura'],
      ['POST', '/api/sales/propostas', 'propostas'],
      ['POST', '/api/sales/heartbeat', 'leitura'],
      ['POST', '/api/sales/ciclo', 'operacao'],
    ];
    expect(rotas.map((r) => [r.metodo, r.caminho, /portao\('(\w+)'\)/.exec(r.resto)?.[1]])).toEqual(esperado);
  });
  it('todo caminho começa com /api/sales/ e tem regra em schemasNecessarios', () => {
    for (const r of rotas) {
      expect(r.caminho.startsWith('/api/sales/')).toBe(true);
      expect(rotaMapeada(r.caminho.replace(/:[A-Za-z]+/g, '1'), r.metodo)).toBe(true);
    }
  });
  it('em toda rota o portão vem antes do handler, e o teto de corpo antes do portão nos POST', () => {
    for (const r of rotas) {
      const iPortao = r.resto.indexOf('portao(');
      expect(iPortao).toBeGreaterThan(-1);
      expect(iPortao).toBeLessThan(r.resto.indexOf('handler('));
      if (r.metodo === 'POST') expect(r.resto.indexOf('tetoDeCorpo(')).toBeLessThan(iPortao);
    }
  });
  it('o portão autentica ANTES de aguardar o schema, e só ele aguarda', () => {
    const i = fonte.indexOf('const portao =');
    expect(i).toBeGreaterThan(-1);
    const trecho = fonte.slice(i, fonte.indexOf('};', i));
    const iAuth = trecho.indexOf('decidirAutenticacao(');
    const iRecusa = trecho.indexOf('return;');
    const iSchema = trecho.indexOf('deps.aguardarSchemas(req)');
    expect(iAuth).toBeGreaterThan(-1);
    expect(iRecusa).toBeGreaterThan(iAuth);
    expect(iSchema).toBeGreaterThan(iRecusa);
    // Nenhum outro ponto do arquivo acorda o banco.
    expect(fonte.split('aguardarSchemas(').length - 1).toBe(1);
  });
});

/** Todos os .ts de um diretório, recursivo. */
function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('o Sales AI nunca usa Resend/Brevo (políticas proíbem prospecção fria)', () => {
  const alvo = [...arquivos(join(raiz, 'server/lib/sales')), join(raiz, 'server/salesRoutes.ts')];
  it('nenhum import dos remetentes de e-mail do sistema', () => {
    const proibidos = /from\s+['"][^'"]*(email\/resend|email\/marketing|email\/brevo|\bresend\b|brevo|sib-api|nodemailer)[^'"]*['"]|require\(\s*['"][^'"]*(resend|brevo|nodemailer)/i;
    const achados = alvo.filter((f) => proibidos.test(readFileSync(f, 'utf8'))).map((f) => f.slice(raiz.length + 1));
    expect(achados).toEqual([]);
    expect(alvo.length).toBeGreaterThan(10);
  });
  it('nenhuma chamada a sendEmail/sendBatch', () => {
    const achados = alvo.filter((f) => /\b(sendEmail|sendBatch)\s*\(/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(raiz.length + 1));
    expect(achados).toEqual([]);
  });
  it('sem "as any" no código do Sales AI', () => {
    const achados = alvo.filter((f) => /\bas any\b/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(raiz.length + 1));
    expect(achados).toEqual([]);
  });
});
