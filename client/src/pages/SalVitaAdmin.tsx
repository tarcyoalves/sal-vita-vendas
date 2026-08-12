import { useState, useEffect, useRef, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../_core/hooks/useAuth';
import { RecoveryPanel } from './SalVitaRecovery';
import { B2bLeadsPanel } from './B2bLeads';
import {
  Package,
  Clock,
  Truck,
  CheckCircle2,
  DollarSign,
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
  ShieldCheck,
  Building2,
  RotateCcw,
  Check,
  Layers
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

const S_PILL: Record<string, { bg: string; text: string; border: string }> = {
  pending:         { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  confirmed:       { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  label_generated: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
  shipped:         { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200' },
  delivered:       { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  cancelled:       { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

const P_LABEL: Record<string, string> = { awaiting: 'Aguard. Pgto', confirmed: 'Pago ✓', failed: 'Falhou' };
const P_PILL: Record<string, { bg: string; text: string; border: string }> = {
  awaiting: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  confirmed: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  failed:   { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

type FilterTab = 'all' | 'awaiting' | 'confirmed' | 'toship' | 'shipped';
type PeriodFilter = 'all' | 'today' | '7days' | 'month';

/* ── CSV Export ───────────────────────────────────────────── */
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
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${o.customerPhone || ''}"`,
      `"${o.customerEmail || ''}"`,
      `"${o.customerCpf || ''}"`,
      `"${o.postalCode || ''}"`,
      `"${o.state || ''}"`,
      `"${o.city || ''}"`,
      `"${o.neighborhood || ''}"`,
      `"${(o.address || '').replace(/"/g, '""')}"`,
      `"${o.number || ''}"`,
      o.quantity || 1,
      `"${o.product || 'Sal Marinho Integral 1kg'}"`,
      (o.shippingPrice || '0').replace('.', ','),
      (o.totalPrice || '0').replace('.', ','),
      o.status,
      o.paymentStatus,
      `"${o.trackingCode || ''}"`,
      `"${new Date(o.createdAt).toLocaleString('pt-BR')}"`,
    ];
    csvRows.push(row.join(';'));
  }

  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sal-vita-pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exportados ${orders.length} pedidos em CSV!`);
}

/* ── Stepper Component ────────────────────────────────────── */
function OrderStepper({ status, paymentStatus }: { status: string; paymentStatus: string }) {
  const isPaid = paymentStatus === 'confirmed';
  const isLabel = ['label_generated', 'shipped', 'delivered'].includes(status);
  const isShipped = ['shipped', 'delivered'].includes(status);
  const isDelivered = status === 'delivered';
  const isCancelled = status === 'cancelled';

  if (isCancelled) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full text-xs font-semibold text-rose-700">
        <Ban className="w-3.5 h-3.5" />
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
    <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-1.5 rounded-xl border border-slate-200/80 flex-wrap">
      {steps.map((s, idx) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <div
            className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center transition-colors ${
              s.done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
            }`}
          >
            {s.done ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : idx + 1}
          </div>
          <span className={`text-xs ${s.done ? 'font-semibold text-slate-800' : 'text-slate-400 font-medium'}`}>
            {s.label}
          </span>
          {idx < steps.length - 1 && <span className="text-slate-300 text-xs">➔</span>}
        </div>
      ))}
    </div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10 w-full max-w-md border border-slate-100">
        <div className="text-center mb-8">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" className="h-14 w-auto mx-auto mb-3">
            <defs><clipPath id="oval-adm"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="white"/>
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#0C3680" clipPath="url(#oval-adm)"/>
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="#0C3680">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="#0C3680" strokeWidth="15"/>
          </svg>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Painel Sal Vita Premium</h1>
          <p className="text-xs text-slate-500 mt-1">premium.salvitarn.com.br</p>
        </div>
        <form onSubmit={handle} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="admin@salvitarn.com.br"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm shadow-md transition disabled:opacity-50 cursor-pointer mt-2"
          >
            {loading ? 'Entrando...' : 'Entrar no Sistema'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── KPI Metric Card ──────────────────────────────────────── */
function KpiCard({ icon: Icon, label, value, sub, accentColor = 'text-blue-600', urgent }: { icon: any; label: string; value: string | number; sub?: string; accentColor?: string; urgent?: boolean }) {
  return (
    <div className={`bg-white border rounded-2xl p-5 relative overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md ${urgent ? 'border-amber-300 bg-amber-50/20 ring-2 ring-amber-400/20' : 'border-slate-200/80'}`}>
      {urgent && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl bg-slate-100/80 ${accentColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 tracking-tight leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-2 font-medium">{sub}</p>}
    </div>
  );
}

/* ── Edit Modal ───────────────────────────────────────────── */
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
    setForm(f => ({ ...f, [field]: e.target.value }));

  const updateMut = trpc.shipping.updateOrder.useMutation({
    onSuccess: () => { toast.success('Pedido atualizado!'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-blue-900" />
            <h3 className="text-lg font-bold text-slate-900">Editar Pedido #{order.id}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Nome completo</label>
            <input value={form.customerName} onChange={set('customerName')} className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Telefone</label>
            <input value={form.customerPhone} onChange={set('customerPhone')} placeholder="(84) 99999-9999" className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">CPF</label>
            <input value={form.customerCpf} onChange={set('customerCpf')} placeholder="000.000.000-00" className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">E-mail</label>
            <input value={form.customerEmail} onChange={set('customerEmail')} placeholder="cliente@email.com" className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">CEP</label>
            <input value={form.postalCode} onChange={set('postalCode')} placeholder="59000000" className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Estado (UF)</label>
            <input value={form.state} onChange={set('state')} placeholder="RN" maxLength={2} className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Cidade</label>
            <input value={form.city} onChange={set('city')} className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Bairro</label>
            <input value={form.neighborhood} onChange={set('neighborhood')} className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Endereço</label>
            <input value={form.address} onChange={set('address')} className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Número</label>
            <input value={form.number} onChange={set('number')} placeholder="123" className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Complemento</label>
            <input value={form.complement} onChange={set('complement')} placeholder="Casa, Apto..." className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Observações internas</label>
            <input value={form.notes} onChange={set('notes')} className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-900/20" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-sm transition">
            Cancelar
          </button>
          <button
            onClick={() => updateMut.mutate({ id: order.id, ...form })}
            disabled={updateMut.isPending}
            className="flex-2 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition disabled:opacity-50"
          >
            {updateMut.isPending ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Order Card ───────────────────────────────────────────── */
function OrderCard({
  order,
  isSelected,
  onToggleSelect,
  onRefetch
}: {
  order: any;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRefetch: () => void;
}) {
  const [trackInput, setTrackInput] = useState(order.trackingCode ?? '');
  const [editing, setEditing] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);

  const updateMut = trpc.shipping.updateStatus.useMutation({ onSuccess: () => { onRefetch(); toast.success('Status atualizado!'); } });
  const labelMut = trpc.shipping.generateLabel.useMutation({
    onSuccess: (d) => { toast.success('Etiqueta gerada!'); window.open(d.labelUrl, '_blank'); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const trackMut = trpc.shipping.updateTracking.useMutation({
    onSuccess: () => { onRefetch(); toast.success('Rastreio salvo!'); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.shipping.cancelOrder.useMutation({
    onSuccess: (d) => { toast.success(d.actions.join(' · ')); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.shipping.deleteOrder.useMutation({
    onSuccess: () => { toast.success('Pedido excluído!'); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const sendWaDirectMut = trpc.shipping.sendTrackingWhatsApp.useMutation({
    onSuccess: () => toast.success('🚀 Rastreio disparado via WhatsApp do servidor!'),
    onError: (e) => toast.error(`Erro ao enviar: ${e.message}`),
  });

  const sPill = S_PILL[order.status] ?? { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' };
  const wasPaidButCancelled = order.status === 'cancelled' && order.paymentStatus === 'confirmed';
  const pLabel = wasPaidButCancelled ? 'Pago (cancelado)' : (P_LABEL[order.paymentStatus] ?? order.paymentStatus);
  const pPill = wasPaidButCancelled ? { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' } : (P_PILL[order.paymentStatus] ?? { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' });
  const isUrgent = order.paymentStatus === 'confirmed' && !['shipped', 'delivered', 'cancelled'].includes(order.status);
  const date = new Date(order.createdAt);

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
      isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-500/20' : isUrgent ? 'border-blue-200 shadow-sm' : 'border-slate-200/80 shadow-xs'
    }`}>
      {/* Accent top bar */}
      <div className={`h-1 ${
        order.paymentStatus === 'confirmed' ? 'bg-emerald-500' : order.paymentStatus === 'awaiting' ? 'bg-amber-500' : 'bg-rose-500'
      }`} />

      <div className="p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          {/* Main Info Block */}
          <div className="flex items-start gap-3 flex-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="mt-1 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-blue-900 cursor-pointer"
            />

            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-semibold">#{order.id}</span>
                <span className="font-bold text-slate-900 text-base">{order.customerName}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${pPill.bg} ${pPill.text} ${pPill.border}`}>
                  {pLabel}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sPill.bg} ${sPill.text} ${sPill.border}`}>
                  {S_LABEL[order.status] ?? order.status}
                </span>
              </div>

              {/* Contact & Date row */}
              <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-500">
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-slate-400" /> {order.customerPhone}</span>
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                {order.customerEmail && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-slate-400" /> {order.customerEmail}</span>}
                {(order as any).customerCpf && <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-slate-400" /> {(order as any).customerCpf}</span>}
              </div>

              {/* Address */}
              <div className="text-xs text-slate-500 flex items-start gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                <span>{order.address}, {order.number}{order.complement ? ` (${order.complement})` : ''} — {order.neighborhood}, {order.city}/{order.state} · CEP {order.postalCode}</span>
              </div>

              {/* Order Stepper */}
              <div className="pt-1">
                <OrderStepper status={order.status} paymentStatus={order.paymentStatus} />
              </div>
            </div>
          </div>

          {/* Pricing & Product Box */}
          <div className="text-right flex-shrink-0 self-start border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
            <p className="text-2xl font-bold text-slate-900 tracking-tight">R$ {parseFloat(order.totalPrice ?? '0').toFixed(2).replace('.', ',')}</p>
            <div className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 border border-blue-100 rounded-lg text-xs font-semibold text-blue-900">
              <Package className="w-3.5 h-3.5 text-blue-600" />
              {order.quantity}× {order.product ?? 'Sal Marinho Integral 1kg'}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {order.shippingServiceName ?? 'Correios'}: R$ {parseFloat(order.shippingPrice ?? '0').toFixed(2).replace('.', ',')}
              {(order as any).couponCode && <span className="ml-1.5 text-emerald-600 font-semibold">🎁 {(order as any).couponCode}</span>}
              {(order as any).couponDiscount && <span className="ml-1 text-emerald-600">-R$ {parseFloat((order as any).couponDiscount).toFixed(2).replace('.', ',')}</span>}
            </p>
          </div>
        </div>

        {/* Primary & Secondary Actions Bar */}
        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {order.paymentStatus === 'awaiting' && order.status !== 'cancelled' && (
              <button
                onClick={() => { updateMut.mutate({ id: order.id, paymentStatus: 'confirmed', status: 'confirmed' }); toast.success('Pagamento confirmado!'); }}
                disabled={updateMut.isPending}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Confirmar Pgto Manual
              </button>
            )}

            {order.paymentStatus === 'confirmed' && !order.meLabelUrl && order.status !== 'cancelled' && (
              <button
                onClick={() => labelMut.mutate({ orderId: order.id })}
                disabled={labelMut.isPending && labelMut.variables?.orderId === order.id}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                {labelMut.isPending && labelMut.variables?.orderId === order.id ? 'Gerando...' : 'Gerar Etiqueta ME'}
              </button>
            )}

            {order.meLabelUrl && (
              <a
                href={order.meLabelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-600" />
                Imprimir Etiqueta
              </a>
            )}

            {order.status === 'label_generated' && order.paymentStatus === 'confirmed' && (
              <button
                onClick={() => updateMut.mutate({ id: order.id, status: 'shipped' })}
                disabled={updateMut.isPending}
                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                Marcar Enviado
              </button>
            )}

            {order.status === 'shipped' && (
              <button
                onClick={() => updateMut.mutate({ id: order.id, status: 'delivered' })}
                disabled={updateMut.isPending}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Marcar Entregue
              </button>
            )}

            {order.trackingCode && (
              <>
                <button
                  onClick={() => sendWaDirectMut.mutate({ orderId: order.id })}
                  disabled={sendWaDirectMut.isPending}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sendWaDirectMut.isPending ? 'Enviando...' : 'Enviar WA (Servidor)'}
                </button>

                <a
                  href={`https://wa.me/${(order.customerPhone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`🧂 *Sal Vita — Pedido #${order.id}*\n\nOlá ${order.customerName}! Seu pedido foi enviado! 🚚\n\n📦 Código de rastreio: *${order.trackingCode}*\n\n🔗 Rastreie: https://rastreamento.correios.com.br/app/index.php?objetos=${order.trackingCode}\n\nOu acesse: https://premium.salvitarn.com.br/meu-pedido\n\nObrigado! 🙏`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                  WA Manual
                </a>
              </>
            )}
          </div>

          {/* Edit / More Options Dropdown */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
              Editar
            </button>

            <div className="relative">
              <button
                onClick={() => setShowMoreActions(!showMoreActions)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 transition border border-slate-200 cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showMoreActions && (
                <div className="absolute right-0 bottom-full mb-1 w-44 bg-white rounded-2xl shadow-xl border border-slate-100 p-1.5 z-20 space-y-1">
                  {order.status !== 'cancelled' && order.status !== 'delivered' && (
                    <button
                      onClick={() => { setShowMoreActions(false); if (window.confirm(`Cancelar pedido #${order.id}?`)) cancelMut.mutate({ id: order.id }); }}
                      className="w-full text-left px-3 py-1.5 text-xs text-rose-600 font-semibold hover:bg-rose-50 rounded-xl flex items-center gap-2"
                    >
                      <Ban className="w-3.5 h-3.5" /> Cancelar Pedido
                    </button>
                  )}
                  <button
                    onClick={() => { setShowMoreActions(false); if (window.confirm(`Excluir PERMANENTEMENTE o pedido #${order.id}?`)) deleteMut.mutate({ id: order.id }); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-xl flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir Pedido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tracking Input Bar */}
        {['confirmed', 'label_generated'].includes(order.status) && order.paymentStatus === 'confirmed' && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            <input
              value={trackInput}
              onChange={e => setTrackInput(e.target.value)}
              placeholder="Código de rastreio dos Correios (ex: AA123456789BR)"
              className="flex-1 px-3.5 py-1.5 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20"
            />
            <button
              onClick={() => {
                const c = trackInput.trim();
                if (c) {
                  trackMut.mutate({ id: order.id, trackingCode: c });
                  if (order.status === 'label_generated') updateMut.mutate({ id: order.id, status: 'shipped' });
                }
              }}
              disabled={!trackInput.trim()}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition disabled:opacity-40 cursor-pointer"
            >
              Salvar & Enviar
            </button>
          </div>
        )}

        {order.meOrderId && (
          <p className="mt-2 text-[10px] text-slate-400 font-mono">
            ME ID: {order.meOrderId}{order.trackingCode ? ` · Rastreio: ${order.trackingCode}` : ''}
          </p>
        )}
      </div>

      {editing && <EditModal order={order} onClose={() => setEditing(false)} onSaved={onRefetch} />}
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
    <div className="bg-gradient-to-br from-slate-900 to-blue-950 rounded-3xl p-6 text-white shadow-xl border border-slate-800">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-white/10 rounded-2xl">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-base tracking-tight">Análise Preditiva de Vendas (IA)</h3>
            <p className="text-xs text-slate-400">Powered by Groq · Llama 3.3</p>
          </div>
        </div>
        <button
          onClick={() => analyzeMut.mutate()}
          disabled={analyzeMut.isPending}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl font-semibold text-xs transition cursor-pointer disabled:opacity-50"
        >
          {analyzeMut.isPending ? 'Analisando dados...' : result ? 'Atualizar Análise' : 'Gerar Relatório IA'}
        </button>
      </div>

      {result ? (
        <div className="space-y-4">
          {result.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Receita Total', val: `R$ ${result.summary.revenue.toFixed(2).replace('.', ',')}` },
                { label: 'Pedidos Pagos', val: result.summary.paid },
                { label: 'Ticket Médio', val: `R$ ${result.summary.ticketMedio.toFixed(2).replace('.', ',')}` },
                { label: 'Últimos 7 Dias', val: result.summary.last7 },
              ].map(({ label, val }) => (
                <div key={label} className="bg-white/5 rounded-2xl p-3.5 border border-white/5">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
                  <p className="text-lg font-bold mt-1 leading-none">{val}</p>
                </div>
              ))}
            </div>
          )}
          <div className="bg-white/5 rounded-2xl p-4 text-xs leading-relaxed font-sans text-slate-200 whitespace-pre-wrap border border-white/5">
            {result.insights}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-4">
          Clique no botão para gerar um diagnóstico completo com inteligência artificial sobre suas vendas.
        </p>
      )}
    </div>
  );
}

/* ── Main Orders Panel ────────────────────────────────────── */
export function OrdersPanel() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAi, setShowAi] = useState(false);
  const prevMaxId = useRef(0);

  const { data: orders = [], isLoading, refetch } = trpc.shipping.listOrders.useQuery(undefined, {
    refetchInterval: 300_000,
    staleTime: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false
  });

  const batchLabelMut = trpc.shipping.batchGenerateLabels.useMutation({
    onSuccess: (d) => {
      const successCount = d.results.filter(r => r.success).length;
      const failCount = d.results.filter(r => !r.success).length;
      toast.success(`Etiquetas em lote: ${successCount} geradas! ${failCount ? `(${failCount} falhas)` : ''}`);
      setSelectedIds([]);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const currentMaxId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) : 0;
    if (prevMaxId.current > 0 && currentMaxId > prevMaxId.current) {
      toast.success('🛍️ Novo pedido recebido!');
    }
    prevMaxId.current = currentMaxId;
  }, [orders]);

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return orders.filter(o => {
      if (filter === 'awaiting' && (o.paymentStatus !== 'awaiting' || o.status === 'cancelled')) return false;
      if (filter === 'confirmed' && (o.paymentStatus !== 'confirmed' || ['label_generated', 'shipped', 'delivered', 'cancelled'].includes(o.status))) return false;
      if (filter === 'toship' && (o.status !== 'label_generated' || o.paymentStatus !== 'confirmed')) return false;
      if (filter === 'shipped' && !['shipped', 'delivered'].includes(o.status)) return false;

      const oDate = new Date(o.createdAt);
      if (period === 'today' && oDate.toDateString() !== todayStr) return false;
      if (period === '7days' && oDate < sevenDaysAgo) return false;
      if (period === 'month' && oDate < firstDayOfMonth) return false;

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const nameMatch = (o.customerName || '').toLowerCase().includes(q);
        const phoneMatch = (o.customerPhone || '').includes(q);
        const emailMatch = (o.customerEmail || '').toLowerCase().includes(q);
        const cpfMatch = (o.customerCpf || '').includes(q);
        const idMatch = String(o.id) === q || `#${o.id}` === q;
        const cityMatch = (o.city || '').toLowerCase().includes(q);
        const trackMatch = (o.trackingCode || '').toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch && !emailMatch && !cpfMatch && !idMatch && !cityMatch && !trackMatch) {
          return false;
        }
      }

      return true;
    });
  }, [orders, filter, period, search]);

  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString());
  const paidOrders = orders.filter(o => o.paymentStatus === 'confirmed' && o.status !== 'cancelled');
  const revenue = paidOrders.reduce((s, o) => s + parseFloat(o.totalPrice ?? '0'), 0);
  const ticketMedio = paidOrders.length ? revenue / paidOrders.length : 0;
  const awaitingCount = orders.filter(o => o.paymentStatus === 'awaiting' && o.status !== 'cancelled').length;
  const toShipCount = orders.filter(o => o.status === 'label_generated' && o.paymentStatus === 'confirmed').length;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: orders.length },
    { key: 'awaiting', label: 'Aguard. Pgto', count: awaitingCount },
    { key: 'confirmed', label: 'Pago → Etiqueta', count: orders.filter(o => o.paymentStatus === 'confirmed' && !['label_generated', 'shipped', 'delivered', 'cancelled'].includes(o.status)).length },
    { key: 'toship', label: 'Pendentes Envio', count: toShipCount },
    { key: 'shipped', label: 'Enviados', count: orders.filter(o => ['shipped', 'delivered'].includes(o.status)).length },
  ];

  const toggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(o => o.id));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  return (
    <div className="space-y-6">
      {/* Upper Control Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Painel de Vendas & Fulfillment</h2>
          <p className="text-xs text-slate-500">Acompanhamento e expedição de pedidos da loja Sal Vita Premium.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportOrdersToCsv(filtered)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" /> Exportar CSV ({filtered.length})
          </button>
          <button
            onClick={() => setShowAi(s => !s)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              showAi ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${showAi ? 'text-blue-400' : 'text-blue-600'}`} /> IA Insights
          </button>
          <button
            onClick={() => refetch()}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl transition cursor-pointer"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Package} label="Total Pedidos" value={orders.length} sub={`${todayOrders.length} novos hoje`} accentColor="text-blue-600" />
        <KpiCard icon={Clock} label="Aguard. Pagamento" value={awaitingCount} accentColor="text-amber-600" urgent={awaitingCount > 0} />
        <KpiCard icon={Truck} label="Pendentes Envio" value={toShipCount} accentColor="text-indigo-600" urgent={toShipCount > 0} sub={toShipCount > 0 ? 'Expedição necessária' : 'Em dia'} />
        <KpiCard icon={DollarSign} label="Receita Confirmada" value={`R$ ${revenue.toFixed(2).replace('.', ',')}`} accentColor="text-emerald-600" sub={`Ticket Médio R$ ${ticketMedio.toFixed(2).replace('.', ',')}`} />
      </div>

      {/* AI Panel */}
      {showAi && <AiInsightsPanel />}

      {/* Search & Period Filter Box */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por cliente, telefone, CPF, pedido #, rastreio ou cidade..."
            className="w-full pl-10 pr-8 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 self-start md:self-auto flex-wrap">
          {[
            { key: 'all', label: 'Todo Período' },
            { key: 'today', label: 'Hoje' },
            { key: '7days', label: '7 Dias' },
            { key: 'month', label: 'Este Mês' },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key as PeriodFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                period === p.key ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status Tabs Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                filter === t.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              {t.label} <span className="opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        {filtered.length > 0 && (
          <label className="text-xs font-semibold text-slate-500 flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedIds.length === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-blue-900 cursor-pointer"
            />
            Selecionar todos ({filtered.length})
          </label>
        )}
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
          <p className="text-xs font-medium">Carregando lista de pedidos...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-bold text-slate-800 text-sm">Nenhum pedido encontrado</p>
          <p className="text-xs text-slate-400 mt-1">Tente ajustar a aba selecionada ou os termos da sua pesquisa.</p>
        </div>
      ) : (
        <div className="space-y-3">
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

      {/* Floating Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-950 text-white rounded-2xl shadow-2xl px-6 py-3 border border-slate-800 z-50 flex items-center gap-4 flex-wrap animate-in fade-in slide-in-from-bottom-5">
          <span className="text-xs font-bold text-slate-200">{selectedIds.length} selecionado(s)</span>
          <div className="h-4 w-[1px] bg-slate-800" />
          <button
            onClick={() => batchLabelMut.mutate({ orderIds: selectedIds })}
            disabled={batchLabelMut.isPending}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            {batchLabelMut.isPending ? 'Gerando em lote...' : 'Gerar Etiquetas ME'}
          </button>
          <button
            onClick={() => exportOrdersToCsv(orders.filter(o => selectedIds.includes(o.id)))}
            className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="text-xs text-slate-400 hover:text-white transition ml-2"
          >
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}

import { SalVitaEmailMarketing } from './SalVitaEmailMarketing';

/* ── Unified Admin Shell ──────────────────────────────────── */
type Section = 'orders' | 'recovery' | 'b2b' | 'email-marketing';

const SECTIONS: { key: Section; label: string; icon: any; path: string }[] = [
  { key: 'orders',          label: 'Pedidos & Vendas', icon: Package,        path: '/sal-vita-admin' },
  { key: 'recovery',        label: 'Recuperação',      icon: RotateCcw,      path: '/sal-vita-recovery' },
  { key: 'b2b',             label: 'Leads B2B',        icon: Building2,      path: '/sal-vita-b2b' },
  { key: 'email-marketing', label: 'E-mail Marketing', icon: Mail,           path: '/sal-vita-email-marketing' },
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
    await logoutMut.mutateAsync();
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      {/* Top Bar Header */}
      <header className="bg-slate-950 text-white border-b border-slate-800 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo */}
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" className="h-8 w-auto">
                <defs><clipPath id="oval-hub"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
                <ellipse cx="250" cy="187" rx="228" ry="164" fill="rgba(255,255,255,.1)"/>
                <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#4a9eff" clipPath="url(#oval-hub)"/>
                <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="white">Sal Vita</text>
                <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="15"/>
              </svg>
              <div>
                <span className="font-bold text-sm text-white tracking-tight">Sal Vita Premium</span>
                <span className="hidden sm:inline-block text-[10px] bg-blue-900/60 text-blue-300 font-semibold px-2 py-0.5 rounded-full ml-2 border border-blue-700/50">Admin Center</span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-2xl border border-slate-800">
              {SECTIONS.map(s => {
                const Icon = s.icon;
                const active = section === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => go(s.key)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      active ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>

            {/* User Profile & Logout */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-medium hidden md:inline-block">{user?.name}</span>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-xl transition cursor-pointer"
                title="Encerrar sessão"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content View Container */}
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-white/50" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'admin') return <LoginForm />;
  return <AdminShell />;
}
