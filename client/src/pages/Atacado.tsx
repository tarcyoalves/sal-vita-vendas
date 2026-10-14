import { cloneElement, useId, useState } from 'react';
import { BrandLogo } from '../components/premium/BrandLogo';

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

// Mesma identidade da loja: marinho e dourado (tokens em index.html, html.sv-premium),
// Cormorant nos títulos, Outfit no resto. Os fallbacks cobrem o caso sem a classe.
const NAVY = 'var(--sv-navy, #0b1d3a)';
const GOLD = 'var(--sv-gold, #c9a227)';
const GOLD_LIGHT = 'var(--sv-gold-light, #e8c547)';
const SERIF = "'Cormorant Garamond', Georgia, serif";

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  minHeight: '48px', padding: '12px 14px', borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.4)',
  background: 'rgba(255,255,255,0.06)',
  color: 'white', fontSize: '16px',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.85)',
  marginBottom: '6px',
};

const PAGE_CSS = `
  .at-in::placeholder { color: rgba(255,255,255,0.62); }
  .at-in:focus-visible, .at-btn:focus-visible, .at-page a:focus-visible, .at-page input[type=checkbox]:focus-visible { outline: 3px solid ${GOLD_LIGHT}; outline-offset: 2px; }
  .at-in:focus-visible { border-color: ${GOLD_LIGHT}; }
  .at-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
  .at-city { display: grid; grid-template-columns: minmax(0, 2fr) minmax(96px, 1fr); gap: 14px; }
  .at-btn:hover:not(:disabled) { background: ${GOLD_LIGHT}; }
  .at-seg { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 4px 24px; padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.18); }
  @media (max-width: 560px) { .at-seg { grid-template-columns: 1fr; } .at-card { padding: 22px 18px !important; } }
`;

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

const CONSENT_TEXT = 'Concordo em ser contatado pela equipe Sal Vita Premium para receber informações comerciais sobre compras B2B, revenda ou atacado.';

export default function Atacado() {
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
    <div className="at-page" style={{
      minHeight: '100vh',
      background: NAVY,
      fontFamily: "'Outfit', 'Inter', sans-serif",
      color: '#e2e8f0',
    }}>
      <style>{PAGE_CSS}</style>

      {/* Header */}
      <header style={{ padding: '16px 24px', borderBottom: '1px solid rgba(201,162,39,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <a href="/" aria-label="Sal Vita Premium, página inicial" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>
          <BrandLogo size={40} white />
        </a>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: 'rgba(255,255,255,0.85)', fontSize: '15px', textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Voltar à loja
        </a>
      </header>

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '56px 20px 64px' }}>
        {/* Apresentação */}
        <div style={{ marginBottom: '44px' }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(2rem, 6vw, 3rem)', fontWeight: 700, color: 'white', margin: '0 0 16px', lineHeight: 1.1 }}>
            Sal marinho não refinado de Mossoró para revenda e food service
          </h1>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.65, maxWidth: '60ch', margin: 0 }}>
            A caixa traz 10 pacotes zip lock de 1 kg, com janela. Tabela de preços, pedido mínimo e frete
            você combina com a nossa equipe.
          </p>
        </div>

        {/* Segmentos */}
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 700, color: 'white', margin: '0 0 14px' }}>Para quem vende</h2>
          {[
            { title: 'Empórios e lojas naturais', desc: 'Peça a tabela de preços e as condições de pedido mínimo.' },
            { title: 'Parrillas e casas de carne', desc: 'Sal de finalização à mesa, visível para o cliente.' },
            { title: 'Restaurantes e peixarias', desc: 'Para o preparo e a finalização dos pratos.' },
          ].map(row => (
            <div key={row.title} className="at-seg">
              <p style={{ margin: 0, fontWeight: 600, color: 'white', fontSize: '16px' }}>{row.title}</p>
              <p style={{ margin: 0, fontSize: '16px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55 }}>{row.desc}</p>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }} />
        </div>

        {/* Form */}
        <div className="at-card" style={{
          border: '1px solid rgba(201,162,39,0.35)',
          borderRadius: '14px',
          padding: '32px',
        }}>
          {status === 'sent' ? (
            <div role="status" style={{ padding: '16px 4px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={GOLD_LIGHT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginBottom: 12 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <h3 style={{ fontFamily: SERIF, fontSize: '1.8rem', fontWeight: 700, color: 'white', margin: '0 0 8px' }}>
                Recebemos o seu contato
              </h3>
              <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.65, maxWidth: '52ch', margin: 0 }}>
                A equipe comercial vai analisar e responder com a tabela de preços e as condições para o seu negócio.
                Se preferir, chame pelo WhatsApp agora.
              </p>
              <a
                href="https://wa.me/558421408212"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', marginTop: '20px', minHeight: 48, padding: '0 24px',
                  borderRadius: '8px', background: GOLD, color: NAVY,
                  fontWeight: 700, fontSize: '16px', textDecoration: 'none',
                }}
              >
                Falar no WhatsApp
              </a>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: SERIF, fontSize: '1.8rem', fontWeight: 700, color: 'white', margin: '0 0 6px' }}>
                Quero vender Sal Vita no meu negócio
              </h2>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.82)', margin: '0 0 24px', lineHeight: 1.55 }}>
                Preencha os dados abaixo. Uma pessoa da equipe fala com você para passar a tabela e as condições. Os campos com * são obrigatórios.
              </p>
              <form onSubmit={handleSubmit}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <Field label="Nome da empresa *">
                    <input className="at-in" style={inputStyle} required maxLength={200} value={form.companyName}
                      onChange={e => update('companyName', e.target.value)} placeholder="Ex: Empório Sabor da Terra" />
                  </Field>
                  <Field label="Nome do responsável *">
                    <input className="at-in" style={inputStyle} required maxLength={200} value={form.contactName}
                      onChange={e => update('contactName', e.target.value)} placeholder="Seu nome" />
                  </Field>
                  <div className="at-two">
                    <Field label="E-mail comercial *">
                      <input className="at-in" style={inputStyle} type="email" autoComplete="email" required maxLength={200} value={form.email}
                        onChange={e => update('email', e.target.value)} placeholder="contato@empresa.com" />
                    </Field>
                    <Field label="WhatsApp comercial *">
                      <input className="at-in" style={inputStyle} type="tel" inputMode="tel" autoComplete="tel" required maxLength={30} value={form.whatsapp}
                        onChange={e => update('whatsapp', e.target.value)} placeholder="(11) 99999-9999" />
                    </Field>
                  </div>
                  <div className="at-city">
                    <Field label="Cidade *">
                      <input className="at-in" style={inputStyle} required maxLength={120} value={form.city}
                        onChange={e => update('city', e.target.value)} placeholder="Sua cidade" />
                    </Field>
                    <Field label="UF *">
                      <select className="at-in" style={inputStyle} required value={form.state}
                        onChange={e => update('state', e.target.value)}>
                        <option value="" style={{ color: '#000' }}>--</option>
                        {UFS.map(uf => <option key={uf} value={uf} style={{ color: '#000' }}>{uf}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Segmento *">
                    <select className="at-in" style={inputStyle} required value={form.segment}
                      onChange={e => update('segment', e.target.value)}>
                      <option value="" style={{ color: '#000' }}>Selecione...</option>
                      {SEGMENTS.map(s => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Volume estimado ou interesse">
                    <input className="at-in" style={inputStyle} maxLength={500} value={form.volumeInterest}
                      onChange={e => update('volumeInterest', e.target.value)}
                      placeholder="Ex: 2 caixas/mês, revenda em 3 lojas..." />
                  </Field>
                  <Field label="Mensagem (opcional)">
                    <textarea className="at-in" style={{ ...inputStyle, minHeight: '96px', resize: 'vertical' }} maxLength={2000}
                      value={form.message} onChange={e => update('message', e.target.value)}
                      placeholder="Conte um pouco mais sobre o seu negócio" />
                  </Field>

                  <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
                    <input type="text" name="website" tabIndex={-1} autoComplete="off"
                      value={form.website} onChange={e => update('website', e.target.value)} />
                  </div>

                  <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', fontSize: '14px', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5, cursor: 'pointer', minHeight: 44 }}>
                    <input type="checkbox" required checked={consent}
                      onChange={e => setConsent(e.target.checked)}
                      style={{ marginTop: '2px', width: '20px', height: '20px', flexShrink: 0, accentColor: '#c9a227' }} />
                    <span>{CONSENT_TEXT}</span>
                  </label>

                  {status === 'error' && errorMsg && (
                    <p role="alert" style={{ margin: 0, fontSize: '14px', color: '#fca5a5' }}>{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    className="at-btn"
                    disabled={status === 'sending'}
                    style={{
                      minHeight: '52px', padding: '0 20px', borderRadius: '8px',
                      background: GOLD, opacity: status === 'sending' ? 0.6 : 1,
                      color: NAVY, fontWeight: 700, fontSize: '16px',
                      border: 'none', cursor: status === 'sending' ? 'not-allowed' : 'pointer', marginTop: '4px',
                    }}
                  >
                    {status === 'sending' ? 'Enviando...' : 'Quero receber a tabela de preços'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.75)', marginTop: '32px', lineHeight: 1.6 }}>
          Sal Vita Premium, Mossoró/RN. Seus dados são usados apenas para contato comercial.
          {' '}<a href="/privacidade" style={{ color: GOLD_LIGHT, textDecoration: 'underline', textUnderlineOffset: 3 }}>Política de privacidade</a>
        </p>
      </main>
    </div>
  );
}
