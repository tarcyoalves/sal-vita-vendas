/**
 * Resend email integration — uses REST API directly (no npm package).
 * All functions are best-effort: they never throw and never block the caller.
 *
 * Free tier: 3,000 emails/month, 100 emails/day hard cap.
 * Daily budget is split conservatively: max 80 emails/day to leave margin.
 * The counter is in-memory only (resets on cold start) — a best-effort
 * guard, not a hard guarantee against Resend's own daily cap.
 */

const FROM = 'Sal Vita <noreply@premium.salvitarn.com.br>';
const BRAND = '#0C3680';
// Stay comfortably under 100/day free limit — env var allows override
const DAILY_SOFT_LIMIT = parseInt(process.env.RESEND_DAILY_LIMIT ?? '80');

// In-process daily counter (resets on cold start — good enough for serverless)
let _emailsToday = 0;
let _emailCounterDay = '';  // YYYY-MM-DD in UTC

function dailyCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (_emailCounterDay !== today) { _emailsToday = 0; _emailCounterDay = today; }
  return _emailsToday;
}

// ── Core send function ────────────────────────────────────────────────────────

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no_api_key' };

  if (dailyCount() >= DAILY_SOFT_LIMIT) {
    console.warn(`[email] daily soft limit (${DAILY_SOFT_LIMIT}) reached — skipping "${subject}" → ${to}`);
    return { ok: false, reason: 'daily_limit' };
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8_000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.error(`[email] Resend error ${res.status}:`, err);
      return { ok: false, reason: `resend_${res.status}` };
    }
    _emailsToday++;
    console.log(`[email] sent (${_emailsToday}/${DAILY_SOFT_LIMIT} today) "${subject}" → ${to}`);
    return { ok: true };
  } catch (err) {
    console.error('[email] sendEmail failed:', err);
    return { ok: false, reason: 'network_error' };
  }
}

// ── Shared layout helpers ─────────────────────────────────────────────────────

function layout(preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sal Vita</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,Arial,sans-serif;">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 8px;">

        <!-- card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

          <!-- header -->
          <tr>
            <td style="background:${BRAND};padding:24px 32px;text-align:left;">
              <img src="http://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
                   alt="Sal Vita" width="150" height="auto"
                   style="display:inline-block;max-width:150px;height:auto;border:0;" />
            </td>
          </tr>

          <!-- body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>

          <!-- footer -->
          <tr>
            <td style="background:#f4f4f4;padding:20px 32px;border-top:1px solid #e0e0e0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;">
                <strong>Sal Vita &mdash; Sal Marinho Premium de Mossoró/RN</strong>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#aaa;">
                Para deixar de receber mensagens, envie <strong>PARAR</strong> pelo WhatsApp.
              </p>
            </td>
          </tr>

        </table>
        <!-- /card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
    <tr>
      <td style="background:${BRAND};border-radius:6px;">
        <a href="${href}"
           style="display:block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

// ── Template functions ────────────────────────────────────────────────────────

/**
 * Abandoned cart recovery email.
 */
export function abandonedCartHtml(name: string, link: string, coupon?: string): string {
  const couponBlock = coupon
    ? `<tr>
        <td style="background:#eef3ff;border:1px dashed ${BRAND};border-radius:6px;padding:16px;text-align:center;margin-bottom:16px;">
          <p style="margin:0;font-size:13px;color:#555;">Seu cupom exclusivo:</p>
          <p style="margin:8px 0 0;font-size:22px;font-weight:bold;color:${BRAND};letter-spacing:2px;">${coupon}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#888;">Use no checkout e ganhe desconto especial!</p>
        </td>
      </tr>`
    : '';

  const body = `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td>
        <h2 style="margin:0 0 8px;font-size:22px;color:#222;">Ol&aacute;, ${escapeHtml(name)}! &#128075;</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6;">
          Notamos que voc&ecirc; se interessou pelo <strong>Sal Marinho Integral Sal Vita</strong> mas n&atilde;o finalizou o pedido.
        </p>
        <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
          Nosso sal &eacute; colhido artesanalmente em Mossor&oacute;/RN, sem refino &mdash; preservando os 84+ minerais naturais do mar. &#127754;
        </p>
      </td>
    </tr>
    ${couponBlock}
    <tr>
      <td>${ctaButton('Finalizar meu pedido &rarr;', link)}</td>
    </tr>
    <tr>
      <td>
        <p style="margin:16px 0 0;font-size:13px;color:#888;text-align:center;">
          Qualquer d&uacute;vida &eacute; s&oacute; chamar no WhatsApp. &#128522;
        </p>
      </td>
    </tr>
  </table>`;

  return layout(
    `Você esqueceu algo — finalize seu pedido Sal Vita${coupon ? ` e use o cupom ${coupon}` : ''}.`,
    body,
  );
}

/**
 * Unpaid order follow-up email.
 */
export function unpaidOrderHtml(
  name: string,
  orderId: number,
  total: string,
  link: string,
  pixCode?: string,
  failed?: boolean,
): string {
  const pixBlock = pixCode
    ? `<tr>
        <td style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:16px;margin-bottom:16px;">
          <p style="margin:0 0 8px;font-size:14px;color:#166534;font-weight:bold;">&#128241; Pague com PIX agora:</p>
          <p style="margin:0;font-size:11px;color:#555;word-break:break-all;font-family:monospace;background:#fff;padding:8px;border-radius:4px;">${escapeHtml(pixCode)}</p>
          <p style="margin:8px 0 0;font-size:12px;color:#888;">Copie o c&oacute;digo acima e cole no app do seu banco.</p>
        </td>
      </tr>`
    : '';

  const introText = failed
    ? `Houve um problema ao processar o pagamento do seu pedido <strong>#${orderId}</strong>. N&atilde;o se preocupe, voc&ecirc; pode tentar novamente.`
    : `Seu pedido <strong>#${orderId}</strong> est&aacute; aguardando pagamento.`;

  const body = `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td>
        <h2 style="margin:0 0 8px;font-size:22px;color:#222;">Ol&aacute;, ${escapeHtml(name)}! &#128184;</h2>
        <p style="margin:0 0 16px;font-size:15px;color:#444;line-height:1.6;">
          ${introText}
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:16px;">
        <table width="100%" cellpadding="8" cellspacing="0" border="0"
               style="border:1px solid #e0e0e0;border-radius:6px;font-size:14px;color:#444;">
          <tr style="background:#f9f9f9;">
            <td><strong>Pedido</strong></td>
            <td style="text-align:right;"><strong>#${orderId}</strong></td>
          </tr>
          <tr>
            <td>Total</td>
            <td style="text-align:right;color:${BRAND};font-weight:bold;">R$ ${escapeHtml(total)}</td>
          </tr>
        </table>
      </td>
    </tr>
    ${pixBlock}
    <tr>
      <td>${ctaButton(failed ? 'Tentar novamente &rarr;' : 'Concluir pagamento &rarr;', link)}</td>
    </tr>
    <tr>
      <td>
        <p style="margin:16px 0 0;font-size:13px;color:#888;text-align:center;">
          Aceitamos Cart&atilde;o, PIX e Boleto. Pedido reservado por tempo limitado!
        </p>
      </td>
    </tr>
  </table>`;

  const preheader = failed
    ? `Houve um problema no pagamento do pedido #${orderId} — tente novamente.`
    : `Seu pedido #${orderId} está aguardando pagamento — R$ ${total}.`;

  return layout(preheader, body);
}

/**
 * Order confirmed / payment approved email.
 */
export function orderConfirmedHtml(name: string, orderId: number, total: string): string {
  const body = `<table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="text-align:center;padding-bottom:16px;">
        <span style="font-size:48px;">&#127881;</span>
      </td>
    </tr>
    <tr>
      <td>
        <h2 style="margin:0 0 8px;font-size:22px;color:#222;text-align:center;">
          Pagamento confirmado!
        </h2>
        <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;text-align:center;">
          Obrigado, <strong>${escapeHtml(name)}</strong>! Seu pedido foi aprovado e j&aacute; estamos preparando o envio. &#128230;
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding-bottom:24px;">
        <table width="100%" cellpadding="8" cellspacing="0" border="0"
               style="border:1px solid #e0e0e0;border-radius:6px;font-size:14px;color:#444;">
          <tr style="background:#f9f9f9;">
            <td><strong>Pedido</strong></td>
            <td style="text-align:right;"><strong>#${orderId}</strong></td>
          </tr>
          <tr>
            <td>Total pago</td>
            <td style="text-align:right;color:${BRAND};font-weight:bold;">R$ ${escapeHtml(total)}</td>
          </tr>
          <tr style="background:#f9f9f9;">
            <td>Status</td>
            <td style="text-align:right;color:#16a34a;font-weight:bold;">&#10003; Confirmado</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td>
        <p style="margin:0;font-size:14px;color:#555;line-height:1.6;text-align:center;">
          Voc&ecirc; receber&aacute; o c&oacute;digo de rastreio assim que postarmos o pacote. &#128666;<br />
          Em caso de d&uacute;vidas, basta chamar no WhatsApp.
        </p>
      </td>
    </tr>
  </table>`;

  return layout(`Pedido #${orderId} confirmado — R$ ${total}. Obrigado pela compra!`, body);
}

// ── Utility ───────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
