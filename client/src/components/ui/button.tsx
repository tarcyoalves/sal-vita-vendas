import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium select-none transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/30 aria-invalid:border-red-500",
  {
    variants: {
      variant: {
        // Uma ação primária por área. Azul Sal Vita.
        default: "bg-brand-700 text-white hover:bg-brand-800 active:bg-brand-900",
        destructive: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500/30",
        // Ação secundária padrão (Cancelar, Exportar, Filtros).
        outline: "border border-slate-300 bg-surface text-slate-800 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100",
        secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 active:bg-slate-300",
        // Ações de linha/ícone: sem caixa até o hover.
        ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
        link: "h-auto px-0 text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 has-[>svg]:px-3",
        sm: "h-8 max-md:h-10 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-5 has-[>svg]:px-4",
        icon: "size-9 max-md:size-10",
        "icon-sm": "size-8 max-md:size-10",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
