import { useLocation } from 'wouter';
import { useAuth } from '../_core/hooks/useAuth';

export default function FloatingEmailMarketing() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const role = user?.role ?? 'user';

  // Só mostrar para atendentes (role user)
  if (!user || role !== 'user') return null;

  return (
    <button
      onClick={() => setLocation('/admin/email-marketing')}
      className="fixed right-4 md:bottom-4 z-50 w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-2xl flex items-center justify-center text-2xl transition-all active:scale-95"
      style={{ bottom: "calc(88px + env(safe-area-inset-bottom, 0px))" }}
      title="Abrir E-mail Marketing"
      aria-label="E-mail Marketing"
    >
      📧
    </button>
  );
}