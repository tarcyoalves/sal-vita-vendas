import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { formatBRL } from '../../lib/faturamento/calc';
import { permissoesCredito } from '../../lib/credito/regras';
import { itemDoCatalogo, nomeDoProduto } from '../../../../shared/creditoCatalogo';

/**
 * Aviso "Só uma fonte consultada: faltam os dados da outra" no relatório consolidado, com o botão (só admin) para consultar a
 * fonte que falta. A consulta é PAGA: o botão abre uma confirmação que diz o valor e pede o motivo (LGPD) antes de cobrar.
 */
export function ConsultarOutraFonte({ documento, faltam }: { documento: string; faltam: readonly string[] }) {
  const { user } = useAuth();
  const perm = permissoesCredito(user?.role);
  const utils = trpc.useUtils();
  const status = trpc.credito.status.useQuery(undefined, { enabled: perm.consultar });
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const enviando = useRef(false);
  const consultar = trpc.credito.consultar.useMutation({
    onSuccess: (r) => {
      toast.success(r.custoCobradoReais > 0 ? `Consulta realizada (${formatBRL(r.custoCobradoReais)})` : 'Relatório reaproveitado (sem custo)');
      setConfirmando(false);
      void utils.credito.invalidate();
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => { enviando.current = false; },
  });
  if (faltam.length === 0) return null;
  const chave = faltam[0];
  const nome = nomeDoProduto(chave);
  const custo = itemDoCatalogo(chave)?.custoReais ?? null;
  const simulado = status.data?.simulado ?? false;
  const texto = custo === null ? 'custo não medido' : simulado ? 'sem custo (provedor simulado)' : formatBRL(custo);
  const motivoOk = motivo.trim().length >= 5;

  return (
    <div role="note" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-semibold">Só uma fonte consultada: faltam os dados da outra ({faltam.map((c) => nomeDoProduto(c)).join(', ')}).</p>
      {!perm.consultar ? (
        <p className="text-xs">Peça a um administrador para consultar a outra fonte.</p>
      ) : !confirmando ? (
        <Button type="button" size="lg" variant="outline" className="h-10 border-amber-400 bg-white text-amber-950 hover:bg-amber-100"
          disabled={custo === null} onClick={() => setConfirmando(true)}>
          Consultar a outra fonte ({nome}{custo !== null && !simulado ? ` · ${formatBRL(custo)}` : ''})
        </Button>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!motivoOk || enviando.current) return;
            enviando.current = true;
            consultar.mutate({ documento, motivo: motivo.trim(), produtos: [chave] });
          }}
        >
          <p className="text-xs font-medium">
            Esta consulta é PAGA: {nome} custa {texto} e o valor será cobrado da conta API Full ao confirmar.
          </p>
          <label className="grid gap-1 text-xs font-medium">
            Motivo da consulta (obrigatório, fica registrado)
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className="h-10 bg-white" placeholder="Ex.: completar a análise do pedido a prazo" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="lg" className="h-10 bg-white" disabled={consultar.isPending} onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button type="submit" size="lg" className="h-10" disabled={!motivoOk || consultar.isPending}>
              {consultar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {consultar.isPending ? 'Consultando…' : `Confirmar e consultar${custo !== null && !simulado ? ` (${formatBRL(custo)})` : ''}`}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
