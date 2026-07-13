import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Search, Link2 } from 'lucide-react';

const onlyDigits = (v?: string | null) => (v ?? '').replace(/\D/g, '');

export interface LinkTaskOption {
  id: number;
  title: string;
  status: string;
  cnpj?: string | null;
}

interface LinkTaskDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tasks: LinkTaskOption[];
  /** CNPJ do pedido sendo vinculado — usado só para destacar/priorizar candidatas, não filtra. */
  pedidoCnpj?: string | null;
  onConfirm: (taskId: number) => void;
}

// Painel de busca para vincular um pedido a uma tarefa — mesmo padrão de
// busca + filtro de status da tela de Tarefas, em vez de um dropdown simples
// (que fica inutilizável quando o atendente tem muitas tarefas).
export function LinkTaskDialog({ open, onOpenChange, tasks, pedidoCnpj, onConfirm }: LinkTaskDialogProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending'>('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setStatusFilter('all');
      setSelectedId(null);
    }
  }, [open]);

  const targetCnpj = onlyDigits(pedidoCnpj);

  const filtered = useMemo(() => {
    let list = tasks;
    if (statusFilter === 'pending') list = list.filter((t) => t.status === 'pending');
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => t.title.toLowerCase().includes(q));
    // Prioriza tarefas com o mesmo CNPJ do pedido, sem esconder as demais.
    if (targetCnpj) {
      return [...list].sort((a, b) => {
        const aMatch = onlyDigits(a.cnpj) === targetCnpj ? 0 : 1;
        const bMatch = onlyDigits(b.cnpj) === targetCnpj ? 0 : 1;
        return aMatch - bMatch;
      });
    }
    return list;
  }, [tasks, query, statusFilter, targetCnpj]);

  const handleConfirm = () => {
    if (selectedId == null) return;
    onConfirm(selectedId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vincular pedido a uma tarefa</DialogTitle>
          <DialogDescription>Busque e selecione a tarefa correspondente a este pedido.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              placeholder="Buscar por nome do cliente, título..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs border font-medium transition ${
                statusFilter === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-slate-50'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs border font-medium transition ${
                statusFilter === 'pending' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 hover:bg-slate-50'
              }`}
            >
              Ativas
            </button>
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} tarefa(s)</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 border rounded-lg divide-y">
          {filtered.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma tarefa encontrada.</p>
          ) : (
            filtered.map((t) => {
              const isCnpjMatch = !!targetCnpj && onlyDigits(t.cnpj) === targetCnpj;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition ${
                    selectedId === t.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                    {(t.cnpj || isCnpjMatch) && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        {t.cnpj}
                        {isCnpjMatch && <span className="text-emerald-600 font-medium">· mesmo CNPJ</span>}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                      t.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    #{t.id}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={selectedId == null} onClick={handleConfirm} className="gap-1.5">
            <Link2 size={14} />
            Vincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
