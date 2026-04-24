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

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-slate-700 flex-shrink-0">
        <img
          src="/sal-vita-logo.svg"
          alt="Sal Vita"
          className="h-8 cursor-pointer brightness-0 invert"
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

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative z-50 flex flex-col w-60 bg-slate-900">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b flex items-center px-4 gap-4 flex-shrink-0">
          <button
            className="md:hidden p-2.5 rounded-lg hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu size={20} className="text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-800 truncate">{pageTitle}</h1>
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
