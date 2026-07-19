import { useState, useEffect, useCallback } from "react";
import {
  Filter, Plus, Trash2, Save, FolderOpen, X, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { trpc } from "../../lib/trpc";

type FilterField = "status" | "city" | "state" | "company" | "tag" | "lastContact" | "source";

interface FilterRule {
  id: string;
  field: FilterField;
  operator: string;
  value: string;
}

interface SavedSegment {
  id: string;
  name: string;
  filters: FilterRule[];
  createdAt: string;
}

const FIELD_OPTIONS: { value: FilterField; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "city", label: "Cidade" },
  { value: "state", label: "Estado" },
  { value: "company", label: "Empresa" },
  { value: "tag", label: "Tag" },
  { value: "lastContact", label: "Último contato" },
  { value: "source", label: "Origem" },
];

const OPERATORS: Record<FilterField, { value: string; label: string }[]> = {
  status: [
    { value: "is", label: "é" },
    { value: "is_not", label: "não é" },
  ],
  city: [
    { value: "is", label: "é" },
    { value: "contains", label: "contém" },
    { value: "is_not", label: "não é" },
  ],
  state: [
    { value: "is", label: "é" },
    { value: "is_not", label: "não é" },
  ],
  company: [
    { value: "is", label: "é" },
    { value: "contains", label: "contém" },
    { value: "is_not", label: "não é" },
  ],
  tag: [
    { value: "has", label: "possui" },
    { value: "not_has", label: "não possui" },
  ],
  lastContact: [
    { value: "more_than_days", label: "há mais de N dias" },
    { value: "less_than_days", label: "há menos de N dias" },
  ],
  source: [
    { value: "is", label: "é" },
    { value: "is_not", label: "não é" },
  ],
};

const STORAGE_KEY = "sv_email_segments";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function loadSegments(): SavedSegment[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSegments(segments: SavedSegment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(segments));
}

export function SegmentBuilder({
  onApply,
}: {
  onApply?: (filters: FilterRule[]) => void;
}) {
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [segments, setSegments] = useState<SavedSegment[]>([]);
  const [segmentName, setSegmentName] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [preview, setPreview] = useState<{ count: number; sample: { email: string; name: string | null; city: string | null; state: string | null; company: string | null }[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const utils = trpc.useUtils();

  useEffect(() => {
    setSegments(loadSegments());
  }, []);

  const addFilter = useCallback(() => {
    setFilters(prev => [
      ...prev,
      { id: uid(), field: "status", operator: "is", value: "" },
    ]);
  }, []);

  const updateFilter = useCallback((id: string, patch: Partial<FilterRule>) => {
    setFilters(prev =>
      prev.map(f => {
        if (f.id !== id) return f;
        const updated = { ...f, ...patch };
        if (patch.field && patch.field !== f.field) {
          updated.operator = OPERATORS[patch.field][0].value;
          updated.value = "";
        }
        return updated;
      }),
    );
  }, []);

  const removeFilter = useCallback((id: string) => {
    setFilters(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleSave = () => {
    if (!segmentName.trim() || filters.length === 0) return;
    const newSeg: SavedSegment = {
      id: uid(),
      name: segmentName.trim(),
      filters: [...filters],
      createdAt: new Date().toISOString(),
    };
    const updated = [...segments, newSeg];
    setSegments(updated);
    saveSegments(updated);
    setSegmentName("");
  };

  const handleLoad = (seg: SavedSegment) => {
    setFilters([...seg.filters]);
    setShowSaved(false);
    setPreview(null);
    onApply?.(seg.filters);
  };

  const handleDelete = (id: string) => {
    const updated = segments.filter(s => s.id !== id);
    setSegments(updated);
    saveSegments(updated);
  };

  const handleApply = async () => {
    setPreviewing(true);
    setPreview(null);
    try {
      const res = await utils.emailMarketing.previewSegment.fetch({
        filters: filters.map(f => ({ field: f.field, operator: f.operator, value: f.value })),
      });
      setPreview(res);
      onApply?.(filters);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao avaliar segmento");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-blue-900 text-base">
          <Filter size={18} /> Segmentação dinâmica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Crie filtros combinados (lógica <strong>E</strong>) e clique <strong>Aplicar</strong> para ver
          quantos contatos da sua base (Leads importados) correspondem. Os segmentos ficam salvos no navegador
          para reusar. <span className="text-slate-400">Campo "Último contato" = dias desde que o contato foi adicionado.</span>
        </p>

        {filters.map(f => (
          <div key={f.id} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            {filters.indexOf(f) > 0 && (
              <Badge variant="outline" className="mb-1 bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-bold">
                E
              </Badge>
            )}
            <div className="min-w-[130px] flex-1">
              <Label className="text-[11px] text-slate-500">Campo</Label>
              <Select value={f.field} onValueChange={v => updateFilter(f.id, { field: v as FilterField })}>
                <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[120px]">
              <Label className="text-[11px] text-slate-500">Operador</Label>
              <Select value={f.operator} onValueChange={v => updateFilter(f.id, { operator: v })}>
                <SelectTrigger className="w-full h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS[f.field].map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px] flex-1">
              <Label className="text-[11px] text-slate-500">Valor</Label>
              <Input
                className="h-9"
                value={f.value}
                onChange={e => updateFilter(f.id, { value: e.target.value })}
                placeholder={f.field === "lastContact" ? "Ex: 30" : "Ex: São Paulo"}
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-red-600 h-9 w-9 p-0"
              onClick={() => removeFilter(f.id)}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={addFilter}>
            <Plus size={14} className="mr-1" /> Adicionar filtro
          </Button>

          {filters.length > 0 && (
            <>
              <div className="flex items-end gap-2">
                <Input
                  className="h-9 w-40"
                  value={segmentName}
                  onChange={e => setSegmentName(e.target.value)}
                  placeholder="Nome do segmento"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSave}
                  disabled={!segmentName.trim()}
                >
                  <Save size={14} className="mr-1" /> Salvar
                </Button>
              </div>
              <Button
                size="sm"
                className="bg-blue-900 hover:bg-blue-800"
                onClick={handleApply}
                disabled={previewing}
              >
                <Filter size={14} className="mr-1" /> {previewing ? "Avaliando..." : "Aplicar segmento"}
              </Button>
            </>
          )}

          {segments.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSaved(!showSaved)}
            >
              <FolderOpen size={14} className="mr-1" />
              Salvos ({segments.length})
            </Button>
          )}
        </div>

        {showSaved && segments.length > 0 && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Segmentos salvos</p>
            {segments.map(seg => (
              <div key={seg.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700 truncate">{seg.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {seg.filters.length} filtro{seg.filters.length !== 1 ? "s" : ""} &middot;{" "}
                    {new Date(seg.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => handleLoad(seg)}>
                    Carregar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                    onClick={() => handleDelete(seg.id)}
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {preview && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-blue-700" />
              <span className="text-sm font-semibold text-blue-900">
                {preview.count} contato{preview.count === 1 ? "" : "s"} correspondem
              </span>
            </div>
            {preview.sample.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Amostra</p>
                {preview.sample.map((c) => (
                  <div key={c.email} className="text-xs text-slate-600 flex flex-wrap gap-x-2">
                    <span className="font-medium text-slate-800">{c.name || c.email}</span>
                    <span className="text-slate-400">{c.email}</span>
                    {(c.city || c.state) && <span className="text-slate-400">{[c.city, c.state].filter(Boolean).join("/")}</span>}
                    {c.company && <span className="text-slate-400">{c.company}</span>}
                  </div>
                ))}
                {preview.count > preview.sample.length && (
                  <p className="text-[11px] text-slate-400">… e mais {preview.count - preview.sample.length}.</p>
                )}
              </div>
            )}
            {preview.count === 0 && <p className="text-xs text-slate-500">Nenhum contato bate com esses filtros.</p>}
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          A contagem roda sobre a base de <strong>Leads importados</strong> (contatos de e-mail marketing).
          Os filtros ficam salvos no navegador para reuso.
        </p>
      </CardContent>
    </Card>
  );
}
