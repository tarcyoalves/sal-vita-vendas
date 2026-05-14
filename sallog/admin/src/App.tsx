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

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'login' });
  const [open, setOpen] = useState(false);

  const { data: me, isLoading } = trpc.auth.me.useQuery();
  const { data: driversList } = trpc.drivers.list.useQuery({}, { enabled: !!me });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => setPage({ name: 'login' }) });

  useEffect(() => {
    if (!isLoading && me && page.name === 'login') setPage({ name: 'dashboard' });
    if (!isLoading && !me && page.name !== 'login') setPage({ name: 'login' });
  }, [me, isLoading]);

  const nav = (p: Page) => { setPage(p); setOpen(false); };
  const pendingCount = driversList?.filter((d) => d.status === 'pending').length ?? 0;

  if (isLoading) return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, background: 'var(--navy)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, margin: '0 auto 14px' }}>🚛</div>
        <div style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>SalLog</div>
        <div style={{ color: 'var(--text-4)', fontSize: 12, marginTop: 4 }}>Carregando...</div>
      </div>
    </div>
  );

  if (!me || page.name === 'login') return <Login onLogin={() => nav({ name: 'dashboard' })} />;

  return (
    <div className="app-layout">
      <div className={`sidebar-overlay ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🚛</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-mark">SalLog</div>
            <div className="sidebar-logo-sub">Gestão Logística</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ n, label, icon }) => (
            <button
              key={n}
              onClick={() => nav({ name: n })}
              className={`sidebar-btn ${page.name === n ? 'active' : ''}`}
            >
              <span className="icon">{icon}</span>
              {label}
              {n === 'drivers' && pendingCount > 0 && (
                <span className="sidebar-badge">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-row">
            <div className="sidebar-avatar">{initials(me.name)}</div>
            <div>
              <div className="sidebar-user">{me.name}</div>
              <div className="sidebar-role">{me.role}</div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={() => logout.mutate()}>
            <span>↪</span> Sair da conta
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar">
          <button className="topbar-hamburger" onClick={() => setOpen(true)} aria-label="Menu">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M1.5 4.5h15M1.5 9h15M1.5 13.5h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          <div className="topbar-title">{TITLES[page.name] ?? 'SalLog'}</div>
          {page.name === 'dashboard' && (
            <button className="btn btn-primary btn-sm" onClick={() => nav({ name: 'freight-new' })}>+ Novo Frete</button>
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

      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {NAV.map(({ n, label, icon }) => (
            <button
              key={n}
              onClick={() => nav({ name: n })}
              className={`bn-btn ${page.name === n ? 'active' : ''}`}
            >
              <span className="bn-icon">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
