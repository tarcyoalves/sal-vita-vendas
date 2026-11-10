import { safeErr } from './logSafe';
import { sendEmail } from '../email/resend';
import { STORE_URL } from './storeUrl';

export const ALERT_EMAIL = () => process.env.ALERT_EMAIL || 'contato@salvitarn.com.br';

const brlTxt = (v: string | number | null | undefined) => (parseFloat(String(v ?? '0')) || 0).toFixed(2).replace('.', ',');

/** Aviso ao dono por e-mail (ALERT_EMAIL, com o mesmo padrão de sempre). Melhor esforço: nunca lança. */
export async function alertOwner(subject: string, lines: string[]): Promise<void> {
  try {
    const html = `<p style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6">${lines.map(l => l.replace(/</g, '&lt;')).join('<br/>')}</p>`;
    const r = await sendEmail(ALERT_EMAIL(), subject, html);
    if (!r.ok) console.warn(`[owner-alert] alerta "${subject}" não saiu (${r.reason})`);
  } catch (e) { console.error('[owner-alert] falhou:', safeErr(e)); }
}

/** Aviso de pedido pago: só o primeiro nome e a cidade/UF do cliente (sem telefone, e-mail ou endereço). */
export function alertaPedidoPago(
  o: { id: number; customerName: string; product: string | null; city: string | null; state: string | null; totalPrice: string | null },
  storeUrl: string = STORE_URL,
): { subject: string; lines: string[] } {
  const primeiroNome = (o.customerName ?? '').trim().split(/\s+/)[0] || 'Cliente';
  const local = [o.city, o.state].map(v => (v ?? '').trim()).filter(Boolean).join('/');
  return {
    subject: `Novo pedido pago #${o.id} — R$ ${brlTxt(o.totalPrice)}`,
    lines: [
      `Cliente: ${primeiroNome}`,
      `Produto: ${o.product ?? '—'}`,
      `Destino: ${local || '—'}`,
      `Painel: ${storeUrl}/sal-vita-admin`,
    ],
  };
}

export function alertaPedidoRevisao(orderId: number, motivo: string): { subject: string; lines: string[] } {
  return {
    subject: `Pedido #${orderId} precisa de revisão`,
    lines: [`Motivo: ${motivo}`, `Painel: ${STORE_URL}/sal-vita-admin`],
  };
}

/** Envia o aviso sem nunca lançar e sem esperar mais de `maxMs` (não segura a resposta ao MP). */
export async function alertOwnerBestEffort(a: { subject: string; lines: string[] }, maxMs = 6000): Promise<void> {
  try {
    await Promise.race([alertOwner(a.subject, a.lines), new Promise<void>(r => setTimeout(r, maxMs))]);
  } catch { /* alertOwner já registra */ }
}
