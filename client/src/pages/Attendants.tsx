import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';

interface Attendant {
  id: number;
  userId: number;
  name: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  dailyGoal: number | null;
  status: "active" | "inactive" | null;
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
    phone: "",
    department: "",
    dailyGoal: 10,
    status: "active" as "active" | "inactive",
  });

  const { data: attendants = [], isLoading, refetch } = trpc.sellers.listWithRole.useQuery();
  const createMutation = trpc.sellers.create.useMutation();
  const updateMutation = trpc.sellers.update.useMutation();
  const deleteMutation = trpc.sellers.delete.useMutation();
  const updateRoleMutation = trpc.sellers.updateRole.useMutation();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    dailyGoal: 10,
    status: "active" as "active" | "inactive",
  });

  const handleEditOpen = (attendant: Attendant) => {
    setEditingAttendant(attendant);
    setEditFormData({
      name: attendant.name,
      phone: attendant.phone ?? "",
      department: attendant.department ?? "",
      dailyGoal: attendant.dailyGoal ?? 10,
      status: attendant.status ?? "active",
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttendant) return;
    try {
      await updateMutation.mutateAsync({
        id: editingAttendant.id,
        name: editFormData.name,
        phone: editFormData.phone || undefined,
        department: editFormData.department || undefined,
        dailyGoal: editFormData.dailyGoal,
        status: editFormData.status,
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
        status: formData.status,
      }) as CreatedResult;

      if (result.generatedPassword) {
        setCreatedInfo({ name: result.name, email: result.email, password: result.generatedPassword });
      }

      setFormData({ name: "", email: "", phone: "", department: "", dailyGoal: 10, status: "active" });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="p-4 md:p-6 space-y-4">

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
          <Button onClick={() => { setFormData({ name: "", email: "", phone: "", department: "", dailyGoal: 10, status: "active" }); setShowForm(!showForm); }}>
            {showForm ? "❌ Cancelar" : "➕ Novo Atendente"}
          </Button>
        </div>

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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Meta Diária</label>
                    <input type="number" value={formData.dailyGoal} onChange={(e) => setFormData({ ...formData, dailyGoal: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" min="1" />
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {attendants.map((attendant: Attendant) => (
              <Card key={attendant.id}>
                <CardContent className="pt-5">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg">{attendant.name}</h3>
                      <p className="text-sm text-gray-500">{attendant.email}</p>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      {attendant.phone && <p>📱 {attendant.phone}</p>}
                      {attendant.department && <p>🏢 {attendant.department}</p>}
                      <p>🎯 Meta: {attendant.dailyGoal} tarefas/dia</p>
                      <div className="flex gap-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${attendant.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {attendant.status === "active" ? "✅ Ativo" : "❌ Inativo"}
                        </span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${attendant.userRole === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                          {attendant.userRole === "admin" ? "👑 Admin" : "👤 Atendente"}
                        </span>
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
            ))}
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
                  <label className="block text-sm font-medium mb-1">Telefone</label>
                  <input type="tel" value={editFormData.phone} onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })} placeholder="(11) 99999-9999" className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Departamento</label>
                  <input type="text" value={editFormData.department} onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })} placeholder="Ex: Vendas" className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Meta Diária</label>
                  <input type="number" value={editFormData.dailyGoal} onChange={(e) => setEditFormData({ ...editFormData, dailyGoal: parseInt(e.target.value) })} className="w-full px-3 py-2 border rounded-lg" min="1" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select value={editFormData.status} onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as "active" | "inactive" })} className="w-full px-3 py-2 border rounded-lg">
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
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
    </div>
  );
}
