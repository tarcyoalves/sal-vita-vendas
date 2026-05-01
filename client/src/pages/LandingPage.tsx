import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useInView } from 'framer-motion';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  abismo:        '#0A1B3D',
  noiteMarinha:  '#0F2A57',
  ouroLume:      '#C9A04A',
  ouroClaro:     '#E8C77A',
  brancoMineral: '#F4EFE6',
  sombraSalina:  '#061027',
  azulEmbalagem: '#1B3D8F',
};

const grain = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`;

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (d = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.9, delay: d, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

// ─── Shared components ────────────────────────────────────────────────────────
function Reveal({ children, d = 0, className = '' }: { children: React.ReactNode; d?: number; className?: string }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} custom={d} className={className}>
      {children}
    </motion.div>
  );
}

function GoldLine({ className = '' }: { className?: string }) {
  return (
    <motion.div
      initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      style={{ height: 1, background: `linear-gradient(90deg, transparent, ${C.ouroLume}, transparent)`, transformOrigin: 'left' }}
      className={className}
    />
  );
}

function Particles({ count = 18, color = C.ouroLume }: { count?: number; color?: string }) {
  const items = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i, left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
    dur: 9 + Math.random() * 10, delay: Math.random() * 7, size: 1.5 + Math.random() * 2.5,
  })), [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {items.map((p) => (
        <motion.span key={p.id}
          style={{ position: 'absolute', left: p.left, top: p.top, width: p.size, height: p.size, borderRadius: '50%', background: color }}
          animate={{ y: [-18, 18, -18], opacity: [0, 0.5, 0] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function QtySelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const btn = { padding: '10px 18px', background: 'transparent', color: C.brancoMineral, cursor: 'pointer', border: 'none', fontSize: 20, transition: 'background 0.2s' };
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.ouroLume}44`, borderRadius: 8, overflow: 'hidden' }}>
      <button style={btn} onClick={() => onChange(Math.max(1, value - 1))}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.ouroLume}22`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>−</button>
      <div style={{ padding: '10px 22px', fontFamily: 'Inter Tight, sans-serif', color: C.brancoMineral, fontSize: 16, minWidth: 44, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: `1px solid ${C.ouroLume}33`, borderRight: `1px solid ${C.ouroLume}33` }}>{value}</div>
      <button style={btn} onClick={() => onChange(Math.min(99, value + 1))}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.ouroLume}22`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>+</button>
    </div>
  );
}

type ShippingOption = { name: string; price: string; days: string };
function ShippingCalculator() {
  const [cep, setCep] = useState(() => localStorage.getItem('salvita.cep') ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ShippingOption[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const fmt = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
  async function calc() {
    if (cep.replace(/\D/g, '').length !== 8) { setError('CEP inválido.'); return; }
    setError(''); setLoading(true); setResults(null);
    localStorage.setItem('salvita.cep', cep);
    await new Promise((r) => setTimeout(r, 1400));
    setResults([
      { name: 'Mini Envios', price: 'R$ 18,50', days: '10–15 dias úteis' },
      { name: 'PAC',         price: 'R$ 24,90', days: '8–12 dias úteis' },
      { name: 'SEDEX',       price: 'R$ 49,90', days: '3–5 dias úteis' },
    ]);
    setLoading(false);
  }
  return (
    <div style={{ marginTop: 56 }}>
      <GoldLine />
      <div style={{ marginTop: 36 }}>
        <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 6 }}>CALCULAR FRETE</p>
        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 17, color: `${C.brancoMineral}88`, marginBottom: 20 }}>Quanto custa trazer Mossoró até você?</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={cep} onChange={(e) => setCep(fmt(e.target.value))} placeholder="00000-000" maxLength={9}
            onKeyDown={(e) => e.key === 'Enter' && calc()}
            style={{ background: 'transparent', border: `1px solid ${C.ouroLume}44`, borderRadius: 8, padding: '10px 16px', color: C.brancoMineral, fontFamily: 'Inter Tight, sans-serif', fontSize: 15, width: 170, outline: 'none' }} />
          <button onClick={calc} disabled={loading}
            style={{ background: C.ouroLume, color: C.sombraSalina, border: 'none', borderRadius: 8, padding: '10px 24px', fontFamily: 'Inter Tight, sans-serif', fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Calculando…' : 'Calcular'}
          </button>
        </div>
        {error && <p style={{ marginTop: 10, color: '#ff8080', fontFamily: 'Inter Tight, sans-serif', fontSize: 13 }}>{error}</p>}
        <AnimatePresence>
          {results && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              {results.map((o) => (
                <div key={o.name} onClick={() => setSelected(o.name)}
                  style={{ border: `1px solid ${selected === o.name ? C.ouroLume : `${C.ouroLume}33`}`, borderRadius: 10, padding: '14px 20px', cursor: 'pointer', background: selected === o.name ? `${C.ouroLume}18` : 'transparent', transition: 'all 0.2s' }}>
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 600, color: C.brancoMineral, margin: 0, fontSize: 13 }}>{o.name}</p>
                  <p style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: C.ouroLume, margin: '4px 0' }}>{o.price}</p>
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, color: `${C.brancoMineral}66`, margin: 0 }}>{o.days}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, color: `${C.brancoMineral}33`, marginTop: 16 }}>Despachamos em até 2 dias úteis a partir de Mossoró/RN.</p>
      </div>
    </div>
  );
}

// ─── Product image with fallback ──────────────────────────────────────────────
function ProductImage({ size = 420, style: extraStyle = {} }: { size?: number; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{ position: 'relative', width: size, maxWidth: '100%', ...extraStyle }}>
      {!failed ? (
        <img src="/embalagem.png" alt="Sal Vita Premium 1kg" onError={() => setFailed(true)}
          style={{ width: '100%', filter: 'drop-shadow(0 40px 80px rgba(10,27,61,0.9)) drop-shadow(0 0 40px rgba(201,160,74,0.2))', display: 'block' }} />
      ) : (
        <div style={{ width: size, height: size * 1.35, background: `linear-gradient(160deg, ${C.azulEmbalagem}, ${C.noiteMarinha})`, border: `2px solid ${C.ouroLume}44`, borderRadius: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, boxShadow: `0 40px 80px rgba(10,27,61,0.8), 0 0 60px ${C.ouroLume}18` }}>
          <img src="/sal-vita-logo.svg" alt="Sal Vita" style={{ width: 120, filter: 'brightness(0) invert(1)', opacity: 0.9 }} onError={() => {}} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontFamily: 'Fraunces, serif', fontSize: 32, color: C.brancoMineral, fontWeight: 300, margin: 0 }}>Premium</p>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', margin: '6px 0 0' }}>Sal Integral de Mossoró</p>
          </div>
          <div style={{ border: `1px solid ${C.ouroLume}55`, borderRadius: '50%', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: C.ouroLume, textAlign: 'center', lineHeight: 1.3 }}>1 kg<br/>Peso Liq.</span>
          </div>
          <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 10, color: `${C.brancoMineral}55`, textAlign: 'center', maxWidth: 160, lineHeight: 1.5 }}>Adicione embalagem.png em client/public/ para exibir o produto</p>
        </div>
      )}
    </div>
  );
}

// ─── Salina CSS Art ───────────────────────────────────────────────────────────
function SalinaArt() {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 400, overflow: 'hidden' }}>
      {/* Sky gradient */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, #7BB8D4 0%, #B8D8E8 30%, #D4EBF5 45%, #E8F3F8 50%, ${C.brancoMineral} 51%, #E8E4DC 65%, #D4CCB8 80%, #C8BFA4 100%)` }} />
      {/* Salt flat sheen / reflection lines */}
      {[52, 56, 61, 67, 74, 82, 91].map((top, i) => (
        <motion.div key={i}
          initial={{ scaleX: 0, opacity: 0 }} whileInView={{ scaleX: 1, opacity: 1 }} viewport={{ once: true }}
          transition={{ duration: 2.5, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'absolute', top: `${top}%`, left: 0, right: 0, height: i < 3 ? 1 : 2, background: i < 3 ? 'rgba(120,170,200,0.6)' : `rgba(201,160,74,${0.08 + i * 0.03})`, transformOrigin: 'left' }}
        />
      ))}
      {/* Sun glow */}
      <div style={{ position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', width: 120, height: 120, background: `radial-gradient(circle, rgba(255,220,100,0.7), rgba(255,200,60,0.2), transparent 70%)`, borderRadius: '50%', filter: 'blur(8px)' }} />
      {/* Salt mounds silhouette */}
      <div style={{ position: 'absolute', bottom: '20%', left: '10%', width: 60, height: 30, background: `${C.brancoMineral}cc`, borderRadius: '50% 50% 0 0', boxShadow: `0 -4px 20px ${C.brancoMineral}88` }} />
      <div style={{ position: 'absolute', bottom: '22%', left: '16%', width: 100, height: 45, background: `${C.brancoMineral}dd`, borderRadius: '50% 50% 0 0', boxShadow: `0 -4px 24px ${C.brancoMineral}aa` }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '12%', width: 80, height: 35, background: `${C.brancoMineral}cc`, borderRadius: '50% 50% 0 0' }} />
      <div style={{ position: 'absolute', bottom: '23%', right: '20%', width: 120, height: 50, background: `${C.brancoMineral}dd`, borderRadius: '50% 50% 0 0' }} />
      {/* Worker silhouette */}
      <div style={{ position: 'absolute', bottom: '19%', left: '40%' }}>
        <svg width="24" height="48" viewBox="0 0 24 48" fill={`${C.abismo}88`}>
          <circle cx="12" cy="5" r="4" />
          <rect x="8" y="10" width="8" height="18" rx="2" />
          <rect x="6" y="14" width="5" height="12" rx="2" transform="rotate(-15 6 14)" />
          <rect x="13" y="14" width="5" height="12" rx="2" transform="rotate(15 18 14)" />
          <rect x="8" y="28" width="4" height="16" rx="2" />
          <rect x="12" y="28" width="4" height="16" rx="2" />
        </svg>
      </div>
      {/* Grain overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: grain, backgroundSize: '256px', mixBlendMode: 'overlay', opacity: 0.6 }} />
      {/* Horizon shimmer */}
      <div style={{ position: 'absolute', top: '49%', left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, rgba(201,160,74,0.6), rgba(255,220,100,0.8), rgba(201,160,74,0.6), transparent)` }} />
      {/* Coordinates */}
      <div style={{ position: 'absolute', bottom: 20, right: 24 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: `${C.abismo}88`, letterSpacing: '0.05em', background: `${C.brancoMineral}cc`, padding: '4px 8px', borderRadius: 4 }}>5°11′S 37°20′W · Mossoró, RN</span>
      </div>
    </div>
  );
}

// ─── Crystal pattern background ───────────────────────────────────────────────
function CrystalSVG() {
  const pts = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: (i % 6) * 200 + 50 + Math.random() * 80,
    y: Math.floor(i / 6) * 160 + 30 + Math.random() * 80,
    r: 20 + Math.random() * 50,
  })), []);
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.06 }} viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid slice">
      {pts.map((p) => (
        <polygon key={p.id} points={`${p.x},${p.y - p.r} ${p.x + p.r * 0.87},${p.y + p.r * 0.5} ${p.x - p.r * 0.87},${p.y + p.r * 0.5}`} fill="none" stroke={C.ouroLume} strokeWidth="1" />
      ))}
    </svg>
  );
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function Counter({ to, prefix = '', suffix = '' }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const dur = 1600; const start = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / dur);
      setVal(Math.round(p * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return <span ref={ref}>{prefix}{val}{suffix}</span>;
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [qty1, setQty1] = useState(1);
  const [qty10, setQty10] = useState(1);
  const { scrollY } = useScroll();
  const heroImgY = useTransform(scrollY, [0, 700], [0, -70]);
  const heroTxtY = useTransform(scrollY, [0, 700], [0, 50]);

  useEffect(() => {
    const unsub = scrollY.onChange((v) => setScrolled(v > 60));
    return unsub;
  }, [scrollY]);

  const price1 = (29.9 * qty1).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const price10 = (149 * qty10).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div style={{ fontFamily: 'Inter Tight, sans-serif', overflowX: 'hidden' }}>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ y: -80 }} animate={{ y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '14px 40px',
          background: scrolled ? `${C.sombraSalina}ee` : 'transparent',
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          borderBottom: scrolled ? `1px solid ${C.ouroLume}22` : 'none',
          transition: 'all 0.4s', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <img src="/sal-vita-logo.svg" alt="Sal Vita" style={{ height: 40, filter: 'brightness(0) invert(1)', opacity: 0.92 }} />
          <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 10, letterSpacing: '0.15em', color: C.ouroLume, textTransform: 'uppercase', border: `1px solid ${C.ouroLume}66`, padding: '2px 8px', borderRadius: 3 }}>Premium</span>
        </a>
        <nav className="lp-nav-links">
          {['Origem', 'Produto', 'Usos', 'Comprar'].map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`}
              style={{ color: `${C.brancoMineral}99`, fontFamily: 'Inter Tight, sans-serif', fontSize: 13, letterSpacing: '0.04em', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.brancoMineral; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = `${C.brancoMineral}99`; }}
            >{l}</a>
          ))}
        </nav>
        <a href="#comprar" style={{ background: C.ouroLume, color: C.sombraSalina, textDecoration: 'none', padding: '9px 22px', borderRadius: 8, fontFamily: 'Inter Tight, sans-serif', fontWeight: 700, fontSize: 13, transition: 'background 0.2s' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}
        >Comprar agora</a>
      </motion.header>

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: `radial-gradient(ellipse at 70% 40%, ${C.noiteMarinha} 0%, ${C.abismo} 50%, ${C.sombraSalina} 100%)`, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: grain, backgroundSize: '256px', mixBlendMode: 'overlay', opacity: 0.45, pointerEvents: 'none' }} />
        <Particles count={24} />

        <div className="lp-hero-grid" style={{ width: '100%', maxWidth: 1360, margin: '0 auto', padding: '130px 48px 80px', gap: 48, position: 'relative', zIndex: 1 }}>
          {/* Left — copy */}
          <motion.div style={{ y: heroTxtY }}>
            <Reveal>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 28, border: `1px solid ${C.ouroLume}44`, borderRadius: 40, padding: '6px 16px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.ouroLume }} />
                <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase' }}>Mossoró, RN · Sal Marinho Integral</span>
              </div>
            </Reveal>
            <Reveal d={0.1}>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(44px, 6.5vw, 88px)', fontWeight: 300, lineHeight: 1.06, color: C.brancoMineral, margin: '0 0 24px' }}>
                O mar não tem pressa.<br />
                <em style={{ color: C.ouroLume }}>Por isso tem sabor.</em>
              </h1>
            </Reveal>
            <Reveal d={0.2}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 21, color: `${C.brancoMineral}bb`, lineHeight: 1.65, maxWidth: 500, marginBottom: 36 }}>
                Sal integral colhido nas salinas do Rio Grande do Norte. Não refinado, não branqueado, não apressado.
              </p>
            </Reveal>
            <Reveal d={0.3}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
                <a href="#comprar" style={{ background: C.ouroLume, color: C.sombraSalina, textDecoration: 'none', padding: '16px 36px', borderRadius: 10, fontFamily: 'Inter Tight, sans-serif', fontWeight: 700, fontSize: 15, transition: 'background 0.2s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}
                >Levar para minha cozinha</a>
                <a href="#origem" style={{ border: `1px solid rgba(244,239,230,0.22)`, color: `rgba(244,239,230,0.6)`, textDecoration: 'none', padding: '16px 36px', borderRadius: 10, fontFamily: 'Inter Tight, sans-serif', fontSize: 15, transition: 'all 0.2s' }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = C.brancoMineral; el.style.borderColor = 'rgba(244,239,230,0.45)'; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(244,239,230,0.6)'; el.style.borderColor = 'rgba(244,239,230,0.22)'; }}
                >Conhecer a origem</a>
              </div>
            </Reveal>
            {/* Key claims from label */}
            <Reveal d={0.4}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {['+80 minerais', 'Não refinado', 'Mossoró, RN'].map((tag) => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.ouroLume, opacity: 0.7 }} />
                    <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, color: `${C.brancoMineral}66`, letterSpacing: '0.05em' }}>{tag}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </motion.div>

          {/* Right — product */}
          <div className="lp-hero-img">
            <motion.div style={{ y: heroImgY, position: 'relative' }}>
              {/* Glow aura */}
              <div style={{ position: 'absolute', inset: -60, background: `radial-gradient(circle, ${C.azulEmbalagem}44 0%, ${C.ouroLume}18 40%, transparent 70%)`, pointerEvents: 'none' }} />
              <motion.div
                initial={{ opacity: 0, scale: 0.85, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.div animate={{ y: [0, -14, 0] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}>
                  <ProductImage size={460} />
                </motion.div>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2.2, repeat: Infinity }}
          style={{ position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <svg width="22" height="34" viewBox="0 0 22 34" fill="none">
            <rect x="1.5" y="1.5" width="19" height="31" rx="9.5" stroke={`${C.brancoMineral}44`} strokeWidth="1.5" />
            <motion.rect x="9" y="7" width="4" height="9" rx="2" fill={C.ouroLume}
              animate={{ y: [0, 9, 0], opacity: [1, 0, 1] }} transition={{ duration: 2.2, repeat: Infinity }} />
          </svg>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.22em', color: `${C.brancoMineral}55`, textTransform: 'uppercase' }}>DESCOBRIR</span>
        </motion.div>
      </section>

      {/* ── SALINA VISUAL BREAK ──────────────────────────────────────────────── */}
      <section id="origem" style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="lp-origin-grid">
          <div style={{ minHeight: 500, position: 'relative' }}>
            <SalinaArt />
          </div>
          <div style={{ background: C.abismo, padding: '72px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Reveal>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 20 }}>── TERRITÓRIO DE ORIGEM</p>
            </Reveal>
            <Reveal d={0.1}>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 300, color: C.brancoMineral, lineHeight: 1.1, marginBottom: 24 }}>
                Onde o semiárido<br /><em style={{ color: C.ouroLume }}>encontra o oceano.</em>
              </h2>
            </Reveal>
            <Reveal d={0.2}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 20, color: `${C.brancoMineral}cc`, lineHeight: 1.7, marginBottom: 20 }}>
                Mossoró fica numa esquina improvável do Brasil: terra seca, sol implacável, vento que não descansa. Essa combinação cria nas salinas uma evaporação lenta e controlada.
              </p>
            </Reveal>
            <Reveal d={0.3}>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, color: `${C.brancoMineral}66`, lineHeight: 1.8, marginBottom: 32 }}>
                Evapora devagar. Concentra. Cristaliza. O que sobra é o que você tem em mãos — sem pressa industrial, sem processamento excessivo.
              </p>
            </Reveal>
            <GoldLine />
            <Reveal d={0.4}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 19, color: C.ouroLume, marginTop: 24 }}>
                "O sal que o mar levou um ano para escrever."
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────────────────────────────── */}
      <section style={{ background: C.brancoMineral, padding: '72px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="lp-stats-row" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
            {[
              { n: 80, prefix: '+', suffix: '', label: 'Minerais naturais preservados' },
              { n: 0, prefix: '',  suffix: '', label: 'Aditivos ou branqueadores' },
              { n: 100, prefix: '', suffix: '%', label: 'Sal marinho de Mossoró, RN' },
              { n: 1, prefix: '',  suffix: 'kg', label: 'Para o ano todo de sabor' },
            ].map((s) => (
              <div key={s.label} style={{ flex: 1, padding: '0 20px' }}>
                <p style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(48px, 6vw, 80px)', fontWeight: 300, color: C.ouroLume, margin: 0, lineHeight: 1 }}>
                  <Counter to={s.n} prefix={s.prefix} suffix={s.suffix} />
                </p>
                <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${C.abismo}77`, marginTop: 10 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUTO EM DESTAQUE ──────────────────────────────────────────────── */}
      <section id="produto" style={{ background: `linear-gradient(160deg, ${C.noiteMarinha} 0%, ${C.abismo} 60%, ${C.sombraSalina} 100%)`, padding: '100px 48px', position: 'relative', overflow: 'hidden' }}>
        <CrystalSVG />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: grain, backgroundSize: '256px', mixBlendMode: 'overlay', opacity: 0.3 }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', gap: 80, alignItems: 'center', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          {/* Product image large */}
          <motion.div style={{ flex: '0 0 auto' }}
            initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}>
            <ProductImage size={380} />
          </motion.div>
          {/* Details */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <Reveal>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 16 }}>SAL VITA PREMIUM · 1 KG</p>
            </Reveal>
            <Reveal d={0.1}>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(32px, 4.5vw, 56px)', fontWeight: 300, color: C.brancoMineral, lineHeight: 1.1, marginBottom: 28 }}>
                Muito mais sabor,<br /><em style={{ color: C.ouroLume }}>em cada pitada.</em>
              </h2>
            </Reveal>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
              {[
                { icon: '◈', title: 'Cristal irregular', desc: 'Quebra em momentos diferentes na boca, criando camadas de sabor.' },
                { icon: '◉', title: '+80 minerais', desc: 'Assinatura mineral que o sal refinado perdeu há décadas.' },
                { icon: '◌', title: 'Use menos', desc: 'Cada grão libera mais sabor. A mão fica mais leve. O prato, mais refinado.' },
                { icon: '◍', title: 'Sal marinho não refinado', desc: 'Sem branqueadores, sem aditivos, sem processos industriais.' },
              ].map((item, i) => (
                <Reveal key={item.title} d={i * 0.08}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'Fraunces, serif', fontSize: 24, color: C.ouroLume, lineHeight: 1, marginTop: 2 }}>{item.icon}</span>
                    <div>
                      <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 600, fontSize: 14, color: C.brancoMineral, margin: '0 0 4px' }}>{item.title}</p>
                      <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 16, color: `${C.brancoMineral}77`, margin: 0, lineHeight: 1.5 }}>{item.desc}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <GoldLine />
            <Reveal d={0.5}>
              <a href="#comprar" style={{ display: 'inline-block', marginTop: 28, background: C.ouroLume, color: C.sombraSalina, textDecoration: 'none', padding: '14px 36px', borderRadius: 10, fontFamily: 'Inter Tight, sans-serif', fontWeight: 700, fontSize: 15 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}
              >Ver preços e opções</a>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── POR QUE O SABOR MUDA ────────────────────────────────────────────── */}
      <section style={{ background: C.brancoMineral, padding: '100px 48px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <Reveal>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 12 }}>DIFERENÇA SENSORIAL</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 300, color: C.abismo, maxWidth: 600, lineHeight: 1.15, marginBottom: 60 }}>
              Três coisas acontecem quando o sal é integral.
            </h2>
          </Reveal>
          <div className="lp-flavor-grid" style={{ gap: 0 }}>
            {[
              { n: '01', title: 'O grão tem geometria.', body: 'Cristais irregulares quebram em momentos diferentes na boca, criando camadas de sabor onde o sal refinado entrega só uma nota.', accent: C.azulEmbalagem },
              { n: '02', title: 'O paladar percebe minério.', body: 'Mais de 80 minerais residuais conferem ao Sal Vita uma assinatura levemente mineral — algo que o sal de cozinha comum perdeu há décadas.', accent: C.ouroLume },
              { n: '03', title: 'Você usa menos.', body: 'Como cada grão libera mais sabor, a mão fica mais leve. O prato ganha definição sem ficar excessivamente salgado.', accent: C.azulEmbalagem },
            ].map((card, i) => (
              <motion.div key={card.n}
                initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ duration: 0.85, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                style={{ padding: '48px 40px', borderTop: `3px solid ${card.accent}`, borderRight: i < 2 ? `1px solid ${C.abismo}18` : 'none' }}>
                <p style={{ fontFamily: 'Fraunces, serif', fontSize: 96, fontWeight: 300, color: 'transparent', WebkitTextStroke: `1px ${card.accent}44`, lineHeight: 1, marginBottom: 20 }}>{card.n}</p>
                <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 300, color: C.abismo, marginBottom: 14, lineHeight: 1.2 }}>{card.title}</h3>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, color: `${C.abismo}77`, lineHeight: 1.7 }}>{card.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RITUAL DE USO ───────────────────────────────────────────────────── */}
      <section id="usos" style={{ background: C.abismo, padding: '100px 0 100px 48px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto 0 auto' }}>
          <Reveal>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 12, paddingRight: 48 }}>RITUAL DE USO</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(30px, 4.5vw, 52px)', fontWeight: 300, color: C.brancoMineral, marginBottom: 44, paddingRight: 48 }}>
              Seis lugares onde ele faz diferença.
            </h2>
          </Reveal>
        </div>
        <div className="lp-ritual-scroll" style={{ display: 'flex', gap: 20, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingRight: 48, paddingBottom: 8 }}>
          {[
            { n: '01', label: 'Churrasco', desc: 'Finalize a carne fora do fogo, com os cristais maiores. Eles estalam.', grad: `linear-gradient(135deg, #3D1A0A, #7A3515)` },
            { n: '02', label: 'Saladas', desc: 'Quebre o cristal com os dedos sobre tomates maduros e azeite. É outra salada.', grad: `linear-gradient(135deg, #1A3D0A, #2D6B10)` },
            { n: '03', label: 'Grelhados', desc: 'Pulverize antes de selar o peixe; a crosta forma textura própria.', grad: `linear-gradient(135deg, #0A2A3D, #0F4A6B)` },
            { n: '04', label: 'Massas', desc: 'Uma pitada na água do cozimento, outra na finalização. A massa ganha contorno.', grad: `linear-gradient(135deg, #3D2A0A, #7A5215)` },
            { n: '05', label: 'Finalização', desc: 'Sobre ovo cozido mole, abacate, manteiga gelada, chocolate amargo.', grad: `linear-gradient(135deg, #1A0A2A, #3A1555)` },
            { n: '06', label: 'Dia a dia', desc: 'Substitua o sal refinado. O feijão e o arroz vão te contar a diferença.', grad: `linear-gradient(135deg, #0A1B3D, #1B3D6B)` },
          ].map((card, i) => (
            <motion.div key={card.n}
              whileHover={{ y: -8 }} transition={{ duration: 0.3 }}
              style={{ flexShrink: 0, width: 'clamp(260px, 28vw, 310px)', scrollSnapAlign: 'start', background: card.grad, border: `1px solid ${C.ouroLume}22`, borderRadius: 14, padding: '36px 32px', borderTop: `3px solid ${C.ouroLume}`, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: grain, backgroundSize: '256px', mixBlendMode: 'overlay', opacity: 0.5 }} />
              <motion.p
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.6 }}
                style={{ fontFamily: 'Fraunces, serif', fontSize: 60, fontWeight: 300, color: 'transparent', WebkitTextStroke: `1px ${C.ouroLume}66`, lineHeight: 1, marginBottom: 18, position: 'relative' }}>{card.n}</motion.p>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 600, fontSize: 15, color: C.brancoMineral, marginBottom: 10, letterSpacing: '0.02em', position: 'relative' }}>{card.label}</p>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 16, color: `${C.brancoMineral}88`, lineHeight: 1.65, position: 'relative' }}>{card.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── TRANSPARÊNCIA ───────────────────────────────────────────────────── */}
      <section style={{ background: C.brancoMineral, padding: '100px 48px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', fontFamily: 'Fraunces, serif', fontSize: 160, color: C.abismo, opacity: 0.04, lineHeight: 1, userSelect: 'none' }}>"</div>
          <Reveal>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 16 }}>SEM PROMESSAS DE MARKETING</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(32px, 5vw, 60px)', fontWeight: 300, color: C.abismo, marginBottom: 28, lineHeight: 1.1 }}>
              Vamos ser honestos com você.
            </h2>
          </Reveal>
          <Reveal d={0.2}>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 22, color: `${C.abismo}bb`, lineHeight: 1.75, marginBottom: 36 }}>
              Sal Vita Premium não cura nada, não emagrece ninguém. O que fazemos é simples: trazemos para a sua cozinha o sal mais íntegro que Mossoró é capaz de produzir — sem exageros, sem promessas vazias.
            </p>
          </Reveal>
          <GoldLine />
          <Reveal d={0.3}>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: `${C.abismo}55`, marginTop: 24 }}>
              Menos milagre de marketing. Mais origem, sabor e verdade.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── COMPRA ──────────────────────────────────────────────────────────── */}
      <section id="comprar" style={{ background: `linear-gradient(160deg, ${C.noiteMarinha} 0%, ${C.sombraSalina} 100%)`, padding: '100px 48px', position: 'relative', overflow: 'hidden' }}>
        <CrystalSVG />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: grain, backgroundSize: '256px', mixBlendMode: 'overlay', opacity: 0.3 }} />
        <div style={{ maxWidth: 1280, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <Reveal>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 12 }}>ESCOLHA SEU RITUAL</p>
            </Reveal>
            <Reveal d={0.1}>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 300, color: C.brancoMineral, lineHeight: 1.15, marginBottom: 16 }}>
                Você não está comprando um pacote de sal.
              </h2>
            </Reveal>
            <Reveal d={0.2}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 19, color: `${C.brancoMineral}88`, maxWidth: 660, margin: '0 auto' }}>
                Está comprando 365 dias de sol, vento e oceano — colhidos nas salinas, embalados em Mossoró, entregues na sua porta.
              </p>
            </Reveal>
          </div>

          <div className="lp-purchase-grid" style={{ gap: 24, alignItems: 'start' }}>
            {/* Card 1kg */}
            <Reveal>
              <div style={{ border: `1px solid ${C.ouroLume}33`, borderRadius: 18, padding: '44px 36px', background: `${C.abismo}88` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
                  <ProductImage size={80} style={{ flexShrink: 0 }} />
                  <div>
                    <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.15em', color: `${C.brancoMineral}66`, textTransform: 'uppercase', marginBottom: 6 }}>Cristal · 1 kg</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 18, color: `${C.brancoMineral}88` }}>R$</span>
                      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 52, fontWeight: 300, color: C.brancoMineral, lineHeight: 1 }}>29,90</span>
                    </div>
                    <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 15, color: `${C.brancoMineral}66`, marginTop: 2 }}>Para começar a conversa.</p>
                  </div>
                </div>
                <GoldLine />
                <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Embalagem premium azul e dourado', 'Rendimento médio de 2–3 meses', 'Fechamento hermético'].map((f) => (
                    <li key={f} style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: `${C.brancoMineral}88` }}>
                      <span style={{ color: C.ouroLume, marginRight: 10 }}>──</span>{f}
                    </li>
                  ))}
                </ul>
                <GoldLine />
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <QtySelector value={qty1} onChange={setQty1} />
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: `${C.brancoMineral}88`, margin: 0 }}>Total: <strong style={{ color: C.brancoMineral }}>{price1}</strong></p>
                  <button style={{ border: `1px solid ${C.ouroLume}`, color: C.ouroLume, background: 'transparent', padding: '13px 24px', borderRadius: 10, fontFamily: 'Inter Tight, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = C.ouroLume; el.style.color = C.sombraSalina; }}
                    onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = C.ouroLume; }}>
                    Levar {qty1} {qty1 === 1 ? 'embalagem' : 'embalagens'}
                  </button>
                </div>
              </div>
            </Reveal>

            {/* Card 10kg — destaque */}
            <Reveal d={0.1}>
              <div style={{ border: `1px solid ${C.ouroLume}`, borderRadius: 18, padding: '44px 36px', background: `linear-gradient(160deg, ${C.noiteMarinha}, ${C.abismo})`, position: 'relative', overflow: 'hidden', boxShadow: `0 0 80px ${C.ouroLume}18, 0 0 1px ${C.ouroLume}88` }}>
                <div style={{ position: 'absolute', top: -80, right: -80, width: 220, height: 220, background: `radial-gradient(circle, ${C.ouroLume}22, transparent 70%)` }} />
                <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: C.ouroLume, color: C.sombraSalina, padding: '4px 22px', fontFamily: 'Inter Tight, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: '0 0 10px 10px' }}>MELHOR ESCOLHA</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20, marginTop: 16 }}>
                  <ProductImage size={90} style={{ flexShrink: 0 }} />
                  <div>
                    <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.15em', color: `${C.brancoMineral}66`, textTransform: 'uppercase', marginBottom: 6 }}>Caixa Cristal · 10 kg</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 18, color: `${C.brancoMineral}88` }}>R$</span>
                      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 52, fontWeight: 300, color: C.ouroClaro, lineHeight: 1 }}>149,00</span>
                    </div>
                    <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 15, color: `${C.brancoMineral}66`, marginTop: 2 }}>Para quem já não volta atrás.</p>
                  </div>
                </div>
                <div style={{ border: `1px solid ${C.ouroLume}33`, background: `${C.ouroLume}18`, borderRadius: 10, padding: '12px 16px', marginBottom: 24 }}>
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: C.ouroClaro, margin: '0 0 3px', fontWeight: 600 }}>R$ 14,90/kg — metade do preço avulso</p>
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, color: `${C.ouroLume}aa`, margin: 0 }}>Economia de R$ 150,00 vs. 10 unidades</p>
                </div>
                <GoldLine />
                <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Caixa colecionável azul abismo', 'Estoque para o ano inteiro', 'Frete otimizado por volume', 'Garantia de origem Mossoró'].map((f) => (
                    <li key={f} style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: `${C.brancoMineral}88` }}>
                      <span style={{ color: C.ouroLume, marginRight: 10 }}>──</span>{f}
                    </li>
                  ))}
                </ul>
                <GoldLine />
                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <QtySelector value={qty10} onChange={setQty10} />
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: `${C.brancoMineral}88`, margin: 0 }}>Total: <strong style={{ color: C.brancoMineral }}>{price10}</strong></p>
                  <button style={{ background: C.ouroLume, color: C.sombraSalina, border: 'none', padding: '15px 24px', borderRadius: 10, fontFamily: 'Inter Tight, sans-serif', fontWeight: 700, fontSize: 15, cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}>
                    Reservar {qty10 > 1 ? `${qty10} caixas` : 'minha caixa'}
                  </button>
                </div>
                <ShippingCalculator />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FRASE FINAL ─────────────────────────────────────────────────────── */}
      <section style={{ background: C.sombraSalina, padding: '130px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <Particles count={20} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}>
            <img src="/sal-vita-logo.svg" alt="Sal Vita" style={{ height: 64, filter: 'brightness(0) invert(1)', opacity: 0.2, display: 'block', margin: '0 auto 32px' }} />
          </motion.div>
          <Reveal>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.2em', color: `${C.ouroLume}88`, textTransform: 'uppercase', marginBottom: 44 }}>SAL VITA PREMIUM · MOSSORÓ, BRASIL</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(36px, 6.5vw, 72px)', fontWeight: 300, color: C.brancoMineral, lineHeight: 1.15, marginBottom: 52 }}>
              O mar levou um ano.<br /><em style={{ color: C.ouroLume }}>Você leva um instante.</em>
            </h2>
          </Reveal>
          <Reveal d={0.2}>
            <a href="#comprar" style={{ background: C.ouroLume, color: C.sombraSalina, textDecoration: 'none', padding: '18px 52px', borderRadius: 10, fontFamily: 'Inter Tight, sans-serif', fontWeight: 700, fontSize: 16, display: 'inline-block', transition: 'background 0.2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}>
              Trazer o mar para a mesa
            </a>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer style={{ background: C.sombraSalina, borderTop: `1px solid ${C.ouroLume}18`, padding: '28px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <img src="/sal-vita-logo.svg" alt="Sal Vita" style={{ height: 28, filter: 'brightness(0) invert(1)', opacity: 0.3 }} />
        <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${C.brancoMineral}27`, margin: 0 }}>
          © 2025 Sal Vita Premium · Todos os direitos reservados
        </p>
        <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 14, color: `${C.ouroLume}77`, margin: 0 }}>
          Mossoró, Rio Grande do Norte, Brasil
        </p>
      </footer>

    </div>
  );
}
