import { useAuth } from '../_core/hooks/useAuth';
import { Link } from 'wouter';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Skeleton } from '../components/ui/skeleton';
import { Page, PageHeader, Panel, PanelHeader, EmptyState } from '../components/layout/Page';
import { StatusBadge } from '../components/StatusBadge';

import { useState, useMemo, useCallback, useEffect, useRef, useDeferredValue } from "react";
import { toast } from "sonner";
import {
  Search, X, Bell, Phone, Timer, Flame, Mail, Info, Plus, Upload, Pencil,
  Trash2, ClipboardList, MessageCircle, Package, Boxes, Tag, MailCheck, RefreshCw,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from '../components/ui/dropdown-menu';
import { OrderDialog } from '../components/faturamento/OrderDialog';
import { InvoiceDialog } from '../components/faturamento/InvoiceDialog';
import { DeleteOrderDialog } from '../components/faturamento/DeleteOrderDialog';
import { useFatStore } from '../lib/faturamento/store';
import { useConfirm } from '../components/useConfirm';
import { totalPedido, formatBRL } from '../lib/faturamento/calc';
import type { Pedido } from '../lib/faturamento/types';
import { MultiSelectFilter } from '../components/tasks/MultiSelectFilter';
import { QueryError } from '../components/QueryError';
import { FILTER_ALL, FILTER_ME, FILTER_NONE, applyAssigneeFilter, assignableNames, buildMyIdentity, otherAttendantNames } from '../lib/myTasks';
import { FilterPanel, FilterSection } from '../components/tasks/FilterPanel';
import { extractLocation, type TaskLocation } from '../lib/tasks/location';
import { phoneOfTask } from '../../../shared/phone';

type ReminderTab = "all" | "overdue" | "upcoming" | "today" | "yesterday" | "lastWeek" | "lastMonth";

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
function hasEmail(text: string): boolean {
  return /[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text);
}

// Urgência do lembrete de uma tarefa — base única para a cor de fundo do card
// e o chip de data, evitando duas contas de data ligeiramente diferentes.
function taskUrgency(task: Task): { isOverdue: boolean; daysOverdue: number; isToday: boolean } {
  if (!task.reminderDate || task.reminderEnabled === false) {
    return { isOverdue: false, daysOverdue: 0, isToday: false };
  }
  const rd = new Date(task.reminderDate);
  if (isNaN(rd.getTime())) return { isOverdue: false, daysOverdue: 0, isToday: false };
  const now = new Date();
  const isOverdue = rd < now && task.status === 'pending';
  const daysOverdue = isOverdue ? Math.floor((now.getTime() - rd.getTime()) / 86400000) : 0;
  const isToday = rd.toDateString() === now.toDateString();
  return { isOverdue, daysOverdue, isToday };
}

// Dados do próximo lembrete para exibição (data, hora e urgência). null = sem lembrete ativo.
function reminderInfo(task: Task): { dateStr: string; timeStr: string; isOverdue: boolean; daysOverdue: number; isToday: boolean } | null {
  if (!task.reminderDate || !task.reminderEnabled) return null;
  const rd = new Date(task.reminderDate);
  if (isNaN(rd.getTime())) return null;
  const { isOverdue, daysOverdue, isToday } = taskUrgency(task);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    dateStr: `${p(rd.getDate())}/${p(rd.getMonth() + 1)}`,
    timeStr: `${p(rd.getHours())}:${p(rd.getMinutes())}`,
    isOverdue,
    daysOverdue,
    isToday,
  };
}

const PRIORITY_LABEL: Record<string, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' };

// <select> nativo (lista longa de atendentes, melhor no celular) com a aparência dos inputs do sistema.
const selectCls =
  'h-9 rounded-md border border-input bg-surface px-3 text-sm text-slate-900 outline-none transition-[color,border-color,box-shadow] hover:border-slate-400 focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-500/20 max-md:h-10';
// Controle de filtro com valor diferente do padrão.
const selectActiveCls = 'border-brand-600 bg-brand-50 text-brand-800 hover:bg-brand-50';

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

function telLink(digits: string): string {
  return `tel:+${digits.length <= 11 ? `55${digits}` : digits}`;
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
  // Admin abre as tarefas como atendente: só as dele. "Todos" fica nos filtros.
  const [filterAssignee, setFilterAssignee] = useState<string>(FILTER_ME);
  const [filterContact, setFilterContact] = useState<"all" | "whatsapp" | "email">("all");
  const [filterReminder, setFilterReminder] = useState<"all" | "active" | "inactive">("all");
  const [filterConverted, setFilterConverted] = useState<"all" | "active_clients" | "leads">("all");
  const [filterHot, setFilterHot] = useState(false);
  // Localização: cidade/UF não são colunas — são derivadas de title/description
  // (ver lib/tasks/location.ts). Multi-seleção, cidade dependente do estado.
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterCities, setFilterCities] = useState<string[]>([]);
  // "overdue"/"upcoming" existem como abas na UI desde sempre; faltavam no tipo,
  // o que fazia o TypeScript tratar esses dois ramos do filtro como inalcançáveis.
  const [reminderTab, setReminderTab] = useState<ReminderTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  // A busca filtra milhares de leads e dispara queries: adia o filtro para não refazer a cada tecla.
  const deferredSearch = useDeferredValue(searchQuery);
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
  const { pedidos: allPedidos, comissoes: fatComissoes, actions: fatActions } = useFatStore();
  // Desfaz o faturamento com confirmação: descarta as quantidades reais do
  // embarque e tira o pedido do faturamento do mês.
  const { confirm, confirmDialog } = useConfirm();
  const undoInvoice = async (pedidoId: string) => {
    const ok = await confirm(
      'Ele volta para "estimado" e sai do faturamento do mês. ' +
        'As quantidades reais digitadas no embarque serão substituídas pelos valores estimados.',
      { title: 'Desfazer o faturamento deste pedido?', confirmLabel: 'Desfazer faturamento' },
    );
    if (!ok) return;
    fatActions.pedidos.desfazerFaturamento(pedidoId);
    toast.success('Faturamento desfeito. O pedido voltou para estimado.');
  };
  // ID da tarefa mais urgente a destacar após salvar
  const [highlightTaskId, setHighlightTaskId] = useState<number | null>(null);
  // Ref para controlar alerta de ociosidade (último contato feito)
  const lastContactTimeRef = useRef<number>(Date.now());

  const { data: tasks = [], isLoading, isError, isFetching, refetch } = trpc.tasks.list.useQuery();
  const { data: attendants = [] } = trpc.sellers.list.useQuery();
  const me = useMemo(() => buildMyIdentity(user, attendants as any[]), [user, attendants]);
  const otherAttendants = useMemo(() => otherAttendantNames(attendants as any[], me), [attendants, me]);
  const assignOptions = useMemo(() => assignableNames(user, attendants as any[], me), [user, attendants, me]);
  // staleTime: avoids redundant server calls; session/profile rarely change
  const { data: workSession } = trpc.workSessions.current.useQuery(undefined, { enabled: !isAdmin, staleTime: 60_000 });
  const { data: sellerProfile } = trpc.sellers.myProfile.useQuery(undefined, { enabled: !isAdmin, staleTime: 300_000 });
  const createMutation = trpc.tasks.create.useMutation();
  const updateMutation = trpc.tasks.update.useMutation();
  const bulkCreateMutation = trpc.tasks.bulkCreate.useMutation();
  const bulkAssignMutation = trpc.tasks.bulkAssign.useMutation();
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
      toast.success(`${res.added} adicionado(s) à campanha` + (skipped > 0 ? ` (${skipped} ignorado(s): sem e-mail, não-confirmado, duplicado ou descadastrado)` : ''));
      if (res.skippedUnconfirmed > 0) toast.warning(`${res.skippedUnconfirmed} lead(s) ignorado(s) por e-mail não confirmado. Confirme o e-mail na tarefa antes de usá-lo.`, { duration: 9000 });
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
  // Gerente (role='manager') tem e-mail marketing completo, como o admin, sem
  // depender do toggle emailMarketingEnabled por atendente.
  const canEmailMarketing = isAdmin || user?.role === 'manager' || (sellerProfile?.emailMarketingEnabled ?? false);

  // ── E-mail Marketing: enroll task(s) in a sequence ──────────────────────────
  // Carregadas assim que a página abre (não só quando um popup pede) — a lista
  // de sequências é pequena e curada pelo admin, e pré-carregar evita qualquer
  // espera perceptível no popup de confirmar e-mail (que já mostra o picker
  // inline, sem abrir um segundo diálogo).
  const [sequencePickerTaskIds, setSequencePickerTaskIds] = useState<number[] | null>(null);
  const { data: emailSequencesAdmin, isLoading: sequencesAdminLoading } = trpc.emailMarketing.listSequences.useQuery(undefined, { enabled: isAdmin, staleTime: 300_000 });
  const { data: emailSequencesAtt, isLoading: sequencesAttLoading } = trpc.emailMarketing.listSequencesForAttendant.useQuery(undefined, { enabled: !isAdmin && canEmailMarketing, staleTime: 300_000 });
  const activeSequences = isAdmin
    ? (emailSequencesAdmin ?? []).filter(s => s.active)
    : (emailSequencesAtt ?? []);
  // Só é "carregando" se a query relevante ao papel do usuário ainda não voltou —
  // evita mostrar "nenhuma sequência" por um instante antes do fetch inicial.
  const sequencesLoading = isAdmin ? sequencesAdminLoading : (canEmailMarketing && sequencesAttLoading);
  const enrollInSequenceMutation = trpc.emailMarketing.enrollTasksInSequence.useMutation();
  const [selectedSequenceId, setSelectedSequenceId] = useState<number | null>(null);

  const handleEnrollInSequence = async () => {
    if (!sequencePickerTaskIds || !selectedSequenceId) return;
    try {
      const res = await enrollInSequenceMutation.mutateAsync({ sequenceId: selectedSequenceId, taskIds: sequencePickerTaskIds });
      const skipped = res.skippedNoEmail + res.skippedDuplicateOrSuppressed + (res.skippedUnconfirmed ?? 0);
      if (res.enrolled > 0) {
        toast.success(`${res.enrolled} inscrito(s) na sequência`);
      }
      if (skipped > 0 && (res as any).skipReasons?.length) {
        toast.error(`${skipped} ignorado(s):\n${(res as any).skipReasons.join('\n')}`, { duration: 12000 });
      } else if (skipped > 0) {
        toast.error(`${skipped} ignorado(s): sem e-mail, não-confirmado, duplicado ou descadastrado`);
      }
      if (res.skippedUnconfirmed > 0) toast.warning(`${res.skippedUnconfirmed} lead(s) com e-mail não confirmado — confirme na tarefa antes.`, { duration: 9000 });
      setSequencePickerTaskIds(null);
      setSelectedSequenceId(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao inscrever na sequência");
    }
  };


  // ── Filtro por tags: multi-seleção com modo de combinação ───────────────────
  // 'any' = tem qualquer uma das tags marcadas (união, padrão)
  // 'all' = tem todas ao mesmo tempo (interseção — ex: "ativo" E "compra muito")
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [tagMatchMode, setTagMatchMode] = useState<"any" | "all">("any");

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
    if (prev < q1   && cur >= q1)   toast.success(`${q1} contatos! Ótimo começo!`);
    if (prev < half && cur >= half) toast.success(`Metade da meta! ${half} contatos!`);
    if (prev < q3   && cur >= q3)   toast.success(`${q3} contatos! Faltam só ${goal - q3}!`);
    if (prev < goal && cur >= goal) toast.success(`META BATIDA! ${goal} contatos hoje!`, { duration: 6000 });
    prevContactsRef.current = cur;
  }, [dailyProgress?.contacts, isAdmin, sellerProfile?.dailyGoal]);

  // ─── 1. NOTIFICAÇÕES DE LEMBRETE NO HORÁRIO EXATO ──────────────────────────
  // Agenda setTimeout para cada tarefa com lembrete nas próximas 4h.
  // Dispara Notification API nativa — zero custo de servidor.
  const scheduledRemindersRef = useRef<Set<number>>(new Set());
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  useEffect(() => {
    if (isAdmin || !('Notification' in window)) return;
    // Permissão só pelo botão "Ativar" abaixo (sem gesto o iOS ignora o pedido).
    if (notifPerm !== 'granted') return;

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
        const opts = { body: t.title, icon: '/favicon.ico', tag: `reminder-${t.id}` };
        // Android/PWA só mostra notificação pelo service worker; `new Notification` lança lá.
        const nativa = () => { try { new Notification('Lembrete Sal Vita', opts); } catch { /* sem suporte */ } };
        if (navigator.serviceWorker?.controller) {
          navigator.serviceWorker.ready.then((r) => r.showNotification('Lembrete Sal Vita', opts)).catch(nativa);
        } else {
          nativa();
        }
        scheduledRemindersRef.current.delete(t.id);
      }, delay));
    });

    return () => {
      timers.forEach(clearTimeout);
      // Timers cancelados: o próximo efeito precisa poder reagendar os mesmos ids.
      scheduledRemindersRef.current.clear();
    };
  }, [tasks, isAdmin, notifPerm]);

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
        `${idleMin} min sem contatos! Você tem ${pending} tarefa${pending > 1 ? 's' : ''} pendente${pending > 1 ? 's' : ''}.`,
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

  const savingRef = useRef(false);
  const saving = createMutation.isPending || updateMutation.isPending;
  const doSave = async (overrides?: { reminderDate: string; reminderTime: string }) => {
    if (savingRef.current) return; // duplo clique / atalho + botão
    savingRef.current = true;
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
          toast.warning(`Atenção: ${result.burstCount} contatos registrados em menos de 10 minutos. Certifique-se de que cada anotação representa um contato real — a gestão monitora esse indicador.`, { duration: 12000 });
        }
      } else {
        if (!reminderDateTime) { toast.error("Data do lembrete é obrigatória"); return; }
        await createMutation.mutateAsync({ clientId: formData.clientId || 0, title: formData.title, description: formData.description, notes: formData.notes, email: formData.email, tags: formData.tags, reminderDate: reminderDateTime, reminderEnabled: formData.reminderEnabled, priority: formData.priority, assignedTo: formData.assignedTo || undefined });
        toast.success("Tarefa criada! Lembrete ativado!");
      }
      // Atualiza o timestamp do último contato para o alerta de ociosidade
      if (!isAdmin) lastContactTimeRef.current = Date.now();
      setShowNotesWarning(false);
      resetForm(); setIsModalOpen(false);
      const { data: fresh } = await refetch();
      if (!isAdmin && fresh) highlightNextUrgent(fresh as any[]);
    } catch { toast.error("Erro ao salvar tarefa"); }
    finally { savingRef.current = false; }
  };

  // Atalho: ajusta a data/hora do lembrete (30min ou amanhã, mantendo a hora atual) e já salva.
  const handleQuickReminder = async (mode: '30min' | 'tomorrow') => {
    if (!formData.title.trim()) { toast.error("Título é obrigatório"); return; }
    if (tagCatalog.length > 0 && formData.tags.length === 0) { toast.error("Selecione ao menos uma tag"); return; }
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
    if (!formData.reminderDate) { toast.error("Data do lembrete é obrigatória"); return; }
    if (tagCatalog.length > 0 && formData.tags.length === 0) { toast.error("Selecione ao menos uma tag"); return; }
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
      toast.success("Cliente marcado como ativo! Tag \"ativo\" aplicada para o e-mail marketing.");
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

  // Localização por tarefa — calculada uma vez por lista (não por filtro), já
  // que parsear título de 3k+ tarefas a cada tecla digitada seria desperdício.
  const locationByTaskId = useMemo(() => {
    const map = new Map<number, TaskLocation>();
    for (const t of tasks as Task[]) map.set(t.id, extractLocation(t));
    return map;
  }, [tasks]);

  // Quantas tarefas carregam cada tag — mostrado no seletor pra o atendente
  // saber o tamanho do recorte antes de aplicar.
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks as Task[]) {
      for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  // Opções de UF: só as que existem na base, com contagem.
  const stateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const loc of locationByTaskId.values()) {
      if (loc.state) counts.set(loc.state, (counts.get(loc.state) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [locationByTaskId]);

  // Opções de cidade — restritas às UFs selecionadas, pra lista não virar um
  // paredão de milhares de itens quando nenhum estado foi escolhido.
  const cityOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const loc of locationByTaskId.values()) {
      if (!loc.city) continue;
      if (filterStates.length > 0 && !filterStates.includes(loc.state)) continue;
      counts.set(loc.city, (counts.get(loc.city) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count }));
  }, [locationByTaskId, filterStates]);

  // Trocar de estado invalida cidades que não pertencem mais ao recorte.
  useEffect(() => {
    if (filterCities.length === 0) return;
    const valid = new Set(cityOptions.map((o) => o.value));
    const kept = filterCities.filter((c) => valid.has(c));
    if (kept.length !== filterCities.length) setFilterCities(kept);
  }, [cityOptions, filterCities]);

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
    if (isAdmin) result = applyAssigneeFilter(result, filterAssignee, me);
    if (filterContact === "whatsapp") {
      result = result.filter(t => phoneOfTask(t) !== null);
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
    if (filterTags.length > 0) {
      result = result.filter(t => {
        const tags = t.tags ?? [];
        return tagMatchMode === "all"
          ? filterTags.every(ft => tags.includes(ft))
          : filterTags.some(ft => tags.includes(ft));
      });
    }
    if (filterStates.length > 0) {
      result = result.filter(t => {
        const st = locationByTaskId.get(t.id)?.state;
        return !!st && filterStates.includes(st);
      });
    }
    if (filterCities.length > 0) {
      result = result.filter(t => {
        const city = locationByTaskId.get(t.id)?.city;
        return !!city && filterCities.includes(city);
      });
    }
    if (filterHot) {
      result = result.filter(t => t.hotLead);
    }
    if (deferredSearch.trim()) {
      // Busca por todos os termos (E): "laticinios chapada" acha a linha que
      // tem as duas palavras, em qualquer ordem e em qualquer um dos campos.
      // Também varre CNPJ/telefone/e-mail, que antes ficavam de fora.
      const terms = deferredSearch.toLowerCase().split(/\s+/).filter(Boolean);
      result = result.filter(t => {
        const loc = locationByTaskId.get(t.id);
        const haystack = [
          t.title, t.notes, t.assignedTo, t.email, t.cnpj, t.phone,
          t.description, loc?.city, loc?.state, ...(t.tags ?? []),
        ].filter(Boolean).join(' ').toLowerCase();
        const digits = haystack.replace(/\D/g, '');
        return terms.every(term => {
          if (haystack.includes(term)) return true;
          // Termo só de dígitos casa com CNPJ/telefone mesmo formatado
          const termDigits = term.replace(/\D/g, '');
          return termDigits.length >= 3 && digits.includes(termDigits);
        });
      });
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
  }, [tasks, me, filterStatus, filterAssignee, filterContact, filterReminder, filterConverted, filterTags, tagMatchMode, filterStates, filterCities, locationByTaskId, filterHot, reminderTab, isAdmin, deferredSearch]);

  const clearAllFilters = useCallback(() => {
    setFilterStatus("all");
    setFilterAssignee(FILTER_ME);
    setFilterContact("all");
    setFilterReminder("all");
    setFilterConverted("all");
    setFilterTags([]);
    setFilterStates([]);
    setFilterCities([]);
    setFilterHot(false);
    setReminderTab("all");
    setSearchQuery("");
  }, []);

  // Quantos filtros DO PAINEL estão ativos — vira o contador no botão "Filtros".
  // Busca, abas de período e "quentes" não contam: são visíveis por si só.
  const panelFilterCount = useMemo(() => {
    let n = 0;
    if (filterStatus !== "all") n++;
    if (isAdmin && filterAssignee !== FILTER_ME) n++;
    if (filterContact !== "all") n++;
    if (filterReminder !== "all") n++;
    if (filterConverted !== "all") n++;
    if (filterTags.length > 0) n++;
    if (filterStates.length > 0) n++;
    if (filterCities.length > 0) n++;
    return n;
  }, [filterStatus, filterAssignee, filterContact, filterReminder, filterConverted, filterTags, filterStates, filterCities, isAdmin]);

  // Um chip por filtro ativo. Cada chip sabe se limpar sozinho.
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; value: string; clear: () => void }[] = [];
    if (searchQuery.trim()) chips.push({ key: "q", label: "Busca", value: searchQuery.trim(), clear: () => setSearchQuery("") });
    if (reminderTab !== "all") {
      const labels: Record<string, string> = { overdue: "Atrasados", upcoming: "Agendados", today: "Hoje", yesterday: "Ontem", lastWeek: "Semana passada", lastMonth: "Mês passado" };
      chips.push({ key: "tab", label: "Período", value: labels[reminderTab] ?? reminderTab, clear: () => setReminderTab("all") });
    }
    if (filterStatus !== "all") chips.push({ key: "status", label: "Status", value: "Ativas", clear: () => setFilterStatus("all") });
    if (isAdmin && filterAssignee !== FILTER_ME) chips.push({ key: "assignee", label: "Atendente", value: filterAssignee === FILTER_NONE ? "Sem atendente" : filterAssignee === FILTER_ALL ? "Todos os atendentes" : filterAssignee, clear: () => setFilterAssignee(FILTER_ME) });
    if (filterContact !== "all") chips.push({ key: "contact", label: "Contato", value: filterContact === "whatsapp" ? "WhatsApp" : "E-mail", clear: () => setFilterContact("all") });
    if (filterReminder !== "all") chips.push({ key: "rem", label: "Lembrete", value: filterReminder === "active" ? "Com lembrete" : "Sem lembrete", clear: () => setFilterReminder("all") });
    if (filterConverted !== "all") chips.push({ key: "conv", label: "Situação", value: filterConverted === "active_clients" ? "Clientes ativos" : "Só leads", clear: () => setFilterConverted("all") });
    if (filterTags.length > 0) chips.push({ key: "tags", label: tagMatchMode === "all" ? "Tags (todas)" : "Tags", value: filterTags.join(tagMatchMode === "all" ? " + " : ", "), clear: () => setFilterTags([]) });
    if (filterStates.length > 0) chips.push({ key: "uf", label: "Estado", value: filterStates.join(", "), clear: () => setFilterStates([]) });
    if (filterCities.length > 0) chips.push({ key: "city", label: "Cidade", value: filterCities.join(", "), clear: () => setFilterCities([]) });
    if (filterHot) chips.push({ key: "hot", label: "Lead", value: "Só quentes", clear: () => setFilterHot(false) });
    return chips;
  }, [searchQuery, reminderTab, filterStatus, filterAssignee, filterContact, filterReminder, filterConverted, filterTags, tagMatchMode, filterStates, filterCities, filterHot, isAdmin]);

  // ── E-mail Marketing: engagement badges (single batched query for visible tasks) ──
  // O servidor aceita no máximo 500 ids por consulta (.max(500)): manda só os primeiros da lista.
  const visibleTaskIds = useMemo(() => filteredTasks.slice(0, 500).map((t: Task) => t.id), [filteredTasks]);
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
    if (!(await confirm("Remover este lead da sequência?", { confirmLabel: 'Remover' }))) return;
    try {
      await cancelEnrollmentMutation.mutateAsync({ id: enrollmentId });
      await utils.emailMarketing.enrollmentsByTaskIds.invalidate();
      toast.success("Inscrição cancelada");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao cancelar inscrição");
    }
  }, [cancelEnrollmentMutation, confirm]);

  const handleRemoveCampaignRecipient = useCallback(async (recipientId: number) => {
    if (!(await confirm("Remover este lead da campanha?", { confirmLabel: 'Remover' }))) return;
    try {
      await removeCampaignRecipientMutation.mutateAsync({ id: recipientId });
      await utils.emailMarketing.enrollmentsByTaskIds.invalidate();
      toast.success("Removido da campanha");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao remover da campanha");
    }
  }, [removeCampaignRecipientMutation, confirm]);

  // Confirma manualmente o e-mail de um lead importado — só após isso ele pode
  // ser usado em campanhas/sequências/automações. Um único popup: confirmar +
  // escolher sequência (opcional) ficam na mesma tela, sem trocar de diálogo.
  // A lista de sequências já vem pré-carregada (ver enabled: canEmailMarketing
  // acima), então abrir o popup não espera nenhum fetch. O refetch da lista de
  // tarefas roda em segundo plano — não trava o fechamento do popup.
  const confirmEmailMutation = trpc.tasks.confirmEmail.useMutation();
  const [confirmEmailTarget, setConfirmEmailTarget] = useState<{ id: number; email: string } | null>(null);
  const [confirmEmailSequenceId, setConfirmEmailSequenceId] = useState<number | null>(null);
  const [confirmEmailBusy, setConfirmEmailBusy] = useState(false);

  const handleConfirmEmail = useCallback((taskId: number, email?: string | null) => {
    setConfirmEmailSequenceId(null);
    setConfirmEmailTarget({ id: taskId, email: email ?? '' });
  }, []);

  const confirmEmailNow = useCallback(async () => {
    if (!confirmEmailTarget) return;
    const taskId = confirmEmailTarget.id;
    const sequenceId = confirmEmailSequenceId;
    setConfirmEmailBusy(true);
    try {
      await confirmEmailMutation.mutateAsync({ id: taskId });
      setEditingTask(prev => (prev && prev.id === taskId ? { ...prev, emailConfirmed: true } : prev));

      if (sequenceId !== null) {
        const res = await enrollInSequenceMutation.mutateAsync({ sequenceId, taskIds: [taskId] });
        if (res.enrolled > 0) {
          toast.success("E-mail confirmado e incluído na sequência!");
        } else {
          toast.success("E-mail confirmado", { description: res.skipReasons?.[0] ?? "Não foi possível incluir na sequência agora." });
        }
      } else {
        toast.success("E-mail confirmado — já pode ser usado para e-mail marketing");
      }

      setConfirmEmailTarget(null);
      setConfirmEmailSequenceId(null);
      refetch(); // segundo plano — não bloqueia o fechamento do popup
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao confirmar e-mail");
    } finally {
      setConfirmEmailBusy(false);
    }
  }, [confirmEmailTarget, confirmEmailSequenceId, confirmEmailMutation, enrollInSequenceMutation]);

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

  // Link direto para uma tarefa (ex.: vindo do Buscador de Clientes): /tasks?tarefa=123.
  // Abre a edição dessa tarefa uma única vez e limpa o parâmetro da barra de endereço.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || isLoading) return;
    const raw = new URLSearchParams(window.location.search).get('tarefa');
    if (!raw) return;
    deepLinkHandled.current = true;
    const id = Number(raw);
    const alvo = Number.isInteger(id) ? (tasks as Task[]).find((x) => x.id === id) : undefined;
    if (alvo) handleEdit(alvo);
    else toast.error('Tarefa não encontrada. Ela pode ter sido excluída ou ser de outro atendente.');
    window.history.replaceState(null, '', window.location.pathname);
  }, [tasks, isLoading, handleEdit]);

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
      await bulkAssignMutation.mutateAsync({ ids: Array.from(selectedTasks), assignedTo: bulkRepresentative });
      toast.success(`${selectedTasks.size} tarefas designadas!`);
      setSelectedTasks(new Set());
      setBulkRepresentative("");
      refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao designar");
    }
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
    try {
      const created = await bulkCreateMutation.mutateAsync({
        items: importedTasks.map(t => ({
          clientId: 0,
          title: t.title,
          description: t.description,
          notes: t.notes,
          // Sem reminderDate de propósito: o servidor escalona os lembretes (1 a cada 2 min).
          reminderEnabled: true,
          priority: "medium" as const,
          assignedTo: selectedRepresentative,
          cnpj: t.cnpj,
          phone: t.phone,
        })),
      });
      const ignoradas = created.duplicadas > 0
        ? ` ${created.duplicadas} ${created.duplicadas === 1 ? 'linha já existia' : 'linhas já existiam'} (mesmo CNPJ ou telefone) e foi ignorada.`
        : '';
      toast.success(`${created.length} tarefas importadas com sucesso para ${selectedRepresentative}!${ignoradas}`, { duration: 8000 });
      setImportedTasks([]);
      setImportSkipped(0);
      setShowImport(false);
      setSelectedRepresentative("");
      refetch();
    } catch (err: any) {
      toast.error(`Erro ao importar: ${err?.message ?? 'tente novamente'}`);
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

  // Contagens dos filtros rápidos de período — respeitam só o escopo de atendente
  // (admin vê as próprias por padrão), não os demais filtros, para o número
  // anunciado no botão ser o que aparece ao clicar nele.
  const tabCounts = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let base = tasks as Task[];
    if (isAdmin) base = applyAssigneeFilter(base, filterAssignee, me);
    let overdue = 0, todayN = 0, upcoming = 0;
    for (const t of base) {
      if (!t.reminderDate) continue;
      const rd = new Date(t.reminderDate);
      const rdDay = new Date(rd.getFullYear(), rd.getMonth(), rd.getDate()).getTime();
      if (rd < now && t.reminderEnabled !== false && t.status === 'pending') overdue++;
      if (rd >= now && t.reminderEnabled !== false) upcoming++;
      if (rdDay === today) todayN++;
    }
    return { all: base.length, overdue, today: todayN, upcoming };
  }, [tasks, isAdmin, filterAssignee, me]);

  if (!user) return <div className="p-4 text-center text-slate-500">Carregando...</div>;

  const hasFilters = activeFilterChips.length > 0;
  const allSelected = selectedTasks.size === filteredTasks.length && filteredTasks.length > 0;

  const primaryTabs: { key: ReminderTab; label: string; count: number; tone?: 'danger' }[] = [
    { key: "all", label: "Todas", count: tabCounts.all },
    { key: "overdue", label: "Atrasadas", count: tabCounts.overdue, tone: "danger" },
    { key: "today", label: "Hoje", count: tabCounts.today },
    { key: "upcoming", label: "Agendadas", count: tabCounts.upcoming },
  ];
  const moreTabs: { key: ReminderTab; label: string }[] = [
    { key: "yesterday", label: "Ontem" },
    { key: "lastWeek", label: "Semana passada" },
    { key: "lastMonth", label: "Mês passado" },
  ];
  const tabBase = "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors max-md:h-10";
  const tabOff = "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900";
  const tabOn = "border-brand-200 bg-brand-50 text-brand-800";
  const tabOnDanger = "border-red-200 bg-red-50 text-red-800";

  return (
    <Page wide>
      {confirmDialog}
      <PageHeader
        title="Tarefas"
        description={isLoading ? undefined : `${filteredTasks.length} de ${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`}
        actions={
          <>
            {isAdmin && (
              <Button variant="outline" onClick={() => setShowImport(!showImport)}>
                <Upload aria-hidden /> Importar CSV
              </Button>
            )}
            <Button onClick={handleOpenNewTask}>
              <Plus aria-hidden /> Nova tarefa
            </Button>
          </>
        }
      />

      {!isAdmin && showMonitorBanner && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p className="flex-1">
            <strong className="font-semibold">Trabalho monitorado.</strong> Anotações, qualidade e velocidade dos contatos são acompanhados diariamente pela gestão.
          </p>
          <button
            onClick={() => { setShowMonitorBanner(false); sessionStorage.setItem('monitorBannerDismissed', '1'); }}
            className="-m-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-amber-800 hover:bg-amber-100 md:-m-1 md:size-8"
            title="Fechar"
            aria-label="Fechar aviso"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {!isAdmin && notifPerm === 'default' && (
        <div className="flex items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          <Bell size={16} aria-hidden className="shrink-0" />
          <p className="flex-1">
            <strong className="font-semibold">Ative as notificações</strong> para receber lembretes no horário certo, mesmo com o celular bloqueado.
          </p>
          <Button
            size="sm"
            onClick={() => { void Notification.requestPermission().then(setNotifPerm).catch(() => {}); }}
          >
            Ativar
          </Button>
        </div>
      )}
      {dailyProgress && (
        <Panel className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-baseline gap-2">
              <Phone size={15} aria-hidden className="self-center text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Contatos hoje</span>
              <span className="text-xl font-semibold tabular-nums" style={{ color: dailyProgress.color }}>{dailyProgress.contacts}</span>
              <span className="text-sm text-slate-500">/ {dailyProgress.goal}</span>
            </div>
            <div className="flex min-w-[140px] flex-1 items-center gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={dailyProgress.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Meta de contatos de hoje"
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${dailyProgress.pct}%`, backgroundColor: dailyProgress.color }}
                />
              </div>
              <span className="w-10 text-right text-sm font-semibold tabular-nums" style={{ color: dailyProgress.color }}>{dailyProgress.pct}%</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <Timer size={14} aria-hidden className="text-slate-500" />
              <span className="tabular-nums">{dailyProgress.hoursLabel}</span>
              {dailyProgress.hoursPct > 0 && (
                <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-500 transition-all" style={{ width: `${dailyProgress.hoursPct}%` }} />
                </div>
              )}
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            {dailyProgress.contacts >= dailyProgress.goal ? (
              <p className="text-xs font-medium text-green-700">Meta atingida. Bom trabalho.</p>
            ) : (
              <p className="text-xs text-slate-500">Faltam <strong className="font-semibold text-slate-700">{dailyProgress.remaining}</strong> contatos para a meta de hoje</p>
            )}
            <Link href="/meu-progresso" className="shrink-0 text-xs font-medium text-brand-700 hover:underline max-md:py-2">
              Ver meu desempenho
            </Link>
          </div>
        </Panel>
      )}

      {/* Barra de ferramentas: busca + filtros + quentes + atualizar. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            placeholder="Buscar por nome, CNPJ, telefone, e-mail, cidade..."
            aria-label="Buscar tarefas"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9 max-md:h-10 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 max-md:size-10 max-md:right-0"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtros ocasionais recolhidos — só a busca, os quentes e as abas de
            período ficam à vista, que é o uso do dia a dia. */}
        <FilterPanel activeCount={panelFilterCount} onClearAll={clearAllFilters}>
          {isAdmin && (
            <FilterSection label="Responsável">
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                aria-label="Responsável"
                className={`${selectCls} ${filterAssignee !== FILTER_ME ? selectActiveCls : ""}`}
              >
                <option value={FILTER_ME}>Minhas tarefas</option>
                <option value={FILTER_ALL}>Todos os atendentes</option>
                <option value={FILTER_NONE}>Sem atendente</option>
                {otherAttendants.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </FilterSection>
          )}

          <FilterSection label="Situação">
            <select
              value={filterConverted}
              onChange={(e) => setFilterConverted(e.target.value as "all" | "active_clients" | "leads")}
              aria-label="Situação do cliente"
              className={`${selectCls} ${filterConverted !== "all" ? selectActiveCls : ""}`}
            >
              <option value="all">Leads + clientes</option>
              <option value="active_clients">Só clientes ativos</option>
              <option value="leads">Só leads</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Status da tarefa"
              className={`${selectCls} ${filterStatus !== "all" ? selectActiveCls : ""}`}
            >
              <option value="all">Qualquer status</option>
              <option value="pending">Só ativas</option>
            </select>
          </FilterSection>

          <FilterSection label="Canal de contato">
            <Button
              type="button"
              variant="outline"
              aria-pressed={filterContact === "whatsapp"}
              className={filterContact === "whatsapp" ? selectActiveCls : ""}
              onClick={() => setFilterContact(filterContact === "whatsapp" ? "all" : "whatsapp")}
            >
              Tem WhatsApp
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-pressed={filterContact === "email"}
              className={filterContact === "email" ? selectActiveCls : ""}
              onClick={() => setFilterContact(filterContact === "email" ? "all" : "email")}
            >
              Tem e-mail
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-pressed={filterReminder !== "all"}
              className={filterReminder !== "all" ? selectActiveCls : ""}
              onClick={() => setFilterReminder(filterReminder === "active" ? "inactive" : filterReminder === "inactive" ? "all" : "active")}
            >
              {filterReminder === "inactive" ? "Sem lembrete" : "Com lembrete"}
            </Button>
          </FilterSection>

          <FilterSection label="Tags">
            <MultiSelectFilter
              placeholder="Todas as tags"
              noun="tags"
              options={availableTags.map(tag => ({
                value: tag,
                label: tag,
                color: tagColorMap.get(tag) ?? null,
                count: tagCounts.get(tag) ?? 0,
              }))}
              selected={filterTags}
              onChange={setFilterTags}
              matchMode={tagMatchMode}
              onMatchModeChange={setTagMatchMode}
              searchable={availableTags.length > 8}
            />
          </FilterSection>

          <FilterSection label="Localização">
            <MultiSelectFilter
              placeholder="Todos os estados"
              noun="estados"
              options={stateOptions}
              selected={filterStates}
              onChange={setFilterStates}
              searchable={stateOptions.length > 8}
              emptyHint="Nenhuma tarefa com UF identificada"
            />
            <MultiSelectFilter
              placeholder="Todas as cidades"
              noun="cidades"
              options={cityOptions}
              selected={filterCities}
              onChange={setFilterCities}
              searchable
              emptyHint={filterStates.length > 0 ? "Nenhuma cidade nos estados escolhidos" : "Nenhuma tarefa com cidade identificada"}
            />
          </FilterSection>
        </FilterPanel>

        {!!hotLeadsData?.count && (
          <Button
            variant={filterHot ? "default" : "outline"}
            onClick={() => setFilterHot(h => !h)}
            aria-pressed={filterHot}
            className={filterHot ? "" : "text-red-700"}
            title="Leads que abriram ou clicaram em e-mails recentemente"
          >
            <Flame aria-hidden /> {filterHot ? "Só quentes" : `${hotLeadsData.count} quente${hotLeadsData.count === 1 ? "" : "s"}`}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => { void refetch(); }}
          disabled={isFetching}
          aria-label="Atualizar lista de tarefas"
          title="Atualizar"
        >
          <RefreshCw aria-hidden className={isFetching ? 'animate-spin' : ''} />
        </Button>
      </div>

      {isAdmin && showImport && (
        <Panel>
          <PanelHeader
            title="Importar CSV ou lista de clientes"
            description="Suporta CSV com ponto-e-vírgula e listas com traço (nome - telefone - email - cidade - estado)."
            actions={<Button variant="ghost" size="icon-sm" aria-label="Fechar importação" onClick={() => setShowImport(false)}><X aria-hidden /></Button>}
          />
          <div className="space-y-3 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="import-file">Arquivo (.csv ou .txt)</Label>
              <Input id="import-file" type="file" accept=".csv,.txt" onChange={handleCSVImport} />
            </div>
            {importedTasks.length > 0 && (
              <>
                {importSkipped > 0 && (
                  <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {importSkipped} registro{importSkipped > 1 ? 's' : ''} ignorado{importSkipped > 1 ? 's' : ''} — já {importSkipped > 1 ? 'foram excluídos' : 'foi excluído'} anteriormente.
                  </p>
                )}
                <div className="max-h-40 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200 bg-white">
                  {importedTasks.slice(0, 10).map((t, i) => (
                    <div key={i} className="px-3 py-1.5 text-xs text-slate-700">
                      <span className="font-medium text-slate-900">{t.title}</span>
                      {t.notes && <span className="ml-1 text-slate-500">— {t.notes.split('\n')[0]}</span>}
                    </div>
                  ))}
                  {importedTasks.length > 10 && <p className="px-3 py-1.5 text-xs text-slate-500">... e mais {importedTasks.length - 10}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-rep">Atribuir a</Label>
                  <select id="import-rep" value={selectedRepresentative} onChange={(e) => setSelectedRepresentative(e.target.value)} className={`${selectCls} w-full`}>
                    <option value="">Selecionar atendente...</option>
                    {assignOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <p className="text-xs text-slate-500">Os lembretes serão distribuídos automaticamente.</p>
                <div className="flex justify-end">
                  <Button onClick={handleImportTasks} disabled={importLoading}>
                    {importLoading ? `Importando...` : `Importar ${importedTasks.length} tarefas`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Panel>
      )}

      {/* Task Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingTask ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="task-title">Título <span className="text-red-700">*</span></Label>
                <Input id="task-title" type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Nome do cliente ou assunto" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-notes">Anotações</Label>
                <Textarea id="task-notes" ref={notesRef} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Anotações, telefone, e-mail..." style={{ height: 'clamp(120px, 30vh, 260px)', resize: 'vertical' }} />
              </div>
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">E-mail marketing</h3>
              <div className="space-y-1.5">
                <Label htmlFor="task-email">E-mail do cliente</Label>
                <Input id="task-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="cliente@exemplo.com" />
                {editingTask?.email && !editingTask.emailConfirmed && (
                  (formData.email || '').trim().toLowerCase() !== (editingTask.email || '').trim().toLowerCase()
                    ? <p className="text-xs text-green-700">E-mail alterado — será confirmado ao salvar.</p>
                    : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-amber-800">E-mail não confirmado — não será usado em e-mail marketing.</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => handleConfirmEmail(editingTask.id, editingTask.email)}>Confirmar agora</Button>
                      </div>
                    )
                )}
                {editingTask?.email && editingTask.emailConfirmed && (
                  <p className="text-xs text-green-700">E-mail confirmado — usável em e-mail marketing.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>
                  Tags {tagCatalog.length > 0 && <span className="text-red-700">*</span>}
                </Label>
                <div className={`rounded-md border p-3 ${tagCatalog.length > 0 && formData.tags.length === 0 ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                  {formData.tags.length > 0 ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {formData.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md py-0.5 pl-2 pr-1 text-xs font-medium text-white"
                          style={{ backgroundColor: tagColorMap.get(tag) || '#6366f1' }}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            title="Remover tag"
                            aria-label={`Remover tag ${tag}`}
                            className="flex size-5 items-center justify-center rounded-sm text-white hover:bg-white/25 max-md:size-8"
                          >
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-2 text-xs text-slate-500">
                      {tagCatalog.length > 0 ? "Nenhuma tag selecionada. Escolha ao menos uma abaixo." : "Nenhuma tag adicionada ainda."}
                    </p>
                  )}
                  <DropdownMenu open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm">
                        Selecionar tags...
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
                      {tagCatalog.length > 0 ? (
                        tagCatalog.map(tag => (
                          <DropdownMenuCheckboxItem
                            key={tag.id}
                            checked={formData.tags.includes(tag.name)}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={() => toggleTag(tag.name)}
                          >
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: tag.color }} />
                            <span className="flex-1 truncate">{tag.name}</span>
                          </DropdownMenuCheckboxItem>
                        ))
                      ) : (
                        <p className="p-2 text-xs text-slate-600">
                          Nenhuma tag cadastrada. {isAdmin ? "Crie tags em E-mail Marketing → Tags." : "Peça a um administrador para cadastrar tags em E-mail Marketing → Tags."}
                        </p>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Lembrete</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="task-date">Data <span className="text-red-700">*</span></Label>
                  <Input id="task-date" type="date" value={formData.reminderDate} onChange={(e) => setFormData({ ...formData, reminderDate: e.target.value })} aria-invalid={!formData.reminderDate} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="task-time">Hora</Label>
                  <Input id="task-time" type="time" value={formData.reminderTime} onChange={(e) => setFormData({ ...formData, reminderTime: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="flex-1" disabled={saving} onClick={() => handleQuickReminder('30min')}>
                  Lembrar em 30 min
                </Button>
                <Button type="button" size="sm" variant="outline" className="flex-1" disabled={saving} onClick={() => handleQuickReminder('tomorrow')}>
                  Lembrar amanhã
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="reminderEnabled" checked={formData.reminderEnabled} onChange={(e) => setFormData({ ...formData, reminderEnabled: e.target.checked })} className="size-4 accent-brand-700" />
                <Label htmlFor="reminderEnabled" className="font-normal">Ativar notificação no navegador</Label>
              </div>
            </div>

            <div className={`grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 ${isAdmin ? 'sm:grid-cols-2' : ''}`}>
              <div className="space-y-1.5">
                <Label htmlFor="task-priority">Prioridade</Label>
                <select id="task-priority" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })} className={`${selectCls} w-full`}>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </div>
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label htmlFor="task-assignee">Designar para</Label>
                  <select id="task-assignee" value={formData.assignedTo} onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })} className={`${selectCls} w-full`}>
                    <option value="">Nenhum</option>
                    {assignOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <DialogFooter>
              {editingTask && (
                <Button type="button" variant="destructive" className="sm:mr-auto" onClick={() => handleDelete(editingTask.id)}>
                  <Trash2 aria-hidden /> Excluir
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); resetForm(); }}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{editingTask ? "Salvar" : "Criar tarefa"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Filtros de período com contagem: atrasadas / hoje / agendadas são o que o
          atendente persegue; o resto fica à direita, em tom mais discreto. */}
      <div className="-mt-1 flex items-center gap-1 overflow-x-auto pb-1" role="group" aria-label="Filtrar por período do lembrete">
        {primaryTabs.map(tab => {
          const on = reminderTab === tab.key;
          const danger = tab.tone === "danger" && tab.count > 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setReminderTab(tab.key)}
              aria-pressed={on}
              className={`${tabBase} ${on ? (tab.tone === "danger" ? tabOnDanger : tabOn) : tabOff}`}
            >
              {tab.label}
              <span className={`tabular-nums ${on ? "" : danger ? "font-semibold text-red-700" : "text-slate-500"}`}>{tab.count}</span>
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" aria-hidden />
        {moreTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setReminderTab(tab.key)}
            aria-pressed={reminderTab === tab.key}
            className={`${tabBase} ${reminderTab === tab.key ? tabOn : tabOff}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filtros ativos — mostra o recorte atual e deixa remover um a um.
          Sem isto, com vários filtros combinados o atendente perde a noção de
          por que a lista está pequena. */}
      {/* Admin abre só com as próprias tarefas: avisa e dá a saída em um clique. */}
      {isAdmin && filterAssignee === FILTER_ME && !hasFilters && (
        <p className="text-xs text-slate-500">
          Mostrando só as suas tarefas ({filteredTasks.length} de {tasks.length}) ·{" "}
          <button onClick={() => setFilterAssignee(FILTER_ALL)} className="font-medium text-brand-700 underline-offset-2 hover:underline">
            ver de todos os atendentes
          </button>
        </p>
      )}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">
            {filteredTasks.length} de {tasks.length} ·
          </span>
          {activeFilterChips.map(chip => (
            <button
              key={chip.key}
              onClick={chip.clear}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 max-md:min-h-10"
              title="Remover este filtro"
            >
              <span className="text-slate-500">{chip.label}:</span>
              <span className="font-medium">{chip.value}</span>
              <X size={11} aria-hidden />
            </button>
          ))}
          <button
            onClick={clearAllFilters}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 underline-offset-2 transition hover:text-red-700 hover:underline max-md:min-h-10"
          >
            Limpar tudo
          </button>
        </div>
      )}

      {/* Tasks List */}
      {isLoading ? (
        <Panel className="divide-y divide-slate-200">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-4" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="hidden h-4 w-20 md:block" />
              <Skeleton className="size-8" />
              <Skeleton className="size-8" />
            </div>
          ))}
        </Panel>
      ) : isError && tasks.length === 0 ? (
        <QueryError onRetry={() => { void refetch(); }} retrying={isFetching} />
      ) : filteredTasks.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<ClipboardList aria-hidden />}
            title="Nenhuma tarefa encontrada"
            description={hasFilters ? "Nenhuma tarefa bate com os filtros atuais. Remova um filtro ou limpe todos para ver a lista completa." : "Quando houver tarefas, elas aparecem aqui ordenadas pelo próximo lembrete."}
            action={hasFilters
              ? <Button variant="outline" onClick={clearAllFilters}>Limpar filtros</Button>
              : <Button onClick={handleOpenNewTask}><Plus aria-hidden /> Criar primeira tarefa</Button>}
          />
        </Panel>
      ) : (
        <Panel>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5">
            <label className="flex min-h-10 cursor-pointer items-center gap-3 md:min-h-9">
              <input type="checkbox" checked={allSelected} onChange={handleSelectAll} className="size-4 cursor-pointer accent-brand-700" />
              <span className="text-xs font-medium text-slate-600">
                {selectedTasks.size > 0 ? `${selectedTasks.size} selecionada(s)` : `Selecionar tudo (${filteredTasks.length})`}
              </span>
            </label>
            {/* Ações em massa: aparecem só com seleção. */}
            {isAdmin && selectedTasks.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select value={bulkRepresentative} onChange={(e) => setBulkRepresentative(e.target.value)} aria-label="Designar para atendente" className={selectCls}>
                  <option value="">Atendente...</option>
                  {assignOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <Button size="sm" onClick={handleBulkAssign} variant="outline">Designar ({selectedTasks.size})</Button>
                <Button size="sm" variant="outline" onClick={() => setCampaignPickerTaskIds(Array.from(selectedTasks))}>Campanha ({selectedTasks.size})</Button>
                <Button size="sm" variant="outline" onClick={() => setSequencePickerTaskIds(Array.from(selectedTasks))}>Sequência ({selectedTasks.size})</Button>
                <Button size="sm" variant="destructive" onClick={handleBulkDelete}>Deletar ({selectedTasks.size})</Button>
              </div>
            )}
            {!isAdmin && canEmailMarketing && selectedTasks.size > 0 && (
              <div className="ml-auto">
                <Button size="sm" variant="outline" onClick={() => setSequencePickerTaskIds(Array.from(selectedTasks))}>Sequência ({selectedTasks.size})</Button>
              </div>
            )}
          </div>
          <ul className="divide-y divide-slate-200">
          {filteredTasks.map((task: Task) => {
            const rem = reminderInfo(task);
            const rowPhone = phoneOfTask(task);
            const expanded = expandedTaskId === task.id;
            const selected = selectedTasks.has(task.id);
            const prio = task.priority ?? 'medium';
            return (
            <li key={task.id}
              className={`${highlightTaskId === task.id ? 'relative z-10 ring-2 ring-inset ring-brand-500' : ''}`}
              style={highlightTaskId === task.id ? { animation: 'pulse-highlight 1s ease-in-out 3' } : {}}>
              <div
                className={`flex cursor-pointer items-start gap-2 px-3 py-2.5 transition-colors md:items-center md:gap-3 md:px-4 ${selected ? 'bg-brand-50' : expanded ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                onClick={() => setExpandedTaskId(expanded ? null : task.id)}
              >
                <label className="-m-2 flex shrink-0 cursor-pointer items-center justify-center p-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected} onChange={() => handleSelectTask(task.id)} aria-label={`Selecionar ${task.title}`} className="size-4 cursor-pointer accent-brand-700" />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <button type="button" aria-expanded={expanded} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
                      <span className="block text-sm font-medium leading-snug text-slate-900 line-clamp-2 md:truncate">{task.title}</span>
                    </button>
                    {prio !== 'medium' && (
                      <StatusBadge status={prio} className="hidden md:inline-flex">{prio === 'high' ? 'Prioridade alta' : 'Prioridade baixa'}</StatusBadge>
                    )}
                    {task.status && task.status !== 'pending' && (
                      <StatusBadge status={task.status}>{task.status === 'completed' ? 'Concluída' : 'Cancelada'}</StatusBadge>
                    )}
                  </div>
                  {/* Lembrete no celular: abaixo do título, onde a coluna de data não cabe. */}
                  {rem && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs md:hidden">
                      <span className={`font-medium tabular-nums ${rem.isOverdue ? 'text-red-700' : rem.isToday ? 'text-amber-800' : 'text-slate-700'}`}>{rem.dateStr} {rem.timeStr}</span>
                      {rem.isOverdue && <StatusBadge tone="danger">Atrasada{rem.daysOverdue > 0 ? ` ${rem.daysOverdue}d` : ''}</StatusBadge>}
                      {!rem.isOverdue && rem.isToday && <StatusBadge tone="warning">Hoje</StatusBadge>}
                      {prio !== 'medium' && <StatusBadge status={prio}>{prio === 'high' ? 'Alta' : 'Baixa'}</StatusBadge>}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {isAdmin && task.assignedTo && <span className="text-xs text-slate-500">{task.assignedTo}</span>}
                    {task.convertedAt && <StatusBadge tone="success">Cliente ativo</StatusBadge>}
                    {task.hotLead && <StatusBadge tone="danger"><Flame aria-hidden /> Lead quente</StatusBadge>}
                    {hasEmail(`${task.title} ${task.notes ?? ''}`) && <Mail size={12} aria-label="Tem e-mail" className="text-slate-500" />}
                    {task.email && !task.emailConfirmed && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleConfirmEmail(task.id, task.email); }}
                        title="E-mail não confirmado — clique para confirmar e liberar para e-mail marketing"
                        className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
                      >
                        Confirmar e-mail
                      </button>
                    )}
                    {task.email && task.emailConfirmed && (
                      <span title="E-mail confirmado — usável em e-mail marketing" className="inline-flex items-center text-green-700"><MailCheck size={13} aria-label="E-mail confirmado" /></span>
                    )}
                    {(() => {
                      const eng = engagementData?.[task.id];
                      if (!eng || (eng.opens === 0 && eng.clicks === 0)) return null;
                      const title = `Último engajamento: ${eng.lastEventAt ? new Date(eng.lastEventAt).toLocaleString('pt-BR') : '--'}`;
                      return (
                        <StatusBadge tone="warning">
                          <span title={title}>
                            {eng.opens > 0 && `${eng.opens}x`}
                            {eng.opens > 0 && eng.clicks > 0 && ' · '}
                            {eng.clicks > 0 && 'clicou'}
                          </span>
                        </StatusBadge>
                      );
                    })()}
                    {task.tags && task.tags.length > 0 && (
                      <span className="flex flex-wrap gap-1">
                        {task.tags.map(tag => {
                          const color = tagColorMap.get(tag) || '#6366f1';
                          return (
                            <span key={tag} className="rounded-sm px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${color}1A`, color }}>{tag}</span>
                          );
                        })}
                      </span>
                    )}
                    {(() => {
                      const enr = enrollmentsData?.[task.id];
                      if (!enr || (enr.campaigns.length === 0 && enr.sequences.length === 0)) return null;
                      const seqStatusLabel: Record<string, string> = { active: 'ativa', paused: 'pausada', completed: 'concluída', cancelled: 'cancelada' };
                      const seqStatusTone: Record<string, 'info' | 'warning' | 'neutral'> = {
                        active: 'info',
                        paused: 'warning',
                        completed: 'neutral',
                        cancelled: 'neutral',
                      };
                      const campStatusLabel: Record<string, string> = { pending: 'pendente', sent: 'enviada', failed: 'falhou', skipped: 'pulada' };
                      const campStatusTone: Record<string, 'info' | 'success' | 'danger' | 'neutral'> = {
                        pending: 'info',
                        sent: 'success',
                        failed: 'danger',
                        skipped: 'neutral',
                      };
                      return (
                        <span className="flex flex-wrap gap-1">
                          {enr.sequences.map(seq => (
                            <StatusBadge key={`seq-${seq.enrollmentId}`} tone={seqStatusTone[seq.status] ?? 'neutral'} className={seq.status === 'cancelled' ? 'line-through' : ''}>
                              {seq.name} · {seqStatusLabel[seq.status] ?? seq.status}
                              {isAdmin && (seq.status === 'active' || seq.status === 'paused') && (
                                <button
                                  type="button"
                                  title="Remover da sequência" aria-label="Remover da sequência"
                                  className="rounded-sm hover:text-red-700"
                                  onClick={(e) => { e.stopPropagation(); handleCancelEnrollment(seq.enrollmentId); }}
                                ><X size={10} /></button>
                              )}
                            </StatusBadge>
                          ))}
                          {enr.campaigns.map(camp => (
                            <StatusBadge key={`camp-${camp.recipientId}`} tone={campStatusTone[camp.status] ?? 'neutral'}>
                              {camp.name} · {campStatusLabel[camp.status] ?? camp.status}
                              {isAdmin && (
                                <button
                                  type="button"
                                  title="Remover da campanha" aria-label="Remover da campanha"
                                  className="rounded-sm hover:text-red-700"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveCampaignRecipient(camp.recipientId); }}
                                ><X size={10} /></button>
                              )}
                            </StatusBadge>
                          ))}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {/* Próximo lembrete (desktop). */}
                {rem && (
                  <div className="hidden w-28 shrink-0 text-right md:block">
                    <p className={`text-sm font-medium tabular-nums ${rem.isOverdue ? 'text-red-700' : rem.isToday ? 'text-amber-800' : 'text-slate-900'}`}>
                      {rem.dateStr} <span className="font-normal text-slate-500">{rem.timeStr}</span>
                    </p>
                    {rem.isOverdue ? (
                      <StatusBadge tone="danger" className="mt-0.5">Atrasada{rem.daysOverdue > 0 ? ` ${rem.daysOverdue}d` : ''}</StatusBadge>
                    ) : rem.isToday ? (
                      <StatusBadge tone="warning" className="mt-0.5">Hoje</StatusBadge>
                    ) : null}
                  </div>
                )}
                {/* Atalhos na linha recolhida. Sem contexto de carga aqui, o WhatsApp abre só com o
                    número (sem mensagem pronta): a mensagem padrão exige região e sacos. */}
                <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  {rowPhone !== null && (
                    <>
                      <Button asChild variant="ghost" size="icon-sm" className="text-green-700 hover:bg-green-50 hover:text-green-800">
                        <a href={waLink(rowPhone)} target="_blank" rel="noopener noreferrer" aria-label={`Chamar ${task.title} no WhatsApp`} title="WhatsApp">
                          <MessageCircle aria-hidden />
                        </a>
                      </Button>
                      <Button asChild variant="ghost" size="icon-sm">
                        <a href={telLink(rowPhone)} aria-label={`Ligar para ${task.title}`} title="Ligar">
                          <Phone aria-hidden />
                        </a>
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="icon-sm" className="max-md:hidden" aria-label={`Editar ${task.title}`} title="Editar" onClick={() => handleEdit(task)}>
                    <Pencil aria-hidden />
                  </Button>
                </div>
              </div>
              {expanded && (
                <div className="space-y-3 border-t border-slate-200 bg-slate-50 px-3 py-3 md:px-4">
                  {(fullTask?.notes ?? task.notes) && (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-slate-500">Anotações</p>
                      <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">{fullTask?.notes ?? task.notes}</p>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">
                    Prioridade: {PRIORITY_LABEL[prio] ?? prio}
                    {` · Criada: ${new Date(task.createdAt).toLocaleDateString("pt-BR")}`}
                    {!!task.contactCount && ` · ${task.contactCount} contato(s)`}
                    {task.convertedAt && ` · Cliente ativo desde ${new Date(task.convertedAt).toLocaleDateString("pt-BR")}`}
                  </p>
                  {aiSuggestion?.taskId === task.id && (
                    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                      <p className="text-xs font-medium text-slate-500">Sugestão de abordagem</p>
                      <p className="mt-1 text-slate-800">{aiSuggestion.text}</p>
                    </div>
                  )}
                  {/* ── Pedidos vinculados a esta tarefa ──────────────────── */}
                  {!isAdmin && (() => {
                    const taskPedidos = allPedidos.filter(p => p.taskId === task.id);
                    return (
                      <div className="rounded-md border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                          <span className="text-sm font-semibold text-slate-900">Pedidos ({taskPedidos.length})</span>
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPedidoId(null);
                              setOrderDialogTask(task);
                              setOrderDialogOpen(true);
                            }}
                          >
                            <Plus aria-hidden /> Novo pedido
                          </Button>
                        </div>
                        {taskPedidos.length === 0 ? (
                          <p className="px-3 py-4 text-center text-sm text-slate-500">Nenhum pedido criado para esta tarefa.</p>
                        ) : (
                          <div className="divide-y divide-slate-200">
                          {taskPedidos.map((ped) => {
                            const total = totalPedido(ped);
                            const isFat = ped.status === 'faturado';
                            return (
                              <div key={ped.id} className="space-y-1.5 px-3 py-2.5">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <StatusBadge tone={isFat ? 'success' : 'warning'}>{isFat ? 'Faturado' : 'Estimado'}</StatusBadge>
                                  <span className="text-sm font-semibold tabular-nums text-slate-900">{formatBRL(total)}</span>
                                  {ped.cnpj && <span className="text-xs text-slate-500">{ped.cnpj}</span>}
                                </div>
                                {ped.itens.length > 0 && (
                                  <div className="space-y-0.5">
                                    {ped.itens.map((it) => (
                                      <div key={it.id} className="flex justify-between text-xs text-slate-600">
                                        <span className="mr-2 truncate">{it.descricao}</span>
                                        <span className="whitespace-nowrap tabular-nums">{it.quantidade}un x {formatBRL(it.valorUnitario)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {(ped.prazoPagamentoSal || ped.prazoPagamentoFrete || ped.valorFretePorUnidade || ped.observacoes) && (
                                  <div className="space-y-0.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                                    {ped.prazoPagamentoSal && <div><strong className="font-semibold">Prazo sal:</strong> {ped.prazoPagamentoSal}</div>}
                                    {ped.prazoPagamentoFrete && <div><strong className="font-semibold">Prazo frete:</strong> {ped.prazoPagamentoFrete}</div>}
                                    {!!ped.valorFretePorUnidade && <div><strong className="font-semibold">Frete/ton:</strong> {formatBRL(ped.valorFretePorUnidade)}</div>}
                                    {ped.observacoes && <div><strong className="font-semibold">Obs:</strong> {ped.observacoes}</div>}
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  <Button
                                    variant="outline" size="sm"
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
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setInvoicePedidoId(ped.id);
                                        setInvoiceDialogOpen(true);
                                      }}
                                    >
                                      Marcar como faturado
                                    </Button>
                                  )}
                                  {isFat && (
                                    <Button
                                      variant="outline" size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        undoInvoice(ped.id);
                                      }}
                                    >
                                      Desfazer faturamento
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost" size="sm"
                                    className="text-red-700 hover:bg-red-50 hover:text-red-800"
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
                          })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const notesText = fullTask?.notes ?? task.notes ?? '';
                      const phone = phoneOfTask({ phone: task.phone, title: task.title, notes: notesText });
                      const email = extractEmail(`${task.title} ${notesText}`);
                      return (
                        <>
                          {phone && (
                            <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                              <a href={waLink(phone)} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> WhatsApp</a>
                            </Button>
                          )}
                          {phone && (
                            <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                              <a href={telLink(phone)}><Phone aria-hidden /> Ligar</a>
                            </Button>
                          )}
                          {email && (
                            <Button asChild size="sm" variant="outline" onClick={(e) => e.stopPropagation()}>
                              <a href={`mailto:${email}`}><Mail aria-hidden /> E-mail</a>
                            </Button>
                          )}
                        </>
                      );
                    })()}
                    <Button size="sm" variant="outline" onClick={() => handleEdit(task)}><Pencil aria-hidden /> Editar</Button>
                    <Button
                      size="sm"
                      variant={task.convertedAt ? "outline" : "default"}
                      onClick={(e) => handleToggleConverted(task, e)}
                      disabled={toggleConvertedMutation.isPending}
                    >
                      {task.convertedAt ? "Cliente ativo — desmarcar" : "Marcar como cliente ativo"}
                    </Button>
                    {isAdmin && task.email && (
                      <Button size="sm" variant="outline" onClick={() => setCampaignPickerTaskIds([task.id])}>Campanha</Button>
                    )}
                    {canEmailMarketing && task.email && (
                      <Button size="sm" variant="outline" onClick={() => setSequencePickerTaskIds([task.id])}>Sequência</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleAiSuggest(task)} disabled={loadingSuggestion}>
                      {loadingSuggestion && aiSuggestion === null ? "Gerando..." : "Sugestão IA"}
                    </Button>
                    <Button size="sm" variant="destructive" className="md:ml-auto" onClick={() => handleDelete(task.id)}>Deletar</Button>
                  </div>
                </div>
              )}
            </li>
            );
          })}
          </ul>
        </Panel>
      )}

      {/* Delete confirmation modal */}
      <Dialog
        open={deleteConfirm !== null || bulkDeleteConfirm}
        onOpenChange={(open) => { if (!open) { setDeleteConfirm(null); setBulkDeleteConfirm(false); setDeleteReason(""); } }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
            <DialogDescription>
              {bulkDeleteConfirm
                ? `Deletar ${selectedTasks.size} tarefa(s) selecionada(s)?`
                : "Tem certeza que deseja deletar esta tarefa?"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-reason">
              Motivo da exclusão <span className="text-red-700">*</span>
            </Label>
            <Textarea
              id="delete-reason"
              className="resize-none"
              rows={3}
              placeholder="Descreva o motivo (ex: tarefa duplicada, cliente cancelou...)"
              value={deleteReason}
              onChange={e => setDeleteReason(e.target.value)}
              maxLength={500}
              autoFocus
            />
            <p className="text-right text-xs text-slate-500">{deleteReason.length}/500</p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setDeleteConfirm(null); setBulkDeleteConfirm(false); setDeleteReason(""); }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={bulkDeleteConfirm ? confirmBulkDelete : confirmDelete}
              disabled={deleteReason.trim().length < 5}
            >
              Deletar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to active client modal */}
      <Dialog open={!!convertModalTask} onOpenChange={(open) => { if (!open) setConvertModalTask(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como cliente ativo</DialogTitle>
            <DialogDescription>{convertModalTask?.title}</DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            A tag <strong className="font-semibold">"ativo"</strong> será aplicada e você poderá criar o pedido com os produtos.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConvertModalTask(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmConvert} disabled={toggleConvertedMutation.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes warning modal */}
      <Dialog open={showNotesWarning} onOpenChange={(open) => { if (!open) setShowNotesWarning(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anotou as informações importantes?</DialogTitle>
            <DialogDescription>Contato recorrente — cada conversa deve ser documentada.</DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500">Lembre de registrar</p>
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
              <li className="flex items-start gap-3 px-3 py-2.5">
                <Package size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Tipo de sal</p>
                  <p className="text-xs text-slate-500">Refinado, grosso, marinho, industrial…</p>
                </div>
              </li>
              <li className="flex items-start gap-3 px-3 py-2.5">
                <Boxes size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Volume e frequência</p>
                  <p className="text-xs text-slate-500">Ex.: 1.200 sacos/mês de 25kg, pedido trimestral / mensal…</p>
                </div>
              </li>
              <li className="flex items-start gap-3 px-3 py-2.5">
                <Tag size={18} aria-hidden className="mt-0.5 shrink-0 text-slate-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Marca atual</p>
                  <p className="text-xs text-slate-500">Qual fornecedor está usando hoje?</p>
                </div>
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => doSave()} disabled={saving}>
              Já documentei — salvar
            </Button>
            <Button
              type="button"
              onClick={() => {
                setShowNotesWarning(false);
                setIsModalOpen(true); // reopen Dialog so user can edit notes
                setTimeout(() => notesRef.current?.focus(), 200);
              }}
            >
              Voltar e anotar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to campaign modal */}
      <Dialog open={campaignPickerTaskIds !== null} onOpenChange={(open) => { if (!open) setCampaignPickerTaskIds(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar à campanha de e-mail</DialogTitle>
            <DialogDescription>
              {campaignPickerTaskIds?.length === 1 ? "1 tarefa selecionada" : `${campaignPickerTaskIds?.length ?? 0} tarefas selecionadas`}. Apenas tarefas com e-mail cadastrado serão adicionadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {draftCampaigns.length > 0 ? (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {draftCampaigns.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleAddToCampaign(c.id)}
                    disabled={addToCampaignMutation.isPending}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-left transition hover:bg-slate-50 disabled:opacity-50 max-md:min-h-10"
                  >
                    <p className="text-sm font-medium text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.totalRecipients} destinatário(s) · rascunho</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Nenhuma campanha em rascunho. Crie uma campanha na aba{' '}
                <a href="/admin/email-marketing" className="text-brand-700 underline">E-mail Marketing</a>.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCampaignPickerTaskIds(null)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar e-mail + escolher sequência, tudo num único popup */}
      <Dialog open={!!confirmEmailTarget} onOpenChange={(open) => { if (!open && !confirmEmailBusy) setConfirmEmailTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar e-mail</DialogTitle>
            <DialogDescription>
              Confirmar que o e-mail <strong className="font-semibold text-slate-900">{confirmEmailTarget?.email}</strong> está correto? Após confirmar, ele poderá ser usado em campanhas e sequências de e-mail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-900">Incluir em uma sequência agora? <span className="font-normal text-slate-500">(opcional)</span></p>
            {sequencesLoading ? (
              <div className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">
                <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                Carregando sequências...
              </div>
            ) : (
              <RadioGroup
                value={confirmEmailSequenceId !== null ? String(confirmEmailSequenceId) : "none"}
                onValueChange={(v: string) => setConfirmEmailSequenceId(v === "none" ? null : Number(v))}
                className="max-h-56 overflow-y-auto"
              >
                <label className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 transition hover:bg-slate-50 max-md:min-h-10">
                  <RadioGroupItem value="none" className="mt-0.5" />
                  <p className="text-sm font-medium text-slate-900">Decidir depois</p>
                </label>
                {activeSequences.map(s => (
                  <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 transition hover:bg-slate-50">
                    <RadioGroupItem value={String(s.id)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{s.name}</p>
                      {'stepCount' in s && <p className="text-xs text-slate-500">{(s as any).stepCount} passo(s) · {(s as any).activeEnrollments} inscrito(s) ativo(s)</p>}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            )}
            {!sequencesLoading && !canEmailMarketing && (
              <p className="text-xs text-amber-800">
                Você ainda não tem acesso a E-mail Marketing. Peça ao administrador para liberar em Atendentes → editar → "Email Marketing".
              </p>
            )}
            {!sequencesLoading && canEmailMarketing && activeSequences.length === 0 && (
              <p className="text-xs text-slate-500">Nenhuma sequência ativa no momento.</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmEmailTarget(null)} disabled={confirmEmailBusy}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmEmailNow} disabled={confirmEmailBusy}>
              {confirmEmailBusy ? "Confirmando..." : confirmEmailSequenceId !== null ? "Confirmar e inscrever" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll in sequence modal */}
      <Dialog open={sequencePickerTaskIds !== null} onOpenChange={(open) => { if (!open) { setSequencePickerTaskIds(null); setSelectedSequenceId(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inscrever em sequência de e-mail</DialogTitle>
            <DialogDescription>
              {sequencePickerTaskIds?.length === 1 ? "1 tarefa selecionada" : `${sequencePickerTaskIds?.length ?? 0} tarefas selecionadas`}. Apenas tarefas com e-mail cadastrado serão inscritas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {activeSequences.length > 0 ? (
              <RadioGroup value={selectedSequenceId !== null ? String(selectedSequenceId) : ""} onValueChange={(v: string) => setSelectedSequenceId(Number(v))} className="max-h-64 overflow-y-auto">
                {activeSequences.map(s => (
                  <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-200 px-3 py-2 transition hover:bg-slate-50 max-md:min-h-10">
                    <RadioGroupItem value={String(s.id)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{s.name}</p>
                      {'stepCount' in s && <p className="text-xs text-slate-500">{(s as any).stepCount} passo(s) · {(s as any).activeEnrollments} inscrito(s) ativo(s)</p>}
                    </div>
                  </label>
                ))}
              </RadioGroup>
            ) : (
              <p className="text-sm text-slate-600">
                Nenhuma sequência ativa. Peça ao administrador para criar sequências.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setSequencePickerTaskIds(null); setSelectedSequenceId(null); }}>Cancelar</Button>
            <Button
              type="button"
              onClick={handleEnrollInSequence}
              disabled={enrollInSequenceMutation.isPending || selectedSequenceId === null}
            >
              {enrollInSequenceMutation.isPending ? "Inscrevendo..." : "Inscrever"}
            </Button>
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

    </Page>
  );
}
