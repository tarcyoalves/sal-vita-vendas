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

// Extracts phones and emails from a string (for filtering)
function hasPhone(text: string): boolean {
  return /\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/.test(text);
}
function hasEmail(text: string): boolean {
  return /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text);
}

// Parser for dash-separated customer records
// Handles: NOME - EMPRESA - (DD)NNNN-NNNN - email - CIDADE - UF
function parseImportLine(line: string): { title: string; description: string; notes: string } | null {
  const raw = line.replace(/^[-\s]+/, '').trim();
  if (!raw || raw.length < 3) return null;

  const emailRx = /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi;
  const emails = [...new Set(raw.match(emailRx) ?? [])];

  // Remove CPF/CNPJ/RG before phone matching to avoid false positives
  const noDocs = raw
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, ' ')
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' ')
    .replace(/\d{1,2}\.\d{3}\.\d{3}-[\dXx]{1,2}/g, ' ');

  // Match phones: (DD)NNNN-NNNN, DD.NNNN-NNNN, DD NNNNN-NNNN
  const phoneRxG = /\(?\d{2}\)?[\s.]*\d{4,5}[-\s]?\d{4}/g;
  const phones = [...new Set(
    (noDocs.match(phoneRxG) ?? []).map(p => p.trim()).filter(p => p.replace(/\D/g, '').length >= 10)
  )];
  // 11+ digits after DDD = mobile/WhatsApp; 10 = landline
  const mobiles = phones.filter(p => p.replace(/\D/g, '').length >= 11);
  const landlines = phones.filter(p => p.replace(/\D/g, '').length === 10);

  const noteLines: string[] = [];
  if (mobiles.length) noteLines.push(`📱 WhatsApp: ${mobiles.join(', ')}`);
  if (landlines.length) noteLines.push(`📞 Tel: ${landlines.join(', ')}`);
  if (emails.length) noteLines.push(`📧 Email: ${emails.join(', ')}`);

  // Title = text before the first phone or email in the line
  const firstPhone = /\(?\d{2}\)?[\s.]*\d{4,5}[-\s]?\d{4}/.exec(noDocs);
  const firstEmail = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.exec(raw);
  const firstIdx = Math.min(firstPhone?.index ?? Infinity, firstEmail?.index ?? Infinity);
  const title = (firstIdx < Infinity
    ? raw.slice(0, firstIdx).replace(/[\s;-]+$/, '').split(' - ')[0]
    : raw.split(' - ')[0]
  ).trim();

  // Normalize multi-space dashes, then split for city/state detection
  const norm = raw.replace(/\s{2,}-\s*/g, ' - ').replace(/\s*-\s{2,}/g, ' - ');
  const parts = norm.split(/\s+-\s+|-\s+(?=[A-ZÁÉÍÓÚÃÂÊÔÀÜ])/).map(p => p.trim()).filter(p => p.length > 1);

  const isPhonePart = (s: string) => /\d{4,5}[-.\s]\d{4}/.test(s);
  const isStatePart = (s: string) => /^[A-Z]{2}$/.test(s);

  let state = '', city = '';
  for (let i = parts.length - 1; i >= 0; i--) {
    if (isStatePart(parts[i])) {
      state = parts[i];
      for (let j = i - 1; j >= 0; j--) {
        if (!isPhonePart(parts[j]) && !isStatePart(parts[j]) && !/^\d/.test(parts[j]) && parts[j].length > 2) {
          city = parts[j];
          break;
        }
      }
      break;
    }
  }

  const titleEmail = emails[0] ?? '';
  const titlePhone = mobiles[0] ?? landlines[0] ?? '';
  const fullTitle = [title || raw, titleEmail, titlePhone, city, state].filter(Boolean).join(' - ');
  return { title: fullTitle, description: [city, state].filter(Boolean).join(' - '), notes: noteLines.join('\n') };
}

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterContact, setFilterContact] = useState<"all" | "whatsapp" | "email">("all");
  const [filterReminder, setFilterReminder] = useState<"all" | "active" | "inactive">("all");
  const [reminderTab, setReminderTab] = useState<"all" | "today" | "yesterday" | "lastWeek" | "lastMonth">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [importedTasks, setImportedTasks] = useState<{ title: string; description: string; notes: string }[]>([]);
  const [selectedRepresentative, setSelectedRepresentative] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [bulkRepresentative, setBulkRepresentative] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ taskId: number; text: string } | null>(null);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  const { data: tasks = [], isLoading, refetch } = trpc.tasks.list.useQuery();
  const { data: attendants = [] } = trpc.sellers.list.useQuery();
  const createMutation = trpc.tasks.create.useMutation();
  const updateMutation = trpc.tasks.update.useMutation();
  const deleteMutation = trpc.tasks.delete.useMutation();
  const deleteManyMutation = trpc.tasks.deleteMany.useMutation();
  const suggestMutation = trpc.ai.suggestSalesApproach.useMutation();

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

  const handleBulkDelete = async () => {
    if (!confirm(`Deletar ${selectedTasks.size} tarefa(s) selecionada(s)?`)) return;
    try {
      await deleteManyMutation.mutateAsync({ ids: Array.from(selectedTasks) });
      toast.success(`${selectedTasks.size} tarefa(s) deletada(s)!`);
      setSelectedTasks(new Set());
      refetch();
    } catch { toast.error("Erro ao deletar tarefas"); }
  };

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const lastWeekStart = new Date(today.getTime() - 7 * 86400000);
    const lastMonthStart = new Date(today.getTime() - 30 * 86400000);

    let result = tasks as Task[];

    // Reminder tab filter
    if (reminderTab !== "all") {
      result = result.filter(t => {
        if (!t.reminderDate) return false;
        const rd = new Date(t.reminderDate);
        const rdDay = new Date(rd.getFullYear(), rd.getMonth(), rd.getDate());
        if (reminderTab === "today") return rdDay.getTime() === today.getTime();
        if (reminderTab === "yesterday") return rdDay.getTime() === yesterday.getTime();
        if (reminderTab === "lastWeek") return rdDay >= lastWeekStart && rdDay < yesterday;
        if (reminderTab === "lastMonth") return rdDay >= lastMonthStart && rdDay < lastWeekStart;
        return false;
      });
    }

    if (filterStatus !== "all") result = result.filter(t => t.status === filterStatus);
    if (isAdmin && filterAssignee !== "all") {
      if (filterAssignee === "__none__") result = result.filter(t => !t.assignedTo || t.assignedTo.trim() === "");
      else result = result.filter(t => t.assignedTo === filterAssignee);
    }
    if (filterContact === "whatsapp") {
      result = result.filter(t => hasPhone(`${t.title} ${t.notes ?? ''}`));
    } else if (filterContact === "email") {
      result = result.filter(t => hasEmail(`${t.title} ${t.notes ?? ''}`));
    }
    if (filterReminder === "active") {
      result = result.filter(t => t.reminderEnabled !== false && t.reminderDate);
    } else if (filterReminder === "inactive") {
      result = result.filter(t => t.reminderEnabled === false || !t.reminderDate);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || t.assignedTo?.toLowerCase().includes(q));
    }

    // Sort: upcoming reminders first (soonest), then overdue (most recent), then no reminder
    return [...result].sort((a, b) => {
      const nowMs = now.getTime();
      const aDate = a.reminderDate && a.reminderEnabled !== false ? new Date(a.reminderDate).getTime() : null;
      const bDate = b.reminderDate && b.reminderEnabled !== false ? new Date(b.reminderDate).getTime() : null;
      const aUpcoming = aDate !== null && aDate >= nowMs;
      const bUpcoming = bDate !== null && bDate >= nowMs;
      const aOverdue = aDate !== null && aDate < nowMs;
      const bOverdue = bDate !== null && bDate < nowMs;
      if (aUpcoming && !bUpcoming) return -1;
      if (!aUpcoming && bUpcoming) return 1;
      if (aUpcoming && bUpcoming) return aDate! - bDate!;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      if (aOverdue && bOverdue) return bDate! - aDate!;
      return 0;
    });
  }, [tasks, filterStatus, filterAssignee, filterContact, filterReminder, reminderTab, isAdmin, searchQuery]);

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
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

  const handleSelectTask = useCallback((id: number) => {
    const s = new Set(selectedTasks);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedTasks(s);
  }, [selectedTasks]);

  const handleSelectAll = useCallback(() => {
    setSelectedTasks(selectedTasks.size === filteredTasks.length ? new Set() : new Set(filteredTasks.map((t: Task) => t.id)));
  }, [selectedTasks.size, filteredTasks]);

  const handleBulkAssign = async () => {
    if (!bulkRepresentative.trim()) { toast.error("Selecione um atendente"); return; }
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
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());

        // Detect separator: tab, semicolon, or dash-separated text
        const sep = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(';') ? ';' : null;
        const isStructured = sep !== null;

        let parsed: { title: string; description: string; notes: string }[];

        if (isStructured) {
          // Parse header to find column indices by name (handles all CSV/TSV variants)
          const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
          const header = lines[0].split(sep!).map(normalize);
          const findCol = (...names: string[]) => {
            for (const name of names) {
              const idx = header.findIndex(h => h.includes(name));
              if (idx >= 0) return idx;
            }
            return -1;
          };
          const colCNPJ = findCol('cnpj');
          const colNome = findCol('cliente nome', 'nome');
          const colMun  = findCol('municipio', 'cidade', 'municipio', 'city');
          const colUF   = findCol('uf', ' uf');
          const colFone = findCol('fone', 'telefone', 'whatsapp', 'celular', 'tel', 'contato');
          const colEmail = findCol('email', 'e-mail');
          // 'produto' column — skip 'produto id'
          const colProduto = (() => {
            for (let i = 0; i < header.length; i++) {
              if (header[i] === 'produto' || (header[i].startsWith('produto') && !header[i].includes('id'))) return i;
            }
            return -1;
          })();

          // If no header recognized, try positional detection (CNPJ pattern in col 0 or 1)
          const firstDataRow = lines[1]?.split(';').map(c => c.trim()) ?? [];
          const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/;
          const phonePattern = /\(?\d{2}\)?[\s.]*\d{4,5}[-\s]?\d{4}/;
          let posMode = false;
          let posCNPJ = -1, posNome = -1, posFone = -1, posCity = -1, posUF = -1;
          if (colCNPJ < 0 && firstDataRow.some(c => cnpjPattern.test(c))) {
            posMode = true;
            posCNPJ = firstDataRow.findIndex(c => cnpjPattern.test(c));
            posNome = posCNPJ + 1;
            // find phone by pattern
            posFone = firstDataRow.findIndex(c => phonePattern.test(c));
            // UF = last 2-letter uppercase field
            posUF = [...firstDataRow].reverse().findIndex(c => /^[A-Z]{2}$/.test(c));
            if (posUF >= 0) posUF = firstDataRow.length - 1 - posUF;
            // city = column before UF that is text
            posCity = posUF > 0 ? posUF - 1 : -1;
          }

          // Group rows by CNPJ → one task per unique client
          const clientMap = new Map<string, { cnpj: string; nome: string; cidade: string; uf: string; fone: string; email: string; produtos: Set<string> }>();
          lines.slice(1).forEach(line => {
            if (!line.trim()) return;
            const cols = line.split(sep!).map(c => c.trim().replace(/^["']+|["']+$/g, '').trim());
            const get = (hIdx: number, pIdx: number) => ((posMode ? pIdx : hIdx) >= 0 ? cols[(posMode ? pIdx : hIdx)] ?? '' : '').trim();
            const cnpj  = get(colCNPJ, posCNPJ);
            const nome  = get(colNome, posNome);
            const cidade= get(colMun,  posCity);
            const uf    = get(colUF,   posUF);
            const fone  = get(colFone, posFone);
            const email = colEmail >= 0 ? (cols[colEmail] ?? '').trim() : '';
            const produto = colProduto >= 0 ? (cols[colProduto] ?? '').trim() : '';
            if (!nome && !cnpj) return;
            const key = cnpj || nome;
            if (!clientMap.has(key)) clientMap.set(key, { cnpj, nome, cidade, uf, fone, email, produtos: new Set() });
            const entry = clientMap.get(key)!;
            // update fone/email if found in later rows (some CSVs have it in first occurrence only)
            if (fone && !entry.fone) entry.fone = fone;
            if (email && !entry.email) entry.email = email;
            if (produto) entry.produtos.add(produto);
          });

          parsed = Array.from(clientMap.values()).map(({ cnpj, nome, cidade, uf, fone, email, produtos }) => {
            const prodLines = [...produtos].map(p => `Produto: ${p}`).join('\n');
            const title = [cnpj, nome, fone, email, cidade, uf].filter(Boolean).join(' - ');
            const notes = [
              title,
              prodLines,
              `EMAIL: ${email}`,
              `WHATSAPP: ${fone}`,
              `FONE: ${fone}`,
            ].filter(Boolean).join('\n');
            return { title, description: [cidade, uf].filter(Boolean).join(' - '), notes };
          }).filter(t => t.title);
        } else {
          // Dash-separated format
          parsed = lines.map(parseImportLine).filter(Boolean) as { title: string; description: string; notes: string }[];
        }

        if (parsed.length === 0) { toast.error("Nenhum dado válido encontrado no arquivo"); return; }
        setImportedTasks(parsed);
        setShowImport(true);
        toast.success(`${parsed.length} registros carregados — selecione o atendente para importar`);
      } catch { toast.error("Erro ao processar arquivo"); }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImportTasks = async () => {
    if (!selectedRepresentative) { toast.error("Selecione um atendente"); return; }
    setImportLoading(true);
    let success = 0;
    try {
      const importReminderDate = new Date(Date.now() + 5 * 60 * 1000); // hoje + 5 min
      for (const t of importedTasks) {
        await createMutation.mutateAsync({ clientId: 0, title: t.title, description: t.description, notes: t.notes, reminderDate: importReminderDate, reminderEnabled: true, priority: "medium", assignedTo: selectedRepresentative });
        success++;
      }
      toast.success(`✅ ${success} tarefas importadas com sucesso para ${selectedRepresentative}!`, { duration: 8000 });
      setImportedTasks([]);
      setShowImport(false);
      setSelectedRepresentative("");
      refetch();
    } catch (err: any) {
      toast.error(`Importadas ${success}/${importedTasks.length}. Erro: ${err?.message ?? 'tente novamente'}`);
    } finally {
      setImportLoading(false);
    }
  };

  const handleAiSuggest = async (task: Task) => {
    if (loadingSuggestion) return;
    setLoadingSuggestion(true);
    setAiSuggestion(null);
    try {
      const result = await suggestMutation.mutateAsync({ title: task.title, notes: task.notes || '' });
      setAiSuggestion({ taskId: task.id, text: result.suggestion });
    } catch {
      toast.error("Erro ao gerar sugestão");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const priorityEmoji: Record<string, string> = { low: "🟦", medium: "🟨", high: "🟥" };
  const statusEmoji: Record<string, string> = { pending: "⏳", completed: "✅", cancelled: "❌" };

  if (!user) return <div className="p-4 text-center">Carregando...</div>;

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-4">
      <input type="text" placeholder="🔍 Pesquisar tarefas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm" />

      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="all">Todas</option>
            <option value="pending">Pendentes</option>
            <option value="completed">Concluídas</option>
            <option value="cancelled">Canceladas</option>
          </select>
          {isAdmin && (
            <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="all">👥 Todos</option>
              <option value="__none__">🔑 Admin</option>
              {(attendants as any[]).map((a: any) => <option key={a.id} value={a.name}>👤 {a.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setFilterContact(filterContact === "whatsapp" ? "all" : "whatsapp")}
            className={`px-3 py-2 rounded-lg text-sm border font-medium transition ${filterContact === "whatsapp" ? "bg-green-500 text-white border-green-500" : "bg-white text-gray-700 hover:bg-green-50"}`}
          >
            📱 WhatsApp
          </button>
          <button
            onClick={() => setFilterContact(filterContact === "email" ? "all" : "email")}
            className={`px-3 py-2 rounded-lg text-sm border font-medium transition ${filterContact === "email" ? "bg-blue-500 text-white border-blue-500" : "bg-white text-gray-700 hover:bg-blue-50"}`}
          >
            📧 Email
          </button>
          <button
            onClick={() => setFilterReminder(filterReminder === "active" ? "all" : filterReminder === "all" ? "inactive" : "all")}
            className={`px-3 py-2 rounded-lg text-sm border font-medium transition ${filterReminder === "active" ? "bg-orange-500 text-white border-orange-500" : filterReminder === "inactive" ? "bg-gray-500 text-white border-gray-500" : "bg-white text-gray-700 hover:bg-orange-50"}`}
          >
            {filterReminder === "inactive" ? "🔕 Sem lembrete" : "🔔 Lembrete"}
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isAdmin && selectedTasks.size > 0 && (
            <>
              <select value={bulkRepresentative} onChange={(e) => setBulkRepresentative(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
                <option value="">Atendente...</option>
                {attendants.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
              </select>
              <Button size="sm" onClick={handleBulkAssign} variant="outline">👤 Designar ({selectedTasks.size})</Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>🗑️ Deletar ({selectedTasks.size})</Button>
            </>
          )}
          {isAdmin && <Button onClick={() => setShowImport(!showImport)} variant="outline" size="sm">📤 CSV</Button>}
          <Button onClick={handleOpenNewTask} size="sm">➕ Nova</Button>
        </div>
      </div>

      {isAdmin && showImport && (
        <Card className="border-blue-300 bg-blue-50">
          <CardHeader><CardTitle className="text-base">Importar CSV ou lista de clientes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-gray-600">Suporta CSV com ponto-e-vírgula e listas com traço (nome - telefone - email - cidade - estado).</p>
            <input type="file" accept=".csv,.txt" onChange={handleCSVImport} className="w-full px-3 py-2 border rounded-lg bg-white" />
            {importedTasks.length > 0 && (
              <>
                <div className="bg-white rounded-lg border p-3 max-h-40 overflow-y-auto space-y-1">
                  {importedTasks.slice(0, 10).map((t, i) => (
                    <div key={i} className="text-xs text-gray-700 border-b pb-1">
                      <span className="font-medium">{t.title}</span>
                      {t.notes && <span className="text-gray-500 ml-1">— {t.notes.split('\n')[0]}</span>}
                    </div>
                  ))}
                  {importedTasks.length > 10 && <p className="text-xs text-gray-500">... e mais {importedTasks.length - 10}</p>}
                </div>
                <select value={selectedRepresentative} onChange={(e) => setSelectedRepresentative(e.target.value)} className="w-full px-3 py-2 border rounded-lg">
                  <option value="">Selecionar atendente...</option>
                  {attendants.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
                </select>
                <Button onClick={handleImportTasks} className="w-full" disabled={importLoading}>
                  {importLoading ? `Importando...` : `✅ Importar ${importedTasks.length} tarefas`}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Task Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto mx-4 md:mx-auto">
          <DialogHeader><DialogTitle className="text-base">{editingTask ? "✏️ Editar Tarefa" : "➕ Nova Tarefa"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">Título *</label>
              <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Título da tarefa" className="w-full px-3 py-1.5 border rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">Anotações</label>
              <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Anotações, telefone, email..." className="w-full px-3 py-2 border rounded-lg text-sm" style={{ height: 'clamp(120px, 30vh, 260px)', resize: 'vertical' }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">🗓️ Data</label>
                <input type="date" value={formData.reminderDate} onChange={(e) => setFormData({ ...formData, reminderDate: e.target.value })} className="w-full px-2 py-1.5 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">⏰ Hora</label>
                <input type="time" value={formData.reminderTime} onChange={(e) => setFormData({ ...formData, reminderTime: e.target.value })} className="w-full px-2 py-1.5 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2 bg-blue-50 px-2 py-1.5 rounded-lg">
              <input type="checkbox" id="reminderEnabled" checked={formData.reminderEnabled} onChange={(e) => setFormData({ ...formData, reminderEnabled: e.target.checked })} className="w-3.5 h-3.5" />
              <label htmlFor="reminderEnabled" className="text-xs font-medium text-blue-800">🔔 Ativar notificação no navegador</label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">Prioridade</label>
                <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })} className="w-full px-2 py-1.5 border rounded-lg text-sm">
                  <option value="low">🟦 Baixa</option>
                  <option value="medium">🟨 Média</option>
                  <option value="high">🟥 Alta</option>
                </select>
              </div>
              {isAdmin && (
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-600">👤 Designar para</label>
                  <select value={formData.assignedTo} onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })} className="w-full px-2 py-1.5 border rounded-lg text-sm">
                    <option value="">Nenhum</option>
                    {attendants.map((a: any) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <DialogFooter className="flex gap-2 pt-1">
              <Button type="submit" size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700">{editingTask ? "Atualizar" : "Criar Tarefa"}</Button>
              {editingTask && <Button type="button" size="sm" variant="destructive" onClick={() => handleDelete(editingTask.id)}>🗑️</Button>}
              <Button type="button" size="sm" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }}>Cancelar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reminder Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {[
          { key: "all", label: "📋 Todas" },
          { key: "today", label: "🔔 Hoje" },
          { key: "yesterday", label: "📅 Ontem" },
          { key: "lastWeek", label: "📆 Semana passada" },
          { key: "lastMonth", label: "🗓️ Mês passado" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setReminderTab(tab.key as any)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition ${
              reminderTab === tab.key
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-blue-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
          <div className="flex items-center gap-2 p-2 bg-gray-100 rounded">
            <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
              <input type="checkbox" checked={selectedTasks.size === filteredTasks.length && filteredTasks.length > 0} onChange={handleSelectAll} className="w-5 h-5 cursor-pointer" />
              <span className="text-sm font-medium text-gray-700">Selecionar tudo ({filteredTasks.length})</span>
            </label>
            {selectedTasks.size > 0 && <span className="text-sm text-blue-600 font-medium ml-2">{selectedTasks.size} selecionada(s)</span>}
          </div>
          {filteredTasks.map((task: Task) => (
            <div key={task.id} className="border rounded-lg overflow-hidden shadow-sm">
              <div className="flex items-center gap-2 md:gap-3 p-3 bg-white hover:bg-gray-50 transition cursor-pointer" onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}>
                <label className="flex-shrink-0 p-1 -m-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedTasks.has(task.id)} onChange={() => handleSelectTask(task.id)} className="w-5 h-5 cursor-pointer" />
                </label>
                <div className="flex gap-1 flex-shrink-0">
                  <span>{statusEmoji[task.status || 'pending']}</span>
                  <span>{priorityEmoji[task.priority || 'medium']}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug line-clamp-2 md:truncate">{task.title}</p>
                  <div className="flex gap-2 items-center flex-wrap mt-0.5">
                    {isAdmin && task.assignedTo && <p className="text-xs text-gray-500">👤 {task.assignedTo}</p>}
                    {hasPhone(`${task.title} ${task.notes ?? ''}`) && <span className="text-xs text-green-600">📱</span>}
                    {hasEmail(`${task.title} ${task.notes ?? ''}`) && <span className="text-xs text-blue-600">📧</span>}
                  </div>
                </div>
                {task.reminderDate && task.reminderEnabled && (() => {
                  try {
                    const rd = new Date(task.reminderDate);
                    if (isNaN(rd.getTime())) return null;
                    const now = new Date();
                    const isOverdue = rd < now && task.status === 'pending';
                    const isToday = rd.toDateString() === now.toDateString();
                    const p = (n: number) => String(n).padStart(2, '0');
                    const dateStr = `${p(rd.getDate())}/${p(rd.getMonth() + 1)}`;
                    const timeStr = `${p(rd.getHours())}:${p(rd.getMinutes())}`;
                    return (
                      <div className={`text-xs px-1.5 py-1 rounded-lg text-center flex-shrink-0 font-medium leading-tight ${isOverdue ? 'bg-red-100 text-red-700' : isToday ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        <div>{isOverdue ? '🚨' : isToday ? '⚠️' : '🔔'}</div>
                        <div>{dateStr}</div>
                        <div>{timeStr}</div>
                      </div>
                    );
                  } catch { return null; }
                })()}
              </div>
              {expandedTask === task.id && (
                <div className="p-3 bg-gray-50 border-t space-y-2">
                  {task.notes && <div className="text-sm bg-yellow-50 p-3 rounded border border-yellow-200"><strong>📝 Anotações:</strong><p className="whitespace-pre-wrap mt-2 leading-relaxed">{task.notes}</p></div>}
                  <p className="text-xs text-gray-500">Criada: {new Date(task.createdAt).toLocaleDateString("pt-BR")}</p>
                  {aiSuggestion?.taskId === task.id && (
                    <div className="text-sm bg-purple-50 p-2 rounded border border-purple-200">
                      <strong>🤖 Sugestão de abordagem:</strong>
                      <p className="mt-1 text-gray-700">{aiSuggestion.text}</p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => handleEdit(task)}>✏️ Editar</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(task.id)}>🗑️ Deletar</Button>
                    <Button size="sm" variant="outline" className="text-purple-700 border-purple-300 hover:bg-purple-50" onClick={() => handleAiSuggest(task)} disabled={loadingSuggestion}>
                      {loadingSuggestion && aiSuggestion === null ? "⏳ Gerando..." : "🤖 Sugestão IA"}
                    </Button>
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
