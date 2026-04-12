import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CallHistory() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const { data: results, isLoading } = trpc.results.list.useQuery({
    sellerId: user?.role === "admin" ? undefined : user?.id,
  });

  const filteredResults = results?.filter((result: any) => {
    if (filterStatus !== "all" && result.resultType !== filterStatus) return false;
    if (filterStartDate && new Date(result.completedAt || "") < new Date(filterStartDate)) return false;
    if (filterEndDate && new Date(result.completedAt || "") > new Date(filterEndDate)) return false;
    return true;
  }) || [];

  const getResultColor = (type: string) => {
    switch (type) {
      case "realizada":
        return "bg-green-100 text-green-800";
      case "convertida":
        return "bg-blue-100 text-blue-800";
      case "reagendada":
        return "bg-yellow-100 text-yellow-800";
      case "nao_atendida":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getResultLabel = (type: string) => {
    switch (type) {
      case "realizada":
        return "✅ Realizada";
      case "convertida":
        return "💰 Convertida";
      case "reagendada":
        return "📅 Reagendada";
      case "nao_atendida":
        return "❌ Não Atendida";
      default:
        return type;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
          <h1 className="text-3xl font-bold text-blue-900">📋 Histórico de Ligações</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/admin/dashboard"><Button variant="outline">📊 Dashboard</Button></a>
          <a href="/tasks"><Button variant="outline">📋 Tarefas</Button></a>
          <a href="/ai-chat"><Button variant="outline">💬 Chat</Button></a>
          <a href="/"><Button variant="outline">🏠 Início</Button></a>
          <Button variant="destructive" onClick={handleLogout}>Sair</Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option value="all">Todos</option>
                <option value="realizada">Realizada</option>
                <option value="convertida">Convertida</option>
                <option value="reagendada">Reagendada</option>
                <option value="nao_atendida">Não Atendida</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Data Inicial</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="w-full p-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Data Final</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="w-full p-2 border rounded-lg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8">Carregando...</div>
      ) : filteredResults.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Nenhuma ligação encontrada</div>
      ) : (
        <div className="space-y-4">
          {filteredResults.map((result: any) => (
            <Card key={result.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getResultColor(result.resultType)}`}>
                        {getResultLabel(result.resultType)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {result.completedAt
                          ? format(new Date(result.completedAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
                          : "Sem data"}
                      </span>
                    </div>

                    {result.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{result.notes}</p>
                      </div>
                    )}

                    {result.nextScheduledDate && (
                      <div className="mt-2 text-sm text-blue-600">
                        📅 Próximo agendamento: {format(new Date(result.nextScheduledDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-3xl font-bold text-blue-600">{filteredResults.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600">Realizadas</p>
            <p className="text-3xl font-bold text-green-600">
              {filteredResults.filter((r: any) => r.resultType === "realizada").length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600">Convertidas</p>
            <p className="text-3xl font-bold text-blue-600">
              {filteredResults.filter((r: any) => r.resultType === "convertida").length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-600">Taxa Conversão</p>
            <p className="text-3xl font-bold text-purple-600">
              {filteredResults.length > 0
                ? Math.round(
                    (filteredResults.filter((r: any) => r.resultType === "convertida").length / filteredResults.length) * 100
                  )
                : 0}
              %
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
    </div>
  );
}
