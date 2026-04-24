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
} from "lucide-react";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import ActiveTimer from "./ActiveTimer";
import SalVitaLogo from "./SalVitaLogo";

// Brand navy: #0C3680
const NAVY = "#0C3680";
const NAVY_DARK = "#091f4d";
const NAVY_LIGHT = "#1a4a9a";

interface NavItem {
  label: string;
  path?: string;
  icon: React.ReactNode;
  roles: ("admin" | "user")[];
  children?: { label: string; path: string; icon: React.ReactNode }[];
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
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [iaExpanded, setIaExpanded] = useState(
    ["/ai-chat", "/ai-settings", "/knowledge-base"].includes(location)
  );
  const logoutMutation = trpc.auth.logout.useMutation();

  const role = (user?.role ?? "user") as "admin" | "user";
  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const isActive = (path?: string) => path === location;
  const isChildActive = (children?: { path: string }[]) =>
    children?.some((c) => c.path === location) ?? false;

  const pageTitle = PAGE_TITLES[location] ?? "Sal Vita";
  const userInitial = user?.name?.charAt(0).toUpperCase() ?? "U";

  const navItemBase = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all";
  const navItemActive = { background: "rgba(255,255,255,0.18)", color: "#ffffff", borderLeft: "3px solid #7aadff" };
  const navItemInactive = { color: "rgba(255,255,255,0.72)" };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-[72px] flex items-center px-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
        <SalVitaLogo
          className="h-12 w-auto cursor-pointer"
          variant="dark"
          onClick={() => { setLocation(role === "admin" ? "/admin/dashboard" : "/tasks"); setSidebarOpen(false); }}
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
                    className={navItemBase}
                    style={childActive ? navItemActive : navItemInactive}
                    onClick={() => setIaExpanded(!iaExpanded)}
                    onMouseEnter={e => { if (!childActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                    onMouseLeave={e => { if (!childActive) (e.currentTarget as HTMLElement).style.background = ""; }}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    <span className="flex-1 text-left">{item.label}</span>
                    {iaExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {iaExpanded && (
                    <ul className="mt-0.5 ml-4 space-y-0.5 pl-3" style={{ borderLeft: "1px solid rgba(255,255,255,0.15)" }}>
                      {item.children!.map((child) => (
                        <li key={child.path}>
                          <button
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
                            style={isActive(child.path) ? navItemActive : { color: "rgba(255,255,255,0.65)" }}
                            onMouseEnter={e => { if (!isActive(child.path)) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                            onMouseLeave={e => { if (!isActive(child.path)) (e.currentTarget as HTMLElement).style.background = ""; }}
                            onClick={() => {
                              setLocation(child.path);
                              setSidebarOpen(false);
                            }}
                          >
                            <span className="flex-shrink-0">{child.icon}</span>
                            <span>{child.label}</span>
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
                  className={navItemBase}
                  style={active ? navItemActive : navItemInactive}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = ""; }}
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
      <div className="p-4 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.2)", color: "#ffffff" }}
          >
            {userInitial}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name ?? "Usuário"}</p>
            <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{user?.email ?? ""}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-all"
          style={{ color: "rgba(255,255,255,0.65)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLElement).style.color = "#ffffff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)"; }}
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
      <aside
        className="hidden md:flex w-60 flex-col flex-shrink-0"
        style={{ background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DARK} 100%)` }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside
            className="relative z-50 flex flex-col w-60"
            style={{ background: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_DARK} 100%)` }}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b flex items-center px-4 gap-4 flex-shrink-0 shadow-sm">
          <button
            className="md:hidden p-2.5 rounded-lg hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={20} style={{ color: NAVY }} />
          </button>
          <h1 className="text-base font-semibold truncate" style={{ color: NAVY }}>{pageTitle}</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Work session timer — fixed bottom-right, only for attendants */}
      {role === 'user' && <ActiveTimer />}
    </div>
  );
}
