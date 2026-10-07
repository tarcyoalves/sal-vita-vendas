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
  Truck,
  UserSearch,
  ChevronsUpDown,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
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
    icon: <LayoutDashboard size={16} />,
    roles: ["admin", "manager"],
    group: "Operação",
  },
  {
    label: "Tarefas",
    path: "/tasks",
    icon: <CheckSquare size={16} />,
    roles: ["admin", "manager"],
    group: "Operação",
  },
  {
    label: "Atendentes",
    path: "/attendants",
    icon: <Users size={16} />,
    roles: ["admin"],
    group: "Operação",
  },
  {
    label: "Buscador de Clientes",
    path: "/radar-cargas",
    icon: <UserSearch size={16} />,
    roles: ["admin", "manager"],
    group: "Operação",
  },
  {
    label: "E-mail Marketing",
    path: "/admin/email-marketing",
    icon: <Mail size={16} />,
    roles: ["admin", "manager"],
    group: "Receita",
  },
  {
    label: "Faturamento",
    path: "/admin/faturamento",
    icon: <DollarSign size={16} />,
    roles: ["admin", "manager"],
    group: "Receita",
  },
  {
    label: "Documentos",
    path: "/documentos",
    icon: <FileText size={16} />,
    roles: ["admin", "manager"],
    group: "Recursos",
  },
  {
    label: "Assistente IA",
    icon: <Bot size={16} />,
    roles: ["admin"],
    group: "Recursos",
    children: [
      { label: "Chat IA", path: "/ai-chat", icon: <MessageSquare size={16} /> },
      { label: "Configurações", path: "/ai-settings", icon: <Settings size={16} /> },
      { label: "Base de Conhecimento", path: "/knowledge-base", icon: <BookOpen size={16} /> },
    ],
  },
  {
    label: "Minhas Tarefas",
    path: "/tasks",
    icon: <CheckSquare size={16} />,
    roles: ["user"],
    group: "Meu dia",
  },
  {
    label: "Buscador de Clientes",
    path: "/radar-cargas",
    icon: <UserSearch size={16} />,
    roles: ["user"],
    group: "Meu dia",
  },
  {
    label: "Meu Progresso",
    path: "/meu-progresso",
    icon: <TrendingUp size={16} />,
    roles: ["user"],
    group: "Meu dia",
  },
  {
    label: "E-mail Marketing",
    path: "/admin/email-marketing",
    icon: <Mail size={16} />,
    roles: ["user"],
    group: "Meu dia",
  },
  {
    label: "Documentos",
    path: "/documentos",
    icon: <FileText size={16} />,
    roles: ["user"],
    group: "Meu dia",
  },
];

// Flat items for the mobile bottom nav — último slot é sempre "Mais" (abre sidebar)
const BOTTOM_NAV_ADMIN = [
  { label: "Dashboard",     path: "/admin/dashboard",      icon: <LayoutDashboard size={20} /> },
  { label: "Faturamento",   path: "/admin/faturamento",    icon: <DollarSign size={20} /> },
  { label: "Tarefas",       path: "/tasks",                icon: <CheckSquare size={20} /> },
  { label: "Atendentes",    path: "/attendants",           icon: <Users size={20} /> },
];

const BOTTOM_NAV_MANAGER = [
  { label: "Dashboard", path: "/admin/dashboard",      icon: <LayoutDashboard size={20} /> },
  { label: "Tarefas",   path: "/tasks",                icon: <CheckSquare size={20} /> },
  { label: "E-mail",    path: "/admin/email-marketing", icon: <Mail size={20} /> },
  { label: "Faturamento", path: "/admin/faturamento",  icon: <DollarSign size={20} /> },
];

const BOTTOM_NAV_USER = [
  { label: "Tarefas",   path: "/tasks",                icon: <CheckSquare size={20} /> },
  { label: "Buscador",  path: "/radar-cargas",          icon: <UserSearch size={20} /> },
  { label: "Progresso", path: "/meu-progresso",         icon: <TrendingUp size={20} /> },
  { label: "Documentos", path: "/documentos",          icon: <FileText size={20} /> },
];

const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/tasks": "Tarefas",
  "/attendants": "Atendentes",
  "/atendentes": "Atendentes",
  "/representatives": "Atendentes",
  "/admin/clients": "Clientes",
  "/admin/ai-analysis": "Análise IA",
  "/radar-cargas": "Buscador de Clientes",
  "/admin/email-marketing": "E-mail Marketing",
  "/admin/faturamento": "Faturamento",
  "/documentos": "Documentos & Fichas Técnicas",
  "/ai-chat": "Chat IA",
  "/ai-settings": "Configurações IA",
  "/knowledge-base": "Base de Conhecimento",
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

  // Esc fecha o menu "Mais" (teclado físico / leitores de tela)
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

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
  const { data: pendingPedidosCount } = trpc.faturamento.pendingApproval.useQuery(
    undefined,
    { enabled: role === "admin" || role === "manager", refetchInterval: 60_000, staleTime: 30_000, select: (d) => d.length }
  );
  const totalDashboardAlerts = (pendingDeletions || 0) + (pendingPedidosCount || 0);
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
  const utils = trpc.useUtils();
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
      // Enquanto a senha era obrigatória o servidor recusava as demais consultas (FORBIDDEN):
      // refaz todas para a tela de trás não ficar em erro até o F5.
      await utils.invalidate();
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
  const firstName = user?.name?.split(" ")[0] ?? "";

  // O <title> do index.html é o da loja Premium (SEO); no CRM cada tela nomeia a aba.
  useEffect(() => {
    document.title = `${pageTitle} · Sal Vita CRM`;
  }, [pageTitle]);
  const homePath = role === "admin" || role === "manager" ? "/admin/dashboard" : "/tasks";

  const navItemClass = (active: boolean) =>
    `group w-full flex items-center gap-2.5 h-9 max-md:h-11 px-2.5 rounded-md text-[13px] font-medium transition-colors ${
      active
        ? "bg-white/[0.12] text-white"
        : "text-brand-100/80 hover:bg-white/[0.06] hover:text-white"
    }`;
  const navIconClass = (active: boolean) =>
    `flex-shrink-0 ${active ? "text-white" : "text-brand-300 group-hover:text-brand-100"}`;

  // Elemento (não componente): declarar um componente aqui dentro o remontaria a cada render
  // e a lista perderia a rolagem.
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Marca — logotipo oficial, como sempre foi */}
      <div className="min-h-[72px] flex items-center px-5 border-b border-white/10 flex-shrink-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button
          type="button"
          onClick={() => { setLocation(homePath); setSidebarOpen(false); }}
          className="rounded-lg"
          aria-label="Sal Vita — ir para o início"
        >
          <img
            src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
            alt="Sal Vita"
            style={{ height: "42px", width: "auto" }}
            className="rounded-lg object-contain"
          />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Principal">
        <ul className="space-y-px">
          {visibleItems.map((item, idx) => {
            const hasChildren = item.children && item.children.length > 0;
            const active = isActive(item.path);
            const childActive = isChildActive(item.children);
            // Cabeçalho de grupo: aparece quando o grupo muda em relação ao item anterior
            const showGroup = item.group && item.group !== visibleItems[idx - 1]?.group;

            const groupHeader = showGroup ? (
              <div className={`px-2.5 pb-1 text-[11px] font-medium text-brand-300 select-none ${idx === 0 ? "pt-1" : "pt-4"}`}>
                {item.group}
              </div>
            ) : null;

            if (hasChildren) {
              return (
                <li key={item.label}>
                  {groupHeader}
                  <button
                    type="button"
                    className={navItemClass(false)}
                    aria-expanded={iaExpanded}
                    onClick={() => setIaExpanded(!iaExpanded)}
                  >
                    <span className={navIconClass(childActive)}>{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {iaExpanded ? <ChevronDown size={14} className="text-brand-300" /> : <ChevronRight size={14} className="text-brand-300" />}
                  </button>
                  {iaExpanded && (
                    <ul className="mt-px ml-[18px] space-y-px border-l border-white/10 pl-2">
                      {item.children!.map((child) => (
                        <li key={child.path}>
                          <button
                            type="button"
                            aria-current={isActive(child.path) ? "page" : undefined}
                            className={navItemClass(isActive(child.path))}
                            onClick={() => {
                              if (child.external) {
                                window.open(child.path, '_blank');
                              } else {
                                setLocation(child.path);
                                setSidebarOpen(false);
                              }
                            }}
                          >
                            <span className={navIconClass(isActive(child.path))}>{child.icon}</span>
                            <span className="flex-1 text-left">{child.label}</span>
                            {child.external && <span className="text-[11px] text-brand-300" aria-hidden>↗</span>}
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
                  type="button"
                  aria-current={active ? "page" : undefined}
                  className={navItemClass(active)}
                  onClick={() => {
                    setLocation(item.path!);
                    setSidebarOpen(false);
                  }}
                >
                  <span className={navIconClass(active)}>{item.icon}</span>
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.path === "/admin/dashboard" && totalDashboardAlerts > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-sm bg-brand-500 text-white text-[11px] font-semibold tabular-nums"
                      aria-label={`${totalDashboardAlerts} pendências`}
                    >
                      {totalDashboardAlerts > 9 ? "9+" : totalDashboardAlerts}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Conta */}
      <div className="border-t border-white/10 p-2.5 flex-shrink-0" style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06] transition-colors"
              aria-label="Conta: alterar senha ou sair"
            >
              <span className="size-7 rounded-md bg-brand-500 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0" aria-hidden>
                {userInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-white truncate">{user?.name ?? "Usuário"}</span>
                <span className="block text-[11px] text-brand-200/80 truncate">{user?.email ?? ""}</span>
              </span>
              <ChevronsUpDown size={14} className="text-brand-300 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="min-w-52">
            <DropdownMenuItem onSelect={() => setShowChangePwd(true)}>
              <KeyRound /> Alterar senha
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
              <LogOut /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const brandMark = (
    <img src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp" alt="Sal Vita" style={{ height: "56px", width: "auto" }} className="mx-auto mb-5 rounded-lg object-contain" />
  );

  return (
    <div className="flex h-dvh bg-background text-sm text-slate-800 overflow-hidden">
      {/* PWA no iOS usa status bar "black-translucent" (texto branco sobre a página):
          a faixa da safe-area fica azul-marinho para hora/bateria continuarem legíveis. */}
      <div
        aria-hidden
        className="md:hidden fixed top-0 inset-x-0 z-[400] bg-brand-900 pointer-events-none"
        style={{ height: "env(safe-area-inset-top)" }}
      />
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[232px] flex-col bg-brand-900 flex-shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      <div className={`fixed inset-0 z-40 md:hidden transition-opacity duration-200 ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="fixed inset-0 bg-slate-950/40" onClick={() => setSidebarOpen(false)} />
        <aside
          role={sidebarOpen ? "dialog" : undefined}
          aria-modal={sidebarOpen ? true : undefined}
          aria-label="Menu"
          aria-hidden={!sidebarOpen}
          className={`relative z-50 flex flex-col w-[280px] max-w-[85vw] h-full bg-brand-900 shadow-xl transition-transform duration-200 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          {sidebarContent}
        </aside>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topo — só no celular. No desktop o título fica no cabeçalho da página. */}
        <header
          className="md:hidden bg-white border-b border-slate-200 flex items-center gap-1 px-1.5 flex-shrink-0 z-10"
          style={{ paddingTop: "env(safe-area-inset-top)", minHeight: "calc(52px + env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={20} />
          </button>
          <p className="text-[15px] font-semibold text-slate-900 truncate">{pageTitle}</p>
        </header>

        {/* Page content — bottom padding on mobile to avoid bottom nav overlap */}
        {/* Atendente tem dois botões flutuantes (timer e e-mail marketing) acima da barra
            inferior: o espaço extra deixa o fim das listas rolar para fora deles. */}
        <main className={`flex-1 overflow-y-auto md:pb-0 ${role === "user"
          ? "pb-[calc(9.5rem_+_env(safe-area-inset-bottom))]"
          : "pb-[calc(5rem_+_env(safe-area-inset-bottom))]"}`}>
          {children}
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Navegação rápida"
      >
        <div className="flex items-stretch">
          {bottomNavItems.map((item) => {
            const active = location === item.path;
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => setLocation(item.path)}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 h-14 transition-colors ${active ? "text-brand-700" : "text-slate-500 active:text-slate-800"}`}
              >
                {active && <span className="absolute top-0 inset-x-4 h-0.5 rounded-b-sm bg-brand-700" aria-hidden />}
                <span className="relative">
                  {item.icon}
                  {item.path === "/admin/dashboard" && totalDashboardAlerts > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-sm bg-brand-700 text-white text-[10px] font-semibold tabular-nums">
                      {totalDashboardAlerts > 9 ? "9+" : totalDashboardAlerts}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] leading-tight truncate max-w-full px-1 ${active ? "font-semibold" : "font-medium"}`}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* "Mais" — abre o sidebar completo com todos os sub-menus */}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-expanded={sidebarOpen}
            aria-haspopup="dialog"
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 h-14 transition-colors ${sidebarOpen ? "text-brand-700" : "text-slate-500"}`}
          >
            <Menu size={20} />
            <span className="text-[11px] font-medium leading-tight">Mais</span>
          </button>
        </div>
      </nav>

      {/* Work session timer — only for attendants, above bottom nav on mobile */}
      {role === "user" && <ActiveTimer />}

      {/* ── Force password change modal (first access) — blocks everything ── */}
      {!!user && user.mustChangePassword && (
        <div className="fixed inset-0 z-[300] bg-background flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-6 sm:p-8 w-full max-w-sm max-h-[90dvh] overflow-y-auto">
            {brandMark}
            <h2 className="text-lg font-semibold text-slate-900 mb-1 text-center">
              Defina sua senha, {firstName}
            </h2>
            <p className="text-slate-500 text-sm mb-6 text-center">
              Este é seu primeiro acesso. Escolha uma senha pessoal para continuar.
            </p>
            <form onSubmit={handleForceChangePwd} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="force-pwd-next">Nova senha</Label>
                <Input
                  id="force-pwd-next"
                  type="password"
                  autoComplete="new-password"
                  value={forcePwdForm.next}
                  onChange={e => setForcePwdForm(f => ({ ...f, next: e.target.value }))}
                  required
                  minLength={6}
                  aria-describedby="force-pwd-hint"
                />
                <p id="force-pwd-hint" className="text-xs text-slate-500">Mínimo de 6 caracteres.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="force-pwd-confirm">Confirmar senha</Label>
                <Input
                  id="force-pwd-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={forcePwdForm.confirm}
                  onChange={e => setForcePwdForm(f => ({ ...f, confirm: e.target.value }))}
                  required
                />
              </div>
              <Button type="submit" disabled={forcePwdLoading} className="w-full h-10">
                {forcePwdLoading ? <><Loader2 className="animate-spin" /> Salvando…</> : "Definir minha senha"}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── Startup blocking modal (attendants) ── */}
      {needsStartup && !user?.mustChangePassword && (
        <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-lg p-6 sm:p-8 w-full max-w-sm text-center">
            {brandMark}
            {showRetomar ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  {greeting}, {firstName}
                </h2>
                <p className="text-slate-500 text-sm mb-6">
                  Você já registrou entrada hoje. Continue de onde parou ou abra uma sessão nova.
                </p>
                <Button onClick={handleRetomar} className="w-full h-11 text-[15px] mb-2">
                  Continuar sessão de hoje
                </Button>
                <Button variant="ghost" onClick={handleStartWork} disabled={startingWork} className="w-full">
                  {startingWork ? "Iniciando…" : "Iniciar sessão nova"}
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  {greeting}, {firstName}
                </h2>
                <p className="text-slate-500 text-sm mb-6">
                  Registre sua entrada para começar o expediente.
                </p>
                <Button onClick={handleStartWork} disabled={startingWork} className="w-full h-11 text-[15px]">
                  {startingWork ? <><Loader2 className="animate-spin" /> Iniciando…</> : "Registrar entrada"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Alterar senha ── */}
      <Dialog
        open={showChangePwd}
        onOpenChange={(open) => {
          setShowChangePwd(open);
          if (!open) setPwdForm({ current: "", next: "", confirm: "" });
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>{user?.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePwd} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pwd-current">Senha atual</Label>
              <Input
                id="pwd-current"
                type="password"
                autoComplete="current-password"
                value={pwdForm.current}
                onChange={e => setPwdForm(f => ({ ...f, current: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-next">Nova senha</Label>
              <Input
                id="pwd-next"
                type="password"
                autoComplete="new-password"
                value={pwdForm.next}
                onChange={e => setPwdForm(f => ({ ...f, next: e.target.value }))}
                required
                minLength={6}
                aria-describedby="pwd-next-hint"
              />
              <p id="pwd-next-hint" className="text-xs text-slate-500">Mínimo de 6 caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pwd-confirm">Confirmar nova senha</Label>
              <Input
                id="pwd-confirm"
                type="password"
                autoComplete="new-password"
                value={pwdForm.confirm}
                onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowChangePwd(false); setPwdForm({ current: "", next: "", confirm: "" }); }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pwdLoading}>
                {pwdLoading ? "Salvando…" : "Salvar senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
