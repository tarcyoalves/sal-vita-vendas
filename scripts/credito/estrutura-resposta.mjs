#!/usr/bin/env node
// Lista a ESTRUTURA (caminhos, tipos e um exemplo curto) de um JSON já sanitizado da sonda, para o Claude mapear campos
// sem precisar de 900 linhas de dados. Uso: node scripts/credito/estrutura-resposta.mjs sonda-saida/<cnpj>/<endpoint>.json
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const linhas = [];
function andar(v, caminho) {
  if (Array.isArray(v)) { linhas.push(`${caminho}  [array × ${v.length}]`); if (v.length) andar(v[0], `${caminho}[0]`); return; }
  if (v && typeof v === 'object') { for (const [k, x] of Object.entries(v)) andar(x, caminho ? `${caminho}.${k}` : k); return; }
  linhas.push(`${caminho}  = ${typeof v === 'string' ? JSON.stringify(v.slice(0, 60)) : String(v)}`);
}
andar(j, '');
console.log(linhas.join('\n'));
