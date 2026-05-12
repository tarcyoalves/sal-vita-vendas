import { useEffect, useRef } from "react";
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

const PERF_STORAGE_KEY = 'sv_perf_alerted_v1';
const getPerfFired = (): Set<string> => {
  try { return new Set<string>(JSON.parse(sessionStorage.getItem(PERF_STORAGE_KEY) || '[]')); } catch { return new Set(); }
};
const markPerfFired = (key: string) => {
  try { const s = getPerfFired(); s.add(key); sessionStorage.setItem(PERF_STORAGE_KEY, JSON.stringify([...s])); } catch {}
};

const STORAGE_KEY = 'sv_notified_v3';
const getFired = (): Set<string> => {
  try { return new Set<string>(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]')); } catch { return new Set(); }
};
const markFired = (key: string) => {
  try { const s = getFired(); s.add(key); sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...s])); } catch {}
};

export function useReminderNotifications(enabled: boolean, userName: string = '', isAdmin: boolean = false) {
  const { data: reminders } = trpc.tasks.reminders.useQuery(undefined, {
    enabled,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  // Only fetch performance metrics for non-admin users (attendants)
  const { data: perf } = trpc.tasks.myPerformance.useQuery(undefined, {
    enabled: enabled && !isAdmin,
    refetchInterval: 10 * 60_000, // refresh every 10 min
    refetchIntervalInBackground: false,
  });

  const perfAlertedRef = useRef(false);

  // Fire behavioral alerts once per session when performance metrics load
  useEffect(() => {
    if (!perf || isAdmin || perfAlertedRef.current) return;
    perfAlertedRef.current = true;

    const today = new Date().toDateString();
    const fired = getPerfFired();

    const alerts: Array<{ key: string; msg: string; urgency: 'warning' | 'error' }> = [];

    if (perf.burstDetected) {
      alerts.push({
        key: `burst-${today}`,
        msg: `⚠️ ATENÇÃO: ${perf.burstMax} contatos registrados em menos de 10 minutos. Isso pode ser interpretado como simulação de atividade pelo sistema.`,
        urgency: 'error',
      });
    }
    if (perf.recentlyDisabledCount > 0) {
      alerts.push({
        key: `disabled-${today}`,
        msg: `🚫 Você desativou ${perf.recentlyDisabledCount} lembrete(s) nas últimas 24h. Lembretes desativados manualmente são monitorados pelo gestor.`,
        urgency: 'warning',
      });
    }
    if (perf.reschedNoContact > 2) {
      alerts.push({
        key: `resched-${today}`,
        msg: `🔄 ${perf.reschedNoContact} tarefas foram reagendadas recentemente sem contato registrado. Atualize as anotações ao contatar clientes.`,
        urgency: 'warning',
      });
    }
    if (perf.neverUpdated > 5) {
      alerts.push({
        key: `never-${today}`,
        msg: `📋 ${perf.neverUpdated} clientes nunca foram atualizados desde a importação. O gestor identifica tarefas nunca editadas como inativas.`,
        urgency: 'warning',
      });
    }
    if (perf.ghostClients > 10) {
      alerts.push({
        key: `ghost-${today}`,
        msg: `👻 ${perf.ghostClients} clientes sem contato há 30+ dias (risco de churn). Priorize entrar em contato com eles.`,
        urgency: 'warning',
      });
    }
    if (perf.overdue > 5) {
      alerts.push({
        key: `overdue-perf-${today}`,
        msg: `⏰ Você tem ${perf.overdue} lembretes vencidos. Atendentes com muitos vencidos aparecem em destaque no relatório do gestor.`,
        urgency: 'warning',
      });
    }

    for (const alert of alerts) {
      if (fired.has(alert.key)) continue;
      markPerfFired(alert.key);
      setTimeout(() => {
        if (alert.urgency === 'error') {
          toast.error(alert.msg, { duration: 15000 });
          playBeep();
        } else {
          toast.warning(alert.msg, { duration: 12000 });
        }
      }, 3000 + alerts.indexOf(alert) * 4000); // stagger alerts
    }
  }, [perf, isAdmin]);

  useEffect(() => {
    if (!enabled) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (!reminders || !enabled) return;
    // Admin only gets alerts for tasks assigned to themselves
    const alertable = isAdmin
      ? (reminders as any[]).filter(r => r.assignedTo === userName)
      : reminders as any[];

    const check = () => {
      try {
        const now = new Date();
        const today = now.toDateString();
        const fired = getFired();

        alertable.forEach((r) => {
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

    // Motivational + productivity push tip every 30 min
    const motivationId = setInterval(() => {
      try {
        if (!alertable.length) return;
        const now = new Date();
        const h = now.getHours();
        const pending = alertable.filter(r => r.reminderEnabled !== false);
        const overdue = pending.filter(r => r.reminderDate && new Date(r.reminderDate) < now);
        const upcoming = pending.filter(r => r.reminderDate && new Date(r.reminderDate) >= now);
        const todayUpcoming = upcoming.filter(r => {
          const d = new Date(r.reminderDate);
          return d.toDateString() === now.toDateString();
        });

        // Priority: overdue alert first
        if (overdue.length > 0) {
          const msg = `🚨 ${overdue.length} lembrete${overdue.length > 1 ? 's' : ''} em atraso! Contate seus clientes agora.`;
          toast.warning(msg, { duration: 10000 });
          if ("Notification" in window && Notification.permission === 'granted') {
            try { new Notification('⚠️ Sal Vita — Atenção', { body: msg, icon: '/favicon.ico' }); } catch (_) {}
          }
          return;
        }

        // Time-based tips
        const tips = [
          ...(h >= 8 && h < 10   ? [`☀️ Bom dia! Você tem ${todayUpcoming.length} lembretes hoje. Comece pelos mais urgentes!`] : []),
          ...(h >= 12 && h < 13  ? [`🍽️ Hora do almoço chegando! Você ainda tem ${todayUpcoming.length} lembretes para hoje.`] : []),
          ...(h >= 14 && h < 15  ? [`💪 Tarde produtiva! ${upcoming.length} lembretes agendados — mantenha o ritmo.`] : []),
          ...(h >= 17 && h < 18  ? [`🏁 Última hora! Finalize os ${todayUpcoming.length} lembretes de hoje antes de encerrar.`] : []),
          `💡 Você tem ${upcoming.length} lembretes agendados. Contato regular fideliza o cliente!`,
          `📞 ${pending.length} clientes ativos no seu portfólio. Qual vai contatar agora?`,
          `🏆 Atendentes que reagendam no prazo vendem mais. Seus lembretes estão em dia?`,
          `⏰ ${todayUpcoming.length} lembretes restantes hoje. Foco nos mais próximos!`,
          `📈 Consistência é o segredo das metas. Clientes bem atendidos compram mais.`,
        ];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        toast.info(tip, { duration: 7000 });
        if ("Notification" in window && Notification.permission === 'granted') {
          try { new Notification('💡 Sal Vita', { body: tip, icon: '/favicon.ico' }); } catch (_) {}
        }
      } catch (_) {}
    }, 30 * 60 * 1000);

    return () => { clearInterval(id); clearInterval(motivationId); };
  }, [reminders, enabled, userName, isAdmin]);
}
