import { useLocation } from 'wouter';
import { useAuth } from '../_core/hooks/useAuth';
import { Mail } from 'lucide-react';

export default function FloatingEmailMarketing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const role = user?.role ?? 'user';

  // Só mostrar para atendentes (role user)
  if (!user || role !== 'user') return null;

  return (
    <button
      onClick={() => setLocation('/admin/email-marketing')}
      className="fixed right-4 md:bottom-6 z-50 w-13 h-13 rounded-full bg-[#0C3680] hover:bg-[#081F47] text-white shadow-xl border border-white/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95"
      style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}
      title="Abrir E-mail Marketing"
      aria-label="E-mail Marketing"
    >
      <Mail size={22} />
    </button>
  );
}