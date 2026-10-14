import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '../lib/trpc';
import { BrandLogo } from './premium/BrandLogo';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Como faço o pedido?',
  'Quanto tempo leva a entrega?',
  'Aceita PIX?',
  'O sal é iodado?',
];

export default function SalVitaChat() {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<Msg[]>([]);
  const [input, setInput]     = useState('');
  const [unread, setUnread]   = useState(false);
  const [greeted, setGreeted] = useState(false);
  const endRef                = useRef<HTMLDivElement>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  const chatMut = trpc.recovery.chat.useMutation();

  useEffect(() => {
    if (open) {
      setUnread(false);
      if (!greeted) {
        setGreeted(true);
        setMsgs([{
          role: 'assistant',
          content: 'Oi! Aqui é o atendimento automático da Sal Vita. Posso ajudar com produto, frete, pagamento ou pedido. Se preferir falar com uma pessoa, é só tocar no link do WhatsApp aqui em cima.',
        }]);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, greeted]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || chatMut.isPending) return;
    setInput('');
    const newMsgs: Msg[] = [...msgs, { role: 'user', content }];
    setMsgs(newMsgs);

    try {
      const res = await chatMut.mutateAsync({ messages: newMsgs.slice(-12) });
      setMsgs(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Não consegui responder agora. Tente de novo ou chame a gente no WhatsApp: (84) 2140-8212.' }]);
    }
  }, [input, msgs, chatMut]);

  // Escape closes the chat window.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const canSend = !!input.trim() && !chatMut.isPending;

  return (
    <>
      <style>{`
        /* Paleta da loja (tokens em index.html, html.sv-premium); os fallbacks cobrem o caso sem a classe. */
        .sv-chat-btn, .sv-chat-win {
          --c-navy: var(--sv-navy, #0b1d3a);
          --c-gold: var(--sv-gold, #c9a227);
          --c-gold-light: var(--sv-gold-light, #e8c547);
          --c-salt: var(--sv-salt-deep, #f2f0ea);
          font-family: 'Outfit', sans-serif;
        }
        .sv-chat-btn:focus-visible, .sv-chat-win button:focus-visible, .sv-chat-win a:focus-visible { outline: 3px solid var(--c-gold-light); outline-offset: 2px; }
        .sv-chat-body button:focus-visible, .sv-chat-foot button:focus-visible, .sv-chat-foot input:focus-visible { outline-color: var(--c-navy); }
        .sv-chat-bubble-user { background: var(--c-navy); color: #fff; border-radius: 14px 14px 4px 14px; }
        .sv-chat-bubble-ai   { background: var(--c-salt); color: #0a1020; border-radius: 14px 14px 14px 4px; }
        .sv-chat-msg { max-width: 84%; padding: 10px 14px; font-size: .9375rem; line-height: 1.5; word-break: break-word; }
        .sv-chat-chip { background: #fbfaf7; color: var(--c-navy); border: 1px solid rgba(201,162,39,.7); border-radius: 999px; padding: 0 16px; min-height: 44px; font-size: .875rem; font-family: inherit; cursor: pointer; transition: background .15s; }
        .sv-chat-chip:hover { background: var(--c-salt); }
        @keyframes chatIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
        @keyframes chatDot { 0%,60%,100%{opacity:.35} 30%{opacity:1} }
        .sv-chat-win { animation: chatIn .2s ease-out; }
        @media (prefers-reduced-motion: reduce) { .sv-chat-win { animation: none; } .sv-chat-dot { animation: none !important; opacity: .7; } }
        /* On mobile the sticky "Comprar" bar is ~68px tall: push chat above it */
        @media (max-width: 640px) {
          .sv-chat-btn  { bottom: 82px !important; }
          .sv-chat-win  { bottom: 152px !important; height: min(460px, calc(100dvh - 180px)) !important; }
        }
      `}</style>

      {/* Floating button */}
      <button
        className="sv-chat-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Fechar chat' : 'Abrir chat'}
        aria-expanded={open}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--c-navy)',
          border: '1px solid rgba(201,162,39,.6)', cursor: 'pointer',
          boxShadow: '0 2px 12px rgba(11,29,58,.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e8c547" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#e8c547" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
        {unread && !open && (
          <span style={{
            position: 'absolute', top: 2, right: 2, width: 12, height: 12,
            background: '#c9a227', borderRadius: '50%', border: '2px solid #0b1d3a',
          }}/>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="sv-chat-win" role="dialog" aria-label="Atendimento automático da Sal Vita" style={{
          position: 'fixed', bottom: 94, right: 24, zIndex: 9998,
          width: 'min(370px, calc(100vw - 32px))',
          height: 'min(520px, calc(100dvh - 120px))',
          background: '#fff', borderRadius: 14,
          border: '1px solid rgba(11,29,58,.14)',
          boxShadow: '0 12px 40px rgba(11,29,58,.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: 'var(--c-navy)',
            padding: '12px 8px 12px 18px', display: 'flex', alignItems: 'center', gap: 12,
            borderBottom: '1px solid rgba(201,162,39,.5)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <BrandLogo size={26} white />
              <div style={{ color: 'rgba(255,255,255,.85)', fontSize: '.8125rem', marginTop: 4 }}>
                Atendimento automático
              </div>
              <a href="https://wa.me/558421408212" target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: '#e8c547', fontSize: '.875rem', fontWeight: 600, textDecoration: 'underline' }}>
                Falar com uma pessoa no WhatsApp
              </a>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fechar chat" style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8,
              width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, alignSelf: 'flex-start',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="sv-chat-body" role="log" aria-live="polite" aria-label="Mensagens do chat" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className={`sv-chat-msg ${m.role === 'user' ? 'sv-chat-bubble-user' : 'sv-chat-bubble-ai'}`}>
                  {m.content.split('\n').map((line, j, arr) => (
                    <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                  ))}
                </div>
              </div>
            ))}

            {chatMut.isPending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div className="sv-chat-msg sv-chat-bubble-ai" role="status" aria-label="Digitando" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} className="sv-chat-dot" style={{
                      width: 7, height: 7, borderRadius: '50%', background: '#5f6f86',
                      animation: `chatDot 1s ${i * .15}s infinite`,
                      display: 'inline-block',
                    }}/>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions (only if 1 or fewer messages) */}
            {msgs.length <= 1 && !chatMut.isPending && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} className="sv-chat-chip" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}

            <div ref={endRef}/>
          </div>

          {/* Input */}
          <div className="sv-chat-foot" style={{
            padding: '10px 12px', borderTop: '1px solid rgba(11,29,58,.12)',
            display: 'flex', gap: 8, alignItems: 'center', background: '#fff',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              aria-label="Digite sua dúvida"
              placeholder="Digite sua dúvida"
              style={{
                flex: 1, minWidth: 0, minHeight: 44, border: '1.5px solid rgba(11,29,58,.3)', borderRadius: 8,
                padding: '0 14px', fontSize: 16, fontFamily: 'inherit', color: '#0a1020',
              }}
            />
            <button
              onClick={() => send()}
              aria-label="Enviar mensagem"
              disabled={!canSend}
              style={{
                width: 44, height: 44, borderRadius: 8, border: 'none',
                background: canSend ? 'var(--c-navy)' : '#e5e3dc',
                cursor: canSend ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={canSend ? '#e8c547' : '#5f6f86'} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
