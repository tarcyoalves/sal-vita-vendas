import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState, useMemo } from "react";
import { toast } from "sonner";
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
  createdAt: Date;
  updatedAt: Date;
  userRole?: string | null;
}

interface CreatedResult extends Attendant {
  generatedPassword?: string;
}

export default function Attendants() {
  const { user, loading } = useAuth();
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
  });

  const [resetInfo, setResetInfo] = useState<{ name: string; email: string; password: string } | null>(null);

  // ── Assinatura de e-mail (admin) ─────────────────────────────────────────
  const [signatureAttendant, setSignatureAttendant] = useState<Attendant | null>(null);
  const [signatureForm, setSignatureForm] = useState({ enabled: true, html: "", imageUrl: "" });
  const signatureMutation = trpc.sellers.update.useMutation();

  const { data: attendants = [], isLoading, refetch } = trpc.sellers.listWithRole.useQuery();
  // Sem polling — protege o plano free do Neon/Vercel. Cache válido por 2min.
  const { data: fraudAlerts = [] } = trpc.tasks.fraudAlerts.useQuery(undefined, { staleTime: 120_000 });

  // ── Filtro avançado ──────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterRole, setFilterRole] = useState<"all" | "admin" | "user">("all");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const createMutation = trpc.sellers.create.useMutation();
  const updateMutation = trpc.sellers.update.useMutation();
  const deleteMutation = trpc.sellers.delete.useMutation();
  const updateRoleMutation = trpc.sellers.updateRole.useMutation();
  const resetPasswordMutation = trpc.auth.adminResetPassword.useMutation();

  const handleResetPassword = async (attendant: Attendant) => {
    if (!confirm(`Resetar a senha de "${attendant.name}"? Uma nova senha será gerada.`)) return;
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
        dailyGoal: editFormData.dailyGoal,
        workHoursGoal: editFormData.workHoursGoal,
        status: editFormData.status,
        emailMarketingEnabled: editFormData.emailMarketingEnabled,
      });
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
        dailyGoal: formData.dailyGoal,
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

  const handleToggleRole = async (attendant: Attendant) => {
    const newRole = attendant.userRole === 'admin' ? 'user' : 'admin';
    const label = newRole === 'admin' ? 'promovido a Admin' : 'rebaixado para Atendente';
    try {
      await updateRoleMutation.mutateAsync({ sellerId: attendant.id, role: newRole });
      toast.success(`${attendant.name} foi ${label}! Peça para ele atualizar a página (F5).`, { duration: 6000 });
      refetch();
    } catch {
      toast.error('Erro ao alterar permissão');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Deletar atendente "${name}" e sua conta de acesso?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Atendente removido");
      refetch();
    } catch {
      toast.error("Erro ao deletar atendente");
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  // ── Aplica filtro avançado (tudo client-side, sem novas queries) ──────────
  const filteredAttendants = useMemo(() => {
    let result = attendants as Attendant[];
    if (filterStatus !== "all") {
      result = result.filter(a => (a.status ?? "active") === filterStatus);
    }
    if (filterRole !== "all") {
      result = result.filter(a => (a.userRole === "admin" ? "admin" : "user") === filterRole);
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

  return (
    <div className="p-4 md:p-6 space-y-4">

        {/* Fraud alerts banner */}
        {fraudAlerts.length > 0 && (
          <div className="bg-red-50 border border-red-300 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-red-800 flex items-center gap-2">🚨 Alertas de comportamento suspeito detectados agora</p>
            {fraudAlerts.map((alert, i) => (
              <div key={i} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${alert.severity === 'high' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                <span>{alert.severity === 'high' ? '🔴' : '🟠'}</span>
                <strong>{alert.sellerName}</strong>: {alert.message}
              </div>
            ))}
          </div>
        )}

        {/* Reset password modal */}
        {resetInfo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <h2 className="text-2xl font-bold text-orange-600 mb-2">🔑 Senha Resetada!</h2>
              <p className="text-gray-600 mb-6">Anote a nova senha — ela não será exibida novamente.</p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Nome</p>
                  <p className="font-semibold text-gray-800">{resetInfo.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Email (login)</p>
                  <p className="font-mono text-blue-700">{resetInfo.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Nova senha gerada</p>
                  <p className="font-mono text-lg font-bold text-orange-700 bg-orange-50 px-3 py-2 rounded-lg border border-orange-200 select-all tracking-widest">{resetInfo.password}</p>
                </div>
              </div>
              <p className="text-xs text-orange-600 mt-3">⚠️ Copie a senha agora. Ela não será exibida novamente.</p>
              <Button className="w-full mt-4 bg-orange-600 hover:bg-orange-700" onClick={() => setResetInfo(null)}>
                ✅ Entendido, já copiei a senha
              </Button>
            </div>
          </div>
        )}

        {/* Password reveal modal */}
        {createdInfo && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <h2 className="text-2xl font-bold text-green-700 mb-2">✅ Atendente criado!</h2>
              <p className="text-gray-600 mb-6">Anote as credenciais — a senha não poderá ser recuperada depois.</p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Nome</p>
                  <p className="font-semibold text-gray-800">{createdInfo.name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Email (login)</p>
                  <p className="font-mono text-blue-700">{createdInfo.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Senha gerada automaticamente</p>
                  <p className="font-mono text-lg font-bold text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-200 select-all tracking-widest">{createdInfo.password}</p>
                </div>
              </div>
              <p className="text-xs text-orange-600 mt-3">⚠️ Copie a senha agora. Ela não será exibida novamente.</p>
              <Button className="w-full mt-4 bg-green-600 hover:bg-green-700" onClick={() => setCreatedInfo(null)}>
                ✅ Entendido, já copiei a senha
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-700">
            {attendants.length} atendente{attendants.length !== 1 ? 's' : ''} cadastrado{attendants.length !== 1 ? 's' : ''}
          </h2>
          <Button onClick={() => { setFormData({ name: "", email: "", phone: "", department: "", dailyGoal: 100, workHoursGoal: 8, status: "active" }); setShowForm(!showForm); }}>
            {showForm ? "❌ Cancelar" : "➕ Novo Atendente"}
          </Button>
        </div>

        {/* Filtro avançado */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                🔍 Filtro avançado
                {activeFilterCount > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {activeFilterCount} ativo{activeFilterCount > 1 ? 's' : ''}
                  </span>
                )}
              </h3>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => { setSearch(""); setFilterStatus("all"); setFilterRole("all"); setOnlyAlerts(false); }}
                >
                  ✖️ Limpar filtros
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">Buscar</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, email ou departamento..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">Status</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="all">Todos</option>
                  <option value="active">✅ Ativos</option>
                  <option value="inactive">❌ Inativos</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">Permissão</label>
                <select value={filterRole} onChange={(e) => setFilterRole(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="all">Todas</option>
                  <option value="admin">👑 Admins</option>
                  <option value="user">👤 Atendentes</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-3 py-2 border rounded-lg w-full hover:bg-gray-50">
                  <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} className="h-4 w-4" />
                  🚨 Só com alerta de fraude
                </label>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <p className="text-xs text-gray-500">
                Mostrando {filteredAttendants.length} de {attendants.length} atendente{attendants.length !== 1 ? 's' : ''}
              </p>
            )}
          </CardContent>
        </Card>

        {showForm && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nome *</label>
                    <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nome completo" className="w-full px-3 py-2 border rounded-lg" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email * (login)</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="email@example.com" className="w-full px-3 py-2 border rounded-lg" required />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Telefone</label>
                    <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(11) 99999-9999" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Departamento</label>
                    <input type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} placeholder="Ex: Vendas" className="w-full px-3 py-2 border rounded-lg" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Meta Diária (tarefas)</label>
                    <input type="number" value={formData.dailyGoal} onChange={(e) => setFormData({ ...formData, dailyGoal: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" min="1" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Expediente</label>
                    <select value={formData.workHoursGoal} onChange={(e) => setFormData({ ...formData, workHoursGoal: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg">
                      <option value={4}>4h — Meio período</option>
                      <option value={6}>6h — Período parcial</option>
                      <option value={8}>8h — Período integral</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as "active" | "inactive" })} className="w-full px-3 py-2 border rounded-lg">
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  🔐 Uma senha de acesso será gerada automaticamente e exibida após o cadastro.
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "✅ Criar Atendente"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">Cancelar</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <p className="text-center text-gray-500 py-8">Carregando...</p>
        ) : attendants.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-gray-500">Nenhum atendente cadastrado</CardContent></Card>
        ) : filteredAttendants.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-gray-500">Nenhum atendente encontrado com esse filtro</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAttendants.map((attendant: Attendant) => {
              const alert = fraudAlerts.find(a => a.sellerName === attendant.name);
              return (
              <Card key={attendant.id} className={alert ? 'border-red-400' : ''}>
                <CardContent className="pt-5">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-lg">{attendant.name}</h3>
                        {alert && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${alert.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{alert.severity === 'high' ? '🔴 ALERTA' : '🟠 Suspeito'}</span>}
                      </div>
                      <p className="text-sm text-gray-500">{attendant.email}</p>
                      {alert && <p className="text-xs text-red-600 mt-1">⚠️ {alert.message}</p>}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      {attendant.phone && <p>📱 {attendant.phone}</p>}
                      {attendant.department && <p>🏢 {attendant.department}</p>}
                      <p>🎯 Meta: {effectiveDailyGoal(attendant.dailyGoal)} contatos/dia</p>
                      <p>🕐 Expediente: {attendant.workHoursGoal ?? 8}h</p>
                      <div className="flex gap-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${attendant.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {attendant.status === "active" ? "✅ Ativo" : "❌ Inativo"}
                        </span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${attendant.userRole === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                          {attendant.userRole === "admin" ? "👑 Admin" : "👤 Atendente"}
                        </span>
                        {attendant.emailMarketingEnabled && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            ✉️ Email Mkt
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEditOpen(attendant)}>
                          ✏️ Editar
                        </Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => handleDelete(attendant.id, attendant.name)}>
                          🗑️ Remover
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                        onClick={() => handleSignatureOpen(attendant)}
                      >
                        ✉️ Assinatura de e-mail
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={() => handleResetPassword(attendant)}
                        disabled={resetPasswordMutation.isPending}
                      >
                        🔑 Resetar Senha
                      </Button>
                      <Button
                        size="sm"
                        variant={attendant.userRole === "admin" ? "outline" : "default"}
                        className="w-full"
                        onClick={() => handleToggleRole(attendant)}
                        disabled={updateRoleMutation.isPending}
                      >
                        {attendant.userRole === "admin" ? "⬇️ Rebaixar para Atendente" : "👑 Promover a Admin"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}

        {/* Edit Attendant Modal */}
        <Dialog open={!!editingAttendant} onOpenChange={(open) => { if (!open) setEditingAttendant(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>✏️ Editar Atendente</DialogTitle></DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome *</label>
                  <input type="text" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} placeholder="Nome completo" className="w-full px-3 py-2 border rounded-lg" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email (login) *</label>
                  <input type="email" value={editFormData.email} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} placeholder="email@example.com" className="w-full px-3 py-2 border rounded-lg" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Telefone</label>
                  <input type="tel" value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} placeholder="(11) 99999-9999" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Departamento</label>
                  <input type="text" value={editFormData.department} onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })} placeholder="Ex: Vendas" className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Meta Diária</label>
                  <input type="number" value={editFormData.dailyGoal} onChange={(e) => setEditFormData({ ...editFormData, dailyGoal: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Expediente</label>
                  <select value={editFormData.workHoursGoal} onChange={(e) => setEditFormData({ ...editFormData, workHoursGoal: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg">
                    <option value={4}>4h — Meio período</option>
                    <option value={6}>6h — Período parcial</option>
                    <option value={8}>8h — Período integral</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select value={editFormData.status} onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as "active" | "inactive" })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-3 py-2 border rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={editFormData.emailMarketingEnabled}
                    onChange={(e) => setEditFormData({ ...editFormData, emailMarketingEnabled: e.target.checked })}
                  />
                  Liberar Email Marketing (inscrever em sequências + disparo rápido)
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-1">
                  Quando ativo, o atendente poderá inscrever seus leads em sequências e enviar e-mails rápidos usando sua própria assinatura.
                </p>
              </div>
              <DialogFooter className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "Salvando..." : "✅ Salvar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingAttendant(null)}>Cancelar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Email Signature Modal */}
        <Dialog open={!!signatureAttendant} onOpenChange={(open) => { if (!open) setSignatureAttendant(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>✉️ Assinatura de e-mail — {signatureAttendant?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-3 py-2 border rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={signatureForm.enabled}
                  onChange={(e) => setSignatureForm(f => ({ ...f, enabled: e.target.checked }))}
                />
                Anexar esta assinatura nos e-mails enviados para os leads/clientes deste atendente
              </label>

              <div>
                <label className="block text-sm font-medium mb-1">URL de uma imagem (opcional)</label>
                <input
                  type="text"
                  value={signatureForm.imageUrl}
                  onChange={(e) => setSignatureForm(f => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://exemplo.com/assinatura.png"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se você já tem uma imagem hospedada (ex: foto/logo), cole a URL aqui e use o botão abaixo para
                  inseri-la no HTML. Imagens vêm bloqueadas por padrão em vários e-mails (Gmail, Outlook) — por isso
                  recomendamos manter também a versão em texto.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleSignatureGenerate}>
                  ✨ Gerar HTML a partir dos dados do atendente
                </Button>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">HTML da assinatura</label>
                <textarea
                  value={signatureForm.html}
                  onChange={(e) => setSignatureForm(f => ({ ...f, html: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                  placeholder="<p>{atendente_nome}</p><br><p>{atendente_telefone}</p>"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tokens disponíveis: <code>{'{atendente_nome}'}</code>, <code>{'{atendente_telefone}'}</code>,{' '}
                  <code>{'{atendente_email}'}</code>, <code>{'{atendente_cargo}'}</code>. Se um campo do atendente
                  estiver vazio, a linha (separada por <code>&lt;br&gt;</code>) que contém o token é removida
                  automaticamente. Tags e atributos não permitidos são removidos ao salvar.
                </p>
              </div>

              {signatureForm.html.trim() && (
                <div>
                  <label className="block text-sm font-medium mb-1">Pré-visualização</label>
                  <div
                    className="border rounded-lg p-4 bg-gray-50 text-sm"
                    dangerouslySetInnerHTML={{ __html: signaturePreviewHtml }}
                  />
                </div>
              )}
            </div>
            <DialogFooter className="flex gap-2 pt-2">
              <Button
                type="button"
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={handleSignatureSave}
                disabled={signatureMutation.isPending}
              >
                {signatureMutation.isPending ? "Salvando..." : "✅ Salvar assinatura"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSignatureAttendant(null)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  );
}
