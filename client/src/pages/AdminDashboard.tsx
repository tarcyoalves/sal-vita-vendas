import { useAuth } from './_core/hooks/useAuth';
import { trpc } from './lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Button } from './components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: sellers, isLoading } = trpc.sellers.list.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const [showNewSellerForm, setShowNewSellerForm] = useState(false);

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <a href="/" className="hover:opacity-80 transition">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/logoSALVITA_grande_3761478e.png"
              alt="Sal Vita"
              className="h-32 cursor-pointer"
            />
          </a>
          <h1 className="text-3xl font-bold text-blue-900">Dashboard Admin</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/admin/ai-analysis">
            <Button variant="outline">📊 Análise IA</Button>
          </a>
          <a href="/admin/clients">
            <Button variant="outline">👥 Clientes</Button>
          </a>
          <a href="/atendentes">
            <Button variant="outline">👤 Atendentes</Button>
          </a>
          <a href="/tasks">
            <Button variant="outline">📋 Tarefas</Button>
          </a>
          <a href="/ai-chat">
            <Button variant="outline">💬 Chat IA</Button>
          </a>
          <a href="/ai-settings">
            <Button variant="outline">⚙️ Config IA</Button>
          </a>
          <a href="/knowledge-base">
            <Button variant="outline">📚 Base de Conhecimento</Button>
          </a>
          <a href="/history">
            <Button variant="outline">📋 Histórico</Button>
          </a>
          <a href="/">
            <Button variant="outline">🏠 Início</Button>
          </a>
          <Button variant="destructive" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {showNewSellerForm && (
          <Card>
            <CardHeader>
              <CardTitle>Adicionar Novo Atendente</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Formulário de novo atendente (em desenvolvimento)</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Total de Atendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">{sellers?.length || 0}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Meta Diária Cumprida</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">--</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Taxa de Conversão</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">--</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Atendentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p>Carregando...</p>
            ) : sellers && sellers.length > 0 ? (
              <div className="space-y-2">
                {sellers.map((seller) => (
                  <div key={seller.id} className="p-3 border rounded-lg">
                    <p className="font-semibold">{seller.name}</p>
                    <p className="text-sm text-gray-600">{seller.email}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-600">Nenhum atendente cadastrado</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
