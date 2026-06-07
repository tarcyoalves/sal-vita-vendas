import { useAuth } from '../_core/hooks/useAuth';
import { Link } from 'wouter';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  convertedAt?: Date | string | null;
  contactCount?: number | null;
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

  const [showNotesWarning, setShowNotesWarning] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const [showMonitorBanner, setShowMonitorBanner] = useState(() => sessionStorage.getItem('monitorBannerDismissed') !== '1');
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  // ID da tarefa mais urgente a destacar após salvar
  const [highlightTaskId, setHighlightTaskId] = useState<number | null>(null);
  // Ref para controlar alerta de ociosidade (último contato feito)
  const lastContactTimeRef = useRef<number>(Date.now());

  const { data: tasks = [], isLoading, refetch } = trpc.tasks.list.useQuery();
  const { data: attendants = [] } = trpc.sellers.list.useQuery();
  // staleTime: avoids redundant server calls; session/profile rarely change
  const { data: workSession } = trpc.workSessions.current.useQuery(undefined, { enabled: !isAdmin, staleTime: 60_000 });
  const { data: sellerProfile } = trpc.sellers.myProfile.useQuery(undefined, { enabled: !isAdmin, staleTime: 300_000 });
  const createMutation = trpc.tasks.create.useMutation();
  const updateMutation = trpc.tasks.update.useMutation();
  const deleteMutation = trpc.tasks.delete.useMutation();
  const deleteManyMutation = trpc.tasks.deleteMany.useMutation();
  const toggleConvertedMutation = trpc.tasks.toggleConverted.useMutation();
  const suggestMutation = trpc.ai.suggestSalesApproach.useMutation();

  const [progressTick, setProgressTick] = useState(0);
  useEffect(() => {
    if (!workSession || workSession.status !== 'active') return;
    const id = setInterval(() => setProgressTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  // workSession inteiro: recria o interval se startedAt/pausedMs mudar
  }, [workSession]);

  const dailyProgress = useMemo(() => {
    if (isAdmin) return null;
    const GOAL = 100;
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const contacts = (tasks as any[]).filter(t => t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart).length;
    const pct = Math.min(Math.round((contacts / GOAL) * 100), 100);

    let workedMs = 0;
    if (workSession) {
      const now = Date.now();
      const start = new Date(workSession.startedAt).getTime();
      const end   = workSession.endedAt ? new Date(workSession.endedAt).getTime() : now;
      const paused = workSession.totalPausedMs ?? 0;
      const extraPause = (workSession.status === 'paused' && workSession.pausedAt)
        ? now - new Date(workSession.pausedAt).getTime() : 0;
      workedMs = Math.max(0, end - start - paused - extraPause);
    }
    const goalMs = (sellerProfile?.workHoursGoal ?? 8) * 3600000;
    const hoursPct = Math.min(Math.round((workedMs / goalMs) * 100), 100);
    const h = Math.floor(workedMs / 3600000), mn = Math.floor((workedMs % 3600000) / 60000);

    const color = pct >= 100 ? '#16a34a' : pct >= 60 ? '#2563eb' : pct >= 30 ? '#d97706' : '#dc2626';
    return { contacts, pct, hoursPct, hoursLabel: `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`, color, remaining: GOAL - contacts };
  }, [tasks, workSession, sellerProfile, isAdmin, progressTick]);

  const prevContactsRef = useRef<number>(-1);
  useEffect(() => {
    if (isAdmin || !dailyProgress) return;
    const prev = prevContactsRef.current;
    const cur  = dailyProgress.contacts;
    if (prev < 0) { prevContactsRef.current = cur; return; }
    if (prev < 25  && cur >= 25)  toast.success('🎯 25 contatos! Ótimo começo!');
    if (prev < 50  && cur >= 50)  toast.success('🔥 Metade da meta! 50 contatos!');
    if (prev < 75  && cur >= 75)  toast.success('⚡ 75 contatos! Faltam só 25!');
    if (prev < 100 && cur >= 100) toast.success('🏆 META BATIDA! 100 contatos hoje!', { duration: 6000 });
    prevContactsRef.current = cur;
  }, [dailyProgress?.contacts, isAdmin]);

  // ─── 1. NOTIFICAÇÕES DE LEMBRETE NO HORÁRIO EXATO ──────────────────────────
  // Agenda setTimeout para cada tarefa com lembrete nas próximas 4h.
  // Dispara Notification API nativa — zero custo de servidor.
  const scheduledRemindersRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (isAdmin || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const now = Date.now();
    const fourHours = 4 * 3600_000;
    const timers: ReturnType<typeof setTimeout>[] = [];

    (tasks as any[]).forEach((t: any) => {
      if (!t.reminderDate || t.reminderEnabled === false || t.status !== 'pending') return;
      if (scheduledRemindersRef.current.has(t.id)) return; // já agendado
      const fireAt = new Date(t.reminderDate).getTime();
      const delay  = fireAt - now;
      if (delay <= 0 || delay > fourHours) return; // só agenda os próximos 4h

      scheduledRemindersRef.current.add(t.id);
      timers.push(setTimeout(() => {
        new Notification('🔔 Lembrete Sal Vita', {
          body: t.title,
          icon: '/favicon.ico',
          tag: `reminder-${t.id}`,
        });
        scheduledRemindersRef.current.delete(t.id);
      }, delay));
    });

    return () => timers.forEach(clearTimeout);
  }, [tasks, isAdmin]);

  // ─── 2. ALERTA DE OCIOSIDADE ───────────────────────────────────────────────
  // A cada 15 min verifica se o atendente ainda não registrou nenhum contato.
  // Só dispara se a sessão estiver ativa e tiver tarefas pendentes.
  const IDLE_MS = 15 * 60_000;
  useEffect(() => {
    if (isAdmin) return;
    const id = setInterval(() => {
      if (workSession?.status !== 'active') return;
      const idleMs = Date.now() - lastContactTimeRef.current;
      if (idleMs < IDLE_MS) return;
      const pending = (tasks as any[]).filter(t => t.status === 'pending').length;
      if (pending === 0) return;
      const idleMin = Math.round(idleMs / 60_000);
      toast.warning(
        `⏰ ${idleMin} min sem contatos! Você tem ${pending} tarefa${pending > 1 ? 's' : ''} pendente${pending > 1 ? 's' : ''}.`,
        { duration: 8000, id: 'idle-alert' }
      );
    }, IDLE_MS);
    return () => clearInterval(id);
  }, [isAdmin, tasks, workSession?.status]);

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

  // ─── 3. PRÓXIMA TAREFA URGENTE ────────────────────────────────────────────
  // Após salvar, encontra a tarefa pendente com lembrete mais próximo e destaca.
  const highlightNextUrgent = useCallback((updatedTasks: any[]) => {
    const now = new Date();
    const next = updatedTasks
      .filter(t => t.status === 'pending' && t.reminderDate && t.reminderEnabled !== false)
      .sort((a, b) => new Date(a.reminderDate).getTime() - new Date(b.reminderDate).getTime())
      .find(t => new Date(t.reminderDate) >= now);
    if (next) {
      setHighlightTaskId(next.id);
      setTimeout(() => setHighlightTaskId(null), 6000);
    }
  }, []);

  const doSave = async () => {
    try {
      let reminderDateTime: Date | undefined;
      if (formData.reminderDate && formData.reminderTime) {
        reminderDateTime = new Date(`${formData.reminderDate}T${formData.reminderTime}:00`);
      }
      if (editingTask) {
        const result = await updateMutation.mutateAsync({ id: editingTask.id, title: formData.title, description: formData.description, notes: formData.notes, reminderDate: reminderDateTime, reminderEnabled: formData.reminderEnabled, priority: formData.priority, assignedTo: formData.assignedTo || undefined });
        toast.success("Tarefa atualizada!");
        if (!isAdmin && result.burstWarning) {
          toast.warning(`⚠️ Atenção: ${result.burstCount} contatos registrados em menos de 10 minutos. Certifique-se de que cada anotação representa um contato real — a gestão monitora esse indicador.`, { duration: 12000 });
        }
      } else {
        await createMutation.mutateAsync({ clientId: formData.clientId || 0, title: formData.title, description: formData.description, notes: formData.notes, reminderDate: reminderDateTime, reminderEnabled: formData.reminderEnabled, priority: formData.priority, assignedTo: formData.assignedTo || undefined });
        toast.success("Tarefa criada! Lembrete ativado ✅");
      }
      // Atualiza o timestamp do último contato para o alerta de ociosidade
      if (!isAdmin) lastContactTimeRef.current = Date.now();
      setShowNotesWarning(false);
      resetForm(); setIsModalOpen(false);
      const { data: fresh } = await refetch();
      if (!isAdmin && fresh) highlightNextUrgent(fresh as any[]);
    } catch { toast.error("Erro ao salvar tarefa"); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) { toast.error("Título é obrigatório"); return; }
    if (!formData.reminderDate) { toast.error("📅 Data do lembrete é obrigatória"); return; }
    if (!editingTask && !formData.notes.trim()) {
      setIsModalOpen(false);
      setShowNotesWarning(true);
      return;
    }
    await doSave();
  };

  const handleDelete = async (id: number) => {
    setDeleteConfirm(id);
    setIsModalOpen(false);
  };

  // Marca/desmarca o lead como cliente ativo (conversão = virou venda).
  // Não conclui o lembrete — ele continua recorrente até o atendente decidir parar.
  const handleToggleConverted = async (task: Task, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const willConvert = !task.convertedAt;
    try {
      await toggleConvertedMutation.mutateAsync({ id: task.id, converted: willConvert });
      toast.success(willConvert ? "🎉 Cliente marcado como ativo!" : "Marcação de cliente ativo removida");
      refetch();
    } catch {
      toast.error("Erro ao atualizar conversão");
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirm === null) return;
    if (deleteReason.trim().length < 5) { toast.error("Informe o motivo da exclusão (mínimo 5 caracteres)"); return; }
    try {
      await deleteMutation.mutateAsync({ id: deleteConfirm, reason: deleteReason.trim() });
      toast.success("Tarefa deletada");
      resetForm();
      refetch();
    } catch { toast.error("Erro ao deletar"); }
    finally { setDeleteConfirm(null); setDeleteReason(""); }
  };

  const handleBulkDelete = () => setBulkDeleteConfirm(true);

  const confirmBulkDelete = async () => {
    if (deleteReason.trim().length < 5) { toast.error("Informe o motivo da exclusão (mínimo 5 caracteres)"); return; }
    try {
      await deleteManyMutation.mutateAsync({ ids: Array.from(selectedTasks), reason: deleteReason.trim() });
      toast.success(`${selectedTasks.size} tarefa(s) deletada(s)!`);
      setSelectedTasks(new Set());
      refetch();
    } catch { toast.error("Erro ao deletar tarefas"); }
    finally { setBulkDeleteConfirm(false); setDeleteReason(""); }
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
        if (reminderTab === "overdue") return rd < now && t.reminderEnabled !== false && t.status === 'pending';
        if (reminderTab === "upcoming") return rd >= now && t.reminderEnabled !== false;
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
          const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
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
      {!isAdmin && showMonitorBanner && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 text-sm text-amber-900">
          <span className="text-lg flex-shrink-0 mt-0.5">🔍</span>
          <div className="flex-1">
            <strong>Trabalho monitorado</strong> — anotações, qualidade e velocidade dos contatos são acompanhados diariamente pela gestão.
          </div>
          <button onClick={() => { setShowMonitorBanner(false); sessionStorage.setItem('monitorBannerDismissed', '1'); }} className="text-amber-600 hover:text-amber-900 font-bold text-base leading-none flex-shrink-0 mt-0.5" title="Fechar">✕</button>
        </div>
      )}
      {!isAdmin && 'Notification' in window && Notification.permission === 'default' && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-300 rounded-xl px-4 py-3 text-sm text-blue-900">
          <span className="text-lg flex-shrink-0">🔔</span>
          <div className="flex-1">
            <strong>Ative as notificações</strong> para receber lembretes no horário certo, mesmo com o celular bloqueado.
          </div>
          <button
            onClick={() => Notification.requestPermission()}
            className="flex-shrink-0 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition"
          >
            Ativar
          </button>
        </div>
      )}
      {dailyProgress && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📞</span>
              <span className="text-sm font-semibold text-gray-700">Contatos hoje</span>
              <span className="text-lg font-black" style={{ color: dailyProgress.color }}>{dailyProgress.contacts}</span>
              <span className="text-xs text-gray-400">/ 100</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">⏱</span>
                <span className="text-xs font-semibold text-gray-600">{dailyProgress.hoursLabel}</span>
                {dailyProgress.hoursPct > 0 && (
                  <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-500 rounded-full transition-all" style={{ width: `${dailyProgress.hoursPct}%` }} />
                  </div>
                )}
              </div>
              <span className="text-sm font-bold" style={{ color: dailyProgress.color }}>{dailyProgress.pct}%</span>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${dailyProgress.pct}%`, backgroundColor: dailyProgress.color }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            {dailyProgress.contacts >= 100 ? (
              <p className="text-xs text-green-600 font-semibold">🏆 Meta atingida! Excelente trabalho!</p>
            ) : (
              <p className="text-xs text-gray-400">Faltam <strong>{dailyProgress.remaining}</strong> contatos para a meta de hoje</p>
            )}
            <Link href="/meu-progresso" className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 shrink-0 ml-3">
              📊 Ver meu desempenho
            </Link>
          </div>
        </div>
      )}

      <input type="text" placeholder="🔍 Pesquisar tarefas..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-2.5 border rounded-lg text-sm" />

      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
            <option value="all">Todas</option>
            <option value="pending">Ativas</option>
          </select>
          {isAdmin && (
            <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
              <option value="all">👥 Todos</option>
              <option value="__none__">🔑 Sem atendente</option>
              {user?.name && <option value={user.name}>👑 {user.name}</option>}
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
                {user?.name && <option value={user.name}>👑 {user.name}</option>}
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
                  {user?.name && <option value={user.name}>👑 {user.name}</option>}
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
              <textarea ref={notesRef} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Anotações, telefone, email..." className="w-full px-3 py-2 border rounded-lg text-sm" style={{ height: 'clamp(120px, 30vh, 260px)', resize: 'vertical' }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">🗓️ Data <span className="text-red-500">*</span></label>
                <input type="date" value={formData.reminderDate} onChange={(e) => setFormData({ ...formData, reminderDate: e.target.value })} className={`w-full px-2 py-1.5 border rounded-lg text-sm ${!formData.reminderDate ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} required />
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
                    {user?.name && <option value={user.name}>👑 {user.name}</option>}
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
          { key: "all",       label: "📋 Todas",           cls: "bg-blue-600 border-blue-600" },
          { key: "overdue",   label: "🚨 Atrasados",        cls: "bg-red-600 border-red-600" },
          { key: "upcoming",  label: "📅 Agendados",        cls: "bg-green-600 border-green-600" },
          { key: "today",     label: "🔔 Hoje",             cls: "bg-blue-600 border-blue-600" },
          { key: "yesterday", label: "📆 Ontem",            cls: "bg-blue-600 border-blue-600" },
          { key: "lastWeek",  label: "📆 Semana passada",   cls: "bg-blue-600 border-blue-600" },
          { key: "lastMonth", label: "🗓️ Mês passado",      cls: "bg-blue-600 border-blue-600" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setReminderTab(tab.key as any)}
            className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition ${
              reminderTab === tab.key
                ? `${tab.cls} text-white`
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
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
            <div key={task.id} className={`border rounded-lg overflow-hidden shadow-sm transition-all duration-300 ${highlightTaskId === task.id ? 'ring-2 ring-blue-500 ring-offset-1 shadow-blue-200 shadow-md' : ''}`}
              style={highlightTaskId === task.id ? { animation: 'pulse-highlight 1s ease-in-out 3' } : {}}>
              <div className="flex items-center gap-2 md:gap-3 p-3 bg-white hover:bg-gray-50 transition cursor-pointer" onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}>
                <label className="flex-shrink-0 p-1 -m-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedTasks.has(task.id)} onChange={() => handleSelectTask(task.id)} className="w-5 h-5 cursor-pointer" />
                </label>
                <div className="flex gap-1 flex-shrink-0">
                  <span>{statusEmoji[task.status || 'pending']}</span>
                  <span>{priorityEmoji[task.priority || 'medium']}</span>
                  {task.convertedAt && <span title="Cliente ativo">🎉</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug line-clamp-2 md:truncate">{task.title}</p>
                  <div className="flex gap-2 items-center flex-wrap mt-0.5">
                    {isAdmin && task.assignedTo && <p className="text-xs text-gray-500">👤 {task.assignedTo}</p>}
                    {hasPhone(`${task.title} ${task.notes ?? ''}`) && <span className="text-xs text-green-600">📱</span>}
                    {hasEmail(`${task.title} ${task.notes ?? ''}`) && <span className="text-xs text-blue-600">📧</span>}
                    {task.convertedAt && <span className="text-xs text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">🎉 Cliente ativo</span>}
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
                  <p className="text-xs text-gray-500">
                    Criada: {new Date(task.createdAt).toLocaleDateString("pt-BR")}
                    {!!task.contactCount && ` · 📞 ${task.contactCount} contato(s)`}
                    {task.convertedAt && ` · 🎉 Cliente ativo desde ${new Date(task.convertedAt).toLocaleDateString("pt-BR")}`}
                  </p>
                  {aiSuggestion?.taskId === task.id && (
                    <div className="text-sm bg-purple-50 p-2 rounded border border-purple-200">
                      <strong>🤖 Sugestão de abordagem:</strong>
                      <p className="mt-1 text-gray-700">{aiSuggestion.text}</p>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant={task.convertedAt ? "outline" : "default"}
                      className={task.convertedAt ? "text-emerald-700 border-emerald-300 hover:bg-emerald-50" : "bg-emerald-600 hover:bg-emerald-700 text-white"}
                      onClick={(e) => handleToggleConverted(task, e)}
                      disabled={toggleConvertedMutation.isPending}
                    >
                      {task.convertedAt ? "🎉 Cliente ativo — desmarcar" : "🎉 Marcar como Cliente Ativo"}
                    </Button>
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

      {/* Delete confirmation modal */}
      {(deleteConfirm !== null || bulkDeleteConfirm) && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">🗑️</div>
              <h3 className="text-base font-bold text-gray-800">Confirmar exclusão</h3>
              <p className="text-sm text-gray-500 mt-1">
                {bulkDeleteConfirm
                  ? `Deletar ${selectedTasks.size} tarefa(s) selecionada(s)?`
                  : "Tem certeza que deseja deletar esta tarefa?"}
              </p>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Motivo da exclusão <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                rows={3}
                placeholder="Descreva o motivo (ex: tarefa duplicada, cliente cancelou...)"
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                maxLength={500}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-0.5 text-right">{deleteReason.length}/500</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setBulkDeleteConfirm(false); setDeleteReason(""); }}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={bulkDeleteConfirm ? confirmBulkDelete : confirmDelete}
                disabled={deleteReason.trim().length < 5}
                className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition"
              >
                Deletar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes warning modal */}
      {showNotesWarning && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-y-auto max-h-[92vh]">
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="px-6 pt-4 pb-6 space-y-5">
              {/* Header */}
              <div className="text-center">
                <div className="text-4xl mb-2">📋</div>
                <h3 className="text-lg font-bold text-gray-800">Anotou as informações importantes?</h3>
                <p className="text-xs text-gray-400 mt-1">Contato recorrente — cada conversa deve ser documentada.</p>
              </div>

              {/* Checklist */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">Lembre de registrar:</p>
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">🧂</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Tipo de sal</p>
                    <p className="text-xs text-gray-500">Refinado, grosso, marinho, industrial…</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">📦</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Volume e frequência</p>
                    <p className="text-xs text-gray-500">Ex.: 1.200 sacos/mês de 25kg, pedido trimestral / mensal…</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">🏷️</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Marca atual</p>
                    <p className="text-xs text-gray-500">Qual fornecedor está usando hoje?</p>
                  </div>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowNotesWarning(false);
                    setIsModalOpen(true); // reopen Dialog so user can edit notes
                    setTimeout(() => notesRef.current?.focus(), 200);
                  }}
                  className="w-full py-4 bg-blue-600 active:bg-blue-800 hover:bg-blue-700 text-white text-base font-bold rounded-2xl transition-all active:scale-[0.98] shadow-md"
                >
                  Voltar e Anotar
                </button>
                <button
                  onClick={doSave}
                  className="w-full py-3.5 bg-green-50 active:bg-green-100 hover:bg-green-100 text-green-700 text-sm font-semibold rounded-2xl border border-green-200 transition-all active:scale-[0.98]"
                >
                  Já documentei — Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
