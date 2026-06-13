import { useState, useMemo } from "react";
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
import { Mail, Plus, Send, Trash2, Eye, Pencil, Workflow, Zap, Tag, BarChart3, Users, Pause, Play, X, Download } from "lucide-react";

type Source = "leads" | "clients" | "both";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  sending: "Enviando",
  sent: "Enviado",
};

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline"> = {
  draft: "secondary",
  sending: "default",
  sent: "outline",
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

const ENROLLMENT_STATUS_VARIANTS: Record<string, "secondary" | "default" | "outline" | "destructive"> = {
  active: "default",
  paused: "secondary",
  completed: "outline",
  cancelled: "destructive",
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

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Mail className="text-blue-900" size={28} />
        <h1 className="text-xl md:text-3xl font-bold text-blue-900">E-mail Marketing</h1>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="sequences">Sequências</TabsTrigger>
          <TabsTrigger value="automations">Automações</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="suppressions">Descadastrados</TabsTrigger>
          <TabsTrigger value="export">Exportar</TabsTrigger>
          <TabsTrigger value="stats">Estatísticas</TabsTrigger>
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
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" /> Nova Campanha
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas ({campaigns?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Destinatários</th>
                    <th className="p-2 text-left">Enviados</th>
                    <th className="p-2 text-left">Falhas</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{c.name}</td>
                      <td className="p-2">
                        <Badge variant={STATUS_VARIANTS[c.status] ?? "secondary"}>
                          {STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </td>
                      <td className="p-2">{c.totalRecipients}</td>
                      <td className="p-2 text-green-700">{c.sentCount}</td>
                      <td className="p-2 text-red-600">{c.failedCount}</td>
                      <td className="p-2">
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setDetailCampaignId(c.id)}>
                            <Eye size={14} className="mr-1" /> Ver
                          </Button>
                          {c.status !== "sent" && (
                            <Button
                              size="sm"
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
            <p className="text-gray-500 text-sm">Nenhuma campanha criada ainda.</p>
          )}
        </CardContent>
      </Card>

      {/* Create campaign dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📧 Nova Campanha</DialogTitle></DialogHeader>
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

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
              📊 Público estimado: <strong>{preview?.count ?? 0}</strong> destinatário(s)
              {preview?.sample && preview.sample.length > 0 && (
                <p className="text-xs text-blue-700 mt-1">
                  Exemplos: {preview.sample.slice(0, 5).map(s => s.name || s.email).join(", ")}
                  {preview.count > 5 ? "..." : ""}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "✅ Criar Campanha"}
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
        <DialogHeader><DialogTitle>{data?.campaign.name ?? "Campanha"}</DialogTitle></DialogHeader>
        {data && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <div className="bg-gray-50 rounded p-2 text-center">
                <p className="text-gray-500 text-xs">Total</p>
                <p className="font-bold">{data.campaign.totalRecipients}</p>
              </div>
              <div className="bg-green-50 rounded p-2 text-center">
                <p className="text-gray-500 text-xs">Enviados</p>
                <p className="font-bold text-green-700">{data.campaign.sentCount}</p>
              </div>
              <div className="bg-red-50 rounded p-2 text-center">
                <p className="text-gray-500 text-xs">Falhas</p>
                <p className="font-bold text-red-600">{data.campaign.failedCount}</p>
              </div>
              <div className="bg-blue-50 rounded p-2 text-center">
                <p className="text-gray-500 text-xs">Status</p>
                <p className="font-bold">{STATUS_LABELS[data.campaign.status] ?? data.campaign.status}</p>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-100 p-2 text-xs font-medium text-gray-600">Assunto</div>
              <div className="p-2 text-sm">{data.campaign.subject}</div>
            </div>

            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">E-mail</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recipients.map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{r.email}</td>
                      <td className="p-2">{r.name ?? "--"}</td>
                      <td className="p-2">
                        <Badge variant={r.status === "sent" ? "outline" : r.status === "failed" ? "destructive" : "secondary"}>
                          {RECIPIENT_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs text-red-500">{r.error ?? ""}</td>
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
        <Button onClick={() => setEditing({ slug: "", name: "", subject: "", htmlBody: "", active: true })}>
          <Plus size={16} className="mr-1" /> Novo Template
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Templates ({templates?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : templates && templates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Slug</th>
                    <th className="p-2 text-left">Assunto</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{t.name}</td>
                      <td className="p-2 text-gray-500 text-xs">{t.slug}</td>
                      <td className="p-2 text-xs">{t.subject}</td>
                      <td className="p-2">
                        <Badge variant={t.active ? "outline" : "secondary"}>{t.active ? "Ativo" : "Inativo"}</Badge>
                      </td>
                      <td className="p-2">
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
            <p className="text-gray-500 text-sm">Nenhum template cadastrado.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "✏️ Editar Template" : "📄 Novo Template"}</DialogTitle></DialogHeader>
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
            <Button className="flex-1" onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Salvando..." : "✅ Salvar"}
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
        <CardHeader><CardTitle>Adicionar e-mail manualmente</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
          <Button onClick={handleAdd} disabled={addMutation.isPending}>Adicionar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Descadastrados ({suppressions?.length ?? 0})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : suppressions && suppressions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">E-mail</th>
                    <th className="p-2 text-left">Motivo</th>
                    <th className="p-2 text-left">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map(s => (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">{s.email}</td>
                      <td className="p-2 text-gray-500 text-xs">{s.reason}</td>
                      <td className="p-2 text-gray-500 text-xs">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nenhum e-mail descadastrado.</p>
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
        <Button onClick={() => setShowCreate(true)}>
          <Plus size={16} className="mr-1" /> Nova sequência
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sequências ({sequences?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : sequences && sequences.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Inscritos ativos</th>
                    <th className="p-2 text-left">Passos</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map(s => (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button className="text-left hover:underline" onClick={() => setDetailSequenceId(s.id)}>
                            {s.name}
                          </button>
                          {(s as any).repeat && <Badge variant="outline" className="text-xs">🔁 mensal</Badge>}
                        </div>
                        {s.description && <p className="text-xs text-gray-500">{s.description}</p>}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Switch checked={s.active} onCheckedChange={(checked) => handleToggleActive(s.id, checked)} />
                          <span className="text-xs text-gray-500">{s.active ? "Ativa" : "Pausada"}</span>
                        </div>
                      </td>
                      <td className="p-2">{s.activeEnrollments}</td>
                      <td className="p-2">{s.stepCount}</td>
                      <td className="p-2">
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
            <p className="text-gray-500 text-sm">Nenhuma sequência criada ainda.</p>
          )}
        </CardContent>
      </Card>

      {/* Create sequence dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) setForm({ name: "", description: "", active: true, repeat: false, repeatIntervalDays: "30" }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>🔁 Nova sequência</DialogTitle></DialogHeader>
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
            <Button className="flex-1" onClick={handleCreate} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Criando..." : "✅ Criar"}
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
        <DialogHeader><DialogTitle>{sequence?.name ?? "Sequência"}</DialogTitle></DialogHeader>
        {sequence?.description && <p className="text-sm text-gray-500">{sequence.description}</p>}

        <div className="space-y-4">
          {/* Steps timeline */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">📅 Passos da sequência</h3>
              <Button
                size="sm"
                onClick={() => setEditingStep({ stepOrder: (steps?.length ?? 0) + 1, delayDays: 0, subject: "", htmlBody: "", sendCondition: "always" })}
              >
                <Plus size={14} className="mr-1" /> Adicionar passo
              </Button>
            </div>
            {steps && steps.length > 0 ? (
              <div className="space-y-2">
                {steps.map(step => {
                  const stepStats = statsByStepId.get(step.id);
                  return (
                    <div key={step.id} className="border rounded-lg p-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary">Dia {step.delayDays}</Badge>
                            <span className="font-medium text-sm">{step.subject}</span>
                            {(step as any).sendCondition && (step as any).sendCondition !== 'always' && (
                              <Badge variant="outline" className="text-xs">{SEND_CONDITION_BADGES[(step as any).sendCondition] ?? (step as any).sendCondition}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {step.htmlBody.replace(/<[^>]*>/g, ' ').trim().slice(0, 160)}
                          </p>
                          {stepStats && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">📤 {stepStats.sent} enviados</Badge>
                              <Badge variant="outline" className="text-xs">👁 {stepStats.opened} abertos</Badge>
                              <Badge variant="outline" className="text-xs">🔗 {stepStats.clicked} clicados</Badge>
                              <Badge variant="outline" className="text-xs">⏭ {stepStats.skipped} pulados</Badge>
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
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Nenhum passo cadastrado ainda.</p>
            )}
          </div>

          {/* Enrollments */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="font-semibold text-sm">👥 Inscritos ({enrollments?.total ?? 0})</h3>
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
                <Button size="sm" onClick={() => setShowEnroll(true)}>
                  <Users size={14} className="mr-1" /> Inscrever leads
                </Button>
              </div>
            </div>
            {enrollments && enrollments.rows.length > 0 ? (
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">E-mail</th>
                      <th className="p-2 text-left">Nome</th>
                      <th className="p-2 text-left">Passo</th>
                      <th className="p-2 text-left">Próximo envio</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.rows.map(e => (
                      <tr key={e.id} className="border-b">
                        <td className="p-2">{e.email}</td>
                        <td className="p-2">{e.name ?? "--"}</td>
                        <td className="p-2">{e.currentStep}/{steps?.length ?? 0}</td>
                        <td className="p-2 text-xs">{formatDateTime(e.nextSendAt)}</td>
                        <td className="p-2">
                          <Badge variant={ENROLLMENT_STATUS_VARIANTS[e.status] ?? "secondary"}>
                            {ENROLLMENT_STATUS_LABELS[e.status] ?? e.status}
                          </Badge>
                        </td>
                        <td className="p-2">
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
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Anterior</Button>
                    <span>Página {page + 1} de {Math.ceil(enrollments.total / PAGE_SIZE)}</span>
                    <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= enrollments.total} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Nenhum inscrito {enrollStatus ? `com status "${ENROLLMENT_STATUS_LABELS[enrollStatus]}"` : ""}.</p>
            )}
          </div>
        </div>

        {/* Step editor dialog */}
        <Dialog open={editingStep !== null} onOpenChange={(open) => { if (!open) setEditingStep(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingStep?.id ? "✏️ Editar passo" : "➕ Novo passo"}</DialogTitle></DialogHeader>
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
              <Button className="flex-1" onClick={handleSaveStep} disabled={upsertStepMutation.isPending}>
                {upsertStepMutation.isPending ? "Salvando..." : "✅ Salvar"}
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
        <DialogHeader><DialogTitle>👥 Inscrever leads na sequência</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label className="!mb-0 flex-shrink-0">Filtrar por tag</Label>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as tags</SelectItem>
                {(tags ?? []).map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={tasksWithEmail.length > 0 && selectedIds.size === tasksWithEmail.length} onCheckedChange={toggleSelectAll} />
            Selecionar todos ({tasksWithEmail.length})
          </label>
          <div className="border rounded-lg max-h-72 overflow-y-auto divide-y">
            {tasksWithEmail.length > 0 ? tasksWithEmail.map((t: any) => (
              <label key={t.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                <Checkbox checked={selectedIds.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.title}</p>
                  <p className="text-xs text-gray-500 truncate">{t.email}</p>
                </div>
              </label>
            )) : (
              <p className="text-sm text-gray-500 p-3">Nenhum lead com e-mail cadastrado{tagFilter !== "__all__" ? ` para a tag "${tagFilter}"` : ""}.</p>
            )}
          </div>
        </div>
        <DialogFooter className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={handleEnroll} disabled={enrollMutation.isPending || selectedIds.size === 0}>
            {enrollMutation.isPending ? "Inscrevendo..." : `✅ Inscrever (${selectedIds.size})`}
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
        <Button onClick={openNew}>
          <Plus size={16} className="mr-1" /> Nova automação
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automações ({parsedRules.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : parsedRules.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Gatilho</th>
                    <th className="p-2 text-left">Ação</th>
                    <th className="p-2 text-left">Ativa</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRules.map(r => (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{r.name}</td>
                      <td className="p-2 text-xs">{describeTrigger(r)}</td>
                      <td className="p-2 text-xs">{describeAction(r, sequences)}</td>
                      <td className="p-2">
                        <Switch checked={r.active} onCheckedChange={(checked) => handleToggleActive(r, checked)} />
                      </td>
                      <td className="p-2">
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
            <p className="text-gray-500 text-sm">Nenhuma automação criada ainda.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "✏️ Editar automação" : "⚡ Nova automação"}</DialogTitle></DialogHeader>
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
            <Button className="flex-1" onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Salvando..." : "✅ Salvar"}
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
          <CardTitle>Tags ({tags?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">
            Use as tags na tela de Tarefas para segmentar leads. Tags são criadas diretamente
            no formulário de tarefas e aparecem aqui automaticamente.
          </p>
          {isLoading ? (
            <p>Carregando...</p>
          ) : tags && tags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <Badge key={tag} variant="secondary" className="text-sm px-3 py-1">
                  <Tag size={12} className="mr-1" /> {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nenhuma tag cadastrada ainda.</p>
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
          <CardTitle>📤 Exportar leads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">
            Filtre os leads e exporte para CSV (Excel). Útil para campanhas externas,
            limpeza de base (quem não abriu / não respondeu) e priorização de telefonemas (quem está quente 🔥).
          </p>

          {tags && tags.length > 0 && (
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2 py-1 rounded-full border font-medium transition ${filters.tags.includes(tag) ? "bg-blue-900 text-white border-blue-900" : "bg-white text-gray-600 border-gray-200 hover:bg-blue-50"}`}
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

          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handlePreview} disabled={exportQuery.isFetching}>
              <Eye size={14} className="mr-1" /> {exportQuery.isFetching ? "Buscando..." : "Pré-visualizar"}
            </Button>
            <Button onClick={handleDownload} disabled={exportQuery.isFetching}>
              <Download size={14} className="mr-1" /> {exportQuery.isFetching ? "Gerando..." : "Baixar CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Resultado ({result.length} lead{result.length === 1 ? "" : "s"})</CardTitle>
          </CardHeader>
          <CardContent>
            {result.length > 0 ? (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Nome</th>
                      <th className="p-2 text-left">E-mail</th>
                      <th className="p-2 text-left">Telefone</th>
                      <th className="p-2 text-left">Tags</th>
                      <th className="p-2 text-left">Atendente</th>
                      <th className="p-2 text-left">Último contato</th>
                      <th className="p-2 text-left">Convertido em</th>
                      <th className="p-2 text-left">Aberturas</th>
                      <th className="p-2 text-left">Cliques</th>
                      <th className="p-2 text-left">Último evento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.slice(0, 20).map((r, i) => (
                      <tr key={`${r.email}-${i}`} className="border-b hover:bg-gray-50">
                        <td className="p-2">{r.name ?? "--"}</td>
                        <td className="p-2">{r.email}</td>
                        <td className="p-2">{r.phone ?? "--"}</td>
                        <td className="p-2 text-xs">{(r.tags ?? []).join(", ")}</td>
                        <td className="p-2">{r.assignedTo ?? "--"}</td>
                        <td className="p-2 text-xs">{formatDateTime(r.lastContactedAt)}</td>
                        <td className="p-2 text-xs">{formatDateTime(r.convertedAt)}</td>
                        <td className="p-2">{r.opens ?? 0}</td>
                        <td className="p-2">{r.clicks ?? 0}</td>
                        <td className="p-2 text-xs">{formatDateTime(r.lastEventAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Nenhum lead encontrado com esses filtros.</p>
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
        <p>Carregando...</p>
      ) : overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-gray-500">Enviados (30d)</p>
              <p className="text-xl font-bold text-blue-900">{overview.totalSent30d}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-gray-500">Taxa de abertura</p>
              <p className="text-xl font-bold text-green-700">{(overview.openRate * 100).toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-gray-500">Taxa de clique</p>
              <p className="text-xl font-bold text-purple-700">{(overview.clickRate * 100).toFixed(1)}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-gray-500">Descadastros (30d)</p>
              <p className="text-xl font-bold text-red-600">{overview.unsubscribed30d}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-gray-500">Cota Resend hoje</p>
              <p className="text-xl font-bold text-orange-600">{overview.quotaUsedToday}/{overview.quotaTotalToday}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Campanhas</CardTitle></CardHeader>
        <CardContent>
          {campaigns && campaigns.length > 0 ? (
            <div className="space-y-2">
              {campaigns.map(c => <CampaignStatsRow key={c.id} campaignId={c.id} name={c.name} />)}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nenhuma campanha criada ainda.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Sequências</CardTitle></CardHeader>
        <CardContent>
          {sequences && sequences.length > 0 ? (
            <div className="space-y-2">
              {sequences.map(s => <SequenceStatsRow key={s.id} sequenceId={s.id} name={s.name} />)}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Nenhuma sequência criada ainda.</p>
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
    <div className="border rounded-lg p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{name}</p>
        <Button size="sm" variant="outline" onClick={() => setShow(true)} disabled={show}>
          <BarChart3 size={14} className="mr-1" /> Ver stats
        </Button>
      </div>
      {show && (
        isLoading ? (
          <p className="text-xs text-gray-500 mt-1">Carregando...</p>
        ) : stats && (
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="text-xs">📬 {stats.delivered} entregues</Badge>
            <Badge variant="outline" className="text-xs">👁 {stats.opened} abertos</Badge>
            <Badge variant="outline" className="text-xs">🔗 {stats.clicked} clicados</Badge>
            <Badge variant="outline" className="text-xs">⚠️ {stats.bounced} bounce</Badge>
            <Badge variant="outline" className="text-xs">🚫 {stats.complained} reclamações</Badge>
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
    <div className="border rounded-lg p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-sm">{name}</p>
        <Button size="sm" variant="outline" onClick={() => setShow(true)} disabled={show}>
          <BarChart3 size={14} className="mr-1" /> Ver stats
        </Button>
      </div>
      {show && (
        isLoading ? (
          <p className="text-xs text-gray-500 mt-1">Carregando...</p>
        ) : stats && stats.length > 0 ? (
          <div className="space-y-1 mt-2">
            {stats.map(s => (
              <div key={s.stepId} className="flex items-center gap-2 flex-wrap text-xs">
                <Badge variant="secondary">Dia {s.delayDays}</Badge>
                <span className="text-gray-600 truncate">{s.subject}</span>
                <Badge variant="outline">📤 {s.sent}</Badge>
                <Badge variant="outline">👁 {s.opened}</Badge>
                <Badge variant="outline">🔗 {s.clicked}</Badge>
                <Badge variant="outline">⏭ {(s as any).skipped ?? 0} pulados</Badge>
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
