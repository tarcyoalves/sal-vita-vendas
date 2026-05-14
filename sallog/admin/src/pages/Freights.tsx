import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUSES = [
  { key: 'all',         label: 'Todos',        color: '#374151', bg: '#F3F4F6' },
  { key: 'available',   label: 'Disponível',   color: '#2563EB', bg: '#EFF6FF' },
  { key: 'in_progress', label: 'Em Andamento', color: '#D97706', bg: '#FFFBEB' },
  { key: 'completed',   label: 'Concluído',    color: '#EA580C', bg: '#FFF7ED' },
  { key: 'validated',   label: 'Validado',     color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'paid',        label: 'Pago',         color: '#16A34A', bg: '#F0FDF4' },
];

const CARGO: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };

export default function Freights({ nav }: { nav: (p: Page) => void }) {
  const [tab, setTab] = useState('all');
  const { data: freights = [], isLoading } = trpc.freights.list.useQuery({ scope: 'all' });

  const filtered = tab === 'all' ? freights : freights.filter((f) => f.status === tab);
  const sInfo = (key: string) => STATUSES.find((s) => s.key === key) ?? STATUSES[0];

  return (
    <div>
      <div className="page-hdr">
        <div>
          <h1 className="page-ttl">Fretes</h1>
          <div className="page-sub">{freights.length} frete{freights.length !== 1 ? 's' : ''} cadastrado{freights.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="btn btn-primary" onClick={() => nav({ name: 'freight-new' })}>+ Novo Frete</button>
      </div>

      {/* Status chips */}
      <div className="chips">
        {STATUSES.map((s) => {
          const count = s.key === 'all' ? freights.length : freights.filter((f) => f.status === s.key).length;
          return (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={`chip ${tab === s.key ? 'on' : ''}`}
              style={tab === s.key ? { background: s.color, borderColor: s.color } : {}}
            >
              {s.label}
              <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 8, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="tbl-wrap mobile-cards">
        {isLoading ? (
          <div className="loading-center"><span>⏳</span> Carregando fretes...</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">🚛</div><div className="empty-text">Nenhum frete neste status</div></div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Título</th>
                <th>Rota</th>
                <th>Carga</th>
                <th>Valor</th>
                <th>Peso</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const st = sInfo(f.status);
                return (
                  <tr
                    key={f.id}
                    onClick={() => nav({ name: 'freight-detail', id: f.id })}
                  >
                    <td data-label="Título">
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{f.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)' }}>#{f.id}</div>
                    </td>
                    <td data-label="Rota">
                      <div className="route">
                        <div>
                          <div className="route-city">{f.originCity}</div>
                          <div className="route-state">{f.originState}</div>
                        </div>
                        <span className="route-arrow">→</span>
                        <div>
                          <div className="route-city">{f.destinationCity}</div>
                          <div className="route-state">{f.destinationState}</div>
                        </div>
                        {f.distance && <span style={{ fontSize: 11, color: 'var(--text-4)', marginLeft: 4 }}>{f.distance}km</span>}
                      </div>
                    </td>
                    <td data-label="Carga">
                      <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                        {CARGO[f.cargoType] ?? f.cargoType}
                      </span>
                    </td>
                    <td data-label="Valor">
                      <span style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--navy)' }}>
                        {fmtBRL(f.value)}
                      </span>
                    </td>
                    <td data-label="Peso" style={{ color: 'var(--text-3)' }}>
                      {f.weight ? `${f.weight}t` : '—'}
                    </td>
                    <td data-label="Status">
                      <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                    <td className="hide-mobile" style={{ color: 'var(--text-4)', fontSize: 18 }}>›</td>
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
