import { useState, useEffect, useRef } from 'react';
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

const CARGO: Record<string, string> = {
  bigbag: 'Big Bag',
  sacaria: 'Sacaria',
  granel: 'Granel',
};

const STEPS = ['available', 'in_progress', 'completed', 'validated', 'paid'];

export default function DriverFreightDetail({ id, nav }: { id: number; nav: (p: Page) => void }) {
  const [tab, setTab] = useState<'info' | 'chat' | 'docs'>('info');
  const [chatMsg, setChatMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: freight, isLoading } = trpc.freights.getById.useQuery({ id });
  const { data: chat = [] } = trpc.freightChats.list.useQuery(
    { freightId: id },
    { refetchInterval: 5000 }
  );
  const { data: docs = [] } = trpc.freightDocuments.listByFreight.useQuery({ freightId: id });

  const sendChat = trpc.freightChats.send.useMutation({
    onSuccess: () => { utils.freightChats.list.invalidate(); setChatMsg(''); },
  });

  const markDelivered = trpc.freights.markDelivered?.useMutation
    ? trpc.freights.markDelivered.useMutation({ onSuccess: () => utils.freights.getById.invalidate() })
    : null;

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  if (isLoading || !freight) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontFamily: "'Inter', sans-serif" }}>
        {isLoading ? 'Carregando...' : 'Frete não encontrado'}
      </div>
    );
  }

  const st = STATUS_META[freight.status] ?? STATUS_META['available'];
  const stepIdx = STEPS.indexOf(freight.status);

  const TABS = [
    { key: 'info' as const, label: 'Informações' },
    { key: 'chat' as const, label: `Chat (${chat.length})` },
    { key: 'docs' as const, label: `Docs (${docs.length})` },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 680, margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <button
          onClick={() => nav({ name: 'driver-freights' })}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '9px 13px', cursor: 'pointer', fontSize: 18, color: '#475569', flexShrink: 0, marginTop: 2, minWidth: 44, minHeight: 44 }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>{freight.title}</h1>
            <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {st.label}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
            {freight.originCity}/{freight.originState} → {freight.destinationCity}/{freight.destinationState}
            {freight.distance ? ` · ${freight.distance} km` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0C3680', letterSpacing: '-0.5px' }}>{fmtValue(freight.value)}</div>
          {freight.cargoType && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {CARGO[freight.cargoType] ?? freight.cargoType}
              {freight.weight ? ` · ${freight.weight}t` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Progress stepper */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 340 }}>
          {STEPS.map((s, i) => {
            const done = i <= stepIdx;
            const meta = STATUS_META[s];
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: done ? meta.color : '#e2e8f0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: done ? '#fff' : '#94a3b8', fontWeight: 700, flexShrink: 0,
                  }}>
                    {i < stepIdx ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 9, color: done ? meta.color : '#94a3b8', fontWeight: done ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {meta.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < stepIdx ? '#0C3680' : '#e2e8f0', margin: '0 4px', marginBottom: 16 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #f1f5f9', marginBottom: 20 }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: 'none', border: 'none', padding: '10px 16px', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === key ? 700 : 500,
              color: tab === key ? '#0C3680' : '#64748b',
              borderBottom: tab === key ? '2px solid #0C3680' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s', minHeight: 44, fontFamily: "'Inter', sans-serif",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Info */}
      {tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {freight.description && (
            <div style={card}>
              <div style={sectionLabel}>Descrição</div>
              <p style={{ margin: 0, color: '#475569', lineHeight: 1.6, fontSize: 14 }}>{freight.description}</p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              { label: 'Criado em', value: new Date(freight.createdAt).toLocaleDateString('pt-BR') },
              { label: 'Distância', value: freight.distance ? `${freight.distance} km` : '—' },
              { label: 'Tipo de carga', value: CARGO[freight.cargoType] ?? freight.cargoType ?? '—' },
              { label: 'Peso', value: freight.weight ? `${freight.weight} t` : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Mark delivered button */}
          {freight.status === 'in_progress' && markDelivered && (
            <div style={card}>
              <div style={sectionLabel}>Ação</div>
              <button
                onClick={() => markDelivered.mutate({ id })}
                disabled={markDelivered.isPending}
                style={{
                  background: '#ea580c', color: '#fff', border: 'none', borderRadius: 10,
                  padding: '12px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  minHeight: 44, opacity: markDelivered.isPending ? 0.7 : 1,
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {markDelivered.isPending ? 'Enviando...' : '✅ Marcar como Entregue'}
              </button>
            </div>
          )}

          {freight.status === 'in_progress' && !markDelivered && (
            <div style={{ ...card, textAlign: 'center', padding: '20px 24px' }}>
              <div style={sectionLabel}>Ação</div>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>
                Entre em contato com o administrador para registrar a entrega.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Chat */}
      {tab === 'chat' && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 460 }}>
          <div style={{ ...sectionLabel, marginBottom: 16 }}>Chat com Admin</div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, paddingRight: 4 }}>
            {chat.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14 }}>
                Nenhuma mensagem ainda
              </div>
            ) : (
              chat.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.senderRole === 'driver' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%', borderRadius: 12, padding: '10px 14px',
                    background: m.senderRole === 'driver' ? '#0C3680' : '#f1f5f9',
                    color: m.senderRole === 'driver' ? '#fff' : '#1e293b',
                  }}>
                    <div style={{ fontSize: 11, color: m.senderRole === 'driver' ? 'rgba(255,255,255,0.7)' : '#94a3b8', marginBottom: 4, fontWeight: 600 }}>
                      {m.senderRole === 'driver' ? 'Você' : 'Admin'}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.4 }}>{m.content}</div>
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>
                      {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              chatMsg.trim() && sendChat.mutate({ freightId: id, content: chatMsg });
            }}
            style={{ display: 'flex', gap: 10 }}
          >
            <input
              style={inp}
              value={chatMsg}
              onChange={(e) => setChatMsg(e.target.value)}
              placeholder="Mensagem..."
            />
            <button
              type="submit"
              disabled={!chatMsg.trim() || sendChat.isPending}
              style={{ background: '#0C3680', color: '#fff', border: 'none', borderRadius: 9, padding: '0 20px', fontWeight: 700, cursor: 'pointer', fontSize: 16, minHeight: 44, minWidth: 44 }}
            >
              →
            </button>
          </form>
        </div>
      )}

      {/* Tab: Docs */}
      {tab === 'docs' && (
        <div style={card}>
          <div style={sectionLabel}>Comprovantes</div>
          {docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📎</div>
              <p style={{ margin: 0 }}>Nenhum comprovante enviado ainda.</p>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>O upload de documentos estará disponível em breve.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {docs.map((d) => (
                <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                  <img
                    src={d.fileUrl}
                    alt="Comprovante"
                    style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10, border: '2px solid #e2e8f0', display: 'block' }}
                  />
                  <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
                    {new Date(d.uploadedAt).toLocaleDateString('pt-BR')}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 20,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #F3F4F6',
};
const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em',
  textTransform: 'uppercase', marginBottom: 14,
};
const inp: React.CSSProperties = {
  flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '10px 12px',
  fontSize: 14, outline: 'none', background: '#fafbff', color: '#1e293b',
  boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
};
