import { useState, useEffect, useRef, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../_core/hooks/useAuth';
import { RecoveryPanel } from './SalVitaRecovery';
import { B2bLeadsPanel } from './B2bLeads';
import { SalVitaEmailMarketing } from './SalVitaEmailMarketing';
import { BrandLogo } from '../components/premium/BrandLogo';
import { ConfirmDialog } from '../components/premium/admin/ConfirmDialog';
import { ErrorState } from '../components/premium/admin/ErrorState';
import { FOCUS, INPUT, btn } from '../components/premium/admin/adminUi';
import {
  BATCH_LABEL_MAX,
  brl,
  computeKpis,
  csvText,
  errorMessage,
  matchesSearch,
  splitBatchSelection,
} from '../components/premium/admin/adminLogic';
import {
  Package,
  Clock,
  Truck,
  CheckCircle2,
  CircleDollarSign,
  Search,
  Download,
  Sparkles,
  RefreshCw,
  MoreHorizontal,
  Phone,
  Mail,
  MapPin,
  Tag,
  Send,
  FileText,
  X,
  AlertCircle,
  Edit3,
  Trash2,
  Ban,
  LogOut,
  Printer,
  ExternalLink,
  Building2,
  RotateCcw,
  Check,
  ChevronRight,
} from 'lucide-react';

/* ── Status config ────────────────────────────────────────── */
const S_LABEL: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  label_generated: 'Etiqueta Gerada',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

type Pill = { bg: string; text: string; border: string };
const NEUTRAL_PILL: Pill = { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };

const S_PILL: Record<string, Pill> = {
  pending:         { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  confirmed:       { bg: 'bg-slate-100', text: 'text-[#0b1d3a]', border: 'border-slate-300' },
  label_generated: { bg: 'bg-slate-100', text: 'text-[#0b1d3a]', border: 'border-slate-300' },
  shipped:         { bg: 'bg-sky-50', text: 'text-sky-900', border: 'border-sky-200' },
  delivered:       { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  cancelled:       { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

const P_LABEL: Record<string, string> = { awaiting: 'Aguard. Pgto', confirmed: 'Pago', failed: 'Falhou' };
const P_PILL: Record<string, Pill> = {
  awaiting: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  failed:   { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

type FilterTab = 'all' | 'awaiting' | 'confirmed' | 'toship' | 'shipped';
type PeriodFilter = 'all' | 'today' | '7days' | 'month';

/* ── CSV Export ───────────────────────────────────────────── */
const CSV_STATUS: Record<string, string> = { ...S_LABEL };
const CSV_PAY: Record<string, string> = { awaiting: 'Aguardando', confirmed: 'Pago', failed: 'Falhou' };

function exportOrdersToCsv(orders: any[]) {
  if (!orders.length) {
    toast.error('Nenhum pedido para exportar.');
    return;
  }
  const headers = ['ID', 'Cliente', 'Telefone', 'Email', 'CPF', 'CEP', 'Estado', 'Cidade', 'Bairro', 'Endereco', 'Numero', 'Quantidade', 'Produto', 'Valor Frete', 'Valor Total', 'Status Pedido', 'Status Pgto', 'Rastreio', 'Data Criacao'];
  const csvRows = [headers.join(';')];

  for (const o of orders) {
    const row = [
      o.id,
      csvText(o.customerName),
      csvText(o.customerPhone),
      csvText(o.customerEmail),
      csvText(o.customerCpf),
      csvText(o.postalCode),
      csvText(o.state),
      csvText(o.city),
      csvText(o.neighborhood),
      csvText(o.address),
      csvText(o.number),
      o.quantity || 1,
      csvText(o.product || 'Sal Marinho Integral 1kg'),
      (o.shippingPrice || '0').replace('.', ','),
      (o.totalPrice || '0').replace('.', ','),
      csvText(CSV_STATUS[o.status] ?? o.status),
      csvText(CSV_PAY[o.paymentStatus] ?? o.paymentStatus),
      csvText(o.trackingCode),
      csvText(new Date(o.createdAt).toLocaleString('pt-BR')),
    ];
    csvRows.push(row.join(';'));
  }

  const blob = new Blob(['﻿' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sal-vita-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast.success(`Exportados ${orders.length} pedidos em CSV (contém CPF e telefone: guarde com cuidado).`);
}

/* ── Stepper Component ────────────────────────────────────── */
function OrderStepper({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  const isPaid = paymentStatus === 'confirmed';
  const isLabel = ['label_generated', 'shipped', 'delivered'].includes(status);
  const isShipped = ['shipped', 'delivered'].includes(status);
  const isDelivered = status === 'delivered';

  if (status === 'cancelled') {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full text-xs font-semibold text-rose-700">
        <Ban className="w-3.5 h-3.5" aria-hidden="true" />
        Pedido Cancelado
      </div>
    );
  }

  const steps = [
    { label: 'Criado', done: true },
    { label: 'Pago', done: isPaid },
    { label: 'Etiqueta', done: isPaid && isLabel },
    { label: 'Enviado', done: isPaid && isShipped },
    { label: 'Entregue', done: isPaid && isDelivered },
  ];

  return (
    <ol className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 flex-wrap" aria-label="Etapas do pedido">
      {steps.map((s, idx) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span
            className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${
              s.done ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'
            }`}
          >
            {s.done ? <Check className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" /> : idx + 1}
          </span>
          <span className={`text-xs ${s.done ? 'font-semibold text-slate-800' : 'text-slate-500 font-medium'}`}>
            {s.label}{s.done ? ' (feito)' : ''}
          </span>
          {idx < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

/* ── Login Form ───────────────────────────────────────────── */
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const loginMut = trpc.auth.login.useMutation();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginMut.mutateAsync({ email, password });
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message ?? 'Credenciais inválidas');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1d3a] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 md:p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3"><BrandLogo size={56} /></div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Painel Sal Vita Premium</h1>
          <p className="text-xs text-slate-600 mt-1">Acesso restrito à administração</p>
        </div>
        <form onSubmit={handle} className="space-y-4">
          <div>
            <label htmlFor="adm-email" className="block text-xs font-semibold text-slate-700 mb-1.5">E-mail</label>
            <input id="adm-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" placeholder="seu e-mail de acesso" className={INPUT} />
          </div>
          <div>
            <label htmlFor="adm-pass" className="block text-xs font-semibold text-slate-700 mb-1.5">Senha</label>
            <input id="adm-pass" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" className={INPUT} />
          </div>
          <button type="submit" disabled={loading} className={`${btn.primary} w-full mt-2`}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── KPI Metric Card ──────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, urgent }: { icon: any; label: string; value: string | number; sub?: string; urgent?: boolean }) {
  return (
    <div className={`bg-white border rounded-xl p-5 ${urgent ? 'border-[#c9a227]' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-3 text-slate-600">
        <Icon className="w-4 h-4 text-[#0b1d3a]" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        {urgent && <span className="ml-auto text-[10px] font-bold text-[#7a5f0b] bg-[#c9a227]/15 px-2 py-0.5 rounded-full">Ação</span>}
      </div>
      <p className="text-2xl font-bold text-slate-900 tracking-tight leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-2">{sub}</p>}
    </div>
  );
}

/* ── Edit Modal ───────────────────────────────────────────── */
function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function EditModal({ order, onClose, onSaved }: { order: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    customerName: order.customerName ?? '',
    customerPhone: order.customerPhone ?? '',
    customerEmail: order.customerEmail ?? '',
    customerCpf: order.customerCpf ?? '',
    address: order.address ?? '',
    number: order.number ?? '',
    complement: order.complement ?? '',
    neighborhood: order.neighborhood ?? '',
    city: order.city ?? '',
    state: order.state ?? '',
    postalCode: order.postalCode ?? '',
    notes: order.notes ?? '',
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: field === 'state' ? e.target.value.toUpperCase() : e.target.value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const updateMut = trpc.shipping.updateOrder.useMutation({
    onSuccess: () => { toast.success('Pedido atualizado.'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="edit-title" className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-[#0b1d3a]" aria-hidden="true" />
            <h3 id="edit-title" className="text-lg font-bold text-slate-900">Editar Pedido #{order.id}</h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className={btn.icon}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nome completo" wide><input value={form.customerName} onChange={set('customerName')} className={INPUT} /></Field>
          <Field label="Telefone"><input value={form.customerPhone} onChange={set('customerPhone')} inputMode="tel" placeholder="(84) 99999-9999" className={INPUT} /></Field>
          <Field label="CPF"><input value={form.customerCpf} onChange={set('customerCpf')} inputMode="numeric" placeholder="000.000.000-00" className={INPUT} /></Field>
          <Field label="E-mail" wide><input value={form.customerEmail} onChange={set('customerEmail')} type="email" placeholder="cliente@email.com" className={INPUT} /></Field>
          <Field label="CEP"><input value={form.postalCode} onChange={set('postalCode')} inputMode="numeric" placeholder="59000000" className={INPUT} /></Field>
          <Field label="Estado (UF)"><input value={form.state} onChange={set('state')} placeholder="RN" maxLength={2} className={`${INPUT} uppercase`} /></Field>
          <Field label="Cidade"><input value={form.city} onChange={set('city')} className={INPUT} /></Field>
          <Field label="Bairro"><input value={form.neighborhood} onChange={set('neighborhood')} className={INPUT} /></Field>
          <Field label="Endereço" wide><input value={form.address} onChange={set('address')} className={INPUT} /></Field>
          <Field label="Número"><input value={form.number} onChange={set('number')} placeholder="123" className={INPUT} /></Field>
          <Field label="Complemento"><input value={form.complement} onChange={set('complement')} placeholder="Casa, Apto..." className={INPUT} /></Field>
          <Field label="Observações internas" wide><input value={form.notes} onChange={set('notes')} className={INPUT} /></Field>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className={`${btn.secondary} flex-1`}>Cancelar</button>
          <button
            onClick={() => updateMut.mutate({ id: order.id, ...form })}
            disabled={updateMut.isPending}
            className={`${btn.primary} flex-[2]`}
          >
            {updateMut.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Order Card ───────────────────────────────────────────── */
type CardConfirm = 'pay' | 'cancel' | 'delete' | 'wa' | null;

function OrderCard({
  order,
  isSelected,
  onToggleSelect,
  onRefetch,
}: {
  order: any;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRefetch: () => void;
}) {
  const [trackInput, setTrackInput] = useState(order.trackingCode ?? '');
  const [editing, setEditing] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [confirm, setConfirm] = useState<CardConfirm>(null);

  const payMut = trpc.shipping.updateStatus.useMutation({
    onSuccess: () => { onRefetch(); toast.success(`Pagamento do pedido #${order.id} confirmado.`); },
    onError: (e) => toast.error(`Não foi possível confirmar o pagamento: ${e.message}`),
  });
  const updateMut = trpc.shipping.updateStatus.useMutation({
    onSuccess: () => { onRefetch(); toast.success('Status atualizado.'); },
    onError: (e) => toast.error(`Não foi possível atualizar o status: ${e.message}`),
  });
  const labelMut = trpc.shipping.generateLabel.useMutation({
    onSuccess: (d) => { toast.success('Etiqueta gerada.'); window.open(d.labelUrl, '_blank'); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const trackMut = trpc.shipping.updateTracking.useMutation({
    onError: (e) => toast.error(`Rastreio não salvo: ${e.message}`),
  });
  const cancelMut = trpc.shipping.cancelOrder.useMutation({
    onSuccess: (d) => { toast.success(d.actions.join(' · ')); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.shipping.deleteOrder.useMutation({
    onSuccess: () => { toast.success('Pedido excluído.'); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const sendWaDirectMut = trpc.shipping.sendTrackingWhatsApp.useMutation({
    onSuccess: () => toast.success('Rastreio enviado pelo WhatsApp do servidor.'),
    onError: (e) => toast.error(`Erro ao enviar: ${e.message}`),
  });

  const sPill = S_PILL[order.status] ?? NEUTRAL_PILL;
  const wasPaidButCancelled = order.status === 'cancelled' && order.paymentStatus === 'confirmed';
  const pLabel = wasPaidButCancelled ? 'Pago (cancelado)' : (P_LABEL[order.paymentStatus] ?? order.paymentStatus);
  const pPill: Pill = wasPaidButCancelled ? { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' } : (P_PILL[order.paymentStatus] ?? NEUTRAL_PILL);
  const isUrgent = order.paymentStatus === 'confirmed' && !['shipped', 'delivered', 'cancelled'].includes(order.status);
  const isPaid = order.paymentStatus === 'confirmed';
  const date = new Date(order.createdAt);
  const total = brl(parseFloat(order.totalPrice ?? '0'));

  const confirmProps = (() => {
    switch (confirm) {
      case 'pay':
        return {
          title: 'Confirmar pagamento manualmente?',
          description: (
            <>
              <p>Pedido <strong>#{order.id}</strong> de <strong>{order.customerName}</strong>, valor <strong>{total}</strong>.</p>
              <p>O pedido passa a contar como pago, entra na receita e fica liberado para expedição. Use só se o dinheiro já caiu (PIX/Mercado Pago).</p>
            </>
          ),
          confirmLabel: 'Sim, confirmar pagamento',
          destructive: false,
          requireText: undefined as string | undefined,
          run: () => payMut.mutate({ id: order.id, paymentStatus: 'confirmed', status: 'confirmed' }),
        };
      case 'cancel':
        return {
          title: `Cancelar pedido #${order.id}?`,
          description: (
            <>
              <p>Pedido de <strong>{order.customerName}</strong>, valor <strong>{total}</strong>.</p>
              {isPaid && <p><strong>O pedido está pago: o sistema tenta reembolsar o valor integral no Mercado Pago.</strong> Se o reembolso falhar, o pedido não é cancelado.</p>}
              {order.meOrderId && order.meOrderId !== 'pending' && <p>A etiqueta do Melhor Envio também será cancelada.</p>}
            </>
          ),
          confirmLabel: 'Cancelar pedido',
          destructive: true,
          requireText: undefined as string | undefined,
          run: () => cancelMut.mutate({ id: order.id }),
        };
      case 'delete':
        return {
          title: `Excluir pedido #${order.id} para sempre?`,
          description: (
            <>
              <p>Pedido de <strong>{order.customerName}</strong>, valor <strong>{total}</strong>. Não há como desfazer.</p>
              <p>Se o cliente só desistiu, prefira Cancelar: o registro fica no histórico.</p>
            </>
          ),
          confirmLabel: 'Excluir definitivamente',
          destructive: true,
          requireText: String(order.id) as string | undefined,
          run: () => deleteMut.mutate({ id: order.id }),
        };
      case 'wa':
        return {
          title: 'Enviar rastreio pelo WhatsApp?',
          description: (
            <>
              <p>Será enviada <strong>1 mensagem</strong> para <strong>{order.customerName}</strong> ({order.customerPhone}) com o código <span className="font-mono">{order.trackingCode}</span>.</p>
              <p>Se já enviou antes, o cliente recebe de novo.</p>
            </>
          ),
          confirmLabel: 'Enviar mensagem',
          destructive: false,
          requireText: undefined as string | undefined,
          run: () => sendWaDirectMut.mutate({ orderId: order.id }),
        };
      default:
        return null;
    }
  })();

  const labelPending = labelMut.isPending && labelMut.variables?.orderId === order.id;
  const saveTracking = () => {
    const c = trackInput.trim();
    if (!c) return;
    trackMut.mutate(
      { id: order.id, trackingCode: c },
      {
        onSuccess: () => {
          toast.success('Rastreio salvo.');
          // Só vira "Enviado" depois que o rastreio foi gravado de fato.
          if (order.status === 'label_generated') updateMut.mutate({ id: order.id, status: 'shipped' });
          else onRefetch();
        },
      },
    );
  };

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      isSelected ? 'border-[#0b1d3a] ring-2 ring-[#0b1d3a]/20' : isUrgent ? 'border-[#c9a227]' : 'border-slate-200'
    }`}>
      <div className={`h-1 ${
        isPaid ? 'bg-emerald-600' : order.paymentStatus === 'awaiting' ? 'bg-amber-500' : 'bg-rose-600'
      }`} />

      <div className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <label className="flex items-center justify-center min-w-[44px] min-h-[44px] -ml-2 -mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onToggleSelect}
                aria-label={`Selecionar pedido ${order.id}`}
                className={`w-5 h-5 rounded border-slate-400 accent-[#0b1d3a] cursor-pointer ${FOCUS}`}
              />
            </label>

            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold">#{order.id}</span>
                <span className="font-bold text-slate-900 text-base">{order.customerName}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${pPill.bg} ${pPill.text} ${pPill.border}`}>{pLabel}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sPill.bg} ${sPill.text} ${sPill.border}`}>{S_LABEL[order.status] ?? order.status}</span>
              </div>

              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-600">
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" aria-hidden="true" /> {order.customerPhone}</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" /> {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                {order.customerEmail && <span className="flex items-center gap-1 break-all"><Mail className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> {order.customerEmail}</span>}
                {order.customerCpf && <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" aria-hidden="true" /> {order.customerCpf}</span>}
              </div>

              <div className="text-xs text-slate-600 flex items-start gap-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{order.address}, {order.number}{order.complement ? ` (${order.complement})` : ''} — {order.neighborhood}, {order.city}/{order.state} · CEP {order.postalCode}</span>
              </div>

              <div className="pt-1"><OrderStepper status={order.status} paymentStatus={order.paymentStatus} /></div>
            </div>
          </div>

          <div className="md:text-right flex-shrink-0 self-start border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
            <p className="text-2xl font-bold text-slate-900 tracking-tight">{total}</p>
            <p className="text-[11px] text-slate-600">total com frete</p>
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-[#0b1d3a]">
              <Package className="w-3.5 h-3.5" aria-hidden="true" />
              {order.quantity}× {order.product ?? 'Sal Marinho Integral 1kg'}
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              {order.shippingServiceName ?? 'Correios'}: {brl(parseFloat(order.shippingPrice ?? '0'))}
              {order.couponCode && <span className="ml-1.5 text-emerald-700 font-semibold inline-flex items-center gap-0.5"><Tag className="w-3 h-3" aria-hidden="true" />{order.couponCode}</span>}
              {order.couponDiscount && <span className="ml-1 text-emerald-700">-{brl(parseFloat(order.couponDiscount))}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {order.paymentStatus === 'awaiting' && order.status !== 'cancelled' && (
              <button onClick={() => setConfirm('pay')} disabled={payMut.isPending} className={btn.success}>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                {payMut.isPending ? 'Confirmando...' : 'Confirmar Pgto Manual'}
              </button>
            )}

            {isPaid && !order.meLabelUrl && order.status !== 'cancelled' && (
              <button onClick={() => labelMut.mutate({ orderId: order.id })} disabled={labelPending} className={btn.primary}>
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                {labelPending ? 'Gerando...' : 'Gerar Etiqueta (Melhor Envio)'}
              </button>
            )}

            {order.meLabelUrl && (
              <a href={order.meLabelUrl} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                Imprimir Etiqueta
              </a>
            )}

            {order.status === 'label_generated' && isPaid && (
              <button onClick={() => updateMut.mutate({ id: order.id, status: 'shipped' })} disabled={updateMut.isPending} className={btn.primary}>
                <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                Marcar Enviado
              </button>
            )}

            {order.status === 'shipped' && (
              <button onClick={() => updateMut.mutate({ id: order.id, status: 'delivered' })} disabled={updateMut.isPending} className={btn.success}>
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                Marcar Entregue
              </button>
            )}

            {order.trackingCode && (
              <>
                <button onClick={() => setConfirm('wa')} disabled={sendWaDirectMut.isPending} className={btn.success}>
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  {sendWaDirectMut.isPending ? 'Enviando...' : 'Enviar rastreio (WhatsApp)'}
                </button>

                <a
                  href={`https://wa.me/${(order.customerPhone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`🧂 *Sal Vita — Pedido #${order.id}*\n\nOlá ${order.customerName}! Seu pedido foi enviado! 🚚\n\n📦 Código de rastreio: *${order.trackingCode}*\n\n🔗 Rastreie: https://rastreamento.correios.com.br/app/index.php?objetos=${order.trackingCode}\n\nOu acesse: https://www.premium.salvitarn.com.br/meu-pedido\n\nObrigado! 🙏`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={btn.secondary}
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  Abrir no WhatsApp
                </a>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} className={btn.secondary}>
              <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
              Editar
            </button>

            <div className="relative">
              <button
                onClick={() => setShowMoreActions(v => !v)}
                onKeyDown={e => e.key === 'Escape' && setShowMoreActions(false)}
                aria-label="Mais ações do pedido"
                aria-expanded={showMoreActions}
                className={btn.icon}
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>

              {showMoreActions && (
                <div className="absolute right-0 bottom-full mb-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-20 space-y-1" onKeyDown={e => e.key === 'Escape' && setShowMoreActions(false)}>
                  {order.status !== 'cancelled' && order.status !== 'delivered' && (
                    <button
                      onClick={() => { setShowMoreActions(false); setConfirm('cancel'); }}
                      className={`w-full text-left min-h-[44px] px-3 text-xs text-rose-700 font-semibold hover:bg-rose-50 rounded-lg flex items-center gap-2 ${FOCUS}`}
                    >
                      <Ban className="w-3.5 h-3.5" aria-hidden="true" /> Cancelar Pedido
                    </button>
                  )}
                  {isPaid ? (
                    <p className="px-3 py-2 text-[11px] text-slate-600">Pedido pago não pode ser excluído. Use Cancelar (com reembolso).</p>
                  ) : (
                    <button
                      onClick={() => { setShowMoreActions(false); setConfirm('delete'); }}
                      className={`w-full text-left min-h-[44px] px-3 text-xs text-slate-700 hover:bg-slate-100 rounded-lg flex items-center gap-2 ${FOCUS}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Excluir Pedido
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {['confirmed', 'label_generated'].includes(order.status) && isPaid && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 flex-col sm:flex-row">
            <input
              value={trackInput}
              onChange={e => setTrackInput(e.target.value)}
              aria-label="Código de rastreio dos Correios"
              placeholder="Código de rastreio dos Correios (ex: AA123456789BR)"
              className={`${INPUT} flex-1`}
            />
            <button onClick={saveTracking} disabled={!trackInput.trim() || trackMut.isPending || updateMut.isPending} className={btn.success}>
              {order.status === 'label_generated' ? 'Salvar rastreio e marcar enviado' : 'Salvar rastreio'}
            </button>
          </div>
        )}

        {order.meOrderId && (
          <p className="mt-2 text-[11px] text-slate-600 font-mono">
            Melhor Envio: {order.meOrderId}{order.trackingCode ? ` · Rastreio: ${order.trackingCode}` : ''}
          </p>
        )}
      </div>

      {editing && <EditModal order={order} onClose={() => setEditing(false)} onSaved={onRefetch} />}
      {confirmProps && (
        <ConfirmDialog
          open
          onOpenChange={o => !o && setConfirm(null)}
          title={confirmProps.title}
          description={confirmProps.description}
          confirmLabel={confirmProps.confirmLabel}
          destructive={confirmProps.destructive}
          requireText={confirmProps.requireText}
          onConfirm={confirmProps.run}
        />
      )}
    </div>
  );
}

/* ── AI Insights Panel ────────────────────────────────────── */
function AiInsightsPanel() {
  const [result, setResult] = useState<{ insights: string; summary: any } | null>(null);
  const analyzeMut = trpc.shipping.analyzeOrders.useMutation({
    onSuccess: (d) => setResult(d),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="bg-[#0b1d3a] rounded-xl p-6 text-white border border-[#0b1d3a]">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-base tracking-tight">Resumo de vendas com IA</h3>
          <p className="text-xs text-slate-300">Texto gerado por IA a partir dos pedidos; confira os números na lista.</p>
        </div>
        <button
          onClick={() => analyzeMut.mutate()}
          disabled={analyzeMut.isPending}
          className={`${btn.secondary} !bg-white/10 !text-white !border-white/30 hover:!bg-white/20`}
        >
          {analyzeMut.isPending ? 'Analisando...' : result ? 'Atualizar resumo' : 'Gerar resumo'}
        </button>
      </div>

      {result ? (
        <div className="space-y-4">
          {result.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Receita (com frete)', val: brl(result.summary.revenue) },
                { label: 'Pedidos Pagos', val: result.summary.paid },
                { label: 'Ticket Médio', val: brl(result.summary.ticketMedio) },
                { label: 'Últimos 7 Dias', val: result.summary.last7 },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white/5 rounded-xl p-3.5 border border-white/10">
                  <p className="text-[11px] text-slate-300 font-semibold uppercase tracking-wider">{label}</p>
                  <p className="text-lg font-bold mt-1 leading-none">{val}</p>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white/5 rounded-xl p-4 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap border border-white/10">
            {result.insights}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-300 text-center py-4">
          Clique no botão para gerar um resumo escrito das suas vendas.
        </p>
      )}
    </div>
  );
}

/* ── Main Orders Panel ────────────────────────────────────── */
const TAB_BASE = 'min-h-[44px] px-3.5 rounded-xl text-xs font-semibold transition cursor-pointer';

export function OrdersPanel() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAi, setShowAi] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState(false);
  const prevMaxId = useRef(0);

  const { data, isLoading, isError, error, isFetching, refetch } = trpc.shipping.listOrders.useQuery(undefined, {
    refetchInterval: 300_000,
    staleTime: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
  const orders = data ?? [];

  const batchLabelMut = trpc.shipping.batchGenerateLabels.useMutation({
    onSuccess: (d) => {
      const successCount = d.results.filter(r => r.success).length;
      const failCount = d.results.filter(r => !r.success).length;
      toast.success(`Etiquetas em lote: ${successCount} geradas${failCount ? `, ${failCount} com falha` : ''}.`);
      setSelectedIds([]);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const currentMaxId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) : 0;
    if (prevMaxId.current > 0 && currentMaxId > prevMaxId.current) {
      toast.success('Novo pedido recebido.');
    }
    prevMaxId.current = currentMaxId;
  }, [orders]);

  // A seleção pertence à vista atual: trocar aba, período ou busca zera.
  useEffect(() => { setSelectedIds([]); }, [filter, period, search]);

  // Base = período + busca; as abas contam sobre ela (o número bate com a lista).
  const base = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return orders.filter(o => {
      const oDate = new Date(o.createdAt);
      if (period === 'today' && oDate.toDateString() !== todayStr) return false;
      if (period === '7days' && oDate < sevenDaysAgo) return false;
      if (period === 'month' && oDate < firstDayOfMonth) return false;
      return matchesSearch(o as any, search);
    });
  }, [orders, period, search]);

  const isToLabel = (o: any) => o.paymentStatus === 'confirmed' && !['label_generated', 'shipped', 'delivered', 'cancelled'].includes(o.status);
  const isReadyToShip = (o: any) => o.status === 'label_generated' && o.paymentStatus === 'confirmed';
  const isAwaiting = (o: any) => o.paymentStatus === 'awaiting' && o.status !== 'cancelled';
  const isShippedTab = (o: any) => ['shipped', 'delivered'].includes(o.status);

  const filtered = useMemo(() => base.filter(o => {
    if (filter === 'awaiting') return isAwaiting(o);
    if (filter === 'confirmed') return isToLabel(o);
    if (filter === 'toship') return isReadyToShip(o);
    if (filter === 'shipped') return isShippedTab(o);
    return true;
  }), [base, filter]);

  const kpi = computeKpis(orders as any);

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: base.length },
    { key: 'awaiting', label: 'Aguard. Pgto', count: base.filter(isAwaiting).length },
    { key: 'confirmed', label: 'Pago, sem etiqueta', count: base.filter(isToLabel).length },
    { key: 'toship', label: 'Etiqueta gerada', count: base.filter(isReadyToShip).length },
    { key: 'shipped', label: 'Enviados', count: base.filter(isShippedTab).length },
  ];

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === filtered.length ? [] : filtered.map(o => o.id));
  };
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const { eligible, blocked } = splitBatchSelection(filtered as any, selectedIds);
  const overLimit = eligible.length > BATCH_LABEL_MAX;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Pedidos e expedição</h2>
          <p className="text-xs text-slate-600">Acompanhamento e envio dos pedidos da loja Sal Vita Premium.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => exportOrdersToCsv(filtered)} disabled={!filtered.length} className={btn.secondary}>
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Exportar CSV ({filtered.length})
          </button>
          <button onClick={() => setShowAi(s => !s)} aria-pressed={showAi} className={showAi ? btn.primary : btn.secondary}>
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Resumo com IA
          </button>
          <button onClick={() => refetch()} className={btn.icon} aria-label="Atualizar lista" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Package} label="Pedidos ativos" value={kpi.activeOrders} sub={`${kpi.newToday} novos hoje · ${kpi.cancelled} cancelados`} />
          <KpiCard icon={Clock} label="Aguard. Pagamento" value={kpi.awaiting} urgent={kpi.awaiting > 0} />
          <KpiCard
            icon={Truck}
            label="A expedir (pagos)"
            value={kpi.toShip}
            urgent={kpi.toShip > 0}
            sub={kpi.toShip > 0 ? `${kpi.toShipNoLabel} sem etiqueta · ${kpi.toShipWithLabel} com etiqueta` : 'Em dia'}
          />
          <KpiCard
            icon={CircleDollarSign}
            label="Receita de produtos"
            value={brl(kpi.revenueProducts)}
            sub={`Frete ${brl(kpi.revenueShipping)} · Total com frete ${brl(kpi.revenueTotal)} · Ticket ${brl(kpi.ticketTotal)}`}
          />
        </div>
      )}

      {showAi && <AiInsightsPanel />}

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Pesquisar pedidos"
            placeholder="Cliente, telefone, CPF, pedido #, rastreio ou cidade"
            className={`${INPUT} pl-10 pr-11`}
          />
          {search && (
            <button onClick={() => setSearch('')} aria-label="Limpar busca" className={`absolute right-0 top-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-800 ${FOCUS}`}>
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Período">
          {[
            { key: 'all', label: 'Todo Período' },
            { key: 'today', label: 'Hoje' },
            { key: '7days', label: '7 Dias' },
            { key: 'month', label: 'Este Mês' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key as PeriodFilter)}
              aria-pressed={period === p.key}
              className={`${TAB_BASE} ${FOCUS} ${period === p.key ? 'bg-[#0b1d3a] text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Status do pedido">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              aria-pressed={filter === t.key}
              className={`${TAB_BASE} ${FOCUS} ${filter === t.key ? 'bg-[#0b1d3a] text-white' : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'}`}
            >
              {t.label} <span className="opacity-70">({t.count})</span>
            </button>
          ))}
        </div>

        {filtered.length > 0 && (
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-2 cursor-pointer select-none min-h-[44px]">
            <input
              type="checkbox"
              checked={selectedIds.length === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className={`w-5 h-5 rounded border-slate-400 accent-[#0b1d3a] cursor-pointer ${FOCUS}`}
            />
            Selecionar todos ({filtered.length})
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-slate-600" role="status">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" aria-hidden="true" />
          <p className="text-xs font-medium">Carregando lista de pedidos...</p>
        </div>
      ) : isError && !data ? (
        <ErrorState
          title="Não foi possível carregar os pedidos"
          message={`${errorMessage(error)} Isso não significa que não há pedidos.`}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Package className="w-12 h-12 text-slate-400 mx-auto mb-3" aria-hidden="true" />
          <p className="font-bold text-slate-800 text-sm">Nenhum pedido encontrado</p>
          <p className="text-xs text-slate-600 mt-1">Tente ajustar a aba selecionada ou os termos da sua pesquisa.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {isError && (
            <div role="alert" className="flex items-center justify-between gap-3 flex-wrap bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-xs text-rose-900">
              <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" aria-hidden="true" /> Falha ao atualizar: a lista abaixo pode estar desatualizada.</span>
              <button onClick={() => refetch()} className={btn.secondary}>Tentar de novo</button>
            </div>
          )}
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              isSelected={selectedIds.includes(order.id)}
              onToggleSelect={() => toggleSelect(order.id)}
              onRefetch={refetch}
            />
          ))}
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 bg-[#0b1d3a] text-white rounded-xl shadow-2xl px-4 py-3 border border-[#c9a227]/40 z-40 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold">{selectedIds.length} selecionado(s)</span>
          {blocked.length > 0 && (
            <span className="text-xs text-[#f3d77a]" role="status">
              {blocked.length} não entra(m) em etiqueta: {blocked.slice(0, 3).map(b => `#${b.order.id} ${b.reason}`).join(', ')}{blocked.length > 3 ? '...' : ''}
            </span>
          )}
          {overLimit && <span className="text-xs text-[#f3d77a]" role="status">Máximo de {BATCH_LABEL_MAX} etiquetas por vez.</span>}
          <button
            onClick={() => setConfirmBatch(true)}
            disabled={batchLabelMut.isPending || eligible.length === 0 || overLimit}
            className={`${btn.secondary} !bg-white !text-[#0b1d3a]`}
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            {batchLabelMut.isPending ? 'Gerando em lote...' : `Gerar etiquetas (${eligible.length})`}
          </button>
          <button
            onClick={() => exportOrdersToCsv(filtered.filter(o => selectedIds.includes(o.id)))}
            className={`${btn.secondary} !bg-transparent !text-white !border-white/40`}
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Exportar
          </button>
          <button onClick={() => setSelectedIds([])} className={`min-h-[44px] px-2 text-xs text-slate-200 hover:text-white underline ${FOCUS}`}>
            Limpar
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmBatch}
        onOpenChange={setConfirmBatch}
        title={`Gerar ${eligible.length} etiqueta(s)?`}
        description={
          <>
            <p><strong>Isto gera cobrança no Melhor Envio</strong>: uma etiqueta para cada um dos <strong>{eligible.length}</strong> pedido(s) pagos selecionados ({eligible.map(o => `#${o.id}`).join(', ')}).</p>
            {blocked.length > 0 && <p>{blocked.length} pedido(s) selecionado(s) serão ignorados (cancelado, não pago ou já com etiqueta).</p>}
          </>
        }
        confirmLabel={`Gerar ${eligible.length} etiqueta(s)`}
        onConfirm={() => batchLabelMut.mutate({ orderIds: eligible.map(o => o.id) })}
      />
    </div>
  );
}

/* ── Unified Admin Shell ──────────────────────────────────── */
type Section = 'orders' | 'recovery' | 'b2b' | 'email-marketing';

const SECTIONS: { key: Section; label: string; icon: any; path: string }[] = [
  { key: 'orders',          label: 'Pedidos',     icon: Package,   path: '/sal-vita-admin' },
  { key: 'recovery',        label: 'Recuperação', icon: RotateCcw, path: '/sal-vita-recovery' },
  { key: 'b2b',             label: 'Leads B2B',   icon: Building2, path: '/sal-vita-b2b' },
  { key: 'email-marketing', label: 'E-mail',      icon: Mail,      path: '/sal-vita-email-marketing' },
];

function sectionFromPath(): Section {
  if (typeof window === 'undefined') return 'orders';
  const found = SECTIONS.find(s => s.path === window.location.pathname);
  return found?.key ?? 'orders';
}

function AdminShell() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>(sectionFromPath);
  const logoutMut = trpc.auth.logout.useMutation();

  const go = (key: Section) => {
    setSection(key);
    const target = SECTIONS.find(s => s.key === key)!.path;
    if (window.location.pathname !== target) window.history.replaceState(null, '', target);
  };

  const handleLogout = async () => {
    try {
      await logoutMut.mutateAsync();
      window.location.reload();
    } catch (e: any) {
      toast.error(`Não foi possível sair: ${e?.message ?? 'erro de conexão'}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="bg-[#0b1d3a] text-white sticky top-0 z-40 border-b-2 border-[#c9a227]">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between gap-3 flex-wrap py-2 md:py-0 md:h-16 md:flex-nowrap">
            <div className="flex items-center gap-3 min-w-0">
              <BrandLogo size={36} white />
              <span className="font-bold text-sm text-white tracking-tight truncate">Painel Premium</span>
            </div>

            <nav aria-label="Seções do painel" className="order-last md:order-none w-full md:w-auto overflow-x-auto -mx-1 px-1">
              <div className="flex items-center gap-1 w-max">
                {SECTIONS.map(s => {
                  const Icon = s.icon;
                  const active = section === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => go(s.key)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2 px-4 min-h-[44px] rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${FOCUS} ${
                        active ? 'bg-white text-[#0b1d3a]' : 'text-slate-200 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-200 font-medium hidden lg:inline-block">{user?.name}</span>
              <button
                onClick={handleLogout}
                disabled={logoutMut.isPending}
                className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-2 text-slate-200 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer text-xs font-semibold ${FOCUS}`}
                aria-label="Encerrar sessão"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {section === 'orders' && <OrdersPanel />}
        {section === 'recovery' && <RecoveryPanel />}
        {section === 'b2b' && <B2bLeadsPanel />}
        {section === 'email-marketing' && <SalVitaEmailMarketing />}
      </main>
    </div>
  );
}

export default function SalVitaAdmin() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1d3a] flex items-center justify-center" role="status">
        <RefreshCw className="w-6 h-6 animate-spin text-white/70" aria-label="Carregando" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return <LoginForm />;
  return <AdminShell />;
}
