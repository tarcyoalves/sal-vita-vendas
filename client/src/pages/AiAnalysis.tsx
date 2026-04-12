import { useAuth } from './_core/hooks/useAuth';
import { trpc } from './lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";

export default function AiAnalysis() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: sellers } = trpc.sellers.list.useQuery();
  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [fraudResult, setFraudResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const analyzeMutation = trpc.ai.analyzeSeller.useMutation();
  const fraudMutation = trpc.ai.detectFraud.useMutation();

  const handleLogout = async () => {
    try {
      await trpc.auth.logout.useMutation().mutateAsync();
      setLocation("/");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  const handleAnalyze = async () => {
    if (!selectedSellerId) return;
    setLoading(true);
    try {
      const result = await analyzeMutation.mutateAsync({ sellerId: selectedSellerId });
      setAnalysisResult(result);
    } catch (error) {
      console.error("Error analyzing:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDetectFraud = async () => {
    if (!selectedSellerId) return;
    setLoading(true);
    try {
      const result = await fraudMutation.mutateAsync({ sellerId: selectedSellerId });
      setFraudResult(result);
    } catch (error) {
      console.error("Error detecting fraud:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <a href="/" className="hover:opacity-80 transition">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/sal_vita_logo_d22b1eb4.webp"
              alt="Sal Vita"
              className="h-10 cursor-pointer"
            />
          </a>
          <h1 className="text-2xl font-bold text-blue-900">🤖 Análise com IA</h1>
        </div>
        <div className="flex gap-2">
          <a href="/">
            <Button variant="outline">🏠 Início</Button>
          </a>
          <Button variant="destructive" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Selecionar Vendedor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              value={selectedSellerId || ""}
              onChange={(e) => setSelectedSellerId(parseInt(e.target.value))}
              className="w-full p-2 border rounded-lg"
            >
              <option value="">-- Selecione um vendedor --</option>
              {sellers?.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>

            <div className="flex gap-4">
              <Button onClick={handleAnalyze} disabled={!selectedSellerId || loading}>
                {loading ? "Analisando..." : "Analisar Performance"}
              </Button>
              <Button onClick={handleDetectFraud} disabled={!selectedSellerId || loading} variant="outline">
                {loading ? "Verificando..." : "Detectar Fraude"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {analysisResult && (
          <Card>
            <CardHeader>
              <CardTitle>Análise de Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">Score de Performance</p>
                  <p className="text-3xl font-bold text-blue-600">{analysisResult.performanceScore}%</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-gray-600">Risco de Fraude</p>
                  <p className="text-3xl font-bold text-red-600">{analysisResult.fraudRiskScore}%</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Insights</h3>
                <p className="text-gray-700">{analysisResult.insights}</p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Recomendações</h3>
                <p className="text-gray-700">{analysisResult.recommendations}</p>
              </div>

              {analysisResult.suspiciousPatterns && analysisResult.suspiciousPatterns.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Padrões Suspeitos</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {analysisResult.suspiciousPatterns.map((pattern: string, idx: number) => (
                      <li key={idx} className="text-gray-700">{pattern}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {fraudResult && (
          <Card>
            <CardHeader>
              <CardTitle>Detecção de Fraude</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`p-4 rounded-lg ${fraudResult.isFraud ? "bg-red-50" : "bg-green-50"}`}>
                <p className="text-sm text-gray-600">Status</p>
                <p className={`text-2xl font-bold ${fraudResult.isFraud ? "text-red-600" : "text-green-600"}`}>
                  {fraudResult.isFraud ? "⚠️ Possível Fraude" : "✅ Sem Indicadores de Fraude"}
                </p>
              </div>

              <div className="p-4 bg-orange-50 rounded-lg">
                <p className="text-sm text-gray-600">Risco de Fraude</p>
                <p className="text-2xl font-bold text-orange-600">{fraudResult.riskScore}%</p>
              </div>

              {fraudResult.patterns && fraudResult.patterns.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Padrões Detectados</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {fraudResult.patterns.map((pattern: string, idx: number) => (
                      <li key={idx} className="text-gray-700">{pattern}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
