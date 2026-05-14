import { useState } from 'react';
import { trpc } from '../lib/trpc';

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: '#FFFBEB', color: '#D97706', label: 'Pendente' },
  approved: { bg: '#F0FDF4', color: '#16A34A', label: 'Aprovado' },
  rejected: { bg: '#FEF2F2', color: '#DC2626', label: 'Rejeitado' },
};

const VEHICLE: Record<string, string> = {
  truck: 'Truck', toco: 'Toco', bitruck: 'Bitruck', carreta: 'Carreta', outros: 'Outros',
};

export default function Drivers() {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: drivers = [], isLoading } = trpc.drivers.list.useQuery({});
  const approve = trpc.drivers.approve.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });
  const reject  = trpc.drivers.reject.useMutation({  onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });
  const toggleFav = trpc.drivers.toggleFavorite.useMutation({ onSuccess: () => utils.drivers.list.invalidate() });

  const tabs = [
    { key: 'all',       label: 'Todos',     count: drivers.length },
    { key: 'pending',   label: 'Pendentes', count: drivers.filter(d => d.status === 'pending').length },
    { key: 'approved',  label: 'Aprovados', count: drivers.filter(d => d.status === 'approved').length },
    { key: 'rejected',  label: 'Rejeitados',count: drivers.filter(d => d.status === 'rejected').length },
    { key: 'favorites', label: '⭐ Favoritos', count: drivers.filter(d => d.isFavorite).length },
  ];

  const filtered =
    tab === 'favorites' ? drivers.filter(d => d.isFavorite) :
    tab === 'all'       ? drivers :
    drivers.filter(d => d.status === tab);

  const sel = drivers.find(d => d.id === selected);
  const pendingCount = drivers.filter(d => d.status === 'pending').length;

  return (
    <div>
      <div className="page-hdr">
        <div>
          <h1 className="page-ttl">Motoristas</h1>
          <div className="page-sub">Gerencie sua base de motoristas parceiros</div>
        </div>
        {pendingCount > 0 && (
          <div className="alert alert-warning" style={{ margin: 0 }}>
            ⚠️ {pendingCount} aguardando aprovação
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="tbl-wrap mobile-cards">
        {isLoading ? (
          <div className="loading-center">Carregando motoristas...</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><div className="empty-icon">👤</div><div className="empty-text">Nenhum motorista nesta categoria</div></div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Motorista</th>
                <th>CPF</th>
                <th>Placa</th>
                <th>Veículo</th>
                <th>Telefone</th>
                <th>Status</th>
                <th>Fretes</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const st = STATUS_STYLE[d.status];
                return (
                  <tr key={d.id}>
                    <td data-label="Motorista">
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {d.isFavorite && <span title="Favorito">⭐</span>}
                        {d.userName ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{d.userEmail}</div>
                    </td>
                    <td data-label="CPF" style={{ fontFamily: 'monospace', fontSize: 13 }}>{d.cpf}</td>
                    <td data-label="Placa">
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px', fontSize: 12 }}>
                        {d.plate}
                      </span>
                    </td>
                    <td data-label="Veículo" style={{ color: 'var(--text-2)' }}>{VEHICLE[d.vehicleType ?? ''] ?? d.vehicleType ?? '—'}</td>
                    <td data-label="Telefone" style={{ color: 'var(--text-2)' }}>{d.phone}</td>
                    <td data-label="Status">
                      <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                    </td>
                    <td data-label="Fretes" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontWeight: 700, fontSize: 15 }}>{d.totalFreights ?? 0}</td>
                    <td data-label="Ações">
                      <div style={{ display: 'flex', gap: 6 }}>
                        {d.status === 'pending' && (
                          <button onClick={() => setSelected(d.id)} className="btn btn-outline btn-sm">Revisar</button>
                        )}
                        {d.status === 'approved' && (
                          <button
                            onClick={() => toggleFav.mutate({ id: d.id })}
                            className="btn btn-outline btn-sm"
                            title={d.isFavorite ? 'Remover favorito' : 'Marcar como favorito'}
                          >
                            {d.isFavorite ? '⭐' : '☆'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Review modal */}
      {selected && sel && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Revisar Motorista</div>

            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{sel.userName}</div>
              <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 2 }}>{sel.userEmail}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              {[
                { label: 'CPF', value: sel.cpf },
                { label: 'Placa', value: sel.plate },
                { label: 'Telefone', value: sel.phone },
                { label: 'Veículo', value: VEHICLE[sel.vehicleType ?? ''] ?? sel.vehicleType ?? '—' },
                ...(sel.pixKey ? [{ label: 'Chave PIX', value: sel.pixKey }] : []),
                { label: 'Cadastro', value: new Date(sel.createdAt).toLocaleDateString('pt-BR') },
              ].map(({ label, value }) => (
                <div key={label} className="info-row">
                  <span className="info-row-label">{label}</span>
                  <span className="info-row-value">{value}</span>
                </div>
              ))}
            </div>

            <hr className="divider" />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => reject.mutate({ id: selected })}
                disabled={reject.isPending}
                className="btn btn-danger"
                style={{ flex: 1 }}
              >
                ✗ Rejeitar
              </button>
              <button
                onClick={() => approve.mutate({ id: selected })}
                disabled={approve.isPending}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                ✓ Aprovar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
