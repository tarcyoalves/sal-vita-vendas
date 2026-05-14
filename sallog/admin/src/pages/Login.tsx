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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0C3680 0%, #1a56b0 60%, #0e4299 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '40px 36px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <img
              src="http://salvitarn.com.br/wp-content/uploads/2026/05/freteprime.png"
              alt="FRETEPRIME"
              style={{ height: 44, objectFit: 'contain', marginBottom: 8 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0C3680', letterSpacing: '-0.5px' }}>
              🚛 FRETEPRIME
            </div>
            <div style={{ color: '#6B7280', fontSize: 13, marginTop: 4 }}>Painel Administrativo</div>
          </div>

          <label style={lbl}>Email</label>
          <input
            style={inp}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@empresa.com.br"
            autoComplete="email"
          />

          <label style={lbl}>Senha</label>
          <input
            style={inp}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            onKeyDown={(e) => e.key === 'Enter' && login.mutate({ email, password })}
          />

          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 8, padding: '10px 14px', color: '#DC2626',
              fontSize: 13, marginBottom: 16,
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            style={{ ...btn, opacity: login.isPending ? 0.7 : 1 }}
            onClick={() => login.mutate({ email, password })}
            disabled={login.isPending}
          >
            {login.isPending ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20 }}>
          FRETEPRIME © 2026 · Powered by Groq AI
        </div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6,
};
const inp: React.CSSProperties = {
  width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, marginBottom: 16, outline: 'none',
  boxSizing: 'border-box', background: '#F9FAFB', color: '#111827',
  transition: 'border-color 0.15s',
};
const btn: React.CSSProperties = {
  width: '100%', background: '#0C3680', color: '#fff', border: 'none',
  borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700,
  cursor: 'pointer', marginTop: 4, letterSpacing: '0.02em',
  boxShadow: '0 4px 14px rgba(12,54,128,0.3)',
};
