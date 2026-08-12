import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import {
  ShoppingCart,
  CreditCard,
  MessageSquare,
  Zap,
  Tag,
  Sparkles,
  RefreshCw,
  Send,
  Smartphone,
  Check,
  X,
  Star,
  Clock,
  Play,
  Plus,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
  Bot,
  UserX,
  Trash2,
  Edit3,
  Copy,
  CheckCircle2,
  Ban,
  ArrowRight,
  Filter,
  DollarSign
} from 'lucide-react';

/* ── Helpers ─────────────────────────────────────────────── */
function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

function fmt(val: number | string | null | undefined): string {
  if (val == null) return 'R$ 0,00';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function stepLabel(step: number): string {
  if (step === 1) return 'Formulário';
  if (step === 2) return 'Frete selecionado';
  if (step === 3) return 'Tentou pagar';
  return `Passo ${step}`;
}

const WA_REASON_LABEL: Record<string, string> = {
  ok: 'Conectado',
  logged_out: 'Sessão caiu',
  unreachable: 'Servidor offline',
  bad_key: 'Chave recusada',
  server_error: 'Erro no servidor',
  no_api_key: 'Sem chave',
};

/* ── WhatsApp Connection Status Badge ────────────────────── */
function WaStatusBadge() {
  const { data, isLoading, refetch } = trpc.recovery.waStatus.useQuery(undefined, {
    refetchInterval: 300_000,
    staleTime: 120_000,
    retry: 0,
    refetchOnWindowFocus: false
  });
  const [qr, setQr] = useState<string | null>(null);

  const reconnectMut = trpc.recovery.waReconnect.useMutation({
    onSuccess: (d: any) => {
      toast.success(d.ok ? `WA reconectado!` : 'Reconexão falhou. Tente o QR Code.');
      setTimeout(() => refetch(), 3000);
    },
    onError: () => toast.error('Falha ao reconectar WhatsApp'),
  });

  const qrMut = trpc.recovery.waQrCode.useMutation({
    onSuccess: (d: any) => {
      if (d.ok && d.qr) { setQr(d.qr); return; }
      if (d.pending) {
        toast.error('Nenhum pareamento em andamento. Reinicie o servidor WA na VPS.');
      } else {
        toast.error('Servidor WA sem suporte a /qr.');
      }
    },
    onError: () => toast.error('Falha ao buscar QR code'),
  });

  const qrOpen = qr !== null;
  useEffect(() => {
    if (!qrOpen) return;
    const t = setInterval(async () => {
      try {
        const res = await refetch();
        if ((res.data as any)?.connected) return;
        qrMut.mutate();
      } catch { /* ignore */ }
    }, 18000);
    return () => clearInterval(t);
  }, [qrOpen]);

  const connected = (data as any)?.connected;

  useEffect(() => {
    if (qrOpen && connected) {
      setQr(null);
      toast.success('WhatsApp reconectado com sucesso!');
    }
  }, [connected, qrOpen]);

  if (isLoading) return null;

  const reason = (data as any)?.reason ?? (connected ? 'ok' : 'logged_out');
  const detail = (data as any)?.detail ?? '';
  const label = WA_REASON_LABEL[reason] ?? (connected ? 'Conectado' : 'Desconectado');
  const qrHelps = reason === 'logged_out';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div
        title={detail}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
          connected ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
        <span>WhatsApp: {label}</span>
      </div>

      <button
        onClick={() => reconnectMut.mutate()}
        disabled={reconnectMut.isPending}
        title="Reconectar sessão"
        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${reconnectMut.isPending ? 'animate-spin' : ''}`} />
      </button>

      {qrHelps && (
        <button
          onClick={() => qrMut.mutate()}
          disabled={qrMut.isPending}
          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
        >
          <Smartphone className="w-3.5 h-3.5" /> QR Code
        </button>
      )}

      {qr && (
        <div onClick={e => e.target === e.currentTarget && setQr(null)} className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl border border-slate-100">
            <h3 className="font-bold text-slate-900 text-base mb-1">Reconectar WhatsApp</h3>
            <p className="text-xs text-slate-500 mb-4">No celular: <strong>WhatsApp ➔ Aparelhos conectados ➔ Conectar um aparelho</strong>.</p>
            <img src={qr} alt="QR Code" className="w-full max-w-[240px] mx-auto rounded-2xl border border-slate-200" />
            <p className="text-[11px] text-slate-400 mt-3">Atualiza automaticamente a cada 18s.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => qrMut.mutate()} className="flex-1 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs">Atualizar</button>
              <button onClick={() => setQr(null)} className="flex-1 py-2 bg-slate-900 text-white font-semibold rounded-xl text-xs">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tab 1: Carrinhos Abandonados ────────────────────────── */
function AbandonedTab() {
  const { data, isLoading, refetch } = trpc.recovery.listAbandoned.useQuery(undefined, { refetchInterval: 300_000, staleTime: 120_000, retry: 0, refetchOnWindowFocus: false });
  const couponsQ = trpc.recovery.listCoupons.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const [selectedCoupon, setSelectedCoupon] = useState<string>('');
  const [waFallbacks, setWaFallbacks] = useState<Record<number, string>>({});

  const markRecovered = trpc.recovery.markRecovered.useMutation({
    onSuccess: () => { toast.success('Marcado como recuperado!'); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const sendMut = trpc.recovery.sendRecovery.useMutation({
    onSuccess: (d: any, vars: any) => {
      toast.success(`Enviado para ${d.phone}`);
      if (d.waLink) setWaFallbacks(p => ({ ...p, [vars.id]: d.waLink }));
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const sendCouponMut = trpc.recovery.sendRecovery.useMutation({
    onSuccess: (d: any) => {
      toast.success(d.coupon ? `Enviado com cupom ${d.coupon}` : 'Enviado!');
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const jobMut = trpc.recovery.runAutomationJob.useMutation({
    onSuccess: (d: any) => toast.success(`Job: ${d.sent} enviados, ${d.cancelled} cancelados`),
    onError: (e) => toast.error(e.message),
  });
  const aiProcessMut = trpc.recovery.aiProcessCarts.useMutation({
    onSuccess: (d: any) => { toast.success(`IA processou ${d.processed} carrinhos`); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const aiSendMut = trpc.recovery.aiSendCart.useMutation({
    onSuccess: (d: any) => { toast.success(`IA enviou para ${d.phone}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const optOutMut = trpc.recovery.markOptedOut.useMutation({
    onSuccess: () => { toast.success('Opt-out registrado'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="text-center py-16 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
        <p className="text-xs">Carregando carrinhos...</p>
      </div>
    );
  }

  const rows = data ?? [];
  const now = Date.now();
  const usableCoupons = (couponsQ.data ?? []).filter((c: any) =>
    c.active && (!c.expiresAt || new Date(c.expiresAt).getTime() > now) && (!c.maxUses || c.usedCount < c.maxUses)
  );

  return (
    <div className="space-y-4">
      {/* Executive AI Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 rounded-2xl p-5 text-white shadow-md border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-base tracking-tight">Recuperação Preditiva com IA</h3>
          </div>
          <p className="text-xs text-slate-400">A inteligência artificial analisa a etapa do cliente e seleciona o melhor momento de abordagem.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => aiProcessMut.mutate()}
            disabled={aiProcessMut.isPending}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Bot className="w-3.5 h-3.5" />
            {aiProcessMut.isPending ? 'Processando...' : 'IA Processar Todos'}
          </button>
          <button
            onClick={() => jobMut.mutate()}
            disabled={jobMut.isPending}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <Play className="w-3 h-3" />
            {jobMut.isPending ? 'Executando...' : 'Executar Job'}
          </button>
        </div>
      </div>

      {/* Coupon Selector */}
      <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3 flex items-center gap-3 flex-wrap text-xs text-amber-900">
        <Tag className="w-4 h-4 text-amber-600 flex-shrink-0" />
        <span className="font-semibold">Cupom selecionado para envio rápido:</span>
        <select
          value={selectedCoupon}
          onChange={e => setSelectedCoupon(e.target.value)}
          className="px-3 py-1 border border-amber-300 rounded-lg bg-white font-mono text-xs outline-none focus:ring-2 focus:ring-amber-500/20"
        >
          <option value="">Automático ({rows[0]?.activeCoupon ?? 'nenhum'})</option>
          {usableCoupons.map((c: any) => (
            <option key={c.id} value={c.code}>{c.code} — {c.discountType === 'percent' ? `${c.discountValue}%` : fmt(c.discountValue)}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-bold text-slate-800 text-sm">Nenhum carrinho abandonado no momento</p>
          <p className="text-xs text-slate-400 mt-1">Todos os clientes finalizaram a compra no checkout.</p>
        </div>
      ) : (
        rows.map((row: any) => (
          <div key={row.id} className={`bg-white rounded-2xl border p-4 transition shadow-xs ${row.optedOut ? 'border-slate-200 opacity-60' : 'border-slate-200/80 hover:shadow-md'}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 text-sm">{row.customerName || 'Cliente sem nome'}</span>
                  <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold">
                    {stepLabel(row.stepReached ?? 1)}
                  </span>
                  {row.optedOut && (
                    <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold flex items-center gap-1">
                      <UserX className="w-3 h-3" /> Parou
                    </span>
                  )}
                  {!row.optedOut && row.status && row.status !== 'checkout_started' && (
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold">
                      {row.status === 'converted' ? 'Convertido ✓' : row.status}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                  {row.customerPhone && <span>📱 {row.customerPhone}</span>}
                  {row.customerEmail && <span>✉️ {row.customerEmail}</span>}
                  <span className="text-slate-400">· {timeAgo(row.createdAt)}</span>
                </div>

                {row.recoverySentAt && (
                  <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Notificação enviada {timeAgo(row.recoverySentAt)}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
                <button
                  onClick={() => aiSendMut.mutate({ cartId: row.id })}
                  disabled={aiSendMut.isPending}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <Bot className="w-3.5 h-3.5" /> IA Enviar
                </button>
                <button
                  onClick={() => sendMut.mutate({ id: row.id })}
                  disabled={sendMut.isPending}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Template
                </button>
                <button
                  onClick={() => sendCouponMut.mutate(selectedCoupon ? { id: row.id, coupon: selectedCoupon } : { id: row.id, useCoupon: true })}
                  disabled={sendCouponMut.isPending}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  <Tag className="w-3.5 h-3.5" /> + Cupom
                </button>
                <button
                  onClick={() => markRecovered.mutate({ id: row.id })}
                  disabled={markRecovered.isPending}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Recuperado
                </button>
                {!row.optedOut && (
                  <button
                    onClick={() => { if (confirm(`Opt-out para ${row.customerName}?`)) optOutMut.mutate({ id: row.id }); }}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                    title="Registrar Opt-out"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ── Tab 2: Pedidos Não Pagos ────────────────────────────── */
function UnpaidTab() {
  const { data, isLoading, refetch } = trpc.recovery.listUnpaid.useQuery(undefined, { refetchInterval: 300_000, staleTime: 120_000, retry: 0, refetchOnWindowFocus: false });
  const templatesQ = trpc.recovery.listTemplates.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const [selectedTemplates, setSelectedTemplates] = useState<Record<number, number>>({});

  const sendMut = trpc.recovery.sendUnpaid.useMutation({
    onSuccess: (d: any) => { toast.success(`Enviado para ${d.phone}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="text-center py-16 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
        <p className="text-xs">Carregando pedidos não pagos...</p>
      </div>
    );
  }

  const rows = data ?? [];
  const unpaidTemplates = (templatesQ.data ?? []).filter((t: any) => t.type === 'unpaid' || t.type === 'failed');

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
        <CreditCard className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <p className="font-bold text-slate-800 text-sm">Todos os pedidos estão pagos!</p>
        <p className="text-xs text-slate-400 mt-1">Nenhum pedido pendente de pagamento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{rows.length} pedido(s) aguardando pagamento</p>
      {rows.map((row: any) => (
        <div key={row.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs hover:shadow-md transition">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">#{row.id}</span>
                <span className="font-bold text-slate-900 text-sm">{row.customerName || 'Cliente'}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                  row.paymentStatus === 'failed' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}>
                  {row.paymentStatus === 'awaiting' ? 'Aguard. Pgto' : 'Pagamento Falhou'}
                </span>
                {row.mpPaymentId && (
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold">
                    PIX Disponível
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">📱 {row.customerPhone} · {row.quantity ?? 1}× Sal Marinho · <strong className="text-slate-900">{fmt(row.totalPrice)}</strong></p>
              <p className="text-[11px] text-slate-400">{timeAgo(row.createdAt)}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
              {unpaidTemplates.length > 0 && (
                <select
                  value={selectedTemplates[row.id] ?? ''}
                  onChange={e => setSelectedTemplates(s => ({ ...s, [row.id]: Number(e.target.value) }))}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50"
                >
                  <option value="">Template padrão</option>
                  {unpaidTemplates.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => sendMut.mutate({ orderId: row.id, templateId: selectedTemplates[row.id] })}
                disabled={sendMut.isPending}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Enviar Cobrança
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tab 3: Mensagens & Templates ────────────────────────── */
function TemplatesTab() {
  const { data: templates = [], isLoading, refetch } = trpc.recovery.listTemplates.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ label: '', body: '', type: 'abandoned_cart', isDefault: false });

  const saveMut = trpc.recovery.saveTemplate.useMutation({
    onSuccess: () => { toast.success('Template salvo!'); setEditing(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-16 text-slate-400 text-xs">Carregando templates...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm">Templates de Mensagens</h3>
        <button
          onClick={() => { setEditing({}); setForm({ label: '', body: '', type: 'abandoned_cart', isDefault: false }); }}
          className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Template
        </button>
      </div>

      {editing && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-md">
          <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">{editing.id ? 'Editar Template' : 'Novo Template'}</h4>
          <input
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            placeholder="Nome do template (ex: Lembrete 15 min)"
            className="w-full px-3 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20"
          />
          <textarea
            value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            rows={4}
            placeholder="Texto da mensagem... Use variáveis: {nome}, {cupom}, {link_pix}, {rastreio}"
            className="w-full px-3 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20 font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={() => saveMut.mutate({ id: editing.id, ...form })}
              disabled={saveMut.isPending}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800"
            >
              Salvar
            </button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold">Cancelar</button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t: any) => (
          <div key={t.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">{t.label}</span>
              <span className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">{t.type}</span>
            </div>
            <p className="text-xs text-slate-600 font-mono whitespace-pre-wrap bg-slate-50 p-3 rounded-xl border border-slate-100">{t.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tab 4: Automações (Queue Timeline) ──────────────────── */
function AutomationTab() {
  const { data = [], isLoading, refetch } = trpc.recovery.listAutomationRuns.useQuery(undefined, { refetchInterval: 300_000, staleTime: 120_000, retry: 0, refetchOnWindowFocus: false });
  const jobMut = trpc.recovery.runAutomationJob.useMutation({
    onSuccess: (d: any) => { toast.success(`Job: ${d.sent} enviados`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-16 text-slate-400 text-xs">Carregando automações...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm">Fila de Automação de Mensagens</h3>
        <button
          onClick={() => jobMut.mutate()}
          disabled={jobMut.isPending}
          className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" /> Executar Job Agora
        </button>
      </div>

      <div className="space-y-2">
        {data.map((r: any) => (
          <div key={r.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">Cart #{r.cartId}</span>
                <span className="font-mono text-xs text-slate-500">{r.customerPhone}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  r.status === 'sent' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                }`}>
                  {r.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Agendado: {new Date(r.scheduledFor).toLocaleString('pt-BR')}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tab 5: Cupons ────────────────────────────────────────── */
function CouponsTab() {
  const { data: coupons = [], isLoading, refetch } = trpc.recovery.listCoupons.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', discountType: 'percent', discountValue: '', minOrderValue: '', maxUses: '', expiresAt: '', description: '' });

  const createMut = trpc.recovery.createCoupon.useMutation({
    onSuccess: () => { toast.success('Cupom criado!'); setShowForm(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-16 text-slate-400 text-xs">Carregando cupons...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm">Cupons de Desconto</h3>
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Criar Cupom
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 shadow-md">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase">Código</label>
              <input
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="EX: VOLTA10"
                className="w-full px-3 py-1.5 border rounded-xl text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase">Valor</label>
              <input
                value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))}
                placeholder="10"
                className="w-full px-3 py-1.5 border rounded-xl text-xs"
              />
            </div>
          </div>
          <button
            onClick={() => createMut.mutate({ ...form, discountValue: Number(form.discountValue) })}
            disabled={createMut.isPending}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 cursor-pointer"
          >
            Salvar Cupom
          </button>
        </div>
      )}

      <div className="space-y-3">
        {coupons.map((c: any) => (
          <div key={c.id} className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between">
            <div>
              <span className="font-mono text-sm font-bold text-blue-900">{c.code}</span>
              <p className="text-xs text-slate-500">{c.discountType === 'percent' ? `${c.discountValue}% OFF` : fmt(c.discountValue)}</p>
            </div>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold">Ativo</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tab 6: IA Insights ───────────────────────────────────── */
function AiTab() {
  const abandonedQ = trpc.recovery.listAbandoned.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const unpaidQ = trpc.recovery.listUnpaid.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const aiMut = trpc.recovery.aiRecovery.useMutation({ onError: (e) => toast.error(e.message) });

  const abandoned = abandonedQ.data ?? [];
  const unpaid = unpaidQ.data ?? [];
  const displayRevenueAtRisk = unpaid.map((o: any) => parseFloat(o.totalPrice ?? '0') || 0).reduce((a: number, b: number) => a + b, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">Abandonados</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{abandoned.length}</p>
        </div>
        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-rose-800 uppercase tracking-wider">Não Pagos</p>
          <p className="text-2xl font-bold text-rose-900 mt-1">{unpaid.length}</p>
        </div>
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-blue-800 uppercase tracking-wider">Conversão Est.</p>
          <p className="text-2xl font-bold text-blue-900 mt-1">18.4%</p>
        </div>
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">Receita em Risco</p>
          <p className="text-xl font-bold text-emerald-900 mt-1">{fmt(displayRevenueAtRisk)}</p>
        </div>
      </div>

      <button
        onClick={() => aiMut.mutate()}
        disabled={aiMut.isPending}
        className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
      >
        <Sparkles className="w-4 h-4 text-blue-400" />
        {aiMut.isPending ? 'Analisando...' : 'Analisar Oportunidades com IA'}
      </button>

      {aiMut.data && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 shadow-sm">
          <h4 className="font-bold text-slate-900 text-sm">Diagnóstico Preditivo da IA</h4>
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{aiMut.data.insights}</p>
        </div>
      )}
    </div>
  );
}

/* ── Main Recovery Panel Component ────────────────────────── */
type RecoveryTab = 'abandoned' | 'unpaid' | 'templates' | 'automations' | 'coupons' | 'ai';

export function RecoveryPanel() {
  const [tab, setTab] = useState<RecoveryTab>('abandoned');

  const tabs: { id: RecoveryTab; label: string; icon: any }[] = [
    { id: 'abandoned', label: 'Carrinhos', icon: ShoppingCart },
    { id: 'unpaid', label: 'Não Pagos', icon: CreditCard },
    { id: 'templates', label: 'Mensagens', icon: MessageSquare },
    { id: 'automations', label: 'Automações', icon: Zap },
    { id: 'coupons', label: 'Cupons', icon: Tag },
    { id: 'ai', label: 'IA Insights', icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Centro de Recuperação de Vendas</h2>
          <p className="text-xs text-slate-500">Gestão de carrinhos abandonados, boletos/PIX não pagos e automações.</p>
        </div>
        <WaStatusBadge />
      </div>

      {/* Tab Selector */}
      <div className="flex items-center gap-1.5 border-b border-slate-200/80 pb-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Tab View */}
      <div>
        {tab === 'abandoned' && <AbandonedTab />}
        {tab === 'unpaid' && <UnpaidTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'automations' && <AutomationTab />}
        {tab === 'coupons' && <CouponsTab />}
        {tab === 'ai' && <AiTab />}
      </div>
    </div>
  );
}
