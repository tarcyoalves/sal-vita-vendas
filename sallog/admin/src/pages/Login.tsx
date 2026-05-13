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
      background: 'linear-gradient(150deg, #061d55 0%, #0C3680 55%, #1a3a8f 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Lexend', sans-serif",
    }}>
      {/* Decorative circles */}
      {[
        { size: 340, top: -100, right: -80, opacity: 0.06 },
        { size: 200, bottom: -60, left: -60, opacity: 0.05 },
        { size: 120, top: '35%', left: '8%', opacity: 0.04 },
      ].map((c, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: c.size, height: c.size,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.15)',
          background: `rgba(255,255,255,${c.opacity})`,
          top: c.top as any, bottom: c.bottom as any, left: c.left as any, right: c.right as any,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Decorative truck */}
      <div style={{
        position: 'absolute', bottom: 40, right: 40,
        opacity: 0.04, fontSize: 120, pointerEvents: 'none',
        fontFamily: 'system-ui',
      }}>🚛</div>

      {/* Card */}
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 60,
            height: 60,
            background: 'linear-gradient(135deg, #0C3680, #1a4a9e)',
            borderRadius: 14,
            fontSize: 26,
            marginBottom: 14,
            boxShadow: '0 6px 20px rgba(12,54,128,0.3)',
          }}>🚛</div>
          <div style={{
            fontFamily: "'Barlow Semi Condensed', sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: '#0F172A',
            letterSpacing: '-0.3px',
          }}>SalLog</div>
          <div style={{ fontSize: 13, color: '#94A3B8', marginTop: 3, fontWeight: 300 }}>
            Painel Administrativo
          </div>
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@empresa.com.br"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="form-label">Senha</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          </div>

          {error && (
            <div className="alert-error"><span>⚠</span>{error}</div>
          )}

          <button
            className="btn btn-primary btn-lg"
            style={{ width: '100%', borderRadius: 10, boxShadow: '0 4px 16px rgba(12,54,128,0.3)', marginTop: 4 }}
            onClick={submit}
            disabled={login.isPending}
          >
            {login.isPending ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 11, color: '#CBD5E1' }}>
          Sal Vita · Gestão Logística Interna
        </div>
      </div>
    </div>
  );
}
