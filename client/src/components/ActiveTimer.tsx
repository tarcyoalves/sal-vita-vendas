import { useState, useEffect, useCallback } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { toast } from 'sonner';
import { Play, Pause, Square, Clock } from 'lucide-react';

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function elapsedMs(session: any): number {
  if (!session) return 0;
  const now = Date.now();
  const start = new Date(session.startedAt).getTime();
  const paused = session.totalPausedMs ?? 0;
  const currentPause = session.status === 'paused' && session.pausedAt
    ? now - new Date(session.pausedAt).getTime()
    : 0;
  return now - start - paused - currentPause;
}

export default function ActiveTimer() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const [showStart, setShowStart] = useState(false);
  const [goalHours, setGoalHours] = useState(8);

  const { data: session, refetch } = trpc.workSessions.current.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const startMut  = trpc.workSessions.start.useMutation();
  const pauseMut  = trpc.workSessions.pause.useMutation();
  const resumeMut = trpc.workSessions.resume.useMutation();
  const endMut    = trpc.workSessions.end.useMutation();

  // Tick every second when active
  useEffect(() => {
    if (!session || session.status === 'ended') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [session?.status]);

  // Notify when goal reached
  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const elapsed = elapsedMs(session);
    const goal = (session.dailyGoalHours ?? 8) * 3600 * 1000;
    if (elapsed >= goal && elapsed < goal + 2000) {
      toast.success(`🏁 Meta de ${session.dailyGoalHours}h atingida! Excelente trabalho!`, { duration: 10000 });
    }
    // Warn 30 min before end
    if (elapsed >= goal - 30 * 60 * 1000 && elapsed < goal - 29 * 60 * 1000) {
      toast.info(`⏰ Faltam 30 minutos para atingir sua meta de ${session.dailyGoalHours}h.`, { duration: 8000 });
    }
  }, [tick]);

  const handle = useCallback(async (action: 'start' | 'pause' | 'resume' | 'end') => {
    try {
      if (action === 'start') {
        await startMut.mutateAsync({ dailyGoalHours: goalHours });
        setShowStart(false);
        toast.success('▶ Ponto iniciado!');
      } else if (action === 'pause') {
        await pauseMut.mutateAsync();
        toast.info('⏸ Ponto pausado.');
      } else if (action === 'resume') {
        await resumeMut.mutateAsync();
        toast.success('▶ Ponto retomado!');
      } else if (action === 'end') {
        if (!confirm('Finalizar o ponto agora?')) return;
        await endMut.mutateAsync();
        toast.success('⏹ Ponto finalizado!');
      }
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro no ponto');
    }
  }, [goalHours]);

  if (!user) return null;

  // No session or ended — show "Iniciar" button only
  if (!session || session.status === 'ended') {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        {showStart ? (
          <div className="bg-white rounded-2xl shadow-xl border p-4 w-56">
            <p className="text-sm font-semibold text-gray-700 mb-2">Iniciar Ponto</p>
            <label className="text-xs text-gray-500">Meta de horas</label>
            <select
              value={goalHours}
              onChange={e => setGoalHours(Number(e.target.value))}
              className="w-full mt-1 mb-3 px-2 py-1.5 border rounded-lg text-sm"
            >
              <option value={4}>4h — Meio período</option>
              <option value={6}>6h — Período parcial</option>
              <option value={8}>8h — Período integral</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => handle('start')}
                className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg"
              >
                ▶ Iniciar
              </button>
              <button
                onClick={() => setShowStart(false)}
                className="px-3 py-1.5 border rounded-lg text-sm text-gray-500 hover:bg-gray-50"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowStart(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-full shadow-lg text-sm font-medium transition-all"
          >
            <Clock size={15} />
            Iniciar Ponto
          </button>
        )}
      </div>
    );
  }

  const elapsed = elapsedMs(session);
  const goalMs = (session.dailyGoalHours ?? 8) * 3600 * 1000;
  const pct = Math.min(100, Math.round((elapsed / goalMs) * 100));
  const isActive = session.status === 'active';
  const isPaused = session.status === 'paused';

  const barColor = pct >= 100 ? 'bg-green-500' : pct >= 75 ? 'bg-blue-500' : pct >= 50 ? 'bg-blue-400' : 'bg-slate-400';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border ${isActive ? 'border-green-200' : 'border-yellow-200'} p-4 w-52`}>

        {/* Status dot + label */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-400'}`} />
          <span className="text-xs font-medium text-gray-500">
            {isActive ? 'Trabalhando' : 'Pausado'}
          </span>
          <span className="ml-auto text-xs text-gray-400">{pct}%</span>
        </div>

        {/* Timer */}
        <p className="text-2xl font-mono font-bold text-slate-800 text-center tracking-wider mb-2">
          {fmt(elapsed)}
        </p>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>

        <p className="text-xs text-center text-gray-400 mb-3">
          Meta: {session.dailyGoalHours}h · Restam {fmt(Math.max(0, goalMs - elapsed))}
        </p>

        {/* Controls */}
        <div className="flex gap-2 justify-center">
          {isActive && (
            <button
              onClick={() => handle('pause')}
              title="Pausar"
              className="p-2 rounded-lg bg-yellow-50 hover:bg-yellow-100 text-yellow-600 border border-yellow-200 transition"
            >
              <Pause size={15} />
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => handle('resume')}
              title="Retomar"
              className="p-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 transition"
            >
              <Play size={15} />
            </button>
          )}
          <button
            onClick={() => handle('end')}
            title="Finalizar ponto"
            className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition"
          >
            <Square size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
