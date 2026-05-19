import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

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

/* ── Login ───────────────────────────────────────────────── */
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
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0b1d3a 0%,#1a3a6b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 24, boxShadow: '0 25px 60px rgba(0,0,0,.3)', padding: '40px 36px', width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: 56, width: 'auto', marginBottom: 12 }}>
            <defs><clipPath id="oval-rv"><ellipse cx="250" cy="187" rx="228" ry="164" /></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="white" />
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#0C3680" clipPath="url(#oval-rv)" />
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="#0C3680">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="#0C3680" strokeWidth="15" />
          </svg>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0b1d3a', margin: 0 }}>Recuperação de Vendas</h1>
          <p style={{ fontSize: '.85rem', color: '#94a3b8', marginTop: 4 }}>premium.salvitarn.com.br</p>
        </div>
        <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>E-mail</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@salvitarn.com.br" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
          </div>
          <button type="submit" disabled={loading} style={{ ...btnPrimary, marginTop: 4, padding: '13px', borderRadius: 12, fontSize: '.95rem', opacity: loading ? .6 : 1 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Tab 1: Carrinhos Abandonados ────────────────────────── */
function AbandonedTab() {
  const { data, isLoading, refetch } = trpc.recovery.listAbandoned.useQuery(undefined, { refetchInterval: 30000 });
  const markSent = trpc.recovery.markSent.useMutation({ onSuccess: () => refetch() });
  const markRecovered = trpc.recovery.markRecovered.useMutation({
    onSuccess: () => { toast.success('Marcado como recuperado!'); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const openWa = (url: string, id: number) => {
    window.open(url, '_blank');
    markSent.mutate({ id });
  };

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>;

  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
        <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Nenhum carrinho abandonado!</p>
        <p style={{ fontSize: '.85rem', color: '#94a3b8', marginTop: 6 }}>Todos os clientes finalizaram suas compras.</p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 16 }}>{rows.length} carrinho{rows.length !== 1 ? 's' : ''} abandonado{rows.length !== 1 ? 's' : ''}</p>
      {rows.map((row: any) => (
        <div key={row.id} style={{ ...card, borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0b1d3a' }}>{row.customerName || 'Cliente sem nome'}</span>
                <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700 }}>
                  {stepLabel(row.stepReached ?? 1)}
                </span>
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
              {row.waLink && (
                <button onClick={() => openWa(row.waLink, row.id)} style={btnWa}>
                  🔗 WhatsApp Simples
                </button>
              )}
              {row.waLinkWithCoupon && (
                <button onClick={() => openWa(row.waLinkWithCoupon, row.id)} style={btnWaSecondary}>
                  🎁 WhatsApp + Cupom
                </button>
              )}
              <button
                onClick={() => markRecovered.mutate({ id: row.id })}
                disabled={markRecovered.isPending}
                style={btnGreen}
              >
                ✓ Recuperado
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Tab 2: Pedidos Não Pagos ────────────────────────────── */
function UnpaidTab() {
  const { data, isLoading, refetch } = trpc.recovery.listUnpaid.useQuery(undefined, { refetchInterval: 30000 });

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Carregando...</div>;

  const rows = data ?? [];
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
        <p style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0 }}>Todos os pedidos foram pagos!</p>
        <p style={{ fontSize: '.85rem', color: '#94a3b8', marginTop: 6 }}>Nenhum pedido aguardando pagamento.</p>
      </div>
    );
  }

  const payColor: Record<string, { bg: string; text: string }> = {
    awaiting: { bg: '#fef3c7', text: '#92400e' },
    confirmed: { bg: '#d1fae5', text: '#065f46' },
    failed: { bg: '#fee2e2', text: '#991b1b' },
  };

  return (
    <div>
      <p style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 16 }}>{rows.length} pedido{rows.length !== 1 ? 's' : ''} sem pagamento</p>
      {rows.map((row: any) => {
        const pc = payColor[row.paymentStatus] ?? { bg: '#f1f5f9', text: '#334155' };
        return (
          <div key={row.id} style={{ ...card, borderLeft: '4px solid #ef4444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0b1d3a' }}>#{row.id} — {row.customerName || 'Cliente'}</span>
                  <span style={{ background: pc.bg, color: pc.text, borderRadius: 999, padding: '2px 9px', fontSize: '.72rem', fontWeight: 700 }}>
                    {row.paymentStatus === 'awaiting' ? 'Aguard. Pgto' : row.paymentStatus === 'confirmed' ? 'Pago ✓' : 'Falhou'}
                  </span>
                </div>
                {row.customerPhone && <p style={{ margin: '3px 0 0', fontSize: '.82rem', color: '#64748b' }}>📱 {row.customerPhone}</p>}
                <p style={{ margin: '4px 0 0', fontSize: '.85rem', color: '#334155' }}>
                  🧂 Sal Marinho Integral 1kg × {row.quantity ?? 1} unidade{(row.quantity ?? 1) !== 1 ? 's' : ''}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '.9rem', fontWeight: 700, color: '#0C3680' }}>{fmt(row.totalPrice)}</p>
                <p style={{ margin: '4px 0 0', fontSize: '.78rem', color: '#94a3b8' }}>{timeAgo(row.createdAt)}</p>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {row.waLinkUnpaid && (
                  <button onClick={() => window.open(row.waLinkUnpaid, '_blank')} style={btnWa}>
                    💸 Lembrar de Pagar
                  </button>
                )}
                {row.waLinkFailed && (
                  <button onClick={() => window.open(row.waLinkFailed, '_blank')} style={btnDanger}>
                    ❌ Pagamento Falhou
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Tab 3: Cupons ───────────────────────────────────────── */
function CouponsTab() {
  const { data, isLoading, refetch } = trpc.recovery.listCoupons.useQuery();
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
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => toggleMut.mutate({ id: c.id })}
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

/* ── Tab 4: IA Recuperação ───────────────────────────────── */
function AiTab() {
  const abandonedQ = trpc.recovery.listAbandoned.useQuery();
  const unpaidQ = trpc.recovery.listUnpaid.useQuery();
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

/* ── Main Component ──────────────────────────────────────── */
type Tab = 'abandoned' | 'unpaid' | 'coupons' | 'ai';

export default function SalVitaRecovery() {
  const [tab, setTab] = useState<Tab>('abandoned');
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const [, setLocation] = useLocation();
  const logoutMut = trpc.auth.logout.useMutation();

  if (meQuery.isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0b1d3a 0%,#1e3a6e 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'white', fontSize: '1rem' }}>Carregando...</div>
      </div>
    );
  }

  const user = meQuery.data as any;
  if (!user || user.role !== 'admin') {
    return <LoginForm />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'abandoned', label: '🛒 Carrinhos Abandonados' },
    { id: 'unpaid', label: '💳 Pedidos Não Pagos' },
    { id: 'coupons', label: '🎟️ Cupons' },
    { id: 'ai', label: '🤖 IA Recuperação' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0b1d3a 0%,#1e3a6e 100%)', color: 'white', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.5rem' }}>🔄</span>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>Recuperação de Vendas</h1>
            <p style={{ margin: 0, fontSize: '.78rem', opacity: .7 }}>Carrinhos abandonados · Cupons · IA</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.location.href = '/sal-vita-admin'}
            style={{ padding: '8px 14px', background: 'rgba(255,255,255,.15)', color: 'white', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer' }}
          >
            ← Pedidos
          </button>
          <button
            onClick={async () => { await logoutMut.mutateAsync(); setLocation('/sal-vita-admin'); window.location.reload(); }}
            style={{ padding: '8px 14px', background: 'rgba(255,255,255,.1)', color: 'white', border: '1px solid rgba(255,255,255,.15)', borderRadius: 8, fontSize: '.82rem', cursor: 'pointer' }}
          >
            Sair
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', display: 'flex', gap: 6, overflowX: 'auto' }}>
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
        {tab === 'coupons' && <CouponsTab />}
        {tab === 'ai' && <AiTab />}
      </div>
    </div>
  );
}
