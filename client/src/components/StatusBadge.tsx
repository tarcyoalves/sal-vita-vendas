import { Badge } from "./ui/badge";

/**
 * Status de domínio com UMA aparência em todo o CRM. Antes, "pendente" era
 * amarelo numa tela, laranja noutra e azul numa terceira.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_BY_STATUS: Record<string, StatusTone> = {
  // tarefas
  pending: "warning",
  pendente: "warning",
  in_progress: "info",
  em_andamento: "info",
  completed: "success",
  concluida: "success",
  done: "success",
  cancelled: "neutral",
  cancelada: "neutral",
  overdue: "danger",
  atrasada: "danger",
  // prioridade
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
  // pedidos / genéricos
  approved: "success",
  aprovado: "success",
  rejected: "danger",
  recusado: "danger",
  active: "success",
  ativo: "success",
  inactive: "neutral",
  inativo: "neutral",
  paused: "warning",
};

export function toneForStatus(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  return TONE_BY_STATUS[status.toLowerCase()] ?? "neutral";
}

export function StatusBadge({
  status,
  tone,
  children,
  className,
  dot = false,
}: {
  status?: string | null;
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const t = tone ?? toneForStatus(status);
  const dotColor =
    t === "success" ? "bg-green-500" : t === "warning" ? "bg-amber-500" : t === "danger" ? "bg-red-500" : t === "info" ? "bg-brand-500" : "bg-slate-400";
  return (
    <Badge variant={t} className={className}>
      {dot && <span className={`size-1.5 rounded-full ${dotColor}`} aria-hidden />}
      {children}
    </Badge>
  );
}
