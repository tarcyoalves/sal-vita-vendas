import { trpc } from '../lib/trpc';

type Page = { name: 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail' | 'financial' | 'map'; id?: number };

function fmtBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  available:   { bg: 'var(--blue-dim)',   color: 'var(--blue)',   label: 'Disponível' },
  in_progress: { bg: 'var(--amber-dim)',  color: 'var(--amber)',  label: 'Em Andamento' },
  completed:   { bg: 'var(--orange-dim)', color: 'var(--orange)', label: 'Concluído' },
  validated:   { bg: 'var(--violet-dim)', color: 'var(--violet)', label: 'Validado' },
  paid:        { bg: 'var(--green-dim)',  color: 'var(--green)',  label: 'Pago' },
};

const STAT_CARDS = [
  { key: 'in_progress', label: 'Em Andamento', color: 'var(--amber)' },
  { key: 'completed',   label: 'A Validar',    color: 'var(--orange)' },
  { key: 'validated',   label: 'A Pagar',      color: 'var(--violet)' },
  { key: 'pending_drivers', label: 'Moto. Pendentes', color: 'var(--red)' },
];

export default function Dashboard({ nav }: { nav: (p: Page) => void }) {
  const { data: stats   } = trpc.freights.stats.useQuery();
  const { data: freights } = trpc.freights.list.useQuery({ scope: 'all' });
  const { data: drivers  } = trpc.drivers.list.useQuery({});

  const pending = drivers?.filter(d => d.status === 'pending').length ?? 0;
  const recent  = freights?.slice(0, 6) ?? [];

  const values: Record<string, number> = {
    in_progress:     stats?.in_progress ?? 0,
    completed:       stats?.completed ?? 0,
    validated:       stats?.validated ?? 0,
    pending_drivers: pending,
  };

  return (
    <div>
      {/* Stat cards */}
      <div className="g4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {STAT_CARDS.map(({ key, label, color }) => (
          <div key={key} className="stat-card" style={{ color }}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{values[key]}</div>
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="g2" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

        {/* Recent freights */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontFamily:"'Barlow Semi Condensed',sans-serif", fontSize:15, fontWeight:700, letterSpacing:0.3 }}>Fretes Recentes</span>
            <button className="btn btn-ghost btn-sm" onClick={() => nav({ name: 'freights' })}>Ver todos →</button>
          </div>

          {recent.length === 0 ? (
            <div className="empty"><div className="empty-icon">🚛</div><div className="empty-text">Nenhum frete criado ainda</div></div>
          ) : recent.map((f) => {
            const s = STATUS_STYLE[f.status] ?? STATUS_STYLE.available;
            return (
              <div
                key={f.id}
                onClick={() => nav({ name: 'freight-detail', id: f.id })}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  cursor: 'pointer', transition: 'background 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div>
                  <div style={{ fontWeight:600, fontSize:13.5, marginBottom:3 }}>{f.title}</div>
                  <div className="route">
                    <span className="route-city">{f.originCity}</span>
                    <span className="route-state">{f.originState}</span>
                    <span className="route-arrow">→</span>
                    <span className="route-city">{f.destinationCity}</span>
                    <span className="route-state">{f.destinationState}</span>
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0, marginLeft:12 }}>
                  <div style={{ fontFamily:"'Barlow Semi Condensed',sans-serif", fontSize:16, fontWeight:700, color:'var(--amber)' }}>
                    {fmtBRL(f.value)}
                  </div>
                  <span className="badge" style={{ background:s.bg, color:s.color, marginTop:4 }}>{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick actions */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card">
            <div style={{ fontFamily:"'Barlow Semi Condensed',sans-serif", fontSize:14, fontWeight:700, letterSpacing:0.5, color:'var(--text-3)', textTransform:'uppercase', marginBottom:14 }}>
              Ações Rápidas
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={() => nav({ name:'freight-new' })} className="btn btn-primary" style={{ width:'100%', justifyContent:'flex-start' }}>
                🚛 Criar Novo Frete
              </button>
              <button onClick={() => nav({ name:'drivers' })} className="btn btn-outline" style={{ width:'100%', justifyContent:'flex-start' }}>
                👤 Motoristas
                {pending > 0 && <span style={{ marginLeft:'auto', background:'var(--red)', color:'#fff', borderRadius:10, padding:'0 7px', fontSize:10, fontWeight:700 }}>{pending}</span>}
              </button>
              <button onClick={() => nav({ name:'financial' })} className="btn btn-outline" style={{ width:'100%', justifyContent:'flex-start' }}>💰 Financeiro</button>
              <button onClick={() => nav({ name:'map' })} className="btn btn-outline" style={{ width:'100%', justifyContent:'flex-start' }}>🗺️ Mapa</button>
            </div>
          </div>

          {pending > 0 && (
            <div className="alert alert-warning" style={{ cursor:'pointer', marginBottom:0 }} onClick={() => nav({ name:'drivers' })}>
              ⚠️ {pending} motorista{pending > 1 ? 's' : ''} aguardando aprovação
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
