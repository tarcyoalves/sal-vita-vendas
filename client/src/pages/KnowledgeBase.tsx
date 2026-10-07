import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Page, PageHeader, Panel, PanelHeader, EmptyState } from '../components/layout/Page';
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { QueryError } from "../components/QueryError";
import { ConfirmDialog } from "../components/ConfirmDialog";

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

  const { data: docs = [], isLoading, isError, isFetching, refetch } = trpc.knowledge.list.useQuery();
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
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
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Documento deletado");
      refetch();
    } catch (error) {
      toast.error("Erro ao deletar documento");
    }
  };

  return (
    <Page>
      <PageHeader
        title="Base de Conhecimento"
        description="Documentos e diretrizes que alimentam o contexto do assistente de IA."
        actions={
          <Button variant={showForm ? "outline" : "default"} onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancelar" : (<><Plus /> Novo documento</>)}
          </Button>
        }
      />

      {showForm && (
        <Panel>
          <PanelHeader title="Novo documento" />
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="kb-title">Título *</Label>
                <Input
                  id="kb-title"
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Diretrizes de vendas Sal Vita"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kb-category">Categoria</Label>
                <Input
                  id="kb-category"
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Políticas, Procedimentos, Catálogo"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kb-content">Conteúdo *</Label>
              <Textarea
                id="kb-content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Cole aqui o conteúdo explicativo, regras de frete, scripts de vendas..."
                rows={7}
              />
            </div>

            <div className="flex justify-end gap-2">
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
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar documento"}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {isLoading ? (
        <Panel className="divide-y divide-slate-200" as="div">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-3" aria-busy="true">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </Panel>
      ) : isError && docs.length === 0 ? (
        <QueryError onRetry={() => refetch()} retrying={isFetching} />
      ) : docs.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<BookOpen />}
            title="Nenhum documento na base de conhecimento"
            description="Adicione instruções e políticas do negócio para a IA usar nas respostas."
            action={!showForm ? <Button onClick={() => setShowForm(true)}><Plus /> Novo documento</Button> : undefined}
          />
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title="Documentos" description={`${docs.length} ${docs.length === 1 ? "documento" : "documentos"}`} />
          <ul className="divide-y divide-slate-200">
            {docs.map((doc: KnowledgeDoc) => (
              <li key={doc.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">{doc.title}</h2>
                    {doc.category && <Badge variant="info">{doc.category}</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 line-clamp-3">
                    {doc.content.substring(0, 220)}
                    {doc.content.length > 220 ? "..." : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Adicionado em {new Date(doc.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirmDeleteId(doc.id)}
                  aria-label={`Excluir documento ${doc.title}`}
                  title="Excluir documento"
                  className="text-slate-500 hover:text-red-700"
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="O que vale cadastrar" />
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-slate-900">Políticas e preços</dt>
            <dd className="text-slate-500">Regras de frete, descontos por volume, procedimentos comerciais.</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Informações do produto</dt>
            <dd className="text-slate-500">Origem marinha do Sal Vita, processos de secagem, diferenciais de mercado.</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Scripts de atendimento</dt>
            <dd className="text-slate-500">Dicas para reativar clientes inativos e contornar objeções comuns.</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Metas e indicadores</dt>
            <dd className="text-slate-500">Metas diárias de prospecção e acompanhamento de vendedores.</dd>
          </div>
        </dl>
      </Panel>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}
        title="Deletar este documento?"
        confirmLabel="Deletar"
        onConfirm={() => { if (confirmDeleteId !== null) void handleDelete(confirmDeleteId); }}
      />
    </Page>
  );
}
