import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

function Overlay({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[10vh]">
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm max-h-[85dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {onClose && (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
              <X size={16} />
            </Button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "Entrar · Sal Vita CRM";
  }, []);
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
      if (user.role === 'admin' || user.role === 'manager') {
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
      <div className="min-h-dvh flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-500">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-brand-700 mx-auto mb-3" />
          <p className="text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-slate-50 p-4 overflow-y-auto">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp" alt="Sal Vita" style={{ height: "56px", width: "auto" }} className="rounded-lg object-contain" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">Entrar no CRM</h1>
          <p className="mt-1 text-sm text-slate-500">Use o e-mail e a senha da sua conta Sal Vita.</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <form onSubmit={handleLogin} className="space-y-4">
            <Field id="login-email" label="E-mail">
              <Input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
              />
            </Field>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Senha</Label>
                <button
                  type="button"
                  onClick={() => { setShowRecovery(true); setRecoveryResult(null); setEmailSent(false); setRecoveryMode('email'); }}
                  className="text-xs font-medium text-brand-700 hover:underline py-1"
                >
                  Esqueci minha senha
                </button>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {loginMutation.isError && (
              <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {loginMutation.error?.message || 'Não foi possível entrar. Confira o e-mail e a senha.'}
              </p>
            )}

            <Button type="submit" disabled={submitting} size="lg" className="w-full">
              {submitting ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Entrando...
                </>
              ) : 'Entrar'}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">Sal Vita — Lembretes e CRM de vendas</p>
      </div>

      {/* Reset password via token (from email link) */}
      {resetToken && !resetSuccess && (
        <Overlay title="Nova senha" onClose={() => setResetToken('')}>
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
            className="space-y-4"
          >
            <p className="text-sm text-slate-500">Defina sua nova senha abaixo.</p>
            <Field id="reset-new" label="Nova senha">
              <Input id="reset-new" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} placeholder="Mínimo 6 caracteres" />
            </Field>
            <Field id="reset-confirm" label="Confirmar senha">
              <Input id="reset-confirm" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} placeholder="Repita a senha" />
            </Field>
            <Button type="submit" disabled={resetting} className="w-full">
              {resetting ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        </Overlay>
      )}

      {/* Success after reset */}
      {resetSuccess && (
        <Overlay title="Senha redefinida">
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Sua nova senha está pronta. Faça login abaixo.</p>
            <Button onClick={() => setResetSuccess(false)} className="w-full">
              Fazer login
            </Button>
          </div>
        </Overlay>
      )}

      {/* Recovery modal (email + emergency secret) */}
      {showRecovery && (
        <Overlay title="Recuperar senha" onClose={() => setShowRecovery(false)}>
          <div className="mb-4 flex gap-1 rounded-md bg-slate-100 p-1" role="tablist">
            <button type="button" role="tab" aria-selected={recoveryMode === 'email'} onClick={() => setRecoveryMode('email')} className={`flex-1 rounded-sm py-2 text-sm font-medium transition-colors ${recoveryMode === 'email' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              Por e-mail
            </button>
            <button type="button" role="tab" aria-selected={recoveryMode === 'secret'} onClick={() => setRecoveryMode('secret')} className={`flex-1 rounded-sm py-2 text-sm font-medium transition-colors ${recoveryMode === 'secret' ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              Chave secreta
            </button>
          </div>

          {recoveryMode === 'email' ? (
            emailSent ? (
              <div className="space-y-4">
                <p className="text-sm font-medium text-green-700">E-mail de recuperação enviado.</p>
                <p className="text-sm text-slate-500">Verifique sua caixa de entrada (e spam) para o link de redefinição. O link expira em 30 minutos.</p>
                <Button onClick={() => { setShowRecovery(false); setEmailSent(false); }} className="w-full">
                  Fechar
                </Button>
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
                className="space-y-4"
              >
                <p className="text-sm text-slate-500">Insira seu e-mail cadastrado. Enviaremos um link para redefinir sua senha.</p>
                <Field id="rec-email" label="E-mail">
                  <Input id="rec-email" type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required placeholder="seu@email.com" />
                </Field>
                <Button type="submit" disabled={recovering} className="w-full">
                  {recovering ? 'Enviando...' : 'Enviar link de recuperação'}
                </Button>
              </form>
            )
          ) : (
            recoveryResult ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">Senha redefinida para <strong>{recoveryResult.name}</strong>:</p>
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-center">
                  <p className="select-all text-base font-semibold text-amber-800">{recoveryResult.generatedPassword}</p>
                </div>
                <p className="text-sm text-slate-500">Anote esta senha — ela não será exibida novamente.</p>
                <Button onClick={() => { setShowRecovery(false); setRecoveryResult(null); }} className="w-full">
                  Fechar e fazer login
                </Button>
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
                className="space-y-4"
              >
                <p className="text-sm text-slate-500">Insira seu email e a chave secreta configurada no servidor (ADMIN_RESET_SECRET).</p>
                <Field id="sec-email" label="E-mail">
                  <Input id="sec-email" type="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required placeholder="admin@empresa.com" />
                </Field>
                <Field id="sec-key" label="Chave secreta">
                  <Input id="sec-key" type="password" value={recoverySecret} onChange={e => setRecoverySecret(e.target.value)} required placeholder="Chave secreta do servidor" />
                </Field>
                <Button type="submit" disabled={recovering} className="w-full">
                  {recovering ? 'Verificando...' : 'Redefinir senha'}
                </Button>
              </form>
            )
          )}
        </Overlay>
      )}
    </div>
  );
}
