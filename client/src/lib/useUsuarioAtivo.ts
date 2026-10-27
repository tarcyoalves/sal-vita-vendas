import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usuarioAtivo, QUERIES_REFETCH_AO_REATIVAR } from '../../../shared/usuarioAtivo';
import { trpcPathOf } from './refetchPolicy';

/**
 * Store único (módulo) de atividade do usuário. Eventos só gravam um timestamp (barato); o estado
 * é reavaliado a cada 30 s e na visibilidade da aba. Todos os componentes compartilham o mesmo
 * estado: `refetchInterval: ativo && expediente ? N : false`.
 */
let ultima = Date.now();
let estado = true;
const ouvintes = new Set<() => void>();
let iniciado = false;

const visivel = () => typeof document === 'undefined' || document.visibilityState === 'visible';

function reavaliar() {
  const novo = usuarioAtivo(ultima, Date.now(), visivel());
  if (novo !== estado) {
    estado = novo;
    ouvintes.forEach((f) => f());
  }
}

function marcar() {
  ultima = Date.now();
  if (!estado) reavaliar();
}

function iniciar() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  const opts = { passive: true, capture: true } as const;
  for (const ev of ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel', 'pointerdown']) {
    window.addEventListener(ev, marcar, opts);
  }
  window.addEventListener('focus', marcar);
  document.addEventListener('visibilitychange', () => {
    if (visivel()) ultima = Date.now(); // voltar à aba conta como atividade
    reavaliar();
  });
  setInterval(reavaliar, 30_000);
  reavaliar();
}

function assinar(f: () => void) {
  iniciar();
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** true enquanto o usuário está ativo (ver `usuarioAtivo` em shared/usuarioAtivo.ts). */
export function useUsuarioAtivo(): boolean {
  return useSyncExternalStore(assinar, () => estado, () => true);
}

/**
 * Montar UMA vez (AppShell): ao voltar de inativo para ativo, um refetch imediato (invalidate) das
 * queries principais já montadas; os intervalos retomam sozinhos.
 */
export function useRefetchAoReativar(): void {
  const ativo = useUsuarioAtivo();
  const qc = useQueryClient();
  const ficouInativo = useRef(false);
  useEffect(() => {
    if (!ativo) { ficouInativo.current = true; return; }
    if (!ficouInativo.current) return; // primeira montagem: a carga normal já cuida
    ficouInativo.current = false;
    qc.invalidateQueries({
      predicate: (q) => QUERIES_REFETCH_AO_REATIVAR.includes(trpcPathOf(q.queryKey)),
    });
  }, [ativo, qc]);
}
