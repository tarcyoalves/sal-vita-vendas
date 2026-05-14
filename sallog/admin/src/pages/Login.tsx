import { useState } from 'react';
import { trpc } from '../lib/trpc';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const utils = trpc.useUtils();
  const login = trpc.auth.loginAdmin.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); onLogin(); },
    onError: (e) => setError(e.message),
  });

  const submit = () => { setError(''); login.mutate({ email, password }); };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F4F6F9',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 54, height: 54,
            background: '#0C3680',
            borderRadius: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
            margin: '0 auto 14px',
            boxShadow: '0 4px 16px rgba(12,54,128,0.22)',
          }}>🚛</div>
          <div style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: '#0C3680', letterSpacing: '-0.5px' }}>FRETEPRIME</div>
          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 3 }}>Painel Administrativo</div>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff',
          border: '1px solid #E5E7EB',
          borderRadius: 14,
          padding: 28,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <div style={{ marginBottom: 18 }}>
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@freteprime.com.br"
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: error ? 12 : 20 }}>
            <label className="form-label">Senha</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              <span>⚠</span> {error}
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            onClick={submit}
            disabled={login.isPending || !email || !password}
          >
            {login.isPending ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#D1D5DB', marginTop: 20 }}>
          FretePrime © 2026
        </p>
      </div>
    </div>
  );
}
