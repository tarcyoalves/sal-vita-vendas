import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import NotFound from './pages/NotFound';
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import AdminDashboard from "./pages/AdminDashboard";
import VendorReminders from "./pages/VendorReminders";
import AiAnalysis from "./pages/AiAnalysis";
import CallHistory from "./pages/CallHistory";
import ClientsManagement from "./pages/ClientsManagement";
import AiChat from "./pages/AiChat";
import AiSettings from "./pages/AiSettings";
import Tasks from "./pages/Tasks";
import Attendants from "./pages/Attendants";
import KnowledgeBase from "./pages/KnowledgeBase";
import AttendantProgress from "./pages/AttendantProgress";
import TvDashboard from "./pages/TvDashboard";
import EmailMarketing from "./pages/EmailMarketing";
import Faturamento from "./pages/Faturamento";
import FloatingChat from "./components/FloatingChat";
import AppShell from "./components/AppShell";
import { useAuth } from "./_core/hooks/useAuth";
import { useReminderNotifications } from "./_core/hooks/useReminderNotifications";
import SalVitaLanding from "./pages/SalVitaLanding";
import SalVitaLandingClassic from "./pages/SalVitaLandingClassic";
import SalVitaAdmin from "./pages/SalVitaAdmin";
import SalVitaRecovery from "./pages/SalVitaRecovery";
import SalVitaChat from "./components/SalVitaChat";
import TrackOrder from "./pages/TrackOrder";
import Atacado from "./pages/Atacado";
import B2bLeads from "./pages/B2bLeads";

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
      <Route path={"/vendor/reminders"}>
        <AppShell><VendorReminders /></AppShell>
      </Route>
      <Route path={"/history"}>
        <AppShell><CallHistory /></AppShell>
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
      <Route path="/atendentes">
        <AppShell><Attendants /></AppShell>
      </Route>
      <Route path="/knowledge-base">
        <AppShell><KnowledgeBase /></AppShell>
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
      <Route path="/admin/b2b-leads">
        <AppShell><B2bLeads /></AppShell>
      </Route>
      {/* TV dashboard desativado para economizar network transfer Neon */}
      {/* <Route path="/tv" component={TvDashboard} /> */}
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

  if (isPremium) {
    if (path === '/sal-vita-admin') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><SalVitaAdmin /></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/sal-vita-recovery') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><SalVitaRecovery /></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/meu-pedido') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><TrackOrder /></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/atacado') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Atacado /></TooltipProvider></ThemeProvider></ErrorBoundary>
      );
    }
    if (path === '/classic') {
      return (
        <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><SalVitaLandingClassic /><SalVitaChat /></TooltipProvider></ThemeProvider></ErrorBoundary>
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
          <Router />
          {!isPublic && <FloatingChat />}
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
