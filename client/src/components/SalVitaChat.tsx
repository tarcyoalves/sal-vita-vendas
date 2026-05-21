import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '../lib/trpc';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Como faço um pedido?',
  'Qual o prazo de entrega?',
  'Vocês aceitam PIX?',
  'Qual a diferença do sal refinado?',
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
          content: 'Olá! Sou a assistente virtual do Sal Vita Premium. ✨\n\nPosso te ajudar com dúvidas sobre o produto, frete, pagamento ou seu pedido.\n\nComo posso te ajudar?',
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
      const res = await chatMut.mutateAsync({ messages: newMsgs });
      setMsgs(prev => [...prev, { role: 'assistant', content: res.reply }]);
    } catch {
      setMsgs(prev => [...prev, { role: 'assistant', content: 'Desculpe, houve um erro. Tente novamente em instantes.' }]);
    }
  }, [input, msgs, chatMut]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      <style>{`
        /* On mobile the sticky "Comprar Agora" bar is ~68px tall — push chat above it */
        @media (max-width: 640px) {
          .sv-chat-btn  { bottom: 82px !important; }
          .sv-chat-win  { bottom: 152px !important; height: min(460px, calc(100dvh - 180px)) !important; }
        }
      `}</style>

      {/* Floating button */}
      <button
        className="sv-chat-btn"
        onClick={() => setOpen(o => !o)}
        aria-label="Abrir chat"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 58, height: 58, borderRadius: '50%',
          background: 'linear-gradient(135deg, #0C3680 0%, #1a56c4 100%)',
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(12,54,128,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .2s, box-shadow .2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
        {unread && !open && (
          <span style={{
            position: 'absolute', top: 2, right: 2, width: 14, height: 14,
            background: '#ef4444', borderRadius: '50%', border: '2px solid white',
          }}/>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div className="sv-chat-win" style={{
          position: 'fixed', bottom: 94, right: 24, zIndex: 9998,
          width: 'min(370px, calc(100vw - 32px))',
          height: 'min(520px, calc(100dvh - 120px))',
          background: '#fff', borderRadius: 20,
          boxShadow: '0 8px 48px rgba(0,0,0,.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'chatIn .2s ease',
        }}>
          <style>{`
            @keyframes chatIn { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:none; } }
            .chat-bubble-user { background: #0C3680; color: #fff; border-radius: 16px 16px 4px 16px; }
            .chat-bubble-ai   { background: #f1f5f9; color: #1e293b; border-radius: 16px 16px 16px 4px; }
            .chat-msg { max-width: 82%; padding: 10px 14px; font-size: .88rem; line-height: 1.5; word-break: break-word; }
            .chat-suggestion { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 20px; padding: 6px 14px; font-size: .8rem; cursor: pointer; white-space: nowrap; transition: background .15s; }
            .chat-suggestion:hover { background: #dbeafe; }
          `}</style>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0C3680 0%, #1a56c4 100%)',
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'white', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <img
                src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
                alt="Sal Vita"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  el.parentElement!.style.background = '#0C3680';
                  el.parentElement!.innerHTML = '<span style="color:white;font-weight:800;font-size:.8rem">SV</span>';
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '.95rem' }}>Sal Vita Premium</div>
              <div style={{ color: 'rgba(255,255,255,.75)', fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }}/>
                Online agora
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fechar chat" style={{
              background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', transition: 'background .2s', flexShrink: 0,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.28)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.15)'; }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className={`chat-msg ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                  {m.content.split('\n').map((line, j, arr) => (
                    <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
                  ))}
                </div>
              </div>
            ))}

            {chatMut.isPending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div className="chat-msg chat-bubble-ai" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 7, height: 7, borderRadius: '50%', background: '#94a3b8',
                      animation: `bounce .9s ${i * .15}s infinite`,
                      display: 'inline-block',
                    }}/>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestions (only if 1 or fewer messages) */}
            {msgs.length <= 1 && !chatMut.isPending && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} className="chat-suggestion" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            )}

            <div ref={endRef}/>
          </div>

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '1px solid #e2e8f0',
            display: 'flex', gap: 8, alignItems: 'center', background: '#fff',
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Digite sua dúvida..."
              style={{
                flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 24,
                padding: '9px 16px', fontSize: '.88rem', outline: 'none',
                transition: 'border-color .2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#0C3680'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || chatMut.isPending}
              style={{
                width: 38, height: 38, borderRadius: '50%', border: 'none',
                background: input.trim() && !chatMut.isPending ? '#0C3680' : '#e2e8f0',
                cursor: input.trim() && !chatMut.isPending ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background .2s', flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <style>{`@keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }`}</style>
        </div>
      )}
    </>
  );
}
