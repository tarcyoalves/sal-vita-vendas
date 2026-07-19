/**
 * Controle de frequência (frequency capping) — E-mail Marketing.
 *
 * Config global em app_settings (key 'email_freq_cap', valor JSON). O histórico
 * de envio já existe em email_campaign_recipients.sent_at e
 * email_sequence_sends.sent_at (este via join na inscrição → e-mail), então não
 * há tabela nova: contamos por e-mail na janela configurada.
 *
 * Objetivo: não estourar a caixa do lead. Se um e-mail já recebeu N mensagens
 * nos últimos D dias, ele é pulado em novas campanhas e novas inscrições em
 * sequência (as duas fontes de envio deste módulo).
 */

import { sql } from '../db';

const FREQ_CAP_KEY = 'email_freq_cap';

export interface FrequencyCap {
  enabled: boolean;
  maxEmails: number;   // máximo de e-mails por lead na janela
  windowDays: number;  // tamanho da janela em dias
}

const DEFAULT_CAP: FrequencyCap = { enabled: false, maxEmails: 3, windowDays: 7 };

export async function getFrequencyCap(): Promise<FrequencyCap> {
  try {
    const rows = await sql`SELECT value FROM app_settings WHERE key = ${FREQ_CAP_KEY} LIMIT 1`;
    const raw = (rows as unknown as Array<{ value: string }>)[0]?.value;
    if (!raw) return DEFAULT_CAP;
    const parsed = JSON.parse(raw) as Partial<FrequencyCap>;
    return {
      enabled: !!parsed.enabled,
      maxEmails: Math.max(1, Number(parsed.maxEmails ?? DEFAULT_CAP.maxEmails)),
      windowDays: Math.max(1, Number(parsed.windowDays ?? DEFAULT_CAP.windowDays)),
    };
  } catch {
    return DEFAULT_CAP;
  }
}

export async function setFrequencyCap(cap: FrequencyCap): Promise<void> {
  const value = JSON.stringify({
    enabled: !!cap.enabled,
    maxEmails: Math.max(1, Math.floor(cap.maxEmails)),
    windowDays: Math.max(1, Math.floor(cap.windowDays)),
  });
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${FREQ_CAP_KEY}, ${value}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = now()
  `;
}

/**
 * Dado um conjunto de e-mails, retorna o subconjunto que JÁ atingiu o teto na
 * janela (ou seja, que deve ser PULADO). Uma única query cobre as duas fontes
 * de envio (campanhas + sequências). Se o cap estiver desligado ou a lista
 * vazia, retorna um Set vazio (nada é pulado).
 */
export async function overCappedEmails(emails: string[]): Promise<Set<string>> {
  const cap = await getFrequencyCap();
  if (!cap.enabled || emails.length === 0) return new Set();

  const normalized = [...new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean))];
  if (normalized.length === 0) return new Set();

  const cutoff = new Date(Date.now() - cap.windowDays * 24 * 60 * 60 * 1000);

  // Conta envios 'sent' por e-mail na janela, unindo campanhas e sequências.
  // Sequência guarda o e-mail na inscrição (enrollment), não no send — join.
  const rows = await sql`
    WITH sends AS (
      SELECT lower(email) AS email
      FROM email_campaign_recipients
      WHERE status = 'sent' AND sent_at IS NOT NULL AND sent_at >= ${cutoff}
        AND lower(email) = ANY(${normalized})
      UNION ALL
      SELECT lower(en.email) AS email
      FROM email_sequence_sends s
      INNER JOIN email_sequence_enrollments en ON en.id = s.enrollment_id
      WHERE s.status = 'sent' AND s.sent_at >= ${cutoff}
        AND lower(en.email) = ANY(${normalized})
    )
    SELECT email, COUNT(*)::int AS cnt
    FROM sends
    GROUP BY email
    HAVING COUNT(*) >= ${cap.maxEmails}
  `;
  return new Set((rows as unknown as Array<{ email: string }>).map(r => r.email));
}

/** Conveniência para uma única checagem (usada na inscrição em sequência). */
export async function isEmailOverCapped(email: string): Promise<boolean> {
  const over = await overCappedEmails([email]);
  return over.has(email.toLowerCase().trim());
}
