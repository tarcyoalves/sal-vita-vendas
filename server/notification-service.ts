import * as db from "./db";
import { notifyOwner } from "./_core/notification";

export async function checkAndNotifyUpcomingReminders() {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return;

    // Buscar lembretes que vencerão nos próximos 15 minutos
    const now = new Date();
    const fifteenMinutesLater = new Date(now.getTime() + 15 * 60 * 1000);

    const { callReminders } = require("../drizzle/schema");
    const { and, eq, gte, lte } = require("drizzle-orm");
    
    const reminders = await dbInstance
      .select()
      .from(callReminders)
      .where(
        and(
          eq(callReminders.status, "pending"),
          gte(callReminders.scheduledDate, now),
          lte(callReminders.scheduledDate, fifteenMinutesLater)
        )
      );

    for (const reminder of reminders as any[]) {
      // Criar notificação para o vendedor
      const seller = await dbInstance.select().from(require("../drizzle/schema").sellers).where(eq(require("../drizzle/schema").sellers.id, reminder.sellerId)).limit(1);
      if (seller.length > 0) {
        await db.createNotification({
          userId: seller[0].userId,
          title: `⏰ Lembrete: ${reminder.clientName}`,
          message: `Ligação agendada para ${new Date(reminder.scheduledDate).toLocaleTimeString("pt-BR")}`,
          type: "reminder",
          reminderId: reminder.id,
        });
      }
    }

    return reminders.length;
  } catch (error) {
    console.error("[Notification Service] Error checking upcoming reminders:", error);
  }
}

export async function checkAndNotifyUnmetGoals() {
  try {
    const dbInstance = await db.getDb();
    if (!dbInstance) return;

    // Buscar vendedores que não atingiram a meta do dia
    const sellers = await db.getSellers();

    for (const seller of sellers) {
      const today = new Date();
      const metrics = await db.getDailyMetrics(seller.id, today);

      if (metrics && !metrics.goalMet && (metrics.completedReminders ?? 0) < (seller.dailyGoal ?? 10)) {
        const completed = metrics.completedReminders ?? 0;
        const goal = seller.dailyGoal ?? 10;
        
        // Notificar admin
        await notifyOwner({
          title: `⚠️ Meta não cumprida: ${seller.name}`,
          content: `${seller.name} completou ${completed}/${goal} lembretes hoje.`,
        });

        // Notificar vendedor
        await db.createNotification({
          userId: seller.userId,
          title: "Meta diária não cumprida",
          message: `Você completou ${completed}/${goal} lembretes. Faltam ${goal - completed}.`,
          type: "alert",
        });
      }
    }
  } catch (error) {
    console.error("[Notification Service] Error checking unmet goals:", error);
  }
}

export async function scheduleNotificationJobs() {
  // Executar a cada 5 minutos
  setInterval(() => {
    checkAndNotifyUpcomingReminders();
  }, 5 * 60 * 1000);

  // Executar a cada hora para verificar metas
  setInterval(() => {
    checkAndNotifyUnmetGoals();
  }, 60 * 60 * 1000);
}
