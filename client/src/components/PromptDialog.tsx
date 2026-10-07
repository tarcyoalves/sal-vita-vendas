import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
  /** Mínimo de caracteres (sem espaços nas pontas) para liberar o botão. */
  minLength?: number;
  onSubmit: (value: string) => void;
}

// Substitui window.prompt (bloqueado/feio em PWA no iOS) quando a ação exige um texto, como o motivo.
export function PromptDialog({
  open, onOpenChange, title, description, label, initialValue = '', confirmLabel = 'Confirmar', minLength = 1, onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (open) setValue(initialValue); }, [open, initialValue]);
  const ok = value.trim().length >= minLength;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (ok) onSubmit(value.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            {label}
            <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            {minLength > 1 && (
              <span className="text-xs font-normal text-slate-500">Mínimo de {minLength} caracteres.</span>
            )}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={!ok}>{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
