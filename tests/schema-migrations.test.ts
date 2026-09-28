/**
 * Trava do build contra o erro que derrubou o faturamento em 28/09/2026
 * (HANDOFF-HERMES.md, seção 7, caso M): coluna declarada em server/db/schema.ts
 * sem migração. O Drizzle faz SELECT de todas as colunas declaradas; se uma não
 * existe no banco, TODA consulta naquela tabela falha em produção.
 *
 * Duas checagens:
 *  1. Toda coluna de cada tabela do schema.ts aparece no CREATE TABLE ou num
 *     `ALTER TABLE <tabela> ADD COLUMN IF NOT EXISTS <coluna>` do arquivo de
 *     migração que cria a tabela.
 *  2. Se um arquivo de migração mudou, a constante *_SCHEMA_VERSION dele também
 *     mudou — senão o caminho rápido do cold start pula a migração.
 *
 * Como corrigir está escrito na própria mensagem de erro e em CHECKLIST-ALTERACOES.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — módulo .mjs sem tipos; usado só no teste
import { computeLock, LOCK_PATH, MIGRATION_FILES } from '../scripts/schema-lock.mjs';

const schema = readFileSync('server/db/schema.ts', 'utf8');
const migrations: Record<string, string> = Object.fromEntries(
  (MIGRATION_FILES as string[]).map((f) => [f, readFileSync(f, 'utf8')]),
);

function schemaTables(): Array<{ table: string; columns: string[] }> {
  const out: Array<{ table: string; columns: string[] }> = [];
  for (const m of schema.matchAll(/pgTable\('([a-z_0-9]+)',\s*\{([\s\S]*?)\n\}/g)) {
    const columns = [...m[2].matchAll(/^\s+\w+:\s*\w+\('([a-z_0-9]+)'/gm)].map((c) => c[1]);
    out.push({ table: m[1], columns });
  }
  return out;
}

function migratedColumnsText(file: string, table: string): string | null {
  const text = migrations[file];
  const create = text.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\)`));
  if (!create) return null;
  const alters = [...text.matchAll(new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN IF NOT EXISTS\\s+([a-z_0-9]+)`, 'g'))]
    .map((a) => a[1]);
  return `${create[1]} ${alters.join(' ')}`;
}

describe('schema.ts × migrações', () => {
  const tables = schemaTables();

  it('encontra as tabelas do schema', () => {
    expect(tables.length).toBeGreaterThan(40);
  });

  it('toda tabela do schema é criada em algum arquivo de migração', () => {
    const semCreate = tables
      .filter(({ table }) => !(MIGRATION_FILES as string[]).some((f) => migratedColumnsText(f, table) !== null))
      .map(({ table }) => table);
    expect(
      semCreate,
      `Tabela declarada em schema.ts sem CREATE TABLE IF NOT EXISTS em nenhuma migração: ${semCreate.join(', ')}.\n` +
      'Crie a tabela em server/db/migrate.ts (CRM) ou ordersMigrate.ts (Premium) e suba o *_SCHEMA_VERSION.',
    ).toEqual([]);
  });

  it('toda coluna do schema existe na migração que cria a tabela', () => {
    const faltando: string[] = [];
    for (const { table, columns } of tables) {
      for (const file of MIGRATION_FILES as string[]) {
        const text = migratedColumnsText(file, table);
        if (text === null) continue;
        for (const col of columns) {
          if (!new RegExp(`\\b${col}\\b`).test(text)) faltando.push(`${table}.${col} (${file})`);
        }
      }
    }
    expect(
      faltando,
      `Coluna declarada em schema.ts sem migração — derruba TODA consulta na tabela em produção:\n  ${faltando.join('\n  ')}\n` +
      'Adicione no arquivo indicado: await sql`ALTER TABLE <tabela> ADD COLUMN IF NOT EXISTS <coluna> <TIPO>`;\n' +
      'depois suba o *_SCHEMA_VERSION desse arquivo e rode `npm run schema:lock`.',
    ).toEqual([]);
  });
});

describe('versão das migrações', () => {
  const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as Record<string, { version: string; hash: string }>;
  const now = computeLock() as Record<string, { version: string; hash: string }>;

  for (const file of MIGRATION_FILES as string[]) {
    it(`${file}: mudou ⇒ versão subiu`, () => {
      const antes = lock[file];
      const agora = now[file];
      expect(antes, `${file} não está em ${LOCK_PATH}. Rode \`npm run schema:lock\`.`).toBeDefined();
      if (agora.hash !== antes.hash) {
        expect(
          agora.version,
          `${file} mudou mas a constante *_SCHEMA_VERSION continua "${agora.version}".\n` +
          'Sem subir a versão, o cold start pula a migração e a mudança NUNCA chega ao banco de produção.\n' +
          'Suba a versão (ex.: data de hoje + letra) e rode `npm run schema:lock`.',
        ).not.toBe(antes.version);
      }
      expect(
        agora,
        `${file}: a versão ou o conteúdo mudou e ${LOCK_PATH} não foi atualizado. Rode \`npm run schema:lock\` e commite o arquivo.`,
      ).toEqual(antes);
    });
  }
});
