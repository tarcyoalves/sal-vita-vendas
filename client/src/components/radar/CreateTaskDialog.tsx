import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
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
import { Checkbox } from '../ui/checkbox';
import { formatCnpj, waMeLink, type RadarLead } from '../../../../shared/radar';

/**
 * Diálogo de confirmação para transformar um lead do Radar em tarefa do CRM.
 * Nada é enviado automaticamente: o botão final só cria a tarefa. O WhatsApp
 * é sempre aberto por um clique separado, à mão, do atendente.
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
  lead,
  originIbge,
  bags,
  initialMessage,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: RadarLead;
  originIbge: number;
  bags: number;
  initialMessage: string;
  onCreated: (result: { taskId: number; phoneDigits: string | null; message: string }) => void;
}) {
  const isExcluded = lead.crm.kind === 'excluido_antes';

  const [phoneDigits, setPhoneDigits] = useState<string | null>(() => {
    const mobile = lead.phones.find((p) => p.likelyMobile);
    return (mobile ?? lead.phones[0])?.digits ?? null;
  });
  const [message, setMessage] = useState(initialMessage);
  const [acknowledged, setAcknowledged] = useState(false);

  // Reabrir o diálogo (ex.: outro lead) começa do estado limpo.
  useEffect(() => {
    if (open) {
      const mobile = lead.phones.find((p) => p.likelyMobile);
      setPhoneDigits((mobile ?? lead.phones[0])?.digits ?? null);
      setMessage(initialMessage);
      setAcknowledged(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.cnpj]);

  const convertMutation = trpc.prospectingRadar.convert.useMutation();

  const canSubmit = !convertMutation.isPending && (!isExcluded || acknowledged);

  const handleSubmit = async () => {
    try {
      const result = await convertMutation.mutateAsync({
        cnpj: lead.cnpj,
        originIbge,
        bags,
        message: message.trim() || undefined,
        phoneDigits: phoneDigits ?? undefined,
        acknowledgeExcluded: isExcluded ? acknowledged : undefined,
      });
      toast.success('Tarefa criada');
      onCreated({ taskId: result.taskId, phoneDigits, message });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Erro ao criar tarefa');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Criar tarefa</DialogTitle>
          <DialogDescription>
            {lead.nomeFantasia ?? lead.razaoSocial} · {formatCnpj(lead.cnpj)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {lead.phones.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Telefone para contato</p>
              <RadioGroup value={phoneDigits ?? undefined} onValueChange={setPhoneDigits}>
                {lead.phones.map((p) => (
                  <div key={p.digits} className="flex items-center gap-2">
                    <RadioGroupItem value={p.digits} id={`phone-${p.digits}`} />
                    <Label htmlFor={`phone-${p.digits}`} className="text-sm font-normal cursor-pointer">
                      {p.formatted}
                      {p.likelyMobile && (
                        <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">provável celular</span>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Nenhum telefone cadastrado na base.</p>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Mensagem (editável)</p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Escreva a mensagem que será usada no WhatsApp..."
            />
          </div>

          {isExcluded && lead.crm.kind === 'excluido_antes' && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs text-amber-800">
                <strong>Excluído antes:</strong> {lead.crm.reason} (por {lead.crm.deletedByName})
              </p>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="ack-excluded"
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="ack-excluded" className="text-xs font-medium text-amber-900 cursor-pointer">
                  Vi o motivo e quero seguir
                </Label>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {convertMutation.isPending ? 'Criando...' : 'Criar tarefa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Botão "Abrir WhatsApp" exibido depois que a tarefa foi criada. */
export function OpenWhatsAppButton({ phoneDigits, message }: { phoneDigits: string; message: string }) {
  return (
    <a
      href={waMeLink(phoneDigits, message)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
    >
      Abrir WhatsApp
    </a>
  );
}

export function LinkToTasks() {
  return (
    <Link href="/tasks" className="text-xs font-semibold text-blue-800 hover:underline">
      Ver em Tarefas
    </Link>
  );
}
