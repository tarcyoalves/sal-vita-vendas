import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-700 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/sal_vita_logo_d22b1eb4.webp"
            alt="Sal Vita"
            className="h-20 mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-blue-900">Sistema de Vendas</h1>
          <p className="text-gray-500 text-sm mt-1">Faça login para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg transition disabled:opacity-50"
          >
            {submitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Sal Vita — Sistema de Gestão de Vendas e Lembretes
        </p>
      </div>
    </div>
  );
}
