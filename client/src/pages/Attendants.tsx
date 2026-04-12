import { useAuth } from './_core/hooks/useAuth";
import { trpc } from './lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card";
import { Button } from './components/ui/button";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

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
}

export default function Attendants() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [editingAttendant, setEditingAttendant] = useState<Attendant | null>(null);
  
  const { data: attendants = [], isLoading, refetch } = trpc.sellers.list.useQuery();
  const createMutation = trpc.sellers.create.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    department: "",
    dailyGoal: 10,
    status: "active" as "active" | "inactive",
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error("Nome e email são obrigatórios");
      return;
    }

    try {
      if (editingAttendant) {
        toast.info("Edição de atendentes em desenvolvimento");
        setShowForm(false);
      } else {
        await createMutation.mutateAsync({
          name: formData.name,
          email: formData.email,
          userId: user?.id || 0,
          phone: formData.phone,
          department: formData.department,
          dailyGoal: formData.dailyGoal,
        });
        toast.success("Atendente criado!");
      }
      
      setFormData({
        name: "",
        email: "",
        phone: "",
        department: "",
        dailyGoal: 10,
        status: "active",
      });
      setEditingAttendant(null);
      setShowForm(false);
      refetch();
    } catch (error) {
      console.error("Erro ao salvar atendente:", error);
      toast.error("Erro ao salvar atendente");
    }
  };

  const handleDelete = async (id: number) => {
    toast.info("Exclusão de atendentes em desenvolvimento");
  };

  const handleEdit = (attendant: Attendant) => {
    setEditingAttendant(attendant);
    setFormData({
      name: attendant.name,
      email: attendant.email,
      phone: attendant.phone || "",
      department: attendant.department || "",
      dailyGoal: attendant.dailyGoal || 10,
      status: (attendant.status || "active") as "active" | "inactive",
    });
    setShowForm(true);
  };

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <a href="/" className="hover:opacity-80">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/logoSALVITA_grande_3761478e.png"
              alt="Sal Vita"
              className="h-32 cursor-pointer"
            />
          </a>
          <h1 className="text-3xl font-bold text-blue-900">👥 Atendentes</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/admin/dashboard"><Button variant="outline">📊 Dashboard</Button></a>
          <a href="/tasks"><Button variant="outline">📋 Tarefas</Button></a>
          <a href="/ai-chat"><Button variant="outline">💬 Chat</Button></a>
          <a href="/"><Button variant="outline">🏠 Início</Button></a>
          <Button variant="destructive" onClick={handleLogout}>Sair</Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-4">
        {/* Form */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            {editingAttendant ? "Editar Atendente" : "Novo Atendente"}
          </h2>
          <Button onClick={() => {
            setEditingAttendant(null);
            setFormData({
              name: "",
              email: "",
              phone: "",
              department: "",
              dailyGoal: 10,
              status: "active",
            });
            setShowForm(!showForm);
          }}>
            {showForm ? "❌ Cancelar" : "➕ Novo"}
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nome *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nome completo"
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                      className="w-full px-3 py-2 border rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Telefone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(11) 99999-9999"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Departamento</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="Ex: Vendas"
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Meta Diária</label>
                    <input
                      type="number"
                      value={formData.dailyGoal}
                      onChange={(e) => setFormData({ ...formData, dailyGoal: parseInt(e.target.value) })}
                      placeholder="10"
                      className="w-full px-3 py-2 border rounded-lg"
                      min="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as "active" | "inactive" })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    {editingAttendant ? "Atualizar" : "Criar"} Atendente
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Attendants List */}
        {isLoading ? (
          <p className="text-center text-gray-600">Carregando...</p>
        ) : attendants.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-gray-600">Nenhum atendente cadastrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {attendants.map((attendant: Attendant) => (
              <Card key={attendant.id}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-lg">{attendant.name}</h3>
                      <p className="text-sm text-gray-600">{attendant.email}</p>
                    </div>

                    <div className="space-y-1 text-sm">
                      {attendant.phone && <p>📱 {attendant.phone}</p>}
                      {attendant.department && <p>🏢 {attendant.department}</p>}
                      <p>🎯 Meta: {attendant.dailyGoal} tarefas/dia</p>
                      <p className={`font-medium ${attendant.status === "active" ? "text-green-600" : "text-red-600"}`}>
                        {attendant.status === "active" ? "✅ Ativo" : "❌ Inativo"}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(attendant)} className="flex-1">
                        ✏️ Editar
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(attendant.id)} className="flex-1">
                        🗑️ Deletar
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
