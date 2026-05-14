import { useState, useEffect } from 'react';
import { trpc } from './lib/trpc';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Drivers from './pages/Drivers';
import Freights from './pages/Freights';
import FreightNew from './pages/FreightNew';
import FreightDetail from './pages/FreightDetail';
import AiAssistant from './components/AiAssistant';

type Page = { name: 'login' | 'dashboard' | 'drivers' | 'freights' | 'freight-new' | 'freight-detail'; id?: number };

const NAV = [
  { name: 'dashboard' as const, label: 'Dashboard', icon: '📊' },
  { name: 'freights' as const,  label: 'Fretes',    icon: '🚛' },
  { name: 'drivers' as const,   label: 'Motoristas',icon: '👤' },
];

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'login' });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // All hooks BEFORE any conditional returns
  const { data: me, isLoading } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { utils.auth.me.invalidate(); setPage({ name: 'login' }); },
  });

  useEffect(() => {
    if (!isLoading && me && page.name === 'login') setPage({ name: 'dashboard' });
    if (!isLoading && !me && page.name !== 'login') setPage({ name: 'login' });
  }, [me, isLoading]);

  const nav = (p: Page) => { setPage(p); setSidebarOpen(false); };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#F4F6FA' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚛</div>
          <div style={{ color: '#0C3680', fontWeight: 700, fontSize: 16 }}>Carregando FRETEPRIME...</div>
        </div>
      </div>
    );
  }
  if (!me || page.name === 'login') return <Login onLogin={() => nav({ name: 'dashboard' })} />;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F4F6FA', fontFamily: "'Inter', sans-serif" }}>
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 230,
        background: '#fff',
        borderRight: '1px solid #E5E7EB',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 50,
        // Mobile: slide in/out
        position: typeof window !== 'undefined' && window.innerWidth < 768 ? 'fixed' : 'relative',
        top: 0,
        left: 0,
        height: '100%',
        transform: typeof window !== 'undefined' && window.innerWidth < 768
          ? sidebarOpen ? 'translateX(0)' : 'translateX(-100%)'
          : 'none',
        transition: 'transform 0.25s ease',
        boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.12)' : 'none',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #F3F4F6' }}>
          <img
            src="http://salvitarn.com.br/wp-content/uploads/2026/05/freteprime.png"
            alt="FRETEPRIME"
            style={{ height: 36, maxWidth: '100%', objectFit: 'contain' }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
              const fallback = document.createElement('div');
              fallback.innerHTML = '<span style="font-size:20px;font-weight:800;color:#0C3680">🚛 FRETEPRIME</span>';
              (e.target as HTMLImageElement).parentNode?.appendChild(fallback);
            }}
          />
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Gestão Logística</div>
        </div>

        {/* Nav links */}
        <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(({ name, label, icon }) => {
            const active = page.name === name || (page.name === 'freight-detail' && name === 'freights') || (page.name === 'freight-new' && name === 'freights');
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
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <span style={{ fontSize: 16 }}>{icon}</span>
                {label}
                {name === 'drivers' && (
                  <DriversBadge />
                )}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div style={{ padding: '16px 16px', borderTop: '1px solid #F3F4F6' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 2 }}>{me.name}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 12 }}>{me.email}</div>
          <button
            onClick={() => logout.mutate()}
            style={{ width: '100%', background: '#FEF2F2', border: 'none', borderRadius: 8, padding: '8px 0', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Mobile header */}
        <header style={{
          display: window.innerWidth >= 768 ? 'none' : 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          background: '#fff',
          borderBottom: '1px solid #E5E7EB',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#374151', padding: 4 }}
          >
            ☰
          </button>
          <div style={{ fontWeight: 800, color: '#0C3680', fontSize: 16 }}>🚛 FRETEPRIME</div>
          <div style={{ width: 36 }} />
        </header>

        {/* Page */}
        <main style={{ flex: 1, overflow: 'auto', paddingBottom: window.innerWidth < 768 ? 72 : 0 }}>
          {page.name === 'dashboard' && <Dashboard nav={nav} />}
          {page.name === 'drivers' && <Drivers />}
          {page.name === 'freights' && <Freights nav={nav} />}
          {page.name === 'freight-new' && <FreightNew nav={nav} />}
          {page.name === 'freight-detail' && page.id && <FreightDetail id={page.id} nav={nav} />}
        </main>
      </div>

      {/* Bottom nav (mobile) */}
      <nav style={{
        display: window.innerWidth >= 768 ? 'none' : 'flex',
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: '1px solid #E5E7EB',
        zIndex: 30, height: 60,
      }}>
        {NAV.map(({ name, label, icon }) => {
          const active = page.name === name || (page.name === 'freight-detail' && name === 'freights') || (page.name === 'freight-new' && name === 'freights');
          return (
            <button
              key={name}
              onClick={() => nav({ name })}
              style={{
                flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                color: active ? '#1E40AF' : '#9CA3AF',
              }}
            >
              <span style={{ fontSize: 20 }}>{icon}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* AI Assistant */}
      <AiAssistant />
    </div>
  );
}

function DriversBadge() {
  const { data: drivers } = trpc.drivers.list.useQuery({});
  const pending = drivers?.filter((d) => d.status === 'pending').length ?? 0;
  if (!pending) return null;
  return (
    <span style={{
      marginLeft: 'auto', background: '#EF4444', color: '#fff',
      borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700,
    }}>
      {pending}
    </span>
  );
}
