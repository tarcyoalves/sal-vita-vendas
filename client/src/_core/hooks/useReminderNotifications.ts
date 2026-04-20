import { useEffect } from "react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1);
  } catch (_) {}
}

const STORAGE_KEY = 'sv_notified_v3';
const getFired = (): Set<string> => {
  try { return new Set<string>(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')); } catch { return new Set(); }
};
const markFired = (key: string) => {
  try { const s = getFired(); s.add(key); sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...s])); } catch {}
};

export function useReminderNotifications(enabled: boolean) {
  const { data: reminders } = trpc.tasks.reminders.useQuery(undefined, {
    enabled,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!enabled) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (!reminders || !enabled) return;

    const check = () => {
      try {
        const now = new Date();
        const today = now.toDateString();
        const fired = getFired();

        (reminders as any[]).forEach((r) => {
          try {
            if (!r.reminderDate || r.reminderEnabled === false || r.status !== "pending") return;
            const rd = new Date(r.reminderDate);
            if (isNaN(rd.getTime())) return;
            const diff = rd.getTime() - now.getTime();

            const overdueKey = `${r.id}-overdue-${today}`;
            const warnKey    = `${r.id}-warn-${rd.getTime()}`;
            const fireKey    = `${r.id}-fire-${rd.getTime()}`;

            // Atrasada: dispara uma vez por dia
            if (diff < -60000 && !fired.has(overdueKey)) {
              markFired(overdueKey);
              toast.warning(`🚨 Atrasada: ${r.title}`, { duration: 10000 });
              playBeep();
              if ("Notification" in window && Notification.permission === 'granted') {
                try { new Notification(`🚨 Atrasada: ${r.title}`, { body: 'Prazo ultrapassado!', icon: '/favicon.ico' }); } catch (_) {}
              }
              return;
            }

            // Aviso 5 min antes
            if (diff > 60000 && diff <= 300000 && !fired.has(warnKey)) {
              markFired(warnKey);
              const mins = Math.round(diff / 60000);
              toast.info(`⏰ Lembrete em ${mins} min: ${r.title}`, { duration: 6000 });
              return;
            }

            // No horário: janela de ±2 minutos para não perder
            if (diff >= -120000 && diff <= 60000 && !fired.has(fireKey)) {
              markFired(fireKey);
              const p = (n: number) => String(n).padStart(2, '0');
              const time = `${p(rd.getHours())}:${p(rd.getMinutes())}`;
              toast.warning(`🔔 Lembrete: ${r.title}`, { description: `Agendado para ${time}`, duration: 15000 });
              playBeep();
              if ("Notification" in window && Notification.permission === 'granted') {
                try { new Notification(`🔔 Lembrete: ${r.title}`, { body: r.notes?.trim() || `Agendado para ${time}`, icon: '/favicon.ico', tag: `reminder-${r.id}` }); } catch (_) {}
              }
            }
          } catch (_) {}
        });
      } catch (_) {}
    };

    check();
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [reminders, enabled]);
}
