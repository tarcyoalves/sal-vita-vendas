import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import ConsentBanner from '../components/premium/ConsentBanner';
import { CONSENT_CHANGE_EVENT, loadMetaPixel, trackPixel } from '../components/premium/pixelConsent';
import { claimPurchase } from '../components/premium/purchaseLock';
import { BrandLogo } from '../components/premium/BrandLogo';
import { trackingLink } from '../lib/trackingLink';

const DELIVERY_ISSUE_TEXT: Record<string, { title: string; body: string }> = {
  undelivered: { title: 'A entrega não foi concluída', body: 'A transportadora informou que não conseguiu entregar o pedido.' },
  paused: { title: 'A entrega precisa de você', body: 'A transportadora interrompeu a entrega e aguarda uma ação do destinatário, como retirar na unidade ou confirmar o endereço.' },
  suspended: { title: 'Entrega suspensa', body: 'A transportadora suspendeu a entrega. Já estamos verificando.' },
};

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
  color: 'white', fontSize: '16px', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: '6px',
};

const PAGE_CSS = `
  .tk-in::placeholder { color: rgba(255,255,255,0.62); }
  .tk-in:focus-visible, .tk-btn:focus-visible, .tk-page a:focus-visible, .tk-page button:focus-visible { outline: 3px solid ${GOLD_LIGHT}; outline-offset: 2px; }
  .tk-in:focus-visible { border-color: ${GOLD_LIGHT}; }
  .tk-btn:hover:not(:disabled) { filter: brightness(1.08); }
  .tk-box { border: 1px solid rgba(201,162,39,0.35); border-radius: 10px; padding: 22px; }
  @media (max-width: 480px) { .tk-box { padding: 18px; } }
`;

const STATUS_STEPS = [
  { key: 'pending',   label: 'Pedido recebido',       desc: 'Aguardando confirmação de pagamento' },
  { key: 'confirmed', label: 'Pagamento confirmado',   desc: 'Seu pedido está sendo preparado' },
  { key: 'shipped',   label: 'Enviado',                desc: 'A caminho de você' },
  { key: 'delivered', label: 'Entregue',               desc: 'Pedido entregue' },
];

// Shown in place of "Enviado" while the order only has a generated label (not posted yet).
const LABEL_ONLY_STEP = { key: 'shipped', label: 'Etiqueta gerada', desc: 'Etiqueta gerada, aguardando postagem' };

const STATUS_ORDER = ['pending', 'confirmed', 'label_generated', 'shipped', 'delivered'];

function getStepIndex(status: string) {
  if (status === 'label_generated') return 2;
  return STATUS_ORDER.indexOf(status);
}

// MP redirects with ?pedido=ID&status=pago after payment.
// Links we send (return URLs, recovery e-mail/WhatsApp) carry ?t=<track token>,
// an opaque per-order credential, so the customer lands straight on their order.
// The token is moved to sessionStorage and removed from the address bar on load, so
// it does not linger in history, screenshots, Referer headers or third-party pixels.
// The old ?tel=XXXX form is gone — it put the ownership proof itself into a URL
// that passes through Mercado Pago, browser history and Referer headers.
const tokenKey = (pedido: string) => `sv-track-${pedido}`;

function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  const pedido = p.get('pedido');
  let token = p.get('t');
  if (!token && pedido) {
    try { token = sessionStorage.getItem(tokenKey(pedido)); } catch {}
  }
  return { pedido, status: p.get('status'), token };
}

function stashTokenAndCleanUrl() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('t');
  if (token === null) return;
  const pedido = url.searchParams.get('pedido');
  if (pedido && token) {
    try { sessionStorage.setItem(tokenKey(pedido), token); } catch {}
  }
  url.searchParams.delete('t');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

// The pixel is not loaded on /meu-pedido by index.html (the URL used to carry the order token).
// Purchase is the one event we want from this page, so the pixel is loaded on demand — only if the
// visitor accepted it (see ConsentBanner), only after the token was stripped from the URL, and with
// no PageView.

function friendlyError(error: unknown, usedToken: boolean): string {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  if (code === 'TOO_MANY_REQUESTS') return 'Muitas consultas seguidas. Aguarde alguns minutos e tente novamente.';
  if (code === 'NOT_FOUND' || code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
    return usedToken
      ? 'Não conseguimos abrir o pedido por este link.'
      : 'Pedido não encontrado.';
  }
  return 'Não foi possível consultar agora. Tente novamente em instantes.';
}

const CONFIRM_POLL_MS = 10_000;
const CONFIRM_POLL_MAX_MS = 5 * 60_000;

type TrackQuery = { orderId: number; phone?: string; token?: string };

export default function TrackOrder() {
  const [urlParams] = useState(getUrlParams);
  const pollUntil = useRef(Date.now() + CONFIRM_POLL_MAX_MS);
  useEffect(() => { stashTokenAndCleanUrl(); }, []);
  const [orderId, setOrderId] = useState(urlParams.pedido ?? '');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [queryInput, setQueryInput] = useState<TrackQuery | null>(
    urlParams.pedido && urlParams.token
      ? { orderId: parseInt(urlParams.pedido), token: urlParams.token }
      : null
  );
  const [mpStatus] = useState(urlParams.status);
  const [payLoading, setPayLoading] = useState(false);
  const [payErr, setPayErr] = useState('');
  // Depois do teto do poll (5 min) a página deixa de atualizar sozinha — o texto precisa dizer isso.
  const [pollExpired, setPollExpired] = useState(false);
  useEffect(() => {
    if (mpStatus !== 'pago') return;
    const t = setTimeout(() => setPollExpired(true), CONFIRM_POLL_MAX_MS);
    return () => clearTimeout(t);
  }, [mpStatus]);

  async function handlePay() {
    const id = queryInput?.orderId ?? parseInt(urlParams.pedido ?? '');
    if (!id) return;
    setPayLoading(true); setPayErr('');
    try {
      const res = await fetch('/api/trpc/shipping.createPayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: {
          orderId: id,
          token: queryInput?.token ?? urlParams.token ?? undefined,
          phone: queryInput?.phone ?? (phone.trim() || undefined),
        } }),
      });
      const data = await res.json();
      const initPoint = data?.result?.data?.json?.initPoint;
      if (initPoint) { window.location.href = initPoint; }
      else {
        const apiMsg: string | undefined = data?.error?.json?.message ?? data?.error?.message;
        setPayErr(apiMsg ?? 'Erro ao gerar link. Tente novamente.');
        setPayLoading(false);
      }
    } catch { setPayErr('Erro de conexão. Tente novamente.'); setPayLoading(false); }
  }

  const { data: order, isLoading, error } = trpc.shipping.trackOrder.useQuery(
    queryInput!,
    {
      enabled: !!queryInput,
      retry: false,
      // Back from Mercado Pago the webhook may land a few seconds after the redirect:
      // poll every 10 s, for up to 5 min, until the server says the payment is confirmed.
      refetchInterval: (q) =>
        mpStatus === 'pago' && q.state.data?.paymentStatus === 'awaiting' && Date.now() < pollUntil.current
          ? CONFIRM_POLL_MS
          : false,
    }
  );
  const paymentConfirmed = order?.paymentStatus === 'confirmed';

  // With a token in the link the order opens straight away; otherwise focus the
  // phone field so the customer can identify themselves.
  useEffect(() => {
    if (urlParams.pedido && urlParams.token) {
      setSubmitted(true);
    } else if (urlParams.pedido) {
      const el = document.getElementById('track-phone');
      if (el) el.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(orderId);
    const digits = phone.replace(/\D/g, '');
    // The server now requires the whole number, not a 4-digit suffix.
    if (!id || digits.length < 10) return;
    setQueryInput({ orderId: id, phone: digits });
    setSubmitted(true);
  };

  // Fire the Facebook Pixel Purchase event only when a real, confirmed payment is
  // observed here (post-redirect / confirmed order) — not at checkout click. This keeps
  // ad-campaign optimization tied to actual buyers.
  // Once per order, ever: the lock lives in localStorage (shared with the PIX screen of the store),
  // so reloading or reopening this page does not count the sale again. No consent, no Pixel, no
  // event, and the lock is not spent — if the visitor accepts later on this page it still fires.
  const purchaseFired = useRef(false);
  const [consentTick, setConsentTick] = useState(0);
  useEffect(() => {
    const bump = () => setConsentTick(t => t + 1);
    window.addEventListener(CONSENT_CHANGE_EVENT, bump);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, bump);
  }, []);
  useEffect(() => {
    if (order && !purchaseFired.current && order.paymentStatus === 'confirmed') {
      try {
        if (!loadMetaPixel({ pageView: false })) return;
        purchaseFired.current = true;
        if (!claimPurchase(order.id)) return;
        trackPixel('track', 'Purchase', {
          value: parseFloat(order.totalPrice ?? '0'),
          currency: 'BRL',
          content_name: 'SAL VITA PREMIUM',
          content_ids: ['salvita-001'],
          content_type: 'product',
          num_items: order.quantity,
        // eventID dedupes this browser event against the server-side CAPI event
        // (api/index.ts fires Purchase with the same id on payment confirmation).
        }, { eventID: `purchase-${order.id}` });
      } catch {}
    }
  }, [order, consentTick]);

  const stepIndex = order ? getStepIndex(order.status) : -1;

  return (
    <div className="tk-page" style={{
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
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>Rastreamento de pedido</p>
      </header>

      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 20px 48px' }}>
        <a href="/" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginBottom: '12px', fontSize: '15px', color: GOLD_LIGHT, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          Voltar para a loja
        </a>
        <h1 style={{ fontFamily: SERIF, fontSize: 'clamp(1.9rem, 6vw, 2.4rem)', fontWeight: 700, color: 'white', margin: '0 0 20px', lineHeight: 1.1 }}>
          Rastrear meu pedido
        </h1>

        {/* MP payment result banner */}
        {mpStatus === 'pago' && paymentConfirmed && (
          <div role="status" className="tk-box" style={{ borderColor: 'rgba(232,197,71,0.6)', marginBottom: '20px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: GOLD_LIGHT, fontSize: '17px' }}>Pagamento recebido.</p>
            <p style={{ margin: '4px 0 0', fontSize: '15px', color: 'rgba(255,255,255,0.85)' }}>Estamos separando o seu pedido. Acompanhe abaixo.</p>
          </div>
        )}
        {mpStatus === 'pago' && !paymentConfirmed && order?.paymentStatus !== 'failed' && (
          <div role="status" className="tk-box" style={{ borderColor: 'rgba(232,197,71,0.6)', marginBottom: '20px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: GOLD_LIGHT, fontSize: '17px' }}>Estamos confirmando seu pagamento.</p>
            <p style={{ margin: '4px 0 0', fontSize: '15px', color: 'rgba(255,255,255,0.85)' }}>
              {queryInput
                ? (pollExpired
                    ? 'Isso pode levar alguns minutos. Esta página parou de atualizar. Recarregue a página daqui a pouco para ver se o pagamento foi confirmado.'
                    : 'Isso pode levar alguns minutos. Esta página atualiza sozinha.')
                : 'Isso pode levar alguns minutos. Para acompanhar, informe o número do pedido e o telefone abaixo.'}
            </p>
          </div>
        )}
        {mpStatus === 'falhou' && (
          <div className="tk-box" style={{ borderColor: 'rgba(252,165,165,0.6)', marginBottom: '20px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: '#fca5a5', fontSize: '17px' }}>Pagamento não aprovado.</p>
            <p style={{ margin: '6px 0 14px', fontSize: '15px', color: 'rgba(255,255,255,0.85)' }}>Seu pedido foi salvo. Toque no botão para tentar de novo com outro método de pagamento.</p>
            {urlParams.pedido && (
              <button onClick={handlePay} disabled={payLoading} className="tk-btn"
                style={{ background: GOLD, opacity: payLoading ? 0.6 : 1, color: NAVY, border: 'none', borderRadius: '8px', minHeight: 48, padding: '0 24px', fontWeight: 700, fontSize: '16px', cursor: payLoading ? 'not-allowed' : 'pointer' }}>
                {payLoading ? 'Gerando link...' : 'Tentar pagamento novamente'}
              </button>
            )}
            {payErr && <p role="alert" style={{ margin: '10px 0 0', fontSize: '14px', fontWeight: 600, color: '#fca5a5' }}>{payErr}</p>}
          </div>
        )}
        {mpStatus === 'pendente' && (
          <div className="tk-box" style={{ borderColor: 'rgba(232,197,71,0.6)', marginBottom: '20px' }}>
            <p style={{ margin: 0, fontWeight: 600, color: GOLD_LIGHT, fontSize: '17px' }}>Pagamento pendente.</p>
            <p style={{ margin: '4px 0 0', fontSize: '15px', color: 'rgba(255,255,255,0.85)' }}>Se pagou via boleto, pode levar até 2 dias úteis para ser confirmado.</p>
          </div>
        )}

        {/* Search form */}
        <div className="tk-box" style={{ padding: '28px', marginBottom: '20px' }}>
          <h2 style={{ fontFamily: SERIF, fontSize: '1.6rem', fontWeight: 700, margin: '0 0 6px', color: 'white' }}>
            Consultar pedido
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', margin: '0 0 22px', lineHeight: 1.5 }}>
            Informe o número do pedido e o telefone completo usado na compra.
          </p>
          <form onSubmit={handleSearch}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label htmlFor="track-order-id" style={labelStyle}>
                  Número do pedido
                </label>
                <input
                  id="track-order-id"
                  className="tk-in"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={orderId}
                  onChange={e => setOrderId(e.target.value)}
                  placeholder="Ex: 42"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label htmlFor="track-phone" style={labelStyle}>
                  Telefone completo com DDD
                </label>
                <input
                  id="track-phone"
                  className="tk-in"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Ex: (84) 98620-7841"
                  maxLength={20}
                  required
                  style={inputStyle}
                />
              </div>
              <button
                type="submit"
                className="tk-btn"
                style={{
                  minHeight: '52px', padding: '0 20px', borderRadius: '8px',
                  background: GOLD, color: NAVY, fontWeight: 700, fontSize: '16px',
                  border: 'none', cursor: 'pointer', marginTop: '4px',
                }}
              >
                Consultar pedido
              </button>
            </div>
          </form>
        </div>

        {/* Results */}
        {submitted && isLoading && (
          <div role="status" style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.85)' }}>
            Buscando seu pedido...
          </div>
        )}

        {submitted && error && (
          <div role="alert" className="tk-box" style={{ borderColor: 'rgba(252,165,165,0.6)', color: '#fca5a5' }}>
            <p style={{ fontWeight: 600, margin: '0 0 4px', fontSize: '17px' }}>{friendlyError(error, !!queryInput?.token)}</p>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>Verifique o número do pedido e o telefone informados, ou fale conosco pelo WhatsApp.</p>
          </div>
        )}

        {order && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Order summary */}
            <div className="tk-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>Pedido</p>
                  <p style={{ fontFamily: SERIF, fontSize: '2rem', fontWeight: 700, color: 'white', margin: 0, lineHeight: 1.1 }}>#{order.id}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: '0 0 2px' }}>Total</p>
                  <p style={{ fontFamily: SERIF, fontSize: '2rem', fontWeight: 700, color: GOLD_LIGHT, margin: 0, lineHeight: 1.1 }}>
                    R$ {parseFloat(order.totalPrice ?? '0').toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.9)', margin: '0 0 4px' }}>
                {order.quantity}x Sal Vita Premium 1kg
              </p>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', margin: 0 }}>
                {order.city}/{order.state} · {order.shippingServiceName ?? 'Correios'}
              </p>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', margin: '8px 0 0' }}>
                Realizado em {new Date(order.createdAt).toLocaleDateString('pt-BR', { day:'2-digit',month:'long',year:'numeric' })}
              </p>
            </div>

            {/* Status timeline */}
            {order.status !== 'cancelled' ? (
              <div className="tk-box">
                <h3 style={{ fontFamily: SERIF, fontSize: '1.4rem', fontWeight: 700, color: 'white', margin: '0 0 18px' }}>
                  Acompanhe seu pedido
                </h3>
                <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {STATUS_STEPS.map((baseStep, idx) => {
                    const done = idx <= stepIndex;
                    const current = idx === stepIndex;
                    // A shipping label alone is not a shipment: say so until the carrier has the package.
                    const step = baseStep.key === 'shipped' && order.status === 'label_generated' ? LABEL_ONLY_STEP : baseStep;
                    const last = idx === STATUS_STEPS.length - 1;
                    return (
                      <li key={step.key} aria-current={current ? 'step' : undefined} style={{ display: 'flex', gap: '16px', paddingBottom: last ? 0 : '22px', position: 'relative' }}>
                        {/* Linha */}
                        {!last && (
                          <div aria-hidden="true" style={{
                            position: 'absolute', left: '9px', top: '22px', bottom: '0', width: '2px',
                            background: idx < stepIndex ? GOLD : 'rgba(255,255,255,0.25)',
                          }} />
                        )}
                        {/* Ponto */}
                        <div aria-hidden="true" style={{
                          width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
                          marginTop: '2px', zIndex: 1,
                          background: done ? GOLD : NAVY,
                          border: done ? `2px solid ${GOLD}` : '2px solid rgba(255,255,255,0.4)',
                          outline: current ? `2px solid ${GOLD_LIGHT}` : 'none', outlineOffset: '2px',
                        }} />
                        {/* Texto */}
                        <div>
                          <p style={{ margin: '0 0 2px', fontSize: '17px', fontWeight: current ? 700 : 500, color: done ? 'white' : 'rgba(255,255,255,0.75)' }}>
                            {step.label}
                          </p>
                          {current && <p style={{ margin: 0, fontSize: '15px', color: 'rgba(255,255,255,0.85)' }}>{step.desc}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
              <div className="tk-box" style={{ borderColor: 'rgba(252,165,165,0.6)' }}>
                <p style={{ fontWeight: 600, color: '#fca5a5', fontSize: '17px', margin: 0 }}>Pedido cancelado</p>
                <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', margin: '4px 0 0' }}>Entre em contato pelo WhatsApp se precisar de ajuda.</p>
              </div>
            )}

            {/* Ocorrência informada pela transportadora (via Melhor Envio) */}
            {order.deliveryIssue && DELIVERY_ISSUE_TEXT[order.deliveryIssue] && (
              <div className="tk-box" role="status" style={{ borderColor: 'rgba(224,191,84,0.6)' }}>
                <h3 style={{ fontFamily: SERIF, fontSize: '1.4rem', fontWeight: 700, color: 'white', margin: '0 0 8px' }}>
                  {DELIVERY_ISSUE_TEXT[order.deliveryIssue].title}
                </h3>
                <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.6 }}>
                  {DELIVERY_ISSUE_TEXT[order.deliveryIssue].body} Confira os detalhes no rastreio abaixo ou fale com a gente pelo WhatsApp.
                </p>
              </div>
            )}

            {/* Tracking code */}
            {order.trackingCode && (
              <div className="tk-box">
                <h3 style={{ fontFamily: SERIF, fontSize: '1.4rem', fontWeight: 700, color: 'white', margin: '0 0 10px' }}>
                  Código de rastreio
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <code style={{
                    fontSize: '20px', fontWeight: 700, color: GOLD_LIGHT,
                    border: '1px solid rgba(201,162,39,0.5)', padding: '8px 14px', borderRadius: '8px',
                    letterSpacing: '0.08em', overflowWrap: 'anywhere',
                  }}>
                    {order.trackingCode}
                  </code>
                  <a
                    href={trackingLink(order.trackingCode)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '0 20px', borderRadius: '8px',
                      background: GOLD, color: NAVY, fontWeight: 700, fontSize: '16px',
                      textDecoration: 'none',
                    }}
                  >
                    Acompanhar a entrega
                  </a>
                </div>
                {order.status === 'label_generated' && (
                  <p style={{ margin: '10px 0 0', fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                    A movimentação aparece no rastreio depois que o pacote é postado.
                  </p>
                )}
              </div>
            )}

            {/* Payment status */}
            {(order.paymentStatus === 'awaiting' || order.paymentStatus === 'failed') && (
              <div className="tk-box" style={{ borderColor: order.paymentStatus === 'failed' ? 'rgba(252,165,165,0.6)' : 'rgba(232,197,71,0.6)' }}>
                <p style={{ margin: 0, fontSize: '16px', lineHeight: 1.5, color: order.paymentStatus === 'failed' ? '#fca5a5' : GOLD_LIGHT }}>
                  {order.paymentStatus === 'failed'
                    ? <><strong>Pagamento não aprovado.</strong> Tente novamente com outro método de pagamento.</>
                    : <><strong>Aguardando confirmação de pagamento.</strong> Conclua o pagamento abaixo para garantir seu pedido.</>
                  }
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '14px' }}>
                  <button onClick={handlePay} disabled={payLoading} className="tk-btn"
                    style={{
                      minHeight: 48, padding: '0 20px', borderRadius: '8px',
                      background: GOLD, opacity: payLoading ? 0.6 : 1, color: NAVY,
                      fontWeight: 700, fontSize: '16px', border: 'none',
                      cursor: payLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {payLoading ? 'Gerando link...' : 'Pagar agora (cartão, PIX ou boleto)'}
                  </button>
                  <a
                    href="https://wa.me/558421408212"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', minHeight: 48, padding: '0 20px',
                      borderRadius: '8px', border: '1.5px solid rgba(255,255,255,0.45)', color: 'white',
                      fontWeight: 600, fontSize: '16px', textDecoration: 'none',
                    }}
                  >
                    Enviar comprovante no WhatsApp
                  </a>
                </div>
                {payErr && <p role="alert" style={{ margin: '10px 0 0', fontSize: '14px', fontWeight: 600, color: '#fca5a5' }}>{payErr}</p>}
              </div>
            )}
          </div>
        )}
      </main>
      <ConsentBanner pageView={false} />
    </div>
  );
}
