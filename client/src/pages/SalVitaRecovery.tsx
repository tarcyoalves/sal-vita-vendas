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
  Phone,
  Mail,
} from 'lucide-react';
import { ConfirmDialog } from '../components/premium/admin/ConfirmDialog';
import { ErrorState } from '../components/premium/admin/ErrorState';
import { FOCUS, btn } from '../components/premium/admin/adminUi';
import { errorMessage } from '../components/premium/admin/adminLogic';

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
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-600' : 'bg-rose-600'}`} />
        <span>WhatsApp: {label}</span>
      </div>

      <button
        onClick={() => reconnectMut.mutate()}
        disabled={reconnectMut.isPending}
        title="Reconectar sessão"
        aria-label="Reconectar sessão do WhatsApp" className={btn.icon}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${reconnectMut.isPending ? 'animate-spin' : ''}`} />
      </button>

      {qrHelps && (
        <button
          onClick={() => qrMut.mutate()}
          disabled={qrMut.isPending}
          className={btn.primary}
        >
          <Smartphone className="w-3.5 h-3.5" /> QR Code
        </button>
      )}

      {qr && (
        <div onClick={e => e.target === e.currentTarget && setQr(null)} role="dialog" aria-modal="true" aria-label="Reconectar WhatsApp" className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl border border-slate-100">
            <h3 className="font-bold text-slate-900 text-base mb-1">Reconectar WhatsApp</h3>
            <p className="text-xs text-slate-500 mb-4">No celular: <strong>WhatsApp, Aparelhos conectados, Conectar um aparelho</strong>.</p>
            <img src={qr} alt="QR Code" className="w-full max-w-[240px] mx-auto rounded-2xl border border-slate-200" />
            <p className="text-[11px] text-slate-400 mt-3">Atualiza automaticamente a cada 18s.</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => qrMut.mutate()} className={`${btn.secondary} flex-1`}>Atualizar</button>
              <button onClick={() => setQr(null)} className={`${btn.primary} flex-1`}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tab 1: Carrinhos Abandonados ────────────────────────── */
type AbandonedAsk =
  | { kind: 'aiAll' }
  | { kind: 'job' }
  | { kind: 'ai' | 'template' | 'coupon' | 'optout'; row: any }
  | null;

// Contagens a partir da fila (listAutomationRuns traz as últimas 100). Espelham
// os filtros do servidor: aiProcessCarts (scheduled, sem aiProcessedAt, máx. 30)
// e runAutomationJob (scheduled e vencido, máx. 50, só 08h-21h BRT).
function queueCounts(runs: any[] | undefined) {
  if (!runs) return { ai: null as number | null, due: null as number | null };
  const now = Date.now();
  const sched = runs.filter(r => r.status === 'scheduled');
  return {
    ai: Math.min(30, sched.filter(r => !r.aiProcessedAt).length),
    due: Math.min(50, sched.filter(r => new Date(r.scheduledFor).getTime() <= now).length),
  };
}

function AbandonedTab() {
  const { data, isLoading, isError, error, isFetching, refetch } = trpc.recovery.listAbandoned.useQuery(undefined, { refetchInterval: 300_000, staleTime: 120_000, retry: 0, refetchOnWindowFocus: false });
  const couponsQ = trpc.recovery.listCoupons.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const runsQ = trpc.recovery.listAutomationRuns.useQuery(undefined, { staleTime: 60_000, retry: 0, refetchOnWindowFocus: false });
  const [selectedCoupon, setSelectedCoupon] = useState<string>('');
  const [waFallbacks, setWaFallbacks] = useState<Record<number, string>>({});
  const [ask, setAsk] = useState<AbandonedAsk>(null);

  const markRecovered = trpc.recovery.markRecovered.useMutation({
    onSuccess: () => { toast.success('Marcado como recuperado.'); refetch(); },
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
      toast.success(d.coupon ? `Enviado com cupom ${d.coupon}` : 'Enviado.');
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const jobMut = trpc.recovery.runAutomationJob.useMutation({
    onSuccess: (d: any) => {
      if (d.skipped) toast.error('Fora do horário comercial (08h-21h): nada foi enviado.');
      else toast.success(`Job: ${d.sent} enviados, ${d.cancelled} cancelados`);
      runsQ.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const aiProcessMut = trpc.recovery.aiProcessCarts.useMutation({
    onSuccess: (d: any) => { toast.success(`IA processou ${d.processed} carrinhos`); refetch(); runsQ.refetch(); },
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
      <div className="text-center py-16 text-slate-600" role="status">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" aria-hidden="true" />
        <p className="text-xs">Carregando carrinhos...</p>
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Não foi possível carregar os carrinhos" message={`${errorMessage(error)} Isso não significa que não há carrinhos.`} onRetry={() => refetch()} retrying={isFetching} />;
  }

  const rows = data ?? [];
  const now = Date.now();
  const usableCoupons = (couponsQ.data ?? []).filter((c: any) =>
    c.active && (!c.expiresAt || new Date(c.expiresAt).getTime() > now) && (!c.maxUses || c.usedCount < c.maxUses)
  );
  const counts = queueCounts(runsQ.data as any[] | undefined);
  const rowBusy = (id: number) =>
    (sendMut.isPending && (sendMut.variables as any)?.id === id) ||
    (sendCouponMut.isPending && (sendCouponMut.variables as any)?.id === id) ||
    (aiSendMut.isPending && (aiSendMut.variables as any)?.cartId === id) ||
    (markRecovered.isPending && (markRecovered.variables as any)?.id === id);

  const dialog = (() => {
    if (!ask) return null;
    if (ask.kind === 'aiAll') {
      return {
        title: 'IA processar todos os carrinhos?',
        description: (
          <>
            <p>{counts.ai == null
              ? 'A IA vai preparar a mensagem de todos os carrinhos agendados que ainda não foram processados (até 30 por vez).'
              : <>A IA vai preparar a mensagem de <strong>{counts.ai}</strong> carrinho(s) agendado(s) ainda não processados (máximo 30 por vez).</>}</p>
            <p>Isso não envia WhatsApp agora; as mensagens saem depois, no envio da fila.</p>
          </>
        ),
        confirmLabel: 'Processar com IA',
        destructive: false,
        run: () => aiProcessMut.mutate(),
      };
    }
    if (ask.kind === 'job') {
      return {
        title: 'Executar a fila de WhatsApp agora?',
        description: (
          <>
            <p>{counts.due == null
              ? 'Será enviado WhatsApp para todos os clientes elegíveis da fila que já passaram do horário agendado (até 50).'
              : <>Até <strong>{counts.due}</strong> WhatsApp sairão agora, para os clientes da fila já vencidos (máximo 50 por vez).</>}</p>
            <p>Carrinho já convertido, recuperado ou com opt-out é cancelado em vez de enviar. Fora de 08h-21h nada é enviado.</p>
          </>
        ),
        confirmLabel: 'Enviar agora',
        destructive: false,
        run: () => jobMut.mutate(),
      };
    }
    const row = ask.row;
    const who = <><strong>{row.customerName || 'Cliente sem nome'}</strong> ({row.customerPhone || 'sem telefone'})</>;
    if (ask.kind === 'optout') {
      return {
        title: 'Registrar opt-out?',
        description: <p>{who} não receberá mais mensagens de recuperação. Não dá para desfazer por esta tela.</p>,
        confirmLabel: 'Registrar opt-out',
        destructive: true,
        run: () => optOutMut.mutate({ id: row.id }),
      };
    }
    const kind = ask.kind;
    const label = kind === 'ai' ? 'mensagem escrita pela IA' : kind === 'template' ? 'mensagem do template padrão' : `mensagem com cupom ${selectedCoupon || '(automático)'}`;
    return {
      title: 'Enviar WhatsApp ao cliente?',
      description: <><p>Será enviada <strong>1 {label}</strong> para {who}.</p>{row.recoverySentAt && <p>Este cliente já recebeu uma mensagem {timeAgo(row.recoverySentAt)}.</p>}</>,
      confirmLabel: 'Enviar mensagem',
      destructive: false,
      run: () => {
        if (kind === 'ai') aiSendMut.mutate({ cartId: row.id });
        else if (kind === 'template') sendMut.mutate({ id: row.id });
        else sendCouponMut.mutate(selectedCoupon ? { id: row.id, coupon: selectedCoupon } : { id: row.id, useCoupon: true });
      },
    };
  })();

  return (
    <div className="space-y-4">
      <div className="bg-[#0b1d3a] rounded-xl p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-bold text-base tracking-tight">Recuperação de carrinhos</h3>
          <p className="text-xs text-slate-300">A IA escreve a mensagem conforme a etapa em que o cliente parou. Nada é enviado sem a sua confirmação.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setAsk({ kind: 'aiAll' })} disabled={aiProcessMut.isPending} className={`${btn.secondary} !bg-white !text-[#0b1d3a]`}>
            <Bot className="w-3.5 h-3.5" aria-hidden="true" />
            {aiProcessMut.isPending ? 'Processando...' : 'IA Processar Todos'}
          </button>
          <button onClick={() => setAsk({ kind: 'job' })} disabled={jobMut.isPending} className={`${btn.secondary} !bg-transparent !text-white !border-white/40`}>
            <Play className="w-3 h-3" aria-hidden="true" />
            {jobMut.isPending ? 'Executando...' : 'Executar Job'}
          </button>
        </div>
      </div>

      <div className="bg-[#c9a227]/10 border border-[#c9a227]/50 rounded-xl p-3 flex items-center gap-3 flex-wrap text-xs text-slate-900">
        <Tag className="w-4 h-4 text-[#7a5f0b] flex-shrink-0" aria-hidden="true" />
        <label htmlFor="rec-coupon" className="font-semibold">Cupom para envio rápido:</label>
        <select
          id="rec-coupon"
          value={selectedCoupon}
          onChange={e => setSelectedCoupon(e.target.value)}
          className={`min-h-[44px] px-3 border border-slate-300 rounded-lg bg-white font-mono text-xs ${FOCUS}`}
        >
          <option value="">Automático ({rows[0]?.activeCoupon ?? 'nenhum'})</option>
          {usableCoupons.map((c: any) => (
            <option key={c.id} value={c.code}>{c.code} — {c.discountType === 'percent' ? `${c.discountValue}%` : fmt(c.discountValue)}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <ShoppingCart className="w-10 h-10 text-slate-400 mx-auto mb-2" aria-hidden="true" />
          <p className="font-bold text-slate-800 text-sm">Nenhum carrinho abandonado no momento</p>
          <p className="text-xs text-slate-600 mt-1">Todos os clientes finalizaram a compra no checkout.</p>
        </div>
      ) : (
        rows.map((row: any) => {
          const busy = rowBusy(row.id);
          return (
            <div key={row.id} className={`bg-white rounded-xl border p-4 ${row.optedOut ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 text-sm">{row.customerName || 'Cliente sem nome'}</span>
                    <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full text-xs font-semibold">
                      {stepLabel(row.stepReached ?? 1)}
                    </span>
                    {row.optedOut && (
                      <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold flex items-center gap-1">
                        <UserX className="w-3 h-3" aria-hidden="true" /> Parou
                      </span>
                    )}
                    {!row.optedOut && row.status && row.status !== 'checkout_started' && (
                      <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold">
                        {row.status === 'converted' ? 'Convertido' : row.status}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                    {row.customerPhone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" aria-hidden="true" /> {row.customerPhone}</span>}
                    {row.customerEmail && <span className="flex items-center gap-1 break-all"><Mail className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" /> {row.customerEmail}</span>}
                    <span>{timeAgo(row.createdAt)}</span>
                  </div>

                  {row.recoverySentAt && (
                    <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Notificação enviada {timeAgo(row.recoverySentAt)}
                    </p>
                  )}
                  {waFallbacks[row.id] && (
                    <a href={waFallbacks[row.id]} target="_blank" rel="noopener noreferrer" className="text-xs text-[#0b1d3a] underline inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" aria-hidden="true" /> Abrir no WhatsApp (envio do servidor falhou)
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
                  <button onClick={() => setAsk({ kind: 'ai', row })} disabled={busy} className={btn.primary}>
                    <Bot className="w-3.5 h-3.5" aria-hidden="true" /> IA Enviar
                  </button>
                  <button onClick={() => setAsk({ kind: 'template', row })} disabled={busy} className={btn.secondary}>
                    <Send className="w-3.5 h-3.5" aria-hidden="true" /> Template
                  </button>
                  <button onClick={() => setAsk({ kind: 'coupon', row })} disabled={busy} className={btn.success}>
                    <Tag className="w-3.5 h-3.5" aria-hidden="true" /> + Cupom
                  </button>
                  <button onClick={() => markRecovered.mutate({ id: row.id })} disabled={busy} className={btn.secondary}>
                    Recuperado
                  </button>
                  {!row.optedOut && (
                    <button onClick={() => setAsk({ kind: 'optout', row })} disabled={busy} className={btn.icon} aria-label={`Registrar opt-out de ${row.customerName ?? 'cliente'}`} title="Registrar opt-out">
                      <UserX className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {dialog && (
        <ConfirmDialog
          open
          onOpenChange={o => !o && setAsk(null)}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          destructive={dialog.destructive}
          onConfirm={dialog.run}
        />
      )}
    </div>
  );
}

/* ── Tab 2: Pedidos Não Pagos ────────────────────────────── */
function UnpaidTab() {
  const { data, isLoading, isError, error, isFetching, refetch } = trpc.recovery.listUnpaid.useQuery(undefined, { refetchInterval: 300_000, staleTime: 120_000, retry: 0, refetchOnWindowFocus: false });
  const templatesQ = trpc.recovery.listTemplates.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const [selectedTemplates, setSelectedTemplates] = useState<Record<number, number>>({});
  const [ask, setAsk] = useState<any | null>(null);

  const sendMut = trpc.recovery.sendUnpaid.useMutation({
    onSuccess: (d: any) => { toast.success(`Enviado para ${d.phone}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="text-center py-16 text-slate-600" role="status">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" aria-hidden="true" />
        <p className="text-xs">Carregando pedidos não pagos...</p>
      </div>
    );
  }

  if (isError) {
    return <ErrorState title="Não foi possível carregar os pedidos não pagos" message={`${errorMessage(error)} Isso não significa que todos pagaram.`} onRetry={() => refetch()} retrying={isFetching} />;
  }

  const rows = data ?? [];
  const unpaidTemplates = (templatesQ.data ?? []).filter((t: any) => t.type === 'unpaid' || t.type === 'failed');

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
        <CreditCard className="w-10 h-10 text-slate-400 mx-auto mb-2" aria-hidden="true" />
        <p className="font-bold text-slate-800 text-sm">Todos os pedidos estão pagos</p>
        <p className="text-xs text-slate-600 mt-1">Nenhum pedido pendente de pagamento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">{rows.length} pedido(s) aguardando pagamento</p>
      {rows.map((row: any) => {
        const busy = sendMut.isPending && (sendMut.variables as any)?.id === row.id;
        return (
          <div key={row.id} className="bg-white rounded-xl border border-slate-200 p-4">
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
                <p className="text-xs text-slate-600 flex items-center gap-1 flex-wrap"><Phone className="w-3.5 h-3.5" aria-hidden="true" /> {row.customerPhone} · {row.quantity ?? 1}× Sal Marinho Integral · <strong className="text-slate-900">{fmt(row.totalPrice)}</strong></p>
                <p className="text-[11px] text-slate-600">{timeAgo(row.createdAt)}</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
                {unpaidTemplates.length > 0 && (
                  <select
                    aria-label={`Template de cobrança do pedido ${row.id}`}
                    value={selectedTemplates[row.id] ?? ''}
                    onChange={e => setSelectedTemplates(s => ({ ...s, [row.id]: Number(e.target.value) }))}
                    className={`min-h-[44px] px-2.5 border border-slate-300 rounded-xl text-xs bg-white ${FOCUS}`}
                  >
                    <option value="">Template padrão</option>
                    {unpaidTemplates.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                )}
                <button onClick={() => setAsk(row)} disabled={busy} className={btn.primary}>
                  <Send className="w-3.5 h-3.5" aria-hidden="true" /> {busy ? 'Enviando...' : 'Enviar Cobrança'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {ask && (
        <ConfirmDialog
          open
          onOpenChange={o => !o && setAsk(null)}
          title="Enviar cobrança por WhatsApp?"
          description={
            <>
              <p>Será enviada <strong>1 mensagem</strong> de cobrança do pedido <strong>#{ask.id}</strong> ({fmt(ask.totalPrice)}) para <strong>{ask.customerName || 'Cliente'}</strong> ({ask.customerPhone}).</p>
              <p>Se ele já pagou por outro meio, confirme o pagamento antes de cobrar.</p>
            </>
          }
          confirmLabel="Enviar cobrança"
          onConfirm={() => sendMut.mutate({ id: ask.id, templateId: selectedTemplates[ask.id] })}
        />
      )}
    </div>
  );
}

/* ── Tab 3: Mensagens & Templates ────────────────────────── */
// O backend exige `slug` no padrão /^[a-z0-9_]+$/ (server/routers/recovery.ts).
// A tela nunca enviava esse campo, então salvar template sempre falhava na
// validação — derivamos do nome digitado.
function slugify(label: string): string {
  const base = label
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return base.length >= 2 ? base : `template_${Date.now().toString().slice(-6)}`;
}

function TemplatesTab() {
  const { data: templates = [], isLoading, isError, error, isFetching, refetch } = trpc.recovery.listTemplates.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<{ label: string; body: string; type: 'abandoned' | 'unpaid' | 'failed' | 'general'; isDefault: boolean }>({ label: '', body: '', type: 'abandoned', isDefault: false });

  const saveMut = trpc.recovery.saveTemplate.useMutation({
    onSuccess: () => { toast.success('Template salvo!'); setEditing(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-16 text-slate-600 text-xs" role="status">Carregando templates...</div>;
  if (isError) return <ErrorState title="Não foi possível carregar os templates" message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm">Templates de Mensagens</h3>
        <button
          onClick={() => { setEditing({}); setForm({ label: '', body: '', type: 'abandoned', isDefault: false }); }}
          className={btn.primary}
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
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value as typeof f.type }))}
            className="w-full px-3 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20"
          >
            <option value="abandoned">Carrinho abandonado</option>
            <option value="unpaid">Pedido não pago</option>
            <option value="failed">Pagamento recusado</option>
            <option value="general">Geral</option>
          </select>
          <textarea
            value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            rows={4}
            placeholder="Texto da mensagem... Use variáveis: {nome}, {cupom}, {link_pix}, {rastreio}"
            className="w-full px-3 py-2 border rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-900/20 font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={() => saveMut.mutate({ id: editing.id, ...form, slug: slugify(form.label) })}
              disabled={saveMut.isPending}
              className={btn.primary}
            >
              Salvar
            </button>
            <button onClick={() => setEditing(null)} className={btn.secondary}>Cancelar</button>
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
  const { data = [], isLoading, isError, error, isFetching, refetch } = trpc.recovery.listAutomationRuns.useQuery(undefined, { refetchInterval: 300_000, staleTime: 120_000, retry: 0, refetchOnWindowFocus: false });
  const [askJob, setAskJob] = useState(false);
  const jobMut = trpc.recovery.runAutomationJob.useMutation({
    onSuccess: (d: any) => {
      if (d.skipped) toast.error('Fora do horário comercial (08h-21h): nada foi enviado.');
      else toast.success(`Job: ${d.sent} enviados`);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-16 text-slate-600 text-xs" role="status">Carregando automações...</div>;
  if (isError) return <ErrorState title="Não foi possível carregar a fila de automação" message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />;
  const dueNow = Math.min(50, data.filter((r: any) => r.status === 'scheduled' && new Date(r.scheduledFor).getTime() <= Date.now()).length);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm">Fila de Automação de Mensagens</h3>
        <button
          onClick={() => setAskJob(true)}
          disabled={jobMut.isPending}
          className={btn.primary}
        >
          <Play className="w-3.5 h-3.5" aria-hidden="true" /> {jobMut.isPending ? 'Executando...' : 'Executar Job Agora'}
        </button>
      </div>

      <ConfirmDialog
        open={askJob}
        onOpenChange={setAskJob}
        title="Executar a fila de WhatsApp agora?"
        description={
          <>
            <p>Até <strong>{dueNow}</strong> WhatsApp sairão agora, para os clientes da fila já vencidos (máximo 50 por vez; contagem sobre as últimas 100 execuções listadas).</p>
            <p>Carrinho convertido, recuperado ou com opt-out é cancelado em vez de enviar. Fora de 08h-21h nada é enviado.</p>
          </>
        }
        confirmLabel="Enviar agora"
        onConfirm={() => jobMut.mutate()}
      />

      {data.length === 0 && <p className="text-xs text-slate-600">Fila vazia.</p>}
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
  const { data: coupons = [], isLoading, isError, error, isFetching, refetch } = trpc.recovery.listCoupons.useQuery(undefined, { staleTime: 120_000, refetchOnWindowFocus: false });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ code: string; discountType: 'percent' | 'fixed'; discountValue: string; minOrderValue: string; maxUses: string; expiresAt: string; description: string }>({ code: '', discountType: 'percent', discountValue: '', minOrderValue: '', maxUses: '', expiresAt: '', description: '' });

  const createMut = trpc.recovery.createCoupon.useMutation({
    onSuccess: () => { toast.success('Cupom criado!'); setShowForm(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-16 text-slate-600 text-xs" role="status">Carregando cupons...</div>;
  if (isError) return <ErrorState title="Não foi possível carregar os cupons" message={errorMessage(error)} onRetry={() => refetch()} retrying={isFetching} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm">Cupons de Desconto</h3>
        <button
          onClick={() => setShowForm(s => !s)}
          className={btn.primary}
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
            onClick={() => createMut.mutate({
              code: form.code,
              discountType: form.discountType,
              discountValue: Number(form.discountValue),
              description: form.description || undefined,
              // Campos opcionais e numéricos no backend: a tela guarda tudo como
              // texto, então vazio precisa virar undefined em vez de ir como "".
              minOrderValue: form.minOrderValue ? Number(form.minOrderValue) : undefined,
              maxUses: form.maxUses ? Number(form.maxUses) : undefined,
              expiresAt: form.expiresAt || undefined,
            })}
            disabled={createMut.isPending}
            className={btn.primary}
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wider">Abandonados</p>
          <p className="text-2xl font-bold text-amber-900 mt-1">{abandonedQ.isError ? '—' : abandoned.length}</p>
        </div>
        <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-rose-800 uppercase tracking-wider">Não Pagos</p>
          <p className="text-2xl font-bold text-rose-900 mt-1">{unpaidQ.isError ? '—' : unpaid.length}</p>
        </div>
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4">
          <p className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">Receita em Risco</p>
          <p className="text-xl font-bold text-emerald-900 mt-1">{unpaidQ.isError ? '—' : fmt(displayRevenueAtRisk)}</p>
        </div>
      </div>

      {(abandonedQ.isError || unpaidQ.isError) && (
        <ErrorState
          title="Alguns números não carregaram"
          message="Os valores com traço não estão disponíveis agora; não significam zero."
          onRetry={() => { abandonedQ.refetch(); unpaidQ.refetch(); }}
          retrying={abandonedQ.isFetching || unpaidQ.isFetching}
        />
      )}

      <button
        onClick={() => aiMut.mutate()}
        disabled={aiMut.isPending}
        className={btn.primary}
      >
        <Sparkles className="w-4 h-4" aria-hidden="true" />
        {aiMut.isPending ? 'Analisando...' : 'Analisar oportunidades com IA'}
      </button>

      {aiMut.data && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 shadow-sm">
          <h4 className="font-bold text-slate-900 text-sm">Diagnóstico da IA</h4>
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
              aria-pressed={active}
              className={`flex items-center gap-1.5 px-4 min-h-[44px] rounded-xl text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${FOCUS} ${
                active
                  ? 'bg-[#0b1d3a] text-white'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
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
