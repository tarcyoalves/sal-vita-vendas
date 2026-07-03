import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';

/* ── Helpers ─────────────────────────────────────────────── */
function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins} minuto${mins !== 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs} hora${hrs !== 1 ? 's' : ''}`;
  const days = Math.floor(hrs / 24);
  return `há ${days} dia${days !== 1 ? 's' : ''}`;
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

/* ── Shared styles ───────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px',
  border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '.88rem',
  outline: 'none', fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '.72rem', fontWeight: 700, color: '#64748b',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em',
};
const btnPrimary: React.CSSProperties = {
  padding: '9px 16px', background: '#0C3680', color: 'white', border: 'none',
  borderRadius: 9, fontSize: '.83rem', fontWeight: 700, cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  padding: '9px 16px', background: '#f1f5f9', color: '#334155', border: 'none',
  borderRadius: 9, fontSize: '.83rem', fontWeight: 600, cursor: 'pointer',
};
const btnGreen: React.CSSProperties = {
  padding: '7px 13px', background: '#dcfce7', color: '#166534', border: 'none',
  borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
};
const btnWa: React.CSSProperties = {
  padding: '7px 13px', background: '#22c55e', color: 'white', border: 'none',
  borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
};
const btnWaSecondary: React.CSSProperties = {
  padding: '7px 13px', background: '#16a34a', color: 'white', border: 'none',
  borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
};
const btnDanger: React.CSSProperties = {
  padding: '7px 13px', background: '#fee2e2', color: '#991b1b', border: 'none',
  borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
};
const card: React.CSSProperties = {
  background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 16,
  padding: '18px 20px', marginBottom: 12,
};

/* ── Tab 1: Carrinhos Abandonados ────────────────────────── */
function WaStatusBadge() {
  const { data, isLoading, refetch } = trpc.recovery.waStatus.useQuery(undefined, { refetchInterval: 600000, staleTime: 300000, retry: 0, refetchOnWindowFocus: false });
  const reconnectMut = trpc.recovery.waReconnect.useMutation({
    onSuccess: (d: any) => {
      toast.success(d.ok ? `WA reconectado via ${d.path}` : 'WA: nenhum endpoint de reconexão disponível');
      setTimeout(() => refetch(), 3000);
    },
    onError: () => toast.error('Falha ao reconectar WA'),
  });
  if (isLoading) return null;
  const connected = (data as any)?.connected;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: connected ? '#dcfce7' : '#fee2e2',
        color: connected ? '#166534' : '#991b1b',
        borderRadius: 999, padding: '4px 12px', fontSize: '.75rem', fontWeight: 700,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
        WA {connected ? 'Conectado' : 'Desconectado'}
      </span>
      <button
        onClick={() => reconnectMut.mutate()}
        disabled={reconnectMut.isPending}
        title="Forçar reconexão do WhatsApp (útil se mensagens não estão chegando)"
        style={{ padding: '4px 10px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 999, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer', opacity: reconnectMut.isPending ? .6 : 1 }}
      >
        {reconnectMut.isPending ? '...' : '🔄'}
      </button>
    </span>
  );
}

function AbandonedTab() {
  const { data, isLoading, refetch } = trpc.recovery.listAbandoned.useQuery(undefined, { refetchInterval: 600000, staleTime: 300000, retry: 0, refetchOnWindowFocus: false });
  const couponsQ = trpc.recovery.listCoupons.useQuery(undefined, { staleTime: 300000, refetchOnWindowFocus: false });
  const [selectedCoupon, setSelectedCoupon] = useState<string>('');
  const [aiPreviews, setAiPreviews] = useState<Record<number, string>>({});
  const [waFallbacks, setWaFallbacks] = useState<Record<number, string>>({});
  const markRecovered = trpc.recovery.markRecovered.useMutation({
    onSuccess: () => { toast.success('Marcado como recuperado!'); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const sendMut = trpc.recovery.sendRecovery.useMutation({
    onSuccess: (d: any, vars: any) => {
      toast.success(`✅ Enviado para ${d.phone}`);
      if (d.waLink) setWaFallbacks(p => ({ ...p, [vars.id]: d.waLink }));
      refetch();
    },
    onError: (e) => toast.error('Falha no envio: ' + e.message),
  });
  const sendCouponMut = trpc.recovery.sendRecovery.useMutation({
    onSuccess: (d: any) => {
      toast.success(d.coupon ? `🎁 Enviado com cupom ${d.coupon} para ${d.phone}` : `✅ Enviado para ${d.phone} (sem cupom — crie um na aba Cupons)`);
      refetch();
    },
    onError: (e) => toast.error('Falha no envio: ' + e.message),
  });
  const jobMut = trpc.recovery.runAutomationJob.useMutation({
    onSuccess: (d: any) => toast.success(`Job: ${d.sent} enviados, ${d.cancelled} cancelados`),
    onError: (e) => toast.error(e.message),
  });
  const aiProcessMut = trpc.recovery.aiProcessCarts.useMutation({
    onSuccess: (d: any) => {
      toast.success(`🤖 IA processou ${d.processed} carrinhos`);
      refetch();
    },
    onError: (e) => toast.error('IA: ' + e.message),
  });
  const aiSendMut = trpc.recovery.aiSendCart.useMutation({
    onSuccess: (d: any) => {
      toast.success(`🤖 IA enviou para ${d.phone}`);
      setAiPreviews(p => ({ ...p }));
      refetch();
    },
    onError: (e) => toast.error('IA: ' + e.message),
  });
  const optOutMut = trpc.recovery.markOptedOut.useMutation({
    onSuccess: () => { toast.success('🚫 Opt-out registrado — automações canceladas'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>;

  const rows = data ?? [];
  const now = Date.now();
  const usableCoupons = (couponsQ.data ?? []).filter((c: any) =>
    c.active
    && (!c.expiresAt || new Date(c.expiresAt).getTime() > now)
    && (!c.maxUses || c.usedCount < c.maxUses)
  );

  return (
    <div>
      {/* Action bar */}
      <div style={{ background: 'linear-gradient(135deg,#0b1d3a,#1a3a6b)', borderRadius: 14, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 800, color: 'white', fontSize: '.95rem' }}>🤖 Recuperação com IA</p>
          <p style={{ margin: '2px 0 0', fontSize: '.75rem', color: 'rgba(255,255,255,.65)' }}>IA analisa cada lead e gera mensagem personalizada no melhor horário</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => aiProcessMut.mutate()}
            disabled={aiProcessMut.isPending}
            style={{ padding: '9px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: '.82rem', cursor: aiProcessMut.isPending ? 'not-allowed' : 'pointer', opacity: aiProcessMut.isPending ? .7 : 1 }}
          >
            {aiProcessMut.isPending ? '⏳ Processando...' : '🤖 IA Processar Todos'}
          </button>
          <button
            onClick={() => jobMut.mutate()}
            disabled={jobMut.isPending}
            style={{ padding: '9px 16px', background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.2)', borderRadius: 9, fontWeight: 700, fontSize: '.82rem', cursor: jobMut.isPending ? 'not-allowed' : 'pointer', opacity: jobMut.isPending ? .7 : 1 }}
          >
            {jobMut.isPending ? '⏳ Executando...' : '▶ Executar Job'}
          </button>
        </div>
      </div>

      {/* Coupon selector for the "+ Cupom" button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
        <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#92400e' }}>🎁 Cupom para o botão "+ Cupom":</span>
        <select
          value={selectedCoupon}
          onChange={e => setSelectedCoupon(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fcd34d', background: '#fff', fontSize: '.82rem', fontFamily: 'monospace' }}
        >
          <option value="">🤖 Automático ({rows[0]?.activeCoupon ?? 'nenhum cupom ativo'})</option>
          {usableCoupons.map((c: any) => (
            <option key={c.id} value={c.code}>{c.code} — {c.discountType === 'percent' ? `${c.discountValue}%` : `R$ ${parseFloat(c.discountValue).toFixed(2)}`}{c.useForRecovery ? ' ⭐' : ''}</option>
          ))}
        </select>
        {usableCoupons.length === 0 && (
          <span style={{ fontSize: '.78rem', color: '#92400e' }}>Nenhum cupom ativo — crie um na aba 🎟️ Cupons</span>
        )}
      </div>

      {aiProcessMut.data && (
        <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#15803d', fontSize: '.85rem' }}>
            🤖 IA processou {(aiProcessMut.data as any).processed} carrinhos
          </p>
          {((aiProcessMut.data as any).results ?? []).map((r: any) => (
            <p key={r.cartId} style={{ margin: '4px 0', fontSize: '.78rem', color: '#166534' }}>
              • <strong>{r.name}</strong> — envio: {new Date(r.scheduledFor).toLocaleString('pt-BR')} — {r.reasoning}
            </p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <p style={{ fontSize: '.82rem', color: '#64748b', margin: 0 }}>
          {rows.length} carrinho{rows.length !== 1 ? 's' : ''} abandonado{rows.length !== 1 ? 's' : ''}
        </p>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
          <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Nenhum carrinho abandonado!</p>
          <p style={{ fontSize: '.85rem', color: '#94a3b8', marginTop: 6 }}>Todos os clientes finalizaram suas compras.</p>
        </div>
      ) : rows.map((row: any) => (
        <div key={row.id} style={{ ...card, borderLeft: `4px solid ${row.optedOut ? '#94a3b8' : '#f59e0b'}`, opacity: row.optedOut ? 0.7 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0b1d3a' }}>{row.customerName || 'Cliente sem nome'}</span>
                <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700 }}>
                  {stepLabel(row.stepReached ?? 1)}
                </span>
                {row.optedOut && (
                  <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 999, padding: '2px 9px', fontSize: '.7rem', fontWeight: 600 }}>
                    🚫 PAROU
                  </span>
                )}
                {!row.optedOut && row.status && row.status !== 'checkout_started' && (
                  <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 999, padding: '2px 9px', fontSize: '.7rem', fontWeight: 600 }}>
                    {row.status === 'converted' ? '✓ Convertido' : row.status === 'redirected_to_payment' ? '→ No Pagamento' : row.status}
                  </span>
                )}
              </div>
              {row.customerPhone && <p style={{ margin: '3px 0 0', fontSize: '.82rem', color: '#64748b' }}>📱 {row.customerPhone}</p>}
              {row.customerEmail && <p style={{ margin: '2px 0 0', fontSize: '.82rem', color: '#64748b' }}>✉️ {row.customerEmail}</p>}
              <p style={{ margin: '4px 0 0', fontSize: '.78rem', color: '#94a3b8' }}>
                {row.quantity ? `${row.quantity} item${row.quantity !== 1 ? 's' : ''}` : ''} · {timeAgo(row.createdAt)}
              </p>
              {row.recoverySentAt && (
                <p style={{ margin: '4px 0 0', fontSize: '.75rem', color: '#22c55e', fontWeight: 600 }}>
                  ✓ Mensagem enviada {timeAgo(row.recoverySentAt)}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                onClick={() => aiSendMut.mutate({ cartId: row.id })}
                disabled={aiSendMut.isPending}
                title="IA gera mensagem personalizada e envia agora"
                style={{ padding: '7px 13px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: aiSendMut.isPending ? 'not-allowed' : 'pointer', opacity: aiSendMut.isPending ? .7 : 1 }}
              >
                🤖 IA Enviar
              </button>
              <button
                onClick={() => sendMut.mutate({ id: row.id })}
                disabled={sendMut.isPending}
                style={{ ...btnWa, opacity: sendMut.isPending ? .7 : 1 }}
              >
                📤 Template
              </button>
              {waFallbacks[row.id] && (
                <a
                  href={waFallbacks[row.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir no WhatsApp Web — use se a mensagem automática não chegou"
                  style={{ padding: '7px 11px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 8, fontSize: '.78rem', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  📱 WA Manual
                </a>
              )}
              <button
                onClick={() => sendCouponMut.mutate(selectedCoupon ? { id: row.id, coupon: selectedCoupon } : { id: row.id, useCoupon: true })}
                disabled={sendCouponMut.isPending}
                title={
                  selectedCoupon ? `Enviar com o cupom ${selectedCoupon}`
                    : row.activeCoupon ? `Enviar com o cupom ${row.activeCoupon} (automático)`
                    : 'Nenhum cupom ativo cadastrado — crie um na aba Cupons'
                }
                style={{ ...btnWaSecondary, opacity: sendCouponMut.isPending ? .7 : 1 }}
              >
                🎁 + Cupom{(selectedCoupon || row.activeCoupon) ? ` (${selectedCoupon || row.activeCoupon})` : ''}
              </button>
              <button
                onClick={() => markRecovered.mutate({ id: row.id })}
                disabled={markRecovered.isPending}
                style={btnGreen}
              >
                ✓ Recuperado
              </button>
              {!row.optedOut && (
                <button
                  onClick={() => { if (confirm(`Registrar opt-out para ${row.customerName}? Isso cancelará todas as automações para este contato.`)) optOutMut.mutate({ id: row.id }); }}
                  disabled={optOutMut.isPending}
                  title="Cliente pediu para parar — cancela todas as automações e bloqueia futuros envios"
                  style={btnDanger}
                >
                  🚫 Parou
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tab 2: Pedidos Não Pagos ────────────────────────────── */
function UnpaidTab() {
  const { data, isLoading, refetch } = trpc.recovery.listUnpaid.useQuery(undefined, { refetchInterval: 600000, staleTime: 300000, retry: 0, refetchOnWindowFocus: false });
  const templatesQ = trpc.recovery.listTemplates.useQuery(undefined, { staleTime: 300000, refetchOnWindowFocus: false });
  const [selectedTemplates, setSelectedTemplates] = useState<Record<number, number>>({});
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [aiMsgMap, setAiMsgMap] = useState<Record<number, { message: string; reasoning: string }>>({});
  const sendMut = trpc.recovery.sendUnpaid.useMutation({
    onSuccess: (d: any) => { toast.success(d.hasPix ? `✅ PIX enviado para ${d.phone}` : `✅ Enviado para ${d.phone}`); refetch(); },
    onError: (e) => toast.error('Falha no envio: ' + e.message),
  });
  const aiOrderMut = trpc.recovery.aiProcessOrder.useMutation({
    onSuccess: (d: any, vars: any) => {
      setAiMsgMap(m => ({ ...m, [vars.orderId]: { message: d.message, reasoning: d.reasoning } }));
      toast.success(d.hasPix ? '🤖 IA gerou mensagem com PIX' : '🤖 IA gerou mensagem');
    },
    onError: (e) => toast.error('IA: ' + e.message),
  });
  const aiSendUnpaidMut = trpc.recovery.sendUnpaid.useMutation({
    onSuccess: (d: any) => { toast.success(`✅ Enviado para ${d.phone}`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>;

  const rows = data ?? [];
  const unpaidTemplates = (templatesQ.data ?? []).filter((t: any) => t.type === 'unpaid' || t.type === 'failed');

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
        <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Todos os pedidos foram pagos!</p>
        <p style={{ fontSize: '.85rem', color: '#94a3b8', marginTop: 6 }}>Nenhum pedido aguardando pagamento.</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 16 }}>{rows.length} pedido{rows.length !== 1 ? 's' : ''} sem pagamento</p>
      {rows.map((row: any) => (
        <div key={row.id} style={{ ...card, borderLeft: `4px solid ${row.paymentStatus === 'failed' ? '#ef4444' : '#f59e0b'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0b1d3a' }}>#{row.id} — {row.customerName || 'Cliente'}</span>
                <span style={{ background: row.paymentStatus === 'failed' ? '#fee2e2' : '#fef3c7', color: row.paymentStatus === 'failed' ? '#991b1b' : '#92400e', borderRadius: 999, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700 }}>
                  {row.paymentStatus === 'awaiting' ? 'Aguard. Pgto' : row.paymentStatus === 'confirmed' ? 'Pago ✓' : 'Pagamento Falhou'}
                </span>
                {row.mpPaymentId && <span style={{ background: '#f0fdf4', color: '#15803d', borderRadius: 999, padding: '2px 8px', fontSize: '.7rem', fontWeight: 600 }}>PIX/Boleto disponível</span>}
              </div>
              {row.customerPhone && <p style={{ margin: '2px 0', fontSize: '.82rem', color: '#64748b' }}>📱 {row.customerPhone}</p>}
              <p style={{ margin: '2px 0', fontSize: '.85rem', color: '#334155' }}>🧂 {row.quantity ?? 1}× Sal Marinho 1kg — <strong>{fmt(row.totalPrice)}</strong></p>
              <p style={{ margin: '2px 0 6px', fontSize: '.75rem', color: '#94a3b8' }}>{timeAgo(row.createdAt)}</p>

              {/* Template selector */}
              {unpaidTemplates.length > 0 && (
                <select
                  value={selectedTemplates[row.id] ?? ''}
                  onChange={e => setSelectedTemplates(s => ({ ...s, [row.id]: Number(e.target.value) }))}
                  style={{ ...inputStyle, maxWidth: 280, marginBottom: 4 }}
                >
                  <option value="">Template automático</option>
                  {unpaidTemplates.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.label}{t.isDefault ? ' ★' : ''}</option>
                  ))}
                </select>
              )}

              {/* AI Preview */}
              {aiMsgMap[row.id] && (
                <div style={{ background: '#eef2ff', border: '1.5px solid #c7d2fe', borderRadius: 10, padding: '10px 12px', marginTop: 6, maxWidth: 380 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '.7rem', fontWeight: 700, color: '#4338ca', textTransform: 'uppercase' }}>🤖 Mensagem IA</p>
                  <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '.78rem', color: '#3730a3', whiteSpace: 'pre-wrap' }}>{aiMsgMap[row.id].message}</pre>
                  {aiMsgMap[row.id].reasoning && (
                    <p style={{ margin: '6px 0 0', fontSize: '.7rem', color: '#6366f1', fontStyle: 'italic' }}>💡 {aiMsgMap[row.id].reasoning}</p>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <button
                onClick={() => aiOrderMut.mutate({ orderId: row.id })}
                disabled={aiOrderMut.isPending}
                title="IA gera mensagem personalizada (com PIX se disponível)"
                style={{ padding: '7px 13px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: aiOrderMut.isPending ? 'not-allowed' : 'pointer', opacity: aiOrderMut.isPending ? .7 : 1 }}
              >
                {aiOrderMut.isPending ? '⏳...' : '🤖 IA Gerar'}
              </button>
              {aiMsgMap[row.id] && (
                <button
                  onClick={() => sendMut.mutate({ id: row.id })}
                  disabled={sendMut.isPending}
                  style={{ padding: '7px 13px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 8, fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  📤 Enviar IA
                </button>
              )}
              <button
                onClick={() => sendMut.mutate({ id: row.id, templateId: selectedTemplates[row.id] || undefined })}
                disabled={sendMut.isPending}
                style={{ ...btnWa, opacity: sendMut.isPending ? .7 : 1 }}
              >
                {row.mpPaymentId ? '💸 Template PIX' : '📤 Template'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tab 3: Templates de Mensagem ────────────────────────── */
const TYPE_LABELS: Record<string, string> = {
  abandoned: '🛒 Abandono', unpaid: '💸 Não Pago', failed: '❌ Pgto Falhou', general: '💬 Geral',
};
const VARS_HINT: Record<string, string[]> = {
  abandoned: ['{nome}', '{cupom}', '{link}', '{produto}'],
  unpaid:    ['{nome}', '{pedido}', '{valor}', '{link}', '{pix}'],
  failed:    ['{nome}', '{pedido}', '{link}'],
  general:   ['{nome}'],
};

function TemplatesTab() {
  const { data, isLoading, refetch } = trpc.recovery.listTemplates.useQuery(undefined, { staleTime: 300000, refetchOnWindowFocus: false });
  const saveMut = trpc.recovery.saveTemplate.useMutation({
    onSuccess: () => { toast.success('Template salvo!'); setEditing(null); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.recovery.deleteTemplate.useMutation({
    onSuccess: () => { toast.success('Removido'); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const setDefaultMut = trpc.recovery.setDefaultTemplate.useMutation({
    onSuccess: () => { toast.success('Padrão atualizado'); refetch(); },
  });

  const blank = { id: undefined as number | undefined, slug: '', type: 'abandoned' as const, label: '', body: '', active: true, isDefault: false };
  const [editing, setEditing] = useState<typeof blank | null>(null);
  const [showNew, setShowNew] = useState(false);

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>;
  const templates = (data ?? []) as any[];
  const grouped = templates.reduce((acc: Record<string, any[]>, t: any) => {
    (acc[t.type] = acc[t.type] ?? []).push(t);
    return acc;
  }, {});

  const form = editing ?? { ...blank };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: '.82rem', color: '#64748b' }}>{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        <button onClick={() => { setShowNew(true); setEditing({ ...blank }); }} style={{ ...btnPrimary, fontSize: '.8rem' }}>
          ➕ Novo Template
        </button>
      </div>

      {/* Editor */}
      {editing && (
        <div style={{ ...card, borderColor: '#c7d2fe', marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 800, color: '#0b1d3a' }}>
            {editing.id ? 'Editar Template' : 'Novo Template'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select value={form.type} onChange={e => setEditing(f => f ? { ...f, type: e.target.value as any } : f)} style={inputStyle}>
                <option value="abandoned">🛒 Abandono</option>
                <option value="unpaid">💸 Não Pago</option>
                <option value="failed">❌ Pgto Falhou</option>
                <option value="general">💬 Geral</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nome (exibição)</label>
              <input value={form.label} onChange={e => setEditing(f => f ? { ...f, label: e.target.value } : f)} placeholder="Ex: Abandono – Urgência" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Slug (único)</label>
              <input value={form.slug} onChange={e => setEditing(f => f ? { ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') } : f)} placeholder="abandoned_urgencia" style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.active} onChange={e => setEditing(f => f ? { ...f, active: e.target.checked } : f)} />
                Ativo
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.isDefault} onChange={e => setEditing(f => f ? { ...f, isDefault: e.target.checked } : f)} />
                Padrão para este tipo
              </label>
            </div>
          </div>

          {/* Var hints */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ ...labelStyle, marginBottom: 4 }}>Variáveis disponíveis</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(VARS_HINT[form.type] ?? []).map(v => (
                <button key={v} type="button"
                  onClick={() => setEditing(f => f ? { ...f, body: f.body + v } : f)}
                  style={{ padding: '3px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: '.75rem', fontFamily: 'monospace', cursor: 'pointer' }}
                >
                  {v}
                </button>
              ))}
            </div>
            {form.type === 'abandoned' && form.body.includes('{cupom}') && (
              <p style={{ margin: '6px 0 0', fontSize: '.74rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 8px' }}>
                ⚠️ <strong>{'{cupom}'}</strong> é preenchido automaticamente com o cupom ativo cadastrado na aba <strong>🎟️ Cupons</strong>
                (o de criação mais recente, dentro da validade e do limite de usos). Se nenhum cupom estiver ativo, esse trecho fica em branco.
                O <strong>{'{link}'}</strong> já inclui <code>?cupom=CODIGO</code>, então o site preenche e valida o cupom automaticamente para o cliente.
              </p>
            )}
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Mensagem</label>
            <textarea
              value={form.body}
              onChange={e => setEditing(f => f ? { ...f, body: e.target.value } : f)}
              rows={8}
              placeholder={'Olá *{nome}*! ...\n\nUse {link} para o link do site.'}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '.82rem', lineHeight: 1.5 }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '.72rem', color: '#94a3b8' }}>{form.body.length} caracteres</p>
          </div>

          {/* Preview */}
          {form.body && (
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: '.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Preview (com dados fictícios)</p>
              <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '.82rem', color: '#334155', whiteSpace: 'pre-wrap' }}>
                {renderTplPreview(form.body, form.type)}
              </pre>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => saveMut.mutate({ ...form, id: form.id })} disabled={saveMut.isPending || !form.label || !form.slug || !form.body}
              style={{ ...btnPrimary, opacity: saveMut.isPending ? .7 : 1 }}>
              {saveMut.isPending ? 'Salvando...' : '💾 Salvar'}
            </button>
            <button onClick={() => setEditing(null)} style={btnGhost}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Template groups */}
      {Object.entries(TYPE_LABELS).map(([type, typeLabel]) => {
        const items = grouped[type] ?? [];
        if (!items.length && !editing) return null;
        return (
          <div key={type} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: '.82rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 10px' }}>
              {typeLabel}
            </h3>
            {items.length === 0 ? (
              <p style={{ fontSize: '.82rem', color: '#94a3b8', margin: 0 }}>Nenhum template deste tipo</p>
            ) : items.map((t: any) => (
              <div key={t.id} style={{ ...card, opacity: t.active ? 1 : 0.6, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontWeight: 800, color: '#0b1d3a', fontSize: '.95rem' }}>{t.label}</span>
                      {t.isDefault && <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 999, padding: '2px 8px', fontSize: '.7rem', fontWeight: 700 }}>★ Padrão</span>}
                      {!t.active && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 999, padding: '2px 8px', fontSize: '.7rem', fontWeight: 600 }}>Inativo</span>}
                      <span style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#94a3b8' }}>{t.slug}</span>
                    </div>
                    <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '.78rem', color: '#475569', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden', WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)' }}>
                      {t.body}
                    </pre>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {!t.isDefault && (
                      <button onClick={() => setDefaultMut.mutate({ id: t.id, type: t.type })} style={{ ...btnGhost, fontSize: '.72rem', padding: '5px 10px' }}>
                        ★ Padrão
                      </button>
                    )}
                    <button onClick={() => setEditing({ id: t.id, slug: t.slug, type: t.type, label: t.label, body: t.body, active: t.active, isDefault: t.isDefault })}
                      style={{ ...btnGhost, fontSize: '.72rem', padding: '5px 10px' }}>
                      ✏️ Editar
                    </button>
                    <button onClick={() => { if (!confirm(`Excluir "${t.label}"?`)) return; deleteMut.mutate({ id: t.id }); }}
                      style={{ ...btnDanger, fontSize: '.72rem', padding: '5px 10px' }}>
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function renderTplPreview(body: string, type: string): string {
  const fakeVars: Record<string, string> = {
    nome: 'João Silva', cupom: 'EXEMPLO10', link: 'https://premium.salvitarn.com.br?cupom=EXEMPLO10',
    produto: 'Sal Marinho Integral 1kg', pedido: '10042', valor: '79,80',
    pix: '00020126580014br.gov.bcb.pix0136abc123...', boleto_url: 'https://mercadopago.com/boleto/...',
  };
  return body.replace(/\{(\w+)\}/g, (_, k) => fakeVars[k] ?? `{${k}}`);
}

/* ── Tab 5: Cupons ───────────────────────────────────────── */
function CouponsTab() {
  const { data, isLoading, refetch } = trpc.recovery.listCoupons.useQuery(undefined, { staleTime: 300000, refetchOnWindowFocus: false });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    description: '',
    discountType: 'percent' as 'percent' | 'fixed',
    discountValue: '',
    minOrderValue: '0',
    maxUses: '100',
    expiresAt: '',
  });

  const createMut = trpc.recovery.createCoupon.useMutation({
    onSuccess: () => {
      toast.success('Cupom criado!');
      setShowForm(false);
      setForm({ code: '', description: '', discountType: 'percent', discountValue: '', minOrderValue: '0', maxUses: '100', expiresAt: '' });
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleMut = trpc.recovery.toggleCoupon.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const setRecoveryMut = trpc.recovery.setRecoveryCoupon.useMutation({
    onSuccess: () => { toast.success('Cupom de recuperação atualizado!'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.recovery.deleteCoupon.useMutation({
    onSuccess: () => { toast.success('Cupom removido'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = field === 'code' ? e.target.value.toUpperCase() : e.target.value;
    setForm(f => ({ ...f, [field]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate({
      code: form.code,
      description: form.description,
      discountType: form.discountType,
      discountValue: parseFloat(form.discountValue),
      minOrderValue: parseFloat(form.minOrderValue) || 0,
      maxUses: parseInt(form.maxUses) || 100,
      expiresAt: form.expiresAt || undefined,
    });
  };

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>;
  const coupons = data ?? [];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowForm(s => !s)}
          style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {showForm ? '✕ Cancelar' : '➕ Novo Cupom'}
        </button>
      </div>

      {showForm && (
        <div style={{ ...card, borderColor: '#c7d2fe', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 800, color: '#0b1d3a' }}>Criar Cupom</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <label style={labelStyle}>Código</label>
                <input value={form.code} onChange={set('code')} required placeholder="EX: VOLTA10" style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '.05em' }} />
              </div>
              <div>
                <label style={labelStyle}>Tipo de desconto</label>
                <select value={form.discountType} onChange={set('discountType')} style={inputStyle}>
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Fixo (R$)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Valor do desconto</label>
                <input type="number" min="0" step="0.01" value={form.discountValue} onChange={set('discountValue')} required placeholder={form.discountType === 'percent' ? '10' : '5.00'} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Pedido mínimo (R$)</label>
                <input type="number" min="0" step="0.01" value={form.minOrderValue} onChange={set('minOrderValue')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Máximo de usos</label>
                <input type="number" min="1" value={form.maxUses} onChange={set('maxUses')} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Expira em</label>
                <input type="datetime-local" value={form.expiresAt} onChange={set('expiresAt')} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Descrição</label>
                <input value={form.description} onChange={set('description')} placeholder="Ex: Cupom de recuperação de carrinho abandonado" style={inputStyle} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button type="submit" disabled={createMut.isPending} style={{ ...btnPrimary, opacity: createMut.isPending ? .6 : 1 }}>
                {createMut.isPending ? 'Criando...' : 'Criar Cupom'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={btnGhost}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {coupons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎟️</div>
          <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Nenhum cupom cadastrado</p>
          <p style={{ fontSize: '.85rem', color: '#94a3b8', marginTop: 6 }}>Crie cupons para recuperar carrinhos abandonados.</p>
        </div>
      ) : (
        coupons.map((c: any) => {
          const remaining = (c.maxUses ?? 0) - (c.usedCount ?? 0);
          const isActive = c.isActive ?? c.active ?? true;
          return (
            <div key={c.id} style={{ ...card, opacity: isActive ? 1 : 0.65 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 800, color: '#0C3680', letterSpacing: '.08em' }}>{c.code}</span>
                    <span style={{ background: isActive ? '#dcfce7' : '#f1f5f9', color: isActive ? '#166534' : '#64748b', borderRadius: 999, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700 }}>
                      {isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    {c.useForRecovery && (
                      <span style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 999, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700 }}>
                        ⭐ Usado em recuperação
                      </span>
                    )}
                  </div>
                  {c.description && <p style={{ margin: '0 0 4px', fontSize: '.85rem', color: '#334155' }}>{c.description}</p>}
                  <p style={{ margin: '0 0 2px', fontSize: '.82rem', color: '#64748b' }}>
                    {c.discountType === 'percent' ? `${c.discountValue}% de desconto` : `${fmt(c.discountValue)} de desconto`}
                    {c.minOrderValue > 0 ? ` · Pedido mín: ${fmt(c.minOrderValue)}` : ''}
                  </p>
                  <p style={{ margin: 0, fontSize: '.78rem', color: '#94a3b8' }}>
                    {remaining} uso{remaining !== 1 ? 's' : ''} restante{remaining !== 1 ? 's' : ''}
                    {c.expiresAt ? ` · Expira ${new Date(c.expiresAt).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setRecoveryMut.mutate({ id: c.id, enabled: !c.useForRecovery })}
                    disabled={setRecoveryMut.isPending || !isActive}
                    title={isActive ? 'Usar este cupom automaticamente nas mensagens de recuperação ({cupom})' : 'Ative o cupom para usá-lo na recuperação'}
                    style={{ ...btnGhost, fontSize: '.75rem', background: c.useForRecovery ? '#fef9c3' : undefined, borderColor: c.useForRecovery ? '#fde047' : undefined }}
                  >
                    {c.useForRecovery ? '⭐ Recuperação' : '☆ Usar em recuperação'}
                  </button>
                  <button
                    onClick={() => toggleMut.mutate({ id: c.id, active: !isActive })}
                    disabled={toggleMut.isPending}
                    style={{ ...btnGhost, fontSize: '.75rem' }}
                  >
                    {isActive ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => { if (!window.confirm(`Excluir o cupom "${c.code}"? Esta ação não pode ser desfeita.`)) return; deleteMut.mutate({ id: c.id }); }}
                    disabled={deleteMut.isPending}
                    style={btnDanger}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ── Tab 4: Automações ───────────────────────────────────── */
function AutomationTab() {
  const { data, isLoading, refetch } = trpc.recovery.listAutomationRuns.useQuery(undefined, { refetchInterval: 600000, staleTime: 300000, retry: 0, refetchOnWindowFocus: false });
  const jobMut = trpc.recovery.runAutomationJob.useMutation({
    onSuccess: (d: any) => { toast.success(`Job: ${d.sent} enviados, ${d.cancelled} cancelados, ${d.failed} falhas`); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>;
  const rows = (data ?? []) as any[];

  const statusColor: Record<string, { bg: string; text: string }> = {
    scheduled: { bg: '#fef3c7', text: '#92400e' },
    sent:      { bg: '#d1fae5', text: '#065f46' },
    cancelled: { bg: '#f1f5f9', text: '#64748b' },
    failed:    { bg: '#fee2e2', text: '#991b1b' },
  };

  const scheduled = rows.filter(r => r.status === 'scheduled').length;
  const sent = rows.filter(r => r.status === 'sent').length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '6px 14px', fontSize: '.82rem', fontWeight: 700 }}>
            ⏳ {scheduled} agendadas
          </span>
          <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 10, padding: '6px 14px', fontSize: '.82rem', fontWeight: 700 }}>
            ✓ {sent} enviadas
          </span>
        </div>
        <button
          onClick={() => jobMut.mutate()}
          disabled={jobMut.isPending}
          style={{ ...btnPrimary, fontSize: '.78rem', padding: '7px 14px', marginLeft: 'auto', opacity: jobMut.isPending ? .7 : 1 }}
        >
          {jobMut.isPending ? '⏳ Executando...' : '▶ Executar Job'}
        </button>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#64748b', border: '2px dashed #e2e8f0', borderRadius: 14 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>⚡</div>
          <p style={{ fontWeight: 700, margin: '0 0 6px' }}>Nenhuma automação registrada</p>
          <p style={{ fontSize: '.83rem', margin: 0, color: '#94a3b8' }}>As automações aparecem quando clientes abandonam o checkout.</p>
        </div>
      ) : rows.map((r: any) => {
        const sc = statusColor[r.status] ?? { bg: '#f1f5f9', text: '#334155' };
        const isOverdue = r.status === 'scheduled' && new Date(r.scheduledFor) <= new Date();
        return (
          <div key={r.id} style={{ ...card, borderLeft: `4px solid ${r.status === 'sent' ? '#22c55e' : r.status === 'scheduled' ? '#f59e0b' : '#cbd5e1'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: '.9rem', color: '#0b1d3a' }}>Cart #{r.cartId}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '.82rem', color: '#334155' }}>{r.customerPhone}</span>
                  <span style={{ background: sc.bg, color: sc.text, borderRadius: 999, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700 }}>
                    {r.status === 'scheduled' ? '⏳ Agendada' : r.status === 'sent' ? '✓ Enviada' : r.status === 'cancelled' ? 'Cancelada' : '✗ Falhou'}
                  </span>
                  {r.aiBody && <span style={{ background: '#eef2ff', color: '#4338ca', borderRadius: 999, padding: '2px 9px', fontSize: '.7rem', fontWeight: 700 }}>🤖 IA</span>}
                  {isOverdue && <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 999, padding: '2px 9px', fontSize: '.7rem', fontWeight: 700 }}>VENCIDA</span>}
                </div>
                <p style={{ margin: '0 0 2px', fontSize: '.75rem', color: '#94a3b8' }}>
                  {r.status === 'scheduled' ? `Disparo: ${new Date(r.scheduledFor).toLocaleString('pt-BR')}` : ''}
                  {r.status === 'sent' ? `Enviada: ${timeAgo(r.sentAt)}` : ''}
                  {r.status === 'cancelled' ? `Cancelada: ${timeAgo(r.cancelledAt)}` : ''}
                  {' · '}Criada {timeAgo(r.createdAt)}
                </p>
                {r.aiReasoning && (
                  <p style={{ margin: 0, fontSize: '.72rem', color: '#6366f1', fontStyle: 'italic' }}>💡 {r.aiReasoning}</p>
                )}
                {r.aiBody && r.status === 'scheduled' && (
                  <div style={{ marginTop: 6, background: '#eef2ff', borderRadius: 8, padding: '6px 10px', maxWidth: 360 }}>
                    <p style={{ margin: '0 0 3px', fontSize: '.68rem', fontWeight: 700, color: '#4338ca' }}>PRÉVIA DA MENSAGEM IA:</p>
                    <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '.73rem', color: '#3730a3', whiteSpace: 'pre-wrap', maxHeight: 70, overflow: 'hidden' }}>{r.aiBody}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Tab 5: IA Recuperação ───────────────────────────────── */
function AiTab() {
  const abandonedQ = trpc.recovery.listAbandoned.useQuery(undefined, { staleTime: 300000, refetchOnWindowFocus: false });
  const unpaidQ = trpc.recovery.listUnpaid.useQuery(undefined, { staleTime: 300000, refetchOnWindowFocus: false });
  const aiMut = trpc.recovery.aiRecovery.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const abandoned = abandonedQ.data ?? [];
  const unpaid = unpaidQ.data ?? [];

  const stats = aiMut.data?.stats as { abandoned?: number; unpaid?: number; conversionRate?: number; revenueAtRisk?: number } | undefined;
  const displayAbandoned = stats?.abandoned ?? abandoned.length;
  const displayUnpaid = stats?.unpaid ?? unpaid.length;
  const displayConversionRate = stats?.conversionRate != null ? stats.conversionRate.toFixed(1) : '—';
  const displayRevenueAtRisk = stats?.revenueAtRisk ?? unpaid.map((o: any) => parseFloat(o.totalPrice ?? '0') || 0).reduce((a: number, b: number) => a + b, 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '.72rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.05em' }}>Abandonados</p>
          <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#78350f' }}>{displayAbandoned}</p>
        </div>
        <div style={{ background: '#fee2e2', border: '1.5px solid #fecaca', borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '.72rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '.05em' }}>Não Pagos</p>
          <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#7f1d1d' }}>{displayUnpaid}</p>
        </div>
        <div style={{ background: '#dbeafe', border: '1.5px solid #bfdbfe', borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '.72rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '.05em' }}>Conversão</p>
          <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: '#1e3a8a' }}>{displayConversionRate}%</p>
        </div>
        <div style={{ background: '#dcfce7', border: '1.5px solid #bbf7d0', borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '.05em' }}>Em Risco</p>
          <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#14532d' }}>{fmt(displayRevenueAtRisk)}</p>
        </div>
      </div>

      <button
        onClick={() => aiMut.mutate({ abandonedCount: abandoned.length, unpaidCount: unpaid.length, revenueAtRisk: displayRevenueAtRisk })}
        disabled={aiMut.isPending}
        style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '11px 20px', fontSize: '.9rem', opacity: aiMut.isPending ? .7 : 1 }}
      >
        <span style={{ fontSize: '1.1rem' }}>🤖</span>
        {aiMut.isPending ? 'Analisando...' : 'Analisar com IA'}
      </button>

      {aiMut.data && (
        <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: '1.2rem' }}>🤖</span>
            <h3 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: '#0b1d3a' }}>Análise de Recuperação</h3>
          </div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '.85rem', color: '#334155', lineHeight: 1.7 }}>
            {typeof aiMut.data === 'string' ? aiMut.data : (aiMut.data as any)?.insights ?? JSON.stringify(aiMut.data, null, 2)}
          </pre>
        </div>
      )}

      {!aiMut.data && !aiMut.isPending && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: 14 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🤖</div>
          <p style={{ fontWeight: 600, fontSize: '.95rem', margin: '0 0 6px', color: '#64748b' }}>Análise IA disponível</p>
          <p style={{ fontSize: '.83rem', margin: 0 }}>Clique em "Analisar com IA" para obter insights sobre recuperação de vendas.</p>
        </div>
      )}
    </div>
  );
}

/* ── Painel (a autenticação e o header já são feitos pelo shell) ── */
type Tab = 'abandoned' | 'unpaid' | 'templates' | 'automations' | 'coupons' | 'ai';

export function RecoveryPanel() {
  const [tab, setTab] = useState<Tab>('abandoned');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'abandoned', label: '🛒 Carrinhos' },
    { id: 'unpaid', label: '💳 Não Pagos' },
    { id: 'templates', label: '📝 Mensagens' },
    { id: 'automations', label: '⚡ Automações' },
    { id: 'coupons', label: '🎟️ Cupons' },
    { id: 'ai', label: '🤖 IA' },
  ];

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '16px 20px 0' }}>
        <p style={{ margin: 0, fontSize: '.85rem', color: '#64748b' }}>Carrinhos abandonados, mensagens, automações e cupons de recuperação.</p>
        <WaStatusBadge />
      </div>

      {/* Tab bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 20px', margin: '12px 0 0', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: '.82rem', fontWeight: 700,
              background: tab === t.id ? '#0C3680' : '#f1f5f9',
              color: tab === t.id ? 'white' : '#64748b',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
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
