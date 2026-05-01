import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  abismo:        '#0A1B3D',
  noiteMarinha:  '#0F2A57',
  ouroLume:      '#C9A04A',
  ouroClaro:     '#E8C77A',
  brancoMineral: '#F4EFE6',
  sombraSalina:  '#061027',
};

const grain = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`;

// ─── Motion variants ──────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: (d = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.85, delay: d, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

// ─── Reusable components ──────────────────────────────────────────────────────
function Reveal({ children, d = 0, className = '' }: { children: React.ReactNode; d?: number; className?: string }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      custom={d}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function GoldLine({ className = '' }: { className?: string }) {
  return (
    <motion.div
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${C.ouroLume}, transparent)`,
        transformOrigin: 'left',
      }}
      className={className}
    />
  );
}

function Particles({ count = 20 }: { count?: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        duration: 8 + Math.random() * 10,
        delay: Math.random() * 6,
        size: 2 + Math.random() * 3,
      })),
    [count],
  );

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {items.map((p) => (
        <motion.span
          key={p.id}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: C.ouroLume,
          }}
          animate={{ y: [-15, 15, -15], opacity: [0, 0.4, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function QtySelector({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', border: `1px solid ${C.ouroLume}44`, borderRadius: 6, overflow: 'hidden' }}>
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        style={{ padding: '8px 16px', background: 'transparent', color: C.brancoMineral, cursor: 'pointer', border: 'none', fontSize: 18 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.ouroLume}22`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >−</button>
      <div style={{ padding: '8px 20px', fontFamily: 'Inter Tight, sans-serif', color: C.brancoMineral, fontSize: 16, minWidth: 40, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {value}
      </div>
      <button
        onClick={() => onChange(Math.min(99, value + 1))}
        style={{ padding: '8px 16px', background: 'transparent', color: C.brancoMineral, cursor: 'pointer', border: 'none', fontSize: 18 }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = `${C.ouroLume}22`; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >+</button>
    </div>
  );
}

type ShippingOption = { name: string; price: string; days: string };

function ShippingCalculator() {
  const [cep, setCep] = useState(() => localStorage.getItem('salvita.cep') ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ShippingOption[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string>('');

  function formatCep(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  }

  async function calculate() {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) { setError('CEP inválido. Use o formato 00000-000.'); return; }
    setError('');
    setLoading(true);
    setResults(null);
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
    <div style={{ maxWidth: 900, margin: '0 auto', marginTop: 48 }}>
      <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 4 }}>CALCULAR FRETE</p>
      <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, color: `${C.brancoMineral}99`, marginBottom: 20 }}>Quanto custa trazer Mossoró até você? Digite seu CEP.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={cep}
          onChange={(e) => setCep(formatCep(e.target.value))}
          placeholder="00000-000"
          maxLength={9}
          style={{
            background: 'transparent', border: `1px solid ${C.ouroLume}44`, borderRadius: 6,
            padding: '10px 16px', color: C.brancoMineral, fontFamily: 'Inter Tight, sans-serif',
            fontSize: 15, width: 180, outline: 'none',
          }}
          onKeyDown={(e) => e.key === 'Enter' && calculate()}
        />
        <button
          onClick={calculate}
          disabled={loading}
          style={{
            background: C.ouroLume, color: C.sombraSalina, border: 'none', borderRadius: 6,
            padding: '10px 24px', fontFamily: 'Inter Tight, sans-serif', fontWeight: 600,
            fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >{loading ? 'Calculando…' : 'Calcular'}</button>
      </div>

      {error && (
        <p style={{ marginTop: 12, color: '#ff8080', fontFamily: 'Inter Tight, sans-serif', fontSize: 13 }}>{error}</p>
      )}

      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}
          >
            {results.map((opt) => (
              <div
                key={opt.name}
                onClick={() => setSelected(opt.name)}
                style={{
                  border: `1px solid ${selected === opt.name ? C.ouroLume : `${C.ouroLume}33`}`,
                  borderRadius: 8, padding: '14px 20px', cursor: 'pointer',
                  background: selected === opt.name ? `${C.ouroLume}18` : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 600, color: C.brancoMineral, margin: 0, fontSize: 14 }}>{opt.name}</p>
                <p style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: C.ouroLume, margin: '4px 0' }}>{opt.price}</p>
                <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, color: `${C.brancoMineral}66`, margin: 0 }}>{opt.days}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, color: `${C.brancoMineral}33`, marginTop: 16 }}>
        Despachamos em até 2 dias úteis a partir de Mossoró/RN. Integração via Melhor Envio.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [qty1, setQty1] = useState(1);
  const [qty10, setQty10] = useState(1);
  const heroRef = useRef<HTMLDivElement>(null);

  const { scrollY } = useScroll();
  const imgY = useTransform(scrollY, [0, 600], [0, -60]);
  const textY = useTransform(scrollY, [0, 600], [0, 40]);

  useEffect(() => {
    const unsub = scrollY.onChange((v) => setScrolled(v > 80));
    return unsub;
  }, [scrollY]);

  const price1Total = (29.9 * qty1).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const price10Total = (149 * qty10).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div style={{ fontFamily: 'Inter Tight, sans-serif', overflowX: 'hidden' }}>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -72 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          padding: '16px 48px',
          background: scrolled ? `${C.abismo}f0` : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? `1px solid ${C.ouroLume}22` : 'none',
          transition: 'background 0.4s, backdrop-filter 0.4s, border-color 0.4s',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 22, color: C.brancoMineral, fontWeight: 300 }}>Sal Vita</span>
          <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 10, letterSpacing: '0.15em', color: C.ouroLume, textTransform: 'uppercase', border: `1px solid ${C.ouroLume}66`, padding: '2px 8px', borderRadius: 3 }}>Premium</span>
        </div>
        <nav className="lp-nav-links" style={{ gap: 32 }}>
          {['Origem', 'Sabor', 'Comprar'].map((label) => (
            <a key={label} href={`#${label.toLowerCase()}`} style={{ color: `${C.brancoMineral}aa`, fontFamily: 'Inter Tight, sans-serif', fontSize: 13, letterSpacing: '0.05em', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = C.brancoMineral; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = `${C.brancoMineral}aa`; }}
            >{label}</a>
          ))}
        </nav>
        <a href="#comprar" style={{
          background: C.ouroLume, color: C.sombraSalina, textDecoration: 'none',
          padding: '8px 20px', borderRadius: 6, fontFamily: 'Inter Tight, sans-serif',
          fontWeight: 600, fontSize: 13, letterSpacing: '0.03em',
        }}>Comprar</a>
      </motion.nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section
        ref={heroRef}
        style={{
          minHeight: '100vh', position: 'relative', overflow: 'hidden',
          background: `radial-gradient(ellipse at 75% 50%, ${C.noiteMarinha} 0%, ${C.abismo} 55%, ${C.sombraSalina} 100%)`,
          display: 'flex', alignItems: 'center',
        }}
      >
        {/* Grain overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: grain, backgroundSize: '256px', mixBlendMode: 'overlay', opacity: 0.4, pointerEvents: 'none' }} />
        <Particles count={22} />

        <div className="lp-hero-grid" style={{ width: '100%', maxWidth: 1280, margin: '0 auto', padding: '120px 48px 80px', gap: 64, position: 'relative', zIndex: 1 }}>
          {/* Left column — text */}
          <motion.div style={{ y: textY }}>
            <Reveal>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.25em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 32 }}>── MOSSORÓ, RN · SAL MARINHO INTEGRAL</p>
            </Reveal>
            <Reveal d={0.1}>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(52px, 8vw, 96px)', fontWeight: 300, lineHeight: 1.05, color: C.brancoMineral, margin: '0 0 24px' }}>
                O mar não tem pressa.<br />
                <em style={{ color: C.ouroLume, fontStyle: 'italic' }}>Por isso tem sabor.</em>
              </h1>
            </Reveal>
            <Reveal d={0.2}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 22, color: `${C.brancoMineral}bb`, lineHeight: 1.6, maxWidth: 480, marginBottom: 40 }}>
                Sal integral colhido nas salinas do Rio Grande do Norte.<br />Não refinado, não branqueado, não apressado.
              </p>
            </Reveal>
            <Reveal d={0.3}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <a href="#comprar" style={{
                  background: C.ouroLume, color: C.sombraSalina, textDecoration: 'none',
                  padding: '16px 36px', borderRadius: 8, fontFamily: 'Inter Tight, sans-serif',
                  fontWeight: 700, fontSize: 15, letterSpacing: '0.02em',
                  transition: 'background 0.2s',
                }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}
                >Levar para minha cozinha</a>
                <a href="#origem" style={{
                  border: `1px solid rgba(244,239,230,0.25)`, color: `rgba(244,239,230,0.6)`,
                  textDecoration: 'none', padding: '16px 36px', borderRadius: 8,
                  fontFamily: 'Inter Tight, sans-serif', fontSize: 15, transition: 'color 0.2s, border-color 0.2s',
                }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = C.brancoMineral; el.style.borderColor = 'rgba(244,239,230,0.5)'; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.color = 'rgba(244,239,230,0.6)'; el.style.borderColor = 'rgba(244,239,230,0.25)'; }}
                >Conhecer a origem</a>
              </div>
            </Reveal>
          </motion.div>

          {/* Right column — product image */}
          <motion.div className="lp-hero-img" style={{ y: imgY, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle, ${C.ouroLume}22, transparent 70%)`, pointerEvents: 'none' }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.88, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <img
                  src="/embalagem.png"
                  alt="Embalagem Sal Vita Premium"
                  style={{ maxWidth: '100%', maxHeight: 480, filter: 'drop-shadow(0 32px 64px rgba(10,27,61,0.8))' }}
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement;
                    el.style.display = 'none';
                    const fallback = el.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                {/* Fallback when image doesn't exist */}
                <div style={{
                  display: 'none', width: 280, height: 380, borderRadius: 16,
                  background: `linear-gradient(160deg, ${C.noiteMarinha}, ${C.abismo})`,
                  border: `1px solid ${C.ouroLume}44`, alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', gap: 12,
                  boxShadow: '0 32px 64px rgba(10,27,61,0.8)',
                }}>
                  <span style={{ fontFamily: 'Fraunces, serif', fontSize: 56, color: C.ouroLume, fontWeight: 300 }}>SV</span>
                  <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: `${C.ouroLume}88`, textTransform: 'uppercase' }}>Sal Vita Premium</span>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
        >
          <svg width="20" height="32" viewBox="0 0 20 32" fill="none">
            <rect x="1" y="1" width="18" height="30" rx="9" stroke={`${C.brancoMineral}44`} strokeWidth="1.5" />
            <motion.rect x="8" y="6" width="4" height="8" rx="2" fill={C.ouroLume}
              animate={{ y: [0, 8, 0], opacity: [1, 0, 1] }} transition={{ duration: 2, repeat: Infinity }} />
          </svg>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.2em', color: `${C.brancoMineral}55`, textTransform: 'uppercase' }}>DESCOBRIR</span>
        </motion.div>
      </section>

      {/* ── POSICIONAMENTO ──────────────────────────────────────────────── */}
      <section style={{ background: C.brancoMineral, padding: '120px 48px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 48 }}>
            {/* Vertical gold line */}
            <motion.div
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              style={{ width: 1, minHeight: 120, background: C.ouroLume, transformOrigin: 'top', flexShrink: 0 }}
            />
            <div style={{ flex: 1 }}>
              <Reveal>
                <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 300, color: C.abismo, lineHeight: 1.1, marginBottom: 24 }}>
                  Não é um tempero.<br />É uma origem.
                </h2>
              </Reveal>
              <Reveal d={0.1}>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 20, color: `${C.abismo}bb`, lineHeight: 1.7, maxWidth: 640, marginBottom: 56 }}>
                  O Sal Vita Premium não passa por refinaria, branqueamento ou aditivos. O que chega até você é o mesmo cristal que o oceano depositou lentamente nas salinas de Mossoró — íntegro, mineral, com sabor próprio.
                </p>
              </Reveal>
              <Reveal d={0.2}>
                <div className="lp-stats-row">
                  {[
                    { num: '+80', label: 'Minerais naturais preservados' },
                    { num: '0',   label: 'Aditivos ou branqueadores' },
                    { num: '100%', label: 'Sal marinho de Mossoró, RN' },
                  ].map((s) => (
                    <div key={s.num}>
                      <p style={{ fontFamily: 'Fraunces, serif', fontSize: 56, color: C.ouroLume, fontWeight: 300, margin: 0, lineHeight: 1 }}>{s.num}</p>
                      <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${C.abismo}77`, marginTop: 8 }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── ORIGEM ──────────────────────────────────────────────────────── */}
      <section id="origem" style={{ background: C.abismo }}>
        <div className="lp-origin-grid" style={{ maxWidth: '100%' }}>
          {/* Left — visual */}
          <div style={{
            minHeight: 560, position: 'relative', overflow: 'hidden',
            background: `linear-gradient(135deg, ${C.ouroLume}33 0%, ${C.noiteMarinha} 40%, ${C.sombraSalina} 100%)`,
          }}>
            {/* Solar glow */}
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 300, height: 200, background: `radial-gradient(ellipse at center top, ${C.ouroLume}44, transparent 70%)`, pointerEvents: 'none' }} />
            {/* Salina reflection */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%', background: `linear-gradient(to top, ${C.ouroLume}22, transparent)` }} />
            {/* Horizontal lines */}
            {[20, 35, 50, 65, 80].map((pct, i) => (
              <motion.div
                key={pct}
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.4, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute', top: `${pct}%`, left: 0, right: 0,
                  height: 1, background: `${C.ouroLume}33`, transformOrigin: 'left',
                }}
              />
            ))}
            {/* Coordinates */}
            <div style={{ position: 'absolute', bottom: 24, left: 24 }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: `${C.ouroLume}88`, letterSpacing: '0.05em' }}>5°11′S 37°20′W · Mossoró, RN</span>
            </div>
          </div>

          {/* Right — text */}
          <div style={{ padding: '80px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Reveal>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 20 }}>── TERRITÓRIO DE ORIGEM</p>
            </Reveal>
            <Reveal d={0.1}>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(34px, 5vw, 56px)', fontWeight: 300, color: C.brancoMineral, lineHeight: 1.1, marginBottom: 28 }}>
                Onde o semiárido<br />
                <em style={{ color: C.ouroLume }}>encontra o oceano.</em>
              </h2>
            </Reveal>
            <Reveal d={0.2}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 21, color: `${C.brancoMineral}cc`, lineHeight: 1.7, marginBottom: 24 }}>
                Mossoró fica numa esquina improvável do Brasil: terra seca, sol implacável, vento que não descansa. Essa combinação cria nas salinas uma evaporação lenta e controlada — diferente de qualquer outro ponto do litoral.
              </p>
            </Reveal>
            <Reveal d={0.3}>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, color: `${C.brancoMineral}66`, lineHeight: 1.8, marginBottom: 36 }}>
                Evapora devagar. Concentra. Cristaliza. O que sobra, no fim do ciclo, é o que você tem em mãos — sem pressa industrial, sem processamento excessivo. Apenas o resultado do tempo e do clima.
              </p>
            </Reveal>
            <GoldLine />
            <Reveal d={0.4}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 20, color: C.ouroLume, marginTop: 28 }}>
                "O sal que o mar levou um ano para escrever."
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── POR QUE O SABOR MUDA ──────────────────────────────────────── */}
      <section id="sabor" style={{ background: C.abismo, padding: '120px 48px', borderTop: `1px solid ${C.ouroLume}18` }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <Reveal>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 12 }}>DIFERENÇA SENSORIAL</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 300, color: C.brancoMineral, maxWidth: 680, lineHeight: 1.15, marginBottom: 72 }}>
              Três coisas acontecem quando o sal é integral.
            </h2>
          </Reveal>

          <div className="lp-flavor-grid" style={{ gap: 0 }}>
            {[
              { n: '01', title: 'O grão tem geometria.', body: 'Cristais irregulares quebram em momentos diferentes na boca, criando camadas de sabor onde o sal refinado entrega só uma nota.' },
              { n: '02', title: 'O paladar percebe minério.', body: 'Mais de 80 minerais residuais conferem ao Sal Vita uma assinatura levemente mineral — algo que o sal de cozinha comum perdeu há décadas.' },
              { n: '03', title: 'Você usa menos.', body: 'Como cada grão libera mais sabor, a mão fica mais leve. O prato ganha definição sem ficar excessivamente salgado.' },
            ].map((card, i) => (
              <motion.div
                key={card.n}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.2, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  padding: '48px 40px', borderTop: `3px solid ${C.ouroLume}`,
                  borderRight: i < 2 ? `1px solid ${C.ouroLume}18` : 'none',
                }}
              >
                <p style={{ fontFamily: 'Fraunces, serif', fontSize: 108, fontWeight: 300, color: 'transparent', WebkitTextStroke: `1px ${C.ouroLume}55`, lineHeight: 1, marginBottom: 24 }}>{card.n}</p>
                <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 300, color: C.brancoMineral, marginBottom: 16, lineHeight: 1.2 }}>{card.title}</h3>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 18, color: `${C.brancoMineral}77`, lineHeight: 1.7 }}>{card.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRANSPARÊNCIA ───────────────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(160deg, ${C.noiteMarinha} 0%, ${C.sombraSalina} 100%)`, padding: '120px 48px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -32, left: '50%', transform: 'translateX(-50%)', fontFamily: 'Fraunces, serif', fontSize: 140, color: C.ouroLume, opacity: 0.12, lineHeight: 1, userSelect: 'none', pointerEvents: 'none' }}>"</div>
          <Reveal>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 16 }}>SEM PROMESSAS DE MARKETING</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 300, color: C.brancoMineral, marginBottom: 36, lineHeight: 1.1 }}>
              Vamos ser honestos com você.
            </h2>
          </Reveal>
          <Reveal d={0.2}>
            <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 23, color: `${C.brancoMineral}cc`, lineHeight: 1.75, marginBottom: 40 }}>
              Sal Vita Premium não cura nada, não emagrece ninguém e não substitui acompanhamento médico. O que fazemos é simples: trazemos para a sua cozinha o sal mais íntegro que Mossoró é capaz de produzir — sem exageros, sem promessas vazias.
            </p>
          </Reveal>
          <GoldLine />
          <Reveal d={0.3}>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: `${C.brancoMineral}44`, marginTop: 28 }}>
              Menos milagre de marketing. Mais origem, sabor e verdade.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── RITUAL DE USO ───────────────────────────────────────────────── */}
      <section style={{ background: C.brancoMineral, padding: '120px 0 120px 48px' }}>
        <div style={{ maxWidth: 1280, marginRight: 0, marginLeft: 'auto', paddingRight: 0 }}>
          <Reveal>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 12, paddingRight: 48 }}>RITUAL DE USO</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 300, color: C.abismo, marginBottom: 48, paddingRight: 48 }}>
              Seis lugares onde ele faz diferença.
            </h2>
          </Reveal>
        </div>

        <div
          className="lp-ritual-scroll"
          style={{ display: 'flex', gap: 20, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingRight: 48, paddingBottom: 8, marginLeft: 0 }}
        >
          {[
            { n: '01', label: 'Churrasco', desc: 'Finalize a carne fora do fogo, com os cristais maiores. Eles estalam.' },
            { n: '02', label: 'Saladas', desc: 'Quebre o cristal com os dedos sobre tomates maduros e azeite. É outra salada.' },
            { n: '03', label: 'Grelhados', desc: 'Pulverize antes de selar o peixe; a crosta forma textura própria.' },
            { n: '04', label: 'Massas', desc: 'Uma pitada na água do cozimento, outra na finalização. A massa ganha contorno.' },
            { n: '05', label: 'Finalização', desc: 'Sobre ovo cozido mole, abacate, manteiga gelada, chocolate amargo.' },
            { n: '06', label: 'Dia a dia', desc: 'Substitua o sal refinado. O feijão e o arroz vão te contar a diferença.' },
          ].map((card, i) => (
            <motion.div
              key={card.n}
              whileHover={{ y: -6 }}
              transition={{ duration: 0.3 }}
              style={{
                flexShrink: 0, width: 'clamp(260px, 30vw, 320px)', scrollSnapAlign: 'start',
                background: C.abismo, border: `1px solid ${C.ouroLume}18`,
                borderRadius: 12, padding: '36px 32px',
                borderTop: `3px solid ${C.ouroLume}`,
              }}
            >
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.6 }}
                style={{ fontFamily: 'Fraunces, serif', fontSize: 64, fontWeight: 300, color: 'transparent', WebkitTextStroke: `1px ${C.ouroLume}66`, lineHeight: 1, marginBottom: 20 }}
              >{card.n}</motion.p>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 600, fontSize: 16, color: C.brancoMineral, marginBottom: 12, letterSpacing: '0.03em' }}>{card.label}</p>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 17, color: `${C.brancoMineral}88`, lineHeight: 1.6 }}>{card.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── COMPRA + FRETE ──────────────────────────────────────────────── */}
      <section id="comprar" style={{ background: C.abismo, padding: '120px 48px' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 72 }}>
            <Reveal>
              <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 11, letterSpacing: '0.2em', color: C.ouroLume, textTransform: 'uppercase', marginBottom: 12 }}>ESCOLHA SEU RITUAL</p>
            </Reveal>
            <Reveal d={0.1}>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 300, color: C.brancoMineral, lineHeight: 1.15, marginBottom: 20 }}>
                Você não está comprando um pacote de sal.
              </h2>
            </Reveal>
            <Reveal d={0.2}>
              <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 20, color: `${C.brancoMineral}88`, maxWidth: 680, margin: '0 auto' }}>
                Está comprando 365 dias de sol, vento e oceano — colhidos nas salinas, embalados em Mossoró, entregues na sua porta.
              </p>
            </Reveal>
          </div>

          <div className="lp-purchase-grid" style={{ gap: 24, alignItems: 'start' }}>
            {/* Card 1kg */}
            <Reveal>
              <div style={{
                border: `1px solid ${C.ouroLume}33`, borderRadius: 16, padding: '48px 40px',
                background: `${C.noiteMarinha}44`,
              }}>
                <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, letterSpacing: '0.15em', color: `${C.brancoMineral}66`, textTransform: 'uppercase', marginBottom: 20 }}>Cristal · 1 kg</p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 8 }}>
                  <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 20, color: `${C.brancoMineral}88`, marginTop: 12 }}>R$</span>
                  <span style={{ fontFamily: 'Fraunces, serif', fontSize: 64, fontWeight: 300, color: C.brancoMineral, lineHeight: 1 }}>29,90</span>
                </div>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 18, color: `${C.brancoMineral}66`, marginBottom: 28 }}>Para começar a conversa.</p>
                <GoldLine />
                <ul style={{ listStyle: 'none', padding: 0, margin: '28px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {['Embalagem premium azul e dourado', 'Rendimento médio de 2–3 meses', 'Fechamento hermético'].map((f) => (
                    <li key={f} style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, color: `${C.brancoMineral}88` }}>
                      <span style={{ color: C.ouroLume, marginRight: 10 }}>──</span>{f}
                    </li>
                  ))}
                </ul>
                <GoldLine />
                <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <QtySelector value={qty1} onChange={setQty1} />
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, color: `${C.brancoMineral}88`, margin: 0 }}>Total: <strong style={{ color: C.brancoMineral }}>{price1Total}</strong></p>
                  <button style={{
                    border: `1px solid ${C.ouroLume}`, color: C.ouroLume, background: 'transparent',
                    padding: '14px 24px', borderRadius: 8, fontFamily: 'Inter Tight, sans-serif',
                    fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s',
                  }}
                    onMouseEnter={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = C.ouroLume; el.style.color = C.sombraSalina; }}
                    onMouseLeave={(e) => { const el = e.currentTarget as HTMLElement; el.style.background = 'transparent'; el.style.color = C.ouroLume; }}
                  >Levar {qty1} kg</button>
                </div>
              </div>
            </Reveal>

            {/* Card 10kg — destaque */}
            <Reveal d={0.1}>
              <div style={{
                border: `1px solid ${C.ouroLume}`, borderRadius: 16, padding: '48px 40px',
                background: `linear-gradient(160deg, ${C.noiteMarinha}, ${C.abismo})`,
                position: 'relative', overflow: 'hidden',
                boxShadow: `0 0 80px ${C.ouroLume}18`,
              }}>
                {/* Glow */}
                <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: `radial-gradient(circle, ${C.ouroLume}22, transparent 70%)`, pointerEvents: 'none' }} />

                {/* Badge */}
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  background: C.ouroLume, color: C.sombraSalina, padding: '4px 20px',
                  fontFamily: 'Inter Tight, sans-serif', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: '0 0 8px 8px',
                }}>MELHOR ESCOLHA</div>

                <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, letterSpacing: '0.15em', color: `${C.brancoMineral}66`, textTransform: 'uppercase', marginBottom: 20, marginTop: 16 }}>Caixa Cristal · 10 kg</p>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 8 }}>
                  <span style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 20, color: `${C.brancoMineral}88`, marginTop: 12 }}>R$</span>
                  <span style={{ fontFamily: 'Fraunces, serif', fontSize: 64, fontWeight: 300, color: C.ouroClaro, lineHeight: 1 }}>149,00</span>
                </div>
                <p style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 18, color: `${C.brancoMineral}66`, marginBottom: 20 }}>Para quem já não volta atrás.</p>

                {/* Economia callout */}
                <div style={{ border: `1px solid ${C.ouroLume}33`, background: `${C.ouroLume}18`, borderRadius: 8, padding: '14px 18px', marginBottom: 28 }}>
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, color: C.ouroClaro, margin: '0 0 4px', fontWeight: 600 }}>Equivale a R$ 14,90/kg — metade do preço avulso</p>
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 12, color: `${C.ouroLume}aa`, margin: 0 }}>Economia de R$ 150,00 vs. 10 unidades</p>
                </div>

                <GoldLine />
                <ul style={{ listStyle: 'none', padding: 0, margin: '28px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {['Caixa colecionável azul abismo', 'Estoque para o ano inteiro', 'Frete otimizado por volume', 'Garantia de origem Mossoró'].map((f) => (
                    <li key={f} style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, color: `${C.brancoMineral}88` }}>
                      <span style={{ color: C.ouroLume, marginRight: 10 }}>──</span>{f}
                    </li>
                  ))}
                </ul>
                <GoldLine />
                <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <QtySelector value={qty10} onChange={setQty10} />
                  <p style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, color: `${C.brancoMineral}88`, margin: 0 }}>Total: <strong style={{ color: C.brancoMineral }}>{price10Total}</strong></p>
                  <button style={{
                    background: C.ouroLume, color: C.sombraSalina, border: 'none',
                    padding: '16px 24px', borderRadius: 8, fontFamily: 'Inter Tight, sans-serif',
                    fontWeight: 700, fontSize: 15, cursor: 'pointer', transition: 'background 0.2s',
                  }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}
                  >Reservar minha caixa</button>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Shipping calculator */}
          <ShippingCalculator />
        </div>
      </section>

      {/* ── FRASE FINAL ─────────────────────────────────────────────────── */}
      <section style={{ background: C.sombraSalina, padding: '140px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <Particles count={18} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Reveal>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.2em', color: `${C.ouroLume}88`, textTransform: 'uppercase', marginBottom: 48 }}>SAL VITA PREMIUM · MOSSORÓ, BRASIL</p>
          </Reveal>
          <Reveal d={0.1}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 300, color: C.brancoMineral, lineHeight: 1.15, marginBottom: 56 }}>
              O mar levou um ano.<br />
              <em style={{ color: C.ouroLume }}>Você leva um instante.</em>
            </h2>
          </Reveal>
          <Reveal d={0.2}>
            <a href="#comprar" style={{
              background: C.ouroLume, color: C.sombraSalina, textDecoration: 'none',
              padding: '18px 48px', borderRadius: 8, fontFamily: 'Inter Tight, sans-serif',
              fontWeight: 700, fontSize: 16, letterSpacing: '0.02em', display: 'inline-block',
              transition: 'background 0.2s',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroClaro; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = C.ouroLume; }}
            >Trazer o mar para a mesa</a>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{
        background: C.sombraSalina, borderTop: `1px solid ${C.ouroLume}18`,
        padding: '32px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
      }}>
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
