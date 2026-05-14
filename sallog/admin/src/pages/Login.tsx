import { useState } from 'react';
import { trpc } from '../lib/trpc';

const LOGO = 'http://salvitarn.com.br/wp-content/uploads/2026/05/freteprime.png';

export default function Login({ onLogin, logo = LOGO }: { onLogin: () => void; logo?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);
  const utils = trpc.useUtils();
  const login = trpc.auth.loginAdmin.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); onLogin(); },
    onError: (e) => setError(e.message),
  });

  const submit = () => { setError(''); login.mutate({ email, password }); };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {!logoError ? (
            <img
              src={logo}
              alt="FRETEPRIME"
              onError={() => setLogoError(true)}
              style={{ height: 52, display: 'block', margin: '0 auto 10px' }}
            />
          ) : (
            <div style={{
              fontFamily: "'Barlow Semi Condensed',sans-serif",
              fontSize: 28, fontWeight: 700,
              color: 'var(--navy)', letterSpacing: 1, marginBottom: 10,
            }}>FRETEPRIME</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-4)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Painel Administrativo
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '28px 28px 24px',
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ marginBottom: 18 }}>
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@freteprime.com.br"
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: error ? 14 : 22 }}>
            <label className="form-label">Senha</label>
            <input
              className="form-input"
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={e => e.key === 'Enter' && submit()}
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

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-4)', marginTop: 20 }}>
          FretePrime © 2026
        </p>
      </div>
    </div>
  );
}
