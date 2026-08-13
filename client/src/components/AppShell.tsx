import { useState, useEffect } from "react";
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
  Mail,
  DollarSign,
  FileText,
} from "lucide-react";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import ActiveTimer from "./ActiveTimer";
import { toast } from "sonner";

interface NavItem {
  label: string;
  path?: string;
  icon: React.ReactNode;
  roles: ("admin" | "manager" | "user")[];
  /** Rótulo de grupo exibido acima do item quando muda em relação ao item anterior */
  group?: string;
  children?: { label: string; path: string; icon: React.ReactNode; external?: boolean }[];
  external?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: <LayoutDashboard size={18} />,
    roles: ["admin", "manager"],
    group: "Operação",
  },
  {
    label: "Tarefas",
    path: "/tasks",
    icon: <CheckSquare size={18} />,
    roles: ["admin", "manager"],
    group: "Operação",
  },
  {
    label: "Atendentes",
    path: "/attendants",
    icon: <Users size={18} />,
    roles: ["admin"],
    group: "Operação",
  },
  {
    label: "E-mail Marketing",
    path: "/admin/email-marketing",
    icon: <Mail size={18} />,
    roles: ["admin", "manager"],
    group: "Receita",
  },
  {
    label: "Faturamento",
    path: "/admin/faturamento",
    icon: <DollarSign size={18} />,
    roles: ["admin", "manager"],
    group: "Receita",
  },
  {
    label: "Documentos",
    path: "/documentos",
    icon: <FileText size={18} />,
    roles: ["admin", "manager"],
    group: "Recursos",
  },
  {
    label: "Inteligência IA",
    icon: <Bot size={18} />,
    roles: ["admin"],
    group: "Inteligência",
    children: [
      { label: "Chat IA", path: "/ai-chat", icon: <MessageSquare size={16} /> },
      { label: "Configurações", path: "/ai-settings", icon: <Settings size={16} /> },
      { label: "Base de Conhecimento", path: "/knowledge-base", icon: <BookOpen size={16} /> },
    ],
  },
  {
    label: "Minhas Tarefas",
    path: "/tasks",
    icon: <CheckSquare size={18} />,
    roles: ["user"],
    group: "Meu dia",
  },
  {
    label: "Meu Progresso",
    path: "/meu-progresso",
    icon: <TrendingUp size={18} />,
    roles: ["user"],
    group: "Meu dia",
  },
  {
    label: "E-mail Marketing",
    path: "/admin/email-marketing",
    icon: <Mail size={18} />,
    roles: ["user"],
    group: "Meu dia",
  },
  {
    label: "Documentos",
    path: "/documentos",
    icon: <FileText size={18} />,
    roles: ["user"],
    group: "Meu dia",
  },
];

// Flat items for the mobile bottom nav — último slot é sempre "Mais" (abre sidebar)
const BOTTOM_NAV_ADMIN = [
  { label: "Dashboard",     path: "/admin/dashboard",      icon: <LayoutDashboard size={22} /> },
  { label: "Tarefas",       path: "/tasks",                icon: <CheckSquare size={22} /> },
  { label: "Atendentes",    path: "/attendants",           icon: <Users size={22} /> },
  { label: "E-mail",        path: "/admin/email-marketing", icon: <Mail size={22} /> },
];

const BOTTOM_NAV_MANAGER = [
  { label: "Dashboard", path: "/admin/dashboard",      icon: <LayoutDashboard size={22} /> },
  { label: "Tarefas",   path: "/tasks",                icon: <CheckSquare size={22} /> },
  { label: "E-mail",    path: "/admin/email-marketing", icon: <Mail size={22} /> },
  { label: "Faturamento", path: "/admin/faturamento",  icon: <DollarSign size={22} /> },
];

const BOTTOM_NAV_USER = [
  { label: "Tarefas",   path: "/tasks",                icon: <CheckSquare size={22} /> },
  { label: "Progresso", path: "/meu-progresso",         icon: <TrendingUp size={22} /> },
  { label: "Documentos", path: "/documentos",          icon: <FileText size={22} /> },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/tasks": "Tarefas",
  "/attendants": "Atendentes",
  "/admin/email-marketing": "E-mail Marketing",
  "/admin/faturamento": "Faturamento",
  "/documentos": "Documentos & Fichas Técnicas",
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

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => document.body.classList.remove("overflow-hidden");
  }, [sidebarOpen]);

  const role = (user?.role ?? "user") as "admin" | "manager" | "user";
  const { data: pendingDeletions } = trpc.tasks.deletionLogs.useQuery(
    { onlyUnreviewed: true },
    { enabled: role === "admin", refetchInterval: 120_000, staleTime: 90_000, select: (d) => d.length }
  );
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));
  const bottomNavItems = role === "admin" ? BOTTOM_NAV_ADMIN : role === "manager" ? BOTTOM_NAV_MANAGER : BOTTOM_NAV_USER;

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
      toast.success("Trabalho iniciado!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao iniciar trabalho");
    } finally {
      setStartingWork(false);
    }
  };

  const handleRetomar = () => {
    if (currentSession) ackSession(currentSession.id);
    toast.success("Bem-vindo de volta!");
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
      toast.success("Senha definida! Bem-vindo ao sistema.");
      setForcePwdForm({ next: "", confirm: "" });
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao definir senha");
    } finally {
      setForcePwdLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      setLocation("/");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao sair. Verifique sua conexão e tente novamente.");
    }
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
      <div className="min-h-[72px] flex items-center px-5 border-b border-white/10 flex-shrink-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <img
          src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
          alt="Sal Vita"
          style={{ height: "42px" }}
          className="cursor-pointer rounded-lg object-contain"
          onClick={() => setLocation(role === "admin" || role === "manager" ? "/admin/dashboard" : "/tasks")}
        />
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <ul className="space-y-0.5 px-3">
          {visibleItems.map((item, idx) => {
            const hasChildren = item.children && item.children.length > 0;
            const active = isActive(item.path);
            const childActive = isChildActive(item.children);
            // Cabeçalho de grupo: aparece quando o grupo muda em relação ao item anterior
            const showGroup = item.group && item.group !== visibleItems[idx - 1]?.group;

            const groupHeader = showGroup ? (
              <div className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400/80 border-t border-white/5 first:border-0 select-none">
                {item.group}
              </div>
            ) : null;

            if (hasChildren) {
              return (
                <li key={item.label}>
                  {groupHeader}
                  <button
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      childActive
                        ? "bg-[#0C3680] text-white shadow-sm border-r-2 border-blue-400"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                    onClick={() => setIaExpanded(!iaExpanded)}
                  >
                    <span className="flex-shrink-0 text-blue-300">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {iaExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                  </button>
                  {iaExpanded && (
                    <ul className="mt-1 ml-3 space-y-0.5 pl-3 border-l border-white/10">
                      {item.children!.map((child) => (
                        <li key={child.path}>
                          <button
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                              isActive(child.path)
                                ? "bg-white/15 text-white font-semibold"
                                : "text-slate-400 hover:bg-white/5 hover:text-white"
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
                            <span className="flex-shrink-0 text-blue-300">{child.icon}</span>
                            <span className="flex-1 text-left">{child.label}</span>
                            {child.external && <span className="text-[10px] text-slate-400">↗</span>}
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
                {groupHeader}
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    active
                      ? "bg-[#0C3680] text-white shadow-sm border-r-2 border-blue-400"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                  onClick={() => {
                    setLocation(item.path!);
                    setSidebarOpen(false);
                  }}
                >
                  <span className={`flex-shrink-0 ${active ? "text-white" : "text-blue-300"}`}>{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.path === "/admin/dashboard" && !!pendingDeletions && pendingDeletions > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                      {pendingDeletions > 9 ? "9+" : pendingDeletions}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-3 bg-white/5 p-2.5 rounded-xl border border-white/5">
          <div className="w-8 h-8 rounded-lg bg-[#0C3680] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-xs">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">{user?.name ?? "Usuário"}</p>
            <p className="text-[11px] text-slate-400 truncate">{user?.email ?? ""}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 pt-1">
          <button
            onClick={() => setShowChangePwd(true)}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <KeyRound size={13} />
            <span>Senha</span>
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
          >
            <LogOut size={13} />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50/50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-[#081F47] flex-shrink-0 border-r border-slate-800">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <div className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={() => setSidebarOpen(false)} />
        <aside className={`relative z-50 flex flex-col w-64 h-full bg-[#081F47] transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <SidebarContent />
        </aside>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-6 gap-4 flex-shrink-0 z-10" style={{ paddingTop: "env(safe-area-inset-top)", minHeight: "calc(60px + env(safe-area-inset-top))" }}>
          <div className="flex items-center gap-3">
            {/* Mobile menu trigger */}
            <button
              className="md:hidden p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight leading-none">{pageTitle}</h1>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">CRM Sal Vita · Operação & Vendas</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-700 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sistema Operacional</span>
            </div>
          </div>
        </header>

        {/* Page content — bottom padding on mobile to avoid bottom nav overlap */}
        <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
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
                <span className="relative">
                  <span
                    className={`flex items-center justify-center w-12 h-11 rounded-2xl transition-all ${
                      active ? "bg-brand text-white shadow-md" : "text-gray-400"
                    }`}
                  >
                    {item.icon}
                  </span>
                  {item.path === "/admin/dashboard" && !!pendingDeletions && pendingDeletions > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold">
                      {pendingDeletions > 9 ? "9+" : pendingDeletions}
                    </span>
                  )}
                </span>
                <span className={`text-[10px] font-medium leading-tight ${active ? "text-brand" : "text-gray-400"}`}>
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
              className={`flex items-center justify-center w-12 h-11 rounded-2xl transition-all ${
                sidebarOpen ? "bg-brand text-white shadow-md" : "text-gray-400"
              }`}
            >
              <Menu size={22} />
            </span>
            <span className={`text-[10px] font-medium leading-tight ${sidebarOpen ? "text-brand" : "text-gray-400"}`}>
              Mais
            </span>
          </button>
        </div>
      </nav>

      {/* Work session timer — only for attendants, above bottom nav on mobile */}
      {role === "user" && <ActiveTimer />}

      {/* ── Force password change modal (first access) — blocks everything ── */}
      {!!user && user.mustChangePassword && (
        <div className="fixed inset-0 z-[300] bg-brand-deep flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: "56px", width: "auto" }} className="mx-auto mb-5" aria-label="Sal Vita">
              <defs><clipPath id="oval-m1"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
              <ellipse cx="250" cy="187" rx="228" ry="164" fill="white"/>
              <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#0C3680" clipPath="url(#oval-m1)"/>
              <path d="M 210 240 Q 206 295 204 352" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" clipPath="url(#oval-m1)"/>
              <path d="M 336 210 Q 340 270 342 352" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" clipPath="url(#oval-m1)"/>
              <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="#0C3680">Sal Vita</text>
              <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="#0C3680" strokeWidth="15"/>
            </svg>
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
                  className="w-full px-3 py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={forcePwdLoading}
                className="w-full py-3 bg-brand hover:bg-brand-deep text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {forcePwdLoading ? (
                  <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Salvando...</>
                ) : "Definir minha senha"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Startup blocking modal (attendants) ── */}
      {needsStartup && !user?.mustChangePassword && (
        <div className="fixed inset-0 z-[200] bg-brand-deep flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: "72px", width: "auto" }} className="mx-auto mb-5" aria-label="Sal Vita">
              <defs><clipPath id="oval-m2"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
              <ellipse cx="250" cy="187" rx="228" ry="164" fill="white"/>
              <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#0C3680" clipPath="url(#oval-m2)"/>
              <path d="M 210 240 Q 206 295 204 352" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" clipPath="url(#oval-m2)"/>
              <path d="M 336 210 Q 340 270 342 352" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" clipPath="url(#oval-m2)"/>
              <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="#0C3680">Sal Vita</text>
              <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="#0C3680" strokeWidth="15"/>
            </svg>
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
                  Retomar trabalho
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
                    "Iniciar trabalho"
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
                <KeyRound size={18} className="text-brand" />
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
                  className="w-full px-3 py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="flex-1 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                >
                  {pwdLoading ? "Salvando..." : "Salvar"}
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
