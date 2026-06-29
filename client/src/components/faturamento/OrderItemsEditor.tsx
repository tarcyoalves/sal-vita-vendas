import { useState, useCallback } from 'react';
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

  // Track pesoUnitarioKg per item id so we can recompute peso when qty changes
  const [pesoUnitMap, setPesoUnitMap] = useState<Record<string, number>>({});

  const addRow = useCallback(() => {
    const newItem: ItemPedido = {
      id: uid(),
      produtoId: null,
      descricao: '',
      quantidade: 1,
      pesoKg: 0,
      valorUnitario: 0,
    };
    onChange([...itens, newItem]);
  }, [itens, onChange]);

  const removeRow = useCallback(
    (id: string) => {
      onChange(itens.filter((it) => it.id !== id));
      setPesoUnitMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [itens, onChange],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<ItemPedido>) => {
      onChange(
        itens.map((it) => {
          if (it.id !== id) return it;
          const updated = { ...it, ...patch };
          // Recompute peso when qty changes on a product-linked row
          if ('quantidade' in patch && it.produtoId && pesoUnitMap[id]) {
            updated.pesoKg = (Number(patch.quantidade) || 0) * pesoUnitMap[id];
          }
          return updated;
        }),
      );
    },
    [itens, onChange, pesoUnitMap],
  );

  const pickProduct = useCallback(
    (itemId: string, value: string) => {
      const prod = ativos.find((p) => p.id === value);
      if (!prod) return;
      const qty =
        itens.find((it) => it.id === itemId)?.quantidade ?? 1;
      setPesoUnitMap((prev) => ({ ...prev, [itemId]: prod.pesoUnitarioKg }));
      updateItem(itemId, {
        produtoId: prod.id,
        descricao: prod.nome,
        valorUnitario: prod.valorUnitario,
        pesoKg: qty * prod.pesoUnitarioKg,
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

  const handleCurrencyBlur = (
    key: string,
    itemId: string,
    field: 'valorUnitario' | 'pesoKg',
  ) => {
    const raw = editingValues[key] ?? '';
    const parsed = field === 'valorUnitario' ? parseBRL(raw) : (Number(raw.replace(',', '.')) || 0);
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
        <table className="w-full text-sm min-w-[640px]">
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
              const pesoKey = `peso-${item.id}`;
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
                  {/* Peso */}
                  <td className="px-3 py-2">
                    <Input
                      className="text-xs h-8 w-24"
                      inputMode="decimal"
                      value={
                        pesoKey in editingValues
                          ? editingValues[pesoKey]
                          : String(item.pesoKg).replace('.', ',')
                      }
                      onFocus={() => handleCurrencyFocus(pesoKey, item.pesoKg)}
                      onChange={(e) =>
                        setEditingValues((prev) => ({
                          ...prev,
                          [pesoKey]: e.target.value,
                        }))
                      }
                      onBlur={() =>
                        handleCurrencyBlur(pesoKey, item.id, 'pesoKg')
                      }
                    />
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
