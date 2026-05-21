import { useState, useEffect, lazy, Suspense } from 'react';
import { trpc } from './lib/trpc';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Freights from './pages/Freights';
import FreightNew from './pages/FreightNew';
import AiAssistant from './components/AiAssistant';

const Drivers      = lazy(() => import('./pages/Drivers'));
const FreightDetail = lazy(() => import('./pages/FreightDetail'));
const Financial    = lazy(() => import('./pages/Financial'));
const DriverDashboard    = lazy(() => import('./pages/DriverDashboard'));
const DriverFreights     = lazy(() => import('./pages/DriverFreights'));
const DriverFreightDetail = lazy(() => import('./pages/DriverFreightDetail'));
const DriverRegister     = lazy(() => import('./pages/DriverRegister'));

type PageName =
  | 'login' | 'register'
  | 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail' | 'financial'
  | 'driver-dashboard' | 'driver-freights' | 'driver-freight-detail';

type Page = { name: PageName; id?: number };

const ADMIN_NAV = [
  { name: 'dashboard' as const,  label: 'Dashboard',  icon: '📊' },
  { name: 'freights' as const,   label: 'Fretes',     icon: '🚛' },
  { name: 'drivers' as const,    label: 'Motoristas', icon: '👤' },
  { name: 'financial' as const,  label: 'Financeiro', icon: '💰' },
];

const DRIVER_NAV = [
  { name: 'driver-dashboard' as const, label: 'Início',  icon: '🏠' },
  { name: 'driver-freights' as const,  label: 'Fretes',  icon: '🚛' },
];

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
        <div style={{ color: '#6B7280', fontSize: 14 }}>Carregando...</div>
      </div>
    </div>
  );
}

function DriversBadge() {
  const { data } = trpc.drivers.list.useQuery({});
  const n = data?.filter((d) => d.status === 'pending').length ?? 0;
  if (!n) return null;
  return (
    <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
      {n}
    </span>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'login' });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // ALL hooks before any conditional returns
  const { data: me, isLoading } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); setPage({ name: 'login' }); },
  });

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (me) {
      if (page.name === 'login' || page.name === 'register') {
        setPage({ name: me.role === 'admin' ? 'dashboard' : 'driver-dashboard' });
      }
    } else {
      if (page.name !== 'login' && page.name !== 'register') setPage({ name: 'login' });
    }
  }, [me, isLoading]);

  const nav = (p: Page) => { setPage(p); setSidebarOpen(false); };

  // Loading
  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#F4F6FA' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚛</div>
          <div style={{ color: '#0C3680', fontWeight: 700, fontSize: 16, letterSpacing: '0.02em' }}>FRETEPRIME</div>
          <div style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>Carregando...</div>
        </div>
      </div>
    );
  }

  // Public pages
  if (!me || page.name === 'login') {
    return <Login onLogin={() => {}} onRegister={() => nav({ name: 'register' })} />;
  }
  if (page.name === 'register') {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <DriverRegister onBack={() => nav({ name: 'login' })} onSuccess={() => nav({ name: 'login' })} />
      </Suspense>
    );
  }

  const isAdmin = me.role === 'admin';
  const navItems = isAdmin ? ADMIN_NAV : DRIVER_NAV;

  const activeName = (p: PageName) => {
    if (p === 'drivers' && page.name === 'drivers') return true;
    if (p === 'freights' && (page.name === 'freights' || page.name === 'freight-new' || page.name === 'freight-detail')) return true;
    if (p === 'driver-freights' && (page.name === 'driver-freights' || page.name === 'driver-freight-detail')) return true;
    return page.name === p;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F4F6FA', fontFamily: "'Inter', sans-serif", overflow: 'hidden' }}>

      {/* Sidebar overlay on mobile */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 234,
        background: '#fff',
        borderRight: '1px solid #E5E7EB',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 50,
        position: isMobile ? 'fixed' : 'relative',
        top: 0, left: 0, height: '100%',
        transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: 'transform 0.24s ease',
        boxShadow: isMobile && sidebarOpen ? '4px 0 24px rgba(0,0,0,0.14)' : 'none',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="http://salvitarn.com.br/wp-content/uploads/2026/05/freteprime.png"
            alt="FRETEPRIME"
            style={{ height: 34, objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0C3680', letterSpacing: '-0.3px' }}>FRETEPRIME</div>
            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{isAdmin ? 'Painel Admin' : 'Portal Motorista'}</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {navItems.map(({ name, label, icon }) => {
            const active = activeName(name);
            return (
              <button
                key={name}
                onClick={() => nav({ name })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 10, border: 'none',
                  background: active ? '#EEF2FF' : 'transparent',
                  color: active ? '#1E40AF' : '#6B7280',
                  fontWeight: active ? 600 : 400,
                  cursor: 'pointer', fontSize: 14, textAlign: 'left',
                  transition: 'all 0.12s', minHeight: 44,
                }}
              >
                <span style={{ fontSize: 17 }}>{icon}</span>
                {label}
                {name === 'drivers' && <DriversBadge />}
              </button>
            );
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid #F3F4F6' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 1 }}>{me.name}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>{isAdmin ? 'Administrador' : 'Motorista'}</div>
          <button
            onClick={() => logout.mutate()}
            style={{
              width: '100%', background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 8, padding: '8px 0', color: '#DC2626',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Mobile header */}
        {isMobile && (
          <header style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: '#fff', borderBottom: '1px solid #E5E7EB',
            flexShrink: 0, zIndex: 20,
          }}>
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#374151', padding: 4, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center' }}
            >
              ☰
            </button>
            <div style={{ fontWeight: 800, color: '#0C3680', fontSize: 16, letterSpacing: '-0.3px' }}>🚛 FRETEPRIME</div>
            <div style={{ width: 44 }} />
          </header>
        )}

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', paddingBottom: isMobile ? 68 : 0 }}>
          <Suspense fallback={<LoadingSpinner />}>
            {/* Admin pages */}
            {isAdmin && page.name === 'dashboard'      && <Dashboard nav={nav} />}
            {isAdmin && page.name === 'freights'       && <Freights nav={nav} />}
            {isAdmin && page.name === 'freight-new'    && <FreightNew nav={nav} />}
            {isAdmin && page.name === 'freight-detail' && page.id && <FreightDetail id={page.id} nav={nav} />}
            {isAdmin && page.name === 'drivers'        && <Drivers />}
            {isAdmin && page.name === 'financial'      && <Financial />}

            {/* Driver pages */}
            {!isAdmin && page.name === 'driver-dashboard'     && <DriverDashboard nav={nav} />}
            {!isAdmin && page.name === 'driver-freights'      && <DriverFreights nav={nav} />}
            {!isAdmin && page.name === 'driver-freight-detail' && page.id && <DriverFreightDetail id={page.id} nav={nav} />}
          </Suspense>
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #E5E7EB',
          display: 'flex', zIndex: 30, height: 60,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}>
          {navItems.map(({ name, label, icon }) => {
            const active = activeName(name);
            return (
              <button
                key={name}
                onClick={() => nav({ name })}
                style={{
                  flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  color: active ? '#1E40AF' : '#9CA3AF', minHeight: 44,
                }}
              >
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* AI Assistant — admin only */}
      {isAdmin && <AiAssistant />}
    </div>
  );
}
