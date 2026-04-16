import { useAuth } from '../_core/hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from '../lib/trpc';

interface AIProvider {
  id: string;
  name: string;
  icon: string;
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
    id: "openai",
    name: "OpenAI",
    icon: "🤖",
    description: "GPT-3.5-turbo - Rápido e confiável",
    defaultModel: "gpt-3.5-turbo",
    requiresKey: true,
  },
  {
    id: "groq",
    name: "Groq",
    icon: "🚀",
    description: "Llama 3.1 8B - Rápido e eficiente",
    defaultModel: "llama-3.1-8b-instant",
    requiresKey: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "✨",
    description: "Gemini 1.5 Flash - Rápido e eficiente",
    defaultModel: "gemini-1.5-flash",
    requiresKey: true,
  },
  {
    id: "grok",
    name: "Grok (xAI)",
    icon: "⚡",
    description: "Grok-1 - Rápido e poderoso",
    defaultModel: "grok-1",
    requiresKey: true,
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    icon: "🧠",
    description: "Claude 3 Sonnet - Preciso e criativo",
    defaultModel: "claude-3-sonnet",
    requiresKey: true,
  },
];

export default function AiSettings() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedProvider, setSelectedProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, AIConfig>>({});
  const logoutMutation = trpc.auth.logout.useMutation();
  const testConnectionMutation = trpc.ai.testConnection.useMutation();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const currentProvider = AI_PROVIDERS.find((p) => p.id === selectedProvider);

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
        // Salvar cada IA com sua própria chave
        const aiConfigs = JSON.parse(localStorage.getItem("aiConfigs") || "{}");
        aiConfigs[selectedProvider] = {
          provider: selectedProvider,
          model: currentProvider?.defaultModel,
          apiKey: apiKey,
          status: "configured",
          lastTested: new Date().toISOString(),
        };
        localStorage.setItem("aiConfigs", JSON.stringify(aiConfigs));

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
        setError(`❌ ${result.message}`);
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
      setError(`❌ Erro ao testar: ${errorMessage}`);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <a href="/" className="hover:opacity-80 transition flex-shrink-0">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/logoSALVITA_grande_3761478e.png"
                alt="Sal Vita"
                className="h-8 cursor-pointer"
              />
            </a>
            <h1 className="text-base sm:text-2xl font-bold text-blue-900 truncate">⚙️ Config IA</h1>
          </div>
          <div className="flex gap-1 sm:gap-2 flex-shrink-0">
            <a href="/ai-chat">
              <Button variant="outline" size="sm"><span className="hidden sm:inline">💬 Chat IA</span><span className="sm:hidden">💬</span></Button>
            </a>
            <a href="/">
              <Button variant="outline" size="sm"><span className="hidden sm:inline">🏠 Início</span><span className="sm:hidden">🏠</span></Button>
            </a>
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              <span className="hidden sm:inline">Sair</span><span className="sm:hidden">✕</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Status Messages */}
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg flex items-center gap-2">
            <span>✅</span>
            <span>Configuração salva e testada com sucesso!</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-center gap-2">
            <span>❌</span>
            <span>{error}</span>
          </div>
        )}

        {/* Provider Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Selecione o Provedor de IA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {AI_PROVIDERS.map((provider) => {
                const config = testStatus[provider.id];
                const isConfigured = config?.status === "configured";
                const hasError = config?.status === "error";

                return (
                  <button
                    key={provider.id}
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setApiKey("");
                    }}
                    className={`p-4 rounded-lg border-2 transition text-left relative ${
                      selectedProvider === provider.id
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {/* Status Badge */}
                    {isConfigured && (
                      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                        ✅ OK
                      </div>
                    )}
                    {hasError && (
                      <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                        ❌ Erro
                      </div>
                    )}

                    <div className="text-3xl mb-2">{provider.icon}</div>
                    <h3 className="font-bold text-lg">{provider.name}</h3>
                    <p className="text-sm text-gray-600">{provider.description}</p>
                    <p className="text-xs text-gray-500 mt-2">
                      Modelo: <span className="font-mono">{provider.defaultModel}</span>
                    </p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Credentials */}
        {currentProvider && (
          <Card>
            <CardHeader>
              <CardTitle>Adicione sua Chave de API</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  🔐 Chave de API {currentProvider.name}
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Cada IA terá sua própria chave armazenada com segurança. O modelo padrão é: <span className="font-mono font-bold">{currentProvider.defaultModel}</span>
                </p>
                <div className="flex gap-2">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Cole sua chave de API do ${currentProvider.name}...`}
                    className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Button
                    variant="outline"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? "👁️ Ocultar" : "👁️ Mostrar"}
                  </Button>
                </div>
              </div>

              {/* Save and Test Button */}
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveAndTest}
                  disabled={!apiKey.trim() || testing}
                  className="bg-green-600 hover:bg-green-700 flex-1"
                >
                  {testing ? "🔄 Testando e Salvando..." : "✅ Salvar e Testar"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setApiKey("");
                    setError("");
                  }}
                >
                  🔄 Limpar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Configured IAs Status */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle>📊 Status das IAs Configuradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.values(testStatus).length === 0 ? (
                <p className="text-gray-600">Nenhuma IA configurada ainda.</p>
              ) : (
                Object.values(testStatus).map((config) => (
                  <div
                    key={config.provider}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">
                        {AI_PROVIDERS.find((p) => p.id === config.provider)?.name}
                      </p>
                      <p className="text-sm text-gray-600">{config.model}</p>
                    </div>
                    <div className="text-right">
                      {config.status === "configured" && (
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 font-medium">✅ OK</span>
                          <span className="text-xs text-gray-500">
                            {new Date(config.lastTested || "").toLocaleString("pt-BR")}
                          </span>
                        </div>
                      )}
                      {config.status === "error" && (
                        <div className="flex items-center gap-2">
                          <span className="text-red-600 font-medium">❌ Erro</span>
                          <span className="text-xs text-red-500">{config.errorMessage}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader>
            <CardTitle className="text-yellow-900">ℹ️ Informações Importantes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-yellow-800 space-y-2">
            <p>
              • Cada IA tem sua própria chave armazenada separadamente
            </p>
            <p>
              • O modelo padrão é selecionado automaticamente para cada IA
            </p>
            <p>
              • Clique em "Salvar e Testar" para validar a chave automaticamente
            </p>
            <p>
              • Você pode usar múltiplas IAs simultaneamente
            </p>
            <p>
              • Recomendado: Groq (mais barato) + OpenAI (mais preciso)
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
