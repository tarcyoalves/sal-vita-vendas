import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  available:   { label: 'Disponível',    color: '#2563eb', bg: '#eff6ff' },
  in_progress: { label: 'Em Andamento',  color: '#d97706', bg: '#fffbeb' },
  completed:   { label: 'Concluído',     color: '#ea580c', bg: '#fff7ed' },
  validated:   { label: 'Validado',      color: '#7c3aed', bg: '#f5f3ff' },
  paid:        { label: 'Pago',          color: '#16a34a', bg: '#f0fdf4' },
};
const CARGO: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };
const STEPS = ['available', 'in_progress', 'completed', 'validated', 'paid'];

export default function FreightDetail({ id, nav }: { id: number; nav: (p: Page) => void }) {
  const [tab, setTab] = useState<'info' | 'map' | 'interests' | 'chat' | 'docs'>('info');
  const [chatMsg, setChatMsg] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: freight, isLoading } = trpc.freights.getById.useQuery({ id });
  const { data: interests = [] } = trpc.freightInterests.listByFreight.useQuery({ freightId: id });
  const { data: approvedDrivers = [] } = trpc.drivers.list.useQuery({ status: 'approved' });
  const { data: chat = [] } = trpc.freightChats.list.useQuery({ freightId: id }, { refetchInterval: 5000 });
  const { data: docs = [] } = trpc.freightDocuments.listByFreight.useQuery({ freightId: id });
  const { data: latestLoc } = trpc.locations.latestByFreight.useQuery({ freightId: id }, { refetchInterval: 30000, enabled: freight?.status === 'in_progress' });

  const assign    = trpc.freights.assignDriver.useMutation({ onSuccess: () => utils.freights.getById.invalidate() });
  const validate  = trpc.freights.validate.useMutation({ onSuccess: () => utils.freights.getById.invalidate() });
  const markPaid  = trpc.freights.markPaid.useMutation({ onSuccess: () => utils.freights.getById.invalidate() });
  const sendChat  = trpc.freightChats.send.useMutation({ onSuccess: () => { utils.freightChats.list.invalidate(); setChatMsg(''); } });

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  if (isLoading || !freight) return (
    <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
      {isLoading ? 'Carregando...' : 'Frete não encontrado'}
    </div>
  );

  const st = STATUS_META[freight.status] ?? STATUS_META['available'];
  const stepIdx = STEPS.indexOf(freight.status);

  const TABS = [
    { key: 'info',      label: 'Informações' },
    { key: 'map',       label: `📍 Mapa` },
    { key: 'interests', label: `Interessados (${interests.length})` },
    { key: 'chat',      label: `💬 Chat (${chat.length})` },
    { key: 'docs',      label: `📎 Docs (${docs.length})` },
  ] as const;

  return (
    <div style={{ padding: 32, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <button onClick={() => nav({ name: 'freights' })} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '9px 13px', cursor: 'pointer', fontSize: 18, color: '#475569', flexShrink: 0, marginTop: 2 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>{freight.title}</h1>
            <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>{st.label}</span>
          </div>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            {freight.originCity}/{freight.originState} → {freight.destinationCity}/{freight.destinationState}
            {freight.distance ? ` · ${freight.distance}km` : ''}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#0C3680', letterSpacing: '-1px' }}>{fmtValue(freight.value)}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{CARGO[freight.cargoType]} {freight.weight ? `· ${freight.weight}t` : ''}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '16px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {STEPS.map((s, i) => {
            const done = i <= stepIdx;
            const meta = STATUS_META[s];
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? meta.color : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: done ? '#fff' : '#94a3b8', fontWeight: 700, transition: 'background 0.3s', flexShrink: 0 }}>
                    {i < stepIdx ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 10, color: done ? meta.color : '#94a3b8', fontWeight: done ? 700 : 400, whiteSpace: 'nowrap' }}>{meta.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: i < stepIdx ? '#0C3680' : '#e2e8f0', margin: '0 6px', marginBottom: 16, transition: 'background 0.3s' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #f1f5f9', marginBottom: 20 }}>
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{ background: 'none', border: 'none', padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: tab === key ? 700 : 500, color: tab === key ? '#0C3680' : '#64748b', borderBottom: tab === key ? '2px solid #0C3680' : '2px solid transparent', marginBottom: -2, transition: 'all 0.15s' }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Criado em', value: new Date(freight.createdAt).toLocaleDateString('pt-BR') },
              { label: 'Distância', value: freight.distance ? `${freight.distance} km` : '—' },
              { label: 'Validado em', value: freight.validatedAt ? new Date(freight.validatedAt).toLocaleDateString('pt-BR') : '—' },
              { label: 'Pago em', value: freight.paidAt ? new Date(freight.paidAt).toLocaleDateString('pt-BR') : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div style={card}>
            <div style={sectionLabel}>Ações</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {freight.status === 'available' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <select style={{ ...inp, width: 240 }} value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)}>
                    <option value="">Selecionar motorista aprovado...</option>
                    {approvedDrivers.map((d) => <option key={d.id} value={d.id}>{d.userName} — {d.plate}</option>)}
                  </select>
                  <button disabled={!selectedDriverId || assign.isPending} onClick={() => assign.mutate({ freightId: id, driverId: parseInt(selectedDriverId) })} style={{ ...actionBtn, background: selectedDriverId ? '#0C3680' : '#e2e8f0', color: selectedDriverId ? '#fff' : '#94a3b8', cursor: selectedDriverId ? 'pointer' : 'default' }}>
                    🚛 Associar Motorista
                  </button>
                </div>
              )}
              {freight.status === 'completed' && (
                <button onClick={() => validate.mutate({ id })} disabled={validate.isPending} style={{ ...actionBtn, background: '#7c3aed', color: '#fff' }}>
                  ✅ Validar Entrega
                </button>
              )}
              {freight.status === 'validated' && (
                <button onClick={() => markPaid.mutate({ id })} disabled={markPaid.isPending} style={{ ...actionBtn, background: '#16a34a', color: '#fff' }}>
                  💰 Marcar como Pago
                </button>
              )}
              {['in_progress', 'completed', 'validated', 'paid'].includes(freight.status) && (
                <div style={{ fontSize: 13, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Motorista: </span>
                  <strong>{approvedDrivers.find((d) => d.id === freight.assignedDriverId)?.userName ?? `#${freight.assignedDriverId}`}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Map */}
      {tab === 'map' && (
        <div style={card}>
          <div style={sectionLabel}>Localização do Motorista</div>
          {freight.status !== 'in_progress' ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
              Rastreamento disponível apenas durante viagem ativa
            </div>
          ) : (
            <>
              <div id="sallog-map" style={{ height: 380, borderRadius: 10, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 14, border: '1px solid #e2e8f0' }}>
                {latestLoc
                  ? `📍 Última posição: ${latestLoc.lat.toFixed(4)}, ${latestLoc.lng.toFixed(4)}`
                  : '⏳ Aguardando sinal GPS do motorista...'}
              </div>
              {latestLoc && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                  Atualizado em {new Date(latestLoc.recordedAt).toLocaleString('pt-BR')}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab: Interests */}
      {tab === 'interests' && (
        <div style={card}>
          <div style={sectionLabel}>Motoristas Interessados</div>
          {interests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 14 }}>Nenhum motorista demonstrou interesse ainda</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {interests.map((i) => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 10, padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{i.userName}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>CPF: {i.driverCpf} · Placa: {i.driverPlate} · Tel: {i.driverPhone}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ background: i.driverStatus === 'approved' ? '#dcfce7' : '#fef3c7', color: i.driverStatus === 'approved' ? '#16a34a' : '#d97706', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                      {i.driverStatus === 'approved' ? 'Aprovado' : 'Pendente'}
                    </span>
                    {freight.status === 'available' && i.driverStatus === 'approved' && (
                      <button onClick={() => assign.mutate({ freightId: id, driverId: i.driverId })} style={{ background: '#0C3680', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                        Associar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Chat */}
      {tab === 'chat' && (
        <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 460 }}>
          <div style={{ ...sectionLabel, marginBottom: 16 }}>Chat com Motorista</div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, paddingRight: 4 }}>
            {chat.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14 }}>Nenhuma mensagem ainda</div>
            ) : (
              chat.map((m) => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.senderRole === 'admin' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '70%', borderRadius: 12, padding: '10px 14px', background: m.senderRole === 'admin' ? '#0C3680' : '#f1f5f9', color: m.senderRole === 'admin' ? '#fff' : '#1e293b' }}>
                    <div style={{ fontSize: 14, lineHeight: 1.4 }}>{m.content}</div>
                    <div style={{ fontSize: 10, marginTop: 4, opacity: 0.6, textAlign: 'right' }}>{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); chatMsg.trim() && sendChat.mutate({ freightId: id, content: chatMsg }); }} style={{ display: 'flex', gap: 10 }}>
            <input style={{ ...inp, flex: 1 }} value={chatMsg} onChange={(e) => setChatMsg(e.target.value)} placeholder="Mensagem..." />
            <button type="submit" disabled={!chatMsg.trim() || sendChat.isPending} style={{ background: '#0C3680', color: '#fff', border: 'none', borderRadius: 9, padding: '0 20px', fontWeight: 700, cursor: 'pointer', fontSize: 16 }}>→</button>
          </form>
        </div>
      )}

      {/* Tab: Documents */}
      {tab === 'docs' && (
        <div style={card}>
          <div style={sectionLabel}>Comprovantes de Entrega</div>
          {docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
              Nenhum comprovante enviado pelo motorista
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
              {docs.map((d) => (
                <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
                  <img src={d.fileUrl} alt="Comprovante" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 10, border: '2px solid #e2e8f0', display: 'block' }} />
                  <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>{new Date(d.uploadedAt).toLocaleDateString('pt-BR')}</div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' };
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 };
const inp: React.CSSProperties = { border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '10px 12px', fontSize: 14, outline: 'none', background: '#fafbff', color: '#1e293b', boxSizing: 'border-box' };
const actionBtn: React.CSSProperties = { border: 'none', borderRadius: 9, padding: '11px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
