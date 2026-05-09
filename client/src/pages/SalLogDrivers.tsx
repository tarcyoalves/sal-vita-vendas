import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { CheckCircle, XCircle, User } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABEL: Record<string, string> = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = { pending: 'secondary', approved: 'default', rejected: 'destructive' };

type Driver = { id: number; userId: number; cpf: string; plate: string; phone: string; status: string; createdAt: Date; userName: string | null; userEmail: string | null };

export default function SalLogDrivers() {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState<Driver | null>(null);
  const utils = trpc.useUtils();

  const { data: drivers = [], isLoading } = trpc.drivers.list.useQuery({});
  const approve = trpc.drivers.approve.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); toast.success('Motorista aprovado'); setSelected(null); } });
  const reject = trpc.drivers.reject.useMutation({ onSuccess: () => { utils.drivers.list.invalidate(); toast.success('Motorista rejeitado'); setSelected(null); } });

  const filtered = tab === 'all' ? drivers : drivers.filter((d) => d.status === tab);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Motoristas</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Todos ({drivers.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendentes ({drivers.filter((d) => d.status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="approved">Aprovados ({drivers.filter((d) => d.status === 'approved').length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitados ({drivers.filter((d) => d.status === 'rejected').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center py-8 text-slate-400">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-slate-400">Nenhum motorista encontrado</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-600">Nome</th>
                  <th className="text-left p-3 font-medium text-slate-600">CPF</th>
                  <th className="text-left p-3 font-medium text-slate-600">Placa</th>
                  <th className="text-left p-3 font-medium text-slate-600">Telefone</th>
                  <th className="text-left p-3 font-medium text-slate-600">Status</th>
                  <th className="text-left p-3 font-medium text-slate-600">Cadastro</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="p-3 font-medium">{d.userName ?? '—'}</td>
                    <td className="p-3 text-slate-600">{d.cpf}</td>
                    <td className="p-3 font-mono">{d.plate}</td>
                    <td className="p-3 text-slate-600">{d.phone}</td>
                    <td className="p-3"><Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge></td>
                    <td className="p-3 text-slate-500">{new Date(d.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="p-3">
                      {d.status === 'pending' && (
                        <Button size="sm" variant="outline" onClick={() => setSelected(d as Driver)}>Revisar</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Revisar Motorista</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <User className="h-8 w-8 text-slate-400" />
                <div>
                  <p className="font-semibold">{selected.userName}</p>
                  <p className="text-slate-500">{selected.userEmail}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-slate-500">CPF:</span> <span className="font-medium">{selected.cpf}</span></div>
                <div><span className="text-slate-500">Placa:</span> <span className="font-mono font-medium">{selected.plate}</span></div>
                <div><span className="text-slate-500">Telefone:</span> <span className="font-medium">{selected.phone}</span></div>
                <div><span className="text-slate-500">Cadastro:</span> <span className="font-medium">{new Date(selected.createdAt).toLocaleDateString('pt-BR')}</span></div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="destructive" className="gap-1" onClick={() => selected && reject.mutate({ id: selected.id })} disabled={reject.isPending}>
              <XCircle className="h-4 w-4" /> Rejeitar
            </Button>
            <Button className="gap-1" onClick={() => selected && approve.mutate({ id: selected.id })} disabled={approve.isPending}>
              <CheckCircle className="h-4 w-4" /> Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
