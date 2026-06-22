#!/usr/bin/env node
/**
 * Recuperação de dados: copia o banco ANTIGO (Neon que caiu no free tier e
 * voltou) para dentro do banco ATUAL de produção, RE-LINKANDO as tarefas a
 * cada atendente pelo e-mail (o `user_id` antigo não vale no banco novo).
 *
 * SEGURO POR PADRÃO: roda em DRY-RUN (não grava nada) até você passar --apply.
 *
 * Como rodar (LOCALMENTE, onde há acesso ao Neon — o sandbox da nuvem é bloqueado):
 *
 *   1) npm install            # garante node_modules (usa o pacote `postgres`)
 *   2) crie/edite .env com:
 *        OLD_DATABASE_URL=postgresql://...   (banco antigo, o do print)
 *        NEW_DATABASE_URL=postgresql://...   (banco de produção atual)
 *   3) Inspeção (só leitura, recomendado primeiro):
 *        node --env-file=.env scripts/recover-old-db.mjs inspect
 *   4) Simulação da migração (não grava):
 *        node --env-file=.env scripts/recover-old-db.mjs migrate
 *   5) Aplicar de verdade (grava, dentro de UMA transação):
 *        node --env-file=.env scripts/recover-old-db.mjs migrate --apply
 *
 * Estratégia de merge:
 *  - users/sellers casados por LOWER(email). Quem existe no novo é preservado
 *    (nunca sobrescrevemos); quem só existe no antigo é recriado (copiando o
 *    password_hash, então o atendente continua logando com a mesma senha).
 *  - clients casados por LOWER(email) (ou nome+telefone quando sem e-mail).
 *  - tasks/reminders têm user_id/client_id RE-MAPEADOS para os ids novos.
 *  - Dedupe conservador evita inserir duplicado o que já existe no banco novo.
 *  - Só copiamos colunas que existem nos DOIS bancos (tolera schema diferente).
 */

import postgres from 'postgres';

// ── CLI ──────────────────────────────────────────────────────────────────────
const mode = process.argv[2] ?? 'inspect';
const APPLY = process.argv.includes('--apply');
if (!['inspect', 'migrate'].includes(mode)) {
  console.error('Uso: node scripts/recover-old-db.mjs <inspect|migrate> [--apply]');
  process.exit(1);
}

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;
if (!OLD_URL) { console.error('Falta OLD_DATABASE_URL'); process.exit(1); }
if (mode === 'migrate' && !NEW_URL) { console.error('Falta NEW_DATABASE_URL'); process.exit(1); }

// Tabelas que recuperamos, na ordem certa (users e clients primeiro, pois
// outras tabelas referenciam seus ids).
const CORE_TABLES = ['users', 'sellers', 'clients', 'tasks', 'reminders'];
const EXTRA_TABLES = ['tags', 'knowledge_documents', 'work_sessions'];

// ── Conexão (porsager/postgres). Ignora channel_binding e força ssl. ─────────
function connect(url) {
  const u = new URL(url);
  return postgres({
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, '') || 'neondb',
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: 'require',
    prepare: false,          // compatível com o pooler (PgBouncer)
    max: 1,
    connect_timeout: 30,
    idle_timeout: 10,
  });
}

const norm = (v) => (v ?? '').toString().replace(/\D/g, '');
const normPhone = (v) => { let d = norm(v); if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2); return d; };
const lc = (v) => (v ?? '').toString().trim().toLowerCase();

async function tableCols(sql, table) {
  const rows = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position`;
  return rows.map(r => r.column_name);
}
async function rowCount(sql, table) {
  try { const [r] = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM "${table}"`); return r.c; }
  catch { return null; } // tabela não existe
}
async function fetchAll(sql, table, cols) {
  if (cols.length === 0) return [];
  return sql.unsafe(`SELECT ${cols.map(c => `"${c}"`).join(',')} FROM "${table}"`);
}

// ── INSPECT ──────────────────────────────────────────────────────────────────
async function inspect() {
  const oldSql = connect(OLD_URL);
  const newSql = NEW_URL ? connect(NEW_URL) : null;
  try {
    console.log('\n=== CONTAGEM DE LINHAS (antigo → novo) ===');
    for (const t of [...CORE_TABLES, ...EXTRA_TABLES]) {
      const o = await rowCount(oldSql, t);
      const n = newSql ? await rowCount(newSql, t) : '—';
      console.log(`  ${t.padEnd(22)} antigo=${String(o ?? 'ausente').padStart(6)}   novo=${String(n ?? 'ausente').padStart(6)}`);
    }

    console.log('\n=== ATENDENTES NO BANCO ANTIGO (users) ===');
    const oUsers = await fetchAll(oldSql, 'users', (await tableCols(oldSql, 'users')).filter(c => ['id', 'name', 'email', 'role'].includes(c)));
    for (const u of oUsers) console.log(`  #${u.id}  ${(u.role || '').padEnd(5)}  ${u.email}  (${u.name})`);

    if (newSql) {
      console.log('\n=== ATENDENTES NO BANCO NOVO (users) ===');
      const nUsers = await fetchAll(newSql, 'users', (await tableCols(newSql, 'users')).filter(c => ['id', 'name', 'email', 'role'].includes(c)));
      for (const u of nUsers) console.log(`  #${u.id}  ${(u.role || '').padEnd(5)}  ${u.email}  (${u.name})`);

      const oSet = new Set(oUsers.map(u => lc(u.email)));
      const nSet = new Set(nUsers.map(u => lc(u.email)));
      const onlyOld = [...oSet].filter(e => !nSet.has(e));
      const both = [...oSet].filter(e => nSet.has(e));
      console.log(`\n  → ${both.length} atendentes casam por e-mail; ${onlyOld.length} só existem no antigo (serão recriados):`);
      onlyOld.forEach(e => console.log(`      + ${e}`));
    }
    console.log('\n(inspeção é só leitura — nada foi gravado)\n');
  } finally {
    await oldSql.end(); if (newSql) await newSql.end();
  }
}

// ── MIGRATE ──────────────────────────────────────────────────────────────────
async function migrate() {
  const oldSql = connect(OLD_URL);
  const newSql = connect(NEW_URL);
  const report = {};
  try {
    // Pré-carrega colunas compartilhadas por tabela (tolera schema drift).
    const shared = {};
    for (const t of [...CORE_TABLES, ...EXTRA_TABLES]) {
      const oc = await tableCols(oldSql, t);
      const nc = await tableCols(newSql, t);
      shared[t] = oc.filter(c => nc.includes(c));
      const onlyOld = oc.filter(c => !nc.includes(c));
      if (oc.length && onlyOld.length) console.log(`[schema] ${t}: colunas só no antigo (ignoradas): ${onlyOld.join(', ')}`);
    }

    // 1) USERS — mapa oldUserId → newUserId (casando por e-mail).
    const oUsers = await fetchAll(oldSql, 'users', shared.users);
    const nUsers = await fetchAll(newSql, 'users', ['id', 'email']);
    const newUserByEmail = new Map(nUsers.map(u => [lc(u.email), u.id]));
    const userMap = new Map();
    const usersToInsert = [];
    for (const u of oUsers) {
      const existing = newUserByEmail.get(lc(u.email));
      if (existing != null) userMap.set(u.id, existing);
      else usersToInsert.push(u);
    }

    // 2) CLIENTS — mapa oldClientId → newClientId (e-mail, senão nome+telefone).
    const clientCols = shared.clients;
    const oClients = clientCols.length ? await fetchAll(oldSql, 'clients', clientCols) : [];
    const nClients = clientCols.length ? await fetchAll(newSql, 'clients', ['id', 'name', 'email', 'phone']) : [];
    const clientKey = (c) => lc(c.email) || `${lc(c.name)}|${normPhone(c.phone)}`;
    const newClientByKey = new Map(nClients.map(c => [clientKey(c), c.id]));
    const clientMap = new Map();
    const clientsToInsert = [];
    for (const c of oClients) {
      const existing = newClientByKey.get(clientKey(c));
      if (existing != null) clientMap.set(c.id, existing);
      else clientsToInsert.push(c);
    }

    // Dedupe de tasks: chave = userId|titulo|identificador(cnpj/phone/email).
    const remapUser = (oldId) => userMap.has(oldId) ? userMap.get(oldId) : oldId;
    const remapClient = (oldId) => clientMap.has(oldId) ? clientMap.get(oldId) : 0;
    const taskIdent = (t) => norm(t.cnpj) || normPhone(t.phone) || lc(t.email) || '';
    const taskKey = (uid, t) => `${uid}|${lc(t.title)}|${taskIdent(t)}`;

    const oTasks = await fetchAll(oldSql, 'tasks', shared.tasks);
    const nTaskCols = (await tableCols(newSql, 'tasks')).filter(c => ['user_id', 'title', 'cnpj', 'phone', 'email'].includes(c));
    const nTasks = await fetchAll(newSql, 'tasks', nTaskCols);
    const existingTaskKeys = new Set(nTasks.map(t => taskKey(t.user_id, t)));
    const tasksToInsert = [];
    for (const t of oTasks) {
      const uid = remapUser(t.user_id);
      const k = taskKey(uid, t);
      if (existingTaskKeys.has(k)) continue; // já existe no novo
      existingTaskKeys.add(k);               // evita duplicar dentro do próprio lote
      tasksToInsert.push(t);
    }

    // Reminders: dedupe por userId|clientName|scheduledDate.
    const remCols = shared.reminders;
    const oRem = remCols.length ? await fetchAll(oldSql, 'reminders', remCols) : [];
    const nRem = remCols.length ? await fetchAll(newSql, 'reminders', ['user_id', 'client_name', 'scheduled_date']) : [];
    const remKey = (r) => `${remapUser(r.user_id)}|${lc(r.client_name)}|${new Date(r.scheduled_date).toISOString()}`;
    const remKeyNew = (r) => `${r.user_id}|${lc(r.client_name)}|${new Date(r.scheduled_date).toISOString()}`;
    const existingRemKeys = new Set(nRem.map(remKeyNew));
    const remToInsert = oRem.filter(r => { const k = remKey(r); if (existingRemKeys.has(k)) return false; existingRemKeys.add(k); return true; });

    // ── Relatório ──
    console.log('\n=== PLANO DE RECUPERAÇÃO ===');
    console.log(`  users:     ${userMap.size} casados por e-mail, ${usersToInsert.length} a recriar`);
    console.log(`  clients:   ${clientMap.size} já existem, ${clientsToInsert.length} a inserir`);
    console.log(`  tasks:     ${oTasks.length} no antigo → ${tasksToInsert.length} a inserir (${oTasks.length - tasksToInsert.length} já existem/dup)`);
    console.log(`  reminders: ${oRem.length} no antigo → ${remToInsert.length} a inserir`);

    if (!APPLY) {
      console.log('\n[DRY-RUN] nada foi gravado. Revise acima e rode com --apply para aplicar.\n');
      return;
    }

    // ── APLICAÇÃO (uma transação no banco novo) ──
    console.log('\n[APPLY] gravando dentro de uma transação...');
    await newSql.begin(async (tx) => {
      // helper de insert que devolve o id novo (RETURNING id)
      const insertRet = async (table, row, cols) => {
        const c = cols.filter(x => x !== 'id');
        const [ins] = await tx`INSERT INTO ${tx(table)} ${tx(row, ...c)} RETURNING id`;
        return ins.id;
      };

      // users (preserva password_hash → mesma senha)
      for (const u of usersToInsert) {
        const newId = await insertRet('users', u, shared.users);
        userMap.set(u.id, newId);
      }
      // clients
      for (const c of clientsToInsert) {
        const newId = await insertRet('clients', c, shared.clients);
        clientMap.set(c.id, newId);
      }
      // sellers (remap user_id; dedupe por e-mail)
      if (shared.sellers.length) {
        const oSellers = await fetchAll(oldSql, 'sellers', shared.sellers);
        const nSellers = await fetchAll(newSql, 'sellers', ['email']);
        const sellerEmails = new Set(nSellers.map(s => lc(s.email)));
        const sc = shared.sellers.filter(x => x !== 'id');
        for (const s of oSellers) {
          if (sellerEmails.has(lc(s.email))) continue;
          const row = { ...s }; if ('user_id' in row) row.user_id = remapUser(row.user_id);
          await tx`INSERT INTO ${tx('sellers')} ${tx(row, ...sc)}`;
        }
      }
      // tasks (remap user_id + client_id)
      const tc = shared.tasks.filter(x => x !== 'id');
      for (const t of tasksToInsert) {
        const row = { ...t };
        if ('user_id' in row) row.user_id = remapUser(row.user_id);
        if ('client_id' in row) row.client_id = remapClient(row.client_id);
        await tx`INSERT INTO ${tx('tasks')} ${tx(row, ...tc)}`;
      }
      // reminders (remap user_id)
      const rc = remCols.filter(x => x !== 'id');
      for (const r of remToInsert) {
        const row = { ...r }; if ('user_id' in row) row.user_id = remapUser(row.user_id);
        await tx`INSERT INTO ${tx('reminders')} ${tx(row, ...rc)}`;
      }
    });
    console.log('[APPLY] concluído com sucesso.\n');
  } finally {
    await oldSql.end(); await newSql.end();
  }
}

(mode === 'inspect' ? inspect() : migrate()).catch((e) => { console.error('\nERRO:', e.message); process.exit(1); });
