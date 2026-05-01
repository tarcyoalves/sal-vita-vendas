import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── tokens ─────────────────────────────────────────────────────────────── */
const navy   = '#0A1B3D';
const deep   = '#061027';
const mid    = '#0F2A57';
const gold   = '#C9A04A';
const goldLt = '#E8C77A';
const cream  = '#F4EFE6';
const brand  = '#1B3D8F';

/* ─── one-time entrance variant ─────────────────────────────────────────── */
const up = (d = 0) => ({
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.8, delay: d, ease: [0.16, 1, 0.3, 1] as const },
});

/* ─── CSS injected once ─────────────────────────────────────────────────── */
const STYLES = `
  @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
  @keyframes shimmer{ 0%{opacity:.4} 50%{opacity:.8} 100%{opacity:.4} }
  .lp-float { animation: float 7s ease-in-out infinite; }
  .lp-nav-links a {
    color:rgba(244,239,230,.6); font:13px/1 'Inter Tight',sans-serif;
    letter-spacing:.04em; text-decoration:none; transition:color .2s;
  }
  .lp-nav-links a:hover { color:${cream}; }
  .lp-btn-gold {
    background:${gold}; color:${deep}; border:none;
    font:700 15px/1 'Inter Tight',sans-serif; padding:15px 36px;
    border-radius:10px; cursor:pointer; text-decoration:none;
    display:inline-block; transition:background .2s;
  }
  .lp-btn-gold:hover { background:${goldLt}; }
  .lp-btn-outline {
    border:1px solid rgba(244,239,230,.22); color:rgba(244,239,230,.65);
    font:500 14px/1 'Inter Tight',sans-serif; padding:15px 32px;
    border-radius:10px; cursor:pointer; text-decoration:none;
    display:inline-block; transition:all .2s; background:none;
  }
  .lp-btn-outline:hover { border-color:rgba(244,239,230,.5); color:${cream}; }
  .lp-photo-bg {
    position:absolute; inset:0; width:100%; height:100%;
    object-fit:cover; object-position:center;
  }
  /* Responsive grid helpers */
  @media(min-width:900px){
    .lp-hero-grid   { display:grid; grid-template-columns:1fr 1fr; align-items:center; }
    .lp-origin-grid { display:grid; grid-template-columns:1fr 1fr; }
    .lp-purchase-grid{ display:grid; grid-template-columns:1fr 1fr; }
    .lp-flavor-grid  { display:grid; grid-template-columns:repeat(3,1fr); }
    .lp-gallery-grid { display:grid; grid-template-columns:repeat(3,1fr); }
    .lp-stats-row    { display:flex; }
    .lp-nav-links    { display:flex !important; }
    .lp-hero-img     { display:flex !important; }
  }
  @media(max-width:900px){
    .lp-hero-grid,.lp-origin-grid,.lp-purchase-grid,.lp-flavor-grid,.lp-gallery-grid{display:block;}
    .lp-stats-row    { display:flex; flex-wrap:wrap; gap:32px; }
    .lp-nav-links,.lp-hero-img { display:none; }
    .lp-ritual-scroll { padding-right:24px !important; }
  }
  @media(max-width:768px){
    .lp-stats-row { justify-content:center; }
  }
`;

/* ─── gold divider ──────────────────────────────────────────────────────── */
function GoldLine() {
  return (
    <motion.div {...up()} style={{
      height: 1, margin: '2px 0',
      background: `linear-gradient(90deg,transparent,${gold},transparent)`,
    }} />
  );
}

/* ─── full-bleed photo section wrapper ─────────────────────────────────── */
/* photoId = Unsplash photo ID (from unsplash.com/photos/{slug}-{ID})      */
/* source.unsplash.com/{ID}/WxH redirects to the specific licensed photo.  */
/* For production: replace with your own licensed artisanal photography.   */
function PhotoBg({ photoId, fallbackGradient, children, overlay = `${deep}CC` }: {
  photoId: string;
  fallbackGradient?: string;
  children: React.ReactNode;
  overlay?: string;
}) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: imgErr ? (fallbackGradient ?? `linear-gradient(135deg,${deep},${navy})`) : undefined,
    }}>
      {!imgErr && (
        <img
          className="lp-photo-bg"
          src={`https://source.unsplash.com/${photoId}/1920x1080`}
          alt=""
          loading="lazy"
          onError={() => setImgErr(true)}
        />
      )}
      {/* Dark gradient overlay — ensures text legibility regardless of photo */}
      <div style={{ position: 'absolute', inset: 0, background: overlay }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

/* ─── product bag / embalagem ───────────────────────────────────────────── */
/* Add client/public/embalagem.png to show the real product photo.         */
function Bag({ size = 400 }: { size?: number }) {
  const [err, setErr] = useState(false);
  if (err) return (
    <div style={{
      width: size, maxWidth: '100%', aspectRatio: '3/4',
      background: `linear-gradient(160deg,${brand},${mid},${navy})`,
      borderRadius: 20, border: `1px solid ${gold}55`,
      boxShadow: `0 40px 80px ${deep}cc,0 0 60px ${gold}18`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, padding: 32,
    }}>
      <img src="/sal-vita-logo.svg" alt="" style={{ width: 120, filter: 'brightness(0) invert(1)', opacity: .9 }} onError={() => {}} />
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: 'Fraunces,serif', fontSize: 28, color: cream, fontWeight: 300, margin: 0 }}>Premium</p>
        <p style={{ fontFamily: 'Inter Tight,sans-serif', fontSize: 11, letterSpacing: '.2em', color: gold, textTransform: 'uppercase', margin: '8px 0 0' }}>Sal Integral · Mossoró</p>
      </div>
      <div style={{ border: `1px solid ${gold}44`, borderRadius: 60, padding: '8px 18px' }}>
        <span style={{ fontFamily: 'Fraunces,serif', fontSize: 22, color: goldLt }}>1 kg</span>
      </div>
    </div>
  );
  return (
    <img src="/embalagem.png" alt="Sal Vita Premium 1kg" onError={() => setErr(true)}
      style={{ width: size, maxWidth: '100%', filter: `drop-shadow(0 40px 80px ${deep}cc) drop-shadow(0 0 40px ${gold}22)`, display: 'block' }} />
  );
}

/* ─── frete ─────────────────────────────────────────────────────────────── */
type ShipOpt = { name: string; price: string; days: string };
function Frete() {
  const [cep, setCep] = useState(() => localStorage.getItem('sv.cep') ?? '');
  const [state, setState] = useState<'idle'|'loading'|'done'|'err'>('idle');
  const [opts, setOpts] = useState<ShipOpt[]>([]);
  const [sel, setSel] = useState('');
  const fmt = (v: string) => { const d = v.replace(/\D/g,'').slice(0,8); return d.length>5?`${d.slice(0,5)}-${d.slice(5)}`:d; };
  const calc = useCallback(async () => {
    if (cep.replace(/\D/g,'').length !== 8) { setState('err'); return; }
    setState('loading'); localStorage.setItem('sv.cep', cep);
    await new Promise(r => setTimeout(r, 1200));
    setOpts([
      { name:'Mini Envios', price:'R$ 18,50', days:'10–15 dias úteis' },
      { name:'PAC',         price:'R$ 24,90', days:'8–12 dias úteis'  },
      { name:'SEDEX',       price:'R$ 49,90', days:'3–5 dias úteis'   },
    ]);
    setState('done');
  }, [cep]);
  return (
    <div style={{ marginTop: 40, paddingTop: 32, borderTop: `1px solid ${gold}22` }}>
      <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase', margin:'0 0 6px' }}>CALCULAR FRETE</p>
      <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:16, color:`${cream}88`, margin:'0 0 16px' }}>Quanto custa trazer Mossoró até você?</p>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <input value={cep} onChange={e=>setCep(fmt(e.target.value))} placeholder="00000-000" maxLength={9}
          onKeyDown={e=>e.key==='Enter'&&calc()}
          style={{ background:'transparent', border:`1px solid ${gold}44`, borderRadius:8, padding:'10px 14px', color:cream, fontFamily:'Inter Tight,sans-serif', fontSize:14, width:160, outline:'none' }} />
        <button onClick={calc} disabled={state==='loading'} className="lp-btn-gold"
          style={{ padding:'10px 22px', fontSize:14, opacity:state==='loading'?.6:1 }}>
          {state==='loading'?'Calculando…':'Calcular'}
        </button>
      </div>
      {state==='err'&&<p style={{ color:'#ff8080', fontFamily:'Inter Tight,sans-serif', fontSize:12, marginTop:8 }}>CEP inválido.</p>}
      <AnimatePresence>
        {state==='done'&&(
          <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0}}
            style={{ display:'flex', gap:10, marginTop:16, flexWrap:'wrap' }}>
            {opts.map(o=>(
              <div key={o.name} onClick={()=>setSel(o.name)}
                style={{ border:`1px solid ${sel===o.name?gold:`${gold}33`}`, borderRadius:10, padding:'12px 18px', cursor:'pointer', background:sel===o.name?`${gold}18`:'transparent', transition:'all .2s' }}>
                <p style={{ fontFamily:'Inter Tight,sans-serif', fontWeight:600, fontSize:13, color:cream, margin:0 }}>{o.name}</p>
                <p style={{ fontFamily:'Fraunces,serif', fontSize:20, color:gold, margin:'4px 0' }}>{o.price}</p>
                <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, color:`${cream}66`, margin:0 }}>{o.days}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:10, color:`${cream}33`, marginTop:12 }}>
        Despachamos em até 2 dias úteis a partir de Mossoró/RN.
      </p>
    </div>
  );
}

/* ─── qty ───────────────────────────────────────────────────────────────── */
function Qty({ val, set }: { val:number; set:(n:number)=>void }) {
  const s: React.CSSProperties = { background:'none', border:'none', color:cream, fontSize:20, padding:'8px 16px', cursor:'pointer' };
  return (
    <div style={{ display:'inline-flex', border:`1px solid ${gold}44`, borderRadius:8, overflow:'hidden' }}>
      <button style={s} onClick={()=>set(Math.max(1,val-1))}>−</button>
      <span style={{ fontFamily:'Inter Tight,sans-serif', fontSize:15, color:cream, padding:'8px 20px', borderLeft:`1px solid ${gold}22`, borderRight:`1px solid ${gold}22`, minWidth:44, textAlign:'center' }}>{val}</span>
      <button style={s} onClick={()=>set(Math.min(99,val+1))}>+</button>
    </div>
  );
}

/* ─── food photo card ───────────────────────────────────────────────────── */
function FoodCard({ photoId, n, l, d, fallback }: { photoId:string; n:string; l:string; d:string; fallback:string }) {
  const [err, setErr] = useState(false);
  return (
    <div style={{
      flexShrink: 0,
      width: 'clamp(240px,27vw,295px)',
      scrollSnapAlign: 'start',
      borderRadius: 14,
      overflow: 'hidden',
      position: 'relative',
      minHeight: 340,
      background: err ? fallback : deep,
    }}>
      {!err && (
        <img
          src={`https://source.unsplash.com/${photoId}/600x800`}
          alt={l}
          loading="lazy"
          onError={() => setErr(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: err
        ? `linear-gradient(135deg,#2a1a0a,#5a3010)`
        : `linear-gradient(to top, ${deep}F2 0%, ${deep}99 50%, transparent 100%)` }} />
      <div style={{ position: 'relative', padding: '28px 24px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <p style={{ fontFamily:'Fraunces,serif', fontSize:44, fontWeight:300, color:'transparent', WebkitTextStroke:`1px ${gold}66`, lineHeight:1, margin:'0 0 12px' }}>{n}</p>
        <p style={{ fontFamily:'Inter Tight,sans-serif', fontWeight:600, fontSize:15, color:cream, margin:'0 0 6px' }}>{l}</p>
        <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:14, color:`${cream}99`, lineHeight:1.5, margin:0 }}>{d}</p>
      </div>
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  const [solid, setSolid] = useState(false);
  const [q1, setQ1] = useState(1);
  const [q10, setQ10] = useState(1);

  useEffect(() => {
    const fn = () => setSolid(window.scrollY > 60);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const p1  = (29.9  * q1 ).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const p10 = (149   * q10).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

  return (
    <>
      <style>{STYLES}</style>

      {/* ── NAV ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        padding: '14px 48px',
        background: solid ? `${deep}f2` : 'transparent',
        backdropFilter: solid ? 'blur(16px)' : 'none',
        borderBottom: solid ? `1px solid ${gold}22` : 'none',
        transition: 'all .35s',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ display:'flex', alignItems:'center', gap:10, textDecoration:'none' }}>
          <img src="/sal-vita-logo.svg" alt="Sal Vita" style={{ height:38, filter:'brightness(0) invert(1)', opacity:.9 }} />
          <span style={{ fontFamily:'Inter Tight,sans-serif', fontSize:10, letterSpacing:'.15em', color:gold, border:`1px solid ${gold}55`, padding:'2px 8px', borderRadius:3 }}>PREMIUM</span>
        </a>
        <nav className="lp-nav-links" style={{ display:'flex', gap:32 }}>
          {['Origem','Produto','Usos','Comprar'].map(l=>(
            <a key={l} href={`#${l.toLowerCase()}`}>{l}</a>
          ))}
        </nav>
        <a href="#comprar" className="lp-btn-gold" style={{ padding:'9px 22px', fontSize:13 }}>Comprar agora</a>
      </header>

      {/* ── HERO — aerial salt flat near ocean: source.unsplash.com/cF5vzFQ_OEk ── */}
      {/* For production: replace with licensed coastal salina photo of your choice */}
      <PhotoBg
        photoId="cF5vzFQ_OEk"
        fallbackGradient={`radial-gradient(ellipse at 65% 45%, ${mid}, ${navy}, ${deep})`}
        overlay={`linear-gradient(105deg, ${deep}F5 0%, ${deep}CC 40%, ${navy}88 70%, ${mid}44 100%)`}
      >
        <div className="lp-hero-grid" style={{ width:'100%', maxWidth:1320, margin:'0 auto', padding:'130px 48px 90px', gap:56 }}>
          {/* copy */}
          <div>
            <motion.div {...up()}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:8, border:`1px solid ${gold}44`, borderRadius:40, padding:'6px 16px', marginBottom:28 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:gold, display:'block' }} />
                <span style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase' }}>Mossoró, RN · Sal Marinho Integral</span>
              </span>
            </motion.div>

            <motion.h1 {...up(.08)} style={{ fontFamily:'Fraunces,serif', fontSize:'clamp(44px,6.5vw,90px)', fontWeight:300, lineHeight:1.05, color:cream, margin:'0 0 22px' }}>
              O mar não tem pressa.<br />
              <em style={{ color:gold }}>Por isso tem sabor.</em>
            </motion.h1>

            <motion.p {...up(.16)} style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:21, color:`${cream}bb`, lineHeight:1.65, maxWidth:500, margin:'0 0 36px' }}>
              Sal integral colhido nas salinas do Rio Grande do Norte. Não refinado, não branqueado, não apressado.
            </motion.p>

            <motion.div {...up(.22)} style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:44 }}>
              <a href="#comprar" className="lp-btn-gold">Levar para minha cozinha</a>
              <a href="#origem"  className="lp-btn-outline">Conhecer a origem</a>
            </motion.div>

            <motion.div {...up(.28)} style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
              {['+80 minerais naturais','Não refinado','0 aditivos','Mossoró, RN'].map(t=>(
                <span key={t} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:12, color:`${cream}55`, letterSpacing:'.04em' }}>
                  <span style={{ color:`${gold}88`, marginRight:6 }}>◆</span>{t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* product float */}
          <motion.div className="lp-hero-img" {...up(.1)} style={{ display:'flex', justifyContent:'center', position:'relative' }}>
            <div style={{ position:'absolute', inset:-40, background:`radial-gradient(circle, ${brand}55 0%, ${gold}18 45%, transparent 70%)`, pointerEvents:'none' }} />
            <div className="lp-float">
              <Bag size={440} />
            </div>
          </motion.div>
        </div>

        {/* scroll hint */}
        <div style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8, paddingBottom:28 }}>
          <svg width="20" height="32" viewBox="0 0 20 32">
            <rect x="1" y="1" width="18" height="30" rx="9" stroke={`${cream}44`} strokeWidth="1.5" fill="none" />
            <rect x="8" y="6" width="4" height="10" rx="2" fill={gold} style={{ animation:'float 2.2s ease-in-out infinite', transformOrigin:'center 11px' }} />
          </svg>
          <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:9, letterSpacing:'.2em', color:`${cream}44`, textTransform:'uppercase' }}>ROLAR</span>
        </div>
      </PhotoBg>

      {/* ── STATS BAR ── */}
      <section style={{ background:cream, padding:'64px 48px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div className="lp-stats-row" style={{ justifyContent:'space-around', textAlign:'center' }}>
            {[
              { n:'+80', label:'Minerais naturais preservados' },
              { n:'0',   label:'Aditivos ou branqueadores' },
              { n:'100%',label:'Sal marinho de Mossoró, RN' },
              { n:'2–3', label:'Meses de rendimento por kg' },
            ].map((s,i)=>(
              <motion.div key={s.n} {...up(i*.1)}>
                <p style={{ fontFamily:'Fraunces,serif', fontSize:'clamp(44px,5.5vw,72px)', fontWeight:300, color:gold, margin:0, lineHeight:1 }}>{s.n}</p>
                <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.12em', textTransform:'uppercase', color:`${navy}77`, marginTop:10 }}>{s.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ORIGEM — photo left panel, text right ── */}
      {/* Replace picsum seed with a licensed salina/artisanal harvest photo */}
      <section id="origem">
        <div className="lp-origin-grid">
          {/* photo left — aerial view of salt flat near ocean */}
          {/* source.unsplash.com/AZFNCj3jhdk — "An aerial view of a large salt flat near the ocean" */}
          <div style={{ minHeight:520, position:'relative', overflow:'hidden' }}>
            <img
              className="lp-photo-bg"
              src="https://source.unsplash.com/AZFNCj3jhdk/900x1100"
              alt="Salinas de Mossoró, RN"
              loading="lazy"
            />
            <div style={{ position:'absolute', inset:0, background:`linear-gradient(to right, transparent 70%, ${navy}FF)` }} />
            {/* coordinates badge */}
            <div style={{ position:'absolute', bottom:24, left:24, background:`${deep}CC`, backdropFilter:'blur(8px)', border:`1px solid ${gold}33`, borderRadius:8, padding:'8px 14px' }}>
              <p style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, color:gold, margin:0 }}>5°11′S 37°20′W</p>
              <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:10, color:`${cream}66`, margin:'2px 0 0', letterSpacing:'.1em' }}>MOSSORÓ · RN · BRASIL</p>
            </div>
          </div>

          {/* text right */}
          <div style={{ background:navy, padding:'72px 56px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
            <motion.p {...up()} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase', margin:'0 0 18px' }}>── TERRITÓRIO DE ORIGEM</motion.p>
            <motion.h2 {...up(.1)} style={{ fontFamily:'Fraunces,serif', fontSize:'clamp(28px,4vw,50px)', fontWeight:300, color:cream, lineHeight:1.1, margin:'0 0 22px' }}>
              Onde o semiárido<br /><em style={{ color:gold }}>encontra o oceano.</em>
            </motion.h2>
            <motion.p {...up(.18)} style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:20, color:`${cream}cc`, lineHeight:1.7, margin:'0 0 18px' }}>
              Mossoró fica numa esquina improvável do Brasil: terra seca, sol implacável, vento que não descansa. Essa combinação cria uma evaporação lenta e única.
            </motion.p>
            <motion.p {...up(.24)} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:14, color:`${cream}66`, lineHeight:1.8, margin:'0 0 32px' }}>
              Evapora devagar. Concentra. Cristaliza. Sem pressa industrial, sem aditivos. Apenas tempo, sol e oceano.
            </motion.p>
            <GoldLine />
            <motion.p {...up(.3)} style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:19, color:gold, margin:'24px 0 0' }}>
              "O sal que o mar levou um ano para escrever."
            </motion.p>
          </div>
        </div>
      </section>

      {/* ── PRODUTO EM DESTAQUE — pile of sea salt crystals background ── */}
      {/* source.unsplash.com/r-gupb4r0ZM — "A pile of sea salt next to a small piece of stone" */}
      <section id="produto">
        <PhotoBg
          photoId="r-gupb4r0ZM"
          fallbackGradient={`linear-gradient(155deg,${mid},${deep})`}
          overlay={`linear-gradient(155deg, ${deep}EE 0%, ${mid}DD 100%)`}
        >
          <div style={{ maxWidth:1280, margin:'0 auto', padding:'96px 48px', display:'flex', gap:80, alignItems:'center', flexWrap:'wrap' }}>
            <motion.div {...up()} style={{ flex:'0 0 auto' }}>
              <Bag size={360} />
            </motion.div>
            <div style={{ flex:1, minWidth:280 }}>
              <motion.p {...up()} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase', margin:'0 0 14px' }}>SAL VITA PREMIUM · 1 KG</motion.p>
              <motion.h2 {...up(.08)} style={{ fontFamily:'Fraunces,serif', fontStyle:'italic', fontSize:'clamp(28px,4vw,52px)', fontWeight:300, color:cream, lineHeight:1.1, margin:'0 0 28px' }}>
                Muito mais sabor,<br /><em style={{ color:gold }}>em cada pitada.</em>
              </motion.h2>
              <div style={{ display:'flex', flexDirection:'column', gap:18, marginBottom:36 }}>
                {[
                  ['◈','Cristal irregular','Quebra em momentos diferentes — camadas de sabor onde o refinado entrega só uma nota.'],
                  ['◉','+80 minerais','Assinatura mineral que o sal de cozinha comum perdeu há décadas.'],
                  ['◌','Use menos','Cada grão libera mais sabor. A mão fica mais leve.'],
                  ['◍','Sem aditivos','Não branqueado, não refinado. Direto da salina para a sua cozinha.'],
                ].map(([icon,title,body],i)=>(
                  <motion.div key={title} {...up(i*.08)} style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                    <span style={{ fontFamily:'Fraunces,serif', fontSize:22, color:gold, lineHeight:1, marginTop:2 }}>{icon}</span>
                    <div>
                      <p style={{ fontFamily:'Inter Tight,sans-serif', fontWeight:600, fontSize:14, color:cream, margin:'0 0 3px' }}>{title}</p>
                      <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:16, color:`${cream}77`, margin:0, lineHeight:1.5 }}>{body}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <GoldLine />
              <motion.div {...up(.4)} style={{ marginTop:28 }}>
                <a href="#comprar" className="lp-btn-gold">Ver preços e opções</a>
              </motion.div>
            </div>
          </div>
        </PhotoBg>
      </section>

      {/* ── 3 RAZÕES ── */}
      <section style={{ background:cream, padding:'96px 48px' }}>
        <div style={{ maxWidth:1280, margin:'0 auto' }}>
          <motion.p {...up()} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase', margin:'0 0 10px' }}>DIFERENÇA SENSORIAL</motion.p>
          <motion.h2 {...up(.08)} style={{ fontFamily:'Fraunces,serif', fontSize:'clamp(28px,4.5vw,54px)', fontWeight:300, color:navy, maxWidth:580, lineHeight:1.15, margin:'0 0 56px' }}>
            Três coisas acontecem quando o sal é integral.
          </motion.h2>
          <div className="lp-flavor-grid" style={{ gap:0 }}>
            {[
              { n:'01', t:'O grão tem geometria.', b:'Cristais irregulares quebram em momentos diferentes na boca, criando camadas de sabor.', c:brand },
              { n:'02', t:'O paladar percebe minério.', b:'Mais de 80 minerais residuais conferem uma assinatura levemente mineral que o sal comum perdeu.', c:gold },
              { n:'03', t:'Você usa menos.', b:'Como cada grão libera mais sabor, a mão fica mais leve. O prato ganha definição.', c:brand },
            ].map((card,i)=>(
              <motion.div key={card.n} {...up(i*.12)} style={{ padding:'44px 36px', borderTop:`3px solid ${card.c}`, borderRight:i<2?`1px solid ${navy}18`:'none' }}>
                <p style={{ fontFamily:'Fraunces,serif', fontSize:88, fontWeight:300, color:'transparent', WebkitTextStroke:`1px ${card.c}44`, lineHeight:1, margin:'0 0 18px' }}>{card.n}</p>
                <h3 style={{ fontFamily:'Fraunces,serif', fontSize:24, fontWeight:300, color:navy, margin:'0 0 12px', lineHeight:1.2 }}>{card.t}</h3>
                <p style={{ fontFamily:'Cormorant Garamond,serif', fontSize:17, color:`${navy}77`, lineHeight:1.7, margin:0 }}>{card.b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GALERIA VISUAL — 3 gourmet food photo panels ── */}
      <section style={{ background:deep }}>
        <div className="lp-gallery-grid" style={{ gap:2 }}>
          {[
            /* m1YOztVo6MA — "A close up of a grill with meat and lemons" */
            { photoId:'m1YOztVo6MA', label:'Finalização de carnes', sub:'O cristal estala no calor' },
            /* N8-bMqUMS8g — "Grilled fish with vegetable salad on white ceramic plate" */
            { photoId:'N8-bMqUMS8g', label:'Frutos do mar', sub:'Salga a seco antes de grelhar' },
            /* LN19x--Aacw — "A person holding a bowl of salad with lettuce and tomatoes" */
            { photoId:'LN19x--Aacw', label:'Vegetais e saladas', sub:'Quebre com os dedos, ao vivo' },
          ].map((p,i)=>(
            <motion.div key={p.photoId} {...up(i*.1)} style={{ position:'relative', overflow:'hidden', minHeight:380 }}>
              <img
                src={`https://source.unsplash.com/${p.photoId}/700x900`}
                alt={p.label}
                loading="lazy"
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transition:'transform .5s ease' }}
                onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.04)')}
                onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}
              />
              <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, ${deep}F0 0%, transparent 55%)` }} />
              <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'28px 24px' }}>
                <p style={{ fontFamily:'Inter Tight,sans-serif', fontWeight:600, fontSize:15, color:cream, margin:'0 0 4px' }}>{p.label}</p>
                <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:14, color:`${cream}88`, margin:0 }}>{p.sub}</p>
              </div>
              {/* gold top border accent */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:gold, opacity:.6 }} />
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── RITUAL — scrollable food cards with photos ── */}
      <section id="usos" style={{ background:navy, padding:'96px 0 96px 48px' }}>
        <motion.p {...up()} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase', margin:'0 0 10px', paddingRight:48 }}>RITUAL DE USO</motion.p>
        <motion.h2 {...up(.08)} style={{ fontFamily:'Fraunces,serif', fontStyle:'italic', fontSize:'clamp(28px,4vw,50px)', fontWeight:300, color:cream, margin:'0 0 40px', paddingRight:48 }}>
          Seis lugares onde ele faz diferença.
        </motion.h2>
        <div className="lp-ritual-scroll" style={{ display:'flex', gap:18, overflowX:'auto', scrollSnapType:'x mandatory', paddingRight:48, paddingBottom:8 }}>
          {[
            /* iceGP331_sY — "A steak is cooking on a bbq grill" */
            { photoId:'iceGP331_sY',    fallback:`linear-gradient(135deg,#3D1A0A,#8B3A12)`, n:'01', l:'Churrasco',   d:'Finalize a carne fora do fogo com os cristais maiores. Eles estalam.' },
            /* LN19x--Aacw — "Bowl of salad with lettuce and tomatoes" */
            { photoId:'LN19x--Aacw',    fallback:`linear-gradient(135deg,#1A3D0A,#2D6B10)`, n:'02', l:'Saladas',     d:'Quebre o cristal com os dedos sobre tomates maduros e azeite.' },
            /* 3_M4NxDo89A — "Fish being grilled" */
            { photoId:'3_M4NxDo89A',    fallback:`linear-gradient(135deg,#0A2A3D,#0F4A6B)`, n:'03', l:'Grelhados',   d:'Pulverize antes de selar o peixe; a crosta forma textura própria.' },
            /* QuFm328PV88 — "Bowl of pasta" */
            { photoId:'QuFm328PV88',    fallback:`linear-gradient(135deg,#3D2A0A,#7A5215)`, n:'04', l:'Massas',      d:'Uma pitada na água do cozimento, outra na finalização.' },
            /* pFpPRuR4pd4 — "Brown and black stones" (himalaya salt close-up) */
            { photoId:'pFpPRuR4pd4',    fallback:`linear-gradient(135deg,#2A0A3D,#5515AA)`, n:'05', l:'Finalização', d:'Sobre ovo mole, abacate, manteiga gelada, chocolate amargo.' },
            /* r-gupb4r0ZM — "Pile of sea salt next to a stone" */
            { photoId:'r-gupb4r0ZM',    fallback:`linear-gradient(135deg,${navy},${mid})`,   n:'06', l:'Dia a dia',   d:'Substitua o sal refinado. O feijão vai te contar a diferença.' },
          ].map(c=>(
            <FoodCard key={c.photoId} photoId={c.photoId} fallback={c.fallback} n={c.n} l={c.l} d={c.d} />
          ))}
        </div>
      </section>

      {/* ── HONESTIDADE ── */}
      <section style={{ background:cream, padding:'96px 48px' }}>
        <div style={{ maxWidth:780, margin:'0 auto', textAlign:'center', position:'relative' }}>
          <div style={{ position:'absolute', top:-16, left:'50%', transform:'translateX(-50%)', fontFamily:'Fraunces,serif', fontSize:160, color:navy, opacity:.04, lineHeight:1, userSelect:'none' }}>"</div>
          <motion.p {...up()} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase', margin:'0 0 14px' }}>SEM PROMESSAS DE MARKETING</motion.p>
          <motion.h2 {...up(.08)} style={{ fontFamily:'Fraunces,serif', fontSize:'clamp(28px,4.5vw,56px)', fontWeight:300, color:navy, margin:'0 0 24px', lineHeight:1.1 }}>
            Vamos ser honestos com você.
          </motion.h2>
          <motion.p {...up(.14)} style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:21, color:`${navy}bb`, lineHeight:1.75, margin:'0 0 32px' }}>
            Sal Vita Premium não cura nada, não emagrece ninguém. O que fazemos é simples: trazemos para a sua cozinha o sal mais íntegro que Mossoró é capaz de produzir.
          </motion.p>
          <GoldLine />
          <motion.p {...up(.2)} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.15em', textTransform:'uppercase', color:`${navy}55`, marginTop:22 }}>
            Menos milagre de marketing. Mais origem, sabor e verdade.
          </motion.p>
        </div>
      </section>

      {/* ── COMPRAR — sea salt crystals background ── */}
      {/* source.unsplash.com/r-gupb4r0ZM — pile of sea salt */}
      <section id="comprar">
        <PhotoBg
          photoId="r-gupb4r0ZM"
          fallbackGradient={`linear-gradient(155deg,${mid},${deep})`}
          overlay={`linear-gradient(155deg, ${mid}EE 0%, ${deep}EE 100%)`}
        >
          <div style={{ maxWidth:1280, margin:'0 auto', padding:'96px 48px' }}>
            <div style={{ textAlign:'center', marginBottom:60 }}>
              <motion.p {...up()} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.2em', color:gold, textTransform:'uppercase', margin:'0 0 10px' }}>ESCOLHA SEU RITUAL</motion.p>
              <motion.h2 {...up(.08)} style={{ fontFamily:'Fraunces,serif', fontStyle:'italic', fontSize:'clamp(26px,4vw,50px)', fontWeight:300, color:cream, lineHeight:1.15, margin:'0 0 14px' }}>
                Você não está comprando um pacote de sal.
              </motion.h2>
              <motion.p {...up(.14)} style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:18, color:`${cream}88`, maxWidth:620, margin:'0 auto' }}>
                Está comprando 365 dias de sol, vento e oceano — colhidos nas salinas, entregues na sua porta.
              </motion.p>
            </div>

            <div className="lp-purchase-grid" style={{ gap:22 }}>
              {/* 1kg */}
              <motion.div {...up()} style={{ border:`1px solid ${gold}33`, borderRadius:18, padding:'40px 34px', background:`${navy}88`, backdropFilter:'blur(8px)' }}>
                <div style={{ display:'flex', gap:20, alignItems:'center', marginBottom:24 }}>
                  <Bag size={72} />
                  <div>
                    <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.15em', color:`${cream}55`, textTransform:'uppercase', margin:'0 0 6px' }}>Cristal · 1 kg</p>
                    <p style={{ fontFamily:'Fraunces,serif', fontSize:48, fontWeight:300, color:cream, margin:0, lineHeight:1 }}>R$&nbsp;29,90</p>
                    <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:14, color:`${cream}55`, margin:'4px 0 0' }}>Para começar a conversa.</p>
                  </div>
                </div>
                <GoldLine />
                <ul style={{ listStyle:'none', padding:0, margin:'20px 0', display:'flex', flexDirection:'column', gap:8 }}>
                  {['Embalagem premium azul e dourado','Rendimento médio de 2–3 meses','Fechamento hermético'].map(f=>(
                    <li key={f} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:13, color:`${cream}88` }}><span style={{ color:gold, marginRight:8 }}>──</span>{f}</li>
                  ))}
                </ul>
                <GoldLine />
                <div style={{ marginTop:22, display:'flex', flexDirection:'column', gap:12 }}>
                  <Qty val={q1} set={setQ1} />
                  <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:13, color:`${cream}88`, margin:0 }}>Total: <strong style={{ color:cream }}>{p1}</strong></p>
                  <button className="lp-btn-outline" style={{ textAlign:'center' }}
                    onMouseEnter={e=>{const el=e.currentTarget;el.style.background=gold;el.style.color=deep;el.style.borderColor=gold;}}
                    onMouseLeave={e=>{const el=e.currentTarget;el.style.background='none';el.style.color='rgba(244,239,230,.65)';el.style.borderColor='rgba(244,239,230,.22)';}}>
                    Levar {q1} {q1===1?'embalagem':'embalagens'}
                  </button>
                </div>
              </motion.div>

              {/* 10kg */}
              <motion.div {...up(.1)} style={{ border:`1px solid ${gold}`, borderRadius:18, padding:'40px 34px', background:`${navy}99`, backdropFilter:'blur(8px)', position:'relative', overflow:'hidden', boxShadow:`0 0 60px ${gold}18` }}>
                <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, background:`radial-gradient(circle,${gold}22,transparent 70%)` }} />
                <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', background:gold, color:deep, padding:'4px 20px', fontFamily:'Inter Tight,sans-serif', fontSize:10, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', borderRadius:'0 0 10px 10px' }}>MELHOR ESCOLHA</div>
                <div style={{ display:'flex', gap:20, alignItems:'center', marginBottom:20, marginTop:14 }}>
                  <Bag size={78} />
                  <div>
                    <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.15em', color:`${cream}55`, textTransform:'uppercase', margin:'0 0 6px' }}>Caixa Cristal · 10 kg</p>
                    <p style={{ fontFamily:'Fraunces,serif', fontSize:48, fontWeight:300, color:goldLt, margin:0, lineHeight:1 }}>R$&nbsp;149,00</p>
                    <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:14, color:`${cream}55`, margin:'4px 0 0' }}>Para quem já não volta atrás.</p>
                  </div>
                </div>
                <div style={{ border:`1px solid ${gold}33`, background:`${gold}18`, borderRadius:10, padding:'10px 14px', marginBottom:20 }}>
                  <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:13, color:goldLt, margin:'0 0 3px', fontWeight:600 }}>R$ 14,90/kg — metade do preço avulso</p>
                  <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, color:`${gold}aa`, margin:0 }}>Economia de R$ 150,00 vs. 10 unidades</p>
                </div>
                <GoldLine />
                <ul style={{ listStyle:'none', padding:0, margin:'20px 0', display:'flex', flexDirection:'column', gap:8 }}>
                  {['Caixa colecionável azul abismo','Estoque para o ano inteiro','Frete otimizado por volume','Garantia de origem Mossoró'].map(f=>(
                    <li key={f} style={{ fontFamily:'Inter Tight,sans-serif', fontSize:13, color:`${cream}88` }}><span style={{ color:gold, marginRight:8 }}>──</span>{f}</li>
                  ))}
                </ul>
                <GoldLine />
                <div style={{ marginTop:22, display:'flex', flexDirection:'column', gap:12 }}>
                  <Qty val={q10} set={setQ10} />
                  <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:13, color:`${cream}88`, margin:0 }}>Total: <strong style={{ color:cream }}>{p10}</strong></p>
                  <button className="lp-btn-gold" style={{ textAlign:'center' }}>
                    Reservar {q10>1?`${q10} caixas`:'minha caixa'}
                  </button>
                </div>
                <Frete />
              </motion.div>
            </div>
          </div>
        </PhotoBg>
      </section>

      {/* ── FRASE FINAL — clear tropical beach background ── */}
      {/* source.unsplash.com/x7ZjDBtAMRI — "A beach with clear blue water and white clouds" */}
      <PhotoBg
        photoId="x7ZjDBtAMRI"
        fallbackGradient={deep}
        overlay={`linear-gradient(to bottom, ${deep}DD 0%, ${deep}CC 60%, ${deep}F5 100%)`}
      >
        <div style={{ padding:'120px 48px', textAlign:'center' }}>
          {[10,25,40,55,70,85,15,35,60,80].map((l,i)=>(
            <div key={i} style={{ position:'absolute', left:`${l}%`, top:`${[20,60,30,70,25,55,80,40,15,65][i]}%`, width:3, height:3, borderRadius:'50%', background:gold, opacity:[.3,.2,.4,.15,.35,.25,.2,.3,.15,.25][i] }} />
          ))}
          <motion.div {...up()} style={{ position:'relative', zIndex:1 }}>
            <img src="/sal-vita-logo.svg" alt="" style={{ height:56, filter:'brightness(0) invert(1)', opacity:.2, display:'block', margin:'0 auto 32px' }} />
            <p style={{ fontFamily:'JetBrains Mono,monospace', fontSize:11, letterSpacing:'.2em', color:`${gold}77`, textTransform:'uppercase', margin:'0 0 40px' }}>SAL VITA PREMIUM · MOSSORÓ, BRASIL</p>
            <h2 style={{ fontFamily:'Fraunces,serif', fontStyle:'italic', fontSize:'clamp(34px,6vw,70px)', fontWeight:300, color:cream, lineHeight:1.15, margin:'0 0 48px' }}>
              O mar levou um ano.<br /><em style={{ color:gold }}>Você leva um instante.</em>
            </h2>
            <a href="#comprar" className="lp-btn-gold" style={{ padding:'18px 52px', fontSize:16 }}>Trazer o mar para a mesa</a>
          </motion.div>
        </div>
      </PhotoBg>

      {/* ── FOOTER ── */}
      <footer style={{ background:deep, borderTop:`1px solid ${gold}18`, padding:'24px 48px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
        <img src="/sal-vita-logo.svg" alt="Sal Vita" style={{ height:26, filter:'brightness(0) invert(1)', opacity:.28 }} />
        <p style={{ fontFamily:'Inter Tight,sans-serif', fontSize:11, letterSpacing:'.12em', textTransform:'uppercase', color:`${cream}27`, margin:0 }}>
          © 2025 Sal Vita Premium · Todos os direitos reservados
        </p>
        <p style={{ fontFamily:'Cormorant Garamond,serif', fontStyle:'italic', fontSize:14, color:`${gold}77`, margin:0 }}>
          Mossoró, Rio Grande do Norte, Brasil
        </p>
      </footer>
    </>
  );
}
