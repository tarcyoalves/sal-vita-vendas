/**
 * Recuperação ADITIVA do banco antigo → banco atual de produção.
 *
 * Diferente de /api/migrate-from-neon (que APAGA e recria), aqui NUNCA apagamos
 * nada: só inserimos o que falta, religando cada tarefa ao atendente certo.
 *
 *  - users/sellers casados por LOWER(email); quem só existe no antigo é recriado
 *    (copiando password_hash → mesma senha). Quem já existe no novo é preservado.
 *  - clients casados por LOWER(email) (ou nome+telefone).
 *  - tasks/reminders têm user_id/client_id RE-MAPEADOS para os ids novos.
 *  - Dedupe POR ATENDENTE: a chave de tarefa é (user_id novo | título | CNPJ/tel/email).
 *    Então o mesmo cliente em atendentes diferentes é mantido; repetido no mesmo
 *    atendente entra só uma vez.
 *  - Copia apenas colunas presentes nos DOIS bancos (tolera schema antigo menor).
 *  - Insere SEM o id (deixa o serial gerar id novo) → nunca colide com o que já existe.
 *
 * mode 'inspect' = só leitura (devolve o plano). mode 'apply' = grava.
 * Idempotente: rodar de novo só insere o que ainda falta.
 */

// src/dst são instâncias do pacote `postgres` (porsager). Tipadas como any para
// evitar atrito de tipos neste utilitário de uso único.
type Db = any;

const norm = (v: unknown): string => (v ?? '').toString().replace(/\D/g, '');
const normPhone = (v: unknown): string => {
  let d = norm(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d;
};
const lc = (v: unknown): string => (v ?? '').toString().trim().toLowerCase();

async function cols(sql: Db, table: string): Promise<string[]> {
  const rows = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position`;
  return rows.map((r: any) => r.column_name as string);
}
async function safeCount(sql: Db, table: string): Promise<number | null> {
  try { const r = await sql`SELECT COUNT(*)::int AS c FROM ${sql(table)}`; return r[0].c as number; }
  catch { return null; }
}

export type RecoverMode = 'inspect' | 'apply';

export async function recoverOldDb(src: Db, dst: Db, mode: RecoverMode) {
  const TABLES = ['users', 'sellers', 'clients', 'tasks', 'reminders', 'knowledge_documents', 'work_sessions'];
  const report: any = { mode };

  // Colunas por tabela em cada banco → interseção (tolera schema drift).
  const srcCols: Record<string, string[]> = {};
  const dstCols: Record<string, string[]> = {};
  for (const t of TABLES) { srcCols[t] = await cols(src, t); dstCols[t] = await cols(dst, t); }
  const shared = (t: string) => srcCols[t].filter(c => dstCols[t].includes(c));

  report.counts = {};
  for (const t of TABLES) report.counts[t] = { old: await safeCount(src, t), new: await safeCount(dst, t) };

  // ── 1) USERS → mapa oldUserId → newUserId (casando por e-mail) ──
  const oldUsers = srcCols.users.length ? await src`SELECT * FROM users` : [];
  const newUsers = await dst`SELECT id, email FROM users`;
  const newUserByEmail = new Map<string, number>(newUsers.map((u: any) => [lc(u.email), u.id]));
  const userMap = new Map<number, number>();
  const usersToInsert: any[] = [];
  for (const u of oldUsers) {
    const ex = newUserByEmail.get(lc(u.email));
    if (ex != null) userMap.set(u.id, ex);
    else usersToInsert.push(u);
  }

  // ── 2) CLIENTS → mapa oldClientId → newClientId ──
  const oldClients = srcCols.clients.length ? await src`SELECT * FROM clients` : [];
  const newClients = dstCols.clients.length ? await dst`SELECT id, name, email, phone FROM clients` : [];
  const ckey = (c: any) => lc(c.email) || `${lc(c.name)}|${normPhone(c.phone)}`;
  const newClientByKey = new Map<string, number>(newClients.map((c: any) => [ckey(c), c.id]));
  const clientMap = new Map<number, number>();
  const clientsToInsert: any[] = [];
  for (const c of oldClients) {
    const ex = newClientByKey.get(ckey(c));
    if (ex != null) clientMap.set(c.id, ex);
    else clientsToInsert.push(c);
  }

  const remapUser = (id: number) => (userMap.has(id) ? userMap.get(id)! : id);
  const remapClient = (id: number) => (clientMap.has(id) ? clientMap.get(id)! : 0);

  // ── 3) TASKS → dedupe POR ATENDENTE ──
  const oldTasks = srcCols.tasks.length ? await src`SELECT * FROM tasks` : [];
  const newTasks = await dst`SELECT user_id, title, cnpj, phone, email FROM tasks`;
  const ident = (t: any) => norm(t.cnpj) || normPhone(t.phone) || lc(t.email) || '';
  const tkey = (uid: number, t: any) => `${uid}|${lc(t.title)}|${ident(t)}`;
  const existingTaskKeys = new Set<string>(newTasks.map((t: any) => tkey(t.user_id, t)));
  const tasksToInsert: any[] = [];
  for (const t of oldTasks) {
    const uid = remapUser(t.user_id);
    const k = tkey(uid, t);
    if (existingTaskKeys.has(k)) continue;
    existingTaskKeys.add(k);
    tasksToInsert.push(t);
  }

  // ── 4) REMINDERS → dedupe por (atendente | cliente | data) ──
  const oldRem = srcCols.reminders.length ? await src`SELECT * FROM reminders` : [];
  const newRem = dstCols.reminders.length ? await dst`SELECT user_id, client_name, scheduled_date FROM reminders` : [];
  const rkey = (uid: number, r: any) => `${uid}|${lc(r.client_name)}|${new Date(r.scheduled_date).toISOString()}`;
  const existingRemKeys = new Set<string>(newRem.map((r: any) => rkey(r.user_id, r)));
  const remToInsert: any[] = [];
  for (const r of oldRem) {
    const uid = remapUser(r.user_id);
    const k = rkey(uid, r);
    if (existingRemKeys.has(k)) continue;
    existingRemKeys.add(k);
    remToInsert.push(r);
  }

  // ── 5) SELLERS → casados por e-mail ──
  const oldSellers = srcCols.sellers.length ? await src`SELECT * FROM sellers` : [];
  const newSellers = dstCols.sellers.length ? await dst`SELECT email FROM sellers` : [];
  const newSellerEmails = new Set<string>(newSellers.map((s: any) => lc(s.email)));
  const sellersToInsert = oldSellers.filter((s: any) => !newSellerEmails.has(lc(s.email)));

  report.plan = {
    usersMatched: userMap.size, usersToCreate: usersToInsert.length,
    clientsMatched: clientMap.size, clientsToCreate: clientsToInsert.length,
    sellersToCreate: sellersToInsert.length,
    tasksOld: oldTasks.length, tasksToInsert: tasksToInsert.length, tasksSkippedDup: oldTasks.length - tasksToInsert.length,
    remindersOld: oldRem.length, remindersToInsert: remToInsert.length,
  };
  report.onlyOldUsers = usersToInsert.map((u: any) => u.email);

  if (mode === 'inspect') { report.applied = false; return report; }

  // ── APPLY (aditivo; sem DELETE). Insere sem 'id' → serial gera id novo. ──
  const errors: any[] = [];
  const insert = async (table: string, row: any, overrides: Record<string, any> = {}): Promise<number | null> => {
    const insCols = shared(table).filter(c => c !== 'id');
    const obj: any = {};
    for (const c of insCols) obj[c] = row[c];
    Object.assign(obj, overrides);
    // tasks.tags é NOT NULL → nunca enviar null
    if (table === 'tasks' && (obj.tags == null)) obj.tags = [];
    try {
      const r = await dst`INSERT INTO ${dst(table)} ${dst(obj, ...insCols)} RETURNING id`;
      return r[0]?.id ?? null;
    } catch (e: any) {
      errors.push({ table, oldId: row.id, error: e.message });
      return null;
    }
  };

  for (const u of usersToInsert) { const id = await insert('users', u); if (id != null) userMap.set(u.id, id); }
  for (const c of clientsToInsert) { const id = await insert('clients', c); if (id != null) clientMap.set(c.id, id); }
  for (const s of sellersToInsert) { await insert('sellers', s, { user_id: remapUser(s.user_id) }); }
  let tIns = 0;
  for (const t of tasksToInsert) { const id = await insert('tasks', t, { user_id: remapUser(t.user_id), client_id: remapClient(t.client_id) }); if (id != null) tIns++; }
  let rIns = 0;
  for (const r of remToInsert) { const id = await insert('reminders', r, { user_id: remapUser(r.user_id) }); if (id != null) rIns++; }

  report.applied = true;
  report.inserted = {
    users: usersToInsert.length, clients: clientsToInsert.length,
    sellers: sellersToInsert.length, tasks: tIns, reminders: rIns,
  };
  if (errors.length) report.errors = errors;
  return report;
}
