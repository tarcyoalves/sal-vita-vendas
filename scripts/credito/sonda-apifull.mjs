#!/usr/bin/env node
// Sonda de custo-benefício da API Full para UM CNPJ real. GASTA CRÉDITO (cada endpoint é uma consulta paga).
// Uso (na máquina que tem o token, NUNCA no repositório):
//   APIFULL_API_TOKEN=... node scripts/credito/sonda-apifull.mjs 86628401000106 serasa-premium scpc-boavista ... --confirmar
// Sem --confirmar só mostra o plano. Mede o custo REAL de cada endpoint pela diferença de saldo (get-balance antes/depois),
// guarda a resposta SANITIZADA (CPF/nome de pessoa/contatos mascarados) em ./sonda-saida/<cnpj>/<endpoint>.json
// e imprime um quadro: custo, status, nº de campos, chaves de 1º nível. O token nunca é impresso nem gravado.
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'https://api.apifull.com.br';
const token = process.env.APIFULL_API_TOKEN;
const args = process.argv.slice(2);
const confirmar = args.includes('--confirmar');
const [cnpjBruto, ...resto] = args.filter((a) => !a.startsWith('--'));
const cnpj = (cnpjBruto ?? '').replace(/\D/g, '');
const endpoints = resto;

if (!token) { console.error('Defina APIFULL_API_TOKEN no ambiente.'); process.exit(1); }
if (cnpj.length !== 14) { console.error('Informe um CNPJ de 14 dígitos.'); process.exit(1); }
if (!endpoints.length) { console.error('Informe os endpoints (ex.: serasa-premium scpc-boavista pj-define-risco).'); process.exit(1); }
if (endpoints.length > 6) { console.error('Máximo de 6 endpoints por execução (custo).'); process.exit(1); }
for (const e of endpoints) if (!/^[a-z0-9-]{3,40}$/.test(e)) { console.error(`Endpoint inválido: ${e}`); process.exit(1); }

const H = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
async function saldo() {
  const r = await fetch(`${BASE}/api/get-balance`, { headers: H, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => null);
  // Formato real: {"dados":{"Saldo":25.44}} — procura em profundidade o 1º número cuja chave lembre saldo.
  const achar = (o) => { if (!o || typeof o !== 'object') return null; for (const [k, v] of Object.entries(o)) { if (typeof v === 'number' && /saldo|balance|credit/i.test(k)) return v; const r = achar(v); if (r !== null) return r; } return null; };
  const n = achar(j);
  return { http: r.status, valor: typeof n === 'number' ? n : null, bruto: j && typeof j === 'object' ? Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v !== 'object')) : null };
}

const CHAVES_PESSOAIS = /(^|_)(nome|name|cpf|mae|pai|email|e-mail|telefone|phone|celular|rg|nascimento|endereco)$/i;
const MANTER = /(razao|fantasia|empresa|company|cnae|atividade|natureza|municipio|cidade|uf|estado)/i;
function sanitizar(v, chave = '', dentroDeSocio = false) {
  if (Array.isArray(v)) return v.map((x) => sanitizar(x, chave, dentroDeSocio || /socio|administ|qsa|acionista/i.test(chave)));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitizar(x, k, dentroDeSocio || /socio|administ|qsa|acionista/i.test(k))]));
  if (typeof v === 'string') {
    let s = v.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***.***.***-**');
    if ((CHAVES_PESSOAIS.test(chave) || (dentroDeSocio && /nome/i.test(chave))) && !MANTER.test(chave)) s = s ? '«mascarado»' : s;
    return s;
  }
  return v;
}
const contarCampos = (v) => (Array.isArray(v) ? v.reduce((s, x) => s + contarCampos(x), 0) : v && typeof v === 'object' ? Object.values(v).reduce((s, x) => s + 1 + contarCampos(x), 0) : 0);

console.log(`CNPJ ${cnpj} — endpoints: ${endpoints.join(', ')} — ${confirmar ? 'EXECUTANDO (gasta crédito)' : 'PLANO (nada executado; use --confirmar)'}`);
if (!confirmar) process.exit(0);

const s0 = await saldo();
console.log(`Saldo inicial: ${s0.valor ?? 'não reconhecido'} (HTTP ${s0.http})`);
const pasta = `sonda-saida/${cnpj}`; mkdirSync(pasta, { recursive: true });
const quadro = [];
let anterior = s0.valor;
for (const ep of endpoints) {
  let http = null, status = null, corpo = null, erro = null;
  try {
    const r = await fetch(`${BASE}/api/${ep}`, { method: 'POST', headers: H, body: JSON.stringify({ link: ep, document: cnpj, cnpj }), signal: AbortSignal.timeout(60000) });
    http = r.status; corpo = await r.json().catch(() => null); status = corpo && typeof corpo === 'object' ? corpo.status ?? null : null;
  } catch (e) { erro = e instanceof Error ? e.message : String(e); }
  const s = await saldo();
  const custo = anterior !== null && s.valor !== null ? Math.round((anterior - s.valor) * 100) / 100 : null;
  anterior = s.valor ?? anterior;
  if (corpo) writeFileSync(`${pasta}/${ep}.json`, JSON.stringify(sanitizar(corpo), null, 2));
  quadro.push({ endpoint: ep, http, status, custoReais: custo, campos: corpo ? contarCampos(corpo) : 0, chaves: corpo && typeof corpo === 'object' ? Object.keys(corpo).join(',') : '', dados: corpo && typeof corpo.dados === 'object' && corpo.dados ? Object.keys(corpo.dados).slice(0, 25).join(',') : '', erro });
}
console.table(quadro);
// Extrato oficial (custo exato de cada consulta), últimos 2 dias, sem dados pessoais.
try {
  const hoje = new Date(); const ini = new Date(hoje.getTime() - 2 * 86400000);
  const f = (d) => d.toISOString().slice(0, 10);
  const r = await fetch(`${BASE}/api/credits/statement?start_date=${f(ini)}&end_date=${f(hoje)}&per_page=30`, { headers: H, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => null);
  writeFileSync(`${pasta}/_extrato.json`, JSON.stringify(sanitizar(j), null, 2));
  console.log(`Extrato oficial gravado em ./${pasta}/_extrato.json (HTTP ${r.status}) — traz o custo exato por consulta.`);
} catch (e) { console.log('Extrato indisponível:', e instanceof Error ? e.message : e); }
console.log(`Respostas sanitizadas em ./${pasta}/ — revise antes de compartilhar.`);
