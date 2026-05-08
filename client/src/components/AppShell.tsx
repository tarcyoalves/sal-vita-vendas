import { useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Bot,
  MessageSquare,
  Settings,
  BookOpen,
  LogOut,
  Menu,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  KeyRound,
  Tv,
} from "lucide-react";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import ActiveTimer from "./ActiveTimer";
import { toast } from "sonner";

interface NavItem {
  label: string;
  path?: string;
  icon: React.ReactNode;
  roles: ("admin" | "user")[];
  children?: { label: string; path: string; icon: React.ReactNode; external?: boolean }[];
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: <LayoutDashboard size={18} />,
    roles: ["admin"],
  },
  {
    label: "Tarefas",
    path: "/tasks",
    icon: <CheckSquare size={18} />,
    roles: ["admin"],
  },
  {
    label: "Atendentes",
    path: "/attendants",
    icon: <Users size={18} />,
    roles: ["admin"],
  },
  {
    label: "Inteligência IA",
    icon: <Bot size={18} />,
    roles: ["admin"],
    children: [
      { label: "Chat IA", path: "/ai-chat", icon: <MessageSquare size={16} /> },
      { label: "Configurações", path: "/ai-settings", icon: <Settings size={16} /> },
      { label: "Base de Conhecimento", path: "/knowledge-base", icon: <BookOpen size={16} /> },
      { label: "Painel TV", path: "/tv", icon: <Tv size={16} />, external: true },
    ],
  },
  {
    label: "Minhas Tarefas",
    path: "/tasks",
    icon: <CheckSquare size={18} />,
    roles: ["user"],
  },
  {
    label: "Meu Progresso",
    path: "/meu-progresso",
    icon: <TrendingUp size={18} />,
    roles: ["user"],
  },
  {
    label: "Chat IA",
    path: "/ai-chat",
    icon: <MessageSquare size={18} />,
    roles: ["user"],
  },
];

// Flat items for the mobile bottom nav — último slot é sempre "Mais" (abre sidebar)
const BOTTOM_NAV_ADMIN = [
  { label: "Dashboard",  path: "/admin/dashboard", icon: <LayoutDashboard size={22} /> },
  { label: "Tarefas",    path: "/tasks",            icon: <CheckSquare size={22} /> },
  { label: "Atendentes", path: "/attendants",       icon: <Users size={22} /> },
  { label: "Chat IA",    path: "/ai-chat",          icon: <MessageSquare size={22} /> },
];

const BOTTOM_NAV_USER = [
  { label: "Tarefas",   path: "/tasks",         icon: <CheckSquare size={22} /> },
  { label: "Progresso", path: "/meu-progresso", icon: <TrendingUp size={22} /> },
  { label: "Chat IA",   path: "/ai-chat",       icon: <MessageSquare size={22} /> },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/tasks": "Tarefas",
  "/attendants": "Atendentes",
  "/ai-chat": "Chat IA",
  "/ai-settings": "Configurações IA",
  "/knowledge-base": "Base de Conhecimento",
  "/history": "Histórico",
  "/meu-progresso": "Meu Progresso",
};

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { user, refresh: refreshUser } = useAuth();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [iaExpanded, setIaExpanded] = useState(
    ["/ai-chat", "/ai-settings", "/knowledge-base"].includes(location)
  );
  const logoutMutation = trpc.auth.logout.useMutation();

  const role = (user?.role ?? "user") as "admin" | "user";
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const bottomNavItems = role === "admin" ? BOTTOM_NAV_ADMIN : BOTTOM_NAV_USER;

  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [pwdLoading, setPwdLoading] = useState(false);
  const changePasswordMutation = trpc.auth.changePassword.useMutation();

  // Startup blocking modal (role=user only)
  const { data: currentSession, isLoading: sessionLoading, refetch: refetchSession } =
    trpc.workSessions.current.useQuery(undefined, { enabled: !!user && role === "user" });
  const { data: sellerProfile } = trpc.sellers.myProfile.useQuery(undefined, {
    enabled: !!user && role === "user",
  });
  const startWorkMut = trpc.workSessions.start.useMutation();
  const [startingWork, setStartingWork] = useState(false);

  const goalHours = sellerProfile?.workHoursGoal ?? 8;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // sessionStorage clears on tab close → forces modal on every new tab/browser open
  const isSessionAcked = (sessionId?: number) => {
    try { return sessionId != null && sessionStorage.getItem('wsAck') === String(sessionId); }
    catch { return false; }
  };
  const ackSession = (sessionId: number) => {
    try { sessionStorage.setItem('wsAck', String(sessionId)); } catch {}
  };

  const todayStr = new Date().toDateString();
  const hasLiveSession = !!currentSession && (currentSession.status === 'active' || currentSession.status === 'paused');
  const sessionIsToday = hasLiveSession && new Date(currentSession!.startedAt).toDateString() === todayStr;
  const sessionIsStale = hasLiveSession && !sessionIsToday;
  // Show retomar when session is from today but tab was closed (ack not in sessionStorage)
  const showRetomar = sessionIsToday && !isSessionAcked(currentSession?.id);
  const needsStartup =
    !!user && role === "user" && !sessionLoading && (
      !currentSession || currentSession.status === "ended" || sessionIsStale || showRetomar
    );

  const handleStartWork = async () => {
    setStartingWork(true);
    try {
      const session = await startWorkMut.mutateAsync({ dailyGoalHours: goalHours });
      ackSession(session.id);
      await refetchSession();
      toast.success("▶ Trabalho iniciado!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao iniciar trabalho");
    } finally {
      setStartingWork(false);
    }
  };

  const handleRetomar = () => {
    if (currentSession) ackSession(currentSession.id);
    toast.success("▶ Bem-vindo de volta!");
  };

  // Force password change on first access
  const forceChangePwdMut = trpc.auth.forceChangePassword.useMutation();
  const [forcePwdForm, setForcePwdForm] = useState({ next: "", confirm: "" });
  const [forcePwdLoading, setForcePwdLoading] = useState(false);

  const handleForceChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forcePwdForm.next !== forcePwdForm.confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setForcePwdLoading(true);
    try {
      await forceChangePwdMut.mutateAsync({ newPassword: forcePwdForm.next });
      await refreshUser();
      toast.success("✅ Senha definida! Bem-vindo ao sistema.");
      setForcePwdForm({ next: "", confirm: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao definir senha");
    } finally {
      setForcePwdLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.next !== pwdForm.confirm) {
      toast.error("As novas senhas não coincidem");
      return;
    }
    setPwdLoading(true);
    try {
      await changePasswordMutation.mutateAsync({ currentPassword: pwdForm.current, newPassword: pwdForm.next });
      toast.success("Senha alterada com sucesso!");
      setShowChangePwd(false);
      setPwdForm({ current: "", next: "", confirm: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao alterar senha");
    } finally {
      setPwdLoading(false);
    }
  };

  const isActive = (path?: string) => path === location;
  const isChildActive = (children?: { path: string }[]) =>
    children?.some((c) => c.path === location) ?? false;

  const pageTitle = PAGE_TITLES[location] ?? "Sal Vita";
  const userInitial = user?.name?.charAt(0).toUpperCase() ?? "U";

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-[72px] flex items-center px-5 border-b border-slate-700 flex-shrink-0">
        <img
          src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
          alt="Sal Vita"
          style={{ height: "42px" }}
          className="cursor-pointer rounded-lg object-contain"
          onClick={() => setLocation(role === "admin" ? "/admin/dashboard" : "/tasks")}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-3">
          {visibleItems.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const active = isActive(item.path);
            const childActive = isChildActive(item.children);

            if (hasChildren) {
              return (
                <li key={item.label}>
                  <button
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      childActive
                        ? "bg-slate-700 text-white border-l-2 border-blue-400"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                    onClick={() => setIaExpanded(!iaExpanded)}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {iaExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {iaExpanded && (
                    <ul className="mt-0.5 ml-4 space-y-0.5 pl-3 border-l border-slate-700">
                      {item.children!.map((child) => (
                        <li key={child.path}>
                          <button
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                              isActive(child.path)
                                ? "bg-slate-700 text-white border-l-2 border-blue-400"
                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                            }`}
                            onClick={() => {
                              if (child.external) {
                                window.open(child.path, '_blank');
                              } else {
                                setLocation(child.path);
                                setSidebarOpen(false);
                              }
                            }}
                          >
                            <span className="flex-shrink-0">{child.icon}</span>
                            <span className="flex-1 text-left">{child.label}</span>
                            {child.external && <span className="text-[10px] text-slate-500">↗</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            }

            return (
              <li key={item.label}>
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-700 text-white border-l-2 border-blue-400"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                  onClick={() => {
                    setLocation(item.path!);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {userInitial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name ?? "Usuário"}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email ?? ""}</p>
          </div>
        </div>
        <button
          onClick={() => setShowChangePwd(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors mb-1"
        >
          <KeyRound size={15} />
          <span>Alterar Senha</span>
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <LogOut size={15} />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-slate-900 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay (kept as fallback, no longer triggered by topbar) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative z-50 flex flex-col w-60 bg-slate-900">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white border-b flex items-center px-4 gap-4 flex-shrink-0" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: "calc(56px + env(safe-area-inset-top))" }}>
          {/* Mobile: show logo instead of hamburger */}
          <button
            className="md:hidden"
            onClick={() => setLocation(role === "admin" ? "/admin/dashboard" : "/tasks")}
          >
            <img
              src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
              alt="Sal Vita"
              style={{ height: "32px" }}
              className="object-contain"
            />
          </button>
          <h1 className="text-base font-semibold text-gray-800 truncate flex-1">{pageTitle}</h1>
          {/* Mobile: logout button in topbar */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            onClick={handleLogout}
            aria-label="Sair"
          >
            <LogOut size={18} />
          </button>
        </header>

        {/* Page content — bottom padding on mobile to avoid bottom nav overlap */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-around px-2 pt-2 pb-1">
          {/* Nav items */}
          {bottomNavItems.map((item) => {
            const active = location === item.path;
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className="flex flex-col items-center gap-0.5 flex-1 py-1 transition-all"
              >
                <span
                  className={`flex items-center justify-center w-12 h-10 rounded-2xl transition-all ${
                    active ? "bg-blue-600 text-white shadow-md" : "text-gray-400"
                  }`}
                >
                  {item.icon}
                </span>
                <span className={`text-[10px] font-medium leading-tight ${active ? "text-blue-600" : "text-gray-400"}`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* "Mais" — abre o sidebar completo com todos os sub-menus */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center gap-0.5 flex-1 py-1 transition-all"
          >
            <span
              className={`flex items-center justify-center w-12 h-10 rounded-2xl transition-all ${
                sidebarOpen ? "bg-blue-600 text-white shadow-md" : "text-gray-400"
              }`}
            >
              <Menu size={22} />
            </span>
            <span className={`text-[10px] font-medium leading-tight ${sidebarOpen ? "text-blue-600" : "text-gray-400"}`}>
              Mais
            </span>
          </button>
        </div>
      </nav>

      {/* Work session timer — only for attendants, above bottom nav on mobile */}
      {role === "user" && <ActiveTimer />}

      {/* ── Force password change modal (first access) — blocks everything ── */}
      {!!user && user.mustChangePassword && (
        <div className="fixed inset-0 z-[300] bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
            <img
              src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
              alt="Sal Vita"
              className="mx-auto mb-5 object-contain"
              style={{ height: "56px" }}
            />
            <h2 className="text-xl font-bold text-gray-800 mb-1 text-center">
              Bem-vindo, {user?.name?.split(" ")[0]}!
            </h2>
            <p className="text-gray-500 text-sm mb-6 text-center">
              Este é seu primeiro acesso. Defina uma senha pessoal para continuar.
            </p>
            <form onSubmit={handleForceChangePwd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={forcePwdForm.next}
                  onChange={e => setForcePwdForm(f => ({ ...f, next: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar senha</label>
                <input
                  type="password"
                  value={forcePwdForm.confirm}
                  onChange={e => setForcePwdForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="Repita a senha"
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={forcePwdLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {forcePwdLoading ? (
                  <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Salvando...</>
                ) : "🔑 Definir Minha Senha"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Startup blocking modal (attendants) ── */}
      {needsStartup && !user?.mustChangePassword && (
        <div className="fixed inset-0 z-[200] bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
            <img
              src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
              alt="Sal Vita"
              className="mx-auto mb-5 object-contain"
              style={{ height: "72px" }}
            />
            {showRetomar ? (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-1">
                  Bem-vindo de volta, {user?.name?.split(" ")[0]}!
                </h2>
                <p className="text-gray-500 text-sm mb-8">
                  Você tem trabalho em andamento hoje. Deseja retomar?
                </p>
                <button
                  onClick={handleRetomar}
                  className="w-full py-4 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-xl transition shadow-lg flex items-center justify-center gap-2 mb-3"
                >
                  ▶ Retomar Trabalho
                </button>
                <button
                  onClick={handleStartWork}
                  disabled={startingWork}
                  className="w-full py-3 border border-gray-300 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {startingWork ? "Iniciando..." : "Iniciar sessão nova"}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-gray-800 mb-1">
                  {greeting}, {user?.name?.split(" ")[0]}!
                </h2>
                <p className="text-gray-500 text-sm mb-8">
                  Registre sua entrada para começar a usar o sistema.
                </p>
                <button
                  onClick={handleStartWork}
                  disabled={startingWork}
                  className="w-full py-4 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-xl transition disabled:opacity-50 shadow-lg flex items-center justify-center gap-2"
                >
                  {startingWork ? (
                    <>
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      Iniciando...
                    </>
                  ) : (
                    "▶ Iniciar Trabalho"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {showChangePwd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <KeyRound size={18} className="text-blue-600" />
                Alterar Senha
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{user?.name} · {user?.email}</p>
            </div>
            <form onSubmit={handleChangePwd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
                <input
                  type="password"
                  value={pwdForm.current}
                  onChange={e => setPwdForm(f => ({ ...f, current: e.target.value }))}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={pwdForm.next}
                  onChange={e => setPwdForm(f => ({ ...f, next: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                <input
                  type="password"
                  value={pwdForm.confirm}
                  onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {pwdLoading ? "Salvando..." : "✅ Salvar"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowChangePwd(false); setPwdForm({ current: "", next: "", confirm: "" }); }}
                  className="flex-1 py-2.5 border text-sm rounded-lg text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
