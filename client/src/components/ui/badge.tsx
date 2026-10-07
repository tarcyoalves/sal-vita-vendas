import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from '../../lib/utils';

/**
 * Badge = rótulo de estado. Fundo suave + texto escuro do mesmo matiz, sem borda.
 * Use para status/categoria, não para enfeitar. Para status de domínio
 * (tarefa, pedido, lead) prefira <StatusBadge> em components/StatusBadge.tsx.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-sm px-1.5 py-0.5 text-xs leading-4 font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30 transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-brand-50 text-brand-700",
        secondary: "bg-slate-100 text-slate-700",
        neutral: "bg-slate-100 text-slate-700",
        info: "bg-brand-50 text-brand-700",
        success: "bg-green-50 text-green-700",
        warning: "bg-amber-50 text-amber-800",
        destructive: "bg-red-50 text-red-700",
        danger: "bg-red-50 text-red-700",
        solid: "bg-brand-700 text-white",
        outline: "border border-slate-300 text-slate-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
