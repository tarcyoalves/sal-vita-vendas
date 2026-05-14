import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  available:   { label: 'Disponível',   color: '#2563eb', bg: '#eff6ff' },
  in_progress: { label: 'Em Andamento', color: '#d97706', bg: '#fffbeb' },
  completed:   { label: 'Concluído',    color: '#ea580c', bg: '#fff7ed' },
  validated:   { label: 'Validado',     color: '#7c3aed', bg: '#f5f3ff' },
  paid:        { label: 'Pago',         color: '#16a34a', bg: '#f0fdf4' },
};

export default function DriverDashboard({ onNav }: { onNav: (p: Page) => void }) {
  const { data: driver, isLoading: loadingDriver } = trpc.drivers.myDriver.useQuery();
  const { data: freights = [], isLoading: loadingFreights } = trpc.freights.list.useQuery(
    { scope: 'mine' },
    { enabled: driver?.status === 'approved' }
  );

  if (loadingDriver) {
    return (
      <div style={centered}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🚛</div>
        <div style={{ color: '#0C3680', fontWeight: 700, fontSize: 16 }}>Carregando...</div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div style={centered}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: '#dc2626', fontWeight: 700 }}>Dados do motorista não encontrados.</div>
      </div>
    );
  }

  const isPending = driver.status === 'pending';

  const inProgress  = freights.filter((f) => f.status === 'in_progress').length;
  const completed   = freights.filter((f) => f.status === 'completed' || f.status === 'validated').length;
  const paid        = freights.filter((f) => f.status === 'paid').length;
  const totalEarned = freights.filter((f) => f.status === 'paid').reduce((s, f) => s + (f.value ?? 0), 0);

  return (
    <div style={{ padding: 24, maxWidth: 680, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Greeting header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>
          Olá, {driver.userName}! 👋
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>Placa: <strong>{driver.plate}</strong></span>
          <span style={isPending ? badgePending : badgeApproved}>
            {isPending ? 'Aguardando Aprovação' : 'Aprovado ✓'}
          </span>
        </div>
      </div>

      {/* Pending state */}
      {isPending && (
        <div style={{ ...card, textAlign: 'center', padding: '48px 32px' }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>⏳</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 800, color: '#0C3680' }}>
            Cadastro em análise
          </h2>
          <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.7, maxWidth: 380, margin: '0 auto' }}>
            Seu cadastro está sendo analisado pelo administrador.<br />
            Você receberá acesso aos fretes assim que for aprovado.
          </p>
          <div style={{ marginTop: 28, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 18px' }}>
            <span style={{ fontSize: 14, color: '#92400e', fontWeight: 600 }}>
              Em caso de dúvidas, entre em contato com o administrador.
            </span>
          </div>
        </div>
      )}

      {/* Approved state */}
      {!isPending && (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
            <StatCard icon="🚛" label="Em Andamento" value={inProgress} color="#d97706" bg="#fffbeb" />
            <StatCard icon="✅" label="Concluídos" value={completed} color="#ea580c" bg="#fff7ed" />
            <StatCard icon="💰" label="Pagos" value={paid} color="#16a34a" bg="#f0fdf4" />
            <StatCard icon="💵" label="Total Recebido" value={fmtValue(totalEarned)} color="#0C3680" bg="#eff6ff" isText />
          </div>

          {/* Quick links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            <button
              onClick={() => onNav({ name: 'driver-freights' })}
              style={quickLinkBtn}
            >
              <span style={{ fontSize: 22 }}>🔍</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Fretes Disponíveis</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Veja os fretes abertos e demonstre interesse</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 18, color: '#94a3b8' }}>›</span>
            </button>

            <button
              onClick={() => onNav({ name: 'driver-freights', id: 1 })}
              style={quickLinkBtn}
            >
              <span style={{ fontSize: 22 }}>📋</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Meus Fretes</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Acompanhe seus fretes ativos e histórico</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 18, color: '#94a3b8' }}>›</span>
            </button>
          </div>

          {/* Recent freights */}
          {!loadingFreights && freights.length > 0 && (
            <div style={card}>
              <div style={sectionLabel}>Fretes Recentes</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {freights.slice(0, 4).map((f) => {
                  const meta = STATUS_META[f.status] ?? STATUS_META['available'];
                  return (
                    <button
                      key={f.id}
                      onClick={() => onNav({ name: 'driver-freight-detail', id: f.id })}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 10, padding: '12px 14px', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 44 }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{f.title}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        <span style={{ background: meta.bg, color: meta.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                          {meta.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#0C3680' }}>
                          {fmtValue(f.value)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!loadingFreights && freights.length === 0 && (
            <div style={{ ...card, textAlign: 'center', padding: '32px 24px' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
              <p style={{ color: '#94a3b8', margin: 0, fontSize: 14 }}>
                Nenhum frete associado ainda. Demonstre interesse nos fretes disponíveis!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color, bg, isText }: {
  icon: string; label: string; value: string | number; color: string; bg: string; isText?: boolean;
}) {
  return (
    <div style={{ background: bg, borderRadius: 14, padding: '16px 18px', border: `1px solid ${color}22` }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: isText ? 18 : 28, fontWeight: 900, color, letterSpacing: isText ? '-0.3px' : '-1px', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{label}</div>
    </div>
  );
}

const centered: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  minHeight: '60vh', textAlign: 'center', padding: 32,
};
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #F3F4F6',
  marginBottom: 0,
};
const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 14,
};
const badgePending: React.CSSProperties = {
  background: '#fffbeb', color: '#d97706', borderRadius: 20,
  padding: '4px 12px', fontSize: 12, fontWeight: 700,
};
const badgeApproved: React.CSSProperties = {
  background: '#f0fdf4', color: '#16a34a', borderRadius: 20,
  padding: '4px 12px', fontSize: 12, fontWeight: 700,
};
const quickLinkBtn: React.CSSProperties = {
  background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
  padding: '16px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center',
  gap: 14, fontFamily: "'Inter', sans-serif", minHeight: 44,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)', transition: 'box-shadow 0.15s',
};
