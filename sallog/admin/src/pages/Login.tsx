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
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow orbs */}
      <div style={{
        position: 'absolute', top: '-15%', right: '-10%',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(245,158,11,0.08) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: 450, height: 450,
        background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Subtle grid pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          {!logoError ? (
            <img
              src={logo}
              alt="FRETEPRIME"
              onError={() => setLogoError(true)}
              style={{ height: 52, display: 'block', margin: '0 auto 12px', filter: 'drop-shadow(0 0 20px rgba(245,158,11,0.35))' }}
            />
          ) : (
            <div style={{
              fontFamily: "'Barlow Semi Condensed',sans-serif",
              fontSize: 32, fontWeight: 700,
              color: 'var(--amber)',
              letterSpacing: 2,
              marginBottom: 12,
              textShadow: '0 0 28px rgba(245,158,11,0.45)',
            }}>FRETEPRIME</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-4)', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 500 }}>
            Painel Administrativo
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
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
            style={{ width: '100%', letterSpacing: 1 }}
            onClick={submit}
            disabled={login.isPending || !email || !password}
          >
            {login.isPending ? 'ENTRANDO...' : 'ENTRAR'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-4)', marginTop: 24, letterSpacing: 1 }}>
          FRETEPRIME © 2026 — TODOS OS DIREITOS RESERVADOS
        </p>
      </div>
    </div>
  );
}
