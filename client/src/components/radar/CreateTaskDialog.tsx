import { useEffect, useMemo, useState } from 'react';
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
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { formatCnpj, type RadarLead, type RadarEnrichment } from '../../../../shared/radar';
import { buildPhoneOptions, defaultPhoneDigits } from './phoneOptions';

// `YYYY-MM-DD` no fuso local do navegador — formato aceito por
// `<input type="date">` e pelo `reminderDate` de `convert`.
function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Diálogo de confirmação para transformar um lead do Radar em tarefa do CRM.
 * Nada é enviado automaticamente: o botão final só cria a tarefa. O WhatsApp
 * é sempre aberto por um clique separado, à mão, do atendente.
 */
export function CreateTaskDialog({
  open,
  onOpenChange,
  lead,
  enrichment,
  originIbge,
  bags,
  initialMessage,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: RadarLead;
  enrichment: RadarEnrichment | null;
  originIbge: number;
  bags: number;
  initialMessage: string;
  onCreated: (result: { taskId: number }) => void;
}) {
  const isExcluded = lead.crm.kind === 'excluido_antes';

  const phoneOptions = useMemo(() => buildPhoneOptions(lead, enrichment), [lead, enrichment]);

  const [phoneDigits, setPhoneDigits] = useState<string | null>(() => defaultPhoneDigits(phoneOptions));
  const [message, setMessage] = useState(initialMessage);
  const [contactNote, setContactNote] = useState('');
  const [reminderDate, setReminderDate] = useState(todayYmd());
  const [acknowledged, setAcknowledged] = useState(false);

  // Reabrir o diálogo (ex.: outro lead) começa do estado limpo.
  useEffect(() => {
    if (open) {
      setPhoneDigits(defaultPhoneDigits(phoneOptions));
      setMessage(initialMessage);
      setContactNote('');
      setReminderDate(todayYmd());
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
        contactNote: contactNote.trim() || undefined,
        reminderDate: reminderDate || undefined,
      });
      toast.success('Tarefa criada');
      onCreated({ taskId: result.taskId });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar tarefa');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transformar em tarefa</DialogTitle>
          <DialogDescription>
            {lead.nomeFantasia ?? lead.razaoSocial} · {formatCnpj(lead.cnpj)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {phoneOptions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Telefone para contato</p>
              <RadioGroup value={phoneDigits ?? undefined} onValueChange={setPhoneDigits}>
                {phoneOptions.map((p) => (
                  <div key={p.digits} className="flex items-center gap-2">
                    <RadioGroupItem value={p.digits} id={`phone-${p.digits}`} />
                    <Label htmlFor={`phone-${p.digits}`} className="text-sm font-normal cursor-pointer">
                      {p.formatted}
                      {p.isWhatsapp ? (
                        <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">
                          WhatsApp · {p.sourceLabel}
                        </span>
                      ) : (
                        p.likelyMobile && (
                          <span className="ml-1.5 text-[10px] text-emerald-600 font-semibold">provável celular</span>
                        )
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Nenhum telefone encontrado.</p>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Mensagem usada (editável)</p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Escreva a mensagem que foi usada no contato..."
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Resultado do contato</p>
            <Textarea
              value={contactNote}
              onChange={(e) => setContactNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="O que o cliente respondeu?"
            />
          </div>

          <div>
            <Label htmlFor="reminder-date" className="text-xs font-semibold text-slate-500 mb-1.5">
              Próximo retorno
            </Label>
            <Input
              id="reminder-date"
              type="date"
              value={reminderDate}
              min={todayYmd()}
              onChange={(e) => setReminderDate(e.target.value)}
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
            {convertMutation.isPending ? 'Criando...' : 'Transformar em tarefa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LinkToTasks() {
  return (
    <Link href="/tasks" className="text-xs font-semibold text-blue-800 hover:underline">
      Ver em Tarefas
    </Link>
  );
}
