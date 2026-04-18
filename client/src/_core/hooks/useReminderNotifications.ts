import { useEffect, useRef } from "react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

export function useReminderNotifications(enabled: boolean) {
  const firedIds = useRef<Set<number>>(new Set());

  const { data: reminders } = trpc.tasks.reminders.useQuery(undefined, {
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!enabled) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (!reminders) return;

    const now = new Date();
    const in15 = new Date(now.getTime() + 15 * 60 * 1000);

    const due = (reminders as any[]).filter((r) => {
      if (!r.reminderDate || r.status !== "pending") return false;
      if (firedIds.current.has(r.id)) return false;
      const d = new Date(r.reminderDate);
      return d >= now && d <= in15;
    });

    for (const r of due) {
      firedIds.current.add(r.id);
      const time = new Date(r.reminderDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const title = `⏰ Lembrete: ${r.title}`;
      const body = `Agendado para ${time}`;

      toast(title, { description: body, duration: 10000 });

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico", tag: `reminder-${r.id}` });
      }
    }
  }, [reminders]);
}
