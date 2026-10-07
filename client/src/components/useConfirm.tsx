import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

interface Pending {
  message: string;
  title: string;
  confirmLabel?: string;
}

// Substitui window.confirm mantendo o fluxo `if (!(await confirm(msg))) return`.
// Renderize `confirmDialog` UMA vez no JSX do componente que chama o hook.
export function useConfirm(): {
  confirm: (message: string, opts?: { title?: string; confirmLabel?: string }) => Promise<boolean>;
  confirmDialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    // Só a primeira resposta vale (o botão de confirmar também dispara onOpenChange(false)).
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }, []);

  const confirm = useCallback(
    (message: string, opts?: { title?: string; confirmLabel?: string }) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setPending({ message, title: opts?.title ?? "Confirmar ação", confirmLabel: opts?.confirmLabel });
      }),
    [],
  );

  const confirmDialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => { if (!open) settle(false); }}
      title={pending?.title ?? "Confirmar ação"}
      description={pending?.message}
      confirmLabel={pending?.confirmLabel}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, confirmDialog };
}
