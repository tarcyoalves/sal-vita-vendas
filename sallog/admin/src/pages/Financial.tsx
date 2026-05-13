import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_COLOR: Record<string, string> = {
  available: '#3b82f6', in_progress: '#f59e0b', completed: '#f97316',
  validated: '#8b5cf6', paid: '#22c55e',
};
const STATUS_LABEL: Record<string, string> = {
  available: 'Disponível', in_progress: 'Em Andamento', completed: 'Concluído',
  validated: 'Validado', paid: 'Pago',
};

export default function Financial({ nav }: { nav: (p: Page) => void }) {
  const { data: freights = [], isLoading } = trpc.freights.list.useQuery({ scope: 'all' });
  const { data: stats } = trpc.freights.stats.useQuery();

  const paidFreights = freights.filter(f => f.status === 'paid');
  const validatedFreights = freights.filter(f => f.status === 'validated');
  const inProgressFreights = freights.filter(f => f.status === 'in_progress');

  const totalPaid = paidFreights.reduce((acc, f) => acc + f.value, 0);
  const totalToPay = validatedFreights.reduce((acc, f) => acc + f.value, 0);
  const totalInProgress = inProgressFreights.reduce((acc, f) => acc + f.value, 0);
  const totalAll = freights.reduce((acc, f) => acc + f.value, 0);

  const summaryCards = [
    { label: 'Total Pago', value: fmtValue(totalPaid), color: '#22c55e', count: paidFreights.length },
    { label: 'A Pagar', value: fmtValue(totalToPay), color: '#8b5cf6', count: validatedFreights.length },
    { label: 'Em Trânsito', value: fmtValue(totalInProgress), color: '#f59e0b', count: inProgressFreights.length },
    { label: 'Volume Total', value: fmtValue(totalAll), color: '#0C3680', count: freights.length },
  ];

  return (
    <div>
      {/* Header */}
      <div className="page-hdr">
        <div>
          <h1 className="page-ttl">Financeiro</h1>
          <p className="page-sub">Resumo financeiro de todos os fretes</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {summaryCards.map(({ label, value, color, count }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 22, fontWeight: 700, color, lineHeight: 1.2, marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{count} frete{count !== 1 ? 's' : ''}</div>
            <div className="stat-bar" style={{ background: color }} />
          </div>
        ))}
      </div>

      {/* Freights table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Todos os Fretes</h3>
        </div>
        {isLoading ? (
          <div className="empty"><div className="empty-text">Carregando...</div></div>
        ) : freights.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">💰</div>
            <div className="empty-text">Nenhum frete registrado</div>
          </div>
        ) : (
          <div className="mobile-cards">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Frete</th>
                  <th>Rota</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {freights.map((f) => (
                  <tr key={f.id} onClick={() => nav({ name: 'freight-detail', id: f.id })} style={{ cursor: 'pointer' }}>
                    <td data-label="Frete">
                      <div style={{ fontWeight: 600 }}>{f.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>#{f.id}</div>
                    </td>
                    <td data-label="Rota" style={{ color: 'var(--text-2)', fontSize: 13 }}>
                      {f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}
                    </td>
                    <td data-label="Valor" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtValue(f.value)}</td>
                    <td data-label="Status">
                      <span className="badge" style={{ background: STATUS_COLOR[f.status] + '20', color: STATUS_COLOR[f.status] }}>
                        {STATUS_LABEL[f.status]}
                      </span>
                    </td>
                    <td data-label="Data" style={{ color: 'var(--text-3)', fontSize: 12 }}>
                      {new Date(f.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
