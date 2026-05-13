import { useState } from 'react';
import { trpc } from '../lib/trpc';

const STATUS_LABEL: Record<string, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };
const STATUS_COLOR: Record<string, string> = { pending: '#f59e0b', approved: '#22c55e', rejected: '#ef4444' };

export default function Drivers() {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const { data: drivers = [], isLoading } = trpc.drivers.list.useQuery({});
  const approve = trpc.drivers.approve.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });
  const reject = trpc.drivers.reject.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); setSelected(null); } });

  const filtered = tab === 'all' ? drivers : drivers.filter((d) => d.status === tab);
  const selectedDriver = drivers.find((d) => d.id === selected);

  const TABS = ['all', 'pending', 'approved', 'rejected'];

  return (
    <div>
      {/* Page header */}
      <div className="page-hdr">
        <div>
          <h1 className="page-ttl">Motoristas</h1>
          <p className="page-sub">{drivers.length} motorista{drivers.length !== 1 ? 's' : ''} cadastrado{drivers.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Tab chips */}
      <div className="chips">
        {TABS.map((t) => {
          const count = t === 'all' ? drivers.length : drivers.filter((d) => d.status === t).length;
          return (
            <button key={t} onClick={() => setTab(t)} className={`chip ${tab === t ? 'on' : ''}`}>
              {t === 'all' ? 'Todos' : STATUS_LABEL[t]} ({count})
            </button>
          );
        })}
      </div>

      {/* Table with mobile-cards support */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isLoading ? (
          <div className="empty"><div className="empty-text">Carregando...</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">👤</div>
            <div className="empty-text">Nenhum motorista encontrado</div>
          </div>
        ) : (
          <div className="mobile-cards">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th>Placa</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Nome" style={{ fontWeight: 600 }}>{d.userName ?? '—'}</td>
                    <td data-label="CPF" style={{ color: 'var(--text-2)' }}>{d.cpf}</td>
                    <td data-label="Placa" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{d.plate}</td>
                    <td data-label="Telefone" style={{ color: 'var(--text-2)' }}>{d.phone}</td>
                    <td data-label="Status">
                      <span className="badge" style={{ background: STATUS_COLOR[d.status] + '20', color: STATUS_COLOR[d.status] }}>
                        {STATUS_LABEL[d.status]}
                      </span>
                    </td>
                    <td data-label="Cadastro" style={{ color: 'var(--text-3)' }}>{new Date(d.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td data-label="">
                      {d.status === 'pending' && (
                        <button onClick={() => setSelected(d.id)} className="btn btn-outline btn-sm">Revisar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {selected && selectedDriver && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700 }}>Revisar Motorista</h2>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedDriver.userName}</div>
              <div style={{ color: 'var(--text-2)', fontSize: 13 }}>{selectedDriver.userEmail}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-3)' }}>CPF: </span><strong>{selectedDriver.cpf}</strong></div>
              <div><span style={{ color: 'var(--text-3)' }}>Placa: </span><strong style={{ fontFamily: 'monospace' }}>{selectedDriver.plate}</strong></div>
              <div><span style={{ color: 'var(--text-3)' }}>Telefone: </span><strong>{selectedDriver.phone}</strong></div>
              <div><span style={{ color: 'var(--text-3)' }}>Cadastro: </span><strong>{new Date(selectedDriver.createdAt).toLocaleDateString('pt-BR')}</strong></div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => reject.mutate({ id: selected })} disabled={reject.isPending} className="btn btn-danger" style={{ flex: 1 }}>Rejeitar</button>
              <button onClick={() => approve.mutate({ id: selected })} disabled={approve.isPending} className="btn btn-primary" style={{ flex: 1 }}>Aprovar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
