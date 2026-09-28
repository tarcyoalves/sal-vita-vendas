// Trava de versão das migrações. Ver tests/schema-migrations.test.ts e
// CHECKLIST-ALTERACOES.md.
//
// Cada arquivo de migração tem uma constante *_SCHEMA_VERSION. Se o arquivo mudar e a
// versão não, o cold start pula a migração ("caminho rápido") e a mudança NUNCA chega
// ao banco de produção. Este script grava o hash de cada arquivo (sem a linha da
// versão) junto com a versão; o teste compara e reprova o build se faltar o bump.
//
// Uso, depois de alterar uma migração E subir a versão:  npm run schema:lock
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATION_FILES = ['server/db/migrate.ts', 'server/db/ordersMigrate.ts', 'server/db/b2bMigrate.ts'];
export const LOCK_PATH = 'tests/schema-version.lock.json';
const VERSION_LINE = /^const (\w*SCHEMA_VERSION) = '([^']+)';\s*$/m;

export function readMigration(rel) {
  const text = readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(VERSION_LINE);
  if (!m) throw new Error(`${rel}: constante *_SCHEMA_VERSION não encontrada`);
  const hash = createHash('sha256').update(text.replace(VERSION_LINE, '')).digest('hex');
  return { version: m[2], hash };
}

export function computeLock() {
  return Object.fromEntries(MIGRATION_FILES.map((f) => [f, readMigration(f)]));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(path.join(ROOT, LOCK_PATH), JSON.stringify(computeLock(), null, 2) + '\n');
  console.log(`${LOCK_PATH} atualizado.`);
}
