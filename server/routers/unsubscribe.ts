import { Request, Response } from 'express';
import { ordersDb as db } from '../db/ordersDb';
import { db as mainDb } from '../db';
import { sql } from 'drizzle-orm';

export interface SuppressionResult {
  /** Passos que falharam (nome do passo), principais ou não. */
  failures: string[];
  /** true quando alguma lista de supressão principal (Premium ou CRM) não foi gravada. */
  primaryFailed: boolean;
}

/**
 * Propagates email suppression across ALL database instances (Premium, CRM, B2B)
 * to satisfy Option (b) LGPD compliance without cross-database JOINs at send time.
 *
 * Nenhum passo derruba os outros, mas as falhas são acumuladas e devolvidas: antes,
 * `catch {}` vazio engolia o erro e a página dizia "Confirmado" sem ter suprimido.
 * Os dois `email_suppressions` (Premium e CRM) são os passos principais — são as listas
 * consultadas antes de cada envio; os demais só logam.
 */
export async function suppressEmailGlobal(email: string, reason = 'unsubscribe'): Promise<SuppressionResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return { failures: [], primaryFailed: false };

  const steps: { name: string; primary: boolean; run: () => Promise<unknown> }[] = [
    { name: 'premium.email_suppressions', primary: true, run: () => db.execute(sql`
      INSERT INTO email_suppressions (email, reason)
      VALUES (${cleanEmail}, ${reason})
      ON CONFLICT (email) DO NOTHING
    `) },
    { name: 'crm.email_suppressions', primary: true, run: () => mainDb.execute(sql`
      INSERT INTO email_suppressions (email, reason)
      VALUES (${cleanEmail}, ${reason})
      ON CONFLICT (email) DO NOTHING
    `) },
    { name: 'crm.suppression_list', primary: false, run: () => mainDb.execute(sql`
      INSERT INTO suppression_list (email, reason)
      VALUES (${cleanEmail}, ${reason})
      ON CONFLICT DO NOTHING
    `) },
    { name: 'crm.clients', primary: false, run: () => mainDb.execute(sql`
      UPDATE clients SET unsubscribed = TRUE WHERE LOWER(email) = ${cleanEmail}
    `) },
    { name: 'premium.abandoned_carts', primary: false, run: () => db.execute(sql`
      UPDATE abandoned_carts SET opted_out = TRUE WHERE LOWER(customer_email) = ${cleanEmail}
    `) },
    // Cancelamento de sequências e contatos de marketing: existem nos DOIS bancos
    { name: 'premium.email_sequence_enrollments', primary: false, run: () => db.execute(sql`
      UPDATE email_sequence_enrollments
      SET status = 'cancelled', next_send_at = NULL, updated_at = NOW()
      WHERE LOWER(email) = ${cleanEmail} AND status = 'active'
    `) },
    { name: 'crm.email_sequence_enrollments', primary: false, run: () => mainDb.execute(sql`
      UPDATE email_sequence_enrollments
      SET status = 'cancelled', next_send_at = NULL, updated_at = NOW()
      WHERE LOWER(email) = ${cleanEmail} AND status = 'active'
    `) },
    { name: 'premium.marketing_contacts', primary: false, run: () => db.execute(sql`
      UPDATE marketing_contacts
      SET status = 'unsubscribed', updated_at = NOW()
      WHERE LOWER(email) = ${cleanEmail}
    `) },
    { name: 'crm.marketing_contacts', primary: false, run: () => mainDb.execute(sql`
      UPDATE marketing_contacts
      SET status = 'unsubscribed', updated_at = NOW()
      WHERE LOWER(email) = ${cleanEmail}
    `) },
  ];

  const failures: string[] = [];
  let primaryFailed = false;
  for (const step of steps) {
    try {
      await step.run();
    } catch (err) {
      failures.push(step.name);
      if (step.primary) primaryFailed = true;
      console.error(`[suppressGlobal] ${step.primary ? 'PRINCIPAL ' : ''}falha em ${step.name}:`, err);
    }
  }
  return { failures, primaryFailed };
}

/** Escapa texto antes de interpolar em HTML (o e-mail vem de dado externo). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolve o e-mail a partir do token de descadastro.
 *
 * Procura nos DOIS bancos: os tokens do Premium vivem no ordersDb e os do CRM
 * de Lembretes no banco principal. Buscar só num deles fazia todo link já
 * enviado pelo CRM cair fora — a página dizia "Descadastro Confirmado" sem
 * suprimir ninguém.
 */
async function resolveEmailByToken(token: string): Promise<string | null> {
  const queries: { conn: typeof db | typeof mainDb; table: string }[] = [
    { conn: db, table: 'email_campaign_recipients' },
    { conn: db, table: 'email_sequence_enrollments' },
    { conn: mainDb, table: 'email_campaign_recipients' },
    { conn: mainDb, table: 'email_sequence_enrollments' },
  ];
  for (const { conn, table } of queries) {
    try {
      const r = await conn.execute(
        sql`SELECT email FROM ${sql.identifier(table)} WHERE unsub_token = ${token} LIMIT 1`,
      );
      const row = r.rows[0] as { email?: string } | undefined;
      if (row?.email) return String(row.email).toLowerCase().trim();
    } catch {
      // tabela ausente naquele banco — segue para a próxima fonte
    }
  }
  return null;
}

export async function handleUnsubscribe(req: Request, res: Response) {
  const token = String(req.query.t || req.body?.t || req.query.token || '').trim();

  // Só o token opaco identifica o destinatário. Aceitar `?email=` deixava
  // qualquer pessoa descadastrar o endereço de qualquer outra.
  const targetEmail = token ? await resolveEmailByToken(token) : null;

  // GET nunca suprime: scanners de e-mail/antivírus abrem links com GET e
  // descadastrariam a pessoa sem clique. Mostra a confirmação (botão que faz POST).
  // O header `List-Unsubscribe: <.../api/unsubscribe?t=...>` + `List-Unsubscribe-Post`
  // segue válido: o cliente de e-mail faz POST (RFC 8058) nessa mesma URL.
  if (req.method !== 'POST') {
    if (!targetEmail) return res.status(404).send(failurePage());
    return res.status(200).send(confirmPage(targetEmail, token));
  }

  const isBrowserForm = req.body?.confirm === '1';

  if (!targetEmail) {
    console.warn('[unsubscribe] POST com token inválido/ausente');
    // One-click: 200 para o cliente de e-mail não reapresentar o botão. Formulário da
    // página: não afirma descadastro que não houve.
    return isBrowserForm ? res.status(404).send(failurePage()) : res.status(200).send('OK');
  }

  const result = await suppressEmailGlobal(targetEmail, 'unsubscribe');
  if (result.primaryFailed) {
    // 500 faz provedores e clientes de e-mail tentarem de novo, e a página não
    // diz "Confirmado" quando a supressão não foi gravada.
    console.error('[unsubscribe] supressão principal falhou:', result.failures.join(', '));
    return res.status(500).send(isBrowserForm ? errorPage() : 'Erro ao processar o descadastro');
  }
  if (result.failures.length > 0) {
    console.error('[unsubscribe] passos secundários falharam:', result.failures.join(', '));
  }

  return isBrowserForm ? res.status(200).send(successPage(targetEmail)) : res.status(200).send('OK');
}

const BRAND_COLOR = '#0C3680';
const PAGE_STYLE = `
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: white; max-width: 480px; width: 100%; padding: 40px 32px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); text-align: center; border: 1px solid #e2e8f0; }
    .icon { width: 64px; height: 64px; background: #dbeafe; color: ${BRAND_COLOR}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 28px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: ${BRAND_COLOR}; }
    p { font-size: 15px; color: #64748b; line-height: 1.6; margin: 0 0 24px; }
    .badge { display: inline-block; background: #f1f5f9; color: #475569; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .btn { display: inline-block; background: ${BRAND_COLOR}; color: white; text-decoration: none; border: 0; cursor: pointer; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }`;

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="robots" content="noindex"/>
  <title>${title} | Sal Vita Premium</title>
  <style>${PAGE_STYLE}
  </style>
</head>
<body>
  <div class="card">
${body}
  </div>
</body>
</html>`;
}

/** GET: pede confirmação. O token vai num campo oculto (escapado) e a ação é um POST. */
function confirmPage(email: string, token: string): string {
  return pageShell('Confirmar descadastro', `    <div class="icon">✉</div>
    <h1>Confirmar descadastro</h1>
    <div class="badge">${escapeHtml(email)}</div>
    <p>Clique no botão abaixo para deixar de receber e-mails de transmissão e sequências automatizadas da Sal Vita Premium.</p>
    <form method="POST" action="/api/unsubscribe">
      <input type="hidden" name="t" value="${escapeHtml(token)}"/>
      <input type="hidden" name="confirm" value="1"/>
      <button type="submit" class="btn">Confirmar descadastro</button>
    </form>`);
}

function successPage(email: string): string {
  return pageShell('Descadastro Confirmado', `    <div class="icon">✓</div>
    <h1>Descadastro Confirmado</h1>
    <div class="badge">${escapeHtml(email)}</div>
    <p>Seu e-mail foi removido de todas as nossas listas de transmissão e sequências automatizadas da Sal Vita Premium com sucesso.</p>
    <a href="https://www.premium.salvitarn.com.br" class="btn">Voltar para a Sal Vita Premium</a>`);
}

function errorPage(): string {
  return pageShell('Não foi possível descadastrar', `    <div class="icon">!</div>
    <h1>Não foi possível concluir</h1>
    <p>Houve um erro ao registrar o seu descadastro, então <strong>ele ainda não foi concluído</strong>. Tente novamente em alguns minutos ou responda ao e-mail pedindo a remoção.</p>`);
}

/** Página de token inválido/expirado — não afirma descadastro que não houve. */
function failurePage(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Link inválido | Sal Vita</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#f8fafc; color:#1e293b; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:16px; }
  .card { background:#fff; max-width:480px; width:100%; padding:40px 32px; border-radius:16px; box-shadow:0 10px 25px -5px rgba(0,0,0,.05); text-align:center; border:1px solid #e2e8f0; }
  .icon { width:64px; height:64px; background:#fef3c7; color:#b45309; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; font-size:28px; }
  h1 { font-size:22px; font-weight:700; margin:0 0 12px; color:#0C3680; }
  p { font-size:15px; color:#64748b; line-height:1.6; margin:0 0 8px; }
</style></head>
<body><div class="card">
  <div class="icon">!</div>
  <h1>Link inválido ou expirado</h1>
  <p>Não foi possível identificar o seu cadastro a partir deste link, então <strong>nada foi alterado</strong>.</p>
  <p>Responda ao e-mail que você recebeu pedindo a remoção e faremos manualmente.</p>
</div></body></html>`;
}
