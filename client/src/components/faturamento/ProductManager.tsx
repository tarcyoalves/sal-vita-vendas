import { useState, useRef } from "react";
import { useFatStore } from "../../lib/faturamento/store";
import { useConfirm } from "../useConfirm";
import { formatBRL, parseBRL, formatKg } from "../../lib/faturamento/calc";
import { Panel, PanelHeader, EmptyState } from "../layout/Page";
import { StatusBadge } from "../StatusBadge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
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
  const { confirm, confirmDialog } = useConfirm();
  const [nome, setNome] = useState("");
  const [peso, setPeso] = useState("");
  const [valor, setValor] = useState("");
  const [comissaoFixa, setComissaoFixa] = useState("");
  const [isentoFrete, setIsentoFrete] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  // Edit state
  const [editing, setEditing] = useState<Produto | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editPeso, setEditPeso] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editComissaoFixa, setEditComissaoFixa] = useState("");
  const [editIsentoFrete, setEditIsentoFrete] = useState(false);

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
      comissaoFixaPct: comissaoFixa.trim() ? parseBRL(comissaoFixa) : null,
      isentoFrete,
    });

    setNome("");
    setPeso("");
    setValor("");
    setComissaoFixa("");
    setIsentoFrete(false);
    nomeRef.current?.focus();
    toast.success("Produto adicionado");
  };

  const handleEditOpen = (prod: Produto) => {
    setEditing(prod);
    setEditNome(prod.nome);
    setEditPeso(String(prod.pesoUnitarioKg));
    setEditValor(String(prod.valorUnitario));
    setEditComissaoFixa(prod.comissaoFixaPct != null ? String(prod.comissaoFixaPct) : "");
    setEditIsentoFrete(prod.isentoFrete ?? false);
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
      comissaoFixaPct: editComissaoFixa.trim() ? parseBRL(editComissaoFixa) : null,
      isentoFrete: editIsentoFrete,
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

  const handleRemove = async (prod: Produto) => {
    if (!(await confirm(`Remover o produto "${prod.nome}"?`, { confirmLabel: "Remover" }))) return;
    actions.produtos.remove(prod.id);
    toast.success("Produto removido");
  };

  const handleClear = async () => {
    if (!(await confirm("Limpar todos os dados de faturamento (produtos e pedidos)? Esta ação não pode ser desfeita.", { confirmLabel: "Limpar tudo" }))) return;
    produtosList.forEach((p) => actions.produtos.remove(p.id));
    actions.pedidos.list().forEach((p) => actions.pedidos.remove(p.id, "Limpeza em massa via botão administrativo"));
    toast.success("Dados de faturamento limpos");
  };

  const ativoToggle = (prod: Produto) => (
    <button
      type="button"
      onClick={() => handleToggleAtivo(prod)}
      aria-label={prod.ativo ? `Desativar ${prod.nome}` : `Ativar ${prod.nome}`}
      title={prod.ativo ? "Clique para desativar" : "Clique para ativar"}
      className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
    >
      <StatusBadge tone={prod.ativo ? "success" : "neutral"}>{prod.ativo ? "Ativo" : "Inativo"}</StatusBadge>
    </button>
  );

  const regras = (prod: Produto) => (
    <div className="flex flex-wrap gap-1">
      {prod.comissaoFixaPct != null && <StatusBadge tone="info">Comissão {prod.comissaoFixaPct}%</StatusBadge>}
      {prod.isentoFrete && <StatusBadge tone="warning">Preço final (sem frete)</StatusBadge>}
      {prod.comissaoFixaPct == null && !prod.isentoFrete && <span className="text-xs text-slate-500">--</span>}
    </div>
  );

  const acoes = (prod: Produto) => (
    <div className="flex items-center justify-end gap-1">
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleEditOpen(prod)} aria-label={`Editar ${prod.nome}`} title="Editar">
        <Pencil size={14} />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" className="text-red-700" onClick={() => handleRemove(prod)} aria-label={`Excluir ${prod.nome}`} title="Excluir">
        <Trash2 size={14} />
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      {confirmDialog}
      <Panel>
        <PanelHeader title="Adicionar produto" />
        <form onSubmit={handleAdd} className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="pm-nome">Nome do produto</Label>
              <Input
                id="pm-nome"
                ref={nomeRef}
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: SAL GROSSO MARINHO 25 KG"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-peso">Peso unitário (kg)</Label>
              <Input
                id="pm-peso"
                type="text"
                inputMode="decimal"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                placeholder="25"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-valor">Valor unitário (R$)</Label>
              <Input
                id="pm-valor"
                type="text"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="6,00"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="pm-comissao">Comissão fixa (%)</Label>
              <Input
                id="pm-comissao"
                type="text"
                inputMode="decimal"
                value={comissaoFixa}
                onChange={(e) => setComissaoFixa(e.target.value)}
                placeholder="Padrão do atendente"
              />
            </div>
            <div className="sm:col-span-3 flex items-center gap-2 pb-2">
              <input
                id="pm-isento-frete"
                type="checkbox"
                checked={isentoFrete}
                onChange={(e) => setIsentoFrete(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="pm-isento-frete" className="text-sm text-slate-700">
                Preço final fixo: o frete nunca soma no preço deste produto
              </label>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button type="button" variant="outline" className="text-red-700" onClick={handleClear}>
              <Trash2 size={14} className="mr-1" /> Limpar dados
            </Button>
            <Button type="submit">
              <Plus size={14} className="mr-1" /> Adicionar
            </Button>
          </div>
        </form>
      </Panel>

      {produtosList.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Package />}
            title="Nenhum produto cadastrado"
            description="Preencha o formulário acima para cadastrar o primeiro produto."
          />
        </Panel>
      ) : (
        <Panel>
          <PanelHeader title={`Produtos (${produtosList.length})`} />
          {/* Celular: lista de linhas */}
          <ul className="divide-y divide-slate-200 md:hidden">
            {produtosList.map((prod) => (
              <li key={prod.id} className="px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900 min-w-0 break-words">{prod.nome}</p>
                  {ativoToggle(prod)}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
                  <span className="text-slate-500">{formatKg(prod.pesoUnitarioKg)}</span>
                  <span className="font-medium text-slate-900">{formatBRL(prod.valorUnitario)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {regras(prod)}
                  {acoes(prod)}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs text-slate-500">
                  <th className="px-4 py-2.5 text-left font-medium">Nome</th>
                  <th className="px-4 py-2.5 text-right font-medium">Peso</th>
                  <th className="px-4 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-4 py-2.5 text-left font-medium">Regras</th>
                  <th className="px-4 py-2.5 text-center font-medium">Situação</th>
                  <th className="px-4 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {produtosList.map((prod) => (
                  <tr key={prod.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{prod.nome}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{formatKg(prod.pesoUnitarioKg)}</td>
                    <td className="px-4 py-2.5 text-right text-slate-900">{formatBRL(prod.valorUnitario)}</td>
                    <td className="px-4 py-2.5">{regras(prod)}</td>
                    <td className="px-4 py-2.5 text-center">{ativoToggle(prod)}</td>
                    <td className="px-4 py-2.5 text-right">{acoes(prod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Editar produto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pm-edit-nome">Nome</Label>
              <Input
                id="pm-edit-nome"
                type="text"
                value={editNome}
                onChange={(e) => setEditNome(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pm-edit-peso">Peso unitário (kg)</Label>
                <Input
                  id="pm-edit-peso"
                  type="text"
                  inputMode="decimal"
                  value={editPeso}
                  onChange={(e) => setEditPeso(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-edit-valor">Valor unitário (R$)</Label>
                <Input
                  id="pm-edit-valor"
                  type="text"
                  inputMode="decimal"
                  value={editValor}
                  onChange={(e) => setEditValor(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-edit-comissao">Comissão fixa (%)</Label>
              <Input
                id="pm-edit-comissao"
                type="text"
                inputMode="decimal"
                value={editComissaoFixa}
                onChange={(e) => setEditComissaoFixa(e.target.value)}
                placeholder="Em branco usa a comissão padrão do atendente"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="pm-edit-isento-frete"
                type="checkbox"
                checked={editIsentoFrete}
                onChange={(e) => setEditIsentoFrete(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <label htmlFor="pm-edit-isento-frete" className="text-sm text-slate-700">
                Preço final fixo: o frete nunca soma no preço deste produto
              </label>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
