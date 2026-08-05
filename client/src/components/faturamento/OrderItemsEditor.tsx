import { useState, useCallback, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { Input } from '../ui/input';
import { useFatStore } from '../../lib/faturamento/store';
import { totalLinha, totalItens, pesoTotalItens, formatBRL, parseBRL, formatKg } from '../../lib/faturamento/calc';
import type { ItemPedido, Produto } from '../../lib/faturamento/types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface OrderItemsEditorProps {
  itens: ItemPedido[];
  onChange: (itens: ItemPedido[]) => void;
}

export function OrderItemsEditor({ itens, onChange }: OrderItemsEditorProps) {
  const { produtos } = useFatStore();
  const ativos = produtos.filter((p) => p.ativo);
  // Todos os produtos (incluindo inativos) para resolver o peso unitário de
  // itens de pedidos antigos cujo produto foi desativado depois.
  const produtoPorId = useCallback(
    (id: string | null) => (id ? produtos.find((p) => p.id === id) : undefined),
    [produtos],
  );

  const addRow = useCallback(() => {
    const newItem: ItemPedido = {
      id: uid(),
      produtoId: null,
      descricao: '',
      quantidade: 1,
      pesoKg: 0,
      valorUnitario: 0,
      pesoBrutoKg: 0,
      comissaoFixaPct: null,
      isentoFrete: false,
    };
    onChange([...itens, newItem]);
  }, [itens, onChange]);

  const removeRow = useCallback(
    (id: string) => {
      onChange(itens.filter((it) => it.id !== id));
    },
    [itens, onChange],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<ItemPedido>) => {
      onChange(
        itens.map((it) => {
          if (it.id !== id) return it;
          const updated = { ...it, ...patch };
          // Peso sempre vem do peso unitário cadastrado no produto × quantidade
          // — nunca é digitável, pra bater sempre com o peso real da carga.
          const prod = produtoPorId(updated.produtoId);
          if (prod && 'quantidade' in patch) {
            updated.pesoKg = (Number(updated.quantidade) || 0) * prod.pesoUnitarioKg;
          }
          if ('pesoKg' in updated) updated.pesoBrutoKg = updated.pesoKg;
          return updated;
        }),
      );
    },
    [itens, onChange, produtoPorId],
  );

  // Pedidos antigos podem ter pesoKg gravado manualmente (era editável antes)
  // ou o peso unitário do produto pode ter mudado desde a criação — corrige
  // ao carregar, pra peso sempre bater com o cadastro atual do produto.
  useEffect(() => {
    if (produtos.length === 0) return;
    let changed = false;
    const corrected = itens.map((it) => {
      const prod = produtoPorId(it.produtoId);
      if (!prod) return it;
      const correctPeso = (Number(it.quantidade) || 0) * prod.pesoUnitarioKg;
      if (it.pesoKg !== correctPeso || it.pesoBrutoKg !== correctPeso) {
        changed = true;
        return { ...it, pesoKg: correctPeso, pesoBrutoKg: correctPeso };
      }
      return it;
    });
    if (changed) onChange(corrected);
  }, [produtos, itens, produtoPorId, onChange]);

  const pickProduct = useCallback(
    (itemId: string, value: string) => {
      const prod = ativos.find((p) => p.id === value);
      if (!prod) return;
      const qty =
        itens.find((it) => it.id === itemId)?.quantidade ?? 1;
      updateItem(itemId, {
        produtoId: prod.id,
        descricao: prod.nome,
        valorUnitario: prod.valorUnitario,
        pesoKg: qty * prod.pesoUnitarioKg,
        pesoBrutoKg: qty * prod.pesoUnitarioKg,
        comissaoFixaPct: prod.comissaoFixaPct ?? null,
        isentoFrete: prod.isentoFrete ?? false,
      });
    },
    [ativos, itens, updateItem],
  );

  // Currency input helpers
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  const handleCurrencyFocus = (key: string, current: number) => {
    setEditingValues((prev) => ({
      ...prev,
      [key]: current ? String(current).replace('.', ',') : '',
    }));
  };

  const handleCurrencyBlur = (key: string, itemId: string, field: 'valorUnitario') => {
    const raw = editingValues[key] ?? '';
    const parsed = parseBRL(raw);
    updateItem(itemId, { [field]: parsed });
    setEditingValues((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 text-left">
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide">
                Produto
              </th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide w-20">
                Qtd
              </th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide w-24">
                Peso (kg)
              </th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide w-28">
                Valor unit.
              </th>
              <th className="px-3 py-2 font-semibold text-slate-600 text-xs uppercase tracking-wide w-28 text-right">
                Total
              </th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const valKey = `val-${item.id}`;
              return (
                <tr key={item.id} className="border-t border-slate-100">
                  {/* Product select or free text */}
                  <td className="px-3 py-2">
                    {ativos.length > 0 ? (
                      <Select
                        value={item.produtoId ?? ''}
                        onValueChange={(v) => pickProduct(item.id, v)}
                      >
                        <SelectTrigger className="w-full text-xs h-8">
                          <SelectValue placeholder="Selecionar produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {ativos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-xs text-amber-600 py-1">
                        Nenhum produto cadastrado. Solicite ao admin.
                      </p>
                    )}
                  </td>
                  {/* Quantidade */}
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      className="text-xs h-8 w-20"
                      value={item.quantidade}
                      onChange={(e) =>
                        updateItem(item.id, {
                          quantidade: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                    />
                  </td>
                  {/* Peso — travado no peso unitário do produto × quantidade, não editável */}
                  <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                    {formatKg(item.pesoKg)}
                  </td>
                  {/* Valor unitário */}
                  <td className="px-3 py-2">
                    <Input
                      className="text-xs h-8 w-28"
                      inputMode="decimal"
                      value={
                        valKey in editingValues
                          ? editingValues[valKey]
                          : formatBRL(item.valorUnitario)
                      }
                      onFocus={() =>
                        handleCurrencyFocus(valKey, item.valorUnitario)
                      }
                      onChange={(e) =>
                        setEditingValues((prev) => ({
                          ...prev,
                          [valKey]: e.target.value,
                        }))
                      }
                      onBlur={() =>
                        handleCurrencyBlur(valKey, item.id, 'valorUnitario')
                      }
                    />
                  </td>
                  {/* Total (read-only) */}
                  <td className="px-3 py-2 text-right font-semibold text-slate-700 whitespace-nowrap">
                    {formatBRL(totalLinha(item))}
                  </td>
                  {/* Remove */}
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeRow(item.id)}
                      className="text-slate-400 hover:text-red-600 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {itens.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-6 text-center text-sm text-slate-400"
                >
                  Nenhum item adicionado
                </td>
              </tr>
            )}
          </tbody>
          {itens.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-sm">
                <td colSpan={2} className="px-3 py-2 text-slate-500">
                  Totais
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {formatKg(pesoTotalItens(itens))}
                </td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right text-blue-900 font-bold">
                  {formatBRL(totalItens(itens))}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        className="gap-1.5"
      >
        <Plus size={14} />
        Adicionar produto
      </Button>
    </div>
  );
}
