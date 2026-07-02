import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Social proof data ──────────────────────────────────── */
const SP_NAMES = ['Ana','Maria','João','Carlos','Pedro','Fernanda','Juliana','Roberto','Marcos','Patrícia','Rafael','Camila','Lucas','Beatriz','Thiago','Larissa','Diego','Natália','Bruno','Isabela'];
const SP_CITIES = ['Mossoró/RN','Natal/RN','Fortaleza/CE','Recife/PE','João Pessoa/PB','Campina Grande/PB','Maceió/AL','Aracaju/SE','Salvador/BA','Teresina/PI','São Luís/MA','Caicó/RN','Pau dos Ferros/RN','Parnamirim/RN','Caucaia/CE'];
const SP_QTYS = ['1 embalagem de 1kg','2 embalagens de 1kg','1 embalagem de 10kg','3 embalagens de 1kg'];
function randEl<T>(arr: T[]): T { return arr[Math.floor(Math.random()*arr.length)]; }

function useSocialProof() {
  const [toast, setToast] = useState<{name:string;city:string;qty:string;visible:boolean}|null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(() => {
    function show() {
      setToast({ name:randEl(SP_NAMES), city:randEl(SP_CITIES), qty:randEl(SP_QTYS), visible:true });
      timerRef.current = setTimeout(()=>setToast(t=>t?{...t,visible:false}:null), 4500);
      timerRef.current = setTimeout(()=>{ setToast(null); schedule(); }, 5200);
    }
    function schedule() {
      const delay = 12000 + Math.random()*18000; // 12–30s
      timerRef.current = setTimeout(show, delay);
    }
    const initial = setTimeout(show, 5000); // first one after 5s
    return () => { clearTimeout(initial); if(timerRef.current) clearTimeout(timerRef.current); };
  }, []);
  return toast;
}

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

function calcShipping(uf:string, kg:number) {
  const r = REGIONS[uf] ?? {pac:[28,'10–15 dias'],sedex:[52,'4–7 dias']};
  const f = kg >= 10 ? 2.4 : 1;
  return [
    {service:'PAC',   price:+(r.pac[0]  *f).toFixed(2), days:r.pac[1],  icon:'📦', description:'Econômico'},
    {service:'SEDEX', price:+(r.sedex[0]*f).toFixed(2), days:r.sedex[1],icon:'⚡', description:'Expresso'},
  ];
}

/* ─── WhatsApp ───────────────────────────────────────────── */
const WA = '558421408212';

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
  {q:'Como funciona o frete?',a:'Enviamos por Correios via Melhor Envio com rastreamento. Nordeste: 1–5 dias úteis. Sudeste/Sul: 2–7 dias. Norte: até 18 dias úteis. O frete é calculado por CEP na finalização do pedido.'},
];

/* ─── Testimonials ───────────────────────────────────────── */
const TESTIMONIALS = [
  {name:'Ana Paula S.',city:'Natal, RN',stars:5,text:'Nunca mais voltei para o sal comum. O sabor dos meus pratos mudou completamente — uso menos e fica mais gostoso. A embalagem com zip lock é prática demais.'},
  {name:'Ricardo M.',city:'São Paulo, SP',stars:5,text:'Comprei a caixa de 10kg e não me arrependo. Preço ótimo, sal de qualidade real. Dá para sentir a diferença no tempero, especialmente em peixes e carnes.'},
  {name:'Fernanda C.',city:'Recife, PE',stars:5,text:'Produto incrível! Minha família toda adotou. A janela transparente na embalagem é um detalhe que mostra cuidado com o produto. Recomendo muito.'},
  {name:'Carlos R.',city:'Belo Horizonte, MG',stars:5,text:'Já testei outros sais "premium" mas este é diferente. Visivelmente mais úmido e com granulação perfeita. O iodo natural faz toda diferença no sabor.'},
  {name:'Juliana T.',city:'Fortaleza, CE',stars:5,text:'Recebi rápido e bem embalado. O sal tem uma cor ligeiramente acinzentada que mostra que é de verdade — não é aquele branco artificial. Muito bom!'},
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

interface Product {id:string;name:string;subtitle:string;weight:string;weightKg:number;units:number;price:number;pricePerKg:number;tag:string;highlight:boolean;savings?:string}
interface ShipOpt  {serviceId?:string;service:string;price:number;days:string;icon:string;description:string}
interface CepData  {localidade:string;uf:string;bairro:string}

/* ══════════════════════════════════════════════════════════ */
export default function SalVitaLandingClassic() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'SAL VITA PREMIUM — Sal Marinho Não Refinado de Mossoró · +80 Minerais';
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
  const [orderDone,setOrderDone]           = useState<{id:number;total:number;createdAt:number}|null>(null);
  const [mpLoading,setMpLoading]           = useState(false);
  const [payTimer,setPayTimer]             = useState(900); // 15 min countdown
  const payTimerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const [pixLoading,setPixLoading]         = useState(false);
  const [pixData,setPixData]               = useState<{qrCode:string;qrCodeBase64:string}|null>(null);
  const [pixCopied,setPixCopied]           = useState(false);
  const [pixPaid,setPixPaid]               = useState(false);
  const pixPollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const pixPurchaseFiredRef = useRef(false);
  const [checkoutForm,setCheckoutForm]     = useState({
    customerName:'',customerPhone:'',customerEmail:'',customerCpf:'',postalCode:'',address:'',
    number:'',complement:'',neighborhood:'',city:'',state:'',
  });
  const [couponCode,setCouponCode]         = useState('');
  const [couponState,setCouponState]       = useState<{valid:boolean;message:string;discountValue?:number;discountType?:string}|null>(null);
  const [couponLoading,setCouponLoading]   = useState(false);
  const [cpfError,setCpfError]             = useState('');
  const [pendingOrder,setPendingOrder]     = useState<{id:number;total:number}|null>(null);
  const autoCouponRef = useRef<string>('');
  const attributionRef = useRef<Record<string,string>>({});
  const obs = useRef<IntersectionObserver|null>(null);
  const spToast = useSocialProof();

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
    try {
      const saved = localStorage.getItem('sv_customer_data');
      if (saved) {
        const d = JSON.parse(saved);
        if (d && typeof d === 'object') {
          setCheckoutForm(f => ({ ...f, ...d }));
          if (d.postalCode) setCep(d.postalCode);
        }
      }
    } catch {}
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
  }, [showCheckout, selProd, couponCode]);

  // Check for pending order in localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sv_pending_order');
      if (stored) {
        const p = JSON.parse(stored);
        if (Date.now() - p.ts < 2 * 60 * 60 * 1000) {
          setPendingOrder(p);
        }
      }
    } catch {}
  }, []);

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

  const openBuy=useCallback((p:Product)=>{
    setSelProd(p); setShowModal(true); setMobileMenu(false);
    try { (window as any).fbq?.('track','ViewContent',{ content_name: 'SAL VITA PREMIUM 1kg', content_category: 'Alimentos Naturais', content_ids: ['salvita-001'], content_type: 'product', value: p.price, currency: 'BRL' }); } catch {}
    try { (window as any).fbq?.('track','AddToCart',{ content_name: 'SAL VITA PREMIUM 1kg', content_ids: ['salvita-001'], content_type: 'product', value: p.price, currency: 'BRL' }); } catch {}
    setCep(''); setCepData(null); setShipping([]); setSelShip(null); setCepErr(''); setShippingSource(null);
    setShowCheckout(false); setOrderDone(null);
    setCheckoutForm({customerName:'',customerPhone:'',customerEmail:'',customerCpf:'',postalCode:'',address:'',number:'',complement:'',neighborhood:'',city:'',state:''});
    setCouponState(null); setCouponCode('');
    cartTrackRef.current = false;
    localStorage.removeItem('sv_pending_order');
    setPendingOrder(null);
    setPixData(null); setPixPaid(false); setPixCopied(false);
    pixPurchaseFiredRef.current = false;
    if(pixPollRef.current) clearInterval(pixPollRef.current);
    document.body.style.overflow='hidden';
  },[]);
  const closeBuy=useCallback(()=>{
    setShowModal(false); setShowCheckout(false); setOrderDone(null); document.body.style.overflow='';
    if(payTimerRef.current) clearInterval(payTimerRef.current);
    if(pixPollRef.current) clearInterval(pixPollRef.current);
  },[]);

  // Countdown is derived from the real order-creation timestamp (not reset on
  // every render), so it reflects actual elapsed time even if the tab is
  // backgrounded/throttled or the page is briefly hidden.
  useEffect(()=>{
    if(orderDone){
      const tick=()=>{
        const elapsed=Math.floor((Date.now()-orderDone.createdAt)/1000);
        setPayTimer(Math.max(0,900-elapsed));
      };
      tick();
      payTimerRef.current = setInterval(tick,1000);
    } else {
      if(payTimerRef.current) clearInterval(payTimerRef.current);
    }
    return ()=>{ if(payTimerRef.current) clearInterval(payTimerRef.current); };
  },[orderDone]);

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
          body: JSON.stringify({ json: { cep: c, quantity: qty } }),
        });
        const data = await r.json();
        const source = data?.result?.data?.json?.source;
        const options = data?.result?.data?.json?.options;
        if (Array.isArray(options) && options.length > 0) {
          setShippingSource(source === 'api' ? 'api' : 'static');
          const carrierIcon = (name: string, company: string): string => {
            const n = name.toUpperCase();
            const c = (company ?? '').toUpperCase();
            if (n.includes('JADLOG')) return '📦';
            if (n.includes('AZUL') || c.includes('AZUL')) return '✈️';
            if (n.includes('LOGGI') || c.includes('LOGGI')) return '🏍️';
            if (n.includes('TOTAL') || c.includes('TOTAL EXPRESS')) return '🚚';
            // Correios services
            return '📬';
          };
          const carrierDesc = (name: string, company: string): string => {
            const n = name.toUpperCase();
            if (n === 'PAC') return 'Econômico';
            if (n === 'SEDEX' || n === 'SEDEX 10' || n === 'SEDEX HOJE') return 'Expresso';
            if (n.includes('MINI ENVIOS') || n.includes('MINI ENVIO')) return 'Mini envio';
            return company || 'Transportadora';
          };
          opts = options.map((o: any) => ({
            serviceId: o.serviceId,
            service: o.name,
            price: o.price,
            days: o.days,
            icon: carrierIcon(o.name ?? '', o.company ?? ''),
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

  const products:Product[]=[
    {id:'1kg',  name:'SAL VITA PREMIUM',      subtitle:'Embalagem zip lock com janela',      weight:'1kg',          weightKg:1.2, units:1,  price:29.90, pricePerKg:29.90, tag:'Mais Vendido',          highlight:false},
    {id:'3kg',  name:'TRIO SAL VITA',         subtitle:'3 embalagens zip lock de 1kg cada',  weight:'3kg (3×1kg)',  weightKg:3.6, units:3,  price:74.90, pricePerKg:24.97, tag:'Ideal para a Família', highlight:false},
    {id:'caixa',name:'CAIXA SAL VITA PREMIUM',subtitle:'10 embalagens zip lock de 1kg cada', weight:'10kg (10×1kg)',weightKg:12,  units:10, price:149.90,pricePerKg:14.99, tag:'Melhor Custo-Benefício', highlight:true, savings:'Economize R$ 149,10'},
  ];

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
    } catch {}
    setCouponLoading(false);
  }

  async function handleCheckout(e:React.FormEvent) {
    e.preventDefault();
    if(!selProd||!selShip) return;
    if(checkoutLoading) return; // guard against double-submit (mobile double-tap)
    // Validate CPF before creating the order — a bad CPF only fails later at
    // Mercado Pago / Melhor Envio, after the sale, which loses the customer.
    if(!isValidCpf(checkoutForm.customerCpf)) { setCpfError('CPF inválido — confira os números.'); return; }
    setCpfError('');
    setCheckoutLoading(true);
    // Track step 3 (attempting payment)
    const p3 = checkoutForm.customerPhone.replace(/\D/g,'');
    fetch('/api/trpc/recovery.trackCart', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({json:{ customerName:checkoutForm.customerName, customerPhone:p3, customerEmail:checkoutForm.customerEmail||undefined, postalCode:checkoutForm.postalCode, quantity:selProd.weightKg>=10?10:1, stepReached:3 }}),
    }).catch(()=>{});
    try {
      const qty = selProd.units;
      const res = await fetch('/api/trpc/shipping.createOrder', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{
          ...checkoutForm,
          quantity:qty,
          productId: (['1kg','3kg','caixa'] as const).includes(selProd.id as any) ? selProd.id : '1kg',
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
        alert(apiMsg ? `Não foi possível registrar o pedido: ${apiMsg}` : 'Erro ao registrar o pedido. Confira os dados e tente novamente.');
        return;
      }
      const total   = data?.result?.data?.json?.total ?? (selProd.price+selShip.price);
      const createdAt = Date.now();
      setOrderDone({ id: orderId, total, createdAt });
      localStorage.setItem('sv_pending_order', JSON.stringify({ id: orderId, total, ts: createdAt }));
      try { (window as any).fbq?.('track','AddPaymentInfo',{ value: total, currency: 'BRL', content_name: 'SAL VITA PREMIUM 1kg', content_ids: ['salvita-001'], content_type: 'product', num_items: qty }); } catch {}
    } catch(err) {
      console.error('createOrder error:', err);
      alert('Erro ao registrar pedido. Verifique sua conexão e tente novamente.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleMpPay() {
    if(!orderDone) return;
    if(mpLoading) return; // guard against double-tap creating two MP charges
    setMpLoading(true);
    try {
      const res = await fetch('/api/trpc/shipping.createPayment', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{ orderId: orderDone.id }}),
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
      else { alert('Erro ao gerar link de pagamento. Tente novamente.'); }
    } catch { alert('Erro ao conectar com Mercado Pago. Tente novamente.'); }
    setMpLoading(false);
  }

  // Generates an inline PIX QR code/copy-paste so the customer pays without
  // leaving the page, then polls for confirmation.
  async function handlePixPay() {
    if(!orderDone) return;
    if(pixLoading || pixData) return;
    setPixLoading(true);
    try {
      const res = await fetch('/api/trpc/shipping.createPixPayment', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({json:{ orderId: orderDone.id }}),
      });
      const data = await res.json();
      const result = data?.result?.data?.json;
      if(result?.qrCode) {
        setPixData({ qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64 ?? '' });
        try { (window as any).fbq?.('track','AddPaymentInfo',{ value: orderDone.total, currency: 'BRL', content_name: 'SAL VITA PREMIUM 1kg', content_ids: ['salvita-001'], content_type: 'product' }); } catch {}
        // Poll payment status every 5s — webhook does the actual confirmation;
        // this just lets us reflect it on-screen without a reload.
        pixPollRef.current = setInterval(async () => {
          try {
            const r = await fetch('/api/trpc/shipping.pixStatus', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body:JSON.stringify({json:{ orderId: orderDone.id }}),
            });
            const d = await r.json();
            if(d?.result?.data?.json?.paid) {
              setPixPaid(true);
              if(pixPollRef.current) clearInterval(pixPollRef.current);
              if(!pixPurchaseFiredRef.current) {
                pixPurchaseFiredRef.current = true;
                try {
                  (window as any).fbq?.('track','Purchase',{
                    value: orderDone.total, currency: 'BRL', content_name: 'SAL VITA PREMIUM',
                    content_ids: ['salvita-001'], content_type: 'product',
                  }, { eventID: `purchase-${orderDone.id}` });
                } catch {}
              }
            }
          } catch {}
        }, 5000);
      } else {
        const apiMsg = data?.error?.json?.message ?? data?.error?.message;
        alert(apiMsg ? `Não foi possível gerar o PIX: ${apiMsg}` : 'Erro ao gerar PIX. Tente novamente.');
      }
    } catch { alert('Erro ao conectar com Mercado Pago. Tente novamente.'); }
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

  /* ── Logo real ── */
  const Logo=({size=40,white=false}:{size?:number;white?:boolean})=>(
    <img
      src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
      alt="Sal Vita Premium"
      style={{height:size,width:'auto',objectFit:'contain',filter:white?'brightness(0) invert(1)':'none'}}
    />
  );

  return (
    <>
      {/* ── Social proof toast ── */}
      {spToast && (
        <div style={{
          position:'fixed',bottom:80,left:20,zIndex:99999,
          background:'white',borderRadius:14,padding:'12px 16px',
          boxShadow:'0 8px 32px rgba(0,0,0,.18)',
          display:'flex',alignItems:'center',gap:12,
          maxWidth:300,
          transition:'all .4s cubic-bezier(.34,1.56,.64,1)',
          transform:spToast.visible?'translateY(0) scale(1)':'translateY(20px) scale(.95)',
          opacity:spToast.visible?1:0,
          border:'1px solid rgba(11,29,58,.08)',
        }}>
          <div style={{width:40,height:40,borderRadius:10,background:'linear-gradient(135deg,#0b1d3a,#1a3a6b)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'1.2rem'}}>🧂</div>
          <div>
            <p style={{margin:0,fontWeight:700,fontSize:'.82rem',color:'#0b1d3a'}}>{spToast.name} de {spToast.city}</p>
            <p style={{margin:'2px 0 0',fontSize:'.76rem',color:'#64748b'}}>comprou {spToast.qty} agora</p>
            <p style={{margin:'2px 0 0',fontSize:'.7rem',color:'#94a3b8'}}>há poucos minutos · ✅ Compra confirmada</p>
          </div>
        </div>
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600;1,700&family=Outfit:wght@300;400;500;600;700&display=swap');

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
        @keyframes spin {from{transform:rotate(0deg)} to{transform:rotate(360deg)}}
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

        /* ── product float — removed, static display ── */
        .prod-float{}

        /* ── reveal ── */
        .rev{opacity:0;transform:translateY(30px);transition:opacity .7s ease,transform .7s ease;}
        .rev.on{opacity:1;transform:translateY(0);}
        .d1{transition-delay:.1s}.d2{transition-delay:.22s}.d3{transition-delay:.36s}.d4{transition-delay:.5s}

        /* ── glass card (light) ── */
        .card-light{background:var(--white);border:1px solid rgba(11,29,58,.09);border-radius:18px;box-shadow:0 4px 24px rgba(11,29,58,.06);transition:transform .3s,box-shadow .3s,border-color .3s;}
        .card-light:hover{transform:translateY(-6px);box-shadow:0 16px 48px rgba(11,29,58,.12);border-color:rgba(201,162,39,.3);}

        /* ── price card ── */
        .pc-hi{background:linear-gradient(160deg,#0d1f45 0%,#071628 100%);border:2px solid rgba(201,162,39,.55);box-shadow:0 20px 60px rgba(0,0,0,.45),0 0 0 1px rgba(201,162,39,.1);}
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

        .wa:hover{transform:scale(1.12);box-shadow:0 6px 32px rgba(37,211,102,.6);}

        /* ── hero — imagem de fundo com overlay escuro ── */
        .hero-bg{
          background-image: url('https://salvitarn.com.br/wp-content/uploads/2026/05/Gemini_Generated_Image_z4b5rlz4b5rlz4b5.png');
          background-size: cover;
          background-position: center center;
          background-repeat: no-repeat;
          position:relative; overflow:hidden;
        }
        .hero-overlay{
          position:absolute;inset:0;
          background:linear-gradient(150deg,rgba(7,19,31,.82) 0%,rgba(11,29,58,.75) 50%,rgba(7,19,31,.70) 100%);
          pointer-events:none;
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

        /* ── product img — multiply on pure-white container makes JPEG white bg vanish ── */
        .prod-img{mix-blend-mode:multiply;background:transparent;display:block;}

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
          .hero-grid{grid-template-columns:1fr!important;padding:60px 20px 110px!important;gap:24px!important;}
          .hero-copy{text-align:center;}
          .hero-badges{justify-content:center!important;}
          .hero-btns{justify-content:center!important;}
          .hero-img-wrap{order:-1;}
          .prod-float{width:min(84vw,360px)!important;height:min(84vw,360px)!important;}

          /* Sections */
          .s-pad{padding:64px 20px!important;}
          .story-grid{grid-template-columns:1fr!important;gap:32px!important;}
          .panorama{min-height:460px!important;}
          .crista-section{height:320px!important;}

          /* Benefits / Uses / Pricing grids */
          .ben-grid{grid-template-columns:1fr!important;}
          .use-grid{grid-template-columns:1fr!important;}
          .price-grid{grid-template-columns:1fr!important;}
          .footer-grid{grid-template-columns:1fr!important;gap:28px!important;}

          /* Tables */
          .comp-wrap{font-size:.88rem!important;}
          .comp-wrap th,.comp-wrap td{padding:10px 10px!important;}

          /* Modal — bottom sheet */
          .mo{align-items:flex-end!important;padding:0!important;}
          .mb{border-radius:24px 24px 0 0!important;max-height:88vh!important;padding:20px 20px 32px!important;}
          .mb-drag{display:block!important;}

          /* Drawers */
          .mob-drawer{display:block;}

          /* Sticky bar */
          .sticky-bar{display:flex!important;}

          /* FAQ tap area */
          .faq-border button{padding:18px 0!important;}

          /* Price cards */
          .pc-hi,.pc-lo{padding:28px 22px!important;}

          /* Marquee text */
          .mq-inner span{font-size:.82rem!important;letter-spacing:.1em!important;}

          /* Trust bar — 2 colunas no mobile */
          .trust-inner{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;}
          .trust-inner>div{justify-content:flex-start!important;}

          /* Stats (origem) — 3 colunas compactas */
          .story-stats{gap:20px!important;}
          .story-stats>div{min-width:0!important;}

          /* Cards de credibilidade perto do preço — 2 colunas */
          .cred-wrap{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;}
        }

        /* ── drag handle (modal) ── */
        .mb-drag{display:none;width:40px;height:4px;background:rgba(26,58,138,.15);border-radius:2px;margin:0 auto 16px;}

        /* ── Typography scale-up — mínimo legível em todas as seções ── */
        .eyebrow{font-size:.85rem!important;}
        .ben-cell p{font-size:1rem!important;color:rgba(255,255,255,.62)!important;line-height:1.75!important;}
        .ben-cell h3{font-size:1.45rem!important;}
        .use-row p{font-size:1rem!important;}
        .use-row h3{font-size:1.3rem!important;}
        .faq-ans p{font-size:1rem!important;line-height:1.8!important;}
        .mq-inner span{font-size:.88rem!important;}
        .footer-grid p,.footer-grid li,.footer-grid a{font-size:.95rem!important;}
        .comp-wrap{font-size:.95rem!important;}
        .comp-wrap th{font-size:.82rem!important;}
        .sopt{font-size:1rem!important;}

        /* ══ BENEFITS — dark premium grid ══ */
        .ben-dark-section{
          background:linear-gradient(170deg,#050e1d 0%,#0b1d3a 50%,#071628 100%);
          position:relative;overflow:hidden;
        }
        .ben-dot-grid{
          position:absolute;inset:0;
          background-image:radial-gradient(rgba(201,162,39,.07) 1px,transparent 1px);
          background-size:36px 36px;
          pointer-events:none;
        }
        .ben-glow{
          position:absolute;top:50%;left:50%;
          width:700px;height:700px;
          transform:translate(-50%,-50%);
          background:radial-gradient(ellipse,rgba(201,162,39,.07) 0%,transparent 65%);
          pointer-events:none;
        }
        .ben-table-grid{
          display:grid;
          grid-template-columns:repeat(3,1fr);
          border:1px solid rgba(201,162,39,.18);
          border-radius:20px;
          overflow:hidden;
        }
        .ben-cell{
          padding:48px 40px;
          background:rgba(255,255,255,.025);
          transition:background .35s;
          position:relative;
        }
        .ben-cell:hover{background:rgba(201,162,39,.06);}
        .ben-cell-border-r{border-right:1px solid rgba(201,162,39,.18);}
        .ben-cell-border-b{border-bottom:1px solid rgba(201,162,39,.18);}
        .ben-icon-wrap{
          width:52px;height:52px;border-radius:50%;
          border:1px solid rgba(201,162,39,.45);
          background:rgba(201,162,39,.1);
          display:flex;align-items:center;justify-content:center;
          margin-bottom:28px;
        }
        .ben-num{
          position:absolute;top:20px;right:24px;
          font-family:'Cormorant Garamond',serif;
          font-size:3.5rem;font-weight:700;
          color:rgba(201,162,39,.08);
          line-height:1;pointer-events:none;
          user-select:none;
        }
        @media(max-width:900px){.ben-table-grid{grid-template-columns:repeat(2,1fr)!important;}}
        @media(max-width:600px){.ben-table-grid{grid-template-columns:1fr!important;}
          .ben-cell{padding:32px 24px!important;}
          .ben-cell-border-r{border-right:none!important;border-bottom:1px solid rgba(201,162,39,.18)!important;}
        }

        /* ══ COMO USAR — warm editorial ══ */
        .use-editorial-section{background:#faf5ef;}
        .use-row{
          display:flex;align-items:flex-start;gap:24px;
          padding:32px 0;
          border-bottom:1px solid rgba(11,29,58,.08);
          transition:background .25s;
          border-radius:8px;
        }
        .use-row:last-child{border-bottom:none;}
        .use-big-num{
          font-family:'Cormorant Garamond',serif;
          font-size:4.5rem;font-weight:700;
          color:rgba(201,162,39,.18);
          line-height:1;min-width:72px;
          text-align:right;flex-shrink:0;
          padding-top:4px;
        }
        .use-icon-box{
          width:56px;height:56px;border-radius:14px;
          background:var(--brand);
          display:flex;align-items:center;justify-content:center;
          flex-shrink:0;font-size:1.7rem;
          box-shadow:0 6px 20px rgba(11,29,58,.25);
        }
        .use-2col{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:0 64px;
        }
        @media(max-width:768px){
          .use-2col{grid-template-columns:1fr!important;gap:0!important;}
          .use-big-num{font-size:3rem!important;min-width:48px!important;}
        }

        /* ══ DEPOIMENTOS ══ */
        .testi-section{background:var(--offwhite);}
        .testi-grid{
          display:grid;
          grid-template-columns:repeat(3,1fr);
          gap:24px;
        }
        @media(max-width:900px){.testi-grid{grid-template-columns:repeat(2,1fr)!important;}}
        @media(max-width:600px){.testi-grid{grid-template-columns:1fr!important;}}
        .testi-card{
          background:white;
          border:1px solid rgba(11,29,58,.07);
          border-radius:18px;
          padding:28px 26px;
          box-shadow:0 4px 20px rgba(11,29,58,.04);
          transition:transform .3s,box-shadow .3s;
          display:flex;flex-direction:column;gap:16px;
        }
        .testi-card:hover{transform:translateY(-4px);box-shadow:0 12px 40px rgba(11,29,58,.10);}
        .testi-stars{color:var(--gold);font-size:1rem;letter-spacing:2px;}
        .testi-quote{
          font-family:'Cormorant Garamond',serif;
          font-size:1.05rem;font-style:italic;
          color:var(--mid);line-height:1.7;flex:1;
        }
        .testi-author{display:flex;align-items:center;gap:12px;padding-top:14px;border-top:1px solid rgba(11,29,58,.06);}
        .testi-avatar{
          width:40px;height:40px;border-radius:50%;
          background:linear-gradient(135deg,var(--brand),var(--brand2));
          display:flex;align-items:center;justify-content:center;
          color:white;font-weight:700;font-size:.95rem;flex-shrink:0;
        }
      `}</style>

      <div className="lp">

        {/* ══════ NAV ══════ */}
        <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,transition:'background .4s,box-shadow .4s,padding .3s',background:scrolled||mobileMenu?'rgba(7,22,40,.97)':'transparent',boxShadow:scrolled?'0 2px 32px rgba(0,0,0,.4)':'none',padding:scrolled?'10px 0':'20px 0',backdropFilter:scrolled?'blur(16px)':'none'}}>
          <div style={{maxWidth:1200,margin:'0 auto',padding:'0 20px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <Logo size={44} white={!scrolled&&!mobileMenu?false:false}/>
            <div className="nav-menu" style={{display:'flex',gap:28,alignItems:'center'}}>
              {['Produto','Benefícios','Como Usar','Preço'].map(l=>(
                <a key={l} href={`#${l.toLowerCase().replace('í','i').replace('ç','c')}`} style={{color:'rgba(255,255,255,.7)',fontSize:'.9rem',fontWeight:500,letterSpacing:'.12em',textDecoration:'none',textTransform:'uppercase',transition:'color .2s'}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--gold)'}
                  onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.7)'}>{l}</a>
              ))}
              <button onClick={()=>openBuy(products[0])} style={{background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:8,padding:'10px 22px',fontSize:'.88rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .15s'}}
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
            <button onClick={()=>{ setMobileMenu(false); setTimeout(()=>document.getElementById('preco')?.scrollIntoView({behavior:'smooth'}),100); }} style={{marginTop:24,width:'100%',background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:12,padding:'16px',fontSize:'1rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer'}}>
              Comprar Agora
            </button>
          </div>
        </div>

        {/* ══════ HERO — IMAGEM DE FUNDO ══════ */}
        <section className="hero-bg" style={{minHeight:'100vh',display:'flex',alignItems:'center',paddingTop:80,position:'relative',overflow:'hidden'}}>
          {/* Dark overlay sobre a imagem de fundo */}
          <div className="hero-overlay"/>
          {/* Gold orbs */}
          <div style={{position:'absolute',top:'15%',right:'8%',width:420,height:420,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,.10) 0%,transparent 65%)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:'10%',left:'5%',width:320,height:320,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,.07) 0%,transparent 65%)',pointerEvents:'none'}}/>
          {/* Floating salt particles */}
          {PARTICLES.map(p=>(
            <span key={p.id} className="salt-p" style={{left:p.left,bottom:0,width:p.size,height:p.size,opacity:p.opacity*1.2,animationDuration:p.dur,animationDelay:p.delay}}/>
          ))}

          <div className="hero-grid" style={{maxWidth:1200,margin:'0 auto',padding:'80px 24px 100px',width:'100%',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:60,alignItems:'center',position:'relative',zIndex:2}}>
            {/* Copy */}
            <div className="hero-copy">
              {/* Provenance badge */}
              <div style={{display:'inline-flex',alignItems:'center',gap:10,marginBottom:24,background:'rgba(201,162,39,.12)',border:'1px solid rgba(201,162,39,.3)',borderRadius:999,padding:'7px 18px'}}>
                <span style={{width:6,height:6,borderRadius:'50%',background:'var(--gold)',flexShrink:0,boxShadow:'0 0 8px var(--gold)'}}/>
                <span style={{fontSize:'.84rem',fontWeight:700,letterSpacing:'.18em',color:'var(--gold)',textTransform:'uppercase'}}>Salinas de Mossoró · RN · Brasil</span>
              </div>

              <h1 className="hero-title" style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(3.2rem,8vw,6.5rem)',fontWeight:700,lineHeight:1.0,color:'white',marginBottom:8,textShadow:'0 2px 40px rgba(0,0,0,.3)'}}>
                SAL VITA
              </h1>
              <div style={{fontFamily:"'Great Vibes',cursive",fontSize:'clamp(2.4rem,6vw,4.8rem)',lineHeight:1,marginBottom:0,marginTop:-8}}>
                <span className="shim-blue">Premium</span>
              </div>
              {/* Gold divider */}
              <div style={{width:64,height:1.5,background:'linear-gradient(90deg,var(--gold),var(--goldlt),transparent)',marginBottom:28,marginTop:10}}/>
              <p style={{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:'clamp(1.3rem,3vw,2rem)',fontWeight:400,fontStyle:'italic',color:'rgba(255,255,255,.75)',lineHeight:1.5,marginBottom:36}}>
                "Muito mais sabor,<br/>em cada pitada."
              </p>

              {/* Badges */}
              <div className="hero-badges" style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:44}}>
                {[{e:'✦',t:'+80 Minerais'},{e:'✦',t:'Não Refinado'},{e:'✦',t:'100% Mossoró'},{e:'✦',t:'Zip Lock Premium'}].map(b=>(
                  <span key={b.t} style={{background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.15)',borderRadius:999,padding:'7px 16px',fontSize:'.9rem',fontWeight:500,color:'rgba(255,255,255,.8)',display:'flex',alignItems:'center',gap:7,letterSpacing:'.04em'}}>
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
              {/* Outer gold glow ring */}
              <div style={{position:'absolute',width:560,height:560,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,39,.2) 0%,transparent 68%)',filter:'blur(28px)',pointerEvents:'none'}}/>
              {/* Gold ring border */}
              <div style={{position:'absolute',width:508,height:508,borderRadius:'50%',border:'1.5px solid rgba(201,162,39,.4)',pointerEvents:'none',zIndex:3}}/>
              <div className="prod-float" style={{
                position:'relative',zIndex:2,
                width:480,height:480,borderRadius:'50%',
                background:'#ffffff',
                overflow:'hidden',
                display:'flex',alignItems:'center',justifyContent:'center',
                boxShadow:'0 50px 130px rgba(0,0,0,.65), 0 0 0 10px rgba(201,162,39,.10)',
              }}>
                <img src={IMG.produto} alt="SAL VITA PREMIUM — Sal Integral de Mossoró 1kg" className="prod-img"
                  style={{width:'92%',height:'92%',objectFit:'contain'}}
                  onError={e=>{
                    e.currentTarget.style.display='none';
                    (e.currentTarget.nextElementSibling as HTMLElement).style.display='flex';
                  }}
                />
                <div style={{display:'none',width:'100%',height:'100%',background:'linear-gradient(160deg,#0b1d3a,#071628)',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:28}}>
                  <Logo size={56}/>
                  <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.5rem',fontWeight:700,color:'white',marginTop:12,textAlign:'center'}}>SAL VITA PREMIUM</div>
                  <div style={{fontSize:'.75rem',color:'rgba(255,255,255,.5)'}}>Sal Integral · 1kg · Mossoró RN</div>
                  <div style={{marginTop:16,background:'rgba(201,162,39,.15)',border:'1px solid rgba(201,162,39,.4)',borderRadius:8,padding:'6px 14px',fontSize:'.75rem',color:'var(--gold)',fontWeight:700}}>+80 Minerais Naturais</div>
                </div>
              </div>
              {/* Ground shadow */}
              <div style={{position:'absolute',bottom:-30,left:'50%',transform:'translateX(-50%)',width:280,height:36,background:'rgba(0,0,0,.45)',borderRadius:'50%',filter:'blur(28px)'}}/>
            </div>
          </div>

          {/* Wave */}
          <div className="wave" style={{position:'absolute',bottom:-2,left:0,right:0}}>
            <svg viewBox="0 0 1440 70" preserveAspectRatio="none" style={{width:'100%',height:70}}>
              <path d="M0,35 C360,70 720,0 1080,35 C1260,52 1380,18 1440,35 L1440,70 L0,70 Z" fill="white"/>
            </svg>
          </div>
        </section>

        {/* ══════ PROVA SOCIAL — trust bar ══════ */}
        <div style={{background:'white',borderBottom:'1px solid rgba(11,29,58,.07)',padding:'14px 24px'}}>
          <div className="trust-inner" style={{maxWidth:1100,margin:'0 auto',display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',justifyContent:'center'}}>
            {[
              {icon:'⭐',val:'+120',label:'clientes satisfeitos'},
              {icon:'★',val:'5.0',label:'avaliação média'},
              {icon:'🚚',val:'Todo BR',label:'entregamos para todo o Brasil'},
              {icon:'📄',val:'NF',label:'nota fiscal emitida'},
              {icon:'🔒',val:'Seguro',label:'pagamento 100% seguro'},
              {icon:'📦',val:'Rastreio',label:'envio com rastreamento'},
            ].map(({icon,val,label})=>(
              <div key={label} style={{display:'flex',alignItems:'center',gap:7,padding:'6px 14px',background:'var(--offwhite)',borderRadius:999,border:'1px solid rgba(11,29,58,.07)'}}>
                <span style={{fontSize:'1rem'}}>{icon}</span>
                <span style={{fontWeight:700,color:'var(--brand)',fontSize:'.88rem'}}>{val}</span>
                <span style={{color:'var(--muted)',fontSize:'.82rem'}}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ══════ GARANTIA ══════ */}
        <div style={{background:'#f0fdf4',borderTop:'1px solid #bbf7d0',borderBottom:'1px solid #bbf7d0',padding:'18px 24px'}}>
          <div style={{maxWidth:900,margin:'0 auto',display:'flex',flexWrap:'wrap',gap:16,alignItems:'center',justifyContent:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:52,height:52,borderRadius:'50%',background:'linear-gradient(135deg,#16a34a,#15803d)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
              </div>
              <div>
                <p style={{margin:0,fontWeight:800,fontSize:'1rem',color:'#15803d'}}>Garantia de Satisfação — 7 dias</p>
                <p style={{margin:'2px 0 0',fontSize:'.84rem',color:'#166534'}}>Não gostou? Devolvemos 100% do seu dinheiro sem perguntas.</p>
              </div>
            </div>
            <div style={{display:'flex',gap:20,flexWrap:'wrap',justifyContent:'center'}}>
              {[
                {icon:'🔒',text:'Pagamento 100% seguro'},
                {icon:'📦',text:'Envio com rastreamento'},
                {icon:'🧾',text:'Nota fiscal emitida'},
                {icon:'📱',text:'Suporte via WhatsApp'},
              ].map(({icon,text})=>(
                <div key={text} style={{display:'flex',alignItems:'center',gap:6,fontSize:'.82rem',color:'#166534',fontWeight:500}}>
                  <span>{icon}</span><span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

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
        <section className="panorama" style={{position:'relative',minHeight:600,overflow:'hidden'}}>
          {/* imagem em alta resolução */}
          <div style={{
            position:'absolute',inset:0,
            backgroundImage:`url('${IMG.morrosSal}')`,
            backgroundSize:'cover',
            backgroundPosition:'center 40%',
            backgroundRepeat:'no-repeat',
            filter:'contrast(1.1) saturate(1.12) brightness(1.02)',
          }}/>
          {/* fade fino só no topo e base para blend suave */}
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,white 0%,transparent 7%,transparent 78%,white 100%)'}}/>
          {/* sombra escura na base onde fica o texto */}
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:'35%',background:'linear-gradient(to bottom,transparent,rgba(0,0,0,.55))'}}/>
          <div style={{position:'relative',zIndex:2,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',minHeight:600,padding:'0 24px 52px'}}>
            <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.6rem,4vw,2.8rem)',fontWeight:400,fontStyle:'italic',color:'white',textShadow:'0 2px 24px rgba(0,0,0,.85)',marginBottom:14,textAlign:'center'}}>
              Das maiores salinas do Brasil para a sua mesa
            </p>
            <div style={{display:'inline-flex',alignItems:'center',gap:12,background:'rgba(0,0,0,.38)',backdropFilter:'blur(4px)',borderRadius:40,padding:'7px 20px',border:'1px solid rgba(201,162,39,.35)'}}>
              <span style={{width:22,height:1,background:'rgba(201,162,39,.9)'}}/>
              <p style={{fontSize:'.86rem',fontWeight:700,letterSpacing:'.2em',color:'#f5d060',textTransform:'uppercase',margin:0}}>
                Mossoró · Rio Grande do Norte · Brasil
              </p>
              <span style={{width:22,height:1,background:'rgba(201,162,39,.9)'}}/>
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
              <div className="story-stats" style={{display:'flex',gap:40,flexWrap:'wrap'}}>
                {[['+80','Minerais naturais'],['95%','do sal BR vem do RN'],['Não Refinado','do oceano Atlântico']].map(([n,l])=>(
                  <div key={n}>
                    <div className="shim-blue" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'2.4rem',fontWeight:700}}>{n}</div>
                    <div style={{fontSize:'.87rem',color:'var(--muted)',letterSpacing:'.06em',marginTop:4}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: salina photo card */}
            <div id="story-right" data-reveal className={`rev d2${v('story-right')?' on':''}`} style={{display:'flex',justifyContent:'center'}}>
              <div style={{position:'relative',maxWidth:400,width:'100%',borderRadius:22,overflow:'hidden',boxShadow:'0 24px 64px rgba(26,58,138,.18)'}}>
                <img src={IMG.salina} alt="Salinas de Mossoró" style={{width:'100%',height:400,objectFit:'cover',objectPosition:'center',display:'block'}} loading="lazy"/>
                {/* gradient apenas no rodapé para legibilidade do texto */}
                <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,rgba(15,31,64,.88) 0%,rgba(15,31,64,.25) 45%,transparent 100%)'}}/>
                <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'24px 28px 28px'}}>
                  <div className="shim-blue" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.5rem',fontWeight:700,lineHeight:1}}>+80</div>
                  <p style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.14em',color:'rgba(255,255,255,.65)',textTransform:'uppercase',marginBottom:12}}>Minerais Naturais Preservados</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                    {['Magnésio','Cálcio','Potássio','Ferro','Iodo','Zinco','Manganês','+ outros'].map(m=>(
                      <span key={m} style={{background:'rgba(255,255,255,.15)',border:'1px solid rgba(255,255,255,.25)',borderRadius:999,padding:'3px 10px',fontSize:'.84rem',color:'rgba(255,255,255,.85)'}}>{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ BENEFITS ══════ */}
        <section id="beneficios" className="ben-dark-section" style={{padding:'110px 24px'}}>
          <div className="ben-dot-grid"/>
          <div className="ben-glow"/>
          <div style={{maxWidth:1200,margin:'0 auto',position:'relative',zIndex:1}}>
            <div id="ben-h" data-reveal className={`rev${v('ben-h')?' on':''}`} style={{textAlign:'center',marginBottom:72}}>
              <span style={{display:'inline-block',fontSize:'.84rem',fontWeight:700,letterSpacing:'.24em',color:'var(--gold)',textTransform:'uppercase',marginBottom:16}}>Por que escolher</span>
              <div style={{width:40,height:1,background:'rgba(201,162,39,.45)',margin:'0 auto 24px'}}/>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2.2rem,5vw,4rem)',fontWeight:700,color:'white',lineHeight:1.1}}>
                Feito para quem<br/>valoriza o que come
              </h2>
            </div>
            <div id="ben-g" data-reveal className={`rev ben-table-grid${v('ben-g')?' on':''}`}>
              {[
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,t:'+80 Minerais Naturais',d:'Magnésio, cálcio, potássio, ferro, iodo e mais 75 minerais do oceano Atlântico, todos preservados.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,t:'Sal Não Refinado',d:'Processamento mínimo — lavado e seco ao sol. Nenhum mineral retirado, nenhum aditivo adicionado além do essencial.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,t:'Zip Lock Premium',d:'Fechamento duplo de alta espessura. Abre e fecha centenas de vezes sem perder a vedação. Chega de sal empedrado.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>,t:'Janela Transparente',d:'Circular na frente da embalagem. Você vê o sal a qualquer momento, sem precisar abrir.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>,t:'Seco ao Sol Natural',d:'Secagem 100% natural sob o sol do Nordeste. Sem calor industrial, sem processos que alterem a composição mineral do sal.'},
                {svg:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round"><path d="M2 12c1.5-3 4-4.5 6-4.5s4.5 3 6 3 4.5-1.5 6-4.5"/><path d="M2 18c1.5-3 4-4.5 6-4.5s4.5 3 6 3 4.5-1.5 6-4.5"/></svg>,t:'100% Mossoró RN',d:'Das salinas que produzem 95% do sal marinho brasileiro. Apoio direto à economia do Nordeste.'},
              ].map((b,i)=>(
                <div key={b.t} className={`ben-cell${i%3!==2?' ben-cell-border-r':''}${i<3?' ben-cell-border-b':''}`} style={{transitionDelay:`${i*.08}s`}}>
                  <span className="ben-num">{String(i+1).padStart(2,'0')}</span>
                  <div className="ben-icon-wrap">{b.svg}</div>
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.35rem',fontWeight:700,color:'white',marginBottom:12,lineHeight:1.2}}>{b.t}</h3>
                  <p style={{color:'rgba(255,255,255,.48)',lineHeight:1.75,fontSize:'.875rem'}}>{b.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════ CRISTALIZADOR — full bleed ══════ */}
        <section className="crista-section" style={{position:'relative',height:500,overflow:'hidden'}}>
          <img src={IMG.cristalizador} alt="Processo de cristalização do sal nas salinas de Mossoró" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 40%',display:'block'}} loading="lazy"/>
          {/* overlay mais leve — preserva detalhes visuais da cristalização */}
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,#071628 0%,rgba(7,22,40,0) 14%,rgba(7,22,40,.35) 65%,#faf5ef 100%)'}}/>
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 24px'}}>
            <div style={{textAlign:'center',maxWidth:700}}>
              <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.5rem,4vw,2.8rem)',fontWeight:600,fontStyle:'italic',color:'white',textShadow:'0 2px 24px rgba(0,0,0,.8)',lineHeight:1.3,marginBottom:20}}>
                "Colhido sob o sol nordestino,<br/>cristalizado pelo vento do sertão."
              </p>
              <div style={{display:'inline-flex',alignItems:'center',gap:12}}>
                <span style={{width:40,height:1,background:'rgba(201,162,39,.7)'}}/>
                <span style={{fontSize:'.84rem',fontWeight:700,letterSpacing:'.18em',color:'var(--gold)',textTransform:'uppercase'}}>Processo de Cristalização Natural</span>
                <span style={{width:40,height:1,background:'rgba(201,162,39,.7)'}}/>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ COMO USAR ══════ */}
        <section id="como-usar" className="use-editorial-section" style={{padding:'110px 24px'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div id="use-h" data-reveal className={`rev${v('use-h')?' on':''}`} style={{textAlign:'center',marginBottom:80}}>
              <span style={{display:'inline-block',fontSize:'.84rem',fontWeight:700,letterSpacing:'.24em',color:'var(--brand)',textTransform:'uppercase',opacity:.55,marginBottom:16}}>Use sem moderação</span>
              <div style={{width:40,height:2,background:'linear-gradient(90deg,var(--gold),var(--goldlt))',margin:'0 auto 22px'}}/>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.8rem)',fontWeight:700,color:'var(--text)',marginBottom:18,lineHeight:1.1}}>
                O sal que combina com tudo
              </h2>
              <p style={{color:'var(--muted)',fontSize:'1rem',maxWidth:460,margin:'0 auto',lineHeight:1.7}}>
                Com +80 minerais naturais, cada pitada entrega sabor mais rico — do preparo à finalização.
              </p>
            </div>
            <div id="use-g" data-reveal className={`rev use-2col${v('use-g')?' on':''}`}>
              {USES.map((u,i)=>(
                <div key={u.t} className="use-row" style={{transitionDelay:`${i*.09}s`}}>
                  <span className="use-big-num">{String(i+1).padStart(2,'0')}</span>
                  <div className="use-icon-box">{u.e}</div>
                  <div style={{paddingTop:6}}>
                    <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.25rem',fontWeight:700,color:'var(--brand)',marginBottom:5,lineHeight:1.2}}>{u.t}</h3>
                    <p style={{color:'var(--muted)',fontSize:'.85rem',lineHeight:1.65}}>{u.d}</p>
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
              <p className="eyebrow" style={{color:'var(--brand)'}}>Sal Integral vs Refinado</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.8rem,4vw,3rem)',fontWeight:700,color:'var(--text)'}}>O que o refinamento retira do seu sal?</h2>
              <p style={{color:'var(--muted)',marginTop:12,fontSize:'.95rem',maxWidth:560,margin:'12px auto 0'}}>O processamento industrial elimina minerais essenciais e adiciona químicos para branquear e evitar umidade.</p>
            </div>
            <div id="comp-t" data-reveal className={`rev comp-wrap${v('comp-t')?' on':''}`} style={{overflowX:'auto',borderRadius:16,boxShadow:'0 4px 32px rgba(26,58,138,.08)',background:'white'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.88rem'}}>
                <thead style={{background:'var(--brand)'}}>
                  <tr>
                    <th style={{padding:'14px 18px',textAlign:'left',color:'rgba(255,255,255,.7)',fontWeight:500,fontSize:'.75rem',letterSpacing:'.12em',textTransform:'uppercase'}}>Característica</th>
                    {['SAL VITA PREMIUM','Sal Marinho Comum','Sal Refinado Industrial'].map((b,bi)=>(
                      <th key={b} style={{padding:'14px 18px',textAlign:'center',fontFamily:bi===0?"'Cormorant Garamond',serif":'inherit',fontWeight:bi===0?700:500,fontSize:bi===0?'1rem':'.82rem',color:bi===0?'white':'rgba(255,255,255,.55)'}}>{b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Minerais naturais preservados', '✓ +80 minerais','parcial','✗ removidos'],
                    ['Sem aditivos químicos',         '✓','parcial','✗'],
                    ['Sabor rico e natural',          '✓ intenso','médio','✗ neutro'],
                    ['Não refinado / integral',       '✓','parcial','✗'],
                    ['Não empedra naturalmente',      '✓','✗','✗'],
                    ['Embalagem com zip lock',        '✓ dupla vedação','✗','✗'],
                    ['Origem rastreável',             '✓ Mossoró RN','variada','variada'],
                  ].map(([f,a,b,c],ri)=>(
                    <tr key={f} style={{background:ri%2===0?'var(--offwhite)':'white'}}>
                      <td style={{padding:'13px 18px',color:'var(--mid)',borderBottom:'1px solid rgba(26,58,138,.05)',fontWeight:500}}>{f}</td>
                      {[a,b,c].map((val,ci)=>(
                        <td key={ci} style={{padding:'13px 18px',textAlign:'center',borderBottom:'1px solid rgba(26,58,138,.05)',
                          color:val.startsWith('✓')?'#16a34a':val.startsWith('✗')?'#dc2626':'var(--mid)',
                          fontWeight:ci===0?600:400,
                          fontSize:'.85rem'
                        }}>{val}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ══════ DEPOIMENTOS ══════ */}
        <section className="testi-section s-pad" style={{padding:'90px 24px'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div id="testi-h" data-reveal className={`rev${v('testi-h')?' on':''}`} style={{textAlign:'center',marginBottom:56}}>
              <p className="eyebrow" style={{color:'var(--brand)'}}>Quem já provou</p>
              <div className="gold-line"/>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(1.8rem,4vw,3rem)',fontWeight:700,color:'var(--text)',lineHeight:1.15}}>
                O que nossos clientes dizem
              </h2>
            </div>
            <div id="testi-g" data-reveal className={`rev testi-grid${v('testi-g')?' on':''}`}>
              {TESTIMONIALS.map((t,i)=>(
                <div key={i} className="testi-card" style={{transitionDelay:`${i*.07}s`}}>
                  <div className="testi-stars">{'★'.repeat(t.stars)}</div>
                  <p className="testi-quote">"{t.text}"</p>
                  <div className="testi-author">
                    <div className="testi-avatar">{t.name.charAt(0)}</div>
                    <div>
                      <p style={{fontWeight:700,color:'var(--text)',fontSize:'.95rem',lineHeight:1.2}}>{t.name}</p>
                      <p style={{fontSize:'.84rem',color:'var(--muted)'}}>{t.city}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Rating summary */}
            <div id="testi-r" data-reveal className={`rev${v('testi-r')?' on':''}`} style={{textAlign:'center',marginTop:48,display:'flex',alignItems:'center',justifyContent:'center',gap:16,flexWrap:'wrap'}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.2rem',fontWeight:700,color:'var(--brand)',lineHeight:1}}>5.0</div>
              <div>
                <div style={{color:'var(--gold)',fontSize:'1.2rem',letterSpacing:3}}>★★★★★</div>
                <p style={{fontSize:'.9rem',color:'var(--muted)',marginTop:4}}>Avaliação média · +120 clientes satisfeitos</p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════ PRICING — value built, now reveal prices ══════ */}
        <section id="preco" className="s-brand" style={{padding:'100px 24px'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            <div id="price-h" data-reveal className={`rev${v('price-h')?' on':''}`} style={{textAlign:'center',marginBottom:64}}>
              <p style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.2em',textTransform:'uppercase',color:'rgba(255,255,255,.55)',marginBottom:12}}>Escolha seu pack</p>
              <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'clamp(2rem,5vw,3.5rem)',fontWeight:700,color:'white',marginBottom:10}}>
                Preço justo. Qualidade real.
              </h2>
              <p style={{color:'rgba(255,255,255,.55)',fontSize:'1.05rem'}}>Frete calculado por CEP via Melhor Envio · Enviamos para todo o Brasil</p>
            </div>

            <div id="price-c" data-reveal className={`rev price-grid${v('price-c')?' on':''}`} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:24,maxWidth:1040,margin:'0 auto'}}>
              {products.map(p=>(
                <div key={p.id} className={p.highlight?'pc-hi':'pc-lo'} style={{borderRadius:24,padding:'36px 32px',position:'relative',overflow:'hidden',transition:'transform .3s'}}
                  onMouseEnter={e=>e.currentTarget.style.transform='translateY(-6px)'}
                  onMouseLeave={e=>e.currentTarget.style.transform='translateY(0)'}>
                  {/* tag */}
                  <div style={{position:'absolute',top:0,right:0,background:p.highlight?'var(--gold)':'var(--gold)',color:'var(--navy)',padding:'6px 18px',borderRadius:'0 24px 0 12px',fontSize:'.78rem',fontWeight:800,letterSpacing:'.08em',textTransform:'uppercase'}}>{p.tag}</div>

                  {/* nome e peso */}
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.7rem',fontWeight:700,color:p.highlight?'white':'var(--text)',marginBottom:4,marginTop:8}}>{p.name}</h3>
                  <p style={{fontSize:'.9rem',color:p.highlight?'rgba(255,255,255,.5)':'var(--muted)',marginBottom:20}}>{p.weight}</p>

                  {/* preço — âncora de economia na caixa (loss-aversion) */}
                  {p.highlight&&(
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                      <span style={{fontSize:'1.15rem',textDecoration:'line-through',color:'rgba(255,255,255,.45)'}}>R$ 299,00</span>
                      <span style={{background:'#16a34a',color:'white',fontSize:'.72rem',fontWeight:800,padding:'3px 9px',borderRadius:999,letterSpacing:'.03em'}}>−50% · ECONOMIZE R$ 149,10</span>
                    </div>
                  )}
                  <div style={{marginBottom:4}}>
                    <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'3.4rem',fontWeight:700,color:p.highlight?'var(--gold)':'var(--brand)',lineHeight:1}}>R$ {p.price.toFixed(2).replace('.',',')}</span>
                  </div>
                  <p style={{fontSize:'.9rem',color:p.highlight?'rgba(255,255,255,.45)':'var(--muted)',marginBottom:24}}>R$ {p.pricePerKg.toFixed(2).replace('.',',')}/kg{p.highlight?' · metade do preço por kg':''}</p>

                  {/* features — 4 itens máximo */}
                  <ul style={{listStyle:'none',padding:0,marginBottom:28}}>
                    {(p.highlight
                      ? ['10 embalagens zip lock de 1kg','+80 Minerais Naturais preservados','Sal marinho não refinado de Mossoró','Ideal para casa, churrasco e cozinha']
                      : ['Sal Marinho Não Refinado','+80 Minerais Naturais','Zip lock com janela de visualização','100% Mossoró RN']
                    ).map(f=>(
                      <li key={f} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                        <span style={{color:'var(--gold)',fontSize:'.85rem',flexShrink:0}}>✦</span>
                        <span style={{fontSize:'.95rem',color:p.highlight?'rgba(255,255,255,.8)':'var(--mid)'}}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {p.highlight&&<p style={{fontSize:'.82rem',color:'rgba(255,255,255,.45)',marginBottom:16,display:'flex',alignItems:'center',gap:6}}>🔥 Estoque limitado por lote</p>}

                  <button className="pulse" onClick={()=>openBuy(p)} style={{width:'100%',background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:12,padding:'16px',fontSize:'1rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer',transition:'background .2s,transform .15s'}}
                    onMouseEnter={e=>{e.currentTarget.style.background='#e8bc2a';e.currentTarget.style.transform='scale(1.02)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='var(--gold)';e.currentTarget.style.transform='scale(1)';}}>
                    {p.id==='1kg'?'Comprar 1kg':p.id==='3kg'?'Comprar Trio 3kg':'Comprar Caixa 10kg'}
                  </button>
                </div>
              ))}
            </div>

            {/* Credibilidade perto do preço */}
            <div className="cred-wrap" style={{marginTop:40,display:'flex',flexWrap:'wrap',justifyContent:'center',gap:12}}>
              {[
                {icon:'🚚',t:'Entrega Rastreada',s:'rastreamento em todos os pedidos'},
                {icon:'📄',t:'Nota Fiscal',s:'emitida em todos os pedidos'},
                {icon:'🔒',t:'Pagamento Seguro',s:'PIX, cartão ou boleto'},
                {icon:'📦',t:'Envio em até 2 dias úteis',s:'com rastreamento'},
                {icon:'↩️',t:'Troca garantida',s:'em caso de avaria'},
              ].map(({icon,t,s})=>(
                <div key={t} style={{display:'flex',alignItems:'center',gap:10,background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:12,padding:'12px 16px',minWidth:180}}>
                  <span style={{fontSize:'1.4rem',flexShrink:0}}>{icon}</span>
                  <div>
                    <p style={{color:'white',fontWeight:700,fontSize:'.9rem',lineHeight:1.2}}>{t}</p>
                    <p style={{color:'rgba(255,255,255,.45)',fontSize:'.8rem',marginTop:2}}>{s}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Atacado & Distribuição */}
            <div style={{marginTop:36,maxWidth:820,margin:'36px auto 0',background:'linear-gradient(135deg,rgba(201,162,39,.12) 0%,rgba(201,162,39,.06) 100%)',border:'1px solid rgba(201,162,39,.35)',borderRadius:18,padding:'28px 32px',display:'flex',flexWrap:'wrap',alignItems:'center',gap:24,justifyContent:'space-between'}}>
              <div style={{flex:'1 1 280px'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <span style={{fontSize:'1.5rem'}}>🏭</span>
                  <p style={{fontSize:'.78rem',fontWeight:700,letterSpacing:'.18em',color:'var(--gold)',textTransform:'uppercase'}}>Atacado & Distribuição</p>
                </div>
                <p style={{color:'white',fontWeight:700,fontSize:'1.1rem',lineHeight:1.3,marginBottom:6}}>Compra em grande volume?</p>
                <p style={{color:'rgba(255,255,255,.6)',fontSize:'.9rem',lineHeight:1.6}}>Condições especiais para distribuidores, restaurantes, mercados e compras acima de 50kg. Preço e frete negociados diretamente pelo WhatsApp.</p>
              </div>
              <a href={`https://wa.me/${WA}?text=${encodeURIComponent('Olá! Tenho interesse em compra de grande volume / distribuição do SAL VITA PREMIUM. Podemos conversar sobre condições especiais?')}`} target="_blank" rel="noopener noreferrer"
                style={{display:'inline-flex',alignItems:'center',gap:10,background:'#25D366',color:'white',padding:'14px 24px',borderRadius:12,fontSize:'.95rem',fontWeight:700,textDecoration:'none',whiteSpace:'nowrap',flexShrink:0,transition:'background .2s,transform .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#128C7E';e.currentTarget.style.transform='scale(1.04)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='#25D366';e.currentTarget.style.transform='scale(1)';}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                Consultar pelo WhatsApp
              </a>
            </div>

            {/* Mini objections */}
            <div style={{marginTop:32,background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:16,padding:'24px 28px',maxWidth:680,margin:'32px auto 0'}}>
              <p style={{fontSize:'.82rem',fontWeight:700,letterSpacing:'.18em',color:'rgba(255,255,255,.4)',textTransform:'uppercase',marginBottom:16}}>Dúvidas rápidas</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px 32px'}}>
                {[
                  ['É iodado?','Sim — iodo natural do oceano Atlântico'],
                  ['Empedra?','Não — cristais naturais não endurecem'],
                  ['Granulometria?','Média/grossa, ideal para todo uso'],
                  ['Quanto dura 1kg?','1–2 meses para família de 4 pessoas'],
                  ['Serve para churrasco?','Perfeito — realça o sabor da carne'],
                  ['Tem nota fiscal?','Sim, emitida em todos os pedidos'],
                ].map(([q,a])=>(
                  <div key={q} style={{paddingBottom:8,borderBottom:'1px solid rgba(255,255,255,.07)'}}>
                    <p style={{color:'rgba(255,255,255,.6)',fontSize:'.82rem',marginBottom:2}}>{q}</p>
                    <p style={{color:'white',fontSize:'.9rem',fontWeight:500}}>{a}</p>
                  </div>
                ))}
              </div>
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
                    <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.22rem',fontWeight:700,color:'var(--text)',textAlign:'left'}}>{faq.q}</span>
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

        {/* ══════ FOOTER ══════ */}
        <footer style={{background:'#0a1535',padding:'56px 24px 32px',borderTop:'1px solid rgba(255,255,255,.06)'}}>
          <div style={{maxWidth:1200,margin:'0 auto'}}>
            <div className="footer-grid" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:40,marginBottom:48}}>
              <div>
                <div style={{marginBottom:16}}><Logo size={48} white/></div>
                <p style={{color:'rgba(255,255,255,.38)',fontSize:'.83rem',lineHeight:1.7}}>Sal Marinho Integral Não Refinado. Das salinas de Mossoró, Rio Grande do Norte, para a sua mesa.</p>
                <p style={{color:'rgba(255,255,255,.28)',fontSize:'.78rem',lineHeight:1.75,marginTop:12}}>
                  Av. Industrial Dehuel Vieira Diniz, 505<br/>
                  Monsenhor Américo · Mossoró / RN<br/>
                  CEP 59.613-690<br/>
                  CNPJ 51.422.900/0001-68
                </p>
              </div>
              <div>
                <h4 style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.16em',color:'rgba(255,255,255,.4)',textTransform:'uppercase',marginBottom:16}}>Produto</h4>
                <ul style={{listStyle:'none',padding:0}}>
                  {['1kg — R$ 29,90','Caixa 10kg — R$ 149,90','Frete calculado por CEP','+80 Minerais Naturais','Não Refinado'].map(i=>(
                    <li key={i} style={{color:'rgba(255,255,255,.38)',fontSize:'.83rem',marginBottom:8}}>{i}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.16em',color:'rgba(255,255,255,.4)',textTransform:'uppercase',marginBottom:16}}>Canais de Venda</h4>
                <ul style={{listStyle:'none',padding:0}}>
                  {[{l:'💬 WhatsApp',h:`https://wa.me/${WA}`},{l:'📧 E-mail',h:'mailto:contato@salvitarn.com.br'}].map(lk=>(
                    <li key={lk.l} style={{marginBottom:8}}>
                      <a href={lk.h} target="_blank" rel="noopener noreferrer" style={{color:'rgba(255,255,255,.38)',fontSize:'.83rem',textDecoration:'none',transition:'color .2s'}}
                        onMouseEnter={e=>e.currentTarget.style.color='white'}
                        onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.38)'}>{lk.l}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.16em',color:'rgba(255,255,255,.4)',textTransform:'uppercase',marginBottom:16}}>Fale Conosco</h4>
                <ul style={{listStyle:'none',padding:0,marginBottom:16}}>
                  <li style={{color:'rgba(255,255,255,.55)',fontSize:'.83rem',marginBottom:8}}>
                    <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" style={{color:'rgba(255,255,255,.55)',textDecoration:'none'}}>📞 (84) 2140-8212</a>
                  </li>
                  <li style={{color:'rgba(255,255,255,.55)',fontSize:'.83rem',marginBottom:8}}>
                    <a href="mailto:contato@salvitarn.com.br" style={{color:'rgba(255,255,255,.55)',textDecoration:'none'}}>✉️ contato@salvitarn.com.br</a>
                  </li>
                  <li style={{color:'rgba(255,255,255,.55)',fontSize:'.83rem',marginBottom:16}}>
                    <a href="https://instagram.com/salvitarn" target="_blank" rel="noopener noreferrer" style={{color:'rgba(255,255,255,.55)',textDecoration:'none'}}>📷 @salvitarn</a>
                  </li>
                </ul>
                <a href={`https://wa.me/${WA}`} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:10,background:'#128C7E',color:'white',padding:'12px 20px',borderRadius:10,fontSize:'.83rem',fontWeight:600,textDecoration:'none',transition:'background .2s,transform .2s'}}
                  onMouseEnter={e=>{e.currentTarget.style.background='#25D366';e.currentTarget.style.transform='scale(1.04)';}}
                  onMouseLeave={e=>{e.currentTarget.style.background='#128C7E';e.currentTarget.style.transform='scale(1)';}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Falar no WhatsApp
                </a>
              </div>
            </div>
            <div style={{borderTop:'1px solid rgba(255,255,255,.07)',paddingTop:24,display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:10}}>
              <p style={{color:'rgba(255,255,255,.22)',fontSize:'.9rem'}}>© 2026 SAL VITA · Mossoró, Rio Grande do Norte · CNPJ: 51.422.900/0001-68</p>
              <p style={{color:'rgba(255,255,255,.22)',fontSize:'.9rem'}}>Produto registrado MAPA · Aditivos aprovados ANVISA</p>
            </div>
          </div>
        </footer>
      </div>

      {/* ══════ STICKY BOTTOM CTA (mobile) ══════ */}
      <div className="sticky-bar" style={{gap:10,alignItems:'center'}}>
        <button onClick={()=>{ document.getElementById('preco')?.scrollIntoView({behavior:'smooth'}); }} className="pulse" style={{flex:1,background:'var(--gold)',color:'var(--navy)',border:'none',borderRadius:12,padding:'14px 0',fontSize:'.93rem',fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase',cursor:'pointer'}}>
          Comprar Agora
        </button>
      </div>


      {/* ══════ MODAL ══════ */}
      {/* ══════ CHECKOUT OVERLAY ══════ */}
      {showCheckout&&showModal&&selProd&&selShip&&orderDone&&(()=>{
        const mm=String(Math.floor(payTimer/60)).padStart(2,'0');
        const ss=String(payTimer%60).padStart(2,'0');
        return(
        <div className="mo" style={{zIndex:10000}} onClick={e=>e.target===e.currentTarget&&closeBuy()}>
          <div className="mb" style={{maxWidth:460,padding:0,overflow:'hidden'}}>
            <div className="mb-drag" style={{margin:'0 auto',paddingTop:8}}/>

            {/* urgency bar — countdown reflects real elapsed time since the order
                was created. We never claim the order/reservation "expires": it
                doesn't, payment remains available afterwards (avoids false
                urgency claims). */}
            <div style={{background:payTimer===0?'var(--brand)':payTimer<120?'#dc2626':'#f59e0b',padding:'8px 20px',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
              {payTimer>0
                ? <span style={{color:'white',fontWeight:700,fontSize:'.82rem'}}>⏳ Finalize em <strong>{mm}:{ss}</strong> para garantir o processamento mais rápido</span>
                : <span style={{color:'white',fontWeight:700,fontSize:'.82rem'}}>✅ Pedido #{orderDone.id} continua disponível — finalize o pagamento quando quiser</span>}
            </div>

            <div style={{padding:'20px 24px 24px'}}>
              {/* header */}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
                <div>
                  <p style={{fontSize:'.78rem',fontWeight:700,letterSpacing:'.14em',color:'#16a34a',textTransform:'uppercase',marginBottom:2}}>✅ Pedido #{orderDone.id} confirmado!</p>
                  <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.5rem',fontWeight:700,color:'var(--text)',margin:0}}>Finalize seu pagamento</h3>
                </div>
                <button onClick={closeBuy} style={{background:'var(--sky)',border:'none',borderRadius:8,width:34,height:34,color:'var(--mid)',fontSize:'1.2rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
              </div>

              {/* order summary */}
              <div style={{background:'#f8fafc',borderRadius:10,padding:'12px 14px',marginBottom:16,border:'1px solid #e2e8f0'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'.83rem',color:'var(--muted)',marginBottom:4}}>
                  <span>{selProd.name}</span>
                  <span>R$ {(orderDone.total - (selShip.price)).toFixed(2)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'.83rem',color:'var(--muted)',marginBottom:8}}>
                  <span>Frete ({selShip.service})</span>
                  <span>R$ {selShip.price.toFixed(2)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:'1rem',borderTop:'1px solid #e2e8f0',paddingTop:8}}>
                  <span>Total</span>
                  <span style={{color:'var(--brand)'}}>R$ {orderDone.total.toFixed(2)}</span>
                </div>
              </div>

              {/* CTA buttons / PIX inline flow */}
              {pixPaid ? (
                <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'18px',textAlign:'center'}}>
                  <p style={{fontSize:'1.05rem',fontWeight:800,color:'#16a34a',margin:'0 0 4px'}}>✅ Pagamento confirmado!</p>
                  <p style={{fontSize:'.85rem',color:'var(--muted)',margin:0}}>Recebemos seu PIX. Já estamos preparando seu pedido 🚚</p>
                </div>
              ) : pixData ? (
                <div style={{textAlign:'center'}}>
                  {pixData.qrCodeBase64 && (
                    <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" style={{width:180,height:180,margin:'0 auto 12px',borderRadius:8,border:'1px solid #e2e8f0'}}/>
                  )}
                  <p style={{fontSize:'.82rem',color:'var(--muted)',margin:'0 0 8px'}}>Escaneie o QR Code ou copie o código PIX abaixo:</p>
                  <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:'10px 12px',fontSize:'.7rem',wordBreak:'break-all',color:'var(--muted)',marginBottom:10,maxHeight:70,overflow:'hidden'}}>
                    {pixData.qrCode}
                  </div>
                  <button onClick={copyPixCode}
                    style={{width:'100%',background:pixCopied?'#16a34a':'#009ee3',color:'white',border:'none',borderRadius:12,padding:'14px',fontSize:'.95rem',fontWeight:800,cursor:'pointer',marginBottom:10}}>
                    {pixCopied ? '✅ Código copiado!' : '📋 Copiar código PIX'}
                  </button>
                  <p style={{fontSize:'.78rem',color:'#94a3b8',margin:0,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{animation:'spin 1.4s linear infinite'}}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                    Aguardando confirmação do pagamento...
                  </p>
                </div>
              ) : (
                <>
                  <button onClick={handlePixPay} disabled={pixLoading}
                    style={{width:'100%',background:pixLoading?'#9bb3d0':'#009ee3',color:'white',border:'none',borderRadius:12,padding:'16px',fontSize:'1.05rem',fontWeight:800,cursor:pixLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,transition:'all .2s',boxShadow:pixLoading?'none':'0 4px 14px rgba(0,158,227,.35)',letterSpacing:'.01em',marginBottom:10}}>
                    {pixLoading
                      ? <><svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{animation:'spin 1s linear infinite'}}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Gerando QR Code...</>
                      : <>🔑 Pagar com PIX (instantâneo)</>}
                  </button>
                  <button onClick={handleMpPay} disabled={mpLoading}
                    style={{width:'100%',background:'transparent',color:'var(--brand)',border:'1px solid var(--brand)',borderRadius:12,padding:'14px',fontSize:'.95rem',fontWeight:700,cursor:mpLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:10,opacity:mpLoading?.6:1}}>
                    {mpLoading
                      ? <><svg width="18" height="18" viewBox="0 0 24 24" fill="var(--brand)" style={{animation:'spin 1s linear infinite'}}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>Gerando link seguro...</>
                      : <>💳 Cartão, boleto ou outros (Mercado Pago)</>}
                  </button>
                </>
              )}

              {/* payment methods — purely informational */}
              <div style={{textAlign:'center',marginTop:10}}>
                <p style={{fontSize:'.75rem',color:'#94a3b8',margin:'0 0 4px'}}>Pagamento processado com segurança pelo Mercado Pago</p>
                <p style={{fontSize:'.75rem',color:'#64748b',margin:0}}>💳 Cartão de crédito/débito · PIX · Boleto · Parcelamento 3×</p>
              </div>

              {/* trust badges */}
              <div style={{display:'flex',justifyContent:'center',gap:20,marginTop:14,paddingTop:14,borderTop:'1px solid #f1f5f9'}}>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#16a34a"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                  <span style={{fontSize:'.65rem',color:'#475569',fontWeight:600,textAlign:'center'}}>Compra<br/>Segura</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#16a34a"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
                  <span style={{fontSize:'.65rem',color:'#475569',fontWeight:600,textAlign:'center'}}>Criptografia<br/>SSL</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#009ee3"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
                  <span style={{fontSize:'.65rem',color:'#475569',fontWeight:600,textAlign:'center'}}>Mercado<br/>Pago</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#16a34a"><path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C13 5.06 12.51 5 12 5c-.51 0-1 .06-1.46.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z"/></svg>
                  <span style={{fontSize:'.65rem',color:'#475569',fontWeight:600,textAlign:'center'}}>Entrega<br/>Garantida</span>
                </div>
              </div>

              {/* track link */}
              <p style={{textAlign:'center',fontSize:'.75rem',color:'var(--muted)',marginTop:12}}>
                Após pagar, rastreie em: <a href={`/meu-pedido?pedido=${orderDone.id}&tel=${checkoutForm.customerPhone.replace(/\D/g,'').slice(-4)}`} style={{color:'var(--brand)',fontWeight:600}}>Pedido #{orderDone.id}</a>
              </p>
            </div>
          </div>
        </div>
        );
      })()}

      {showCheckout&&showModal&&selProd&&selShip&&!orderDone&&(
        <div className="mo" style={{zIndex:10000}} onClick={e=>e.target===e.currentTarget&&setShowCheckout(false)}>
          <div className="mb" style={{maxWidth:480}}>
            <div className="mb-drag"/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
              <div>
                <p style={{fontSize:'.84rem',fontWeight:700,letterSpacing:'.16em',color:'var(--brand)',textTransform:'uppercase',marginBottom:4}}>Dados para entrega</p>
                <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.4rem',fontWeight:700,color:'var(--text)'}}>Finalizar Pedido</h3>
                <p style={{color:'var(--muted)',fontSize:'.9rem',marginTop:2}}>{selProd.name} · Frete {selShip.service}: R$ {selShip.price.toFixed(2)}</p>
              </div>
              <button onClick={()=>setShowCheckout(false)} style={{background:'var(--sky)',border:'none',borderRadius:8,width:36,height:36,color:'var(--mid)',fontSize:'1.3rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
            </div>
            <form onSubmit={handleCheckout} style={{display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Nome completo *</label>
                  <input required value={checkoutForm.customerName} onChange={e=>setCheckoutForm(f=>({...f,customerName:e.target.value}))}
                    placeholder="Seu nome completo"
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Telefone/WhatsApp *</label>
                  <input required type="tel" inputMode="numeric" value={checkoutForm.customerPhone} onChange={e=>setCheckoutForm(f=>({...f,customerPhone:maskPhone(e.target.value)}))}
                    placeholder="(84) 99999-9999" minLength={14}
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>E-mail *</label>
                  <input required type="email" autoComplete="email" value={checkoutForm.customerEmail} onChange={e=>setCheckoutForm(f=>({...f,customerEmail:e.target.value}))}
                    placeholder="seuemail@exemplo.com"
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>CPF *</label>
                  <input required type="text" inputMode="numeric" autoComplete="off" value={checkoutForm.customerCpf}
                    onChange={e=>{ const m=maskCpf(e.target.value); setCheckoutForm(f=>({...f,customerCpf:m})); setCpfError(m.replace(/\D/g,'').length===11 && !isValidCpf(m) ? 'CPF inválido' : ''); }}
                    placeholder="000.000.000-00" maxLength={14}
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:`2px solid ${cpfError?'#ef4444':'transparent'}`,borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>{ if(!cpfError) e.currentTarget.style.borderColor='var(--brand)'; }}
                    onBlur={e=>{ if(!cpfError) e.currentTarget.style.borderColor='transparent'; }}/>
                  {cpfError && <p style={{fontSize:'.78rem',color:'#ef4444',margin:'4px 0 0',fontWeight:600}}>{cpfError}</p>}
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>CEP *</label>
                  <input required value={checkoutForm.postalCode} onChange={e=>setCheckoutForm(f=>({...f,postalCode:e.target.value.replace(/\D/g,'').slice(0,8)}))}
                    placeholder="00000000" minLength={8} maxLength={8}
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div style={{gridColumn:'1/-1'}}>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Endereço (rua/av.) *</label>
                  <input required value={checkoutForm.address} onChange={e=>setCheckoutForm(f=>({...f,address:e.target.value}))}
                    placeholder="Rua / Avenida"
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Número *</label>
                  <input required value={checkoutForm.number} onChange={e=>setCheckoutForm(f=>({...f,number:e.target.value}))}
                    placeholder="123"
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Complemento</label>
                  <input value={checkoutForm.complement} onChange={e=>setCheckoutForm(f=>({...f,complement:e.target.value}))}
                    placeholder="Apto, bloco..."
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Bairro *</label>
                  <input required value={checkoutForm.neighborhood} onChange={e=>setCheckoutForm(f=>({...f,neighborhood:e.target.value}))}
                    placeholder="Bairro"
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Cidade *</label>
                  <input required value={checkoutForm.city} onChange={e=>setCheckoutForm(f=>({...f,city:e.target.value}))}
                    placeholder="Cidade"
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
                <div>
                  <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>Estado *</label>
                  <input required value={checkoutForm.state} onChange={e=>setCheckoutForm(f=>({...f,state:e.target.value.toUpperCase().slice(0,2)}))}
                    placeholder="UF" maxLength={2}
                    style={{width:'100%',boxSizing:'border-box',background:'var(--offwhite)',border:'2px solid transparent',borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',transition:'border-color .2s'}}
                    onFocus={e=>e.currentTarget.style.borderColor='var(--brand)'}
                    onBlur={e=>e.currentTarget.style.borderColor='transparent'}/>
                </div>
              </div>
              {/* Coupon field */}
              <div style={{marginTop:4}}>
                <label style={{display:'block',fontSize:'.8rem',fontWeight:700,color:'var(--mid)',marginBottom:5,textTransform:'uppercase',letterSpacing:'.08em'}}>🎁 Cupom de desconto</label>
                <div style={{display:'flex',gap:8}}>
                  <input
                    type="text" value={couponCode}
                    onChange={e=>{ setCouponCode(e.target.value.toUpperCase()); setCouponState(null); }}
                    placeholder="Ex: VOLTA10"
                    style={{flex:1,background:'var(--offwhite)',border:`2px solid ${couponState?.valid?'#16a34a':couponState?.valid===false?'#ef4444':'transparent'}`,borderRadius:10,padding:'11px 14px',fontSize:'.95rem',outline:'none',fontFamily:'monospace',letterSpacing:'.1em'}}
                  />
                  <button type="button"
                    onClick={()=>validateCoupon(couponCode, selProd.price)}
                    disabled={!couponCode.trim() || couponLoading}
                    style={{padding:'0 16px',background:'var(--brand)',color:'white',border:'none',borderRadius:10,fontSize:'.85rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
                    {couponLoading?'...':'Aplicar'}
                  </button>
                </div>
                {couponState && (
                  <p style={{fontSize:'.82rem',margin:'6px 0 0',fontWeight:600,color:couponState.valid?'#16a34a':'#ef4444'}}>
                    {couponState.message}
                  </p>
                )}
              </div>
              {/* Order summary */}
              <div style={{background:'var(--sky)',borderRadius:10,padding:'12px 16px',marginTop:4}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:'.9rem',color:'var(--muted)'}}>Produto</span>
                  <span style={{fontSize:'.9rem',color:'var(--mid)'}}>R$ {(selProd.price).toFixed(2)}</span>
                </div>
                {couponState?.valid && couponState.discountValue && (
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:'.9rem',color:'#16a34a',fontWeight:600}}>🎁 Desconto {couponCode}</span>
                    <span style={{fontSize:'.9rem',color:'#16a34a',fontWeight:700}}>
                      -{couponState.discountType==='percent'
                        ? `R$ ${((selProd.price)*couponState.discountValue/100).toFixed(2)}`
                        : `R$ ${couponState.discountValue.toFixed(2)}`}
                    </span>
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:'.9rem',color:'var(--muted)'}}>Frete {selShip.service}</span>
                  <span style={{fontSize:'.9rem',color:'var(--mid)'}}>R$ {selShip.price.toFixed(2)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,borderTop:'1px solid rgba(26,58,138,.1)'}}>
                  <span style={{fontWeight:700,color:'var(--text)'}}>Total</span>
                  <span style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.3rem',fontWeight:700,color:'var(--brand)'}}>
                    {(() => {
                      let subtotal = selProd.price;
                      if (couponState?.valid && couponState.discountValue) {
                        const disc = couponState.discountType==='percent'
                          ? subtotal*couponState.discountValue/100
                          : couponState.discountValue;
                        subtotal = Math.max(0, subtotal - disc);
                      }
                      return `R$ ${(subtotal+selShip.price).toFixed(2).replace('.',',')}`;
                    })()}
                  </span>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 12px'}}>
                <span style={{fontSize:'1.1rem'}}>🛡️</span>
                <span style={{fontSize:'.82rem',color:'#15803d',fontWeight:600,lineHeight:1.4}}>Garantia de 7 dias — não gostou, devolvemos 100%. Pague em segundos no PIX.</span>
              </div>
              <p style={{fontSize:'.82rem',color:'var(--muted)',lineHeight:1.5}}>Após confirmar, você será redirecionado para o Mercado Pago para pagar com cartão, PIX ou boleto.</p>
              <div style={{display:'flex',gap:10}}>
                <button type="button" onClick={()=>setShowCheckout(false)}
                  style={{flex:'0 0 auto',background:'var(--sky)',color:'var(--mid)',border:'none',borderRadius:10,padding:'14px 20px',fontSize:'.9rem',fontWeight:600,cursor:'pointer'}}>
                  ← Voltar
                </button>
                <button type="submit" disabled={checkoutLoading}
                  style={{flex:1,background:checkoutLoading?'#9bb3d0':'var(--brand)',color:'white',border:'none',borderRadius:10,padding:'14px',fontSize:'.95rem',fontWeight:700,cursor:checkoutLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8,transition:'background .2s'}}>
                  {checkoutLoading ? 'Registrando pedido...' : 'Confirmar e Escolher Pagamento →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal&&selProd&&(
        <div className="mo" onClick={e=>e.target===e.currentTarget&&closeBuy()}>
          <div className="mb">
            <div className="mb-drag"/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:22}}>
              <div>
                <p style={{fontSize:'.84rem',fontWeight:700,letterSpacing:'.16em',color:'var(--brand)',textTransform:'uppercase',marginBottom:4}}>Calcule o Frete</p>
                <h3 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.55rem',fontWeight:700,color:'var(--text)'}}>{selProd.name}</h3>
                <p style={{color:'var(--muted)',fontSize:'.95rem'}}>{selProd.weight}</p>
              </div>
              <button onClick={closeBuy} style={{background:'var(--sky)',border:'none',borderRadius:8,width:36,height:36,color:'var(--mid)',fontSize:'1.3rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>×</button>
            </div>
            <div style={{background:'var(--sky)',borderRadius:12,padding:'16px 20px',marginBottom:20,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <p style={{fontSize:'.9rem',color:'var(--muted)',marginBottom:2}}>Subtotal</p>
                <p style={{fontFamily:"'Cormorant Garamond',serif",fontSize:'1.9rem',fontWeight:700,color:'var(--brand)'}}>R$ {selProd.price.toFixed(2).replace('.',',')}</p>
              </div>
              <div style={{textAlign:'right'}}>
                <p style={{fontSize:'.87rem',color:'var(--muted)'}}>Peso aprox.</p>
                <p style={{fontSize:'.93rem',color:'var(--mid)',fontWeight:500}}>{selProd.weightKg}kg</p>
              </div>
            </div>
            <div style={{marginBottom:18}}>
              <label style={{display:'block',fontSize:'.9rem',fontWeight:700,letterSpacing:'.1em',color:'var(--mid)',textTransform:'uppercase',marginBottom:8}}>Seu CEP de entrega</label>
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
              <a href="https://buscacepinter.correios.com.br/" target="_blank" rel="noopener noreferrer" style={{fontSize:'.87rem',color:'var(--muted)',textDecoration:'none',display:'inline-block',marginTop:6}}>Não sei meu CEP →</a>
            </div>

            {cepData&&(
              <div>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,padding:'9px 14px',background:'#f0fdf4',borderRadius:8,border:'1px solid #bbf7d0'}}>
                  <span style={{color:'#16a34a'}}>✓</span>
                  <p style={{fontSize:'.84rem',color:'#166534'}}>{cepData.localidade} — {cepData.uf}{cepData.bairro?` · ${cepData.bairro}`:''}</p>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <p style={{fontSize:'.85rem',fontWeight:700,letterSpacing:'.1em',color:'var(--muted)',textTransform:'uppercase',margin:0}}>Opções de frete:</p>
                  {shippingSource==='api'
                    ? <span style={{fontSize:'.75rem',background:'#dcfce7',color:'#15803d',padding:'2px 8px',borderRadius:99,fontWeight:600}}>✓ Via Melhor Envio</span>
                    : <span style={{fontSize:'.75rem',background:'#fef9c3',color:'#854d0e',padding:'2px 8px',borderRadius:99,fontWeight:600}}>Estimativa</span>
                  }
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:18}}>
                  {shipping.map(opt=>(
                    <div key={opt.service} className={`sopt${selShip?.service===opt.service?' sel':''}`} onClick={()=>setSelShip(opt)}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{display:'flex',alignItems:'center',gap:12}}>
                          <span style={{fontSize:'1.4rem'}}>{opt.icon}</span>
                          <div>
                            <p style={{fontWeight:700,color:'var(--text)',fontSize:'.93rem'}}>{opt.service}</p>
                            <p style={{fontSize:'.88rem',color:'var(--muted)'}}>{opt.description} · {opt.days}</p>
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
                        <span style={{fontSize:'.95rem',color:'var(--muted)'}}>{l}</span>
                        <span style={{fontSize:'.95rem',color:'var(--mid)'}}>R$ {Number(val).toFixed(2).replace('.',',')}</span>
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
              <button onClick={()=>{ setShowCheckout(true); try { (window as any).fbq?.('track','InitiateCheckout',{ content_name: 'SAL VITA PREMIUM 1kg', content_ids: ['salvita-001'], value: selProd?.price, currency: 'BRL', num_items: 1 }); } catch {} }}
                style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10,background:'var(--brand)',color:'white',border:'none',borderRadius:12,padding:'16px',fontSize:'.93rem',fontWeight:700,cursor:'pointer',letterSpacing:'.04em',transition:'background .2s,transform .2s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='#1a4aad';e.currentTarget.style.transform='scale(1.02)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--brand)';e.currentTarget.style.transform='scale(1)';}}>
                🛒 Comprar Agora
              </button>
            </div>
            <p style={{marginTop:14,fontSize:'.84rem',color:'var(--muted)',textAlign:'center',lineHeight:1.5}}>Frete calculado via Melhor Envio · Enviamos para todo o Brasil</p>
          </div>
        </div>
      )}
    </>
  );
}
