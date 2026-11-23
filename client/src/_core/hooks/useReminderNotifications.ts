import { useEffect, useRef } from "react";
import { navigate } from "wouter/use-browser-location";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";
import { useExpediente } from "../../lib/useExpediente";
import { useUsuarioAtivo } from "../../lib/useUsuarioAtivo";
import { armazenamentoLocal } from "../../lib/tasks/rascunho";
import {
  atrasadasParaAvisar, chaveAtrasada, chaveAviso, chaveAvisados, chaveDia, chaveNaHora, gravarAvisados,
  lerAvisados, limparDiasAntigos, textoAvisoAtraso,
} from "../../lib/tasks/alertasAtraso";

/** Evento que a tela de tarefas escuta para abrir a aba "Atrasadas" quando já está aberta. */
export const EVENTO_VER_ATRASADAS = "sv:ver-atrasadas";

function playBeep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 1);
  } catch (_) {}
}

// Android/PWA só mostra notificação pelo service worker; `new Notification` lança lá.
function notificar(titulo: string, opts: NotificationOptions) {
  if (!("Notification" in window) || Notification.permission !== 'granted') return;
  const nativa = () => { try { new Notification(titulo, opts); } catch { /* sem suporte */ } };
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.ready.then((r) => r.showNotification(titulo, opts)).catch(nativa);
  } else {
    nativa();
  }
}

function irParaAtrasadas() {
  navigate('/tasks?aba=atrasadas');
  window.dispatchEvent(new Event(EVENTO_VER_ATRASADAS));
}

const QUATRO_HORAS = 4 * 3600_000;

/**
 * Todos os alertas de lembrete moram aqui (a tela de tarefas não agenda mais os seus):
 * - "na hora": timer exato para os lembretes das próximas 4 h (toast + bip + notificação);
 * - 5 minutos antes;
 * - atrasadas: UM aviso agrupado ("12 tarefas atrasadas") com botão que abre a aba Atrasadas.
 * O "já avisado" fica em localStorage por usuário e por dia (São Paulo): reabrir o app não repete o aviso.
 */
export function useReminderNotifications(enabled: boolean, userName: string = '', isAdmin: boolean = false, userId?: number | string | null) {
  // Polling só no expediente E com usuário ativo (10 min). Fora disso não há consulta: os
  // lembretes já carregados continuam disparando pelo relógio local (checkRef) e, ao voltar a
  // ficar ativo, useRefetchAoReativar (AppShell) recarrega. Assim o Neon dorme à noite.
  const expediente = useExpediente();
  const ativo = useUsuarioAtivo();
  const { data: reminders } = trpc.tasks.reminders.useQuery(undefined, {
    enabled,
    refetchInterval: ativo && expediente ? 600_000 : false,
    staleTime: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  // A permissão de notificação NÃO é pedida aqui: sem gesto do usuário o iOS ignora o
  // pedido. O botão "Ativar" (banner em Tasks.tsx) chama Notification.requestPermission().

  // Dados em refs: os intervalos vivem enquanto `enabled` e leem sempre o valor mais novo.
  // Antes o effect dependia de `reminders`, então cada refetch recriava os intervalos e a
  // dica de 1h nunca chegava a disparar.
  const remindersRef = useRef<any[]>([]);
  const userNameRef = useRef(userName);
  const isAdminRef = useRef(isAdmin);
  const usuarioRef = useRef<number | string>(userId ?? userName);
  userNameRef.current = userName;
  isAdminRef.current = isAdmin;
  usuarioRef.current = userId ?? userName;
  remindersRef.current = (reminders as any[] | undefined) ?? [];

  // Admin só recebe alertas das tarefas atribuídas a ele mesmo.
  const getAlertable = (): any[] =>
    isAdminRef.current
      ? remindersRef.current.filter((r) => r.assignedTo === userNameRef.current)
      : remindersRef.current;

  // "Já avisado hoje": lê e grava no localStorage (por usuário e por dia, fuso de São Paulo).
  const avisadosHoje = (now: Date) => {
    const arm = armazenamentoLocal();
    const dia = chaveDia(now);
    const chave = chaveAvisados(usuarioRef.current, dia);
    return {
      set: lerAvisados(arm, chave),
      gravar: (s: Set<string>) => { gravarAvisados(arm, chave, s); limparDiasAntigos(arm, usuarioRef.current, dia); },
    };
  };

  // `compartilhado`: o check() já tem o conjunto de avisados em mãos e grava uma vez no fim; sem ele (timer exato),
  // lê e grava sozinho. Devolve false se este lembrete já foi avisado hoje.
  const dispararNaHora = (r: any, compartilhado?: Set<string>): boolean => {
    const rd = new Date(r.reminderDate);
    const proprio = compartilhado ? null : avisadosHoje(new Date());
    const set = compartilhado ?? proprio!.set;
    const key = chaveNaHora(r.id, rd.getTime());
    if (set.has(key)) return false;
    set.add(key);
    proprio?.gravar(set);
    const p = (n: number) => String(n).padStart(2, '0');
    const time = `${p(rd.getHours())}:${p(rd.getMinutes())}`;
    toast.warning(`Lembrete: ${r.title}`, { description: `Agendado para ${time}`, duration: 15000 });
    playBeep();
    notificar(`Lembrete: ${r.title}`, { body: r.notes?.trim() || `Agendado para ${time}`, icon: '/favicon.ico', tag: `reminder-${r.id}` });
    return true;
  };

  const checkRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      try {
        const alertable = getAlertable();
        const now = new Date();
        const { set, gravar } = avisadosHoje(now);
        let mudou = false;

        // Atrasadas: UM aviso para todas as que ainda não foram avisadas hoje.
        const atrasadas = atrasadasParaAvisar(alertable, now, set);
        if (atrasadas.length > 0) {
          const jaAvisou = [...set].some((k) => k.startsWith('o:'));
          atrasadas.forEach((r) => set.add(chaveAtrasada(r.id)));
          mudou = true;
          const texto = textoAvisoAtraso(atrasadas, jaAvisou);
          toast.warning(texto, { id: 'lembretes-atrasados', duration: 15000, action: { label: 'Ver atrasadas', onClick: irParaAtrasadas } });
          playBeep();
          notificar(texto, { body: 'Abra o Sal Vita para ver quais são.', icon: '/favicon.ico', tag: 'lembretes-atrasados' });
        }

        const atrasadasAgora = new Set(atrasadas.map((r) => r.id));
        alertable.forEach((r) => {
          try {
            if (!r.reminderDate || r.reminderEnabled === false || r.status !== "pending") return;
            if (atrasadasAgora.has(r.id)) return;
            const rd = new Date(r.reminderDate);
            if (isNaN(rd.getTime())) return;
            const diff = rd.getTime() - now.getTime();

            // Aviso 5 min antes
            const warnKey = chaveAviso(r.id, rd.getTime());
            if (diff > 60000 && diff <= 300000 && !set.has(warnKey)) {
              set.add(warnKey); mudou = true;
              const mins = Math.round(diff / 60000);
              toast.info(`Lembrete em ${mins} min: ${r.title}`, { duration: 6000 });
              return;
            }

            // No horário: janela de ±2 minutos para o caso de o timer exato não ter disparado (aparelho dormindo).
            if (diff >= -120000 && diff <= 60000 && dispararNaHora(r, set)) mudou = true;
          } catch (_) {}
        });
        if (mudou) gravar(set);
      } catch (_) {}
    };

    checkRef.current = check;
    check();
    const id = setInterval(check, 120000);

    // Motivational + productivity push tip every 1h
    const motivationId = setInterval(() => {
      try {
        const alertable = getAlertable();
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
          const msg = `${overdue.length} lembrete${overdue.length > 1 ? 's' : ''} em atraso! Contate seus clientes agora.`;
          toast.warning(msg, { id: 'lembretes-atrasados', duration: 10000, action: { label: 'Ver atrasadas', onClick: irParaAtrasadas } });
          notificar('Sal Vita — Atenção', { body: msg, icon: '/favicon.ico' });
          return;
        }

        // Time-based tips
        const tips = [
          ...(h >= 8 && h < 10   ? [`Bom dia! Você tem ${todayUpcoming.length} lembretes hoje. Comece pelos mais urgentes!`] : []),
          ...(h >= 12 && h < 13  ? [`Hora do almoço chegando! Você ainda tem ${todayUpcoming.length} lembretes para hoje.`] : []),
          ...(h >= 14 && h < 15  ? [`Tarde produtiva! ${upcoming.length} lembretes agendados — mantenha o ritmo.`] : []),
          ...(h >= 17 && h < 18  ? [`Última hora! Finalize os ${todayUpcoming.length} lembretes de hoje antes de encerrar.`] : []),
          `Você tem ${upcoming.length} lembretes agendados. Contato regular fideliza o cliente!`,
          `${pending.length} clientes ativos no seu portfólio. Qual vai contatar agora?`,
          `Atendentes que reagendam no prazo vendem mais. Seus lembretes estão em dia?`,
          `${todayUpcoming.length} lembretes restantes hoje. Foco nos mais próximos!`,
          `Consistência é o segredo das metas. Clientes bem atendidos compram mais.`,
        ];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        toast.info(tip, { duration: 7000 });
        notificar('Sal Vita', { body: tip, icon: '/favicon.ico' });
      } catch (_) {}
    }, 60 * 60 * 1000);

    return () => { clearInterval(id); clearInterval(motivationId); };
  }, [enabled]);

  // Chegou lista nova de lembretes: confere já (sem recriar os intervalos) e reagenda os timers exatos
  // ("na hora") dos lembretes das próximas 4 h.
  useEffect(() => {
    if (!enabled) return;
    if (reminders) checkRef.current();
    const now = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    getAlertable().forEach((r) => {
      if (!r.reminderDate || r.reminderEnabled === false || r.status !== 'pending') return;
      const delay = new Date(r.reminderDate).getTime() - now;
      if (!(delay > 0 && delay <= QUATRO_HORAS)) return;
      timers.push(setTimeout(() => { try { dispararNaHora(r); } catch (_) {} }, delay));
    });
    return () => timers.forEach(clearTimeout);
  }, [reminders, enabled, userName, isAdmin]);
}
