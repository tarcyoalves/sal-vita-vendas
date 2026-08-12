import { useAuth } from '../_core/hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useState } from "react";
import { trpc } from '../lib/trpc';
import { Rocket, Zap, Cpu, CheckCircle2, XCircle } from "lucide-react";

interface AIProvider {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  defaultModel: string;
  requiresKey: boolean;
}

interface AIConfig {
  provider: string;
  model: string;
  apiKey: string;
  status: "not_configured" | "configured" | "testing" | "error";
  errorMessage?: string;
  lastTested?: string;
}

const AI_PROVIDERS: AIProvider[] = [
  {
    id: "groq",
    name: "Groq",
    icon: <Rocket size={28} className="text-blue-600" />,
    description: "Llama 3.3 70B — Líder, 14.400 req/dia grátis, confiável",
    defaultModel: "llama-3.3-70b-versatile",
    requiresKey: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    icon: <Zap size={28} className="text-amber-500" />,
    description: "GPT-OSS 120B — Fallback ultra-rápido, tier grátis generoso",
    defaultModel: "gpt-oss-120b",
    requiresKey: true,
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    icon: <Cpu size={28} className="text-emerald-500" />,
    description: "Llama 3.3 70B — Fallback, tier grátis via build.nvidia.com",
    defaultModel: "meta/llama-3.3-70b-instruct",
    requiresKey: true,
  },
];

export default function AiSettings() {
  const { user, loading: authLoading } = useAuth();
  // Todos os hooks ficam antes de qualquer return condicional (Regras de
  // Hooks do React) — declará-los depois de um `if (...) return` muda a
  // contagem de hooks entre o render de loading e o render final, e o React
  // quebra com "Rendered more hooks than during the previous render" (erro
  // #310) assim que `authLoading` vira false.
  const [selectedProvider, setSelectedProvider] = useState<string>("groq");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  // Resultados de teste desta sessão apenas — nada é persistido no navegador,
  // as chaves de produção ficam nas env vars da Vercel (ver caixa "Como funciona" abaixo).
  const [testStatus, setTestStatus] = useState<Record<string, AIConfig>>({});
  const testConnectionMutation = trpc.ai.testConnection.useMutation();
  const listModelsMutation = trpc.ai.listModels.useMutation();
  const [availableModels, setAvailableModels] = useState<{ id: string; contextLength: number | null; ownedBy: string | null }[] | null>(null);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-500">Apenas administradores podem acessar configurações de IA.</p>
      </div>
    );
  }

  const currentProvider = AI_PROVIDERS.find((p) => p.id === selectedProvider);

  const handleListModels = async () => {
    setError("");
    setAvailableModels(null);
    if (!apiKey.trim()) {
      setError("Cole a chave de API antes de listar os modelos");
      return;
    }
    try {
      const result = await listModelsMutation.mutateAsync({ provider: selectedProvider, apiKey });
      setAvailableModels(result.models);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Erro ao listar modelos: ${errorMessage}`);
    }
  };

  const handleSaveAndTest = async () => {
    setError("");
    if (!apiKey.trim()) {
      setError("Por favor, insira uma chave de API válida");
      return;
    }
    if (apiKey.length < 10) {
      setError("Chave de API parece inválida (muito curta)");
      return;
    }

    setTesting(true);

    try {
      // Chamar a rota tRPC para testar a conexão
      const result = await testConnectionMutation.mutateAsync({
        provider: selectedProvider,
        model: currentProvider?.defaultModel || "",
        apiKey: apiKey,
      });

      if (result.success) {
        setTestStatus((prev) => ({
          ...prev,
          [selectedProvider]: {
            provider: selectedProvider,
            model: currentProvider?.defaultModel || "",
            apiKey: apiKey.substring(0, 10) + "***",
            status: "configured",
            lastTested: new Date().toISOString(),
          },
        }));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        setApiKey("");
      } else {
        setError(result.message);
        setTestStatus((prev) => ({
          ...prev,
          [selectedProvider]: {
            provider: selectedProvider,
            model: currentProvider?.defaultModel || "",
            apiKey: apiKey.substring(0, 10) + "***",
            status: "error",
            errorMessage: result.message,
          },
        }));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Erro ao testar: ${errorMessage}`);
      setTestStatus((prev) => ({
        ...prev,
        [selectedProvider]: {
          provider: selectedProvider,
          model: currentProvider?.defaultModel || "",
          apiKey: apiKey.substring(0, 10) + "***",
          status: "error",
          errorMessage: errorMessage,
        },
      }));
    } finally {
      setTesting(false);
    }
  };

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200/80">
        <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Configurações de Inteligência Artificial</h1>
        <p className="text-xs md:text-sm text-slate-500 mt-0.5">
          Gerenciamento e teste de provedores LLM (Groq, Cerebras, NVIDIA NIM)
        </p>
      </div>

      {/* Select Provider */}
      <div className="saas-card p-5 space-y-4">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Provedores Suportados</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {AI_PROVIDERS.map((provider) => {
            const isSelected = selectedProvider === provider.id;
            return (
              <div
                key={provider.id}
                onClick={() => {
                  setSelectedProvider(provider.id);
                  setApiKey("");
                  setError("");
                  setAvailableModels(null);
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? "bg-blue-50/50 border-[#0C3680] shadow-xs"
                    : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-white border border-slate-100 shadow-2xs">
                    {provider.icon}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{provider.name}</h3>
                    {provider.id === "groq" && (
                      <span className="saas-badge saas-badge-info text-[10px] py-0 px-1.5 mt-0.5">Líder</span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{provider.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Test Provider Form */}
      {currentProvider && (
        <div className="saas-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Testar Chave de API — {currentProvider.name}</h2>
          <p className="text-xs text-slate-500">
            Informe sua API Key pessoal para validar conexões ou inspecionar os modelos disponíveis.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Chave da API ({currentProvider.name})
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Cole sua API Key do ${currentProvider.name}...`}
                  className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-2 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 bg-slate-100 rounded font-medium"
                >
                  {showKey ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">
                {error}
              </div>
            )}

            {saved && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 size={16} />
                <span>Conexão testada com sucesso no modelo {currentProvider.defaultModel}!</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={handleTestConnection}
                disabled={testing || !apiKey.trim()}
                className="bg-[#0C3680] hover:bg-[#081F47] text-white text-xs font-semibold py-2 px-4 rounded-lg"
              >
                {testing ? "Testando..." : "Testar Conexão"}
              </Button>
              <Button
                variant="outline"
                onClick={handleListModels}
                disabled={!apiKey.trim() || listModelsMutation.isPending}
                className="text-xs border-slate-200 text-slate-700 hover:bg-slate-50 py-2 px-4 rounded-lg"
              >
                {listModelsMutation.isPending ? "Listando..." : "Ver todos os modelos desta chave"}
              </Button>
            </div>

            {availableModels && (
              <div className="mt-3 border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-64 overflow-y-auto bg-slate-50/50">
                {availableModels.length === 0 ? (
                  <p className="text-xs text-slate-500 p-3">Nenhum modelo retornado para essa chave.</p>
                ) : (
                  availableModels.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-2.5 text-xs">
                      <span className="font-mono font-medium text-slate-800">{m.id}</span>
                      <span className="text-[11px] text-slate-400">
                        {m.ownedBy ? `${m.ownedBy} · ` : ""}{m.contextLength ? `${m.contextLength.toLocaleString("pt-BR")} tokens` : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configured IAs Status */}
      <div className="saas-card p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900">Status das IAs Testadas nesta Sessão</h2>
        <div className="space-y-2">
          {Object.values(testStatus).length === 0 ? (
            <p className="text-xs text-slate-500 italic">Nenhum teste de IA realizado ainda nesta sessão.</p>
          ) : (
            Object.values(testStatus).map((config) => (
              <div
                key={config.provider}
                className="flex items-center justify-between p-3 bg-slate-50/80 rounded-lg border border-slate-200/80 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900">
                    {AI_PROVIDERS.find((p) => p.id === config.provider)?.name ?? config.provider}
                    {config.provider === "groq" && <span className="saas-badge saas-badge-info ml-2 text-[10px]">Líder</span>}
                  </p>
                  <p className="text-slate-500 font-mono text-[11px] mt-0.5">{config.model}</p>
                  {config.status === "error" && config.errorMessage && (
                    <p className="text-[11px] text-rose-600 mt-1 break-all">{config.errorMessage}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {config.status === "configured" && (
                    <span className="saas-badge saas-badge-success">Conectado OK</span>
                  )}
                  {config.status === "error" && (
                    <span className="saas-badge saas-badge-danger">Erro</span>
                  )}
                  <button
                    onClick={() => {
                      setTestStatus(prev => { const n = { ...prev }; delete n[config.provider]; return n; });
                    }}
                    className="text-xs text-slate-400 hover:text-rose-600 transition-colors font-medium"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Free API Keys Guide */}
      <div className="saas-card p-5 bg-slate-50/50 border-slate-200/80 space-y-3">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Como obter Chaves Gratuitas</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-700">
          <div className="p-3 bg-white rounded-lg border border-slate-200/70">
            <strong className="text-slate-900 block mb-1">1. Groq (Recomendado)</strong>
            <p>• Acesse <span className="font-mono font-semibold text-blue-600">console.groq.com</span></p>
            <p>• 14.400 requisições/dia gratuitas</p>
            <p>• Modelo: <span className="font-mono">llama-3.3-70b-versatile</span></p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200/70">
            <strong className="text-slate-900 block mb-1">2. Cerebras</strong>
            <p>• Acesse <span className="font-mono font-semibold text-amber-600">cloud.cerebras.ai</span></p>
            <p>• Respostas instantâneas em milissegundos</p>
            <p>• Modelo: <span className="font-mono">gpt-oss-120b</span></p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200/70">
            <strong className="text-slate-900 block mb-1">3. NVIDIA NIM</strong>
            <p>• Acesse <span className="font-mono font-semibold text-emerald-600">build.nvidia.com</span></p>
            <p>• Tier gratuito via API Key NVIDIA</p>
            <p>• Modelo: <span className="font-mono">meta/llama-3.3-70b-instruct</span></p>
          </div>
        </div>
        <p className="text-[11px] text-slate-500 pt-1">
          As chaves de produção definitivas são armazenadas com segurança no ambiente Vercel (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">GROQ_API_KEY</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">CEREBRAS_API_KEY</code>, etc.).
        </p>
      </div>
    </div>
  );
}
