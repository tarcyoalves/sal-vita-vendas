import { toast } from 'sonner';
import { Bot, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';

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

  if (!data) return null;
  const isAdmin = user?.role === 'admin';

  const alternar = () => {
    const ligar = !data.roboAtivo;
    const ok = window.confirm(
      ligar
        ? 'LIGAR o robô do SMBI?\n\nDepois de ligado, ele cria no SMBI todo pedido em que você clicou em "Enviar pedido para SMBI".'
        : 'Desligar o robô do SMBI?\n\nEle para de receber pedidos; nada novo é criado no SMBI.',
    );
    if (ok) setAtivo.mutate({ ativo: ligar });
  };

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${
        data.semSinal && data.roboAtivo ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <Bot size={16} className="text-blue-900" /> Robô do SMBI
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            data.roboAtivo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {data.roboAtivo ? 'Ligado' : 'Desligado'}
        </span>
        <span className="text-xs text-slate-600">
          Último sinal: {quandoFoi(data.ultimoHeartbeatEm)}
          {data.versao ? ` · versão ${data.versao}` : ''}
          {data.ciclo != null ? ` · ciclo ${data.ciclo}` : ''}
        </span>
        {data.criados != null && (
          <span className="text-xs text-slate-600">
            Último ciclo: {data.criados} criado(s), {data.pulados ?? 0} pulado(s), {data.pendentes ?? 0} pendente(s)
          </span>
        )}
        {isAdmin && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={setAtivo.isPending}
            onClick={alternar}
          >
            {data.roboAtivo ? 'Desligar robô' : 'Ligar robô'}
          </Button>
        )}
      </div>
      {data.semSinal && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-700">
          <AlertTriangle size={14} />
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
