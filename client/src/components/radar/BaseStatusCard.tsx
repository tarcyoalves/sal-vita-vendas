import { AlertTriangle, Database } from 'lucide-react';
import { trpc } from '../../lib/trpc';

/**
 * Situação da base de empresas da Receita, no topo do Radar. Base vazia era o motivo de a aba
 * "Empresas novas" não achar nada — agora isso aparece na tela, com o que fazer.
 */
export function BaseStatusCard({ isAdmin }: { isAdmin: boolean }) {
  const { data } = trpc.prospectingRadar.baseStatus.useQuery(undefined, { staleTime: 60_000 });
  if (!data) return null;

  if (data.datasetRelease === null) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={16} /> Base de empresas da Receita ainda não importada
        </p>
        <p className="mt-1 text-xs">
          Por isso "Empresas novas" não encontra ninguém. A aba <strong>Minha carteira</strong> funciona agora, com os
          clientes e leads que o CRM já tem.
          {isAdmin
            ? ' Para liberar as empresas novas, o importador precisa rodar na VPS (passo a passo em scripts/radar/README.md; comece por PR, SC e RS).'
            : ' Para liberar as empresas novas, fale com o administrador.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600">
      <span className="flex items-center gap-1.5 font-semibold text-slate-700">
        <Database size={14} className="text-blue-900" /> Base da Receita {data.datasetRelease}
      </span>
      <span>{data.total.toLocaleString('pt-BR')} empresas</span>
      <span className="text-slate-500">
        {data.porUf.slice(0, 8).map((u) => `${u.uf} ${u.count.toLocaleString('pt-BR')}`).join(' · ')}
      </span>
      <span className={data.enricherOnline ? 'text-emerald-700' : 'text-amber-700'}>
        Robô de busca na web: {data.enricherOnline ? 'ligado' : 'desligado'}
      </span>
    </div>
  );
}
