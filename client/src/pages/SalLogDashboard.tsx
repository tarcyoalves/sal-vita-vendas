import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Truck, Package, CheckCircle, DollarSign, Plus, Users } from 'lucide-react';

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

const STATUS_COLOR: Record<string, string> = {
  available: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-orange-100 text-orange-800',
  validated: 'bg-purple-100 text-purple-800',
  paid: 'bg-green-100 text-green-800',
};

export default function SalLogDashboard() {
  const [, navigate] = useLocation();
  const { data: stats } = trpc.freights.stats.useQuery();
  const { data: freights } = trpc.freights.list.useQuery({ scope: 'all' });
  const { data: drivers } = trpc.drivers.list.useQuery({});

  const pendingDrivers = drivers?.filter((d) => d.status === 'pending').length ?? 0;
  const recent = freights?.slice(0, 5) ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">SalLog — Gestão Logística</h1>
          <p className="text-slate-500 text-sm mt-1">Painel de controle de fretes e motoristas</p>
        </div>
        <Button onClick={() => navigate('/sallog/fretes/novo')} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Frete
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500 font-medium">Em Andamento</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3">
            <Truck className="h-8 w-8 text-yellow-500" />
            <span className="text-3xl font-bold">{stats?.in_progress ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500 font-medium">A Validar</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-orange-500" />
            <span className="text-3xl font-bold">{stats?.completed ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500 font-medium">A Pagar</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3">
            <DollarSign className="h-8 w-8 text-purple-500" />
            <span className="text-3xl font-bold">{stats?.validated ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500 font-medium">Motoristas Pendentes</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3">
            <Users className="h-8 w-8 text-red-500" />
            <span className="text-3xl font-bold">{pendingDrivers}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Fretes Recentes</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/sallog/fretes')}>Ver todos</Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">Nenhum frete criado</p>
            ) : (
              <div className="space-y-3">
                {recent.map((f) => (
                  <div key={f.id} className="flex items-center justify-between cursor-pointer hover:bg-slate-50 rounded p-2 -mx-2" onClick={() => navigate(`/sallog/fretes/${f.id}`)}>
                    <div>
                      <p className="font-medium text-sm">{f.title}</p>
                      <p className="text-xs text-slate-500">{f.originCity}/{f.originState} → {f.destinationCity}/{f.destinationState}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{fmtValue(f.value)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[f.status]}`}>{STATUS_LABEL[f.status]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/sallog/motoristas')}>
              <Users className="h-4 w-4" /> Gerenciar Motoristas {pendingDrivers > 0 && <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5">{pendingDrivers}</span>}
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/sallog/fretes')}>
              <Package className="h-4 w-4" /> Ver Todos os Fretes
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" onClick={() => navigate('/sallog/fretes/novo')}>
              <Plus className="h-4 w-4" /> Criar Novo Frete
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
