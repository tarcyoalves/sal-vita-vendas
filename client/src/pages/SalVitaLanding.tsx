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

/* ─── Shipping estimates by state ───────────────────────── */
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
    { service: 'PAC', price: parseFloat((r.pac[0] * factor).toFixed(2)), days: r.pac[1], icon: '📦', description: 'Econômico' },
    { service: 'SEDEX', price: parseFloat((r.sedex[0] * factor).toFixed(2)), days: r.sedex[1], icon: '⚡', description: 'Expresso' },
  ];
}

/* ─── Particles ─────────────────────────────────────────── */
const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left: `${((i * 41 + 7) % 97) + 1}%`,
  size: 2 + (i % 3),
  duration: `${8 + (i % 9)}s`,
  delay: `${-((i * 1.7) % 11)}s`,
  opacity: 0.10 + (i % 5) * 0.06,
}));

/* ─── FAQ ───────────────────────────────────────────────── */
const FAQS = [
  {
    q: 'O que é sal marinho não refinado?',
    a: 'O sal não refinado passa por processamento mínimo — é apenas lavado e seco ao sol natural, sem adicionar ou retirar nada. Isso preserva os +80 minerais naturais presentes na água do mar (magnésio, cálcio, potássio, ferro, iodo e outros), que conferem sabor mais rico e complexo comparado ao sal refinado comum.',
  },
  {
    q: 'Por que tem mais sabor em menos pitadas?',
    a: 'A presença dos minerais naturais amplifica a percepção de sabor nos alimentos. Com o sal refinado comum você perde toda essa riqueza mineral. Com o SAL VITA PREMIUM Não Refinado, uma pitada menor já entrega mais sabor — o que também significa consumo mais consciente.',
  },
  {
    q: 'O ferrocianeto de sódio é seguro?',
    a: 'Sim. É um aditivo alimentar aprovado pela ANVISA (INS 535) e regulamentado internacionalmente, usado em quantidades mínimas (< 10 mg/kg) exclusivamente para evitar empedramento. Está presente na maioria dos sais de mesa ao redor do mundo e é considerado seguro para consumo humano.',
  },
  {
    q: 'Por que o sal de Mossoró é diferente?',
    a: 'Mossoró (RN) é o maior produtor de sal marinho do Brasil, responsável por mais de 95% da produção nacional. As condições únicas — sol intenso, ventos constantes do sertão e baixíssima umidade — produzem um sal de altíssima pureza, colhido diretamente do oceano Atlântico.',
  },
  {
    q: 'O zip lock realmente funciona?',
    a: 'Sim. A embalagem SAL VITA PREMIUM usa zip lock de alta espessura com junta dupla de vedação. A janela transparente circular permite ver o sal a qualquer momento, sem abrir a embalagem.',
  },
  {
    q: 'Frete grátis?',
    a: 'Pedidos acima de R$ 150,00 têm frete grátis para todo o Brasil. Enviamos por Correios via Melhor Envio com rastreamento completo. Para a caixa de 10kg (R$ 149,90), o frete grátis se aplica na compra de 2 caixas ou mais.',
  },
];

/* ─── Food use cases ────────────────────────────────────── */
const FOOD_USES = [
  { emoji: '🥩', label: 'Carnes e Aves', desc: 'Realça o sabor natural das proteínas' },
  { emoji: '🐟', label: 'Peixes e Frutos do Mar', desc: 'Toque perfeito sem mascarar o sabor' },
  { emoji: '🥗', label: 'Saladas e Legumes', desc: 'Tempero leve que valoriza o frescor' },
  { emoji: '🍝', label: 'Massas e Risotos', desc: 'Na água do cozimento ou finalização' },
  { emoji: '🍲', label: 'Sopas e Caldos', desc: 'Profundidade de sabor com menos sal' },
  { emoji: '🍞', label: 'Pães e Panificação', desc: 'Ativa o glúten, melhora a crosta' },
];

/* ─── Image assets (hosted on salvitarn.com.br) ─────────── */
const IMG = {
  produto:      'http://salvitarn.com.br/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-04-at-09.02.12.jpeg',
  salina:       'http://salvitarn.com.br/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-24-at-16.42.07.jpeg',
  cristalizador:'http://salvitarn.com.br/wp-content/uploads/2025/12/cristalizador-de-sal-scaled.jpg',
  morrosSal:    'http://salvitarn.com.br/wp-content/uploads/2025/10/missao01.webp',
};

/* ─── WhatsApp ──────────────────────────────────────────── */
const WA_NUMBER = '5584999999999'; // ← substitua pelo número real

function buildWaLink(product: Product, shipping?: ShippingOption): string {
  const msg = shipping
    ? `Olá! Quero comprar ${product.name} ${product.weight} por R$ ${product.price.toFixed(2)}. Frete ${shipping.service}: R$ ${shipping.price.toFixed(2)} (${shipping.days}). Total: R$ ${(product.price + shipping.price).toFixed(2)}.`
    : `Olá! Quero comprar ${product.name} ${product.weight} por R$ ${product.price.toFixed(2)}.`;
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
}

/* ══════════════════════════════════════════════════════════
   COMPONENT
══════════════════════════════════════════════════════════ */
export default function SalVitaLanding() {
  const [scrolled, setScrolled]                   = useState(false);
  const [showModal, setShowModal]                 = useState(false);
  const [selectedProduct, setSelectedProduct]     = useState<Product | null>(null);
  const [cep, setCep]                             = useState('');
  const [cepData, setCepData]                     = useState<CepData | null>(null);
  const [shipping, setShipping]                   = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping]   = useState<ShippingOption | null>(null);
  const [loadingCep, setLoadingCep]               = useState(false);
  const [cepError, setCepError]                   = useState('');
  const [openFaq, setOpenFaq]                     = useState<number | null>(null);
  const [visibleSections, setVisibleSections]     = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) setVisibleSections((p) => new Set([...p, e.target.id]));
      }),
      { threshold: 0.08 },
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const vis = (id: string) => visibleSections.has(id);

  const handleBuy = useCallback((product: Product) => {
    setSelectedProduct(product);
    setShowModal(true);
    setCep(''); setCepData(null); setShipping([]); setSelectedShipping(null); setCepError('');
    document.body.style.overflow = 'hidden';
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    document.body.style.overflow = '';
  }, []);

  const lookupCep = async () => {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) { setCepError('Digite um CEP válido com 8 dígitos.'); return; }
    setLoadingCep(true); setCepError(''); setCepData(null); setShipping([]); setSelectedShipping(null);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) { setCepError('CEP não encontrado. Verifique e tente novamente.'); setLoadingCep(false); return; }
      setCepData(data);
      const opts = calcShipping(data.uf, selectedProduct!.weightKg);
      setShipping(opts);
      setSelectedShipping(opts[0]);
    } catch { setCepError('Erro de conexão. Tente novamente.'); }
    setLoadingCep(false);
  };

  const products: Product[] = [
    {
      id: '1kg', name: 'SAL VITA PREMIUM', subtitle: 'Embalagem zip lock com janela',
      weight: '1kg', weightKg: 1.2, price: 29.90, pricePerKg: 29.90,
      tag: 'Mais Vendido', tagColor: '#d4891a', highlight: false,
    },
    {
      id: 'caixa', name: 'CAIXA SAL VITA PREMIUM', subtitle: '10 embalagens zip lock de 1kg',
      weight: '10kg (10 × 1kg)', weightKg: 12, price: 149.90, pricePerKg: 14.99,
      tag: 'Melhor Custo-Benefício', tagColor: '#0d6e6e', savings: 'Economize R$ 149,10', highlight: true,
    },
  ];

  /* ── Styles ── */
  return (
    <>
      <style>{`
        .vita {
          --abyss:  #04080e;
          --deep:   #060f20;
          --navy:   #0a1628;
          --brand:  #1a3a7a;
          --ocean:  #0d2540;
          --teal:   #0d5050;
          --gold:   #c8a040;
          --goldlt: #e8c060;
          --salt:   #f4f0e8;
          --cream:  #ddd8cc;
          --sand:   #b8a888;
          --muted:  #6e6258;
          font-family: 'Outfit', 'Barlow Condensed', sans-serif;
          color: var(--salt);
          background: var(--abyss);
        }

        /* particles */
        @keyframes floatUp {
          0%   { transform: translateY(100vh) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 0.6; }
          100% { transform: translateY(-40px) rotate(360deg); opacity: 0; }
        }
        .vita-particle { position:absolute; bottom:0; border-radius:2px; background:#fff; animation:floatUp linear infinite; pointer-events:none; }

        /* marquee */
        @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        .vita-marquee { animation: marquee 30s linear infinite; display:flex; width:max-content; }
        .vita-marquee:hover { animation-play-state:paused; }

        /* shimmer on gold text */
        @keyframes shimmer {
          from { background-position: -200% 0; }
          to   { background-position:  200% 0; }
        }
        .shimmer-gold {
          background: linear-gradient(90deg,#c8a040 0%,#e8c060 35%,#c8a040 50%,#f0d080 70%,#c8a040 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text; animation: shimmer 4s linear infinite;
        }

        /* pulse on primary CTA */
        @keyframes goldPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(200,160,64,.45); }
          50%      { box-shadow: 0 0 0 18px rgba(200,160,64,0); }
        }
        .pulse { animation: goldPulse 2.6s ease-in-out infinite; }

        /* product float */
        @keyframes floatProduct {
          0%,100% { transform: translateY(0px) rotate(-1deg); }
          50%      { transform: translateY(-14px) rotate(1deg); }
        }
        .product-float { animation: floatProduct 5s ease-in-out infinite; }

        /* reveal on scroll */
        .reveal { opacity:0; transform:translateY(28px); transition: opacity .65s ease, transform .65s ease; }
        .reveal.visible { opacity:1; transform:translateY(0); }
        .reveal-d1 { transition-delay:.1s; } .reveal-d2 { transition-delay:.2s; }
        .reveal-d3 { transition-delay:.32s; } .reveal-d4 { transition-delay:.46s; }

        /* glass card */
        .glass { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); backdrop-filter:blur(8px); transition: transform .3s, border-color .3s, background .3s; border-radius:16px; }
        .glass:hover { transform:translateY(-5px); border-color:rgba(200,160,64,.35); background:rgba(255,255,255,.07); }

        /* price cards */
        .card-highlight { background:linear-gradient(135deg,rgba(13,80,80,.38) 0%,rgba(6,15,32,.96) 100%); border:1px solid rgba(13,80,80,.65); box-shadow:0 0 48px rgba(13,80,80,.25),inset 0 1px 0 rgba(255,255,255,.06); }
        .card-standard  { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); }

        /* wave divider */
        .wave { line-height:0; } .wave svg { display:block; }

        /* food circle */
        .food-circle { width:140px; height:140px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:3.2rem; flex-shrink:0; }

        /* ship option */
        .ship-opt { border:2px solid rgba(255,255,255,.08); border-radius:12px; padding:16px; cursor:pointer; transition: border-color .2s, background .2s; }
        .ship-opt:hover { border-color:rgba(200,160,64,.4); }
        .ship-opt.sel  { border-color:#c8a040; background:rgba(200,160,64,.09); }

        /* modal */
        .modal-overlay { position:fixed; inset:0; z-index:9999; background:rgba(4,8,14,.93); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:16px; }
        .modal-box { background:#0a1628; border:1px solid rgba(255,255,255,.1); border-radius:20px; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; padding:32px; box-shadow:0 32px 80px rgba(0,0,0,.8); }

        /* faq */
        .faq-item { border-bottom:1px solid rgba(255,255,255,.07); }
        .faq-ans { overflow:hidden; transition: max-height .4s ease, opacity .3s ease; }
        .faq-ans.open { max-height:320px; opacity:1; } .faq-ans.closed { max-height:0; opacity:0; }

        /* wa floating */
        .wa-float { position:fixed; bottom:28px; right:28px; z-index:9000; width:58px; height:58px; border-radius:50%; background:#25D366; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 24px rgba(37,211,102,.45); cursor:pointer; transition: transform .2s, box-shadow .2s; text-decoration:none; }
        .wa-float:hover { transform:scale(1.12); box-shadow:0 6px 32px rgba(37,211,102,.6); }

        /* section label */
        .section-label { font-size:.72rem; font-weight:600; letter-spacing:.26em; color:#c8a040; text-transform:uppercase; margin-bottom:12px; }

        @media(max-width:768px) {
          .hero-title { font-size: clamp(3rem, 14vw, 6rem) !important; }
          .modal-box { padding:20px; }
          .nav-links { display:none; }
        }
      `}</style>

      <div className="vita" style={{ position: 'relative' }}>

        {/* ═══════ NAV ═══════ */}
        <nav style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          transition: 'background .4s, border-color .4s, padding .3s',
          background: scrolled ? 'rgba(4,8,14,.96)' : 'transparent',
          borderBottom: scrolled ? '1px solid rgba(255,255,255,.07)' : '1px solid transparent',
          backdropFilter: scrolled ? 'blur(14px)' : 'none',
          padding: scrolled ? '12px 0' : '22px 0',
        }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={IMG.produto} alt="Sal Vita Premium" style={{ height: 36, width: 36, objectFit: 'contain', borderRadius: 4 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              <div>
                <span style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: '1.4rem', fontWeight: 700, letterSpacing: '.06em', color: '#f4f0e8' }}>SAL VITA</span>
                <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: '.6rem', fontWeight: 600, letterSpacing: '.22em', color: '#c8a040', marginLeft: 5, verticalAlign: 'top', marginTop: 5, display: 'inline-block' }}>PREMIUM</span>
              </div>
            </div>
            {/* Links */}
            <div style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
              <div className="nav-links" style={{ display: 'flex', gap: 24 }}>
                {['Produto', 'Benefícios', 'Preço', 'Como Usar'].map((item) => (
                  <a key={item} href={`#${item.toLowerCase().replace('í','i').replace('ç','c')}`}
                    style={{ color: 'rgba(244,240,232,.6)', fontSize: '.8rem', fontWeight: 500, letterSpacing: '.1em', textDecoration: 'none', textTransform: 'uppercase', transition: 'color .2s' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#c8a040')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(244,240,232,.6)')}
                  >{item}</a>
                ))}
              </div>
              <button onClick={() => handleBuy(products[0])} style={{ background: '#c8a040', color: '#04080e', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: '.78rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background .2s, transform .15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e8c060'; e.currentTarget.style.transform = 'scale(1.03)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#c8a040'; e.currentTarget.style.transform = 'scale(1)'; }}>
                Comprar Agora
              </button>
            </div>
          </div>
        </nav>

        {/* ═══════ HERO ═══════ */}
        <section id="hero" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden', background: 'linear-gradient(135deg, #04080e 0%, #060f20 50%, #0a1a30 100%)' }}>
          {/* Particles */}
          {PARTICLES.map((p) => (
            <span key={p.id} className="vita-particle" style={{ left: p.left, width: p.size, height: p.size, opacity: p.opacity, animationDuration: p.duration, animationDelay: p.delay }} />
          ))}
          {/* Radial glow */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 60% 50%, rgba(26,58,122,.18) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 80%, rgba(13,80,80,.12) 0%, transparent 55%)', pointerEvents: 'none' }} />

          <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '120px 24px 80px', width: '100%' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 64, alignItems: 'center' }}>
              {/* Left: copy */}
              <div>
                {/* Eyebrow */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
                  <span style={{ width: 28, height: 1, background: '#c8a040' }} />
                  <span style={{ fontSize: '.7rem', fontWeight: 600, letterSpacing: '.26em', color: '#c8a040', textTransform: 'uppercase' }}>Salinas de Mossoró · RN · Brasil</span>
                  <span style={{ width: 28, height: 1, background: '#c8a040' }} />
                </div>

                <h1 className="hero-title" style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 'clamp(3.5rem, 9vw, 7rem)', fontWeight: 700, lineHeight: 1.0, color: '#f4f0e8', marginBottom: 6 }}>
                  SAL VITA
                </h1>
                <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 'clamp(1.2rem, 3.5vw, 2.4rem)', fontWeight: 300, fontStyle: 'italic', letterSpacing: '.2em', color: '#c8a040', margin: '0 0 22px' }}>
                  PREMIUM
                </h2>
                <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 400, fontStyle: 'italic', color: 'rgba(244,240,232,.85)', lineHeight: 1.35, marginBottom: 32 }}>
                  "Muito mais sabor,<br />em cada pitada."
                </p>

                {/* Badges */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 40 }}>
                  {[
                    { icon: '⭐', text: '+80 Minerais Naturais' },
                    { icon: '🌿', text: 'Não Refinado' },
                    { icon: '🌊', text: '100% Mossoró' },
                    { icon: '🔒', text: 'Zip Lock' },
                    { icon: '🪟', text: 'Janela Transparente' },
                  ].map((b) => (
                    <span key={b.text} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 999, padding: '7px 16px', fontSize: '.8rem', fontWeight: 500, color: 'rgba(244,240,232,.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {b.icon} {b.text}
                    </span>
                  ))}
                </div>

                {/* CTAs */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                  <button className="pulse" onClick={() => handleBuy(products[0])} style={{ background: '#c8a040', color: '#04080e', border: 'none', borderRadius: 12, padding: '17px 38px', fontSize: '.98rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background .2s, transform .2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#e8c060'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#c8a040'; e.currentTarget.style.transform = 'scale(1)'; }}>
                    Comprar 1kg — R$ 29,90
                  </button>
                  <button onClick={() => handleBuy(products[1])} style={{ background: 'transparent', color: '#f4f0e8', border: '1.5px solid rgba(244,240,232,.28)', borderRadius: 12, padding: '17px 38px', fontSize: '.98rem', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer', transition: 'border-color .2s, color .2s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#c8a040'; e.currentTarget.style.color = '#c8a040'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(244,240,232,.28)'; e.currentTarget.style.color = '#f4f0e8'; }}>
                    Caixa 10kg — R$ 149,90
                  </button>
                </div>
              </div>

              {/* Right: product image */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                <div className="product-float" style={{ position: 'relative' }}>
                  <img
                    src={IMG.produto}
                    alt="SAL VITA PREMIUM — Sal Integral de Mossoró 1kg"
                    style={{ width: '100%', maxWidth: 360, height: 'auto', filter: 'drop-shadow(0 30px 60px rgba(0,0,0,.7)) drop-shadow(0 0 40px rgba(26,58,122,.4))' }}
                    onError={(e) => {
                      // fallback: show styled mockup if image missing
                      const el = e.currentTarget;
                      el.style.display = 'none';
                      const fb = el.nextElementSibling as HTMLElement;
                      if (fb) fb.style.display = 'flex';
                    }}
                  />
                  {/* Fallback mockup (hidden when real image loads) */}
                  <div style={{ display: 'none', width: 300, height: 380, background: 'linear-gradient(160deg,#1a3a7a 0%,#0d2050 100%)', borderRadius: 20, border: '1px solid rgba(255,255,255,.15)', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, boxShadow: '0 40px 80px rgba(0,0,0,.5)', position: 'relative' }}>
                    <div style={{ width: '75%', height: 10, background: 'linear-gradient(90deg,#1a3a7a,#c8a040,#1a3a7a)', borderRadius: 4, marginBottom: 4 }} />
                    <div style={{ width: '75%', height: 10, background: 'linear-gradient(90deg,#c8a040,#1a3a7a,#c8a040)', borderRadius: 4, marginBottom: 16 }} />
                    <div style={{ width: '65%', height: 110, background: 'radial-gradient(ellipse,rgba(255,255,255,.22) 0%,rgba(255,255,255,.06) 100%)', borderRadius: '50%', border: '2px solid rgba(200,160,64,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <span style={{ fontSize: '2.5rem' }}>🧂</span>
                    </div>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.5rem', fontWeight: 700, color: '#f4f0e8', textAlign: 'center' }}>SAL VITA</div>
                    <div style={{ fontFamily: 'Outfit,sans-serif', fontSize: '.6rem', fontWeight: 600, letterSpacing: '.2em', color: '#c8a040' }}>PREMIUM</div>
                    <div style={{ fontSize: '.75rem', color: 'rgba(244,240,232,.5)', marginTop: 2 }}>Sal Integral de Mossoró · 1kg</div>
                    <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(200,160,64,.15)', border: '1px solid rgba(200,160,64,.4)', borderRadius: 8, padding: '6px 12px', fontSize: '.7rem', fontWeight: 700, color: '#c8a040' }}>+80 Minerais</div>
                  </div>
                </div>
                {/* Ground glow */}
                <div style={{ position: 'absolute', bottom: -30, left: '50%', transform: 'translateX(-50%)', width: 220, height: 50, background: 'rgba(26,58,122,.25)', borderRadius: '50%', filter: 'blur(24px)', zIndex: -1 }} />
              </div>
            </div>
          </div>

          {/* Wave bottom */}
          <div className="wave" style={{ position: 'absolute', bottom: -2, left: 0, right: 0 }}>
            <svg viewBox="0 0 1440 72" preserveAspectRatio="none" style={{ width: '100%', height: 72 }}>
              <path d="M0,36 C360,72 720,0 1080,36 C1260,54 1380,18 1440,36 L1440,72 L0,72 Z" fill="#0a1628" />
            </svg>
          </div>
        </section>

        {/* ═══════ MARQUEE ═══════ */}
        <div style={{ background: '#c8a040', overflow: 'hidden', padding: '13px 0' }}>
          <div className="vita-marquee">
            {[...Array(2)].map((_, rep) => (
              <div key={rep} style={{ display: 'flex', gap: 52, paddingRight: 52 }}>
                {['🌊 100% Salinas de Mossoró', '⭐ +80 Minerais Naturais', '🌿 Sal Não Refinado', '🔒 Zip Lock Dupla Vedação', '🪟 Janela Transparente', '💊 Com Iodo', '🇧🇷 100% Brasileiro', '✨ Premium Quality'].map((item) => (
                  <span key={item} style={{ whiteSpace: 'nowrap', fontSize: '.8rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: '#04080e' }}>{item}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ═══════ SALINA PHOTO SECTION ═══════ */}
        <section style={{ position: 'relative', height: 480, overflow: 'hidden' }}>
          <img
            src={IMG.morrosSal}
            alt="Morros de sal nas salinas de Mossoró, Rio Grande do Norte"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 60%', display: 'block' }}
          />
          {/* Overlay gradients */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #0a1628 0%, rgba(4,8,14,0) 25%, rgba(4,8,14,0) 65%, #0a1628 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(4,8,14,0.55) 0%, transparent 50%, rgba(4,8,14,0.4) 100%)' }} />
          {/* Caption */}
          <div style={{ position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', width: '100%', padding: '0 24px' }}>
            <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 'clamp(1.5rem,4vw,2.8rem)', fontWeight: 300, fontStyle: 'italic', color: '#f4f0e8', textShadow: '0 2px 20px rgba(0,0,0,0.7)', marginBottom: 8 }}>
              Das maiores salinas do Brasil
            </p>
            <p style={{ fontSize: '.8rem', fontWeight: 600, letterSpacing: '.24em', color: '#c8a040', textTransform: 'uppercase', textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
              Mossoró · Rio Grande do Norte
            </p>
          </div>
        </section>

        {/* ═══════ STORY / PRODUTO ═══════ */}
        <section id="produto" style={{ background: '#0a1628', padding: '100px 24px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 64, alignItems: 'center' }}>
              <div id="story-left" data-reveal className={`reveal${vis('story-left') ? ' visible' : ''}`}>
                <p className="section-label">Nossa Origem</p>
                <h2 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 'clamp(2.2rem,5vw,3.8rem)', fontWeight: 700, lineHeight: 1.15, color: '#f4f0e8', marginBottom: 20 }}>
                  Das salinas ao
                  <br /><em style={{ color: '#c8a040', fontStyle: 'italic' }}>seu prato.</em>
                </h2>
                <p style={{ color: 'rgba(244,240,232,.65)', lineHeight: 1.8, fontSize: '1.05rem', marginBottom: 18 }}>
                  Mossoró produz <strong style={{ color: '#f4f0e8' }}>mais de 95% do sal marinho brasileiro</strong>. O sol nordestino, os ventos constantes e a baixíssima umidade criam condições únicas para um sal de pureza excepcional.
                </p>
                <p style={{ color: 'rgba(244,240,232,.65)', lineHeight: 1.8, fontSize: '1.05rem', marginBottom: 32 }}>
                  O SAL VITA PREMIUM é <strong style={{ color: '#f4f0e8' }}>Não Refinado</strong> — preserva seus +80 minerais naturais intactos, entregando muito mais sabor em cada pitada, direto das salinas para a sua mesa.
                </p>
                {/* Stats */}
                <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
                  {[['+80', 'Minerais naturais'], ['95%', 'do sal BR vem do RN'], ['Não', 'Refinado']].map(([num, label]) => (
                    <div key={num}>
                      <div className="shimmer-gold" style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '2.2rem', fontWeight: 700 }}>{num}</div>
                      <div style={{ fontSize: '.75rem', color: 'rgba(244,240,232,.45)', letterSpacing: '.06em', marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right: big mineral badge + product info */}
              <div id="story-right" data-reveal className={`reveal reveal-d2${vis('story-right') ? ' visible' : ''}`} style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ position: 'relative', maxWidth: 420, width: '100%', borderRadius: 20, overflow: 'hidden', boxShadow: '0 32px 72px rgba(0,0,0,.55)' }}>
                  {/* Salina background photo */}
                  <img
                    src={IMG.salina}
                    alt="Salinas de Mossoró — cristalização do sal marinho"
                    style={{ width: '100%', height: 380, objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                  />
                  {/* Overlay with mineral info */}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(4,8,14,.95) 0%, rgba(4,8,14,.5) 50%, rgba(4,8,14,.15) 100%)' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '28px 28px 32px' }}>
                    <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '3.8rem', fontWeight: 700, lineHeight: 1 }}>
                      <span className="shimmer-gold">+80</span>
                    </div>
                    <p style={{ fontSize: '.75rem', fontWeight: 700, letterSpacing: '.2em', color: 'rgba(244,240,232,.65)', textTransform: 'uppercase', marginBottom: 14 }}>Minerais Naturais Preservados</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {['Magnésio', 'Cálcio', 'Potássio', 'Ferro', 'Iodo', 'Zinco', 'Manganês', '+ outros'].map((m) => (
                        <span key={m} style={{ background: 'rgba(200,160,64,.15)', border: '1px solid rgba(200,160,64,.3)', borderRadius: 999, padding: '3px 10px', fontSize: '.72rem', color: 'rgba(244,240,232,.8)' }}>{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* wave */}
        <div className="wave" style={{ background: '#0a1628' }}>
          <svg viewBox="0 0 1440 56" preserveAspectRatio="none" style={{ width: '100%', height: 56, display: 'block' }}>
            <path d="M0,28 C480,56 960,0 1440,28 L1440,56 L0,56 Z" fill="#04080e" />
          </svg>
        </div>

        {/* ═══════ BENEFITS ═══════ */}
        <section id="beneficios" style={{ background: '#04080e', padding: '100px 24px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div id="ben-head" data-reveal className={`reveal${vis('ben-head') ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 60 }}>
              <p className="section-label">Por que escolher</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 700, color: '#f4f0e8' }}>Feito para quem não abre mão de qualidade</h2>
            </div>
            <div id="ben-grid" data-reveal className={`reveal${vis('ben-grid') ? ' visible' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(272px,1fr))', gap: 18 }}>
              {[
                { icon: '⭐', title: '+80 Minerais Naturais', desc: 'Sal Não Refinado que preserva magnésio, cálcio, potássio, ferro, iodo e mais 75 minerais do oceano Atlântico.' },
                { icon: '🌿', title: 'Não Refinado', desc: 'Processamento mínimo — lavado e seco ao sol. Sem adicionar ou retirar nenhum componente natural do mar.' },
                { icon: '🔒', title: 'Zip Lock Premium', desc: 'Fechamento duplo de 100 mícrons. Abre e fecha centenas de vezes sem perder a vedação. Adeus ao sal empedrado.' },
                { icon: '🪟', title: 'Janela Transparente', desc: 'Circular circular na frente da embalagem. Você vê o sal a qualquer momento sem precisar abrir.' },
                { icon: '⚗️', title: 'Não Empedra', desc: 'Ferrocianeto de sódio (INS 535), aprovado ANVISA, mantém o sal fluido mesmo no clima úmido brasileiro.' },
                { icon: '🌊', title: '100% Mossoró RN', desc: 'Das salinas que produzem 95% do sal marinho brasileiro. Apoio direto à economia do Nordeste.' },
              ].map((b, i) => (
                <div key={b.title} className="glass" style={{ padding: '28px 24px', transitionDelay: `${i * 0.06}s` }}>
                  <div style={{ fontSize: '2rem', marginBottom: 14 }}>{b.icon}</div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.3rem', fontWeight: 600, color: '#f4f0e8', marginBottom: 10 }}>{b.title}</h3>
                  <p style={{ color: 'rgba(244,240,232,.55)', lineHeight: 1.7, fontSize: '.88rem' }}>{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ CRISTALIZADOR — FULL BLEED PHOTO ═══════ */}
        <section style={{ position: 'relative', height: 420, overflow: 'hidden' }}>
          <img
            src={IMG.cristalizador}
            alt="Cristalizador de sal nas salinas de Mossoró"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%', display: 'block' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #04080e 0%, rgba(4,8,14,0.1) 20%, rgba(4,8,14,0.1) 70%, #0a1628 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
            <div style={{ textAlign: 'center', maxWidth: 680 }}>
              <p style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 'clamp(1.6rem,4vw,3rem)', fontWeight: 600, fontStyle: 'italic', color: '#f4f0e8', textShadow: '0 2px 24px rgba(0,0,0,0.8)', lineHeight: 1.3, marginBottom: 16 }}>
                "Colhido sob o sol nordestino,<br />cristalizado pelo vento do sertão."
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 40, height: 1, background: '#c8a040' }} />
                <span style={{ fontSize: '.72rem', fontWeight: 600, letterSpacing: '.24em', color: '#c8a040', textTransform: 'uppercase' }}>Processo de Cristalização Natural</span>
                <span style={{ width: 40, height: 1, background: '#c8a040' }} />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ COMO USAR ═══════ */}
        <section id="como-usar" style={{ background: '#0a1628', padding: '100px 24px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div id="use-head" data-reveal className={`reveal${vis('use-head') ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 60 }}>
              <p className="section-label">Use sem moderação</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 700, color: '#f4f0e8', marginBottom: 14 }}>
                O sal que combina com tudo
              </h2>
              <p style={{ color: 'rgba(244,240,232,.5)', fontSize: '1.05rem', maxWidth: 520, margin: '0 auto' }}>
                Com +80 minerais naturais, cada pitada entrega sabor mais rico — seja no preparo ou na finalização.
              </p>
            </div>
            <div id="use-grid" data-reveal className={`reveal${vis('use-grid') ? ' visible' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
              {FOOD_USES.map((f, i) => (
                <div key={f.label} className="glass" style={{ padding: '28px 24px', display: 'flex', gap: 20, alignItems: 'flex-start', transitionDelay: `${i * 0.08}s` }}>
                  <div className="food-circle" style={{ background: 'rgba(200,160,64,.1)', border: '1px solid rgba(200,160,64,.2)', fontSize: '2.8rem', flexShrink: 0, width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {f.emoji}
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.2rem', fontWeight: 600, color: '#f4f0e8', marginBottom: 6 }}>{f.label}</h3>
                    <p style={{ color: 'rgba(244,240,232,.52)', fontSize: '.85rem', lineHeight: 1.6 }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* wave */}
        <div className="wave" style={{ background: '#0a1628' }}>
          <svg viewBox="0 0 1440 56" preserveAspectRatio="none" style={{ width: '100%', height: 56, display: 'block' }}>
            <path d="M0,0 C360,56 1080,0 1440,40 L1440,56 L0,56 Z" fill="#04080e" />
          </svg>
        </div>

        {/* ═══════ PRICING ═══════ */}
        <section id="preco" style={{ background: '#04080e', padding: '100px 24px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div id="price-head" data-reveal className={`reveal${vis('price-head') ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 64 }}>
              <p className="section-label">Escolha seu pack</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(2rem,5vw,3.5rem)', fontWeight: 700, color: '#f4f0e8', marginBottom: 10 }}>
                Preço justo. Qualidade real.
              </h2>
              <p style={{ color: 'rgba(244,240,232,.5)', fontSize: '1.05rem' }}>Frete grátis acima de R$ 150,00 para todo o Brasil</p>
            </div>
            <div id="price-cards" data-reveal className={`reveal${vis('price-cards') ? ' visible' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 24, maxWidth: 820, margin: '0 auto' }}>
              {products.map((p) => (
                <div key={p.id} className={p.highlight ? 'card-highlight' : 'card-standard'} style={{ borderRadius: 24, padding: '36px 32px', position: 'relative', overflow: 'hidden', transition: 'transform .3s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-6px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}>
                  <div style={{ position: 'absolute', top: 0, right: 0, background: p.tagColor, color: p.highlight ? '#f4f0e8' : '#04080e', padding: '6px 18px', borderRadius: '0 24px 0 12px', fontSize: '.7rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    {p.tag}
                  </div>
                  <p style={{ fontSize: '.7rem', fontWeight: 600, letterSpacing: '.2em', color: 'rgba(244,240,232,.4)', textTransform: 'uppercase', marginBottom: 6 }}>{p.subtitle}</p>
                  <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.6rem', fontWeight: 700, color: '#f4f0e8', marginBottom: 4 }}>{p.name}</h3>
                  <p style={{ fontSize: '.84rem', color: 'rgba(244,240,232,.45)', marginBottom: 20 }}>{p.weight}</p>
                  {p.savings && (
                    <div style={{ background: 'rgba(13,80,80,.4)', border: '1px solid rgba(13,80,80,.6)', borderRadius: 8, padding: '7px 14px', fontSize: '.78rem', color: '#4ade80', fontWeight: 600, marginBottom: 16, display: 'inline-block' }}>
                      {p.savings} vs comprar avulso
                    </div>
                  )}
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '3.2rem', fontWeight: 700, color: '#f4f0e8', lineHeight: 1 }}>
                      R$ {p.price.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <p style={{ fontSize: '.78rem', color: 'rgba(244,240,232,.38)', marginBottom: 30 }}>R$ {p.pricePerKg.toFixed(2).replace('.', ',')}/kg</p>
                  <ul style={{ listStyle: 'none', padding: 0, marginBottom: 30 }}>
                    {['Sal Marinho Não Refinado', '+80 Minerais Naturais', 'Zip lock dupla vedação', 'Janela de visualização', 'Não empedra', '100% Mossoró RN'].map((f) => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <span style={{ color: '#c8a040', fontSize: '.9rem' }}>✓</span>
                        <span style={{ fontSize: '.88rem', color: 'rgba(244,240,232,.68)' }}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button className={p.highlight ? 'pulse' : ''} onClick={() => handleBuy(p)} style={{ width: '100%', background: p.highlight ? '#c8a040' : 'transparent', color: p.highlight ? '#04080e' : '#f4f0e8', border: p.highlight ? 'none' : '1.5px solid rgba(244,240,232,.28)', borderRadius: 12, padding: '16px', fontSize: '.93rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background .2s, transform .15s, border-color .2s' }}
                    onMouseEnter={(e) => { if (p.highlight) { e.currentTarget.style.background = '#e8c060'; } else { e.currentTarget.style.borderColor = '#c8a040'; e.currentTarget.style.color = '#c8a040'; } e.currentTarget.style.transform = 'scale(1.02)'; }}
                    onMouseLeave={(e) => { if (p.highlight) { e.currentTarget.style.background = '#c8a040'; } else { e.currentTarget.style.borderColor = 'rgba(244,240,232,.28)'; e.currentTarget.style.color = '#f4f0e8'; } e.currentTarget.style.transform = 'scale(1)'; }}>
                    Comprar {p.weight === '1kg' ? '1kg' : 'Caixa 10kg'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ COMPARISON ═══════ */}
        <section style={{ background: '#0a1628', padding: '80px 24px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div id="comp-head" data-reveal className={`reveal${vis('comp-head') ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 48 }}>
              <p className="section-label">Comparativo</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(1.8rem,4vw,3rem)', fontWeight: 700, color: '#f4f0e8' }}>Por que SAL VITA PREMIUM?</h2>
            </div>
            <div id="comp-table" data-reveal className={`reveal${vis('comp-table') ? ' visible' : ''}`} style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.88rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: 'rgba(244,240,232,.45)', fontWeight: 500, fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,.07)' }}>Característica</th>
                    {['SAL VITA PREMIUM', 'Maranata Origens', 'Smart / BR Spices'].map((brand, bi) => (
                      <th key={brand} style={{ padding: '12px 16px', textAlign: 'center', fontFamily: bi === 0 ? "'Cormorant Garamond',serif" : 'inherit', fontWeight: bi === 0 ? 700 : 500, fontSize: bi === 0 ? '1rem' : '.82rem', color: bi === 0 ? '#c8a040' : 'rgba(244,240,232,.45)', borderBottom: '1px solid rgba(255,255,255,.07)' }}>{brand}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Preço 1kg',              'R$ 29,90',  'R$ 39–55',  'R$ 13–28'],
                    ['Não Refinado',           '✓',         '✓',         '✗'],
                    ['+80 Minerais naturais',  '✓',         '✓',         '✗'],
                    ['Zip lock premium',       '✓',         '✗',         '✗'],
                    ['Janela de visualização', '✓',         '✗',         '✗'],
                    ['Não empedra',            '✓',         '✗',         'parcial'],
                    ['Origem Mossoró',         '✓',         '✓',         '✗'],
                    ['Com iodo',               '✓',         '✓',         '✓'],
                  ].map(([feat, vita, mar, smart], ri) => (
                    <tr key={feat} style={{ background: ri % 2 === 0 ? 'rgba(200,160,64,.05)' : 'transparent' }}>
                      <td style={{ padding: '13px 16px', color: 'rgba(244,240,232,.65)', borderBottom: '1px solid rgba(255,255,255,.04)' }}>{feat}</td>
                      {[vita, mar, smart].map((val, ci) => (
                        <td key={ci} style={{ padding: '13px 16px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,.04)', color: val === '✓' ? '#4ade80' : val === '✗' ? 'rgba(255,255,255,.2)' : 'rgba(244,240,232,.7)', fontWeight: ci === 0 && val !== '✓' && val !== '✗' ? 700 : 400 }}>{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ═══════ CTA ═══════ */}
        <section style={{ background: 'linear-gradient(180deg,#04080e 0%,#060f20 100%)', padding: '100px 24px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 80%,rgba(200,160,64,.07) 0%,transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
            <div id="cta-body" data-reveal className={`reveal${vis('cta-body') ? ' visible' : ''}`}>
              <p className="section-label">Pronto para pedir?</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(2.2rem,6vw,4rem)', fontWeight: 700, color: '#f4f0e8', marginBottom: 14, lineHeight: 1.15 }}>
                Escolha, calcule o frete
                <br /><em style={{ color: '#c8a040', fontStyle: 'italic' }}>e receba em casa.</em>
              </h2>
              <p style={{ color: 'rgba(244,240,232,.5)', fontSize: '1.05rem', lineHeight: 1.7, marginBottom: 40 }}>
                Enviamos por Correios via Melhor Envio com rastreamento completo. Calcule o frete para o seu CEP antes de finalizar a compra.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
                {products.map((p) => (
                  <button key={p.id} onClick={() => handleBuy(p)} className={p.highlight ? 'pulse' : ''} style={{ background: p.highlight ? '#c8a040' : 'rgba(255,255,255,.06)', color: p.highlight ? '#04080e' : '#f4f0e8', border: p.highlight ? 'none' : '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '18px 36px', fontSize: '.95rem', fontWeight: 700, cursor: 'pointer', transition: 'transform .2s, background .2s', letterSpacing: '.05em' }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
                    {p.weight === '1kg' ? `1kg — R$ 29,90` : `Caixa 10kg — R$ 149,90`}
                  </button>
                ))}
              </div>
              <p style={{ marginTop: 22, fontSize: '.78rem', color: 'rgba(244,240,232,.3)', letterSpacing: '.06em' }}>
                🔒 Compra segura · Rastreamento incluso · Nota fiscal emitida
              </p>
            </div>
          </div>
        </section>

        {/* ═══════ FAQ ═══════ */}
        <section style={{ background: '#0a1628', padding: '100px 24px' }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div id="faq-head" data-reveal className={`reveal${vis('faq-head') ? ' visible' : ''}`} style={{ textAlign: 'center', marginBottom: 52 }}>
              <p className="section-label">Tire suas dúvidas</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 700, color: '#f4f0e8' }}>Perguntas Frequentes</h2>
            </div>
            <div id="faq-list" data-reveal className={`reveal${vis('faq-list') ? ' visible' : ''}`}>
              {FAQS.map((faq, i) => (
                <div key={i} className="faq-item">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', background: 'none', border: 'none', padding: '22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', gap: 16 }}>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.15rem', fontWeight: 600, color: '#f4f0e8', textAlign: 'left' }}>{faq.q}</span>
                    <span style={{ color: '#c8a040', fontSize: '1.3rem', flexShrink: 0, transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform .3s', display: 'inline-block' }}>+</span>
                  </button>
                  <div className={`faq-ans ${openFaq === i ? 'open' : 'closed'}`}>
                    <p style={{ padding: '0 0 24px', color: 'rgba(244,240,232,.58)', lineHeight: 1.75, fontSize: '.93rem' }}>{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ FOOTER ═══════ */}
        <footer style={{ background: '#04080e', borderTop: '1px solid rgba(255,255,255,.06)', padding: '56px 24px 32px' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 40, marginBottom: 48 }}>
              <div>
                <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img src={IMG.produto} alt="" style={{ height: 40, objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                  <div>
                    <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.4rem', fontWeight: 700, color: '#f4f0e8' }}>SAL VITA</span>
                    <span style={{ fontFamily: 'Outfit,sans-serif', fontSize: '.58rem', fontWeight: 600, letterSpacing: '.2em', color: '#c8a040', marginLeft: 5 }}>PREMIUM</span>
                  </div>
                </div>
                <p style={{ color: 'rgba(244,240,232,.38)', fontSize: '.83rem', lineHeight: 1.7 }}>Sal Marinho Integral Não Refinado. Das salinas de Mossoró, Rio Grande do Norte, para a sua mesa.</p>
              </div>
              <div>
                <h4 style={{ fontSize: '.68rem', fontWeight: 600, letterSpacing: '.2em', color: '#c8a040', textTransform: 'uppercase', marginBottom: 16 }}>Produto</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {['1kg — R$ 29,90', 'Caixa 10kg — R$ 149,90', 'Frete grátis acima R$ 150', '+80 Minerais Naturais', 'Não Refinado'].map((item) => (
                    <li key={item} style={{ color: 'rgba(244,240,232,.4)', fontSize: '.83rem', marginBottom: 8 }}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{ fontSize: '.68rem', fontWeight: 600, letterSpacing: '.2em', color: '#c8a040', textTransform: 'uppercase', marginBottom: 16 }}>Canais de Venda</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {[{ label: '💬 WhatsApp', href: `https://wa.me/${WA_NUMBER}` }, { label: '🛒 Mercado Livre', href: '#' }, { label: '🛍️ Shopee', href: '#' }, { label: '📦 Amazon', href: '#' }].map((link) => (
                    <li key={link.label} style={{ marginBottom: 8 }}>
                      <a href={link.href} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(244,240,232,.4)', fontSize: '.83rem', textDecoration: 'none', transition: 'color .2s' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#c8a040')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(244,240,232,.4)')}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{ fontSize: '.68rem', fontWeight: 600, letterSpacing: '.2em', color: '#c8a040', textTransform: 'uppercase', marginBottom: 16 }}>Fale Conosco</h4>
                <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: '#128C7E', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: '.83rem', fontWeight: 600, textDecoration: 'none', transition: 'background .2s, transform .2s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#25D366'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#128C7E'; e.currentTarget.style.transform = 'scale(1)'; }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Falar no WhatsApp
                </a>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 24, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }}>
              <p style={{ color: 'rgba(244,240,232,.22)', fontSize: '.76rem' }}>© 2025 SAL VITA PREMIUM · Mossoró, Rio Grande do Norte · CNPJ: XX.XXX.XXX/XXXX-XX</p>
              <p style={{ color: 'rgba(244,240,232,.22)', fontSize: '.76rem' }}>Produto registrado MAPA · Aditivos aprovados ANVISA</p>
            </div>
          </div>
        </footer>
      </div>

      {/* ═══════ WA FLOATING BUTTON ═══════ */}
      <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="wa-float" aria-label="Falar no WhatsApp">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>

      {/* ═══════ SHIPPING MODAL ═══════ */}
      {showModal && selectedProduct && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: '.68rem', fontWeight: 600, letterSpacing: '.2em', color: '#c8a040', textTransform: 'uppercase', marginBottom: 4 }}>Calcule o Frete</p>
                <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.55rem', fontWeight: 700, color: '#f4f0e8' }}>{selectedProduct.name}</h3>
                <p style={{ color: 'rgba(244,240,232,.45)', fontSize: '.83rem' }}>{selectedProduct.weight}</p>
              </div>
              <button onClick={closeModal} style={{ background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 8, width: 36, height: 36, color: 'rgba(244,240,232,.55)', fontSize: '1.3rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
            </div>

            {/* Product summary */}
            <div style={{ background: 'rgba(200,160,64,.08)', border: '1px solid rgba(200,160,64,.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '.78rem', color: 'rgba(244,240,232,.45)', marginBottom: 2 }}>Subtotal do produto</p>
                <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.9rem', fontWeight: 700, color: '#c8a040' }}>R$ {selectedProduct.price.toFixed(2).replace('.', ',')}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '.73rem', color: 'rgba(244,240,232,.38)' }}>Peso aprox.</p>
                <p style={{ fontSize: '.93rem', color: 'rgba(244,240,232,.65)', fontWeight: 500 }}>{selectedProduct.weightKg}kg</p>
              </div>
            </div>

            {/* CEP */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '.76rem', fontWeight: 600, letterSpacing: '.12em', color: 'rgba(244,240,232,.55)', textTransform: 'uppercase', marginBottom: 8 }}>Seu CEP de entrega</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input type="text" value={cep} onChange={(e) => { setCep(e.target.value.replace(/\D/g,'').slice(0,8)); setCepError(''); }} onKeyDown={(e) => e.key === 'Enter' && lookupCep()} placeholder="00000-000" maxLength={8}
                  style={{ flex: 1, background: 'rgba(255,255,255,.06)', border: cepError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: '13px 16px', color: '#f4f0e8', fontSize: '1rem', fontFamily: 'Outfit,sans-serif', letterSpacing: '.1em', outline: 'none' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#c8a040')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = cepError ? '#ef4444' : 'rgba(255,255,255,.12)')} />
                <button onClick={lookupCep} disabled={loadingCep} style={{ background: '#c8a040', color: '#04080e', border: 'none', borderRadius: 10, padding: '13px 20px', fontSize: '.85rem', fontWeight: 700, cursor: loadingCep ? 'not-allowed' : 'pointer', opacity: loadingCep ? 0.7 : 1, whiteSpace: 'nowrap' }}>
                  {loadingCep ? '⟳' : 'Calcular'}
                </button>
              </div>
              {cepError && <p style={{ color: '#ef4444', fontSize: '.78rem', marginTop: 6 }}>{cepError}</p>}
              <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener noreferrer" style={{ fontSize: '.73rem', color: 'rgba(244,240,232,.3)', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>Não sei meu CEP →</a>
            </div>

            {/* Results */}
            {cepData && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '9px 14px', background: 'rgba(74,222,128,.08)', borderRadius: 8, border: '1px solid rgba(74,222,128,.2)' }}>
                  <span style={{ color: '#4ade80' }}>✓</span>
                  <p style={{ fontSize: '.84rem', color: 'rgba(244,240,232,.65)' }}>{cepData.localidade} — {cepData.uf}{cepData.bairro ? ` · ${cepData.bairro}` : ''}</p>
                </div>
                <p style={{ fontSize: '.7rem', fontWeight: 600, letterSpacing: '.14em', color: 'rgba(244,240,232,.38)', textTransform: 'uppercase', marginBottom: 10 }}>Opções via Correios (estimativa):</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                  {shipping.map((opt) => (
                    <div key={opt.service} className={`ship-opt${selectedShipping?.service === opt.service ? ' sel' : ''}`} onClick={() => setSelectedShipping(opt)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: '1.4rem' }}>{opt.icon}</span>
                          <div>
                            <p style={{ fontWeight: 700, color: '#f4f0e8', fontSize: '.93rem' }}>{opt.service}</p>
                            <p style={{ fontSize: '.76rem', color: 'rgba(244,240,232,.42)' }}>{opt.description} · {opt.days}</p>
                          </div>
                        </div>
                        <p style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.3rem', fontWeight: 700, color: opt.service === 'SEDEX' ? '#c8a040' : '#f4f0e8' }}>R$ {opt.price.toFixed(2).replace('.', ',')}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {selectedShipping && (
                  <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 12, padding: '15px 18px', marginBottom: 18, borderTop: '2px solid #c8a040' }}>
                    {[['Produto', selectedProduct.price], ['Frete (' + selectedShipping.service + ')', selectedShipping.price]].map(([label, val]) => (
                      <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: '.83rem', color: 'rgba(244,240,232,.45)' }}>{label}</span>
                        <span style={{ fontSize: '.83rem', color: 'rgba(244,240,232,.65)' }}>R$ {Number(val).toFixed(2).replace('.', ',')}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 4 }}>
                      <span style={{ fontWeight: 700, color: '#f4f0e8' }}>Total estimado</span>
                      <span style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: '1.4rem', fontWeight: 700, color: '#c8a040' }}>R$ {(selectedProduct.price + selectedShipping.price).toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Buy buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <a href={buildWaLink(selectedProduct, selectedShipping ?? undefined)} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#128C7E', color: '#fff', borderRadius: 12, padding: '16px', fontSize: '.93rem', fontWeight: 700, textDecoration: 'none', letterSpacing: '.04em', transition: 'background .2s, transform .2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#25D366'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#128C7E'; e.currentTarget.style.transform = 'scale(1)'; }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Finalizar via WhatsApp
              </a>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,230,0,.1)', border: '1px solid rgba(255,230,0,.2)', color: '#ffe600', borderRadius: 10, padding: '12px', fontSize: '.78rem', fontWeight: 600, textDecoration: 'none', transition: 'background .2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,230,0,.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,230,0,.1)')}>
                  🛒 Mercado Livre
                </a>
                <a href="#" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(238,77,45,.1)', border: '1px solid rgba(238,77,45,.2)', color: '#ee4d2d', borderRadius: 10, padding: '12px', fontSize: '.78rem', fontWeight: 600, textDecoration: 'none', transition: 'background .2s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(238,77,45,.2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(238,77,45,.1)')}>
                  🛍️ Shopee
                </a>
              </div>
            </div>
            <p style={{ marginTop: 14, fontSize: '.7rem', color: 'rgba(244,240,232,.22)', textAlign: 'center', lineHeight: 1.5 }}>
              * Frete estimado via Correios. Valor final calculado na plataforma de venda.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
