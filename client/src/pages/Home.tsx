import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import SalVitaLogo from '../components/SalVitaLogo';

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      if (user.role === 'admin') {
        setLocation('/admin/dashboard');
      } else {
        setLocation('/tasks');
      }
    }
  }, [loading, isAuthenticated, user, setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await loginMutation.mutateAsync({ email, password });
      await utils.auth.me.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao fazer login');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0C3680 0%, #1a52b0 100%)' }}>
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0C3680 0%, #1a52b0 100%)' }}
    >
      {/* Decorative circles */}
      <div className="absolute top-0 left-0 w-64 h-64 rounded-full opacity-10" style={{ background: '#ffffff', transform: 'translate(-30%, -30%)' }} />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-10" style={{ background: '#ffffff', transform: 'translate(30%, 30%)' }} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #0C3680, #1a6fd4)' }} />

        <div className="p-8 pt-6">
          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <SalVitaLogo className="w-40 h-auto mb-3" variant="light" />
            <p className="text-sm font-medium" style={{ color: '#6b7280' }}>Sistema de Gestão de Vendas</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#374151' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 text-sm bg-gray-50"
                style={{ focusRingColor: '#0C3680' } as any}
                onFocus={e => (e.target.style.borderColor = '#0C3680')}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: '#374151' }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none text-sm bg-gray-50"
                onFocus={e => (e.target.style.borderColor = '#0C3680')}
                onBlur={e => (e.target.style.borderColor = '')}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 text-white font-semibold rounded-xl transition-all text-sm shadow-lg hover:shadow-xl disabled:opacity-60 mt-2"
              style={{ background: 'linear-gradient(90deg, #0C3680, #1a52b0)' }}
            >
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: '#9ca3af' }}>
            © Sal Vita — Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
