import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';

const STATUS_STEPS = [
  { key: 'pending',   label: 'Pedido Recebido',       icon: '📦', desc: 'Aguardando confirmação de pagamento' },
  { key: 'confirmed', label: 'Pagamento Confirmado',   icon: '✅', desc: 'Seu pedido está sendo preparado' },
  { key: 'shipped',   label: 'Enviado',                icon: '🚚', desc: 'A caminho de você' },
  { key: 'delivered', label: 'Entregue',               icon: '🎉', desc: 'Pedido entregue com sucesso!' },
];

const STATUS_ORDER = ['pending', 'confirmed', 'label_generated', 'shipped', 'delivered'];

function getStepIndex(status: string) {
  if (status === 'label_generated') return 2;
  return STATUS_ORDER.indexOf(status);
}

// MP redirects with ?pedido=ID&status=pago after payment.
// Recovery emails/WhatsApp links also include ?tel=XXXX (last 4 digits) so the
// customer can land directly on their order without retyping anything.
function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return { pedido: p.get('pedido'), status: p.get('status'), tel: p.get('tel') };
}

export default function TrackOrder() {
  const urlParams = getUrlParams();
  const [orderId, setOrderId] = useState(urlParams.pedido ?? '');
  const [phone, setPhone] = useState(urlParams.tel ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [queryInput, setQueryInput] = useState<{ orderId: number; phone: string } | null>(
    urlParams.pedido && urlParams.tel ? { orderId: parseInt(urlParams.pedido), phone: urlParams.tel } : null
  );
  const [mpStatus] = useState(urlParams.status);
  const [payLoading, setPayLoading] = useState(false);

  // Used to verify ownership when generating a payment link.
  const payerPhone = phone || urlParams.tel || '';

  async function handlePay() {
    const id = queryInput?.orderId ?? parseInt(urlParams.pedido ?? '');
    if (!id) return;
    setPayLoading(true);
    try {
      const res = await fetch('/api/trpc/shipping.createPayment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { orderId: id, phone: payerPhone || undefined } }),
      });
      const data = await res.json();
      const initPoint = data?.result?.data?.json?.initPoint;
      if (initPoint) { window.location.href = initPoint; }
      else { alert('Erro ao gerar link. Tente novamente.'); setPayLoading(false); }
    } catch { alert('Erro de conexão. Tente novamente.'); setPayLoading(false); }
  }

  const { data: order, isLoading, error } = trpc.shipping.trackOrder.useQuery(
    queryInput!,
    { enabled: !!queryInput, retry: false }
  );

  // If we have both order + phone from the link, search automatically.
  useEffect(() => {
    if (urlParams.pedido && urlParams.tel) {
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
    if (!id || !phone.trim()) return;
    setQueryInput({ orderId: id, phone: phone.trim() });
    setSubmitted(true);
  };

  // Fire the Facebook Pixel Purchase event only when a real, confirmed payment is
  // observed here (post-redirect / confirmed order) — not at checkout click. This keeps
  // ad-campaign optimization tied to actual buyers.
  const purchaseFired = useRef(false);
  useEffect(() => {
    if (order && !purchaseFired.current && (order.paymentStatus === 'confirmed' || mpStatus === 'pago')) {
      purchaseFired.current = true;
      try {
        (window as any).fbq?.('track', 'Purchase', {
          value: parseFloat(order.totalPrice ?? '0'),
          currency: 'BRL',
          content_name: 'SAL VITA PREMIUM',
          content_ids: ['salvita-001'],
          content_type: 'product',
          num_items: order.quantity,
        });
      } catch {}
    }
  }, [order, mpStatus]);

  const stepIndex = order ? getStepIndex(order.status) : -1;

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
            <defs><clipPath id="oval-t"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="rgba(255,255,255,0.08)"/>
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#4a9eff" clipPath="url(#oval-t)"/>
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="white">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="15"/>
          </svg>
        </a>
        <h1 style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Rastreamento de Pedido</h1>
      </header>

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px' }}>
        {/* MP payment result banner */}
        {mpStatus === 'pago' && (
          <div style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '28px' }}>🎉</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: '#4ade80', fontSize: '16px' }}>Pagamento aprovado!</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Confirme seu pedido abaixo informando o número e telefone.</p>
            </div>
          </div>
        )}
        {mpStatus === 'falhou' && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#fca5a5' }}>❌ Pagamento não aprovado.</p>
            <p style={{ margin: '6px 0 14px', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Não se preocupe — seu pedido foi salvo. Clique abaixo para tentar novamente com outro método de pagamento.</p>
            {urlParams.pedido && (
              <button onClick={handlePay} disabled={payLoading}
                style={{ background: payLoading ? '#475569' : '#009ee3', color: 'white', border: 'none', borderRadius: '10px', padding: '12px 24px', fontWeight: 700, fontSize: '14px', cursor: payLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                {payLoading ? '⟳ Gerando link...' : '💳 Tentar pagamento novamente'}
              </button>
            )}
          </div>
        )}
        {mpStatus === 'pendente' && (
          <div style={{ background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px' }}>
            <p style={{ margin: 0, fontWeight: 700, color: '#fde68a' }}>⏳ Pagamento pendente.</p>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>Se pagou via boleto, pode levar até 2 dias úteis para ser confirmado.</p>
          </div>
        )}

        {/* Search form */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          padding: '32px',
          marginBottom: '24px',
          backdropFilter: 'blur(10px)',
        }}>
          <h2 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px', color: 'white' }}>
            🔍 Rastrear meu pedido
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '24px' }}>
            Informe o número do pedido e os últimos 4 dígitos do seu telefone.
          </p>
          <form onSubmit={handleSearch}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Número do Pedido
                </label>
                <input
                  type="number"
                  value={orderId}
                  onChange={e => setOrderId(e.target.value)}
                  placeholder="Ex: 42"
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 16px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.07)',
                    color: 'white', fontSize: '16px', outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Últimos 4 dígitos do telefone
                </label>
                <input
                  id="track-phone"
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Ex: 8212"
                  maxLength={4}
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 16px', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.07)',
                    color: 'white', fontSize: '16px', outline: 'none',
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  padding: '14px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #1a56db, #0d3fa6)',
                  color: 'white', fontWeight: 700, fontSize: '15px',
                  border: 'none', cursor: 'pointer', marginTop: '4px',
                }}
              >
                Consultar Pedido
              </button>
            </div>
          </form>
        </div>

        {/* Results */}
        {submitted && isLoading && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.5)' }}>
            Buscando seu pedido...
          </div>
        )}

        {submitted && error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '16px', padding: '24px', textAlign: 'center', color: '#fca5a5',
          }}>
            <p style={{ fontSize: '32px', margin: '0 0 8px' }}>😕</p>
            <p style={{ fontWeight: 600, marginBottom: '4px' }}>{(error as any)?.message ?? 'Pedido não encontrado'}</p>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>Verifique o número do pedido e o telefone informados.</p>
          </div>
        )}

        {order && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Order summary */}
            <div style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px', padding: '24px', backdropFilter: 'blur(10px)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 4px' }}>PEDIDO</p>
                  <p style={{ fontSize: '22px', fontWeight: 800, color: 'white', margin: 0 }}>#{order.id}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: '0 0 4px' }}>TOTAL</p>
                  <p style={{ fontSize: '20px', fontWeight: 700, color: '#4ade80', margin: 0 }}>
                    R$ {parseFloat(order.totalPrice ?? '0').toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: '0 0 4px' }}>
                🧂 {order.quantity}x Sal Marinho Integral 1kg
              </p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                📍 {order.city}/{order.state} · {order.shippingServiceName ?? 'Correios'}
              </p>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', margin: '8px 0 0' }}>
                Realizado em {new Date(order.createdAt).toLocaleDateString('pt-BR', { day:'2-digit',month:'long',year:'numeric' })}
              </p>
            </div>

            {/* Status timeline */}
            {order.status !== 'cancelled' ? (
              <div style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '20px', padding: '24px', backdropFilter: 'blur(10px)',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Acompanhe seu pedido
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {STATUS_STEPS.map((step, idx) => {
                    const done = idx <= stepIndex;
                    const current = idx === stepIndex;
                    return (
                      <div key={step.key} style={{ display: 'flex', gap: '16px', paddingBottom: idx < STATUS_STEPS.length - 1 ? '20px' : '0', position: 'relative' }}>
                        {/* Line */}
                        {idx < STATUS_STEPS.length - 1 && (
                          <div style={{
                            position: 'absolute', left: '19px', top: '40px', bottom: '0', width: '2px',
                            background: done ? 'linear-gradient(#4ade80, #22d3ee)' : 'rgba(255,255,255,0.1)',
                          }} />
                        )}
                        {/* Icon */}
                        <div style={{
                          width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '18px', zIndex: 1,
                          background: done ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.08)',
                          border: current ? '2px solid #4ade80' : '2px solid transparent',
                          boxShadow: current ? '0 0 16px rgba(74,222,128,0.4)' : 'none',
                        }}>
                          {done ? step.icon : '○'}
                        </div>
                        {/* Text */}
                        <div style={{ paddingTop: '8px' }}>
                          <p style={{ margin: '0 0 2px', fontSize: '15px', fontWeight: current ? 700 : 500, color: done ? 'white' : 'rgba(255,255,255,0.3)' }}>
                            {step.label}
                          </p>
                          <p style={{ margin: 0, fontSize: '12px', color: done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>
                            {current ? step.desc : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '16px', padding: '24px', textAlign: 'center',
              }}>
                <p style={{ fontSize: '28px', margin: '0 0 8px' }}>❌</p>
                <p style={{ fontWeight: 700, color: '#fca5a5' }}>Pedido Cancelado</p>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0' }}>Entre em contato pelo WhatsApp se precisar de ajuda.</p>
              </div>
            )}

            {/* Tracking code */}
            {order.trackingCode && (
              <div style={{
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '20px', padding: '24px', backdropFilter: 'blur(10px)',
              }}>
                <h3 style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Código de Rastreio
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <code style={{
                    fontSize: '20px', fontWeight: 700, color: '#4ade80',
                    background: 'rgba(74,222,128,0.1)', padding: '8px 16px', borderRadius: '8px',
                    letterSpacing: '0.1em',
                  }}>
                    {order.trackingCode}
                  </code>
                  <a
                    href={`https://rastreamento.correios.com.br/app/index.php?objetos=${order.trackingCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '10px 20px', borderRadius: '10px',
                      background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: 'white', fontWeight: 600, fontSize: '14px',
                      textDecoration: 'none',
                    }}
                  >
                    Rastrear nos Correios →
                  </a>
                </div>
              </div>
            )}

            {/* Payment status */}
            {(order.paymentStatus === 'awaiting' || order.paymentStatus === 'failed') && (
              <div style={{
                background: order.paymentStatus === 'failed' ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)',
                border: order.paymentStatus === 'failed' ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(234,179,8,0.3)',
                borderRadius: '16px', padding: '20px',
              }}>
                <p style={{ margin: 0, fontSize: '14px', color: order.paymentStatus === 'failed' ? '#fca5a5' : '#fde68a' }}>
                  {order.paymentStatus === 'failed'
                    ? <><strong>❌ Pagamento não aprovado.</strong> Tente novamente com outro método de pagamento.</>
                    : <>⏳ <strong>Aguardando confirmação de pagamento.</strong> Conclua o pagamento abaixo para garantir seu pedido.</>
                  }
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                  <button onClick={handlePay} disabled={payLoading}
                    style={{
                      padding: '10px 20px', borderRadius: '10px',
                      background: payLoading ? '#475569' : '#009ee3', color: 'white',
                      fontWeight: 700, fontSize: '14px', border: 'none',
                      cursor: payLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {payLoading ? '⟳ Gerando link...' : '💳 Pagar agora (Cartão, PIX ou Boleto)'}
                  </button>
                  <a
                    href="https://wa.me/558421408212"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block', padding: '10px 20px',
                      borderRadius: '10px', background: '#16a34a', color: 'white',
                      fontWeight: 600, fontSize: '14px', textDecoration: 'none',
                    }}
                  >
                    📱 Enviar comprovante no WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
