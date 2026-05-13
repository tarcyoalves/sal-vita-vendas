import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const CARGO_TYPES = [
  { value: 'bigbag',  label: 'Big Bag',  desc: 'Sacolas grandes de 1t' },
  { value: 'sacaria', label: 'Sacaria',  desc: 'Sacos de 25/50kg' },
  { value: 'granel',  label: 'Granel',   desc: 'Sal a granel no caminhão' },
];

export default function FreightNew({ nav }: { nav: (p: Page) => void }) {
  const [form, setForm] = useState({
    title: '', description: '', cargoType: 'bigbag',
    originCity: 'Mossoró', originState: 'RN',
    destinationCity: '', destinationState: 'SP',
    distance: '', valueReais: '', weight: '',
    loadDate: '', direction: 'ida' as 'ida' | 'retorno' | 'ambos',
  });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const create = trpc.freights.create.useMutation({
    onSuccess: (data) => nav({ name: 'freight-detail', id: data.id }),
    onError: (e) => setError(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const valueNum = parseFloat(form.valueReais.replace(',', '.'));
    if (isNaN(valueNum) || valueNum <= 0) { setError('Informe um valor válido'); return; }
    create.mutate({
      title: form.title,
      description: form.description || undefined,
      cargoType: form.cargoType as 'bigbag' | 'sacaria' | 'granel',
      originCity: form.originCity,
      originState: form.originState,
      destinationCity: form.destinationCity,
      destinationState: form.destinationState,
      distance: form.distance ? parseFloat(form.distance) : undefined,
      value: Math.round(valueNum * 100),
      weight: form.weight ? parseFloat(form.weight) : undefined,
      loadDate: form.loadDate || undefined,
      direction: form.direction,
    });
  }

  return (
    <div style={{ padding: 32, maxWidth: 720, fontFamily: "'DM Sans', 'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <button onClick={() => nav({ name: 'freights' })} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 18, color: '#475569' }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.4px' }}>Novo Frete</h1>
          <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: 14 }}>Publique uma oferta de carga para os motoristas</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Seção: Identificação */}
        <Section label="Identificação da Carga">
          <Field label="Título da oferta *">
            <input style={inp} required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex: Sal Big Bag — Mossoró para São Paulo" />
          </Field>

          <div>
            <label style={lbl}>Tipo de Carga *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 6 }}>
              {CARGO_TYPES.map((c) => (
                <label key={c.value} style={{ display: 'block', cursor: 'pointer' }}>
                  <input type="radio" name="cargoType" value={c.value} checked={form.cargoType === c.value} onChange={() => set('cargoType', c.value)} style={{ display: 'none' }} />
                  <div style={{ border: `2px solid ${form.cargoType === c.value ? '#0C3680' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 14px', background: form.cargoType === c.value ? '#eff6ff' : '#fff', transition: 'all 0.15s' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: form.cargoType === c.value ? '#0C3680' : '#1e293b', marginBottom: 2 }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <Field label="Descrição / Observações">
            <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Horário de coleta, restrições de veículo, contato no destino..." />
          </Field>
        </Section>

        {/* Seção: Rota */}
        <Section label="Rota">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'end' }}>
            <div>
              <Field label="Cidade de Origem *">
                <input style={inp} required value={form.originCity} onChange={(e) => set('originCity', e.target.value)} placeholder="Mossoró" />
              </Field>
              <Field label="Estado *">
                <select style={inp} value={form.originState} onChange={(e) => set('originState', e.target.value)}>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ textAlign: 'center', paddingBottom: 16, fontSize: 24, color: '#cbd5e1' }}>→</div>
            <div>
              <Field label="Cidade de Destino *">
                <input style={inp} required value={form.destinationCity} onChange={(e) => set('destinationCity', e.target.value)} placeholder="São Paulo" />
              </Field>
              <Field label="Estado *">
                <select style={inp} value={form.destinationState} onChange={(e) => set('destinationState', e.target.value)}>
                  {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </Section>

        {/* Seção: Programação */}
        <Section label="Programação">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Data de Carregamento">
              <input style={inp} type="date" value={form.loadDate} onChange={(e) => set('loadDate', e.target.value)} />
            </Field>
            <Field label="Sentido">
              <select style={inp} value={form.direction} onChange={(e) => set('direction', e.target.value as 'ida' | 'retorno' | 'ambos')}>
                <option value="ida">Ida</option>
                <option value="retorno">Retorno</option>
                <option value="ambos">Ambos (Ida + Retorno)</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* Seção: Valores */}
        <Section label="Valores e Dimensões">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Field label="Valor do Frete (R$) *">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>R$</span>
                <input style={{ ...inp, paddingLeft: 36 }} required type="number" min="0" step="0.01" value={form.valueReais} onChange={(e) => set('valueReais', e.target.value)} placeholder="1.500,00" />
              </div>
            </Field>
            <Field label="Peso (toneladas)">
              <input style={inp} type="number" min="0" step="0.1" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="25" />
            </Field>
            <Field label="Distância (km)">
              <input style={inp} type="number" min="0" step="1" value={form.distance} onChange={(e) => set('distance', e.target.value)} placeholder="2.800" />
            </Field>
          </div>
        </Section>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => nav({ name: 'freights' })} style={{ flex: 1, background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, padding: 14, fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>Cancelar</button>
          <button type="submit" disabled={create.isPending} style={{ flex: 2, background: '#0C3680', color: '#fff', border: 'none', borderRadius: 10, padding: 14, fontWeight: 700, cursor: 'pointer', fontSize: 15, boxShadow: '0 4px 14px rgba(12,54,128,0.3)', opacity: create.isPending ? 0.7 : 1 }}>
            {create.isPending ? 'Publicando...' : '🚛 Publicar Frete'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 24, marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 18 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      {children}
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 9, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fafbff', color: '#1e293b', transition: 'border-color 0.15s' };
