import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Image assets ───────────────────────────────────────── */
const IMG = {
  produto:       'http://salvitarn.com.br/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-04-at-09.02.12.jpeg',
  salina:        'http://salvitarn.com.br/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-24-at-16.42.07.jpeg',
  cristalizador: 'http://salvitarn.com.br/wp-content/uploads/2025/12/cristalizador-de-sal-scaled.jpg',
  morrosSal:     'http://salvitarn.com.br/wp-content/uploads/2025/10/missao01.webp',
};

/* ─── Shipping ───────────────────────────────────────────── */
const REGIONS: Record<string, { pac:[number,string]; sedex:[number,string] }> = {
  RN:{pac:[14,'3–5 dias'],sedex:[27,'1–2 dias']}, CE:{pac:[15,'3–5 dias'],sedex:[28,'1–2 dias']},
  PB:{pac:[15,'4–6 dias'],sedex:[29,'1–3 dias']}, PE:{pac:[16,'4–6 dias'],sedex:[30,'2–3 dias']},
  AL:{pac:[16,'4–7 dias'],sedex:[31,'2–3 dias']}, SE:{pac:[17,'5–7 dias'],sedex:[32,'2–3 dias']},
  BA:{pac:[18,'5–8 dias'],sedex:[33,'2–3 dias']}, MA:{pac:[18,'5–8 dias'],sedex:[34,'2–3 dias']},
  PI:{pac:[17,'4–7 dias'],sedex:[32,'2–3 dias']}, SP:{pac:[22,'6–9 dias'],sedex:[40,'2–4 dias']},
  RJ:{pac:[22,'6–9 dias'],sedex:[40,'2–4 dias']}, MG:{pac:[20,'5–8 dias'],sedex:[38,'2–4 dias']},
  ES:{pac:[21,'6–9 dias'],sedex:[39,'2–4 dias']}, PR:{pac:[24,'7–10 dias'],sedex:[44,'3–5 dias']},
  SC:{pac:[25,'8–11 dias'],sedex:[46,'3–5 dias']}, RS:{pac:[26,'8–12 dias'],sedex:[48,'3–5 dias']},
  DF:{pac:[22,'6–9 dias'],sedex:[42,'2–4 dias']}, GO:{pac:[21,'6–10 dias'],sedex:[41,'2–4 dias']},
  MT:{pac:[26,'8–12 dias'],sedex:[48,'3–5 dias']}, MS:{pac:[24,'7–11 dias'],sedex:[45,'3–5 dias']},
  AM:{pac:[36,'12–18 dias'],sedex:[62,'5–8 dias']},PA:{pac:[32,'10–16 dias'],sedex:[57,'4–7 dias']},
  AC:{pac:[40,'14–20 dias'],sedex:[68,'6–10 dias']},RO:{pac:[34,'11–17 dias'],sedex:[60,'5–8 dias']},
  RR:{pac:[40,'14–20 dias'],sedex:[68,'6–10 dias']},AP:{pac:[37,'12–18 dias'],sedex:[64,'5–9 dias']},
  TO:{pac:[24,'9–13 dias'],sedex:[46,'3–6 dias']},
};

function calcShipping(uf:string, kg:number) {
  const r = REGIONS[uf] ?? {pac:[28,'10–15 dias'],sedex:[52,'4–7 dias']};
  const f = kg >= 10 ? 2.4 : 1;
  return [
    {service:'PAC',   price:+(r.pac[0]  *f).toFixed(2), days:r.pac[1],  icon:'📦', description:'Econômico'},
    {service:'SEDEX', price:+(r.sedex[0]*f).toFixed(2), days:r.sedex[1],icon:'⚡', description:'Expresso'},
  ];
}

/* ─── WhatsApp ───────────────────────────────────────────── */
const WA = '5584999999999'; // ← coloque o número real aqui

function waLink(name:string, weight:string, price:number, ship?:{service:string;price:number;days:string}) {
  const msg = ship
    ? `Olá! Quero comprar ${name} ${weight} — R$ ${price.toFixed(2)}. Frete ${ship.service}: R$ ${ship.price.toFixed(2)} (${ship.days}). Total: R$ ${(price+ship.price).toFixed(2)}.`
    : `Olá! Quero comprar ${name} ${weight} — R$ ${price.toFixed(2)}.`;
  return `https://wa.me/${WA}?text=${encodeURIComponent(msg)}`;
}

/* ─── Particles (salt crystals) ─────────────────────────── */
const PARTICLES = Array.from({length:20},(_,i)=>({
  id:i, left:`${((i*43+9)%97)+1}%`,
  size: 3+(i%3), dur:`${9+(i%8)}s`, delay:`${-((i*2.1)%12)}s`,
  opacity: 0.18+(i%4)*0.07,
}));

/* ─── FAQ ────────────────────────────────────────────────── */
const FAQS = [
  {q:'O que é sal marinho não refinado?',a:'Processamento mínimo — apenas lavado e seco ao sol natural, sem adicionar ou retirar nada. Preserva os +80 minerais naturais do oceano: magnésio, cálcio, potássio, ferro, iodo e muitos outros, que conferem sabor mais rico e complexo comparado ao sal refinado comum.'},
  {q:'Por que "mais sabor em menos pitadas"?',a:'A presença dos minerais naturais amplifica a percepção de sabor nos alimentos. Com o sal refinado você perde toda essa riqueza. Com o SAL VITA PREMIUM Não Refinado, uma pitada menor já entrega mais sabor — consumo mais consciente e econômico.'},
  {q:'O zip lock realmente funciona?',a:'Sim. Fechamento duplo de alta espessura com junta dupla de vedação. Abre e fecha centenas de vezes sem perder a vedação. A janela circular transparente permite ver o sal a qualquer momento sem abrir a embalagem.'},
{q:'Por que o sal de Mossoró é diferente?',a:'Mossoró (RN) produz mais de 95% do sal marinho brasileiro. Sol intenso, ventos constantes e baixíssima umidade criam um sal de altíssima pureza, colhido diretamente do oceano Atlântico.'},
  {q:'Como funciona o frete?',a:'Enviamos por Correios via Melhor Envio com rastreamento. Nordeste: 1–5 dias úteis. Sudeste/Sul: 2–7 dias. Norte: até 18 dias úteis. Pedidos acima de R$ 150 têm frete grátis para todo o Brasil.'},
];

/* ─── Food uses ──────────────────────────────────────────── */
const USES = [
  {e:'🥩',t:'Carnes e Aves',d:'Realça o sabor natural sem mascarar'},
  {e:'🐟',t:'Peixes e Frutos do Mar',d:'Toque perfeito que valoriza o mar'},
  {e:'🥗',t:'Saladas e Legumes',d:'Tempero leve que exalta o frescor'},
  {e:'🍝',t:'Massas e Risotos',d:'Na água ou finalização do prato'},
  {e:'🍲',t:'Sopas e Caldos',d:'Profundidade de sabor com menos sal'},
  {e:'🍞',t:'Pães e Panificação',d:'Ativa o glúten, melhora a crosta'},
];

interface Product {id:string;name:string;subtitle:string;weight:string;weightKg:number;price:number;pricePerKg:number;tag:string;highlight:boolean;savings?:string}
interface ShipOpt  {service:string;price:number;days:string;icon:string;description:string}
interface CepData  {localidade:string;uf:string;bairro:string}

/* ══════════════════════════════════════════════════════════ */
export default function SalVitaLanding() {
  const [scrolled,setScrolled]             = useState(false);
  const [mobileMenu,setMobileMenu]         = useState(false);
  const [showModal,setShowModal]           = useState(false);
  const [selProd,setSelProd]               = useState<Product|null>(null);
  const [cep,setCep]                       = useState('');
  const [cepData,setCepData]               = useState<CepData|null>(null);
  const [shipping,setShipping]             = useState<ShipOpt[]>([]);
  const [selShip,setSelShip]               = useState<ShipOpt|null>(null);
  const [loadingCep,setLoadingCep]         = useState(false);
  const [cepErr,setCepErr]                 = useState('');
  const [openFaq,setOpenFaq]               = useState<number|null>(null);
  const [visible,setVisible]               = useState<Set<string>>(new Set());
  const obs = useRef<IntersectionObserver|null>(null);

  useEffect(()=>{
    const h=()=>{ setScrolled(window.scrollY>50); };
    window.addEventListener('scroll',h,{passive:true});
    return ()=>window.removeEventListener('scroll',h);
  },[]);

  useEffect(()=>{
    document.body.style.overflow = mobileMenu ? 'hidden' : '';
    return ()=>{ document.body.style.overflow=''; };
  },[mobileMenu]);

  useEffect(()=>{
    obs.current=new IntersectionObserver(
      (es)=>es.forEach(e=>{ if(e.isIntersecting) setVisible(p=>new Set([...p,e.target.id])); }),
      {threshold:0.08}
    );
    document.querySelectorAll('[data-reveal]').forEach(el=>obs.current?.observe(el));
    return ()=>obs.current?.disconnect();
  },[]);

  const v=(id:string)=>visible.has(id);

  const openBuy=useCallback((p:Product)=>{
    setSelProd(p); setShowModal(true); setMobileMenu(false);
    setCep(''); setCepData(null); setShipping([]); setSelShip(null); setCepErr('');
    document.body.style.overflow='hidden';
  },[]);
  const closeBuy=useCallback(()=>{ setShowModal(false); document.body.style.overflow=''; },[]);

  const lookupCep=async()=>{
    const c=cep.replace(/\D/g,'');
    if(c.length!==8){setCepErr('Digite um CEP válido com 8 dígitos.');return;}
    setLoadingCep(true); setCepErr(''); setCepData(null); setShipping([]); setSelShip(null);
    try {
      const d=await(await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if(d.erro){setCepErr('CEP não encontrado.');setLoadingCep(false);return;}
      setCepData(d);
      const opts=calcShipping(d.uf,selProd!.weightKg);
      setShipping(opts); setSelShip(opts[0]);
    } catch {setCepErr('Erro de conexão. Tente novamente.');}
    setLoadingCep(false);
  };

  const products:Product[]=[
    {id:'1kg',  name:'SAL VITA PREMIUM',      subtitle:'Embalagem zip lock com janela',      weight:'1kg',          weightKg:1.2, price:29.90, pricePerKg:29.90, tag:'Mais Vendido',          highlight:false},
    {id:'caixa',name:'CAIXA SAL VITA PREMIUM',subtitle:'10 embalagens zip lock de 1kg cada', weight:'10kg (10×1kg)',weightKg:12,  price:149.90,pricePerKg:14.99, tag:'Melhor Custo-Benefício', highlight:true, savings:'Economize R$ 149,10'},
  ];

  /* ── Logo real ── */
  const Logo=({size=40,white=false}:{size?:number;white?:boolean})=>(
    <img
      src="http://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
      alt="Sal Vita Premium"
      style={{height:size,width:'auto',objectFit:'contain',filter:white?'brightness(0) invert(1)':'none'}}
    />
  );

  return (
    <>
      <style>{`
        /* ── Tokens — Premium Dark ── */
        :root {
          --brand:   #0b1d3a;
          --brand2:  #162f5e;
          --navy:    #071628;
          --sky:     #f5f7fa;
          --skymd:   #eaeff7;
          --gold:    #c9a227;
          --goldlt:  #e8c547;
          --golddk:  #a07a10;
          --white:   #ffffff;
          --offwhite:#fafaf8;
          --text:    #0a1020;
          --mid:     #2a3a55;
          --muted:   #6a7a90;
        }
        .lp { font-family:'Outfit','Barlow Condensed',sans-serif; color:var(--text); background:var(--white); }

        /* ── particles ── */
        @keyframes saltUp {
          0%   {transform:translateY(0) rotate(0);   opacity:0;}
          8%   {opacity:1;}
          92%  {opacity:0.5;}
          100% {transform:translateY(-110vh) rotate(720deg); opacity:0;}
        }
        .salt-p {position:absolute;border-radius:2px;background:rgba(255,255,255,0.7);animation:saltUp linear infinite;pointer-events:none;}

        /* ── marquee ── */
        @keyframes mq {from{transform:translateX(0)} to{transform:translateX(-50%)}}
        .mq-inner{animation:mq 32s linear infinite;display:flex;width:max-content;}
        .mq-inner:hover{animation-play-state:paused;}

        /* ── shimmer gold ── */
        @keyframes shimGold {
          from{background-position:-200% 0} to{background-position:200% 0}
        }
        .shim-blue {
          background:linear-gradient(90deg,#c9a227 0%,#f0d060 30%,#c9a227 50%,#e8c547 70%,#c9a227 100%);
          background-size:200% auto;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          animation:shimGold 4s linear infinite;
        }
        .shim-white {
          background:linear-gradient(90deg,rgba(255,255,255,.6) 0%,#fff 40%,rgba(255,255,255,.6) 100%);
          background-size:200% auto;
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          animation:shimGold 6s linear infinite;
        }

        /* ── pulse gold ── */
        @keyframes pulseGold {
          0%,100%{box-shadow:0 0 0 0 rgba(201,162,39,.5);}
          50%    {box-shadow:0 0 0 20px rgba(201,162,39,0);}
        }
        .pulse{animation:pulseGold 2.6s ease-in-out infinite;}

        /* ── product float ── */
        @keyframes floatProd {0%,100%{transform:translateY(0) rotate(-1deg);}50%{transform:translateY(-16px) rotate(1.2deg);}}
        .prod-float{animation:floatProd 5.5s ease-in-out infinite;}

        /* ── reveal ── */
        .rev{opacity:0;transform:translateY(30px);transition:opacity .7s ease,transform .7s ease;}
        .rev.on{opacity:1;transform:translateY(0);}
        .d1{transition-delay:.1s}.d2{transition-delay:.22s}.d3{transition-delay:.36s}.d4{transition-delay:.5s}

        /* ── glass card (light) ── */
        .card-light{background:var(--white);border:1px solid rgba(11,29,58,.09);border-radius:18px;box-shadow:0 4px 24px rgba(11,29,58,.06);transition:transform .3s,box-shadow .3s,border-color .3s;}
        .card-light:hover{transform:translateY(-6px);box-shadow:0 16px 48px rgba(11,29,58,.12);border-color:rgba(201,162,39,.3);}

        /* ── price card ── */
        .pc-hi{background:linear-gradient(135deg,#c9a227 0%,#a07a10 100%);border:none;box-shadow:0 20px 60px rgba(201,162,39,.35);}
        .pc-lo{background:var(--white);border:2px solid rgba(11,29,58,.12);box-shadow:0 8px 32px rgba(11,29,58,.06);}

        /* ── section divider wave ── */
        .wave{line-height:0;}.wave svg{display:block;}

        /* ── ship option ── */
        .sopt{border:2px solid rgba(26,58,138,.12);border-radius:12px;padding:14px 16px;cursor:pointer;transition:border-color .2s,background .2s;}
        .sopt:hover{border-color:rgba(26,58,138,.35);}
        .sopt.sel{border-color:var(--brand);background:rgba(26,58,138,.05);}

        /* ── modal ── */
        .mo{position:fixed;inset:0;z-index:9999;background:rgba(15,31,64,.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;}
        .mb{background:var(--white);border-radius:22px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;padding:32px;box-shadow:0 40px 100px rgba(15,31,64,.25);}

        /* ── faq ── */
        .faq-border{border-bottom:1px solid rgba(26,58,138,.1);}
        .faq-ans{overflow:hidden;transition:max-height .4s ease,opacity .3s ease;}
        .faq-ans.open{max-height:320px;opacity:1;}.faq-ans.closed{max-height:0;opacity:0;}

        /* ── wa float ── */
        .wa{position:fixed;bottom:28px;right:28px;z-index:8000;width:58px;height:58px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(37,211,102,.4);text-decoration:none;transition:transform .2s,box-shadow .2s;}
        .wa:hover{transform:scale(1.12);box-shadow:0 6px 32px rgba(37,211,102,.6);}

        /* ── hero — premium dark ── */
        .hero-bg{
          background: linear-gradient(150deg, #07131f 0%, #0b1d3a 45%, #0e2448 100%);
          position:relative; overflow:hidden;
        }
        /* gold line above sections */
        .gold-line{width:56px;height:2px;background:linear-gradient(90deg,var(--gold),var(--goldlt));margin:0 auto 20px;}
        .gold-line-left{width:56px;height:2px;background:linear-gradient(90deg,var(--gold),var(--goldlt));margin:0 0 20px;}

        /* ── section alternation ── */
        .s-white {background:var(--white);}
        .s-sky   {background:var(--offwhite);}
        .s-brand {background:linear-gradient(160deg,#071628 0%,#0b1d3a 100%);}
        .s-sky2  {background:#f4f5f7;}

        /* ── separator label ── */
        .eyebrow{font-size:.72rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase;margin-bottom:12px;}

        /* ── product img — removes white bg via multiply ── */
        .prod-img{mix-blend-mode:multiply;background:transparent;}

        /* ── hamburger ── */
        .ham{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:8px;border-radius:8px;}
        .ham span{display:block;width:24px;height:2px;background:var(--brand);border-radius:2px;transition:transform .3s,opacity .3s;}

        /* ── mobile drawer ── */
        .mob-drawer{display:none;position:fixed;inset:0;z-index:200;background:rgba(15,31,64,.85);backdrop-filter:blur(12px);}
        .mob-drawer-inner{position:absolute;top:0;right:0;bottom:0;width:min(80vw,300px);background:white;padding:24px;display:flex;flex-direction:column;gap:4px;box-shadow:-20px 0 60px rgba(15,31,64,.25);}

        /* ── sticky buy bar (mobile only) ── */
        .sticky-bar{display:none;position:fixed;bottom:0;left:0;right:0;z-index:500;background:white;border-top:1px solid rgba(26,58,138,.1);padding:12px 16px;box-shadow:0 -4px 32px rgba(26,58,138,.12);}

        @media(max-width:768px){
          /* Nav */
          .nav-menu{display:none!important;}
          .ham{display:flex!important;}

          /* Hero */
          .hero-title{font-size:clamp(2.6rem,11vw,4.5rem)!important;}
          .hero-grid{grid-template-columns:1fr!important;padding:60px 20px 100px!important;gap:32px!important;}
          .hero-copy{text-align:center;}
          .hero-badges{justify-content:center!important;}
          .hero-btns{justify-content:center!important;}
          .hero-img-wrap{order:-1;}
          .prod-float img{width:220px!important;}
          .prod-float{padding:20px!important;}

          /* Sections */
          .s-pad{padding:64px 20px!important;}
          .story-grid{grid-template-columns:1fr!important;gap:32px!important;}
          .panorama{height:260px!important;}
          .crista-section{height:280px!important;}

          /* Benefits / Uses / Pricing grids */
          .ben-grid{grid-template-columns:1fr!important;}
          .use-grid{grid-template-columns:1fr!important;}
          .price-grid{grid-template-columns:1fr!important;}
          .footer-grid{grid-template-columns:1fr!important;gap:28px!important;}

          /* Tables */
          .comp-wrap{font-size:.78rem!important;}
          .comp-wrap th,.comp-wrap td{padding:10px 10px!important;}

          /* Modal — bottom sheet */
          .mo{align-items:flex-end!important;padding:0!important;}
          .mb{border-radius:24px 24px 0 0!important;max-height:88vh!important;padding:20px 20px 32px!important;}
          .mb-drag{display:block!important;}

          /* Drawers */
          .mob-drawer{display:block;}

          /* Sticky bar */
          .sticky-bar{display:flex!important;}
          .wa{bottom:86px!important;}

          /* FAQ tap area */
          .faq-border button{padding:18px 0!important;}

          /* Price cards */
          .pc-hi,.pc-lo{padding:28px 22px!important;}

          /* Marquee text */
          .mq-inner span{font-size:.72rem!important;letter-spacing:.1em!important;}
        }

        /* ── drag handle (modal) ── */
        .mb-drag{display:none;width:40px;height:4px;background:rgba(26,58,138,.15);border-radius:2px;margin:0 auto 16px;}
      `}</style>

      <div className="lp">

        {/* ══════ NAV ══════ */}
        <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,transition:'background .4s,box-shadow .4s,padding .3s',background:scrolled||mobileMenu?'rgba(7,22,40,.97)':'transparent',boxShadow:scrolled?'0 2px 32px rgba(0,0,0,.4)':'none',padding:scrolled?'10px 0':'20px 0',backdropFilter:scrolled?'blur(16px)':'none'}}>
          <div style={{maxWidth:1200,margin:'0 auto',padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <Logo size={44} white={!scrolled&&!mobileMenu?false:false}/>
            <div className="nav-menu" style={{display:'flex',gap:28,alignItems:'center'}}>
              {['Produto','Benefícios','Como Usar','Preço'].map(l=>(
                <a key={l} href={`#${l.toLowerCase().replace('í','i').replace('ç','c')}`} style={{color:'rgba(255,255,255,.7)',fontSize:'.78rem',fontWeight:500,letterSpacing:'.12em',textDecoration:'none',textTransform:'uppercase',transition:'color .2s'}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--gold)'}
                  onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}>{l}</a>
              ))}
              <button onClick={()=>openBuy(products[0])} style={{background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:8,padding:'10px 22px',fontSize:'.78rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';e.currentTarget.style.transform='scale(1.04)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';e.currentTarget.style.transform='scale(1)';}}>Comprar</button>
            </div>
            <button className="ham" onClick={()=>setMobileMenu(o=>!o)} aria-label="Menu">
              <span style={{background:'white',transform:mobileMenu?'translateY(7px) rotate(45deg)':'none'}}/>
              <span style={{background:'white',opacity:mobileMenu?0:1}}/>
              <span style={{background:'white',transform:mobileMenu?'translateY(-7px) rotate(-45deg)':'none'}}/>
            </button>
          </div>
        </nav>

        {/* ══════ MOBILE DRAWER ══════ */}
        <div className="mob-drawer" style={{opacity:mobileMenu?1:0,pointerEvents:mobileMenu?'auto':'none',transition:'opacity .3s'}} onClick={e=>{if(e.target===e.currentTarget)setMobileMenu(false)}}>
          <div className="mob-drawer-inner" style={{transform:mobileMenu?'translateX(0)':'translateX(100%)',transition:'transform .32s cubic-bezier(.4,0,.2,1)',background:'var(--navy)'}}>
            <div style={{marginBottom:24,paddingBottom:20,borderBottom:'1px solid rgba(255,255,255,.08)'}}><Logo size={40}/></div>
            {[{l:'Produto',h:'#produto'},{l:'Benefícios',h:'#beneficios'},{l:'Como Usar',h:'#como-usar'},{l:'Preços',h:'#preco'}].map(({l,h})=>(
              <a key={l} href={h} onClick={()=>setMobileMenu(false)} style={{display:'block',padding:'14px 0',color:'rgba(255,255,255,.8)',fontSize:'1.1rem',fontFamily:"'Cormorant Garamond',serif",fontWeight:600,textDecoration:'none',borderBottom:'1px solid rgba(255,255,255,.07)',letterSpacing:'.04em'}}>{l}</a>
            ))}
            <button onClick={()=>openBuy(products[0])} style={{marginTop:24,width:'100%',background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:12,padding:'16px',fontSize:'1rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer'}}>
              Comprar Agora
            </button>
            <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" style={{marginTop:10,display:'flex',alignItems:'center',justifyContent:'center',gap:8,background:'#25D366',color:'white',borderRadius:12,padding:'14px',fontSize:'.9rem',fontWeight:700,textDecoration:'none'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>
          </div>
        </div>

        {/* ══════ HERO — PREMIUM DARK ══════ */}
        <section className="hero-bg" style={{minHeight:'100vh',display:'flex',alignItems:'center',paddingTop:80,position:'relative',overflow:'hidden'}}>
          {/* Gold shimmer orbs */}
          <div style={{position:'absolute',top:'15%',right:'8%',width:420,height:420,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,.12) 0%,transparent 65%)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:'10%',left:'5%',width:320,height:320,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,.08) 0%,transparent 65%)',pointerEvents:'none'}}/>
          {/* Fine grid overlay */}
          <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px)',backgroundSize:'60px 60px',pointerEvents:'none'}}/>
          {/* Floating salt particles */}
          {PARTICLES.map(p=>(
            <span key={p.id} className="salt-p" style={{left:p.left,bottom:0,width:p.size,height:p.size,opacity:p.opacity*1.4,animationDuration:p.dur,animationDelay:p.delay}}/>
          ))}

          <div className="hero-grid" style={{maxWidth:1200,margin:'0 auto',padding:'80px 24px 100px',width:'100%',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:60,alignItems:'center',position:'relative',zIndex:2}}>
            {/* Copy */}
            <div className="hero-copy">
              {/* Provenance badge */}
              <div style={{display:'inline-flex',alignItems:'center',gap:10,marginBottom:24,background:'rgba(201,162,39,.12)',border:'1px solid rgba(201,162,39,.3)',borderRadius:999,padding:'7px 18px'}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:'var(--gold)',flexShrink:0,boxShadow:'0 0 8px var(--gold)'}}/>
                <span style={{fontSize:'.68rem',fontWeight:700,letterSpacing:'.24em',color:'var(--gold)',textTransform:'uppercase'}}>Salinas de Mossoró · RN · Brasil</span>
              </div>

              <h1 className="hero-title" style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(3.2rem,8vw,6.5rem)',fontWeight:700,lineHeight:1.0,color:'white',marginBottom:8,textShadow:'0 2px 40px rgba(0,0,0,.3)'}}>
                SAL VITA
              </h1>
              <div style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(1.2rem,3vw,2.2rem)',fontWeight:300,fontStyle:'italic',letterSpacing:'.28em',marginBottom:6}}>
                <span className="shim-blue">PREMIUM</span>
              </div>
              {/* Gold divider */}
              <div style={{width:64,height:1.5,background:'linear-gradient(90deg,var(--gold),var(--goldlt),transparent)',marginBottom:28,marginTop:10}}/>
              <p style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(1.3rem,3vw,2rem)',fontWeight:400,fontStyle:'italic',color:'rgba(255,255,255,.75)',lineHeight:1.5,marginBottom:36}}>
                "Muito mais sabor,<br/>em cada pitada."
              </p>

              {/* Badges */}
              <div className="hero-badges" style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:44}}>
                {[{e:'✦',t:'+80 Minerais'},{e:'✦',t:'Não Refinado'},{e:'✦',t:'100% Mossoró'},{e:'✦',t:'Zip Lock Premium'}].map(b=>(
                  <span key={b.t} style={{background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.15)',borderRadius:999,padding:'7px 16px',fontSize:'.78rem',fontWeight:500,color:'rgba(255,255,255,.8)',display:'flex',alignItems:'center',gap:7,letterSpacing:'.04em'}}>
                    <span style={{color:'var(--gold)',fontSize:'.6rem'}}>{b.e}</span> {b.t}
                  </span>
                ))}
              </div>

              <div className="hero-btns" style={{display:'flex',flexWrap:'wrap',gap:14}}>
                <button className="pulse" onClick={()=>openBuy(products[0])} style={{background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:14,padding:'18px 44px',fontSize:'1rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';e.currentTarget.style.transform='scale(1.04)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';e.currentTarget.style.transform='scale(1)';}}>
                  Conhecer o Produto
                </button>
                <a href="#preco" style={{background:'transparent',color:'rgba(255,255,255,.8)',border:'1.5px solid rgba(255,255,255,.25)',borderRadius:14,padding:'18px 36px',fontSize:'1rem',fontWeight:500,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer',textDecoration:'none',display:'inline-flex',alignItems:'center',transition:'border-color .2s,color .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--gold)';e.currentTarget.style.color='var(--gold)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.25)';e.currentTarget.style.color='rgba(255,255,255,.8)';}}>
                  Ver Preços ↓
                </a>
              </div>
            </div>

            {/* Product image */}
            <div className="hero-img-wrap" style={{display:'flex',justifyContent:'center',alignItems:'center',position:'relative'}}>
              {/* Gold ring glow behind product */}
              <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,.18) 0%,transparent 70%)',filter:'blur(20px)',transform:'scale(1.15)'}}/>
              <div className="prod-float" style={{position:'relative',background:'linear-gradient(135deg,#e8f4ff,#d0e8ff)',borderRadius:'50%',padding:32,boxShadow:'0 40px 100px rgba(0,0,0,.5),0 0 0 1px rgba(201,162,39,.2)'}}>
                <img src={IMG.produto} alt="SAL VITA PREMIUM — Sal Integral de Mossoró 1kg" className="prod-img"
                  style={{width:300,height:'auto',maxWidth:'100%',filter:'drop-shadow(0 24px 48px rgba(0,0,0,.4))'}}
                  onError={e=>{
                    e.currentTarget.style.display='none';
                    (e.currentTarget.nextElementSibling as HTMLElement).style.display='flex';
                  }}
                />
                <div style={{display:'none',width:260,height:320,background:'linear-gradient(160deg,#0b1d3a,#071628)',borderRadius:20,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:28,border:'1px solid rgba(201,162,39,.2)'}}>
                  <Logo size={50}/>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.4rem',fontWeight:700,color:'white',marginTop:12}}>SAL VITA PREMIUM</div>
                  <div style={{fontSize:'.75rem',color:'rgba(255,255,255,.5)'}}>Sal Integral · 1kg · Mossoró RN</div>
                  <div style={{marginTop:16,background:'rgba(201,162,39,.15)',border:'1px solid rgba(201,162,39,.4)',borderRadius:8,padding:'6px 14px',fontSize:'.75rem',color:'var(--gold)',fontWeight:700}}>+80 Minerais Naturais</div>
                </div>
              </div>
              <div style={{position:'absolute',bottom:-24,left:'50%',transform:'translateX(-50%)',width:200,height:32,background:'rgba(0,0,0,.35)',borderRadius:'50%',filter:'blur(22px)'}}/>
            </div>
          </div>

          {/* Wave */}
          <div className="wave" style={{position:'absolute',bottom:-2,left:0,right:0}}>
            <svg viewBox="0 0 1440 70" preserveAspectRatio="none" style={{width:'100%',height:70}}>
              <path d="M0,35 C360,70 720,0 1080,35 C1260,52 1380,18 1440,35 L1440,70 L0,70 Z" fill="white"/>
            </svg>
          </div>
        </section>

        {/* ══════ MARQUEE — gold on dark ══════ */}
        <div style={{background:'linear-gradient(90deg,#071628,#0b1d3a,#071628)',overflow:'hidden',padding:'14px 0',borderTop:'1px solid rgba(201,162,39,.2)',borderBottom:'1px solid rgba(201,162,39,.2)'}}>
          <div className="mq-inner">
            {[...Array(2)].map((_,r)=>(
              <div key={r} style={{display:'flex',gap:52,paddingRight:52}}>
                {['✦ 100% Salinas de Mossoró','✦ +80 Minerais Naturais','✦ Não Refinado','✦ Zip Lock Premium','✦ Janela Transparente','✦ Com Iodo Natural','✦ 100% Brasileiro','✦ Premium Quality'].map(i=>(
                  <span key={i} style={{whiteSpace:'nowrap',fontSize:'.73rem',fontWeight:600,letterSpacing:'.2em',textTransform:'uppercase',color:'var(--gold)'}}>{i}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ══════ PANORAMA — MORROS DE SAL ══════ */}
        <section className="panorama" style={{position:'relative',height:460,overflow:'hidden'}}>
          <img src={IMG.morrosSal} alt="Morros de sal nas salinas de Mossoró, Rio Grande do Norte" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 60%',display:'block'}}/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,white 0%,rgba(255,255,255,0) 18%,rgba(255,255,255,0) 72%,white 100%)'}}/>
          <div style={{position:'absolute',inset:0,background:'rgba(7,22,40,.3)'}}/>
          <div style={{position:'absolute',bottom:52,left:'50%',transform:'translateX(-50%)',textAlign:'center',width:'100%',padding:'0 24px'}}>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.4rem,4vw,2.6rem)',fontWeight:400,fontStyle:'italic',color:'white',textShadow:'0 2px 20px rgba(0,0,0,.7)',marginBottom:10}}>
              Das maiores salinas do Brasil para a sua mesa
            </p>
            <div style={{display:'inline-flex',alignItems:'center',gap:10}}>
              <span style={{width:28,height:1,background:'rgba(201,162,39,.7)'}}/>
              <p style={{fontSize:'.68rem',fontWeight:700,letterSpacing:'.26em',color:'var(--gold)',textTransform:'uppercase',textShadow:'0 1px 8px rgba(0,0,0,.5)'}}>
                Mossoró · Rio Grande do Norte · Brasil
              </p>
              <span style={{width:28,height:1,background:'rgba(201,162,39,.7)'}}/>
            </div>
          </div>
        </section>

        {/* ══════ STORY ══════ */}
        <section id="produto" className="s-white s-pad" style={{padding:'100px 24px'}}>
          <div className="story-grid" style={{maxWidth:1200,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:64,alignItems:'center'}}>
            <div id="story-left" data-reveal className={`rev${v('story-left')?' on':''}`}>
              <p className="eyebrow" style={{color:'var(--brand)'}}>Nossa Origem</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.2rem,5vw,3.8rem)',fontWeight:700,lineHeight:1.15,color:'var(--text)',marginBottom:20}}>
                Das salinas ao<br/>
                <em style={{color:'var(--brand)',fontStyle:'italic'}}>seu prato.</em>
              </h2>
              <p style={{color:'var(--mid)',lineHeight:1.8,fontSize:'1.05rem',marginBottom:18}}>
                Mossoró produz <strong style={{color:'var(--brand)'}}>mais de 95% do sal marinho brasileiro</strong>. O sol nordestino, os ventos constantes e a baixíssima umidade criam condições únicas para um sal de pureza excepcional.
              </p>
              <p style={{color:'var(--mid)',lineHeight:1.8,fontSize:'1.05rem',marginBottom:36}}>
                O SAL VITA PREMIUM é <strong style={{color:'var(--brand)'}}>Não Refinado</strong> — preserva seus +80 minerais naturais intactos, entregando muito mais sabor em cada pitada.
              </p>
              <div style={{display:'flex',gap:40,flexWrap:'wrap'}}>
                {[['+80','Minerais naturais'],['95%','do sal BR vem do RN'],['Não','Refinado']].map(([n,l])=>(
                  <div key={n}>
                    <div className="shim-blue" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'2.4rem',fontWeight:700}}>{n}</div>
                    <div style={{fontSize:'.73rem',color:'var(--muted)',letterSpacing:'.06em',marginTop:4}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: salina photo card */}
            <div id="story-right" data-reveal className={`rev d2${v('story-right')?' on':''}`} style={{display:'flex',justifyContent:'center'}}>
              <div style={{position:'relative',maxWidth:400,width:'100%',borderRadius:22,overflow:'hidden',boxShadow:'0 24px 64px rgba(26,58,138,.18)'}}>
                <img src={IMG.salina} alt="Salinas de Mossoró" style={{width:'100%',height:360,objectFit:'cover',objectPosition:'center',display:'block'}}/>
                <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(15,31,64,.9) 0%,rgba(15,31,64,.4) 55%,rgba(15,31,64,.05) 100%)'}}/>
                <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'24px 28px 28px'}}>
                  <div className="shim-blue" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.5rem',fontWeight:700,lineHeight:1}}>+80</div>
                  <p style={{fontSize:'.72rem',fontWeight:700,letterSpacing:'.18em',color:'rgba(255,255,255,.65)',textTransform:'uppercase',marginBottom:12}}>Minerais Naturais Preservados</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {['Magnésio','Cálcio','Potássio','Ferro','Iodo','Zinco','Manganês','+ outros'].map(m=>(
                      <span key={m} style={{background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.25)',borderRadius:999,padding:'3px 10px',fontSize:'.7rem',color:'rgba(255,255,255,.85)'}}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ BENEFITS ══════ */}
        <section id="beneficios" className="s-sky s-pad" style={{padding:'100px 24px'}}>
          <div style={{maxWidth:1200,margin:'0 auto'}}>
            <div id="ben-h" data-reveal className={`rev${v('ben-h')?' on':''}`} style={{textAlign:'center',marginBottom:60}}>
              <p className="eyebrow" style={{color:'var(--brand)'}}>Por que escolher</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.5rem)',fontWeight:700,color:'var(--text)'}}>Feito para quem valoriza o que come</h2>
            </div>
            <div id="ben-g" data-reveal className={`rev ben-grid${v('ben-g')?' on':''}`} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(272px,1fr))',gap:18}}>
              {[
                {e:'⭐',t:'+80 Minerais Naturais',d:'Magnésio, cálcio, potássio, ferro, iodo e mais 75 minerais do oceano Atlântico, todos preservados.'},
                {e:'🌿',t:'Sal Não Refinado',d:'Processamento mínimo — lavado e seco ao sol. Nenhum mineral retirado, nenhum aditivo adicionado além do essencial.'},
                {e:'🔒',t:'Zip Lock Premium',d:'Fechamento duplo de alta espessura. Abre e fecha centenas de vezes sem perder a vedação. Chega de sal empedrado.'},
                {e:'🪟',t:'Janela Transparente',d:'Circular na frente da embalagem. Você vê o sal a qualquer momento, sem precisar abrir.'},
                {e:'☀️',t:'Seco ao Sol Natural',d:'Secagem 100% natural sob o sol do Nordeste. Sem calor industrial, sem processos que alterem a composição mineral do sal.'},
                {e:'🌊',t:'100% Mossoró RN',d:'Das salinas que produzem 95% do sal marinho brasileiro. Apoio direto à economia do Nordeste.'},
              ].map((b,i)=>(
                <div key={b.t} className="card-light" style={{padding:'28px 24px',transitionDelay:`${i*.07}s`}}>
                  <div style={{fontSize:'2rem',marginBottom:14}}>{b.e}</div>
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.3rem',fontWeight:700,color:'var(--brand)',marginBottom:10}}>{b.t}</h3>
                  <p style={{color:'var(--mid)',lineHeight:1.7,fontSize:'.88rem'}}>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ CRISTALIZADOR — full bleed ══════ */}
        <section className="crista-section" style={{position:'relative',height:420,overflow:'hidden'}}>
          <img src={IMG.cristalizador} alt="Processo de cristalização do sal nas salinas de Mossoró" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 40%',display:'block'}}/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,white 0%,rgba(255,255,255,0) 15%,rgba(7,22,40,.55) 60%,white 100%)'}}/>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 24px'}}>
            <div style={{textAlign:'center',maxWidth:700}}>
              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.5rem,4vw,2.8rem)',fontWeight:600,fontStyle:'italic',color:'white',textShadow:'0 2px 24px rgba(0,0,0,.8)',lineHeight:1.3,marginBottom:20}}>
                "Colhido sob o sol nordestino,<br/>cristalizado pelo vento do sertão."
              </p>
              <div style={{display:'inline-flex',alignItems:'center',gap:12}}>
                <span style={{width:40,height:1,background:'rgba(201,162,39,.7)'}}/>
                <span style={{fontSize:'.68rem',fontWeight:700,letterSpacing:'.24em',color:'var(--gold)',textTransform:'uppercase'}}>Processo de Cristalização Natural</span>
                <span style={{width:40,height:1,background:'rgba(201,162,39,.7)'}}/>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ COMO USAR ══════ */}
        <section id="como-usar" className="s-white s-pad" style={{padding:'100px 24px'}}>
          <div style={{maxWidth:1200,margin:'0 auto'}}>
            <div id="use-h" data-reveal className={`rev${v('use-h')?' on':''}`} style={{textAlign:'center',marginBottom:60}}>
              <p className="eyebrow" style={{color:'var(--brand)'}}>Use sem moderação</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.5rem)',fontWeight:700,color:'var(--text)',marginBottom:14}}>
                O sal que combina com tudo
              </h2>
              <p style={{color:'var(--muted)',fontSize:'1.05rem',maxWidth:520,margin:'0 auto'}}>
                Com +80 minerais naturais, cada pitada entrega sabor mais rico — do preparo à finalização.
              </p>
            </div>
            <div id="use-g" data-reveal className={`rev use-grid${v('use-g')?' on':''}`} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:18}}>
              {USES.map((u,i)=>(
                <div key={u.t} className="card-light" style={{padding:'26px 22px',display:'flex',gap:18,alignItems:'flex-start',transitionDelay:`${i*.07}s`}}>
                  <div style={{width:60,height:60,borderRadius:'50%',background:'var(--sky)',border:'1px solid rgba(26,58,138,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.8rem',flexShrink:0}}>{u.e}</div>
                  <div>
                    <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.15rem',fontWeight:700,color:'var(--brand)',marginBottom:6}}>{u.t}</h3>
                    <p style={{color:'var(--muted)',fontSize:'.85rem',lineHeight:1.6}}>{u.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ COMPARATIVO ══════ */}
        <section className="s-sky" style={{padding:'80px 24px'}}>
          <div style={{maxWidth:900,margin:'0 auto'}}>
            <div id="comp-h" data-reveal className={`rev${v('comp-h')?' on':''}`} style={{textAlign:'center',marginBottom:48}}>
              <p className="eyebrow" style={{color:'var(--brand)'}}>Comparativo</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.8rem,4vw,3rem)',fontWeight:700,color:'var(--text)'}}>Por que SAL VITA PREMIUM?</h2>
            </div>
            <div id="comp-t" data-reveal className={`rev comp-wrap${v('comp-t')?' on':''}`} style={{overflowX:'auto',borderRadius:16,boxShadow:'0 4px 32px rgba(26,58,138,.08)',background:'white'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}>
                <thead style={{background:'var(--brand)'}}>
                  <tr>
                    <th style={{padding:'14px 18px',textAlign:'left',color:'rgba(255,255,255,.7)',fontWeight:500,fontSize:'.75rem',letterSpacing:'.12em',textTransform:'uppercase'}}>Característica</th>
                    {['SAL VITA PREMIUM','Maranata Origens','Smart / BR Spices'].map((b,bi)=>(
                      <th key={b} style={{padding:'14px 18px',textAlign:'center',fontFamily:bi===0?"'Cormorant Garamond',serif":'inherit',fontWeight:bi===0?700:500,fontSize:bi===0?'1rem':'.82rem',color:bi===0?'white':'rgba(255,255,255,.55)'}}>{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Não Refinado',            '✓','✓','✗'],
                    ['+80 Minerais naturais',   '✓','✓','✗'],
                    ['Zip lock premium',        '✓','✗','✗'],
                    ['Janela de visualização',  '✓','✗','✗'],
                    ['Não empedra',             '✓','✗','parcial'],
                    ['Origem Mossoró',          '✓','✓','✗'],
                    ['Com iodo',                '✓','✓','✓'],
                  ].map(([f,a,b,c],ri)=>(
                    <tr key={f} style={{background:ri%2===0?'var(--offwhite)':'white'}}>
                      <td style={{padding:'13px 18px',color:'var(--mid)',borderBottom:'1px solid rgba(26,58,138,.05)'}}>{f}</td>
                      {[a,b,c].map((val,ci)=>(
                        <td key={ci} style={{padding:'13px 18px',textAlign:'center',borderBottom:'1px solid rgba(26,58,138,.05)',color:val==='✓'?'#16a34a':val==='✗'?'rgba(0,0,0,.2)':'var(--mid)',fontWeight:ci===0&&val!=='✓'&&val!=='✗'?700:400,fontSize:val==='✓'||val==='✗'?'1.1rem':'.88rem'}}>{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ══════ FAQ ══════ */}
        <section className="s-white" style={{padding:'100px 24px'}}>
          <div style={{maxWidth:760,margin:'0 auto'}}>
            <div id="faq-h" data-reveal className={`rev${v('faq-h')?' on':''}`} style={{textAlign:'center',marginBottom:52}}>
              <p className="eyebrow" style={{color:'var(--brand)'}}>Tire suas dúvidas</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3rem)',fontWeight:700,color:'var(--text)'}}>Perguntas Frequentes</h2>
            </div>
            <div id="faq-l" data-reveal className={`rev${v('faq-l')?' on':''}`}>
              {FAQS.map((faq,i)=>(
                <div key={i} className="faq-border">
                  <button onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{width:'100%',background:'none',border:'none',padding:'22px 0',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',gap:16}}>
                    <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.15rem',fontWeight:700,color:'var(--text)',textAlign:'left'}}>{faq.q}</span>
                    <span style={{color:'var(--brand)',fontSize:'1.4rem',flexShrink:0,transform:openFaq===i?'rotate(45deg)':'rotate(0)',transition:'transform .3s',display:'inline-block'}}>+</span>
                  </button>
                  <div className={`faq-ans${openFaq===i?' open':' closed'}`}>
                    <p style={{padding:'0 0 24px',color:'var(--mid)',lineHeight:1.75,fontSize:'.93rem'}}>{faq.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ PRICING — value built, now reveal prices ══════ */}
        <section id="preco" className="s-brand" style={{padding:'100px 24px'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div id="price-h" data-reveal className={`rev${v('price-h')?' on':''}`} style={{textAlign:'center',marginBottom:64}}>
              <p style={{fontSize:'.72rem',fontWeight:700,letterSpacing:'.28em',textTransform:'uppercase',color:'rgba(255,255,255,.55)',marginBottom:12}}>Escolha seu pack</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.5rem)',fontWeight:700,color:'white',marginBottom:10}}>
                Preço justo. Qualidade real.
              </h2>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:'1.05rem'}}>Frete grátis para pedidos acima de R$ 150,00</p>
            </div>

            <div id="price-c" data-reveal className={`rev price-grid${v('price-c')?' on':''}`} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:24,maxWidth:820,margin:'0 auto'}}>
              {products.map(p=>(
                <div key={p.id} className={p.highlight?'pc-hi':'pc-lo'} style={{borderRadius:24,padding:'36px 32px',position:'relative',overflow:'hidden',transition:'transform .3s'}}
                  onMouseEnter={e=>e.currentTarget.style.transform='translateY(-6px)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
                  <div style={{position:'absolute',top:0,right:0,background:p.highlight?'rgba(255,255,255,.18)':'var(--gold)',color:p.highlight?'white':'var(--navy)',padding:'6px 18px',borderRadius:'0 24px 0 12px',fontSize:'.7rem',fontWeight:800,letterSpacing:'.1em',textTransform:'uppercase'}}>{p.tag}</div>
                  <p style={{fontSize:'.7rem',fontWeight:600,letterSpacing:'.2em',color:p.highlight?'rgba(255,255,255,.45)':'var(--muted)',textTransform:'uppercase',marginBottom:6}}>{p.subtitle}</p>
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.6rem',fontWeight:700,color:p.highlight?'white':'var(--text)',marginBottom:4}}>{p.name}</h3>
                  <p style={{fontSize:'.82rem',color:p.highlight?'rgba(255,255,255,.45)':'var(--muted)',marginBottom:18}}>{p.weight}</p>
                  {p.savings&&<div style={{background:'rgba(201,162,39,.12)',border:'1px solid rgba(201,162,39,.3)',borderRadius:8,padding:'7px 14px',fontSize:'.78rem',color:p.highlight?'var(--goldlt)':'var(--golddk)',fontWeight:700,marginBottom:14,display:'inline-block'}}>{p.savings} vs comprar avulso</div>}
                  <div style={{marginBottom:6}}>
                    <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.2rem',fontWeight:700,color:p.highlight?'white':'var(--brand)',lineHeight:1}}>R$ {p.price.toFixed(2).replace('.',',')}</span>
                  </div>
                  <p style={{fontSize:'.78rem',color:p.highlight?'rgba(255,255,255,.5)':'var(--muted)',marginBottom:28}}>R$ {p.pricePerKg.toFixed(2).replace('.',',')}/kg</p>
                  <ul style={{listStyle:'none',padding:0,marginBottom:28}}>
                    {['Sal Marinho Não Refinado','+80 Minerais Naturais','Zip lock dupla vedação','Janela de visualização','Seco ao Sol Natural','100% Mossoró RN'].map(f=>(
                      <li key={f} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                        <span style={{color:p.highlight?'var(--goldlt)':'var(--gold)',fontSize:'.85rem'}}>✦</span>
                        <span style={{fontSize:'.87rem',color:p.highlight?'rgba(255,255,255,.75)':'var(--mid)'}}>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button className="pulse" onClick={()=>openBuy(p)} style={{width:'100%',background:p.highlight?'white':'var(--gold)',color:p.highlight?'var(--navy)':'var(--navy)',border:'none',borderRadius:12,padding:'16px',fontSize:'.93rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .15s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background=p.highlight?'var(--goldlt)':'var(--goldlt)';e.currentTarget.style.transform='scale(1.02)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background=p.highlight?'white':'var(--gold)';e.currentTarget.style.transform='scale(1)';}}>
                    Comprar {p.weight==='1kg'?'1kg':'Caixa 10kg'}
                  </button>
                </div>
              ))}
            </div>

            <p style={{textAlign:'center',marginTop:28,fontSize:'.8rem',color:'rgba(255,255,255,.35)',letterSpacing:'.06em'}}>
              🔒 Compra segura · Rastreamento incluso · Nota fiscal emitida
            </p>
          </div>
        </section>

        {/* ══════ FOOTER ══════ */}
        <footer style={{background:'#0a1535',padding:'56px 24px 32px',borderTop:'1px solid rgba(255,255,255,.06)'}}>
          <div style={{maxWidth:1200,margin:'0 auto'}}>
            <div className="footer-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:40,marginBottom:48}}>
              <div>
                <div style={{marginBottom:16}}><Logo size={48} white/></div>
                <p style={{color:'rgba(255,255,255,.38)',fontSize:'.83rem',lineHeight:1.7}}>Sal Marinho Integral Não Refinado. Das salinas de Mossoró, Rio Grande do Norte, para a sua mesa.</p>
              </div>
              <div>
                <h4 style={{fontSize:'.68rem',fontWeight:700,letterSpacing:'.2em',color:'rgba(255,255,255,.4)',textTransform:'uppercase',marginBottom:16}}>Produto</h4>
                <ul style={{listStyle:'none',padding:0}}>
                  {['1kg — R$ 29,90','Caixa 10kg — R$ 149,90','Frete grátis acima R$ 150','+80 Minerais Naturais','Não Refinado'].map(i=>(
                    <li key={i} style={{color:'rgba(255,255,255,.38)',fontSize:'.83rem',marginBottom:8}}>{i}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{fontSize:'.68rem',fontWeight:700,letterSpacing:'.2em',color:'rgba(255,255,255,.4)',textTransform:'uppercase',marginBottom:16}}>Canais de Venda</h4>
                <ul style={{listStyle:'none',padding:0}}>
                  {[{l:'💬 WhatsApp',h:`https://wa.me/${WA}`},{l:'🛒 Mercado Livre',h:'#'},{l:'🛍️ Shopee',h:'#'},{l:'📦 Amazon',h:'#'}].map(lk=>(
                    <li key={lk.l} style={{marginBottom:8}}>
                      <a href={lk.h} target="_blank" rel="noopener noreferrer" style={{color:'rgba(255,255,255,.38)',fontSize:'.83rem',textDecoration:'none',transition:'color .2s'}}
                        onMouseEnter={e=>e.currentTarget.style.color='white'}
                        onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.38)'}>{lk.l}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{fontSize:'.68rem',fontWeight:700,letterSpacing:'.2em',color:'rgba(255,255,255,.4)',textTransform:'uppercase',marginBottom:16}}>Fale Conosco</h4>
                <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:10,background:'#128C7E',color:'white',padding:'12px 20px',borderRadius:10,fontSize:'.83rem',fontWeight:600,textDecoration:'none',transition:'background .2s,transform .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='#25D366';e.currentTarget.style.transform='scale(1.04)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#128C7E';e.currentTarget.style.transform='scale(1)';}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Falar no WhatsApp
                </a>
              </div>
            </div>
            <div style={{borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:24,display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:10}}>
              <p style={{color:'rgba(255,255,255,.22)',fontSize:'.76rem'}}>© 2025 SAL VITA PREMIUM · Mossoró, Rio Grande do Norte · CNPJ: XX.XXX.XXX/XXXX-XX</p>
              <p style={{color:'rgba(255,255,255,.22)',fontSize:'.76rem'}}>Produto registrado MAPA · Aditivos aprovados ANVISA</p>
            </div>
          </div>
        </footer>
      </div>

      {/* ══════ STICKY BOTTOM CTA (mobile) ══════ */}
      <div className="sticky-bar" style={{gap:10,alignItems:'center'}}>
        <button onClick={()=>openBuy(products[0])} className="pulse" style={{flex:1,background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:12,padding:'14px 0',fontSize:'.93rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer'}}>
          Comprar Agora
        </button>
        <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" style={{display:'flex',alignItems:'center',justifyContent:'center',width:52,height:52,borderRadius:12,background:'#25D366',flexShrink:0}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>
      </div>

      {/* ══════ WA FLOAT ══════ */}
      <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" className="wa" aria-label="Falar no WhatsApp">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      </a>

      {/* ══════ MODAL ══════ */}
      {showModal&&selProd&&(
        <div className="mo" onClick={e=>e.target===e.currentTarget&&closeBuy()}>
          <div className="mb">
            <div className="mb-drag"/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22}}>
              <div>
                <p style={{fontSize:'.68rem',fontWeight:700,letterSpacing:'.2em',color:'var(--brand)',textTransform:'uppercase',marginBottom:4}}>Calcule o Frete</p>
                <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.55rem',fontWeight:700,color:'var(--text)'}}>{selProd.name}</h3>
                <p style={{color:'var(--muted)',fontSize:'.82rem'}}>{selProd.weight}</p>
              </div>
              <button onClick={closeBuy} style={{background:'var(--sky)',border:'none',borderRadius:8,width:36,height:36,color:'var(--mid)',fontSize:'1.3rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
            </div>
            <div style={{background:'var(--sky)',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <p style={{fontSize:'.78rem',color:'var(--muted)',marginBottom:2}}>Subtotal</p>
                <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.9rem',fontWeight:700,color:'var(--brand)'}}>R$ {selProd.price.toFixed(2).replace('.',',')}</p>
              </div>
              <div style={{textAlign:'right'}}>
                <p style={{fontSize:'.73rem',color:'var(--muted)'}}>Peso aprox.</p>
                <p style={{fontSize:'.93rem',color:'var(--mid)',fontWeight:500}}>{selProd.weightKg}kg</p>
              </div>
            </div>
            <div style={{marginBottom:18}}>
              <label style={{display:'block',fontSize:'.76rem',fontWeight:700,letterSpacing:'.12em',color:'var(--mid)',textTransform:'uppercase',marginBottom:8}}>Seu CEP de entrega</label>
              <div style={{display:'flex',gap:10}}>
                <input type="text" value={cep} onChange={e=>{setCep(e.target.value.replace(/\D/g,'').slice(0,8));setCepErr('');}} onKeyDown={e=>e.key==='Enter'&&lookupCep()} placeholder="00000-000" maxLength={8}
                  style={{flex:1,background:'var(--offwhite)',border:cepErr?'2px solid #ef4444':'2px solid transparent',borderRadius:10,padding:'13px 16px',color:'var(--text)',fontSize:'1rem',fontFamily:'Outfit,sans-serif',letterSpacing:'.1em',outline:'none',transition:'border-color .2s'}}
                  onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                  onBlur={e=>e.currentTarget.style.borderColor=cepErr?'#ef4444':'transparent'}/>
                <button onClick={lookupCep} disabled={loadingCep} style={{background:'var(--brand)',color:'white',border:'none',borderRadius:10,padding:'13px 20px',fontSize:'.85rem',fontWeight:700,cursor:loadingCep?'not-allowed':'pointer',opacity:loadingCep?.7:1,whiteSpace:'nowrap',transition:'background .2s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--navy)'}
                  onMouseLeave={e=>e.currentTarget.style.background='var(--brand)'}>{loadingCep?'⟳':'Calcular'}</button>
              </div>
              {cepErr&&<p style={{color:'#ef4444',fontSize:'.78rem',marginTop:6}}>{cepErr}</p>}
              <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener noreferrer" style={{fontSize:'.73rem',color:'var(--muted)',textDecoration:'none',display:'inline-block',marginTop:6}}>Não sei meu CEP →</a>
            </div>

            {cepData&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'9px 14px',background:'#f0fdf4',borderRadius:8,border:'1px solid #bbf7d0'}}>
                  <span style={{color:'#16a34a'}}>✓</span>
                  <p style={{fontSize:'.84rem',color:'#166534'}}>{cepData.localidade} — {cepData.uf}{cepData.bairro?` · ${cepData.bairro}`:''}</p>
                </div>
                <p style={{fontSize:'.7rem',fontWeight:700,letterSpacing:'.14em',color:'var(--muted)',textTransform:'uppercase',marginBottom:10}}>Opções via Correios (estimativa):</p>
                <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:18}}>
                  {shipping.map(opt=>(
                    <div key={opt.service} className={`sopt${selShip?.service===opt.service?' sel':''}`} onClick={()=>setSelShip(opt)}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <span style={{fontSize:'1.4rem'}}>{opt.icon}</span>
                          <div>
                            <p style={{fontWeight:700,color:'var(--text)',fontSize:'.93rem'}}>{opt.service}</p>
                            <p style={{fontSize:'.76rem',color:'var(--muted)'}}>{opt.description} · {opt.days}</p>
                          </div>
                        </div>
                        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.3rem',fontWeight:700,color:'var(--brand)'}}>R$ {opt.price.toFixed(2).replace('.',',')}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {selShip&&(
                  <div style={{background:'var(--sky)',borderRadius:12,padding:'15px 18px',marginBottom:18,borderTop:'3px solid var(--brand)'}}>
                    {[['Produto',selProd.price],[`Frete (${selShip.service})`,selShip.price]].map(([l,val])=>(
                      <div key={String(l)} style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                        <span style={{fontSize:'.83rem',color:'var(--muted)'}}>{l}</span>
                        <span style={{fontSize:'.83rem',color:'var(--mid)'}}>R$ {Number(val).toFixed(2).replace('.',',')}</span>
                      </div>
                    ))}
                    <div style={{display:'flex',justifyContent:'space-between',paddingTop:10,borderTop:'1px solid rgba(26,58,138,.12)',marginTop:4}}>
                      <span style={{fontWeight:700,color:'var(--text)'}}>Total estimado</span>
                      <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.4rem',fontWeight:700,color:'var(--brand)'}}>R$ {(selProd.price+selShip.price).toFixed(2).replace('.',',')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <a href={waLink(selProd.name,selProd.weight,selProd.price,selShip??undefined)} target="_blank" rel="noopener noreferrer"
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,background:'#128C7E',color:'white',borderRadius:12,padding:'16px',fontSize:'.93rem',fontWeight:700,textDecoration:'none',letterSpacing:'.04em',transition:'background .2s,transform .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#25D366';e.currentTarget.style.transform='scale(1.02)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#128C7E';e.currentTarget.style.transform='scale(1)';}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Finalizar via WhatsApp
              </a>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <a href="#" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'#fffbeb',border:'1px solid #fde68a',color:'#92400e',borderRadius:10,padding:'12px',fontSize:'.78rem',fontWeight:600,textDecoration:'none',transition:'background .2s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#fef3c7'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fffbeb'}>🛒 Mercado Livre</a>
                <a href="#" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:'#fff1f0',border:'1px solid #fca5a5',color:'#991b1b',borderRadius:10,padding:'12px',fontSize:'.78rem',fontWeight:600,textDecoration:'none',transition:'background .2s'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#fee2e2'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fff1f0'}>🛍️ Shopee</a>
              </div>
            </div>
            <p style={{marginTop:14,fontSize:'.7rem',color:'var(--muted)',textAlign:'center',lineHeight:1.5}}>* Frete estimado via Correios. Valor final calculado na plataforma de venda.</p>
          </div>
        </div>
      )}
    </>
  );
}
