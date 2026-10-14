import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ConsentBanner from '../components/premium/ConsentBanner';
import { BrandLogo } from '../components/premium/BrandLogo';
import { trackPixel } from '../components/premium/pixelConsent';
import { claimPurchase } from '../components/premium/purchaseLock';
import { parseApiError } from '../components/premium/apiError';
import {
  CARRIERS_TEXT, cleanAddressNumber, isSavedCustomerFresh, shouldTrackCart, validateCheckoutFields,
} from '../components/premium/checkoutLogic';

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
  {q:'O que é sal marinho não refinado?',a:'Passa pela colheita, secagem, moagem e iodação (obrigatória por lei no sal de mesa), sem o refino industrial que remove os minerais traço. Preserva os minerais traço naturais presentes na água do mar, que dão ao sal um sabor característico.'},
  {q:'Como é a embalagem?',a:'Embalagem zip lock com janela circular transparente: abre e fecha sempre que precisar, e você vê o sal sem abrir a embalagem.'},
  {q:'Por que o sal de Mossoró é diferente?',a:'Mossoró (RN) produz mais de 95% do sal marinho brasileiro. Sol intenso, ventos constantes e baixíssima umidade criam condições favoráveis à produção de sal por evaporação solar.'},
  {q:'Como funciona o frete?',a:`Enviamos por transportadora (${CARRIERS_TEXT}) via Melhor Envio, com rastreamento. O valor e o prazo do frete aparecem pelo seu CEP antes de você pagar.`},
];

/* ─── Depoimentos ────────────────────────────────────────── */
// Removidos de propósito: os textos antigos não eram de clientes identificáveis.
// Avaliações reais, com autorização de quem escreveu, podem ser reinseridas aqui.

/* ─── Food uses ──────────────────────────────────────────── */
const USES = [
  {t:'Carnes e aves',d:'Para temperar antes de ir ao fogo ou na hora de servir.'},
  {t:'Peixes e frutos do mar',d:'Na marinada ou por cima do prato pronto.'},
  {t:'Saladas e legumes',d:'Uma pitada por cima, na hora.'},
  {t:'Massas e risotos',d:'Na água do cozimento ou na finalização.'},
  {t:'Sopas e caldos',d:'Durante o preparo, provando aos poucos.'},
  {t:'Pães e massas',d:'Na massa, conforme a receita.'},
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
interface CouponResult {valid:boolean;message:string;discountValue?:number;discountType?:string}
interface PendingOrder {id:number;total:number;ts:number;trackToken?:string|null;productId?:string;shipService?:string;shipPrice?:number}

const PRODUCTS:Product[]=[
  {id:'1kg',  name:'SAL VITA PREMIUM',      subtitle:'Embalagem zip lock com janela',      weight:'1kg',          weightKg:1.2, units:1,  price:29.90, pricePerKg:29.90, tag:'',                      highlight:false},
  {id:'3kg',  name:'TRIO SAL VITA',         subtitle:'3 embalagens zip lock de 1kg cada',  weight:'3kg (3×1kg)',  weightKg:3.6, units:3,  price:74.90, pricePerKg:24.97, tag:'',                      highlight:false},
  {id:'caixa',name:'CAIXA SAL VITA PREMIUM',subtitle:'10 embalagens zip lock de 1kg cada', weight:'10kg (10×1kg)',weightKg:12,  units:10, price:149.90,pricePerKg:14.99, tag:'Menor preço por kg',   highlight:true},
];

const BLANK_FORM = {
  customerName:'',customerPhone:'',customerEmail:'',customerCpf:'',postalCode:'',address:'',
  number:'',complement:'',neighborhood:'',city:'',state:'',
};
type CheckoutForm = typeof BLANK_FORM;

// Customer data typed on THIS device earlier (never stored in the database).
// The CPF is never kept here, and the entry expires after 30 days (older entries,
// including ones saved before `savedAt` existed, are ignored and deleted). `savedAt` is only
// renewed when the customer edits a field on this visit (never by merely restoring the data).
const SAVED_CUSTOMER_KEY = 'sv_customer_data';
function loadSavedCustomer(): Partial<CheckoutForm> {
  try {
    const d = JSON.parse(localStorage.getItem(SAVED_CUSTOMER_KEY) ?? 'null');
    if (!d || typeof d !== 'object') return {};
    if (!isSavedCustomerFresh(d.savedAt)) { localStorage.removeItem(SAVED_CUSTOMER_KEY); return {}; }
    const out: Partial<CheckoutForm> = {};
    (Object.keys(BLANK_FORM) as (keyof CheckoutForm)[]).forEach(k => { if (k !== 'customerCpf' && typeof d[k] === 'string') out[k] = d[k]; });
    return out;
  } catch { return {}; }
}
function saveCustomer(form: CheckoutForm) {
  try {
    const { customerCpf: _cpf, ...rest } = form;
    localStorage.setItem(SAVED_CUSTOMER_KEY, JSON.stringify({ ...rest, savedAt: Date.now() }));
  } catch {}
}

// No-op safe: does nothing unless the visitor accepted the Pixel (see ConsentBanner).
const fbq = trackPixel;
const pixelName = (p: Product) => `${p.name} ${p.weight}`;
// Distinct catalog id per pack for browsing/cart events. Purchase keeps 'salvita-001'
// because the server-side CAPI Purchase (server/lib/orderConfirmation.ts) sends that id.
const PIXEL_IDS: Record<string,string> = { '1kg': 'salvita-1kg', '3kg': 'salvita-3kg', caixa: 'salvita-10kg' };
const pixelId = (p: Product) => PIXEL_IDS[p.id] ?? 'salvita-001';

// Meta browser/click ids (cookies set by the Pixel), forwarded to createOrder for CAPI matching.
function readCookie(name: string): string | undefined {
  try {
    const m = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    const v = m ? m.slice(name.length + 1).trim() : '';
    return v && v.length <= 255 ? v : undefined;
  } catch { return undefined; }
}

// AddPaymentInfo once per order id — also across page loads (resuming a pending order).
const APINFO_KEY = 'sv_apinfo_sent';
function firstAddPaymentInfo(orderId: number): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(APINFO_KEY) ?? '[]');
    const ids: number[] = Array.isArray(raw) ? raw : [];
    if (ids.includes(orderId)) return false;
    localStorage.setItem(APINFO_KEY, JSON.stringify([...ids, orderId].slice(-20)));
  } catch {}
  return true;
}

const PIX_MAX_MS = 30 * 60 * 1000;
// Poll do PIX: 5s nos 2 primeiros minutos (quando a maioria paga), depois 15s até o teto —
// ~136 chamadas por pedido, abaixo do rate limit do servidor (pixStatusLimiter).
const PIX_FAST_MS = 2 * 60 * 1000;
const PIX_FAST_INTERVAL_MS = 5_000;
const PIX_SLOW_INTERVAL_MS = 15_000;
const pixPollDelay = (elapsedMs: number) => elapsedMs < PIX_FAST_MS ? PIX_FAST_INTERVAL_MS : PIX_SLOW_INTERVAL_MS;
// Mensagens do servidor (shipping.ts) para pedido que não aceita mais pagamento.
const pedidoEncerrado = (msg?: string) => /foi cancelado|já foi pago/i.test(msg ?? '');
const pedidoJaPago = (msg?: string) => /já foi pago/i.test(msg ?? '');
const trackUrl = (id:number, token?:string|null) => `/meu-pedido?pedido=${id}${token ? `&t=${token}` : ''}`;

/* ── Rede: todo fetch tem prazo; erros viram mensagem humana ── */
const FETCH_TIMEOUT_MS = 8000;      // consultas (CEP, frete, cupom, status)
const FETCH_WRITE_TIMEOUT_MS = 30000; // criar pedido/pagamento: o servidor fala com Mercado Pago e Melhor Envio
function fetchT(url: string, init: RequestInit = {}, ms: number = FETCH_TIMEOUT_MS, outer?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const onOuter = () => ctrl.abort();
  if (outer) { if (outer.aborted) ctrl.abort(); else outer.addEventListener('abort', onOuter, { once: true }); }
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => { clearTimeout(timer); outer?.removeEventListener('abort', onOuter); });
}
async function postJson(url: string, json: unknown, ms: number = FETCH_TIMEOUT_MS, outer?: AbortSignal) {
  const res = await fetchT(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json }) }, ms, outer);
  let data: any = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';
const SLOW_MSG = 'A conexão demorou demais. Tente novamente em instantes.';

// Server field -> input id, to move focus to the first field with a problem.
const FIELD_INPUT_ID: Record<string,string> = {
  customerName:'co-name', customerPhone:'co-phone', customerCpf:'co-cpf', customerEmail:'co-email',
  number:'co-number', address:'co-address', complement:'co-complement', neighborhood:'co-neighborhood', city:'co-city', state:'co-state',
};

function WaIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
}

/* ── Casca dos modais do checkout: um único diálogo por vez ── */
function Sheet({dlgRef,onBackdrop,maxWidth,foot,children}:{dlgRef:React.RefObject<HTMLDivElement>;onBackdrop:()=>void;maxWidth?:number;foot?:React.ReactNode;children:React.ReactNode}) {
  // Selecting text inside the dialog and releasing outside must not count as a click on the backdrop.
  const downOnBackdrop = useRef(false);
  return (
    <div className="mo"
      onMouseDown={e=>{ downOnBackdrop.current = e.target===e.currentTarget; }}
      onClick={e=>{ if (e.target===e.currentTarget && downOnBackdrop.current) onBackdrop(); downOnBackdrop.current = false; }}>
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
        <p style={{fontSize:'.8rem',fontWeight:700,color:'var(--golddk)',marginBottom:2}}>{eyebrow}</p>
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
  const pixPollRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const pixPollGen = useRef(0); // invalida respostas de polls já parados (fechou/trocou de pedido)
  const createReqId = useRef(0); // invalida resposta tardia de createOrder (Voltar/fechar no meio)
  const dlgOrderRef = useRef<number|null>(null); // pedido exibido no diálogo agora (null = fechado)
  const addPaymentInfoSent = useRef<Set<number>>(new Set());
  const pixPurchaseFiredRef = useRef(false);
  const [checkoutForm,setCheckoutForm]     = useState<CheckoutForm>(BLANK_FORM);
  const [couponCode,setCouponCode]         = useState('');
  const [couponState,setCouponState]       = useState<CouponResult|null>(null);
  const [couponLoading,setCouponLoading]   = useState(false);
  const [cpfError,setCpfError]             = useState('');
  const [phoneError,setPhoneError]         = useState('');
  const [orderErr,setOrderErr]             = useState('');
  const [payErr,setPayErr]                 = useState('');
  const [shipNotice,setShipNotice]         = useState('');
  const [fieldErrs,setFieldErrs]           = useState<Record<string,string>>({});
  const [cepManual,setCepManual]           = useState(false);   // ViaCEP failed: customer types the address
  const [pixCopyFail,setPixCopyFail]       = useState(false);
  const [confirmLeave,setConfirmLeave]     = useState(false);
  // True once the customer edits a form field on THIS visit (restored data does not count).
  const touchedRef = useRef(false);
  const cepSeq = useRef(0);                                      // invalidates answers for an older CEP
  const cepAbort = useRef<AbortController|null>(null);
  const couponSeq = useRef(0);
  const couponPending = useRef<Promise<CouponResult>|null>(null);
  const pixCodeRef = useRef<HTMLTextAreaElement>(null);
  const confirmLeaveRef = useRef(false);
  confirmLeaveRef.current = confirmLeave;
  const [pendingOrder,setPendingOrder]     = useState<PendingOrder|null>(null);
  const autoCouponRef = useRef<string>('');
  const attributionRef = useRef<Record<string,string>>({});
  const obs = useRef<IntersectionObserver|null>(null);
  const dlgRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement|null>(null);
  const prevStepRef = useRef(0);
  const cepInputRef = useRef<HTMLInputElement>(null);

  // Which checkout dialog is on screen (0 = none). Only one is ever mounted.
  const checkoutLoadingRef = useRef(false);
  checkoutLoadingRef.current = checkoutLoading;
  const step = !showModal ? 0 : (orderDone && showCheckout) ? 3 : (showCheckout && selProd && selShip) ? 2 : selProd ? 1 : 0;
  dlgOrderRef.current = step === 3 && orderDone ? orderDone.id : null;

  const onField = (k: keyof CheckoutForm, val: string) => {
    touchedRef.current = true;
    setCheckoutForm(f => ({ ...f, [k]: val }));
    setFieldErrs(e => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  };
  const FE = (k: string) => fieldErrs[k] ? <p id={`err-${k}`} role="alert" className="err">{fieldErrs[k]}</p> : null;

  useEffect(()=>{
    const h=()=>{ setScrolled(window.scrollY>50); };
    window.addEventListener('scroll',h,{passive:true});
    h();
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

  // "Mais barato" / "Mais rápido" labels, derived from the quoted options (shipping is price-sorted).
  const shipBadges = useMemo(()=>{
    const m = new Map<string,string>();
    if (shipping.length < 2) return m;
    m.set(shipping[0].service, 'Mais barato');
    const first = (o:ShipOpt)=>{ const n = /\d+/.exec(o.days ?? ''); return n ? parseInt(n[0],10) : null; };
    let fastest: ShipOpt|null = null; let best = Infinity;
    for (const o of shipping) { const d = first(o); if (d !== null && d < best) { best = d; fastest = o; } }
    if (fastest && fastest.service !== shipping[0].service) m.set(fastest.service, 'Mais rápido');
    return m;
  },[shipping]);

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
    if (!touchedRef.current) return; // restoring saved data must not renew its 30-day clock
    if (!checkoutForm.customerName && !checkoutForm.customerPhone && !checkoutForm.postalCode) return;
    saveCustomer(checkoutForm);
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
    fetchT('/api/trpc/shipping.pixStatus', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({json:{ orderId: p.id, token: p.trackToken }}),
    }).then(r=>r.json()).then(d=>{ if (d?.result?.data?.json?.paid) clearPending(); }).catch(()=>{});
  }, [clearPending]);

  // Cart abandonment: only after the customer opened the data step AND edited the form on this
  // visit. Data restored from this device never triggers it (a returning visitor who just looks
  // around must not get a "forgotten cart" WhatsApp).
  const cartTrackRef = useRef(false);
  useEffect(() => {
    const { customerName, customerPhone } = checkoutForm;
    if (!shouldTrackCart({
      alreadyTracked: cartTrackRef.current, checkoutOpen: showCheckout && !!selProd,
      touchedThisVisit: touchedRef.current, customerName, customerPhone,
    })) return;
    cartTrackRef.current = true;
    const cepDigits = checkoutForm.postalCode.replace(/\D/g,'');
    fetchT('/api/trpc/recovery.trackCart', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({json:{ customerName: customerName.trim(), customerPhone: customerPhone.replace(/\D/g,''), customerEmail: checkoutForm.customerEmail.trim()||undefined, postalCode: cepDigits.length===8 ? cepDigits : undefined, quantity:selProd?.units ?? 1, stepReached:2 }}),
    }).catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutForm, showCheckout]);

  const stopPixPoll = useCallback(()=>{
    pixPollGen.current += 1;
    if(pixPollRef.current){ clearTimeout(pixPollRef.current); pixPollRef.current=null; }
  },[]);

  const resetPix = useCallback(()=>{
    stopPixPoll();
    setPixData(null); setPixPaid(false); setPixCopied(false); setPixPollErr(false); setPixExpired(false);
    setPixCopyFail(false); setConfirmLeave(false);
    pixPurchaseFiredRef.current = false;
  },[stopPixPoll]);

  // ViewContent: once per page load — when the pricing section scrolls into view, or on
  // the first pack-modal open if that happens first.
  const viewContentSent = useRef(false);
  const trackViewContent = useCallback((p: Product) => {
    if (viewContentSent.current) return;
    viewContentSent.current = true;
    fbq('track','ViewContent',{ content_name: pixelName(p), content_category: 'Alimentos Naturais', content_ids: [pixelId(p)], content_type: 'product', value: p.price, currency: 'BRL' });
  }, []);
  useEffect(() => {
    const el = document.getElementById('preco');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => {
      if (es.some(e => e.isIntersecting)) { trackViewContent(PRODUCTS[0]); io.disconnect(); }
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [trackViewContent]);

  // Called only from buy buttons (pack cards, nav, hero, sticky bar), so the
  // AddToCart pixel fires on the click that chooses a pack — not when the
  // resume-payment banner reopens an existing order.
  const openBuy=useCallback((p:Product)=>{
    triggerRef.current = document.activeElement as HTMLElement | null;
    setSelProd(p); setShowModal(true); setMobileMenu(false);
    trackViewContent(p);
    fbq('track','AddToCart',{ content_name: pixelName(p), content_ids: [pixelId(p)], content_type: 'product', value: p.price, currency: 'BRL', num_items: p.units });
    // New purchase: reset the flow, but keep the data this device already knows
    // so returning buyers see the form prefilled. The saved unpaid order is NOT
    // cleared here any more — the page now offers to resume it (or discard it).
    const saved = loadSavedCustomer();
    setCep((saved.postalCode ?? '').replace(/\D/g,'').slice(0,8));
    setCepData(null); setShipping([]); setSelShip(null); setCepErr(''); setShippingSource(null);
    setShowCheckout(false); setOrderDone(null);
    setCheckoutForm({ ...BLANK_FORM, ...saved });
    // O cupom do link (?cupom=) volta ao campo e é validado pelo efeito de auto-aplicação.
    setCouponState(null); setCouponCode(autoCouponRef.current);
    createReqId.current += 1; setCheckoutLoading(false);
    setCpfError(''); setPhoneError(''); setOrderErr(''); setPayErr(''); setShipNotice('');
    cartTrackRef.current = false; touchedRef.current = false;
    setFieldErrs({}); setCepManual(false);
    cepSeq.current += 1; cepAbort.current?.abort(); setLoadingCep(false);
    couponSeq.current += 1; couponPending.current = null; setCouponLoading(false);
    resetPix();
  },[resetPix,trackViewContent]);

  // Volta do passo 2 para o 1. Invalida um createOrder em andamento (a resposta tardia seria
  // ignorada); com o pedido sendo registrado o botão fica desabilitado.
  const backToStep1=()=>{ if (checkoutLoading) return; createReqId.current += 1; setShowCheckout(false); };

  const closeBuy=useCallback(()=>{
    createReqId.current += 1; setCheckoutLoading(false);
    cepSeq.current += 1; cepAbort.current?.abort(); setLoadingCep(false);
    setShowModal(false); setShowCheckout(false); setOrderDone(null);
    setOrderErr(''); setPayErr(''); setShipNotice('');
    resetPix();
  },[resetPix]);

  // With a live PIX on screen, leaving (Esc, backdrop, X) first asks for confirmation: closing kills
  // the QR code and the automatic payment check.
  const pixLive = step===3 && !!pixData && !pixPaid && !pixExpired;
  const requestClose = useCallback(()=>{ if (pixLive) setConfirmLeave(true); else closeBuy(); },[pixLive,closeBuy]);

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
      if (e.key==='Escape') {
        e.preventDefault();
        if (confirmLeaveRef.current) { setConfirmLeave(false); return; }
        if (step===2) { if (!checkoutLoadingRef.current) { createReqId.current += 1; setShowCheckout(false); } } else requestClose();
        return;
      }
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
  },[step,requestClose]);

  useEffect(()=>()=>stopPixPoll(),[stopPixPoll]);

  const lookupCep=async()=>{
    const c=cep.replace(/\D/g,'');
    if(c.length!==8){setCepErr('Digite um CEP válido com 8 dígitos.');return;}
    if(!selProd) return;
    const prod = selProd;
    // Each lookup supersedes the previous one: a late answer for an older CEP is discarded.
    cepAbort.current?.abort();
    const ctrl = new AbortController(); cepAbort.current = ctrl;
    const seq = ++cepSeq.current;
    const stale = () => seq !== cepSeq.current;
    setLoadingCep(true); setCepErr(''); setCepData(null); setShipping([]); setSelShip(null); setCepManual(false);
    try {
      // 1) Address by CEP. If ViaCEP is down or slow, the customer types the address by hand in step 2.
      let d: {localidade?:string;uf?:string;bairro?:string;logradouro?:string;erro?:boolean}|null = null;
      try {
        const r = await fetchT(`https://viacep.com.br/ws/${c}/json/`, {}, FETCH_TIMEOUT_MS, ctrl.signal);
        if (!r.ok) throw new Error('viacep');
        d = await r.json();
      } catch { d = null; }
      if (stale()) return;
      if (d?.erro) { setCepErr('CEP não encontrado. Confira os números.'); setLoadingCep(false); return; }
      const manual = !d;
      setCepManual(manual);
      setCepData({ localidade: d?.localidade ?? '', uf: d?.uf ?? '', bairro: d?.bairro ?? '' });
      setCheckoutForm(f => d
        ? ({...f, postalCode:c, city:d.localidade??'', state:d.uf??'', neighborhood:d.bairro??'', address:d.logradouro??f.address})
        : ({...f, postalCode:c}));

      // 2) Quote: Melhor Envio through our server first, static table only if the server is unreachable.
      let opts: ShipOpt[] = [];
      try {
        // Send the product so the server quotes the real packed weight and box size.
        const { status, data } = await postJson('/api/trpc/shipping.calculate', { cep: c, quantity: prod.units, productId: catalogId(prod.id) }, FETCH_TIMEOUT_MS, ctrl.signal);
        if (stale()) return;
        const pe = parseApiError(status, data);
        if (pe.kind === 'rate_limit') {
          // Too many requests is not "no quote": say so instead of silently showing an estimate.
          setCepData(null); setCepManual(false); setCepErr(pe.message); setLoadingCep(false);
          return;
        }
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
      } catch { if (stale()) return; }
      if (stale()) return;

      // Fallback to local static table if API unavailable (the badge says "Estimativa")
      if (opts.length === 0) { opts = calcShipping(d?.uf ?? '', prod.weightKg); setShippingSource('static'); }
      // Cheapest first, and preselected — independent of the order the server returned.
      const byPrice = [...opts].sort((a,b)=>a.price-b.price);
      const cheapest = byPrice.reduce((m,o)=>o.price<m.price?o:m, byPrice[0]);
      setShipping(byPrice); setSelShip(cheapest);
    } catch { if (!stale()) setCepErr('Erro de conexão. Tente novamente.'); }
    if (!stale()) setLoadingCep(false);
  };

  // Step 1 CTA: without a quoted freight there is nothing to advance to.
  const goStep2 = () => {
    if (!selShip || !selProd) {
      setCepErr('Informe seu CEP e calcule o frete para continuar.');
      cepInputRef.current?.focus();
      return;
    }
    fbq('track','InitiateCheckout',{ content_name: pixelName(selProd), content_ids: [pixelId(selProd)], content_type: 'product', value: selProd.price, currency: 'BRL', num_items: selProd.units });
    setShowCheckout(true);
  };

  // Resolves with the result; an answer for a code the customer has since edited is not applied.
  function validateCoupon(code: string, orderVal: number): Promise<CouponResult> {
    const seq = ++couponSeq.current;
    setCouponLoading(true);
    const run = (async (): Promise<CouponResult> => {
      try {
        const { status, data } = await postJson('/api/trpc/recovery.validateCoupon', { code: code.toUpperCase().trim(), orderValue: orderVal });
        const result = data?.result?.data?.json;
        if (result) return result as CouponResult;
        const pe = parseApiError(status, data);
        return { valid:false, message: pe.kind === 'rate_limit' || pe.kind === 'message' ? pe.message : 'Não foi possível validar o cupom agora.' };
      } catch {
        return { valid:false, message:'Não foi possível validar o cupom agora.' };
      }
    })();
    couponPending.current = run;
    return run.then(result => {
      if (seq === couponSeq.current) { couponPending.current = null; setCouponState(result); setCouponLoading(false); }
      return result;
    });
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
    // Same rules as the server, so a bad value never reaches it as raw validation JSON.
    const fe = validateCheckoutFields(checkoutForm);
    setFieldErrs(fe);
    const feKeys = Object.keys(fe);
    if (feKeys.length) { setOrderErr('Confira os campos destacados.'); document.getElementById(FIELD_INPUT_ID[feKeys[0]])?.focus(); return; }
    setCheckoutLoading(true);
    const reqId = ++createReqId.current;
    // Track step 3 (attempting payment)
    fetchT('/api/trpc/recovery.trackCart', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({json:{ customerName:checkoutForm.customerName, customerPhone:p3, customerEmail:checkoutForm.customerEmail||undefined, postalCode:checkoutForm.postalCode, quantity:selProd.units, stepReached:3 }}),
    }).catch(()=>{});
    try {
      const qty = selProd.units;
      // The coupon link validates asynchronously and a typed code may not have been applied yet:
      // wait for / run the validation so the order never silently loses the discount.
      let cs: CouponResult|null = couponState;
      if (couponPending.current) cs = await couponPending.current;
      else if (couponCode.trim() && !cs) cs = await validateCoupon(couponCode, selProd.price);
      if (reqId !== createReqId.current) return;
      if (couponCode.trim() && cs && !cs.valid) {
        setOrderErr('O cupom não pôde ser aplicado. Corrija o código ou apague o campo para continuar sem desconto.');
        document.getElementById('co-coupon')?.focus();
        return;
      }
      const { status, data } = await postJson('/api/trpc/shipping.createOrder', {
          ...checkoutForm,
          customerName: checkoutForm.customerName.trim(),
          customerEmail: checkoutForm.customerEmail.trim(),
          quantity:qty,
          productId: catalogId(selProd.id),
          shippingServiceId:selShip.serviceId ?? (selShip.service==='PAC'?'1':'2'),
          shippingServiceName:selShip.service,
          shippingPrice:selShip.price,
          couponCode: couponCode && cs?.valid ? couponCode.toUpperCase().trim() : undefined,
          utmSource: attributionRef.current.utm_source,
          utmMedium: attributionRef.current.utm_medium,
          utmCampaign: attributionRef.current.utm_campaign,
          utmContent: attributionRef.current.utm_content,
          utmTerm: attributionRef.current.utm_term,
          fbclid: attributionRef.current.fbclid,
          fbp: readCookie('_fbp'),
          fbc: readCookie('_fbc'),
        }, FETCH_WRITE_TIMEOUT_MS);
      const orderId = data?.result?.data?.json?.id;
      // Fechou ou voltou enquanto o pedido era registrado: o pedido existe no servidor, então fica
      // salvo para "Continuar pagamento", mas o diálogo não avança sozinho para o pagamento.
      if (reqId !== createReqId.current) {
        const tk = data?.result?.data?.json?.trackToken ?? null;
        const tot = data?.result?.data?.json?.total ?? (selProd.price+selShip.price);
        if (orderId && tk) {
          const late: PendingOrder = { id: orderId, total: tot, ts: Date.now(), trackToken: tk, productId: selProd.id, shipService: selShip.service, shipPrice: selShip.price };
          try { localStorage.setItem('sv_pending_order', JSON.stringify(late)); } catch {}
          setPendingOrder(late);
        }
        return;
      }
      // A tRPC error comes back as a 200/4xx with an `error` envelope (not a
      // thrown fetch), so guard explicitly — otherwise we'd advance to a
      // "#undefined confirmado" dead-end the customer could never pay.
      if (!orderId) {
        const pe = parseApiError(status, data);
        const keys = Object.keys(pe.fields);
        setFieldErrs(pe.fields);
        if (pe.firstField) document.getElementById(FIELD_INPUT_ID[pe.firstField] ?? '')?.focus();
        setOrderErr(
          pe.kind === 'validation' ? (keys.length > 1 ? 'Confira os campos destacados.' : pe.message)
          : pe.kind === 'unknown' ? 'Não foi possível registrar o pedido agora. Confira os dados e tente novamente.'
          : pe.message);
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
      if (!addPaymentInfoSent.current.has(orderId) && firstAddPaymentInfo(orderId)) {
        addPaymentInfoSent.current.add(orderId);
        fbq('track','AddPaymentInfo',{ value: total, currency: 'BRL', content_name: pixelName(selProd), content_ids: [pixelId(selProd)], content_type: 'product', num_items: qty });
      }
    } catch(err) {
      if (reqId !== createReqId.current) return;
      console.error('createOrder error:', err);
      setOrderErr(isAbort(err) ? SLOW_MSG : 'Erro ao registrar pedido. Verifique sua conexão e tente novamente.');
    } finally {
      if (reqId === createReqId.current) setCheckoutLoading(false);
    }
  }

  async function handleMpPay() {
    if(!orderDone) return;
    if(mpLoading) return; // guard against double-tap creating two MP charges
    setMpLoading(true); setPayErr('');
    try {
      const { status, data } = await postJson('/api/trpc/shipping.createPayment', { orderId: orderDone.id, token: orderDone.trackToken ?? undefined }, FETCH_WRITE_TIMEOUT_MS);
      const initPoint = data?.result?.data?.json?.initPoint;
      if(initPoint) {
        // Do NOT fire the Purchase pixel here — the customer is only being SENT to
        // Mercado Pago and hasn't paid yet (PIX/boleto/card can still fail/expire).
        // Firing Purchase on intent inflates conversions 2–4x and poisons ad
        // optimization + lookalikes. Purchase is fired only on CONFIRMED payment
        // (TrackOrder, on status=pago / confirmed) and server-side via the webhook.
        window.location.href = initPoint;
      }
      else {
        const pe = parseApiError(status, data);
        const apiMsg = pe.kind === 'message' ? pe.message : undefined;
        if (pedidoEncerrado(apiMsg)) clearPending();
        setPayErr(pe.kind === 'rate_limit' ? pe.message : apiMsg ? `Não foi possível gerar o link de pagamento: ${apiMsg}` : 'Erro ao gerar link de pagamento. Tente novamente.');
      }
    } catch (e) { setPayErr(isAbort(e) ? SLOW_MSG : 'Erro ao conectar com Mercado Pago. Tente novamente.'); }
    setMpLoading(false);
  }

  // Polls the payment status (the webhook does the real confirmation; this just reflects it on
  // screen): every 5s for 2 min, then every 15s. Gives up after 30 min, and says so after 3
  // failed checks in a row instead of failing silently. HTTP 429 = "try again later", not a failure.
  function startPixPoll(order:{id:number;total:number;trackToken?:string|null}) {
    stopPixPoll();
    const gen = pixPollGen.current;
    let fails = 0;
    const startedAt = Date.now();
    const schedule = (delay: number = pixPollDelay(Date.now() - startedAt)) => {
      pixPollRef.current = setTimeout(tick, delay);
    };
    const tick = async () => {
      if (gen !== pixPollGen.current) return;
      if (Date.now() - startedAt > PIX_MAX_MS) { stopPixPoll(); setPixExpired(true); return; }
      try {
        const r = await fetchT('/api/trpc/shipping.pixStatus', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({json:{ orderId: order.id, token: order.trackToken ?? undefined }}),
        });
        if (gen !== pixPollGen.current) return;
        if (r.status === 429) { schedule(PIX_SLOW_INTERVAL_MS); return; }
        const d = await r.json();
        if (gen !== pixPollGen.current) return;
        const j = d?.result?.data?.json;
        if (!j) throw new Error('pixStatus failed');
        fails = 0; setPixPollErr(false);
        if (j.paid) {
          setPixPaid(true);
          stopPixPoll();
          clearPending();
          if(!pixPurchaseFiredRef.current) {
            pixPurchaseFiredRef.current = true;
            if (claimPurchase(order.id)) fbq('track','Purchase',{
              value: order.total, currency: 'BRL', content_name: selProd ? pixelName(selProd) : 'SAL VITA PREMIUM',
              content_ids: ['salvita-001'], content_type: 'product', ...(selProd ? { num_items: selProd.units } : {}),
            }, { eventID: `purchase-${order.id}` });
          }
          return;
        }
      } catch {
        if (gen !== pixPollGen.current) return;
        fails += 1;
        if (fails >= 3) setPixPollErr(true);
      }
      schedule();
    };
    schedule();
  }

  // Generates an inline PIX QR code/copy-paste so the customer pays without
  // leaving the page, then polls for confirmation.
  async function handlePixPay() {
    if(!orderDone) return;
    if(pixLoading || pixData) return;
    setPixLoading(true); setPayErr(''); setPixExpired(false); setPixPollErr(false);
    try {
      const { status, data } = await postJson('/api/trpc/shipping.createPixPayment', { orderId: orderDone.id, token: orderDone.trackToken ?? undefined }, FETCH_WRITE_TIMEOUT_MS);
      const result = data?.result?.data?.json;
      // O diálogo foi fechado (ou trocou de pedido) enquanto o PIX era gerado: não mostra nem faz poll.
      if (dlgOrderRef.current !== orderDone.id) { setPixLoading(false); return; }
      if(result?.qrCode) {
        setPixData({ qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64 ?? '' });
        if (!addPaymentInfoSent.current.has(orderDone.id) && firstAddPaymentInfo(orderDone.id)) {
          addPaymentInfoSent.current.add(orderDone.id);
          fbq('track','AddPaymentInfo',{ value: orderDone.total, currency: 'BRL', content_name: selProd ? pixelName(selProd) : 'SAL VITA PREMIUM', content_ids: [selProd ? pixelId(selProd) : 'salvita-001'], content_type: 'product', ...(selProd ? { num_items: selProd.units } : {}) });
        }
        startPixPoll(orderDone);
      } else {
        const pe = parseApiError(status, data);
        const apiMsg = pe.kind === 'message' ? pe.message : undefined;
        if (pedidoEncerrado(apiMsg)) clearPending();
        setPayErr(pe.kind === 'rate_limit' ? pe.message : apiMsg ? `Não foi possível gerar o PIX: ${apiMsg}` : 'Erro ao gerar PIX. Tente novamente.');
      }
    } catch (e) { setPayErr(isAbort(e) ? SLOW_MSG : 'Erro ao conectar com Mercado Pago. Tente novamente.'); }
    setPixLoading(false);
  }

  async function copyPixCode() {
    if(!pixData) return;
    let ok = false;
    try { await navigator.clipboard.writeText(pixData.qrCode); ok = true; } catch {}
    const ta = pixCodeRef.current;
    if (!ok && ta) { // WebViews (Instagram/Facebook) and old browsers: select the text and try the legacy copy
      try { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); ok = document.execCommand('copy'); } catch {}
    }
    if (ok) { setPixCopyFail(false); setPixCopied(true); setTimeout(()=>setPixCopied(false), 3000); }
    else { try { ta?.focus(); ta?.select(); } catch {} setPixCopyFail(true); }
  }

  // Money lines of the checkout (coupon only applies to the product).
  const discount = selProd && couponState?.valid && couponState.discountValue
    ? (couponState.discountType==='percent' ? selProd.price*couponState.discountValue/100 : couponState.discountValue)
    : 0;
  const subtotal = selProd ? Math.max(0, selProd.price - discount) : 0;
  const packLabel = (p:Product) => `${p.name} · ${p.units} × 1 kg`;
  const navLinks = [{l:'Origem',h:'#origem'},{l:'O pacote',h:'#pacote'},{l:'Na cozinha',h:'#como-usar'},{l:'Preço',h:'#preco'},{l:'Rastrear pedido',h:'/meu-pedido'}];

  return (
    <>
      <style>{`
        /* ══ Tokens da loja ══
           Origem: html.sv-premium em index.html (escopado, não toca o :root do CRM).
           Aqui só os apelidos usados pela vitrine e pelos diálogos de compra. ══ */
        .lp, .mo, .sticky-bar {
          --brand:   var(--sv-navy);
          --navy:    var(--sv-navy);
          --salt:    var(--sv-salt);
          --saltmd:  var(--sv-salt-deep);
          --gold:    var(--sv-gold);
          --goldlt:  var(--sv-gold-light);
          --golddk:  var(--sv-gold-dark);
          --white:   #ffffff;
          --text:    var(--sv-ink);
          --mid:     var(--sv-mid);
          --muted:   var(--sv-muted);
          --r-sm:    var(--sv-r-sm);
          --r-md:    var(--sv-r-md);
        }
        html{scroll-behavior:smooth;}
        /* nav é fixa: sem isso a âncora aterrissa por baixo da barra */
        #origem,#pacote,#como-usar,#preco{scroll-margin-top:96px;}
        .lp { font-family:'Outfit',sans-serif; color:var(--text); background:var(--white); overflow-x:hidden; }
        .lp ::selection{background:rgba(201,162,39,.35);}
        .lp :focus-visible{outline:3px solid var(--goldlt);outline-offset:2px;}
        .lp .on-light :focus-visible, .mb :focus-visible{outline-color:var(--brand);}
        .mb:focus{outline:none;}
        .lp h1,.lp h2,.lp h3{text-wrap:balance;}

        /* ══ Hero: revelação única ao carregar ══ */
        @keyframes fadeUp { from{transform:translateY(14px)} to{transform:translateY(0)} }
        .h-rev{animation:fadeUp .6s cubic-bezier(.22,1,.36,1) both;}

        @keyframes spin {from{transform:rotate(0deg)} to{transform:rotate(360deg)}}
        .spin{animation:spin 1.2s linear infinite;}
        .gold-text{color:var(--goldlt);}
        .cta-gold:active{transform:scale(.98);}

        /* ══ Seções de texto não animam na rolagem: o conteúdo nasce visível (nada fica em branco se o JS ou o observer falhar) ══ */

        /* ══ cabeçalhos de seção (três variações, sem eyebrow repetido) ══ */
        .h2-d{font-family:'Cormorant Garamond',serif;font-weight:700;line-height:1.1;margin:0;font-size:clamp(2rem,4.6vw,3.4rem);}

        /* ══ origem ══ */
        .story-grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:1.15fr .85fr;gap:72px;align-items:center;}
        .story-fig{margin:0;}
        .story-fig img{width:100%;height:440px;object-fit:cover;display:block;border-radius:var(--r-md);}
        .story-fig figcaption{font-size:.875rem;color:var(--muted);margin-top:10px;}

        /* ══ linha do processo (sequência real: numerada) ══ */
        .tl-wrap{display:grid;grid-template-columns:repeat(4,1fr);gap:0 32px;}
        .tl-step{border-top:1px solid rgba(201,162,39,.5);padding-top:20px;}
        .tl-num{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:700;color:var(--goldlt);line-height:1;margin-bottom:12px;}
        .tl-step h3{font-family:'Outfit',sans-serif;font-size:1.125rem;font-weight:600;color:#fff;margin:0 0 8px;line-height:1.25;}
        .tl-step p{color:rgba(255,255,255,.8);line-height:1.65;font-size:.9375rem;margin:0;}

        /* ══ o que vem no pacote (lista assimétrica) ══ */
        .pk-grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:56px;align-items:start;}
        .pk-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:24px;padding:28px 0;border-top:1px solid rgba(11,29,58,.14);}
        .pk-row:last-child{border-bottom:1px solid rgba(11,29,58,.14);}
        .pk-row h3{font-family:'Outfit',sans-serif;font-size:1.125rem;font-weight:600;color:var(--brand);margin:0;line-height:1.3;}
        .pk-row p{color:var(--mid);line-height:1.7;margin:0;font-size:1.0625rem;}

        /* ══ na cozinha ══ */
        .use-wrap{max-width:1100px;margin:0 auto;}
        .use-2col{display:grid;grid-template-columns:1fr 1fr;gap:0 64px;margin-top:44px;}
        .use-row{padding:22px 0;border-top:1px solid rgba(11,29,58,.14);}
        .use-row h3{font-family:'Outfit',sans-serif;font-size:1.125rem;font-weight:600;color:var(--brand);margin:0 0 4px;line-height:1.3;}
        .use-row p{color:var(--mid);line-height:1.6;margin:0;font-size:1rem;}

        /* ══ preços ══ */
        .price-grid{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:20px;align-items:stretch;}
        .pc{border-radius:var(--r-md);position:relative;display:flex;flex-direction:column;padding:32px 28px;}
        .pc-hi{background:rgba(255,255,255,.06);border:1.5px solid var(--gold);}
        .pc-lo{background:var(--white);border:1px solid rgba(11,29,58,.12);}
        .pc-lo:hover{border-color:var(--gold);}
        .assure{display:grid;grid-template-columns:repeat(4,1fr);gap:0 24px;margin-top:44px;}
        .assure>div{border-top:1px solid rgba(255,255,255,.2);padding-top:14px;}

        /* ══ ship option (radio) ══ */
        .sopt{border:2px solid rgba(11,29,58,.1);border-radius:var(--r-md);padding:14px 16px;cursor:pointer;transition:border-color .25s,background .25s;font-size:1rem;}
        .sopt:hover{border-color:rgba(11,29,58,.3);}
        .sopt.sel{border-color:var(--gold);background:rgba(201,162,39,.07);}

        /* ══ modal — bottom sheet mobile; fica acima do botão do chat (z 9999) ══ */
        @keyframes sheetUp {from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1}}
        .mo{position:fixed;inset:0;z-index:10050;background:rgba(11,29,58,.82);display:flex;align-items:center;justify-content:center;padding:16px;}
        .mb{background:var(--white);border-radius:var(--r-md);width:100%;max-width:520px;max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 12px 40px rgba(11,29,58,.18);animation:sheetUp .3s cubic-bezier(.22,1,.36,1);}
        .mb-drag{display:none;flex:0 0 auto;width:44px;height:5px;background:rgba(11,29,58,.16);border-radius:3px;margin:10px auto 0;}
        .mb-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 32px 24px;}
        .mb-head{position:sticky;top:0;z-index:3;background:var(--white);display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:26px 0 12px;}
        .mb-x{flex-shrink:0;width:44px;height:44px;border:none;border-radius:var(--r-sm);background:var(--salt);color:var(--mid);font-size:1.5rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
        .mb-foot{flex:0 0 auto;padding:14px 32px calc(18px + env(safe-area-inset-bottom));border-top:1px solid rgba(11,29,58,.1);background:var(--white);}
        .lnk{background:none;border:none;color:var(--brand);font:inherit;font-size:.875rem;font-weight:600;text-decoration:underline;cursor:pointer;min-height:44px;padding:0 6px;}
        .err{color:#b91c1c;font-size:.875rem;font-weight:600;margin:6px 0 0;line-height:1.4;}
        .pix-qr{width:190px;height:190px;display:block;}

        /* ══ checkout steps ══ */
        .steps{display:flex;align-items:center;justify-content:center;gap:0;margin:4px 0 18px;}
        .step-dot{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8125rem;font-weight:700;flex-shrink:0;transition:background .3s,color .3s;}
        .step-on{background:var(--gold);color:var(--navy);}
        .step-done{background:var(--brand);color:#fff;}
        .step-off{background:var(--saltmd);color:var(--muted);}
        .step-line{width:44px;height:2px;background:var(--saltmd);}
        .step-line.done{background:var(--brand);}
        .step-lbl{font-size:.8125rem;font-weight:600;color:var(--muted);margin-top:5px;text-align:center;}

        /* ══ inputs ══ */
        .inp{width:100%;box-sizing:border-box;background:var(--salt);border:2px solid transparent;border-radius:var(--r-sm);padding:13px 15px;font-size:16px;outline:none;transition:border-color .2s;font-family:'Outfit',sans-serif;color:var(--text);}
        .inp:focus{border-color:var(--brand);}
        .inp::placeholder{color:var(--muted);opacity:1;}
        .inp[readonly]{background:var(--saltmd);color:var(--mid);}
        .inp[aria-invalid="true"]{border-color:#ef4444;}
        .inp-lbl{display:block;font-size:.875rem;font-weight:600;color:var(--mid);margin-bottom:6px;}

        /* ══ faq ══ */
        .faq-grid{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:56px;align-items:start;}
        .faq-border{border-bottom:1px solid rgba(11,29,58,.14);}
        .faq-border:first-child{border-top:1px solid rgba(11,29,58,.14);}
        .faq-ans{display:grid;transition:grid-template-rows .35s cubic-bezier(.22,1,.36,1),opacity .3s ease,visibility 0s linear .35s;}
        .faq-ans>div{overflow:hidden;min-height:0;}
        .faq-ans.open{grid-template-rows:1fr;opacity:1;visibility:visible;transition-delay:0s;}
        .faq-ans.closed{grid-template-rows:0fr;opacity:0;visibility:hidden;}
        .faq-ans p{font-size:1rem;line-height:1.75;}

        /* ══ misc ══ */
        .prod-img{mix-blend-mode:multiply;background:transparent;display:block;}
        .ham{display:none;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;background:none;border:none;min-width:44px;min-height:44px;padding:8px;border-radius:var(--r-sm);}
        .ham span{display:block;width:24px;height:2px;background:white;border-radius:2px;transition:transform .3s,opacity .3s;}
        .mob-drawer{display:none;position:fixed;inset:0;z-index:200;background:rgba(11,29,58,.88);}
        .mob-drawer-inner{position:absolute;top:0;right:0;bottom:0;width:min(80vw,300px);background:var(--navy);padding:24px;display:flex;flex-direction:column;gap:4px;}
        .sticky-bar{display:none;position:fixed;bottom:0;left:0;right:0;z-index:500;background:var(--navy);border-top:1px solid rgba(201,162,39,.4);padding:10px 14px calc(10px + env(safe-area-inset-bottom));}
        .footer-grid p,.footer-grid li,.footer-grid a{font-size:.9375rem;}
        .foot-link{display:inline-flex;align-items:center;min-height:44px;min-width:44px;color:rgba(255,255,255,.78);text-decoration:none;transition:color .2s;}
        .foot-link:hover{color:var(--goldlt);}
        .foot-h{font-size:1rem;font-weight:600;color:var(--goldlt);margin:0 0 8px;}
        .trust-strip{max-width:1000px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
        .nav-a{color:rgba(255,255,255,.85);font-size:.9375rem;font-weight:500;text-decoration:none;transition:color .2s;padding:10px 0;}
        .nav-a:hover{color:var(--goldlt);}
        .hero-grid{max-width:1200px;margin:0 auto;padding:80px 24px 110px;width:100%;display:grid;grid-template-columns:1.1fr .9fr;gap:56px;align-items:center;position:relative;z-index:2;}
        .hero-sec{min-height:100vh;min-height:100svh;display:flex;align-items:center;padding-top:80px;position:relative;overflow:hidden;background:var(--navy);}

        /* ══ nav compacta (menu em gaveta) ══ */
        @media(max-width:940px){
          .nav-menu{display:none!important;}
          .ham{display:flex!important;}
          .mob-drawer{display:block;}
        }

        /* ══ tablet ══ */
        @media(max-width:900px){
          .price-grid{grid-template-columns:1fr!important;max-width:520px;margin:0 auto;}
          .tl-wrap{grid-template-columns:1fr 1fr!important;gap:32px 24px!important;}
          .assure{grid-template-columns:1fr 1fr!important;gap:20px 24px!important;}
          .pk-grid,.faq-grid{grid-template-columns:1fr!important;gap:28px!important;}
        }

        /* ══ mobile ══ */
        @media(max-width:768px){
          .lp{padding-bottom:calc(76px + env(safe-area-inset-bottom));}
          .hero-sec{padding-top:64px;}
          .hero-grid{grid-template-columns:1fr!important;padding:40px 20px 96px!important;gap:36px!important;}
          .prod-shell{width:min(70vw,300px)!important;height:min(70vw,300px)!important;}
          .s-pad{padding:64px 20px!important;}
          .story-grid{grid-template-columns:1fr!important;gap:32px!important;}
          .story-fig img{height:300px!important;}
          .panorama{min-height:400px!important;}
          .crista-section{height:320px!important;}
          .pk-row{grid-template-columns:1fr!important;gap:8px!important;}
          .use-2col{grid-template-columns:1fr!important;}
          .footer-grid{grid-template-columns:1fr!important;gap:20px!important;}
          .mo{align-items:flex-end!important;padding:0!important;}
          .mb{border-radius:var(--r-md) var(--r-md) 0 0!important;max-height:92vh!important;max-height:92dvh!important;}
          .mb-drag{display:block!important;}
          .mb-body{padding:0 20px 16px!important;}
          .mb-head{padding:10px 0 8px!important;}
          .mb-foot{padding:10px 20px calc(12px + env(safe-area-inset-bottom))!important;}
          .pix-qr{width:150px;height:150px;}
          .sticky-bar{display:flex!important;}
          .faq-border button{padding:18px 0!important;}
          .pc{padding:28px 22px!important;}
          .trust-strip{grid-template-columns:1fr 1fr!important;}
        }
        @media(max-width:480px){
          .tl-wrap{grid-template-columns:1fr!important;}
          .assure{grid-template-columns:1fr!important;}
        }

        /* ══ acessibilidade: reduz movimento ══ */
        @media(prefers-reduced-motion:reduce){
          .h-rev{animation:none;}
          .spin{animation:none!important;}
          .mb{animation:none!important;}
          .faq-ans{transition-duration:.01s!important;}
          html{scroll-behavior:auto;}
        }
      `}</style>

      <div className="lp">

        {/* ══════ PEDIDO PENDENTE ══════ */}
        {pendingOrder&&!showModal&&(
          <div role="region" aria-label="Pedido aguardando pagamento" style={{background:'#0b1d3a',borderBottom:'1px solid rgba(201,162,39,.35)',padding:'84px 20px 14px'}}>
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
        <nav aria-label="Principal" style={{position:'fixed',top:0,left:0,right:0,zIndex:100,transition:'background .3s,padding .3s',background:scrolled||mobileMenu?'var(--navy)':'transparent',padding:scrolled?'8px 0':'18px 0',borderBottom:scrolled?'1px solid rgba(201,162,39,.3)':'1px solid transparent'}}>
          <div style={{maxWidth:1200,margin:'0 auto',padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <BrandLogo size={44}/>
            <div className="nav-menu" style={{display:'flex',gap:28,alignItems:'center'}}>
              {navLinks.map(({l,h})=>(
                <a key={l} href={h} className="nav-a">{l}</a>
              ))}
              <button className="cta-gold" onClick={()=>openBuy(PRODUCTS[0])} style={{background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:8,padding:'0 22px',minHeight:44,fontSize:'.9375rem',fontWeight:700,cursor:'pointer',transition:'background .2s'}}
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
            <div style={{marginBottom:24,paddingBottom:20,borderBottom:'1px solid rgba(201,162,39,.3)'}}><BrandLogo size={40}/></div>
            {navLinks.map(({l,h})=>(
              <a key={l} href={h} onClick={()=>setMobileMenu(false)} style={{display:'block',padding:'15px 0',color:'rgba(255,255,255,.9)',fontSize:'1.125rem',fontWeight:500,textDecoration:'none',borderBottom:'1px solid rgba(255,255,255,.1)'}}>{l}</a>
            ))}
            <button className="cta-gold" onClick={()=>{ setMobileMenu(false); setTimeout(()=>document.getElementById('preco')?.scrollIntoView({behavior:'smooth'}),100); }} style={{marginTop:24,width:'100%',background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:8,minHeight:52,fontSize:'1rem',fontWeight:700,cursor:'pointer'}}>
              Comprar
            </button>
          </div>
        </div>

        {/* ══════ HERO ══════ */}
        <section className="hero-sec">
          <div className="hero-grid">
            {/* Copy */}
            <div>
              <p className="h-rev" style={{animationDelay:'.1s',fontFamily:"'Cormorant Garamond',Georgia,serif",fontStyle:'italic',fontWeight:600,fontSize:'1.5rem',color:'var(--goldlt)',margin:'0 0 10px'}}>Sal Vita Premium</p>
              <h1 className="h-rev" style={{animationDelay:'.2s',fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(2.6rem,6.5vw,4.5rem)',fontWeight:700,lineHeight:1.05,color:'white',margin:'0 0 18px'}}>
                Sal marinho não refinado de Mossoró
              </h1>
              <p className="h-rev" style={{animationDelay:'.3s',fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(1.35rem,3vw,1.8rem)',fontWeight:400,fontStyle:'italic',color:'rgba(255,255,255,.9)',lineHeight:1.35,margin:'0 0 16px'}}>
                Muito mais sabor, em cada pitada.
              </p>
              <p className="h-rev" style={{animationDelay:'.4s',fontSize:'1.125rem',lineHeight:1.65,color:'rgba(255,255,255,.82)',maxWidth:'50ch',margin:'0 0 34px'}}>
                Sal integral de Mossoró, seco ao sol nas salinas do Rio Grande do Norte, sem o refino industrial que tira os minerais traço do sal.
              </p>

              <div className="h-rev" style={{animationDelay:'.5s',display:'flex',flexWrap:'wrap',gap:12}}>
                <button className="cta-gold" onClick={()=>openBuy(PRODUCTS[0])} style={{background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:8,minHeight:52,padding:'0 34px',fontSize:'1.0625rem',fontWeight:700,cursor:'pointer',transition:'background .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                  Comprar 1 kg
                </button>
                <a href="#preco" style={{background:'transparent',color:'white',border:'1.5px solid rgba(255,255,255,.45)',borderRadius:8,minHeight:52,padding:'0 30px',fontSize:'1.0625rem',fontWeight:600,textDecoration:'none',display:'inline-flex',alignItems:'center',transition:'border-color .2s,color .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--goldlt)';e.currentTarget.style.color='var(--goldlt)';}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,.45)';e.currentTarget.style.color='white';}}>
                  Ver tamanhos
                </a>
              </div>
            </div>

            {/* Produto */}
            <div className="hero-img-wrap h-rev" style={{animationDelay:'.3s',display:'flex',justifyContent:'center',alignItems:'center'}}>
              <div className="prod-shell" style={{width:440,height:440,borderRadius:'50%',background:'#ffffff',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 0 0 1.5px rgba(201,162,39,.6)'}}>
                <img src={IMG.produto} alt="Embalagem SAL VITA PREMIUM — Sal Marinho Não Refinado, Sal Integral de Mossoró (1kg)" className="prod-img"
                  width={896} height={1195} loading="eager" fetchPriority="high" decoding="async"
                  style={{width:'92%',height:'92%',objectFit:'contain'}}
                  onError={e=>{
                    e.currentTarget.style.display='none';
                    (e.currentTarget.nextElementSibling as HTMLElement).style.display='flex';
                  }}
                />
                <div style={{display:'none',width:'100%',height:'100%',background:'var(--navy)',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:28}}>
                  <BrandLogo size={56}/>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.5rem',fontWeight:700,color:'white',marginTop:12,textAlign:'center'}}>Sal Vita Premium</div>
                  <div style={{fontSize:'.875rem',color:'rgba(255,255,255,.8)',textAlign:'center'}}>Sal Marinho Não Refinado · 1kg · Mossoró/RN</div>
                </div>
              </div>
            </div>
          </div>

          {/* transição em cristal: recorte irregular */}
          <div aria-hidden="true" style={{position:'absolute',bottom:-1,left:0,right:0,lineHeight:0}}>
            <svg viewBox="0 0 1440 88" preserveAspectRatio="none" style={{width:'100%',height:72,display:'block'}}>
              <path d="M0,52 L180,66 L390,38 L620,70 L860,42 L1100,64 L1290,46 L1440,60 L1440,88 L0,88 Z" fill="#fbfaf7"/>
            </svg>
          </div>
        </section>

        {/* ══════ FAIXA DE FATOS VERIFICÁVEIS ══════ */}
        <div style={{background:'var(--salt)',borderBottom:'1px solid rgba(11,29,58,.1)',padding:'22px 20px'}}>
          <div className="trust-strip">
            {[
              ['Mossoró/RN','Origem'],
              ['Frete por CEP','Para todo o Brasil'],
              ['Mercado Pago','Pagamento via'],
              ['51.422.900/0001-68','CNPJ'],
            ].map(([a,b])=>(
              <div key={a} style={{textAlign:'center',padding:'6px 8px'}}>
                <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(.95rem,4vw,1.25rem)',fontWeight:700,color:'var(--brand)',lineHeight:1.2}}>{a}</div>
                <div style={{fontSize:'.875rem',color:'var(--muted)',marginTop:3}}>{b}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════ PANORAMA: MORROS DE SAL ══════ */}
        <section>
          <div className="panorama" role="img" aria-label="Morros de sal nas salinas de Mossoró" style={{height:460,backgroundImage:`url('${IMG.morrosSal}')`,backgroundSize:'cover',backgroundPosition:'center 40%',backgroundRepeat:'no-repeat'}}/>
          <div style={{background:'var(--navy)',padding:'36px 24px'}}>
            <div style={{maxWidth:1100,margin:'0 auto'}}>
              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.6rem,3.6vw,2.6rem)',fontWeight:400,fontStyle:'italic',color:'white',lineHeight:1.2,margin:'0 0 8px'}}>
                Das maiores salinas do Brasil para a sua mesa
              </p>
              <p style={{fontSize:'.9375rem',color:'var(--goldlt)',margin:0}}>Mossoró, Rio Grande do Norte</p>
            </div>
          </div>
        </section>

        {/* ══════ ORIGEM ══════ */}
        <section id="origem" className="s-pad on-light" style={{padding:'104px 24px',background:'white'}}>
          <div className="story-grid">
            <div id="story-left" data-reveal className={`rev${v('story-left')?' on':''}`}>
              <h2 className="h2-d" style={{color:'var(--text)',marginBottom:24}}>
                Do tanque ao pacote, aqui em Mossoró
              </h2>
              <p style={{color:'var(--mid)',lineHeight:1.75,fontSize:'1.125rem',maxWidth:'56ch',margin:0}}>
                Mossoró produz <strong style={{color:'var(--brand)'}}>mais de 95% do sal marinho do Brasil</strong>. O sol forte, o vento constante e o ar seco daqui fazem a água do mar secar nos tanques e virar sal.
              </p>
            </div>
            <figure id="story-right" data-reveal className={`story-fig rev d2${v('story-right')?' on':''}`}>
              <img src={IMG.salina} alt="Salinas de Mossoró" width={1200} height={800} loading="lazy" decoding="async"/>
              <figcaption>Salinas de Mossoró (RN)</figcaption>
            </figure>
          </div>
        </section>

        {/* ══════ COMO O SAL CHEGA AO PACOTE ══════ */}
        <section style={{padding:'96px 24px',background:'var(--navy)'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <h2 id="tl-h" data-reveal className={`h2-d rev${v('tl-h')?' on':''}`} style={{color:'white',marginBottom:48,maxWidth:'18ch'}}>
              Como o sal chega ao seu pacote
            </h2>
            <ol id="tl-g" data-reveal className="tl-wrap" style={{listStyle:'none',padding:0,margin:0}}>
              {[
                {t:'Colheita',d:'A água do mar cristaliza nos tanques sob o sol de Mossoró.'},
                {t:'Secagem ao sol',d:'Evaporação solar, sem forno e sem calor industrial.'},
                {t:'Moagem e iodação',d:'O sal é moído e recebe o iodo exigido por lei (25 mg/kg). Nenhum mineral traço é retirado.'},
                {t:'Embalagem',d:'Pacotes de 1 kg prontos para a sua cozinha.'},
              ].map((s,i)=>(
                <li key={s.t} className={`tl-step rev d${i+1}${v('tl-g')?' on':''}`}>
                  <div className="tl-num" aria-hidden="true">{i+1}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ══════ O QUE VEM NO PACOTE ══════ */}
        <section id="pacote" className="s-pad on-light" style={{padding:'96px 24px',background:'var(--salt)'}}>
          <div className="pk-grid">
            <h2 id="pk-h" data-reveal className={`h2-d rev${v('pk-h')?' on':''}`} style={{color:'var(--text)'}}>
              O que vem no pacote
            </h2>
            <div id="pk-l" data-reveal className={`rev d1${v('pk-l')?' on':''}`}>
              {[
                {t:'Minerais traço naturais',d:'O sal não passa por refino industrial, então os minerais traço não são retirados.'},
                {t:'Zip lock com janela',d:'Abre e fecha quantas vezes precisar. A janela circular deixa ver o sal sem abrir a embalagem.'},
                {t:'Iodado',d:'25 mg/kg, como a lei exige para o sal de mesa.'},
              ].map(b=>(
                <div key={b.t} className="pk-row">
                  <h3>{b.t}</h3>
                  <p>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ CRISTALIZADOR ══════ */}
        <section>
          <div className="crista-section" role="img" aria-label="Processo de cristalização do sal nas salinas de Mossoró" style={{height:460,backgroundImage:`url('${IMG.cristalizador}')`,backgroundSize:'cover',backgroundPosition:'center 40%',backgroundRepeat:'no-repeat'}}/>
          <div style={{background:'var(--navy)',padding:'32px 24px'}}>
            <p id="crista-q" data-reveal className={`rev${v('crista-q')?' on':''}`} style={{maxWidth:1100,margin:'0 auto',fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.5rem,3.4vw,2.3rem)',fontWeight:600,fontStyle:'italic',color:'white',lineHeight:1.25}}>
              Sol, vento e água do mar. É assim que o sal nasce aqui.
            </p>
          </div>
        </section>

        {/* ══════ NA COZINHA ══════ */}
        <section id="como-usar" className="s-pad on-light" style={{padding:'96px 24px',background:'white'}}>
          <div className="use-wrap">
            <h2 id="use-h" data-reveal className={`h2-d rev${v('use-h')?' on':''}`} style={{color:'var(--text)'}}>
              Na cozinha
            </h2>
            <div id="use-g" data-reveal className={`use-2col rev${v('use-g')?' on':''}`}>
              {USES.map(u=>(
                <div key={u.t} className="use-row">
                  <h3>{u.t}</h3>
                  <p>{u.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ PREÇOS ══════ */}
        <section id="preco" className="s-pad" style={{padding:'96px 24px',background:'var(--navy)'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div id="price-h" data-reveal className={`rev${v('price-h')?' on':''}`} style={{marginBottom:44}}>
              <h2 className="h2-d" style={{color:'white',marginBottom:12}}>Escolha o tamanho</h2>
              <p style={{color:'rgba(255,255,255,.82)',fontSize:'1.0625rem',margin:0}}>Frete calculado pelo seu CEP. Entregamos em todo o Brasil.</p>
            </div>

            <div id="price-c" data-reveal className={`price-grid rev${v('price-c')?' on':''}`}>
              {PRODUCTS.map(p=>(
                <div key={p.id} className={`pc ${p.highlight?'pc-hi':'pc-lo'}`}>
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.6rem',fontWeight:700,color:p.highlight?'white':'var(--text)',margin:'0 0 4px',lineHeight:1.15}}>{p.name}</h3>
                  <p style={{fontSize:'1rem',color:p.highlight?'rgba(255,255,255,.82)':'var(--mid)',margin:'0 0 2px'}}>{p.weight}</p>
                  {p.tag&&<p style={{fontSize:'.875rem',fontWeight:600,color:p.highlight?'var(--goldlt)':'var(--golddk)',margin:'0 0 16px'}}>{p.tag}</p>}
                  {!p.tag&&<div style={{height:16}}/>}

                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.2rem',fontWeight:700,color:p.highlight?'var(--goldlt)':'var(--brand)',lineHeight:1,marginBottom:6}}>{brl(p.price)}</div>
                  <p style={{fontSize:'.9375rem',color:p.highlight?'rgba(255,255,255,.82)':'var(--muted)',margin:'0 0 26px'}}>
                    {p.highlight
                      ? <>{brl(p.pricePerKg)} por kg na caixa. O pacote avulso custa {brl(PRODUCTS[0].price)}.</>
                      : <>{brl(p.pricePerKg)}/kg</>}
                  </p>

                  <button className="cta-gold" onClick={()=>openBuy(p)} style={{marginTop:'auto',width:'100%',background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:8,minHeight:52,fontSize:'1.0625rem',fontWeight:700,cursor:'pointer',transition:'background .2s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                    {p.id==='1kg'?'Comprar 1 kg':p.id==='3kg'?'Comprar trio 3 kg':'Comprar caixa 10 kg'}
                  </button>
                </div>
              ))}
            </div>

            {/* Garantias da compra */}
            <div className="assure">
              {[
                {t:'Entrega rastreada',s:'Rastreamento em todos os pedidos.'},
                {t:'Nota fiscal',s:'Emitida em todos os pedidos.'},
                {t:'Pagamento',s:'PIX, cartão em até 3× ou boleto, via Mercado Pago.'},
                {t:'Direito de arrependimento',s:'Até 7 dias após o recebimento (CDC, art. 49).'},
              ].map(({t,s})=>(
                <div key={t}>
                  <p style={{color:'white',fontWeight:600,fontSize:'1rem',lineHeight:1.3,margin:0}}>{t}</p>
                  <p style={{color:'rgba(255,255,255,.82)',fontSize:'.9375rem',lineHeight:1.5,margin:'4px 0 0'}}>{s}</p>
                </div>
              ))}
            </div>
            <p style={{color:'rgba(255,255,255,.82)',fontSize:'.9375rem',marginTop:24}}>
              Dúvidas sobre entrega ou troca: <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{color:'var(--goldlt)',fontWeight:600}}>fale conosco no WhatsApp</a>
            </p>

            {/* Atacado */}
            <div style={{marginTop:44,background:'rgba(255,255,255,.05)',border:'1px solid rgba(201,162,39,.45)',borderRadius:14,padding:'28px 32px',display:'flex',flexWrap:'wrap',alignItems:'center',gap:24,justifyContent:'space-between'}}>
              <div style={{flex:'1 1 280px'}}>
                <h3 style={{color:'white',fontWeight:600,fontSize:'1.25rem',lineHeight:1.3,margin:'0 0 6px'}}>Compra em grande volume?</h3>
                <p style={{color:'rgba(255,255,255,.82)',fontSize:'1rem',lineHeight:1.6,margin:0}}>Distribuidores, restaurantes, mercados e compras acima de 50 kg: peça uma cotação. Preço e frete combinados com a nossa equipe.</p>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:10,alignItems:'stretch',flexShrink:0}}>
                <a href="/atacado"
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',background:'var(--gold)',color:'var(--navy)',minHeight:48,padding:'0 24px',borderRadius:8,fontSize:'1rem',fontWeight:700,textDecoration:'none',transition:'background .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                  Solicitar cotação de atacado
                </a>
                <a href={`${WA_LINK}?text=${encodeURIComponent('Olá! Tenho interesse em compra de grande volume / distribuição do SAL VITA PREMIUM. Podemos conversar sobre condições especiais?')}`} target="_blank" rel="noopener noreferrer"
                  style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,minHeight:48,color:'white',border:'1.5px solid rgba(255,255,255,.45)',padding:'0 20px',borderRadius:8,fontSize:'1rem',fontWeight:600,textDecoration:'none'}}>
                  <WaIcon/> Ou fale pelo WhatsApp
                </a>
              </div>
            </div>

            {/* Informações do produto */}
            <div style={{border:'1px solid rgba(255,255,255,.2)',borderRadius:14,padding:'24px 28px',maxWidth:720,marginTop:32}}>
              <h3 style={{fontSize:'1.0625rem',fontWeight:600,color:'white',margin:'0 0 12px'}}>Informações do produto</h3>
              <p style={{color:'white',fontSize:'1rem',lineHeight:1.65,margin:'0 0 16px',paddingBottom:14,borderBottom:'1px solid rgba(255,255,255,.2)'}}>
                <strong>Ingredientes:</strong> cloreto de sódio, iodato de potássio e antiumectante INS-535 (ferrocianeto de sódio). Iodado com 25 mg/kg (RDC 604/2022).
              </p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'12px 32px'}}>
                {[
                  ['É iodado?','Sim, 25 mg/kg, conforme a legislação brasileira'],
                  ['Contém antiumectante?','Sim, INS-535 (ferrocianeto de sódio), conforme o rótulo'],
                  ['Tem nota fiscal?','Sim, emitida em todos os pedidos'],
                ].map(([q,a])=>(
                  <div key={q}>
                    <p style={{color:'rgba(255,255,255,.82)',fontSize:'.875rem',margin:'0 0 2px'}}>{q}</p>
                    <p style={{color:'white',fontSize:'1rem',fontWeight:500,margin:0}}>{a}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══════ FAQ ══════ */}
        <section className="s-pad on-light" style={{padding:'96px 24px',background:'var(--salt)'}}>
          <div className="faq-grid">
            <div id="faq-h" data-reveal className={`rev${v('faq-h')?' on':''}`}>
              <h2 className="h2-d" style={{color:'var(--text)',marginBottom:14}}>Perguntas frequentes</h2>
              <p style={{color:'var(--mid)',fontSize:'1rem',lineHeight:1.6,margin:0}}>Não achou a sua? <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{color:'var(--brand)',fontWeight:600}}>Chame no WhatsApp</a>.</p>
            </div>
            <div id="faq-l" data-reveal className={`rev d1${v('faq-l')?' on':''}`}>
              {FAQS.map((faq,i)=>(
                <div key={i} className="faq-border">
                  <h3 style={{margin:0}}>
                    <button id={`faq-btn-${i}`} aria-expanded={openFaq===i} aria-controls={`faq-panel-${i}`} onClick={()=>setOpenFaq(openFaq===i?null:i)} style={{width:'100%',background:'none',border:'none',padding:'20px 0',minHeight:44,display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',gap:16}}>
                      <span style={{fontFamily:"'Outfit',sans-serif",fontSize:'1.125rem',fontWeight:600,color:openFaq===i?'var(--brand)':'var(--text)',textAlign:'left',transition:'color .25s'}}>{faq.q}</span>
                      <span aria-hidden="true" style={{color:'var(--golddk)',fontSize:'1.5rem',flexShrink:0,transform:openFaq===i?'rotate(45deg)':'rotate(0)',transition:'transform .3s cubic-bezier(.22,1,.36,1)',display:'inline-block'}}>+</span>
                    </button>
                  </h3>
                  <div id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-btn-${i}`} className={`faq-ans${openFaq===i?' open':' closed'}`}>
                    <div><p style={{padding:'0 0 22px',margin:0,color:'var(--mid)'}}>{faq.a}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ FOOTER ══════ */}
        <footer style={{background:'var(--navy)',padding:'56px 24px 32px',borderTop:'1px solid rgba(201,162,39,.3)'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div className="footer-grid" style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr',gap:40,marginBottom:44}}>
              <div>
                <div style={{marginBottom:16}}><BrandLogo size={48} white/></div>
                <p style={{color:'rgba(255,255,255,.82)',lineHeight:1.7,margin:0}}>Sal Marinho Não Refinado, Sal Integral de Mossoró. Das salinas de Mossoró, Rio Grande do Norte, para a sua mesa.</p>
                <p style={{color:'rgba(255,255,255,.82)',fontSize:'.9375rem',lineHeight:1.75,marginTop:12}}>
                  A S Comércio e Moagem de Sal Ltda<br/>
                  Av. Industrial Dehuel Vieira Diniz, 505<br/>
                  Monsenhor Américo · Mossoró / RN<br/>
                  CEP 59.613-690<br/>
                  CNPJ 51.422.900/0001-68
                </p>
              </div>
              <div>
                <h4 className="foot-h">Compra e atendimento</h4>
                <ul style={{listStyle:'none',padding:0,margin:0}}>
                  <li><a className="foot-link" href="/meu-pedido">Rastrear pedido</a></li>
                  <li><a className="foot-link" href="/atacado">Atacado</a></li>
                  <li><a className="foot-link" href="/privacidade">Política de privacidade</a></li>
                  <li><a className="foot-link" href="/termos">Termos e trocas</a></li>
                </ul>
              </div>
              <div>
                <h4 className="foot-h">Fale conosco</h4>
                <ul style={{listStyle:'none',padding:0,margin:0}}>
                  <li><a className="foot-link" href={WA_LINK} target="_blank" rel="noopener noreferrer">WhatsApp (84) 2140-8212</a></li>
                  <li><a className="foot-link" href="mailto:contato@salvitarn.com.br">contato@salvitarn.com.br</a></li>
                  <li><a className="foot-link" href="https://instagram.com/salvitarn" target="_blank" rel="noopener noreferrer">@salvitarn</a></li>
                </ul>
              </div>
            </div>
            <div style={{borderTop:'1px solid rgba(255,255,255,.2)',paddingTop:24}}>
              <p style={{color:'rgba(255,255,255,.78)',fontSize:'.875rem',margin:0}}>© 2026 Sal Vita · Mossoró, Rio Grande do Norte</p>
            </div>
          </div>
        </footer>
      </div>

      {/* ══════ STICKY BOTTOM CTA (mobile) ══════ */}
      <div className="sticky-bar" style={{gap:12,alignItems:'center'}}>
        <div style={{flexShrink:0}}>
          <p style={{margin:0,fontSize:'.8125rem',color:'rgba(255,255,255,.82)'}}>Sal Vita Premium 1 kg</p>
          <p style={{margin:0,fontFamily:"'Cormorant Garamond',serif",fontSize:'1.25rem',fontWeight:700,color:'var(--goldlt)',lineHeight:1}}>{brl(PRODUCTS[0].price)}</p>
        </div>
        <button onClick={()=>openBuy(PRODUCTS[0])} className="cta-gold" style={{flex:1,background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:8,minHeight:48,padding:'0',fontSize:'1rem',fontWeight:700,cursor:'pointer'}}>
          Comprar
        </button>
      </div>

      {/* ══════ CHECKOUT — ETAPA 3: PAGAMENTO ══════ */}
      {step===3&&orderDone&&(
        <Sheet dlgRef={dlgRef} onBackdrop={requestClose} maxWidth={460}
          foot={
            pixPaid ? (
              <a href={trackUrl(orderDone.id,orderDone.trackToken)} className="cta-gold" style={{display:'flex',alignItems:'center',justifyContent:'center',background:'var(--brand)',color:'white',borderRadius:14,padding:'16px',fontSize:'1rem',fontWeight:700,textDecoration:'none'}}>
                Acompanhar pedido
              </a>
            ) : pixData && !pixExpired ? (
              <>
                <button onClick={copyPixCode}
                  style={{width:'100%',background:pixCopied?'#15803d':'var(--brand)',color:'white',border:'none',borderRadius:14,padding:'15px',fontSize:'1.02rem',fontWeight:700,cursor:'pointer',transition:'background .25s'}}>
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
                  style={{width:'100%',background:'var(--brand)',color:'white',border:'none',borderRadius:8,padding:'15px',fontSize:'1.02rem',fontWeight:700,cursor:'pointer'}}>
                  Gerar novo PIX
                </button>
              </>
            ) : (
              <>
                <button onClick={handlePixPay} disabled={pixLoading}
                  style={{width:'100%',background:'var(--brand)',opacity:pixLoading?.55:1,color:'white',border:'none',borderRadius:8,padding:'15px',fontSize:'1.05rem',fontWeight:700,cursor:pixLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,marginBottom:10}}>
                  {pixLoading ? 'Gerando QR Code…' : 'Pagar com PIX'}
                </button>
                <button onClick={handleMpPay} disabled={mpLoading}
                  style={{width:'100%',background:'transparent',color:'var(--brand)',border:'1.5px solid var(--brand)',borderRadius:14,padding:'13px',fontSize:'.95rem',fontWeight:700,cursor:mpLoading?'not-allowed':'pointer',opacity:mpLoading?.6:1}}>
                  {mpLoading ? 'Gerando link seguro…' : 'Cartão em até 3× ou boleto (Mercado Pago)'}
                </button>
              </>
            )
          }>
          <SheetHead eyebrow={`Pedido #${orderDone.id} registrado`} title="Finalize seu pagamento" onClose={requestClose}/>
          <Steps cur={3}/>

          {shipNotice&&<p role="status" style={{background:'#fffbeb',border:'1px solid #fde68a',color:'#92400e',borderRadius:8,padding:'9px 12px',fontSize:'.88rem',fontWeight:600,margin:'0 0 12px'}}>{shipNotice}</p>}

          <div style={{background:'var(--salt)',borderRadius:8,padding:'12px 14px',marginBottom:14,border:'1px solid rgba(11,29,58,.08)'}}>
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
              <p style={{fontSize:'1.1rem',fontWeight:700,color:'#15803d',margin:'0 0 4px'}}>Pagamento confirmado</p>
              <p style={{fontSize:'.88rem',color:'var(--muted)',margin:0}}>Recebemos seu PIX. Acompanhe o andamento do pedido pelo botão abaixo.</p>
            </div>
          ) : pixData && pixExpired ? (
            <div role="alert" style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:14,padding:'16px',textAlign:'center'}}>
              <p style={{fontSize:'.92rem',color:'#92400e',fontWeight:600,margin:0,lineHeight:1.5}}>Paramos de verificar este PIX após 30 minutos. Se você já pagou, confira em <a href={trackUrl(orderDone.id,orderDone.trackToken)} style={{color:'var(--brand)',fontWeight:700}}>Acompanhar pedido</a>; se não, gere um novo PIX.</p>
            </div>
          ) : pixData ? (
            <div style={{textAlign:'center'}}>
              {confirmLeave&&(
                <div role="alertdialog" aria-label="Sair do pagamento" style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:14,padding:'14px',marginBottom:12,textAlign:'left'}}>
                  <p style={{fontSize:'.9rem',color:'#92400e',fontWeight:600,margin:'0 0 10px',lineHeight:1.5}}>Quer sair desta tela? O QR Code fecha e a página deixa de conferir o pagamento sozinha. Para voltar, use o botão Continuar pagamento.</p>
                  <div style={{display:'flex',gap:10}}>
                    <button type="button" onClick={()=>setConfirmLeave(false)} style={{flex:1,minHeight:44,background:'var(--brand)',color:'white',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer'}}>Continuar aqui</button>
                    <button type="button" onClick={closeBuy} style={{flex:1,minHeight:44,background:'var(--salt)',color:'var(--mid)',border:'none',borderRadius:8,fontWeight:600,cursor:'pointer'}}>Sair</button>
                  </div>
                </div>
              )}
              {pixData.qrCodeBase64 && (
                <div style={{display:'inline-block',padding:8,background:'white',borderRadius:14,border:'1.5px solid rgba(201,162,39,.45)',boxShadow:'0 8px 30px rgba(11,29,58,.1)',marginBottom:10}}>
                  <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" width={190} height={190} className="pix-qr"/>
                </div>
              )}
              <p style={{fontSize:'.86rem',color:'var(--muted)',margin:'0 0 8px'}}>Escaneie o QR Code ou copie o código PIX:</p>
              <textarea ref={pixCodeRef} readOnly rows={5} value={pixData.qrCode} aria-label="Código PIX copia e cola"
                onFocus={e=>e.currentTarget.select()}
                style={{display:'block',width:'100%',boxSizing:'border-box',background:'var(--salt)',border:'1px solid rgba(11,29,58,.1)',borderRadius:8,padding:'8px 12px',fontSize:'.8125rem',wordBreak:'break-all',color:'var(--muted)',fontFamily:'monospace',resize:'none',userSelect:'all'}}/>
              {pixCopyFail&&<p role="status" style={{fontSize:'.84rem',color:'#b45309',fontWeight:600,margin:'8px 0 0',lineHeight:1.45}}>Não foi possível copiar sozinho. Toque no código acima, segure e escolha Copiar.</p>}
            </div>
          ) : (
            <>
              {payErr&&<p role="alert" className="err" style={{marginBottom:10}}>{payErr}{pedidoJaPago(payErr)&&<> <a href={trackUrl(orderDone.id,orderDone.trackToken)} style={{color:'var(--brand)',fontWeight:700}}>Acompanhar pedido</a></>}</p>}
              <p style={{fontSize:'.8rem',color:'var(--muted)',margin:'0 0 4px',textAlign:'center'}}>Pagamento processado com segurança pelo Mercado Pago</p>
              <p style={{fontSize:'.8rem',color:'var(--muted)',margin:0,textAlign:'center'}}>PIX · Cartão em até 3× · Boleto (Mercado Pago)</p>
            </>
          )}
          {!pixPaid&&pixData&&payErr&&<p role="alert" className="err" style={{textAlign:'center'}}>{payErr}{pedidoJaPago(payErr)&&<> <a href={trackUrl(orderDone.id,orderDone.trackToken)} style={{color:'var(--brand)',fontWeight:700}}>Acompanhar pedido</a></>}</p>}
          {!pixPaid&&(
            <p style={{textAlign:'center',fontSize:'.8rem',color:'var(--muted)',marginTop:12}}>
              Após pagar, rastreie em: <a href={trackUrl(orderDone.id,orderDone.trackToken)} style={{color:'var(--brand)',fontWeight:600}}>Pedido #{orderDone.id}</a>
            </p>
          )}
        </Sheet>
      )}

      {/* ══════ CHECKOUT — ETAPA 2: DADOS ══════ */}
      {step===2&&selProd&&selShip&&(
        <Sheet dlgRef={dlgRef} onBackdrop={backToStep1} maxWidth={480}
          foot={
            <>
              {orderErr&&<p role="alert" className="err" style={{margin:'0 0 8px'}}>{orderErr}</p>}
              <p style={{margin:'0 0 8px',fontSize:'.8125rem',lineHeight:1.45,color:'var(--muted)',textAlign:'center'}}>
                Ao continuar, você concorda com os <a href="/termos" target="_blank" rel="noopener noreferrer" style={{color:'var(--brand)',textDecoration:'underline'}}>Termos</a> e a <a href="/privacidade" target="_blank" rel="noopener noreferrer" style={{color:'var(--brand)',textDecoration:'underline'}}>Política de privacidade</a>.
              </p>
              <div style={{display:'flex',gap:10}}>
                <button type="button" onClick={backToStep1} disabled={checkoutLoading}
                  style={{flex:'0 0 auto',minHeight:48,background:'var(--salt)',color:'var(--mid)',border:'none',borderRadius:8,padding:'0 18px',fontSize:'.9rem',fontWeight:600,cursor:checkoutLoading?'not-allowed':'pointer',opacity:checkoutLoading?.5:1}}>
                  ← Voltar
                </button>
                <button type="submit" form="checkout-form" disabled={checkoutLoading}
                  style={{flex:1,minHeight:48,background:'var(--brand)',opacity:checkoutLoading?.55:1,color:'white',border:'none',borderRadius:8,padding:'0 12px',fontSize:'.95rem',fontWeight:700,cursor:checkoutLoading?'not-allowed':'pointer',whiteSpace:'nowrap'}}>
                  {checkoutLoading ? 'Registrando pedido…' : 'Ir para pagamento'}
                </button>
              </div>
            </>
          }>
          <SheetHead eyebrow="Dados para entrega" title="Finalizar Pedido" sub={`${packLabel(selProd)} · ${brl(selProd.price)}`} onClose={backToStep1}/>
          <Steps cur={2}/>
          <form id="checkout-form" onSubmit={handleCheckout} style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div style={{gridColumn:'1/-1'}}>
                <label className="inp-lbl" htmlFor="co-name">Nome completo *</label>
                <input id="co-name" className="inp" required autoComplete="name" value={checkoutForm.customerName} onChange={e=>onField('customerName',e.target.value)} placeholder="Seu nome completo" maxLength={100} aria-invalid={fieldErrs.customerName?true:undefined} aria-describedby={fieldErrs.customerName?'err-customerName':undefined}/>
                {FE('customerName')}
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-phone">Telefone/WhatsApp *</label>
                <input id="co-phone" className="inp" required type="tel" inputMode="numeric" autoComplete="tel" value={checkoutForm.customerPhone}
                  onChange={e=>{ const m=maskPhone(e.target.value); onField('customerPhone',m); if(m.replace(/\D/g,'').length>=10) setPhoneError(''); }}
                  onBlur={()=>{ const n=checkoutForm.customerPhone.replace(/\D/g,'').length; setPhoneError(n>0&&n<10?'Informe DDD + número.':''); }}
                  placeholder="(84) 99999-9999"
                  aria-invalid={phoneError?true:undefined} aria-describedby={phoneError?'co-phone-err':undefined}/>
                {phoneError && <p id="co-phone-err" role="alert" className="err">{phoneError}</p>}
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-cpf">CPF *</label>
                <input id="co-cpf" className="inp" required type="text" inputMode="numeric" autoComplete="off" value={checkoutForm.customerCpf}
                  onChange={e=>{ const m=maskCpf(e.target.value); onField('customerCpf',m); setCpfError(m.replace(/\D/g,'').length===11 && !isValidCpf(m) ? 'CPF inválido — confira os números.' : ''); }}
                  placeholder="000.000.000-00" maxLength={14}
                  aria-invalid={cpfError?true:undefined} aria-describedby={cpfError?'co-cpf-err':undefined}/>
                {cpfError && <p id="co-cpf-err" role="alert" className="err">{cpfError}</p>}
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="inp-lbl" htmlFor="co-email">E-mail *</label>
                <input id="co-email" className="inp" required type="email" autoComplete="email" value={checkoutForm.customerEmail} onChange={e=>onField('customerEmail',e.target.value)} placeholder="seuemail@exemplo.com" maxLength={254} aria-invalid={fieldErrs.customerEmail?true:undefined} aria-describedby={fieldErrs.customerEmail?'err-customerEmail':undefined}/>
                {FE('customerEmail')}
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-cep">CEP (do frete)</label>
                <div style={{position:'relative'}}>
                  <input id="co-cep" className="inp" readOnly autoComplete="postal-code" inputMode="numeric" value={maskCep(checkoutForm.postalCode)} style={{paddingRight:76}}/>
                  <button type="button" className="lnk" onClick={backToStep1} style={{position:'absolute',right:2,top:2,bottom:2}}>alterar</button>
                </div>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-number">Número *</label>
                <input id="co-number" className="inp" required inputMode="text" enterKeyHint="next" autoCapitalize="characters" maxLength={20} autoComplete="off" value={checkoutForm.number} onChange={e=>onField('number',cleanAddressNumber(e.target.value))} placeholder="123 ou S/N" aria-invalid={fieldErrs.number?true:undefined} aria-describedby={fieldErrs.number?'err-number':undefined}/>
                {FE('number')}
              </div>
              <div style={{gridColumn:'1/-1'}}>
                <label className="inp-lbl" htmlFor="co-address">Endereço (rua/av.) *</label>
                <input id="co-address" className="inp" required autoComplete="address-line1" value={checkoutForm.address} onChange={e=>onField('address',e.target.value)} placeholder="Rua / Avenida" maxLength={100} aria-invalid={fieldErrs.address?true:undefined} aria-describedby={fieldErrs.address?'err-address':undefined}/>
                {FE('address')}
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-complement">Complemento</label>
                <input id="co-complement" className="inp" autoComplete="address-line2" value={checkoutForm.complement} onChange={e=>onField('complement',e.target.value)} placeholder="Apto, bloco..."/>
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-neighborhood">Bairro *</label>
                <input id="co-neighborhood" className="inp" required autoComplete="address-level3" value={checkoutForm.neighborhood} onChange={e=>onField('neighborhood',e.target.value)} placeholder="Bairro" maxLength={100} aria-invalid={fieldErrs.neighborhood?true:undefined} aria-describedby={fieldErrs.neighborhood?'err-neighborhood':undefined}/>
                {FE('neighborhood')}
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-city">Cidade *</label>
                <input id="co-city" className="inp" required autoComplete="address-level2" value={checkoutForm.city} onChange={e=>onField('city',e.target.value)} placeholder="Cidade" maxLength={100} aria-invalid={fieldErrs.city?true:undefined} aria-describedby={fieldErrs.city?'err-city':undefined}/>
                {FE('city')}
              </div>
              <div>
                <label className="inp-lbl" htmlFor="co-state">Estado *</label>
                <select id="co-state" className="inp" required autoComplete="address-level1" value={checkoutForm.state} onChange={e=>onField('state',e.target.value)}>
                  <option value="">UF</option>
                  {UFS.map(u=><option key={u} value={u}>{u}</option>)}
                </select>
                {FE('state')}
              </div>
            </div>
            {/* Cupom */}
            <div style={{marginTop:4}}>
              <label className="inp-lbl" htmlFor="co-coupon">Cupom de desconto</label>
              <div style={{display:'flex',gap:8}}>
                <input id="co-coupon" className="inp" type="text" autoComplete="off" value={couponCode}
                  onChange={e=>{ couponSeq.current += 1; couponPending.current = null; setCouponLoading(false); setCouponCode(e.target.value.toUpperCase()); setCouponState(null); }}
                  onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); if(couponCode.trim() && !couponLoading) validateCoupon(couponCode, selProd.price); } }}
                  placeholder="Ex: VOLTA10"
                  aria-describedby={couponState?'co-coupon-msg':undefined}
                  style={{flex:1,fontFamily:'monospace',borderColor:couponState?.valid?'#16a34a':couponState?.valid===false?'#ef4444':undefined}}/>
                <button type="button"
                  onClick={()=>validateCoupon(couponCode, selProd.price)}
                  disabled={!couponCode.trim() || couponLoading}
                  style={{minHeight:44,padding:'0 18px',background:'var(--brand)',color:'white',border:'none',borderRadius:8,fontSize:'.85rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',opacity:(!couponCode.trim()||couponLoading)?.6:1}}>
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
            <div style={{background:'var(--salt)',borderRadius:8,padding:'13px 16px',marginTop:4,border:'1px solid rgba(201,162,39,.25)'}}>
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
            <p style={{fontSize:'.875rem',color:'var(--mid)',background:'var(--saltmd)',border:'1px solid rgba(11,29,58,.12)',borderRadius:8,padding:'10px 12px',lineHeight:1.5,margin:0}}>
              Direito de arrependimento em até 7 dias após o recebimento (CDC, art. 49). Dúvidas sobre entrega ou troca: <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={{color:'var(--brand)',fontWeight:700}}>fale conosco no WhatsApp</a>.
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
                style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:10,minHeight:52,background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:14,padding:'0 16px',fontSize:'.96rem',fontWeight:700,cursor:'pointer',transition:'background .2s,transform .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--goldlt)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';}}>
                {selShip ? 'Continuar' : 'Calcular frete para continuar'}
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
                  if (d!==cep) { cepSeq.current += 1; cepAbort.current?.abort(); setLoadingCep(false); setCepManual(false); setCepData(null); setShipping([]); setSelShip(null); }
                }}
                onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); if(!loadingCep) lookupCep(); } }}
                placeholder="00000-000"
                aria-invalid={cepErr?true:undefined} aria-describedby={cepErr?'sv-cep-err':undefined}
                style={{flex:1,}}/>
              <button onClick={lookupCep} disabled={loadingCep} style={{minHeight:48,background:'var(--brand)',color:'white',border:'none',borderRadius:8,padding:'0 22px',fontSize:'.85rem',fontWeight:700,cursor:loadingCep?'not-allowed':'pointer',opacity:loadingCep?.7:1,whiteSpace:'nowrap',transition:'background .2s'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--brand2)'}
                onMouseLeave={e=>e.currentTarget.style.background='var(--brand)'}>{loadingCep?'Calculando…':'Calcular'}</button>
            </div>
            {cepErr&&<p id="sv-cep-err" role="alert" className="err">{cepErr}</p>}
            <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener noreferrer" style={{fontSize:'.87rem',color:'var(--muted)',textDecoration:'none',display:'inline-flex',alignItems:'center',minHeight:44}}>Não sei meu CEP →</a>
          </div>

          {cepData&&(
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'9px 14px',background:'var(--saltmd)',borderRadius:8,border:'1px solid rgba(11,29,58,.12)'}}>
                <p style={{fontSize:'.875rem',color:'var(--mid)'}}>{cepManual ? 'Não conseguimos buscar o endereço pelo CEP agora. Você preenche o endereço no próximo passo.' : `${cepData.localidade} — ${cepData.uf}${cepData.bairro?` · ${cepData.bairro}`:''}`}</p>
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <p id="ship-lbl" style={{fontSize:'.85rem',fontWeight:700,color:'var(--muted)',margin:0}}>Opções de frete</p>
                {shippingSource==='api'
                  ? <span style={{fontSize:'.8125rem',background:'var(--saltmd)',color:'var(--brand)',padding:'2px 8px',borderRadius:8,fontWeight:600}}>Via Melhor Envio</span>
                  : <span style={{fontSize:'.8125rem',background:'rgba(201,162,39,.18)',color:'var(--golddk)',padding:'2px 8px',borderRadius:8,fontWeight:600}}>Estimativa</span>
                }
              </div>
              <div role="radiogroup" aria-labelledby="ship-lbl" style={{display:'flex',flexDirection:'column',gap:10,marginBottom:6}}>
                {shipping.map((opt,idx)=>{
                  const on = selShip?.service===opt.service;
                  const badge = shipBadges.get(opt.service);
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
                          <p style={{fontWeight:700,color:'var(--text)',fontSize:'.93rem',display:'flex',alignItems:'center',flexWrap:'wrap',gap:6}}>
                            {opt.service}
                            {badge&&<span style={{fontSize:'.8125rem',fontWeight:700,background:badge==='Mais barato'?'var(--saltmd)':'rgba(201,162,39,.18)',color:badge==='Mais barato'?'var(--brand)':'var(--golddk)',padding:'2px 8px',borderRadius:14}}>{badge}</span>}
                          </p>
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
          <p style={{marginTop:10,fontSize:'.84rem',color:'var(--muted)',textAlign:'center',lineHeight:1.5}}>{shippingSource==='static' && shipping.length>0 ? 'Valor estimado. O valor final do frete é confirmado no próximo passo. Enviamos para todo o Brasil.' : 'Frete calculado por CEP, transportadoras via Melhor Envio · Enviamos para todo o Brasil'}</p>
        </Sheet>
      )}
      <ConsentBanner />
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
