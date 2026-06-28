import { useState, useEffect } from "react";
import { Clock, Shield, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";

interface FrequencyConfig {
  maxPerDay: number;
  maxPerWeek: number;
  maxPerMonth: number;
  minIntervalHours: number;
  respectBusinessHours: boolean;
  businessHoursStart: number;
  businessHoursEnd: number;
}

const STORAGE_KEY = "sv_email_frequency";

const DEFAULTS: FrequencyConfig = {
  maxPerDay: 1,
  maxPerWeek: 3,
  maxPerMonth: 8,
  minIntervalHours: 24,
  respectBusinessHours: true,
  businessHoursStart: 8,
  businessHoursEnd: 18,
};

function loadConfig(): FrequencyConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULTS };
}

function saveConfig(config: FrequencyConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function FrequencySettings() {
  const [config, setConfig] = useState<FrequencyConfig>(DEFAULTS);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const update = (patch: Partial<FrequencyConfig>) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveConfig(next);
  };

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-blue-900 text-base">
          <Shield size={18} /> Controle de frequência
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
            Em breve
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-slate-600 leading-relaxed">
          Defina limites de frequência para proteger a reputação do seu domínio e evitar que
          contatos recebam e-mails em excesso. Estas configurações são salvas localmente.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock size={14} className="text-blue-700" /> Máx. por dia
            </Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.maxPerDay}
              onChange={e => update({ maxPerDay: Math.max(1, Math.min(10, Number(e.target.value))) })}
              disabled
              title="Disponível em julho"
            />
            <p className="text-[11px] text-slate-400">Limite de e-mails por contato/dia</p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock size={14} className="text-blue-700" /> Máx. por semana
            </Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={config.maxPerWeek}
              onChange={e => update({ maxPerWeek: Math.max(1, Math.min(30, Number(e.target.value))) })}
              disabled
              title="Disponível em julho"
            />
            <p className="text-[11px] text-slate-400">Limite de e-mails por contato/semana</p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock size={14} className="text-blue-700" /> Máx. por mês
            </Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={config.maxPerMonth}
              onChange={e => update({ maxPerMonth: Math.max(1, Math.min(100, Number(e.target.value))) })}
              disabled
              title="Disponível em julho"
            />
            <p className="text-[11px] text-slate-400">Limite de e-mails por contato/mês</p>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Clock size={14} className="text-blue-700" /> Intervalo mínimo (horas)
            </Label>
            <Input
              type="number"
              min={1}
              max={168}
              value={config.minIntervalHours}
              onChange={e => update({ minIntervalHours: Math.max(1, Math.min(168, Number(e.target.value))) })}
              disabled
              title="Disponível em julho"
            />
            <p className="text-[11px] text-slate-400">Horas mínimas entre e-mails para o mesmo contato</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Clock size={14} className="text-blue-700" /> Respeitar horário comercial
            </Label>
            <Switch
              checked={config.respectBusinessHours}
              onCheckedChange={v => update({ respectBusinessHours: v })}
              disabled
              title="Disponível em julho"
            />
          </div>
          {config.respectBusinessHours && (
            <div className="grid grid-cols-2 gap-3 pl-5">
              <div>
                <Label className="text-[11px] text-slate-500">Início</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={config.businessHoursStart}
                  onChange={e => update({ businessHoursStart: Math.max(0, Math.min(23, Number(e.target.value))) })}
                  disabled
                  title="Disponível em julho"
                />
              </div>
              <div>
                <Label className="text-[11px] text-slate-500">Fim</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={config.businessHoursEnd}
                  onChange={e => update({ businessHoursEnd: Math.max(0, Math.min(23, Number(e.target.value))) })}
                  disabled
                  title="Disponível em julho"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-700" />
          <p className="text-xs text-blue-800 leading-relaxed">
            As configurações de frequência são salvas no navegador. Quando a integração com o backend estiver
            pronta, esses limites serão aplicados automaticamente a campanhas e sequências.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
