import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const STATES = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

export default function SalLogFreightNew() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({
    title: '',
    description: '',
    cargoType: 'bigbag' as 'bigbag' | 'sacaria' | 'granel',
    originCity: '',
    originState: 'RN',
    destinationCity: '',
    destinationState: 'SP',
    distance: '',
    valueReais: '',
    weight: '',
  });

  const create = trpc.freights.create.useMutation({
    onSuccess: (data) => { toast.success('Frete criado!'); navigate(`/sallog/fretes/${data.id}`); },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({
      title: form.title,
      description: form.description || undefined,
      cargoType: form.cargoType,
      originCity: form.originCity,
      originState: form.originState,
      destinationCity: form.destinationCity,
      destinationState: form.destinationState,
      distance: form.distance ? parseFloat(form.distance) : undefined,
      value: Math.round(parseFloat(form.valueReais.replace(',', '.')) * 100),
      weight: form.weight ? parseFloat(form.weight) : undefined,
    });
  }

  function set(k: keyof typeof form, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sallog/fretes')}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold text-slate-900">Novo Frete</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dados da Carga</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex: Sal Big Bag para São Paulo" />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Carga *</Label>
              <Select value={form.cargoType} onValueChange={(v) => set('cargoType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bigbag">Big Bag</SelectItem>
                  <SelectItem value="sacaria">Sacaria</SelectItem>
                  <SelectItem value="granel">Granel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cidade de Origem *</Label>
                <Input required value={form.originCity} onChange={(e) => set('originCity', e.target.value)} placeholder="Mossoró" />
              </div>
              <div className="space-y-2">
                <Label>Estado de Origem *</Label>
                <Select value={form.originState} onValueChange={(v) => set('originState', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cidade de Destino *</Label>
                <Input required value={form.destinationCity} onChange={(e) => set('destinationCity', e.target.value)} placeholder="São Paulo" />
              </div>
              <div className="space-y-2">
                <Label>Estado de Destino *</Label>
                <Select value={form.destinationState} onValueChange={(v) => set('destinationState', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$) *</Label>
                <Input required type="number" min="0" step="0.01" value={form.valueReais} onChange={(e) => set('valueReais', e.target.value)} placeholder="1500,00" />
              </div>
              <div className="space-y-2">
                <Label>Peso (toneladas)</Label>
                <Input type="number" min="0" step="0.1" value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="25" />
              </div>
              <div className="space-y-2">
                <Label>Distância (km)</Label>
                <Input type="number" min="0" step="1" value={form.distance} onChange={(e) => set('distance', e.target.value)} placeholder="2800" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Detalhes adicionais sobre a carga, horários, etc." />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/sallog/fretes')} className="flex-1">Cancelar</Button>
              <Button type="submit" disabled={create.isPending} className="flex-1">{create.isPending ? 'Criando...' : 'Criar Frete'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
