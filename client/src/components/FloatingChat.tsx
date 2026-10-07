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
      className="fixed z-40 right-3 bottom-[calc(68px+env(safe-area-inset-bottom,0px))] md:right-6 md:bottom-4 size-12 rounded-full bg-brand-700 hover:bg-brand-800 text-white shadow-lg flex items-center justify-center transition-colors"
      title="Abrir E-mail Marketing"
      aria-label="E-mail Marketing"
    >
      <Mail size={22} />
    </button>
  );
}