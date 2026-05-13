import { trpc } from '../lib/trpc';

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  completed:  { label: 'Aguardando Validação', color: '#ea580c', bg: '#fff7ed' },
  validated:  { label: 'Aguardando Pagamento', color: '#7c3aed', bg: '#f5f3ff' },
  paid:       { label: 'Pago',                 color: '#16a34a', bg: '#f0fdf4' },
};

type Page = { name: string; id?: number };

export default function Financial({ nav }: { nav: (p: Page) => void }) {
  const utils = trpc.useUtils();
  const { data: allFreights = [] } = trpc.freights.list.useQuery({ scope: 'all' });
  const { data: drivers = [] } = trpc.drivers.list.useQuery({});
  const validate = trpc.freights.validate.useMutation({ onSuccess: () => utils.freights.list.invalidate() });
  const markPaid = trpc.freights.markPaid.useMutation({ onSuccess: () => utils.freights.list.invalidate() });

  const financial = allFreights.filter((f) => ['completed', 'validated', 'paid'].includes(f.status));
  
  const totalPending = financial.filter((f) => f.status === 'validated').reduce((sum, f) => sum + f.value, 0);
  const totalPaid = financial.filter((f) => f.status === 'paid').reduce((sum, f) => sum + f.value, 0);
  const awaitingValidation = financial.filter((f) => f.status === 'completed').length;

  const getDriverName = (driverId: number | null) => {
    if (!driverId) return '—';
    const d = drivers.find((dr) => dr.id === driverId);
    return d?.userName ?? `#${driverId}`;
  };

  return (
    <div style={{ padding: 32, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Financeiro</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Controle de pagamentos por frete</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 8 }}>A Validar</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#ea580c' }}>{awaitingValidation}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>fretes aguardando validação</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 8 }}>A Pagar</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>{fmtValue(totalPending)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{financial.filter((f) => f.status === 'validated').length} frete(s) validados</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 8 }}>Pago (Total)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#16a34a' }}>{fmtValue(totalPaid)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{financial.filter((f) => f.status === 'paid').length} frete(s) quitados</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              {['Frete', 'Motorista', 'Valor', 'Status', 'Data', 'Ação'].map((h) => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {financial.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Nenhum frete concluído ainda</td></tr>
            ) : (
              financial.map((f) => {
                const meta = STATUS_META[f.status];
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, cursor: 'pointer', color: '#0C3680' }} onClick={() => nav({ name: 'freight-detail', id: f.id })}>
                        {f.title}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}</div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{getDriverName(f.assignedDriverId)}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{fmtValue(f.value)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: meta.bg, color: meta.color, padding: '3px 10px', borderRadius: 12, fontWeight: 600, fontSize: 12 }}>{meta.label}</span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13 }}>
                      {f.paidAt ? new Date(f.paidAt).toLocaleDateString('pt-BR') : f.validatedAt ? new Date(f.validatedAt).toLocaleDateString('pt-BR') : new Date(f.updatedAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {f.status === 'completed' && (
                        <button onClick={() => validate.mutate({ id: f.id })} disabled={validate.isPending} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                          ✅ Validar
                        </button>
                      )}
                      {f.status === 'validated' && (
                        <button onClick={() => markPaid.mutate({ id: f.id })} disabled={markPaid.isPending} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                          💰 Marcar Pago
                        </button>
                      )}
                      {f.status === 'paid' && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 600 }}>✓ Quitado</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
