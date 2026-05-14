import { useState, useRef, useEffect } from 'react';
import { trpc } from '../lib/trpc';

type Msg = { role: 'user' | 'assistant'; content: string };

const QUICK = [
  { label: '📊 Resumo do dia', msg: 'Gere um resumo executivo da operação hoje' },
  { label: '🚛 Fretes ativos', msg: 'Quais fretes estão em andamento agora?' },
  { label: '💰 Financeiro', msg: 'Como está o financeiro? Valor total a pagar e pendente?' },
  { label: '👤 Motoristas', msg: 'Quantos motoristas pendentes de aprovação?' },
  { label: '⚠ Atenções', msg: 'Quais são os pontos de atenção na operação agora?' },
];

export default function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chat = trpc.ai.chat.useMutation({
    onSuccess: (data) => {
      setMsgs((p) => [...p, { role: 'assistant', content: data.reply }]);
    },
    onError: (e) => {
      setMsgs((p) => [...p, { role: 'assistant', content: `Erro: ${e.message}` }]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  function send(text: string) {
    if (!text.trim()) return;
    const newMsg: Msg = { role: 'user', content: text };
    setMsgs((p) => [...p, newMsg]);
    setInput('');
    chat.mutate({ message: text, history: [...msgs, newMsg].slice(-10) });
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Assistente IA"
        style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 1000,
          width: 52, height: 52, borderRadius: '50%',
          background: open ? '#1e293b' : '#0C3680',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(12,54,128,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, transition: 'background 0.2s, transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'none',
        }}
      >
        {open ? '✕' : '✨'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 142, right: 20, zIndex: 999,
          width: 'min(340px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          border: '1px solid #e2e8f0',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: 'calc(100vh - 200px)',
        }}>
          {/* Header */}
          <div style={{
            background: '#0C3680', padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>✨ Assistente FRETEPRIME</div>
              <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 1 }}>Powered by Groq · Llama 3.3 70B</div>
            </div>
            <button
              onClick={() => setMsgs([])}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#93c5fd', cursor: 'pointer', padding: '4px 8px', fontSize: 11 }}
            >
              Limpar
            </button>
          </div>

          {/* Quick actions */}
          {msgs.length === 0 && (
            <div style={{ padding: '12px 12px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK.map((q) => (
                <button
                  key={q.msg}
                  onClick={() => send(q.msg)}
                  style={{
                    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20,
                    padding: '5px 10px', fontSize: 11, color: '#1d4ed8', cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}>
            {msgs.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginTop: 16 }}>
                Olá! Como posso ajudar com sua operação?
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '8px 12px', borderRadius: 12,
                  fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user' ? '#0C3680' : '#f1f5f9',
                  color: m.role === 'user' ? '#fff' : '#1e293b',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                  borderBottomLeftRadius: m.role === 'assistant' ? 4 : 12,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chat.isPending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#f1f5f9', borderRadius: 12, borderBottomLeftRadius: 4, padding: '8px 14px', color: '#94a3b8', fontSize: 13 }}>
                  Pensando...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send(input)}
              placeholder="Pergunte algo..."
              disabled={chat.isPending}
              style={{
                flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 8,
                padding: '8px 12px', fontSize: 13, outline: 'none',
                background: '#fafbff', color: '#1e293b',
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={chat.isPending || !input.trim()}
              style={{
                background: '#0C3680', border: 'none', borderRadius: 8,
                color: '#fff', cursor: 'pointer', padding: '8px 12px',
                fontSize: 16, opacity: (chat.isPending || !input.trim()) ? 0.5 : 1,
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
