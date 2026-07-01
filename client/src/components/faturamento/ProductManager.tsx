import { useState, useRef } from "react";
import { useFatStore } from "../../lib/faturamento/store";
import { formatBRL, parseBRL, formatKg } from "../../lib/faturamento/calc";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import type { Produto } from "../../lib/faturamento/types";

export default function ProductManager() {
  const { produtos: produtosList, actions } = useFatStore();
  const [nome, setNome] = useState("");
  const [peso, setPeso] = useState("");
  const [valor, setValor] = useState("");
  const nomeRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editing, setEditing] = useState<Produto | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPeso, setEditPeso] = useState("");
  const [editValor, setEditValor] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNome = nome.trim();
    if (!trimmedNome) {
      toast.error("Informe o nome do produto");
      return;
    }
    const pesoNum = parseBRL(peso);
    const valorNum = parseBRL(valor);
    if (pesoNum <= 0) {
      toast.error("Peso unitário deve ser maior que zero");
      return;
    }
    if (valorNum <= 0) {
      toast.error("Valor unitário deve ser maior que zero");
      return;
    }

    actions.produtos.upsert({
      nome: trimmedNome.toUpperCase(),
      pesoUnitarioKg: pesoNum,
      valorUnitario: valorNum,
      ativo: true,
    });

    setNome("");
    setPeso("");
    setValor("");
    nomeRef.current?.focus();
    toast.success("Produto adicionado");
  };

  const handleEditOpen = (prod: Produto) => {
    setEditing(prod);
    setEditNome(prod.nome);
    setEditPeso(String(prod.pesoUnitarioKg));
    setEditValor(String(prod.valorUnitario));
  };

  const handleEditSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const trimmedNome = editNome.trim();
    if (!trimmedNome) {
      toast.error("Informe o nome do produto");
      return;
    }
    const pesoNum = parseBRL(editPeso);
    const valorNum = parseBRL(editValor);
    if (pesoNum <= 0 || valorNum <= 0) {
      toast.error("Peso e valor devem ser maiores que zero");
      return;
    }

    actions.produtos.upsert({
      id: editing.id,
      nome: trimmedNome.toUpperCase(),
      pesoUnitarioKg: pesoNum,
      valorUnitario: valorNum,
      ativo: editing.ativo,
    });
    setEditing(null);
    toast.success("Produto atualizado");
  };

  const handleToggleAtivo = (prod: Produto) => {
    actions.produtos.upsert({
      id: prod.id,
      nome: prod.nome,
      pesoUnitarioKg: prod.pesoUnitarioKg,
      valorUnitario: prod.valorUnitario,
      ativo: !prod.ativo,
    });
    toast.success(prod.ativo ? "Produto desativado" : "Produto ativado");
  };

  const handleRemove = (prod: Produto) => {
    if (!confirm(`Remover o produto "${prod.nome}"?`)) return;
    actions.produtos.remove(prod.id);
    toast.success("Produto removido");
  };

  const handleClear = () => {
    if (!confirm("Limpar todos os dados de faturamento (produtos e pedidos)? Esta ação não pode ser desfeita.")) return;
    produtosList.forEach((p) => actions.produtos.remove(p.id));
    actions.pedidos.list().forEach((p) => actions.pedidos.remove(p.id));
    toast.success("Dados de faturamento limpos");
  };

  return (
    <div className="space-y-4">
      {/* Inline add form */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Plus size={16} className="text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-700">Adicionar Produto</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nome do produto</label>
                <input
                  ref={nomeRef}
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: SAL GROSSO MARINHO 25 KG"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Peso unitario (kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  placeholder="25"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Valor unitario (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="6,00"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700">
                <Plus size={14} className="mr-1" /> Adicionar
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={handleClear}>
                  <Trash2 size={12} className="mr-1" /> Limpar dados
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Product list */}
      {produtosList.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 px-4 text-center">
          <Package size={28} className="text-slate-300" />
          <p className="text-sm text-slate-500 max-w-sm">
            Nenhum produto cadastrado. Adicione produtos acima.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nome</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Peso</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor</th>
                    <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ativo</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosList.map((prod) => (
                    <tr key={prod.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-800">{prod.nome}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatKg(prod.pesoUnitarioKg)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatBRL(prod.valorUnitario)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleToggleAtivo(prod)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            prod.ativo
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {prod.ativo ? "Ativo" : "Inativo"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEditOpen(prod)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleRemove(prod)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil size={16} className="text-blue-600" />
              Editar Produto
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input
                type="text"
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Peso unitario (kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editPeso}
                  onChange={(e) => setEditPeso(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valor unitario (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editValor}
                  onChange={(e) => setEditValor(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  required
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700">
                Salvar
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
