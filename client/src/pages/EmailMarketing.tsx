import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { RichTextEditor } from "../components/RichTextEditor";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Switch } from "../components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "../components/ui/tabs";
import { Checkbox } from "../components/ui/checkbox";
import {
  Mail, Plus, Send, Trash2, Eye, Pencil, Workflow, Zap, Tag, BarChart3, Users, Pause, Play, X, Download,
  LayoutTemplate, MailX, Filter, Sparkles, Inbox, Megaphone, Paperclip, FileText, Contact, Search,
  CheckCircle, XCircle, AlertTriangle, RotateCcw, Gauge, TrendingUp, Upload, UserPlus, FolderOpen, FolderPlus, ArrowRightLeft,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Source = "leads" | "clients" | "contacts" | "both" | "all";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sending: "Enviando",
  sent: "Enviado",
};

const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  failed: "Falhou",
  skipped: "Ignorado",
};

const TEMPLATE_HINT = "Use {nome}, {empresa} e {unsubscribe} no corpo do e-mail. {unsubscribe} é substituído pelo link de descadastro.";

const SEND_CONDITION_LABELS: Record<string, string> = {
  always: "Sempre",
  if_opened: "Se abriu algum anterior",
  if_not_opened: "Se NÃO abriu nenhum",
  if_clicked: "Se clicou em algum",
  if_not_clicked: "Se NÃO clicou em nenhum",
};

const SEND_CONDITION_BADGES: Record<string, string> = {
  if_opened: "🔀 se abriu",
  if_not_opened: "🔀 se não abriu",
  if_clicked: "🔀 se clicou",
  if_not_clicked: "🔀 se não clicou",
};

const SEND_CONDITION_HINT = "Para ramificar (abriu vs. não abriu), crie dois passos com o MESMO atraso (delay) — um com 'Se abriu' e outro com 'Se NÃO abriu'. O sistema envia o que casa e pula o outro.";

const REPEAT_HINT = "Útil para e-mails recorrentes de marca. Ao terminar o último passo, recomeça do início após o intervalo.";

const EXPORT_CONVERTED_LABELS: Record<string, string> = {
  yes: "Sim",
  no: "Não",
};

const EXPORT_ENGAGEMENT_LABELS: Record<string, string> = {
  opened: "Abriu",
  not_opened: "Não abriu",
  clicked: "Clicou",
  not_clicked: "Não clicou",
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  lead_created: "Novo lead criado",
  lead_converted: "Lead convertido em cliente",
  inactive_days: "Sem contato há N dias",
  tag_added: "Tag adicionada ao lead",
  email_confirmed: "E-mail confirmado",
  sequence_completed: "Sequência concluída",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  enroll_sequence: "Inscrever em sequência",
  add_tag: "Adicionar tag",
};

// Vivid color treatments layered on top of the base badge variants, keyed by status value.
const STATUS_BADGE_CLASS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 border-slate-200",
  sending: "bg-amber-100 text-amber-700 border-amber-200",
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const RECIPIENT_STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600 border-slate-200",
  sent: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  skipped: "bg-slate-100 text-slate-500 border-slate-200",
};

const ENROLLMENT_STATUS_BADGE_CLASS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

// Shared table chrome classes used across every list/table in this page.
const THEAD_CLASS = "bg-slate-50 border-b border-slate-200";
const TH_CLASS = "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500";
const TR_CLASS = "border-b border-slate-100 hover:bg-blue-50/50 transition-colors";

// Friendly placeholder shown when a table/list has no rows yet.
function EmptyState({ icon: Icon, message }: { icon: LucideIcon; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 px-4 text-center">
      <Icon size={28} className="text-slate-300" />
      <p className="text-sm text-slate-500 max-w-sm">{message}</p>
    </div>
  );
}

// Small stat tile with an icon accent, used in stat grids and detail dialogs.
function StatTile({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: ReactNode; accent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "--";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Human-readable description of an automation rule's trigger, including config (e.g. days).
function describeTrigger(rule: { triggerType: string; triggerConfig?: any; requiredTags?: string[] | null; excludedTags?: string[] | null }, sequences?: { id: number; name: string }[]): string {
  const base = TRIGGER_TYPE_LABELS[rule.triggerType] ?? rule.triggerType;
  const parts: string[] = [];
  if (rule.triggerType === 'inactive_days') {
    const days = rule.triggerConfig?.days;
    parts.push(days ? `Sem contato há ${days} dia(s)` : base);
  } else if (rule.triggerType === 'tag_added') {
    parts.push(`Tag "${rule.triggerConfig?.tag ?? '?'}" adicionada`);
  } else if (rule.triggerType === 'sequence_completed') {
    const seqId = rule.triggerConfig?.sequenceId;
    const seq = seqId ? sequences?.find(s => s.id === seqId) : null;
    parts.push(seq ? `Sequência "${seq.name}" concluída` : 'Qualquer sequência concluída');
  } else {
    parts.push(base);
  }
  if (rule.requiredTags?.length) parts.push(`✅ tem: ${rule.requiredTags.join(', ')}`);
  if (rule.excludedTags?.length) parts.push(`🚫 sem: ${rule.excludedTags.join(', ')}`);
  return parts.join(' · ');
}

function describeAction(rule: { actionType: string; actionConfig?: any; cancelOtherSequences?: boolean }, sequences?: { id: number; name: string }[]): string {
  if (rule.actionType === 'enroll_sequence') {
    const seqId = rule.actionConfig?.sequenceId;
    const seq = sequences?.find(s => s.id === seqId);
    let desc = `Inscrever em sequência "${seq?.name ?? `#${seqId}`}"`;
    if (rule.cancelOtherSequences) desc += ' (cancela outras)';
    return desc;
  }
  if (rule.actionType === 'add_tag') {
    return `Adicionar tag "${rule.actionConfig?.tag ?? ''}"`;
  }
  return ACTION_TYPE_LABELS[rule.actionType] ?? rule.actionType;
}

export default function EmailMarketing() {
  const { user } = useAuth();

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  const TAB_TRIGGER_CLASS =
    "gap-1.5 rounded-xl px-3 py-2 text-slate-500 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md";

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 px-5 py-5 md:px-7 md:py-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-48 w-48 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3 md:gap-4">
          <div className="flex h-11 w-11 md:h-14 md:w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Mail size={26} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-2xl font-bold tracking-tight">E-mail Marketing</h1>
              <Sparkles size={16} className="text-sky-300 hidden sm:block" />
            </div>
            <p className="text-xs md:text-sm text-blue-200/80 mt-0.5">
              Campanhas, sequências automáticas e automações para nutrir e converter leads
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList className="flex-nowrap overflow-x-auto scrollbar-hide justify-start gap-1 rounded-2xl bg-slate-100 p-1.5">
          <TabsTrigger value="campaigns" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <Send size={14} /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="sequences" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <Workflow size={14} /> Sequências
          </TabsTrigger>
          <TabsTrigger value="automations" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <Zap size={14} /> Automações
          </TabsTrigger>
          <TabsTrigger value="templates" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <LayoutTemplate size={14} /> Templates
          </TabsTrigger>
          <TabsTrigger value="tags" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <Tag size={14} /> Tags
          </TabsTrigger>
          <TabsTrigger value="contacts" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <Contact size={14} /> Contatos
          </TabsTrigger>
          <TabsTrigger value="usage" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <Gauge size={14} /> Consumo
          </TabsTrigger>
          <TabsTrigger value="stats" className={`${TAB_TRIGGER_CLASS} flex-shrink-0`}>
            <BarChart3 size={14} /> Estatísticas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="sequences" className="mt-4">
          <SequencesTab />
        </TabsContent>
        <TabsContent value="automations" className="mt-4">
          <AutomationsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="tags" className="mt-4">
          <TagsTab />
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <ContactsTab />
        </TabsContent>
        <TabsContent value="usage" className="mt-4">
          <UsageTab />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Assistente de IA para e-mail ─────────────────────────────────────────────
// Painel compacto reutilizado nos editores de campanha, broadcast, template e
// passo de sequência. Sob demanda (1 clique = 1 chamada), respeitando a cota.
const AI_TONES = [
  { value: "cordial", label: "Cordial" },
  { value: "formal", label: "Formal" },
  { value: "persuasivo", label: "Persuasivo" },
  { value: "urgente", label: "Urgente" },
  { value: "amigavel", label: "Amigável" },
] as const;

function AiEmailComposer({ html, onApply }: {
  html: string;
  onApply: (next: { subject?: string; html?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState<string>("cordial");
  const [subjects, setSubjects] = useState<string[]>([]);
  const gen = trpc.ai.generateEmailCopy.useMutation();

  const run = async (mode: "full" | "subjects" | "rewrite") => {
    if (mode !== "subjects" && mode !== "rewrite" && !brief.trim()) {
      toast.error("Descreva o e-mail que você quer gerar.");
      return;
    }
    if (mode === "rewrite" && !html.trim()) {
      toast.error("Escreva ou gere um corpo primeiro para reescrever.");
      return;
    }
    try {
      const res: any = await gen.mutateAsync({
        brief: brief.trim() || "E-mail de relacionamento da Sal Vita",
        tone: tone as any,
        mode,
        currentHtml: mode === "rewrite" ? html : undefined,
      });
      if (res.error) { toast.error(res.error); return; }
      const next: { subject?: string; html?: string } = {};
      if (res.html) next.html = res.html;
      if (res.subjects?.length) { setSubjects(res.subjects); next.subject = res.subjects[0]; }
      onApply(next);
      toast.success(mode === "subjects" ? "Assuntos gerados!" : "Conteúdo gerado! Revise antes de enviar.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar.");
    }
  };

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-2.5 mb-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm font-semibold text-violet-700"
      >
        <Sparkles size={15} /> Assistente de IA {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2.5 space-y-2.5">
          <Textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            placeholder='Descreva o e-mail. Ex: "Reativar clientes que não compram há 60 dias, oferecendo condição especial no sal grosso."'
            className="text-base min-h-[70px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={() => run("full")} disabled={gen.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white">
              {gen.isPending ? "⏳ Gerando..." : "✨ Gerar e-mail"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => run("subjects")} disabled={gen.isPending}>
              Só assuntos
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => run("rewrite")} disabled={gen.isPending}>
              Reescrever atual
            </Button>
          </div>
          {subjects.length > 1 && (
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Outras opções de assunto (clique para usar):</p>
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((s, i) => (
                  <button key={i} type="button" onClick={() => onApply({ subject: s })}
                    className="text-xs px-2 py-1 rounded-full border border-violet-300 bg-white text-violet-700 hover:bg-violet-100">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-slate-400">A IA gera um rascunho — sempre revise antes de enviar. Use {"{{nome}}"} e {"{{empresa}}"} para personalizar.</p>
        </div>
      )}
    </div>
  );
}

// ── Campanhas ──────────────────────────────────────────────────────────────

function CampaignsTab() {
  const utils = trpc.useUtils();
  const { data: campaigns, isLoading } = trpc.emailMarketing.listCampaigns.useQuery();
  const { data: templates } = trpc.emailMarketing.listTemplates.useQuery();
  const { data: sellers } = trpc.sellers.list.useQuery();

  const createMutation = trpc.emailMarketing.createCampaign.useMutation();
  const deleteMutation = trpc.emailMarketing.deleteCampaign.useMutation();
  const processBatchMutation = trpc.emailMarketing.processBatch.useMutation();
  const broadcastMutation = trpc.emailMarketing.sendBroadcast.useMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", subject: "", htmlBody: "",
    source: "leads" as Source, assignedTo: "",
  });

  // ── Disparo Rápido (Broadcast) ──
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [bcastMode, setBcastMode] = useState<"manual" | "audience">("manual");
  const [bcast, setBcast] = useState({
    name: "", subject: "", htmlBody: "", replyTo: "", recipientsRaw: "",
    audSource: "leads" as Source, audAssignedTo: "", audTags: [] as string[],
  });
  const [bcastFiles, setBcastFiles] = useState<{ filename: string; content: string; size: number }[]>([]);
  const resetBroadcast = () => {
    setBcast({ name: "", subject: "", htmlBody: "", replyTo: "", recipientsRaw: "", audSource: "leads", audAssignedTo: "", audTags: [] });
    setBcastFiles([]);
    setBcastMode("manual");
  };

  // Parse emails pasted in any separator (comma, semicolon, space, newline).
  const parsedEmails = useMemo(() => {
    const tokens = bcast.recipientsRaw.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid: string[] = [];
    const invalid: string[] = [];
    const seen = new Set<string>();
    for (const t of tokens) {
      const lower = t.toLowerCase();
      if (re.test(t)) {
        if (!seen.has(lower)) { seen.add(lower); valid.push(lower); }
      } else {
        invalid.push(t);
      }
    }
    return { valid, invalid };
  }, [bcast.recipientsRaw]);

  const { data: availTags } = trpc.emailMarketing.listTags.useQuery(undefined, { enabled: showBroadcast && bcastMode === 'audience' });

  const { data: bcastAudiencePreview } = trpc.emailMarketing.audiencePreview.useQuery(
    { source: bcast.audSource, assignedTo: bcast.audAssignedTo || undefined, tags: bcast.audTags.length > 0 ? bcast.audTags : undefined },
    { enabled: showBroadcast && bcastMode === 'audience' }
  );

  const totalAttachBytes = bcastFiles.reduce((s, f) => s + f.size, 0);

  const handleApplyTemplateBroadcast = (templateId: string) => {
    const t = templates?.find(t => t.id === Number(templateId));
    if (!t) return;
    setBcast(b => ({ ...b, subject: t.subject, htmlBody: t.htmlBody, name: b.name || t.name }));
    if ((t as any).attachments?.length) {
      setBcastFiles((t as any).attachments.map((a: any) => ({ filename: a.filename, content: a.content, size: Math.ceil((a.content.length * 3) / 4) })));
    } else {
      setBcastFiles([]);
    }
  };

  const handleAddFiles = async (files: FileList | null) => {
    if (!files) return;
    const next = [...bcastFiles];
    for (const file of Array.from(files)) {
      // Read as base64 (strip the "data:...;base64," prefix).
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push({ filename: file.name, content, size: file.size });
    }
    setBcastFiles(next);
  };

  const handleSendBroadcast = async () => {
    if (!bcast.subject.trim() || !bcast.htmlBody.trim()) {
      toast.error("Preencha assunto e corpo do e-mail");
      return;
    }
    if (bcastMode === 'manual' && parsedEmails.valid.length === 0) {
      toast.error("Adicione ao menos um e-mail válido");
      return;
    }
    if (bcastMode === 'audience' && (!bcastAudiencePreview || bcastAudiencePreview.count === 0)) {
      toast.error("Nenhum destinatário encontrado com os filtros selecionados");
      return;
    }
    if (totalAttachBytes > 3_500_000) {
      toast.error("Anexos muito grandes (máx. ~3,5 MB no total)");
      return;
    }
    try {
      const payload: Parameters<typeof broadcastMutation.mutateAsync>[0] = {
        name: bcast.name || undefined,
        subject: bcast.subject,
        htmlBody: bcast.htmlBody,
        replyTo: bcast.replyTo || undefined,
        attachments: bcastFiles.length > 0 ? bcastFiles.map(f => ({ filename: f.filename, content: f.content })) : undefined,
      };
      if (bcastMode === 'manual') {
        payload.recipients = parsedEmails.valid.map(email => ({ email }));
      } else {
        payload.audienceSource = bcast.audSource;
        if (bcast.audAssignedTo) payload.audienceAssignedTo = bcast.audAssignedTo;
        if (bcast.audTags.length > 0) payload.audienceTags = bcast.audTags;
      }
      const res = await broadcastMutation.mutateAsync(payload);
      toast.success(`Disparo criado: ${res.recipientCount} destinatário(s). Enviando...`);
      setShowBroadcast(false);
      resetBroadcast();
      await utils.emailMarketing.listCampaigns.invalidate();
      await handleSend(res.campaignId);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar disparo");
    }
  };

  const { data: preview } = trpc.emailMarketing.audiencePreview.useQuery(
    { source: form.source, assignedTo: form.assignedTo || undefined },
    { enabled: showCreate }
  );

  const [detailCampaignId, setDetailCampaignId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [sendProgress, setSendProgress] = useState<{ sentNow: number; failedNow: number; remaining: number } | null>(null);

  const resetForm = () => setForm({ name: "", subject: "", htmlBody: "", source: "leads", assignedTo: "" });

  const handleApplyTemplate = (templateId: string) => {
    const t = templates?.find(t => t.id === Number(templateId));
    if (!t) return;
    setForm(f => ({ ...f, subject: t.subject, htmlBody: t.htmlBody, name: f.name || t.name }));
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.subject.trim() || !form.htmlBody.trim()) {
      toast.error("Preencha nome, assunto e corpo do e-mail");
      return;
    }
    try {
      await createMutation.mutateAsync({
        name: form.name, subject: form.subject, htmlBody: form.htmlBody,
        source: form.source, assignedTo: form.assignedTo || undefined,
      });
      toast.success("Campanha criada!");
      setShowCreate(false);
      resetForm();
      utils.emailMarketing.listCampaigns.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar campanha");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir esta campanha e todos os destinatários?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Campanha excluída");
    utils.emailMarketing.listCampaigns.invalidate();
  };

  const handleSend = async (campaignId: number) => {
    setSendingId(campaignId);
    setSendProgress(null);
    try {
      let done = false;
      while (!done) {
        const res = await processBatchMutation.mutateAsync({ campaignId });
        setSendProgress({ sentNow: res.sentNow, failedNow: res.failedNow, remaining: res.remaining });
        done = res.done;
        if ('reason' in res && res.reason === 'daily_limit_all') {
          toast.warning("Limite diário das contas de e-mail atingido. Continue mais tarde.");
          break;
        }
        await utils.emailMarketing.listCampaigns.invalidate();
        if (!done) await new Promise(r => setTimeout(r, 1200));
      }
      if (done) toast.success("Envio da campanha concluído!");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar campanha");
    } finally {
      setSendingId(null);
      utils.emailMarketing.listCampaigns.invalidate();
      utils.emailMarketing.getCampaign.invalidate();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          className="border-blue-200 text-blue-900 hover:bg-blue-50 shadow-sm"
          onClick={() => setShowBroadcast(true)}
        >
          <Megaphone size={16} className="mr-1" /> Disparo Rápido
        </Button>
        <Button className="bg-blue-900 hover:bg-blue-800 shadow-sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" /> Nova Campanha
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send size={16} className="text-blue-900" /> Campanhas <span className="text-slate-400 font-normal">({campaigns?.length ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[640px]">
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>Nome</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Destinatários</th>
                    <th className={TH_CLASS}>Enviados</th>
                    <th className={TH_CLASS}>Falhas</th>
                    <th className={TH_CLASS}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id} className={TR_CLASS}>
                      <td className="px-3 py-2.5 font-medium text-slate-700">
                        <span className="flex items-center gap-1.5">
                          {c.name}
                          {c.isBroadcast && (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 gap-1">
                              <Megaphone size={11} /> Disparo
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={STATUS_BADGE_CLASS[c.status] ?? ""}>
                          {STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">{c.totalRecipients}</td>
                      <td className="px-3 py-2.5 text-emerald-700 font-medium">{c.sentCount}</td>
                      <td className="px-3 py-2.5 text-red-600 font-medium">{c.failedCount}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setDetailCampaignId(c.id)}>
                            <Eye size={14} className="mr-1" /> Ver
                          </Button>
                          {c.status !== "sent" && (
                            <Button
                              size="sm"
                              className="bg-blue-900 hover:bg-blue-800"
                              onClick={() => handleSend(c.id)}
                              disabled={sendingId !== null}
                            >
                              <Send size={14} className="mr-1" />
                              {sendingId === c.id ? "Enviando..." : "Enviar"}
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(c.id)} disabled={sendingId === c.id}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                        {sendingId === c.id && sendProgress && (
                          <div className="mt-2 w-48">
                            <Progress value={sendProgress.remaining === 0 ? 100 : Math.max(5, 100 - sendProgress.remaining)} />
                            <p className="text-xs text-gray-500 mt-1">
                              +{sendProgress.sentNow} enviados, {sendProgress.failedNow} falhas — restam {sendProgress.remaining}
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Send} message="Nenhuma campanha criada ainda. Clique em “Nova Campanha” para enviar seu primeiro disparo." />
          )}
        </CardContent>
      </Card>

      {/* Create campaign dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><Mail size={16} /></span>
              Nova Campanha
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome da campanha</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promoção de Junho" />
            </div>

            {templates && templates.length > 0 && (
              <div>
                <Label>Aplicar template (opcional)</Label>
                <Select onValueChange={handleApplyTemplate}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar template..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <AiEmailComposer
              html={form.htmlBody}
              onApply={({ subject, html }) => setForm(f => ({ ...f, ...(subject !== undefined ? { subject } : {}), ...(html !== undefined ? { htmlBody: html } : {}) }))}
            />

            <div>
              <Label>Assunto</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Ex: Olá {nome}, confira nossas novidades!" />
            </div>

            <div>
              <Label>Corpo do e-mail</Label>
              <RichTextEditor
                value={form.htmlBody}
                onChange={html => setForm(f => ({ ...f, htmlBody: html }))}
                placeholder="Olá {nome}, ..."
                minHeight={350}
              />
              <p className="text-xs text-gray-500 mt-1">{TEMPLATE_HINT}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Público</Label>
                <Select value={form.source} onValueChange={(v: Source) => setForm(f => ({ ...f, source: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leads">Leads (Tarefas)</SelectItem>
                    <SelectItem value="clients">Clientes</SelectItem>
                    <SelectItem value="contacts">Leads importados (CSV)</SelectItem>
                    <SelectItem value="both">Leads + Clientes</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.source !== "clients" && (
                <div>
                  <Label>Atendente (opcional)</Label>
                  <Select value={form.assignedTo || "__all__"} onValueChange={(v) => setForm(f => ({ ...f, assignedTo: v === "__all__" ? "" : v }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {sellers?.map(s => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <Users size={18} className="mt-0.5 flex-shrink-0 text-blue-700" />
              <div>
                Público estimado: <strong>{preview?.count ?? 0}</strong> destinatário(s)
                {preview?.sample && preview.sample.length > 0 && (
                  <p className="text-xs text-blue-700/80 mt-1">
                    Exemplos: {preview.sample.slice(0, 5).map(s => s.name || s.email).join(", ")}
                    {preview.count > 5 ? "..." : ""}
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Campanha"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => { setShowCreate(false); resetForm(); }}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disparo Rápido (Broadcast) dialog */}
      <Dialog open={showBroadcast} onOpenChange={(open) => { setShowBroadcast(open); if (!open) resetBroadcast(); }}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><Megaphone size={16} /></span>
              Disparo Rápido
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <Sparkles size={16} className="mt-0.5 flex-shrink-0" />
              <p>Envie um e-mail avulso com anexos opcionais. Selecione destinatários manualmente ou use filtros da sua base de contatos.</p>
            </div>

            <div>
              <Label className="mb-1.5 block">Selecionar destinatários</Label>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setBcastMode("manual")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${bcastMode === "manual" ? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  <Pencil size={14} className="inline mr-1.5 -mt-0.5" />
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setBcastMode("audience")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-all ${bcastMode === "audience" ? "border-blue-300 bg-blue-50 text-blue-900 shadow-sm" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                >
                  <Users size={14} className="inline mr-1.5 -mt-0.5" />
                  Audiência (filtros)
                </button>
              </div>
            </div>

            {bcastMode === "manual" ? (
              <div>
                <Label>Destinatários</Label>
                <Textarea
                  rows={3}
                  value={bcast.recipientsRaw}
                  onChange={e => setBcast(b => ({ ...b, recipientsRaw: e.target.value }))}
                  placeholder="Cole os e-mails separados por vírgula, espaço ou quebra de linha"
                />
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    {parsedEmails.valid.length} válido(s)
                  </Badge>
                  {parsedEmails.invalid.length > 0 && (
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
                      {parsedEmails.invalid.length} inválido(s): {parsedEmails.invalid.slice(0, 3).join(", ")}{parsedEmails.invalid.length > 3 ? "…" : ""}
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Público</Label>
                    <Select value={bcast.audSource} onValueChange={(v: Source) => setBcast(b => ({ ...b, audSource: v }))}>
                      <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="leads">Leads (Tarefas)</SelectItem>
                        <SelectItem value="clients">Clientes</SelectItem>
                        <SelectItem value="contacts">Leads importados (CSV)</SelectItem>
                        <SelectItem value="both">Leads + Clientes</SelectItem>
                        <SelectItem value="all">Todos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {bcast.audSource !== "clients" && (
                    <div>
                      <Label>Atendente</Label>
                      <Select value={bcast.audAssignedTo || "__all__"} onValueChange={(v) => setBcast(b => ({ ...b, audAssignedTo: v === "__all__" ? "" : v }))}>
                        <SelectTrigger className="w-full bg-white"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Todos</SelectItem>
                          {sellers?.map(s => (
                            <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {availTags && availTags.length > 0 && bcast.audSource !== "clients" && (
                  <div>
                    <Label className="flex items-center gap-1"><Tag size={12} /> Tags</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {availTags.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setBcast(b => ({
                            ...b,
                            audTags: b.audTags.includes(tag) ? b.audTags.filter(t => t !== tag) : [...b.audTags, tag],
                          }))}
                          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${bcast.audTags.includes(tag) ? "bg-blue-900 text-white border-blue-900" : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white p-2.5 text-sm text-blue-900">
                  <Users size={16} className="flex-shrink-0 text-blue-700" />
                  <span>Público estimado: <strong>{bcastAudiencePreview?.count ?? 0}</strong> destinatário(s)</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Nome do disparo (opcional)</Label>
                <Input value={bcast.name} onChange={e => setBcast(b => ({ ...b, name: e.target.value }))} placeholder="Ex: Comunicado de feriado" />
              </div>
              <div>
                <Label>Responder para (opcional)</Label>
                <Input value={bcast.replyTo} onChange={e => setBcast(b => ({ ...b, replyTo: e.target.value }))} placeholder="contato@salvitarn.com.br" />
              </div>
            </div>

            {templates && templates.length > 0 && (
              <div>
                <Label>Aplicar template (opcional)</Label>
                <Select onValueChange={handleApplyTemplateBroadcast}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar template..." /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <AiEmailComposer
              html={bcast.htmlBody}
              onApply={({ subject, html }) => setBcast(b => ({ ...b, ...(subject !== undefined ? { subject } : {}), ...(html !== undefined ? { htmlBody: html } : {}) }))}
            />

            <div>
              <Label>Assunto</Label>
              <Input value={bcast.subject} onChange={e => setBcast(b => ({ ...b, subject: e.target.value }))} placeholder="Ex: Comunicado importante" />
            </div>

            <div>
              <Label>Corpo do e-mail</Label>
              <RichTextEditor
                value={bcast.htmlBody}
                onChange={html => setBcast(b => ({ ...b, htmlBody: html }))}
                placeholder="Olá, ..."
                minHeight={350}
              />
              <p className="text-xs text-gray-500 mt-1">{TEMPLATE_HINT}</p>
            </div>

            <div>
              <Label>Anexos (opcional)</Label>
              <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50/50 transition">
                <Paperclip size={16} />
                <span>Clique para anexar arquivos</span>
                <input type="file" multiple className="hidden" onChange={e => { handleAddFiles(e.target.files); e.target.value = ""; }} />
              </label>
              {bcastFiles.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {bcastFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
                      <FileText size={14} className="flex-shrink-0 text-blue-700" />
                      <span className="flex-1 truncate text-slate-700">{f.filename}</span>
                      <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-red-600 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center"
                        onClick={() => setBcastFiles(files => files.filter((_, idx) => idx !== i))}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <p className={`text-xs ${totalAttachBytes > 3_500_000 ? "text-red-600 font-medium" : "text-slate-400"}`}>
                    Total: {(totalAttachBytes / 1024 / 1024).toFixed(2)} MB / 3,5 MB
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-blue-900 hover:bg-blue-800"
              onClick={handleSendBroadcast}
              disabled={broadcastMutation.isPending || sendingId !== null}
            >
              <Send size={16} className="mr-1" />
              {broadcastMutation.isPending ? "Enviando..." : `Enviar para ${bcastMode === 'audience' ? (bcastAudiencePreview?.count ?? 0) : parsedEmails.valid.length}`}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => { setShowBroadcast(false); resetBroadcast(); }}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign detail dialog */}
      <CampaignDetailDialog campaignId={detailCampaignId} onClose={() => setDetailCampaignId(null)} />
    </div>
  );
}

function CampaignDetailDialog({ campaignId, onClose }: { campaignId: number | null; onClose: () => void }) {
  const { data } = trpc.emailMarketing.getCampaign.useQuery(
    { id: campaignId ?? 0 },
    { enabled: campaignId !== null }
  );

  return (
    <Dialog open={campaignId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><Send size={16} /></span>
            {data?.campaign.name ?? "Campanha"}
          </DialogTitle>
        </DialogHeader>
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile icon={Users} label="Total" value={data.campaign.totalRecipients} accent="bg-slate-100 text-slate-600" />
              <StatTile icon={Send} label="Enviados" value={data.campaign.sentCount} accent="bg-emerald-100 text-emerald-700" />
              <StatTile icon={X} label="Falhas" value={data.campaign.failedCount} accent="bg-red-100 text-red-600" />
              <StatTile icon={Mail} label="Status" value={STATUS_LABELS[data.campaign.status] ?? data.campaign.status} accent="bg-blue-100 text-blue-900" />
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assunto</div>
              <div className="px-3 py-2 text-sm text-slate-700">{data.campaign.subject}</div>
            </div>

            <div className="overflow-x-auto max-h-80 rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[480px]">
                <thead className={`${THEAD_CLASS} sticky top-0`}>
                  <tr>
                    <th className={TH_CLASS}>E-mail</th>
                    <th className={TH_CLASS}>Nome</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recipients.map(r => (
                    <tr key={r.id} className={TR_CLASS}>
                      <td className="px-3 py-2.5">{r.email}</td>
                      <td className="px-3 py-2.5">{r.name ?? "--"}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={RECIPIENT_STATUS_BADGE_CLASS[r.status] ?? ""}>
                          {RECIPIENT_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-red-500">{r.error ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.campaign.totalRecipients > data.recipients.length && (
              <p className="text-xs text-gray-500">Mostrando os primeiros {data.recipients.length} de {data.campaign.totalRecipients} destinatários.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Templates ──────────────────────────────────────────────────────────────

function TemplatesTab() {
  const utils = trpc.useUtils();
  const { data: templates, isLoading } = trpc.emailMarketing.listTemplates.useQuery();
  const { data: categories } = trpc.emailMarketing.listTemplateCategories.useQuery();
  const upsertMutation = trpc.emailMarketing.upsertTemplate.useMutation();
  const deleteMutation = trpc.emailMarketing.deleteTemplate.useMutation();
  const upsertCatMutation = trpc.emailMarketing.upsertTemplateCategory.useMutation();
  const deleteCatMutation = trpc.emailMarketing.deleteTemplateCategory.useMutation();

  const [activeTab, setActiveTab] = useState<string>('all');
  const [editing, setEditing] = useState<{ id?: number; categoryIds: number[]; slug: string; name: string; subject: string; htmlBody: string; active: boolean; attachments?: { filename: string; content: string; size: number }[] } | null>(null);
  const [editingCat, setEditingCat] = useState<{ id?: number; name: string } | null>(null);

  const tplAttachBytes = editing?.attachments?.reduce((s, f) => s + f.size, 0) ?? 0;

  const getCatIds = (t: any): number[] => {
    if (Array.isArray(t.categoryIds)) return t.categoryIds;
    if (t.categoryId) return [t.categoryId];
    return [];
  };

  const filteredTemplates = templates?.filter(t => {
    if (activeTab === 'all') return true;
    const ids = getCatIds(t);
    if (activeTab === 'uncategorized') return ids.length === 0;
    return ids.includes(Number(activeTab));
  }) ?? [];

  const handleAddTplFiles = async (files: FileList | null) => {
    if (!files || !editing) return;
    const next = [...(editing.attachments ?? [])];
    for (const file of Array.from(files)) {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      next.push({ filename: file.name, content, size: file.size });
    }
    setEditing(e => e && ({ ...e, attachments: next }));
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.slug.trim() || !editing.name.trim() || !editing.subject.trim() || !editing.htmlBody.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    if (tplAttachBytes > 3_500_000) {
      toast.error("Anexos muito grandes (max. ~3,5 MB no total)");
      return;
    }
    try {
      const payload: any = { ...editing, categoryIds: editing.categoryIds.length > 0 ? editing.categoryIds : null };
      if (payload.attachments) {
        payload.attachments = payload.attachments.map((f: any) => ({ filename: f.filename, content: f.content }));
      }
      await upsertMutation.mutateAsync(payload);
      toast.success("Template salvo!");
      setEditing(null);
      utils.emailMarketing.listTemplates.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar template");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir este template?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Template excluído");
    utils.emailMarketing.listTemplates.invalidate();
  };

  const handleSaveCat = async () => {
    if (!editingCat || !editingCat.name.trim()) { toast.error("Digite um nome"); return; }
    try {
      await upsertCatMutation.mutateAsync(editingCat);
      toast.success(editingCat.id ? "Categoria renomeada!" : "Categoria criada!");
      setEditingCat(null);
      utils.emailMarketing.listTemplateCategories.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar categoria");
    }
  };

  const handleDeleteCat = async (id: number, name: string) => {
    if (!confirm(`Excluir a aba "${name}"? Os templates dela ficarão sem categoria.`)) return;
    await deleteCatMutation.mutateAsync({ id });
    toast.success("Categoria excluída");
    if (activeTab === String(id)) setActiveTab('all');
    utils.emailMarketing.listTemplateCategories.invalidate();
    utils.emailMarketing.listTemplates.invalidate();
  };

  const openNewTemplate = () => {
    const catIds = activeTab !== 'all' && activeTab !== 'uncategorized' ? [Number(activeTab)] : [];
    setEditing({ slug: "", name: "", subject: "", htmlBody: "", active: true, attachments: [], categoryIds: catIds });
  };

  const toggleCategory = (catId: number) => {
    if (!editing) return;
    setEditing(e => {
      if (!e) return e;
      const ids = e.categoryIds.includes(catId) ? e.categoryIds.filter(id => id !== catId) : [...e.categoryIds, catId];
      return { ...e, categoryIds: ids };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditingCat({ name: "" })}>
          <Plus size={14} className="mr-1" /> Nova Aba
        </Button>
        <Button className="bg-blue-900 hover:bg-blue-800 shadow-sm" onClick={openNewTemplate}>
          <Plus size={16} className="mr-1" /> Novo Template
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'all' ? 'bg-blue-900 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >
              Todos ({templates?.length ?? 0})
            </button>
            {categories?.map(cat => {
              const count = templates?.filter(t => getCatIds(t).includes(cat.id)).length ?? 0;
              const isActive = activeTab === String(cat.id);
              return (
                <div key={cat.id} className="relative group">
                  <button
                    onClick={() => setActiveTab(String(cat.id))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isActive ? 'bg-blue-900 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
                  >
                    {cat.name} ({count})
                  </button>
                  <div className="absolute -top-1 -right-1 flex sm:hidden sm:group-hover:flex gap-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCat({ id: cat.id, name: cat.name }); }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-slate-300 shadow-sm text-slate-500 hover:text-blue-700 hover:border-blue-400"
                      title="Renomear"
                    >
                      <Pencil size={10} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCat(cat.id, cat.name); }}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white border border-slate-300 shadow-sm text-slate-500 hover:text-red-600 hover:border-red-400"
                      title="Excluir"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
            {templates?.some(t => getCatIds(t).length === 0) && (
              <button
                onClick={() => setActiveTab('uncategorized')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'uncategorized' ? 'bg-blue-900 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
              >
                Sem categoria ({templates?.filter(t => getCatIds(t).length === 0).length ?? 0})
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : filteredTemplates.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[480px]">
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>Nome</th>
                    <th className={TH_CLASS}>Slug</th>
                    <th className={TH_CLASS}>Assunto</th>
                    {activeTab === 'all' && <th className={TH_CLASS}>Categorias</th>}
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map(t => {
                    const ids = getCatIds(t);
                    return (
                      <tr key={t.id} className={TR_CLASS}>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{t.name}</td>
                        <td className="px-3 py-2.5 text-slate-400 text-xs font-mono">{t.slug}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{t.subject}</td>
                        {activeTab === 'all' && (
                          <td className="px-3 py-2.5 text-xs">
                            {ids.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {ids.map(cid => {
                                  const cat = categories?.find(c => c.id === cid);
                                  return cat ? <Badge key={cid} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">{cat.name}</Badge> : null;
                                })}
                              </div>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={t.active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>
                            {t.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => setEditing({ id: t.id, categoryIds: ids, slug: t.slug, name: t.name, subject: t.subject, htmlBody: t.htmlBody, active: t.active, attachments: Array.isArray((t as any).attachments) ? (t as any).attachments.map((a: any) => ({ filename: a.filename, content: a.content, size: Math.ceil((a.content?.length ?? 0) * 0.75) })) : [] })}>
                              <Pencil size={14} />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDelete(t.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={LayoutTemplate} message={activeTab === 'all' ? "Nenhum template cadastrado. Crie modelos reutilizáveis para suas campanhas e sequências." : "Nenhum template nesta categoria."} />
          )}
        </CardContent>
      </Card>

      {/* Template edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><LayoutTemplate size={16} /></span>
              {editing?.id ? "Editar Template" : "Novo Template"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={editing.name} onChange={e => setEditing(t => t && ({ ...t, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Slug (identificador único)</Label>
                  <Input value={editing.slug} onChange={e => setEditing(t => t && ({ ...t, slug: e.target.value }))} placeholder="ex: promo-junho" />
                </div>
              </div>
              {categories && categories.length > 0 && (
                <div>
                  <Label>Categorias (selecione uma ou mais)</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {categories.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCategory(c.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${editing.categoryIds.includes(c.id) ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
                      >
                        {editing.categoryIds.includes(c.id) ? '✓ ' : ''}{c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <AiEmailComposer
                html={editing.htmlBody}
                onApply={({ subject, html }) => setEditing(t => t && ({ ...t, ...(subject !== undefined ? { subject } : {}), ...(html !== undefined ? { htmlBody: html } : {}) }))}
              />
              <div>
                <Label>Assunto</Label>
                <Input value={editing.subject} onChange={e => setEditing(t => t && ({ ...t, subject: e.target.value }))} />
              </div>
              <div>
                <Label>Corpo do e-mail</Label>
                <RichTextEditor value={editing.htmlBody} onChange={html => setEditing(t => t && ({ ...t, htmlBody: html }))} minHeight={350} />
                <p className="text-xs text-gray-500 mt-1">{TEMPLATE_HINT}</p>
              </div>
              <div>
                <Label>Anexos (opcional)</Label>
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500 hover:border-blue-300 hover:bg-blue-50/50 transition">
                  <Paperclip size={16} />
                  <span>Clique para anexar arquivos</span>
                  <input type="file" multiple className="hidden" onChange={e => { handleAddTplFiles(e.target.files); e.target.value = ""; }} />
                </label>
                {editing.attachments && editing.attachments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {editing.attachments.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
                        <FileText size={14} className="flex-shrink-0 text-blue-700" />
                        <span className="flex-1 truncate text-slate-700">{f.filename}</span>
                        <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-red-600 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center"
                          onClick={() => setEditing(e => e && ({ ...e, attachments: e.attachments?.filter((_, idx) => idx !== i) }))}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <p className={`text-xs ${tplAttachBytes > 3_500_000 ? "text-red-600 font-medium" : "text-slate-400"}`}>
                      Total: {(tplAttachBytes / 1024 / 1024).toFixed(2)} MB / 3,5 MB
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category create/rename dialog */}
      <Dialog open={editingCat !== null} onOpenChange={open => { if (!open) setEditingCat(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCat?.id ? "Renomear Aba" : "Nova Aba"}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nome da aba</Label>
            <Input
              value={editingCat?.name ?? ''}
              onChange={e => setEditingCat(c => c && ({ ...c, name: e.target.value }))}
              placeholder="Ex: Refinado 1kg"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSaveCat(); }}
            />
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleSaveCat} disabled={upsertCatMutation.isPending}>
              {upsertCatMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setEditingCat(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sequências ─────────────────────────────────────────────────────────────

function SequencesTab() {
  const utils = trpc.useUtils();
  const { data: sequences, isLoading } = trpc.emailMarketing.listSequences.useQuery();
  const upsertMutation = trpc.emailMarketing.upsertSequence.useMutation();
  const deleteMutation = trpc.emailMarketing.deleteSequence.useMutation();

  const [showCreate, setShowCreate] = useState(false);
  const [editingSeq, setEditingSeq] = useState<{ id: number; name: string; description: string; active: boolean; repeat: boolean; repeatIntervalDays: string } | null>(null);
  const [form, setForm] = useState({ name: "", description: "", active: true, repeat: false, repeatIntervalDays: "30" });
  const [detailSequenceId, setDetailSequenceId] = useState<number | null>(null);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome da sequência"); return; }
    if (form.repeat && (!form.repeatIntervalDays.trim() || Number(form.repeatIntervalDays) < 1)) {
      toast.error("Informe o intervalo (em dias) para repetir a sequência");
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        name: form.name,
        description: form.description || undefined,
        active: form.active,
        repeat: form.repeat,
        repeatIntervalDays: form.repeat ? Number(form.repeatIntervalDays) : undefined,
      });
      toast.success("Sequência criada!");
      setShowCreate(false);
      setForm({ name: "", description: "", active: true, repeat: false, repeatIntervalDays: "30" });
      utils.emailMarketing.listSequences.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar sequência");
    }
  };

  const handleEdit = (s: any) => {
    setEditingSeq({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      active: s.active,
      repeat: !!(s as any).repeat,
      repeatIntervalDays: String((s as any).repeatIntervalDays ?? 30),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingSeq) return;
    if (!editingSeq.name.trim()) { toast.error("Informe o nome da sequência"); return; }
    if (editingSeq.repeat && (!editingSeq.repeatIntervalDays.trim() || Number(editingSeq.repeatIntervalDays) < 1)) {
      toast.error("Informe o intervalo (em dias) para repetir a sequência");
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        id: editingSeq.id,
        name: editingSeq.name,
        description: editingSeq.description || undefined,
        active: editingSeq.active,
        repeat: editingSeq.repeat,
        repeatIntervalDays: editingSeq.repeat ? Number(editingSeq.repeatIntervalDays) : undefined,
      });
      toast.success("Sequência atualizada!");
      setEditingSeq(null);
      utils.emailMarketing.listSequences.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar sequência");
    }
  };

  const handleToggleActive = async (id: number, active: boolean) => {
    try {
      await upsertMutation.mutateAsync({ id, name: sequences?.find(s => s.id === id)?.name ?? "", active });
      utils.emailMarketing.listSequences.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar sequência");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir esta sequência e todos os seus passos?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Sequência excluída");
      utils.emailMarketing.listSequences.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir sequência");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="bg-blue-900 hover:bg-blue-800 shadow-sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" /> Nova sequência
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow size={16} className="text-blue-900" /> Sequências <span className="text-slate-400 font-normal">({sequences?.length ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : sequences && sequences.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[640px]">
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>Nome</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Inscritos ativos</th>
                    <th className={TH_CLASS}>Passos</th>
                    <th className={TH_CLASS}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map(s => (
                    <tr key={s.id} className={TR_CLASS}>
                      <td className="px-3 py-2.5 font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button className="text-left text-slate-700 hover:text-blue-900 hover:underline" onClick={() => setDetailSequenceId(s.id)}>
                            {s.name}
                          </button>
                          {(s as any).repeat && <Badge variant="outline" className="text-xs bg-violet-100 text-violet-700 border-violet-200">🔁 mensal</Badge>}
                        </div>
                        {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Switch checked={s.active} onCheckedChange={(checked) => handleToggleActive(s.id, checked)} />
                          <span className="text-xs text-gray-500">{s.active ? "Ativa" : "Pausada"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="bg-blue-50 text-blue-900 border-blue-200">{s.activeEnrollments}</Badge>
                      </td>
                      <td className="px-3 py-2.5">{s.stepCount}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setDetailSequenceId(s.id)}>
                            <Eye size={14} className="mr-1" /> Ver
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleEdit(s)}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(s.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Workflow} message="Nenhuma sequência criada ainda. Crie uma série de e-mails automáticos para nutrir seus leads." />
          )}
        </CardContent>
      </Card>

      {/* Create sequence dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setForm({ name: "", description: "", active: true, repeat: false, repeatIntervalDays: "30" }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><Workflow size={16} /></span>
              Nova sequência
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Boas-vindas Lead Novo" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Para que serve esta sequência" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(checked) => setForm(f => ({ ...f, active: checked }))} />
              <Label className="!mb-0">Ativa</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.repeat} onCheckedChange={(checked) => setForm(f => ({ ...f, repeat: checked }))} />
              <Label className="!mb-0">🔁 Repetir continuamente (loop)</Label>
            </div>
            {form.repeat && (
              <div>
                <Label>Reiniciar a cada N dias</Label>
                <Input type="number" min={1} value={form.repeatIntervalDays} onChange={e => setForm(f => ({ ...f, repeatIntervalDays: e.target.value }))} placeholder="30" />
              </div>
            )}
            {form.repeat && <p className="text-xs text-gray-500">{REPEAT_HINT}</p>}
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleCreate} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Criando..." : "Criar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit sequence dialog */}
      <Dialog open={editingSeq !== null} onOpenChange={open => { if (!open) setEditingSeq(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><Pencil size={16} /></span>
              Editar sequência
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={editingSeq?.name ?? ""} onChange={e => setEditingSeq(s => s && ({ ...s, name: e.target.value }))} placeholder="Nome da sequência" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea rows={3} value={editingSeq?.description ?? ""} onChange={e => setEditingSeq(s => s && ({ ...s, description: e.target.value }))} placeholder="Para que serve esta sequência" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editingSeq?.active ?? true} onCheckedChange={checked => setEditingSeq(s => s && ({ ...s, active: checked }))} />
              <Label className="!mb-0">Ativa</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editingSeq?.repeat ?? false} onCheckedChange={checked => setEditingSeq(s => s && ({ ...s, repeat: checked }))} />
              <Label className="!mb-0">🔁 Repetir continuamente (loop)</Label>
            </div>
            {editingSeq?.repeat && (
              <div>
                <Label>Reiniciar a cada N dias</Label>
                <Input type="number" min={1} value={editingSeq.repeatIntervalDays} onChange={e => setEditingSeq(s => s && ({ ...s, repeatIntervalDays: e.target.value }))} placeholder="30" />
              </div>
            )}
            {editingSeq?.repeat && <p className="text-xs text-gray-500">{REPEAT_HINT}</p>}
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleSaveEdit} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setEditingSeq(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sequence detail dialog */}
      <SequenceDetailDialog sequenceId={detailSequenceId} onClose={() => setDetailSequenceId(null)} />
    </div>
  );
}

function SequenceDetailDialog({ sequenceId, onClose }: { sequenceId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const { data: sequences } = trpc.emailMarketing.listSequences.useQuery(undefined, { enabled: sequenceId !== null });
  const sequence = sequences?.find(s => s.id === sequenceId);

  const { data: steps } = trpc.emailMarketing.listSequenceSteps.useQuery(
    { sequenceId: sequenceId ?? 0 },
    { enabled: sequenceId !== null }
  );
  const { data: stats } = trpc.emailMarketing.sequenceStats.useQuery(
    { sequenceId: sequenceId ?? 0 },
    { enabled: sequenceId !== null }
  );

  const [enrollStatus, setEnrollStatus] = useState<"active" | "paused" | "completed" | "cancelled" | undefined>(undefined);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const { data: enrollments } = trpc.emailMarketing.listEnrollments.useQuery(
    { sequenceId: sequenceId ?? 0, status: enrollStatus, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { enabled: sequenceId !== null }
  );

  const { data: templates } = trpc.emailMarketing.listTemplates.useQuery(undefined, { enabled: sequenceId !== null });
  const upsertStepMutation = trpc.emailMarketing.upsertSequenceStep.useMutation();
  const deleteStepMutation = trpc.emailMarketing.deleteSequenceStep.useMutation();
  const pauseMutation = trpc.emailMarketing.pauseEnrollment.useMutation();
  const resumeMutation = trpc.emailMarketing.resumeEnrollment.useMutation();
  const cancelMutation = trpc.emailMarketing.cancelEnrollment.useMutation();

  const [editingStep, setEditingStep] = useState<{ id?: number; stepOrder: number; delayDays: number; subject: string; htmlBody: string; sendCondition: string; retryIfNotOpened: boolean; retryDelayHours: number; maxRetries: number; retrySubject: string } | null>(null);
  const [showEnroll, setShowEnroll] = useState(false);

  const statsByStepId = useMemo(() => {
    const map = new Map<number, { sent: number; opened: number; clicked: number; skipped: number }>();
    (stats ?? []).forEach(s => map.set(s.stepId, { sent: s.sent, opened: s.opened, clicked: s.clicked, skipped: (s as any).skipped ?? 0 }));
    return map;
  }, [stats]);

  const refreshAll = () => {
    utils.emailMarketing.listSequenceSteps.invalidate({ sequenceId: sequenceId ?? 0 });
    utils.emailMarketing.listSequences.invalidate();
    utils.emailMarketing.sequenceStats.invalidate({ sequenceId: sequenceId ?? 0 });
  };

  const handleSaveStep = async () => {
    if (!editingStep || !sequenceId) return;
    if (!editingStep.subject.trim() || !editingStep.htmlBody.trim()) {
      toast.error("Preencha assunto e corpo do e-mail");
      return;
    }
    try {
      // Convert relative delay (days after previous step) to absolute delay (days after enrollment)
      let absoluteDelay = editingStep.delayDays;
      if (editingStep.stepOrder > 1 && steps) {
        const prevStep = steps.filter(s => s.stepOrder < editingStep.stepOrder).sort((a, b) => b.stepOrder - a.stepOrder)[0];
        if (prevStep) absoluteDelay = prevStep.delayDays + editingStep.delayDays;
      }
      await upsertStepMutation.mutateAsync({
        id: editingStep.id,
        sequenceId,
        stepOrder: editingStep.stepOrder,
        delayDays: absoluteDelay,
        subject: editingStep.subject,
        htmlBody: editingStep.htmlBody,
        sendCondition: editingStep.sendCondition as any,
        retryIfNotOpened: editingStep.retryIfNotOpened,
        retryDelayHours: editingStep.retryDelayHours,
        maxRetries: editingStep.maxRetries,
        retrySubject: editingStep.retrySubject.trim() || null,
      });
      toast.success("Passo salvo!");
      setEditingStep(null);
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar passo");
    }
  };

  const handleDeleteStep = async (id: number) => {
    if (!confirm("Excluir este passo?")) return;
    try {
      await deleteStepMutation.mutateAsync({ id });
      toast.success("Passo excluído");
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir passo");
    }
  };

  const handleEnrollmentAction = async (id: number, action: "pause" | "resume" | "cancel") => {
    try {
      if (action === "pause") await pauseMutation.mutateAsync({ id });
      else if (action === "resume") await resumeMutation.mutateAsync({ id });
      else await cancelMutation.mutateAsync({ id });
      utils.emailMarketing.listEnrollments.invalidate();
      utils.emailMarketing.listSequences.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar inscrição");
    }
  };

  if (!sequenceId) return null;

  return (
    <Dialog open={sequenceId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><Workflow size={16} /></span>
            {sequence?.name ?? "Sequência"}
          </DialogTitle>
        </DialogHeader>
        {sequence?.description && <p className="text-sm text-gray-500 -mt-1">{sequence.description}</p>}

        <div className="space-y-4">
          {/* Steps timeline */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
                <Workflow size={14} className="text-blue-900" /> Passos da sequência
              </h3>
              <Button
                size="sm"
                className="bg-blue-900 hover:bg-blue-800"
                onClick={() => setEditingStep({ stepOrder: (steps?.length ?? 0) + 1, delayDays: 0, subject: "", htmlBody: "", sendCondition: "always", retryIfNotOpened: false, retryDelayHours: 24, maxRetries: 1, retrySubject: "" })}
              >
                <Plus size={14} className="mr-1" /> Adicionar passo
              </Button>
            </div>
            {steps && steps.length > 0 ? (
              <div className="space-y-2 relative">
                {steps.map(step => {
                  const stepStats = statsByStepId.get(step.id);
                  return (
                    <div key={step.id} className="flex gap-3">
                      <div className="flex flex-col items-center pt-3.5 flex-shrink-0">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-900 text-white text-xs font-bold">
                          {step.stepOrder}
                        </div>
                      </div>
                      <div className="flex-1 border border-slate-200 rounded-xl p-3 bg-white shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Dia {step.delayDays}{(() => {
                                const prev = steps?.filter(s => s.stepOrder < step.stepOrder).sort((a, b) => b.stepOrder - a.stepOrder)[0];
                                const rel = prev ? step.delayDays - prev.delayDays : step.delayDays;
                                return step.stepOrder > 1 ? ` (+${rel}d)` : '';
                              })()}</Badge>
                              <span className="font-medium text-sm text-slate-700">{step.subject}</span>
                              {(step as any).sendCondition && (step as any).sendCondition !== 'always' && (
                                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">{SEND_CONDITION_BADGES[(step as any).sendCondition] ?? (step as any).sendCondition}</Badge>
                              )}
                              {(step as any).retryIfNotOpened && (
                                <Badge variant="outline" className="text-xs bg-orange-100 text-orange-700 border-orange-200">🔄 reenvio {(step as any).retryDelayHours}h (max {(step as any).maxRetries}x)</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {step.htmlBody.replace(/<[^>]*>/g, ' ').trim().slice(0, 160)}
                            </p>
                            {stepStats && (
                              <div className="flex gap-1.5 mt-2 flex-wrap">
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">📤 {stepStats.sent} enviados</Badge>
                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">👁 {stepStats.opened} abertos</Badge>
                                <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">🔗 {stepStats.clicked} clicados</Badge>
                                <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200">⏭ {stepStats.skipped} pulados</Badge>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Button size="sm" variant="outline" onClick={() => {
                              const prevStep = steps?.filter(s => s.stepOrder < step.stepOrder).sort((a, b) => b.stepOrder - a.stepOrder)[0];
                              const relativeDelay = prevStep ? step.delayDays - prevStep.delayDays : step.delayDays;
                              setEditingStep({ id: step.id, stepOrder: step.stepOrder, delayDays: Math.max(0, relativeDelay), subject: step.subject, htmlBody: step.htmlBody, sendCondition: (step as any).sendCondition ?? 'always', retryIfNotOpened: (step as any).retryIfNotOpened ?? false, retryDelayHours: (step as any).retryDelayHours ?? 24, maxRetries: (step as any).maxRetries ?? 1, retrySubject: (step as any).retrySubject ?? '' });
                            }}>
                              <Pencil size={14} />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteStep(step.id)}>
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={Workflow} message="Nenhum passo cadastrado ainda. Adicione o primeiro e-mail da sequência." />
            )}
          </div>

          {/* Enrollments */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-slate-700">
                <Users size={14} className="text-blue-900" /> Inscritos <span className="text-slate-400 font-normal">({enrollments?.total ?? 0})</span>
              </h3>
              <div className="flex items-center gap-2">
                <Select value={enrollStatus ?? "__all__"} onValueChange={(v) => { setEnrollStatus(v === "__all__" ? undefined : v as any); setPage(0); }}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos status</SelectItem>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                    <SelectItem value="completed">Concluída</SelectItem>
                    <SelectItem value="cancelled">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" className="bg-blue-900 hover:bg-blue-800" onClick={() => setShowEnroll(true)}>
                  <Users size={14} className="mr-1" /> Inscrever leads
                </Button>
              </div>
            </div>
            {enrollments && enrollments.rows.length > 0 ? (
              <div className="overflow-x-auto max-h-72 rounded-xl border border-slate-200">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className={`${THEAD_CLASS} sticky top-0`}>
                    <tr>
                      <th className={TH_CLASS}>E-mail</th>
                      <th className={TH_CLASS}>Nome</th>
                      <th className={TH_CLASS}>Passo</th>
                      <th className={TH_CLASS}>Próximo envio</th>
                      <th className={TH_CLASS}>Status</th>
                      <th className={TH_CLASS}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.rows.map(e => (
                      <tr key={e.id} className={TR_CLASS}>
                        <td className="px-3 py-2.5">{e.email}</td>
                        <td className="px-3 py-2.5">{e.name ?? "--"}</td>
                        <td className="px-3 py-2.5">{e.currentStep}/{steps?.length ?? 0}</td>
                        <td className="px-3 py-2.5 text-xs">{formatDateTime(e.nextSendAt)}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={ENROLLMENT_STATUS_BADGE_CLASS[e.status] ?? ""}>
                            {ENROLLMENT_STATUS_LABELS[e.status] ?? e.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            {e.status === "active" && (
                              <Button size="sm" variant="outline" onClick={() => handleEnrollmentAction(e.id, "pause")} title="Pausar">
                                <Pause size={14} />
                              </Button>
                            )}
                            {e.status === "paused" && (
                              <Button size="sm" variant="outline" onClick={() => handleEnrollmentAction(e.id, "resume")} title="Retomar">
                                <Play size={14} />
                              </Button>
                            )}
                            {(e.status === "active" || e.status === "paused") && (
                              <Button size="sm" variant="destructive" onClick={() => handleEnrollmentAction(e.id, "cancel")} title="Cancelar">
                                <X size={14} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {enrollments.total > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500 border-t border-slate-200 bg-slate-50">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</Button>
                    <span>Página {page + 1} de {Math.ceil(enrollments.total / PAGE_SIZE)}</span>
                    <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= enrollments.total} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={Users} message={`Nenhum inscrito ${enrollStatus ? `com status "${ENROLLMENT_STATUS_LABELS[enrollStatus]}"` : "ainda"}.`} />
            )}
          </div>
        </div>

        {/* Step editor dialog */}
        <Dialog open={editingStep !== null} onOpenChange={(open) => { if (!open) setEditingStep(null); }}>
          <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900">{editingStep?.id ? <Pencil size={16} /> : <Plus size={16} />}</span>
                {editingStep?.id ? "Editar passo" : "Novo passo"}
              </DialogTitle>
            </DialogHeader>
            {editingStep && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Ordem do passo</Label>
                    <Input type="number" min={1} value={editingStep.stepOrder} onChange={e => setEditingStep(s => s && ({ ...s, stepOrder: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>{editingStep.stepOrder === 1 ? 'Dias após inscrição' : 'Dias após o passo anterior'}</Label>
                    <Input type="number" min={0} value={editingStep.delayDays} onChange={e => setEditingStep(s => s && ({ ...s, delayDays: Number(e.target.value) }))} />
                    {editingStep.stepOrder > 1 && <p className="text-xs text-gray-500 mt-1">Ex: 30 = envia 30 dias depois do passo anterior</p>}
                  </div>
                </div>
                {(templates ?? []).length > 0 && (
                  <div>
                    <Label>Usar template pronto</Label>
                    <Select value="" onValueChange={(v) => {
                      const t = templates?.find(t => t.id === Number(v));
                      if (t) setEditingStep(s => s && ({ ...s, subject: t.subject, htmlBody: t.htmlBody }));
                    }}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar template..." /></SelectTrigger>
                      <SelectContent>
                        {(templates ?? []).map(t => (
                          <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">Ao selecionar, o assunto e corpo serão preenchidos com o conteúdo do template.</p>
                  </div>
                )}
                <AiEmailComposer
                  html={editingStep.htmlBody}
                  onApply={({ subject, html }) => setEditingStep(s => s && ({ ...s, ...(subject !== undefined ? { subject } : {}), ...(html !== undefined ? { htmlBody: html } : {}) }))}
                />
                <div>
                  <Label>Assunto</Label>
                  <Input value={editingStep.subject} onChange={e => setEditingStep(s => s && ({ ...s, subject: e.target.value }))} />
                </div>
                <div>
                  <Label>Corpo do e-mail</Label>
                  <RichTextEditor value={editingStep.htmlBody} onChange={html => setEditingStep(s => s && ({ ...s, htmlBody: html }))} minHeight={350} />
                  <p className="text-xs text-gray-500 mt-1">{TEMPLATE_HINT}</p>
                </div>
                <div>
                  <Label>Condição de envio</Label>
                  <Select value={editingStep.sendCondition} onValueChange={(v) => setEditingStep(s => s && ({ ...s, sendCondition: v }))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SEND_CONDITION_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">{SEND_CONDITION_HINT}</p>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded"
                      checked={editingStep.retryIfNotOpened}
                      onChange={e => setEditingStep(s => s && ({ ...s, retryIfNotOpened: e.target.checked }))}
                    />
                    Reenviar automaticamente se o destinatário não abrir
                  </label>
                  {editingStep.retryIfNotOpened && (
                    <div className="space-y-3 pl-6">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Aguardar antes de reenviar (horas)</Label>
                          <Input type="number" min={1} max={720} value={editingStep.retryDelayHours} onChange={e => setEditingStep(s => s && ({ ...s, retryDelayHours: Math.max(1, Number(e.target.value)) }))} />
                          <p className="text-xs text-gray-500 mt-1">Ex: 24 = 1 dia, 48 = 2 dias, 72 = 3 dias</p>
                        </div>
                        <div>
                          <Label>Tentativas máximas</Label>
                          <Input type="number" min={1} max={5} value={editingStep.maxRetries} onChange={e => setEditingStep(s => s && ({ ...s, maxRetries: Math.min(5, Math.max(1, Number(e.target.value))) }))} />
                          <p className="text-xs text-gray-500 mt-1">Quantas vezes reenviar (1-5)</p>
                        </div>
                      </div>
                      <div>
                        <Label>Assunto alternativo no reenvio (opcional)</Label>
                        <Input value={editingStep.retrySubject} onChange={e => setEditingStep(s => s && ({ ...s, retrySubject: e.target.value }))} placeholder="Ex: Não vi sua resposta, {nome}..." />
                        <p className="text-xs text-gray-500 mt-1">Se vazio, usa o mesmo assunto original. Use {'{nome}'} para personalizar.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter className="flex gap-2 pt-2">
              <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleSaveStep} disabled={upsertStepMutation.isPending}>
                {upsertStepMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditingStep(null)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enroll leads dialog */}
        {sequenceId !== null && (
          <EnrollLeadsDialog
            sequenceId={sequenceId}
            open={showEnroll}
            onClose={() => setShowEnroll(false)}
            onEnrolled={() => {
              utils.emailMarketing.listEnrollments.invalidate();
              utils.emailMarketing.listSequences.invalidate();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Lightweight task picker: lists tasks with a registered email, with checkboxes
// and an optional tag filter, used to enroll leads in a sequence manually.
function EnrollLeadsDialog({ sequenceId, open, onClose, onEnrolled }: { sequenceId: number; open: boolean; onClose: () => void; onEnrolled: () => void }) {
  const { data: tasks } = trpc.tasks.list.useQuery(undefined, { enabled: open });
  const { data: tags } = trpc.emailMarketing.listTags.useQuery(undefined, { enabled: open });
  const enrollMutation = trpc.emailMarketing.enrollTasksInSequence.useMutation();

  const [tagFilter, setTagFilter] = useState<string>("__all__");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const tasksWithEmail = useMemo(() => {
    const list = (tasks ?? []).filter((t: any) => !!t.email);
    if (tagFilter === "__all__") return list;
    return list.filter((t: any) => (t.tags ?? []).includes(tagFilter));
  }, [tasks, tagFilter]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === tasksWithEmail.length ? new Set() : new Set(tasksWithEmail.map((t: any) => t.id)));
  };

  const handleEnroll = async () => {
    if (selectedIds.size === 0) { toast.error("Selecione ao menos um lead"); return; }
    try {
      const res = await enrollMutation.mutateAsync({ sequenceId, taskIds: Array.from(selectedIds) });
      const skipped = res.skippedNoEmail + res.skippedDuplicateOrSuppressed + (res.skippedUnconfirmed ?? 0);
      toast.success(`✅ ${res.enrolled} inscrito(s) na sequência` + (skipped > 0 ? ` (${skipped} ignorado(s): sem e-mail, não-confirmado, duplicado ou descadastrado)` : ''));
      if (res.skippedUnconfirmed > 0) toast.warning(`✉️ ${res.skippedUnconfirmed} lead(s) ignorado(s) por e-mail não confirmado.`, { duration: 9000 });
      setSelectedIds(new Set());
      onEnrolled();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao inscrever leads");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><Users size={16} /></span>
            Inscrever leads na sequência
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="!mb-0 flex-shrink-0 flex items-center gap-1"><Filter size={12} /> Filtrar por tag</Label>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as tags</SelectItem>
                {(tags ?? []).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer text-slate-600">
            <Checkbox checked={tasksWithEmail.length > 0 && selectedIds.size === tasksWithEmail.length} onCheckedChange={toggleSelectAll} />
            Selecionar todos ({tasksWithEmail.length})
          </label>
          <div className="rounded-xl border border-slate-200 max-h-72 overflow-y-auto divide-y divide-slate-100">
            {tasksWithEmail.length > 0 ? tasksWithEmail.map((t: any) => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-blue-50/50 transition-colors">
                <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-700">{t.title}</p>
                  <p className="text-xs text-gray-500 truncate">{t.email}</p>
                </div>
              </label>
            )) : (
              <p className="text-sm text-gray-500 p-3">Nenhum lead com e-mail cadastrado{tagFilter !== "__all__" ? ` para a tag "${tagFilter}"` : ""}.</p>
            )}
          </div>
        </div>
        <DialogFooter className="flex gap-2 pt-2">
          <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleEnroll} disabled={enrollMutation.isPending || selectedIds.size === 0}>
            {enrollMutation.isPending ? "Inscrevendo..." : `Inscrever (${selectedIds.size})`}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Automações ─────────────────────────────────────────────────────────────

function AutomationsTab() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.emailMarketing.listAutomationRules.useQuery();
  const { data: sequences } = trpc.emailMarketing.listSequences.useQuery();
  const upsertMutation = trpc.emailMarketing.upsertAutomationRule.useMutation();
  const deleteMutation = trpc.emailMarketing.deleteAutomationRule.useMutation();

  const { data: availTags } = trpc.emailMarketing.listTags.useQuery();

  const [editing, setEditing] = useState<{
    id?: number;
    name: string;
    triggerType: string;
    days: string;
    triggerTag: string;
    triggerSequenceId: string;
    actionType: "enroll_sequence" | "add_tag";
    sequenceId: string;
    tag: string;
    requiredTags: string[];
    excludedTags: string[];
    cancelOtherSequences: boolean;
    active: boolean;
  } | null>(null);

  // Parse triggerConfig/actionConfig JSON strings into objects for display.
  const parsedRules = useMemo(() => {
    return (rules ?? []).map(r => ({
      ...r,
      triggerConfig: r.triggerConfig ? JSON.parse(r.triggerConfig) : null,
      actionConfig: r.actionConfig ? JSON.parse(r.actionConfig) : {},
    }));
  }, [rules]);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Informe o nome da regra"); return; }
    if (editing.triggerType === 'inactive_days' && !editing.days.trim()) {
      toast.error("Informe o número de dias sem contato"); return;
    }
    if (editing.triggerType === 'tag_added' && !editing.triggerTag.trim()) {
      toast.error("Informe a tag que dispara a automação"); return;
    }
    if (editing.actionType === 'enroll_sequence' && !editing.sequenceId) {
      toast.error("Selecione a sequência"); return;
    }
    if (editing.actionType === 'add_tag' && !editing.tag.trim()) {
      toast.error("Informe a tag"); return;
    }
    try {
      let triggerConfig: Record<string, any> | undefined;
      if (editing.triggerType === 'inactive_days') triggerConfig = { days: Number(editing.days) };
      else if (editing.triggerType === 'tag_added') triggerConfig = { tag: editing.triggerTag.trim() };
      else if (editing.triggerType === 'sequence_completed' && editing.triggerSequenceId) triggerConfig = { sequenceId: Number(editing.triggerSequenceId) };

      await upsertMutation.mutateAsync({
        id: editing.id,
        name: editing.name,
        triggerType: editing.triggerType as any,
        triggerConfig,
        actionType: editing.actionType,
        actionConfig: editing.actionType === 'enroll_sequence' ? { sequenceId: Number(editing.sequenceId) } : { tag: editing.tag.trim() },
        requiredTags: editing.requiredTags.filter(t => t.trim()),
        excludedTags: editing.excludedTags.filter(t => t.trim()),
        cancelOtherSequences: editing.cancelOtherSequences,
        active: editing.active,
      });
      toast.success("Automação salva!");
      setEditing(null);
      utils.emailMarketing.listAutomationRules.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar automação");
    }
  };

  const handleToggleActive = async (rule: typeof parsedRules[number], active: boolean) => {
    try {
      await upsertMutation.mutateAsync({
        id: rule.id,
        name: rule.name,
        triggerType: rule.triggerType as any,
        triggerConfig: rule.triggerConfig ?? undefined,
        actionType: rule.actionType as any,
        actionConfig: rule.actionConfig,
        requiredTags: rule.requiredTags ?? [],
        excludedTags: rule.excludedTags ?? [],
        cancelOtherSequences: rule.cancelOtherSequences ?? false,
        active,
      });
      utils.emailMarketing.listAutomationRules.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar automação");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir esta automação?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Automação excluída");
      utils.emailMarketing.listAutomationRules.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir automação");
    }
  };

  const openNew = () => setEditing({
    name: "", triggerType: "lead_created", days: "30", triggerTag: "", triggerSequenceId: "",
    actionType: "enroll_sequence", sequenceId: "", tag: "",
    requiredTags: [], excludedTags: [], cancelOtherSequences: false, active: true,
  });

  const openEdit = (rule: typeof parsedRules[number]) => setEditing({
    id: rule.id,
    name: rule.name,
    triggerType: rule.triggerType,
    days: rule.triggerConfig?.days ? String(rule.triggerConfig.days) : "30",
    triggerTag: rule.triggerConfig?.tag ?? "",
    triggerSequenceId: rule.triggerConfig?.sequenceId ? String(rule.triggerConfig.sequenceId) : "",
    actionType: rule.actionType as any,
    sequenceId: rule.actionConfig?.sequenceId ? String(rule.actionConfig.sequenceId) : "",
    tag: rule.actionConfig?.tag ?? "",
    requiredTags: rule.requiredTags ?? [],
    excludedTags: rule.excludedTags ?? [],
    cancelOtherSequences: rule.cancelOtherSequences ?? false,
    active: rule.active,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="bg-blue-900 hover:bg-blue-800 shadow-sm" onClick={openNew}>
          <Plus size={16} className="mr-1" /> Nova automação
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap size={16} className="text-blue-900" /> Automações <span className="text-slate-400 font-normal">({parsedRules.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : parsedRules.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[640px]">
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>Nome</th>
                    <th className={TH_CLASS}>Gatilho</th>
                    <th className={TH_CLASS}>Ação</th>
                    <th className={TH_CLASS}>Ativa</th>
                    <th className={TH_CLASS}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRules.map(r => (
                    <tr key={r.id} className={TR_CLASS}>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{r.name}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{describeTrigger(r, sequences)}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{describeAction(r, sequences)}</td>
                      <td className="px-3 py-2.5">
                        <Switch checked={r.active} onCheckedChange={(checked) => handleToggleActive(r, checked)} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={Zap} message="Nenhuma automação criada ainda. Crie regras para inscrever leads em sequências ou marcar tags automaticamente." />
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900"><Zap size={16} /></span>
              {editing?.id ? "Editar automação" : "Nova automação"}
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input value={editing.name} onChange={e => setEditing(s => s && ({ ...s, name: e.target.value }))} placeholder="Ex: Reativação de leads frios" />
              </div>
              <div>
                <Label>Gatilho</Label>
                <Select value={editing.triggerType} onValueChange={(v: any) => setEditing(s => s && ({ ...s, triggerType: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead_created">Novo lead criado</SelectItem>
                    <SelectItem value="lead_converted">Lead convertido em cliente</SelectItem>
                    <SelectItem value="email_confirmed">E-mail confirmado</SelectItem>
                    <SelectItem value="tag_added">Tag adicionada ao lead</SelectItem>
                    <SelectItem value="sequence_completed">Sequência concluída</SelectItem>
                    <SelectItem value="inactive_days">Sem contato há N dias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.triggerType === 'inactive_days' && (
                <div>
                  <Label>Dias sem contato</Label>
                  <Input type="number" min={1} value={editing.days} onChange={e => setEditing(s => s && ({ ...s, days: e.target.value }))} />
                </div>
              )}
              {editing.triggerType === 'tag_added' && (
                <div>
                  <Label>Qual tag dispara?</Label>
                  {(availTags ?? []).length > 0 ? (
                    <Select value={editing.triggerTag} onValueChange={(v) => setEditing(s => s && ({ ...s, triggerTag: v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar tag..." /></SelectTrigger>
                      <SelectContent>
                        {(availTags ?? []).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={editing.triggerTag} onChange={e => setEditing(s => s && ({ ...s, triggerTag: e.target.value }))} placeholder="Nome da tag" />
                  )}
                </div>
              )}
              {editing.triggerType === 'sequence_completed' && (
                <div>
                  <Label>Qual sequência? (vazio = qualquer)</Label>
                  <Select value={editing.triggerSequenceId} onValueChange={(v) => setEditing(s => s && ({ ...s, triggerSequenceId: v }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Qualquer sequência..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Qualquer sequência</SelectItem>
                      {(sequences ?? []).map(seq => <SelectItem key={seq.id} value={String(seq.id)}>{seq.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Ação</Label>
                <Select value={editing.actionType} onValueChange={(v: any) => setEditing(s => s && ({ ...s, actionType: v }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enroll_sequence">Inscrever em sequência</SelectItem>
                    <SelectItem value="add_tag">Adicionar tag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.actionType === 'enroll_sequence' ? (
                <div>
                  <Label>Sequência</Label>
                  <Select value={editing.sequenceId} onValueChange={(v) => setEditing(s => s && ({ ...s, sequenceId: v }))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar sequência..." /></SelectTrigger>
                    <SelectContent>
                      {(sequences ?? []).map(seq => (
                        <SelectItem key={seq.id} value={String(seq.id)}>{seq.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Tag</Label>
                  <Input value={editing.tag} onChange={e => setEditing(s => s && ({ ...s, tag: e.target.value }))} placeholder="Ex: cliente-vip" />
                </div>
              )}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Filtro por tags</p>
                <div>
                  <Label className="text-xs">Só dispara se o lead TEM estas tags (todas)</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(availTags ?? []).map(tag => {
                      const selected = editing.requiredTags.includes(tag);
                      return (
                        <button key={tag} type="button"
                          className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${selected ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                          onClick={() => setEditing(s => s && ({
                            ...s,
                            requiredTags: selected ? s.requiredTags.filter(t => t !== tag) : [...s.requiredTags, tag],
                            excludedTags: selected ? s.excludedTags : s.excludedTags.filter(t => t !== tag),
                          }))}
                        >{tag}</button>
                      );
                    })}
                    {(availTags ?? []).length === 0 && <span className="text-xs text-slate-400">Nenhuma tag cadastrada</span>}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">NÃO dispara se o lead TEM alguma destas tags</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(availTags ?? []).map(tag => {
                      const selected = editing.excludedTags.includes(tag);
                      return (
                        <button key={tag} type="button"
                          className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${selected ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:border-red-400'}`}
                          onClick={() => setEditing(s => s && ({
                            ...s,
                            excludedTags: selected ? s.excludedTags.filter(t => t !== tag) : [...s.excludedTags, tag],
                            requiredTags: selected ? s.requiredTags : s.requiredTags.filter(t => t !== tag),
                          }))}
                        >{tag}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {editing.actionType === 'enroll_sequence' && (
                <div className="flex items-center gap-2">
                  <Switch checked={editing.cancelOtherSequences} onCheckedChange={(checked) => setEditing(s => s && ({ ...s, cancelOtherSequences: checked }))} />
                  <Label className="!mb-0 text-xs">Cancelar inscrições ativas em outras sequências ao inscrever</Label>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={editing.active} onCheckedChange={(checked) => setEditing(s => s && ({ ...s, active: checked }))} />
                <Label className="!mb-0">Ativa</Label>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tags ───────────────────────────────────────────────────────────────────

const TAG_COLOR_PRESETS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

function TagsTab() {
  const utils = trpc.useUtils();
  const { data: tagList, isLoading } = trpc.tags.list.useQuery();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_COLOR_PRESETS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const invalidateTags = () => {
    utils.tags.list.invalidate();
    utils.emailMarketing.listTags.invalidate();
  };

  const createMutation = trpc.tags.create.useMutation({
    onSuccess: () => {
      invalidateTags();
      setNewName("");
      setNewColor(TAG_COLOR_PRESETS[0]);
      toast.success("Tag criada");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.tags.update.useMutation({
    onSuccess: () => {
      invalidateTags();
      setEditingId(null);
      toast.success("Tag atualizada");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.tags.delete.useMutation({
    onSuccess: () => {
      invalidateTags();
      toast.success("Tag excluída");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate({ name, color: newColor });
  };

  const startEdit = (tag: { id: number; name: string; color: string }) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const saveEdit = () => {
    if (editingId == null) return;
    const name = editName.trim();
    if (!name) return;
    updateMutation.mutate({ id: editingId, name, color: editColor });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag size={16} className="text-blue-900" /> Tags <span className="text-slate-400 font-normal">({tagList?.length ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Cadastre aqui as tags que os atendentes poderão escolher ao classificar tarefas.
            Assim todo mundo usa o mesmo padrão, sem variações ou duplicatas.
          </p>

          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Nome da nova tag (ex: cliente-vip)"
              className="flex-1 min-w-[180px] bg-white"
            />
            <div className="flex items-center gap-2">
              {TAG_COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition ${newColor === c ? 'border-slate-900 scale-110' : 'border-white'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <Button size="sm" className="bg-blue-900 hover:bg-blue-800 shadow-sm gap-1.5" onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
              <Plus size={14} /> Adicionar
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : tagList && tagList.length > 0 ? (
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {tagList.map(tag => (
                <div key={tag.id} className="flex items-center gap-2 p-2.5 group">
                  {editingId === tag.id ? (
                    <>
                      <div className="flex items-center gap-2">
                        {TAG_COLOR_PRESETS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-7 h-7 rounded-full border-2 transition ${editColor === c ? 'border-slate-900 scale-110' : 'border-white'}`}
                            style={{ backgroundColor: c }}
                            title={c}
                          />
                        ))}
                      </div>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        className="flex-1 h-8"
                        autoFocus
                      />
                      <Button size="sm" className="bg-blue-900 hover:bg-blue-800 shadow-sm" onClick={saveEdit} disabled={!editName.trim() || updateMutation.isPending}>Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                      <span className="flex-1 text-sm font-medium text-slate-700">{tag.name}</span>
                      <button
                        type="button"
                        onClick={() => startEdit(tag)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-blue-700 hover:bg-blue-50 sm:opacity-0 sm:group-hover:opacity-100 transition"
                        title="Renomear / cor"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Excluir a tag "${tag.name}"? Ela será removida de todas as tarefas.`)) deleteMutation.mutate({ id: tag.id }); }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100 transition"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Tag} message="Nenhuma tag cadastrada ainda. Crie tags acima para que os atendentes possam usá-las nas tarefas." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Leads Importados (CSV) ───────────────────────────────────────────────

function parseCSVContacts(text: string): { rows: { email: string; name?: string; phone?: string; company?: string; city?: string; state?: string }[]; skipped: number } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], skipped: 0 };

  // Detect separator: semicolon or comma
  const firstLine = lines[0];
  const sep = firstLine.includes(';') ? ';' : ',';

  // Check if first line is a header
  const headerCandidates = ['email', 'e-mail', 'nome', 'name', 'telefone', 'phone', 'empresa', 'company', 'cidade', 'city', 'estado', 'uf', 'state'];
  const firstCells = firstLine.split(sep).map(c => c.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  const isHeader = firstCells.some(c => headerCandidates.includes(c));

  if (!isHeader) {
    // Assume one-email-per-line
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const rows: { email: string }[] = [];
    let skipped = 0;
    for (const line of lines) {
      const email = line.trim().replace(/^["']|["']$/g, '');
      if (emailRe.test(email)) rows.push({ email });
      else skipped++;
    }
    return { rows, skipped };
  }

  // Map header columns
  const colMap: Record<string, number> = {};
  const mapping: Record<string, string[]> = {
    email: ['email', 'e-mail'],
    name: ['nome', 'name'],
    phone: ['telefone', 'phone', 'tel', 'celular'],
    company: ['empresa', 'company'],
    city: ['cidade', 'city'],
    state: ['estado', 'uf', 'state'],
  };
  for (let i = 0; i < firstCells.length; i++) {
    for (const [field, aliases] of Object.entries(mapping)) {
      if (aliases.includes(firstCells[i]) && !(field in colMap)) {
        colMap[field] = i;
      }
    }
  }

  if (!('email' in colMap)) return { rows: [], skipped: lines.length - 1 };

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const rows: { email: string; name?: string; phone?: string; company?: string; city?: string; state?: string }[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const email = cells[colMap.email]?.trim();
    if (!email || !emailRe.test(email)) { skipped++; continue; }
    rows.push({
      email,
      name: colMap.name !== undefined ? cells[colMap.name]?.trim() || undefined : undefined,
      phone: colMap.phone !== undefined ? cells[colMap.phone]?.trim() || undefined : undefined,
      company: colMap.company !== undefined ? cells[colMap.company]?.trim() || undefined : undefined,
      city: colMap.city !== undefined ? cells[colMap.city]?.trim() || undefined : undefined,
      state: colMap.state !== undefined ? cells[colMap.state]?.trim() || undefined : undefined,
    });
  }

  return { rows, skipped };
}

function MarketingContactsSection() {
  const utils = trpc.useUtils();
  const { data: stats } = trpc.emailMarketing.marketingContactStats.useQuery();
  const { data: sequences } = trpc.emailMarketing.listSequences.useQuery();
  const { data: lists } = trpc.emailMarketing.listMarketingLists.useQuery();

  const [activeListId, setActiveListId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "unsubscribed">("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 350));
  };

  const { data: contactsData, isLoading } = trpc.emailMarketing.listMarketingContacts.useQuery({
    search: debouncedSearch || undefined,
    listId: activeListId !== "all" ? activeListId : undefined,
    status: statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  // Mutations
  const importMutation = trpc.emailMarketing.importMarketingContacts.useMutation();
  const updateMutation = trpc.emailMarketing.updateMarketingContact.useMutation();
  const deleteMutation = trpc.emailMarketing.deleteMarketingContacts.useMutation();
  const unsubMutation = trpc.emailMarketing.unsubscribeMarketingContact.useMutation();
  const tagMutation = trpc.emailMarketing.tagMarketingContacts.useMutation();
  const enrollMutation = trpc.emailMarketing.enrollMarketingContactsInSequence.useMutation();
  const upsertListMutation = trpc.emailMarketing.upsertMarketingList.useMutation();
  const deleteListMutation = trpc.emailMarketing.deleteMarketingList.useMutation();
  const moveContactsMutation = trpc.emailMarketing.moveContactsToList.useMutation();

  const invalidateAll = () => {
    utils.emailMarketing.listMarketingContacts.invalidate();
    utils.emailMarketing.marketingContactStats.invalidate();
    utils.emailMarketing.listMarketingContactTags.invalidate();
    utils.emailMarketing.listMarketingLists.invalidate();
  };

  // Import dialog
  const [showImport, setShowImport] = useState(false);
  const [importPreview, setImportPreview] = useState<{ rows: { email: string; name?: string; phone?: string; company?: string; city?: string; state?: string }[]; skipped: number } | null>(null);
  const [importExtraTags, setImportExtraTags] = useState("");
  const [importListMode, setImportListMode] = useState<"new" | "existing">("new");
  const [importNewListName, setImportNewListName] = useState("");
  const [importExistingListId, setImportExistingListId] = useState("");

  const resetImportDialog = () => {
    setImportPreview(null);
    setImportExtraTags("");
    setImportListMode("new");
    setImportNewListName("");
    setImportExistingListId("");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const parsed = parseCSVContacts(text);
      setImportPreview(parsed);
      if (!importNewListName) {
        const baseName = file.name.replace(/\.(csv|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
        setImportNewListName(baseName || "");
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) return;
    if (importListMode === "new" && !importNewListName.trim()) {
      toast.error("Informe o nome da lista");
      return;
    }
    try {
      const extraTags = importExtraTags.split(',').map(t => t.trim()).filter(Boolean);
      const res = await importMutation.mutateAsync({
        contacts: importPreview.rows,
        tags: extraTags,
        newListName: importListMode === "new" ? importNewListName.trim() : undefined,
        listId: importListMode === "existing" && importExistingListId ? Number(importExistingListId) : undefined,
      });
      toast.success(`Importados: ${res.imported} novos, ${res.updated} atualizados${res.skippedInvalid > 0 ? `, ${res.skippedInvalid} ignorados` : ''}`);
      if (res.listId) setActiveListId(res.listId);
      setShowImport(false);
      resetImportDialog();
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao importar contatos");
    }
  };

  // Edit dialog
  const [editContact, setEditContact] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", company: "", city: "", state: "", tags: "", notes: "" });

  const openEdit = (c: any) => {
    setEditContact(c);
    setEditForm({
      name: c.name ?? "", phone: c.phone ?? "", company: c.company ?? "",
      city: c.city ?? "", state: c.state ?? "", tags: (c.tags ?? []).join(", "), notes: c.notes ?? "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editContact) return;
    try {
      await updateMutation.mutateAsync({
        id: editContact.id,
        name: editForm.name, phone: editForm.phone, company: editForm.company,
        city: editForm.city, state: editForm.state,
        tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
        notes: editForm.notes,
      });
      toast.success("Contato atualizado");
      setEditContact(null);
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao atualizar contato");
    }
  };

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleId = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (!contactsData) return;
    if (selectedIds.size === contactsData.contacts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(contactsData.contacts.map(c => c.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} contato(s)?`)) return;
    try {
      await deleteMutation.mutateAsync({ ids: Array.from(selectedIds) });
      toast.success(`${selectedIds.size} contato(s) excluído(s)`);
      setSelectedIds(new Set());
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir");
    }
  };

  // Bulk add tag dialog
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");

  const handleBulkAddTag = async () => {
    if (selectedIds.size === 0 || !bulkTagInput.trim()) return;
    try {
      await tagMutation.mutateAsync({ ids: Array.from(selectedIds), addTags: [bulkTagInput.trim()] });
      toast.success(`Tag "${bulkTagInput.trim()}" adicionada a ${selectedIds.size} contato(s)`);
      setShowBulkTag(false);
      setBulkTagInput("");
      setSelectedIds(new Set());
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao adicionar tag");
    }
  };

  // Enroll in sequence dialog
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollSeqId, setEnrollSeqId] = useState("");

  const handleEnroll = async () => {
    if (selectedIds.size === 0 || !enrollSeqId) return;
    try {
      const res = await enrollMutation.mutateAsync({ sequenceId: Number(enrollSeqId), contactIds: Array.from(selectedIds) });
      toast.success(`${res.enrolled} contato(s) inscrito(s) na sequência${res.skipped > 0 ? ` (${res.skipped} ignorado(s))` : ''}`);
      setShowEnroll(false);
      setEnrollSeqId("");
      setSelectedIds(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao inscrever em sequência");
    }
  };

  // Move to list dialog
  const [showMoveList, setShowMoveList] = useState(false);
  const [moveListId, setMoveListId] = useState("");

  const handleMoveToList = async () => {
    if (selectedIds.size === 0) return;
    try {
      await moveContactsMutation.mutateAsync({
        contactIds: Array.from(selectedIds),
        listId: moveListId ? Number(moveListId) : null,
      });
      toast.success(`${selectedIds.size} contato(s) movido(s)`);
      setShowMoveList(false);
      setMoveListId("");
      setSelectedIds(new Set());
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao mover contatos");
    }
  };

  // Rename list dialog
  const [showRenameList, setShowRenameList] = useState(false);
  const [renameListName, setRenameListName] = useState("");

  const handleRenameList = async () => {
    if (activeListId === "all" || !renameListName.trim()) return;
    try {
      await upsertListMutation.mutateAsync({ id: activeListId, name: renameListName.trim() });
      toast.success("Lista renomeada");
      setShowRenameList(false);
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao renomear lista");
    }
  };

  const handleDeleteList = async (listId: number) => {
    if (!confirm("Excluir esta lista? Os contatos não serão excluídos, apenas desvinculados.")) return;
    try {
      await deleteListMutation.mutateAsync({ id: listId });
      if (activeListId === listId) setActiveListId("all");
      toast.success("Lista excluída");
      invalidateAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir lista");
    }
  };

  const totalPages = Math.ceil((contactsData?.total ?? 0) / PAGE_SIZE);
  const activeSequences = sequences?.filter(s => s.active) ?? [];
  const activeListObj = lists?.find(l => l.id === activeListId);

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatTile icon={UserPlus} label="Total importados" value={stats.total} accent="bg-blue-100 text-blue-700" />
          <StatTile icon={CheckCircle} label="Ativos" value={stats.active} accent="bg-emerald-100 text-emerald-700" />
          <StatTile icon={XCircle} label="Descadastrados" value={stats.unsubscribed} accent="bg-red-100 text-red-600" />
          <StatTile icon={FolderOpen} label="Listas" value={lists?.length ?? 0} accent="bg-violet-100 text-violet-700" />
        </div>
      )}

      {/* Mobile-only list selector */}
      <div className="lg:hidden">
        <Select value={activeListId === "all" ? "__all__" : String(activeListId)} onValueChange={(v) => { setActiveListId(v === "__all__" ? "all" : Number(v)); setPage(0); setSelectedIds(new Set()); }}>
          <SelectTrigger className="w-full"><div className="flex items-center gap-1.5"><FolderOpen size={14} /><span>{activeListId === "all" ? "Todos os contatos" : (lists?.find(l => l.id === activeListId)?.name ?? "Lista")}</span></div></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os contatos ({stats?.total ?? 0})</SelectItem>
            {lists?.map(l => (<SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.contactCount})</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Lists sidebar */}
        <div className="w-full lg:w-56 flex-shrink-0 hidden lg:block">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <FolderOpen size={14} className="text-blue-900" /> Listas
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 pb-3">
              <button
                type="button"
                onClick={() => { setActiveListId("all"); setPage(0); setSelectedIds(new Set()); }}
                className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${activeListId === "all" ? "bg-blue-900 text-white font-medium" : "text-slate-600 hover:bg-slate-100"}`}
              >
                <span>Todos os contatos</span>
                <span className={`text-xs ${activeListId === "all" ? "text-blue-200" : "text-slate-400"}`}>{stats?.total ?? 0}</span>
              </button>
              {lists?.map(list => (
                <div key={list.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => { setActiveListId(list.id); setPage(0); setSelectedIds(new Set()); }}
                    className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors flex items-center justify-between ${activeListId === list.id ? "bg-blue-900 text-white font-medium" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    <span className="truncate pr-1">{list.name}</span>
                    <span className={`text-xs flex-shrink-0 ${activeListId === list.id ? "text-blue-200" : "text-slate-400"}`}>{list.contactCount}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteList(list.id)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100 transition"
                    title="Excluir lista"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <div className="pt-2 border-t border-slate-100 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5 text-xs"
                  onClick={() => setShowImport(true)}
                >
                  <Upload size={12} /> Importar CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  {activeListId === "all" ? (
                    <>
                      <Upload size={16} className="text-blue-900" /> Todos os contatos
                    </>
                  ) : (
                    <>
                      <FolderOpen size={16} className="text-blue-900" /> {activeListObj?.name ?? "Lista"}
                    </>
                  )}
                  <span className="text-slate-400 font-normal">({contactsData?.total ?? 0})</span>
                </CardTitle>
                <div className="flex gap-2">
                  {activeListId !== "all" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs"
                      onClick={() => { setRenameListName(activeListObj?.name ?? ""); setShowRenameList(true); }}
                    >
                      <Pencil size={12} /> Renomear
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="bg-blue-900 hover:bg-blue-800 shadow-sm gap-1.5"
                    onClick={() => setShowImport(true)}
                  >
                    <Upload size={14} /> Importar CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Search and filters */}
              <div className="flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={e => handleSearch(e.target.value)}
                      placeholder="Buscar por e-mail, nome ou empresa..."
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="active">Ativos</SelectItem>
                      <SelectItem value="unsubscribed">Descadastrados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Bulk actions */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-2.5 text-sm text-blue-900 flex-wrap">
                  <span className="font-medium">{selectedIds.size} selecionado(s)</span>
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleBulkDelete} disabled={deleteMutation.isPending}>
                    <Trash2 size={12} /> Excluir
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowBulkTag(true)}>
                    <Tag size={12} /> Add tag
                  </Button>
                  {lists && lists.length > 0 && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowMoveList(true)}>
                      <ArrowRightLeft size={12} /> Mover p/ lista
                    </Button>
                  )}
                  {activeSequences.length > 0 && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowEnroll(true)}>
                      <Workflow size={12} /> Inscrever em sequência
                    </Button>
                  )}
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-auto p-1 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Table */}
              {isLoading ? (
                <p className="text-sm text-slate-500">Carregando...</p>
              ) : contactsData && contactsData.contacts.length > 0 ? (
                <>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead className={THEAD_CLASS}>
                        <tr>
                          <th className={TH_CLASS}>
                            <Checkbox
                              checked={selectedIds.size === contactsData.contacts.length && contactsData.contacts.length > 0}
                              onCheckedChange={toggleAll}
                            />
                          </th>
                          <th className={TH_CLASS}>E-mail</th>
                          <th className={TH_CLASS}>Nome</th>
                          <th className={TH_CLASS}>Empresa</th>
                          <th className={TH_CLASS}>Status</th>
                          <th className={TH_CLASS}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contactsData.contacts.map((c) => (
                          <tr key={c.id} className={TR_CLASS}>
                            <td className="px-3 py-2.5">
                              <Checkbox
                                checked={selectedIds.has(c.id)}
                                onCheckedChange={() => toggleId(c.id)}
                              />
                            </td>
                            <td className="px-3 py-2.5 font-medium text-slate-700">{c.email}</td>
                            <td className="px-3 py-2.5 text-slate-600">{c.name || "--"}</td>
                            <td className="px-3 py-2.5 text-slate-600">{c.company || "--"}</td>
                            <td className="px-3 py-2.5">
                              <Badge variant="outline" className={c.status === 'active' ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-600 border-red-200"}>
                                {c.status === 'active' ? 'Ativo' : 'Descadastrado'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1">
                                <button type="button" onClick={() => openEdit(c)} className="p-1.5 rounded-md text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition" title="Editar">
                                  <Pencil size={14} />
                                </button>
                                {c.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Descadastrar "${c.email}"?`)) return;
                                      try {
                                        await unsubMutation.mutateAsync({ id: c.id });
                                        toast.success("Contato descadastrado");
                                        invalidateAll();
                                      } catch (e: any) { toast.error(e?.message ?? "Erro"); }
                                    }}
                                    className="p-1.5 rounded-md text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition"
                                    title="Descadastrar"
                                  >
                                    <MailX size={14} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm(`Excluir "${c.email}"?`)) return;
                                    try {
                                      await deleteMutation.mutateAsync({ ids: [c.id] });
                                      toast.success("Contato excluído");
                                      invalidateAll();
                                    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
                                  }}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                                  title="Excluir"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                        Anterior
                      </Button>
                      <span>
                        Página {page + 1} de {totalPages} ({contactsData.total} contato{contactsData.total === 1 ? "" : "s"})
                      </span>
                      <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>
                        Próxima
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState icon={Upload} message={search || statusFilter !== 'all' ? "Nenhum contato encontrado com esses filtros." : activeListId !== "all" ? "Esta lista está vazia. Importe contatos via CSV." : "Nenhum lead importado ainda. Use o botão 'Importar CSV' para adicionar contatos."} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Import CSV dialog */}
      <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) resetImportDialog(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><Upload size={16} /></span>
              Importar leads via CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              <FileText size={16} className="mt-0.5 flex-shrink-0" />
              <p>
                Envie um CSV com colunas: <strong>email</strong> (obrigatório), nome, telefone, empresa, cidade, estado/UF.
                Aceita separador <code>;</code> ou <code>,</code>. Também aceita um arquivo simples com um e-mail por linha.
              </p>
            </div>

            {/* List selection */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><FolderOpen size={13} /> Adicionar a qual lista?</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImportListMode("new")}
                  className={`flex-1 text-sm px-3 py-2.5 rounded-lg border font-medium transition-colors ${importListMode === "new" ? "bg-blue-900 text-white border-blue-900" : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50"}`}
                >
                  <FolderPlus size={14} className="inline mr-1.5 -mt-0.5" /> Nova lista
                </button>
                <button
                  type="button"
                  onClick={() => setImportListMode("existing")}
                  className={`flex-1 text-sm px-3 py-2.5 rounded-lg border font-medium transition-colors ${importListMode === "existing" ? "bg-blue-900 text-white border-blue-900" : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50"}`}
                  disabled={!lists || lists.length === 0}
                >
                  <FolderOpen size={14} className="inline mr-1.5 -mt-0.5" /> Lista existente
                </button>
              </div>
              {importListMode === "new" ? (
                <Input
                  value={importNewListName}
                  onChange={e => setImportNewListName(e.target.value)}
                  placeholder="Nome da lista (ex: Feira 2026, Leads Google Ads)"
                />
              ) : (
                <Select value={importExistingListId} onValueChange={setImportExistingListId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione uma lista..." /></SelectTrigger>
                  <SelectContent>
                    {lists?.map(l => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.contactCount})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label>Arquivo CSV</Label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer mt-1"
              />
            </div>

            {importPreview && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{importPreview.rows.length} válido(s)</Badge>
                  {importPreview.skipped > 0 && (
                    <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">{importPreview.skipped} ignorado(s)</Badge>
                  )}
                </div>
                {importPreview.rows.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-500">E-mail</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-500">Nome</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-500">Empresa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="px-2 py-1.5 text-slate-700">{r.email}</td>
                            <td className="px-2 py-1.5 text-slate-500">{r.name || "--"}</td>
                            <td className="px-2 py-1.5 text-slate-500">{r.company || "--"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.rows.length > 10 && (
                      <p className="text-xs text-slate-400 px-2 py-1.5 bg-slate-50">... e mais {importPreview.rows.length - 10} contato(s)</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Tags extras (separadas por vírgula, opcional)</Label>
              <Input
                value={importExtraTags}
                onChange={e => setImportExtraTags(e.target.value)}
                placeholder='Ex: "Sal Grosso, Atacado"'
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              className="flex-1 bg-blue-900 hover:bg-blue-800"
              onClick={handleImport}
              disabled={importMutation.isPending || !importPreview || importPreview.rows.length === 0 || (importListMode === "new" && !importNewListName.trim())}
            >
              {importMutation.isPending ? "Importando..." : `Importar ${importPreview?.rows.length ?? 0} contato(s)`}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => { setShowImport(false); resetImportDialog(); }}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit contact dialog */}
      <Dialog open={!!editContact} onOpenChange={(open) => { if (!open) setEditContact(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><Pencil size={16} /></span>
              Editar contato
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Telefone</Label><Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Empresa</Label><Input value={editForm.company} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))} /></div>
              <div><Label>Cidade</Label><Input value={editForm.city} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} /></div>
            </div>
            <div><Label>Estado/UF</Label><Input value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} /></div>
            <div><Label>Tags (separadas por vírgula)</Label><Input value={editForm.tags} onChange={e => setEditForm(f => ({ ...f, tags: e.target.value }))} /></div>
            <div><Label>Notas</Label><Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setEditContact(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk add tag dialog */}
      <Dialog open={showBulkTag} onOpenChange={setShowBulkTag}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Adicionar tag</DialogTitle></DialogHeader>
          <div><Label>Nome da tag</Label><Input value={bulkTagInput} onChange={e => setBulkTagInput(e.target.value)} placeholder="Ex: Feira 2026" autoFocus onKeyDown={e => { if (e.key === 'Enter') handleBulkAddTag(); }} /></div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleBulkAddTag} disabled={tagMutation.isPending || !bulkTagInput.trim()}>
              {tagMutation.isPending ? "Adicionando..." : `Adicionar a ${selectedIds.size} contato(s)`}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowBulkTag(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll in sequence dialog */}
      <Dialog open={showEnroll} onOpenChange={setShowEnroll}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Inscrever em sequência</DialogTitle></DialogHeader>
          <div>
            <Label>Sequência</Label>
            <Select value={enrollSeqId} onValueChange={setEnrollSeqId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {activeSequences.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleEnroll} disabled={enrollMutation.isPending || !enrollSeqId}>
              {enrollMutation.isPending ? "Inscrevendo..." : `Inscrever ${selectedIds.size} contato(s)`}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowEnroll(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to list dialog */}
      <Dialog open={showMoveList} onOpenChange={setShowMoveList}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Mover para lista</DialogTitle></DialogHeader>
          <div>
            <Label>Lista destino</Label>
            <Select value={moveListId} onValueChange={setMoveListId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {lists?.map(l => (
                  <SelectItem key={l.id} value={String(l.id)}>{l.name} ({l.contactCount})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleMoveToList} disabled={moveContactsMutation.isPending || !moveListId}>
              {moveContactsMutation.isPending ? "Movendo..." : `Mover ${selectedIds.size} contato(s)`}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowMoveList(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename list dialog */}
      <Dialog open={showRenameList} onOpenChange={setShowRenameList}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Renomear lista</DialogTitle></DialogHeader>
          <div><Label>Nome</Label><Input value={renameListName} onChange={e => setRenameListName(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleRenameList(); }} /></div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-blue-900 hover:bg-blue-800" onClick={handleRenameList} disabled={upsertListMutation.isPending || !renameListName.trim()}>
              {upsertListMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setShowRenameList(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Contatos ──────────────────────────────────────────────────────────────

const SUPPRESSION_REASON_LABELS: Record<string, string> = {
  unsubscribe: "Descadastrado",
  bounce: "Bounce",
  complaint: "Reclamação",
  manual: "Manual",
};

function ContactsTab() {
  const utils = trpc.useUtils();
  const { data: stats } = trpc.emailMarketing.contactStats.useQuery();
  const { data: sellers } = trpc.sellers.list.useQuery();
  const { data: tags } = trpc.emailMarketing.listTags.useQuery();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState<"all" | "leads" | "clients">("all");
  const [status, setStatus] = useState<"all" | "active" | "suppressed">("all");
  const [assignedTo, setAssignedTo] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const removeSuppMutation = trpc.emailMarketing.removeSuppression.useMutation();
  const addSuppMutation = trpc.emailMarketing.addSuppression.useMutation();

  const [showAddSupp, setShowAddSupp] = useState(false);
  const [suppEmail, setSuppEmail] = useState("");

  const handleAddSuppression = async () => {
    if (!suppEmail.trim()) return;
    try {
      await addSuppMutation.mutateAsync({ email: suppEmail.trim(), reason: "manual" });
      toast.success("E-mail descadastrado com sucesso");
      setSuppEmail("");
      setShowAddSupp(false);
      utils.emailMarketing.listContacts.invalidate();
      utils.emailMarketing.contactStats.invalidate();
      utils.emailMarketing.listSuppressions.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao descadastrar e-mail");
    }
  };

  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => { setDebouncedSearch(v); setPage(0); }, 350));
  };

  const { data: contactsData, isLoading } = trpc.emailMarketing.listContacts.useQuery({
    search: debouncedSearch || undefined,
    source,
    status,
    assignedTo: assignedTo || undefined,
    tags: selectedTags.length > 0 ? selectedTags : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const handleRemoveSuppression = async (email: string) => {
    if (!confirm(`Reativar o e-mail "${email}"? Ele voltará a receber disparos.`)) return;
    try {
      await removeSuppMutation.mutateAsync({ email });
      toast.success("E-mail reativado com sucesso");
      utils.emailMarketing.listContacts.invalidate();
      utils.emailMarketing.contactStats.invalidate();
      utils.emailMarketing.listSuppressions.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao reativar e-mail");
    }
  };

  const totalPages = Math.ceil((contactsData?.total ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <MarketingContactsSection />

      <hr className="border-slate-200" />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <StatTile icon={CheckCircle} label="Leads confirmados" value={stats.confirmedLeads} accent="bg-emerald-100 text-emerald-700" />
          <StatTile icon={Users} label="Clientes" value={stats.totalClients} accent="bg-slate-100 text-slate-600" />
          <StatTile icon={XCircle} label="Aguard. confirmação" value={stats.unconfirmedLeads} accent="bg-amber-100 text-amber-700" />
          <StatTile icon={MailX} label="Descadastrados" value={stats.unsubscribed} accent="bg-orange-100 text-orange-600" />
          <StatTile icon={AlertTriangle} label="Bounced" value={stats.bounced} accent="bg-red-100 text-red-600" />
          <StatTile icon={XCircle} label="Reclamações" value={stats.complained} accent="bg-rose-100 text-rose-600" />
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Contact size={16} className="text-blue-900" /> Contatos
              <span className="text-slate-400 font-normal">({contactsData?.total ?? 0})</span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 shadow-sm"
              onClick={() => setShowAddSupp(true)}
            >
              <MailX size={14} className="mr-1" /> Descadastrar e-mail
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2.5">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Buscar por e-mail ou nome..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={source} onValueChange={(v: any) => { setSource(v); setPage(0); }}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas origens</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="clients">Clientes</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(0); }}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="suppressed">Suprimidos</SelectItem>
                </SelectContent>
              </Select>

              {source !== "clients" && sellers && sellers.length > 0 && (
                <Select value={assignedTo || "__all__"} onValueChange={(v) => { setAssignedTo(v === "__all__" ? "" : v); setPage(0); }}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Atendente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos atend.</SelectItem>
                    {sellers.map(s => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {tags && tags.length > 0 && source !== "clients" && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => { setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]); setPage(0); }}
                    className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${selectedTags.includes(tag) ? "bg-blue-900 text-white border-blue-900 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:border-blue-200"}`}
                  >
                    {tag}
                  </button>
                ))}
                {selectedTags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setSelectedTags([]); setPage(0); }}
                    className="text-xs px-2.5 py-1 rounded-full border border-red-200 text-red-500 hover:bg-red-50 font-medium transition-colors"
                  >
                    Limpar tags
                  </button>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : contactsData && contactsData.contacts.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className={THEAD_CLASS}>
                    <tr>
                      <th className={TH_CLASS}>E-mail</th>
                      <th className={TH_CLASS}>Nome</th>
                      <th className={TH_CLASS}>Origem</th>
                      <th className={TH_CLASS}>Status</th>
                      <th className={TH_CLASS}>Tags</th>
                      <th className={TH_CLASS}>Atendente</th>
                      <th className={TH_CLASS}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactsData.contacts.map((c) => (
                      <tr key={c.email} className={TR_CLASS}>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{c.email}</td>
                        <td className="px-3 py-2.5 text-slate-600">{c.name || "--"}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={c.source === 'lead' ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-slate-100 text-slate-600 border-slate-200"}>
                            {c.source === 'lead' ? 'Lead' : 'Cliente'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          {c.suppressionReason ? (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                              {SUPPRESSION_REASON_LABELS[c.suppressionReason] ?? c.suppressionReason}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              Ativo
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.tags && c.tags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {c.tags.slice(0, 3).map(t => (
                                <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">{t}</span>
                              ))}
                              {c.tags.length > 3 && <span className="text-xs text-slate-400">+{c.tags.length - 3}</span>}
                            </div>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{c.assignedTo ?? "--"}</td>
                        <td className="px-3 py-2.5">
                          {c.suppressionReason && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 text-xs"
                              onClick={() => handleRemoveSuppression(c.email)}
                              disabled={removeSuppMutation.isPending}
                              title="Reativar contato"
                            >
                              <RotateCcw size={12} /> Reativar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
                    Anterior
                  </Button>
                  <span>
                    Página {page + 1} de {totalPages} ({contactsData.total} contato{contactsData.total === 1 ? "" : "s"})
                  </span>
                  <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Próxima
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={Contact} message={search || selectedTags.length > 0 || status !== 'all' ? "Nenhum contato encontrado com esses filtros." : "Nenhum contato confirmado ainda. Os e-mails aparecem aqui após serem confirmados pelo atendente na tela de Tarefas."} />
          )}
        </CardContent>
      </Card>

      {/* Add suppression dialog */}
      <Dialog open={showAddSupp} onOpenChange={(open) => { setShowAddSupp(open); if (!open) setSuppEmail(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600"><MailX size={16} /></span>
              Descadastrar e-mail
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <p>O e-mail será adicionado à lista de descadastrados e não receberá mais nenhum disparo (campanhas, sequências ou disparo rápido).</p>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                value={suppEmail}
                onChange={e => setSuppEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSuppression(); }}
                placeholder="email@exemplo.com"
                type="email"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={handleAddSuppression} disabled={addSuppMutation.isPending || !suppEmail.trim()}>
              {addSuppMutation.isPending ? "Descadastrando..." : "Descadastrar"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => { setShowAddSupp(false); setSuppEmail(""); }}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportSection />
    </div>
  );
}

// ── Exportar ───────────────────────────────────────────────────────────────

type ExportRow = {
  name: string | null;
  email: string;
  phone: string | null;
  tags: string[] | null;
  assignedTo: string | null;
  lastContactedAt: string | Date | null;
  convertedAt: string | Date | null;
  opens: number;
  clicks: number;
  lastEventAt: string | Date | null;
};

// Escapes a single CSV field for Excel PT-BR (`;` separator): wraps in quotes
// when the value contains `;`, `"` or a newline, doubling internal quotes.
function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ExportSection() {
  const { data: tags } = trpc.emailMarketing.listTags.useQuery();

  const [filters, setFilters] = useState<{
    tags: string[];
    converted: "all" | "yes" | "no";
    engagement: "all" | "opened" | "not_opened" | "clicked" | "not_clicked";
    engagementWindowDays: string;
    inactiveDays: string;
    hotOnly: boolean;
    assignedTo: string;
  }>({
    tags: [],
    converted: "all",
    engagement: "all",
    engagementWindowDays: "90",
    inactiveDays: "",
    hotOnly: false,
    assignedTo: "",
  });

  const [result, setResult] = useState<ExportRow[] | null>(null);

  const exportInput = useMemo(() => {
    const input: Record<string, unknown> = {};
    if (filters.tags.length > 0) input.tags = filters.tags;
    if (filters.converted !== "all") input.converted = filters.converted;
    if (filters.engagement !== "all") {
      input.engagement = filters.engagement;
      const win = Number(filters.engagementWindowDays);
      if (filters.engagementWindowDays.trim() && !isNaN(win) && win > 0) {
        input.engagementWindowDays = win;
      }
    }
    if (filters.inactiveDays.trim()) {
      const days = Number(filters.inactiveDays);
      if (!isNaN(days) && days > 0) input.inactiveDays = days;
    }
    if (filters.hotOnly) input.hotOnly = true;
    if (filters.assignedTo.trim()) input.assignedTo = filters.assignedTo.trim();
    return input;
  }, [filters]);

  const exportQuery = trpc.emailMarketing.exportLeads.useQuery(exportInput as any, { enabled: false });

  const toggleTag = (tag: string) => {
    setFilters(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  };

  const handlePreview = async () => {
    try {
      const res = await exportQuery.refetch();
      if (res.error) {
        toast.error(res.error.message ?? "Erro ao buscar leads");
        return;
      }
      setResult((res.data as ExportRow[]) ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao buscar leads");
    }
  };

  const handleDownload = async () => {
    try {
      const res = await exportQuery.refetch();
      if (res.error) {
        toast.error(res.error.message ?? "Erro ao buscar leads");
        return;
      }
      const rows = (res.data as ExportRow[]) ?? [];
      setResult(rows);
      if (rows.length === 0) {
        toast.warning("Nenhum lead encontrado com esses filtros");
        return;
      }

      const header = ["Nome", "Email", "Telefone", "Tags", "Atendente", "Último contato", "Convertido em", "Aberturas", "Cliques", "Último evento"];
      const lines = rows.map(r => [
        r.name ?? "",
        r.email,
        r.phone ?? "",
        (r.tags ?? []).join(", "),
        r.assignedTo ?? "",
        csvDate(r.lastContactedAt),
        csvDate(r.convertedAt),
        String(r.opens ?? 0),
        String(r.clicks ?? 0),
        csvDate(r.lastEventAt),
      ].map(v => csvEscape(String(v))).join(";"));

      const csv = [header.join(";"), ...lines].join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date();
      const p = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
      a.href = url;
      a.download = `leads-export-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`✅ CSV gerado com ${rows.length} lead(s)`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar CSV");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download size={16} className="text-blue-900" /> Exportar leads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Filtre os leads e exporte para CSV (Excel). Útil para campanhas externas,
            limpeza de base (quem não abriu / não respondeu) e priorização de telefonemas (quem está quente 🔥).
          </p>

          {tags && tags.length > 0 && (
            <div>
              <Label className="flex items-center gap-1"><Filter size={12} /> Tags</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${filters.tags.includes(tag) ? "bg-blue-900 text-white border-blue-900 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50 hover:border-blue-200"}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Convertido em cliente?</Label>
              <Select value={filters.converted} onValueChange={(v: any) => setFilters(f => ({ ...f, converted: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Sim</SelectItem>
                  <SelectItem value="no">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Atendente (opcional)</Label>
              <Input value={filters.assignedTo} onChange={e => setFilters(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Nome do atendente" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Engajamento</Label>
              <Select value={filters.engagement} onValueChange={(v: any) => setFilters(f => ({ ...f, engagement: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  {Object.entries(EXPORT_ENGAGEMENT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filters.engagement !== "all" && (
              <div>
                <Label>Janela (dias)</Label>
                <Input type="number" min={1} value={filters.engagementWindowDays} onChange={e => setFilters(f => ({ ...f, engagementWindowDays: e.target.value }))} placeholder="90" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Sem contato há N dias (opcional)</Label>
              <Input type="number" min={1} value={filters.inactiveDays} onChange={e => setFilters(f => ({ ...f, inactiveDays: e.target.value }))} placeholder="Ex: 30" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={filters.hotOnly} onCheckedChange={(checked) => setFilters(f => ({ ...f, hotOnly: checked === true }))} />
              <Label className="!mb-0">🔥 Só quentes</Label>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap pt-1">
            <Button variant="outline" onClick={handlePreview} disabled={exportQuery.isFetching}>
              <Eye size={14} className="mr-1" /> {exportQuery.isFetching ? "Buscando..." : "Pré-visualizar"}
            </Button>
            <Button className="bg-blue-900 hover:bg-blue-800 shadow-sm" onClick={handleDownload} disabled={exportQuery.isFetching}>
              <Download size={14} className="mr-1" /> {exportQuery.isFetching ? "Gerando..." : "Baixar CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox size={16} className="text-blue-900" /> Resultado <span className="text-slate-400 font-normal">({result.length} lead{result.length === 1 ? "" : "s"})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.length > 0 ? (
              <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-200">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className={`${THEAD_CLASS} sticky top-0`}>
                    <tr>
                      <th className={TH_CLASS}>Nome</th>
                      <th className={TH_CLASS}>E-mail</th>
                      <th className={TH_CLASS}>Telefone</th>
                      <th className={TH_CLASS}>Tags</th>
                      <th className={TH_CLASS}>Atendente</th>
                      <th className={TH_CLASS}>Último contato</th>
                      <th className={TH_CLASS}>Convertido em</th>
                      <th className={TH_CLASS}>Aberturas</th>
                      <th className={TH_CLASS}>Cliques</th>
                      <th className={TH_CLASS}>Último evento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.slice(0, 20).map((r, i) => (
                      <tr key={`${r.email}-${i}`} className={TR_CLASS}>
                        <td className="px-3 py-2.5">{r.name ?? "--"}</td>
                        <td className="px-3 py-2.5">{r.email}</td>
                        <td className="px-3 py-2.5">{r.phone ?? "--"}</td>
                        <td className="px-3 py-2.5 text-xs">{(r.tags ?? []).join(", ")}</td>
                        <td className="px-3 py-2.5">{r.assignedTo ?? "--"}</td>
                        <td className="px-3 py-2.5 text-xs">{formatDateTime(r.lastContactedAt)}</td>
                        <td className="px-3 py-2.5 text-xs">{formatDateTime(r.convertedAt)}</td>
                        <td className="px-3 py-2.5 font-medium text-emerald-700">{r.opens ?? 0}</td>
                        <td className="px-3 py-2.5 font-medium text-violet-700">{r.clicks ?? 0}</td>
                        <td className="px-3 py-2.5 text-xs">{formatDateTime(r.lastEventAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Inbox} message="Nenhum lead encontrado com esses filtros." />
            )}
            {result.length > 20 && (
              <p className="text-xs text-gray-500 mt-2">Mostrando os primeiros 20 de {result.length} leads. O CSV completo terá todos os {result.length}.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Consumo (Usage) ──────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR');
}

function UsageTab() {
  const { data, isLoading } = trpc.emailMarketing.usageStats.useQuery();

  if (isLoading) return <p className="text-sm text-slate-500">Carregando...</p>;

  if (!data?.hasAccounts) {
    return (
      <EmptyState
        icon={Gauge}
        message="Nenhuma conta de envio configurada. Configure as variáveis RESEND_MKT_API_KEY_1 / BREVO_API_KEY_1 no painel da Vercel."
      />
    );
  }

  const { accounts, totals } = data;

  const dailyPct = totals.dailyLimit > 0 ? (totals.sentToday / totals.dailyLimit) * 100 : 0;
  const monthlyPct = totals.monthlyLimit > 0 ? (totals.sentThisMonth / totals.monthlyLimit) * 100 : 0;

  const resendAccounts = accounts.filter((a) => a.provider === 'resend');
  const brevoAccounts = accounts.filter((a) => a.provider === 'brevo');
  const resendMonthly = resendAccounts.reduce((s, a) => s + a.sentThisMonth, 0);
  const brevoMonthly = brevoAccounts.reduce((s, a) => s + a.sentThisMonth, 0);

  const resendFreeLimits = { daily: resendAccounts[0]?.dailyLimit ?? 100, monthly: resendAccounts[0]?.monthlyLimit ?? 3000 };
  const brevoFreeLimits = { daily: brevoAccounts[0]?.dailyLimit ?? 300, monthly: brevoAccounts[0]?.monthlyLimit ?? 9000 };

  const resendTotalFreeMonthly = resendAccounts.length * resendFreeLimits.monthly;
  const brevoTotalFreeMonthly = brevoAccounts.length * brevoFreeLimits.monthly;
  const combinedFreeMonthly = resendTotalFreeMonthly + brevoTotalFreeMonthly;

  return (
    <div className="space-y-4">
      {/* Intro / explanation card */}
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Gauge size={18} /> Consumo de envios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600 leading-relaxed">
            Os e-mails são enviados pelas contas em cascata: quando uma conta atinge o limite do plano,
            o sistema passa automaticamente para a próxima. Aqui você acompanha quanto já foi consumido
            de cada plano, hoje e no mês.
          </p>
        </CardContent>
      </Card>

      {/* Summary strip — two big progress bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="rounded-2xl border-slate-200">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Total hoje</span>
              <span className="text-xs text-slate-500">{fmt(totals.remainingToday)} restantes</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor(dailyPct)}`}
                style={{ width: `${Math.min(100, dailyPct)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {fmt(totals.sentToday)} / {fmt(totals.dailyLimit)} ({dailyPct.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-slate-200">
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Total no mês</span>
              <span className="text-xs text-slate-500">{fmt(totals.remainingMonth)} restantes</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor(monthlyPct)}`}
                style={{ width: `${Math.min(100, monthlyPct)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {fmt(totals.sentThisMonth)} / {fmt(totals.monthlyLimit)} ({monthlyPct.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Free plan limits monitor */}
      <Card className={`rounded-2xl ${monthlyPct > 80 ? 'border-red-300 bg-gradient-to-br from-red-50/80 to-white' : monthlyPct > 60 ? 'border-amber-300 bg-gradient-to-br from-amber-50/80 to-white' : 'border-blue-200 bg-gradient-to-br from-blue-50/80 to-white'}`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-blue-900 text-base">
            <AlertTriangle size={18} className={monthlyPct > 80 ? 'text-red-600' : monthlyPct > 60 ? 'text-amber-600' : 'text-blue-700'} />
            Limites dos planos gratuitos
            {monthlyPct > 80 && <Badge className="bg-red-600 text-white border-0 text-[10px]">ATENÇÃO</Badge>}
            {monthlyPct > 60 && monthlyPct <= 80 && <Badge className="bg-amber-500 text-white border-0 text-[10px]">CUIDADO</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">
            Monitoramento dos limites free de cada serviço. Quando a cota atinge <strong>70%</strong> o alerta fica amarelo;
            acima de <strong>90%</strong> fica vermelho. O sistema já bloqueia envios automaticamente ao atingir o limite.
          </p>

          {/* Provider limit cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resendAccounts.length > 0 && (() => {
              const resendDailyUsed = resendAccounts.reduce((s, a) => s + a.sentToday, 0);
              const resendDailyTotal = resendAccounts.reduce((s, a) => s + a.dailyLimit, 0);
              const resendDailyPct = resendDailyTotal > 0 ? (resendDailyUsed / resendDailyTotal) * 100 : 0;
              const resendMonthlyPct = resendTotalFreeMonthly > 0 ? (resendMonthly / resendTotalFreeMonthly) * 100 : 0;
              return (
                <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-slate-900 text-white hover:bg-slate-800 border-0">Resend</Badge>
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-blue-700 border-blue-300">FREE</Badge>
                    <span className="text-[10px] text-slate-400 ml-auto">{resendAccounts.length} conta{resendAccounts.length > 1 ? 's' : ''}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600">Hoje: {fmt(resendDailyUsed)} / {fmt(resendDailyTotal)}</span>
                      <span className={`text-xs font-semibold ${resendDailyPct > 90 ? 'text-red-600' : resendDailyPct > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmt(Math.max(0, resendDailyTotal - resendDailyUsed))} restantes
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor(resendDailyPct)}`} style={{ width: `${Math.min(100, resendDailyPct)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600">Mês: {fmt(resendMonthly)} / {fmt(resendTotalFreeMonthly)}</span>
                      <span className={`text-xs font-semibold ${resendMonthlyPct > 90 ? 'text-red-600' : resendMonthlyPct > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmt(Math.max(0, resendTotalFreeMonthly - resendMonthly))} restantes
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor(resendMonthlyPct)}`} style={{ width: `${Math.min(100, resendMonthlyPct)}%` }} />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">Limite free: {fmt(resendFreeLimits.daily)}/dia &middot; {fmt(resendFreeLimits.monthly)}/mês por conta</p>
                </div>
              );
            })()}

            {brevoAccounts.length > 0 && (() => {
              const brevoDailyUsed = brevoAccounts.reduce((s, a) => s + a.sentToday, 0);
              const brevoDailyTotal = brevoAccounts.reduce((s, a) => s + a.dailyLimit, 0);
              const brevoDailyPct = brevoDailyTotal > 0 ? (brevoDailyUsed / brevoDailyTotal) * 100 : 0;
              const brevoMonthlyPct = brevoTotalFreeMonthly > 0 ? (brevoMonthly / brevoTotalFreeMonthly) * 100 : 0;
              return (
                <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 border-0">Brevo</Badge>
                    <Badge variant="outline" className="text-[9px] py-0 px-1.5 text-blue-700 border-blue-300">FREE</Badge>
                    <span className="text-[10px] text-slate-400 ml-auto">{brevoAccounts.length} conta{brevoAccounts.length > 1 ? 's' : ''}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600">Hoje: {fmt(brevoDailyUsed)} / {fmt(brevoDailyTotal)}</span>
                      <span className={`text-xs font-semibold ${brevoDailyPct > 90 ? 'text-red-600' : brevoDailyPct > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmt(Math.max(0, brevoDailyTotal - brevoDailyUsed))} restantes
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor(brevoDailyPct)}`} style={{ width: `${Math.min(100, brevoDailyPct)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-slate-600">Mês: {fmt(brevoMonthly)} / {fmt(brevoTotalFreeMonthly)}</span>
                      <span className={`text-xs font-semibold ${(brevoTotalFreeMonthly > 0 ? (brevoMonthly / brevoTotalFreeMonthly) * 100 : 0) > 90 ? 'text-red-600' : (brevoTotalFreeMonthly > 0 ? (brevoMonthly / brevoTotalFreeMonthly) * 100 : 0) > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {fmt(Math.max(0, brevoTotalFreeMonthly - brevoMonthly))} restantes
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor(brevoTotalFreeMonthly > 0 ? (brevoMonthly / brevoTotalFreeMonthly) * 100 : 0)}`} style={{ width: `${Math.min(100, brevoTotalFreeMonthly > 0 ? (brevoMonthly / brevoTotalFreeMonthly) * 100 : 0)}%` }} />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">Limite free: {fmt(brevoFreeLimits.daily)}/dia &middot; {fmt(brevoFreeLimits.monthly)}/mês por conta</p>
                </div>
              );
            })()}
          </div>

          {/* Combined capacity overview */}
          <div className="rounded-xl bg-white border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-blue-700" />
              <span className="text-xs font-semibold text-blue-800">Capacidade total combinada (multi-conta free)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { label: 'Capacidade/mês', value: fmt(combinedFreeMonthly), sub: 'emails grátis', color: 'text-blue-900' },
                { label: 'Usado no mês', value: `${monthlyPct.toFixed(1)}%`, sub: `${fmt(totals.sentThisMonth)} emails`, color: monthlyPct > 80 ? 'text-red-600' : monthlyPct > 60 ? 'text-amber-600' : 'text-blue-900' },
                { label: 'Restante/mês', value: fmt(Math.max(0, totals.monthlyLimit - totals.sentThisMonth)), sub: 'emails', color: 'text-emerald-700' },
                { label: 'Capacidade/dia', value: fmt(totals.dailyLimit), sub: `${fmt(totals.remainingToday)} restantes`, color: 'text-blue-900' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg bg-slate-50 px-2 py-2.5 border border-slate-100">
                  <p className="text-[10px] text-slate-500 font-medium mb-0.5">{item.label}</p>
                  <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                  <p className="text-[10px] text-slate-400">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-account cards */}
      <div className="space-y-3">
        {accounts.map((a) => {
          const dPct = a.dailyLimit > 0 ? (a.sentToday / a.dailyLimit) * 100 : 0;
          const mPct = a.monthlyLimit > 0 ? (a.sentThisMonth / a.monthlyLimit) * 100 : 0;
          const remainDay = Math.max(0, a.dailyLimit - a.sentToday);
          const remainMonth = Math.max(0, a.monthlyLimit - a.sentThisMonth);
          return (
            <Card key={a.key} className="rounded-2xl border-slate-200">
              <CardContent className="pt-4 pb-4 px-5">
                {/* Header row */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <Badge
                    className={
                      a.provider === 'brevo'
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 border-0'
                        : 'bg-slate-900 text-white hover:bg-slate-800 border-0'
                    }
                  >
                    {a.provider === 'brevo' ? 'Brevo' : 'Resend'}
                  </Badge>
                  <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                    {a.key}
                  </span>
                  <span className="text-xs text-slate-500 truncate">
                    {a.fromName ? `${a.fromName} ` : ''}&lt;{a.fromEmail}&gt;
                  </span>
                  {(() => {
                    const mPctAccount = a.monthlyLimit > 0 ? (a.sentThisMonth / a.monthlyLimit) * 100 : 0;
                    return mPctAccount > 70 ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-auto ${mPctAccount > 90 ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50'}`}>
                        {mPctAccount > 90 ? 'quase no limite!' : 'atenção ao limite'}
                      </span>
                    ) : null;
                  })()}
                </div>

                {/* Daily progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600">Hoje</span>
                    <span className="text-xs text-slate-500">{fmt(remainDay)} restantes hoje</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(dPct)}`}
                      style={{ width: `${Math.min(100, dPct)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {fmt(a.sentToday)} / {fmt(a.dailyLimit)} ({dPct.toFixed(1)}%)
                  </p>
                </div>

                {/* Monthly progress */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-600">Mês</span>
                    <span className="text-xs text-slate-500">{fmt(remainMonth)} restantes no mês</span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(mPct)}`}
                      style={{ width: `${Math.min(100, mPct)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {fmt(a.sentThisMonth)} / {fmt(a.monthlyLimit)} ({mPct.toFixed(1)}%)
                  </p>
                </div>

                {/* Plan caption */}
                <p className="text-[11px] text-slate-400">
                  Plano: {fmt(a.dailyLimit)}/dia &middot; {fmt(a.monthlyLimit)}/mês
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Legend / help footer */}
      <Card className="rounded-2xl border-slate-200 bg-slate-50/60">
        <CardContent className="pt-4 pb-3 px-5">
          <p className="text-xs text-slate-500 leading-relaxed">
            <strong>Limites dos planos gratuitos:</strong> Resend Free: {fmt(resendFreeLimits.daily)}/dia &middot; {fmt(resendFreeLimits.monthly)}/mês por conta.
            Brevo Free: {fmt(brevoFreeLimits.daily)}/dia &middot; {fmt(brevoFreeLimits.monthly)}/mês por conta.
            O contador mensal reinicia no primeiro dia de cada mês (UTC).
            O sistema bloqueia envios automaticamente ao atingir o limite — nenhum serviço será cobrado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Estatísticas ───────────────────────────────────────────────────────────

// Uma etapa do funil: barra proporcional ao topo do funil (enviados),
// com contagem, ícone e legenda explicativa.
function FunnelStage({ label, icon: Icon, count, pct, base, color, tint, hint }: {
  label: string; icon: LucideIcon; count: number; pct: number; base: number;
  color: string; tint: string; hint?: string;
}) {
  const widthPct = base > 0 ? Math.max(2, Math.round((count / base) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${tint}`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          <span className="text-sm font-bold text-slate-800 tabular-nums">
            {count.toLocaleString('pt-BR')}
            <span className="ml-1.5 text-xs font-medium text-slate-400">{(pct * 100).toFixed(1)}%</span>
          </span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${widthPct}%` }} />
        </div>
        {hint && <p className="mt-0.5 text-[11px] text-slate-400 truncate">{hint}</p>}
      </div>
    </div>
  );
}

function StatsTab() {
  const { data: overview, isLoading } = trpc.emailMarketing.overviewStats.useQuery();
  const { data: campaigns } = trpc.emailMarketing.listCampaigns.useQuery();
  const { data: sequences } = trpc.emailMarketing.listSequences.useQuery();

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : overview && (
        (() => {
          // Base da barra = maior estágio do funil (normalmente "enviados").
          // Garante barras proporcionais mesmo se os dados tiverem inconsistências.
          const funnelBase = Math.max(
            overview.totalSent30d, overview.delivered30d,
            overview.openedUnique30d, overview.clickedUnique30d, 1,
          );
          return (
        <>
          {/* Funil de engajamento (geral) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-900" /> Funil de engajamento
                <span className="text-slate-400 font-normal text-sm">(geral)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <FunnelStage
                label="Enviados" icon={Send} count={overview.totalSent30d}
                pct={1} base={funnelBase} color="bg-blue-600" tint="bg-blue-50 text-blue-700"
                hint={`${overview.campaignSent30d} de campanhas · ${overview.sequenceSent30d} de sequências`}
              />
              <FunnelStage
                label="Entregues" icon={CheckCircle} count={overview.delivered30d}
                pct={overview.deliveryRate} base={funnelBase} color="bg-cyan-600" tint="bg-cyan-50 text-cyan-700"
                hint={`${(overview.deliveryRate * 100).toFixed(1)}% dos enviados`}
              />
              <FunnelStage
                label="Abriram" icon={Eye} count={overview.openedUnique30d}
                pct={overview.openRate} base={funnelBase} color="bg-emerald-600" tint="bg-emerald-50 text-emerald-700"
                hint={`${(overview.openRate * 100).toFixed(1)}% de abertura · ${overview.totalOpens30d} aberturas no total`}
              />
              <FunnelStage
                label="Clicaram" icon={Workflow} count={overview.clickedUnique30d}
                pct={overview.clickRate} base={funnelBase} color="bg-violet-600" tint="bg-violet-50 text-violet-700"
                hint={`${(overview.clickRate * 100).toFixed(1)}% de clique · ${(overview.clickToOpenRate * 100).toFixed(1)}% dos que abriram (CTOR)`}
              />
            </CardContent>
          </Card>

          {/* Métricas-chave */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatTile icon={Send} label="Enviados" value={overview.totalSent30d} accent="bg-blue-100 text-blue-900" />
            <StatTile icon={Eye} label="Taxa de abertura" value={`${(overview.openRate * 100).toFixed(1)}%`} accent="bg-emerald-100 text-emerald-700" />
            <StatTile icon={Workflow} label="Taxa de clique" value={`${(overview.clickRate * 100).toFixed(1)}%`} accent="bg-violet-100 text-violet-700" />
            <StatTile icon={AlertTriangle} label="Bounces" value={overview.bounced30d} accent="bg-amber-100 text-amber-700" />
            <StatTile icon={XCircle} label="Reclamações" value={overview.complained30d} accent="bg-orange-100 text-orange-700" />
            <StatTile icon={MailX} label="Descadastros" value={overview.unsubscribed30d} accent="bg-red-100 text-red-600" />
          </div>
        </>
          );
        })()
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send size={16} className="text-blue-900" /> Campanhas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns && campaigns.length > 0 ? (
            <div className="space-y-2">
              {campaigns.map(c => <CampaignStatsRow key={c.id} campaignId={c.id} name={c.name} />)}
            </div>
          ) : (
            <EmptyState icon={Send} message="Nenhuma campanha criada ainda." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow size={16} className="text-blue-900" /> Sequências
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sequences && sequences.length > 0 ? (
            <div className="space-y-2">
              {sequences.map(s => <SequenceStatsRow key={s.id} sequenceId={s.id} name={s.name} />)}
            </div>
          ) : (
            <EmptyState icon={Workflow} message="Nenhuma sequência criada ainda." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Lazy-loaded stats row for a single campaign — query only runs after "Ver stats" is clicked,
// to avoid firing N parallel queries when the page has many campaigns.
function CampaignStatsRow({ campaignId, name }: { campaignId: number; name: string }) {
  const [show, setShow] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'opened' | 'not_opened' | 'clicked' | 'not_clicked' | 'bounced'>('all');
  const { data: stats, isLoading } = trpc.emailMarketing.campaignStats.useQuery({ campaignId }, { enabled: show });
  const { data: recipients, isLoading: loadingRecipients } = trpc.emailMarketing.campaignRecipients.useQuery(
    { campaignId, engagement: recipientFilter, limit: 500 },
    { enabled: show }
  );

  const pct = (n: number, base: number) => base > 0 ? `${Math.round((n / base) * 100)}%` : "0%";

  const FILTERS: { value: typeof recipientFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'opened', label: 'Abriram' },
    { value: 'not_opened', label: 'Não abriram' },
    { value: 'clicked', label: 'Clicaram' },
    { value: 'not_clicked', label: 'Não clicaram' },
    { value: 'bounced', label: 'Bounce' },
  ];

  const exportCsv = () => {
    if (!recipients || recipients.length === 0) return;
    const header = ["Nome", "Email", "Status", "Aberturas", "Cliques", "Bounce", "1ª abertura", "Último evento"];
    const rows = recipients.map(r => [
      r.name ?? "", r.email, r.status, String(r.opens), String(r.clicks),
      r.bounced ? "sim" : "não", formatDateTime(r.firstOpen), formatDateTime(r.lastEvent),
    ]);
    const csv = [header, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `destinatarios-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 hover:border-blue-200 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm text-slate-700">{name}</p>
        <Button size="sm" variant="outline" onClick={() => setShow(!show)}>
          <BarChart3 size={14} className="mr-1" /> {show ? 'Fechar' : 'Ver stats'}
        </Button>
      </div>
      {show && (
        isLoading ? (
          <p className="text-xs text-gray-500 mt-2">Carregando...</p>
        ) : stats && (
          <div className="space-y-3 mt-3">
            {/* Mini-funil */}
            <div className="flex gap-1.5 flex-wrap">
              <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-slate-200">👥 {stats.recipients} destinatários</Badge>
              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">📤 {stats.sent} enviados</Badge>
              <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200">📬 {stats.delivered} entregues</Badge>
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">👁 {stats.opened} abriram ({pct(stats.opened, stats.delivered || stats.sent)})</Badge>
              <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">🔗 {stats.clicked} clicaram ({pct(stats.clicked, stats.delivered || stats.sent)})</Badge>
              {stats.bounced > 0 && <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">⚠️ {stats.bounced} bounce</Badge>}
              {stats.complained > 0 && <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">🚫 {stats.complained} reclamações</Badge>}
            </div>

            {/* Filtros de destinatários */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500 mr-1">Filtrar:</span>
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setRecipientFilter(f.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${recipientFilter === f.value ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
                >
                  {f.label}
                </button>
              ))}
              <div className="ml-auto">
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={!recipients || recipients.length === 0}>
                  <Download size={14} className="mr-1" /> CSV
                </Button>
              </div>
            </div>

            {/* Tabela inline de destinatários */}
            {loadingRecipients ? (
              <p className="text-xs text-gray-500">Carregando destinatários...</p>
            ) : recipients && recipients.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className={THEAD_CLASS + " sticky top-0 z-10"}>
                    <tr>
                      <th className={TH_CLASS}>Contato</th>
                      <th className={TH_CLASS}>Engajamento</th>
                      <th className={TH_CLASS}>Aberturas</th>
                      <th className={TH_CLASS}>Cliques</th>
                      <th className={TH_CLASS}>1ª abertura</th>
                      <th className={TH_CLASS}>Último evento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map(r => (
                      <tr key={r.id} className={TR_CLASS}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-700 truncate">{r.name || r.email}</p>
                          {r.name && <p className="text-xs text-slate-400 truncate">{r.email}</p>}
                        </td>
                        <td className="px-3 py-2">
                          {r.bounced ? (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Bounce</Badge>
                          ) : r.clicks > 0 ? (
                            <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">Clicou</Badge>
                          ) : r.opens > 0 ? (
                            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Abriu</Badge>
                          ) : r.status === 'sent' ? (
                            <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200">Não abriu</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">{r.status}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{r.opens}</td>
                        <td className="px-3 py-2 tabular-nums">{r.clicks}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(r.firstOpen)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(r.lastEvent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Nenhum destinatário neste filtro.</p>
            )}
            {recipients && recipients.length >= 500 && (
              <p className="text-[11px] text-slate-400">Exibindo os primeiros 500 destinatários.</p>
            )}
          </div>
        )
      )}
    </div>
  );
}


// Lazy-loaded stats for a single sequence: per-step table + per-contact
// drill-down (quem abriu/clicou) com filtros e exportação CSV.
function SequenceStatsRow({ sequenceId, name }: { sequenceId: number; name: string }) {
  const [show, setShow] = useState(false);
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'opened' | 'not_opened' | 'clicked' | 'not_clicked'>('all');
  const { data: stats, isLoading } = trpc.emailMarketing.sequenceStats.useQuery({ sequenceId }, { enabled: show });
  const { data: recipients, isLoading: loadingRecipients } = trpc.emailMarketing.sequenceRecipients.useQuery(
    { sequenceId, engagement: recipientFilter, limit: 500 },
    { enabled: show }
  );

  const pct = (n: number, base: number) => base > 0 ? `${Math.round((n / base) * 100)}%` : "";

  const FILTERS: { value: typeof recipientFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'opened', label: 'Abriram' },
    { value: 'not_opened', label: 'Não abriram' },
    { value: 'clicked', label: 'Clicaram' },
    { value: 'not_clicked', label: 'Não clicaram' },
  ];

  const exportCsv = () => {
    if (!recipients || recipients.length === 0) return;
    const header = ["Nome", "Email", "Status", "Passo atual", "E-mails enviados", "Aberturas", "Cliques", "1ª abertura", "Último evento"];
    const rows = recipients.map(r => [
      r.name ?? "", r.email, r.status, String(r.currentStep), String(r.sentCount),
      String(r.opens), String(r.clicks), formatDateTime(r.firstOpen), formatDateTime(r.lastEvent),
    ]);
    const csv = [header, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sequencia-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3 hover:border-blue-200 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm text-slate-700">{name}</p>
        <Button size="sm" variant="outline" onClick={() => setShow(!show)}>
          <BarChart3 size={14} className="mr-1" /> {show ? 'Fechar' : 'Ver stats'}
        </Button>
      </div>
      {show && (
        <div className="space-y-3 mt-3">
          {/* Stats por passo */}
          {isLoading ? (
            <p className="text-xs text-gray-500">Carregando...</p>
          ) : stats && stats.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[500px]">
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>Passo</th>
                    <th className={TH_CLASS}>Assunto</th>
                    <th className={TH_CLASS}>Enviados</th>
                    <th className={TH_CLASS}>Abriram</th>
                    <th className={TH_CLASS}>Clicaram</th>
                    <th className={TH_CLASS}>Pulados</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map(s => (
                    <tr key={s.stepId} className={TR_CLASS}>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Dia {s.delayDays}</Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">{s.subject}</td>
                      <td className="px-3 py-2 tabular-nums font-medium">{s.sent}</td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className="text-emerald-700">{s.opened}</span>
                        {s.sent > 0 && <span className="text-xs text-slate-400 ml-1">({pct(s.opened, s.sent)})</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <span className="text-violet-700">{s.clicked}</span>
                        {s.sent > 0 && <span className="text-xs text-slate-400 ml-1">({pct(s.clicked, s.sent)})</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-400">{(s as any).skipped ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-500">Sem passos cadastrados.</p>
          )}

          {/* Drill-down: contatos da sequência */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1"><Users size={13} /> Contatos:</span>
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setRecipientFilter(f.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${recipientFilter === f.value ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:bg-blue-50'}`}
              >
                {f.label}
              </button>
            ))}
            <div className="ml-auto">
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!recipients || recipients.length === 0}>
                <Download size={14} className="mr-1" /> CSV
              </Button>
            </div>
          </div>

          {loadingRecipients ? (
            <p className="text-xs text-gray-500">Carregando contatos...</p>
          ) : recipients && recipients.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead className={THEAD_CLASS + " sticky top-0 z-10"}>
                  <tr>
                    <th className={TH_CLASS}>Contato</th>
                    <th className={TH_CLASS}>Engajamento</th>
                    <th className={TH_CLASS}>Passo</th>
                    <th className={TH_CLASS}>Aberturas</th>
                    <th className={TH_CLASS}>Cliques</th>
                    <th className={TH_CLASS}>Último evento</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map(r => (
                    <tr key={r.id} className={TR_CLASS}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-700 truncate">{r.name || r.email}</p>
                        {r.name && <p className="text-xs text-slate-400 truncate">{r.email}</p>}
                      </td>
                      <td className="px-3 py-2">
                        {r.clicks > 0 ? (
                          <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">Clicou</Badge>
                        ) : r.opens > 0 ? (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Abriu</Badge>
                        ) : r.sentCount > 0 ? (
                          <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500 border-slate-200">Não abriu</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-600 border-amber-200">Aguardando envio</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.currentStep > 0 ? `${r.currentStep}º` : "--"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.opens}</td>
                      <td className="px-3 py-2 tabular-nums">{r.clicks}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(r.lastEvent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Nenhum contato neste filtro.</p>
          )}
          {recipients && recipients.length >= 500 && (
            <p className="text-[11px] text-slate-400">Exibindo os primeiros 500 contatos.</p>
          )}
        </div>
      )}
    </div>
  );
}
