import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { toast } from "sonner";

interface KnowledgeDoc {
  id: number;
  title: string;
  content: string;
  category: string | null;
  fileUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  userId: number;
}

export default function KnowledgeBase() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "",
  });

  const { data: docs = [], isLoading, refetch } = trpc.knowledge.list.useQuery();
  const createMutation = trpc.knowledge.create.useMutation();
  const deleteMutation = trpc.knowledge.delete.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title.trim() || !formData.content.trim()) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: formData.title,
        content: formData.content,
        category: formData.category || undefined,
      });

      toast.success("Documento adicionado à base de conhecimento!");
      setFormData({ title: "", content: "", category: "" });
      setShowForm(false);
      refetch();
    } catch (error) {
      toast.error("Erro ao adicionar documento");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Deletar este documento?")) {
      try {
        await deleteMutation.mutateAsync({ id });
        toast.success("Documento deletado");
        refetch();
      } catch (error) {
        toast.error("Erro ao deletar documento");
      }
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
        <div className="mb-4 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
          <p className="text-gray-600 text-sm">
            Adicione documentos, políticas e informações sobre sua empresa para que a IA tenha mais contexto.
          </p>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="flex-shrink-0">
            {showForm ? "❌ Cancelar" : "➕ Novo Documento"}
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Adicionar Novo Documento</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Título *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: Política de Vendas"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Categoria</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Ex: Políticas, Procedimentos, Informações"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Conteúdo *</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Cole aqui o conteúdo do documento..."
                    rows={8}
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "⏳ Salvando..." : "💾 Salvar Documento"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setFormData({ title: "", content: "", category: "" });
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Documents List */}
        {isLoading ? (
          <div className="text-center py-8">Carregando documentos...</div>
        ) : docs.length === 0 ? (
          <Card className="bg-blue-50">
            <CardContent className="pt-6 text-center">
              <p className="text-blue-900">
                Nenhum documento na base de conhecimento. Adicione documentos para que a IA tenha mais contexto sobre sua empresa.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {docs.map((doc: KnowledgeDoc) => (
              <Card key={doc.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{doc.title}</CardTitle>
                      {doc.category && (
                        <p className="text-sm text-gray-500 mt-1">📁 {doc.category}</p>
                      )}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                    >
                      🗑️
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 p-3 rounded-lg max-h-32 overflow-y-auto">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {doc.content.substring(0, 200)}
                      {doc.content.length > 200 ? "..." : ""}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    Adicionado em {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info Box */}
        <Card className="mt-8 bg-green-50">
          <CardHeader>
            <CardTitle className="text-sm">✅ Dicas para Melhor Resultado</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>📝 <strong>Adicione políticas de vendas:</strong> Procedimentos, metas, regras de negócio</p>
            <p>🏢 <strong>Informações da empresa:</strong> Missão, valores, produtos, serviços</p>
            <p>👥 <strong>Dados de atendentes:</strong> Especialidades, histórico de performance</p>
            <p>📊 <strong>Métricas importantes:</strong> KPIs, metas, benchmarks</p>
            <p>💡 <strong>Contexto do negócio:</strong> Mercado, concorrência, oportunidades</p>
          </CardContent>
        </Card>
    </div>
  );
}
