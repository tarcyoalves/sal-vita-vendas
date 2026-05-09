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

  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ margin: '0 0 24px', fontSize: 24, fontWeight: 800 }}>Motoristas</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'pending', 'approved', 'rejected'].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 16px', borderRadius: 20, border: 'none', background: tab === t ? '#0C3680' : '#f1f5f9', color: tab === t ? '#fff' : '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            {t === 'all' ? 'Todos' : STATUS_LABEL[t]} ({t === 'all' ? drivers.length : drivers.filter((d) => d.status === t).length})
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {isLoading ? <p style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Carregando...</p> : filtered.length === 0 ? <p style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>Nenhum motorista</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>{['Nome', 'CPF', 'Placa', 'Telefone', 'Status', 'Cadastro', ''].map((h) => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{d.userName ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{d.cpf}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600 }}>{d.plate}</td>
                  <td style={{ padding: '12px 16px', color: '#475569' }}>{d.phone}</td>
                  <td style={{ padding: '12px 16px' }}><span style={{ background: STATUS_COLOR[d.status] + '20', color: STATUS_COLOR[d.status], padding: '3px 10px', borderRadius: 12, fontWeight: 600, fontSize: 12 }}>{STATUS_LABEL[d.status]}</span></td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{new Date(d.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td style={{ padding: '12px 16px' }}>{d.status === 'pending' && <button onClick={() => setSelected(d.id)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>Revisar</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && selectedDriver && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setSelected(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 32, width: 420 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Revisar Motorista</h2>
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selectedDriver.userName}</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>{selectedDriver.userEmail}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24, fontSize: 13 }}>
              <div><span style={{ color: '#64748b' }}>CPF: </span><strong>{selectedDriver.cpf}</strong></div>
              <div><span style={{ color: '#64748b' }}>Placa: </span><strong style={{ fontFamily: 'monospace' }}>{selectedDriver.plate}</strong></div>
              <div><span style={{ color: '#64748b' }}>Telefone: </span><strong>{selectedDriver.phone}</strong></div>
              <div><span style={{ color: '#64748b' }}>Cadastro: </span><strong>{new Date(selectedDriver.createdAt).toLocaleDateString('pt-BR')}</strong></div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => reject.mutate({ id: selected })} disabled={reject.isPending} style={{ flex: 1, background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Rejeitar</button>
              <button onClick={() => approve.mutate({ id: selected })} disabled={approve.isPending} style={{ flex: 1, background: '#0C3680', color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 700, cursor: 'pointer' }}>Aprovar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
