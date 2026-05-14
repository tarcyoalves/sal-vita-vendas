import { useState } from 'react';
import { trpc } from '../lib/trpc';

const STATUS_LABEL: Record<string, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };
const STATUS_COLOR: Record<string, string> = { pending: '#D97706', approved: '#16A34A', rejected: '#EF4444' };
const STATUS_BG: Record<string, string>    = { pending: '#FFFBEB', approved: '#F0FDF4', rejected: '#FEF2F2' };
const VEHICLE_TYPES = ['Truck', 'Toco', 'Bitruck', 'Carreta', 'Outros'];

type DriverRow = { id: number; userName: string | null; userEmail: string | null; cpf: string; plate: string; phone: string; status: string; vehicleType: string | null; score: number | null; totalFreights: number; isFavorite: boolean; createdAt: Date };

export default function Drivers() {
  const [tab, setTab]           = useState('all');
  const [selected, setSelected] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const { data: drivers = [], isLoading } = trpc.drivers.list.useQuery({});
  const approve = trpc.drivers.approve.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });
  const reject  = trpc.drivers.reject.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });
  const favorite = trpc.drivers.setFavorite?.useMutation?.({ onSuccess: () => utils.drivers.list.invalidate() });

  const filtered = tab === 'all' ? drivers : drivers.filter((d) => d.status === tab);
  const selectedDriver = drivers.find((d) => d.id === selected) as DriverRow | undefined;

  const counts = {
    all: drivers.length,
    pending: drivers.filter((d) => d.status === 'pending').length,
    approved: drivers.filter((d) => d.status === 'approved').length,
    rejected: drivers.filter((d) => d.status === 'rejected').length,
  };

  return (
    <div style={{ padding: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>Motoristas</h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 14 }}>{drivers.length} cadastrado{drivers.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ background: '#0C3680', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14, boxShadow: '0 4px 14px rgba(12,54,128,0.3)', minHeight: 44 }}
        >
          + Cadastrar Motorista
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 16px', borderRadius: 20, border: tab === t ? `1.5px solid ${t === 'all' ? '#0C3680' : STATUS_COLOR[t]}` : '1.5px solid #E5E7EB',
              background: tab === t ? (t === 'all' ? '#EEF2FF' : STATUS_BG[t]) : '#fff',
              color: tab === t ? (t === 'all' ? '#1E40AF' : STATUS_COLOR[t]) : '#6B7280',
              fontWeight: tab === t ? 700 : 500, cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 6, minHeight: 36,
            }}
          >
            {t === 'all' ? 'Todos' : STATUS_LABEL[t]}
            <span style={{ background: tab === t ? (t === 'all' ? '#1E40AF' : STATUS_COLOR[t]) : '#E5E7EB', color: tab === t ? '#fff' : '#6B7280', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF' }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#9CA3AF' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>👤</div>
            Nenhum motorista neste status
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 600 }}>
              <thead style={{ background: '#F8FAFC' }}>
                <tr>
                  {['Nome', 'CPF', 'Placa', 'Veículo', 'Fretes', 'Status', 'Cadastro', ''].map((h) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', borderBottom: '1px solid #F3F4F6' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(filtered as DriverRow[]).map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>
                        {d.isFavorite && <span style={{ marginRight: 4 }}>⭐</span>}
                        {d.userName ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#6B7280', fontFamily: 'monospace' }}>{d.cpf}</td>
                    <td style={{ padding: '13px 16px', fontFamily: 'monospace', fontWeight: 700, color: '#374151' }}>{d.plate}</td>
                    <td style={{ padding: '13px 16px', color: '#6B7280' }}>{d.vehicleType ?? '—'}</td>
                    <td style={{ padding: '13px 16px', color: '#374151', fontWeight: 600 }}>{d.totalFreights}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ background: STATUS_BG[d.status], color: STATUS_COLOR[d.status], padding: '4px 10px', borderRadius: 20, fontWeight: 700, fontSize: 12 }}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#9CA3AF', fontSize: 12 }}>{new Date(d.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td style={{ padding: '13px 16px' }}>
                      {d.status === 'pending' && (
                        <button onClick={() => setSelected(d.id)} style={{ background: '#EEF2FF', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12, color: '#1E40AF', minHeight: 32 }}>
                          Revisar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review modal */}
      {selected && selectedDriver && (
        <div style={overlay} onClick={() => setSelected(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Revisar Motorista</h2>
              <button onClick={() => setSelected(null)} style={closeBtn}>✕</button>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{selectedDriver.userName}</div>
              <div style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{selectedDriver.userEmail}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, fontSize: 13 }}>
              {[
                ['CPF', selectedDriver.cpf],
                ['Placa', selectedDriver.plate],
                ['Telefone', selectedDriver.phone],
                ['Veículo', selectedDriver.vehicleType ?? '—'],
                ['Cadastrado', new Date(selectedDriver.createdAt).toLocaleDateString('pt-BR')],
                ['Fretes', String(selectedDriver.totalFreights)],
              ].map(([lbl, val]) => (
                <div key={lbl}>
                  <span style={{ color: '#9CA3AF' }}>{lbl}: </span>
                  <strong style={{ color: '#111827' }}>{val}</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => reject.mutate({ id: selected })} disabled={reject.isPending} style={{ flex: 1, background: '#FEF2F2', color: '#EF4444', border: '1px solid #FECACA', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
                Rejeitar
              </button>
              <button onClick={() => approve.mutate({ id: selected })} disabled={approve.isPending} style={{ flex: 1, background: '#0C3680', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
                {approve.isPending ? 'Aprovando...' : 'Aprovar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create manual modal */}
      {showCreate && <CreateDriverModal onClose={() => setShowCreate(false)} onSuccess={() => { setShowCreate(false); utils.drivers.list.invalidate(); }} />}
    </div>
  );
}

function CreateDriverModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', cpf: '', plate: '', phone: '', vehicleType: '', pixKey: '', password: 'frete123' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const create = trpc.drivers.createManual.useMutation({
    onSuccess,
    onError: (e) => setError(e.message),
  });

  const formatCpf = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
            .replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
            .replace(/(\d{3})(\d{1,3})/, '$1.$2');
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    create.mutate({ ...form, cpf: form.cpf.replace(/\D/g, ''), plate: form.plate.toUpperCase() });
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cadastrar Motorista Manualmente</h2>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Nome Completo *" cols={2}><input style={inp} required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="João da Silva" /></Field>
            <Field label="CPF *"><input style={inp} required value={form.cpf} onChange={(e) => set('cpf', formatCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} /></Field>
            <Field label="Placa *"><input style={inp} required value={form.plate} onChange={(e) => set('plate', e.target.value.toUpperCase())} placeholder="ABC-1234" maxLength={8} /></Field>
            <Field label="Telefone *"><input style={inp} required value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="(84) 99999-9999" /></Field>
            <Field label="Tipo de Veículo">
              <select style={inp} value={form.vehicleType} onChange={(e) => set('vehicleType', e.target.value)}>
                <option value="">Selecionar...</option>
                {VEHICLE_TYPES.map((v) => <option key={v} value={v.toLowerCase()}>{v}</option>)}
              </select>
            </Field>
            <Field label="Chave Pix"><input style={inp} value={form.pixKey} onChange={(e) => set('pixKey', e.target.value)} placeholder="CPF, email ou telefone" /></Field>
            <Field label="Senha Inicial" cols={2}>
              <input style={inp} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="frete123" minLength={6} />
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Motorista usará esta senha para acessar o portal. Padrão: frete123</div>
            </Field>
          </div>
          {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>⚠ {error}</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: 12, fontWeight: 600, cursor: 'pointer', color: '#374151', minHeight: 44 }}>Cancelar</button>
            <button type="submit" disabled={create.isPending} style={{ flex: 2, background: '#0C3680', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer', opacity: create.isPending ? 0.7 : 1, minHeight: 44 }}>
              {create.isPending ? 'Cadastrando...' : '✓ Cadastrar (já aprovado)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, cols }: { label: string; children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ gridColumn: cols ? `span ${cols}` : undefined }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 18, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,0.2)' };
const closeBtn: React.CSSProperties = { background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#374151', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#F9FAFB', color: '#111827' };
