import { ordersDb as db } from '../db/ordersDb';
import { siteOrders } from '../db/schema';
import { eq } from 'drizzle-orm';

type SiteOrder = typeof siteOrders.$inferSelect;

// Creates a fresh PIX (copy-paste) payment at Mercado Pago for an order and
// stores the resulting payment id. Used both by the customer-facing checkout
// and by admin/automated recovery messages that need a PIX code on demand.
export async function createPixPaymentForOrder(order: SiteOrder): Promise<{ paymentId: string; qrCode: string; qrCodeBase64: string } | null> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) return null;

  const amount = parseFloat(order.totalPrice ?? '0');
  if (!(amount > 0)) return null;

  const email = (order.customerEmail && order.customerEmail.includes('@')) ? order.customerEmail : `cliente${order.id}@salvitarn.com.br`;
  const body: any = {
    transaction_amount: amount,
    description: `Pedido #${order.id} — Sal Vita`,
    payment_method_id: 'pix',
    payer: {
      email,
      first_name: order.customerName.split(' ')[0],
      last_name: order.customerName.split(' ').slice(1).join(' ') || '-',
    },
    external_reference: String(order.id),
    notification_url: 'https://premium.salvitarn.com.br/api/mp-webhook',
  };
  if (order.customerCpf) body.payer.identification = { type: 'CPF', number: order.customerCpf.replace(/\D/g, '') };

  try {
    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `pix-${order.id}-${Date.now()}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, any>;
    const td = data?.point_of_interaction?.transaction_data;
    if (!td?.qr_code) return null;

    await db.update(siteOrders).set({ mpPaymentId: String(data.id), updatedAt: new Date() }).where(eq(siteOrders.id, order.id));

    return {
      paymentId: String(data.id),
      qrCode: td.qr_code as string,
      qrCodeBase64: (td.qr_code_base64 ?? '') as string,
    };
  } catch {
    return null;
  }
}
