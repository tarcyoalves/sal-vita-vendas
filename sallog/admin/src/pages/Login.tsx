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
    <div style={{ minHeight: '100vh', background: '#0C3680', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, width: '100%', maxWidth: 400 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: '#0C3680', textAlign: 'center', marginBottom: 4 }}>🚛 SalLog</div>
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, marginBottom: 28 }}>Painel Administrativo</div>

        <label style={lbl}>Email</label>
        <input style={inp} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@salvita.com.br" />

        <label style={lbl}>Senha</label>
        <input style={inp} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && login.mutate({ email, password })} />

        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <button style={{ ...btn, opacity: login.isPending ? 0.7 : 1 }} onClick={() => login.mutate({ email, password })} disabled={login.isPending}>
          {login.isPending ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 16, outline: 'none', boxSizing: 'border-box', background: '#f9fafb' };
const btn: React.CSSProperties = { width: '100%', background: '#0C3680', color: '#fff', border: 'none', borderRadius: 8, padding: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 };
