import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function AiChat() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const logoutMutation = trpc.auth.logout.useMutation();
  const chatMutation = trpc.ai.chat.useMutation();
  const { data: chatHistory = [] } = trpc.chatHistory.getHistory.useQuery();
  const saveChatMutation = trpc.chatHistory.saveMessage.useMutation();
  const { data: tasks = [] } = trpc.tasks.list.useQuery();
  const { data: attendants = [] } = trpc.sellers.list.useQuery();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Carregar histórico
  useEffect(() => {
    if (chatHistory && chatHistory.length > 0) {
      const loadedMessages = chatHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.message,
        timestamp: new Date(msg.createdAt),
      }));
      setMessages(loadedMessages);
    } else {
      setMessages([
        {
          role: "assistant",
          content: "Olá! Sou seu assistente de IA. Posso ajudar com análises de performance, recomendações e estratégias. Como posso ajudar?",
          timestamp: new Date(),
        },
      ]);
    }
  }, [chatHistory]);

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const configs = JSON.parse(localStorage.getItem("aiConfigs") || "{}");
      const groqConfig = configs.groq;

      if (!groqConfig || !groqConfig.apiKey) {
        toast.error("Configure uma chave de IA primeiro");
        setIsLoading(false);
        return;
      }

      // Salvar mensagem do usuário
      await saveChatMutation.mutateAsync({
        role: "user",
        message: input,
      });

      // Enviar para IA
      const response = await chatMutation.mutateAsync({
        message: input,
        provider: "groq",
        apiKey: groqConfig.apiKey,
        model: groqConfig.model || "llama-3.1-8b-instant",
        conversationHistory: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      const responseText = typeof response === "string" ? response : JSON.stringify(response);

      const assistantMessage: Message = {
        role: "assistant",
        content: responseText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Salvar resposta
      await saveChatMutation.mutateAsync({
        role: "assistant",
        message: responseText,
      });
    } catch (error) {
      toast.error("Erro ao processar mensagem");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <a href="/" className="hover:opacity-80">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/logoSALVITA_grande_3761478e.png"
              alt="Sal Vita"
              className="h-32 cursor-pointer"
            />
          </a>
          <h1 className="text-2xl font-bold text-blue-900">💬 Chat com IA</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/admin/dashboard"><Button variant="outline" size="sm">📊 Dashboard</Button></a>
          <a href="/ai-settings"><Button variant="outline" size="sm">⚙️ Config IA</Button></a>
          <a href="/"><Button variant="outline" size="sm">🏠 Início</Button></a>
          <Button variant="destructive" size="sm" onClick={handleLogout}>Sair</Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 max-w-4xl mx-auto w-full">
        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto mb-4 bg-white rounded-lg border p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              Nenhuma mensagem ainda. Comece a conversar!
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-900"
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <span className="text-xs opacity-70 mt-1 block">
                    {msg.timestamp.toLocaleTimeString("pt-BR")}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && !isLoading && handleSendMessage()}
            placeholder="Digite sua mensagem..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            size="sm"
          >
            {isLoading ? "⏳" : "📤"}
          </Button>
        </div>

        {/* System Info */}
        <div className="mt-4 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
          <p>📋 Tarefas: {tasks.length} | 👥 Atendentes: {attendants.length}</p>
        </div>
      </div>
    </div>
  );
}
