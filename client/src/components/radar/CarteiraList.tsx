import { useMemo, useState } from 'react';
import { ExternalLink, MessageCircle, Phone } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { EmptyState, Panel } from '../layout/Page';
import { useAuth } from '../../_core/hooks/useAuth';
import { defaultContactMessage } from './contactMessage';
import { useContactTemplate } from './useContactTemplate';
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
  const contactTemplate = useContactTemplate();
  const mensagem = defaultContactMessage({ attendantName: user?.name ?? 'nossa equipe', cityLabel: originLabel, bags, template: contactTemplate });

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700">
        {result.itens.length} {result.itens.length === 1 ? 'cliente/lead' : 'clientes/leads'} do CRM em {result.municipalitiesInRadius}{' '}
        {result.municipalitiesInRadius === 1 ? 'município' : 'municípios'} · distância em linha reta
      </p>
      {result.truncated && <p className="text-xs text-amber-700">Mostrando apenas os 300 mais próximos.</p>}
      {result.semLocalizacao > 0 && (
        <p className="text-xs text-slate-500">
          {result.semLocalizacao} registro(s) da região ficaram de fora porque o nome da cidade não bate com o mapa (ex.: erro de digitação).
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
        {([
          ['todos', 'Todos'],
          ['compraram', 'Já compraram'],
          ['sem_compra', 'Ainda não compraram'],
        ] as [Filtro, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFiltro(key)}
            aria-pressed={filtro === key}
            className={`h-8 max-md:h-10 rounded-md border px-3 text-xs font-medium transition-colors ${
              filtro === key ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {lista.length === 0 ? (
        <Panel>
          <EmptyState title="Ninguém do CRM neste filtro" description={'Aumente o raio ou use a aba "Empresas novas".'} />
        </Panel>
      ) : (
        <Panel>
          <div className="divide-y divide-slate-200">
            {lista.map((i) => <CarteiraCard key={i.chave} item={i} mensagem={mensagem} />)}
          </div>
        </Panel>
      )}
    </div>
  );
}

function CarteiraCard({ item, mensagem }: { item: RadarCarteiraItem; mensagem: string }) {
  const compra =
    item.faturados > 0
      ? { variant: 'success' as const, text: `Já comprou ${item.faturados}× · última ${dataBr(item.ultimaCompraEm)} · ${brl(item.totalFaturado)}` }
      : item.pedidos > 0
        ? { variant: 'warning' as const, text: `${item.pedidos} pedido(s) ainda não faturado(s)` }
        : item.fontes.includes('cliente')
          ? { variant: 'info' as const, text: 'Cliente cadastrado' }
          : null;
  const meta = [
    `${item.cidade}/${item.uf} · ${item.distanceKm.toLocaleString('pt-BR')} km`,
    item.cnpj ? formatCnpj(item.cnpj) : null,
    item.atendentes.length > 0 ? `Atendente: ${item.atendentes.join(', ')}` : null,
    // O badge mostra o pedido pendente; o cadastro não pode sumir junto.
    item.pedidos > 0 && item.faturados === 0 && item.fontes.includes('cliente') ? 'Cliente cadastrado' : null,
  ].filter(Boolean);

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-slate-900">{item.nome}</p>
          <p className="text-xs text-slate-500">{meta.join(' · ')}</p>
        </div>
        {compra && (
          <Badge variant={compra.variant} className="max-w-[55%] whitespace-normal text-right leading-tight">
            {compra.text}
          </Badge>
        )}
      </div>

      {item.tarefas.length > 0 && (
        <p className="text-xs text-slate-600">
          {item.tarefas.some((t) => t.convertida) ? 'Lead convertido' : 'Lead em andamento'} · tarefa #{item.tarefas[0].id}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {item.telefone ? (
          <>
            <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 active:bg-green-800">
              <a href={waMeLink(item.telefone, mensagem)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={14} aria-hidden /> WhatsApp
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`tel:+55${item.telefone.replace(/^55(?=\d{10,11}$)/, '')}`}><Phone size={14} aria-hidden /> {fmtTel(item.telefone)}</a>
            </Button>
          </>
        ) : (
          <p className="text-xs text-slate-500">Sem telefone cadastrado.</p>
        )}
        {item.tarefas.slice(0, 3).map((t) => (
          <Link
            key={t.id}
            href={`/tasks?tarefa=${t.id}`}
            className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline"
          >
            <ExternalLink size={13} aria-hidden /> Ir para a tarefa #{t.id}
          </Link>
        ))}
      </div>
    </div>
  );
}
