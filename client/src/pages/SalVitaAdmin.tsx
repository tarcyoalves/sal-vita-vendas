import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../_core/hooks/useAuth';
import { useLocation } from 'wouter';

/* ── Status helpers ──────────────────────────────────────── */
const S_LABEL: Record<string, string> = {
  pending:'Pendente', confirmed:'Confirmado', shipped:'Enviado',
  delivered:'Entregue', cancelled:'Cancelado', label_generated:'Etiqueta Gerada',
};
const S_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  pending:         { bg:'#fef9c3', text:'#854d0e', dot:'#eab308' },
  confirmed:       { bg:'#dbeafe', text:'#1e40af', dot:'#3b82f6' },
  label_generated: { bg:'#ede9fe', text:'#5b21b6', dot:'#8b5cf6' },
  shipped:         { bg:'#dcfce7', text:'#166534', dot:'#22c55e' },
  delivered:       { bg:'#d1fae5', text:'#065f46', dot:'#10b981' },
  cancelled:       { bg:'#fee2e2', text:'#991b1b', dot:'#ef4444' },
};
const P_LABEL: Record<string, string> = { awaiting:'Aguard. Pgto', confirmed:'Pago ✓', failed:'Falhou' };
const P_COLOR: Record<string, { bg: string; text: string }> = {
  awaiting: { bg:'#fef3c7', text:'#92400e' },
  confirmed:{ bg:'#d1fae5', text:'#065f46' },
  failed:   { bg:'#fee2e2', text:'#991b1b' },
};

type FilterTab = 'all' | 'awaiting' | 'confirmed' | 'toship' | 'shipped';

/* ── Login ────────────────────────────────────────────────── */
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const loginMut = trpc.auth.login.useMutation();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await loginMut.mutateAsync({ email, password });
      window.location.reload();
    } catch (err: any) {
      toast.error(err?.message ?? 'Credenciais inválidas');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0b1d3a 0%,#1a3a6b 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'white', borderRadius:24, boxShadow:'0 25px 60px rgba(0,0,0,.3)', padding:'40px 36px', width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height:56, width:'auto', marginBottom:12 }}>
            <defs><clipPath id="oval-adm"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="white"/>
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#0C3680" clipPath="url(#oval-adm)"/>
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="#0C3680">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="#0C3680" strokeWidth="15"/>
          </svg>
          <h1 style={{ fontSize:'1.25rem', fontWeight:800, color:'#0b1d3a', margin:0 }}>Gestão de Pedidos</h1>
          <p style={{ fontSize:'.85rem', color:'#94a3b8', marginTop:4 }}>premium.salvitarn.com.br</p>
        </div>
        <form onSubmit={handle} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ display:'block', fontSize:'.78rem', fontWeight:600, color:'#64748b', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>E-mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="admin@salvitarn.com.br"
              style={{ width:'100%', boxSizing:'border-box', padding:'11px 14px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:'.95rem', outline:'none' }}/>
          </div>
          <div>
            <label style={{ display:'block', fontSize:'.78rem', fontWeight:600, color:'#64748b', marginBottom:5, textTransform:'uppercase', letterSpacing:'.05em' }}>Senha</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••"
              style={{ width:'100%', boxSizing:'border-box', padding:'11px 14px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:'.95rem', outline:'none' }}/>
          </div>
          <button type="submit" disabled={loading}
            style={{ marginTop:4, padding:'13px', background:loading?'#94a3b8':'#0b1d3a', color:'white', border:'none', borderRadius:12, fontWeight:700, fontSize:'.95rem', cursor:loading?'not-allowed':'pointer' }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Badge ────────────────────────────────────────────────── */
function Badge({ label, bg, text }: { label:string; bg:string; text:string }) {
  return <span style={{ background:bg, color:text, borderRadius:999, padding:'2px 9px', fontSize:'.72rem', fontWeight:700, whiteSpace:'nowrap' }}>{label}</span>;
}

/* ── KPI Card ─────────────────────────────────────────────── */
function KpiCard({ icon, label, value, sub, accent, urgent }: { icon:string; label:string; value:string|number; sub?:string; accent:string; urgent?:boolean }) {
  return (
    <div style={{ background:urgent?`${accent}10`:'white', border:`1.5px solid ${urgent?accent:'#e2e8f0'}`, borderRadius:16, padding:'18px 20px', position:'relative', overflow:'hidden' }}>
      {urgent && <div style={{ position:'absolute', top:10, right:12, width:8, height:8, borderRadius:'50%', background:accent, boxShadow:`0 0 0 3px ${accent}30`, animation:'pulse 2s infinite' }}/>}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
        <div style={{ width:38, height:38, borderRadius:10, background:`${accent}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.1rem' }}>{icon}</div>
        <span style={{ fontSize:'.78rem', fontWeight:600, color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</span>
      </div>
      <p style={{ fontSize:'1.7rem', fontWeight:800, color:urgent?accent:'#0b1d3a', margin:0, lineHeight:1 }}>{value}</p>
      {sub && <p style={{ fontSize:'.75rem', color:'#94a3b8', margin:'4px 0 0' }}>{sub}</p>}
    </div>
  );
}

const inputStyle: React.CSSProperties = { width:'100%', boxSizing:'border-box', padding:'9px 12px', border:'1.5px solid #e2e8f0', borderRadius:9, fontSize:'.88rem', outline:'none', fontFamily:'inherit' };
const labelStyle: React.CSSProperties = { display:'block', fontSize:'.72rem', fontWeight:700, color:'#64748b', marginBottom:4, textTransform:'uppercase', letterSpacing:'.05em' };

/* ── Edit Modal ───────────────────────────────────────────── */
function EditModal({ order, onClose, onSaved }: { order: any; onClose: ()=>void; onSaved: ()=>void }) {
  const [form, setForm] = useState({
    customerName: order.customerName ?? '',
    customerPhone: order.customerPhone ?? '',
    customerEmail: order.customerEmail ?? '',
    customerCpf: order.customerCpf ?? '',
    address: order.address ?? '',
    number: order.number ?? '',
    complement: order.complement ?? '',
    neighborhood: order.neighborhood ?? '',
    city: order.city ?? '',
    state: order.state ?? '',
    postalCode: order.postalCode ?? '',
    notes: order.notes ?? '',
  });
  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));
  const updateMut = trpc.shipping.updateOrder.useMutation({
    onSuccess: () => { toast.success('Pedido atualizado!'); onSaved(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'white', borderRadius:20, padding:24, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 25px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h3 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0b1d3a' }}>✏️ Editar Pedido #{order.id}</h3>
          <button onClick={onClose} style={{ background:'#f1f5f9', border:'none', borderRadius:8, width:32, height:32, cursor:'pointer', fontSize:'1.1rem', color:'#64748b' }}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelStyle}>Nome completo</label>
            <input value={form.customerName} onChange={set('customerName')} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Telefone</label>
            <input value={form.customerPhone} onChange={set('customerPhone')} placeholder="(84) 99999-9999" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>CPF</label>
            <input value={form.customerCpf} onChange={set('customerCpf')} placeholder="000.000.000-00" style={inputStyle}/>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelStyle}>E-mail</label>
            <input value={form.customerEmail} onChange={set('customerEmail')} placeholder="cliente@email.com" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>CEP</label>
            <input value={form.postalCode} onChange={set('postalCode')} placeholder="59000000" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Estado (UF)</label>
            <input value={form.state} onChange={set('state')} placeholder="RN" maxLength={2} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Cidade</label>
            <input value={form.city} onChange={set('city')} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Bairro</label>
            <input value={form.neighborhood} onChange={set('neighborhood')} style={inputStyle}/>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelStyle}>Endereço</label>
            <input value={form.address} onChange={set('address')} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Número</label>
            <input value={form.number} onChange={set('number')} placeholder="123" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Complemento</label>
            <input value={form.complement} onChange={set('complement')} placeholder="Casa, Apto..." style={inputStyle}/>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelStyle}>Observações internas</label>
            <input value={form.notes} onChange={set('notes')} style={inputStyle}/>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:20 }}>
          <button onClick={onClose} style={{ flex:1, padding:'11px', background:'#f1f5f9', border:'none', borderRadius:12, fontWeight:600, cursor:'pointer', color:'#64748b' }}>Cancelar</button>
          <button onClick={()=>updateMut.mutate({ id:order.id, ...form })} disabled={updateMut.isPending}
            style={{ flex:2, padding:'11px', background:'#0b1d3a', color:'white', border:'none', borderRadius:12, fontWeight:700, cursor:'pointer', opacity:updateMut.isPending?0.7:1 }}>
            {updateMut.isPending ? 'Salvando...' : '💾 Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Order Card ───────────────────────────────────────────── */
function OrderCard({ order, onRefetch }: { order: any; onRefetch: ()=>void }) {
  const [trackInput, setTrackInput] = useState(order.trackingCode ?? '');
  const [editing, setEditing] = useState(false);
  const updateMut = trpc.shipping.updateStatus.useMutation({ onSuccess: ()=>{ onRefetch(); toast.success('Status atualizado!'); } });
  const labelMut = trpc.shipping.generateLabel.useMutation({
    onSuccess: (d) => { toast.success('Etiqueta gerada!'); window.open(d.labelUrl, '_blank'); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });
  const trackMut = trpc.shipping.updateTracking.useMutation({
    onSuccess: () => { onRefetch(); toast.success('Rastreio salvo!'); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMut = trpc.shipping.cancelOrder.useMutation({
    onSuccess: (d) => { toast.success(d.actions.join(' · ')); onRefetch(); },
    onError: (e) => toast.error(e.message),
  });

  const sColor = S_COLOR[order.status] ?? { bg:'#f1f5f9', text:'#475569', dot:'#94a3b8' };
  const pColor = P_COLOR[order.paymentStatus] ?? { bg:'#f1f5f9', text:'#475569' };
  const isUrgent = order.paymentStatus === 'confirmed' && !['shipped','delivered','cancelled'].includes(order.status);
  const date = new Date(order.createdAt);

  return (
    <div style={{ background:'white', borderRadius:16, border:`1.5px solid ${isUrgent?'#bfdbfe':'#e2e8f0'}`, overflow:'hidden', boxShadow: isUrgent?'0 0 0 3px #dbeafe':'none' }}>
      {/* Left accent bar */}
      <div style={{ height:4, background: order.paymentStatus==='confirmed'?'linear-gradient(90deg,#22c55e,#16a34a)': order.paymentStatus==='awaiting'?'linear-gradient(90deg,#f59e0b,#d97706)': 'linear-gradient(90deg,#ef4444,#dc2626)' }}/>

      <div style={{ padding:'16px 18px' }}>
        {/* Header row */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontWeight:800, fontSize:'1rem', color:'#0b1d3a' }}>#{order.id} — {order.customerName}</span>
              <Badge label={P_LABEL[order.paymentStatus]??order.paymentStatus} bg={pColor.bg} text={pColor.text}/>
              <Badge label={S_LABEL[order.status]??order.status} bg={sColor.bg} text={sColor.text}/>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 16px', fontSize:'.82rem', color:'#64748b' }}>
              <span>📞 {order.customerPhone}</span>
              <span>🗓️ {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
              {order.customerEmail && <span>✉️ {order.customerEmail}</span>}
              {(order as any).customerCpf && <span>🪪 {(order as any).customerCpf}</span>}
            </div>
            <div style={{ fontSize:'.82rem', color:'#94a3b8' }}>
              📍 {order.address}, {order.number}{order.complement?` (${order.complement})`:''} — {order.neighborhood}, {order.city}/{order.state} · CEP {order.postalCode}
            </div>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <p style={{ fontSize:'1.25rem', fontWeight:800, color:'#0b1d3a', margin:0 }}>R$ {parseFloat(order.totalPrice??'0').toFixed(2).replace('.',',')}</p>
            <div style={{ marginTop:4, background:'linear-gradient(135deg,#f0f9ff,#e0f2fe)', border:'1px solid #bae6fd', borderRadius:8, padding:'4px 10px', display:'inline-block' }}>
              <span style={{ fontSize:'.85rem', fontWeight:700, color:'#0369a1' }}>🧂 {order.quantity}× Sal Marinho Integral 1kg</span>
            </div>
            <p style={{ fontSize:'.72rem', color:'#94a3b8', margin:'3px 0 0' }}>
              {order.shippingServiceName??'Correios'}: R$ {parseFloat(order.shippingPrice??'0').toFixed(2).replace('.',',')}
              {(order as any).couponCode && <span style={{ marginLeft:6, color:'#16a34a', fontWeight:700 }}>🎁 {(order as any).couponCode}</span>}
              {(order as any).couponDiscount && <span style={{ marginLeft:4, color:'#16a34a' }}>-R$ {parseFloat((order as any).couponDiscount).toFixed(2).replace('.',',')}</span>}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12, paddingTop:12, borderTop:'1px solid #f1f5f9' }}>
          {order.paymentStatus === 'awaiting' && order.status !== 'cancelled' && (
            <button onClick={()=>{ updateMut.mutate({ id:order.id, paymentStatus:'confirmed', status:'confirmed' }); toast.success('Pagamento confirmado manualmente!'); }}
              disabled={updateMut.isPending}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#16a34a', color:'white', border:'none', borderRadius:10, fontSize:'.83rem', fontWeight:700, cursor:'pointer' }}>
              ✓ Confirmar Pgto (manual)
            </button>
          )}
          {order.paymentStatus === 'confirmed' && !order.meLabelUrl && order.status !== 'cancelled' && (
            <button onClick={()=>labelMut.mutate({ orderId:order.id })}
              disabled={labelMut.isPending && labelMut.variables?.orderId===order.id}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#2563eb', color:'white', border:'none', borderRadius:10, fontSize:'.83rem', fontWeight:700, cursor:'pointer' }}>
              🖨️ {labelMut.isPending && labelMut.variables?.orderId===order.id ? 'Gerando...' : 'Gerar Etiqueta ME'}
            </button>
          )}
          {order.meLabelUrl && (
            <a href={order.meLabelUrl} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#ede9fe', color:'#5b21b6', border:'1px solid #c4b5fd', borderRadius:10, fontSize:'.83rem', fontWeight:700, textDecoration:'none' }}>
              📄 Imprimir Etiqueta
            </a>
          )}
          {order.status === 'label_generated' && order.paymentStatus === 'confirmed' && (
            <button onClick={()=>updateMut.mutate({ id:order.id, status:'shipped' })} disabled={updateMut.isPending}
              style={{ padding:'8px 14px', background:'#0891b2', color:'white', border:'none', borderRadius:10, fontSize:'.83rem', fontWeight:700, cursor:'pointer' }}>
              🚚 Marcar Enviado
            </button>
          )}
          {order.status === 'shipped' && (
            <button onClick={()=>updateMut.mutate({ id:order.id, status:'delivered' })} disabled={updateMut.isPending}
              style={{ padding:'8px 14px', background:'#059669', color:'white', border:'none', borderRadius:10, fontSize:'.83rem', fontWeight:700, cursor:'pointer' }}>
              🎉 Marcar Entregue
            </button>
          )}
          {order.trackingCode && (
            <a href={`https://wa.me/${order.customerPhone.replace(/\D/g,'')}?text=${encodeURIComponent(`🧂 *Sal Vita — Pedido #${order.id}*\n\nOlá ${order.customerName}! Seu pedido foi enviado! 🚚\n\n📦 Código de rastreio: *${order.trackingCode}*\n\n🔗 Rastreie: https://rastreamento.correios.com.br/app/index.php?objetos=${order.trackingCode}\n\nOu acesse: https://premium.salvitarn.com.br/meu-pedido\nPedido: ${order.id}\n\nObrigado! 🙏`)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'#22c55e', color:'white', borderRadius:10, fontSize:'.83rem', fontWeight:700, textDecoration:'none' }}>
              📱 Notificar WhatsApp
            </a>
          )}
          {order.status !== 'cancelled' && order.status !== 'delivered' && (
            <button onClick={()=>{ if(window.confirm(`Cancelar pedido #${order.id}?`)) cancelMut.mutate({ id:order.id }); }}
              disabled={cancelMut.isPending && cancelMut.variables?.id===order.id}
              style={{ padding:'8px 14px', background:'white', color:'#ef4444', border:'1.5px solid #fecaca', borderRadius:10, fontSize:'.83rem', fontWeight:700, cursor:'pointer' }}>
              ✕ Cancelar
            </button>
          )}
        </div>

        {/* Tracking input */}
        {['confirmed','label_generated'].includes(order.status) && order.paymentStatus === 'confirmed' && (
          <div style={{ display:'flex', gap:8, marginTop:10 }}>
            <input value={trackInput} onChange={e=>setTrackInput(e.target.value)}
              placeholder="Código rastreio Correios (ex: AA123456789BR)"
              style={{ flex:1, padding:'9px 12px', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:'.85rem', outline:'none' }}/>
            <button onClick={()=>{ const c=trackInput.trim(); if(c){ trackMut.mutate({ id:order.id, trackingCode:c }); if(order.status==='label_generated') updateMut.mutate({ id:order.id, status:'shipped' }); }}}
              disabled={!trackInput.trim()}
              style={{ padding:'9px 16px', background:'#16a34a', color:'white', border:'none', borderRadius:10, fontSize:'.83rem', fontWeight:700, cursor:'pointer', opacity:trackInput.trim()?1:.4 }}>
              💾 Salvar & Enviado
            </button>
          </div>
        )}

            <button onClick={()=>setEditing(true)}
            style={{ padding:'8px 14px', background:'white', color:'#475569', border:'1.5px solid #e2e8f0', borderRadius:10, fontSize:'.83rem', fontWeight:600, cursor:'pointer' }}>
            ✏️ Editar
          </button>

        {order.meOrderId && <p style={{ margin:'6px 0 0', fontSize:'.72rem', color:'#cbd5e1' }}>ME ID: {order.meOrderId}{order.trackingCode ? ` · Rastreio: ${order.trackingCode}` : ''}</p>}
      </div>
      {editing && <EditModal order={order} onClose={()=>setEditing(false)} onSaved={onRefetch}/>}
    </div>
  );
}

/* ── AI Panel ─────────────────────────────────────────────── */
function AiInsightsPanel() {
  const [result, setResult] = useState<{ insights: string; summary: any } | null>(null);
  const analyzeMut = trpc.shipping.analyzeOrders.useMutation({
    onSuccess: (d) => setResult(d),
    onError: (e) => toast.error(e.message),
  });

  return (
    <div style={{ background:'linear-gradient(135deg,#0b1d3a,#1a3a6b)', borderRadius:20, padding:'24px', color:'white' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.3rem' }}>🤖</div>
          <div>
            <h3 style={{ margin:0, fontWeight:800, fontSize:'1rem' }}>Análise com IA</h3>
            <p style={{ margin:0, fontSize:'.75rem', color:'rgba(255,255,255,.5)' }}>Powered by Groq · Llama 3.3</p>
          </div>
        </div>
        <button onClick={()=>analyzeMut.mutate()} disabled={analyzeMut.isPending}
          style={{ padding:'10px 20px', background:analyzeMut.isPending?'rgba(255,255,255,.1)':'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.2)', borderRadius:12, color:'white', fontWeight:700, fontSize:'.85rem', cursor:analyzeMut.isPending?'not-allowed':'pointer', transition:'all .2s' }}>
          {analyzeMut.isPending ? '⟳ Analisando...' : result ? '↺ Atualizar análise' : '✨ Analisar pedidos'}
        </button>
      </div>

      {result ? (
        <div>
          {result.summary && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10, marginBottom:16 }}>
              {[
                { label:'Receita', val:`R$ ${result.summary.revenue.toFixed(2).replace('.',',')}` },
                { label:'Pedidos pagos', val:result.summary.paid },
                { label:'Ticket médio', val:`R$ ${result.summary.ticketMedio.toFixed(2).replace('.',',')}` },
                { label:'Últimos 7 dias', val:result.summary.last7 },
              ].map(({label,val})=>(
                <div key={label} style={{ background:'rgba(255,255,255,.08)', borderRadius:12, padding:'12px 14px' }}>
                  <p style={{ margin:0, fontSize:'.7rem', color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</p>
                  <p style={{ margin:'4px 0 0', fontSize:'1.1rem', fontWeight:800 }}>{val}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{ background:'rgba(255,255,255,.06)', borderRadius:14, padding:'16px', fontSize:'.87rem', lineHeight:1.7, whiteSpace:'pre-wrap', color:'rgba(255,255,255,.9)' }}>
            {result.insights}
          </div>
        </div>
      ) : (
        <div style={{ textAlign:'center', padding:'20px', color:'rgba(255,255,255,.4)', fontSize:'.85rem' }}>
          Clique em "Analisar pedidos" para obter insights com IA sobre suas vendas.
        </div>
      )}
    </div>
  );
}

/* ── Main Panel ───────────────────────────────────────────── */
function OrdersPanel() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showAi, setShowAi] = useState(false);
  const prevMaxId = useRef(0);
  const { data: orders = [], isLoading, refetch } = trpc.shipping.listOrders.useQuery(undefined, { refetchInterval: 30000, refetchIntervalInBackground: false });
  const logoutMut = trpc.auth.logout.useMutation();

  // New order notification
  useEffect(() => {
    const currentMaxId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) : 0;
    if (prevMaxId.current > 0 && currentMaxId > prevMaxId.current) {
      toast('🛍️ Novo pedido recebido!', { duration: 5000 });
    }
    prevMaxId.current = currentMaxId;
  }, [orders]);

  const handleLogout = async () => {
    await logoutMut.mutateAsync();
    setLocation('/sal-vita-admin');
    window.location.reload();
  };

  const filtered = orders.filter(o => {
    if (filter === 'awaiting') return o.paymentStatus === 'awaiting' && o.status !== 'cancelled';
    if (filter === 'confirmed') return o.paymentStatus === 'confirmed' && !['label_generated','shipped','delivered','cancelled'].includes(o.status);
    if (filter === 'toship') return o.status === 'label_generated' && o.paymentStatus === 'confirmed';
    if (filter === 'shipped') return ['shipped','delivered'].includes(o.status);
    return true;
  });

  const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === new Date().toDateString());
  const revenue = orders.filter(o=>o.paymentStatus==='confirmed').reduce((s,o)=>s+parseFloat(o.totalPrice??'0'),0);
  const awaitingCount = orders.filter(o=>o.paymentStatus==='awaiting' && o.status!=='cancelled').length;
  const toShipCount = orders.filter(o=>o.status==='label_generated' && o.paymentStatus==='confirmed').length;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key:'all',       label:'Todos',               count:orders.length },
    { key:'awaiting',  label:'⏳ Aguard. Pgto',     count:awaitingCount },
    { key:'confirmed', label:'✅ Pago → Etiqueta',  count:orders.filter(o=>o.paymentStatus==='confirmed'&&!['label_generated','shipped','delivered','cancelled'].includes(o.status)).length },
    { key:'toship',    label:'📦 Pendentes Envio',  count:toShipCount },
    { key:'shipped',   label:'🚚 Enviados',          count:orders.filter(o=>['shipped','delivered'].includes(o.status)).length },
  ];

  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', fontFamily:"'Inter','Outfit',sans-serif" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>

      {/* Header */}
      <header style={{ background:'linear-gradient(135deg,#0b1d3a,#1a3a6b)', padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100, boxShadow:'0 4px 20px rgba(0,0,0,.2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height:36, width:'auto' }}>
            <defs><clipPath id="oval-hdr"><ellipse cx="250" cy="187" rx="228" ry="164"/></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="rgba(255,255,255,.1)"/>
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#4a9eff" clipPath="url(#oval-hdr)"/>
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="white">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="15"/>
          </svg>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ color:'white', fontWeight:800, fontSize:'.95rem' }}>Gestão de Pedidos</span>
              {todayOrders.length > 0 && (
                <span style={{ background:'#f59e0b', color:'white', borderRadius:999, padding:'1px 8px', fontSize:'.72rem', fontWeight:800 }}>🔔 {todayOrders.length} hoje</span>
              )}
            </div>
            <p style={{ color:'rgba(255,255,255,.5)', fontSize:'.73rem', margin:0 }}>premium.salvitarn.com.br</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={()=>window.location.href='/sal-vita-recovery'}
            style={{ padding:'8px 14px', background:'rgba(251,146,60,.2)', border:'1px solid rgba(251,146,60,.4)', borderRadius:10, color:'#fed7aa', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
            🔄 Recuperação
          </button>
          <button onClick={()=>setShowAi(s=>!s)}
            style={{ padding:'8px 14px', background:showAi?'rgba(255,255,255,.2)':'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.2)', borderRadius:10, color:'white', fontSize:'.8rem', fontWeight:600, cursor:'pointer' }}>
            🤖 IA
          </button>
          <button onClick={()=>refetch()}
            style={{ padding:8, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.15)', borderRadius:10, color:'white', cursor:'pointer', fontSize:'.9rem' }}>
            ↺
          </button>
          <span style={{ color:'rgba(255,255,255,.6)', fontSize:'.8rem', display:'none' }} className="sm-show">{user?.name}</span>
          <button onClick={handleLogout}
            style={{ padding:'7px 12px', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.15)', borderRadius:10, color:'rgba(255,255,255,.7)', fontSize:'.8rem', cursor:'pointer' }}>
            Sair
          </button>
        </div>
      </header>

      <div style={{ maxWidth:960, margin:'0 auto', padding:'24px 16px', display:'flex', flexDirection:'column', gap:20 }}>
        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:12 }}>
          <KpiCard icon="📦" label="Total Pedidos" value={orders.length} sub={`${todayOrders.length} hoje`} accent="#3b82f6"/>
          <KpiCard icon="⏳" label="Aguard. Pagamento" value={awaitingCount} accent="#f59e0b" urgent={awaitingCount > 0}/>
          <KpiCard icon="🚚" label="Pendentes Envio" value={toShipCount} accent="#8b5cf6" urgent={toShipCount > 0} sub={toShipCount > 0 ? 'Ação necessária' : 'Em dia'}/>
          <KpiCard icon="💰" label="Receita Confirmada" value={`R$ ${revenue.toFixed(2).replace('.',',')}`} accent="#10b981" sub={`${orders.filter(o=>o.paymentStatus==='confirmed').length} pedidos pagos`}/>
        </div>

        {/* AI Panel */}
        {showAi && <AiInsightsPanel />}

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={()=>setFilter(t.key)}
              style={{ padding:'8px 14px', borderRadius:10, border:'none', cursor:'pointer', fontSize:'.82rem', fontWeight:600, transition:'all .15s',
                background: filter===t.key ? '#0b1d3a' : 'white',
                color: filter===t.key ? 'white' : '#64748b',
                boxShadow: filter===t.key ? '0 2px 8px rgba(11,29,58,.25)' : '0 1px 3px rgba(0,0,0,.06)',
              }}>
              {t.label} <span style={{ opacity:.6 }}>({t.count})</span>
            </button>
          ))}
        </div>

        {/* Orders */}
        {isLoading ? (
          <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
            <div style={{ fontSize:'2rem', marginBottom:12 }}>⟳</div>
            Carregando pedidos...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#94a3b8', background:'white', borderRadius:20, border:'1.5px dashed #e2e8f0' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:12 }}>📭</div>
            <p style={{ fontWeight:600 }}>Nenhum pedido nesta aba.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {filtered.map(order => (
              <OrderCard key={order.id} order={order} onRefetch={refetch} />
            ))}
          </div>
        )}

        <p style={{ textAlign:'center', fontSize:'.73rem', color:'#cbd5e1' }}>Atualiza automaticamente a cada 30 segundos · {new Date().toLocaleTimeString('pt-BR')}</p>
      </div>
    </div>
  );
}

export default function SalVitaAdmin() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0b1d3a', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <span style={{ color:'white', fontSize:'.9rem' }}>Carregando...</span>
    </div>
  );
  if (!isAuthenticated || user?.role !== 'admin') return <LoginForm />;
  return <OrdersPanel />;
}
