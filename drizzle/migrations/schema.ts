import { pgTable, serial, timestamp, numeric, text, jsonb, varchar, boolean, integer, unique, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const callStatus = pgEnum("call_status", ['pending', 'completed', 'cancelled', 'rescheduled'])
export const chatRole = pgEnum("chat_role", ['user', 'assistant'])
export const clientStatus = pgEnum("client_status", ['active', 'inactive', 'prospect'])
export const leadStatus = pgEnum("lead_status", ['new', 'assigned', 'contacted', 'converted', 'lost'])
export const notificationType = pgEnum("notification_type", ['reminder', 'alert', 'info'])
export const priority = pgEnum("priority", ['low', 'medium', 'high'])
export const resultType = pgEnum("result_type", ['realizada', 'nao_atendida', 'reagendada', 'convertida'])
export const role = pgEnum("role", ['admin', 'user'])
export const sellerStatus = pgEnum("seller_status", ['active', 'inactive'])
export const taskStatus = pgEnum("task_status", ['pending', 'completed', 'cancelled'])


export const aiAnalysis = pgTable("ai_analysis", {
	id: serial().primaryKey().notNull(),
	sellerId: serial("seller_id").notNull(),
	analysisDate: timestamp("analysis_date", { mode: 'string' }).notNull(),
	performanceScore: numeric("performance_score", { precision: 5, scale:  2 }),
	fraudRiskScore: numeric("fraud_risk_score", { precision: 5, scale:  2 }),
	insights: text(),
	recommendations: text(),
	suspiciousPatterns: jsonb("suspicious_patterns"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const callReminders = pgTable("call_reminders", {
	id: serial().primaryKey().notNull(),
	sellerId: serial("seller_id").notNull(),
	clientName: varchar("client_name", { length: 255 }).notNull(),
	clientPhone: varchar("client_phone", { length: 20 }),
	clientEmail: varchar("client_email", { length: 320 }),
	scheduledDate: timestamp("scheduled_date", { mode: 'string' }).notNull(),
	notes: text(),
	status: callStatus().default('pending'),
	priority: priority().default('medium'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const callResults = pgTable("call_results", {
	id: serial().primaryKey().notNull(),
	reminderId: serial("reminder_id").notNull(),
	resultType: resultType("result_type").notNull(),
	notes: text(),
	nextScheduledDate: timestamp("next_scheduled_date", { mode: 'string' }),
	isFraud: boolean("is_fraud").default(false),
	completedAt: timestamp("completed_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const chatHistory = pgTable("chat_history", {
	id: serial().primaryKey().notNull(),
	userId: serial("user_id").notNull(),
	role: chatRole().notNull(),
	message: text().notNull(),
	context: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const clients = pgTable("clients", {
	id: serial().primaryKey().notNull(),
	cnpj: varchar({ length: 18 }),
	name: varchar({ length: 255 }).notNull(),
	contact: varchar({ length: 255 }),
	phone: varchar({ length: 20 }).notNull(),
	city: varchar({ length: 100 }).notNull(),
	state: varchar({ length: 2 }).notNull(),
	email: varchar({ length: 320 }),
	status: clientStatus().default('prospect'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const dailyMetrics = pgTable("daily_metrics", {
	id: serial().primaryKey().notNull(),
	sellerId: integer("seller_id").notNull(),
	metricsDate: timestamp("metrics_date", { mode: 'string' }).notNull(),
	totalReminders: integer("total_reminders").default(0),
	completedReminders: integer("completed_reminders").default(0),
	convertedCalls: integer("converted_calls").default(0),
	conversionRate: numeric("conversion_rate", { precision: 5, scale:  2 }).default('0.00'),
	notAttendedCalls: integer("not_attended_calls").default(0),
	rescheduledCalls: integer("rescheduled_calls").default(0),
	goalMet: boolean("goal_met").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const knowledge = pgTable("knowledge", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	content: text().notNull(),
	fileUrl: varchar("file_url", { length: 500 }),
	category: varchar({ length: 100 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const leads = pgTable("leads", {
	id: serial().primaryKey().notNull(),
	clientId: integer("client_id").notNull(),
	sellerId: integer("seller_id"),
	importBatchId: varchar("import_batch_id", { length: 64 }),
	status: leadStatus().default('new'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	message: text(),
	type: notificationType().default('info'),
	reminderId: integer("reminder_id"),
	isRead: boolean("is_read").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const sellers = pgTable("sellers", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	name: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 320 }).notNull(),
	phone: varchar({ length: 20 }),
	department: varchar({ length: 100 }),
	dailyGoal: integer("daily_goal").default(10),
	status: sellerStatus().default('active'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	clientId: integer("client_id").notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	notes: text(),
	reminderDate: timestamp("reminder_date", { mode: 'string' }),
	reminderEnabled: boolean("reminder_enabled").default(true),
	status: taskStatus().default('pending'),
	priority: priority().default('medium'),
	assignedTo: varchar("assigned_to", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	openId: varchar("open_id", { length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar("login_method", { length: 64 }),
	role: role().default('user').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	lastSignedIn: timestamp("last_signed_in", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_open_id_unique").on(table.openId),
]);
