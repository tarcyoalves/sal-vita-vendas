import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, X } from 'lucide-react';

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySecret, setRecoverySecret] = useState('');
  const [recoveryResult, setRecoveryResult] = useState<{ name: string; generatedPassword: string } | null>(null);
  const [recovering, setRecovering] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();
  const emergencyResetMutation = trpc.auth.emergencyReset.useMutation();
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
          {/* h-24 original → h-[125px] (+30%) */}
          <img
            src="/sal-vita-logo.svg"
            alt="Sal Vita"
            className="mx-auto mb-4 object-contain"
            style={{ height: '125px' }}
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

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => { setShowRecovery(true); setRecoveryResult(null); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Esqueci minha senha (admin)
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Sal Vita — Sistema de Gestão de Vendas e Lembretes
        </p>
      </div>

      {/* Emergency recovery modal */}
      {showRecovery && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-orange-600" />
                <h2 className="font-semibold text-gray-800">Recuperação de Emergência</h2>
              </div>
              <button onClick={() => setShowRecovery(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {recoveryResult ? (
              <div className="space-y-3">
                <p className="text-sm text-green-700 font-medium">Senha redefinida para <strong>{recoveryResult.name}</strong>:</p>
                <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-center">
                  <p className="font-mono text-lg font-bold text-orange-700 tracking-widest">{recoveryResult.generatedPassword}</p>
                </div>
                <p className="text-xs text-gray-500">Anote esta senha — ela não será exibida novamente.</p>
                <button
                  onClick={() => { setShowRecovery(false); setRecoveryResult(null); }}
                  className="w-full py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800"
                >
                  Fechar e fazer login
                </button>
              </div>
            ) : (
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  setRecovering(true);
                  try {
                    const res = await emergencyResetMutation.mutateAsync({ email: recoveryEmail, secret: recoverySecret });
                    setRecoveryResult(res);
                  } catch (err: any) {
                    toast.error(err?.message ?? 'Erro na recuperação');
                  } finally {
                    setRecovering(false);
                  }
                }}
                className="space-y-3"
              >
                <p className="text-xs text-gray-500">Insira seu email de admin e a chave de recuperação configurada no servidor.</p>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email do admin</label>
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={e => setRecoveryEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="admin@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Chave de recuperação</label>
                  <input
                    type="password"
                    value={recoverySecret}
                    onChange={e => setRecoverySecret(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    placeholder="Chave secreta do servidor"
                  />
                </div>
                <button
                  type="submit"
                  disabled={recovering}
                  className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
                >
                  {recovering ? 'Verificando...' : 'Redefinir Senha'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
