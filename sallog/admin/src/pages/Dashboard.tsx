import { trpc } from '../lib/trpc';

type Page = { name: 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail' | 'financial' | 'map'; id?: number };

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const STATUS_COLOR: Record<string, string> = { available: '#3b82f6', in_progress: '#f59e0b', completed: '#f97316', validated: '#8b5cf6', paid: '#22c55e' };
const STATUS_LABEL: Record<string, string> = { available: 'Disponível', in_progress: 'Em Andamento', completed: 'Concluído', validated: 'Validado', paid: 'Pago' };

const STATS = [
  { key: 'in_progress', label: 'Em Andamento', color: '#f59e0b' },
  { key: 'completed',   label: 'A Validar',    color: '#f97316' },
  { key: 'validated',   label: 'A Pagar',       color: '#8b5cf6' },
];

export default function Dashboard({ nav }: { nav: (p: Page) => void }) {
  const { data: stats } = trpc.freights.stats.useQuery();
  const { data: freights } = trpc.freights.list.useQuery({ scope: 'all' });
  const { data: drivers } = trpc.drivers.list.useQuery({});

  const pending = drivers?.filter(d => d.status === 'pending').length ?? 0;
  const recent = freights?.slice(0, 5) ?? [];

  const statCards = [
    ...STATS.map(s => ({ label: s.label, value: (stats as any)?.[s.key] ?? 0, color: s.color })),
    { label: 'Motoristas Pendentes', value: pending, color: '#ef4444' },
  ];

  return (
    <div>
      {/* Stats */}
      <div className="g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color }}>{value}</div>
            <div className="stat-bar" style={{ background: color }} />
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="g2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Recent freights */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Fretes Recentes</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => nav({ name: 'freights' })}>Ver todos</button>
          </div>
          {recent.length === 0 ? (
            <div className="empty"><div className="empty-text">Nenhum frete criado</div></div>
          ) : recent.map(f => (
            <div key={f.id} onClick={() => nav({ name: 'freight-detail', id: f.id })}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{fmtValue(f.value)}</div>
                <span className="badge" style={{ background: STATUS_COLOR[f.status] + '20', color: STATUS_COLOR[f.status] }}>
                  {STATUS_LABEL[f.status]}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="card">
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>Ações Rápidas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-outline" style={{ justifyContent: 'flex-start' }} onClick={() => nav({ name: 'drivers' })}>
              👤 Motoristas {pending > 0 && <span className="sidebar-badge" style={{ marginLeft: 4 }}>{pending}</span>}
            </button>
            <button className="btn btn-outline" style={{ justifyContent: 'flex-start' }} onClick={() => nav({ name: 'freights' })}>
              🚛 Ver Todos os Fretes
            </button>
            <button className="btn btn-outline" style={{ justifyContent: 'flex-start' }} onClick={() => nav({ name: 'freight-new' })}>
              ➕ Criar Novo Frete
            </button>
            <button className="btn btn-outline" style={{ justifyContent: 'flex-start' }} onClick={() => nav({ name: 'financial' })}>
              💰 Painel Financeiro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
