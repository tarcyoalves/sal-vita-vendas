import { useState } from 'react';
import { trpc } from '../lib/trpc';

const STATUS_LABEL: Record<string, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };
const STATUS_COLOR: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444' };
const VEHICLE_LABEL: Record<string, string> = { truck: 'Truck', toco: 'Toco', bitruck: 'Bitruck', carreta: 'Carreta', outros: 'Outros' };

export default function Drivers() {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: drivers = [], isLoading } = trpc.drivers.list.useQuery({});
  const approve = trpc.drivers.approve.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });
  const reject = trpc.drivers.reject.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });
  const toggleFavorite = trpc.drivers.toggleFavorite.useMutation({ onSuccess: () => utils.drivers.list.invalidate() });

  const tabs = [
    { key: 'all', label: 'Todos', count: drivers.length },
    { key: 'pending', label: 'Pendentes', count: drivers.filter((d) => d.status === 'pending').length },
    { key: 'approved', label: 'Aprovados', count: drivers.filter((d) => d.status === 'approved').length },
    { key: 'rejected', label: 'Rejeitados', count: drivers.filter((d) => d.status === 'rejected').length },
    { key: 'favorites', label: '⭐ Favoritos', count: drivers.filter((d) => d.isFavorite).length },
  ];

  const filtered = tab === 'all' ? drivers
    : tab === 'favorites' ? drivers.filter((d) => d.isFavorite)
    : drivers.filter((d) => d.status === tab);

  const selectedDriver = drivers.find((d) => d.id === selected);
  const pendingCount = drivers.filter((d) => d.status === 'pending').length;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Motoristas</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Gerencie sua base de motoristas</p>
        </div>
        {pendingCount > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '8px 16px', fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            ⚠️ {pendingCount} motorista{pendingCount > 1 ? 's' : ''} aguardando aprovação
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: tab === t.key ? '#0C3680' : '#f1f5f9', color: tab === t.key ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13, position: 'relative' }}>
            {t.label} ({t.count})
            {t.key === 'pending' && t.count > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {isLoading ? (
          <p style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Carregando...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Nenhum motorista nesta categoria</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {['Nome', 'CPF', 'Placa', 'Veículo', 'Telefone', 'Status', 'Fretes', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {d.isFavorite && <span title="Favorito">⭐</span>}
                      {d.userName ?? '—'}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{d.cpf}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600 }}>{d.plate}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{VEHICLE_LABEL[d.vehicleType ?? ''] ?? d.vehicleType ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{d.phone}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: STATUS_COLOR[d.status] + '20', color: STATUS_COLOR[d.status], padding: '3px 10px', borderRadius: 12, fontWeight: 600, fontSize: 12 }}>
                      {STATUS_LABEL[d.status]}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontWeight: 600 }}>{d.totalFreights ?? 0}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {d.status === 'pending' && (
                        <button onClick={() => setSelected(d.id)} style={{ background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Revisar</button>
                      )}
                      {d.status === 'approved' && (
                        <button onClick={() => toggleFavorite.mutate({ id: d.id })} title={d.isFavorite ? 'Remover favorito' : 'Marcar favorito'} style={{ background: d.isFavorite ? '#fef3c7' : '#f1f5f9', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 14 }}>
                          {d.isFavorite ? '⭐' : '☆'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && selectedDriver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setSelected(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 460, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Revisar Motorista</h2>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedDriver.userName}</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>{selectedDriver.userEmail}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12, fontSize: 13 }}>
              <InfoRow label="CPF" value={selectedDriver.cpf} />
              <InfoRow label="Placa" value={selectedDriver.plate} mono />
              <InfoRow label="Telefone" value={selectedDriver.phone} />
              <InfoRow label="Veículo" value={VEHICLE_LABEL[selectedDriver.vehicleType ?? ''] ?? selectedDriver.vehicleType ?? '—'} />
              {selectedDriver.pixKey && <InfoRow label="Chave PIX" value={selectedDriver.pixKey} />}
              <InfoRow label="Cadastro" value={new Date(selectedDriver.createdAt).toLocaleDateString('pt-BR')} />
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button onClick={() => reject.mutate({ id: selected })} disabled={reject.isPending} style={{ flex: 1, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer' }}>✗ Rejeitar</button>
              <button onClick={() => approve.mutate({ id: selected })} disabled={approve.isPending} style={{ flex: 1, background: '#0C3680', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer' }}>✓ Aprovar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span style={{ color: '#64748b', fontSize: 12 }}>{label}: </span>
      <strong style={{ fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</strong>
    </div>
  );
}
