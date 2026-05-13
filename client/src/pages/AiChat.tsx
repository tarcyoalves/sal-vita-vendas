import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WELCOME_MSG: Message = {
  role: "assistant",
  content: "Olá! Sou seu assistente de IA da Sal Vita. Posso ajudar com dicas de vendas, análise de desempenho e estratégias. Como posso ajudar?",
  timestamp: new Date(),
};

export default function AiChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const chatMutation = trpc.ai.chat.useMutation();
  const clearHistoryMutation = trpc.ai.clearHistory.useMutation();

  // Load history once on mount — imperative fetch, no reactive subscription.
  // This prevents TanStack Query background refetches from ever overwriting local state.
  useEffect(() => {
    utils.ai.history.fetch(undefined).then((data: any[]) => {
      setMessages(data.length > 0
        ? data.map((m: any) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.createdAt),
          }))
        : [WELCOME_MSG]
      );
    }).catch(() => {
      setMessages([WELCOME_MSG]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleClearHistory = async () => {
    if (!confirm("Limpar todo o histórico do chat?")) return;
    await clearHistoryMutation.mutateAsync();
    setMessages([{ role: "assistant", content: "Histórico limpo. Como posso ajudar?", timestamp: new Date() }]);
    utils.ai.history.invalidate();
    toast.success("Histórico limpo");
  };

  const getApiConfig = (preferProvider?: string) => {
    try {
      const configs = JSON.parse(localStorage.getItem('aiConfigs') || '{}') as Record<string, any>;
      const order = preferProvider
        ? [preferProvider, 'groq', 'gemini']
        : ['groq', 'gemini'];
      for (const id of order) {
        const c = configs[id];
        if (c?.status === 'configured') return { apiKey: c.apiKey, provider: c.provider };
      }
    } catch { /* ignore */ }
    return null;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { role: "user", content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);
    try {
      const cfg = getApiConfig();
      const response = await chatMutation.mutateAsync({ message: currentInput, apiKey: cfg?.apiKey, provider: cfg?.provider });
      setMessages(prev => [...prev, { role: "assistant", content: response.reply, timestamp: new Date() }]);
    } catch (error: any) {
      const errMsg = error?.message ?? "Erro ao processar mensagem";
      toast.error(errMsg);
      setMessages(prev => [...prev, { role: "assistant", content: `❌ ${errMsg}`, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end p-3 border-b bg-white">
        <Button variant="outline" size="sm" onClick={handleClearHistory}>🗑️ Limpar histórico</Button>
      </div>

      <div className="flex-1 flex flex-col p-4 max-w-3xl mx-auto w-full">
        <div className="flex-1 overflow-y-auto mb-4 bg-white rounded-xl border p-4 space-y-4 min-h-96 max-h-[60vh]">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-xs lg:max-w-lg px-4 py-3 rounded-2xl text-sm ${msg.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-100 text-gray-900 rounded-bl-sm"}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <span className="text-xs opacity-60 mt-1 block text-right">{msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()} placeholder="Digite sua mensagem..." className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={isLoading} />
          <Button onClick={handleSendMessage} disabled={isLoading || !input.trim()} className="px-5 rounded-xl bg-blue-600 hover:bg-blue-700">{isLoading ? "⏳" : "📤"}</Button>
        </div>
        <p className="text-xs text-center text-gray-400 mt-2">Powered by Groq · Llama 3.3 70B</p>
      </div>
    </div>
  );
}
