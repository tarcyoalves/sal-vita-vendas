import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Blocos de composição das telas do CRM (ver docs/DESIGN-SYSTEM.md).
 *
 * - <Page>: largura e respiro padrão do conteúdo.
 * - <PageHeader>: título da tela + descrição curta + ações à direita.
 * - <Panel>: superfície branca com borda (sem sombra). Substitui card decorativo.
 * - <PanelHeader>: cabeçalho de painel com título e ações.
 * - <StatStrip>/<Stat>: indicadores numa faixa única com divisórias — não um
 *   card por número.
 * - <EmptyState>: o que está vazio e o que fazer.
 */

export function Page({ children, className, wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn("mx-auto w-full px-4 py-4 md:px-6 md:py-6 space-y-5", wide ? "max-w-[1600px]" : "max-w-[1360px]", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {/* No celular o título já está na barra do AppShell: aqui fica só para leitor de tela. */}
        <h1 className="max-md:sr-only text-xl font-semibold tracking-tight text-slate-900 leading-tight">{title}</h1>
        {description && <p className="md:mt-1 text-sm text-slate-500 max-w-prose">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function Panel({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return <Tag className={cn("rounded-lg border border-slate-200 bg-white", className)}>{children}</Tag>;
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]",
        "[&>*]:border-slate-200 [&>*]:border-b [&>*]:border-r sm:[&>*]:border-b-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
  onClick?: () => void;
}) {
  const valueTone =
    tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : tone === "success" ? "text-green-700" : "text-slate-900";
  const body = (
    <>
      <span className="block text-xs font-medium text-slate-500">{label}</span>
      <span className={cn("mt-1 block text-xl font-semibold tabular-nums leading-tight", valueTone)}>{value}</span>
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex flex-col items-start justify-start px-4 py-3 text-left transition-colors hover:bg-slate-50">
        {body}
      </button>
    );
  }
  return <div className="px-4 py-3">{body}</div>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-slate-400 [&_svg]:size-6">{icon}</div>}
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Tela sem permissão para o papel atual — mesma mensagem em todo o CRM. */
export function AccessDenied({ area, hint }: { area: string; hint?: string }) {
  return (
    <EmptyState
      className="py-16"
      title={`Sem acesso: ${area}`}
      description={hint ?? "Seu usuário não tem permissão para esta área. Fale com o administrador se precisar dela."}
    />
  );
}
