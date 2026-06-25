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
  const [recoveryMode, setRecoveryMode] = useState<'email' | 'secret'>('email');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySecret, setRecoverySecret] = useState('');
  const [recoveryResult, setRecoveryResult] = useState<{ name: string; generatedPassword: string } | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [recovering, setRecovering] = useState(false);

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();
  const emergencyResetMutation = trpc.auth.emergencyReset.useMutation();
  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation();
  const resetWithTokenMutation = trpc.auth.resetPasswordWithToken.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (token) {
      setResetToken(token);
      window.history.replaceState({}, '', '/');
    }
  }, []);

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
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: "125px", width: "auto" }} className="mx-auto mb-4" aria-label="Sal Vita">
            <defs><clipPath id="oval-login"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="white"/>
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#0C3680" clipPath="url(#oval-login)"/>
            <path d="M 210 240 Q 206 295 204 352" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" clipPath="url(#oval-login)"/>
            <path d="M 336 210 Q 340 270 342 352" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" clipPath="url(#oval-login)"/>
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="#0C3680">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="#0C3680" strokeWidth="15"/>
          </svg>
          <h1 className="text-2xl font-bold text-blue-900">Sistema de Vendas</h1>
          <p className="text-gray-500 text-sm mt-1">Faça login para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
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
              autoComplete="current-password"
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
            onClick={() => { setShowRecovery(true); setRecoveryResult(null); setEmailSent(false); setRecoveryMode('email'); }}
            className="text-xs text-blue-600 hover:underline"
          >
            Esqueci minha senha
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Sal Vita — Sistema de Gestão de Vendas e Lembretes
        </p>
      </div>

      {/* Reset password via token (from email link) */}
      {resetToken && !resetSuccess && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-blue-600" />
                <h2 className="font-semibold text-gray-800">Nova Senha</h2>
              </div>
              <button onClick={() => setResetToken('')} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={async e => {
                e.preventDefault();
                if (newPassword !== confirmPassword) {
                  toast.error('As senhas não coincidem');
                  return;
                }
                setResetting(true);
                try {
                  await resetWithTokenMutation.mutateAsync({ token: resetToken, newPassword });
                  setResetSuccess(true);
                  setResetToken('');
                  toast.success('Senha redefinida com sucesso!');
                } catch (err: any) {
                  toast.error(err?.message ?? 'Erro ao redefinir senha');
                } finally {
                  setResetting(false);
                }
              }}
              className="space-y-3"
            >
              <p className="text-xs text-gray-500">Defina sua nova senha abaixo.</p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nova senha</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Confirmar senha</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Repita a senha" />
              </div>
              <button type="submit" disabled={resetting} className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                {resetting ? 'Salvando...' : 'Salvar nova senha'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Success after reset */}
      {resetSuccess && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center space-y-4">
            <div className="text-4xl">🎉</div>
            <h2 className="font-bold text-lg text-green-700">Senha redefinida!</h2>
            <p className="text-sm text-gray-600">Sua nova senha está pronta. Faça login abaixo.</p>
            <button onClick={() => setResetSuccess(false)} className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
              Fazer login
            </button>
          </div>
        </div>
      )}

      {/* Recovery modal (email + emergency secret) */}
      {showRecovery && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-blue-600" />
                <h2 className="font-semibold text-gray-800">Recuperar Senha</h2>
              </div>
              <button onClick={() => setShowRecovery(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Tab switch */}
            <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
              <button type="button" onClick={() => setRecoveryMode('email')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${recoveryMode === 'email' ? 'bg-white shadow text-blue-700' : 'text-gray-500'}`}>
                Via E-mail
              </button>
              <button type="button" onClick={() => setRecoveryMode('secret')} className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${recoveryMode === 'secret' ? 'bg-white shadow text-orange-700' : 'text-gray-500'}`}>
                Chave Secreta
              </button>
            </div>

            {recoveryMode === 'email' ? (
              emailSent ? (
                <div className="space-y-3 text-center">
                  <div className="text-3xl">📧</div>
                  <p className="text-sm text-green-700 font-medium">E-mail de recuperação enviado!</p>
                  <p className="text-xs text-gray-500">Verifique sua caixa de entrada (e spam) para o link de redefinição. O link expira em 30 minutos.</p>
                  <button onClick={() => { setShowRecovery(false); setEmailSent(false); }} className="w-full py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800">
                    Fechar
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    setRecovering(true);
                    try {
                      await requestResetMutation.mutateAsync({ email: recoveryEmail });
                      setEmailSent(true);
                    } catch (err: any) {
                      toast.error(err?.message ?? 'Erro ao solicitar recuperação');
                    } finally {
                      setRecovering(false);
                    }
                  }}
                  className="space-y-3"
                >
                  <p className="text-xs text-gray-500">Insira seu e-mail cadastrado. Enviaremos um link para redefinir sua senha.</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">E-mail</label>
                    <input type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="seu@email.com" />
                  </div>
                  <button type="submit" disabled={recovering} className="w-full py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                    {recovering ? 'Enviando...' : 'Enviar link de recuperação'}
                  </button>
                </form>
              )
            ) : (
              recoveryResult ? (
                <div className="space-y-3">
                  <p className="text-sm text-green-700 font-medium">Senha redefinida para <strong>{recoveryResult.name}</strong>:</p>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-center">
                    <p className="font-mono text-lg font-bold text-orange-700 tracking-widest">{recoveryResult.generatedPassword}</p>
                  </div>
                  <p className="text-xs text-gray-500">Anote esta senha — ela não será exibida novamente.</p>
                  <button onClick={() => { setShowRecovery(false); setRecoveryResult(null); }} className="w-full py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800">
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
                  <p className="text-xs text-gray-500">Insira seu email e a chave secreta configurada no servidor (ADMIN_RESET_SECRET).</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="admin@empresa.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Chave secreta</label>
                    <input type="password" value={recoverySecret} onChange={e => setRecoverySecret(e.target.value)} required className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="Chave secreta do servidor" />
                  </div>
                  <button type="submit" disabled={recovering} className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50">
                    {recovering ? 'Verificando...' : 'Redefinir Senha'}
                  </button>
                </form>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
