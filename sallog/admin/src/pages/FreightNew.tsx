import { useState } from 'react';
import { trpc } from '../lib/trpc';

type Page = { name: string; id?: number };

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const CARGO_TYPES = [
  { value: 'bigbag',  label: 'Big Bag',  desc: 'Sacolas grandes de 1t' },
  { value: 'sacaria', label: 'Sacaria',  desc: 'Sacos de 25/50kg' },
  { value: 'granel',  label: 'Granel',   desc: 'Sal a granel' },
];

export default function FreightNew({ nav }: { nav: (p: Page) => void }) {
  const [form, setForm] = useState({
    title: '', description: '', cargoType: 'bigbag',
    originCity: 'Mossoró', originState: 'RN',
    destinationCity: '', destinationState: 'SP',
    distance: '', valueReais: '', weight: '',
    loadDate: '', direction: 'ida' as 'ida' | 'retorno' | 'ambos',
  });
  const [error, setError]         = useState('');
  const [aiHint, setAiHint]       = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const create = trpc.freights.create.useMutation({
    onSuccess: (data) => nav({ name: 'freight-detail', id: data.id }),
    onError: (e) => setError(e.message),
  });

  const suggestValue = trpc.ai.suggestValue.useMutation({
    onMutate: () => { setAiLoading(true); setAiHint(''); },
    onSuccess: (data) => {
      set('valueReais', data.valueReais.toFixed(2));
      setAiHint(`✨ ${data.justificativa}`);
      setAiLoading(false);
    },
    onError: () => {
      setAiHint('Não foi possível sugerir valor agora.');
      setAiLoading(false);
    },
  });

  function handleSuggestValue() {
    if (!form.originCity || !form.destinationCity) {
      setAiHint('Preencha a rota primeiro.');
      return;
    }
    suggestValue.mutate({
      originCity: form.originCity,
      originState: form.originState,
      destinationCity: form.destinationCity,
      destinationState: form.destinationState,
      cargoType: form.cargoType,
      weight: form.weight ? parseFloat(form.weight) : undefined,
      distance: form.distance ? parseFloat(form.distance) : undefined,
    });
  }

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
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
        <button onClick={() => nav({ name: 'freights' })} className="btn btn-outline btn-sm">← Voltar</button>
        <div>
          <h1 className="page-ttl">Novo Frete</h1>
          <div className="page-sub">Publique uma oferta de carga para os motoristas</div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Identificação */}
        <Section label="Identificação da Carga">
          <div>
            <label className="form-label">Título da oferta *</label>
            <input className="form-input" required value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Ex: Sal Big Bag — Mossoró para São Paulo" />
          </div>

          <div>
            <label className="form-label">Tipo de Carga *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 6 }}>
              {CARGO_TYPES.map(c => (
                <label key={c.value} style={{ cursor: 'pointer' }}>
                  <input type="radio" name="cargoType" value={c.value}
                    checked={form.cargoType === c.value}
                    onChange={() => set('cargoType', c.value)}
                    style={{ display: 'none' }} />
                  <div style={{
                    border: `2px solid ${form.cargoType === c.value ? 'var(--navy)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '12px 14px',
                    background: form.cargoType === c.value ? 'var(--navy-dim)' : 'var(--surface-2)',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: form.cargoType === c.value ? 'var(--navy)' : 'var(--text)', marginBottom: 2 }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-4)' }}>{c.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="form-label">Descrição / Observações</label>
            <textarea className="form-input" style={{ minHeight: 76, resize: 'vertical' }}
              value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Horário de coleta, restrições de veículo, contato no destino..." />
          </div>
        </Section>

        {/* Rota */}
        <Section label="Rota">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">Cidade de Origem *</label>
                <input className="form-input" required value={form.originCity} onChange={e => set('originCity', e.target.value)} placeholder="Mossoró" />
              </div>
              <div>
                <label className="form-label">Estado *</label>
                <select className="form-input" value={form.originState} onChange={e => set('originState', e.target.value)}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ textAlign: 'center', paddingBottom: 14, fontSize: 22, color: 'var(--text-4)' }}>→</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label className="form-label">Cidade de Destino *</label>
                <input className="form-input" required value={form.destinationCity} onChange={e => set('destinationCity', e.target.value)} placeholder="São Paulo" />
              </div>
              <div>
                <label className="form-label">Estado *</label>
                <select className="form-input" value={form.destinationState} onChange={e => set('destinationState', e.target.value)}>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
        </Section>

        {/* Programação */}
        <Section label="Programação">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="form-label">Data de Carregamento</label>
              <input className="form-input" type="date" value={form.loadDate} onChange={e => set('loadDate', e.target.value)} />
            </div>
            <div>
              <label className="form-label">Sentido</label>
              <select className="form-input" value={form.direction} onChange={e => set('direction', e.target.value as 'ida' | 'retorno' | 'ambos')}>
                <option value="ida">Ida</option>
                <option value="retorno">Retorno</option>
                <option value="ambos">Ambos (Ida + Retorno)</option>
              </select>
            </div>
          </div>
        </Section>

        {/* Valores */}
        <Section label="Valores e Dimensões">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label className="form-label" style={{ margin: 0 }}>Valor do Frete (R$) *</label>
                <button type="button" onClick={handleSuggestValue} disabled={aiLoading}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 11, color: 'var(--navy)', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 3,
                    opacity: aiLoading ? 0.6 : 1, fontFamily: 'inherit',
                    padding: 0,
                  }}>
                  {aiLoading ? '⏳' : '✨'} {aiLoading ? 'Calculando...' : 'Sugerir com IA'}
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: 13, fontWeight: 600 }}>R$</span>
                <input className="form-input" style={{ paddingLeft: 34 }} required type="number" min="0" step="0.01"
                  value={form.valueReais} onChange={e => set('valueReais', e.target.value)} placeholder="1.500,00" />
              </div>
              {aiHint && (
                <div style={{ fontSize: 11, color: aiHint.startsWith('✨') ? 'var(--green)' : 'var(--text-3)', marginTop: 5 }}>
                  {aiHint}
                </div>
              )}
            </div>
            <div>
              <label className="form-label">Peso (toneladas)</label>
              <input className="form-input" type="number" min="0" step="0.1"
                value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="25" />
            </div>
            <div>
              <label className="form-label">Distância (km)</label>
              <input className="form-input" type="number" min="0" step="1"
                value={form.distance} onChange={e => set('distance', e.target.value)} placeholder="2.800" />
            </div>
          </div>
        </Section>

        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => nav({ name: 'freights' })} className="btn btn-outline" style={{ flex: 1 }}>Cancelar</button>
          <button type="submit" disabled={create.isPending} className="btn btn-primary btn-lg" style={{ flex: 2 }}>
            {create.isPending ? 'Publicando...' : '🚛 Publicar Frete'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 18 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
    </div>
  );
}
