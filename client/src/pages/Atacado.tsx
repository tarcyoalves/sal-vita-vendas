import { useState } from 'react';

// Sprint 1 — página pública /atacado (host premium). Prioridade máxima de
// aquisição B2B: formulário de inbound que grava lead "quente" direto no CRM
// (server/db/schema.ts: companies/contacts/consent_records/audit_logs) via
// POST cru para /api/b2b/inbound (api/index.ts) — não é rota tRPC.
// Sem claims de saúde, sem preço fixo (sempre "fale com a equipe").

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const CONSENT_TEXT = 'Concordo em ser contatado pela equipe Sal Vita Premium para receber informações comerciais sobre compras B2B, revenda ou atacado.';

export default function Atacado() {
  const [form, setForm] = useState({
    companyName: '', contactName: '', email: '', whatsapp: '',
    city: '', state: '', segment: '', volumeInterest: '', message: '',
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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1628 0%, #0d2347 50%, #0a1628 100%)',
      fontFamily: "'Outfit', 'Inter', sans-serif",
      color: '#e2e8f0',
    }}>
      {/* Header */}
      <header style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: '40px', width: 'auto' }}>
            <defs><clipPath id="oval-atacado"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="rgba(255,255,255,0.08)"/>
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#4a9eff" clipPath="url(#oval-atacado)"/>
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="white">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="15"/>
          </svg>
        </a>
        <h1 style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0, textAlign: 'right' }}>
          Atacado &amp; Revenda<br />
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>B2B / Food Service</span>
        </h1>
      </header>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 20px 64px' }}>
        {/* Hero institucional */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <span style={{
            display: 'inline-block', padding: '6px 14px', borderRadius: '999px',
            background: 'rgba(74,158,255,0.15)', border: '1px solid rgba(74,158,255,0.35)',
            color: '#8ec2ff', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em',
            marginBottom: '16px',
          }}>
            SAL VITA PREMIUM · ATACADO
          </span>
          <h2 style={{ fontSize: '30px', fontWeight: 800, color: 'white', margin: '0 0 14px', lineHeight: 1.25 }}>
            Sal marinho premium de Mossoró/RN para revenda e food service
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, maxWidth: '560px', margin: '0 auto' }}>
            Produto nacional, não refinado, com embalagem zip-lock pronta para prateleira e origem
            que conta uma história — pensado para empórios, lojas naturais, parrillas, casas de
            carne, restaurantes e peixarias que querem diferenciar o mix.
          </p>
        </div>

        {/* Segmentos */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px',
          marginBottom: '40px',
        }}>
          {[
            { icon: '🛒', title: 'Empórios e lojas naturais', desc: 'Revenda com margem para prateleira, pedido mínimo baixo.' },
            { icon: '🥩', title: 'Parrillas e casas de carne', desc: 'Sal de finalização à mesa, visível para o cliente.' },
            { icon: '🍽️', title: 'Restaurantes e peixarias', desc: 'Coerência de posicionamento e finalização premium.' },
          ].map(card => (
            <div key={card.title} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px', padding: '20px', backdropFilter: 'blur(10px)',
            }}>
              <div style={{ fontSize: '26px', marginBottom: '8px' }}>{card.icon}</div>
              <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'white', fontSize: '14px' }}>{card.title}</p>
              <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{card.desc}</p>
            </div>
          ))}
        </div>

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
                      <input style={inputStyle} type="email" required maxLength={200} value={form.email}
                        onChange={e => update('email', e.target.value)} placeholder="contato@empresa.com" />
                    </Field>
                    <Field label="WhatsApp comercial *">
                      <input style={inputStyle} type="tel" required maxLength={30} value={form.whatsapp}
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

        <p style={{ textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '32px' }}>
          Sal Vita — Sal Marinho Premium de Mossoró/RN. Seus dados são usados apenas para contato comercial.
        </p>
      </div>
    </div>
  );
}
