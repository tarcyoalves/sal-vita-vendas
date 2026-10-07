import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  discardReasonsFor,
  formatCnpj,
  type RadarDiscardReason,
  type RadarLead,
  type RadarLeadActivity,
} from '../../../../shared/radar';

/**
 * Descarta o lead da lista (para todos os atendentes), com motivo. Reversível
 * com "Restaurar" no card. "Pediu para não ser contatado" também tira o
 * e-mail da empresa de todo e-mail marketing — a tela avisa antes de enviar.
 */
export function DiscardDialog({
  open,
  onOpenChange,
  lead,
  onDiscarded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: RadarLead;
  onDiscarded: (activity: RadarLeadActivity) => void;
}) {
  const { user } = useAuth();
  // "Pediu para não ser contatado" mexe na lista de e-mail marketing: o servidor só aceita de staff.
  const isStaff = user?.role === 'admin' || user?.role === 'manager';
  const [reason, setReason] = useState<RadarDiscardReason>('nao_compra');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setReason('nao_compra');
      setNote('');
    }
  }, [open, lead.cnpj]);

  const discardMutation = trpc.prospectingRadar.discard.useMutation();

  const noteRequired = reason === 'outro';
  const canSubmit = !discardMutation.isPending && (!noteRequired || note.trim().length > 0);

  const handleSubmit = async () => {
    try {
      const activity = await discardMutation.mutateAsync({
        cnpj: lead.cnpj,
        reason,
        note: note.trim() || undefined,
      });
      toast.success('Empresa descartada');
      onDiscarded(activity);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao descartar');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Descartar empresa</DialogTitle>
          <DialogDescription>
            {lead.nomeFantasia ?? lead.razaoSocial} · {formatCnpj(lead.cnpj)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            O descarte fica registrado para todos e só um admin/gerente pode desfazer.
          </p>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">Motivo</p>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as RadarDiscardReason)}>
              {discardReasonsFor(isStaff).map((r) => (
                <div key={r.key} className="flex items-center gap-2">
                  <RadioGroupItem value={r.key} id={`discard-${r.key}`} />
                  <Label htmlFor={`discard-${r.key}`} className="text-sm font-normal cursor-pointer">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {!isStaff && (
              <p className="text-xs text-slate-500 mt-2">
                Se o cliente pediu para não ser contatado, avise o administrador.
              </p>
            )}
          </div>

          {isStaff && reason === 'nao_contatar' && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-3 py-2">
              O e-mail desta empresa também sai de todo e-mail marketing.
            </p>
          )}

          <div>
            <p className="text-sm font-medium text-slate-700 mb-1.5">
              Observação {noteRequired ? '(obrigatória)' : '(opcional)'}
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={noteRequired ? 'Descreva o motivo do descarte...' : 'Algum detalhe a mais?'}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={!canSubmit}>
            {discardMutation.isPending ? 'Descartando...' : 'Descartar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
