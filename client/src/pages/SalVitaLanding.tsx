import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Image assets ───────────────────────────────────────── */
const IMG = {
  produto:       'https://salvitarn.com.br/wp-content/uploads/2026/05/WhatsApp-Image-2026-05-04-at-09.02.12.jpeg',
  salina:        'https://salvitarn.com.br/wp-content/uploads/2026/04/WhatsApp-Image-2026-03-24-at-16.42.07.jpeg',
  cristalizador: 'https://salvitarn.com.br/wp-content/uploads/2025/12/cristalizador-de-sal-scaled.jpg',
  morrosSal:     'https://salvitarn.com.br/wp-content/uploads/2026/05/morro-sal2-scaled.jpg',
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

function calcShipping(uf:string, kg:number): ShipOpt[] {
  const r = REGIONS[uf] ?? {pac:[28,'10–15 dias'],sedex:[52,'4–7 dias']};
  const f = kg >= 10 ? 2.4 : 1;
  return [
    {service:'PAC',   price:+(r.pac[0]  *f).toFixed(2), days:r.pac[1],  description:'Econômico'},
    {service:'SEDEX', price:+(r.sedex[0]*f).toFixed(2), days:r.sedex[1], description:'Expresso'},
  ];
}

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/* ─── WhatsApp / formatting ──────────────────────────────── */
const WA = '558421408212';
const WA_LINK = `https://wa.me/${WA}`;
const brl = (n:number) => `R$ ${Number(n).toFixed(2).replace('.',',')}`;

/* ─── FAQ ────────────────────────────────────────────────── */
const FAQS = [
  {q:'O que é sal marinho não refinado?',a:'Passa apenas pelos processos essenciais de colheita, secagem e moagem — sem o refino industrial que remove os minerais traço. Preserva os minerais traço naturais presentes na água do mar, que dão ao sal um sabor característico. Como todo sal para consumo humano no Brasil, é iodado conforme a legislação.'},
  {q:'O que significa "Muito mais sabor, em cada pitada"?',a:'É o slogan da embalagem. Os minerais traço dão ao sal um sabor característico.'},
  {q:'Como é a embalagem?',a:'Embalagem zip lock com janela circular transparente: abre e fecha sempre que precisar, e você vê o sal sem abrir a embalagem.'},
  {q:'Por que o sal de Mossoró é diferente?',a:'Mossoró (RN) produz mais de 95% do sal marinho brasileiro. Sol intenso, ventos constantes e baixíssima umidade criam condições favoráveis à produção de sal por evaporação solar.'},
  {q:'Como funciona o frete?',a:'Enviamos por Correios via Melhor Envio, com rastreamento. O valor e o prazo do frete são calculados pelo seu CEP antes de você pagar.'},
];

/* ─── Depoimentos ────────────────────────────────────────── */
// Removidos de propósito: os textos antigos não eram de clientes identificáveis.
// Avaliações reais, com autorização de quem escreveu, podem ser reinseridas aqui.

/* ─── Food uses ──────────────────────────────────────────── */
const USES = [
  {t:'Carnes e Aves',d:'Tempero para o preparo e a finalização'},
  {t:'Peixes e Frutos do Mar',d:'Um toque de sal marinho para o prato'},
  {t:'Saladas e Legumes',d:'Tempero leve para o dia a dia'},
  {t:'Massas e Risotos',d:'Na água ou na finalização do prato'},
  {t:'Sopas e Caldos',d:'Para temperar durante o preparo'},
  {t:'Pães e Panificação',d:'Para massas e receitas de padaria'},
];

function maskPhone(v: string): string {
  const d = v.replace(/\D/g,'').slice(0,11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function maskCpf(v: string): string {
  const d = v.replace(/\D/g,'').slice(0,11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function maskCep(v: string): string {
  const d = v.replace(/\D/g,'').slice(0,8);
  return d.length > 5 ? `${d.slice(0,5)}-${d.slice(5)}` : d;
}

function isValidCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g,'');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i=0; i<9; i++) sum += parseInt(d[i]) * (10-i);
  let r = (sum*10) % 11; if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;
  sum = 0;
  for (let i=0; i<10; i++) sum += parseInt(d[i]) * (11-i);
  r = (sum*10) % 11; if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

interface Product {id:string;name:string;subtitle:string;weight:string;weightKg:number;units:number;price:number;pricePerKg:number;tag:string;highlight:boolean}

// Narrows a catalog id to the union the API accepts, so quoting and ordering
// always describe the same product.
type CatalogId = '1kg' | '3kg' | 'caixa';
const catalogId = (id: string): CatalogId =>
  (['1kg','3kg','caixa'] as const).includes(id as CatalogId) ? (id as CatalogId) : '1kg';
interface ShipOpt  {serviceId?:string;service:string;price:number;days:string;description:string}
interface CepData  {localidade:string;uf:string;bairro:string}
interface ApiShipOpt {serviceId?:string;name?:string;company?:string;price:number;days:string}
interface PendingOrder {id:number;total:number;ts:number;trackToken?:string|null;productId?:string;shipService?:string;shipPrice?:number}

const PRODUCTS:Product[]=[
  {id:'1kg',  name:'SAL VITA PREMIUM',      subtitle:'Embalagem zip lock com janela',      weight:'1kg',          weightKg:1.2, units:1,  price:29.90, pricePerKg:29.90, tag:'Para experimentar',      highlight:false},
  {id:'3kg',  name:'TRIO SAL VITA',         subtitle:'3 embalagens zip lock de 1kg cada',  weight:'3kg (3×1kg)',  weightKg:3.6, units:3,  price:74.90, pricePerKg:24.97, tag:'Ideal para a Família', highlight:false},
  {id:'caixa',name:'CAIXA SAL VITA PREMIUM',subtitle:'10 embalagens zip lock de 1kg cada', weight:'10kg (10×1kg)',weightKg:12,  units:10, price:149.90,pricePerKg:14.99, tag:'Melhor Custo-Benefício', highlight:true},
];

const BLANK_FORM = {
  customerName:'',customerPhone:'',customerEmail:'',customerCpf:'',postalCode:'',address:'',
  number:'',complement:'',neighborhood:'',city:'',state:'',
};
type CheckoutForm = typeof BLANK_FORM;

// Customer data typed on THIS device earlier (never stored in the database).
function loadSavedCustomer(): Partial<CheckoutForm> {
  try {
    const d = JSON.parse(localStorage.getItem('sv_customer_data') ?? 'null');
    if (!d || typeof d !== 'object') return {};
    const out: Partial<CheckoutForm> = {};
    (Object.keys(BLANK_FORM) as (keyof CheckoutForm)[]).forEach(k => { if (typeof d[k] === 'string') out[k] = d[k]; });
    return out;
  } catch { return {}; }
}

type FbqFn = (...args: unknown[]) => void;
function fbq(...args: unknown[]) {
  try { (window as unknown as {fbq?:FbqFn}).fbq?.(...args); } catch {}
}
const pixelName = (p: Product) => `${p.name} ${p.weight}`;

const PIX_MAX_MS = 30 * 60 * 1000;
const trackUrl = (id:number, token?:string|null) => `/meu-pedido?pedido=${id}${token ? `&t=${token}` : ''}`;

function Logo({size=40,white=false}:{size?:number;white?:boolean}) {
  return (
    <img
      src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
      alt="Sal Vita Premium"
      width={Math.round(size*282/189)} height={size}
      style={{height:size,width:'auto',objectFit:'contain',filter:white?'brightness(0) invert(1)':'none'}}
    />
  );
}

function WaIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
}

/* ── Casca dos modais do checkout: um único diálogo por vez ── */
function Sheet({dlgRef,onBackdrop,maxWidth,foot,children}:{dlgRef:React.RefObject<HTMLDivElement>;onBackdrop:()=>void;maxWidth?:number;foot?:React.ReactNode;children:React.ReactNode}) {
  return (
    <div className="mo" onClick={e=>e.target===e.currentTarget&&onBackdrop()}>
      <div className="mb" ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby="co-title" tabIndex={-1} style={maxWidth?{maxWidth}:undefined}>
        <div className="mb-drag"/>
        <div className="mb-body">{children}</div>
        {foot&&<div className="mb-foot">{foot}</div>}
      </div>
    </div>
  );
}

function SheetHead({eyebrow,title,sub,onClose}:{eyebrow:string;title:string;sub?:string;onClose:()=>void}) {
  return (
    <div className="mb-head">
      <div style={{minWidth:0}}>
        <p style={{fontSize:'.8rem',fontWeight:700,letterSpacing:'.16em',color:'var(--golddk)',textTransform:'uppercase',marginBottom:2}}>{eyebrow}</p>
        <h3 id="co-title" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.5rem',fontWeight:700,color:'var(--text)',lineHeight:1.15,margin:0}}>{title}</h3>
        {sub&&<p style={{color:'var(--muted)',fontSize:'.9rem',marginTop:2}}>{sub}</p>}
      </div>
      <button type="button" className="mb-x" onClick={onClose} aria-label="Fechar">×</button>
    </div>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/* ══════════════════════════════════════════════════════════ */
export default function SalVitaLanding() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Sal Vita Premium — Sal Marinho Não Refinado de Mossoró/RN';
    return () => { document.title = prev; };
  }, []);

  const [scrolled,setScrolled]             = useState(false);
  const [mobileMenu,setMobileMenu]         = useState(false);
  const [showModal,setShowModal]           = useState(false);
  const [selProd,setSelProd]               = useState<Product|null>(null);
  const [cep,setCep]                       = useState('');
  const [cepData,setCepData]               = useState<CepData|null>(null);
  const [shipping,setShipping]             = useState<ShipOpt[]>([]);
  const [selShip,setSelShip]               = useState<ShipOpt|null>(null);
  const [shippingSource,setShippingSource] = useState<'api'|'static'|null>(null);
  const [loadingCep,setLoadingCep]         = useState(false);
  const [cepErr,setCepErr]                 = useState('');
  const [openFaq,setOpenFaq]               = useState<number|null>(null);
  const [visible,setVisible]               = useState<Set<string>>(new Set());
  const [showCheckout,setShowCheckout]     = useState(false);
  const [checkoutLoading,setCheckoutLoading] = useState(false);
  // `trackToken` is the opaque per-order credential returned by createOrder. It
  // authorizes the payment/PIX/status calls and the /meu-pedido link, replacing
  // the old "last 4 phone digits" scheme.
  const [orderDone,setOrderDone]           = useState<{id:number;total:number;createdAt:number;trackToken?:string|null}|null>(null);
  const [mpLoading,setMpLoading]           = useState(false);
  const [pixLoading,setPixLoading]         = useState(false);
  const [pixData,setPixData]               = useState<{qrCode:string;qrCodeBase64:string}|null>(null);
  const [pixCopied,setPixCopied]           = useState(false);
  const [pixPaid,setPixPaid]               = useState(false);
  const [pixPollErr,setPixPollErr]         = useState(false);
  const [pixExpired,setPixExpired]         = useState(false);
  const pixPollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const pixPurchaseFiredRef = useRef(false);
  const [checkoutForm,setCheckoutForm]     = useState<CheckoutForm>(BLANK_FORM);
  const [couponCode,setCouponCode]         = useState('');
  const [couponState,setCouponState]       = useState<{valid:boolean;message:string;discountValue?:number;discountType?:string}|null>(null);
  const [couponLoading,setCouponLoading]   = useState(false);
  const [cpfError,setCpfError]             = useState('');
  const [phoneError,setPhoneError]         = useState('');
  const [orderErr,setOrderErr]             = useState('');
  const [payErr,setPayErr]                 = useState('');
  const [shipNotice,setShipNotice]         = useState('');
  const [pendingOrder,setPendingOrder]     = useState<PendingOrder|null>(null);
  const autoCouponRef = useRef<string>('');
  const attributionRef = useRef<Record<string,string>>({});
  const obs = useRef<IntersectionObserver|null>(null);
  const dlgRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement|null>(null);
  const prevStepRef = useRef(0);
  const cepInputRef = useRef<HTMLInputElement>(null);

  // Which checkout dialog is on screen (0 = none). Only one is ever mounted.
  const step = !showModal ? 0 : (orderDone && showCheckout) ? 3 : (showCheckout && selProd && selShip) ? 2 : selProd ? 1 : 0;

  useEffect(()=>{
    const h=()=>{ setScrolled(window.scrollY>50); };
    window.addEventListener('scroll',h,{passive:true});
    return ()=>window.removeEventListener('scroll',h);
  },[]);

  useEffect(()=>{
    document.body.style.overflow = (mobileMenu || step>0) ? 'hidden' : '';
    return ()=>{ document.body.style.overflow=''; };
  },[mobileMenu,step]);

  useEffect(()=>{
    obs.current=new IntersectionObserver(
      (es)=>es.forEach(e=>{ if(e.isIntersecting) setVisible(p=>new Set([...p,e.target.id])); }),
      {threshold:0.08}
    );
    document.querySelectorAll('[data-reveal]').forEach(el=>obs.current?.observe(el));
    return ()=>obs.current?.disconnect();
  },[]);

  const v=(id:string)=>visible.has(id);

  // Read ?cupom= URL param and restore saved customer data on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('cupom') ?? params.get('coupon');
    if (c) {
      const code = c.toUpperCase().trim();
      setCouponCode(code);
      autoCouponRef.current = code; // mark as link-coupon so it auto-applies
    }
    // Capture ad attribution (UTM + fbclid) for first-touch — so each order
    // records which campaign/ad drove it and can feed Meta CAPI.
    try {
      const attr: Record<string,string> = {};
      ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(k => {
        const val = params.get(k); if (val) attr[k] = val.slice(0,180);
      });
      const fb = params.get('fbclid'); if (fb) attr.fbclid = fb.slice(0,400);
      if (Object.keys(attr).length) localStorage.setItem('sv_attribution', JSON.stringify(attr));
      else { const s = localStorage.getItem('sv_attribution'); if (s) Object.assign(attr, JSON.parse(s)); }
      attributionRef.current = attr;
    } catch {}
    // Restore previously typed customer data (saved on THIS device only — no
    // database storage) so returning shoppers don't retype everything.
    const saved = loadSavedCustomer();
    if (Object.keys(saved).length) {
      setCheckoutForm(f => ({ ...f, ...saved }));
      if (saved.postalCode) setCep(saved.postalCode.replace(/\D/g,'').slice(0,8));
    }
  }, []);

  // Persist customer data locally whenever it changes (device-only, no DB cost)
  useEffect(() => {
    if (!checkoutForm.customerName && !checkoutForm.customerPhone && !checkoutForm.postalCode) return;
    try { localStorage.setItem('sv_customer_data', JSON.stringify(checkoutForm)); } catch {}
  }, [checkoutForm]);

  // Auto-validate/apply the coupon that came from a recovery link as soon as the
  // customer opens checkout — no need to click "Aplicar". Only fires for the
  // link-coupon (autoCouponRef), so manual typing still uses the button.
  useEffect(() => {
    if (showCheckout && selProd && couponCode.trim() && couponCode === autoCouponRef.current && !couponState && !couponLoading) {
      validateCoupon(couponCode, selProd.price);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCheckout, selProd, couponCode]);

  const clearPending = useCallback(()=>{
    try { localStorage.removeItem('sv_pending_order'); } catch {}
    setPendingOrder(null);
  },[]);

  // Unpaid order saved on this device in the last 2h -> offer to resume payment.
  // A single status check (needs the order token) drops it if it was already paid
  // on Mercado Pago's page, since nothing on the return trip clears this key.
  useEffect(() => {
    let p: PendingOrder | null = null;
    try {
      const raw = JSON.parse(localStorage.getItem('sv_pending_order') ?? 'null');
      if (raw && Number.isFinite(raw.id) && Number.isFinite(raw.ts) && Date.now() - raw.ts < 2 * 60 * 60 * 1000) p = raw as PendingOrder;
    } catch {}
    if (!p) return;
    setPendingOrder(p);
    if (!p.trackToken) return;
    fetch('/api/trpc/shipping.pixStatus', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({json:{ orderId: p.id, token: p.trackToken }}),
    }).then(r=>r.json()).then(d=>{ if (d?.result?.data?.json?.paid) clearPending(); }).catch(()=>{});
  }, [clearPending]);

  // Track cart abandonment at step 1 (form started: name + phone present)
  const cartTrackRef = useRef(false);
  useEffect(() => {
    const { customerName, customerPhone } = checkoutForm;
    const phoneDigits = customerPhone.replace(/\D/g,'');
    if (!cartTrackRef.current && customerName.length >= 3 && phoneDigits.length >= 11) {
      cartTrackRef.current = true;
      fetch('/api/trpc/recovery.trackCart', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{ customerName, customerPhone: phoneDigits, customerEmail: checkoutForm.customerEmail||undefined, quantity:selProd?.units ?? 1, stepReached:1 }}),
      }).catch(()=>{});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutForm.customerName, checkoutForm.customerPhone]);

  const stopPixPoll = useCallback(()=>{
    if(pixPollRef.current){ clearInterval(pixPollRef.current); pixPollRef.current=null; }
  },[]);

  const resetPix = useCallback(()=>{
    stopPixPoll();
    setPixData(null); setPixPaid(false); setPixCopied(false); setPixPollErr(false); setPixExpired(false);
    pixPurchaseFiredRef.current = false;
  },[stopPixPoll]);

  // Called only from buy buttons (pack cards, nav, hero, sticky bar), so the
  // AddToCart pixel fires on the click that chooses a pack — not when the
  // resume-payment banner reopens an existing order.
  const openBuy=useCallback((p:Product)=>{
    triggerRef.current = document.activeElement as HTMLElement | null;
    setSelProd(p); setShowModal(true); setMobileMenu(false);
    fbq('track','ViewContent',{ content_name: pixelName(p), content_category: 'Alimentos Naturais', content_ids: ['salvita-001'], content_type: 'product', value: p.price, currency: 'BRL' });
    fbq('track','AddToCart',{ content_name: pixelName(p), content_ids: ['salvita-001'], content_type: 'product', value: p.price, currency: 'BRL', num_items: p.units });
    // New purchase: reset the flow, but keep the data this device already knows
    // so returning buyers see the form prefilled. The saved unpaid order is NOT
    // cleared here any more — the page now offers to resume it (or discard it).
    const saved = loadSavedCustomer();
    setCep((saved.postalCode ?? '').replace(/\D/g,'').slice(0,8));
    setCepData(null); setShipping([]); setSelShip(null); setCepErr(''); setShippingSource(null);
    setShowCheckout(false); setOrderDone(null);
    setCheckoutForm({ ...BLANK_FORM, ...saved });
    setCouponState(null); setCouponCode('');
    setCpfError(''); setPhoneError(''); setOrderErr(''); setPayErr(''); setShipNotice('');
    cartTrackRef.current = false;
    resetPix();
  },[resetPix]);

  const closeBuy=useCallback(()=>{
    setShowModal(false); setShowCheckout(false); setOrderDone(null);
    setOrderErr(''); setPayErr(''); setShipNotice('');
    resetPix();
  },[resetPix]);

  // Reopen the payment step for the unpaid order saved on this device.
  const resumePending = () => {
    if (!pendingOrder?.trackToken) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    resetPix();
    setPayErr(''); setShipNotice('');
    setSelProd(PRODUCTS.find(p=>p.id===pendingOrder.productId) ?? null);
    setSelShip(pendingOrder.shipService && typeof pendingOrder.shipPrice==='number'
      ? { service: pendingOrder.shipService, price: pendingOrder.shipPrice, days:'', description:'' } : null);
    setOrderDone({ id: pendingOrder.id, total: pendingOrder.total, createdAt: pendingOrder.ts, trackToken: pendingOrder.trackToken });
    setShowCheckout(true); setShowModal(true);
  };

  // Dialog behaviour: focus moves in on open and back to the trigger on close;
  // Escape closes; Tab stays inside.
  useEffect(()=>{
    if (step>0) dlgRef.current?.focus();
    else if (prevStepRef.current>0) {
      const t = triggerRef.current;
      if (t && document.contains(t)) t.focus();
    }
    prevStepRef.current = step;
  },[step]);

  useEffect(()=>{
    if (step===0) return;
    const onKey=(e:KeyboardEvent)=>{
      if (e.key==='Escape') { e.preventDefault(); if (step===2) setShowCheckout(false); else closeBuy(); return; }
      if (e.key!=='Tab' || !dlgRef.current) return;
      const els = Array.from(dlgRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!els.length) return;
      const first = els[0], last = els[els.length-1], act = document.activeElement;
      if (!dlgRef.current.contains(act)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (act===first || act===dlgRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && act===last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown',onKey);
    return ()=>document.removeEventListener('keydown',onKey);
  },[step,closeBuy]);

  useEffect(()=>()=>stopPixPoll(),[stopPixPoll]);

  const lookupCep=async()=>{
    const c=cep.replace(/\D/g,'');
    if(c.length!==8){setCepErr('Digite um CEP válido com 8 dígitos.');return;}
    setLoadingCep(true); setCepErr(''); setCepData(null); setShipping([]); setSelShip(null);
    try {
      const d=await(await fetch(`https://viacep.com.br/ws/${c}/json/`)).json();
      if(d.erro){setCepErr('CEP não encontrado.');setLoadingCep(false);return;}
      setCepData(d);
      setCheckoutForm(f=>({...f, postalCode:c, city:d.localidade??'', state:d.uf??'', neighborhood:d.bairro??'', address:d.logradouro??f.address}));
      // Track cart abandonment at step 2 (shipping selection)
      if (checkoutForm.customerName && checkoutForm.customerPhone) {
        const p2 = checkoutForm.customerPhone.replace(/\D/g,'');
        fetch('/api/trpc/recovery.trackCart', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({json:{ customerName:checkoutForm.customerName, customerPhone:p2, customerEmail:checkoutForm.customerEmail||undefined, postalCode:c, quantity:selProd?.units ?? 1, stepReached:2 }}),
        }).catch(()=>{});
      }

      // Call backend — tries Melhor Envio API first, falls back to static table
      let opts: ShipOpt[] = [];
      try {
        const qty = selProd!.units;
        const r = await fetch('/api/trpc/shipping.calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Send the product so the server quotes the real packed weight and box
          // size instead of inferring both from the kg count.
          body: JSON.stringify({ json: { cep: c, quantity: qty, productId: catalogId(selProd!.id) } }),
        });
        const data = await r.json();
        const source = data?.result?.data?.json?.source;
        const options = data?.result?.data?.json?.options;
        if (Array.isArray(options) && options.length > 0) {
          setShippingSource(source === 'api' ? 'api' : 'static');
          const carrierDesc = (name: string, company: string): string => {
            const n = name.toUpperCase();
            if (n === 'PAC') return 'Econômico';
            if (n === 'SEDEX' || n === 'SEDEX 10' || n === 'SEDEX HOJE') return 'Expresso';
            if (n.includes('MINI ENVIOS') || n.includes('MINI ENVIO')) return 'Mini envio';
            return company || 'Transportadora';
          };
          opts = (options as ApiShipOpt[]).map((o) => ({
            serviceId: o.serviceId,
            service: o.name ?? '',
            price: o.price,
            days: o.days,
            description: carrierDesc(o.name ?? '', o.company ?? ''),
          }));
        }
      } catch {}

      // Fallback to local static table if API unavailable
      if (opts.length === 0) { opts = calcShipping(d.uf, selProd!.weightKg); setShippingSource('static'); }
      setShipping(opts); setSelShip(opts[0]);
    } catch {setCepErr('Erro de conexão. Tente novamente.');}
    setLoadingCep(false);
  };

  // Step 1 CTA: without a quoted freight there is nothing to advance to.
  const goStep2 = () => {
    if (!selShip || !selProd) {
      setCepErr('Informe seu CEP e calcule o frete para continuar.');
      cepInputRef.current?.focus();
      return;
    }
    fbq('track','InitiateCheckout',{ content_name: pixelName(selProd), content_ids: ['salvita-001'], value: selProd.price, currency: 'BRL', num_items: selProd.units });
    setShowCheckout(true);
  };

  async function validateCoupon(code: string, orderVal: number) {
    if (!code.trim()) return;
    setCouponLoading(true);
    try {
      const res = await fetch('/api/trpc/recovery.validateCoupon', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{ code: code.toUpperCase().trim(), orderValue: orderVal }}),
      });
      const data = await res.json();
      const result = data?.result?.data?.json;
      if (result) setCouponState(result);
      else setCouponState({ valid:false, message: data?.error?.json?.message ?? data?.error?.message ?? 'Não foi possível validar o cupom agora.' });
    } catch {
      setCouponState({ valid:false, message:'Não foi possível validar o cupom agora.' });
    }
    setCouponLoading(false);
  }

  async function handleCheckout(e:React.FormEvent) {
    e.preventDefault();
    if(!selProd||!selShip) return;
    if(checkoutLoading) return; // guard against double-submit (mobile double-tap)
    setOrderErr('');
    const p3 = checkoutForm.customerPhone.replace(/\D/g,'');
    if (p3.length < 10) { setPhoneError('Informe DDD + número.'); document.getElementById('co-phone')?.focus(); return; }
    setPhoneError('');
    // Validate CPF before creating the order — a bad CPF only fails later at
    // Mercado Pago / Melhor Envio, after the sale, which loses the customer.
    if(!isValidCpf(checkoutForm.customerCpf)) { setCpfError('CPF inválido — confira os números.'); document.getElementById('co-cpf')?.focus(); return; }
    setCpfError('');
    setCheckoutLoading(true);
    // Track step 3 (attempting payment)
    fetch('/api/trpc/recovery.trackCart', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({json:{ customerName:checkoutForm.customerName, customerPhone:p3, customerEmail:checkoutForm.customerEmail||undefined, postalCode:checkoutForm.postalCode, quantity:selProd.units, stepReached:3 }}),
    }).catch(()=>{});
    try {
      const qty = selProd.units;
      const res = await fetch('/api/trpc/shipping.createOrder', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{
          ...checkoutForm,
          quantity:qty,
          productId: catalogId(selProd.id),
          shippingServiceId:selShip.serviceId ?? (selShip.service==='PAC'?'1':'2'),
          shippingServiceName:selShip.service,
          shippingPrice:selShip.price,
          couponCode: couponCode && couponState?.valid ? couponCode.toUpperCase().trim() : undefined,
          utmSource: attributionRef.current.utm_source,
          utmMedium: attributionRef.current.utm_medium,
          utmCampaign: attributionRef.current.utm_campaign,
          utmContent: attributionRef.current.utm_content,
          utmTerm: attributionRef.current.utm_term,
          fbclid: attributionRef.current.fbclid,
        }}),
      });
      const data = await res.json();
      const orderId = data?.result?.data?.json?.id;
      // A tRPC error comes back as a 200/4xx with an `error` envelope (not a
      // thrown fetch), so guard explicitly — otherwise we'd advance to a
      // "#undefined confirmado" dead-end the customer could never pay.
      if (!orderId) {
        const apiMsg = data?.error?.json?.message ?? data?.error?.message;
        setOrderErr(apiMsg ? `Não foi possível registrar o pedido: ${apiMsg}` : 'Erro ao registrar o pedido. Confira os dados e tente novamente.');
        return;
      }
      const total   = data?.result?.data?.json?.total ?? (selProd.price+selShip.price);
      const trackToken = data?.result?.data?.json?.trackToken ?? null;
      // The server re-quotes shipping and may correct it; show what will actually
      // be charged rather than the price this page quoted earlier.
      const serverShipping = data?.result?.data?.json?.shipping;
      let shipPrice = selShip.price;
      if (typeof serverShipping === 'number' && Math.abs(serverShipping - selShip.price) > 0.01) {
        shipPrice = serverShipping;
        setSelShip({ ...selShip, price: serverShipping });
        setShipNotice(`Frete atualizado para ${brl(serverShipping)}`);
      } else setShipNotice('');
      const createdAt = Date.now();
      setPayErr('');
      setOrderDone({ id: orderId, total, createdAt, trackToken });
      const pend: PendingOrder = { id: orderId, total, ts: createdAt, trackToken, productId: selProd.id, shipService: selShip.service, shipPrice };
      try { localStorage.setItem('sv_pending_order', JSON.stringify(pend)); } catch {}
      setPendingOrder(pend);
      fbq('track','AddPaymentInfo',{ value: total, currency: 'BRL', content_name: pixelName(selProd), content_ids: ['salvita-001'], content_type: 'product', num_items: qty });
    } catch(err) {
      console.error('createOrder error:', err);
      setOrderErr('Erro ao registrar pedido. Verifique sua conexão e tente novamente.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleMpPay() {
    if(!orderDone) return;
    if(mpLoading) return; // guard against double-tap creating two MP charges
    setMpLoading(true); setPayErr('');
    try {
      const res = await fetch('/api/trpc/shipping.createPayment', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{ orderId: orderDone.id, token: orderDone.trackToken ?? undefined }}),
      });
      const data = await res.json();
      const initPoint = data?.result?.data?.json?.initPoint;
      if(initPoint) {
        // Do NOT fire the Purchase pixel here — the customer is only being SENT to
        // Mercado Pago and hasn't paid yet (PIX/boleto/card can still fail/expire).
        // Firing Purchase on intent inflates conversions 2–4x and poisons ad
        // optimization + lookalikes. Purchase is fired only on CONFIRMED payment
        // (TrackOrder, on status=pago / confirmed) and server-side via the webhook.
        window.location.href = initPoint;
      }
      else { setPayErr('Erro ao gerar link de pagamento. Tente novamente.'); }
    } catch { setPayErr('Erro ao conectar com Mercado Pago. Tente novamente.'); }
    setMpLoading(false);
  }

  // Polls the payment status every 5s (the webhook does the real confirmation;
  // this just reflects it on screen). Gives up after 30 min, and says so after
  // 3 failed checks in a row instead of failing silently.
  function startPixPoll(order:{id:number;total:number;trackToken?:string|null}) {
    stopPixPoll();
    let fails = 0;
    const startedAt = Date.now();
    pixPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > PIX_MAX_MS) { stopPixPoll(); setPixExpired(true); return; }
      try {
        const r = await fetch('/api/trpc/shipping.pixStatus', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({json:{ orderId: order.id, token: order.trackToken ?? undefined }}),
        });
        const d = await r.json();
        const j = d?.result?.data?.json;
        if (!j) throw new Error('pixStatus failed');
        fails = 0; setPixPollErr(false);
        if (j.paid) {
          setPixPaid(true);
          stopPixPoll();
          clearPending();
          if(!pixPurchaseFiredRef.current) {
            pixPurchaseFiredRef.current = true;
            fbq('track','Purchase',{
              value: order.total, currency: 'BRL', content_name: selProd ? pixelName(selProd) : 'SAL VITA PREMIUM',
              content_ids: ['salvita-001'], content_type: 'product', ...(selProd ? { num_items: selProd.units } : {}),
            }, { eventID: `purchase-${order.id}` });
          }
        }
      } catch {
        fails += 1;
        if (fails >= 3) setPixPollErr(true);
      }
    }, 5000);
  }

  // Generates an inline PIX QR code/copy-paste so the customer pays without
  // leaving the page, then polls for confirmation.
  async function handlePixPay() {
    if(!orderDone) return;
    if(pixLoading || pixData) return;
    setPixLoading(true); setPayErr(''); setPixExpired(false); setPixPollErr(false);
    try {
      const res = await fetch('/api/trpc/shipping.createPixPayment', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{ orderId: orderDone.id, token: orderDone.trackToken ?? undefined }}),
      });
      const data = await res.json();
      const result = data?.result?.data?.json;
      if(result?.qrCode) {
        setPixData({ qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64 ?? '' });
        fbq('track','AddPaymentInfo',{ value: orderDone.total, currency: 'BRL', content_name: selProd ? pixelName(selProd) : 'SAL VITA PREMIUM', content_ids: ['salvita-001'], content_type: 'product', ...(selProd ? { num_items: selProd.units } : {}) });
        startPixPoll(orderDone);
      } else {
        const apiMsg = data?.error?.json?.message ?? data?.error?.message;
        setPayErr(apiMsg ? `Não foi possível gerar o PIX: ${apiMsg}` : 'Erro ao gerar PIX. Tente novamente.');
      }
    } catch { setPayErr('Erro ao conectar com Mercado Pago. Tente novamente.'); }
    setPixLoading(false);
  }

  async function copyPixCode() {
    if(!pixData) return;
    try {
      await navigator.clipboard.writeText(pixData.qrCode);
      setPixCopied(true);
      setTimeout(()=>setPixCopied(false), 3000);
    } catch {}
  }

  // Money lines of the checkout (coupon only applies to the product).
  const discount = selProd && couponState?.valid && couponState.discountValue
    ? (couponState.discountType==='percent' ? selProd.price*couponState.discountValue/100 : couponState.discountValue)
    : 0;
  const subtotal = selProd ? Math.max(0, selProd.price - discount) : 0;
  const packLabel = (p:Product) => `${p.name} · ${p.units} × 1 kg`;
  const navLinks = [{l:'Produto',h:'#produto'},{l:'Benefícios',h:'#beneficios'},{l:'Como Usar',h:'#como-usar'},{l:'Preço',h:'#preco'},{l:'Rastrear pedido',h:'/meu-pedido'}];

  return (
    <>
      <style>{`
        /* ══ Design tokens — navy profundo + sal branco + ouro ══ */
        :root {
          --brand:   #0b1d3a;
          --brand2:  #162f5e;
          --navy:    #060f20;
          --navy2:   #0a1830;
          --salt:    #fbfaf7;
          --saltmd:  #f2f0ea;
          --gold:    #c9a227;
          --goldlt:  #e8c547;
          --golddk:  #8a6a0c;
          --white:   #ffffff;
          --text:    #0a1020;
          --mid:     #2a3a55;
          --muted:   #5f6f86;
        }
        html{scroll-behavior:smooth;}
        /* nav e fixa: sem isso a ancora aterrissa por baixo da barra */
        #produto,#beneficios,#como-usar,#preco{scroll-margin-top:96px;}
        .lp { font-family:'Outfit',sans-serif; color:var(--text); background:var(--white); overflow-x:hidden; }
        .lp ::selection{background:rgba(201,162,39,.35);}
        .lp :focus-visible{outline:3px solid var(--goldlt);outline-offset:2px;}
        .mb :focus-visible{outline-color:var(--brand);}
        .mb:focus{outline:none;}

        /* ══ Salt grain — textura sutil de cristais nas seções escuras ══ */
        .grain::before{
          content:'';position:absolute;inset:0;pointer-events:none;opacity:.5;
          background-image:
            radial-gradient(rgba(255,255,255,.06) .8px, transparent .8px),
            radial-gradient(rgba(201,162,39,.05) 1px, transparent 1px);
          background-size:26px 26px, 68px 68px;
          background-position:0 0, 17px 31px;
        }

        /* ══ Hero reveal (uma vez, ao carregar) ══ */
        @keyframes wordUp { from{opacity:0;transform:translateY(42px) rotate(2deg)} to{opacity:1;transform:translateY(0) rotate(0)} }
        .w-rev{display:inline-block;opacity:0;animation:wordUp .9s cubic-bezier(.22,1,.36,1) forwards;}
        @keyframes fadeUp { from{opacity:0;transform:translateY(26px)} to{opacity:1;transform:translateY(0)} }
        .h-rev{opacity:0;animation:fadeUp .85s cubic-bezier(.22,1,.36,1) forwards;}

        @keyframes spin {from{transform:rotate(0deg)} to{transform:rotate(360deg)}}
        .spin{animation:spin 1.2s linear infinite;}
        .shim-blue{background:linear-gradient(90deg,#c9a227 0%,#f5e28a 50%,#c9a227 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
        .cta-gold{position:relative;overflow:hidden;}
        .cta-gold:active{transform:scale(.97)!important;}

        /* ══ reveal directions ══ */
        .rev{opacity:0;transform:translateY(36px);transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1);}
        .rev-l{opacity:0;transform:translateX(-48px);transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1);}
        .rev-r{opacity:0;transform:translateX(48px);transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1);}
        .rev-s{opacity:0;transform:scale(.92);transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1);}
        .rev.on,.rev-l.on,.rev-r.on,.rev-s.on{opacity:1;transform:translate(0,0) scale(1);}
        .d1{transition-delay:.1s}.d2{transition-delay:.22s}.d3{transition-delay:.36s}.d4{transition-delay:.5s}

        /* ══ timeline "da salina ao pote" ══ */
        .tl-wrap{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative;}
        .tl-wrap::before{content:'';position:absolute;top:34px;left:12%;right:12%;height:1.5px;background:linear-gradient(90deg,rgba(201,162,39,.15),rgba(201,162,39,.6),rgba(201,162,39,.15));}
        .tl-step{text-align:center;padding:0 14px;position:relative;}
        .tl-dot{width:68px;height:68px;border-radius:50%;margin:0 auto 22px;background:radial-gradient(circle at 32% 28%,#14294e,#081428);border:1.5px solid rgba(201,162,39,.5);display:flex;align-items:center;justify-content:center;font-family:'Cormorant Garamond',serif;font-size:1.9rem;font-weight:700;color:var(--goldlt);position:relative;z-index:1;box-shadow:0 8px 28px rgba(0,0,0,.4);}

        /* ══ cards / prices ══ */
        .pc{border-radius:26px;position:relative;overflow:hidden;transition:transform .4s cubic-bezier(.22,1,.36,1),box-shadow .4s;}
        .pc:hover{transform:translateY(-6px);}
        .pc-hi{background:linear-gradient(165deg,#10254c 0%,#060f20 100%);border:1.5px solid rgba(201,162,39,.6);box-shadow:0 24px 70px rgba(0,0,0,.5);}
        .pc-lo{background:var(--white);border:1.5px solid rgba(11,29,58,.1);box-shadow:0 10px 40px rgba(11,29,58,.08);}
        .pc-lo:hover{box-shadow:0 22px 60px rgba(11,29,58,.14);border-color:rgba(201,162,39,.45);}

        /* ══ ship option (radio) ══ */
        .sopt{border:2px solid rgba(11,29,58,.1);border-radius:14px;padding:14px 16px;cursor:pointer;transition:border-color .25s,background .25s,transform .15s;font-size:1rem;}
        .sopt:hover{border-color:rgba(11,29,58,.3);}
        .sopt:active{transform:scale(.985);}
        .sopt.sel{border-color:var(--gold);background:rgba(201,162,39,.07);box-shadow:0 4px 18px rgba(201,162,39,.15);}

        /* ══ modal — bottom sheet mobile; fica acima do botão do chat (z 9999) ══ */
        @keyframes sheetUp {from{transform:translateY(60px);opacity:0} to{transform:translateY(0);opacity:1}}
        .mo{position:fixed;inset:0;z-index:10050;background:rgba(4,10,22,.78);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:16px;}
        .mb{background:var(--white);border-radius:24px;width:100%;max-width:520px;max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.45);animation:sheetUp .4s cubic-bezier(.22,1,.36,1);}
        .mb-drag{display:none;flex:0 0 auto;width:44px;height:5px;background:rgba(11,29,58,.16);border-radius:3px;margin:10px auto 0;}
        .mb-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 32px 24px;}
        .mb-head{position:sticky;top:0;z-index:3;background:var(--white);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:26px 0 12px;}
        .mb-x{flex-shrink:0;width:44px;height:44px;border:none;border-radius:12px;background:var(--salt);color:var(--mid);font-size:1.5rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
        .mb-foot{flex:0 0 auto;padding:14px 32px calc(18px + env(safe-area-inset-bottom));border-top:1px solid rgba(11,29,58,.1);background:var(--white);box-shadow:0 -10px 24px rgba(11,29,58,.06);}
        .lnk{background:none;border:none;color:var(--brand);font:inherit;font-size:.87rem;font-weight:600;text-decoration:underline;cursor:pointer;min-height:44px;padding:0 6px;}
        .err{color:#b91c1c;font-size:.84rem;font-weight:600;margin:6px 0 0;line-height:1.4;}
        .pix-qr{width:190px;height:190px;display:block;}

        /* ══ checkout steps ══ */
        .steps{display:flex;align-items:center;justify-content:center;gap:0;margin:4px 0 18px;}
        .step-dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:800;flex-shrink:0;transition:all .3s;}
        .step-on{background:var(--gold);color:var(--navy);box-shadow:0 0 0 4px rgba(201,162,39,.2);}
        .step-done{background:var(--brand);color:#fff;}
        .step-off{background:var(--saltmd);color:var(--muted);}
        .step-line{width:44px;height:2px;background:var(--saltmd);}
        .step-line.done{background:var(--brand);}
        .step-lbl{font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:5px;text-align:center;}

        /* ══ inputs ══ */
        .inp{width:100%;box-sizing:border-box;background:var(--salt);border:2px solid transparent;border-radius:12px;padding:13px 15px;font-size:16px;outline:none;transition:border-color .2s,box-shadow .2s;font-family:'Outfit',sans-serif;color:var(--text);}
        .inp:focus{border-color:var(--gold);box-shadow:0 0 0 4px rgba(201,162,39,.12);}
        .inp[readonly]{background:var(--saltmd);color:var(--mid);}
        .inp[aria-invalid="true"]{border-color:#ef4444;}
        .inp-lbl{display:block;font-size:.76rem;font-weight:700;color:var(--mid);margin-bottom:6px;text-transform:uppercase;letter-spacing:.09em;}

        /* ══ faq ══ */
        .faq-border{border-bottom:1px solid rgba(11,29,58,.09);}
        .faq-ans{display:grid;transition:grid-template-rows .45s cubic-bezier(.22,1,.36,1),opacity .35s ease,visibility 0s linear .45s;}
        .faq-ans>div{overflow:hidden;min-height:0;}
        .faq-ans.open{grid-template-rows:1fr;opacity:1;visibility:visible;transition-delay:0s;}
        .faq-ans.closed{grid-template-rows:0fr;opacity:0;visibility:hidden;}
        .faq-ans p{font-size:1rem;line-height:1.8;}

        /* ══ benefits dark grid ══ */
        .ben-table-grid{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid rgba(201,162,39,.2);border-radius:22px;overflow:hidden;}
        .ben-cell{padding:48px 40px;background:rgba(255,255,255,.02);transition:background .35s;position:relative;}
        .ben-cell:hover{background:rgba(201,162,39,.07);}
        .ben-cell:hover .ben-icon-wrap{border-color:var(--goldlt);}
        .ben-cell-border-r{border-right:1px solid rgba(201,162,39,.2);}
        .ben-cell-border-b{border-bottom:1px solid rgba(201,162,39,.2);}
        .ben-icon-wrap{width:54px;height:54px;border-radius:50%;border:1px solid rgba(201,162,39,.5);background:rgba(201,162,39,.1);display:flex;align-items:center;justify-content:center;margin-bottom:26px;transition:border-color .35s;}
        .ben-num{position:absolute;top:20px;right:24px;font-family:'Cormorant Garamond',serif;font-size:3.6rem;font-weight:700;color:rgba(201,162,39,.09);line-height:1;pointer-events:none;user-select:none;}
        .ben-cell h3{font-size:1.45rem;}
        .ben-cell p{font-size:1rem;color:rgba(255,255,255,.7);line-height:1.75;}

        /* ══ como usar ══ */
        .use-2col{display:grid;grid-template-columns:1fr 1fr;gap:0 64px;}
        .use-row{display:flex;align-items:flex-start;gap:22px;padding:30px 0;border-bottom:1px solid rgba(11,29,58,.08);}
        .use-row:last-child{border-bottom:none;}
        .use-big-num{font-family:'Cormorant Garamond',serif;font-size:4.4rem;font-weight:700;color:rgba(201,162,39,.35);line-height:1;min-width:70px;text-align:right;flex-shrink:0;padding-top:4px;}
        .use-row h3{font-size:1.3rem;}
        .use-row p{font-size:1rem;}

        /* ══ diferenciais ══ */
        .fact-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
        .fact{background:white;border:1px solid rgba(201,162,39,.25);border-radius:18px;padding:26px 24px;box-shadow:0 8px 30px rgba(11,29,58,.07);}

        /* ══ misc ══ */
        .eyebrow{font-size:.85rem;font-weight:700;letter-spacing:.28em;text-transform:uppercase;margin-bottom:12px;color:var(--golddk);}
        .gold-line{width:56px;height:2px;background:linear-gradient(90deg,var(--gold),var(--goldlt));margin:0 auto 20px;}
        .prod-img{mix-blend-mode:multiply;background:transparent;display:block;}
        .s-brand{background:linear-gradient(170deg,#060f20 0%,#0b1d3a 55%,#081428 100%);}
        .ham{display:none;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;background:none;border:none;min-width:44px;min-height:44px;padding:8px;border-radius:8px;}
        .ham span{display:block;width:24px;height:2px;background:white;border-radius:2px;transition:transform .3s,opacity .3s;}
        .mob-drawer{display:none;position:fixed;inset:0;z-index:200;background:rgba(4,10,22,.85);backdrop-filter:blur(14px);}
        .mob-drawer-inner{position:absolute;top:0;right:0;bottom:0;width:min(80vw,300px);background:var(--navy);padding:24px;display:flex;flex-direction:column;gap:4px;box-shadow:-20px 0 60px rgba(0,0,0,.5);}
        .sticky-bar{display:none;position:fixed;bottom:0;left:0;right:0;z-index:500;background:rgba(6,15,32,.96);backdrop-filter:blur(16px);border-top:1px solid rgba(201,162,39,.25);padding:10px 14px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -8px 40px rgba(0,0,0,.4);}
        .footer-grid p,.footer-grid li,.footer-grid a{font-size:.95rem;}
        .foot-link{display:inline-flex;align-items:center;min-height:44px;min-width:44px;color:rgba(255,255,255,.72);text-decoration:none;transition:color .2s;}
        .foot-link:hover{color:var(--goldlt);}
        .trust-strip{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}

        /* ══ nav compacta (menu em gaveta) ══ */
        @media(max-width:940px){
          .nav-menu{display:none!important;}
          .ham{display:flex!important;}
          .mob-drawer{display:block;}
        }

        /* ══ mobile ══ */
        @media(max-width:768px){
          .hero-grid{grid-template-columns:1fr!important;padding:88px 20px 120px!important;gap:16px!important;}
          .hero-copy{text-align:center;}
          .hero-badges{justify-content:center!important;}
          .hero-btns{justify-content:center!important;}
          .hero-img-wrap{order:-1;}
          .prod-shell{width:min(76vw,330px)!important;height:min(76vw,330px)!important;}
          .s-pad{padding:64px 20px!important;}
          .story-grid{grid-template-columns:1fr!important;gap:32px!important;}
          .panorama{min-height:440px!important;}
          .crista-section{height:340px!important;}
          .tl-wrap{grid-template-columns:1fr 1fr!important;gap:36px 8px!important;}
          .tl-wrap::before{display:none!important;}
          .use-2col{grid-template-columns:1fr!important;gap:0!important;}
          .use-big-num{font-size:3rem!important;min-width:46px!important;}
          .price-grid{grid-template-columns:1fr!important;}
          .footer-grid{grid-template-columns:1fr!important;gap:20px!important;}
          .fact-grid{grid-template-columns:1fr!important;}
          .mo{align-items:flex-end!important;padding:0!important;}
          .mb{border-radius:26px 26px 0 0!important;max-height:92vh!important;max-height:92dvh!important;animation:sheetUp .38s cubic-bezier(.22,1,.36,1)!important;}
          .mb-drag{display:block!important;}
          .mb-body{padding:0 20px 16px!important;}
          .mb-head{padding:10px 0 8px!important;}
          .mb-foot{padding:10px 20px calc(12px + env(safe-area-inset-bottom))!important;}
          .pix-qr{width:150px;height:150px;}
          .sticky-bar{display:flex!important;}
          .faq-border button{padding:18px 0!important;}
          .pc{padding:28px 22px!important;}
          .trust-strip{grid-template-columns:1fr 1fr!important;}
          .story-stats{gap:18px!important;}
          .cred-wrap{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;}
        }
        @media(max-width:900px){.ben-table-grid{grid-template-columns:repeat(2,1fr)!important;}}
        @media(max-width:600px){
          .ben-table-grid{grid-template-columns:1fr!important;}
          .ben-cell{padding:32px 24px!important;}
          .ben-cell-border-r{border-right:none!important;border-bottom:1px solid rgba(201,162,39,.2)!important;}
        }

        /* ══ acessibilidade — reduz movimento ══ */
        @media(prefers-reduced-motion:reduce){
          .w-rev,.h-rev{animation-duration:.01s!important;}
          .spin{animation:none!important;}
          .rev,.rev-l,.rev-r,.rev-s{transition-duration:.01s!important;}
          html{scroll-behavior:auto;}
        }
      `}</style>

      <div className="lp">

        {/* ══════ PEDIDO PENDENTE ══════ */}
        {pendingOrder&&!showModal&&(
          <div role="region" aria-label="Pedido aguardando pagamento" style={{background:'#060f20',borderBottom:'1px solid rgba(201,162,39,.35)',padding:'84px 20px 14px'}}>
            <div style={{maxWidth:1000,margin:'0 auto',display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'center',gap:'6px 18px',color:'white',fontSize:'.95rem'}}>
              <span>Você tem o pedido <strong>#{pendingOrder.id}</strong> aguardando pagamento.</span>
              <span style={{display:'inline-flex',alignItems:'center',gap:6}}>
                {pendingOrder.trackToken
                  ? <button type="button" className="lnk" onClick={resumePending} style={{color:'var(--goldlt)'}}>Continuar pagamento</button>
                  : <a className="lnk" href={`/meu-pedido?pedido=${pendingOrder.id}`} style={{color:'var(--goldlt)',display:'inline-flex',alignItems:'center'}}>Continuar pagamento</a>}
                <button type="button" className="lnk" onClick={clearPending} style={{color:'rgba(255,255,255,.75)'}}>Descartar</button>
              </span>
            </div>
          </div>
        )}

        {/* ══════ NAV ══════ */}
        <nav aria-label="Principal" style={{position:'fixed',top:0,left:0,right:0,zIndex:100,transition:'background .4s,box-shadow .4s,padding .3s',background:scrolled||mobileMenu?'rgba(6,15,32,.96)':'transparent',boxShadow:scrolled?'0 2px 32px rgba(0,0,0,.45)':'none',padding:scrolled?'10px 0':'20px 0',backdropFilter:scrolled?'blur(18px)':'none',borderBottom:scrolled?'1px solid rgba(201,162,39,.15)':'1px solid transparent'}}>
          <div style={{maxWidth:1200,margin:'0 auto',padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <Logo size={44}/>
            <div className="nav-menu" style={{display:'flex',gap:26,alignItems:'center'}}>
              {navLinks.map(({l,h})=>(
                <a key={l} href={h} style={{color:'rgba(255,255,255,.78)',fontSize:'.86rem',fontWeight:500,letterSpacing:'.12em',textDecoration:'none',textTransform:'uppercase',transition:'color .2s'}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--goldlt)'}
                  onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.78)'}>{l}</a>
              ))}
              <button className="cta-gold" onClick={()=>openBuy(PRODUCTS[0])} style={{background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:10,padding:'11px 24px',fontSize:'.86rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>Comprar</button>
            </div>
            <button className="ham" onClick={()=>setMobileMenu(o=>!o)} aria-label="Menu" aria-expanded={mobileMenu}>
              <span style={{transform:mobileMenu?'translateY(7px) rotate(45deg)':'none'}}/>
              <span style={{opacity:mobileMenu?0:1}}/>
              <span style={{transform:mobileMenu?'translateY(-7px) rotate(-45deg)':'none'}}/>
            </button>
          </div>
        </nav>

        {/* ══════ MOBILE DRAWER ══════ */}
        <div className="mob-drawer" aria-hidden={!mobileMenu} style={{opacity:mobileMenu?1:0,pointerEvents:mobileMenu?'auto':'none',visibility:mobileMenu?'visible':'hidden',transition:'opacity .3s'}} onClick={e=>{if(e.target===e.currentTarget)setMobileMenu(false)}}>
          <div className="mob-drawer-inner" style={{transform:mobileMenu?'translateX(0)':'translateX(100%)',transition:'transform .34s cubic-bezier(.22,1,.36,1)'}}>
            <div style={{marginBottom:24,paddingBottom:20,borderBottom:'1px solid rgba(201,162,39,.2)'}}><Logo size={40}/></div>
            {navLinks.map(({l,h})=>(
              <a key={l} href={h} onClick={()=>setMobileMenu(false)} style={{display:'block',padding:'15px 0',color:'rgba(255,255,255,.85)',fontSize:'1.15rem',fontFamily:"'Cormorant Garamond',serif",fontWeight:600,textDecoration:'none',borderBottom:'1px solid rgba(255,255,255,.07)',letterSpacing:'.04em'}}>{l}</a>
            ))}
            <button className="cta-gold" onClick={()=>{ setMobileMenu(false); setTimeout(()=>document.getElementById('preco')?.scrollIntoView({behavior:'smooth'}),100); }} style={{marginTop:24,width:'100%',background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:14,padding:'16px',fontSize:'1rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer'}}>
              Comprar Agora
            </button>
          </div>
        </div>

        {/* ══════ HERO ══════ */}
        <section className="grain" style={{minHeight:'100vh',display:'flex',alignItems:'center',paddingTop:80,position:'relative',overflow:'hidden',background:'radial-gradient(ellipse 120% 90% at 70% 12%,#12264c 0%,#0b1d3a 42%,#060f20 100%)'}}>
          <div style={{position:'absolute',top:'-18%',right:'-8%',width:640,height:640,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,.14) 0%,transparent 62%)',pointerEvents:'none',filter:'blur(10px)'}}/>
          <div style={{position:'absolute',bottom:'-12%',left:'-6%',width:480,height:480,borderRadius:'50%',background:'radial-gradient(circle,rgba(22,47,94,.5) 0%,transparent 65%)',pointerEvents:'none'}}/>

          <div className="hero-grid" style={{maxWidth:1200,margin:'0 auto',padding:'80px 24px 110px',width:'100%',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:56,alignItems:'center',position:'relative',zIndex:2}}>
            {/* Copy */}
            <div className="hero-copy">
              <div className="h-rev" style={{animationDelay:'.15s',display:'inline-flex',alignItems:'center',gap:10,marginBottom:26,background:'rgba(201,162,39,.1)',border:'1px solid rgba(201,162,39,.35)',borderRadius:999,padding:'8px 18px'}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:'var(--goldlt)',flexShrink:0}}/>
                <span style={{fontSize:'.8rem',fontWeight:700,letterSpacing:'.2em',color:'var(--goldlt)',textTransform:'uppercase'}}>Salinas de Mossoró · RN · Brasil</span>
              </div>

              <h1 className="hero-title" style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(3.4rem,9vw,7rem)',fontWeight:700,lineHeight:.98,color:'white',marginBottom:6,textShadow:'0 2px 48px rgba(0,0,0,.4)'}}>
                <span className="w-rev" style={{animationDelay:'.28s'}}>SAL</span>{' '}
                <span className="w-rev" style={{animationDelay:'.44s'}}>VITA</span>
              </h1>
              <div className="h-rev" style={{animationDelay:'.62s',fontFamily:"'Cormorant Garamond',Georgia,serif",fontStyle:'italic',fontWeight:600,fontSize:'clamp(2.5rem,6.5vw,5rem)',lineHeight:1.1,marginTop:-6}}>
                <span className="shim-blue">Premium</span>
              </div>
              <div className="h-rev" style={{animationDelay:'.76s',width:72,height:1.5,background:'linear-gradient(90deg,var(--gold),var(--goldlt),transparent)',margin:'14px 0 26px'}}/>
              <p className="h-rev" style={{animationDelay:'.84s',fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(1.35rem,3vw,2.1rem)',fontWeight:400,fontStyle:'italic',color:'rgba(255,255,255,.78)',lineHeight:1.45,marginBottom:16}}>
                "Muito mais sabor,<br/>em cada pitada."
              </p>
              <p className="h-rev" style={{animationDelay:'.92s',fontSize:'.92rem',letterSpacing:'.18em',textTransform:'uppercase',color:'rgba(255,255,255,.62)',fontWeight:600,marginBottom:38}}>
                Sal integral · sem refino industrial · Mossoró/RN
              </p>

              <div className="hero-badges h-rev" style={{animationDelay:'1s',display:'flex',flexWrap:'wrap',gap:8,marginBottom:42}}>
                {[{t:'Minerais Traço'},{t:'Não Refinado'},{t:'Seco ao Sol'},{t:'Zip Lock com Janela'}].map(b=>(
                  <span key={b.t} style={{background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.16)',borderRadius:999,padding:'8px 16px',fontSize:'.88rem',fontWeight:500,color:'rgba(255,255,255,.85)',display:'flex',alignItems:'center',gap:8,letterSpacing:'.04em'}}>
                    <span aria-hidden="true" style={{color:'var(--goldlt)',fontSize:'.75rem'}}>✦</span> {b.t}
                  </span>
                ))}
              </div>

              <div className="hero-btns h-rev" style={{animationDelay:'1.1s',display:'flex',flexWrap:'wrap',gap:14}}>
                <button className="cta-gold" onClick={()=>openBuy(PRODUCTS[0])} style={{background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:16,padding:'19px 46px',fontSize:'1.02rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                  Quero Provar
                </button>
                <a href="#preco" style={{background:'transparent',color:'rgba(255,255,255,.88)',border:'1.5px solid rgba(255,255,255,.28)',borderRadius:16,padding:'19px 38px',fontSize:'1.02rem',fontWeight:500,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer',textDecoration:'none',display:'inline-flex',alignItems:'center',transition:'border-color .2s,color .2s,background .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--goldlt)';e.currentTarget.style.color='var(--goldlt)';e.currentTarget.style.background='rgba(201,162,39,.07)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.28)';e.currentTarget.style.color='rgba(255,255,255,.88)';e.currentTarget.style.background='transparent';}}>
                  Ver Preços ↓
                </a>
              </div>
            </div>

            {/* Produto — fundo calmo, sombra suave de contato */}
            <div className="hero-img-wrap h-rev" style={{animationDelay:'.5s',display:'flex',justifyContent:'center',alignItems:'center',position:'relative'}}>
              <div className="prod-shell" style={{position:'relative',zIndex:2,width:480,height:480,borderRadius:'50%',background:'#ffffff',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 40px 90px rgba(0,0,0,.55), 0 0 0 10px rgba(201,162,39,.12), 0 0 0 1.5px rgba(201,162,39,.5)'}}>
                <img src={IMG.produto} alt="Embalagem SAL VITA PREMIUM — Sal Marinho Não Refinado, Sal Integral de Mossoró (1kg)" className="prod-img"
                  width={896} height={1195} loading="eager" fetchPriority="high" decoding="async"
                  style={{width:'92%',height:'92%',objectFit:'contain'}}
                  onError={e=>{
                    e.currentTarget.style.display='none';
                    (e.currentTarget.nextElementSibling as HTMLElement).style.display='flex';
                  }}
                />
                <div style={{display:'none',width:'100%',height:'100%',background:'linear-gradient(160deg,#0b1d3a,#060f20)',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:28}}>
                  <Logo size={56}/>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.5rem',fontWeight:700,color:'white',marginTop:12,textAlign:'center'}}>SAL VITA PREMIUM</div>
                  <div style={{fontSize:'.8rem',color:'rgba(255,255,255,.7)',textAlign:'center'}}>Sal Marinho Não Refinado · 1kg · Mossoró/RN</div>
                </div>
              </div>
              <div aria-hidden="true" style={{position:'absolute',bottom:-34,left:'50%',transform:'translateX(-50%)',width:300,height:38,background:'rgba(0,0,0,.5)',borderRadius:'50%',filter:'blur(30px)'}}/>
            </div>
          </div>

          {/* transição em cristal — clip diagonal sutil */}
          <div aria-hidden="true" style={{position:'absolute',bottom:-1,left:0,right:0,lineHeight:0}}>
            <svg viewBox="0 0 1440 88" preserveAspectRatio="none" style={{width:'100%',height:88,display:'block'}}>
              <path d="M0,52 L180,66 L390,38 L620,70 L860,42 L1100,64 L1290,46 L1440,60 L1440,88 L0,88 Z" fill="#fbfaf7"/>
              <path d="M0,52 L180,66 L390,38 L620,70 L860,42 L1100,64 L1290,46 L1440,60" fill="none" stroke="rgba(201,162,39,.4)" strokeWidth="1.5"/>
            </svg>
          </div>
        </section>

        {/* ══════ FAIXA DE FATOS VERIFICÁVEIS ══════ */}
        <div style={{background:'#fbfaf7',borderBottom:'1px solid rgba(11,29,58,.07)',padding:'22px 20px'}}>
          <div className="trust-strip">
            {[
              ['Mossoró/RN','Origem'],
              ['Iodado — 25\u00a0mg/kg','Conforme a legislação'],
              ['Mercado Pago','Pagamento via'],
              ['51.422.900/0001-68','CNPJ'],
            ].map(([a,b])=>(
              <div key={a} style={{textAlign:'center',padding:'6px 8px'}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1rem,4.4vw,1.25rem)',fontWeight:700,color:'var(--brand)',lineHeight:1.2,whiteSpace:a.startsWith('51.')?'nowrap':undefined}}>{a}</div>
                <div style={{fontSize:'.8rem',color:'var(--muted)',letterSpacing:'.04em',marginTop:3}}>{b}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════ DIREITO DE ARREPENDIMENTO ══════ */}
        <div style={{background:'#f0fdf4',borderBottom:'1px solid #bbf7d0',padding:'16px 24px'}}>
          <div style={{maxWidth:900,margin:'0 auto',display:'flex',flexWrap:'wrap',gap:'8px 24px',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
            <div>
              <p style={{margin:0,fontWeight:800,fontSize:'1rem',color:'#15803d'}}>Direito de arrependimento</p>
              <p style={{margin:'2px 0 0',fontSize:'.88rem',color:'#166534'}}>Em até 7 dias após o recebimento (CDC, art. 49).</p>
            </div>
            <p style={{margin:0,fontSize:'.88rem',color:'#166534',fontWeight:500}}>Pagamento seguro · Envio rastreado · Nota fiscal · Suporte pelo WhatsApp</p>
          </div>
        </div>

        {/* ══════ PANORAMA — MORROS DE SAL ══════ */}
        <section className="panorama" style={{position:'relative',minHeight:600,overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,backgroundImage:`url('${IMG.morrosSal}')`,backgroundSize:'cover',backgroundPosition:'center 40%',backgroundRepeat:'no-repeat',filter:'contrast(1.1) saturate(1.12) brightness(1.02)'}}/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,#fbfaf7 0%,transparent 8%,transparent 76%,#fbfaf7 100%)'}}/>
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:'38%',background:'linear-gradient(to bottom,transparent,rgba(0,0,0,.58))'}}/>
          <div style={{position:'relative',zIndex:2,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',minHeight:600,padding:'0 24px 56px'}}>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.7rem,4.2vw,3rem)',fontWeight:400,fontStyle:'italic',color:'white',textShadow:'0 2px 28px rgba(0,0,0,.9)',marginBottom:16,textAlign:'center'}}>
              Das maiores salinas do Brasil para a sua mesa
            </p>
            <div style={{display:'inline-flex',alignItems:'center',gap:12,background:'rgba(0,0,0,.42)',backdropFilter:'blur(5px)',borderRadius:40,padding:'8px 22px',border:'1px solid rgba(201,162,39,.4)'}}>
              <span style={{width:22,height:1,background:'rgba(201,162,39,.9)'}}/>
              <p style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.2em',color:'#f5d060',textTransform:'uppercase',margin:0}}>Mossoró · Rio Grande do Norte · Brasil</p>
              <span style={{width:22,height:1,background:'rgba(201,162,39,.9)'}}/>
            </div>
          </div>
        </section>

        {/* ══════ STORY / ORIGEM ══════ */}
        <section id="produto" className="s-pad" style={{padding:'104px 24px',background:'white'}}>
          <div className="story-grid" style={{maxWidth:1200,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:64,alignItems:'center'}}>
            <div id="story-left" data-reveal className={`rev-l${v('story-left')?' on':''}`}>
              <p className="eyebrow">Nossa Origem</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.3rem,5vw,4rem)',fontWeight:700,lineHeight:1.12,color:'var(--text)',marginBottom:22}}>
                Das salinas ao<br/>
                <em style={{color:'var(--brand)',fontStyle:'italic'}}>seu prato.</em>
              </h2>
              <p style={{color:'var(--mid)',lineHeight:1.8,fontSize:'1.06rem',marginBottom:18}}>
                Mossoró produz <strong style={{color:'var(--brand)'}}>mais de 95% do sal marinho brasileiro</strong>. O sol nordestino, os ventos constantes e a baixíssima umidade criam condições favoráveis à produção de sal por evaporação solar.
              </p>
              <p style={{color:'var(--mid)',lineHeight:1.8,fontSize:'1.06rem',marginBottom:38}}>
                O SAL VITA PREMIUM é <strong style={{color:'var(--brand)'}}>Não Refinado</strong> — preserva os minerais traço naturais do mar, entregando muito mais sabor em cada pitada.
              </p>
              <div className="story-stats" style={{display:'flex',gap:40,flexWrap:'wrap'}}>
                {[['Dezenas','Minerais traço do mar'],['95%','do sal BR vem do RN'],['Não Refinado','do oceano Atlântico']].map(([n,l])=>(
                  <div key={n}>
                    <div className="shim-blue" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'2.4rem',fontWeight:700}}>{n}</div>
                    <div style={{fontSize:'.87rem',color:'var(--muted)',letterSpacing:'.06em',marginTop:4}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div id="story-right" data-reveal className={`rev-r d2${v('story-right')?' on':''}`} style={{display:'flex',justifyContent:'center'}}>
              <div style={{position:'relative',maxWidth:400,width:'100%',borderRadius:24,overflow:'hidden',boxShadow:'0 30px 80px rgba(11,29,58,.22)',border:'1px solid rgba(201,162,39,.25)'}}>
                <img src={IMG.salina} alt="Salinas de Mossoró" width={1200} height={800} style={{width:'100%',height:400,objectFit:'cover',objectPosition:'center',display:'block'}} loading="lazy" decoding="async"/>
                <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(6,15,32,.9) 0%,rgba(6,15,32,.25) 45%,transparent 100%)'}}/>
                <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'24px 28px 28px'}}>
                  <div className="shim-blue" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.5rem',fontWeight:700,lineHeight:1}}>Dezenas</div>
                  <p style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.14em',color:'rgba(255,255,255,.85)',textTransform:'uppercase',margin:0}}>de minerais traço naturais</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ DA SALINA AO POTE ══════ */}
        <section className="grain" style={{padding:'104px 24px',background:'linear-gradient(170deg,#081428 0%,#0b1d3a 60%,#060f20 100%)',position:'relative',overflow:'hidden'}}>
          <div style={{maxWidth:1100,margin:'0 auto',position:'relative',zIndex:1}}>
            <div id="tl-h" data-reveal className={`rev${v('tl-h')?' on':''}`} style={{textAlign:'center',marginBottom:76}}>
              <span style={{display:'inline-block',fontSize:'.84rem',fontWeight:700,letterSpacing:'.26em',color:'var(--gold)',textTransform:'uppercase',marginBottom:16}}>O caminho do sal</span>
              <div style={{width:40,height:1,background:'rgba(201,162,39,.5)',margin:'0 auto 24px'}}/>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.1rem,5vw,3.8rem)',fontWeight:700,color:'white',lineHeight:1.12}}>
                Da salina ao pote,<br/>sem refino industrial.
              </h2>
            </div>
            <div id="tl-g" data-reveal className={`tl-wrap${v('tl-g')?' on':''}`}>
              {[
                {t:'Colheita',d:'A água do mar cristaliza nos tanques sob o sol de Mossoró.'},
                {t:'Secagem ao sol',d:'Evaporação solar — sem fornos, sem calor industrial, sem pressa.'},
                {t:'Moagem',d:'Apenas os processos essenciais: colheita, secagem e moagem. Sem refino industrial.'},
                {t:'Embalagem',d:'Zip lock com janela transparente, pronta para a sua cozinha.'},
              ].map((s,i)=>(
                <div key={s.t} className={`tl-step rev d${i+1}${v('tl-g')?' on':''}`}>
                  <div className="tl-dot" aria-hidden="true">{i+1}</div>
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.35rem',fontWeight:700,color:'white',marginBottom:8,lineHeight:1.2}}>{s.t}</h3>
                  <p style={{color:'rgba(255,255,255,.7)',lineHeight:1.7,fontSize:'.92rem'}}>{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ BENEFITS ══════ */}
        <section id="beneficios" className="grain" style={{padding:'110px 24px',background:'linear-gradient(170deg,#050e1d 0%,#0b1d3a 50%,#071628 100%)',position:'relative',overflow:'hidden'}}>
          <div style={{maxWidth:1200,margin:'0 auto',position:'relative',zIndex:1}}>
            <div id="ben-h" data-reveal className={`rev${v('ben-h')?' on':''}`} style={{textAlign:'center',marginBottom:72}}>
              <span style={{display:'inline-block',fontSize:'.84rem',fontWeight:700,letterSpacing:'.26em',color:'var(--gold)',textTransform:'uppercase',marginBottom:16}}>Por que escolher</span>
              <div style={{width:40,height:1,background:'rgba(201,162,39,.5)',margin:'0 auto 24px'}}/>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.2rem,5vw,4rem)',fontWeight:700,color:'white',lineHeight:1.1}}>
                Feito para quem<br/>valoriza o que come
              </h2>
            </div>
            <div id="ben-g" data-reveal className={`rev ben-table-grid${v('ben-g')?' on':''}`}>
              {[
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,t:'Minerais Traço Naturais',d:'Dezenas de minerais traço naturais, presentes na água do mar e preservados por não haver refino industrial.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,t:'Sal Não Refinado',d:'Processamento mínimo — colheita, secagem ao sol e moagem. Nenhum mineral traço é retirado no processo.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,t:'Embalagem Zip Lock',d:'Embalagem zip lock com janela transparente: abre e fecha sempre que precisar.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>,t:'Janela Transparente',d:'Circular na frente da embalagem. Você vê o sal a qualquer momento, sem precisar abrir.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>,t:'Seco ao Sol',d:'Secagem por evaporação solar sob o sol do Nordeste. Sem calor industrial e sem refino que remova os minerais traço.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12c1.5-3 4-4.5 6-4.5s4.5 3 6 3 4.5-1.5 6-4.5"/><path d="M2 18c1.5-3 4-4.5 6-4.5s4.5 3 6 3 4.5-1.5 6-4.5"/></svg>,t:'Mossoró/RN',d:'Das salinas da região que produz mais de 95% do sal marinho brasileiro.'},
              ].map((b,i)=>(
                <div key={b.t} className={`ben-cell${i%3!==2?' ben-cell-border-r':''}${i<3?' ben-cell-border-b':''}`} style={{transitionDelay:`${i*.08}s`}}>
                  <span className="ben-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span>
                  <div className="ben-icon-wrap">{b.svg}</div>
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:'white',marginBottom:12,lineHeight:1.2}}>{b.t}</h3>
                  <p>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ CRISTALIZADOR — full bleed ══════ */}
        <section className="crista-section" style={{position:'relative',height:500,overflow:'hidden'}}>
          <img src={IMG.cristalizador} alt="Processo de cristalização do sal nas salinas de Mossoró" width={1280} height={960} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 40%',display:'block'}} loading="lazy" decoding="async"/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,#071628 0%,rgba(7,22,40,0) 14%,rgba(7,22,40,.35) 65%,#faf5ef 100%)'}}/>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 24px'}}>
            <div id="crista-q" data-reveal className={`rev-s${v('crista-q')?' on':''}`} style={{textAlign:'center',maxWidth:700}}>
              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.5rem,4vw,2.8rem)',fontWeight:600,fontStyle:'italic',color:'white',textShadow:'0 2px 24px rgba(0,0,0,.85)',lineHeight:1.3,marginBottom:20}}>
                "Colhido sob o sol nordestino,<br/>cristalizado pelo vento do sertão."
              </p>
              <div style={{display:'inline-flex',alignItems:'center',gap:12}}>
                <span style={{width:40,height:1,background:'rgba(201,162,39,.7)'}}/>
                <span style={{fontSize:'.84rem',fontWeight:700,letterSpacing:'.18em',color:'var(--goldlt)',textTransform:'uppercase'}}>Processo de Cristalização Natural</span>
                <span style={{width:40,height:1,background:'rgba(201,162,39,.7)'}}/>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ COMO USAR ══════ */}
        <section id="como-usar" style={{padding:'108px 24px',background:'#faf5ef'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div id="use-h" data-reveal className={`rev${v('use-h')?' on':''}`} style={{textAlign:'center',marginBottom:78}}>
              <span style={{display:'inline-block',fontSize:'.84rem',fontWeight:700,letterSpacing:'.26em',color:'var(--golddk)',textTransform:'uppercase',marginBottom:16}}>Na cozinha</span>
              <div className="gold-line"/>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.8rem)',fontWeight:700,color:'var(--text)',marginBottom:18,lineHeight:1.1}}>
                O sal que combina com tudo
              </h2>
              <p style={{color:'var(--muted)',fontSize:'1rem',maxWidth:460,margin:'0 auto',lineHeight:1.7}}>
                Sal marinho não refinado para o preparo e a finalização dos seus pratos.
              </p>
            </div>
            <div id="use-g" data-reveal className={`rev use-2col${v('use-g')?' on':''}`}>
              {USES.map((u,i)=>(
                <div key={u.t} className="use-row" style={{transitionDelay:`${i*.09}s`}}>
                  <span className="use-big-num" aria-hidden="true">{String(i+1).padStart(2,'0')}</span>
                  <div style={{paddingTop:6}}>
                    <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontWeight:700,color:'var(--brand)',marginBottom:5,lineHeight:1.2}}>{u.t}</h3>
                    <p style={{color:'var(--muted)',lineHeight:1.65}}>{u.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ DIFERENCIAIS ══════ */}
        <section style={{padding:'84px 24px',background:'#fbfaf7'}}>
          <div style={{maxWidth:900,margin:'0 auto'}}>
            <div id="comp-h" data-reveal className={`rev${v('comp-h')?' on':''}`} style={{textAlign:'center',marginBottom:40}}>
              <p className="eyebrow">Sal integral vs refinado</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.9rem,4vw,3.1rem)',fontWeight:700,color:'var(--text)'}}>O que o refinamento retira do seu sal?</h2>
              <p style={{color:'var(--muted)',marginTop:12,fontSize:'.95rem',maxWidth:560,margin:'12px auto 0'}}>O refino industrial remove os minerais traço naturalmente presentes na água do mar, deixando essencialmente cloreto de sódio.</p>
            </div>
            <div id="comp-t" data-reveal className={`rev fact-grid${v('comp-t')?' on':''}`}>
              {[
                ['Sem refino industrial','Sem refino industrial que remova os minerais traço.'],
                ['Origem: Mossoró/RN','Das salinas da região que produz mais de 95% do sal marinho brasileiro.'],
                ['Embalagem zip lock','Embalagem zip lock com janela transparente.'],
              ].map(([t,d])=>(
                <div key={t} className="fact">
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.3rem',fontWeight:700,color:'var(--brand)',marginBottom:8,lineHeight:1.2}}>{t}</h3>
                  <p style={{color:'var(--mid)',fontSize:'.95rem',lineHeight:1.65}}>{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ PRICING ══════ */}
        <section id="preco" className="s-brand grain" style={{padding:'104px 24px',position:'relative',overflow:'hidden'}}>
          <div style={{maxWidth:1100,margin:'0 auto',position:'relative',zIndex:1}}>
            <div id="price-h" data-reveal className={`rev${v('price-h')?' on':''}`} style={{textAlign:'center',marginBottom:64}}>
              <p style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--gold)',marginBottom:12}}>Escolha seu pack</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.6rem)',fontWeight:700,color:'white',marginBottom:10}}>
                Preço justo. Qualidade real.
              </h2>
              <p style={{color:'rgba(255,255,255,.7)',fontSize:'1.05rem'}}>Frete calculado por CEP via Melhor Envio · Enviamos para todo o Brasil</p>
            </div>

            <div id="price-c" data-reveal className={`rev price-grid${v('price-c')?' on':''}`} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:24,maxWidth:1040,margin:'0 auto'}}>
              {PRODUCTS.map(p=>(
                <div key={p.id} className={`pc ${p.highlight?'pc-hi':'pc-lo'}`} style={{padding:'38px 32px'}}>
                  <div style={{position:'absolute',top:0,right:0,background:'linear-gradient(90deg,var(--gold),var(--goldlt))',color:'var(--navy)',padding:'7px 18px',borderRadius:'0 26px 0 14px',fontSize:'.76rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase'}}>{p.tag}</div>

                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.75rem',fontWeight:700,color:p.highlight?'white':'var(--text)',marginBottom:4,marginTop:8}}>{p.name}</h3>
                  <p style={{fontSize:'.9rem',color:p.highlight?'rgba(255,255,255,.7)':'var(--muted)',marginBottom:20}}>{p.weight}</p>

                  {p.highlight&&(
                    <p style={{fontSize:'.85rem',color:'rgba(255,255,255,.7)',marginBottom:6,lineHeight:1.4}}>10 × R$ 29,90 = R$ 299,00 avulsas · na caixa R$ 149,90</p>
                  )}
                  <div style={{marginBottom:4}}>
                    <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.6rem',fontWeight:700,color:p.highlight?'var(--goldlt)':'var(--brand)',lineHeight:1}}>{brl(p.price)}</span>
                  </div>
                  <p style={{fontSize:'.9rem',color:p.highlight?'rgba(255,255,255,.7)':'var(--muted)',marginBottom:24}}>{brl(p.pricePerKg)}/kg</p>

                  <ul style={{listStyle:'none',padding:0,marginBottom:28}}>
                    {(p.highlight
                      ? ['10 embalagens zip lock de 1kg','Minerais traço naturais preservados','Sal marinho não refinado de Mossoró','Ideal para casa, churrasco e cozinha']
                      : ['Sal Marinho Não Refinado','Minerais Traço Naturais','Zip lock com janela de visualização','Mossoró/RN']
                    ).map(f=>(
                      <li key={f} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                        <span aria-hidden="true" style={{color:'var(--gold)',fontSize:'.85rem',flexShrink:0}}>✦</span>
                        <span style={{fontSize:'.95rem',color:p.highlight?'rgba(255,255,255,.86)':'var(--mid)'}}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button className="cta-gold" onClick={()=>openBuy(p)} style={{width:'100%',background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:14,padding:'17px',fontSize:'1rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .15s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                    {p.id==='1kg'?'Comprar 1kg':p.id==='3kg'?'Comprar Trio 3kg':'Comprar Caixa 10kg'}
                  </button>
                </div>
              ))}
            </div>

            {/* Credibilidade */}
            <div className="cred-wrap" style={{marginTop:40,display:'flex',flexWrap:'wrap',justifyContent:'center',gap:12}}>
              {[
                {t:'Entrega Rastreada',s:'rastreamento em todos os pedidos'},
                {t:'Nota Fiscal',s:'emitida em todos os pedidos'},
                {t:'Pagamento Seguro',s:'PIX ou cartão, via Mercado Pago'},
                {t:'Direito de arrependimento',s:'até 7 dias após o recebimento (CDC, art. 49)'},
              ].map(({t,s})=>(
                <div key={t} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:14,padding:'12px 16px',minWidth:180}}>
                  <span aria-hidden="true" style={{color:'var(--gold)',fontSize:'1rem',flexShrink:0}}>✓</span>
                  <div>
                    <p style={{color:'white',fontWeight:700,fontSize:'.9rem',lineHeight:1.2}}>{t}</p>
                    <p style={{color:'rgba(255,255,255,.7)',fontSize:'.8rem',marginTop:2}}>{s}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{textAlign:'center',color:'rgba(255,255,255,.75)',fontSize:'.9rem',marginTop:18}}>
              Dúvidas sobre entrega ou troca: <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{color:'var(--goldlt)',fontWeight:600}}>fale conosco no WhatsApp</a>
            </p>

            {/* Atacado */}
            <div style={{maxWidth:820,margin:'36px auto 0',background:'linear-gradient(135deg,rgba(201,162,39,.13) 0%,rgba(201,162,39,.05) 100%)',border:'1px solid rgba(201,162,39,.4)',borderRadius:20,padding:'28px 32px',display:'flex',flexWrap:'wrap',alignItems:'center',gap:24,justifyContent:'space-between'}}>
              <div style={{flex:'1 1 280px'}}>
                <p style={{fontSize:'.78rem',fontWeight:700,letterSpacing:'.18em',color:'var(--gold)',textTransform:'uppercase',marginBottom:8}}>Atacado & Distribuição</p>
                <p style={{color:'white',fontWeight:700,fontSize:'1.1rem',lineHeight:1.3,marginBottom:6}}>Compra em grande volume?</p>
                <p style={{color:'rgba(255,255,255,.75)',fontSize:'.9rem',lineHeight:1.6}}>Distribuidores, restaurantes, mercados e compras acima de 50kg: peça uma cotação. Preço e frete combinados com a nossa equipe.</p>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10,alignItems:'stretch',flexShrink:0}}>
                <a href="/atacado"
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',background:'var(--gold)',color:'var(--navy)',padding:'14px 24px',borderRadius:14,fontSize:'.95rem',fontWeight:800,textDecoration:'none',whiteSpace:'nowrap',transition:'background .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                  Solicitar cotação de atacado
                </a>
                <a href={`${WA_LINK}?text=${encodeURIComponent('Olá! Tenho interesse em compra de grande volume / distribuição do SAL VITA PREMIUM. Podemos conversar sobre condições especiais?')}`} target="_blank" rel="noopener noreferrer"
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,minHeight:44,color:'white',border:'1.5px solid rgba(255,255,255,.35)',padding:'10px 20px',borderRadius:14,fontSize:'.9rem',fontWeight:600,textDecoration:'none',whiteSpace:'nowrap'}}>
                  <WaIcon/> Ou fale pelo WhatsApp
                </a>
              </div>
            </div>

            {/* Informações do produto */}
            <div style={{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:18,padding:'24px 28px',maxWidth:680,margin:'32px auto 0'}}>
              <h3 style={{fontSize:'.82rem',fontWeight:700,letterSpacing:'.18em',color:'rgba(255,255,255,.7)',textTransform:'uppercase',marginBottom:12}}>Informações do produto</h3>
              <p style={{color:'white',fontSize:'.95rem',lineHeight:1.65,marginBottom:16,paddingBottom:14,borderBottom:'1px solid rgba(255,255,255,.12)'}}>
                <strong>Ingredientes:</strong> cloreto de sódio, iodato de potássio e antiumectante INS-535 (ferrocianeto de sódio). Iodado com 25 mg/kg (RDC 604/2022).
              </p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'10px 32px'}}>
                {[
                  ['É iodado?','Sim — 25 mg/kg, conforme a legislação brasileira'],
                  ['Contém antiumectante?','Sim — INS-535 (ferrocianeto de sódio), conforme o rótulo'],
                  ['Tem nota fiscal?','Sim, emitida em todos os pedidos'],
                ].map(([q,a])=>(
                  <div key={q} style={{paddingBottom:8,borderBottom:'1px solid rgba(255,255,255,.07)'}}>
                    <p style={{color:'rgba(255,255,255,.7)',fontSize:'.82rem',marginBottom:2}}>{q}</p>
                    <p style={{color:'white',fontSize:'.9rem',fontWeight:500}}>{a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════ FAQ ══════ */}
        <section style={{padding:'100px 24px',background:'white'}}>
          <div style={{maxWidth:760,margin:'0 auto'}}>
            <div id="faq-h" data-reveal className={`rev${v('faq-h')?' on':''}`} style={{textAlign:'center',marginBottom:52}}>
              <p className="eyebrow">Tire suas dúvidas</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.1rem)',fontWeight:700,color:'var(--text)'}}>Perguntas Frequentes</h2>
            </div>
            <div id="faq-l" data-reveal className={`rev${v('faq-l')?' on':''}`}>
              {FAQS.map((faq,i)=>(
                <div key={i} className="faq-border">
                  <h3 style={{margin:0}}>
                    <button id={`faq-btn-${i}`} aria-expanded={openFaq===i} aria-controls={`faq-panel-${i}`} onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{width:'100%',background:'none',border:'none',padding:'22px 0',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',gap:16}}>
                      <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.25rem',fontWeight:700,color:openFaq===i?'var(--brand)':'var(--text)',textAlign:'left',transition:'color .25s'}}>{faq.q}</span>
                      <span aria-hidden="true" style={{color:'var(--golddk)',fontSize:'1.4rem',flexShrink:0,transform:openFaq===i?'rotate(45deg)':'rotate(0)',transition:'transform .35s cubic-bezier(.22,1,.36,1)',display:'inline-block'}}>+</span>
                    </button>
                  </h3>
                  <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-btn-${i}`} className={`faq-ans${openFaq===i?' open':' closed'}`}>
                    <div><p style={{padding:'0 0 24px',color:'var(--mid)'}}>{faq.a}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ FOOTER ══════ */}
        <footer className="grain" style={{background:'#060f20',padding:'56px 24px 32px',borderTop:'1px solid rgba(201,162,39,.18)',position:'relative'}}>
          <div style={{maxWidth:1200,margin:'0 auto',position:'relative',zIndex:1}}>
            <div className="footer-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:40,marginBottom:48}}>
              <div>
                <div style={{marginBottom:16}}><Logo size={48} white/></div>
                <p style={{color:'rgba(255,255,255,.7)',lineHeight:1.7}}>Sal Marinho Não Refinado — Sal Integral de Mossoró. Das salinas de Mossoró, Rio Grande do Norte, para a sua mesa.</p>
                <p style={{color:'rgba(255,255,255,.7)',fontSize:'.85rem',lineHeight:1.75,marginTop:12}}>
                  A S Comércio e Moagem de Sal Ltda<br/>
                  Av. Industrial Dehuel Vieira Diniz, 505<br/>
                  Monsenhor Américo · Mossoró / RN<br/>
                  CEP 59.613-690<br/>
                  CNPJ 51.422.900/0001-68
                </p>
              </div>
              <div>
                <h4 style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.16em',color:'var(--gold)',textTransform:'uppercase',marginBottom:16}}>Produto</h4>
                <ul style={{listStyle:'none',padding:0}}>
                  {['1kg — R$ 29,90','Trio 3kg — R$ 74,90','Caixa 10kg — R$ 149,90','Frete calculado por CEP','Minerais Traço Naturais'].map(i=>(
                    <li key={i} style={{color:'rgba(255,255,255,.7)',marginBottom:8}}>{i}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.16em',color:'var(--gold)',textTransform:'uppercase',marginBottom:8}}>Compra e atendimento</h4>
                <ul style={{listStyle:'none',padding:0}}>
                  <li><a className="foot-link" href="/meu-pedido">Rastrear pedido</a></li>
                  <li><a className="foot-link" href="/atacado">Atacado</a></li>
                  <li><a className="foot-link" href={WA_LINK} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
                  <li><a className="foot-link" href="mailto:contato@salvitarn.com.br">E-mail</a></li>
                </ul>
              </div>
              <div>
                <h4 style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.16em',color:'var(--gold)',textTransform:'uppercase',marginBottom:8}}>Fale Conosco</h4>
                <ul style={{listStyle:'none',padding:0,marginBottom:16}}>
                  <li><a className="foot-link" href={WA_LINK} target="_blank" rel="noopener noreferrer">(84) 2140-8212</a></li>
                  <li><a className="foot-link" href="mailto:contato@salvitarn.com.br">contato@salvitarn.com.br</a></li>
                  <li><a className="foot-link" href="https://instagram.com/salvitarn" target="_blank" rel="noopener noreferrer">@salvitarn</a></li>
                </ul>
                <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:10,minHeight:44,background:'#128C7E',color:'white',padding:'12px 20px',borderRadius:12,fontSize:'.88rem',fontWeight:600,textDecoration:'none',transition:'background .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='#25D366';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#128C7E';}}>
                  <WaIcon/>
                  Falar no WhatsApp
                </a>
              </div>
            </div>
            <div style={{borderTop:'1px solid rgba(255,255,255,.12)',paddingTop:24}}>
              <p style={{color:'rgba(255,255,255,.7)',fontSize:'.85rem'}}>© 2026 SAL VITA · Mossoró, Rio Grande do Norte · CNPJ: 51.422.900/0001-68</p>
            </div>
          </div>
        </footer>
      </div>

      {/* ══════ STICKY BOTTOM CTA (mobile) ══════ */}
      <div className="sticky-bar" style={{gap:12,alignItems:'center'}}>
        <div style={{flexShrink:0}}>
          <p style={{margin:0,fontSize:'.75rem',color:'rgba(255,255,255,.75)',letterSpacing:'.04em'}}>SAL VITA 1kg</p>
          <p style={{margin:0,fontFamily:"'Cormorant Garamond',serif",fontSize:'1.25rem',fontWeight:700,color:'var(--goldlt)',lineHeight:1}}>{brl(PRODUCTS[0].price)}</p>
        </div>
        <button onClick={()=>openBuy(PRODUCTS[0])} className="cta-gold" style={{flex:1,background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:14,padding:'15px 0',fontSize:'.94rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer'}}>
          Comprar Agora
        </button>
      </div>

      {/* ══════ CHECKOUT — ETAPA 3: PAGAMENTO ══════ */}
      {step===3&&orderDone&&(
        <Sheet dlgRef={dlgRef} onBackdrop={closeBuy} maxWidth={460}
          foot={
            pixPaid ? (
              <a href={trackUrl(orderDone.id,orderDone.trackToken)} className="cta-gold" style={{display:'flex',alignItems:'center',justifyContent:'center',background:'var(--brand)',color:'white',borderRadius:14,padding:'16px',fontSize:'1rem',fontWeight:800,textDecoration:'none'}}>
                Acompanhar pedido
              </a>
            ) : pixData && !pixExpired ? (
              <>
                <button onClick={copyPixCode}
                  style={{width:'100%',background:pixCopied?'#16a34a':'#009ee3',color:'white',border:'none',borderRadius:14,padding:'15px',fontSize:'1.02rem',fontWeight:800,cursor:'pointer',transition:'background .25s'}}>
                  {pixCopied ? 'Código copiado' : 'Copiar código PIX'}
                </button>
                <p role="status" style={{fontSize:'.8rem',color:pixPollErr?'#b45309':'var(--muted)',margin:'8px 0 0',textAlign:'center',lineHeight:1.4}}>
                  {pixPollErr
                    ? <>Não conseguimos verificar o pagamento automaticamente — confira em <a href={trackUrl(orderDone.id,orderDone.trackToken)} style={{color:'var(--brand)',fontWeight:700}}>Acompanhar pedido</a>.</>
                    : 'Aguardando confirmação do pagamento…'}
                </p>
              </>
            ) : pixData && pixExpired ? (
              <>
                <button onClick={()=>{ resetPix(); }}
                  style={{width:'100%',background:'#009ee3',color:'white',border:'none',borderRadius:14,padding:'15px',fontSize:'1.02rem',fontWeight:800,cursor:'pointer'}}>
                  Gerar novo PIX
                </button>
              </>
            ) : (
              <>
                <button onClick={handlePixPay} disabled={pixLoading}
                  style={{width:'100%',background:pixLoading?'#9bb3d0':'#009ee3',color:'white',border:'none',borderRadius:14,padding:'15px',fontSize:'1.05rem',fontWeight:800,cursor:pixLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:10}}>
                  {pixLoading ? 'Gerando QR Code…' : 'Pagar com PIX'}
                </button>
                <button onClick={handleMpPay} disabled={mpLoading}
                  style={{width:'100%',background:'transparent',color:'var(--brand)',border:'1.5px solid var(--brand)',borderRadius:14,padding:'13px',fontSize:'.95rem',fontWeight:700,cursor:mpLoading?'not-allowed':'pointer',opacity:mpLoading?.6:1}}>
                  {mpLoading ? 'Gerando link seguro…' : 'Cartão ou outros meios (Mercado Pago)'}
                </button>
              </>
            )
          }>
          <SheetHead eyebrow={`Pedido #${orderDone.id} registrado`} title="Finalize seu pagamento" onClose={closeBuy}/>
          <Steps cur={3}/>

          {shipNotice&&<p role="status" style={{background:'#fffbeb',border:'1px solid #fde68a',color:'#92400e',borderRadius:10,padding:'9px 12px',fontSize:'.88rem',fontWeight:600,margin:'0 0 12px'}}>{shipNotice}</p>}

          <div style={{background:'var(--salt)',borderRadius:12,padding:'12px 14px',marginBottom:14,border:'1px solid rgba(11,29,58,.08)'}}>
            {!pixData&&selProd&&selShip&&(
              <>
                <div style={{display:'flex',justifyContent:'space-between',gap:12,fontSize:'.88rem',color:'var(--muted)',marginBottom:4}}>
                  <span>{packLabel(selProd)}</span>
                  <span style={{whiteSpace:'nowrap'}}>{brl(orderDone.total - selShip.price)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'.88rem',color:'var(--muted)',marginBottom:8}}>
                  <span>Frete ({selShip.service})</span>
                  <span>{brl(selShip.price)}</span>
                </div>
              </>
            )}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',fontWeight:700,fontSize:'1rem',...(!pixData&&selProd&&selShip?{borderTop:'1px solid rgba(11,29,58,.1)',paddingTop:8}:{})}}>
              <span>Total</span>
              <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.25rem',color:'var(--brand)'}}>{brl(orderDone.total)}</span>
            </div>
          </div>

          {pixPaid ? (
            <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:14,padding:'22px',textAlign:'center'}} role="status">
              <div style={{width:56,height:56,borderRadius:'50%',background:'#16a34a',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p style={{fontSize:'1.1rem',fontWeight:800,color:'#15803d',margin:'0 0 4px'}}>Pagamento confirmado</p>
              <p style={{fontSize:'.88rem',color:'var(--muted)',margin:0}}>Recebemos seu PIX. Acompanhe o andamento do pedido pelo botão abaixo.</p>
            </div>
          ) : pixData && pixExpired ? (
            <div role="alert" style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:14,padding:'16px',textAlign:'center'}}>
              <p style={{fontSize:'.92rem',color:'#92400e',fontWeight:600,margin:0,lineHeight:1.5}}>Paramos de verificar este PIX após 30 minutos. Se você já pagou, confira em <a href={trackUrl(orderDone.id,orderDone.trackToken)} style={{color:'var(--brand)',fontWeight:700}}>Acompanhar pedido</a>; se não, gere um novo PIX.</p>
            </div>
          ) : pixData ? (
            <div style={{textAlign:'center'}}>
              {pixData.qrCodeBase64 && (
                <div style={{display:'inline-block',padding:8,background:'white',borderRadius:16,border:'1.5px solid rgba(201,162,39,.45)',boxShadow:'0 8px 30px rgba(11,29,58,.1)',marginBottom:10}}>
                  <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" width={190} height={190} className="pix-qr"/>
                </div>
              )}
              <p style={{fontSize:'.86rem',color:'var(--muted)',margin:'0 0 8px'}}>Escaneie o QR Code ou copie o código PIX:</p>
              <div style={{background:'var(--salt)',border:'1px solid rgba(11,29,58,.1)',borderRadius:10,padding:'8px 12px',fontSize:'.75rem',wordBreak:'break-all',color:'var(--muted)',maxHeight:56,overflow:'hidden',fontFamily:'monospace'}}>
                {pixData.qrCode}
              </div>
            </div>
          ) : (
            <>
              {payErr&&<p role="alert" className="err" style={{marginBottom:10}}>{payErr}</p>}
              <p style={{fontSize:'.8rem',color:'var(--muted)',margin:'0 0 4px',textAlign:'center'}}>Pagamento processado com segurança pelo Mercado Pago</p>
              <p style={{fontSize:'.8rem',color:'var(--muted)',margin:0,textAlign:'center'}}>PIX · Cartão (Mercado Pago)</p>
              <div style={{display:'flex',justifyContent:'center',gap:20,marginTop:14,paddingTop:14,borderTop:'1px solid #f1f5f9'}}>
                {[
                  {svg:<svg width="20" height="20" viewBox="0 0 24 24" fill="#16a34a" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>,l:'Compra Segura'},
                  {svg:<svg width="20" height="20" viewBox="0 0 24 24" fill="#16a34a" aria-hidden="true"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>,l:'Criptografia SSL'},
                  {svg:<svg width="20" height="20" viewBox="0 0 24 24" fill="#009ee3" aria-hidden="true"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>,l:'Mercado Pago'},
                ].map(b=>(
                  <div key={b.l} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                    {b.svg}
                    <span style={{fontSize:'.75rem',color:'#475569',fontWeight:600,textAlign:'center'}}>{b.l}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {!pixPaid&&pixData&&payErr&&<p role="alert" className="err" style={{textAlign:'center'}}>{payErr}</p>}
          {!pixPaid&&(
            <p style={{textAlign:'center',fontSize:'.8rem',color:'var(--muted)',marginTop:12}}>
              Após pagar, rastreie em: <a href={trackUrl(orderDone.id,orderDone.trackToken)} style={{color:'var(--brand)',fontWeight:600}}>Pedido #{orderDone.id}</a>
            </p>
          )}
        </Sheet>
      )}

      {/* ══════ CHECKOUT — ETAPA 2: DADOS ══════ */}
      {step===2&&selProd&&selShip&&(
        <Sheet dlgRef={dlgRef} onBackdrop={()=>setShowCheckout(false)} maxWidth={480}
          foot={
            <>
              {orderErr&&<p role="alert" className="err" style={{margin:'0 0 8px'}}>{orderErr}</p>}
              <div style={{display:'flex',gap:10}}>
                <button type="button" onClick={()=>setShowCheckout(false)}
                  style={{flex:'0 0 auto',minHeight:48,background:'var(--salt)',color:'var(--mid)',border:'none',borderRadius:12,padding:'0 18px',fontSize:'.9rem',fontWeight:600,cursor:'pointer'}}>
                  ← Voltar
                </button>
                <button type="submit" form="checkout-form" disabled={checkoutLoading}
                  style={{flex:1,minHeight:48,background:checkoutLoading?'#9bb3d0':'var(--brand)',color:'white',border:'none',borderRadius:12,padding:'0 12px',fontSize:'.95rem',fontWeight:700,cursor:checkoutLoading?'not-allowed':'pointer',whiteSpace:'nowrap'}}>
                  {checkoutLoading ? 'Registrando pedido…' : 'Ir para pagamento'}
                </button>
              </div>
            </>
          }>
          <SheetHead eyebrow="Dados para entrega" title="Finalizar Pedido" sub={`${packLabel(selProd)} · ${brl(selProd.price)}`} onClose={()=>setShowCheckout(false)}/>
          <Steps cur={2}/>
          <form id="checkout-form" onSubmit={handleCheckout} style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div style={{gridColumn:'1/-1'}}>
                <label className="inp-lbl" htmlFor="co-name">Nome completo *</label>
                <input id="co-name" className="inp" required autoComplete="name" value={checkoutForm.customerName} onChange={e=>setCheckoutForm(f=>({...f,customerName:e.target.value}))} placeholder="Seu nome completo"/>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-phone">Telefone/WhatsApp *</label>
                <input id="co-phone" className="inp" required type="tel" inputMode="numeric" autoComplete="tel" value={checkoutForm.customerPhone}
                  onChange={e=>{ const m=maskPhone(e.target.value); setCheckoutForm(f=>({...f,customerPhone:m})); if(m.replace(/\D/g,'').length>=10) setPhoneError(''); }}
                  onBlur={()=>{ const n=checkoutForm.customerPhone.replace(/\D/g,'').length; setPhoneError(n>0&&n<10?'Informe DDD + número.':''); }}
                  placeholder="(84) 99999-9999"
                  aria-invalid={phoneError?true:undefined} aria-describedby={phoneError?'co-phone-err':undefined}/>
                {phoneError && <p id="co-phone-err" role="alert" className="err">{phoneError}</p>}
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-cpf">CPF *</label>
                <input id="co-cpf" className="inp" required type="text" inputMode="numeric" autoComplete="off" value={checkoutForm.customerCpf}
                  onChange={e=>{ const m=maskCpf(e.target.value); setCheckoutForm(f=>({...f,customerCpf:m})); setCpfError(m.replace(/\D/g,'').length===11 && !isValidCpf(m) ? 'CPF inválido — confira os números.' : ''); }}
                  placeholder="000.000.000-00" maxLength={14}
                  aria-invalid={cpfError?true:undefined} aria-describedby={cpfError?'co-cpf-err':undefined}/>
                {cpfError && <p id="co-cpf-err" role="alert" className="err">{cpfError}</p>}
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="inp-lbl" htmlFor="co-email">E-mail *</label>
                <input id="co-email" className="inp" required type="email" autoComplete="email" value={checkoutForm.customerEmail} onChange={e=>setCheckoutForm(f=>({...f,customerEmail:e.target.value}))} placeholder="seuemail@exemplo.com"/>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-cep">CEP (do frete)</label>
                <div style={{position:'relative'}}>
                  <input id="co-cep" className="inp" readOnly autoComplete="postal-code" inputMode="numeric" value={maskCep(checkoutForm.postalCode)} style={{paddingRight:76}}/>
                  <button type="button" className="lnk" onClick={()=>setShowCheckout(false)} style={{position:'absolute',right:2,top:2,bottom:2}}>alterar</button>
                </div>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-number">Número *</label>
                <input id="co-number" className="inp" required inputMode="numeric" autoComplete="off" value={checkoutForm.number} onChange={e=>setCheckoutForm(f=>({...f,number:e.target.value}))} placeholder="123"/>
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="inp-lbl" htmlFor="co-address">Endereço (rua/av.) *</label>
                <input id="co-address" className="inp" required autoComplete="address-line1" value={checkoutForm.address} onChange={e=>setCheckoutForm(f=>({...f,address:e.target.value}))} placeholder="Rua / Avenida"/>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-complement">Complemento</label>
                <input id="co-complement" className="inp" autoComplete="address-line2" value={checkoutForm.complement} onChange={e=>setCheckoutForm(f=>({...f,complement:e.target.value}))} placeholder="Apto, bloco..."/>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-neighborhood">Bairro *</label>
                <input id="co-neighborhood" className="inp" required autoComplete="address-level3" value={checkoutForm.neighborhood} onChange={e=>setCheckoutForm(f=>({...f,neighborhood:e.target.value}))} placeholder="Bairro"/>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-city">Cidade *</label>
                <input id="co-city" className="inp" required autoComplete="address-level2" value={checkoutForm.city} onChange={e=>setCheckoutForm(f=>({...f,city:e.target.value}))} placeholder="Cidade"/>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-state">Estado *</label>
                <select id="co-state" className="inp" required autoComplete="address-level1" value={checkoutForm.state} onChange={e=>setCheckoutForm(f=>({...f,state:e.target.value}))}>
                  <option value="">UF</option>
                  {UFS.map(u=><option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            {/* Cupom */}
            <div style={{marginTop:4}}>
              <label className="inp-lbl" htmlFor="co-coupon">Cupom de desconto</label>
              <div style={{display:'flex',gap:8}}>
                <input id="co-coupon" className="inp" type="text" autoComplete="off" value={couponCode}
                  onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); setCouponState(null); }}
                  placeholder="Ex: VOLTA10"
                  aria-describedby={couponState?'co-coupon-msg':undefined}
                  style={{flex:1,fontFamily:'monospace',letterSpacing:'.1em',borderColor:couponState?.valid?'#16a34a':couponState?.valid===false?'#ef4444':undefined}}/>
                <button type="button"
                  onClick={()=>validateCoupon(couponCode, selProd.price)}
                  disabled={!couponCode.trim() || couponLoading}
                  style={{minHeight:44,padding:'0 18px',background:'var(--brand)',color:'white',border:'none',borderRadius:12,fontSize:'.85rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',opacity:(!couponCode.trim()||couponLoading)?.6:1}}>
                  {couponLoading?'…':'Aplicar'}
                </button>
              </div>
              {couponState && (
                <p id="co-coupon-msg" role={couponState.valid?'status':'alert'} style={{fontSize:'.84rem',margin:'6px 0 0',fontWeight:600,color:couponState.valid?'#15803d':'#b91c1c'}}>
                  {couponState.message}
                </p>
              )}
            </div>
            {/* Resumo */}
            <div style={{background:'var(--salt)',borderRadius:12,padding:'13px 16px',marginTop:4,border:'1px solid rgba(201,162,39,.25)'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:6}}>
                <span style={{fontSize:'.9rem',color:'var(--muted)'}}>{packLabel(selProd)}</span>
                <span style={{fontSize:'.9rem',color:'var(--mid)',whiteSpace:'nowrap'}}>{brl(selProd.price)}</span>
              </div>
              {discount>0 && (
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:'.9rem',color:'#15803d',fontWeight:600}}>Desconto {couponCode}</span>
                  <span style={{fontSize:'.9rem',color:'#15803d',fontWeight:700}}>-{brl(discount)}</span>
                </div>
              )}
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                <span style={{fontSize:'.9rem',color:'var(--muted)'}}>Frete {selShip.service}</span>
                <span style={{fontSize:'.9rem',color:'var(--mid)'}}>{brl(selShip.price)}</span>
              </div>
              <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,borderTop:'1px solid rgba(11,29,58,.1)'}}>
                <span style={{fontWeight:700,color:'var(--text)'}}>Total</span>
                <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.35rem',fontWeight:700,color:'var(--brand)'}}>{brl(subtotal+selShip.price)}</span>
              </div>
            </div>
            <p style={{fontSize:'.85rem',color:'#166534',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'10px 12px',lineHeight:1.5,margin:0}}>
              Direito de arrependimento em até 7 dias após o recebimento (CDC, art. 49). Dúvidas sobre entrega ou troca: <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{color:'#166534',fontWeight:700}}>fale conosco no WhatsApp</a>.
            </p>
          </form>
        </Sheet>
      )}

      {/* ══════ CHECKOUT — ETAPA 1: FRETE ══════ */}
      {step===1&&selProd&&(
        <Sheet dlgRef={dlgRef} onBackdrop={closeBuy}
          foot={
            <>
              {selShip&&(
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10,gap:12}}>
                  <div>
                    <p style={{fontWeight:700,color:'var(--text)',fontSize:'.95rem',margin:0}}>Total estimado</p>
                    <p style={{fontSize:'.8rem',color:'var(--muted)',margin:0}}>{brl(selProd.price)} + frete {brl(selShip.price)}</p>
                  </div>
                  <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.6rem',fontWeight:700,color:'var(--brand)'}}>{brl(selProd.price+selShip.price)}</span>
                </div>
              )}
              <button className="cta-gold" onClick={goStep2}
                style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:10,minHeight:52,background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:14,padding:'0 16px',fontSize:'.96rem',fontWeight:800,cursor:'pointer',letterSpacing:'.05em',textTransform:'uppercase',transition:'background .2s,transform .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                {selShip ? 'Comprar Agora' : 'Calcular frete para continuar'}
              </button>
            </>
          }>
          <SheetHead eyebrow="Calcule o Frete" title={selProd.name} sub={selProd.weight} onClose={closeBuy}/>
          <Steps cur={1}/>
          <div style={{background:'var(--salt)',borderRadius:14,padding:'14px 18px',marginBottom:18,display:'flex',justifyContent:'space-between',alignItems:'center',border:'1px solid rgba(201,162,39,.25)'}}>
            <div>
              <p style={{fontSize:'.9rem',color:'var(--muted)',marginBottom:2}}>{packLabel(selProd)}</p>
              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.9rem',fontWeight:700,color:'var(--brand)'}}>{brl(selProd.price)}</p>
            </div>
            <div style={{textAlign:'right'}}>
              <p style={{fontSize:'.87rem',color:'var(--muted)'}}>Peso aprox.</p>
              <p style={{fontSize:'.93rem',color:'var(--mid)',fontWeight:500}}>{String(selProd.weightKg).replace('.',',')} kg</p>
            </div>
          </div>
          <div style={{marginBottom:18}}>
            <label className="inp-lbl" htmlFor="sv-cep" style={{fontSize:'.85rem'}}>Seu CEP de entrega</label>
            <div style={{display:'flex',gap:10}}>
              <input id="sv-cep" ref={cepInputRef} className="inp" type="text" inputMode="numeric" autoComplete="postal-code" maxLength={9}
                value={maskCep(cep)}
                onChange={e=>{
                  const d=e.target.value.replace(/\D/g,'').slice(0,8);
                  setCep(d); setCepErr('');
                  // A new CEP invalidates any quote made for the previous one.
                  if (d!==cep) { setCepData(null); setShipping([]); setSelShip(null); }
                }}
                onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); lookupCep(); } }}
                placeholder="00000-000"
                aria-invalid={cepErr?true:undefined} aria-describedby={cepErr?'sv-cep-err':undefined}
                style={{flex:1,letterSpacing:'.1em'}}/>
              <button onClick={lookupCep} disabled={loadingCep} style={{minHeight:48,background:'var(--brand)',color:'white',border:'none',borderRadius:12,padding:'0 22px',fontSize:'.85rem',fontWeight:700,cursor:loadingCep?'not-allowed':'pointer',opacity:loadingCep?.7:1,whiteSpace:'nowrap',transition:'background .2s'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--brand2)'}
                onMouseLeave={e=>e.currentTarget.style.background='var(--brand)'}>{loadingCep?'Calculando…':'Calcular'}</button>
            </div>
            {cepErr&&<p id="sv-cep-err" role="alert" className="err">{cepErr}</p>}
            <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener noreferrer" style={{fontSize:'.87rem',color:'var(--muted)',textDecoration:'none',display:'inline-flex',alignItems:'center',minHeight:44}}>Não sei meu CEP →</a>
          </div>

          {cepData&&(
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'9px 14px',background:'#f0fdf4',borderRadius:10,border:'1px solid #bbf7d0'}}>
                <span aria-hidden="true" style={{color:'#16a34a'}}>✓</span>
                <p style={{fontSize:'.84rem',color:'#166534'}}>{cepData.localidade} — {cepData.uf}{cepData.bairro?` · ${cepData.bairro}`:''}</p>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <p id="ship-lbl" style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',margin:0}}>Opções de frete</p>
                {shippingSource==='api'
                  ? <span style={{fontSize:'.75rem',background:'#dcfce7',color:'#15803d',padding:'2px 8px',borderRadius:99,fontWeight:600}}>Via Melhor Envio</span>
                  : <span style={{fontSize:'.75rem',background:'#fef9c3',color:'#854d0e',padding:'2px 8px',borderRadius:99,fontWeight:600}}>Estimativa</span>
                }
              </div>
              <div role="radiogroup" aria-labelledby="ship-lbl" style={{display:'flex',flexDirection:'column',gap:10,marginBottom:6}}>
                {shipping.map((opt,idx)=>{
                  const on = selShip?.service===opt.service;
                  return (
                    <div key={opt.service} role="radio" aria-checked={on} tabIndex={on||(!selShip&&idx===0)?0:-1} className={`sopt${on?' sel':''}`}
                      onClick={()=>setSelShip(opt)}
                      onKeyDown={e=>{
                        if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setSelShip(opt); return; }
                        const dir = (e.key==='ArrowDown'||e.key==='ArrowRight') ? 1 : (e.key==='ArrowUp'||e.key==='ArrowLeft') ? -1 : 0;
                        if(!dir) return;
                        e.preventDefault();
                        const n = shipping[(idx+dir+shipping.length)%shipping.length];
                        setSelShip(n);
                        (e.currentTarget.parentElement?.children[(idx+dir+shipping.length)%shipping.length] as HTMLElement|undefined)?.focus();
                      }}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
                        <div>
                          <p style={{fontWeight:700,color:'var(--text)',fontSize:'.93rem'}}>{opt.service}</p>
                          <p style={{fontSize:'.88rem',color:'var(--muted)'}}>{opt.description}{opt.days?` · ${opt.days}`:''}</p>
                        </div>
                        <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.3rem',fontWeight:700,color:'var(--brand)',whiteSpace:'nowrap'}}>{brl(opt.price)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <p style={{marginTop:10,fontSize:'.84rem',color:'var(--muted)',textAlign:'center',lineHeight:1.5}}>Frete calculado via Melhor Envio · Enviamos para todo o Brasil</p>
        </Sheet>
      )}
    </>
  );
}

/* ── Barra de progresso do checkout (1 Frete → 2 Dados → 3 Pagamento) ── */
function Steps({cur}:{cur:1|2|3}) {
  const items = [{n:1,l:'Frete'},{n:2,l:'Dados'},{n:3,l:'Pagamento'}];
  return (
    <div className="steps" role="group" aria-label={`Etapa ${cur} de 3`}>
      {items.map((s,i)=>(
        <div key={s.n} style={{display:'flex',alignItems:'flex-start'}}>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
            <div className={`step-dot ${s.n===cur?'step-on':s.n<cur?'step-done':'step-off'}`} aria-current={s.n===cur?'step':undefined}>{s.n<cur?'✓':s.n}</div>
            <span className="step-lbl" style={{color:s.n===cur?'var(--golddk)':undefined}}>{s.l}</span>
          </div>
          {i<items.length-1 && <div className={`step-line${s.n<cur?' done':''}`} style={{marginTop:14}}/>}
        </div>
      ))}
    </div>
  );
}
