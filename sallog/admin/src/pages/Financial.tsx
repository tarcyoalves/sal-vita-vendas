import { trpc } from '../lib/trpc';

function fmt(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Financial() {
  const { data: stats, isLoading } = trpc.freights.stats.useQuery();
  const { data: freights = [] }    = trpc.freights.list.useQuery({ scope: 'all' });

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Carregando...</div>;

  const paid       = stats?.paidValueCents ?? 0;
  const pending    = stats?.pendingPaymentCents ?? 0;
  const inProgress = stats?.inProgressValueCents ?? 0;
  const total      = stats?.totalValueCents ?? 0;

  const recentPaid = freights
    .filter((f) => f.status === 'paid')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  const toValidate = freights.filter((f) => f.status === 'completed');
  const toPay      = freights.filter((f) => f.status === 'validated');

  const monthly: { month: string; valueCents: number; count: number }[] = (stats as any)?.monthly ?? [];
  const maxVal = Math.max(...monthly.map((m) => m.valueCents), 1);

  return (
    <div style={{ padding: 32, maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}>Financeiro</h1>
        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 14 }}>Visão geral de receitas e pagamentos</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Movimentado', value: total, color: '#0C3680', bg: '#EEF2FF', icon: '💼' },
          { label: 'Total Pago', value: paid, color: '#16a34a', bg: '#F0FDF4', icon: '✅' },
          { label: 'A Pagar (Validado)', value: pending, color: '#7C3AED', bg: '#F5F3FF', icon: '📋' },
          { label: 'Em Andamento', value: inProgress, color: '#D97706', bg: '#FFFBEB', icon: '🚛' },
        ].map(({ label, value, color, bg, icon }) => (
          <div key={label} style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ background: bg, borderRadius: 8, padding: '6px 8px', fontSize: 18 }}>{icon}</div>
              <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: '-1px' }}>{fmt(value)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Monthly chart */}
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6', gridColumn: monthly.length ? '1 / -1' : '1 / 2' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 20 }}>Histórico Mensal</div>
          {monthly.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#9CA3AF', fontSize: 14 }}>Sem dados mensais disponíveis</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 140 }}>
              {monthly.map((m) => {
                const h = Math.max(4, Math.round((m.valueCents / maxVal) * 120));
                return (
                  <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: '#374151', fontWeight: 700 }}>{fmt(m.valueCents).replace('R$ ', 'R$').split(',')[0]}</div>
                    <div style={{ width: '100%', height: h, background: 'linear-gradient(180deg, #1E40AF, #0C3680)', borderRadius: '6px 6px 0 0', transition: 'height 0.4s' }} title={fmt(m.valueCents)} />
                    <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'capitalize' }}>{m.month}</div>
                    <div style={{ fontSize: 10, color: '#6B7280' }}>{m.count}fr</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* To validate */}
        {toValidate.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #FED7AA' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#EA580C' }}>Aguardando Validação ({toValidate.length})</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {toValidate.slice(0, 5).map((f) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF7ED', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{f.title}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#EA580C' }}>{fmt(f.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* To pay */}
        {toPay.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #DDD6FE' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 16 }}>💳</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7C3AED' }}>Aguardando Pagamento ({toPay.length})</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {toPay.slice(0, 5).map((f) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5F3FF', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{f.title}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#7C3AED' }}>{fmt(f.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent paid */}
      {recentPaid.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #F3F4F6' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Últimos Pagamentos</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                {['Frete', 'Rota', 'Valor', 'Pago em'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentPaid.map((f, i) => (
                <tr key={f.id} style={{ borderBottom: i < recentPaid.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                  <td style={{ padding: '12px 12px', fontWeight: 600, color: '#111827' }}>{f.title}</td>
                  <td style={{ padding: '12px 12px', color: '#6B7280', fontSize: 13 }}>
                    {f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}
                  </td>
                  <td style={{ padding: '12px 12px', fontWeight: 800, color: '#16A34A', fontSize: 15 }}>{fmt(f.value)}</td>
                  <td style={{ padding: '12px 12px', color: '#9CA3AF', fontSize: 13 }}>
                    {f.paidAt ? new Date(f.paidAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {recentPaid.length === 0 && toValidate.length === 0 && toPay.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 16 }}>Nenhum dado financeiro ainda</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Os dados aparecerão conforme os fretes forem concluídos</div>
        </div>
      )}
    </div>
  );
}
