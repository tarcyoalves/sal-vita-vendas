import { useState } from "react";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "../components/ui/tabs";
import { Mail, Plus, Send, Trash2, Eye, Pencil } from "lucide-react";

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
        <TabsList>
          <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="suppressions">Descadastrados</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="suppressions" className="mt-4">
          <SuppressionsTab />
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
