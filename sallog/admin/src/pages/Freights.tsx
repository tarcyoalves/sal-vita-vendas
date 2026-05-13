import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUSES = [
  { key: 'all',         label: 'Todos',        color: '#64748b' },
  { key: 'available',   label: 'Disponível',   color: '#2563eb' },
  { key: 'in_progress', label: 'Em Andamento', color: '#d97706' },
  { key: 'completed',   label: 'Concluído',    color: '#ea580c' },
  { key: 'validated',   label: 'Validado',     color: '#7c3aed' },
  { key: 'paid',        label: 'Pago',         color: '#16a34a' },
];

const CARGO: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };

export default function Freights({ nav }: { nav: (p: Page) => void }) {
  const [tab, setTab] = useState('all');
  const { data: freights = [], isLoading } = trpc.freights.list.useQuery({ scope: 'all' });

  const filtered = tab === 'all' ? freights : freights.filter((f) => f.status === tab);
  const statusInfo = (key: string) => STATUSES.find((s) => s.key === key) ?? STATUSES[0];

  return (
    <div>
      {/* Page header */}
      <div className="page-hdr">
        <div>
          <h1 className="page-ttl">Fretes</h1>
          <p className="page-sub">{freights.length} frete{freights.length !== 1 ? 's' : ''} cadastrado{freights.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => nav({ name: 'freight-new' })}>+ Novo Frete</button>
      </div>

      {/* Status chips */}
      <div className="chips">
        {STATUSES.map((s) => {
          const count = s.key === 'all' ? freights.length : freights.filter((f) => f.status === s.key).length;
          return (
            <button key={s.key} onClick={() => setTab(s.key)} className={`chip ${tab === s.key ? 'on' : ''}`}
              style={tab === s.key ? { background: s.color, borderColor: s.color } : {}}>
              {s.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div className="empty"><div className="empty-text">Carregando fretes...</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🚛</div>
            <div className="empty-text">Nenhum frete neste status</div>
          </div>
        ) : (
          <div className="mobile-cards">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Rota</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Peso</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => {
                  const st = statusInfo(f.status);
                  return (
                    <tr key={f.id} onClick={() => nav({ name: 'freight-detail', id: f.id })} style={{ cursor: 'pointer' }}>
                      <td data-label="Título">
                        <div style={{ fontWeight: 600 }}>{f.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)' }}>#{f.id}</div>
                      </td>
                      <td data-label="Rota">
                        <div style={{ fontSize: 13 }}>
                          {f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}
                          {f.distance ? <span style={{ color: 'var(--text-3)', marginLeft: 4 }}>{f.distance}km</span> : null}
                        </div>
                      </td>
                      <td data-label="Tipo">
                        <span className="badge" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                          {CARGO[f.cargoType] ?? f.cargoType}
                        </span>
                      </td>
                      <td data-label="Valor" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtValue(f.value)}</td>
                      <td data-label="Peso" style={{ color: 'var(--text-2)' }}>{f.weight ? `${f.weight}t` : '—'}</td>
                      <td data-label="Status">
                        <span className="badge" style={{ background: st.color + '20', color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td><span style={{ color: 'var(--sky)', fontSize: 18 }}>›</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
