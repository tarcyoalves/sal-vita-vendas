import { useState, useEffect } from 'react';
import { trpc } from './lib/trpc';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Drivers from './pages/Drivers';
import Freights from './pages/Freights';
import FreightNew from './pages/FreightNew';
import FreightDetail from './pages/FreightDetail';
import Financial from './pages/Financial';
import MapPage from './pages/MapPage';

type Page = { name: 'login' | 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail' | 'financial' | 'map'; id?: number };

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'login' });
  const { data: me, isLoading } = trpc.auth.me.useQuery();

  useEffect(() => {
    if (!isLoading && me && page.name === 'login') setPage({ name: 'dashboard' });
    if (!isLoading && !me && page.name !== 'login') setPage({ name: 'login' });
  }, [me, isLoading]);

  const nav = (p: Page) => setPage(p);

  if (isLoading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#0C3680', fontWeight: 700, fontSize: 18 }}>Carregando...</div>;
  if (!me || page.name === 'login') return <Login onLogin={() => nav({ name: 'dashboard' })} />;

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#1e293b', color: '#fff', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
        <div style={{ padding: '0 20px 20px', borderBottom: '1px solid #334155' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa' }}>🚛 SalLog</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Gestão Logística</div>
        </div>
        {[
          { label: '📊 Dashboard', p: { name: 'dashboard' as const } },
          { label: '🚛 Fretes', p: { name: 'freights' as const } },
          { label: '👤 Motoristas', p: { name: 'drivers' as const } },
          { label: '🗺️ Mapa', p: { name: 'map' as const } },
          { label: '💰 Financeiro', p: { name: 'financial' as const } },
        ].map(({ label, p }) => (
          <button key={p.name} onClick={() => nav(p)} style={{ background: page.name === p.name ? '#334155' : 'transparent', border: 'none', color: page.name === p.name ? '#fff' : '#94a3b8', padding: '10px 20px', textAlign: 'left', cursor: 'pointer', fontSize: 14, fontWeight: page.name === p.name ? 600 : 400 }}>
            {label}
          </button>
        ))}
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #334155', fontSize: 12, color: '#64748b' }}>
          <div style={{ fontWeight: 600, color: '#94a3b8' }}>{me.name}</div>
          <div>{me.role}</div>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {page.name === 'dashboard' && <Dashboard nav={nav} />}
        {page.name === 'drivers' && <Drivers />}
        {page.name === 'freights' && <Freights nav={nav} />}
        {page.name === 'freight-new' && <FreightNew nav={nav} />}
        {page.name === 'freight-detail' && page.id && <FreightDetail id={page.id} nav={nav} />}
        {page.name === 'map' && <MapPage nav={nav} />}
        {page.name === 'financial' && <Financial nav={nav} />}
      </main>
    </div>
  );
}
