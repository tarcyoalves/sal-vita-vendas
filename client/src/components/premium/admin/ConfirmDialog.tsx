import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../ui/alert-dialog';
import { btn, INPUT } from './adminUi';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** O que vai acontecer e quantos itens. */
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  /** Confirmação forte: o operador digita este texto (ex.: número do pedido). */
  requireText?: string;
};

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, destructive, requireText }: Props) {
  const [typed, setTyped] = useState('');
  const blocked = !!requireText && typed.trim() !== requireText;

  return (
    <AlertDialog
      open={open}
      onOpenChange={o => {
        if (!o) setTyped('');
        onOpenChange(o);
      }}
    >
      <AlertDialogContent className="bg-white text-slate-900">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-sm text-slate-600 space-y-2">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {requireText && (
          <label className="block text-xs font-semibold text-slate-600">
            Digite <span className="font-mono text-slate-900">{requireText}</span> para confirmar
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className={`${INPUT} mt-1.5`}
            />
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={btn.secondary}>Voltar</AlertDialogCancel>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              setTyped('');
              onOpenChange(false);
              onConfirm();
            }}
            className={destructive ? btn.danger : btn.primary}
          >
            {confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
