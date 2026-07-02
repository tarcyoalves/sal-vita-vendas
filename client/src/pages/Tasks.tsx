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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '../components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '../components/ui/dropdown-menu';
import { OrderDialog } from '../components/faturamento/OrderDialog';
import { InvoiceDialog } from '../components/faturamento/InvoiceDialog';
import { DeleteOrderDialog } from '../components/faturamento/DeleteOrderDialog';
import { useFatStore } from '../lib/faturamento/store';
import { totalPedido, formatBRL } from '../lib/faturamento/calc';
import type { Pedido } from '../lib/faturamento/types';

interface Task {
  id: number;
  userId: number;
  clientId: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  email?: string | null;
  emailConfirmed?: boolean | null;
  tags?: string[] | null;
  reminderDate?: Date | null;
  reminderEnabled?: boolean | null;
  status?: "pending" | "completed" | "cancelled" | null;
  priority?: "low" | "medium" | "high" | null;
  assignedTo?: string | null;
  convertedAt?: Date | string | null;
  hotLead?: boolean | null;
  lastEngagementAt?: Date | string | null;
  contactCount?: number | null;
  cnpj?: string | null;
  phone?: string | null;
  orderValue?: string | null;
  orderId?: string | null;
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

// Extracts the first phone number found in a string, returning only digits (or null)
function extractPhone(text: string): string | null {
  const m = text.match(/\(?\d{2}\)?[\s.]*\d{4,5}[-\s]?\d{4}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
}

// Extracts the first email found in a string (or null)
function extractEmail(text: string): string | null {
  const m = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  return m ? m[0] : null;
}

// Builds a wa.me link from a Brazilian phone number, adding the 55 country code if missing
function waLink(digits: string): string {
  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

// Normaliza telefone para casar com o backend (somente dígitos, sem DDI 55) —
// usado para detectar reimportação de leads já excluídos.
function normalizePhoneDigits(digits: string): string {
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return digits.slice(2);
  }
  return digits;
}

// Sellers created before dailyGoal was wired up still carry the old default of 10
// while the gamification has always targeted 100 — treat 10 as "not customized".
function effectiveDailyGoal(dailyGoal?: number | null): number {
  return dailyGoal && dailyGoal !== 10 ? dailyGoal : 100;
}

// Parser for dash-separated customer records
// Handles: NOME - EMPRESA - (DD)NNNN-NNNN - email - CIDADE - UF
function parseImportLine(line: string): { title: string; description: string; notes: string; cnpj?: string; phone?: string } | null {
  const raw = line.replace(/^[-\s]+/, '').trim();
  if (!raw || raw.length < 3) return null;

  const emailRx = /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi;
  const emails = [...new Set(raw.match(emailRx) ?? [])];

  // CNPJ, se houver, para detectar reimportação de leads já excluídos
  const cnpjMatch = raw.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const cnpj = cnpjMatch ? cnpjMatch[0].replace(/\D/g, '') : undefined;

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
  const phoneDigits = titlePhone.replace(/\D/g, '');
  return {
    title: fullTitle,
    description: [city, state].filter(Boolean).join(' - '),
    notes: noteLines.join('\n'),
    cnpj,
    phone: phoneDigits ? normalizePhoneDigits(phoneDigits) : undefined,
  };
}

export default function Tasks() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const utils = trpc.useUtils();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterContact, setFilterContact] = useState<"all" | "whatsapp" | "email">("all");
  const [filterReminder, setFilterReminder] = useState<"all" | "active" | "inactive">("all");
  const [filterConverted, setFilterConverted] = useState<"all" | "active_clients" | "leads">("all");
  const [filterHot, setFilterHot] = useState(false);
  const [reminderTab, setReminderTab] = useState<"all" | "today" | "yesterday" | "lastWeek" | "lastMonth">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [importedTasks, setImportedTasks] = useState<{ title: string; description: string; notes: string; cnpj?: string; phone?: string }[]>([]);
  const [importSkipped, setImportSkipped] = useState(0);
  const [selectedRepresentative, setSelectedRepresentative] = useState("");
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
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
  const [convertModalTask, setConvertModalTask] = useState<Task | null>(null);
  // Faturamento: order dialog + invoice dialog
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderDialogTask, setOrderDialogTask] = useState<Task | null>(null);
  const [editingPedidoId, setEditingPedidoId] = useState<string | null>(null);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoicePedidoId, setInvoicePedidoId] = useState<string | null>(null);
  const [deleteOrderDialogOpen, setDeleteOrderDialogOpen] = useState(false);
  const [deleteOrderPedidoId, setDeleteOrderPedidoId] = useState<string | null>(null);
  const { pedidos: allPedidos, comissoes: fatComissoes } = useFatStore();
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
  // Fetch full task (incl. notes/description) only when a specific task is expanded
  const { data: fullTask } = trpc.tasks.getById.useQuery(
    { id: expandedTaskId! },
    { enabled: !!expandedTaskId }
  );

  // ── E-mail Marketing: add task(s) to a draft campaign ──────────────────────
  const [campaignPickerTaskIds, setCampaignPickerTaskIds] = useState<number[] | null>(null);
  const { data: hotLeadsData } = trpc.emailMarketing.hotLeadsCount.useQuery();
  const { data: emailCampaigns } = trpc.emailMarketing.listCampaigns.useQuery(undefined, { enabled: campaignPickerTaskIds !== null });
  const addToCampaignMutation = trpc.emailMarketing.addRecipientsFromTasks.useMutation();
  const draftCampaigns = (emailCampaigns ?? []).filter(c => c.status === 'draft');

  const handleAddToCampaign = async (campaignId: number) => {
    if (!campaignPickerTaskIds) return;
    try {
      const res = await addToCampaignMutation.mutateAsync({ campaignId, taskIds: campaignPickerTaskIds });
      const skipped = res.skippedNoEmail + res.skippedDuplicateOrSuppressed + (res.skippedUnconfirmed ?? 0);
      toast.success(`✅ ${res.added} adicionado(s) à campanha` + (skipped > 0 ? ` (${skipped} ignorado(s): sem e-mail, não-confirmado, duplicado ou descadastrado)` : ''));
      if (res.skippedUnconfirmed > 0) toast.warning(`✉️ ${res.skippedUnconfirmed} lead(s) ignorado(s) por e-mail não confirmado. Confirme o e-mail na tarefa antes de usá-lo.`, { duration: 9000 });
      setCampaignPickerTaskIds(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao adicionar à campanha");
    }
  };

  // ── Tags: admin-curated catalog, attendants pick from a selector ────────────
  const { data: tagCatalog = [] } = trpc.tags.list.useQuery();
  const availableTags = useMemo(() => tagCatalog.map(t => t.name), [tagCatalog]);
  const tagColorMap = useMemo(() => new Map(tagCatalog.map(t => [t.name, t.color])), [tagCatalog]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const toggleTag = (name: string) => {
    setFormData(f => f.tags.includes(name)
      ? { ...f, tags: f.tags.filter(t => t !== name) }
      : { ...f, tags: [...f.tags, name] });
  };

  const removeTag = (tag: string) => {
    setFormData(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  };

  // ── E-mail Marketing: permission check ──────────────────────────────────────
  const canEmailMarketing = isAdmin || (sellerProfile?.emailMarketingEnabled ?? false);

  // ── E-mail Marketing: enroll task(s) in a sequence ──────────────────────────
  const [sequencePickerTaskIds, setSequencePickerTaskIds] = useState<number[] | null>(null);
  const { data: emailSequencesAdmin } = trpc.emailMarketing.listSequences.useQuery(undefined, { enabled: isAdmin && sequencePickerTaskIds !== null });
  const { data: emailSequencesAtt } = trpc.emailMarketing.listSequencesForAttendant.useQuery(undefined, { enabled: !isAdmin && canEmailMarketing && sequencePickerTaskIds !== null });
  const activeSequences = isAdmin
    ? (emailSequencesAdmin ?? []).filter(s => s.active)
    : (emailSequencesAtt ?? []);
  const enrollInSequenceMutation = trpc.emailMarketing.enrollTasksInSequence.useMutation();
  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);

  const handleEnrollInSequence = async () => {
    if (!sequencePickerTaskIds || !selectedSequenceId) return;
    try {
      const res = await enrollInSequenceMutation.mutateAsync({ sequenceId: selectedSequenceId, taskIds: sequencePickerTaskIds });
      const skipped = res.skippedNoEmail + res.skippedDuplicateOrSuppressed + (res.skippedUnconfirmed ?? 0);
      if (res.enrolled > 0) {
        toast.success(`✅ ${res.enrolled} inscrito(s) na sequência`);
      }
      if (skipped > 0 && (res as any).skipReasons?.length) {
        toast.error(`${skipped} ignorado(s):\n${(res as any).skipReasons.join('\n')}`, { duration: 12000 });
      } else if (skipped > 0) {
        toast.error(`${skipped} ignorado(s): sem e-mail, não-confirmado, duplicado ou descadastrado`);
      }
      if (res.skippedUnconfirmed > 0) toast.warning(`✉️ ${res.skippedUnconfirmed} lead(s) com e-mail não confirmado — confirme na tarefa antes.`, { duration: 9000 });
      setSequencePickerTaskIds(null);
      setSelectedSequenceId(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao inscrever na sequência");
    }
  };


  // ── E-mail Marketing: tag filter ────────────────────────────────────────────
  const [filterTag, setFilterTag] = useState<string>("all");

  const [progressTick, setProgressTick] = useState(0);
  useEffect(() => {
    if (!workSession || workSession.status !== 'active') return;
    const id = setInterval(() => setProgressTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  // workSession inteiro: recria o interval se startedAt/pausedMs mudar
  }, [workSession]);

  const dailyProgress = useMemo(() => {
    if (isAdmin) return null;
    const GOAL = effectiveDailyGoal(sellerProfile?.dailyGoal);
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
    return { contacts, pct, hoursPct, hoursLabel: `${String(h).padStart(2,'0')}:${String(mn).padStart(2,'0')}`, color, remaining: GOAL - contacts, goal: GOAL };
  }, [tasks, workSession, sellerProfile, isAdmin, progressTick]);

  const prevContactsRef = useRef<number>(-1);
  useEffect(() => {
    if (isAdmin || !dailyProgress) return;
    const prev = prevContactsRef.current;
    const cur  = dailyProgress.contacts;
    if (prev < 0) { prevContactsRef.current = cur; return; }
    const goal = effectiveDailyGoal(sellerProfile?.dailyGoal);
    const q1 = Math.round(goal * 0.25), half = Math.round(goal * 0.5), q3 = Math.round(goal * 0.75);
    if (prev < q1   && cur >= q1)   toast.success(`🎯 ${q1} contatos! Ótimo começo!`);
    if (prev < half && cur >= half) toast.success(`🔥 Metade da meta! ${half} contatos!`);
    if (prev < q3   && cur >= q3)   toast.success(`⚡ ${q3} contatos! Faltam só ${goal - q3}!`);
    if (prev < goal && cur >= goal) toast.success(`🏆 META BATIDA! ${goal} contatos hoje!`, { duration: 6000 });
    prevContactsRef.current = cur;
  }, [dailyProgress?.contacts, isAdmin, sellerProfile?.dailyGoal]);

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
    email: string;
    tags: string[];
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
    email: "",
    tags: [],
    reminderDate: "",
    reminderTime: "09:00",
    reminderEnabled: true,
    priority: "medium",
    assignedTo: "",
  });

  const resetForm = useCallback(() => {
    setFormData({ clientId: 0, title: "", description: "", notes: "", email: "", tags: [], reminderDate: "", reminderTime: "09:00", reminderEnabled: true, priority: "medium", assignedTo: "" });
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

  const doSave = async (overrides?: { reminderDate: string; reminderTime: string }) => {
    try {
      const reminderDateStr = overrides?.reminderDate ?? formData.reminderDate;
      const reminderTimeStr = overrides?.reminderTime ?? formData.reminderTime;
      let reminderDateTime: Date | undefined;
      if (reminderDateStr && reminderTimeStr) {
        reminderDateTime = new Date(`${reminderDateStr}T${reminderTimeStr}:00`);
      }
      if (editingTask) {
        // E-mail digitado/alterado à mão = confirmado. Se não mudou, não mexe na
        // confirmação (passa undefined) — evita confirmar importados num save qualquer.
        const trimmedEmail = (formData.email || '').trim().toLowerCase();
        const originalEmail = (editingTask.email || '').trim().toLowerCase();
        const emailConfirmed = trimmedEmail && trimmedEmail !== originalEmail ? true : undefined;
        const result = await updateMutation.mutateAsync({ id: editingTask.id, title: formData.title, description: formData.description, notes: formData.notes, email: formData.email, tags: formData.tags, reminderDate: reminderDateTime, reminderEnabled: formData.reminderEnabled, priority: formData.priority, assignedTo: formData.assignedTo || undefined, emailConfirmed });
        toast.success("Tarefa atualizada!");
        if (!isAdmin && result.burstWarning) {
          toast.warning(`⚠️ Atenção: ${result.burstCount} contatos registrados em menos de 10 minutos. Certifique-se de que cada anotação representa um contato real — a gestão monitora esse indicador.`, { duration: 12000 });
        }
      } else {
        if (!reminderDateTime) { toast.error("📅 Data do lembrete é obrigatória"); return; }
        await createMutation.mutateAsync({ clientId: formData.clientId || 0, title: formData.title, description: formData.description, notes: formData.notes, email: formData.email, tags: formData.tags, reminderDate: reminderDateTime, reminderEnabled: formData.reminderEnabled, priority: formData.priority, assignedTo: formData.assignedTo || undefined });
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

  // Atalho: ajusta a data/hora do lembrete (30min ou amanhã, mantendo a hora atual) e já salva.
  const handleQuickReminder = async (mode: '30min' | 'tomorrow') => {
    if (!formData.title.trim()) { toast.error("Título é obrigatório"); return; }
    if (tagCatalog.length > 0 && formData.tags.length === 0) { toast.error("🏷️ Selecione ao menos uma tag"); return; }
    const target = new Date();
    if (mode === '30min') target.setMinutes(target.getMinutes() + 30);
    else target.setDate(target.getDate() + 1);
    const p = (n: number) => String(n).padStart(2, '0');
    const reminderDate = `${target.getFullYear()}-${p(target.getMonth() + 1)}-${p(target.getDate())}`;
    const reminderTime = `${p(target.getHours())}:${p(target.getMinutes())}`;
    setFormData(prev => ({ ...prev, reminderDate, reminderTime }));
    await doSave({ reminderDate, reminderTime });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) { toast.error("Título é obrigatório"); return; }
    if (!formData.reminderDate) { toast.error("📅 Data do lembrete é obrigatória"); return; }
    if (tagCatalog.length > 0 && formData.tags.length === 0) { toast.error("🏷️ Selecione ao menos uma tag"); return; }
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
    if (!task.convertedAt) {
      setConvertModalTask(task);
      return;
    }
    try {
      await toggleConvertedMutation.mutateAsync({ id: task.id, converted: false });
      toast.success("Marcação de cliente ativo removida (tag \"ativo\" retirada)");
      refetch();
    } catch {
      toast.error("Erro ao atualizar conversão");
    }
  };

  const confirmConvert = async () => {
    if (!convertModalTask) return;
    try {
      await toggleConvertedMutation.mutateAsync({ id: convertModalTask.id, converted: true });
      toast.success("🎉 Cliente marcado como ativo! Tag \"ativo\" aplicada para o e-mail marketing.");
      const taskForOrder = convertModalTask;
      setConvertModalTask(null);
      refetch();
      // Open order dialog for the converted task (attendants only — admins skip)
      if (sellerProfile) {
        setOrderDialogTask(taskForOrder);
        setOrderDialogOpen(true);
      }
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
    if (filterConverted === "active_clients") {
      result = result.filter(t => !!t.convertedAt);
    } else if (filterConverted === "leads") {
      result = result.filter(t => !t.convertedAt);
    }
    if (filterTag !== "all") {
      result = result.filter(t => t.tags?.includes(filterTag));
    }
    if (filterHot) {
      result = result.filter(t => t.hotLead);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || t.assignedTo?.toLowerCase().includes(q));
    }

    // Sort: hot leads first, then upcoming reminders (soonest), then overdue (most recent), then no reminder
    return [...result].sort((a, b) => {
      if (!!a.hotLead !== !!b.hotLead) return a.hotLead ? -1 : 1;
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
  }, [tasks, filterStatus, filterAssignee, filterContact, filterReminder, filterConverted, filterTag, filterHot, reminderTab, isAdmin, searchQuery]);

  // ── E-mail Marketing: engagement badges (single batched query for visible tasks) ──
  const visibleTaskIds = useMemo(() => filteredTasks.map((t: Task) => t.id), [filteredTasks]);
  const { data: engagementData } = trpc.emailMarketing.engagementByTaskIds.useQuery(
    { taskIds: visibleTaskIds },
    { enabled: visibleTaskIds.length > 0 }
  );

  // ── E-mail Marketing: campanhas/sequências em que o lead está inscrito ──
  const { data: enrollmentsData } = trpc.emailMarketing.enrollmentsByTaskIds.useQuery(
    { taskIds: visibleTaskIds },
    { enabled: visibleTaskIds.length > 0 }
  );
  const cancelEnrollmentMutation = trpc.emailMarketing.cancelEnrollment.useMutation();
  const removeCampaignRecipientMutation = trpc.emailMarketing.removeCampaignRecipient.useMutation();

  const handleCancelEnrollment = useCallback(async (enrollmentId: number) => {
    if (!confirm("Remover este lead da sequência?")) return;
    try {
      await cancelEnrollmentMutation.mutateAsync({ id: enrollmentId });
      await utils.emailMarketing.enrollmentsByTaskIds.invalidate();
      toast.success("Inscrição cancelada");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao cancelar inscrição");
    }
  }, [cancelEnrollmentMutation]);

  const handleRemoveCampaignRecipient = useCallback(async (recipientId: number) => {
    if (!confirm("Remover este lead da campanha?")) return;
    try {
      await removeCampaignRecipientMutation.mutateAsync({ id: recipientId });
      await utils.emailMarketing.enrollmentsByTaskIds.invalidate();
      toast.success("Removido da campanha");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao remover da campanha");
    }
  }, [removeCampaignRecipientMutation]);

  // Confirma manualmente o e-mail de um lead importado — só após isso ele pode
  // ser usado em campanhas/sequências/automações. Fluxo em dois passos com
  // diálogos (em vez de confirm() nativo): 1) confirma o e-mail, 2) oferece
  // incluir a tarefa numa sequência na hora — evita o atendente ter que achar
  // o botão "Inscrever em sequência" separadamente depois.
  const confirmEmailMutation = trpc.tasks.confirmEmail.useMutation();
  const [confirmEmailTarget, setConfirmEmailTarget] = useState<{ id: number; email: string } | null>(null);
  const [justConfirmedTaskId, setJustConfirmedTaskId] = useState<number | null>(null);

  const handleConfirmEmail = useCallback((taskId: number, email?: string | null) => {
    setConfirmEmailTarget({ id: taskId, email: email ?? '' });
  }, []);

  const confirmEmailNow = useCallback(async () => {
    if (!confirmEmailTarget) return;
    const taskId = confirmEmailTarget.id;
    try {
      await confirmEmailMutation.mutateAsync({ id: taskId });
      setEditingTask(prev => (prev && prev.id === taskId ? { ...prev, emailConfirmed: true } : prev));
      await refetch();
      setConfirmEmailTarget(null);
      toast.success("✅ E-mail confirmado — já pode ser usado para e-mail marketing");
      if (canEmailMarketing) setJustConfirmedTaskId(taskId);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao confirmar e-mail");
    }
  }, [confirmEmailTarget, confirmEmailMutation, canEmailMarketing]);

  const handleEdit = useCallback((task: Task) => {
    setEditingTask(task);
    const d = task.reminderDate ? new Date(task.reminderDate) : null;
    const reminderDate = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : "";
    const reminderTime = d
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : "09:00";
    // Use fullTask (from getById) for notes/description when available, since
    // tasks.list no longer returns those heavy columns.
    const taskNotes = (fullTask?.id === task.id ? fullTask.notes : task.notes) || "";
    const taskDesc = (fullTask?.id === task.id ? fullTask.description : task.description) || "";
    setFormData({ clientId: task.clientId, title: task.title, description: taskDesc, notes: taskNotes, email: task.email || "", tags: task.tags ?? [], reminderDate, reminderTime, reminderEnabled: task.reminderEnabled ?? true, priority: (task.priority as "low" | "medium" | "high") || "medium", assignedTo: task.assignedTo || "" });
    setIsModalOpen(true);
  }, [fullTask]);

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
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());

        // Detect separator: tab, semicolon, or dash-separated text
        const sep = lines[0]?.includes('\t') ? '\t' : lines[0]?.includes(';') ? ';' : null;
        const isStructured = sep !== null;

        let parsed: { title: string; description: string; notes: string; cnpj?: string; phone?: string }[];

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
            const cnpjDigits = cnpj.replace(/\D/g, '');
            const foneDigits = fone.replace(/\D/g, '');
            return {
              title,
              description: [cidade, uf].filter(Boolean).join(' - '),
              notes,
              cnpj: cnpjDigits || undefined,
              phone: foneDigits.length >= 10 ? normalizePhoneDigits(foneDigits) : undefined,
            };
          }).filter(t => t.title);
        } else {
          // Dash-separated format
          parsed = lines.map(parseImportLine).filter(Boolean) as { title: string; description: string; notes: string }[];
        }

        if (parsed.length === 0) { toast.error("Nenhum dado válido encontrado no arquivo"); return; }

        // Verifica se algum CNPJ/telefone já corresponde a um lead excluído antes —
        // evita reimportar quem o atendente já removeu.
        let toImport = parsed;
        let skipped = 0;
        try {
          const matches = await utils.tasks.checkCancelledMatches.fetch({
            items: parsed.map(t => ({ cnpj: t.cnpj, phone: t.phone })),
          });
          const cnpjSet = new Set(matches.cnpjs);
          const phoneSet = new Set(matches.phones);
          if (cnpjSet.size > 0 || phoneSet.size > 0) {
            toImport = parsed.filter(t => !((t.cnpj && cnpjSet.has(t.cnpj)) || (t.phone && phoneSet.has(t.phone))));
            skipped = parsed.length - toImport.length;
          }
        } catch {
          // Se a verificação falhar, segue com a importação normal (sem bloquear o atendente)
        }

        if (toImport.length === 0) { toast.error(`Todos os ${parsed.length} registros já foram excluídos anteriormente — nada a importar.`); return; }
        setImportedTasks(toImport);
        setImportSkipped(skipped);
        setShowImport(true);
        toast.success(
          skipped > 0
            ? `${toImport.length} registros carregados (${skipped} ignorados — já excluídos antes) — selecione o atendente para importar`
            : `${toImport.length} registros carregados — selecione o atendente para importar`
        );
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
        await createMutation.mutateAsync({ clientId: 0, title: t.title, description: t.description, notes: t.notes, reminderDate: importReminderDate, reminderEnabled: true, priority: "medium", assignedTo: selectedRepresentative, cnpj: t.cnpj, phone: t.phone });
        success++;
      }
      toast.success(`✅ ${success} tarefas importadas com sucesso para ${selectedRepresentative}!`, { duration: 8000 });
      setImportedTasks([]);
      setImportSkipped(0);
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
      const notesForAi = (fullTask?.id === task.id ? fullTask.notes : task.notes) || '';
      const result = await suggestMutation.mutateAsync({ title: task.title, notes: notesForAi });
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
              <span className="text-xs text-gray-400">/ {dailyProgress.goal}</span>
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
            {dailyProgress.contacts >= dailyProgress.goal ? (
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
          <select
            value={filterConverted}
            onChange={(e) => setFilterConverted(e.target.value as "all" | "active_clients" | "leads")}
            className={`px-3 py-2 border rounded-lg text-sm font-medium ${filterConverted === "active_clients" ? "bg-emerald-500 text-white border-emerald-500" : filterConverted === "leads" ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700"}`}
            title="Filtrar por situação do cliente"
          >
            <option value="all">🎯 Todos (leads + clientes)</option>
            <option value="active_clients">🎉 Só clientes ativos</option>
            <option value="leads">🌱 Só leads (não convertidos)</option>
          </select>
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className={`px-3 py-2 border rounded-lg text-sm font-medium ${filterTag !== "all" ? "bg-indigo-500 text-white border-indigo-500" : "bg-white text-gray-700"}`}
            title="Filtrar por tag"
          >
            <option value="all">🏷️ Todas as tags</option>
            {availableTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
          </select>
          {!!hotLeadsData?.count && (
            <button
              onClick={() => setFilterHot(h => !h)}
              className={`px-3 py-2 rounded-lg text-sm border font-medium transition ${filterHot ? "bg-red-500 text-white border-red-500" : "bg-white text-red-600 border-red-200 hover:bg-red-50"}`}
              title="Leads que abriram ou clicaram em e-mails recentemente"
            >
              🔥 {filterHot ? "Só quentes" : `${hotLeadsData.count} quente${hotLeadsData.count === 1 ? "" : "s"}`}
            </button>
          )}
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
              <Button size="sm" variant="outline" onClick={() => setCampaignPickerTaskIds(Array.from(selectedTasks))}>📧 Campanha ({selectedTasks.size})</Button>
              <Button size="sm" variant="outline" onClick={() => setSequencePickerTaskIds(Array.from(selectedTasks))}>🔁 Sequência ({selectedTasks.size})</Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>🗑️ Deletar ({selectedTasks.size})</Button>
            </>
          )}
          {!isAdmin && canEmailMarketing && selectedTasks.size > 0 && (
            <Button size="sm" variant="outline" onClick={() => setSequencePickerTaskIds(Array.from(selectedTasks))}>🔁 Sequência ({selectedTasks.size})</Button>
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
                {importSkipped > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                    ⚠️ {importSkipped} registro{importSkipped > 1 ? 's' : ''} ignorado{importSkipped > 1 ? 's' : ''} — já {importSkipped > 1 ? 'foram excluídos' : 'foi excluído'} anteriormente.
                  </p>
                )}
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
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">📧 E-mail (e-mail marketing)</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="cliente@exemplo.com" className="w-full px-3 py-1.5 border rounded-lg text-sm" />
              {editingTask?.email && !editingTask.emailConfirmed && (
                (formData.email || '').trim().toLowerCase() !== (editingTask.email || '').trim().toLowerCase()
                  ? <p className="mt-1 text-xs text-green-700">✓ E-mail alterado — será confirmado ao salvar.</p>
                  : (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-amber-700">⚠️ E-mail não confirmado — não será usado em e-mail marketing.</span>
                      <button type="button" onClick={() => handleConfirmEmail(editingTask.id, editingTask.email)} className="px-2 py-0.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700">✓ Confirmar agora</button>
                    </div>
                  )
              )}
              {editingTask?.email && editingTask.emailConfirmed && (
                <p className="mt-1 text-xs text-green-700">✓ E-mail confirmado — usável em e-mail marketing.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-600">
                🏷️ Tags (segmentação de e-mail marketing) {tagCatalog.length > 0 && <span className="text-red-500">*</span>}
              </label>
              <div className={`rounded-xl border p-2.5 ${tagCatalog.length > 0 && formData.tags.length === 0 ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50/60'}`}>
                {formData.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formData.tags.map(tag => (
                      <span
                        key={tag}
                        className="group inline-flex items-center gap-1.5 text-white text-xs font-semibold pl-2.5 pr-1.5 py-1 rounded-full shadow-sm animate-in fade-in zoom-in-95 duration-150"
                        style={{ backgroundColor: tagColorMap.get(tag) || '#6366f1' }}
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          title="Remover tag"
                          className="flex items-center justify-center w-4 h-4 rounded-full bg-white/15 hover:bg-white/30 text-white leading-none transition-colors"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic mb-2">
                    {tagCatalog.length > 0 ? "Nenhuma tag selecionada. Escolha ao menos uma abaixo." : "Nenhuma tag adicionada ainda."}
                  </p>
                )}
                <DropdownMenu open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="bg-white">
                      🏷️ Selecionar tags...
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 max-h-64 overflow-y-auto">
                    {tagCatalog.length > 0 ? (
                      tagCatalog.map(tag => (
                        <DropdownMenuCheckboxItem
                          key={tag.id}
                          checked={formData.tags.includes(tag.name)}
                          onSelect={(e) => e.preventDefault()}
                          onCheckedChange={() => toggleTag(tag.name)}
                        >
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="flex-1 truncate">{tag.name}</span>
                        </DropdownMenuCheckboxItem>
                      ))
                    ) : (
                      <p className="text-xs text-gray-500 p-2">
                        Nenhuma tag cadastrada. {isAdmin ? "Crie tags em E-mail Marketing → Tags." : "Peça a um administrador para cadastrar tags em E-mail Marketing → Tags."}
                      </p>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleQuickReminder('30min')}>
                ⏱️ Lembrar em 30 min
              </Button>
              <Button type="button" size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleQuickReminder('tomorrow')}>
                📆 Lembrar amanhã
              </Button>
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
              <Button type="submit" size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700">{editingTask ? "Salvar" : "Criar Tarefa"}</Button>
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
            <div key={task.id} className={`border rounded-lg overflow-hidden shadow-sm transition-all duration-300 ${highlightTaskId === task.id ? 'ring-2 ring-blue-500 ring-offset-1 shadow-blue-200 shadow-md' : task.hotLead ? 'ring-1 ring-red-300 border-red-200' : ''}`}
              style={highlightTaskId === task.id ? { animation: 'pulse-highlight 1s ease-in-out 3' } : {}}>
              <div className={`flex items-center gap-2 md:gap-3 p-3 hover:bg-gray-50 transition cursor-pointer ${task.hotLead ? 'bg-red-50' : 'bg-white'}`} onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}>
                <label className="flex-shrink-0 p-1 -m-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedTasks.has(task.id)} onChange={() => handleSelectTask(task.id)} className="w-5 h-5 cursor-pointer" />
                </label>
                <div className="flex gap-1 flex-shrink-0">
                  <span>{statusEmoji[task.status || 'pending']}</span>
                  <span>{priorityEmoji[task.priority || 'medium']}</span>
                  {task.convertedAt && <span title="Cliente ativo">🎉</span>}
                  {task.hotLead && <span title="Lead quente: abriu/clicou em e-mail recentemente">🔥</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm leading-snug line-clamp-2 md:truncate">{task.title}</p>
                  <div className="flex gap-2 items-center flex-wrap mt-0.5">
                    {isAdmin && task.assignedTo && <p className="text-xs text-gray-500">👤 {task.assignedTo}</p>}
                    {hasPhone(`${task.title} ${task.notes ?? ''}`) && <span className="text-xs text-green-600">📱</span>}
                    {hasEmail(`${task.title} ${task.notes ?? ''}`) && <span className="text-xs text-blue-600">📧</span>}
                    {task.convertedAt && <span className="text-xs text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-medium">🎉 Cliente ativo</span>}
                    {task.hotLead && <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded font-medium">🔥 Lead quente</span>}
                    {task.email && !task.emailConfirmed && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleConfirmEmail(task.id, task.email); }}
                        title="E-mail não confirmado — clique para confirmar e liberar para e-mail marketing"
                        className="text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 px-1.5 py-0.5 rounded font-medium transition-colors"
                      >
                        ✉️ confirmar e-mail
                      </button>
                    )}
                    {task.email && task.emailConfirmed && (
                      <span title="E-mail confirmado — usável em e-mail marketing" className="text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded font-medium">✉️ ✓</span>
                    )}
                    {(() => {
                      const eng = engagementData?.[task.id];
                      if (!eng || (eng.opens === 0 && eng.clicks === 0)) return null;
                      const title = `Último engajamento: ${eng.lastEventAt ? new Date(eng.lastEventAt).toLocaleString('pt-BR') : '--'}`;
                      return (
                        <span
                          className="text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-medium"
                          title={title}
                        >
                          {eng.opens > 0 && `👁 ${eng.opens}x`}
                          {eng.opens > 0 && eng.clicks > 0 && ' · '}
                          {eng.clicks > 0 && '🔗 clicou'}
                        </span>
                      );
                    })()}
                    {task.tags && task.tags.length > 0 && (
                      <span className="flex gap-1 flex-wrap">
                        {task.tags.map(tag => {
                          const color = tagColorMap.get(tag) || '#6366f1';
                          return (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${color}1A`, color }}>{tag}</span>
                          );
                        })}
                      </span>
                    )}
                    {(() => {
                      const enr = enrollmentsData?.[task.id];
                      if (!enr || (enr.campaigns.length === 0 && enr.sequences.length === 0)) return null;
                      const seqStatusLabel: Record<string, string> = { active: 'ativa', paused: 'pausada', completed: 'concluída', cancelled: 'cancelada' };
                      const seqStatusColor: Record<string, string> = {
                        active: 'bg-blue-100 text-blue-700',
                        paused: 'bg-amber-100 text-amber-700',
                        completed: 'bg-gray-100 text-gray-600',
                        cancelled: 'bg-gray-100 text-gray-400 line-through',
                      };
                      const campStatusLabel: Record<string, string> = { pending: 'pendente', sent: 'enviada', failed: 'falhou', skipped: 'pulada' };
                      const campStatusColor: Record<string, string> = {
                        pending: 'bg-purple-100 text-purple-700',
                        sent: 'bg-emerald-100 text-emerald-700',
                        failed: 'bg-red-100 text-red-700',
                        skipped: 'bg-gray-100 text-gray-500',
                      };
                      return (
                        <span className="flex gap-1 flex-wrap">
                          {enr.sequences.map(seq => (
                            <span key={`seq-${seq.enrollmentId}`} className={`text-xs px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${seqStatusColor[seq.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              🔁 {seq.name} · {seqStatusLabel[seq.status] ?? seq.status}
                              {isAdmin && (seq.status === 'active' || seq.status === 'paused') && (
                                <button
                                  type="button"
                                  title="Remover da sequência"
                                  className="hover:text-red-600"
                                  onClick={(e) => { e.stopPropagation(); handleCancelEnrollment(seq.enrollmentId); }}
                                >✕</button>
                              )}
                            </span>
                          ))}
                          {enr.campaigns.map(camp => (
                            <span key={`camp-${camp.recipientId}`} className={`text-xs px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${campStatusColor[camp.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              📧 {camp.name} · {campStatusLabel[camp.status] ?? camp.status}
                              {isAdmin && (
                                <button
                                  type="button"
                                  title="Remover da campanha"
                                  className="hover:text-red-600"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveCampaignRecipient(camp.recipientId); }}
                                >✕</button>
                              )}
                            </span>
                          ))}
                        </span>
                      );
                    })()}
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
              {expandedTaskId === task.id && (
                <div className="p-3 bg-gray-50 border-t space-y-2">
                  {(fullTask?.notes ?? task.notes) && <div className="text-sm bg-yellow-50 p-3 rounded border border-yellow-200"><strong>📝 Anotações:</strong><p className="whitespace-pre-wrap mt-2 leading-relaxed">{fullTask?.notes ?? task.notes}</p></div>}
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
                  {/* ── Pedidos vinculados a esta tarefa ──────────────────── */}
                  {!isAdmin && (() => {
                    const taskPedidos = allPedidos.filter(p => p.taskId === task.id);
                    return (
                      <div className="bg-white border border-blue-100 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-800">Pedidos ({taskPedidos.length})</span>
                          <Button
                            size="sm"
                            className="gap-1 text-xs h-6 px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPedidoId(null);
                              setOrderDialogTask(task);
                              setOrderDialogOpen(true);
                            }}
                          >
                            + Novo pedido
                          </Button>
                        </div>
                        {taskPedidos.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-2">Nenhum pedido criado para esta tarefa</p>
                        ) : (
                          taskPedidos.map((ped) => {
                            const total = totalPedido(ped);
                            const isFat = ped.status === 'faturado';
                            return (
                              <div key={ped.id} className="bg-slate-50 rounded-lg px-2.5 py-2 space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex flex-wrap gap-x-2 items-center">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isFat ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                      {isFat ? 'Faturado' : 'Estimado'}
                                    </span>
                                    <span className="text-sm font-bold text-slate-800">{formatBRL(total)}</span>
                                    {ped.cnpj && <span className="text-[11px] text-slate-500">{ped.cnpj}</span>}
                                  </div>
                                </div>
                                {ped.itens.length > 0 && (
                                  <div className="space-y-0.5">
                                    {ped.itens.map((it) => (
                                      <div key={it.id} className="flex justify-between text-[11px] text-slate-600">
                                        <span className="truncate mr-2">{it.descricao}</span>
                                        <span className="whitespace-nowrap">{it.quantidade}un x {formatBRL(it.valorUnitario)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {(ped.prazoPagamentoSal || ped.prazoPagamentoFrete || ped.valorFretePorUnidade || ped.observacoes) && (
                                  <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1 space-y-0.5">
                                    {ped.prazoPagamentoSal && <div><strong>Prazo sal:</strong> {ped.prazoPagamentoSal}</div>}
                                    {ped.prazoPagamentoFrete && <div><strong>Prazo frete:</strong> {ped.prazoPagamentoFrete}</div>}
                                    {!!ped.valorFretePorUnidade && <div><strong>Frete/un:</strong> {formatBRL(ped.valorFretePorUnidade)}</div>}
                                    {ped.observacoes && <div><strong>Obs:</strong> {ped.observacoes}</div>}
                                  </div>
                                )}
                                <div className="flex gap-1.5 pt-0.5">
                                  <Button
                                    variant="outline" size="sm"
                                    className="gap-1 text-[11px] h-6 px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPedidoId(ped.id);
                                      setOrderDialogTask(task);
                                      setOrderDialogOpen(true);
                                    }}
                                  >
                                    Editar
                                  </Button>
                                  {!isFat && (
                                    <Button
                                      size="sm"
                                      className="gap-1 text-[11px] h-6 px-2 bg-emerald-600 hover:bg-emerald-700"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setInvoicePedidoId(ped.id);
                                        setInvoiceDialogOpen(true);
                                      }}
                                    >
                                      Marcar como faturado
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline" size="sm"
                                    className="gap-1 text-[11px] h-6 px-2 text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteOrderPedidoId(ped.id);
                                      setDeleteOrderDialogOpen(true);
                                    }}
                                  >
                                    Excluir
                                  </Button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex gap-2 flex-wrap">
                    {(() => {
                      const notesText = fullTask?.notes ?? task.notes ?? '';
                      const phone = extractPhone(`${task.title} ${notesText}`);
                      const email = extractEmail(`${task.title} ${notesText}`);
                      return (
                        <>
                          {phone && (
                            <Button asChild size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={(e) => e.stopPropagation()}>
                              <a href={waLink(phone)} target="_blank" rel="noopener noreferrer">📱 WhatsApp</a>
                            </Button>
                          )}
                          {phone && (
                            <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                              <a href={`tel:+${phone.length <= 11 ? `55${phone}` : phone}`}>📞 Ligar</a>
                            </Button>
                          )}
                          {email && (
                            <Button asChild size="sm" variant="outline" className="text-blue-700 border-blue-300 hover:bg-blue-50" onClick={(e) => e.stopPropagation()}>
                              <a href={`mailto:${email}`}>📧 E-mail</a>
                            </Button>
                          )}
                        </>
                      );
                    })()}
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
                    {isAdmin && task.email && (
                      <Button size="sm" variant="outline" onClick={() => setCampaignPickerTaskIds([task.id])}>📧 Campanha</Button>
                    )}
                    {canEmailMarketing && task.email && (
                      <Button size="sm" variant="outline" onClick={() => setSequencePickerTaskIds([task.id])}>🔁 Sequência</Button>
                    )}
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

      {/* Convert to active client modal */}
      {convertModalTask && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="text-base font-bold text-gray-800">Marcar como Cliente Ativo</h3>
              <p className="text-sm text-gray-500 mt-1">{convertModalTask.title}</p>
              <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-3">
                A tag <strong>"ativo"</strong> sera aplicada e voce podera criar o pedido com os produtos.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConvertModalTask(null)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={confirmConvert}
                disabled={toggleConvertedMutation.isPending}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition"
              >
                Confirmar
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
                  onClick={() => doSave()}
                  className="w-full py-3.5 bg-green-50 active:bg-green-100 hover:bg-green-100 text-green-700 text-sm font-semibold rounded-2xl border border-green-200 transition-all active:scale-[0.98]"
                >
                  Já documentei — Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add to campaign modal */}
      <Dialog open={campaignPickerTaskIds !== null} onOpenChange={(open) => { if (!open) setCampaignPickerTaskIds(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>📧 Adicionar à campanha de e-mail</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              {campaignPickerTaskIds?.length === 1 ? "1 tarefa selecionada" : `${campaignPickerTaskIds?.length ?? 0} tarefas selecionadas`}. Apenas tarefas com e-mail cadastrado serão adicionadas.
            </p>
            {draftCampaigns.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {draftCampaigns.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleAddToCampaign(c.id)}
                    disabled={addToCampaignMutation.isPending}
                    className="w-full text-left px-3 py-2 border rounded-lg hover:bg-blue-50 transition disabled:opacity-50"
                  >
                    <p className="font-medium text-sm">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.totalRecipients} destinatário(s) · rascunho</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Nenhuma campanha em rascunho. Crie uma campanha na aba{' '}
                <a href="/admin/email-marketing" className="text-blue-600 underline">E-mail Marketing</a>.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="w-full" onClick={() => setCampaignPickerTaskIds(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar e-mail — passo 1 */}
      <AlertDialog open={!!confirmEmailTarget} onOpenChange={(open) => { if (!open) setConfirmEmailTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar e-mail</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmar que o e-mail <strong>{confirmEmailTarget?.email}</strong> está correto? Após confirmar, ele poderá ser usado em campanhas e sequências de e-mail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmEmailTarget(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEmailNow} disabled={confirmEmailMutation.isPending}>
              {confirmEmailMutation.isPending ? "Confirmando..." : "✓ Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Oferece inscrever em sequência logo após confirmar — passo 2 */}
      <AlertDialog open={justConfirmedTaskId !== null} onOpenChange={(open) => { if (!open) setJustConfirmedTaskId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>✅ E-mail confirmado!</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja incluir esta tarefa em uma sequência de e-mail marketing agora?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setJustConfirmedTaskId(null)}>Agora não</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (justConfirmedTaskId !== null) setSequencePickerTaskIds([justConfirmedTaskId]);
                setJustConfirmedTaskId(null);
              }}
            >
              🔁 Escolher sequência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Enroll in sequence modal */}
      <Dialog open={sequencePickerTaskIds !== null} onOpenChange={(open) => { if (!open) { setSequencePickerTaskIds(null); setSelectedSequenceId(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>🔁 Inscrever em sequência de e-mail</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              {sequencePickerTaskIds?.length === 1 ? "1 tarefa selecionada" : `${sequencePickerTaskIds?.length ?? 0} tarefas selecionadas`}. Apenas tarefas com e-mail cadastrado serão inscritas.
            </p>
            {activeSequences.length > 0 ? (
              <RadioGroup value={selectedSequenceId !== null ? String(selectedSequenceId) : ""} onValueChange={(v: string) => setSelectedSequenceId(Number(v))} className="max-h-64 overflow-y-auto">
                {activeSequences.map(s => (
                  <label key={s.id} className="flex items-start gap-2 px-3 py-2 border rounded-lg hover:bg-indigo-50 transition cursor-pointer">
                    <RadioGroupItem value={String(s.id)} className="mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">{s.name}</p>
                      {'stepCount' in s && <p className="text-xs text-gray-500">{(s as any).stepCount} passo(s) · {(s as any).activeEnrollments} inscrito(s) ativo(s)</p>}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <p className="text-sm text-gray-500">
                Nenhuma sequência ativa. Peça ao administrador para criar sequências.
              </p>
            )}
          </div>
          <DialogFooter className="flex gap-2 pt-2">
            <Button
              type="button"
              className="flex-1"
              onClick={handleEnrollInSequence}
              disabled={enrollInSequenceMutation.isPending || selectedSequenceId === null}
            >
              {enrollInSequenceMutation.isPending ? "Inscrevendo..." : "✅ Inscrever"}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => { setSequencePickerTaskIds(null); setSelectedSequenceId(null); }}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order dialog (new + edit) */}
      <OrderDialog
        open={orderDialogOpen}
        onOpenChange={(o) => { setOrderDialogOpen(o); if (!o) setEditingPedidoId(null); }}
        seller={sellerProfile ? { id: sellerProfile.id, name: sellerProfile.name } : null}
        existingPedidoId={editingPedidoId}
        task={orderDialogTask ? {
          id: orderDialogTask.id,
          title: orderDialogTask.title,
          cnpj: orderDialogTask.cnpj ?? null,
          clientName: orderDialogTask.title,
          // tasks.list omite description (economia de banda) — só tasks.getById
          // (fullTask) traz. Cai para orderDialogTask.description como fallback
          // caso o fetch ainda não tenha chegado.
          description: (fullTask?.id === orderDialogTask.id ? fullTask.description : orderDialogTask.description) ?? null,
        } : null}
      />
      <InvoiceDialog
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
        pedidoId={invoicePedidoId}
      />
      <DeleteOrderDialog
        open={deleteOrderDialogOpen}
        onOpenChange={setDeleteOrderDialogOpen}
        pedidoId={deleteOrderPedidoId}
      />

    </div>
  );
}
