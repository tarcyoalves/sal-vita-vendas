import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Types ─────────────────────────────────────────────── */
interface Product {
  id: string;
  name: string;
  subtitle: string;
  weight: string;
  weightKg: number;
  price: number;
  pricePerKg: number;
  tag: string;
  tagColor: string;
  savings?: string;
  highlight: boolean;
}

interface ShippingOption {
  service: string;
  price: number;
  days: string;
  icon: string;
  description: string;
}

interface CepData {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

/* ─── Shipping region data ───────────────────────────────── */
const REGIONS: Record<string, { pac: [number, string]; sedex: [number, string] }> = {
  RN: { pac: [14, '3–5 dias'], sedex: [27, '1–2 dias'] },
  CE: { pac: [15, '3–5 dias'], sedex: [28, '1–2 dias'] },
  PB: { pac: [15, '4–6 dias'], sedex: [29, '1–3 dias'] },
  PE: { pac: [16, '4–6 dias'], sedex: [30, '2–3 dias'] },
  AL: { pac: [16, '4–7 dias'], sedex: [31, '2–3 dias'] },
  SE: { pac: [17, '5–7 dias'], sedex: [32, '2–3 dias'] },
  BA: { pac: [18, '5–8 dias'], sedex: [33, '2–3 dias'] },
  MA: { pac: [18, '5–8 dias'], sedex: [34, '2–3 dias'] },
  PI: { pac: [17, '4–7 dias'], sedex: [32, '2–3 dias'] },
  SP: { pac: [22, '6–9 dias'], sedex: [40, '2–4 dias'] },
  RJ: { pac: [22, '6–9 dias'], sedex: [40, '2–4 dias'] },
  MG: { pac: [20, '5–8 dias'], sedex: [38, '2–4 dias'] },
  ES: { pac: [21, '6–9 dias'], sedex: [39, '2–4 dias'] },
  PR: { pac: [24, '7–10 dias'], sedex: [44, '3–5 dias'] },
  SC: { pac: [25, '8–11 dias'], sedex: [46, '3–5 dias'] },
  RS: { pac: [26, '8–12 dias'], sedex: [48, '3–5 dias'] },
  DF: { pac: [22, '6–9 dias'], sedex: [42, '2–4 dias'] },
  GO: { pac: [21, '6–10 dias'], sedex: [41, '2–4 dias'] },
  MT: { pac: [26, '8–12 dias'], sedex: [48, '3–5 dias'] },
  MS: { pac: [24, '7–11 dias'], sedex: [45, '3–5 dias'] },
  AM: { pac: [36, '12–18 dias'], sedex: [62, '5–8 dias'] },
  PA: { pac: [32, '10–16 dias'], sedex: [57, '4–7 dias'] },
  AC: { pac: [40, '14–20 dias'], sedex: [68, '6–10 dias'] },
  RO: { pac: [34, '11–17 dias'], sedex: [60, '5–8 dias'] },
  RR: { pac: [40, '14–20 dias'], sedex: [68, '6–10 dias'] },
  AP: { pac: [37, '12–18 dias'], sedex: [64, '5–9 dias'] },
  TO: { pac: [24, '9–13 dias'], sedex: [46, '3–6 dias'] },
};

function calcShipping(uf: string, weightKg: number): ShippingOption[] {
  const r = REGIONS[uf] ?? { pac: [28, '10–15 dias'], sedex: [52, '4–7 dias'] };
  const factor = weightKg >= 10 ? 2.4 : 1.0;
  return [
    {
      service: 'PAC',
      price: parseFloat((r.pac[0] * factor).toFixed(2)),
      days: r.pac[1],
      icon: '📦',
      description: 'Econômico',
    },
    {
      service: 'SEDEX',
      price: parseFloat((r.sedex[0] * factor).toFixed(2)),
      days: r.sedex[1],
      icon: '⚡',
      description: 'Expresso',
    },
  ];
}

/* ─── Particle data (deterministic positions) ───────────── */
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${((i * 37 + 7) % 97) + 1}%`,
  size: 2 + (i % 3),
  duration: `${7 + (i % 9)}s`,
  delay: `${-((i * 1.8) % 12)}s`,
  opacity: 0.12 + (i % 6) * 0.07,
}));

/* ─── FAQ data ───────────────────────────────────────────── */
const FAQS = [
  {
    q: 'O ferrocianeto de sódio é seguro?',
    a: 'Sim. O ferrocianeto de sódio é um aditivo alimentar aprovado pela ANVISA (INS 535) e regulamentado internacionalmente. Ele é usado em quantidades mínimas (< 10 mg/kg) exclusivamente para evitar que o sal empedre. Está presente na maioria dos sais de mesa do mundo.',
  },
  {
    q: 'Por que o sal de Mossoró é diferente?',
    a: 'Mossoró (RN) é o maior produtor de sal marinho do Brasil, responsável por mais de 95% da produção nacional. As condições climáticas únicas do sertão nordestino — sol intenso, ventos constantes e baixíssima umidade — produzem um sal de altíssima pureza, colhido diretamente do oceano Atlântico.',
  },
  {
    q: 'O zip lock realmente funciona?',
    a: 'Sim. A embalagem SAL VITA PREMIUM usa um zip lock de alta espessura (100 mícrons) com junta dupla de vedação. Diferente de embalagens convencionais, ela fecha completamente sem resíduos e mantém o sal seco por mais tempo. A janela de visualização permite ver o produto a qualquer momento.',
  },
  {
    q: 'Qual a validade?',
    a: '12 meses a partir da data de fabricação, armazenado em local seco e fresco. Com o zip lock fechado corretamente, o sal dura ainda mais sem empedar.',
  },
  {
    q: 'Como funciona o frete?',
    a: 'Enviamos por Correios (PAC e SEDEX) via plataforma Melhor Envio, com rastreamento. O prazo varia por região: Nordeste de 1–5 dias úteis, Sudeste/Sul de 2–7 dias úteis, Norte até 8–18 dias úteis. Pedidos acima de R$ 150 têm frete grátis para todo o Brasil.',
  },
  {
    q: 'Posso pedir em caixas para revenda?',
    a: 'Sim! A Caixa 10kg é ideal para revendedores, restaurantes e atacado. Para volumes maiores (50kg+) entre em contato direto via WhatsApp para preços especiais.',
  },
];

/* ─── WA number — EDIT HERE ─────────────────────────────── */
const WA_NUMBER = '5584999999999'; // substitua pelo número real

function buildWaLink(product: Product, shipping?: ShippingOption): string {
  const msg = shipping
    ? `Olá! Quero comprar ${product.name} ${product.weight} por R$ ${product.price.toFixed(2)}. Frete ${shipping.service}: R$ ${shipping.price.toFixed(2)} (${shipping.days}). Total: R$ ${(product.price + shipping.price).toFixed(2)}.`
    : `Olá! Quero comprar ${product.name} ${product.weight} por R$ ${product.price.toFixed(2)}.`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

/* ─── Landing Page Component ────────────────────────────── */
export default function SalVitaLanding() {
  const [scrolled, setScrolled] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cep, setCep] = useState('');
  const [cepData, setCepData] = useState<CepData | null>(null);
  const [shipping, setShipping] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepError, setCepError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll reveal
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, e.target.id]));
          }
        });
      },
      { threshold: 0.1 },
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  const isVisible = (id: string) => visibleSections.has(id);

  const handleBuy = useCallback((product: Product) => {
    setSelectedProduct(product);
    setShowModal(true);
    setCep('');
    setCepData(null);
    setShipping([]);
    setSelectedShipping(null);
    setCepError('');
    document.body.style.overflow = 'hidden';
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    document.body.style.overflow = '';
  }, []);

  const formatCep = (v: string) => v.replace(/\D/g, '').slice(0, 8);

  const lookupCep = async () => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) {
      setCepError('Digite um CEP válido com 8 dígitos.');
      return;
    }
    setLoadingCep(true);
    setCepError('');
    setCepData(null);
    setShipping([]);
    setSelectedShipping(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepError('CEP não encontrado. Verifique e tente novamente.');
        setLoadingCep(false);
        return;
      }
      setCepData(data);
      const opts = calcShipping(data.uf, selectedProduct!.weightKg);
      setShipping(opts);
      setSelectedShipping(opts[0]);
    } catch {
      setCepError('Erro de conexão. Tente novamente.');
    }
    setLoadingCep(false);
  };

  const products: Product[] = [
    {
      id: '1kg',
      name: 'SAL VITA PREMIUM',
      subtitle: 'Embalagem familiar zip lock',
      weight: '1kg',
      weightKg: 1.2,
      price: 29.90,
      pricePerKg: 29.90,
      tag: 'Mais Vendido',
      tagColor: '#d4891a',
      highlight: false,
    },
    {
      id: 'caixa',
      name: 'CAIXA SAL VITA PREMIUM',
      subtitle: '10 embalagens zip lock 1kg',
      weight: '10kg (10 × 1kg)',
      weightKg: 12,
      price: 149.90,
      pricePerKg: 14.99,
      tag: 'Melhor Custo-Benefício',
      tagColor: '#0d6e6e',
      savings: 'Economize R$ 149,10',
      highlight: true,
    },
  ];

  return (
    <>
      <style>{`
        /* ── Vita Variables ── */
        .vita {
          --abyss:   #04080e;
          --deep:    #0a1628;
          --ocean:   #0d2540;
          --teal:    #0d5050;
          --gold:    #d4891a;
          --goldlt:  #f0b040;
          --coral:   #c44730;
          --salt:    #f4f0e8;
          --cream:   #e0d8c8;
          --sand:    #b8a888;
          --muted:   #6e6258;
          --display: 'Cormorant Garamond', Georgia, serif;
          --body:    'Outfit', 'Barlow Condensed', sans-serif;
        }
        .vita { font-family: var(--body); color: var(--salt); background: var(--abyss); }

        /* ── Particles ── */
        @keyframes floatUp {
          0%   { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.8; }
          100% { transform: translateY(-20px) rotate(360deg); opacity: 0; }
        }
        .particle {
          position: absolute;
          bottom: 0;
          border-radius: 2px;
          background: #fff;
          animation: floatUp linear infinite;
          pointer-events: none;
        }

        /* ── Marquee ── */
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .marquee-inner { animation: marquee 28s linear infinite; display: flex; width: max-content; }
        .marquee-inner:hover { animation-play-state: paused; }

        /* ── Pulse ── */
        @keyframes goldPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(212,137,26,0.4); }
          50%       { box-shadow: 0 0 0 16px rgba(212,137,26,0); }
        }
        .btn-gold-pulse { animation: goldPulse 2.4s ease-in-out infinite; }

        /* ── Shimmer ── */
        @keyframes shimmer {
          from { background-position: -200% 0; }
          to   { background-position: 200% 0; }
        }
        .shimmer-text {
          background: linear-gradient(90deg, #d4891a 0%, #f0b040 30%, #d4891a 50%, #f0b040 70%, #d4891a 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: shimmer 4s linear infinite;
        }

        /* ── Reveal ── */
        .reveal { opacity: 0; transform: translateY(32px); transition: opacity 0.7s ease, transform 0.7s ease; }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        .reveal-delay-1 { transition-delay: 0.1s; }
        .reveal-delay-2 { transition-delay: 0.2s; }
        .reveal-delay-3 { transition-delay: 0.35s; }
        .reveal-delay-4 { transition-delay: 0.5s; }

        /* ── Crystal bg ── */
        .crystal-bg {
          background-image:
            radial-gradient(ellipse at 20% 50%, rgba(13,80,80,0.12) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 20%, rgba(212,137,26,0.06) 0%, transparent 50%),
            url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.018'%3E%3Cpolygon points='40,0 50,30 80,30 55,50 65,80 40,60 15,80 25,50 0,30 30,30'/%3E%3C/g%3E%3C/svg%3E");
        }

        /* ── Wave divider ── */
        .wave-divider { line-height: 0; }
        .wave-divider svg { display: block; }

        /* ── Glass card ── */
        .glass-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(8px);
          transition: transform 0.3s ease, border-color 0.3s ease, background 0.3s ease;
        }
        .glass-card:hover {
          transform: translateY(-4px);
          border-color: rgba(212,137,26,0.3);
          background: rgba(255,255,255,0.07);
        }

        /* ── Pricing card ── */
        .price-card-highlight {
          background: linear-gradient(135deg, rgba(13,80,80,0.35) 0%, rgba(10,22,40,0.95) 100%);
          border: 1px solid rgba(13,80,80,0.6);
          box-shadow: 0 0 40px rgba(13,80,80,0.25), inset 0 1px 0 rgba(255,255,255,0.06);
        }
        .price-card-standard {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
        }

        /* ── CTA Wave background ── */
        .cta-wave-bg {
          background: linear-gradient(180deg, var(--deep) 0%, #061220 100%);
          position: relative;
          overflow: hidden;
        }
        .cta-wave-bg::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 50% 80%, rgba(212,137,26,0.08) 0%, transparent 70%);
          pointer-events: none;
        }

        /* ── Comparison table ── */
        .comp-row-vita { background: rgba(212,137,26,0.08); }
        .comp-cell-check { color: #4ade80; }
        .comp-cell-x { color: rgba(255,255,255,0.25); }

        /* ── FAQ accordion ── */
        .faq-item { border-bottom: 1px solid rgba(255,255,255,0.07); }
        .faq-answer { overflow: hidden; transition: max-height 0.4s ease, opacity 0.3s ease; }
        .faq-answer.open { max-height: 300px; opacity: 1; }
        .faq-answer.closed { max-height: 0; opacity: 0; }

        /* ── Modal ── */
        .modal-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(4,8,14,0.92);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
        }
        .modal-box {
          background: #0a1628;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 20px;
          width: 100%;
          max-width: 520px;
          max-height: 90vh;
          overflow-y: auto;
          padding: 32px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.8);
        }

        /* ── Shipping option card ── */
        .ship-option {
          border: 2px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 16px;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
        }
        .ship-option:hover { border-color: rgba(212,137,26,0.4); }
        .ship-option.selected { border-color: #d4891a; background: rgba(212,137,26,0.08); }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .hero-title { font-size: clamp(2.8rem, 12vw, 5rem) !important; }
          .modal-box { padding: 24px; }
        }
      `}</style>

      <div className="vita">
        {/* ════════════════════════════════════════════
            NAV
        ════════════════════════════════════════════ */}
        <nav
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            transition: 'background 0.4s ease, border-color 0.4s ease, padding 0.3s ease',
            background: scrolled ? 'rgba(4,8,14,0.96)' : 'transparent',
            borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
            backdropFilter: scrolled ? 'blur(12px)' : 'none',
            padding: scrolled ? '12px 0' : '20px 0',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontFamily: 'var(--display)', fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.06em', color: '#f4f0e8' }}>
                SAL VITA
              </span>
              <span style={{ fontFamily: 'var(--body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.22em', color: '#d4891a', marginLeft: 6, verticalAlign: 'top', marginTop: 4, display: 'inline-block' }}>
                PREMIUM
              </span>
            </div>
            <div style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <nav style={{ display: 'flex', gap: 24 }}>
                {['Produto', 'Benefícios', 'Preço', 'Contato'].map((item) => (
                  <a
                    key={item}
                    href={`#${item.toLowerCase().replace('ç', 'c').replace('í', 'i')}`}
                    style={{
                      color: 'rgba(244,240,232,0.65)',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      letterSpacing: '0.1em',
                      textDecoration: 'none',
                      textTransform: 'uppercase',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#d4891a')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(244,240,232,0.65)')}
                  >
                    {item}
                  </a>
                ))}
              </nav>
              <button
                onClick={() => handleBuy(products[0])}
                style={{
                  background: '#d4891a',
                  color: '#04080e',
                  border: 'none',
                  borderRadius: 8,
                  padding: '9px 20px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'background 0.2s, transform 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f0b040';
                  e.currentTarget.style.transform = 'scale(1.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#d4891a';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Comprar Agora
              </button>
            </div>
          </div>
        </nav>

        {/* ════════════════════════════════════════════
            HERO
        ════════════════════════════════════════════ */}
        <section
          id="hero"
          className="crystal-bg"
          style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden', background: '#04080e' }}
        >
          {/* Particles */}
          {PARTICLES.map((p) => (
            <span
              key={p.id}
              className="particle"
              style={{
                left: p.left,
                width: p.size,
                height: p.size,
                opacity: p.opacity,
                animationDuration: p.duration,
                animationDelay: p.delay,
              }}
            />
          ))}

          {/* Deep gradient overlay */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 100%, rgba(13,80,80,0.18) 0%, transparent 60%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(4,8,14,0.6) 0%, transparent 50%)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '120px 24px 80px', textAlign: 'center', width: '100%' }}>
            {/* Eyebrow */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ width: 32, height: 1, background: '#d4891a' }} />
              <span style={{ fontFamily: 'var(--body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.28em', color: '#d4891a', textTransform: 'uppercase' }}>
                Salinas de Mossoró · Rio Grande do Norte
              </span>
              <span style={{ width: 32, height: 1, background: '#d4891a' }} />
            </div>

            {/* Main title */}
            <h1
              className="hero-title"
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'clamp(3.5rem, 10vw, 7.5rem)',
                fontWeight: 700,
                lineHeight: 1.0,
                letterSpacing: '-0.01em',
                color: '#f4f0e8',
                marginBottom: 0,
              }}
            >
              SAL VITA
            </h1>
            <h2
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'clamp(1.2rem, 4vw, 2.8rem)',
                fontWeight: 300,
                fontStyle: 'italic',
                letterSpacing: '0.18em',
                color: '#d4891a',
                margin: '0 0 20px',
              }}
            >
              PREMIUM
            </h2>

            {/* Tagline */}
            <p
              style={{
                fontFamily: 'var(--display)',
                fontSize: 'clamp(1.3rem, 3.5vw, 2.1rem)',
                fontWeight: 300,
                color: 'rgba(244,240,232,0.75)',
                maxWidth: 600,
                margin: '0 auto 40px',
                lineHeight: 1.4,
              }}
            >
              O sal marinho de Mossoró
              <br />
              <em style={{ color: '#f4f0e8', fontStyle: 'italic' }}>que nunca empedra.</em>
            </p>

            {/* Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 48 }}>
              {['🌊 100% Mossoró', '🔒 Zip Lock Premium', '🪟 Janela Transparente', '⚗️ Não Empedra', '💊 Com Iodo'].map((badge) => (
                <span
                  key={badge}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 999,
                    padding: '7px 18px',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: 'rgba(244,240,232,0.8)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {badge}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
              <button
                className="btn-gold-pulse"
                onClick={() => handleBuy(products[0])}
                style={{
                  background: '#d4891a',
                  color: '#04080e',
                  border: 'none',
                  borderRadius: 12,
                  padding: '18px 42px',
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.background = '#f0b040'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = '#d4891a'; }}
              >
                Comprar 1kg — R$ 29,90
              </button>
              <button
                onClick={() => handleBuy(products[1])}
                style={{
                  background: 'transparent',
                  color: '#f4f0e8',
                  border: '1.5px solid rgba(244,240,232,0.3)',
                  borderRadius: 12,
                  padding: '18px 42px',
                  fontSize: '1rem',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4891a'; e.currentTarget.style.color = '#d4891a'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(244,240,232,0.3)'; e.currentTarget.style.color = '#f4f0e8'; }}
              >
                Caixa 10kg — R$ 149,90
              </button>
            </div>

            {/* Scroll hint */}
            <div style={{ marginTop: 64, opacity: 0.4, fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              ↓ &nbsp; Conheça mais
            </div>
          </div>

          {/* Wave bottom */}
          <div className="wave-divider" style={{ position: 'absolute', bottom: -2, left: 0, right: 0 }}>
            <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: 80 }}>
              <path d="M0,40 C360,80 720,0 1080,40 C1260,60 1380,20 1440,40 L1440,80 L0,80 Z" fill="#0a1628" />
            </svg>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            MARQUEE
        ════════════════════════════════════════════ */}
        <div style={{ background: '#d4891a', overflow: 'hidden', padding: '14px 0' }}>
          <div className="marquee-inner">
            {[...Array(2)].map((_, rep) => (
              <div key={rep} style={{ display: 'flex', gap: 48, paddingRight: 48 }}>
                {[
                  '🌊 100% Salinas de Mossoró',
                  '🔒 Zip Lock Dupla Vedação',
                  '🪟 Janela de Visualização',
                  '⚗️ Ferrocianeto — Não Empedra',
                  '💊 Iodo ANVISA',
                  '🇧🇷 100% Produto Brasileiro',
                  '📦 1kg Econômico para Família',
                  '⭐ Qualidade Premium',
                ].map((item) => (
                  <span
                    key={item}
                    style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#04080e' }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════════
            STORY SECTION
        ════════════════════════════════════════════ */}
        <section
          id="produto"
          data-reveal
          style={{ background: '#0a1628', padding: '100px 24px' }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 64, alignItems: 'center' }}>
              {/* Text */}
              <div
                id="story-text"
                data-reveal
                className={`reveal${isVisible('story-text') ? ' visible' : ''}`}
              >
                <p style={{ fontFamily: 'var(--body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.24em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 16 }}>
                  Nossa história
                </p>
                <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(2.2rem, 5vw, 3.8rem)', fontWeight: 600, lineHeight: 1.15, color: '#f4f0e8', marginBottom: 24 }}>
                  Das salinas ao
                  <br />
                  <em style={{ color: '#d4891a', fontStyle: 'italic' }}>seu prato.</em>
                </h2>
                <p style={{ color: 'rgba(244,240,232,0.65)', lineHeight: 1.8, fontSize: '1.05rem', marginBottom: 20 }}>
                  Mossoró produz <strong style={{ color: '#f4f0e8' }}>mais de 95% do sal marinho brasileiro</strong>. O sol nordestino, os ventos constantes do sertão e a distância do Atlântico criam condições únicas para um sal de pureza excepcional.
                </p>
                <p style={{ color: 'rgba(244,240,232,0.65)', lineHeight: 1.8, fontSize: '1.05rem', marginBottom: 32 }}>
                  O SAL VITA PREMIUM chega diretamente dessas salinas para sua cozinha, em embalagem zip lock com janela de visualização — sem empedrar, sem desperdício.
                </p>
                <div style={{ display: 'flex', gap: 40 }}>
                  {[['95%', 'do sal BR vem do RN'], ['1kg', 'embalagem econômica'], ['12m', 'de validade']].map(([num, label]) => (
                    <div key={num}>
                      <div className="shimmer-text" style={{ fontFamily: 'var(--display)', fontSize: '2.2rem', fontWeight: 700 }}>{num}</div>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(244,240,232,0.5)', letterSpacing: '0.06em', marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Visual — salt flat representation */}
              <div
                id="story-visual"
                data-reveal
                className={`reveal reveal-delay-2${isVisible('story-visual') ? ' visible' : ''}`}
                style={{ display: 'flex', justifyContent: 'center' }}
              >
                <div style={{ position: 'relative', width: 340, height: 380 }}>
                  {/* Product bag mockup */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
                    borderRadius: 20,
                    border: '1px solid rgba(255,255,255,0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: 32,
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
                  }}>
                    {/* Zip lock indicator */}
                    <div style={{ width: '80%', height: 10, background: 'linear-gradient(90deg, #1a3a5c, #0d5050, #1a3a5c)', borderRadius: 4, marginBottom: 8 }} />
                    <div style={{ width: '80%', height: 10, background: 'linear-gradient(90deg, #0d5050, #d4891a44, #0d5050)', borderRadius: 4, marginBottom: 16 }} />

                    {/* Window */}
                    <div style={{
                      width: '70%',
                      height: 120,
                      background: 'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%)',
                      borderRadius: 12,
                      border: '1px solid rgba(255,255,255,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 20,
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 4 }}>🧂</div>
                        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>JANELA DE VISUALIZAÇÃO</div>
                      </div>
                    </div>

                    <div style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', fontWeight: 700, color: '#f4f0e8', letterSpacing: '0.04em', textAlign: 'center' }}>
                      SAL VITA
                    </div>
                    <div style={{ fontFamily: 'var(--body)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.2em', color: '#d4891a', textTransform: 'uppercase' }}>
                      PREMIUM
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(244,240,232,0.5)', marginTop: 4 }}>Sal Marinho Integral · 1kg</div>
                    <div style={{ fontSize: '0.7rem', color: 'rgba(244,240,232,0.35)', marginTop: 2 }}>Mossoró · RN · Brasil</div>
                  </div>
                  {/* Glow */}
                  <div style={{ position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)', width: 200, height: 40, background: 'rgba(212,137,26,0.15)', borderRadius: '50%', filter: 'blur(20px)' }} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            BENEFITS
        ════════════════════════════════════════════ */}
        <section
          id="beneficios"
          style={{ background: '#04080e', padding: '100px 24px' }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div
              id="ben-head"
              data-reveal
              className={`reveal${isVisible('ben-head') ? ' visible' : ''}`}
              style={{ textAlign: 'center', marginBottom: 64 }}
            >
              <p style={{ fontFamily: 'var(--body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.24em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 12 }}>
                Por que escolher
              </p>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, color: '#f4f0e8' }}>
                Feito para quem não abre mão de qualidade
              </h2>
            </div>

            <div
              id="ben-grid"
              data-reveal
              className={`reveal${isVisible('ben-grid') ? ' visible' : ''}`}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}
            >
              {[
                {
                  icon: '🔒',
                  title: 'Zip Lock que Funciona',
                  desc: 'Fechamento duplo com 100 mícrons de espessura. Abre e fecha centenas de vezes sem perder a vedação. Chega de prender o sal com clipes e grampos.',
                },
                {
                  icon: '🪟',
                  title: 'Janela Transparente',
                  desc: 'Você vê o sal antes de abrir. Sabe exatamente o quanto tem. Nada de adivinhar o nível da embalagem.',
                },
                {
                  icon: '⚗️',
                  title: 'Não Empedra',
                  desc: 'Ferrocianeto de sódio (INS 535), aprovado pela ANVISA, em quantidade mínima. Mantém o sal fluido mesmo no clima úmido brasileiro.',
                },
                {
                  icon: '💊',
                  title: 'Iodo Essencial',
                  desc: 'Iodato de potássio conforme norma RDC. Previne bócio e protege a tireoide de toda a família.',
                },
                {
                  icon: '🌊',
                  title: '100% Mossoró',
                  desc: 'Colhido diretamente das salinas do Rio Grande do Norte. Sem mistura, sem adulteração. Apoio direto à economia nordestina.',
                },
                {
                  icon: '📦',
                  title: '1kg Econômico',
                  desc: 'A embalagem certa para famílias. Nem pequena demais pra acabar rápido, nem grande demais pra ocupar espaço.',
                },
              ].map((b, i) => (
                <div
                  key={b.title}
                  className="glass-card"
                  style={{
                    borderRadius: 16,
                    padding: '28px 24px',
                    transition: `transform 0.3s ease ${i * 0.05}s, opacity 0.5s ease ${i * 0.07}s`,
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: 14 }}>{b.icon}</div>
                  <h3 style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', fontWeight: 600, color: '#f4f0e8', marginBottom: 10 }}>{b.title}</h3>
                  <p style={{ color: 'rgba(244,240,232,0.58)', lineHeight: 1.7, fontSize: '0.9rem' }}>{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Wave transition */}
        <div className="wave-divider" style={{ background: '#04080e', marginBottom: -2 }}>
          <svg viewBox="0 0 1440 60" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: 60, display: 'block' }}>
            <path d="M0,20 C480,60 960,0 1440,30 L1440,60 L0,60 Z" fill="#0a1628" />
          </svg>
        </div>

        {/* ════════════════════════════════════════════
            PRICING
        ════════════════════════════════════════════ */}
        <section
          id="preco"
          style={{ background: '#0a1628', padding: '100px 24px' }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div
              id="price-head"
              data-reveal
              className={`reveal${isVisible('price-head') ? ' visible' : ''}`}
              style={{ textAlign: 'center', marginBottom: 64 }}
            >
              <p style={{ fontFamily: 'var(--body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.24em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 12 }}>
                Escolha seu pack
              </p>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 700, color: '#f4f0e8', marginBottom: 12 }}>
                Preço justo. Qualidade real.
              </h2>
              <p style={{ color: 'rgba(244,240,232,0.5)', fontSize: '1.05rem' }}>
                Frete grátis para pedidos acima de R$ 150,00
              </p>
            </div>

            <div
              id="price-cards"
              data-reveal
              className={`reveal${isVisible('price-cards') ? ' visible' : ''}`}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, maxWidth: 800, margin: '0 auto' }}
            >
              {products.map((p) => (
                <div
                  key={p.id}
                  className={p.highlight ? 'price-card-highlight' : 'price-card-standard'}
                  style={{
                    borderRadius: 24,
                    padding: '36px 32px',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'transform 0.3s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-6px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  {/* Top badge */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    background: p.tagColor,
                    color: p.highlight ? '#f4f0e8' : '#04080e',
                    padding: '6px 18px',
                    borderRadius: '0 24px 0 12px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}>
                    {p.tag}
                  </div>

                  <p style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.2em', color: 'rgba(244,240,232,0.45)', textTransform: 'uppercase', marginBottom: 8 }}>
                    {p.subtitle}
                  </p>
                  <h3 style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', fontWeight: 700, color: '#f4f0e8', marginBottom: 4 }}>
                    {p.name}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(244,240,232,0.5)', marginBottom: 28 }}>{p.weight}</p>

                  {p.savings && (
                    <div style={{
                      background: 'rgba(13,80,80,0.4)',
                      border: '1px solid rgba(13,80,80,0.6)',
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: '0.8rem',
                      color: '#4ade80',
                      fontWeight: 600,
                      marginBottom: 16,
                      display: 'inline-block',
                    }}>
                      {p.savings} vs comprar separado
                    </div>
                  )}

                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontFamily: 'var(--display)', fontSize: '3rem', fontWeight: 700, color: '#f4f0e8', lineHeight: 1 }}>
                      R$ {p.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(244,240,232,0.4)', marginBottom: 32 }}>
                    R$ {p.pricePerKg.toFixed(2).replace('.', ',')}/kg
                  </p>

                  {/* Features list */}
                  <ul style={{ listStyle: 'none', padding: 0, marginBottom: 32 }}>
                    {[
                      'Zip lock dupla vedação',
                      'Janela de visualização',
                      'Não empedra',
                      'Com iodo (ANVISA)',
                      '100% Mossoró RN',
                      'Frete via Melhor Envio',
                    ].map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ color: '#d4891a', fontSize: '0.9rem' }}>✓</span>
                        <span style={{ fontSize: '0.9rem', color: 'rgba(244,240,232,0.7)' }}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleBuy(p)}
                    className={p.highlight ? 'btn-gold-pulse' : ''}
                    style={{
                      width: '100%',
                      background: p.highlight ? '#d4891a' : 'transparent',
                      color: p.highlight ? '#04080e' : '#f4f0e8',
                      border: p.highlight ? 'none' : '1.5px solid rgba(244,240,232,0.3)',
                      borderRadius: 12,
                      padding: '16px',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      transition: 'background 0.2s, transform 0.15s, border-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (p.highlight) { e.currentTarget.style.background = '#f0b040'; }
                      else { e.currentTarget.style.borderColor = '#d4891a'; e.currentTarget.style.color = '#d4891a'; }
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }}
                    onMouseLeave={(e) => {
                      if (p.highlight) { e.currentTarget.style.background = '#d4891a'; }
                      else { e.currentTarget.style.borderColor = 'rgba(244,240,232,0.3)'; e.currentTarget.style.color = '#f4f0e8'; }
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    Comprar {p.weight}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            COMPARISON TABLE
        ════════════════════════════════════════════ */}
        <section style={{ background: '#04080e', padding: '80px 24px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div
              id="comp-head"
              data-reveal
              className={`reveal${isVisible('comp-head') ? ' visible' : ''}`}
              style={{ textAlign: 'center', marginBottom: 48 }}
            >
              <p style={{ fontFamily: 'var(--body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.24em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 12 }}>
                Comparativo
              </p>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 700, color: '#f4f0e8' }}>
                Por que SAL VITA PREMIUM?
              </h2>
            </div>

            <div
              id="comp-table"
              data-reveal
              className={`reveal${isVisible('comp-table') ? ' visible' : ''}`}
              style={{ overflowX: 'auto' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'rgba(244,240,232,0.5)', fontWeight: 500, fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>Característica</th>
                    {['SAL VITA PREMIUM', 'Smart', 'BR Spices'].map((brand, bi) => (
                      <th key={brand} style={{
                        padding: '12px 16px',
                        textAlign: 'center',
                        fontFamily: bi === 0 ? 'var(--display)' : 'var(--body)',
                        fontWeight: bi === 0 ? 700 : 500,
                        fontSize: bi === 0 ? '1rem' : '0.85rem',
                        color: bi === 0 ? '#d4891a' : 'rgba(244,240,232,0.5)',
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                      }}>
                        {brand}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Preço 1kg', 'R$ 29,90', 'R$ 17–28', 'R$ 13–28'],
                    ['Zip lock premium', '✓', '✗', '✗'],
                    ['Janela de visualização', '✓', '✗', '✗'],
                    ['Não empedra', '✓', '✗', 'parcial'],
                    ['Origem Mossoró', '✓', '✗', '✗'],
                    ['Com iodo', '✓', '✓', '✓'],
                    ['Embalagem 1kg', '✓', '✓', '✓'],
                  ].map(([feat, vita, smart, brs], ri) => (
                    <tr key={feat} className={ri % 2 === 0 ? 'comp-row-vita' : ''}>
                      <td style={{ padding: '13px 16px', color: 'rgba(244,240,232,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{feat}</td>
                      {[vita, smart, brs].map((val, ci) => (
                        <td key={ci} style={{ padding: '13px 16px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)', color: val === '✓' ? '#4ade80' : val === '✗' ? 'rgba(255,255,255,0.2)' : 'rgba(244,240,232,0.8)', fontWeight: ci === 0 && val !== '✓' && val !== '✗' ? 600 : 400 }}>
                          {val}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            CTA SECTION
        ════════════════════════════════════════════ */}
        <section
          id="contato"
          className="cta-wave-bg"
          style={{ padding: '100px 24px' }}
        >
          <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
            <div
              id="cta-content"
              data-reveal
              className={`reveal${isVisible('cta-content') ? ' visible' : ''}`}
            >
              <p style={{ fontFamily: 'var(--body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.24em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 12 }}>
                Pronto para pedir?
              </p>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(2.2rem, 6vw, 4rem)', fontWeight: 700, color: '#f4f0e8', marginBottom: 16, lineHeight: 1.15 }}>
                Escolha, calcule o frete
                <br />
                <em style={{ color: '#d4891a', fontStyle: 'italic' }}>e compre hoje.</em>
              </h2>
              <p style={{ color: 'rgba(244,240,232,0.55)', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: 40 }}>
                Enviamos por Correios via Melhor Envio com rastreamento completo. Calcule o frete para o seu CEP antes de finalizar.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleBuy(p)}
                    className={p.highlight ? 'btn-gold-pulse' : ''}
                    style={{
                      background: p.highlight ? '#d4891a' : 'rgba(255,255,255,0.06)',
                      color: p.highlight ? '#04080e' : '#f4f0e8',
                      border: p.highlight ? 'none' : '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 12,
                      padding: '18px 36px',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'transform 0.2s, background 0.2s',
                      letterSpacing: '0.06em',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    {p.weight === '1kg' ? `1kg — R$ ${p.price.toFixed(2).replace('.', ',')}` : `Caixa 10kg — R$ ${p.price.toFixed(2).replace('.', ',')}`}
                  </button>
                ))}
              </div>

              <p style={{ marginTop: 24, fontSize: '0.8rem', color: 'rgba(244,240,232,0.35)', letterSpacing: '0.06em' }}>
                🔒 Compra segura · Rastreamento incluso · Nota fiscal emitida
              </p>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FAQ
        ════════════════════════════════════════════ */}
        <section style={{ background: '#0a1628', padding: '100px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div
              id="faq-head"
              data-reveal
              className={`reveal${isVisible('faq-head') ? ' visible' : ''}`}
              style={{ textAlign: 'center', marginBottom: 56 }}
            >
              <p style={{ fontFamily: 'var(--body)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.24em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 12 }}>
                Tire suas dúvidas
              </p>
              <h2 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 700, color: '#f4f0e8' }}>
                Perguntas Frequentes
              </h2>
            </div>

            <div
              id="faq-list"
              data-reveal
              className={`reveal${isVisible('faq-list') ? ' visible' : ''}`}
            >
              {FAQS.map((faq, i) => (
                <div key={i} className="faq-item">
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      padding: '22px 0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      gap: 16,
                    }}
                  >
                    <span style={{ fontFamily: 'var(--display)', fontSize: '1.15rem', fontWeight: 600, color: '#f4f0e8', textAlign: 'left' }}>{faq.q}</span>
                    <span style={{
                      color: '#d4891a',
                      fontSize: '1.2rem',
                      flexShrink: 0,
                      transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0)',
                      transition: 'transform 0.3s ease',
                      display: 'inline-block',
                    }}>+</span>
                  </button>
                  <div className={`faq-answer ${openFaq === i ? 'open' : 'closed'}`}>
                    <p style={{ padding: '0 0 24px', color: 'rgba(244,240,232,0.6)', lineHeight: 1.75, fontSize: '0.95rem' }}>{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════
            FOOTER
        ════════════════════════════════════════════ */}
        <footer style={{ background: '#04080e', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '56px 24px 32px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 40, marginBottom: 48 }}>
              <div>
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontFamily: 'var(--display)', fontSize: '1.5rem', fontWeight: 700, color: '#f4f0e8' }}>SAL VITA</span>
                  <span style={{ fontFamily: 'var(--body)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.2em', color: '#d4891a', marginLeft: 6 }}>PREMIUM</span>
                </div>
                <p style={{ color: 'rgba(244,240,232,0.4)', fontSize: '0.85rem', lineHeight: 1.7 }}>
                  Sal marinho integral direto das salinas de Mossoró, Rio Grande do Norte.
                  Com zip lock, janela de visualização e iodo.
                </p>
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.2em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 16 }}>Produto</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {['SAL VITA 1kg — R$ 29,90', 'Caixa 10kg — R$ 149,90', 'Frete grátis acima R$ 150'].map((item) => (
                    <li key={item} style={{ color: 'rgba(244,240,232,0.45)', fontSize: '0.85rem', marginBottom: 8 }}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.2em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 16 }}>Canais de Venda</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {[
                    { label: '💬 WhatsApp', href: `https://wa.me/${WA_NUMBER}` },
                    { label: '🛒 Mercado Livre', href: '#' },
                    { label: '🛍️ Shopee', href: '#' },
                    { label: '📦 Amazon', href: '#' },
                  ].map((link) => (
                    <li key={link.label} style={{ marginBottom: 8 }}>
                      <a href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(244,240,232,0.45)', fontSize: '0.85rem', textDecoration: 'none', transition: 'color 0.2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#d4891a')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(244,240,232,0.45)')}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{ fontFamily: 'var(--body)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.2em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 16 }}>Fale Conosco</h4>
                <a
                  href={`https://wa.me/${WA_NUMBER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    background: '#128C7E',
                    color: '#fff',
                    padding: '12px 20px',
                    borderRadius: 10,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Falar no WhatsApp
                </a>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
              <p style={{ color: 'rgba(244,240,232,0.25)', fontSize: '0.78rem' }}>
                © 2025 SAL VITA PREMIUM · Mossoró, Rio Grande do Norte · CNPJ: XX.XXX.XXX/XXXX-XX
              </p>
              <p style={{ color: 'rgba(244,240,232,0.25)', fontSize: '0.78rem' }}>
                Produto registrado MAPA · Aditivos aprovados ANVISA
              </p>
            </div>
          </div>
        </footer>
      </div>

      {/* ════════════════════════════════════════════
          SHIPPING MODAL
      ════════════════════════════════════════════ */}
      {showModal && selectedProduct && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal-box">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.2em', color: '#d4891a', textTransform: 'uppercase', marginBottom: 4 }}>
                  Calcule o Frete
                </p>
                <h3 style={{ fontFamily: 'var(--display)', fontSize: '1.6rem', fontWeight: 700, color: '#f4f0e8' }}>
                  {selectedProduct.name}
                </h3>
                <p style={{ color: 'rgba(244,240,232,0.5)', fontSize: '0.85rem' }}>{selectedProduct.weight}</p>
              </div>
              <button
                onClick={closeModal}
                style={{ background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, width: 36, height: 36, color: 'rgba(244,240,232,0.6)', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                ×
              </button>
            </div>

            {/* Product summary */}
            <div style={{
              background: 'rgba(212,137,26,0.08)',
              border: '1px solid rgba(212,137,26,0.2)',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 24,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'rgba(244,240,232,0.5)', marginBottom: 2 }}>Subtotal do produto</p>
                <p style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', fontWeight: 700, color: '#d4891a' }}>
                  R$ {selectedProduct.price.toFixed(2).replace('.', ',')}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.75rem', color: 'rgba(244,240,232,0.4)' }}>Peso aprox.</p>
                <p style={{ fontSize: '0.95rem', color: 'rgba(244,240,232,0.7)', fontWeight: 500 }}>{selectedProduct.weightKg}kg</p>
              </div>
            </div>

            {/* CEP Input */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(244,240,232,0.6)', textTransform: 'uppercase', marginBottom: 8 }}>
                Seu CEP de entrega
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  value={cep}
                  onChange={(e) => {
                    const v = formatCep(e.target.value);
                    setCep(v);
                    setCepError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && lookupCep()}
                  placeholder="00000-000"
                  maxLength={8}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.06)',
                    border: cepError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10,
                    padding: '13px 16px',
                    color: '#f4f0e8',
                    fontSize: '1rem',
                    fontFamily: 'var(--body)',
                    letterSpacing: '0.08em',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#d4891a'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = cepError ? '#ef4444' : 'rgba(255,255,255,0.12)'; }}
                />
                <button
                  onClick={lookupCep}
                  disabled={loadingCep}
                  style={{
                    background: '#d4891a',
                    color: '#04080e',
                    border: 'none',
                    borderRadius: 10,
                    padding: '13px 20px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: loadingCep ? 'not-allowed' : 'pointer',
                    opacity: loadingCep ? 0.7 : 1,
                    transition: 'background 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {loadingCep ? '⟳' : 'Calcular'}
                </button>
              </div>
              {cepError && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: 6 }}>{cepError}</p>}
              <a
                href="https://buscacepinter.correios.com.br/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.75rem', color: 'rgba(244,240,232,0.35)', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}
              >
                Não sei meu CEP →
              </a>
            </div>

            {/* CEP result + shipping options */}
            {cepData && (
              <div>
                {/* Address */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'rgba(74,222,128,0.08)', borderRadius: 8, border: '1px solid rgba(74,222,128,0.2)' }}>
                  <span style={{ color: '#4ade80', fontSize: '0.9rem' }}>✓</span>
                  <p style={{ fontSize: '0.85rem', color: 'rgba(244,240,232,0.7)' }}>
                    {cepData.localidade} — {cepData.uf}
                    {cepData.bairro ? ` · ${cepData.bairro}` : ''}
                  </p>
                </div>

                {/* Shipping options */}
                <p style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(244,240,232,0.4)', textTransform: 'uppercase', marginBottom: 10 }}>
                  Opções de frete (estimativa via Correios):
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  {shipping.map((opt) => (
                    <div
                      key={opt.service}
                      className={`ship-option${selectedShipping?.service === opt.service ? ' selected' : ''}`}
                      onClick={() => setSelectedShipping(opt)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: '1.4rem' }}>{opt.icon}</span>
                          <div>
                            <p style={{ fontWeight: 700, color: '#f4f0e8', fontSize: '0.95rem' }}>{opt.service}</p>
                            <p style={{ fontSize: '0.78rem', color: 'rgba(244,240,232,0.45)' }}>{opt.description} · {opt.days}</p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontFamily: 'var(--display)', fontSize: '1.3rem', fontWeight: 700, color: opt.service === 'PAC' ? '#f4f0e8' : '#d4891a' }}>
                            R$ {opt.price.toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Total */}
                {selectedShipping && (
                  <div style={{
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: 12,
                    padding: '16px 20px',
                    marginBottom: 20,
                    borderTop: '2px solid #d4891a',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(244,240,232,0.5)' }}>Produto</span>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(244,240,232,0.7)' }}>R$ {selectedProduct.price.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(244,240,232,0.5)' }}>Frete ({selectedShipping.service})</span>
                      <span style={{ fontSize: '0.85rem', color: 'rgba(244,240,232,0.7)' }}>R$ {selectedShipping.price.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ fontWeight: 700, color: '#f4f0e8' }}>Total estimado</span>
                      <span style={{ fontFamily: 'var(--display)', fontSize: '1.4rem', fontWeight: 700, color: '#d4891a' }}>
                        R$ {(selectedProduct.price + selectedShipping.price).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Buy buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <a
                href={buildWaLink(selectedProduct, selectedShipping ?? undefined)}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  background: '#128C7E',
                  color: '#fff',
                  borderRadius: 12,
                  padding: '16px',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                  letterSpacing: '0.04em',
                  transition: 'transform 0.2s, background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#25D366'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#128C7E'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Finalizar via WhatsApp
              </a>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <a
                  href="#"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,230,0,0.12)', border: '1px solid rgba(255,230,0,0.2)', color: '#ffe600', borderRadius: 10, padding: '12px', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', textAlign: 'center', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,230,0,0.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,230,0,0.12)')}
                >
                  🛒 Mercado Livre
                </a>
                <a
                  href="#"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(238,77,45,0.12)', border: '1px solid rgba(238,77,45,0.2)', color: '#ee4d2d', borderRadius: 10, padding: '12px', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', textAlign: 'center', transition: 'background 0.2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(238,77,45,0.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(238,77,45,0.12)')}
                >
                  🛍️ Shopee
                </a>
              </div>
            </div>

            <p style={{ marginTop: 16, fontSize: '0.72rem', color: 'rgba(244,240,232,0.25)', textAlign: 'center', lineHeight: 1.5 }}>
              * Frete estimado via Correios. Valor final calculado na plataforma de venda. Enviamos via Melhor Envio com rastreamento.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
