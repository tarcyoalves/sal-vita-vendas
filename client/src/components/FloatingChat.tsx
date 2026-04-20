import { useState, useRef, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { toast } from 'sonner';

interface Msg { role: 'user' | 'assistant'; content: string; ts: Date; }

function getStoredApiConfig(): { apiKey: string; provider: string; model: string } | null {
  try {
    const configs = JSON.parse(localStorage.getItem('aiConfigs') || '{}');
    const entry = Object.values(configs as Record<string, any>).find((c: any) => c.status === 'configured');
    if (entry) return { apiKey: (entry as any).apiKey, provider: (entry as any).provider, model: (entry as any).model };
  } catch { /* ignore */ }
  return null;
}

export default function FloatingChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [initialized, setInitialized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatMutation = trpc.ai.chat.useMutation();
  const clearMutation = trpc.ai.clearHistory.useMutation();
  const { data: history = [] } = trpc.ai.history.useQuery(undefined, { enabled: !!user });

  useEffect(() => {
    if (initialized) return;
    if ((history as any[]).length > 0) {
      setMsgs((history as any[]).map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content, ts: new Date(m.createdAt) })));
    } else {
      setMsgs([{ role: 'assistant', content: '👋 Olá! Sou a IA da Sal Vita.\nPosso ajudar com:\n📊 Análise de desempenho\n📋 Tarefas pendentes\n💡 Dicas de vendas\n\nComo posso ajudar?', ts: new Date() }]);
    }
    setInitialized(true);
  }, [history, initialized]);

  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [msgs, open]);

  if (!user) return null;

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMsgs(prev => [...prev, { role: 'user', content: text, ts: new Date() }]);
    setLoading(true);
    try {
      const cfg = getStoredApiConfig();
      const res = await chatMutation.mutateAsync({
        message: text,
        apiKey: cfg?.apiKey,
        provider: cfg?.provider,
        model: cfg?.model,
      });
      setMsgs(prev => [...prev, { role: 'assistant', content: res.reply, ts: new Date() }]);
    } catch (e: any) {
      const err = e?.message ?? 'Erro ao contatar IA';
      toast.error(err);
      setMsgs(prev => [...prev, { role: 'assistant', content: `❌ ${err}`, ts: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    await clearMutation.mutateAsync();
    setMsgs([{ role: 'assistant', content: 'Histórico limpo! Como posso ajudar?', ts: new Date() }]);
  };

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-2xl flex items-center justify-center text-2xl transition-all active:scale-95"
        title={open ? 'Fechar chat' : 'Abrir chat IA'}
        aria-label="Chat com IA"
      >
        {open ? '✕' : '💬'}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col"
          style={{ width: 'min(380px, calc(100vw - 16px))', height: 'min(520px, calc(100vh - 110px))' }}
        >
          {/* Header */}
          <div className="bg-blue-600 text-white px-4 py-3 rounded-t-2xl flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤖</span>
              <div>
                <p className="font-semibold text-sm leading-tight">Assistente Sal Vita</p>
                <p className="text-xs opacity-75 leading-tight">IA com dados reais do sistema</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={clear} className="text-sm opacity-75 hover:opacity-100 transition" title="Limpar histórico">🗑️</button>
              {user.role === 'admin' && (
                <a href="/ai-settings" className="text-sm opacity-75 hover:opacity-100 transition" title="Configurar chave de IA">⚙️</a>
              )}
              <button onClick={() => setOpen(false)} className="text-sm opacity-75 hover:opacity-100 transition">✕</button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 min-h-0">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm'
                }`}>
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className={`text-xs mt-1 ${m.role === 'user' ? 'text-blue-200 text-right' : 'text-gray-400'}`}>
                    {m.ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-3 py-2 flex gap-1 overflow-x-auto border-t bg-white flex-shrink-0 scrollbar-hide">
            {[
              '📊 Meu resumo de hoje',
              '📋 Tarefas atrasadas',
              '💡 Dicas de vendas',
              ...(user.role === 'admin' ? ['🕵️ Analisar atendentes'] : []),
            ].map(q => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="whitespace-nowrap text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2 py-1 rounded-full border border-blue-200 transition flex-shrink-0"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t bg-white rounded-b-2xl flex gap-2 flex-shrink-0">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Digite sua mensagem..."
              disabled={loading}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition flex-shrink-0"
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
