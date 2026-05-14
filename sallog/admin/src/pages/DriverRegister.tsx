import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function maskCpf(v: string) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskPlate(v: string) {
  const raw = v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 7);
  if (raw.length <= 3) return raw;
  return raw.slice(0, 3) + '-' + raw.slice(3);
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const VEHICLE_TYPES = [
  { value: 'truck', label: 'Truck' },
  { value: 'toco', label: 'Toco' },
  { value: 'bitruck', label: 'Bitruck' },
  { value: 'carreta', label: 'Carreta' },
  { value: 'outros', label: 'Outros' },
];

export default function DriverRegister({ onNav }: { onNav?: (p: Page) => void }) {
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [plate, setPlate] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const register = trpc.auth.registerDriver.useMutation({
    onSuccess: () => setDone(true),
    onError: (e) => setError(e.message),
  });

  function handleSubmit() {
    setError('');
    if (!name.trim() || !cpf || !plate || !phone || !vehicleType || !password) {
      setError('Preencha todos os campos.');
      return;
    }
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    register.mutate({ name: name.trim(), cpf, plate, phone, vehicleType, password });
  }

  if (done) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 800, color: '#0C3680' }}>
              Cadastro enviado!
            </h2>
            <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.6, margin: '0 0 28px' }}>
              Aguarde aprovação do administrador.<br />
              Você receberá acesso assim que for aprovado.
            </p>
            <button
              onClick={() => onNav?.({ name: 'login' })}
              style={primaryBtn}
            >
              Ir para o Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ background: '#0C3680', borderRadius: '20px 20px 0 0', padding: '28px 32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', marginBottom: 4 }}>
            🚛 FRETEPRIME
          </div>
          <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14 }}>Cadastro de Motorista</div>
        </div>

        {/* Form card */}
        <div style={{ ...card, borderRadius: '0 0 20px 20px', padding: '28px 32px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <label style={lbl}>Nome completo</label>
            <input
              style={inp}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome completo"
              autoComplete="name"
            />

            <label style={lbl}>CPF</label>
            <input
              style={inp}
              type="text"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(maskCpf(e.target.value))}
              placeholder="000.000.000-00"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Placa</label>
                <input
                  style={inp}
                  type="text"
                  value={plate}
                  onChange={(e) => setPlate(maskPlate(e.target.value))}
                  placeholder="ABC-1234"
                />
              </div>
              <div>
                <label style={lbl}>Telefone</label>
                <input
                  style={inp}
                  type="text"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(84) 99999-9999"
                />
              </div>
            </div>

            <label style={lbl}>Tipo de veículo</label>
            <select
              style={{ ...inp, color: vehicleType ? '#111827' : '#9ca3af' }}
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            >
              <option value="" disabled>Selecione o tipo...</option>
              {VEHICLE_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>

            <label style={lbl}>Senha</label>
            <input
              style={inp}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />

            <label style={lbl}>Confirmar senha</label>
            <input
              style={inp}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 8 }}>
                ⚠ {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={register.isPending}
              style={{ ...primaryBtn, opacity: register.isPending ? 0.7 : 1, marginTop: 4 }}
            >
              {register.isPending ? 'Enviando...' : 'Solicitar Cadastro'}
            </button>

            {onNav && (
              <button
                onClick={() => onNav({ name: 'login' })}
                style={{ background: 'none', border: 'none', color: '#0C3680', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 16, padding: 8 }}
              >
                Já tenho conta → Entrar
              </button>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 20 }}>
          FRETEPRIME © 2026 · Gestão Logística
        </div>
      </div>
    </div>
  );
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #0C3680 0%, #1a56b0 60%, #0e4299 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
};
const card: React.CSSProperties = {
  background: '#fff',
  boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, marginTop: 4,
};
const inp: React.CSSProperties = {
  width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 10,
  padding: '11px 14px', fontSize: 14, marginBottom: 14, outline: 'none',
  boxSizing: 'border-box', background: '#F9FAFB', color: '#111827',
  transition: 'border-color 0.15s', fontFamily: "'Inter', sans-serif",
};
const primaryBtn: React.CSSProperties = {
  width: '100%', background: '#0C3680', color: '#fff', border: 'none',
  borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700,
  cursor: 'pointer', letterSpacing: '0.02em', minHeight: 44,
  boxShadow: '0 4px 14px rgba(12,54,128,0.3)',
};
