import { trpc } from '../lib/trpc';

type Page = { name: 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail' | 'financial' | 'map'; id?: number };

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  available:   { bg: '#EFF6FF', color: '#2563EB', label: 'Disponível' },
  in_progress: { bg: '#FFFBEB', color: '#D97706', label: 'Em Andamento' },
  completed:   { bg: '#FFF7ED', color: '#EA580C', label: 'Concluído' },
  validated:   { bg: '#F5F3FF', color: '#7C3AED', label: 'Validado' },
  paid:        { bg: '#F0FDF4', color: '#16A34A', label: 'Pago' },
};

export default function Dashboard({ nav }: { nav: (p: Page) => void }) {
  const { data: stats } = trpc.freights.stats.useQuery();
  const { data: freights } = trpc.freights.list.useQuery({ scope: 'all' });
  const { data: drivers } = trpc.drivers.list.useQuery({});

  const pending = drivers?.filter((d) => d.status === 'pending').length ?? 0;
  const recent = freights?.slice(0, 5) ?? [];

  const statCards = [
    { label: 'Em Andamento', value: stats?.in_progress ?? 0, color: '#D97706' },
    { label: 'A Validar',    value: stats?.completed ?? 0,   color: '#EA580C' },
    { label: 'A Pagar',      value: stats?.validated ?? 0,   color: '#7C3AED' },
    { label: 'Moto. Pendentes', value: pending,              color: '#EF4444' },
  ];

  return (
    <div>
      {/* Stats */}
      <div className="g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="stat-card" style={{ color }}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div className="g2" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Recent freights */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 15, fontWeight: 700 }}>Fretes Recentes</span>
            <button className="btn btn-ghost btn-sm" onClick={() => nav({ name: 'freights' })}>Ver todos →</button>
          </div>
          {recent.length === 0 ? (
            <div className="empty"><div className="empty-icon">🚛</div><div className="empty-text">Nenhum frete criado ainda</div></div>
          ) : (
            recent.map((f) => {
              const s = STATUS_COLORS[f.status] ?? STATUS_COLORS.available;
              return (
                <div
                  key={f.id}
                  onClick={() => nav({ name: 'freight-detail', id: f.id })}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFF')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{f.title}</div>
                    <div className="route">
                      <span className="route-city">{f.originCity}</span>
                      <span className="route-state">{f.originState}</span>
                      <span className="route-arrow">→</span>
                      <span className="route-city">{f.destinationCity}</span>
                      <span className="route-state">{f.destinationState}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{fmtBRL(f.value)}</div>
                    <span className="badge" style={{ background: s.bg, color: s.color, marginTop: 4 }}>{s.label}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Ações Rápidas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => nav({ name: 'freight-new' })} className="btn btn-primary" style={{ width: '100%', justifyContent: 'flex-start' }}>🚛 Criar Novo Frete</button>
              <button onClick={() => nav({ name: 'drivers' })} className="btn btn-outline" style={{ width: '100%', justifyContent: 'flex-start' }}>
                👤 Motoristas {pending > 0 && <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', borderRadius: 10, padding: '0 7px', fontSize: 11, fontWeight: 700 }}>{pending}</span>}
              </button>
              <button onClick={() => nav({ name: 'financial' })} className="btn btn-outline" style={{ width: '100%', justifyContent: 'flex-start' }}>💰 Financeiro</button>
              <button onClick={() => nav({ name: 'map' })} className="btn btn-outline" style={{ width: '100%', justifyContent: 'flex-start' }}>🗺️ Mapa de Operações</button>
            </div>
          </div>

          {pending > 0 && (
            <div className="alert alert-warning" style={{ cursor: 'pointer' }} onClick={() => nav({ name: 'drivers' })}>
              ⚠️ {pending} motorista{pending > 1 ? 's' : ''} aguardando aprovação
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
