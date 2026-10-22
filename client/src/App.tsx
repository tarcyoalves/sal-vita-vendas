import { ehErroDeChunk, recuperarDeVersaoAntiga } from "./lib/versaoNova";
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import NotFound from './pages/NotFound';
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense } from "react";
import { useAuth } from "./_core/hooks/useAuth";
import { useReminderNotifications } from "./_core/hooks/useReminderNotifications";
// Loja Premium: a home e o chat ficam estáticos (renderizam sem esperar outro chunk).
import SalVitaLanding from "./pages/SalVitaLanding";
import SalVitaChat from "./components/SalVitaChat";
import { isAdminPath } from "./components/premium/admin/adminLogic";

// Code-splitting por produto: o host da loja não baixa o CRM (recharts, E-mail Marketing...).
// Os nomes de arquivo dos chunks são definidos em vite.config.ts (precache do service worker).
// Loja Premium — páginas secundárias
const SalVitaAdmin = lazy(() => import("./pages/SalVitaAdmin"));
const TrackOrder = lazy(() => import("./pages/TrackOrder"));
const Atacado = lazy(() => import("./pages/Atacado"));
const Privacidade = lazy(() => import("./pages/Privacidade"));
const Termos = lazy(() => import("./pages/Termos"));
// CRM
const Home = lazy(() => import("./pages/Home"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AiAnalysis = lazy(() => import("./pages/AiAnalysis"));
const ClientsManagement = lazy(() => import("./pages/ClientsManagement"));
const AiChat = lazy(() => import("./pages/AiChat"));
const AiSettings = lazy(() => import("./pages/AiSettings"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Attendants = lazy(() => import("./pages/Attendants"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const AttendantProgress = lazy(() => import("./pages/AttendantProgress"));
const EmailMarketing = lazy(() => import("./pages/EmailMarketing"));
const Faturamento = lazy(() => import("./pages/Faturamento"));
const AnaliseCredito = lazy(() => import("./pages/AnaliseCredito"));
const Documentos = lazy(() => import("./pages/Documentos"));
const VitaZap = lazy(() => import("./pages/VitaZap"));
const RadarCargas = lazy(() => import("./pages/RadarCargas"));
const FloatingChat = lazy(() => import("./components/FloatingChat"));
const AppShell = lazy(() => import("./components/AppShell"));

// Fallbacks sem salto de layout: fundo da loja (navy) e fundo neutro do CRM.
const StoreFallback = () => <div style={{ minHeight: '100vh', background: '#060f20' }} />;
const CrmFallback = () => <div style={{ minHeight: '100vh', background: '#f8fafc' }} />;

// Deploy novo apaga os chunks antigos: se o import() falhar, recarrega. Guarda o horário do último
// reload (não uma flag eterna) para permitir outro depois de 60 s, sem entrar em loop de reload.
if (typeof window !== 'undefined') {
  const recuperar = () => { void recuperarDeVersaoAntiga(); };
  window.addEventListener('vite:preloadError', recuperar);
  // import() de página que não passa pelo helper de preload do Vite rejeita sem disparar o evento acima.
  window.addEventListener('unhandledrejection', (e) => { if (ehErroDeChunk(e.reason)) recuperar(); });
}

function Router() {
  return (
    <Switch>
      <Route path={"/sal-vita"} component={SalVitaLanding} />
      <Route path={"/"} component={Home} />
      <Route path={"/admin/dashboard"}>
        <AppShell><AdminDashboard /></AppShell>
      </Route>
      <Route path={"/admin/ai-analysis"}>
        <AppShell><AiAnalysis /></AppShell>
      </Route>
      <Route path={"/admin/clients"}>
        <AppShell><ClientsManagement /></AppShell>
      </Route>
      <Route path="/tasks">
        <AppShell><Tasks /></AppShell>
      </Route>
      <Route path="/attendants">
        <AppShell><Attendants /></AppShell>
      </Route>
      <Route path="/radar-cargas">
        <AppShell><RadarCargas /></AppShell>
      </Route>
      <Route path="/atendentes">
        <AppShell><Attendants /></AppShell>
      </Route>
      <Route path="/knowledge-base">
        <AppShell><KnowledgeBase /></AppShell>
      </Route>
      <Route path="/documentos">
        <AppShell><Documentos /></AppShell>
      </Route>
      <Route path="/vita-zap">
        <AppShell><VitaZap /></AppShell>
      </Route>
      <Route path="/representatives">
        <AppShell><Attendants /></AppShell>
      </Route>
      <Route path={"/ai-chat"}>
        <AppShell><AiChat /></AppShell>
      </Route>
      <Route path={"/ai-settings"}>
        <AppShell><AiSettings /></AppShell>
      </Route>
      <Route path="/meu-progresso">
        <AppShell><AttendantProgress /></AppShell>
      </Route>
      <Route path="/admin/email-marketing">
        <AppShell><EmailMarketing /></AppShell>
      </Route>
      <Route path="/admin/faturamento">
        <AppShell><Faturamento /></AppShell>
      </Route>
      <Route path="/admin/analise-credito">
        <AppShell><AnaliseCredito /></AppShell>
      </Route>
      {/* TV dashboard desativado para economizar network transfer Neon (TvDashboard.tsx não é importado) */}
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function NotificationManager() {
  const { isAuthenticated, user } = useAuth();
  useReminderNotifications(isAuthenticated, user?.name ?? '', user?.role === 'admin');
  return null;
}

const PUBLIC_PATHS = ['/sal-vita'];
const PREMIUM_HOSTS = ['www.premium.salvitarn.com.br', 'premium.salvitarn.com.br'];

function App() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const isPremium = PREMIUM_HOSTS.includes(host);
  const isPublic = isPremium || PUBLIC_PATHS.some(p => path.startsWith(p));

  // Design system do CRM (docs/DESIGN-SYSTEM.md) só no CRM: a loja Premium e as
  // páginas públicas continuam com o visual original. Vai no <html> para valer
  // também em diálogos e menus, que o Radix renderiza fora da árvore do app.
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("crm-theme", !isPublic);
  }

  if (isPremium) {
    // Painel administrativo unificado: um único componente (com login e
    // navegação internas) atende às URLs do admin (ADMIN_PATHS) — a URL só
    // escolhe a seção inicial (Pedidos / Recuperação / Leads B2B / E-mail).
    if (isAdminPath(path)) {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Suspense fallback={<StoreFallback />}><SalVitaAdmin /></Suspense></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/meu-pedido') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Suspense fallback={<StoreFallback />}><TrackOrder /></Suspense></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/atacado') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Suspense fallback={<StoreFallback />}><Atacado /></Suspense></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/privacidade') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Suspense fallback={<StoreFallback />}><Privacidade /></Suspense></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/termos') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Suspense fallback={<StoreFallback />}><Termos /></Suspense></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><SalVitaLanding /><SalVitaChat /></TooltipProvider></ThemeProvider></ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          {!isPublic && <NotificationManager />}
          <Suspense fallback={<CrmFallback />}>
            <Router />
          </Suspense>
          {!isPublic && <Suspense fallback={null}><FloatingChat /></Suspense>}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
