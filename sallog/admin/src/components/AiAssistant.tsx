import { useState, useRef, useEffect } from 'react';
import { trpc } from '../lib/trpc';

type Msg = { role: 'user' | 'assistant'; content: string; id: number };

const QUICK = [
  { label: '📊 Resumo do dia',     msg: 'Me dê um resumo executivo da operação hoje' },
  { label: '🚛 Fretes ativos',      msg: 'Quais fretes estão em andamento agora e precisam de atenção?' },
  { label: '💰 Financeiro',         msg: 'Qual o valor total a receber de fretes validados e o total já pago?' },
  { label: '👤 Motoristas',         msg: 'Qual a situação dos motoristas? Há pendentes de aprovação?' },
  { label: '⚠️ Atenções',  msg: 'Quais são os pontos críticos da operação que preciso resolver hoje?' },
];

export default function AiAssistant() {
  const [open, setOpen]   = useState(false);
  const [input, setInput] = useState('');
  const [msgs, setMsgs]   = useState<Msg[]>([]);
  const bottomRef         = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);

  const chat = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setMsgs(prev => [...prev, { role: 'assistant', content: data.reply, id: Date.now() }]);
    },
    onError: (e) => {
      setMsgs(prev => [...prev, { role: 'assistant', content: `❌ Erro: ${e.message}`, id: Date.now() }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, chat.isPending]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  function send(text: string) {
    if (!text.trim() || chat.isPending) return;
    const history = msgs.slice(-10).map(m => ({ role: m.role, content: m.content }));
    setMsgs(prev => [...prev, { role: 'user', content: text, id: Date.now() }]);
    setInput('');
    chat.mutate({ message: text, history });
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Assistente FRETEPRIME"
        style={{
          position: 'fixed',
          bottom: 80, right: 20,
          width: 50, height: 50,
          borderRadius: '50%',
          background: open ? 'var(--text-2)' : 'var(--navy)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 20,
          boxShadow: '0 4px 16px rgba(12,54,128,0.35)',
          zIndex: 150,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.2s, transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 140, right: 20,
          width: 'min(340px, calc(100vw - 32px))',
          height: 'min(480px, calc(100vh - 180px))',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: 'var(--shadow-lg)',
          zIndex: 149,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeUp 0.18s ease forwards',
        }}>
          {/* Header */}
          <div style={{
            padding: '13px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--navy)',
            color: '#fff',
            flexShrink: 0,
          }}>
            <div style={{ fontFamily: "'Barlow Semi Condensed',sans-serif", fontSize: 15, fontWeight: 700, letterSpacing: 0.3 }}>
              🤖 Assistente FRETEPRIME
            </div>
            <div style={{ fontSize: 10.5, opacity: 0.6, marginTop: 1, letterSpacing: 0.3 }}>Powered by Groq AI • Llama 3.3</div>
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Welcome + quick actions */}
            {msgs.length === 0 && (
              <div>
                <div style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: '12px 12px 12px 2px',
                  padding: '10px 13px', fontSize: 12.5, color: 'var(--text-2)',
                  lineHeight: 1.5, marginBottom: 10,
                }}>
                  Olá! Sou o assistente do FRETEPRIME. Posso te ajudar com informações sobre fretes, motoristas, financeiro e muito mais. 🚛
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ações rápidas</div>
                {QUICK.map(q => (
                  <button key={q.label} onClick={() => send(q.msg)} style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '8px 12px',
                    fontSize: 12, cursor: 'pointer', marginBottom: 5,
                    color: 'var(--text-2)', fontFamily: 'inherit',
                    transition: 'border-color 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--navy)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {/* Message bubbles */}
            {msgs.map(m => (
              <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                <div style={{
                  padding: '9px 12px',
                  borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: m.role === 'user' ? 'var(--navy)' : 'var(--surface-2)',
                  color: m.role === 'user' ? '#fff' : 'var(--text)',
                  fontSize: 12.5, lineHeight: 1.55,
                  border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.content}
                </div>
              </div>
            ))}

            {chat.isPending && (
              <div style={{ alignSelf: 'flex-start' }}>
                <div style={{
                  padding: '9px 14px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: '12px 12px 12px 2px',
                  fontSize: 12, color: 'var(--text-3)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ display: 'inline-block', animation: 'fadeUp 0.6s infinite alternate' }}>•••</span>
                  pensando...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick chips (when has messages) */}
          {msgs.length > 0 && (
            <div style={{
              padding: '5px 10px', display: 'flex', gap: 4,
              overflowX: 'auto', borderTop: '1px solid var(--border)',
              flexShrink: 0, scrollbarWidth: 'none',
            }}>
              {QUICK.map(q => (
                <button key={q.label} onClick={() => send(q.msg)} style={{
                  background: 'none', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '3px 9px',
                  fontSize: 10.5, cursor: 'pointer',
                  color: 'var(--text-3)', whiteSpace: 'nowrap',
                  flexShrink: 0, fontFamily: 'inherit',
                  transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--navy)'; e.currentTarget.style.color='var(--navy)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-3)'; }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '8px 10px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 6,
            flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Pergunte sobre a operação..."
              disabled={chat.isPending}
              style={{
                flex: 1,
                border: '1.5px solid var(--border)',
                borderRadius: 8, padding: '7px 10px',
                fontSize: 12.5, outline: 'none',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                transition: 'border-color 0.12s',
              }}
              onFocus={e => (e.target.style.borderColor = 'var(--navy)')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || chat.isPending}
              style={{
                background: 'var(--navy)', color: '#fff',
                border: 'none', borderRadius: 8,
                padding: '7px 13px', cursor: 'pointer',
                fontSize: 15, fontWeight: 700,
                opacity: (!input.trim() || chat.isPending) ? 0.45 : 1,
                transition: 'opacity 0.12s',
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
