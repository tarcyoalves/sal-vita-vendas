import { useMemo, useState } from 'react';
import { MessageCircle, Phone } from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '../../_core/hooks/useAuth';
import { defaultContactMessage } from './contactMessage';
import { formatCnpj, waMeLink, type RadarCarteiraItem, type RadarCarteiraResult } from '../../../../shared/radar';

type Filtro = 'todos' | 'compraram' | 'sem_compra';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
const fmtTel = (d: string) => (d.length >= 10 ? `(${d.slice(-11, -9) || d.slice(0, 2)}) ${d.slice(-9, -4)}-${d.slice(-4)}` : d);

/**
 * "Minha carteira": clientes e leads que o CRM já conhece perto da cidade da carga. O contato é
 * sempre manual (link do WhatsApp para o atendente enviar); nada é disparado automaticamente.
 */
export function CarteiraList({
  result, originLabel, bags,
}: {
  result: RadarCarteiraResult;
  originLabel: string;
  bags: number;
}) {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const counts = useMemo(() => ({
    todos: result.itens.length,
    compraram: result.itens.filter((i) => i.faturados > 0).length,
    sem_compra: result.itens.filter((i) => i.faturados === 0).length,
  }), [result.itens]);

  const lista = result.itens.filter((i) => (filtro === 'todos' ? true : filtro === 'compraram' ? i.faturados > 0 : i.faturados === 0));
  const mensagem = defaultContactMessage({ attendantName: user?.name ?? 'nossa equipe', cityLabel: originLabel, bags });

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        {result.itens.length} {result.itens.length === 1 ? 'cliente/lead' : 'clientes/leads'} do CRM em {result.municipalitiesInRadius}{' '}
        {result.municipalitiesInRadius === 1 ? 'município' : 'municípios'} · distância em linha reta
      </p>
      {result.truncated && <p className="text-xs text-amber-600">Mostrando apenas os 300 mais próximos.</p>}
      {result.semLocalizacao > 0 && (
        <p className="text-xs text-slate-500">
          {result.semLocalizacao} registro(s) da região ficaram de fora porque o nome da cidade não bate com o mapa (ex.: erro de digitação).
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {([
          ['todos', 'Todos'],
          ['compraram', 'Já compraram'],
          ['sem_compra', 'Ainda não compraram'],
        ] as [Filtro, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFiltro(key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
              filtro === key ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
          Ninguém do CRM neste filtro. Aumente o raio ou use a aba "Empresas novas".
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {lista.map((i) => <CarteiraCard key={i.chave} item={i} mensagem={mensagem} />)}
        </div>
      )}
    </div>
  );
}

function CarteiraCard({ item, mensagem }: { item: RadarCarteiraItem; mensagem: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <div>
        <p className="font-semibold text-slate-800 leading-tight">{item.nome}</p>
        <p className="text-xs text-slate-500">
          {item.cidade}/{item.uf} · {item.distanceKm.toLocaleString('pt-BR')} km{item.cnpj ? ` · ${formatCnpj(item.cnpj)}` : ''}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {item.faturados > 0 ? (
          <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 font-medium">
            Já comprou {item.faturados}× · última {dataBr(item.ultimaCompraEm)} · {brl(item.totalFaturado)}
          </span>
        ) : item.pedidos > 0 ? (
          <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-medium">{item.pedidos} pedido(s) ainda não faturado(s)</span>
        ) : null}
        {item.fontes.includes('cliente') && item.faturados === 0 && (
          <span className="rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 font-medium">Cliente cadastrado</span>
        )}
        {item.tarefas.length > 0 && (
          <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 font-medium">
            {item.tarefas.some((t) => t.convertida) ? 'Lead convertido' : 'Lead em andamento'} · tarefa #{item.tarefas[0].id}
          </span>
        )}
      </div>

      {item.atendentes.length > 0 && <p className="text-xs text-slate-500">Atendente: {item.atendentes.join(', ')}</p>}

      {item.telefone ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <a href={waMeLink(item.telefone, mensagem)} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={14} /> WhatsApp
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href={`tel:+55${item.telefone.replace(/^55(?=\d{10,11}$)/, '')}`}><Phone size={14} /> {fmtTel(item.telefone)}</a>
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-400 pt-1">Sem telefone cadastrado.</p>
      )}
    </div>
  );
}
