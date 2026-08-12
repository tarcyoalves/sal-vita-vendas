import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

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
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Base de Conhecimento IA</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Adicione documentos e diretrizes para alimentar o contexto do assistente de IA
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-[#0C3680] hover:bg-[#081F47] text-white font-medium shadow-xs transition-all flex-shrink-0"
        >
          {showForm ? "Cancelar" : "+ Novo Documento"}
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="saas-card p-5 border-slate-200 shadow-md">
          <h2 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">Adicionar Novo Documento</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Título do Documento *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Diretrizes de Vendas Sal Vita"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Categoria</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Ex: Políticas, Procedimentos, Catálogo"
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Conteúdo Textual *</label>
              <textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Cole aqui o conteúdo explicativo, regras de frete, scripts de vendas..."
                rows={7}
                className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs font-mono"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={createMutation.isPending} className="bg-[#0C3680] hover:bg-[#081F47] text-white text-sm font-medium">
                {createMutation.isPending ? "Salvando..." : "Salvar Documento"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setFormData({ title: "", content: "", category: "" });
                }}
                className="text-slate-600 border-slate-200 hover:bg-slate-50 text-sm"
              >
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Documents List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-slate-200 border-t-[#0C3680] mx-auto mb-2" />
          <p className="text-xs text-slate-400">Carregando documentos...</p>
        </div>
      ) : docs.length === 0 ? (
        <div className="saas-card p-8 text-center bg-blue-50/40 border-blue-100">
          <p className="text-sm font-medium text-slate-700">
            Nenhum documento cadastrado na base de conhecimento.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Clique no botão acima para adicionar instruções e politicas de negócio para a IA.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc: KnowledgeDoc) => (
            <div key={doc.id} className="saas-card p-5 flex flex-col justify-between hover:border-slate-300 transition-all">
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 tracking-tight">{doc.title}</h2>
                    {doc.category && (
                      <span className="saas-badge saas-badge-info mt-1.5">{doc.category}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Excluir documento"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg max-h-36 overflow-y-auto">
                  <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {doc.content.substring(0, 220)}
                    {doc.content.length > 220 ? "..." : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">
                  Adicionado em {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="saas-card p-5 bg-slate-50/60 border-slate-200/80">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">Boas práticas para Base de Conhecimento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
          <div className="p-3 bg-white rounded-lg border border-slate-200/60">
            <strong className="text-slate-800 block mb-1">Políticas & Preços:</strong>
            Regras de frete, descontos por volume, procedimentos comerciais.
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200/60">
            <strong className="text-slate-800 block mb-1">Informações do Produto:</strong>
            Origem marinha de Sal Vita, processos de secagem, diferenciais de mercado.
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200/60">
            <strong className="text-slate-800 block mb-1">Scripts de Atendimento:</strong>
            Dicas para reativação de clientes inativos e contornar objeções comuns.
          </div>
          <div className="p-3 bg-white rounded-lg border border-slate-200/60">
            <strong className="text-slate-800 block mb-1">Metas & Indicadores:</strong>
            Metas diárias de prospecção e acompanhamento de vendedores.
          </div>
        </div>
      </div>
    </div>
  );
}
