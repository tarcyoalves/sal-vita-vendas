import { pgTable, serial, text, integer, boolean, timestamp, numeric, jsonb, doublePrecision } from 'drizzle-orm/pg-core';

// Generic key/value store for small global toggles (e.g. TV panel on/off).
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Admin-curated catalog of tags. Attendants pick from this list when tagging
// tasks, instead of free-typing new tags (avoids duplicates/inconsistent naming).
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#6366f1'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  mustChangePassword: boolean('must_change_password').default(false).notNull(),
  ipRestrictionEnabled: boolean('ip_restriction_enabled').default(false).notNull(),
  allowedIps: text('allowed_ips').array().default([]).notNull(),
  // IP/data do último login bem-sucedido — permite ao admin ver o IP real do
  // atendente ao configurar restrição, em vez de adivinhar (login não é bloqueado
  // por restrição de IP, então isso é capturado mesmo se o usuário estiver restrito).
  lastLoginIp: text('last_login_ip'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sellers = pgTable('sellers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().default(0),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  department: text('department'),
  dailyGoal: integer('daily_goal').default(100),
  workHoursGoal: integer('work_hours_goal').default(8).notNull(),
  status: text('status').notNull().default('active'),
  // Assinatura de e-mail (E-mail Marketing) — HTML final injetado nas campanhas/sequências.
  // Pode conter um <img> apontando para emailSignatureImageUrl (origem da imagem enviada).
  emailSignatureHtml: text('email_signature_html'),
  emailSignatureImageUrl: text('email_signature_image_url'),
  emailSignatureEnabled: boolean('email_signature_enabled').default(true).notNull(),
  emailMarketingEnabled: boolean('email_marketing_enabled').default(false).notNull(),
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
  unsubscribed: boolean('unsubscribed').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().default(0),
  clientId: integer('client_id').notNull().default(0),
  title: text('title').notNull(),
  description: text('description'),
  notes: text('notes'),
  email: text('email'),
  tags: text('tags').array().default([]).notNull(),
  reminderDate: timestamp('reminder_date'),
  reminderEnabled: boolean('reminder_enabled').default(true),
  status: text('status').notNull().default('pending'),
  priority: text('priority').notNull().default('medium'),
  assignedTo: text('assigned_to'),
  lastContactedAt: timestamp('last_contacted_at'),
  // Lead → cliente ativo: marcado manualmente pelo atendente quando o contato vira venda.
  // Lembretes continuam recorrentes (não "concluem"); isto é um marco de conversão, não de status.
  convertedAt: timestamp('converted_at'),
  // Conta contatos reais (notas relevantes salvas) — usado para medir "quantos contatos até converter"
  contactCount: integer('contact_count').notNull().default(0),
  // Valor da venda quando o lead é convertido em cliente ativo (ticket médio, faturamento)
  orderValue: numeric('order_value', { precision: 10, scale: 2 }),
  orderId: text('order_id'),
  // E-mail Marketing Fase 3 — lead scoring: marcado quando o lead clica em algum
  // e-mail de campanha/sequência (sinal forte de interesse).
  hotLead: boolean('hot_lead').notNull().default(false),
  lastEngagementAt: timestamp('last_engagement_at'),
  // Identificadores normalizados (somente dígitos) usados para detectar reimportação
  // de leads já excluídos — ver task_deletion_logs.
  cnpj: text('cnpj'),
  phone: text('phone'),
  // Confirmação manual do e-mail: só e-mails confirmados pelo atendente entram em
  // qualquer disparo (campanhas, sequências, automações). E-mails importados começam
  // como não-confirmados; digitar/editar o e-mail à mão confirma automaticamente.
  emailConfirmed: boolean('email_confirmed').notNull().default(false),
  emailConfirmedAt: timestamp('email_confirmed_at'),
  emailConfirmedBy: text('email_confirmed_by'),
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
  unpaidFollowupSentAt: timestamp('unpaid_followup_sent_at'),
  // Marketing attribution (captured from the landing URL) so we know which ad
  // drove each sale, and to feed Meta CAPI with click/source data.
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmContent: text('utm_content'),
  utmTerm: text('utm_term'),
  fbclid: text('fbclid'),
  // Reorder reminder (retention): set when the ~45-day "buy again" nudge is sent.
  reorderRemindedAt: timestamp('reorder_reminded_at'),
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
  optedOut: boolean('opted_out').default(false).notNull(),
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
  // AI-generated fields
  aiBody: text('ai_body'),            // AI-generated custom message (overrides template)
  aiReasoning: text('ai_reasoning'),  // AI explanation of its decisions
  aiProcessedAt: timestamp('ai_processed_at'),
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
  useForRecovery: boolean('use_for_recovery').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const msgTemplates = pgTable('msg_templates', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(), // unique key, e.g. 'abandoned_simple'
  type: text('type').notNull(), // 'abandoned' | 'unpaid' | 'failed' | 'general'
  label: text('label').notNull(), // display name in admin
  body: text('body').notNull(), // message body with {variáveis}
  active: boolean('active').default(true).notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type SiteOrder = typeof siteOrders.$inferSelect;
export type AbandonedCart = typeof abandonedCarts.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type MsgTemplate = typeof msgTemplates.$inferSelect;

// ── E-mail Marketing (Lembretes CRM) ──────────────────────────────────────────

export const emailTemplateCategories = pgTable('email_template_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailTemplates = pgTable('email_templates', {
  id: serial('id').primaryKey(),
  categoryIds: jsonb('category_ids').$type<number[]>(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),
  attachments: jsonb('attachments'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailCampaigns = pgTable('email_campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),
  status: text('status').notNull().default('draft'), // draft|sending|paused|sent
  totalRecipients: integer('total_recipients').default(0).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  createdByUserId: integer('created_by_user_id').notNull(),
  // Disparo Rápido (Broadcast): envio avulso com lista manual de e-mails + anexos.
  isBroadcast: boolean('is_broadcast').notNull().default(false),
  // Anexos em base64: [{ filename, content }]. Limpos (null) após o envio concluir
  // para não inchar o banco. Só usados durante o envio de broadcasts.
  attachments: jsonb('attachments'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailCampaignRecipients = pgTable('email_campaign_recipients', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  replyTo: text('reply_to'),
  taskId: integer('task_id'),
  status: text('status').notNull().default('pending'), // pending|sending|sent|failed|skipped
  accountKey: text('account_key'),
  messageId: text('message_id'),
  unsubToken: text('unsub_token').notNull(),
  error: text('error'),
  sentAt: timestamp('sent_at'),
  // Momento em que a linha foi reservada ('sending') por um processBatch. Usado
  // para reciclar reservas órfãs (função morreu antes de finalizar) — ver
  // processBatch em server/routers/emailMarketing.ts.
  claimedAt: timestamp('claimed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailSuppressions = pgTable('email_suppressions', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  reason: text('reason').notNull().default('unsubscribe'), // unsubscribe|bounce|complaint|manual
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailSendCounters = pgTable('email_send_counters', {
  id: serial('id').primaryKey(),
  accountKey: text('account_key').notNull(),
  day: text('day').notNull(), // 'YYYY-MM-DD' UTC
  sent: integer('sent').default(0).notNull(),
});

export type EmailTemplateCategory = typeof emailTemplateCategories.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type EmailCampaignRecipient = typeof emailCampaignRecipients.$inferSelect;

export const taskDeletionLogs = pgTable('task_deletion_logs', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').notNull(),
  taskTitle: text('task_title').notNull(),
  taskNotes: text('task_notes'),
  deletedByUserId: integer('deleted_by_user_id').notNull(),
  deletedByName: text('deleted_by_name').notNull(),
  reason: text('reason').notNull(),
  reviewedByAdmin: boolean('reviewed_by_admin').default(false).notNull(),
  // Identificadores normalizados (somente dígitos) — usados para detectar reimportação
  // do mesmo lead via CNPJ ou telefone.
  cnpj: text('cnpj'),
  phone: text('phone'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Seller = typeof sellers.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
export type TaskDeletionLog = typeof taskDeletionLogs.$inferSelect;

// ── E-mail Marketing Fase 2 — Sequências, Automações, Tags, Eventos ─────────

export const emailSequences = pgTable('email_sequences', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').default(true).notNull(),
  // E-mail Marketing Fase 3 — sequências recorrentes (loop): ao terminar o
  // último passo, reinicia do passo 1 após `repeatIntervalDays` dias.
  repeat: boolean('repeat').notNull().default(false),
  repeatIntervalDays: integer('repeat_interval_days'), // gap antes de reiniciar o ciclo (nullable)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailSequenceSteps = pgTable('email_sequence_steps', {
  id: serial('id').primaryKey(),
  sequenceId: integer('sequence_id').notNull(),
  stepOrder: integer('step_order').notNull(),      // 1, 2, 3...
  delayDays: integer('delay_days').notNull(),       // dias após a inscrição
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),
  sendCondition: text('send_condition').notNull().default('always'),
  retryIfNotOpened: boolean('retry_if_not_opened').notNull().default(false),
  retryDelayHours: integer('retry_delay_hours').notNull().default(24),
  maxRetries: integer('max_retries').notNull().default(1),
  retrySubject: text('retry_subject'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailSequenceEnrollments = pgTable('email_sequence_enrollments', {
  id: serial('id').primaryKey(),
  sequenceId: integer('sequence_id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  replyTo: text('reply_to'),
  taskId: integer('task_id'),
  currentStep: integer('current_step').default(0).notNull(), // último passo enviado (0 = nenhum)
  status: text('status').notNull().default('active'),         // active|paused|completed|cancelled
  unsubToken: text('unsub_token').notNull(),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  nextSendAt: timestamp('next_send_at'),
  // E-mail Marketing Fase 3 — base de tempo para sequências recorrentes (loop):
  // inicializado = enrolledAt; reiniciado a cada novo ciclo de uma sequência repeat=true.
  cycleStartedAt: timestamp('cycle_started_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailSequenceSends = pgTable('email_sequence_sends', {
  id: serial('id').primaryKey(),
  enrollmentId: integer('enrollment_id').notNull(),
  stepId: integer('step_id').notNull(),
  status: text('status').notNull().default('sent'), // sending|sent|failed|skipped
  accountKey: text('account_key'),
  messageId: text('message_id'),
  error: text('error'),
  retryNumber: integer('retry_number').notNull().default(0),
  // Base de tempo do ciclo em que este envio ocorreu (= enrollment.cycleStartedAt).
  // Faz parte da chave única (enrollment, step, retry, cycle) para que sequências
  // recorrentes (repeat=true) possam reenviar o mesmo passo em ciclos distintos
  // sem colidir, mantendo a idempotência dentro do ciclo.
  cycleStartedAt: timestamp('cycle_started_at'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
});

export const emailEvents = pgTable('email_events', {
  id: serial('id').primaryKey(),
  messageId: text('message_id').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  eventType: text('event_type').notNull(), // delivered|opened|clicked|bounced|complained
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const automationRules = pgTable('automation_rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),   // lead_created|lead_converted|inactive_days
  triggerConfig: text('trigger_config'),          // JSON, ex: {"days":30}
  actionType: text('action_type').notNull(),     // enroll_sequence|add_tag|cancel_sequences
  actionConfig: text('action_config').notNull(), // JSON, ex: {"sequenceId":3} ou {"tag":"cliente"}
  requiredTags: text('required_tags').array(),    // lead MUST have ALL these tags to trigger
  excludedTags: text('excluded_tags').array(),    // lead MUST NOT have ANY of these tags
  cancelOtherSequences: boolean('cancel_other_sequences').default(false).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ── Marketing Lists & Contacts (standalone CSV-imported leads) ────────────────

export const marketingLists = pgTable('marketing_lists', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  contactCount: integer('contact_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export type MarketingList = typeof marketingLists.$inferSelect;

export const marketingContacts = pgTable('marketing_contacts', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  phone: text('phone'),
  company: text('company'),
  city: text('city'),
  state: text('state'),
  listId: integer('list_id'),
  tags: text('tags').array().default([]).notNull(),
  source: text('source').notNull().default('csv_import'), // csv_import | manual
  status: text('status').notNull().default('active'),     // active | unsubscribed
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
export type MarketingContact = typeof marketingContacts.$inferSelect;

export type EmailSequence = typeof emailSequences.$inferSelect;
export type EmailSequenceStep = typeof emailSequenceSteps.$inferSelect;
export type EmailSequenceEnrollment = typeof emailSequenceEnrollments.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;

// ── B2B Prospecção (Sprint 1 — fundação: inbound /atacado + compliance) ───────
// Escopo mínimo aprovado (PLANO-FINAL-EXECUCAO-B2B.md, Seção 9). NÃO inclui
// lead_scores (Sprint 3) nem qualquer tabela de outbound/enriquecimento —
// essas ficam para sprints futuros. Vive no schema `public` do mesmo Neon
// (sem custo de schema novo); dedup e criação via server/db/b2bMigrate.ts.

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  tradeName: text('trade_name'),
  segment: text('segment'),
  subsegment: text('subsegment'),
  cnpj: text('cnpj'),
  // 'unverified' | 'cnpj_valid' | 'cnpj_inactive' | 'duplicate' | 'invalid'
  companyValidationStatus: text('company_validation_status').notNull().default('unverified'),
  website: text('website'),
  instagramUrl: text('instagram_url'),
  city: text('city'),
  state: text('state'),
  country: text('country').notNull().default('BR'),
  sourceType: text('source_type'),
  sourceUrl: text('source_url'),
  // 'inbound' | 'outbound' — Sprint 1 só produz 'inbound' (formulário /atacado)
  pipelineType: text('pipeline_type').notNull().default('inbound'),
  pipelineStage: text('pipeline_stage').notNull().default('discovered'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull(),
  name: text('name'),
  role: text('role'),
  email: text('email'),
  phone: text('phone'),
  whatsapp: text('whatsapp'),
  channelType: text('channel_type'),
  isPublicBusinessContact: boolean('is_public_business_contact').notNull().default(true),
  sourceUrl: text('source_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const publicSources = pgTable('public_sources', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull(),
  sourceType: text('source_type').notNull(),
  sourceUrl: text('source_url'),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
  rawExcerpt: text('raw_excerpt'),
  confidence: integer('confidence'),
});

export const consentRecords = pgTable('consent_records', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').notNull(),
  contactId: integer('contact_id'),
  formName: text('form_name'),
  consentText: text('consent_text'),
  consentedAt: timestamp('consented_at').defaultNow().notNull(),
  // Never store the raw IP — only a one-way hash, per LGPD data-minimization.
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
});

export const suppressionList = pgTable('suppression_list', {
  id: serial('id').primaryKey(),
  email: text('email'),
  phone: text('phone'),
  domain: text('domain'),
  companyId: integer('company_id'),
  reason: text('reason').notNull(), // opt_out | bounce | complaint | manual
  source: text('source'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id'),
  action: text('action').notNull(),
  actorType: text('actor_type').notNull(), // ai_agent | human | system
  actorId: text('actor_id'),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type PublicSource = typeof publicSources.$inferSelect;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type SuppressionEntry = typeof suppressionList.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

// ── Faturamento & Comissão (migrado do localStorage → Neon em 02/07) ──────────
// IDs são gerados no cliente (uid()) e mantidos como PK text, para que o store
// continue com API síncrona (upsert retorna o objeto na hora). `itens` é jsonb
// (array sempre lido/escrito por inteiro, nunca consultado item a item). Datas
// ficam como text ISO — todo o filtro por mês acontece no cliente (calc.ts).
type FatItemPedido = {
  id: string;
  produtoId: string | null;
  descricao: string;
  quantidade: number;
  pesoKg: number;
  valorUnitario: number;
  pesoBrutoKg?: number;
  // Snapshot da regra do produto no momento em que o item foi adicionado ao
  // pedido — nunca recalculado retroativamente (mesmo padrão de comissaoPct).
  // null = usa a comissão normal do atendente (pedido.comissaoPct).
  comissaoFixaPct?: number | null;
  isentoFrete?: boolean;
};

export const fatProducts = pgTable('fat_products', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  pesoUnitarioKg: doublePrecision('peso_unitario_kg').notNull().default(0),
  valorUnitario: doublePrecision('valor_unitario').notNull().default(0),
  ativo: boolean('ativo').notNull().default(true),
  criadoEm: text('criado_em').notNull(),
  // null = comissão normal do atendente. Setado = sempre essa % neste produto,
  // independente de quem vender (ex: SAL MARINHO MOIDO INTEGRAL VITA PREMIUM 10X1 KG = 10%).
  comissaoFixaPct: doublePrecision('comissao_fixa_pct'),
  isentoFrete: boolean('isento_frete').notNull().default(false),
});

export const fatOrders = pgTable('fat_orders', {
  id: text('id').primaryKey(),
  taskId: integer('task_id'),
  sellerId: integer('seller_id'),
  sellerName: text('seller_name').notNull().default(''),
  clienteNome: text('cliente_nome').notNull().default(''),
  cnpj: text('cnpj').notNull().default(''),
  razaoSocial: text('razao_social').notNull().default(''),
  cidade: text('cidade').notNull().default(''),
  uf: text('uf').notNull().default(''),
  status: text('status').notNull().default('estimado'), // estimado | faturado
  comissaoPct: doublePrecision('comissao_pct').notNull().default(0),
  itens: jsonb('itens').$type<FatItemPedido[]>().notNull(),
  itensEstimadoSnapshot: jsonb('itens_estimado_snapshot').$type<FatItemPedido[] | null>(),
  prazoPagamentoSal: text('prazo_pagamento_sal').notNull().default(''),
  prazoPagamentoFrete: text('prazo_pagamento_frete').notNull().default(''),
  valorFretePorUnidade: doublePrecision('valor_frete_por_unidade').notNull().default(0),
  observacoes: text('observacoes').notNull().default(''),
  criadoEm: text('criado_em').notNull(),
  faturadoEm: text('faturado_em'),
  valorPago: doublePrecision('valor_pago').notNull().default(0),
  // Revisão do admin — informativa, não bloqueia nenhuma ação do atendente.
  aprovadoEm: text('aprovado_em'),
  aprovadoPor: text('aprovado_por'),
  createdByUserId: integer('created_by_user_id'),
  createdByRole: text('created_by_role'),
});

export const fatCommissions = pgTable('fat_commissions', {
  sellerId: integer('seller_id').primaryKey(),
  pct: doublePrecision('pct').notNull().default(0),
});

// Auditoria de exclusão de pedidos — mesma lógica de task_deletion_logs:
// snapshot dos dados do pedido no momento da exclusão + motivo obrigatório.
export const fatOrderDeletionLogs = pgTable('fat_order_deletion_logs', {
  id: serial('id').primaryKey(),
  pedidoId: text('pedido_id').notNull(),
  clienteNome: text('cliente_nome').notNull().default(''),
  cnpj: text('cnpj').notNull().default(''),
  valorTotal: doublePrecision('valor_total').notNull().default(0),
  sellerId: integer('seller_id'),
  sellerName: text('seller_name').notNull().default(''),
  deletedByUserId: integer('deleted_by_user_id').notNull(),
  deletedByName: text('deleted_by_name').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type FatProduct = typeof fatProducts.$inferSelect;
export type FatOrder = typeof fatOrders.$inferSelect;
export type FatCommission = typeof fatCommissions.$inferSelect;
export type FatOrderDeletionLog = typeof fatOrderDeletionLogs.$inferSelect;
