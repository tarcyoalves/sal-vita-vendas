import { Component, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { trpc } from '../../lib/trpc';
import type { Card } from '../../../../server/lib/sales/agente/tipos';

// Vendedor virtual da /atacado. Botão flutuante + painel. Mobile first (375 px), respeita a safe area do iOS,
// sem bibliotecas externas. Desligado (ou sem IA) vira formulário de contato que envia para /api/b2b/inbound,
// os mesmos campos de Atacado.tsx. Todo valor (preço, frete, prazo, simulação) vem em CARTÕES escritos pelo servidor.

const AZUL = '#0C3680';
const SEGMENTOS = ['Empório / loja natural', 'Casa de temperos', 'Mercado premium', 'Parrilla / churrascaria', 'Casa de carnes', 'Restaurante', 'Peixaria', 'Distribuidor', 'Outro'];
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const TEXTO_CONSENTIMENTO_FORM = 'Concordo em ser contatado pela equipe Sal Vita Premium para receber informações comerciais sobre compras B2B, revenda ou atacado.';
const SAUDACAO_PADRAO = 'Olá! Sou o assistente virtual da Sal Vita (uma IA, não uma pessoa). Posso cotar frete e explicar a caixa de 10 kg do Sal Vita Premium. Você compra para revender ou para usar no seu negócio?';

type Mensagem = { id: number; papel: 'visitante' | 'assistente'; texto: string; cards?: Card[] };

const CSS = `
.sva-fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:590;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;background:${AZUL};color:#fff;font:600 15px/1 'Outfit','Inter',system-ui,sans-serif;padding:14px 18px;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;min-height:48px}
.sva-fab:focus-visible,.sva-btn:focus-visible,.sva-in:focus-visible{outline:2px solid #8ec2ff;outline-offset:2px}
.sva-panel{position:fixed;z-index:700;inset:0;height:100dvh;overflow:hidden;display:flex;flex-direction:column;background:#0a1628;color:#e2e8f0;font-family:'Outfit','Inter',system-ui,sans-serif;padding-top:env(safe-area-inset-top)}
@media (min-width:640px){.sva-panel{inset:auto;right:16px;bottom:16px;width:390px;height:min(640px,calc(100dvh - 32px));border-radius:16px;border:1px solid rgba(255,255,255,.14);box-shadow:0 20px 60px rgba(0,0,0,.5);overflow:hidden;padding-top:0}}
.sva-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;background:${AZUL};color:#fff}
.sva-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 14px;display:flex;flex-direction:column;gap:10px;-webkit-overflow-scrolling:touch}
.sva-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:15px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.sva-v{align-self:flex-end;background:${AZUL};color:#fff;border-bottom-right-radius:4px}
.sva-a{align-self:flex-start;background:rgba(255,255,255,.09);border-bottom-left-radius:4px}
.sva-card{align-self:stretch;border:1px solid rgba(74,158,255,.4);background:rgba(74,158,255,.1);border-radius:12px;padding:10px 12px;font-size:14px}
.sva-foot{padding:8px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.1);background:#0a1628}
.sva-in{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.07);color:#fff;font:16px 'Outfit','Inter',system-ui,sans-serif}
.sva-btn{border:0;border-radius:10px;background:${AZUL};color:#fff;font:600 15px 'Outfit','Inter',system-ui,sans-serif;padding:0 16px;min-height:44px;cursor:pointer}
.sva-btn[disabled]{background:#475569;cursor:not-allowed}
.sva-x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;min-width:44px;min-height:44px;cursor:pointer}
.sva-small{font-size:12px;color:rgba(255,255,255,.55);line-height:1.45}
.sva-lbl{display:block;font-size:12px;color:rgba(255,255,255,.55);margin:8px 0 4px;text-transform:uppercase;letter-spacing:.04em}
.sva-row{display:flex;justify-content:space-between;gap:10px;padding:2px 0}
`;

/**
 * Um cartão malformado (versão nova do servidor com página antiga em cache, por exemplo) não pode
 * derrubar a página inteira: o erro fica preso neste cartão e o resto da conversa continua.
 */
class CartaoSeguro extends Component<{ children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  componentDidCatch(err: unknown) { console.warn('[vendedor virtual] cartão não pôde ser exibido', err); }
  render() {
    return this.state.falhou
      ? <div className="sva-card sva-small">Não foi possível mostrar este cartão. Recarregue a página.</div>
      : this.props.children;
  }
}

function CartaoView({ c }: { c: Card }) {
  switch (c.tipo) {
    case 'preco':
      return (
        <div className="sva-card" role="group" aria-label="Preço">
          <div style={{ fontWeight: 700 }}>{c.produto}</div>
          <div style={{ fontSize: 22, fontWeight: 800, margin: '4px 0' }}>{c.precoTexto}</div>
          <div className="sva-small">{c.nota}</div>
        </div>
      );
    case 'frete':
      return (
        <div className="sva-card" role="group" aria-label="Frete">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Frete para o CEP {c.cepMascarado} · {c.quantidadeCaixas} {c.quantidadeCaixas === 1 ? 'caixa' : 'caixas'}</div>
          {c.opcoes.map((o) => (
            <div key={`${o.nome}-${o.precoCentavos}`} className="sva-row"><span>{o.nome}<br /><span className="sva-small">{o.prazo}</span></span><strong>{o.precoTexto}</strong></div>
          ))}
          <div className="sva-small" style={{ marginTop: 6 }}>{c.nota}</div>
        </div>
      );
    case 'disponibilidade':
      return <div className="sva-card" role="group" aria-label="Disponibilidade">{c.texto}</div>;
    case 'comparativo':
      return (
        <div className="sva-card" role="group" aria-label="Comparativo de canais">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Comparativo · {c.quantidadeCaixas} {c.quantidadeCaixas === 1 ? 'caixa' : 'caixas'}</div>
          <div className="sva-small">Site Sal Vita</div>
          <div className="sva-row"><span>Produto</span><span>{c.site.produtoTexto}</span></div>
          <div className="sva-row"><span>Frete ({c.site.servico})</span><span>{c.site.freteTexto}</span></div>
          <div className="sva-row"><strong>Total</strong><strong>{c.site.totalTexto}</strong></div>
          <div className="sva-small" style={{ marginTop: 8 }}>Mercado Livre</div>
          <div className="sva-row"><span>Frete</span><span>{c.mercadoLivre.freteTexto}</span></div>
          {c.mercadoLivre.referenciaTexto && <div className="sva-small">{c.mercadoLivre.referenciaTexto}</div>}
          <div className="sva-small" style={{ marginTop: 6 }}>{c.nota}</div>
        </div>
      );
    case 'simulacao':
      return (
        <div className="sva-card" role="group" aria-label="Simulação de revenda">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Simulação de revenda (1 caixa)</div>
          {c.linhas.map((l) => <div key={l.rotulo} className="sva-row"><span>{l.rotulo}</span><span>{l.valor}</span></div>)}
          <div className="sva-row" style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,.2)', paddingTop: 6 }}>
            <strong>Resultado da caixa</strong><strong style={{ color: c.resultadoPositivo ? '#86efac' : '#fca5a5' }}>{c.resultadoTexto}</strong>
          </div>
          <div className="sva-small" style={{ marginTop: 6 }}>{c.aviso}</div>
        </div>
      );
    case 'link':
      return (
        <div className="sva-card" role="group" aria-label="Link do pedido">
          <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>{c.instrucoes.map((i) => <li key={i} style={{ marginBottom: 2 }}>{i}</li>)}</ol>
          <a className="sva-btn" href={c.url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>{c.rotulo}</a>
        </div>
      );
    case 'aviso':
      return <div className="sva-card" role="status">{c.texto}</div>;
  }
}

function FormularioContato({ motivo }: { motivo?: string }) {
  const [form, setForm] = useState({ companyName: '', contactName: '', email: '', whatsapp: '', city: '', state: '', segment: '', volumeInterest: '', message: '', website: '' });
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [erro, setErro] = useState('');
  const base = useId();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { setErro('É necessário aceitar o contato comercial para enviar.'); setStatus('error'); return; }
    setStatus('sending'); setErro('');
    try {
      const res = await fetch('/api/b2b/inbound', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, consent: true }) });
      if (res.status === 429) { setErro('Muitas tentativas. Tente novamente em alguns minutos.'); setStatus('error'); return; }
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!res.ok || data.ok !== true) { setErro(data.error ?? 'Não foi possível enviar. Tente novamente.'); setStatus('error'); return; }
      setStatus('sent');
    } catch {
      setErro('Erro de conexão. Tente novamente.'); setStatus('error');
    }
  }

  if (status === 'sent') {
    return <div className="sva-body"><div className="sva-msg sva-a">Recebemos seus dados. A equipe da Sal Vita entra em contato em breve.</div></div>;
  }
  const campo = (k: keyof typeof form, rotulo: string, p: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <>
      <label className="sva-lbl" htmlFor={`${base}-${k}`}>{rotulo}</label>
      <input id={`${base}-${k}`} className="sva-in" value={form[k]} onChange={(e) => set(k, e.target.value)} {...p} />
    </>
  );
  return (
    <form className="sva-body" onSubmit={enviar}>
      <div className="sva-msg sva-a">{motivo ?? 'No momento o atendimento virtual não está disponível. Deixe seus dados e a equipe da Sal Vita responde você.'}</div>
      {campo('companyName', 'Empresa *', { required: true, maxLength: 200, autoComplete: 'organization' })}
      {campo('contactName', 'Responsável *', { required: true, maxLength: 200, autoComplete: 'name' })}
      {campo('email', 'E-mail comercial *', { required: true, type: 'email', maxLength: 200, autoComplete: 'email' })}
      {campo('whatsapp', 'WhatsApp comercial *', { required: true, type: 'tel', inputMode: 'tel', maxLength: 30, autoComplete: 'tel' })}
      {campo('city', 'Cidade *', { required: true, maxLength: 120 })}
      <label className="sva-lbl" htmlFor={`${base}-state`}>UF *</label>
      <select id={`${base}-state`} className="sva-in" required value={form.state} onChange={(e) => set('state', e.target.value)}>
        <option value="" style={{ color: '#000' }}>--</option>
        {UFS.map((u) => <option key={u} value={u} style={{ color: '#000' }}>{u}</option>)}
      </select>
      <label className="sva-lbl" htmlFor={`${base}-segment`}>Segmento *</label>
      <select id={`${base}-segment`} className="sva-in" required value={form.segment} onChange={(e) => set('segment', e.target.value)}>
        <option value="" style={{ color: '#000' }}>Selecione...</option>
        {SEGMENTOS.map((s) => <option key={s} value={s} style={{ color: '#000' }}>{s}</option>)}
      </select>
      {campo('volumeInterest', 'Volume estimado ou interesse', { maxLength: 500 })}
      {/* honeypot: pessoas não veem */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.65)', lineHeight: 1.5 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }} />
        <span>{TEXTO_CONSENTIMENTO_FORM}</span>
      </label>
      {status === 'error' && erro && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>{erro}</p>}
      <button className="sva-btn" type="submit" disabled={status === 'sending'} style={{ marginTop: 8 }}>{status === 'sending' ? 'Enviando...' : 'Enviar meus dados'}</button>
    </form>
  );
}

export default function SalesAgentWidget() {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [formularioMotivo, setFormularioMotivo] = useState<string | null>(null);
  const [consent, setConsent] = useState(false); // nunca marcada por padrão
  const [contato, setContato] = useState({ nome: '', empresa: '', email: '' });
  const [erro, setErro] = useState('');
  const idRef = useRef(1);
  const fimRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const estado = trpc.salesAgent.estado.useQuery(undefined, { enabled: aberto, staleTime: 60_000, retry: false });
  const chat = trpc.salesAgent.chat.useMutation();

  const max = estado.data?.maxCaracteres ?? 800;
  const modoFormulario = formularioMotivo !== null || (estado.isSuccess && !estado.data.ativo) || estado.isError;

  useEffect(() => {
    // Rola só a lista de mensagens: scrollIntoView também rolava a página por trás do painel.
    const fim = fimRef.current;
    const lista = fim?.parentElement;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [msgs, chat.isPending, aberto]);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberto]);

  const contatoValido = contato.nome.trim().length >= 2 && contato.empresa.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(contato.email.trim());

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || chat.isPending) return;
    setErro('');
    setMsgs((m) => [...m, { id: idRef.current++, papel: 'visitante', texto: t }]);
    setTexto('');
    try {
      const r = await chat.mutateAsync({
        conversationId, mensagem: t,
        consentimentoResumo: consent,
        contato: consent && contatoValido ? { nome: contato.nome.trim(), empresa: contato.empresa.trim(), email: contato.email.trim() } : undefined,
      });
      if (r.conversationId) setConversationId(r.conversationId);
      if (r.modo === 'formulario') { setFormularioMotivo(r.mensagem); return; }
      setMsgs((m) => [...m, { id: idRef.current++, papel: 'assistente', texto: r.mensagem, cards: r.cards }]);
    } catch {
      setErro('Não consegui responder agora. Tente de novo em instantes ou deixe seus dados no formulário.');
    }
  }

  return (
    <>
      <style>{CSS}</style>
      {!aberto && (
        <button type="button" className="sva-fab" onClick={() => setAberto(true)} aria-label="Abrir o assistente virtual de vendas">
          <span aria-hidden="true">💬</span> Fale com a Sal Vita
        </button>
      )}
      {aberto && createPortal(
        <section className="sva-panel" role="dialog" aria-modal="false" aria-label="Assistente virtual da Sal Vita">
          <div className="sva-head">
            <div>
              <div style={{ fontWeight: 700 }}>Assistente virtual Sal Vita</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>{modoFormulario ? 'Deixe seu contato' : 'IA · não é uma pessoa'}</div>
            </div>
            <button type="button" className="sva-x" onClick={() => setAberto(false)} aria-label="Fechar">×</button>
          </div>

          {modoFormulario ? (
            <FormularioContato motivo={formularioMotivo ?? undefined} />
          ) : (
            <>
              <div className="sva-body" aria-live="polite">
                <div className="sva-msg sva-a">{estado.data?.saudacao ?? SAUDACAO_PADRAO}</div>
                {msgs.map((m) => (
                  <div key={m.id} style={{ display: 'contents' }}>
                    <div className={`sva-msg ${m.papel === 'visitante' ? 'sva-v' : 'sva-a'}`}>{m.texto}</div>
                    {m.cards?.map((c, i) => <CartaoSeguro key={`${m.id}-${i}`}><CartaoView c={c} /></CartaoSeguro>)}
                  </div>
                ))}
                {chat.isPending && <div className="sva-msg sva-a" aria-label="Digitando">Digitando…</div>}
                {erro && <div role="alert" className="sva-small" style={{ color: '#fca5a5' }}>{erro}</div>}
                <div ref={fimRef} />
              </div>
              <div className="sva-foot">
                <p className="sva-small" style={{ margin: '0 0 6px' }}>
                  {estado.data?.aviso ?? 'As mensagens são guardadas por 90 dias para atendimento. Não envie dados pessoais além dos pedidos aqui.'} Valores e prazos são mostrados em cartões e valem no momento da consulta.
                </p>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'rgba(255,255,255,.75)', lineHeight: 1.4, marginBottom: 6 }}>
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }} />
                  <span>{estado.data?.textoConsentimento ?? 'Quero receber por e-mail o resumo desta conversa e o link do pedido.'}</span>
                </label>
                {consent && (
                  <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                    <label className="sva-lbl" htmlFor={`${baseId}-n`} style={{ margin: 0 }}>Seu nome</label>
                    <input id={`${baseId}-n`} className="sva-in" autoComplete="name" maxLength={120} value={contato.nome} onChange={(e) => setContato((c) => ({ ...c, nome: e.target.value }))} />
                    <label className="sva-lbl" htmlFor={`${baseId}-e`} style={{ margin: 0 }}>Empresa</label>
                    <input id={`${baseId}-e`} className="sva-in" autoComplete="organization" maxLength={160} value={contato.empresa} onChange={(e) => setContato((c) => ({ ...c, empresa: e.target.value }))} />
                    <label className="sva-lbl" htmlFor={`${baseId}-m`} style={{ margin: 0 }}>E-mail</label>
                    <input id={`${baseId}-m`} className="sva-in" type="email" autoComplete="email" maxLength={200} value={contato.email} onChange={(e) => setContato((c) => ({ ...c, email: e.target.value }))} />
                  </div>
                )}
                <form onSubmit={enviar} style={{ display: 'flex', gap: 8 }}>
                  <label htmlFor={`${baseId}-t`} style={{ position: 'absolute', left: -10000 }}>Sua mensagem</label>
                  <input id={`${baseId}-t`} className="sva-in" value={texto} maxLength={max} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva sua mensagem" autoComplete="off" />
                  <button type="submit" className="sva-btn" disabled={chat.isPending || !texto.trim()}>Enviar</button>
                </form>
                <button type="button" onClick={() => setFormularioMotivo('Prefere falar com uma pessoa? Deixe seus dados e a equipe responde você.')}
                  style={{ background: 'none', border: 0, color: '#8ec2ff', fontSize: 13, padding: '10px 0 0', minHeight: 44, cursor: 'pointer', textDecoration: 'underline' }}>
                  Prefiro falar com uma pessoa
                </button>
              </div>
            </>
          )}
        </section>,
        document.body,
      )}
    </>
  );
}
