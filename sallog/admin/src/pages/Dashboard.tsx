import { trpc } from '../lib/trpc';

type Page = { name: 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail'; id?: number };

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const STATUS_COLOR: Record<string, string> = { available: '#3b82f6', in_progress: '#f59e0b', completed: '#f97316', validated: '#8b5cf6', paid: '#22c55e' };
const STATUS_LABEL: Record<string, string> = { available: 'Disponível', in_progress: 'Em Andamento', completed: 'Concluído', validated: 'Validado', paid: 'Pago' };

export default function Dashboard({ nav }: { nav: (p: Page) => void }) {
  const { data: stats } = trpc.freights.stats.useQuery();
  const { data: freights } = trpc.freights.list.useQuery({ scope: 'all' });
  const { data: drivers } = trpc.drivers.list.useQuery({});

  const pending = drivers?.filter((d) => d.status === 'pending').length ?? 0;
  const recent = freights?.slice(0, 5) ?? [];

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>Visão geral da operação logística</p>
        </div>
        <button onClick={() => nav({ name: 'freight-new' })} style={btnPrimary}>+ Novo Frete</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Em Andamento', value: stats?.in_progress ?? 0, color: '#f59e0b' },
          { label: 'A Validar', value: stats?.completed ?? 0, color: '#f97316' },
          { label: 'A Pagar', value: stats?.validated ?? 0, color: '#8b5cf6' },
          { label: 'Motoristas Pendentes', value: pending, color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} style={card}>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 36, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Fretes Recentes</h3>
            <button onClick={() => nav({ name: 'freights' })} style={btnGhost}>Ver todos</button>
          </div>
          {recent.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', padding: '16px 0' }}>Nenhum frete criado</p> : recent.map((f) => (
            <div key={f.id} onClick={() => nav({ name: 'freight-detail', id: f.id })} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{f.title}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtValue(f.value)}</div>
                <span style={{ fontSize: 11, background: STATUS_COLOR[f.status] + '20', color: STATUS_COLOR[f.status], padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{STATUS_LABEL[f.status]}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={card}>
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700 }}>Ações Rápidas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => nav({ name: 'drivers' })} style={btnOutline}>👤 Motoristas {pending > 0 && <span style={{ background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{pending}</span>}</button>
            <button onClick={() => nav({ name: 'freights' })} style={btnOutline}>🚛 Ver Todos os Fretes</button>
            <button onClick={() => nav({ name: 'freight-new' })} style={btnOutline}>➕ Criar Novo Frete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' };
const btnPrimary: React.CSSProperties = { background: '#0C3680', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: 'none', color: '#0C3680', cursor: 'pointer', fontSize: 13, fontWeight: 500 };
const btnOutline: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', textAlign: 'left', cursor: 'pointer', fontSize: 14, fontWeight: 500 };
