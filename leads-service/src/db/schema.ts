import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

// A pessoa interessada que chegou via anúncio
export const leads = pgTable('leads', {
  id: serial('id').primaryKey(),
  waNumber: text('wa_number').notNull().unique(),
  name: text('name'),
  interestType: text('interest_type').notNull().default('unknown'), // 'comprar' | 'representante' | 'unknown'
  region: text('region'),
  intendedVolume: text('intended_volume'),
  purpose: text('purpose'), // 'consumo' | 'revenda' | 'representacao' | null
  source: text('source').notNull().default('whatsapp_ad'),
  qualified: boolean('qualified').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// A conversa com o lead (em geral uma por lead)
export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  leadId: integer('lead_id').notNull(),
  status: text('status').notNull().default('bot'), // 'bot' | 'awaiting_human' | 'human' | 'closed'
  assignedUserId: integer('assigned_user_id'),
  handoffReason: text('handoff_reason'),
  lastMessageAt: timestamp('last_message_at'),
  botPausedUntil: timestamp('bot_paused_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Cada mensagem trocada na conversa
export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull(),
  direction: text('direction').notNull(), // 'inbound' | 'outbound'
  sender: text('sender').notNull(), // 'lead' | 'bot' | 'human'
  content: text('content').notNull(),
  waMessageId: text('wa_message_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Histórico de trocas de controle bot <-> humano (auditoria)
export const handoffEvents = pgTable('handoff_events', {
  id: serial('id').primaryKey(),
  conversationId: integer('conversation_id').notNull(),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  triggeredBy: text('triggered_by').notNull(), // 'ai' | 'human' | 'system'
  userId: integer('user_id'),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Registro cru de tudo que a Evolution API enviou (depuração e auditoria)
export const webhookLog = pgTable('webhook_log', {
  id: serial('id').primaryKey(),
  payload: text('payload').notNull(),
  processed: boolean('processed').default(false).notNull(),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type HandoffEvent = typeof handoffEvents.$inferSelect;
export type WebhookLog = typeof webhookLog.$inferSelect;
