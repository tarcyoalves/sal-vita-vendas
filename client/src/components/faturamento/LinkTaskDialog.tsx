import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Search, Link2 } from 'lucide-react';
import { foldText, searchTerms } from '../../../../shared/searchText';

const onlyDigits = (v?: string | null) => (v ?? '').replace(/\D/g, '');

export interface LinkTaskOption {
  id: number;
  title: string;
  cnpj?: string | null;
  phone?: string | null;
  status?: string | null;
  assignedTo?: string | null;
  createdAt?: Date | string | null;
}

const fmtData = (d?: Date | string | null) => {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('pt-BR');
};

interface LinkTaskDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tasks: LinkTaskOption[];
  /** CNPJ do pedido sendo vinculado — usado só para destacar/priorizar candidatas, não filtra. */
  pedidoCnpj?: string | null;
  onConfirm: (taskId: number) => void;
  /** Lista de tarefas ainda carregando: mostra "Carregando" em vez de "nenhuma encontrada". */
  carregando?: boolean;
}

// Painel de busca para vincular um pedido a uma tarefa — busca por título em
// vez de um dropdown simples (que fica inutilizável quando o atendente/admin
// tem muitas tarefas).
export function LinkTaskDialog({ open, onOpenChange, tasks, pedidoCnpj, onConfirm, carregando }: LinkTaskDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedId(null);
    }
  }, [open]);

  const targetCnpj = onlyDigits(pedidoCnpj);

  const filtered = useMemo(() => {
    let list = tasks;
    // Sem acento e sem diferença de maiúsculas; todos os termos precisam aparecer (título, CNPJ, telefone,
    // atendente, status ou número).
    const termos = searchTerms(query);
    if (termos.length) {
      list = list.filter((t) => {
        const alvo = foldText([t.title, t.cnpj, onlyDigits(t.cnpj), t.phone, t.assignedTo, t.status, `#${t.id}`].filter(Boolean).join(' '));
        return termos.every((x) => alvo.includes(x));
      });
    }
    // Prioriza tarefas com o mesmo CNPJ do pedido, sem esconder as demais.
    if (targetCnpj) {
      return [...list].sort((a, b) => {
        const aMatch = onlyDigits(a.cnpj) === targetCnpj ? 0 : 1;
        const bMatch = onlyDigits(b.cnpj) === targetCnpj ? 0 : 1;
        return aMatch - bMatch;
      });
    }
    return list;
  }, [tasks, query, targetCnpj]);

  const handleConfirm = () => {
    if (selectedId == null) return;
    onConfirm(selectedId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Vincular pedido a uma tarefa</DialogTitle>
          <DialogDescription>Busque e selecione a tarefa correspondente a este pedido.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              autoFocus
              type="text"
              aria-label="Buscar tarefa"
              placeholder="Buscar por cliente, cidade, CNPJ, telefone ou atendente"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <p className="text-xs text-slate-500 text-right">{carregando ? 'Carregando tarefas…' : `${filtered.length} tarefa(s)`}</p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 rounded-md border border-slate-200 divide-y divide-slate-200">
          {carregando ? (
            <p className="text-sm text-slate-500 text-center py-8">Carregando tarefas…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Nenhuma tarefa encontrada.</p>
          ) : (
            filtered.map((t) => {
              const isCnpjMatch = !!targetCnpj && onlyDigits(t.cnpj) === targetCnpj;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition ${
                    selectedId === t.id ? 'bg-brand-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 break-words">{t.title}</p>
                    <p className="text-xs text-slate-600 break-words">
                      {[t.assignedTo && `Atendente: ${t.assignedTo}`, t.status && `Status: ${t.status}`, fmtData(t.createdAt) && `Criada em ${fmtData(t.createdAt)}`, t.phone].filter(Boolean).join(' · ')}
                    </p>
                    {(t.cnpj || isCnpjMatch) && (
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        {t.cnpj}
                        {isCnpjMatch && <span className="text-green-700 font-medium">· mesmo CNPJ</span>}
                      </p>
                    )}
                  </div>
                  <span className="text-xs shrink-0 text-slate-500 tabular-nums">
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
