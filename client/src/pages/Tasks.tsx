import { useAuth } from './_core/hooks/useAuth";
import { trpc } from './lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card";
import { Button } from './components/ui/button";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './components/ui/dialog";

interface Task {
  id: number;
  userId: number;
  clientId: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  reminderDate?: Date | null;
  reminderTime?: string | null;
  reminderEnabled?: boolean | null;
  status?: "pending" | "completed" | "cancelled" | null;
  priority?: "low" | "medium" | "high" | null;
  assignedTo?: string | null;
  createdAt: Date;
  updatedAt: Date;
  client?: any;
}

export default function Tasks() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [importedTasks, setImportedTasks] = useState<any[]>([]);
  const [selectedRepresentative, setSelectedRepresentative] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [bulkRepresentative, setBulkRepresentative] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: tasks = [], isLoading, refetch } = trpc.tasks.list.useQuery();
  const { data: attendants = [] } = trpc.sellers.list.useQuery();
  const createMutation = trpc.tasks.create.useMutation();
  const updateMutation = trpc.tasks.update.useMutation();
  const deleteMutation = trpc.tasks.delete.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();

  const [formData, setFormData] = useState<{
    clientId: number;
    title: string;
    description: string;
    notes: string;
    reminderDate: string;
    reminderTime: string;
    reminderEnabled: boolean;
    priority: "low" | "medium" | "high";
    assignedTo: string;
  }>({
    clientId: 0,
    title: "",
    description: "",
    notes: "",
    reminderDate: "",
    reminderTime: "09:00",
    reminderEnabled: true,
    priority: "medium",
    assignedTo: "",
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const resetForm = useCallback(() => {
    setFormData({
      clientId: 0,
      title: "",
      description: "",
      notes: "",
      reminderDate: "",
      reminderTime: "09:00",
      reminderEnabled: true,
      priority: "medium",
      assignedTo: "",
    });
    setEditingTask(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast.error("Título é obrigatório");
      return;
    }

    try {
      let reminderDateTime: Date | undefined;
      if (formData.reminderDate && formData.reminderTime) {
        const [hours, minutes] = formData.reminderTime.split(":").map(Number);
        reminderDateTime = new Date(formData.reminderDate);
        reminderDateTime.setHours(hours, minutes, 0, 0);
      }

      if (editingTask) {
        await updateMutation.mutateAsync({
          id: editingTask.id,
          title: formData.title,
          description: formData.description,
          notes: formData.notes,
          reminderDate: reminderDateTime,
          reminderEnabled: formData.reminderEnabled,
          priority: formData.priority,
          assignedTo: formData.assignedTo || undefined,
        });
        toast.success("Tarefa atualizada!");
      } else {
        await createMutation.mutateAsync({
          clientId: formData.clientId || 0,
          title: formData.title,
          description: formData.description,
          notes: formData.notes,
          reminderDate: reminderDateTime,
          reminderEnabled: formData.reminderEnabled,
          priority: formData.priority,
          assignedTo: formData.assignedTo || undefined,
        });
        toast.success("Tarefa criada!");
      }
      
      resetForm();
      setIsModalOpen(false);
      refetch();
    } catch (error) {
      console.error("Erro ao salvar tarefa:", error);
      toast.error("Erro ao salvar tarefa");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Deletar tarefa?")) {
      try {
        await deleteMutation.mutateAsync({ id });
        toast.success("Tarefa deletada");
        setIsModalOpen(false);
        resetForm();
        refetch();
      } catch (error) {
        toast.error("Erro ao deletar");
      }
    }
  };

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
    const reminderDate = task.reminderDate ? new Date(task.reminderDate).toISOString().split('T')[0] : "";
    const reminderTime = task.reminderDate ? new Date(task.reminderDate).toTimeString().slice(0, 5) : "09:00";
    
    setFormData({
      clientId: task.clientId,
      title: task.title,
      description: task.description || "",
      notes: task.notes || "",
      reminderDate,
      reminderTime,
      reminderEnabled: task.reminderEnabled ?? true,
      priority: ((task.priority as "low" | "medium" | "high") || "medium") as "low" | "medium" | "high",
      assignedTo: task.assignedTo || "",
    });
    setIsModalOpen(true);
  }, []);

  const handleOpenNewTask = useCallback(() => {
    resetForm();
    setIsModalOpen(true);
  }, [resetForm]);

  // Calcular tarefas filtradas antes de usar em callbacks
  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (filterStatus !== "all") {
      result = result.filter((t: Task) => t.status === filterStatus);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((t: Task) => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.notes?.toLowerCase().includes(query) ||
        t.assignedTo?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [tasks, filterStatus, searchQuery]);

  const handleSelectTask = useCallback((taskId: number) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  }, [selectedTasks]);

  const handleSelectAll = useCallback(() => {
    if (selectedTasks.size === filteredTasks.length) {
      setSelectedTasks(new Set());
    } else {
      setSelectedTasks(new Set(filteredTasks.map((t: Task) => t.id)));
    }
  }, [selectedTasks.size, filteredTasks]);

  const handleBulkAssign = async () => {
    if (!bulkRepresentative.trim()) {
      toast.error("Digite o nome do representante");
      return;
    }

    try {
      for (const taskId of Array.from(selectedTasks)) {
        const task = tasks.find((t: Task) => t.id === taskId);
        if (task) {
          await updateMutation.mutateAsync({
            id: taskId,
            assignedTo: bulkRepresentative,
          });
        }
      }
      toast.success(`${selectedTasks.size} tarefas designadas!`);
      setSelectedTasks(new Set());
      setBulkRepresentative("");
      refetch();
    } catch (error) {
      toast.error("Erro ao designar tarefas");
    }
  };

  const handleBulkExport = () => {
    const tasksToExport = tasks.filter((t: Task) => selectedTasks.has(t.id));
    const headers = ["ID", "Título", "Status", "Prioridade", "Designado para", "Data Lembrete", "Anotações"];
    const rows = tasksToExport.map((task: Task) => [
      task.id,
      task.title,
      task.status || "N/A",
      task.priority || "N/A",
      task.assignedTo || "N/A",
      task.reminderDate ? new Date(task.reminderDate).toLocaleDateString("pt-BR") : "N/A",
      task.notes || "",
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tarefas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success("Exportado!");
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string;
        const lines = csv.split("\n").slice(1);
        const tasks: any[] = [];

        lines.forEach((line) => {
          if (!line.trim()) return;
          const parts = line.split(";");
          if (parts.length < 4) return;

          tasks.push({
            id: parts[0]?.trim(),
            name: parts[3]?.trim(),
            contact: parts[4]?.trim(),
            phone: parts[5]?.trim(),
            city: parts[6]?.trim(),
            state: parts[7]?.trim(),
            email: parts[8]?.trim(),
            representative: parts[11]?.trim(),
          });
        });

        setImportedTasks(tasks);
        setShowImport(true);
        toast.success(`${tasks.length} clientes carregados`);
      } catch (error) {
        toast.error("Erro ao processar CSV");
      }
    };
    reader.readAsText(file);
  };

  const handleImportTasks = async () => {
    if (!selectedRepresentative) {
      toast.error("Selecione um representante");
      return;
    }

    try {
      for (const task of importedTasks) {
        await createMutation.mutateAsync({
          clientId: 0,
          title: `${task.name} - ${task.phone}`,
          description: `${task.city} - ${task.state}`,
          notes: `Contato: ${task.contact}\nEmail: ${task.email}`,
          reminderEnabled: true,
          priority: "medium",
          assignedTo: selectedRepresentative,
        });
      }
      
      toast.success(`${importedTasks.length} tarefas importadas!`);
      setImportedTasks([]);
      setShowImport(false);
      setSelectedRepresentative("");
      refetch();
    } catch (error) {
      toast.error("Erro ao importar");
    }
  };

  const priorityEmoji = {
    low: "🟦",
    medium: "🟨",
    high: "🟥",
  };

  const statusEmoji = {
    pending: "⏳",
    completed: "✅",
    cancelled: "❌",
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
          <h1 className="text-3xl font-bold text-blue-900">📋 Tarefas</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/admin/dashboard"><Button variant="outline">📊 Dashboard</Button></a>
          <a href="/ai-chat"><Button variant="outline">💬 Chat</Button></a>
          <a href="/"><Button variant="outline">🏠 Início</Button></a>
          <Button variant="destructive" onClick={handleLogout}>Sair</Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-4">
        {/* Busca */}
        <input
          type="text"
          placeholder="🔍 Pesquisar tarefas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
        />

        {/* Filtros e Ações */}
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border rounded-lg"
            >
              <option value="all">Todas</option>
              <option value="pending">Pendentes</option>
              <option value="completed">Concluídas</option>
              <option value="cancelled">Canceladas</option>
            </select>
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedTasks.size > 0 && (
              <>
                <select
                  value={bulkRepresentative}
                  onChange={(e) => setBulkRepresentative(e.target.value)}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="">Selecionar atendente...</option>
                  {attendants.map((att: any) => (
                    <option key={att.id} value={att.name}>
                      {att.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" onClick={handleBulkAssign}>👤 Designar ({selectedTasks.size})</Button>
                <Button size="sm" variant="outline" onClick={handleBulkExport}>📥 Exportar ({selectedTasks.size})</Button>
              </>
            )}
            <Button onClick={() => setShowImport(!showImport)} variant="outline">📤 Importar</Button>
            <Button onClick={handleOpenNewTask}>➕ Nova</Button>
          </div>
        </div>

        {/* Import CSV */}
        {showImport && (
          <Card className="border-blue-300 bg-blue-50">
            <CardHeader>
              <CardTitle>Importar CSV</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVImport}
                className="w-full px-3 py-2 border rounded-lg"
              />
              {importedTasks.length > 0 && (
                <>
                  <input
                    type="text"
                    placeholder="Representante"
                    value={selectedRepresentative}
                    onChange={(e) => setSelectedRepresentative(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <div className="bg-white p-3 rounded border max-h-40 overflow-y-auto text-sm">
                    {importedTasks.slice(0, 5).map((t, i) => (
                      <div key={i} className="py-1 border-b">{t.name}</div>
                    ))}
                    {importedTasks.length > 5 && <div className="py-1 text-gray-500">... +{importedTasks.length - 5} mais</div>}
                  </div>
                  <Button onClick={handleImportTasks} className="w-full">✅ Importar {importedTasks.length}</Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Modal de Edição/Criação */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-2xl max-h-96 overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Título da tarefa"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Anotações</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Anotações..."
                  className="w-full px-3 py-2 border rounded-lg h-24"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Data</label>
                  <input 
                    type="date" 
                    value={formData.reminderDate} 
                    onChange={(e) => setFormData({ ...formData, reminderDate: e.target.value })} 
                    className="w-full px-3 py-2 border rounded-lg" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hora</label>
                  <input 
                    type="time" 
                    value={formData.reminderTime} 
                    onChange={(e) => setFormData({ ...formData, reminderTime: e.target.value })} 
                    className="w-full px-3 py-2 border rounded-lg" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Prioridade</label>
                  <select 
                    value={formData.priority} 
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })} 
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Designado para</label>
                  <input 
                    type="text" 
                    value={formData.assignedTo} 
                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })} 
                    placeholder="Nome do atendente" 
                    className="w-full px-3 py-2 border rounded-lg" 
                  />
                </div>
              </div>
              <DialogFooter className="flex gap-2">
                <Button type="submit" className="flex-1">
                  {editingTask ? "Atualizar" : "Criar"}
                </Button>
                {editingTask && (
                  <Button 
                    type="button" 
                    variant="destructive" 
                    onClick={() => handleDelete(editingTask.id)}
                    className="flex-1"
                  >
                    Deletar
                  </Button>
                )}
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }} 
                  className="flex-1"
                >
                  Cancelar
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Tasks List */}
        {isLoading ? (
          <p className="text-center text-gray-600">Carregando...</p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-center text-gray-600">Nenhuma tarefa</p>
        ) : (
          <div className="space-y-2">
            {/* Select All */}
            <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
              <input
                type="checkbox"
                checked={selectedTasks.size === filteredTasks.length && filteredTasks.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 cursor-pointer"
              />
              <span className="text-sm font-medium">Selecionar Tudo ({filteredTasks.length})</span>
            </div>

            {/* Task List - Usando divs em vez de tabela para evitar problemas de hidratação */}
            {filteredTasks.map((task: Task) => (
              <div key={task.id} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-3 p-3 bg-white hover:bg-gray-50 transition cursor-pointer"
                  onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedTasks.has(task.id)}
                    onChange={() => handleSelectTask(task.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 cursor-pointer"
                  />
                  <div className="flex gap-2">
                    {task.status && <span>{statusEmoji[task.status as keyof typeof statusEmoji]}</span>}
                    {task.priority && <span>{priorityEmoji[task.priority as keyof typeof priorityEmoji]}</span>}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{task.title}</p>
                    {task.assignedTo && <p className="text-xs text-gray-600">👤 {task.assignedTo}</p>}
                  </div>
                  {task.reminderDate && task.reminderEnabled && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      🔔 {new Date(task.reminderDate).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>

                {/* Expanded View */}
                {expandedTask === task.id && (
                  <div className="p-3 bg-gray-50 border-t space-y-2">
                    {task.description && <p className="text-sm"><strong>Descrição:</strong> {task.description}</p>}
                    {task.notes && <div className="text-sm bg-yellow-50 p-2 rounded border border-yellow-200"><strong>Anotações:</strong><p className="whitespace-pre-wrap">{task.notes}</p></div>}
                    <div className="flex gap-2 text-xs text-gray-600">
                      <span>Criada: {new Date(task.createdAt).toLocaleDateString("pt-BR")}</span>
                      {task.reminderDate && <span>Lembrete: {new Date(task.reminderDate).toLocaleString("pt-BR")}</span>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(task)}>✏️ Editar</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(task.id)}>🗑️ Deletar</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
