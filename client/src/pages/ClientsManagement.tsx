import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Users } from "lucide-react";

export default function ClientsManagement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: clients, isLoading } = trpc.clients.list.useQuery({});
  const { data: sellers } = trpc.sellers.list.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const importMutation = trpc.clients.importCsv.useMutation();

  const [showImportForm, setShowImportForm] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [selectedSeller, setSelectedSeller] = useState<number | null>(null);
  const [fileInput, setFileInput] = useState<File | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    city: "",
    state: "",
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const handleImport = async () => {
    if (!selectedSeller) {
      toast.error("Selecione um vendedor");
      return;
    }

    try {
      const result = await importMutation.mutateAsync({
        csvData: csvContent,
        sellerId: selectedSeller,
      });

      toast.success(`Importação concluída! ✅ ${result.success} leads importados${result.duplicates > 0 ? ` · ⚠️ ${result.duplicates} duplicatas` : ''}`);
      setCsvContent("");
      setShowImportForm(false);
    } catch (error) {
      toast.error(`Erro na importação: ${String(error)}`);
    }
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
          <Button size="sm" onClick={() => setShowImportForm(!showImportForm)}>
            {showImportForm ? "Cancelar" : "📥 Importar CSV"}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </div>

      {showImportForm && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle>Importar Leads via CSV</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Selecione o vendedor:
              </label>
              <select
                value={selectedSeller || ""}
                onChange={(e) => setSelectedSeller(Number(e.target.value))}
                className="w-full p-2 border rounded"
              >
                <option value="">-- Selecione --</option>
                {sellers?.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Cole o conteúdo do CSV (CNPJ, Nome, Contato, Telefone, Cidade, UF, Email):
              </label>
              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="CNPJ,Nome,Contato,Telefone,Cidade,UF,Email&#10;12345678000100,Empresa A,João,1133334444,São Paulo,SP,joao@email.com"
                className="w-full p-3 border rounded h-32 font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={importMutation.isPending}>
                {importMutation.isPending ? "Importando..." : "Importar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowImportForm(false)}
              >
                Cancelar
              </Button>
            </div>

            <p className="text-xs text-gray-600">
              💡 A IA detectará e removerá duplicidades automaticamente
            </p>
          </CardContent>
        </Card>
      )}

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
              <p className="text-sm text-gray-400 mt-1">Importe uma lista via CSV para começar.</p>
              <Button size="sm" className="mt-4" onClick={() => setShowImportForm(true)}>📥 Importar CSV</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
