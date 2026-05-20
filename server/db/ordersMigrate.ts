import { neon } from '@neondatabase/serverless';

export async function ensureOrdersTablesExist() {
  const url = process.env.ORDERS_DATABASE_URL;
  if (!url) return; // Not configured yet — skip silently
  try {
    const sql = neon(url);

    await sql`
      CREATE TABLE IF NOT EXISTS site_orders (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        postal_code TEXT NOT NULL,
        address TEXT NOT NULL,
        number TEXT NOT NULL,
        complement TEXT,
        neighborhood TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        product TEXT NOT NULL DEFAULT 'Sal Marinho Integral 1kg',
        unit_price TEXT NOT NULL DEFAULT '29.90',
        shipping_service_id TEXT,
        shipping_service_name TEXT,
        shipping_price TEXT,
        total_price TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_status TEXT NOT NULL DEFAULT 'awaiting',
        me_order_id TEXT,
        me_label_url TEXT,
        notes TEXT,
        tracking_code TEXT,
        mp_preference_id TEXT,
        mp_payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS site_orders_status_idx ON site_orders(status)`;
    await sql`CREATE INDEX IF NOT EXISTS site_orders_created_at_idx ON site_orders(created_at)`;
    await sql`ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT`;
    await sql`ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT`;
    await sql`ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS coupon_discount TEXT`;

    // Start order IDs at 10000 for new installs (safe to run multiple times)
    await sql`SELECT setval(pg_get_serial_sequence('site_orders','id'), GREATEST(last_value, 9999), true) FROM site_orders_id_seq`;

    await sql`
      CREATE TABLE IF NOT EXISTS abandoned_carts (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        postal_code TEXT,
        quantity INTEGER DEFAULT 1,
        step_reached INTEGER DEFAULT 1,
        recovered BOOLEAN NOT NULL DEFAULT FALSE,
        recovery_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS abandoned_carts_phone_idx ON abandoned_carts(customer_phone)`;
    await sql`CREATE INDEX IF NOT EXISTS abandoned_carts_recovered_idx ON abandoned_carts(recovered)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS abandoned_carts_phone_unique ON abandoned_carts(customer_phone)`;

    await sql`ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'checkout_started'`;
    await sql`ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS abandoned_at TIMESTAMP`;
    await sql`ALTER TABLE abandoned_carts ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP`;
    await sql`CREATE INDEX IF NOT EXISTS abandoned_carts_status_idx ON abandoned_carts(status)`;

    await sql`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id SERIAL PRIMARY KEY,
        cart_id INTEGER NOT NULL,
        customer_phone TEXT NOT NULL,
        rule_name TEXT NOT NULL DEFAULT 'abandoned_cart_30m',
        status TEXT NOT NULL DEFAULT 'scheduled',
        scheduled_for TIMESTAMP NOT NULL,
        sent_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        provider_response TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS automation_runs_status_idx ON automation_runs(status)`;
    await sql`CREATE INDEX IF NOT EXISTS automation_runs_scheduled_for_idx ON automation_runs(scheduled_for)`;
    await sql`CREATE INDEX IF NOT EXISTS automation_runs_cart_id_idx ON automation_runs(cart_id)`;
    await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS ai_body TEXT`;
    await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS ai_reasoning TEXT`;
    await sql`ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMP`;

    await sql`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        description TEXT,
        discount_type TEXT NOT NULL DEFAULT 'percent',
        discount_value TEXT NOT NULL DEFAULT '10',
        min_order_value TEXT DEFAULT '0',
        max_uses INTEGER DEFAULT 100,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS msg_templates (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        body TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS msg_templates_type_idx ON msg_templates(type)`;

    // Seed default templates
    await sql`
      INSERT INTO msg_templates (slug, type, label, body, active, is_default) VALUES
      ('abandoned_simples', 'abandoned', 'Abandono – Simples',
       ${'Olá *{nome}*! 🌊\n\nNotamos que você se interessou pelo *Sal Marinho Integral Sal Vita* mas não finalizou.\n\n👉 Finalize agora: {link}\n\nQualquer dúvida, é só chamar! 😊\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_'},
       true, true),
      ('abandoned_urgencia', 'abandoned', 'Abandono – Urgência',
       ${'Olá *{nome}*! 🧂\n\n⚠️ Seu sal ainda está no carrinho, mas o estoque é limitado!\n\nGaranta agora antes de esgotar:\n👉 {link}\n\n_Sal Vita — Mossoró/RN_'},
       true, false),
      ('abandoned_cupom', 'abandoned', 'Abandono – Com Cupom',
       ${'Olá *{nome}*! 🎁\n\nVimos que você ficou interessado no *Sal Vita Premium* e queremos te ajudar a finalizar.\n\nUse o cupom *{cupom}* e ganhe desconto especial:\n👉 {link}\n\nOfertas por tempo limitado!\n_Sal Vita — Sal Marinho de Mossoró/RN_'},
       true, false),
      ('unpaid_pix', 'unpaid', 'Não Pago – PIX Copia e Cola',
       ${'Olá *{nome}*! 💸\n\nSeu pedido *#{pedido}* — R$ {valor} — ainda está aguardando pagamento.\n\n✅ Pague agora via *PIX Copia e Cola*:\n```\n{pix}\n```\nCopie o código acima e cole no seu banco!\n\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_'},
       true, true),
      ('unpaid_lembrete', 'unpaid', 'Não Pago – Lembrete Geral',
       ${'Olá *{nome}*! 🌊\n\nSeu pedido *#{pedido}* do Sal Vita ainda está aguardando pagamento.\n\n💰 Total: R$ {valor}\n\nFinalize aqui:\n👉 {link}\n\n_Pedido reservado por tempo limitado!_\n_Sal Vita — Mossoró/RN_'},
       true, false),
      ('failed_tentar_novamente', 'failed', 'Pagamento Falhou – Tentar Novamente',
       ${'Olá *{nome}*! 😕\n\nHouve um problema no pagamento do pedido *#{pedido}*.\n\nTente com outro método de pagamento:\n👉 {link}\n\nAceitamos *PIX*, *Cartão* e *Boleto* 💳\n_Sal Vita — Mossoró/RN_'},
       true, true)
      ON CONFLICT (slug) DO NOTHING
    `;

    console.log('✅ Orders database tables ensured');
  } catch (err) {
    console.error('❌ Orders migration error:', err);
    throw err;
  }
}
