import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Plus, ArrowRight } from 'lucide-react';

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_LABEL: Record<string, string> = {
  available: 'Disponível',
  in_progress: 'Em Andamento',
  completed: 'Concluído',
  validated: 'Validado',
  paid: 'Pago',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  available: 'default',
  in_progress: 'secondary',
  completed: 'outline',
  validated: 'outline',
  paid: 'default',
};

const CARGO_LABEL: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };

export default function SalLogFreights() {
  const [tab, setTab] = useState('all');
  const [, navigate] = useLocation();
  const { data: freights = [], isLoading } = trpc.freights.list.useQuery({ scope: 'all' });

  const filtered = tab === 'all' ? freights : freights.filter((f) => f.status === tab);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Fretes</h1>
        <Button onClick={() => navigate('/sallog/fretes/novo')} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Frete
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">Todos ({freights.length})</TabsTrigger>
          <TabsTrigger value="available">Disponíveis ({freights.filter((f) => f.status === 'available').length})</TabsTrigger>
          <TabsTrigger value="in_progress">Em Andamento ({freights.filter((f) => f.status === 'in_progress').length})</TabsTrigger>
          <TabsTrigger value="completed">Concluídos ({freights.filter((f) => f.status === 'completed').length})</TabsTrigger>
          <TabsTrigger value="validated">Validados ({freights.filter((f) => f.status === 'validated').length})</TabsTrigger>
          <TabsTrigger value="paid">Pagos ({freights.filter((f) => f.status === 'paid').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center py-8 text-slate-400">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-slate-400">Nenhum frete encontrado</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-600">Título</th>
                  <th className="text-left p-3 font-medium text-slate-600">Rota</th>
                  <th className="text-left p-3 font-medium text-slate-600">Tipo</th>
                  <th className="text-left p-3 font-medium text-slate-600">Valor</th>
                  <th className="text-left p-3 font-medium text-slate-600">Peso</th>
                  <th className="text-left p-3 font-medium text-slate-600">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sallog/fretes/${f.id}`)}>
                    <td className="p-3 font-medium">{f.title}</td>
                    <td className="p-3 text-slate-600">
                      <span className="text-xs">{f.originCity}/{f.originState}</span>
                      <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />
                      <span className="text-xs">{f.destinationCity}/{f.destinationState}</span>
                    </td>
                    <td className="p-3 text-slate-600">{CARGO_LABEL[f.cargoType] ?? f.cargoType}</td>
                    <td className="p-3 font-semibold">{fmtValue(f.value)}</td>
                    <td className="p-3 text-slate-600">{f.weight ? `${f.weight} t` : '—'}</td>
                    <td className="p-3"><Badge variant={STATUS_VARIANT[f.status]}>{STATUS_LABEL[f.status]}</Badge></td>
                    <td className="p-3"><Button variant="ghost" size="sm">Ver</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
