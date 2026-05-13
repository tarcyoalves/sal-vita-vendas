import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

export default function MapPage({ nav }: { nav: (p: Page) => void }) {
  const { data: freights = [] } = trpc.freights.list.useQuery({ scope: 'all' });
  const activeFreights = freights.filter(f => f.status === 'in_progress');

  return (
    <div>
      {/* Header */}
      <div className="page-hdr">
        <div>
          <h1 className="page-ttl">Mapa de Operações</h1>
          <p className="page-sub">{activeFreights.length} frete{activeFreights.length !== 1 ? 's' : ''} em trânsito</p>
        </div>
      </div>

      {/* Map placeholder */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{
          height: 340,
          borderRadius: 10,
          background: 'linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-3)',
          border: '1px dashed var(--border)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
          <div style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 18, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>
            Mapa em tempo real
          </div>
          <div style={{ fontSize: 13, maxWidth: 280, textAlign: 'center', lineHeight: 1.5 }}>
            Integração com rastreamento GPS dos motoristas em andamento
          </div>
        </div>
      </div>

      {/* Active freights list */}
      {activeFreights.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🚛</div>
            <div className="empty-text">Nenhum frete em andamento no momento</div>
          </div>
        </div>
      ) : (
        <div>
          <div className="section-lbl" style={{ marginBottom: 12 }}>Fretes em Andamento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeFreights.map(f => (
              <div
                key={f.id}
                className="card"
                onClick={() => nav({ name: 'freight-detail', id: f.id })}
                style={{ cursor: 'pointer', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(245,158,11,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>🚛</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}
                    {f.distance ? ` · ${f.distance}km` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                    {(f.value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span className="badge" style={{ background: '#f59e0b20', color: '#f59e0b', fontSize: 10 }}>Em Andamento</span>
                  </div>
                </div>
                <span style={{ color: 'var(--sky)', fontSize: 18 }}>›</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
