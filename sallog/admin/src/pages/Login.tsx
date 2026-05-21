import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Props = { onLogin: () => void; onRegister: () => void };

export default function Login({ onRegister }: Props) {
  const [mode, setMode] = useState<'admin' | 'driver'>('driver');
  const [email, setEmail]       = useState('');
  const [cpf, setCpf]           = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const utils = trpc.useUtils();

  const loginAdmin = trpc.auth.loginAdmin.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
    onError: (e) => setError(e.message),
  });
  const loginDriver = trpc.auth.loginDriver.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
    onError: (e) => setError(e.message),
  });

  const isPending = loginAdmin.isPending || loginDriver.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'admin') {
      loginAdmin.mutate({ email, password });
    } else {
      loginDriver.mutate({ cpf: cpf.replace(/\D/g, ''), password });
    }
  }

  const formatCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
            .replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
            .replace(/(\d{3})(\d{1,3})/, '$1.$2');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(150deg, #0C3680 0%, #1a4fa0 50%, #0e3d8a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="http://salvitarn.com.br/wp-content/uploads/2026/05/freteprime.png"
            alt="FRETEPRIME"
            style={{ height: 48, objectFit: 'contain', marginBottom: 10, filter: 'brightness(0) invert(1)' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px' }}>FRETEPRIME</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>Gestão Logística Inteligente</div>
        </div>

        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '32px 28px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>

          {/* Mode toggle */}
          <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 10, padding: 3, marginBottom: 24 }}>
            {(['driver', 'admin'] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? '#0C3680' : '#6B7280',
                  fontWeight: mode === m ? 700 : 500,
                  fontSize: 13, cursor: 'pointer',
                  boxShadow: mode === m ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {m === 'driver' ? '🚛 Motorista' : '🔑 Admin'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit}>
            {mode === 'admin' ? (
              <>
                <label style={lbl}>Email</label>
                <input
                  style={inp} type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@empresa.com.br"
                />
              </>
            ) : (
              <>
                <label style={lbl}>CPF</label>
                <input
                  style={inp} type="text" required inputMode="numeric" autoComplete="username"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </>
            )}

            <label style={lbl}>Senha</label>
            <input
              style={inp} type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.form as HTMLFormElement)?.requestSubmit()}
            />

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" disabled={isPending} style={{ ...btn, opacity: isPending ? 0.7 : 1 }}>
              {isPending ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          {mode === 'driver' && (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <span style={{ color: '#6B7280', fontSize: 13 }}>Novo motorista? </span>
              <button
                onClick={onRegister}
                style={{ background: 'none', border: 'none', color: '#0C3680', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Cadastre-se
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 20 }}>
          FRETEPRIME © 2026 · Powered by Groq AI
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const inp: React.CSSProperties = {
  width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, marginBottom: 16, outline: 'none',
  boxSizing: 'border-box', background: '#F9FAFB', color: '#111827',
  transition: 'border-color 0.15s',
};
const btn: React.CSSProperties = {
  width: '100%', background: '#0C3680', color: '#fff', border: 'none',
  borderRadius: 10, padding: '13px 0', fontSize: 15, fontWeight: 700,
  cursor: 'pointer', letterSpacing: '0.02em',
  boxShadow: '0 4px 16px rgba(12,54,128,0.35)', minHeight: 48,
};
