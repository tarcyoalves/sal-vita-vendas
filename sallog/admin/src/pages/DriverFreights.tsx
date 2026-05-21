import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const CARGO: Record<string, string> = {
  bigbag: 'Big Bag',
  sacaria: 'Sacaria',
  granel: 'Granel',
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  available:   { label: 'Disponível',   color: '#2563eb', bg: '#eff6ff' },
  in_progress: { label: 'Em Andamento', color: '#d97706', bg: '#fffbeb' },
  completed:   { label: 'Concluído',    color: '#ea580c', bg: '#fff7ed' },
  validated:   { label: 'Validado',     color: '#7c3aed', bg: '#f5f3ff' },
  paid:        { label: 'Pago',         color: '#16a34a', bg: '#f0fdf4' },
};

export default function DriverFreights({ onNav }: { onNav: (p: Page) => void }) {
  const [activeTab, setActiveTab] = useState<'available' | 'mine'>('available');
  const [expressedIds, setExpressedIds] = useState<Set<number>>(new Set());
  const utils = trpc.useUtils();

  const { data: available = [], isLoading: loadingAvail } = trpc.freights.list.useQuery({ scope: 'available' });
  const { data: mine = [], isLoading: loadingMine } = trpc.freights.list.useQuery({ scope: 'mine' });

  const express = trpc.freightInterests.express.useMutation({
    onSuccess: (_data, vars) => {
      setExpressedIds((prev) => new Set([...prev, vars.freightId]));
      utils.freights.list.invalidate();
    },
  });

  return (
    <div style={{ padding: 24, maxWidth: 680, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.4px' }}>
        Fretes
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 20 }}>
        {([
          { key: 'available', label: `Disponíveis (${available.length})` },
          { key: 'mine',      label: `Meus Fretes (${mine.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1, border: 'none', cursor: 'pointer', borderRadius: 9, padding: '10px 0',
              fontWeight: activeTab === key ? 700 : 500, fontSize: 14,
              background: activeTab === key ? '#fff' : 'transparent',
              color: activeTab === key ? '#0C3680' : '#64748b',
              boxShadow: activeTab === key ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              transition: 'all 0.15s', minHeight: 44, fontFamily: "'Inter', sans-serif",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Disponíveis */}
      {activeTab === 'available' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loadingAvail ? (
            <LoadingState />
          ) : available.length === 0 ? (
            <EmptyState icon="🔍" message="Nenhum frete disponível no momento." />
          ) : (
            available.map((f) => {
              const alreadyExpressed = expressedIds.has(f.id);
              return (
                <div
                  key={f.id}
                  style={freightCard}
                  onClick={() => onNav({ name: 'driver-freight-detail', id: f.id })}
                >
                  {/* Route */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', marginBottom: 2 }}>{f.title}</div>
                      <div style={{ fontSize: 14, color: '#475569', fontWeight: 500 }}>
                        📍 {f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#0C3680', letterSpacing: '-0.5px' }}>
                        {fmtValue(f.value)}
                      </div>
                    </div>
                  </div>

                  {/* Tags row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    {f.cargoType && (
                      <span style={tag}>{CARGO[f.cargoType] ?? f.cargoType}</span>
                    )}
                    {f.distance && (
                      <span style={tag}>🛣 {f.distance} km</span>
                    )}
                    {f.weight && (
                      <span style={tag}>⚖ {f.weight} t</span>
                    )}
                  </div>

                  {/* Interest button */}
                  <button
                    disabled={alreadyExpressed || express.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!alreadyExpressed) express.mutate({ freightId: f.id });
                    }}
                    style={{
                      ...primaryBtn,
                      background: alreadyExpressed ? '#f0fdf4' : '#0C3680',
                      color: alreadyExpressed ? '#16a34a' : '#fff',
                      border: alreadyExpressed ? '1.5px solid #86efac' : 'none',
                      cursor: alreadyExpressed ? 'default' : 'pointer',
                    }}
                  >
                    {alreadyExpressed ? '✓ Interesse demonstrado' : 'Tenho Interesse'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Meus Fretes */}
      {activeTab === 'mine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loadingMine ? (
            <LoadingState />
          ) : mine.length === 0 ? (
            <EmptyState icon="📋" message="Você ainda não tem fretes associados." />
          ) : (
            mine.map((f) => {
              const meta = STATUS_META[f.status] ?? STATUS_META['available'];
              return (
                <button
                  key={f.id}
                  onClick={() => onNav({ name: 'driver-freight-detail', id: f.id })}
                  style={{ ...freightCard, border: 'none', cursor: 'pointer', textAlign: 'left', padding: 18 }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>{f.title}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>
                        {f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      <span style={{ background: meta.bg, color: meta.color, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                        {meta.label}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: '#0C3680' }}>
                        {fmtValue(f.value)}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 14 }}>
      Carregando...
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', background: '#fff', borderRadius: 14, border: '1px solid #F3F4F6' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <p style={{ color: '#94a3b8', margin: 0, fontSize: 14 }}>{message}</p>
    </div>
  );
}

const freightCard: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #F3F4F6',
  fontFamily: "'Inter', sans-serif",
};
const tag: React.CSSProperties = {
  background: '#f1f5f9', color: '#475569', borderRadius: 20,
  padding: '4px 12px', fontSize: 12, fontWeight: 600,
};
const primaryBtn: React.CSSProperties = {
  width: '100%', borderRadius: 10, padding: '12px 20px',
  fontWeight: 700, fontSize: 14, minHeight: 44,
  fontFamily: "'Inter', sans-serif", transition: 'opacity 0.15s',
};
