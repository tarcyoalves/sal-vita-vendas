import { useAuth } from '../_core/hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useState } from "react";
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
    id: "gemini",
    name: "Google Gemini",
    icon: "✨",
    description: "Gemini 2.5 Flash — Líder de análise, contexto enorme",
    defaultModel: "gemini-2.5-flash",
    requiresKey: true,
  },
  {
    id: "groq",
    name: "Groq",
    icon: "🚀",
    description: "Llama 3.3 70B — Suporte rápido, ferramentas",
    defaultModel: "llama-3.3-70b-versatile",
    requiresKey: true,
  },
];

export default function AiSettings() {
  const { user } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState<string>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<Record<string, AIConfig>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("aiConfigs") || "{}");
      const status: Record<string, AIConfig> = {};
      for (const [id, cfg] of Object.entries(saved as Record<string, any>)) {
        if (cfg?.status === "configured") {
          status[id] = {
            provider: id,
            model: cfg.model ?? "",
            apiKey: (cfg.apiKey ?? "").substring(0, 10) + "***",
            status: "configured",
            lastTested: cfg.lastTested,
          };
        }
      }
      return status;
    } catch { return {}; }
  });
  const testConnectionMutation = trpc.ai.testConnection.useMutation();

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
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
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
                        {AI_PROVIDERS.find((p) => p.id === config.provider)?.name ?? config.provider}
                        {config.provider === "gemini" && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">👑 Líder</span>}
                      </p>
                      <p className="text-sm text-gray-600">{config.model}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {config.status === "configured" && (
                        <div className="flex items-center gap-2">
                          <span className="text-green-600 font-medium">✅ OK</span>
                          <span className="text-xs text-gray-500">
                            {config.lastTested ? new Date(config.lastTested).toLocaleString("pt-BR") : ""}
                          </span>
                        </div>
                      )}
                      {config.status === "error" && (
                        <span className="text-red-600 font-medium">❌ Erro</span>
                      )}
                      <button
                        onClick={() => {
                          const aiConfigs = JSON.parse(localStorage.getItem("aiConfigs") || "{}");
                          delete aiConfigs[config.provider];
                          localStorage.setItem("aiConfigs", JSON.stringify(aiConfigs));
                          setTestStatus(prev => { const n = { ...prev }; delete n[config.provider]; return n; });
                        }}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        🗑️ Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Free API Keys Guide */}
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-green-900">🎁 Como pegar chaves grátis</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-green-800 space-y-3">
            <div className="p-3 bg-white rounded-lg border border-green-200">
              <p className="font-bold">🚀 Groq (recomendado)</p>
              <p className="mt-1">1. Acesse <span className="font-mono font-bold">console.groq.com</span></p>
              <p>2. Crie conta grátis</p>
              <p>3. Clique em <strong>API Keys → Create API Key</strong></p>
              <p>4. Cole aqui — modelo: <span className="font-mono">llama-3.3-70b-versatile</span></p>
            </div>
            <div className="p-3 bg-white rounded-lg border border-green-200">
              <p className="font-bold">✨ Google Gemini</p>
              <p className="mt-1">1. Acesse <span className="font-mono font-bold">aistudio.google.com</span></p>
              <p>2. Login com conta Google</p>
              <p>3. Clique em <strong>Get API Key → Create API key</strong></p>
              <p>4. Cole aqui — modelo: <span className="font-mono">gemini-2.5-flash</span></p>
            </div>
            <p className="text-xs text-green-700">• Ambos têm tier gratuito generoso para uso diário</p>
            <p className="text-xs text-green-700">• Chaves ficam salvas no seu navegador (localStorage)</p>
          </CardContent>
        </Card>

        {/* Info Box */}
        <Card className="bg-yellow-50 border-yellow-200">
          <CardHeader>
            <CardTitle className="text-yellow-900">ℹ️ Como funciona</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-yellow-800 space-y-2">
            <p>• Configure Gemini (líder) + Groq (suporte) para análises mais completas</p>
            <p>• Gemini tem prioridade — usa contexto maior para análises profundas</p>
            <p>• Clique "Salvar e Testar" para validar antes de usar</p>
            <p>• Se der erro 404 no Gemini: chave errada ou modelo não existe</p>
          </CardContent>
        </Card>
    </div>
  );
}
