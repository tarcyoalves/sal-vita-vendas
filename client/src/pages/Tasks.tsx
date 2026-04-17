import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';

interface Task {
  id: number;
  userId: number;
  clientId: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  reminderDate?: Date | null;
  reminderEnabled?: boolean | null;
  status?: "pending" | "completed" | "cancelled" | null;
  priority?: "low" | "medium" | "high" | null;
  assignedTo?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
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

  // Browser notifications for due reminders — checks every 30s
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          toast.success('🔔 Notificações ativadas! Você receberá lembretes de tarefas.');
        } else {
          toast.warning('⚠️ Notificações bloqueadas. Ative nas configurações do navegador para receber lembretes.', { duration: 8000 });
        }
      });
    }

    const STORAGE_KEY = 'sv_notified';
    const getFired = (): Set<string> => new Set(JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'));
    const markFired = (key: string) => {
      const s = getFired(); s.add(key); sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
    };

    const playBeep = () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1);
      } catch (_) {}
    };

    const check = () => {
      const now = new Date();
      const today = now.toDateString();
      const fired = getFired();
      (tasks as Task[]).forEach((task) => {
        // treat null/undefined as enabled — only skip if explicitly false
        if (task.reminderEnabled === false || !task.reminderDate || task.status !== 'pending') return;
        const rd = new Date(task.reminderDate);
        const diff = rd.getTime() - now.getTime();
        const isOverdue = diff <= 0;

        // overdue: fire once per day so user is reminded each session
        // upcoming: fire once permanently
        const key = isOverdue
          ? `${task.id}-overdue-${today}`
          : `${task.id}-${rd.getTime()}`;

        if (fired.has(key)) return;

        // Fire for: any overdue task OR upcoming within next 5 min
        if (!isOverdue && diff > 300000) return;

        const title = isOverdue ? `⏰ Atrasada: ${task.title}` : `🔔 Lembrete: ${task.title}`;
        const body = task.notes?.trim() || (isOverdue ? 'Prazo ultrapassado!' : 'Tarefa pendente');

        toast.warning(title, { duration: 10000 });
        playBeep();
        markFired(key);

        if (Notification.permission === 'granted') {
          try { new Notification(title, { body, icon: '/favicon.ico' }); } catch (_) {}
        }
      });
    };

    check(); // run immediately
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [tasks]);

  const resetForm = useCallback(() => {
    setFormData({ clientId: 0, title: "", description: "", notes: "", reminderDate: "", reminderTime: "09:00", reminderEnabled: true, priority: "medium", assignedTo: "" });
    setEditingTask(null);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) { toast.error("Título é obrigatório"); return; }
    try {
      let reminderDateTime: Date | undefined;
      if (formData.reminderDate && formData.reminderTime) {
        // Parse as local time — "YYYY-MM-DDThh:mm:00" without Z is always local
        reminderDateTime = new Date(`${formData.reminderDate}T${formData.reminderTime}:00`);
      }
      if (editingTask) {
        await updateMutation.mutateAsync({ id: editingTask.id, title: formData.title, description: formData.description, notes: formData.notes, reminderDate: reminderDateTime, reminderEnabled: formData.reminderEnabled, priority: formData.priority, assignedTo: formData.assignedTo || undefined });
        toast.success("Tarefa atualizada!");
      } else {
        await createMutation.mutateAsync({ clientId: formData.clientId || 0, title: formData.title, description: formData.description, notes: formData.notes, reminderDate: reminderDateTime, reminderEnabled: formData.reminderEnabled, priority: formData.priority, assignedTo: formData.assignedTo || undefined });
        toast.success("Tarefa criada! Lembrete ativado ✅");
      }
      resetForm(); setIsModalOpen(false); refetch();
    } catch { toast.error("Erro ao salvar tarefa"); }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Deletar tarefa?")) {
      try { await deleteMutation.mutateAsync({ id }); toast.success("Tarefa deletada"); setIsModalOpen(false); resetForm(); refetch(); }
      catch { toast.error("Erro ao deletar"); }
    }
  };

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
    // Use local time components — toISOString() returns UTC which shifts date back 1 day in UTC-3
    const d = task.reminderDate ? new Date(task.reminderDate) : null;
    const reminderDate = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : "";
    const reminderTime = d
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : "09:00";
    setFormData({ clientId: task.clientId, title: task.title, description: task.description || "", notes: task.notes || "", reminderDate, reminderTime, reminderEnabled: task.reminderEnabled ?? true, priority: (task.priority as "low" | "medium" | "high") || "medium", assignedTo: task.assignedTo || "" });
    setIsModalOpen(true);
  }, []);

  const handleOpenNewTask = useCallback(() => { resetForm(); setIsModalOpen(true); }, [resetForm]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterStatus !== "all") result = result.filter((t: Task) => t.status === filterStatus);
    if (isAdmin && filterAssignee !== "all") {
      if (filterAssignee === "__none__") {
        result = result.filter((t: Task) => !t.assignedTo || t.assignedTo.trim() === "");
      } else {
        result = result.filter((t: Task) => t.assignedTo === filterAssignee);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((t: Task) => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || t.assignedTo?.toLowerCase().includes(q));
    }
    return result;
  }, [tasks, filterStatus, filterAssignee, isAdmin, searchQuery]);

  const handleSelectTask = useCallback((id: number) => {
    const s = new Set(selectedTasks);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedTasks(s);
  }, [selectedTasks]);

  const handleSelectAll = useCallback(() => {
    setSelectedTasks(selectedTasks.size === filteredTasks.length ? new Set() : new Set(filteredTasks.map((t: Task) => t.id)));
  }, [selectedTasks.size, filteredTasks]);

  const handleBulkAssign = async () => {
    if (!bulkRepresentative.trim()) { toast.error("Digite o nome do representante"); return; }
    try {
      for (const id of Array.from(selectedTasks)) await updateMutation.mutateAsync({ id, assignedTo: bulkRepresentative });
      toast.success(`${selectedTasks.size} tarefas designadas!`); setSelectedTasks(new Set()); setBulkRepresentative(""); refetch();
    } catch { toast.error("Erro ao designar"); }
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const lines = (ev.target?.result as string).split("\n").slice(1);
        const imported = lines.filter(l => l.trim()).map(l => { const p = l.split(";"); return { name: p[3]?.trim(), phone: p[5]?.trim(), city: p[6]?.trim(), state: p[7]?.trim(), contact: p[4]?.trim(), email: p[8]?.trim() }; });
        setImportedTasks(imported); setShowImport(true); toast.success(`${imported.length} clientes carregados`);
      } catch { toast.error("Erro ao processar CSV"); }
    };
    reader.readAsText(file);
  };

  const handleImportTasks = async () => {
    if (!selectedRepresentative) { toast.error("Selecione um representante"); return; }
    try {
      for (const t of importedTasks) await createMutation.mutateAsync({ clientId: 0, title: `${t.name} - ${t.phone}`, description: `${t.city} - ${t.state}`, notes: `Contato: ${t.contact}\nEmail: ${t.email}`, reminderEnabled: true, priority: "medium", assignedTo: selectedRepresentative });
      toast.success(`${importedTasks.length} tarefas importadas!`); setImportedTasks([]); setShowImport(false); setSelectedRepresentative(""); refetch();
    } catch { toast.error("Erro ao importar"); }
  };

  const priorityEmoji: Record<string, string> = { low: "🟦", medium: "🟨", high: "🟥" };
  const statusEmoji: Record<string, string> = { pending: "⏳", completed: "✅", cancelled: "❌" };

  if (!user) return <div className="p-4 text-center">Carregando...</div>;

  return (
    <div className="p-6 space-y-4">
        <input type="text" placeholder="🔍 Pesquisar tarefas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-4 py-2 border rounded-lg" />

        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-4 py-2 border rounded-lg">
              <option value="all">Todas</option>
              <option value="pending">Pendentes</option>
              <option value="completed">Concluídas</option>
              <option value="cancelled">Canceladas</option>
            </select>
            {isAdmin && (
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">👥 Todos atendentes</option>
                <option value="__none__">🔑 Administrador</option>
                {(attendants as any[]).map((a: any) => (
                  <option key={a.id} value={a.name}>👤 {a.name}</option>
                ))}
              </select>
            )}
          </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isAdmin && selectedTasks.size > 0 && (
              <>
                <select value={bulkRepresentative} onChange={(e) => setBulkRepresentative(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
                  <option value="">Selecionar atendente...</option>
                  {attendants.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                <Button size="sm" onClick={handleBulkAssign}>👤 Designar ({selectedTasks.size})</Button>
              </>
            )}
            {isAdmin && <Button onClick={() => setShowImport(!showImport)} variant="outline" size="sm">📤 Importar CSV</Button>}
            <Button onClick={handleOpenNewTask} size="sm">➕ Nova Tarefa</Button>
          </div>
        </div>

        {isAdmin && showImport && (
          <Card className="border-blue-300 bg-blue-50">
            <CardHeader><CardTitle className="text-base">Importar CSV</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <input type="file" accept=".csv" onChange={handleCSVImport} className="w-full px-3 py-2 border rounded-lg" />
              {importedTasks.length > 0 && (
                <>
                  <select value={selectedRepresentative} onChange={(e) => setSelectedRepresentative(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                    <option value="">Selecionar atendente...</option>
                    {attendants.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                  <Button onClick={handleImportTasks} className="w-full">✅ Importar {importedTasks.length} tarefas</Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Task Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingTask ? "✏️ Editar Tarefa" : "➕ Nova Tarefa"}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título *</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Título da tarefa" className="w-full px-3 py-2 border rounded-lg" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Anotações</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Anotações..." className="w-full px-3 py-2 border rounded-lg h-20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">🗓️ Data do lembrete</label>
                  <input type="date" value={formData.reminderDate} onChange={(e) => setFormData({ ...formData, reminderDate: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">⏰ Hora</label>
                  <input type="time" value={formData.reminderTime} onChange={(e) => setFormData({ ...formData, reminderTime: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
              <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg">
                <input type="checkbox" id="reminderEnabled" checked={formData.reminderEnabled} onChange={(e) => setFormData({ ...formData, reminderEnabled: e.target.checked })} className="w-4 h-4" />
                <label htmlFor="reminderEnabled" className="text-sm font-medium text-blue-800">🔔 Ativar notificação no navegador</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Prioridade</label>
                  <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })} className="w-full px-3 py-2 border rounded-lg">
                    <option value="low">🟦 Baixa</option>
                    <option value="medium">🟨 Média</option>
                    <option value="high">🟥 Alta</option>
                  </select>
                </div>
                {isAdmin && (
                  <div>
                    <label className="block text-sm font-medium mb-1">👤 Designar para</label>
                    <select value={formData.assignedTo} onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">Nenhum</option>
                      {attendants.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <DialogFooter className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">{editingTask ? "Atualizar" : "Criar Tarefa"}</Button>
                {editingTask && <Button type="button" variant="destructive" onClick={() => handleDelete(editingTask.id)}>🗑️</Button>}
                <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }}>Cancelar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Tasks List */}
        {isLoading ? (
          <p className="text-center text-gray-500 py-8">Carregando...</p>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">Nenhuma tarefa encontrada</p>
            <Button onClick={handleOpenNewTask} className="mt-4">➕ Criar primeira tarefa</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {isAdmin && (
              <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
                <input type="checkbox" checked={selectedTasks.size === filteredTasks.length && filteredTasks.length > 0} onChange={handleSelectAll} className="w-4 h-4 cursor-pointer" />
                <span className="text-sm font-medium">Selecionar Tudo ({filteredTasks.length})</span>
              </div>
            )}
            {filteredTasks.map((task: Task) => (
              <div key={task.id} className="border rounded-lg overflow-hidden shadow-sm">
                <div className="flex items-center gap-3 p-3 bg-white hover:bg-gray-50 transition cursor-pointer" onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}>
                  {isAdmin && <input type="checkbox" checked={selectedTasks.has(task.id)} onChange={() => handleSelectTask(task.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 cursor-pointer" />}
                  <div className="flex gap-1">
                    <span>{statusEmoji[task.status || 'pending']}</span>
                    <span>{priorityEmoji[task.priority || 'medium']}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{task.title}</p>
                    {isAdmin && task.assignedTo && <p className="text-xs text-gray-500">👤 {task.assignedTo}</p>}
                  </div>
                  {task.reminderDate && task.reminderEnabled && (() => {
                    const rd = new Date(task.reminderDate);
                    const now = new Date();
                    const isOverdue = rd < now && task.status === 'pending';
                    const isToday = rd.toDateString() === now.toDateString();
                    return (
                      <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${isOverdue ? 'bg-red-100 text-red-700' : isToday ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isOverdue ? '🚨 ATRASADO' : isToday ? '⚠️ HOJE' : '🔔'} {rd.toLocaleDateString("pt-BR")} {rd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    );
                  })()}
                </div>
                {expandedTask === task.id && (
                  <div className="p-3 bg-gray-50 border-t space-y-2">
                    {task.notes && <div className="text-sm bg-yellow-50 p-2 rounded border border-yellow-200"><strong>📝 Anotações:</strong><p className="whitespace-pre-wrap mt-1">{task.notes}</p></div>}
                    <p className="text-xs text-gray-500">Criada: {new Date(task.createdAt).toLocaleDateString("pt-BR")}</p>
                    <div className="flex gap-2 flex-wrap">
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
  );
}
