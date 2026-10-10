import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { useState, useMemo, useEffect } from "react";
import DOMPurify from 'dompurify';
import { toast } from "sonner";
import { AlertCircle, MoreHorizontal, Plus, Users } from "lucide-react";
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Skeleton } from '../components/ui/skeleton';
import { QueryError } from '../components/QueryError';
import { Page, PageHeader, Panel, PanelHeader, EmptyState } from '../components/layout/Page';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { numberInputValue, parseIntOr } from '../lib/numbers';
import { useFatStore } from '../lib/faturamento/store';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';

// Sellers created before dailyGoal was wired up still carry the old default of 10
// while the gamification has always targeted 100 — treat 10 as "not customized".
function effectiveDailyGoal(dailyGoal?: number | null): number {
  return dailyGoal && dailyGoal !== 10 ? dailyGoal : 100;
}

const selectCls =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-500/30 max-md:h-10";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// Credenciais geradas (criação / reset de senha): só fecha pelo botão, para a senha não se perder sem querer.
function CredentialsDialog({
  open, title, intro, passwordLabel, info, onClose,
}: {
  open: boolean;
  title: string;
  intro: string;
  passwordLabel: string;
  info: { name: string; email: string; password: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={() => { /* fecha só pelo botão */ }}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">{intro}</p>
        {info && (
          <dl className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Nome</dt>
              <dd className="font-medium text-slate-900">{info.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">E-mail (login)</dt>
              <dd className="text-slate-900">{info.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{passwordLabel}</dt>
              <dd className="mt-1 select-all rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-base font-semibold text-amber-800">{info.password}</dd>
            </div>
          </dl>
        )}
        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={onClose}>Entendi, já copiei a senha</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function fmtTimeAgo(date: Date | string): string {
  const min = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

interface Attendant {
  id: number;
  userId: number;
  name: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  dailyGoal: number | null;
  workHoursGoal: number | null;
  status: string | null;
  emailSignatureHtml?: string | null;
  emailSignatureImageUrl?: string | null;
  emailSignatureEnabled?: boolean | null;
  emailMarketingEnabled?: boolean | null;
  ipRestrictionEnabled?: boolean | null;
  allowedIps?: string[] | null;
  lastLoginIp?: string | null;
  lastLoginAt?: Date | string | null;
  createdAt: Date;
  updatedAt: Date;
  userRole?: string | null;
}

interface CreatedResult extends Attendant {
  generatedPassword?: string;
}

export default function Attendants() {
  const { user, loading } = useAuth();
  const { actions: fatActions } = useFatStore(); // reactivity for commission changes
  const [showForm, setShowForm] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ name: string; email: string; password: string } | null>(null);
  const [editingAttendant, setEditingAttendant] = useState<Attendant | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    dailyGoal: 100,
    workHoursGoal: 8,
    status: "active" as "active" | "inactive",
    emailMarketingEnabled: false,
    commissionPct: 0,
  });

  const [resetInfo, setResetInfo] = useState<{ name: string; email: string; password: string } | null>(null);

  // ── Assinatura de e-mail (admin) ─────────────────────────────────────────
  const [signatureAttendant, setSignatureAttendant] = useState<Attendant | null>(null);
  const [signatureForm, setSignatureForm] = useState({ enabled: true, html: "", imageUrl: "" });
  const signatureMutation = trpc.sellers.update.useMutation();

  // ── Minha assinatura de e-mail (o próprio admin/gerente logado) ──────────
  const [showMySignature, setShowMySignature] = useState(false);
  const [mySignatureForm, setMySignatureForm] = useState({ enabled: true, html: "", imageUrl: "" });
  const [mySignatureLoaded, setMySignatureLoaded] = useState(false);
  const { data: myProfile } = trpc.sellers.myProfile.useQuery(undefined, { enabled: showMySignature });
  const mySignatureMutation = trpc.sellers.updateMySignature.useMutation();

  const handleMySignatureOpen = () => {
    setMySignatureLoaded(false);
    setShowMySignature(true);
  };

  // ── Restrição de IP ──────────────────────────────────────────────────────
  const [ipAttendant, setIpAttendant] = useState<Attendant | null>(null);
  const [ipEnabled, setIpEnabled] = useState(false);
  const [ipList, setIpList] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");
  const ipMutation = trpc.sellers.setIpRestriction.useMutation();

  const { data: attendants = [], isLoading, isError, isFetching, refetch } = trpc.sellers.listWithRole.useQuery();
  // Sem polling — protege o plano free do Neon/Vercel. Cache válido por 2min.
  const { data: fraudAlerts = [] } = trpc.tasks.fraudAlerts.useQuery(undefined, { staleTime: 120_000 });

  // ── Filtro avançado ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "manager" | "user">("all");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const createMutation = trpc.sellers.create.useMutation();
  const updateMutation = trpc.sellers.update.useMutation();
  const deleteMutation = trpc.sellers.delete.useMutation();
  const updateRoleMutation = trpc.sellers.updateRole.useMutation();
  const resetPasswordMutation = trpc.auth.adminResetPassword.useMutation();
  // Confirmações (substituem window.confirm)
  const [confirmReset, setConfirmReset] = useState<Attendant | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string } | null>(null);

  const handleResetPassword = async (attendant: Attendant) => {
    try {
      const result = await resetPasswordMutation.mutateAsync({ userId: attendant.userId });
      setResetInfo({ name: result.name, email: result.email, password: result.generatedPassword });
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao resetar senha");
    }
  };

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    dailyGoal: 100,
    workHoursGoal: 8,
    status: "active" as "active" | "inactive",
  });

  const handleEditOpen = (attendant: Attendant) => {
    setEditingAttendant(attendant);
    setEditFormData({
      name: attendant.name,
      email: attendant.email,
      phone: attendant.phone ?? "",
      department: attendant.department ?? "",
      dailyGoal: effectiveDailyGoal(attendant.dailyGoal),
      workHoursGoal: attendant.workHoursGoal ?? 8,
      status: (attendant.status ?? "active") as "active" | "inactive",
      emailMarketingEnabled: attendant.emailMarketingEnabled ?? false,
      commissionPct: fatActions.comissoes.get(attendant.id),
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttendant) return;
    try {
      await updateMutation.mutateAsync({
        id: editingAttendant.id,
        name: editFormData.name,
        email: editFormData.email || undefined,
        phone: editFormData.phone || undefined,
        department: editFormData.department || undefined,
        dailyGoal: Number.isFinite(editFormData.dailyGoal) && editFormData.dailyGoal >= 1 ? editFormData.dailyGoal : 100,
        workHoursGoal: editFormData.workHoursGoal,
        status: editFormData.status,
        emailMarketingEnabled: editFormData.emailMarketingEnabled,
      });
      fatActions.comissoes.set(editingAttendant.id, editFormData.commissionPct);
      toast.success("Atendente atualizado!");
      setEditingAttendant(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao atualizar atendente");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }
    try {
      const result = await createMutation.mutateAsync({
        name: formData.name,
        email: formData.email,
        phone: formData.phone || undefined,
        department: formData.department || undefined,
        dailyGoal: Number.isFinite(formData.dailyGoal) && formData.dailyGoal >= 1 ? formData.dailyGoal : 100,
        workHoursGoal: formData.workHoursGoal,
        status: formData.status,
      }) as CreatedResult;

      if (result.generatedPassword) {
        setCreatedInfo({ name: result.name, email: result.email, password: result.generatedPassword });
      }

      setFormData({ name: "", email: "", phone: "", department: "", dailyGoal: 100, workHoursGoal: 8, status: "active" });
      setShowForm(false);
      refetch();
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao criar atendente");
    }
  };

  // Promoção concede o papel "manager" (acesso restrito: dashboard, próprias
  // tarefas, e-mail marketing e faturamento completos, sem IA nem gestão de
  // atendentes/clientes). O papel "admin" pleno (acesso total) não é concedido
  // por aqui — só manualmente no banco, reservado para o admin principal.
  const handleToggleRole = async (attendant: Attendant) => {
    const newRole = attendant.userRole === 'user' || !attendant.userRole ? 'manager' : 'user';
    const label = newRole === 'manager' ? 'promovido a Gerente' : 'rebaixado para Atendente';
    try {
      await updateRoleMutation.mutateAsync({ sellerId: attendant.id, role: newRole });
      toast.success(`${attendant.name} foi ${label}! Peça para ele atualizar a página (F5).`, { duration: 6000 });
      refetch();
    } catch {
      toast.error('Erro ao alterar permissão');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    try {
      const res = await deleteMutation.mutateAsync({ id });
      if (res.deactivated) {
        toast.success("Atendente possui dados vinculados (tarefas, pedidos ou sessões): foi desativado em vez de excluído", { duration: 6000 });
      } else {
        toast.success("Atendente removido");
      }
      refetch();
    } catch {
      toast.error("Erro ao deletar atendente");
    }
  };

  const handleIpOpen = (attendant: Attendant) => {
    setIpAttendant(attendant);
    setIpEnabled(attendant.ipRestrictionEnabled ?? false);
    setIpList(attendant.allowedIps ?? []);
    setNewIp("");
  };

  const handleIpSave = async () => {
    if (!ipAttendant) return;
    if (ipEnabled && ipList.length === 0) {
      toast.error("Adicione ao menos um IP antes de ativar a restrição");
      return;
    }
    try {
      await ipMutation.mutateAsync({
        userId: ipAttendant.userId,
        enabled: ipEnabled,
        allowedIps: ipList,
      });
      toast.success("Restrição de IP salva!");
      setIpAttendant(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao salvar restrição de IP");
    }
  };

  const handleAddIp = (ip: string) => {
    const trimmed = ip.trim();
    if (!trimmed) return;
    if (!/^[\da-fA-F.:\/]+$/.test(trimmed)) {
      toast.error("IP inválido. Use formato IPv4 (189.33.120.45) ou IPv6 (2804:29b8::1)");
      return;
    }
    if (ipList.includes(trimmed)) {
      toast.error("IP já adicionado");
      return;
    }
    setIpList(prev => [...prev, trimmed]);
    setNewIp("");
  };

  const handleSignatureOpen = (attendant: Attendant) => {
    setSignatureAttendant(attendant);
    setSignatureForm({
      enabled: attendant.emailSignatureEnabled ?? true,
      html: attendant.emailSignatureHtml ?? "",
      imageUrl: attendant.emailSignatureImageUrl ?? "",
    });
  };

  const handleSignatureGenerate = () => {
    if (!signatureAttendant) return;
    const imgLine = signatureForm.imageUrl.trim()
      ? `<br><img src="${signatureForm.imageUrl.trim()}" alt="Assinatura de {atendente_nome}" style="max-width:220px;display:block;margin-top:8px;">`
      : '';
    const html = `<p style="margin:0;font-weight:bold;color:#0C3680;">{atendente_nome}</p>` +
      `<br><p style="margin:0;">{atendente_cargo}</p>` +
      `<br><p style="margin:0;">📞 {atendente_telefone}</p>` +
      `<br><p style="margin:0;">✉️ {atendente_email}</p>` +
      `<br><p style="margin:8px 0 0;font-size:11px;color:#888;"><strong>Sal Vita</strong> — Sal Marinho Premium de Mossoró/RN</p>` +
      imgLine;
    setSignatureForm(f => ({ ...f, html }));
  };

  const signaturePreviewHtml = (() => {
    if (!signatureAttendant) return "";
    const tokens: Record<string, string> = {
      '{atendente_nome}': signatureAttendant.name || '',
      '{atendente_telefone}': signatureAttendant.phone || '',
      '{atendente_email}': signatureAttendant.email || '',
      '{atendente_cargo}': signatureAttendant.department || '',
    };
    let preview = signatureForm.html;
    for (const [token, value] of Object.entries(tokens)) {
      preview = preview.split(token).join(value);
    }
    return preview;
  })();

  const handleSignatureSave = async () => {
    if (!signatureAttendant) return;
    try {
      await signatureMutation.mutateAsync({
        id: signatureAttendant.id,
        emailSignatureHtml: signatureForm.html,
        emailSignatureImageUrl: signatureForm.imageUrl,
        emailSignatureEnabled: signatureForm.enabled,
      });
      toast.success("Assinatura de e-mail salva!");
      setSignatureAttendant(null);
      refetch();
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao salvar assinatura");
    }
  };

  useEffect(() => {
    if (!showMySignature || !myProfile || mySignatureLoaded) return;
    setMySignatureForm({
      enabled: myProfile.emailSignatureEnabled ?? true,
      html: myProfile.emailSignatureHtml ?? "",
      imageUrl: myProfile.emailSignatureImageUrl ?? "",
    });
    setMySignatureLoaded(true);
  }, [showMySignature, myProfile, mySignatureLoaded]);

  const handleMySignatureGenerate = () => {
    const imgLine = mySignatureForm.imageUrl.trim()
      ? `<br><img src="${mySignatureForm.imageUrl.trim()}" alt="Assinatura de ${user?.name ?? ''}" style="max-width:220px;display:block;margin-top:8px;">`
      : '';
    const html = `<p style="margin:0;font-weight:bold;color:#0C3680;">${user?.name ?? ''}</p>` +
      `<br><p style="margin:0;">📞 ${myProfile?.phone ?? ''}</p>` +
      `<br><p style="margin:0;">✉️ ${user?.email ?? ''}</p>` +
      `<br><p style="margin:8px 0 0;font-size:11px;color:#888;"><strong>Sal Vita</strong> — Sal Marinho Premium de Mossoró/RN</p>` +
      imgLine;
    setMySignatureForm(f => ({ ...f, html }));
  };

  const handleMySignatureSave = async () => {
    try {
      await mySignatureMutation.mutateAsync({
        emailSignatureHtml: mySignatureForm.html,
        emailSignatureImageUrl: mySignatureForm.imageUrl,
        emailSignatureEnabled: mySignatureForm.enabled,
      });
      toast.success("Sua assinatura de e-mail foi salva!");
      setShowMySignature(false);
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao salvar assinatura");
    }
  };

  // ── Aplica filtro avançado (tudo client-side, sem novas queries) ──────────
  const filteredAttendants = useMemo(() => {
    let result = attendants as Attendant[];
    if (filterStatus !== "all") {
      result = result.filter(a => (a.status ?? "active") === filterStatus);
    }
    if (filterRole !== "all") {
      result = result.filter(a => (a.userRole === "admin" || a.userRole === "manager" ? a.userRole : "user") === filterRole);
    }
    if (onlyAlerts) {
      result = result.filter(a => fraudAlerts.some(al => al.sellerName === a.name));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        (a.department ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [attendants, filterStatus, filterRole, onlyAlerts, search, fraudAlerts]);

  const activeFilterCount = [
    filterStatus !== "all",
    filterRole !== "all",
    onlyAlerts,
    search.trim().length > 0,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <Page>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }

  if (!user || user.role !== "admin") return null;

  const roleLabel = (r?: string | null) => (r === "admin" ? "Admin" : r === "manager" ? "Gerente" : "Atendente");
  const ipRestricted = (a: Attendant) => !!a.ipRestrictionEnabled && (a.allowedIps?.length ?? 0) > 0;

  const renderActions = (attendant: Attendant) => (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="outline" onClick={() => handleEditOpen(attendant)}>
        Editar
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Mais ações de ${attendant.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => handleSignatureOpen(attendant)}>Assinatura de e-mail</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleIpOpen(attendant)}>
            {ipRestricted(attendant) ? "Editar restrição de IP (ativa)" : "Restringir IP"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={resetPasswordMutation.isPending} onSelect={() => setConfirmReset(attendant)}>
            Resetar senha
          </DropdownMenuItem>
          {attendant.userRole !== "admin" && (
            <DropdownMenuItem disabled={updateRoleMutation.isPending} onSelect={() => handleToggleRole(attendant)}>
              {attendant.userRole === "manager" ? "Rebaixar para Atendente" : "Promover a Gerente"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete({ id: attendant.id, name: attendant.name })}>
            Remover atendente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <Page>
      <PageHeader
        title="Atendentes"
        description="Equipe, metas diárias, expediente, prêmio e permissões de acesso."
        actions={
          <>
            <Button variant="outline" onClick={handleMySignatureOpen}>
              Minha assinatura
            </Button>
            <Button
              variant={showForm ? "outline" : "default"}
              onClick={() => { setFormData({ name: "", email: "", phone: "", department: "", dailyGoal: 100, workHoursGoal: 8, status: "active" }); setShowForm(!showForm); }}
            >
              {showForm ? "Cancelar" : (<><Plus /> Novo atendente</>)}
            </Button>
          </>
        }
      />

      {fraudAlerts.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50">
          <p className="border-b border-red-200 px-4 py-2.5 text-sm font-semibold text-red-800">
            Comportamento suspeito detectado agora ({fraudAlerts.length})
          </p>
          <ul className="divide-y divide-red-200">
            {fraudAlerts.map((alert, i) => (
              <li key={i} className="flex items-start gap-2 px-4 py-2 text-sm text-red-800">
                <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-700" aria-hidden />
                <span><strong>{alert.sellerName}</strong>: {alert.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CredentialsDialog
        open={!!resetInfo}
        title="Senha redefinida"
        intro="Anote a nova senha — ela não será exibida novamente."
        passwordLabel="Nova senha gerada"
        info={resetInfo}
        onClose={() => setResetInfo(null)}
      />
      <CredentialsDialog
        open={!!createdInfo}
        title="Atendente criado"
        intro="Anote as credenciais — a senha não poderá ser recuperada depois."
        passwordLabel="Senha gerada automaticamente"
        info={createdInfo}
        onClose={() => setCreatedInfo(null)}
      />

      {showForm && (
        <Panel>
          <PanelHeader title="Novo atendente" description="Uma senha de acesso será gerada automaticamente e exibida após o cadastro." />
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="new-name" label="Nome *">
                <Input id="new-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nome completo" required />
              </Field>
              <Field id="new-email" label="E-mail (login) *">
                <Input id="new-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@exemplo.com" required />
              </Field>
              <Field id="new-phone" label="Telefone">
                <Input id="new-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(11) 99999-9999" />
              </Field>
              <Field id="new-dept" label="Departamento">
                <Input id="new-dept" type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} placeholder="Ex: Vendas" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="new-goal" label="Meta diária (tarefas)">
                <Input id="new-goal" type="number" value={numberInputValue(formData.dailyGoal)} onChange={(e) => setFormData({ ...formData, dailyGoal: parseIntOr(e.target.value, NaN) })} min="1" />
              </Field>
              <Field id="new-hours" label="Expediente">
                <select id="new-hours" value={formData.workHoursGoal} onChange={(e) => setFormData({ ...formData, workHoursGoal: parseIntOr(e.target.value, 8) })} className={selectCls}>
                  <option value={4}>4h — Meio período</option>
                  <option value={6}>6h — Período parcial</option>
                  <option value={8}>8h — Período integral</option>
                </select>
              </Field>
              <Field id="new-status" label="Status">
                <select id="new-status" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as "active" | "inactive" })} className={selectCls}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar atendente"}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title={`${attendants.length} atendente${attendants.length !== 1 ? 's' : ''} cadastrado${attendants.length !== 1 ? 's' : ''}`}
          description={activeFilterCount > 0 ? `Mostrando ${filteredAttendants.length} de ${attendants.length}` : undefined}
          actions={
            activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(""); setFilterStatus("all"); setFilterRole("all"); setOnlyAlerts(false); }}
              >
                Limpar filtros ({activeFilterCount})
              </Button>
            ) : undefined
          }
        />

        {/* Filtros */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
          <Input
            type="text"
            aria-label="Buscar atendente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou departamento"
          />
          <select aria-label="Filtrar por status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className={selectCls}>
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          <select aria-label="Filtrar por permissão" value={filterRole} onChange={(e) => setFilterRole(e.target.value as any)} className={selectCls}>
            <option value="all">Todas as permissões</option>
            <option value="admin">Admins</option>
            <option value="manager">Gerentes</option>
            <option value="user">Atendentes</option>
          </select>
          <label className="flex min-h-9 cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} className="size-4 accent-brand-700" />
            Só com alerta de fraude
          </label>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-200" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="ml-auto h-5 w-16" />
              </div>
            ))}
          </div>
        ) : isError && attendants.length === 0 ? (
          <QueryError className="m-4" onRetry={() => { void refetch(); }} retrying={isFetching} />
        ) : attendants.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="Nenhum atendente cadastrado"
            description="Cadastre o primeiro atendente para liberar o acesso ao CRM."
            action={<Button onClick={() => setShowForm(true)}><Plus /> Novo atendente</Button>}
          />
        ) : filteredAttendants.length === 0 ? (
          <EmptyState title="Nenhum atendente encontrado" description="Nenhum registro corresponde aos filtros aplicados." />
        ) : (
          <>
            {/* Desktop: tabela */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atendente</TableHead>
                    <TableHead className="hidden lg:table-cell">Contato</TableHead>
                    <TableHead className="text-right">Meta/dia</TableHead>
                    <TableHead className="text-right">Expediente</TableHead>
                    <TableHead className="text-right">Prêmio</TableHead>
                    <TableHead>Permissão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendants.map((attendant: Attendant) => {
                    const alert = fraudAlerts.find(a => a.sellerName === attendant.name);
                    return (
                      <TableRow key={attendant.id} className={alert ? 'bg-red-50' : undefined}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{attendant.name}</span>
                            {alert && <Badge variant="danger">{alert.severity === 'high' ? 'Alerta' : 'Suspeito'}</Badge>}
                          </div>
                          <div className="text-xs text-slate-500">
                            {attendant.email}
                            {attendant.emailMarketingEnabled && ' · E-mail marketing liberado'}
                          </div>
                          {alert && <div className="text-xs text-red-700">{alert.message}</div>}
                        </TableCell>
                        <TableCell className="hidden text-slate-700 lg:table-cell">
                          <div>{attendant.phone || '—'}</div>
                          <div className="text-xs text-slate-500">{attendant.department || '—'}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{effectiveDailyGoal(attendant.dailyGoal)}</TableCell>
                        <TableCell className="text-right tabular-nums">{attendant.workHoursGoal ?? 8}h</TableCell>
                        <TableCell className="text-right tabular-nums">{fatActions.comissoes.get(attendant.id)}%</TableCell>
                        <TableCell className="text-slate-700">{roleLabel(attendant.userRole)}</TableCell>
                        <TableCell>
                          <Badge variant={attendant.status === "active" ? "success" : "neutral"}>
                            {attendant.status === "active" ? "Ativo" : "Inativo"}
                          </Badge>
                          {ipRestricted(attendant) && <span className="ml-2 text-xs text-slate-500">IP restrito</span>}
                        </TableCell>
                        <TableCell>{renderActions(attendant)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Celular: lista de linhas */}
            <ul className="divide-y divide-slate-200 md:hidden">
              {filteredAttendants.map((attendant: Attendant) => {
                const alert = fraudAlerts.find(a => a.sellerName === attendant.name);
                return (
                  <li key={attendant.id} className={`space-y-2 px-4 py-3 ${alert ? 'bg-red-50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{attendant.name}</p>
                        <p className="truncate text-xs text-slate-500">{attendant.email}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {alert && <Badge variant="danger">{alert.severity === 'high' ? 'Alerta' : 'Suspeito'}</Badge>}
                        <Badge variant={attendant.status === "active" ? "success" : "neutral"}>
                          {attendant.status === "active" ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </div>
                    {alert && <p className="text-xs text-red-700">{alert.message}</p>}
                    <p className="text-xs text-slate-500">
                      {roleLabel(attendant.userRole)} · meta {effectiveDailyGoal(attendant.dailyGoal)}/dia · {attendant.workHoursGoal ?? 8}h · prêmio {fatActions.comissoes.get(attendant.id)}%
                      {attendant.phone ? ` · ${attendant.phone}` : ''}
                      {attendant.department ? ` · ${attendant.department}` : ''}
                    </p>
                    {renderActions(attendant)}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Panel>

      {/* Editar atendente */}
      <Dialog open={!!editingAttendant} onOpenChange={(open) => { if (!open) setEditingAttendant(null); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar atendente</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="ed-name" label="Nome *">
                <Input id="ed-name" type="text" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} placeholder="Nome completo" required />
              </Field>
              <Field id="ed-email" label="E-mail (login) *">
                <Input id="ed-email" type="email" value={editFormData.email} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} placeholder="email@exemplo.com" required />
              </Field>
              <Field id="ed-phone" label="Telefone">
                <Input id="ed-phone" type="tel" value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} placeholder="(11) 99999-9999" />
              </Field>
              <Field id="ed-dept" label="Departamento">
                <Input id="ed-dept" type="text" value={editFormData.department} onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })} placeholder="Ex: Vendas" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="ed-goal" label="Meta diária">
                <Input id="ed-goal" type="number" value={numberInputValue(editFormData.dailyGoal)} onChange={(e) => setEditFormData({ ...editFormData, dailyGoal: parseIntOr(e.target.value, NaN) })} min="1" />
              </Field>
              <Field id="ed-hours" label="Expediente">
                <select id="ed-hours" value={editFormData.workHoursGoal} onChange={(e) => setEditFormData({ ...editFormData, workHoursGoal: parseIntOr(e.target.value, 8) })} className={selectCls}>
                  <option value={4}>4h — Meio período</option>
                  <option value={6}>6h — Período parcial</option>
                  <option value={8}>8h — Período integral</option>
                </select>
              </Field>
              <Field id="ed-status" label="Status">
                <select id="ed-status" value={editFormData.status} onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as "active" | "inactive" })} className={selectCls}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </Field>
            </div>
            <Field id="ed-comm" label="Prêmio (%)" hint="Percentual de prêmio sobre vendas faturadas (salvo localmente).">
              <Input
                id="ed-comm"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={editFormData.commissionPct}
                onChange={(e) => setEditFormData({ ...editFormData, commissionPct: parseFloat(e.target.value) || 0 })}
                placeholder="Ex: 5"
              />
            </Field>
            <div>
              <label className="flex min-h-9 cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  checked={editFormData.emailMarketingEnabled}
                  onChange={(e) => setEditFormData({ ...editFormData, emailMarketingEnabled: e.target.checked })}
                />
                Liberar e-mail marketing (inscrever em sequências)
              </label>
              <p className="ml-6 text-xs text-slate-500">
                Quando ativo, o atendente poderá inscrever seus leads em sequências de e-mail.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingAttendant(null)}>Cancelar</Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Restrição de IP */}
      <Dialog open={!!ipAttendant} onOpenChange={(open) => { if (!open) setIpAttendant(null); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Restrição de IP — {ipAttendant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="flex min-h-9 cursor-pointer select-none items-center gap-2 text-sm text-slate-900">
                <input
                  type="checkbox"
                  className="size-4 accent-brand-700"
                  checked={ipEnabled}
                  onChange={(e) => setIpEnabled(e.target.checked)}
                />
                Ativar restrição de IP para este atendente
              </label>
              <p className="ml-6 text-xs text-slate-500">
                Quando ativo, este atendente só consegue acessar o sistema a partir dos IPs listados abaixo.
                O admin nunca é restrito.
              </p>
            </div>

            {ipEnabled && (
              <>
                <div className="space-y-1.5">
                  <Label>IPs permitidos</Label>
                  {ipList.length === 0 && (
                    <p className="text-xs text-amber-700">
                      Nenhum IP adicionado — o atendente será bloqueado de qualquer lugar enquanto a restrição estiver ativa.
                    </p>
                  )}
                  {ipList.length > 0 && (
                    <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                      {ipList.map((ip, i) => (
                        <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                          <code className="flex-1 text-sm text-slate-800">{ip}</code>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-700 hover:text-red-800"
                            onClick={() => setIpList(prev => prev.filter((_, idx) => idx !== i))}
                          >
                            Remover
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input
                    type="text"
                    aria-label="Novo IP permitido"
                    className="flex-1"
                    placeholder="189.33.120.45 ou 189.33.120.0/24"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddIp(newIp); } }}
                  />
                  <Button type="button" variant="outline" onClick={() => handleAddIp(newIp)}>
                    Adicionar
                  </Button>
                </div>

                {ipAttendant?.lastLoginIp ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto w-full whitespace-normal py-2 text-left"
                      onClick={() => {
                        handleAddIp(ipAttendant.lastLoginIp!);
                        toast.success(`IP ${ipAttendant.lastLoginIp} adicionado (último login de ${ipAttendant.name})`);
                      }}
                    >
                      Usar último IP de login de {ipAttendant.name} ({ipAttendant.lastLoginIp}
                      {ipAttendant.lastLoginAt ? `, ${fmtTimeAgo(ipAttendant.lastLoginAt)}` : ''})
                    </Button>
                    {ipAttendant.lastLoginIp.includes(':') && (
                      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Essa conexão usa IPv6 ({ipAttendant.lastLoginIp}). Se o provedor mudar o IPv6 com
                        frequência, considere desativar a restrição para este atendente.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Nenhum login registrado ainda pra {ipAttendant?.name}. Peça pra ela(e) tentar logar uma vez
                    — o IP usado aparece aqui pra você adicionar com um clique.
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  Dica: se o IP da empresa muda frequentemente, use um range CIDR (ex: 189.33.120.0/24). Aceita IPv4 e IPv6.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIpAttendant(null)}>Cancelar</Button>
            <Button type="button" onClick={handleIpSave} disabled={ipMutation.isPending}>
              {ipMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Minha assinatura de e-mail (admin/gerente logado) */}
      <Dialog open={showMySignature} onOpenChange={(open) => { if (!open) setShowMySignature(false); }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Minha assinatura de e-mail</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Essa assinatura é anexada automaticamente aos e-mails das suas campanhas e sequências
              de e-mail marketing.
            </p>
            <label className="flex min-h-9 cursor-pointer select-none items-center gap-2 text-sm text-slate-900">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={mySignatureForm.enabled}
                onChange={(e) => setMySignatureForm(f => ({ ...f, enabled: e.target.checked }))}
              />
              Anexar esta assinatura nos meus e-mails de campanhas e sequências
            </label>

            <Field
              id="mysig-img"
              label="URL de uma imagem (opcional)"
              hint="Imagens vêm bloqueadas por padrão em vários e-mails (Gmail, Outlook) — por isso recomendamos manter também a versão em texto."
            >
              <Input
                id="mysig-img"
                type="text"
                value={mySignatureForm.imageUrl}
                onChange={(e) => setMySignatureForm(f => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://exemplo.com/assinatura.png"
              />
            </Field>

            <div>
              <Button type="button" size="sm" variant="outline" onClick={handleMySignatureGenerate}>
                Gerar HTML a partir dos meus dados
              </Button>
            </div>

            <Field id="mysig-html" label="HTML da assinatura">
              <Textarea
                id="mysig-html"
                value={mySignatureForm.html}
                onChange={(e) => setMySignatureForm(f => ({ ...f, html: e.target.value }))}
                rows={8}
                className="font-mono text-xs"
                placeholder="<p>Seu nome</p><br><p>Seu telefone</p>"
              />
            </Field>

            {mySignatureForm.html.trim() && (
              <div className="space-y-1.5">
                <Label>Pré-visualização</Label>
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mySignatureForm.html) }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowMySignature(false)}>Cancelar</Button>
            <Button type="button" onClick={handleMySignatureSave} disabled={mySignatureMutation.isPending}>
              {mySignatureMutation.isPending ? "Salvando..." : "Salvar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assinatura de e-mail do atendente */}
      <Dialog open={!!signatureAttendant} onOpenChange={(open) => { if (!open) setSignatureAttendant(null); }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assinatura de e-mail — {signatureAttendant?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex min-h-9 cursor-pointer select-none items-center gap-2 text-sm text-slate-900">
              <input
                type="checkbox"
                className="size-4 accent-brand-700"
                checked={signatureForm.enabled}
                onChange={(e) => setSignatureForm(f => ({ ...f, enabled: e.target.checked }))}
              />
              Anexar esta assinatura nos e-mails enviados para os leads e clientes deste atendente
            </label>

            <Field
              id="sig-img"
              label="URL de uma imagem (opcional)"
              hint="Se você já tem uma imagem hospedada (ex: foto/logo), cole a URL aqui e use o botão abaixo para inseri-la no HTML. Imagens vêm bloqueadas por padrão em vários e-mails (Gmail, Outlook) — por isso recomendamos manter também a versão em texto."
            >
              <Input
                id="sig-img"
                type="text"
                value={signatureForm.imageUrl}
                onChange={(e) => setSignatureForm(f => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://exemplo.com/assinatura.png"
              />
            </Field>

            <div>
              <Button type="button" size="sm" variant="outline" onClick={handleSignatureGenerate}>
                Gerar HTML a partir dos dados do atendente
              </Button>
            </div>

            <Field
              id="sig-html"
              label="HTML da assinatura"
              hint={
                <>
                  Tokens disponíveis: <code>{'{atendente_nome}'}</code>, <code>{'{atendente_telefone}'}</code>,{' '}
                  <code>{'{atendente_email}'}</code>, <code>{'{atendente_cargo}'}</code>. Se um campo do atendente
                  estiver vazio, a linha (separada por <code>&lt;br&gt;</code>) que contém o token é removida
                  automaticamente. Tags e atributos não permitidos são removidos ao salvar.
                </>
              }
            >
              <Textarea
                id="sig-html"
                value={signatureForm.html}
                onChange={(e) => setSignatureForm(f => ({ ...f, html: e.target.value }))}
                rows={8}
                className="font-mono text-xs"
                placeholder="<p>{atendente_nome}</p><br><p>{atendente_telefone}</p>"
              />
            </Field>

            {signatureForm.html.trim() && (
              <div className="space-y-1.5">
                <Label>Pré-visualização</Label>
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signaturePreviewHtml) }}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSignatureAttendant(null)}>Cancelar</Button>
            <Button type="button" onClick={handleSignatureSave} disabled={signatureMutation.isPending}>
              {signatureMutation.isPending ? "Salvando..." : "Salvar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmReset}
        onOpenChange={(o) => { if (!o) setConfirmReset(null); }}
        title={`Resetar a senha de "${confirmReset?.name ?? ''}"?`}
        description="Uma nova senha será gerada."
        confirmLabel="Resetar"
        onConfirm={() => { if (confirmReset) void handleResetPassword(confirmReset); }}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={`Deletar atendente "${confirmDelete?.name ?? ''}"?`}
        description="Sem tarefas, pedidos ou sessões vinculados, ele e a conta de acesso são removidos; com dados vinculados, é apenas desativado."
        confirmLabel="Deletar"
        onConfirm={() => { if (confirmDelete) void handleDelete(confirmDelete.id, confirmDelete.name); }}
      />
    </Page>
  );
}
