import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sellers = pgTable('sellers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().default(0),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  department: text('department'),
  dailyGoal: integer('daily_goal').default(10),
  workHoursGoal: integer('work_hours_goal').default(8).notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  company: text('company'),
  city: text('city'),
  state: text('state'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().default(0),
  clientId: integer('client_id').notNull().default(0),
  title: text('title').notNull(),
  description: text('description'),
  notes: text('notes'),
  reminderDate: timestamp('reminder_date'),
  reminderEnabled: boolean('reminder_enabled').default(true),
  status: text('status').notNull().default('pending'),
  priority: text('priority').notNull().default('medium'),
  assignedTo: text('assigned_to'),
  lastContactedAt: timestamp('last_contacted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reminders = pgTable('reminders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  clientName: text('client_name').notNull(),
  clientPhone: text('client_phone'),
  notes: text('notes'),
  scheduledDate: timestamp('scheduled_date').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  content: text('content').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  category: text('category'),
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workSessions = pgTable('work_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  pausedAt: timestamp('paused_at'),
  totalPausedMs: integer('total_paused_ms').default(0).notNull(),
  status: text('status').notNull().default('active'), // active | paused | ended
  dailyGoalHours: integer('daily_goal_hours').default(8).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const siteOrders = pgTable('site_orders', {
  id: serial('id').primaryKey(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email'),
  customerCpf: text('customer_cpf'),
  postalCode: text('postal_code').notNull(),
  address: text('address').notNull(),
  number: text('number').notNull(),
  complement: text('complement'),
  neighborhood: text('neighborhood').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  quantity: integer('quantity').notNull().default(1),
  product: text('product').notNull().default('Sal Marinho Integral 1kg'),
  unitPrice: text('unit_price').notNull().default('29.90'),
  shippingServiceId: text('shipping_service_id'),
  shippingServiceName: text('shipping_service_name'),
  shippingPrice: text('shipping_price'),
  totalPrice: text('total_price'),
  status: text('status').notNull().default('pending'),
  paymentStatus: text('payment_status').notNull().default('awaiting'),
  meOrderId: text('me_order_id'),
  meLabelUrl: text('me_label_url'),
  trackingCode: text('tracking_code'),
  mpPreferenceId: text('mp_preference_id'),
  mpPaymentId: text('mp_payment_id'),
  notes: text('notes'),
  couponCode: text('coupon_code'),
  couponDiscount: text('coupon_discount'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const abandonedCarts = pgTable('abandoned_carts', {
  id: serial('id').primaryKey(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull().unique(),
  customerEmail: text('customer_email'),
  postalCode: text('postal_code'),
  quantity: integer('quantity').default(1),
  stepReached: integer('step_reached').default(1), // 1=form 2=shipping 3=payment
  status: text('status').notNull().default('checkout_started'), // checkout_started | redirected_to_payment | abandoned | converted | cancelled
  recovered: boolean('recovered').default(false).notNull(),
  recoverySentAt: timestamp('recovery_sent_at'),
  abandonedAt: timestamp('abandoned_at'),
  convertedAt: timestamp('converted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const automationRuns = pgTable('automation_runs', {
  id: serial('id').primaryKey(),
  cartId: integer('cart_id').notNull(),
  customerPhone: text('customer_phone').notNull(),
  ruleName: text('rule_name').notNull().default('abandoned_cart_30m'),
  status: text('status').notNull().default('scheduled'), // scheduled | sent | cancelled | failed
  scheduledFor: timestamp('scheduled_for').notNull(),
  sentAt: timestamp('sent_at'),
  cancelledAt: timestamp('cancelled_at'),
  providerResponse: text('provider_response'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const coupons = pgTable('coupons', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description'),
  discountType: text('discount_type').notNull().default('percent'), // 'percent' | 'fixed'
  discountValue: text('discount_value').notNull().default('10'),
  minOrderValue: text('min_order_value').default('0'),
  maxUses: integer('max_uses').default(100),
  usedCount: integer('used_count').default(0).notNull(),
  expiresAt: timestamp('expires_at'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type SiteOrder = typeof siteOrders.$inferSelect;
export type AbandonedCart = typeof abandonedCarts.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;

export type User = typeof users.$inferSelect;
export type Seller = typeof sellers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
