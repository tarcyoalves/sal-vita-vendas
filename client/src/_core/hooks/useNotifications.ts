import { useEffect, useRef } from "react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

export function useNotifications(enabled: boolean) {
  const shownIds = useRef<Set<number>>(new Set());

  const { data: notifications, refetch } = trpc.notifications.list.useQuery(undefined, {
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const markReadMutation = trpc.notifications.markRead.useMutation();

  useEffect(() => {
    if (!enabled) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [enabled]);

  useEffect(() => {
    if (!notifications) return;

    const unread = notifications.filter((n) => !n.isRead && !shownIds.current.has(n.id));

    for (const n of unread) {
      shownIds.current.add(n.id);

      // Toast visível na tela
      toast(n.title, {
        description: n.message ?? undefined,
        duration: 8000,
      });

      // Notificação nativa do browser (funciona em Android; iOS requer PWA instalado)
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(n.title, {
          body: n.message ?? undefined,
          icon: "/favicon.ico",
          tag: `notification-${n.id}`,
        });
      }

      // Marca como lida no banco
      markReadMutation.mutate({ id: n.id });
    }
  }, [notifications]);

  return { notifications, refetch };
}
