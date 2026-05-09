import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUSES = [
  { key: 'all',        label: 'Todos',        color: '#64748b', bg: '#f1f5f9' },
  { key: 'available',  label: 'Disponível',   color: '#2563eb', bg: '#eff6ff' },
  { key: 'in_progress',label: 'Em Andamento', color: '#d97706', bg: '#fffbeb' },
  { key: 'completed',  label: 'Concluído',    color: '#ea580c', bg: '#fff7ed' },
  { key: 'validated',  label: 'Validado',     color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'paid',       label: 'Pago',         color: '#16a34a', bg: '#f0fdf4' },
];

const CARGO: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };

export default function Freights({ nav }: { nav: (p: Page) => void }) {
  const [tab, setTab] = useState('all');
  const { data: freights = [], isLoading } = trpc.freights.list.useQuery({ scope: 'all' });

  const filtered = tab === 'all' ? freights : freights.filter((f) => f.status === tab);
  const statusInfo = (key: string) => STATUSES.find((s) => s.key === key) ?? STATUSES[0];

  return (
    <div style={{ padding: 32, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px' }}>
            Fretes
          </h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            {freights.length} frete{freights.length !== 1 ? 's' : ''} cadastrado{freights.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => nav({ name: 'freight-new' })}
          style={{ background: '#0C3680', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(12,54,128,0.3)' }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Novo Frete
        </button>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUSES.map((s) => {
          const count = s.key === 'all' ? freights.length : freights.filter((f) => f.status === s.key).length;
          const active = tab === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              style={{
                padding: '7px 16px', borderRadius: 20, border: active ? `1.5px solid ${s.color}` : '1.5px solid #e2e8f0',
                background: active ? s.bg : '#fff', color: active ? s.color : '#475569',
                fontWeight: active ? 700 : 500, cursor: 'pointer', fontSize: 13,
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {s.label}
              <span style={{ background: active ? s.color : '#e2e8f0', color: active ? '#fff' : '#64748b', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 15 }}>Carregando fretes...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🚛</div>
            <div style={{ color: '#94a3b8', fontSize: 15 }}>Nenhum frete neste status</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Título', 'Rota', 'Tipo de Carga', 'Valor', 'Peso', 'Status', ''].map((h) => (
                  <th key={h} style={{ padding: '12px 18px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const st = statusInfo(f.status);
                return (
                  <tr
                    key={f.id}
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                    onClick={() => nav({ name: 'freight-detail', id: f.id })}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbff')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{f.title}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>#{f.id}</div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.originCity}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>{f.originState}</div>
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: 16, flexShrink: 0 }}>→</div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{f.destinationCity}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>{f.destinationState}</div>
                        </div>
                        {f.distance ? <div style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>{f.distance}km</div> : null}
                      </div>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                        {CARGO[f.cargoType] ?? f.cargoType}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: 800, fontSize: 15, color: '#0C3680' }}>{fmtValue(f.value)}</td>
                    <td style={{ padding: '14px 18px', color: '#64748b', fontSize: 13 }}>{f.weight ? `${f.weight}t` : '—'}</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ color: '#0C3680', fontSize: 18 }}>›</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
