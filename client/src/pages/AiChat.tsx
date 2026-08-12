import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const WELCOME: Message = {
  role: "assistant",
  content: "Olá! Sou seu assistente de IA da Sal Vita. Posso ajudar com dicas de vendas, análise de desempenho e estratégias. Como posso ajudar?",
  timestamp: new Date(),
};

export default function AiChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const chatMutation = trpc.ai.chat.useMutation();
  const clearHistoryMutation = trpc.ai.clearHistory.useMutation();

  // Fetch history imperatively once on mount — no reactive subscription means
  // no background refetch can ever overwrite local state after user interaction.
  useEffect(() => {
    utils.ai.history.fetch().then((data) => {
      const history = (data as any[]) ?? [];
      setMessages(
        history.length > 0
          ? history.map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: new Date(m.createdAt),
            }))
          : [WELCOME]
      );
    }).catch(() => {
      setMessages([WELCOME]);
    }).finally(() => {
      setHistoryReady(true);
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

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage: Message = { role: "user", content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsLoading(true);
    try {
      const response = await chatMutation.mutateAsync({ message: currentInput });
      setMessages(prev => [...prev, { role: "assistant", content: response.reply, timestamp: new Date() }]);
    } catch (error: any) {
      const errMsg = error?.message ?? "Erro ao processar mensagem";
      toast.error(errMsg);
      setMessages(prev => [...prev, { role: "assistant", content: errMsg, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200/80 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-bold text-slate-800 tracking-tight">Assistente Sal Vita AI</span>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">• Llama 3.3 70B</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          className="text-xs text-slate-600 border-slate-200 hover:bg-slate-50"
        >
          Limpar Histórico
        </Button>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col p-4 md:p-6 max-w-4xl mx-auto w-full min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto mb-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 md:p-6 space-y-4">
          {!historyReady ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-[#0C3680] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-[#0C3680] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-[#0C3680] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <p className="text-xs font-medium">Carregando conversa...</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-md lg:max-w-xl px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-xs ${
                    msg.role === "user"
                      ? "bg-[#0C3680] text-white rounded-br-xs"
                      : "bg-slate-100/90 border border-slate-200/60 text-slate-900 rounded-bl-xs"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className={`text-[10px] mt-1.5 block text-right font-medium ${msg.role === "user" ? "text-blue-200/70" : "text-slate-400"}`}>
                    {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 border border-slate-200/60 rounded-2xl rounded-bl-xs px-4 py-3">
                <div className="flex gap-1.5 items-center">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-xs text-slate-400 font-medium ml-2">Pensando...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
            placeholder="Pergunte sobre estratégias de vendas, clientes ou produtos..."
            className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] shadow-xs transition-all"
            disabled={isLoading || !historyReady}
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !historyReady || !input.trim()}
            className="px-5 rounded-xl bg-[#0C3680] hover:bg-[#081F47] text-white shadow-xs transition-all min-h-[44px] flex items-center justify-center gap-2"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
          </Button>
        </div>
        <p className="text-[11px] text-center text-slate-400 mt-2 font-medium">
          Sal Vita Intelligence Engine • Llama 3.3 70B via Groq
        </p>
      </div>
    </div>
  );
}
