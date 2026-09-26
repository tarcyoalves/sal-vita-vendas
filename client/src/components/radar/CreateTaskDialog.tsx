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
import { Checkbox } from '../ui/checkbox';
import { formatCnpj, waMeLink, type RadarLead, type RadarEnrichment } from '../../../../shared/radar';
import { RADAR_ENRICH_SOURCE_LABELS, formatFoundDigits } from './EnrichmentSection';

interface PhoneOption {
  digits: string;
  formatted: string;
  isWhatsapp: boolean;
  likelyMobile: boolean;
  sourceLabel: string | null;
}

// Dígitos vindos do enriquecedor (achados em wa.me) já são DDD + número, mas
// alguns links de WhatsApp trazem o "55" na frente — normaliza para o mesmo
// formato usado pela base da Receita (10-11 dígitos, sem DDI) e o que
// `convert` espera.
function normalizePhoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d;
}

// WhatsApps achados na web primeiro, depois telefones da Receita — deduplicado
// por dígitos, sem repetir um telefone que já apareceu como WhatsApp.
function buildPhoneOptions(lead: RadarLead, enrichment: RadarEnrichment | null): PhoneOption[] {
  const seen = new Set<string>();
  const options: PhoneOption[] = [];

  const whatsapps = enrichment?.status === 'pronto' ? enrichment.data?.whatsapps ?? [] : [];
  for (const w of whatsapps) {
    const digits = normalizePhoneDigits(w.value);
    if (digits.length !== 10 && digits.length !== 11) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    options.push({
      digits,
      formatted: formatFoundDigits(digits),
      isWhatsapp: true,
      likelyMobile: digits.length === 11,
      sourceLabel: RADAR_ENRICH_SOURCE_LABELS[w.source],
    });
  }
  for (const p of lead.phones) {
    if (seen.has(p.digits)) continue;
    seen.add(p.digits);
    options.push({
      digits: p.digits,
      formatted: p.formatted,
      isWhatsapp: false,
      likelyMobile: p.likelyMobile,
      sourceLabel: null,
    });
  }
  return options;
}

// Padrão de seleção: primeiro WhatsApp achado na web > primeiro provável
// celular da Receita > primeiro telefone da lista.
function defaultPhoneDigits(options: PhoneOption[]): string | null {
  const whatsapp = options.find((o) => o.isWhatsapp);
  if (whatsapp) return whatsapp.digits;
  const mobile = options.find((o) => o.likelyMobile);
  if (mobile) return mobile.digits;
  return options[0]?.digits ?? null;
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
  onCreated: (result: { taskId: number; phoneDigits: string | null; message: string }) => void;
}) {
  const isExcluded = lead.crm.kind === 'excluido_antes';

  const phoneOptions = useMemo(() => buildPhoneOptions(lead, enrichment), [lead, enrichment]);

  const [phoneDigits, setPhoneDigits] = useState<string | null>(() => defaultPhoneDigits(phoneOptions));
  const [message, setMessage] = useState(initialMessage);
  const [acknowledged, setAcknowledged] = useState(false);

  // Reabrir o diálogo (ex.: outro lead) começa do estado limpo.
  useEffect(() => {
    if (open) {
      setPhoneDigits(defaultPhoneDigits(phoneOptions));
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar tarefa');
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
