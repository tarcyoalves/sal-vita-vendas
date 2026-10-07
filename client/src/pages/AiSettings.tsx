import { useAuth } from '../_core/hooks/useAuth';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Page, PageHeader, Panel, PanelHeader, AccessDenied } from '../components/layout/Page';
import { useState } from "react";
import { trpc } from '../lib/trpc';
import { CheckCircle2 } from "lucide-react";

interface AIProvider {
  id: string;
  name: string;
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
    description: "Llama 3.3 70B — principal, 14.400 req/dia grátis, confiável",
    defaultModel: "llama-3.3-70b-versatile",
    requiresKey: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    description: "GPT-OSS 120B — fallback ultra-rápido, tier grátis generoso",
    defaultModel: "gpt-oss-120b",
    requiresKey: true,
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    description: "Llama 3.3 70B — fallback, tier grátis via build.nvidia.com",
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
      <Page>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-32 w-full" />
      </Page>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-sm text-slate-500">Apenas administradores podem acessar configurações de IA.</p>
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

  const handleTestConnection = async () => {
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
    return <AccessDenied area="Configurações de IA" />;
  }

  return (
    <Page>
      <PageHeader
        title="Configurações IA"
        description="Teste e confira os provedores de modelo de linguagem (Groq, Cerebras, NVIDIA NIM)."
      />

      <Panel>
        <PanelHeader title="Provedor" description="Escolha qual provedor testar." />
        <div role="radiogroup" aria-label="Provedor de IA" className="divide-y divide-slate-200">
          {AI_PROVIDERS.map((provider) => {
            const isSelected = selectedProvider === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  setSelectedProvider(provider.id);
                  setApiKey("");
                  setError("");
                  setAvailableModels(null);
                }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                  isSelected ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-1 size-3.5 shrink-0 rounded-full border ${
                    isSelected ? "border-brand-700 bg-brand-700 ring-2 ring-inset ring-white" : "border-slate-300 bg-white"
                  }`}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{provider.name}</span>
                    {provider.id === "groq" && <Badge variant="info">Principal</Badge>}
                  </span>
                  <span className="block text-xs text-slate-500">{provider.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {currentProvider && (
        <Panel>
          <PanelHeader
            title={`Testar chave de API — ${currentProvider.name}`}
            description="Informe uma chave para validar a conexão ou listar os modelos disponíveis. A chave não é salva."
          />
          <div className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="ai-key">Chave da API ({currentProvider.name})</Label>
              <div className="flex gap-2">
                <Input
                  id="ai-key"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Cole a API key do ${currentProvider.name}`}
                  autoComplete="off"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={() => setShowKey(!showKey)}>
                  {showKey ? "Ocultar" : "Mostrar"}
                </Button>
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {saved && (
              <div role="status" className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 size={16} aria-hidden />
                <span>Conexão testada com sucesso no modelo {currentProvider.defaultModel}.</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleTestConnection} disabled={testing || !apiKey.trim()}>
                {testing ? "Testando..." : "Testar conexão"}
              </Button>
              <Button variant="outline" onClick={handleListModels} disabled={!apiKey.trim() || listModelsMutation.isPending}>
                {listModelsMutation.isPending ? "Listando..." : "Ver modelos desta chave"}
              </Button>
            </div>

            {availableModels && (
              <div className="max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200">
                {availableModels.length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">Nenhum modelo retornado para essa chave.</p>
                ) : (
                  availableModels.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="break-all font-medium text-slate-900">{m.id}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {m.ownedBy ? `${m.ownedBy} · ` : ""}{m.contextLength ? `${m.contextLength.toLocaleString("pt-BR")} tokens` : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Testes desta sessão" description="Resultados ficam só nesta tela e somem ao recarregar." />
        {Object.values(testStatus).length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Nenhum teste realizado ainda nesta sessão.</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {Object.values(testStatus).map((config) => (
              <li key={config.provider} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {AI_PROVIDERS.find((p) => p.id === config.provider)?.name ?? config.provider}
                  </p>
                  <p className="text-xs text-slate-500">{config.model}</p>
                  {config.status === "error" && config.errorMessage && (
                    <p className="mt-1 break-all text-xs text-red-700">{config.errorMessage}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {config.status === "configured" && <Badge variant="success">Conectado</Badge>}
                  {config.status === "error" && <Badge variant="danger">Erro</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTestStatus(prev => { const n = { ...prev }; delete n[config.provider]; return n; });
                    }}
                    title="Só limpa este resultado da tela; não altera nenhuma configuração"
                  >
                    Limpar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Como obter chaves gratuitas" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 text-sm text-slate-700 md:grid-cols-3">
          <div>
            <p className="font-medium text-slate-900">1. Groq (recomendado)</p>
            <p className="mt-1 text-slate-500">Acesse <span className="font-medium text-brand-700">console.groq.com</span>. 14.400 requisições/dia grátis. Modelo: llama-3.3-70b-versatile.</p>
          </div>
          <div>
            <p className="font-medium text-slate-900">2. Cerebras</p>
            <p className="mt-1 text-slate-500">Acesse <span className="font-medium text-brand-700">cloud.cerebras.ai</span>. Respostas em milissegundos. Modelo: gpt-oss-120b.</p>
          </div>
          <div>
            <p className="font-medium text-slate-900">3. NVIDIA NIM</p>
            <p className="mt-1 text-slate-500">Acesse <span className="font-medium text-brand-700">build.nvidia.com</span>. Tier grátis com API key NVIDIA. Modelo: meta/llama-3.3-70b-instruct.</p>
          </div>
        </div>
        <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          As chaves de produção ficam no ambiente Vercel (<code className="rounded-sm bg-slate-100 px-1 py-0.5 text-slate-700">GROQ_API_KEY</code>, <code className="rounded-sm bg-slate-100 px-1 py-0.5 text-slate-700">CEREBRAS_API_KEY</code>, etc.).
        </p>
      </Panel>
    </Page>
  );
}
