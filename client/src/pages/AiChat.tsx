import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { useConfirm } from '../components/useConfirm';
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
  const { confirm, confirmDialog } = useConfirm();
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
    if (!(await confirm("Limpar todo o histórico do chat?", { confirmLabel: "Limpar" }))) return;
    try {
      await clearHistoryMutation.mutateAsync();
      setMessages([{ role: "assistant", content: "Histórico limpo. Como posso ajudar?", timestamp: new Date() }]);
      utils.ai.history.invalidate();
      toast.success("Histórico limpo");
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível limpar o histórico");
    }
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
      // Falhou: tira a mensagem otimista e devolve o texto ao campo (se o usuário ainda
      // não digitou outra coisa) para ele reenviar sem redigitar.
      setMessages(prev => prev.filter(m => m !== userMessage));
      setInput(prev => prev || currentInput);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {confirmDialog}
      {/* Barra do chat */}
      <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 leading-tight">Chat IA</h1>
          <p className="text-xs text-slate-500">Assistente de vendas da Sal Vita (Llama 3.3 70B via Groq)</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleClearHistory}>
          Limpar histórico
        </Button>
      </div>

      {/* Conversa */}
      <div className="flex-1 flex flex-col p-4 md:p-6 max-w-4xl mx-auto w-full min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto mb-4 bg-white rounded-lg border border-slate-200 p-4 md:p-5 space-y-3" aria-live="polite">
          {!historyReady ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-12 w-3/5" />
              <Skeleton className="ml-auto h-10 w-2/5" />
              <Skeleton className="h-16 w-3/5" />
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-md lg:max-w-xl px-3.5 py-2.5 rounded-lg text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <span className={`text-xs mt-1 block text-right tabular-nums ${msg.role === "user" ? "text-brand-100" : "text-slate-500"}`}>
                    {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Pensando...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Entrada */}
        <div className="flex gap-2">
          <Input
            type="text"
            aria-label="Mensagem para o assistente"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
            placeholder="Pergunte sobre estratégias de vendas, clientes ou produtos"
            className="h-10 flex-1"
            disabled={isLoading || !historyReady}
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !historyReady || !input.trim()}
            aria-label="Enviar mensagem"
            size="icon"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
