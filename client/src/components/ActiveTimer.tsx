import { useState, useEffect, useCallback, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { toast } from 'sonner';
import { Pause, Play, Square, Clock } from 'lucide-react';

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
  const currentPause =
    session.status === 'paused' && session.pausedAt
      ? now - new Date(session.pausedAt).getTime()
      : 0;
  return now - start - paused - currentPause;
}

export default function ActiveTimer() {
  const { user } = useAuth();
  const [, setTick] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: session, refetch } = trpc.workSessions.current.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const pauseMut  = trpc.workSessions.pause.useMutation();
  const resumeMut = trpc.workSessions.resume.useMutation();
  const endMut    = trpc.workSessions.end.useMutation();

  useEffect(() => {
    if (!session || session.status === 'ended') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [session?.status]);

  // Close expanded card when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handle = useCallback(async (action: 'pause' | 'resume' | 'end') => {
    try {
      if (action === 'pause') {
        await pauseMut.mutateAsync();
        toast.info('⏸ Pausado.');
      } else if (action === 'resume') {
        await resumeMut.mutateAsync();
        toast.success('▶ Retomado!');
      } else if (action === 'end') {
        if (!confirm('Finalizar o trabalho agora?')) return;
        await endMut.mutateAsync();
        toast.success('⏹ Trabalho finalizado!');
        setExpanded(false);
      }
      refetch();
    } catch (e: any) {
      toast.error(e?.message ?? 'Erro no registro');
    }
  }, []);

  if (!user || !session || session.status === 'ended') return null;

  const elapsed  = elapsedMs(session);
  const isActive = session.status === 'active';
  const isPaused = session.status === 'paused';

  return (
    <div ref={ref} className="fixed bottom-[88px] left-4 md:bottom-4 z-40">

      {/* Expanded detail card — floats above the pill */}
      {expanded && (
        <div className={`absolute bottom-12 left-0 mb-1 bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl border
          ${isActive ? 'border-green-200' : 'border-yellow-200'} p-4 w-44`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-yellow-400'}`} />
            <span className="text-xs font-medium text-gray-500">{isActive ? 'Trabalhando' : 'Pausado'}</span>
          </div>

          <p className="text-2xl font-mono font-bold text-slate-800 text-center tracking-wider mb-4">
            {fmt(elapsed)}
          </p>

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
              title="Finalizar trabalho"
              className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition"
            >
              <Square size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Compact pill */}
      <button
        onClick={() => setExpanded(v => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-mono font-medium transition-all active:scale-95
          ${isActive ? 'bg-slate-800 hover:bg-slate-700 text-white' : 'bg-yellow-500 hover:bg-yellow-400 text-white'}`}
        title={isActive ? 'Trabalhando — clique para controles' : 'Pausado — clique para controles'}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400 animate-pulse' : 'bg-white/80'}`} />
        <Clock size={13} className="flex-shrink-0" />
        <span className="tracking-widest">{fmt(elapsed)}</span>
      </button>
    </div>
  );
}
