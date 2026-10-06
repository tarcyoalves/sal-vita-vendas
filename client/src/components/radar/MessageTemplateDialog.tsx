import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessageSquareText } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import {
  CONTACT_TEMPLATE_FIELDS,
  CONTACT_TEMPLATE_MAX,
  DEFAULT_CONTACT_TEMPLATE,
  renderContactMessage,
} from './contactMessage';
import { useContactTemplate } from './useContactTemplate';

/** Cada atendente ajusta a própria mensagem padrão do Buscador (WhatsApp). */
export function MessageTemplateDialog() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const saved = useContactTemplate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(DEFAULT_CONTACT_TEMPLATE);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Ao abrir, parte do modelo salvo (ou do padrão da empresa).
  useEffect(() => {
    if (open) setText(saved ?? DEFAULT_CONTACT_TEMPLATE);
  }, [open, saved]);

  const save = trpc.prospectingRadar.setMessageTemplate.useMutation({
    onSuccess: async (r) => {
      await utils.prospectingRadar.messageTemplate.invalidate();
      toast.success(r.template ? 'Mensagem padrão salva' : 'Voltou para a mensagem padrão da empresa');
      setOpen(false);
    },
    onError: (e) => toast.error(e.message ?? 'Não foi possível salvar'),
  });

  function insertField(key: string) {
    const el = areaRef.current;
    const tag = `{${key}}`;
    if (!el) {
      setText((t) => t + tag);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    setText(text.slice(0, start) + tag + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + tag.length, start + tag.length);
    });
  }

  const preview = renderContactMessage(text, {
    attendantName: user?.name ?? 'Seu nome',
    cityLabel: 'Lima Duarte - MG',
    bags: 480,
  });
  const igualPadrao = text.trim() === DEFAULT_CONTACT_TEMPLATE;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1.5">
          <MessageSquareText size={13} /> Minha mensagem
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Minha mensagem padrão</DialogTitle>
          <DialogDescription>
            É o texto que já vem pronto no botão de WhatsApp dos cartões. Só vale para você.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={CONTACT_TEMPLATE_MAX}
            className="text-sm"
            aria-label="Texto da mensagem padrão"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Inserir:</span>
            {CONTACT_TEMPLATE_FIELDS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => insertField(f.key)}
                title={f.label}
                className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
              >
                {`{${f.key}}`}
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
            <p className="text-[11px] font-semibold text-emerald-800 mb-1">Como vai aparecer (exemplo)</p>
            <p className="text-xs text-emerald-900 whitespace-pre-wrap">{preview}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setText(DEFAULT_CONTACT_TEMPLATE)} disabled={igualPadrao}>
            Restaurar padrão da empresa
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={save.isPending || !text.trim()}
            onClick={() => save.mutate({ template: igualPadrao ? null : text })}
          >
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
