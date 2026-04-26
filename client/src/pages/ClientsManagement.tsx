import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";
import { Users } from "lucide-react";

export default function ClientsManagement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: clients, isLoading } = trpc.clients.list.useQuery({});
  const logoutMutation = trpc.auth.logout.useMutation();

  const [filters, setFilters] = useState({
    search: "",
    city: "",
    state: "",
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 pb-4 border-b">
        <div className="flex items-center gap-3">
          <a href="/" className="hover:opacity-80 transition flex-shrink-0">
            <img
              src="/sal-vita-logo.svg"
              alt="Sal Vita"
              className="h-8 md:h-12 cursor-pointer"
            />
          </a>
          <h1 className="text-xl md:text-3xl font-bold text-blue-900">Gestão de Clientes</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/">
            <Button variant="outline" size="sm">🏠 Início</Button>
          </a>
          <Button size="sm" variant="destructive" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="Cidade..."
            value={filters.city}
            onChange={(e) => setFilters({ ...filters, city: e.target.value })}
            className="p-2 border rounded"
          />
          <input
            type="text"
            placeholder="UF..."
            maxLength={2}
            value={filters.state}
            onChange={(e) =>
              setFilters({ ...filters, state: e.target.value.toUpperCase() })
            }
            className="p-2 border rounded"
          />
        </CardContent>
      </Card>

      {/* Lista de Clientes */}
      <Card>
        <CardHeader>
          <CardTitle>
            Clientes ({clients?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Carregando...</p>
          ) : clients && clients.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left hidden md:table-cell">CNPJ</th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left hidden sm:table-cell">Cidade/UF</th>
                    <th className="p-2 text-left hidden lg:table-cell">Email</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-b hover:bg-gray-50">
                      <td className="p-2 hidden md:table-cell text-gray-500 text-xs">{client.cnpj || "--"}</td>
                      <td className="p-2 font-medium">{client.name}</td>
                      <td className="p-2">{client.phone}</td>
                      <td className="p-2 hidden sm:table-cell text-gray-500">{[client.city, client.state].filter(Boolean).join(' - ') || '--'}</td>
                      <td className="p-2 hidden lg:table-cell text-blue-600 text-xs">{client.email || "--"}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            client.status === "active"
                              ? "bg-green-100 text-green-800"
                              : client.status === "prospect"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {client.status === "active" ? "Ativo" : client.status === "prospect" ? "Prospecto" : client.status === "inactive" ? "Inativo" : client.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-10">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum cliente cadastrado</p>
              <p className="text-sm text-gray-400 mt-1">Nenhum cliente cadastrado ainda.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
