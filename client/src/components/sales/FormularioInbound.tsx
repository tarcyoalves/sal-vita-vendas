import { cloneElement, useId, useState } from 'react';
import { CONSENT_TEXT } from './atacadoCopy';

// Formulário de inbound B2B: grava lead direto no CRM via POST cru para /api/b2b/inbound
// (api/index.ts). Não é rota tRPC. Campos, endpoint e texto de consentimento não mudam.

const SEGMENTS = [
  'Empório / loja natural',
  'Casa de temperos',
  'Mercado premium',
  'Parrilla / churrascaria',
  'Casa de carnes',
  'Restaurante',
  'Peixaria',
  'Distribuidor',
  'Outro',
];

const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
  'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '12px 16px', borderRadius: '10px',
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.07)',
  color: 'white', fontSize: '15px', outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)',
  marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
};

// Ties the label to its control: the child element receives the generated id.
function Field({ label, children }: { label: string; children: React.ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}


export function FormularioInbound() {
  const [form, setForm] = useState({
    companyName: '', contactName: '', email: '', whatsapp: '',
    city: '', state: '', segment: '', volumeInterest: '', message: '',
    website: '', // honeypot: real people never see it, bots fill it
  });
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setErrorMsg('É necessário aceitar o contato comercial para enviar.');
      setStatus('error');
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    try {
      const res = await fetch('/api/b2b/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent: true }),
      });
      if (res.status === 429) {
        setErrorMsg('Muitas tentativas. Tente novamente em alguns minutos ou fale conosco pelo WhatsApp.');
        setStatus('error');
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setErrorMsg(data?.error ?? 'Não foi possível enviar. Tente novamente.');
        setStatus('error');
        return;
      }
      setStatus('sent');
    } catch {
      setErrorMsg('Erro de conexão. Tente novamente.');
      setStatus('error');
    }
  }

  return (
    <div id="contato">
        {/* Form */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '32px',
          backdropFilter: 'blur(10px)',
        }}>
          {status === 'sent' ? (
            <div style={{ textAlign: 'center', padding: '24px 8px' }}>
              <p style={{ fontSize: '40px', margin: '0 0 12px' }}>✅</p>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'white', margin: '0 0 8px' }}>
                Recebemos seu contato!
              </h3>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, maxWidth: '440px', margin: '0 auto' }}>
                Nossa equipe comercial vai analisar e retornar em breve com a tabela de preços e
                condições para o seu negócio. Se preferir, fale com a gente agora pelo WhatsApp.
              </p>
              <a
                href="https://wa.me/558421408212"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block', marginTop: '20px', padding: '12px 24px',
                  borderRadius: '10px', background: '#16a34a', color: 'white',
                  fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                }}
              >
                📱 Falar no WhatsApp
              </a>
            </div>
          ) : (
            <>
              <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'white', margin: '0 0 6px' }}>
                Quero vender Sal Vita no meu negócio
              </h3>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: '0 0 24px' }}>
                Preencha os dados abaixo — um atendente humano fala com você para passar tabela e condições.
              </p>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <Field label="Nome da empresa *">
                    <input style={inputStyle} required maxLength={200} value={form.companyName}
                      onChange={e => update('companyName', e.target.value)} placeholder="Ex: Empório Sabor da Terra" />
                  </Field>
                  <Field label="Nome do responsável *">
                    <input style={inputStyle} required maxLength={200} value={form.contactName}
                      onChange={e => update('contactName', e.target.value)} placeholder="Seu nome" />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <Field label="E-mail comercial *">
                      <input style={inputStyle} type="email" autoComplete="email" required maxLength={200} value={form.email}
                        onChange={e => update('email', e.target.value)} placeholder="contato@empresa.com" />
                    </Field>
                    <Field label="WhatsApp comercial *">
                      <input style={inputStyle} type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} value={form.whatsapp}
                        onChange={e => update('whatsapp', e.target.value)} placeholder="(11) 99999-9999" />
                    </Field>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
                    <Field label="Cidade *">
                      <input style={inputStyle} required maxLength={120} value={form.city}
                        onChange={e => update('city', e.target.value)} placeholder="Sua cidade" />
                    </Field>
                    <Field label="UF *">
                      <select style={inputStyle} required value={form.state}
                        onChange={e => update('state', e.target.value)}>
                        <option value="" style={{ color: '#000' }}>--</option>
                        {UFS.map(uf => <option key={uf} value={uf} style={{ color: '#000' }}>{uf}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Segmento *">
                    <select style={inputStyle} required value={form.segment}
                      onChange={e => update('segment', e.target.value)}>
                      <option value="" style={{ color: '#000' }}>Selecione...</option>
                      {SEGMENTS.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Volume estimado ou interesse">
                    <input style={inputStyle} maxLength={500} value={form.volumeInterest}
                      onChange={e => update('volumeInterest', e.target.value)}
                      placeholder="Ex: 2 caixas/mês, revenda em 3 lojas..." />
                  </Field>
                  <Field label="Mensagem (opcional)">
                    <textarea style={{ ...inputStyle, minHeight: '90px', resize: 'vertical' }} maxLength={2000}
                      value={form.message} onChange={e => update('message', e.target.value)}
                      placeholder="Conte um pouco mais sobre o seu negócio" />
                  </Field>

                  <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
                    <input type="text" name="website" tabIndex={-1} autoComplete="off"
                      value={form.website} onChange={e => update('website', e.target.value)} />
                  </div>

                  <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '12px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, cursor: 'pointer' }}>
                    <input type="checkbox" required checked={consent}
                      onChange={e => setConsent(e.target.checked)}
                      style={{ marginTop: '2px', width: '16px', height: '16px', flexShrink: 0 }} />
                    <span>{CONSENT_TEXT}</span>
                  </label>

                  {status === 'error' && errorMsg && (
                    <p style={{ margin: 0, fontSize: '13px', color: '#fca5a5' }}>{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'sending'}
                    style={{
                      padding: '14px', borderRadius: '12px',
                      background: status === 'sending' ? '#475569' : 'linear-gradient(135deg, #1a56db, #0d3fa6)',
                      color: 'white', fontWeight: 700, fontSize: '15px',
                      border: 'none', cursor: status === 'sending' ? 'not-allowed' : 'pointer', marginTop: '4px',
                    }}
                  >
                    {status === 'sending' ? 'Enviando...' : 'Quero receber a tabela de preços →'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

    </div>
  );
}
