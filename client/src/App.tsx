import { Toaster } from './components/ui/sonner";
import { TooltipProvider } from './components/ui/tooltip";
import NotFound from './pages/NotFound";
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

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/admin/dashboard"} component={AdminDashboard} />
      <Route path={"/admin/ai-analysis"} component={AiAnalysis} />
      <Route path={"/vendor/reminders"} component={VendorReminders} />
      <Route path={"/history"} component={CallHistory} />
      <Route path={"/admin/clients"} component={ClientsManagement} />
       <Route path="/tasks" component={Tasks} />
      <Route path="/attendants" component={Attendants} />
      <Route path="/atendentes" component={Attendants} />
      <Route path="/knowledge-base" component={KnowledgeBase} />
      <Route path="/representatives" component={Attendants} />
      <Route path={"/ai-chat"} component={AiChat} />
      <Route path={"/ai-settings"} component={AiSettings} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
