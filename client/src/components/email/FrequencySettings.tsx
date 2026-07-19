import { useState, useEffect } from "react";
import { Clock, Shield, Info } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Button } from "../ui/button";
import { trpc } from "../../lib/trpc";

// Modelo real (bate 1:1 com server/email/frequency.ts): ligar/desligar + máximo
// de e-mails por lead numa janela de N dias. Aplicado de fato em campanhas
// (buildAudience) e sequências (enrollInSequence) — não é mais localStorage.
export function FrequencySettings() {
  const { data, isLoading } = trpc.emailMarketing.getFrequencyCap.useQuery();
  const saveMutation = trpc.emailMarketing.setFrequencyCap.useMutation();
  const utils = trpc.useUtils();

  const [enabled, setEnabled] = useState(false);
  const [maxEmails, setMaxEmails] = useState(3);
  const [windowDays, setWindowDays] = useState(7);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setMaxEmails(data.maxEmails);
      setWindowDays(data.windowDays);
      setDirty(false);
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({ enabled, maxEmails, windowDays });
      toast.success("Controle de frequência salvo.");
      utils.emailMarketing.getFrequencyCap.invalidate();
      setDirty(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-blue-900 text-base">
          <Shield size={18} /> Controle de frequência
          {!isLoading && (
            <Badge variant="secondary" className={enabled ? "bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]" : "bg-slate-100 text-slate-500 border-slate-200 text-[10px]"}>
              {enabled ? "Ativo" : "Desligado"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600 leading-relaxed">
          Protege a caixa dos seus leads: se um contato já recebeu o máximo de e-mails na janela,
          ele é <strong>pulado automaticamente</strong> em novas campanhas e novas inscrições em sequência.
          Vale para as duas fontes de envio.
        </p>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <Label className="flex items-center gap-1.5 text-sm font-medium">
            <Shield size={14} className="text-blue-700" /> Ativar controle de frequência
          </Label>
          <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); setDirty(true); }} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock size={14} className="text-blue-700" /> Máx. de e-mails por lead
            </Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={maxEmails}
              disabled={!enabled}
              onChange={(e) => { setMaxEmails(Math.max(1, Math.min(50, Number(e.target.value) || 1))); setDirty(true); }}
            />
            <p className="text-[11px] text-slate-400">Teto de mensagens que um mesmo contato pode receber na janela</p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock size={14} className="text-blue-700" /> Janela (dias)
            </Label>
            <Input
              type="number"
              min={1}
              max={90}
              value={windowDays}
              disabled={!enabled}
              onChange={(e) => { setWindowDays(Math.max(1, Math.min(90, Number(e.target.value) || 1))); setDirty(true); }}
            />
            <p className="text-[11px] text-slate-400">Período considerado para contar os envios</p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-700" />
          <p className="text-xs text-blue-800 leading-relaxed">
            Resumo atual: {enabled
              ? <>no máximo <strong>{maxEmails}</strong> e-mail(s) por lead a cada <strong>{windowDays}</strong> dia(s).</>
              : <>desligado — nenhum limite de frequência é aplicado.</>}
            {" "}A contagem usa o histórico real de envios (campanhas + sequências).
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
