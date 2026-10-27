import { describe, it, expect, vi, beforeAll } from 'vitest';

describe('E-mail de pós-venda da Loja Premium', () => {
  beforeAll(() => {
    process.env.ORDERS_DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    process.env.JWT_SECRET ??= 'test-jwt-secret-min-32-chars-long!';
  });

  it('gera assunto humanizado com o primeiro nome do cliente', async () => {
    const { postPurchaseEmail } = await import('../server/email/resend');
    const email = postPurchaseEmail('Filipe Silva', 10004, 'https://premium.salvitarn.com.br/meu-pedido');
    expect(email.subject).toBe('Chegou tudo bem com seu Sal Vita, Filipe?');
  });

  it('inclui orientações de conservação com fecho zip lock e canal de suporte', async () => {
    const { postPurchaseEmail } = await import('../server/email/resend');
    const email = postPurchaseEmail('Filipe Silva', 10004, 'https://premium.salvitarn.com.br/meu-pedido');
    expect(email.html).toContain('Pedido #10004');
    expect(email.html).toContain('Filipe');
    expect(email.html).toContain('zip lock');
    expect(email.html).toContain('(84) 2140-8212');
    expect(email.html).toContain('Equipe Sal Vita');
  });

  it('respeita regras regulatórias da ANVISA (sem falsas alegações de saúde ou aditivos)', async () => {
    const { postPurchaseEmail } = await import('../server/email/resend');
    const email = postPurchaseEmail('Filipe Silva', 10004, 'https://premium.salvitarn.com.br/meu-pedido');
    const lower = email.html.toLowerCase();
    expect(lower).not.toContain('sem aditivos');
    expect(lower).not.toContain('iodo natural');
    expect(lower).not.toContain('80 minerais');
    expect(lower).not.toContain('cura');
    expect(lower).not.toContain('imunidade');
  });

  it('escapa caracteres especiais do nome para evitar injeção de HTML', async () => {
    const { postPurchaseEmail } = await import('../server/email/resend');
    const email = postPurchaseEmail('<script>alert(1)</script>', 10004, 'https://premium.salvitarn.com.br/meu-pedido');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('dispara pós-venda quando evento de entrega é "delivered"', async () => {
    const resendModule = await import('../server/email/resend');
    const sendSpy = vi.spyOn(resendModule, 'sendEmail').mockResolvedValue({ ok: true, id: 'msg_123' });

    const { notifyShippingEvent } = await import('../server/routers/shipping');
    const order = {
      id: 10004,
      customerName: 'Filipe Silva',
      customerEmail: 'filipe@exemplo.com.br',
      trackingCode: 'BR123456789BR',
    };

    const res = await notifyShippingEvent(order, 'delivered');
    expect(res).toBe('email');
    expect(sendSpy).toHaveBeenCalled();
    const [emailTarget, subject] = sendSpy.mock.calls[0];
    expect(emailTarget).toBe('filipe@exemplo.com.br');
    expect(subject).toBe('Chegou tudo bem com seu Sal Vita, Filipe?');

    sendSpy.mockRestore();
  });
});
