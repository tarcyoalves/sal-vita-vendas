import { eq, and, gte, lte, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { InsertUser, users, sellers, callReminders, callResults, dailyMetrics, aiAnalysis, notifications, tasks, clients } from "../drizzle/schema";
import { ENV } from './_core/env';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql);

export async function getDb() {
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();

  try {
    const values: any = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    textFields.forEach((field) => {
      if (user[field] !== undefined) {
        values[field] = user[field] ?? null;
        updateSet[field] = user[field] ?? null;
      }
    });

    if (user.lastSignedIn) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getSellers() {
  const db = await getDb();
  return db.select().from(sellers);
}

export async function getSellersByUserId(userId: number) {
  const db = await getDb();
  return db.select().from(sellers).where(eq(sellers.userId, userId));
}

export async function createSeller(data: typeof sellers.$inferInsert) {
  const db = await getDb();
  return db.insert(sellers).values(data);
}

export async function getCallReminders(sellerId: number) {
  const db = await getDb();
  return db.select().from(callReminders).where(eq(callReminders.sellerId, sellerId));
}

export async function getAllCallRemindersWithSeller() {
  const db = await getDb();
  return db
    .select({
      id: callReminders.id,
      sellerId: callReminders.sellerId,
      sellerName: sellers.name,
      clientName: callReminders.clientName,
      clientPhone: callReminders.clientPhone,
      clientEmail: callReminders.clientEmail,
      scheduledDate: callReminders.scheduledDate,
      notes: callReminders.notes,
      status: callReminders.status,
      priority: callReminders.priority,
      createdAt: callReminders.createdAt,
      updatedAt: callReminders.updatedAt,
    })
    .from(callReminders)
    .leftJoin(sellers, eq(callReminders.sellerId, sellers.id));
}

export async function createCallReminder(data: typeof callReminders.$inferInsert) {
  const db = await getDb();
  return db.insert(callReminders).values(data);
}

export async function updateCallReminder(id: number, data: Partial<typeof callReminders.$inferInsert>) {
  const db = await getDb();
  return db.update(callReminders).set(data).where(eq(callReminders.id, id));
}

export async function getCallResults(reminderId: number) {
  const db = await getDb();
  return db.select().from(callResults).where(eq(callResults.reminderId, reminderId));
}

export async function createCallResult(data: typeof callResults.$inferInsert) {
  const db = await getDb();
  return db.insert(callResults).values(data);
}

export async function getDailyMetrics(sellerId: number, date: Date) {
  const db = await getDb();
  const result = await db.select().from(dailyMetrics)
    .where(and(
      eq(dailyMetrics.sellerId, sellerId),
      gte(dailyMetrics.metricsDate, new Date(date.getFullYear(), date.getMonth(), date.getDate())),
      lte(dailyMetrics.metricsDate, new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1))
    )).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createDailyMetric(data: typeof dailyMetrics.$inferInsert) {
  const db = await getDb();
  return db.insert(dailyMetrics).values(data);
}

export async function getAiAnalysis(sellerId: number) {
  const db = await getDb();
  const result = await db.select().from(aiAnalysis)
    .where(eq(aiAnalysis.sellerId, sellerId))
    .orderBy(desc(aiAnalysis.analysisDate))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createAiAnalysis(data: typeof aiAnalysis.$inferInsert) {
  const db = await getDb();
  return db.insert(aiAnalysis).values(data);
}

export async function getAllUsers() {
  const db = await getDb();
  return db.select().from(users);
}

export async function updateUserRole(userId: number, role: "admin" | "user") {
  const db = await getDb();
  return db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getSellersWithUserRole() {
  const db = await getDb();
  return db
    .select({
      id: sellers.id,
      userId: sellers.userId,
      name: sellers.name,
      email: sellers.email,
      phone: sellers.phone,
      department: sellers.department,
      dailyGoal: sellers.dailyGoal,
      status: sellers.status,
      createdAt: sellers.createdAt,
      updatedAt: sellers.updatedAt,
      userRole: users.role,
    })
    .from(sellers)
    .leftJoin(users, eq(sellers.userId, users.id));
}

export async function getNotifications(userId: number) {
  const db = await getDb();
  return db.select().from(notifications).where(eq(notifications.userId, userId));
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  return db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  return db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
}

export async function createNotification(data: typeof notifications.$inferInsert) {
  const db = await getDb();
  return db.insert(notifications).values(data);
}

// Tasks helpers
export async function getTasks(userId: number) {
  const db = await getDb();
  return db.select().from(tasks).where(eq(tasks.userId, userId));
}

export async function getTaskById(id: number) {
  const db = await getDb();
  const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createTask(data: typeof tasks.$inferInsert) {
  const db = await getDb();
  return db.insert(tasks).values(data);
}

export async function updateTask(id: number, data: Partial<typeof tasks.$inferInsert>) {
  const db = await getDb();
  return db.update(tasks).set(data).where(eq(tasks.id, id));
}

export async function deleteTask(id: number) {
  const db = await getDb();
  return db.delete(tasks).where(eq(tasks.id, id));
}

export async function getTasksWithClients(userId: number) {
  const db = await getDb();
  return db.select().from(tasks).where(eq(tasks.userId, userId));
}
