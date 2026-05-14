import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const CARGO_TYPES = [
  { value: 'bigbag',  label: 'Big Bag',  icon: '🧺', desc: 'Sacolas de 1 tonelada' },
  { value: 'sacaria', label: 'Sacaria',  icon: '👜', desc: 'Sacos de 25 / 50 kg' },
  { value: 'granel',  label: 'A Granel', icon: '⛟',  desc: 'Sal solto no caminhão' },
];

const VEHICLE_GROUPS = [
  {
    label: 'Médios',
    items: ['Toco', 'Bitruck'],
  },
  {
    label: 'Pesados',
    items: ['Carreta', 'Carreta LS', 'Rodotrem', 'Outros'],
  },
];

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'avista', label: 'À Vista' },
  { value: 'prazo30', label: 'Prazo 30 dias' },
  { value: 'prazo60', label: 'Prazo 60 dias' },
  { value: 'a-combinar', label: 'A Combinar' },
];

type YesNo = 'sim' | 'nao';

export default function FreightNew({ nav }: { nav: (p: Page) => void }) {
  const [form, setForm] = useState({
    cargoType: 'bigbag' as 'bigbag' | 'sacaria' | 'granel',
    originCity: 'Mossoró', originState: 'RN',
    destinationCity: '', destinationState: 'SP',
    loadDate: '', deliveryDate: '',
    freightType: 'completo' as 'completo' | 'complemento',
    weight: '', distance: '',
    needsTarp: 'nao' as YesNo,
    needsTracker: 'nao' as YesNo,
    hasInsurance: 'sim' as YesNo,
    description: '',
    vehicleTypes: [] as string[],
    valueMode: 'known' as 'known' | 'negotiate',
    valueReais: '',
    paymentMethod: '',
  });
  const [error, setError] = useState('');
  const [aiHint, setAiHint] = useState('');

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const toggleVehicle = (v: string) => {
    setForm((p) => ({
      ...p,
      vehicleTypes: p.vehicleTypes.includes(v)
        ? p.vehicleTypes.filter((x) => x !== v)
        : [...p.vehicleTypes, v],
    }));
  };

  const suggestValue = trpc.ai.suggestValue.useMutation({
    onSuccess: (data) => {
      set('valueReais', data.valueReais.toFixed(2));
      setAiHint(`✨ ${data.justificativa}`);
    },
    onError: () => setAiHint('Não foi possível sugerir um valor agora.'),
  });

  const create = trpc.freights.create.useMutation({
    onSuccess: (data) => nav({ name: 'freight-detail', id: data.id }),
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const valueNegotiable = form.valueMode === 'negotiate';
    const valueNum = valueNegotiable ? 0 : parseFloat(form.valueReais.replace(',', '.'));
    if (!valueNegotiable && (isNaN(valueNum) || valueNum <= 0)) {
      setError('Informe um valor válido ou selecione "A combinar"');
      return;
    }
    create.mutate({
      title: `Sal ${form.cargoType === 'bigbag' ? 'Big Bag' : form.cargoType === 'sacaria' ? 'Sacaria' : 'Granel'} — ${form.originCity}/${form.originState} → ${form.destinationCity}/${form.destinationState}`,
      description: form.description || undefined,
      cargoType: form.cargoType,
      originCity: form.originCity,
      originState: form.originState,
      destinationCity: form.destinationCity,
      destinationState: form.destinationState,
      distance: form.distance ? parseFloat(form.distance) : undefined,
      value: Math.round(valueNum * 100),
      weight: form.weight ? parseFloat(form.weight) : undefined,
      loadDate: form.loadDate || undefined,
      deliveryDate: form.deliveryDate || undefined,
      freightType: form.freightType,
      vehicleTypes: form.vehicleTypes.length > 0 ? JSON.stringify(form.vehicleTypes) : undefined,
      needsTarp: form.needsTarp === 'sim',
      needsTracker: form.needsTracker === 'sim',
      hasInsurance: form.hasInsurance === 'sim',
      paymentMethod: form.paymentMethod || undefined,
      valueNegotiable,
    });
  }

  return (
    <div style={{ padding: '24px 24px 80px', maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button
          onClick={() => nav({ name: 'freights' })}
          style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 18, color: '#475569', flexShrink: 0 }}
        >←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>Cadastrar Frete</h1>
          <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 13 }}>Preencha os dados para publicar a oferta de carga</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Dados de coleta e entrega ── */}
        <Card>
          <SectionTitle>Dados de coleta e entrega</SectionTitle>
          <p style={subTxt}>Apenas estado e cidade são exibidos aos motoristas</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12, marginTop: 16 }}>
            <Field label="Cidade de coleta *">
              <input style={inp} required value={form.originCity} onChange={(e) => set('originCity', e.target.value)} placeholder="Mossoró" />
            </Field>
            <Field label="Estado *">
              <select style={inp} value={form.originState} onChange={(e) => set('originState', e.target.value)}>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 12 }}>
            <Field label="Cidade de entrega *">
              <input style={inp} required value={form.destinationCity} onChange={(e) => set('destinationCity', e.target.value)} placeholder="São Paulo" />
            </Field>
            <Field label="Estado *">
              <select style={inp} value={form.destinationState} onChange={(e) => set('destinationState', e.target.value)}>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Data de coleta (opcional)">
              <input style={inp} type="date" value={form.loadDate} onChange={(e) => set('loadDate', e.target.value)} />
            </Field>
            <Field label="Data de entrega (opcional)">
              <input style={inp} type="date" value={form.deliveryDate} onChange={(e) => set('deliveryDate', e.target.value)} />
            </Field>
          </div>
        </Card>

        {/* ── Dados da carga ── */}
        <Card>
          <SectionTitle>Dados da carga</SectionTitle>
          <p style={subTxt}>Quanto mais informações, menos contatos desnecessários</p>

          {/* Tipo de carga */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
            {CARGO_TYPES.map((c) => {
              const sel = form.cargoType === c.value;
              return (
                <label key={c.value} style={{ cursor: 'pointer' }}>
                  <input type="radio" name="cargoType" value={c.value} checked={sel} onChange={() => set('cargoType', c.value as typeof form.cargoType)} style={{ display: 'none' }} />
                  <div style={{ border: `2px solid ${sel ? '#0C3680' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 14px', background: sel ? '#eff6ff' : '#fff', transition: 'all 0.15s', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 4 }}>{c.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: sel ? '#0C3680' : '#1e293b' }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{c.desc}</div>
                  </div>
                </label>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
            <Field label="Peso total (toneladas)">
              <input style={inp} type="number" min="0" step="0.1" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="27" />
            </Field>
            <Field label="Distância estimada (km)">
              <input style={inp} type="number" min="0" step="1" value={form.distance} onChange={(e) => set('distance', e.target.value)} placeholder="2.800" />
            </Field>
            <div>
              <label style={lbl}>Tipo de frete</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                {(['completo', 'complemento'] as const).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => set('freightType', ft)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: `1.5px solid ${form.freightType === ft ? '#0C3680' : '#e2e8f0'}`, background: form.freightType === ft ? '#eff6ff' : '#fff', color: form.freightType === ft ? '#0C3680' : '#64748b', fontWeight: form.freightType === ft ? 700 : 500, fontSize: 12, cursor: 'pointer' }}
                  >
                    {ft.charAt(0).toUpperCase() + ft.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Yes/No toggles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 16 }}>
            <YesNoField label="Precisa de lona?" value={form.needsTarp} onChange={(v) => set('needsTarp', v)} />
            <YesNoField label="Precisa de rastreador?" value={form.needsTracker} onChange={(v) => set('needsTracker', v)} />
            <YesNoField label="Terá seguro?" value={form.hasInsurance} onChange={(v) => set('hasInsurance', v)} />
          </div>

          <Field label="Observações (opcional)" style={{ marginTop: 16 }}>
            <textarea
              style={{ ...inp, minHeight: 72, resize: 'vertical' }}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Horário de coleta, restrições, contato no destino..."
            />
          </Field>
        </Card>

        {/* ── Tipo de veículo ── */}
        <Card>
          <SectionTitle>Selecione o tipo de veículo</SectionTitle>
          <p style={subTxt}>Escolha um ou mais tipos aceitos para este frete</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 16 }}>
            {VEHICLE_GROUPS.map((grp) => (
              <div key={grp.label}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{grp.label}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {grp.items.map((v) => {
                    const checked = form.vehicleTypes.includes(v);
                    return (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${checked ? '#0C3680' : '#e2e8f0'}`, background: checked ? '#eff6ff' : '#fff', transition: 'all 0.15s' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? '#0C3680' : '#cbd5e1'}`, background: checked ? '#0C3680' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 11, color: '#fff', transition: 'all 0.15s' }}>
                          {checked && '✓'}
                        </div>
                        <input type="checkbox" checked={checked} onChange={() => toggleVehicle(v)} style={{ display: 'none' }} />
                        <span style={{ fontSize: 14, fontWeight: checked ? 600 : 400, color: checked ? '#0C3680' : '#374151' }}>{v}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Dados de pagamento ── */}
        <Card>
          <SectionTitle>Dados de pagamento</SectionTitle>

          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {[
              { k: 'known', label: 'Já sei o valor' },
              { k: 'negotiate', label: 'A combinar' },
            ].map(({ k, label }) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', borderRadius: 8, border: `1.5px solid ${form.valueMode === k ? '#0C3680' : '#e2e8f0'}`, background: form.valueMode === k ? '#eff6ff' : '#fff', flex: 1 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${form.valueMode === k ? '#0C3680' : '#cbd5e1'}`, background: form.valueMode === k ? '#0C3680' : '#fff', flexShrink: 0 }} />
                <input type="radio" name="valueMode" checked={form.valueMode === k} onChange={() => set('valueMode', k as 'known' | 'negotiate')} style={{ display: 'none' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: form.valueMode === k ? '#0C3680' : '#374151' }}>{label}</span>
              </label>
            ))}
          </div>

          {form.valueMode === 'known' && (
            <div style={{ marginTop: 16 }}>
              <Field label="Valor do frete (R$) *">
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>R$</span>
                  <input
                    style={{ ...inp, paddingLeft: 40 }}
                    required={form.valueMode === 'known'}
                    type="number" min="0" step="0.01"
                    value={form.valueReais}
                    onChange={(e) => set('valueReais', e.target.value)}
                    placeholder="1.500,00"
                  />
                </div>
              </Field>
              <button
                type="button"
                disabled={suggestValue.isPending || !form.destinationCity}
                onClick={() => suggestValue.mutate({
                  originCity: form.originCity, originState: form.originState,
                  destinationCity: form.destinationCity, destinationState: form.destinationState,
                  cargoType: form.cargoType,
                  weight: form.weight ? parseFloat(form.weight) : undefined,
                  distance: form.distance ? parseFloat(form.distance) : undefined,
                })}
                style={{ marginTop: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 16px', color: '#1d4ed8', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!form.destinationCity || suggestValue.isPending) ? 0.5 : 1 }}
              >
                {suggestValue.isPending ? 'Consultando IA...' : '✨ Sugerir valor com IA'}
              </button>
              {aiHint && (
                <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 8, background: '#eff6ff', padding: '8px 12px', borderRadius: 8, lineHeight: 1.5 }}>{aiHint}</div>
              )}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Field label="Forma de pagamento (opcional)">
              <select style={inp} value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                <option value="">Selecione...</option>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 14 }}>
            ⚠ {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => nav({ name: 'freights' })}
            style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, padding: 14, fontWeight: 600, cursor: 'pointer', fontSize: 15 }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={create.isPending}
            style={{ flex: 2, background: '#0C3680', color: '#fff', border: 'none', borderRadius: 10, padding: 14, fontWeight: 700, cursor: 'pointer', fontSize: 15, boxShadow: '0 4px 14px rgba(12,54,128,0.3)', opacity: create.isPending ? 0.7 : 1 }}
          >
            {create.isPending ? 'Publicando...' : '🚛 Publicar Frete'}
          </button>
        </div>

      </form>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '24px 24px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>{children}</div>;
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

function YesNoField({ label, value, onChange }: { label: string; value: 'sim' | 'nao'; onChange: (v: 'sim' | 'nao') => void }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['sim', 'nao'] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: `1.5px solid ${value === opt ? (opt === 'sim' ? '#16a34a' : '#ef4444') : '#e2e8f0'}`, background: value === opt ? (opt === 'sim' ? '#f0fdf4' : '#fef2f2') : '#fff', color: value === opt ? (opt === 'sim' ? '#16a34a' : '#ef4444') : '#64748b', fontWeight: value === opt ? 700 : 500, fontSize: 13, cursor: 'pointer' }}
          >
            {opt === 'sim' ? 'Sim' : 'Não'}
          </button>
        ))}
      </div>
    </div>
  );
}

const subTxt: React.CSSProperties = { margin: '4px 0 0', color: '#94a3b8', fontSize: 13 };
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, marginTop: 0 };
const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafbff', color: '#1e293b', transition: 'border-color 0.15s' };
