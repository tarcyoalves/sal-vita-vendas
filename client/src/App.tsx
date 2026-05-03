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
import FloatingChat from "./components/FloatingChat";
import AppShell from "./components/AppShell";
import { useAuth } from "./_core/hooks/useAuth";
import { useReminderNotifications } from "./_core/hooks/useReminderNotifications";
import SalVitaLanding from "./pages/SalVitaLanding";

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
      <Route path="/tv" component={TvDashboard} />
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <NotificationManager />
          <Router />
          <FloatingChat />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
