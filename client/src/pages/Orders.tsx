import { useState } from 'react';
import { Package, Phone, MapPin, CreditCard, Printer, ExternalLink, CheckCircle, X, RefreshCw, ShoppingBag } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { toast } from 'sonner';
import { useAuth } from '../_core/hooks/useAuth';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', confirmed: 'Confirmado', shipped: 'Enviado',
  delivered: 'Entregue', cancelled: 'Cancelado', label_generated: 'Etiqueta Gerada',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  label_generated: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-green-100 text-green-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};
const PAY_LABEL: Record<string, string> = { awaiting: 'Aguardando', confirmed: 'Pago', failed: 'Falhou' };
const PAY_COLOR: Record<string, string> = {
  awaiting: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

type FilterTab = 'all' | 'awaiting' | 'confirmed' | 'shipped';

export default function Orders() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterTab>('all');
  const { data: orders = [], isLoading, refetch } = trpc.shipping.listOrders.useQuery();
  const updateMut = trpc.shipping.updateStatus.useMutation({ onSuccess: () => { refetch(); } });
  const labelMut = trpc.shipping.generateLabel.useMutation({
    onSuccess: (data) => {
      toast.success('Etiqueta gerada! Abrindo para impressão...');
      window.open(data.labelUrl, '_blank');
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  if (user?.role !== 'admin') return <div className="p-8 text-center text-gray-500">Acesso restrito.</div>;

  const filtered = orders.filter(o => {
    if (filter === 'awaiting') return o.paymentStatus === 'awaiting' && o.status !== 'cancelled';
    if (filter === 'confirmed') return o.paymentStatus === 'confirmed' && o.status !== 'shipped' && o.status !== 'delivered' && o.status !== 'cancelled';
    if (filter === 'shipped') return o.status === 'shipped' || o.status === 'delivered';
    return true;
  });

  const stats = {
    total: orders.length,
    awaiting: orders.filter(o => o.paymentStatus === 'awaiting' && o.status !== 'cancelled').length,
    labels: orders.filter(o => !!o.meLabelUrl).length,
    revenue: orders.filter(o => o.paymentStatus === 'confirmed').reduce((s, o) => s + parseFloat(o.totalPrice ?? '0'), 0),
  };

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'Todos', count: orders.length },
    { key: 'awaiting', label: 'Aguardando Pgto', count: stats.awaiting },
    { key: 'confirmed', label: 'Pgto Confirmado', count: orders.filter(o => o.paymentStatus === 'confirmed' && !['shipped','delivered','cancelled'].includes(o.status)).length },
    { key: 'shipped', label: 'Enviados', count: orders.filter(o => ['shipped','delivered'].includes(o.status)).length },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag size={22} className="text-blue-600" />
            Pedidos do Site
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Pedidos recebidos em premium.salvitarn.com.br</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition px-3 py-1.5 rounded-lg hover:bg-gray-100">
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Pedidos', value: stats.total, color: 'blue' },
          { label: 'Aguard. Pagamento', value: stats.awaiting, color: 'yellow' },
          { label: 'Etiquetas Geradas', value: stats.labels, color: 'green' },
          { label: 'Receita Confirmada', value: `R$ ${stats.revenue.toFixed(2).replace('.',',')}`, color: 'emerald' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-xl font-bold mt-1 text-${s.color}-600`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${filter === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            {t.label} <span className="ml-1 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Orders list */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando pedidos...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Package size={40} className="mx-auto mb-2 opacity-30" />
          <p>Nenhum pedido encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div key={order.id} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">#{order.id} — {order.customerName}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY_COLOR[order.paymentStatus]}`}>
                      {PAY_LABEL[order.paymentStatus]}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><Phone size={12}/>{order.customerPhone}</span>
                    <span className="flex items-center gap-1"><MapPin size={12}/>{order.city}/{order.state} — CEP {order.postalCode}</span>
                    <span>{new Date(order.createdAt).toLocaleDateString('pt-BR')} {new Date(order.createdAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">R$ {parseFloat(order.totalPrice ?? '0').toFixed(2).replace('.',',')}</p>
                  <p className="text-xs text-gray-500">{order.quantity}x 1kg · Frete: R$ {parseFloat(order.shippingPrice ?? '0').toFixed(2).replace('.',',')} ({order.shippingServiceName ?? '—'})</p>
                </div>
              </div>

              <div className="text-sm text-gray-500 border-t pt-2">
                {order.address}, {order.number}{order.complement ? ` (${order.complement})` : ''} — {order.neighborhood}
              </div>

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {order.paymentStatus === 'awaiting' && order.status !== 'cancelled' && (
                  <button
                    onClick={() => { updateMut.mutate({ id: order.id, paymentStatus: 'confirmed', status: 'confirmed' }); toast.success('Pagamento confirmado!'); }}
                    disabled={updateMut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    <CheckCircle size={14}/>Confirmar Pagamento
                  </button>
                )}

                {order.paymentStatus === 'confirmed' && !order.meLabelUrl && order.status !== 'cancelled' && (
                  <button
                    onClick={() => labelMut.mutate({ orderId: order.id })}
                    disabled={labelMut.isPending && labelMut.variables?.orderId === order.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    <Printer size={14}/>
                    {labelMut.isPending && labelMut.variables?.orderId === order.id ? 'Gerando...' : 'Gerar Etiqueta ME'}
                  </button>
                )}

                {order.meLabelUrl && (
                  <a
                    href={order.meLabelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-sm rounded-lg hover:bg-indigo-100 transition"
                  >
                    <ExternalLink size={14}/>Imprimir Etiqueta
                  </a>
                )}

                {!['shipped','delivered','cancelled'].includes(order.status) && (
                  <button
                    onClick={() => { if(confirm('Cancelar este pedido?')) { updateMut.mutate({ id: order.id, status: 'cancelled' }); toast.info('Pedido cancelado.'); } }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-50 transition"
                  >
                    <X size={14}/>Cancelar
                  </button>
                )}

                {order.meOrderId && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 px-2 py-1.5">
                    ME: {order.meOrderId}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
