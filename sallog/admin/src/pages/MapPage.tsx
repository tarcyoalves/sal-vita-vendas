import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { trpc } from '../lib/trpc';

const markerIcon = L.icon({ iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', iconAnchor: [12, 41] });

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

type Page = { name: string; id?: number };

export default function MapPage({ nav }: { nav: (p: Page) => void }) {
  const { data: freights = [] } = trpc.freights.list.useQuery({ scope: 'all' }, { refetchInterval: 30000 });
  const activeFreights = freights.filter((f) => f.status === 'in_progress');

  // Get latest locations for all active freights
  const locationQueries = activeFreights.map((f) => trpc.locations.latestByFreight.useQuery({ freightId: f.id }, { refetchInterval: 30000 }));

  const markers = activeFreights
    .map((f, i) => ({ freight: f, loc: locationQueries[i]?.data }))
    .filter((item): item is typeof item & { loc: NonNullable<typeof item.loc> } => !!item.loc);

  return (
    <div style={{ padding: 32, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1e293b' }}>Mapa de Operações</h1>
        <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
          {activeFreights.length} frete(s) em andamento · {markers.length} com localização GPS
        </p>
      </div>

      <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.10)', marginBottom: 24 }}>
        <MapContainer center={[-5.1918, -37.3444]} zoom={6} style={{ height: 500 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>' />
          {markers.map(({ freight, loc }) => (
            <Marker key={freight.id} position={[loc.lat, loc.lng]} icon={markerIcon}>
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong style={{ fontSize: 14 }}>{freight.title}</strong><br />
                  <span style={{ color: '#64748b', fontSize: 12 }}>{freight.originCity} → {freight.destinationCity}</span><br />
                  <strong style={{ color: '#0C3680', fontSize: 15 }}>{fmtValue(freight.value)}</strong><br />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Atualizado: {new Date(loc.recordedAt).toLocaleString('pt-BR')}</span><br />
                  <button onClick={() => nav({ name: 'freight-detail', id: freight.id })} style={{ marginTop: 6, background: '#0C3680', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Ver Detalhes</button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {activeFreights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🗺️</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Nenhum frete em andamento</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, fontSize: 15 }}>Fretes em Andamento</div>
          {activeFreights.map((f) => {
            const hasLoc = markers.some((m) => m.freight.id === f.id);
            return (
              <div key={f.id} onClick={() => nav({ name: 'freight-detail', id: f.id })} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{f.originCity} → {f.destinationCity}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: hasLoc ? '#16a34a' : '#f59e0b', fontWeight: 600 }}>
                    {hasLoc ? '📍 GPS ativo' : '⏳ Sem sinal'}
                  </span>
                  <span style={{ fontWeight: 700 }}>{fmtValue(f.value)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
