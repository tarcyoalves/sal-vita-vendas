import { pgTable, serial, text, timestamp, varchar, decimal, boolean, jsonb, pgEnum, integer } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "user"]);
export const sellerStatusEnum = pgEnum("seller_status", ["active", "inactive"]);
export const callStatusEnum = pgEnum("call_status", ["pending", "completed", "cancelled", "rescheduled"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high"]);
export const resultTypeEnum = pgEnum("result_type", ["realizada", "nao_atendida", "reagendada", "convertida"]);
export const clientStatusEnum = pgEnum("client_status", ["active", "inactive", "prospect"]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "assigned", "contacted", "converted", "lost"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "completed", "cancelled"]);
export const notificationTypeEnum = pgEnum("notification_type", ["reminder", "alert", "info"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export const sellers = pgTable("sellers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  department: varchar("department", { length: 100 }),
  dailyGoal: integer("daily_goal").default(10),
  status: sellerStatusEnum("status").default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const callReminders = pgTable("call_reminders", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 20 }),
  clientEmail: varchar("client_email", { length: 320 }),
  scheduledDate: timestamp("scheduled_date").notNull(),
  notes: text("notes"),
  status: callStatusEnum("status").default("pending"),
  priority: priorityEnum("priority").default("medium"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const callResults = pgTable("call_results", {
  id: serial("id").primaryKey(),
  reminderId: integer("reminder_id").notNull(),
  resultType: resultTypeEnum("result_type").notNull(),
  notes: text("notes"),
  nextScheduledDate: timestamp("next_scheduled_date"),
  isFraud: boolean("is_fraud").default(false),
  completedAt: timestamp("completed_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyMetrics = pgTable("daily_metrics", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  metricsDate: timestamp("metrics_date").notNull(),
  totalReminders: integer("total_reminders").default(0),
  completedReminders: integer("completed_reminders").default(0),
  convertedCalls: integer("converted_calls").default(0),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0.00"),
  notAttendedCalls: integer("not_attended_calls").default(0),
  rescheduledCalls: integer("rescheduled_calls").default(0),
  goalMet: boolean("goal_met").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiAnalysis = pgTable("ai_analysis", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  analysisDate: timestamp("analysis_date").notNull(),
  performanceScore: decimal("performance_score", { precision: 5, scale: 2 }),
  fraudRiskScore: decimal("fraud_risk_score", { precision: 5, scale: 2 }),
  insights: text("insights"),
  recommendations: text("recommendations"),
  suspiciousPatterns: jsonb("suspicious_patterns"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  cnpj: varchar("cnpj", { length: 18 }),
  name: varchar("name", { length: 255 }).notNull(),
  contact: varchar("contact", { length: 255 }),
  phone: varchar("phone", { length: 20 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  email: varchar("email", { length: 320 }),
  status: clientStatusEnum("status").default("prospect"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  sellerId: integer("seller_id"),
  importBatchId: varchar("import_batch_id", { length: 64 }),
  status: leadStatusEnum("status").default("new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  clientId: integer("client_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  notes: text("notes"),
  reminderDate: timestamp("reminder_date"),
  reminderEnabled: boolean("reminder_enabled").default(true),
  status: taskStatusEnum("status").default("pending"),
  priority: priorityEnum("priority").default("medium"),
  assignedTo: varchar("assigned_to", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  type: notificationTypeEnum("type").default("info"),
  reminderId: integer("reminder_id"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatHistory = pgTable("chat_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  role: chatRoleEnum("role").notNull(),
  message: text("message").notNull(),
  context: jsonb("context"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const knowledge = pgTable("knowledge", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  fileUrl: varchar("file_url", { length: 500 }),
  category: varchar("category", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Seller = typeof sellers.$inferSelect;
export type InsertSeller = typeof sellers.$inferInsert;
export type CallReminder = typeof callReminders.$inferSelect;
export type InsertCallReminder = typeof callReminders.$inferInsert;
export type CallResult = typeof callResults.$inferSelect;
export type InsertCallResult = typeof callResults.$inferInsert;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type InsertDailyMetric = typeof dailyMetrics.$inferInsert;
export type AiAnalysis = typeof aiAnalysis.$inferSelect;
export type InsertAiAnalysis = typeof aiAnalysis.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;
export type ChatHistory = typeof chatHistory.$inferSelect;
export type InsertChatHistory = typeof chatHistory.$inferInsert;
export type Knowledge = typeof knowledge.$inferSelect;
export type InsertKnowledge = typeof knowledge.$inferInsert;
