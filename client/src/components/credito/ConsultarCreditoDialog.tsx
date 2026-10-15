import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { formatBRL } from '../../lib/faturamento/calc';
import { formatarDocumento, soDigitos } from '../../lib/credito/documento';
import { motivoConsultaValido, permissoesCredito, textoCustoConsulta, vaiReaproveitar } from '../../lib/credito/regras';

export interface ConsultarCreditoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  documento: string;
  razaoSocial?: string | null;
  taskId?: number;
  pedidoId?: string;
  /** Recebe o id do relatório (novo ou reaproveitado) depois de concluir. */
  onConcluido?: (reportId: number) => void;
}

/** Confirmação da consulta paga. Só admin (o servidor também exige). */
export function ConsultarCreditoDialog({ open, onOpenChange, documento, razaoSocial, taskId, pedidoId, onConcluido }: ConsultarCreditoDialogProps) {
  const { user } = useAuth();
  const perm = permissoesCredito(user?.role);
  const utils = trpc.useUtils();
  const doc = soDigitos(documento);
  const [motivo, setMotivo] = useState('');
  const [forcarNova, setForcarNova] = useState(false);
  const enviando = useRef(false);

  useEffect(() => { if (open) { setMotivo(''); setForcarNova(false); enviando.current = false; } }, [open, doc]);

  const habilitado = open && perm.consultar;
  const status = trpc.credito.status.useQuery(undefined, { enabled: habilitado });
  const saldo = trpc.credito.saldo.useQuery(undefined, { enabled: habilitado && status.data?.simulado === false, retry: false });
  const ultimo = trpc.credito.ultimo.useQuery({ documento: doc }, { enabled: habilitado && doc.length > 0, retry: false });

  const consultar = trpc.credito.consultar.useMutation({
    onSuccess: (r) => {
      toast.success(r.reaproveitado ? 'Relatório reaproveitado (sem custo)' : 'Consulta realizada');
      void utils.credito.invalidate();
      onOpenChange(false);
      onConcluido?.(r.id);
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => { enviando.current = false; },
  });

  if (!perm.consultar) return null;

  const simulado = status.data?.simulado ?? false;
  const reaproveita = vaiReaproveitar(ultimo.data, { forcarNova, provedorAtual: status.data?.provedor });
  const limiteAtingido = !!status.data && status.data.usadasNoMes >= status.data.limiteMensal;
  const pode = motivoConsultaValido(motivo) && !consultar.isPending && status.isSuccess;

  const confirmar = () => {
    if (!pode || enviando.current) return;
    enviando.current = true; // trava imediata: o isPending só chega no próximo render
    consultar.mutate({
      documento: doc, motivo: motivo.trim(), forcarNova: forcarNova || undefined,
      taskId, pedidoId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!consultar.isPending) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); confirmar(); }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-700" aria-hidden />Consultar crédito</DialogTitle>
            <DialogDescription className="break-words">
              {razaoSocial ? `${razaoSocial} · ` : ''}{formatarDocumento(doc)}
            </DialogDescription>
          </DialogHeader>

          <div className={`rounded-md border px-3 py-2 text-sm ${simulado ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
            {status.isLoading ? 'Carregando…' : textoCustoConsulta(simulado)}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Consultas no mês</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {status.data ? `${status.data.usadasNoMes} de ${status.data.limiteMensal}` : '--'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Saldo na conta API Full</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {simulado ? 'Não se aplica' : saldo.isLoading ? '…' : saldo.data?.saldo != null ? formatBRL(saldo.data.saldo) : 'Indisponível'}
              </dd>
            </div>
          </dl>

          {reaproveita && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
              Já existe relatório com menos de 30 dias: ele será reaproveitado, sem custo.
            </p>
          )}
          {limiteAtingido && !reaproveita && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              O limite mensal de consultas pagas foi atingido: o servidor vai recusar uma consulta nova.
            </p>
          )}

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Motivo da consulta (obrigatório)
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className="h-10" placeholder="Ex.: pedido a prazo de cliente novo" autoFocus />
            <span className="text-xs font-normal text-slate-500">Mínimo de 5 caracteres. Fica registrado (LGPD).</span>
          </label>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <Checkbox checked={forcarNova} onCheckedChange={(v) => setForcarNova(v === true)} className="mt-0.5" />
            <span>Consultar de novo mesmo com relatório recente</span>
          </label>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)} disabled={consultar.isPending}>Cancelar</Button>
            <Button type="submit" size="lg" disabled={!pode}>
              {consultar.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {consultar.isPending ? 'Consultando…' : 'Consultar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
