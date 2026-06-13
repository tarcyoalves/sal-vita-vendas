import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../_core/hooks/useAuth";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
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
  LayoutTemplate, MailX, Filter, Sparkles, Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Source = "leads" | "clients" | "both";

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
function describeTrigger(rule: { triggerType: string; triggerConfig?: any }): string {
  const base = TRIGGER_TYPE_LABELS[rule.triggerType] ?? rule.triggerType;
  if (rule.triggerType === 'inactive_days') {
    const days = rule.triggerConfig?.days;
    return days ? `Sem contato há ${days} dia(s)` : base;
  }
  return base;
}

// Human-readable description of an automation rule's action, resolving sequence names by id.
function describeAction(rule: { actionType: string; actionConfig?: any }, sequences?: { id: number; name: string }[]): string {
  if (rule.actionType === 'enroll_sequence') {
    const seqId = rule.actionConfig?.sequenceId;
    const seq = sequences?.find(s => s.id === seqId);
    return `Inscrever em sequência "${seq?.name ?? `#${seqId}`}"`;
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
        <TabsList className="flex-wrap h-auto justify-start gap-1 rounded-2xl bg-slate-100 p-1.5">
          <TabsTrigger value="campaigns" className={TAB_TRIGGER_CLASS}>
            <Send size={14} /> Campanhas
          </TabsTrigger>
          <TabsTrigger value="sequences" className={TAB_TRIGGER_CLASS}>
            <Workflow size={14} /> Sequências
          </TabsTrigger>
          <TabsTrigger value="automations" className={TAB_TRIGGER_CLASS}>
            <Zap size={14} /> Automações
          </TabsTrigger>
          <TabsTrigger value="templates" className={TAB_TRIGGER_CLASS}>
            <LayoutTemplate size={14} /> Templates
          </TabsTrigger>
          <TabsTrigger value="tags" className={TAB_TRIGGER_CLASS}>
            <Tag size={14} /> Tags
          </TabsTrigger>
          <TabsTrigger value="suppressions" className={TAB_TRIGGER_CLASS}>
            <MailX size={14} /> Descadastrados
          </TabsTrigger>
          <TabsTrigger value="export" className={TAB_TRIGGER_CLASS}>
            <Download size={14} /> Exportar
          </TabsTrigger>
          <TabsTrigger value="stats" className={TAB_TRIGGER_CLASS}>
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
        <TabsContent value="suppressions" className="mt-4">
          <SuppressionsTab />
        </TabsContent>
        <TabsContent value="export" className="mt-4">
          <ExportTab />
        </TabsContent>
        <TabsContent value="stats" className="mt-4">
          <StatsTab />
        </TabsContent>
      </Tabs>
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

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "", subject: "", htmlBody: "",
    source: "leads" as Source, assignedTo: "",
  });

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
      <div className="flex justify-end">
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
                      <td className="px-3 py-2.5 font-medium text-slate-700">{c.name}</td>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

            <div>
              <Label>Assunto</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Ex: Olá {nome}, confira nossas novidades!" />
            </div>

            <div>
              <Label>Corpo do e-mail (HTML)</Label>
              <Textarea
                rows={8}
                value={form.htmlBody}
                onChange={e => setForm(f => ({ ...f, htmlBody: e.target.value }))}
                placeholder="<p>Olá {nome}, ...</p>"
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
                    <SelectItem value="both">Ambos</SelectItem>
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
  const upsertMutation = trpc.emailMarketing.upsertTemplate.useMutation();
  const deleteMutation = trpc.emailMarketing.deleteTemplate.useMutation();

  const [editing, setEditing] = useState<{ id?: number; slug: string; name: string; subject: string; htmlBody: string; active: boolean } | null>(null);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.slug.trim() || !editing.name.trim() || !editing.subject.trim() || !editing.htmlBody.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    try {
      await upsertMutation.mutateAsync(editing);
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="bg-blue-900 hover:bg-blue-800 shadow-sm" onClick={() => setEditing({ slug: "", name: "", subject: "", htmlBody: "", active: true })}>
          <Plus size={16} className="mr-1" /> Novo Template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutTemplate size={16} className="text-blue-900" /> Templates <span className="text-slate-400 font-normal">({templates?.length ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : templates && templates.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[480px]">
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>Nome</th>
                    <th className={TH_CLASS}>Slug</th>
                    <th className={TH_CLASS}>Assunto</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id} className={TR_CLASS}>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{t.name}</td>
                      <td className="px-3 py-2.5 text-slate-400 text-xs font-mono">{t.slug}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{t.subject}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className={t.active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200"}>
                          {t.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setEditing({ id: t.id, slug: t.slug, name: t.name, subject: t.subject, htmlBody: t.htmlBody, active: t.active })}>
                            <Pencil size={14} />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(t.id)}>
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
            <EmptyState icon={LayoutTemplate} message="Nenhum template cadastrado. Crie modelos reutilizáveis para suas campanhas e sequências." />
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div>
                <Label>Assunto</Label>
                <Input value={editing.subject} onChange={e => setEditing(t => t && ({ ...t, subject: e.target.value }))} />
              </div>
              <div>
                <Label>Corpo do e-mail (HTML)</Label>
                <Textarea rows={8} value={editing.htmlBody} onChange={e => setEditing(t => t && ({ ...t, htmlBody: e.target.value }))} />
                <p className="text-xs text-gray-500 mt-1">{TEMPLATE_HINT}</p>
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

// ── Descadastrados ─────────────────────────────────────────────────────────

function SuppressionsTab() {
  const utils = trpc.useUtils();
  const { data: suppressions, isLoading } = trpc.emailMarketing.listSuppressions.useQuery();
  const addMutation = trpc.emailMarketing.addSuppression.useMutation();
  const [email, setEmail] = useState("");

  const handleAdd = async () => {
    if (!email.trim()) return;
    try {
      await addMutation.mutateAsync({ email: email.trim(), reason: "manual" });
      toast.success("E-mail adicionado à lista de descadastrados");
      setEmail("");
      utils.emailMarketing.listSuppressions.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao adicionar e-mail");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailX size={16} className="text-blue-900" /> Adicionar e-mail manualmente
          </CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
          <Button className="bg-blue-900 hover:bg-blue-800 shadow-sm flex-shrink-0" onClick={handleAdd} disabled={addMutation.isPending}>
            <Plus size={16} className="mr-1" /> Adicionar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailX size={16} className="text-blue-900" /> Descadastrados <span className="text-slate-400 font-normal">({suppressions?.length ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : suppressions && suppressions.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm min-w-[420px]">
                <thead className={THEAD_CLASS}>
                  <tr>
                    <th className={TH_CLASS}>E-mail</th>
                    <th className={TH_CLASS}>Motivo</th>
                    <th className={TH_CLASS}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map(s => (
                    <tr key={s.id} className={TR_CLASS}>
                      <td className="px-3 py-2.5">{s.email}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{s.reason}</td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={MailX} message="Nenhum e-mail descadastrado por aqui." />
          )}
        </CardContent>
      </Card>
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

  const upsertStepMutation = trpc.emailMarketing.upsertSequenceStep.useMutation();
  const deleteStepMutation = trpc.emailMarketing.deleteSequenceStep.useMutation();
  const pauseMutation = trpc.emailMarketing.pauseEnrollment.useMutation();
  const resumeMutation = trpc.emailMarketing.resumeEnrollment.useMutation();
  const cancelMutation = trpc.emailMarketing.cancelEnrollment.useMutation();

  const [editingStep, setEditingStep] = useState<{ id?: number; stepOrder: number; delayDays: number; subject: string; htmlBody: string; sendCondition: string } | null>(null);
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
      await upsertStepMutation.mutateAsync({
        id: editingStep.id,
        sequenceId,
        stepOrder: editingStep.stepOrder,
        delayDays: editingStep.delayDays,
        subject: editingStep.subject,
        htmlBody: editingStep.htmlBody,
        sendCondition: editingStep.sendCondition as any,
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
                onClick={() => setEditingStep({ stepOrder: (steps?.length ?? 0) + 1, delayDays: 0, subject: "", htmlBody: "", sendCondition: "always" })}
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
                              <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Dia {step.delayDays}</Badge>
                              <span className="font-medium text-sm text-slate-700">{step.subject}</span>
                              {(step as any).sendCondition && (step as any).sendCondition !== 'always' && (
                                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">{SEND_CONDITION_BADGES[(step as any).sendCondition] ?? (step as any).sendCondition}</Badge>
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
                            <Button size="sm" variant="outline" onClick={() => setEditingStep({ id: step.id, stepOrder: step.stepOrder, delayDays: step.delayDays, subject: step.subject, htmlBody: step.htmlBody, sendCondition: (step as any).sendCondition ?? 'always' })}>
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-900">{editingStep?.id ? <Pencil size={16} /> : <Plus size={16} />}</span>
                {editingStep?.id ? "Editar passo" : "Novo passo"}
              </DialogTitle>
            </DialogHeader>
            {editingStep && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ordem do passo</Label>
                    <Input type="number" min={1} value={editingStep.stepOrder} onChange={e => setEditingStep(s => s && ({ ...s, stepOrder: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <Label>Dias após inscrição</Label>
                    <Input type="number" min={0} value={editingStep.delayDays} onChange={e => setEditingStep(s => s && ({ ...s, delayDays: Number(e.target.value) }))} />
                  </div>
                </div>
                <div>
                  <Label>Assunto</Label>
                  <Input value={editingStep.subject} onChange={e => setEditingStep(s => s && ({ ...s, subject: e.target.value }))} />
                </div>
                <div>
                  <Label>Corpo do e-mail (HTML)</Label>
                  <Textarea rows={8} value={editingStep.htmlBody} onChange={e => setEditingStep(s => s && ({ ...s, htmlBody: e.target.value }))} />
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
      const skipped = res.skippedNoEmail + res.skippedDuplicateOrSuppressed;
      toast.success(`✅ ${res.enrolled} inscrito(s) na sequência` + (skipped > 0 ? ` (${skipped} ignorado(s): sem e-mail, duplicado ou descadastrado)` : ''));
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

  const [editing, setEditing] = useState<{
    id?: number;
    name: string;
    triggerType: "lead_created" | "lead_converted" | "inactive_days";
    days: string;
    actionType: "enroll_sequence" | "add_tag";
    sequenceId: string;
    tag: string;
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
      toast.error("Informe o número de dias sem contato");
      return;
    }
    if (editing.actionType === 'enroll_sequence' && !editing.sequenceId) {
      toast.error("Selecione a sequência");
      return;
    }
    if (editing.actionType === 'add_tag' && !editing.tag.trim()) {
      toast.error("Informe a tag");
      return;
    }
    try {
      await upsertMutation.mutateAsync({
        id: editing.id,
        name: editing.name,
        triggerType: editing.triggerType,
        triggerConfig: editing.triggerType === 'inactive_days' ? { days: Number(editing.days) } : undefined,
        actionType: editing.actionType,
        actionConfig: editing.actionType === 'enroll_sequence' ? { sequenceId: Number(editing.sequenceId) } : { tag: editing.tag.trim() },
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
    name: "", triggerType: "lead_created", days: "30",
    actionType: "enroll_sequence", sequenceId: "", tag: "", active: true,
  });

  const openEdit = (rule: typeof parsedRules[number]) => setEditing({
    id: rule.id,
    name: rule.name,
    triggerType: rule.triggerType as any,
    days: rule.triggerConfig?.days ? String(rule.triggerConfig.days) : "30",
    actionType: rule.actionType as any,
    sequenceId: rule.actionConfig?.sequenceId ? String(rule.actionConfig.sequenceId) : "",
    tag: rule.actionConfig?.tag ?? "",
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
                      <td className="px-3 py-2.5 text-xs text-slate-500">{describeTrigger(r)}</td>
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

function TagsTab() {
  const { data: tags, isLoading } = trpc.emailMarketing.listTags.useQuery();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag size={16} className="text-blue-900" /> Tags <span className="text-slate-400 font-normal">({tags?.length ?? 0})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Use as tags na tela de Tarefas para segmentar leads. Tags são criadas diretamente
            no formulário de tarefas e aparecem aqui automaticamente.
          </p>
          {isLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : tags && tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-sm px-3 py-1.5 bg-blue-50 text-blue-900 border-blue-200 gap-1.5">
                  <Tag size={12} /> {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyState icon={Tag} message="Nenhuma tag cadastrada ainda. Adicione tags às tarefas para segmentar seus leads." />
          )}
        </CardContent>
      </Card>
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

function ExportTab() {
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

// ── Estatísticas ───────────────────────────────────────────────────────────

function StatsTab() {
  const { data: overview, isLoading } = trpc.emailMarketing.overviewStats.useQuery();
  const { data: campaigns } = trpc.emailMarketing.listCampaigns.useQuery();
  const { data: sequences } = trpc.emailMarketing.listSequences.useQuery();

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatTile icon={Send} label="Enviados (30d)" value={overview.totalSent30d} accent="bg-blue-100 text-blue-900" />
          <StatTile icon={Eye} label="Taxa de abertura" value={`${(overview.openRate * 100).toFixed(1)}%`} accent="bg-emerald-100 text-emerald-700" />
          <StatTile icon={Workflow} label="Taxa de clique" value={`${(overview.clickRate * 100).toFixed(1)}%`} accent="bg-violet-100 text-violet-700" />
          <StatTile icon={MailX} label="Descadastros (30d)" value={overview.unsubscribed30d} accent="bg-red-100 text-red-600" />
          <StatTile icon={Zap} label="Cota Resend hoje" value={`${overview.quotaUsedToday}/${overview.quotaTotalToday}`} accent="bg-orange-100 text-orange-600" />
        </div>
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
  const { data: stats, isLoading } = trpc.emailMarketing.campaignStats.useQuery({ campaignId }, { enabled: show });

  return (
    <div className="rounded-xl border border-slate-200 p-3 hover:border-blue-200 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm text-slate-700">{name}</p>
        <Button size="sm" variant="outline" onClick={() => setShow(true)} disabled={show}>
          <BarChart3 size={14} className="mr-1" /> Ver stats
        </Button>
      </div>
      {show && (
        isLoading ? (
          <p className="text-xs text-gray-500 mt-1">Carregando...</p>
        ) : stats && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">📬 {stats.delivered} entregues</Badge>
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">👁 {stats.opened} abertos</Badge>
            <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">🔗 {stats.clicked} clicados</Badge>
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">⚠️ {stats.bounced} bounce</Badge>
            <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">🚫 {stats.complained} reclamações</Badge>
          </div>
        )
      )}
    </div>
  );
}

// Lazy-loaded per-step stats row for a single sequence.
function SequenceStatsRow({ sequenceId, name }: { sequenceId: number; name: string }) {
  const [show, setShow] = useState(false);
  const { data: stats, isLoading } = trpc.emailMarketing.sequenceStats.useQuery({ sequenceId }, { enabled: show });

  return (
    <div className="rounded-xl border border-slate-200 p-3 hover:border-blue-200 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm text-slate-700">{name}</p>
        <Button size="sm" variant="outline" onClick={() => setShow(true)} disabled={show}>
          <BarChart3 size={14} className="mr-1" /> Ver stats
        </Button>
      </div>
      {show && (
        isLoading ? (
          <p className="text-xs text-gray-500 mt-1">Carregando...</p>
        ) : stats && stats.length > 0 ? (
          <div className="space-y-1.5 mt-2">
            {stats.map(s => (
              <div key={s.stepId} className="flex items-center gap-1.5 flex-wrap text-xs">
                <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200">Dia {s.delayDays}</Badge>
                <span className="text-gray-600 truncate">{s.subject}</span>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">📤 {s.sent}</Badge>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">👁 {s.opened}</Badge>
                <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">🔗 {s.clicked}</Badge>
                <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200">⏭ {(s as any).skipped ?? 0} pulados</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 mt-1">Sem passos cadastrados.</p>
        )
      )}
    </div>
  );
}
