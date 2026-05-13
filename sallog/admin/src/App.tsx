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
import './index.css';

type Page = { name: 'login' | 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail' | 'financial' | 'map'; id?: number };

const NAV = [
  { n: 'dashboard' as const, label: 'Dashboard', icon: '📊' },
  { n: 'freights' as const, label: 'Fretes', icon: '🚛' },
  { n: 'drivers' as const, label: 'Motoristas', icon: '👤' },
  { n: 'map' as const, label: 'Mapa', icon: '🗺️' },
  { n: 'financial' as const, label: 'Financeiro', icon: '💰' },
];

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  freights: 'Fretes',
  drivers: 'Motoristas',
  'freight-new': 'Novo Frete',
  'freight-detail': 'Detalhes do Frete',
  financial: 'Financeiro',
  map: 'Mapa de Operações',
};

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'login' });
  const [open, setOpen] = useState(false);

  // All hooks must be called unconditionally before any early return
  const { data: me, isLoading } = trpc.auth.me.useQuery();
  const { data: pendingDrivers } = trpc.drivers.list.useQuery({}, { enabled: !!me });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setPage({ name: 'login' }) });

  useEffect(() => {
    if (!isLoading && me && page.name === 'login') setPage({ name: 'dashboard' });
    if (!isLoading && !me && page.name !== 'login') setPage({ name: 'login' });
  }, [me, isLoading]);

  const nav = (p: Page) => { setPage(p); setOpen(false); };
  const pendingCount = pendingDrivers?.filter((d) => d.status === 'pending').length ?? 0;

  if (isLoading) return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: 'var(--navy)', marginBottom: 8 }}>🚛 SalLog</div>
        <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Carregando...</div>
      </div>
    </div>
  );

  if (!me || page.name === 'login') return <Login onLogin={() => nav({ name: 'dashboard' })} />;

  return (
    <div className="app-layout">
      {/* Mobile overlay */}
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">🚛 SalLog</div>
          <div className="sidebar-logo-sub">Gestão Logística</div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ n, label, icon }) => (
            <button key={n} onClick={() => nav({ name: n })} className={`sidebar-btn ${page.name === n ? 'active' : ''}`}>
              <span className="icon">{icon}</span>
              {label}
              {n === 'drivers' && pendingCount > 0 && <span className="sidebar-badge">{pendingCount}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">{me.name}</div>
          <div className="sidebar-role">{me.role}</div>
          <button className="sidebar-logout" onClick={() => logout.mutate()}>Sair da conta</button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="topbar">
          <button className="topbar-hamburger" onClick={() => setOpen(true)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M2 5h16M2 10h16M2 15h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="topbar-title">{TITLES[page.name] ?? 'SalLog'}</div>
          {page.name === 'dashboard' && (
            <button className="btn btn-primary btn-sm" onClick={() => nav({ name: 'freight-new' })}>+ Frete</button>
          )}
        </header>

        <main className="page-content fade-in" key={page.name}>
          {page.name === 'dashboard' && <Dashboard nav={nav} />}
          {page.name === 'drivers' && <Drivers />}
          {page.name === 'freights' && <Freights nav={nav} />}
          {page.name === 'freight-new' && <FreightNew nav={nav} />}
          {page.name === 'freight-detail' && page.id && <FreightDetail id={page.id} nav={nav} />}
          {page.name === 'financial' && <Financial nav={nav} />}
          {page.name === 'map' && <MapPage nav={nav} />}
        </main>
      </div>

      {/* Bottom Nav (mobile only) */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {NAV.map(({ n, label, icon }) => (
            <button key={n} onClick={() => nav({ name: n })} className={`bn-btn ${page.name === n ? 'active' : ''}`}>
              <span className="bn-icon">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
