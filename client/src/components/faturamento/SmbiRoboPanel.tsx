import { toast } from 'sonner';
import { Bot, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { StatusBadge } from '../StatusBadge';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { useConfirm } from '../useConfirm';

/** Tempo desde `iso`, sem o "há": "3 h", "25 min", "2 d". */
function duracao(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

function quandoFoi(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = duracao(iso);
  return d === 'menos de 1 min' ? 'agora há pouco' : `há ${d}`;
}

/**
 * Painel do robô do SMBI (CONTRATO-ROBO-CRM.md, rotas 8 e 9): mostra se ele está dando sinal e
 * tem a chave de parada. Desligada, o servidor não entrega nenhum pedido ao robô. Só o admin liga.
 */
export default function SmbiRoboPanel() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data } = trpc.faturamento.smbiRoboStatus.useQuery(undefined, { refetchInterval: 60_000 });
  const setAtivo = trpc.faturamento.setRoboAtivo.useMutation({
    onSuccess: (r) => {
      toast.success(r.roboAtivo ? 'Robô do SMBI LIGADO.' : 'Robô do SMBI desligado.');
      void utils.faturamento.smbiRoboStatus.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { confirm, confirmDialog } = useConfirm();

  if (!data) return null;
  const isAdmin = user?.role === 'admin';

  const alternar = async () => {
    const ligar = !data.roboAtivo;
    const ok = await confirm(
      ligar
        ? 'Depois de ligado, ele cria no SMBI todo pedido em que você clicou em "Enviar pedido para SMBI".'
        : 'Ele para de receber pedidos; nada novo é criado no SMBI.',
      { title: ligar ? 'LIGAR o robô do SMBI?' : 'Desligar o robô do SMBI?', confirmLabel: ligar ? 'Ligar' : 'Desligar' },
    );
    if (ok) setAtivo.mutate({ ativo: ligar });
  };

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        data.semSinal && data.roboAtivo ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
      }`}
    >
      {confirmDialog}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <Bot size={16} className="text-slate-500" aria-hidden /> Robô do SMBI
        </div>
        <StatusBadge tone={data.roboAtivo ? 'success' : 'neutral'} dot>
          {data.roboAtivo ? 'Ligado' : 'Desligado'}
        </StatusBadge>
        <span className="text-xs text-slate-500">
          Último sinal: {quandoFoi(data.ultimoHeartbeatEm)}
          {data.versao ? ` · versão ${data.versao}` : ''}
          {data.ciclo != null ? ` · ciclo ${data.ciclo}` : ''}
        </span>
        {data.criados != null && (
          <span className="text-xs text-slate-500">
            Último ciclo: {data.criados} criado(s), {data.pulados ?? 0} pulado(s), {data.pendentes ?? 0} pendente(s)
          </span>
        )}
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={setAtivo.isPending}
            onClick={() => void alternar()}
          >
            {data.roboAtivo ? 'Desligar robô' : 'Ligar robô'}
          </Button>
        )}
      </div>
      {data.semSinal && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700">
          <AlertTriangle size={14} aria-hidden />
          {data.ultimoHeartbeatEm
            ? `Sem sinal do robô há ${duracao(data.ultimoHeartbeatEm)} (o aviso aparece depois de ${data.limiteSemSinalMin} min): pedidos enviados ficam parados até ele voltar.`
            : 'O robô ainda não deu sinal: pedidos enviados ficam parados até ele ligar.'}
        </p>
      )}
      {!data.roboAtivo && (
        <p className="mt-1 text-xs text-slate-500">
          Desligado: o CRM não entrega nenhum pedido ao robô, mesmo os já enviados pelo botão.
        </p>
      )}
    </div>
  );
}
