import { useState, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { ArrowLeft, Send, MapPin, Truck, CheckCircle, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

// Leaflet fix for Vite
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const STATUS_LABEL: Record<string, string> = { available: 'Disponível', in_progress: 'Em Andamento', completed: 'Concluído', validated: 'Validado', paid: 'Pago' };
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = { available: 'default', in_progress: 'secondary', completed: 'outline', validated: 'outline', paid: 'default' };
const CARGO_LABEL: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };

export default function SalLogFreightDetail({ id }: { id: number }) {
  const [, navigate] = useLocation();
  const [chatMsg, setChatMsg] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: freight, isLoading } = trpc.freights.getById.useQuery({ id });
  const { data: interests } = trpc.freightInterests.listByFreight.useQuery({ freightId: id });
  const { data: approvedDrivers } = trpc.drivers.list.useQuery({ status: 'approved' });
  const { data: chat = [] } = trpc.freightChats.list.useQuery({ freightId: id }, { refetchInterval: 5000 });
  const { data: docs = [] } = trpc.freightDocuments.listByFreight.useQuery({ freightId: id });
  const { data: latestLoc } = trpc.locations.latestByFreight.useQuery({ freightId: id }, { refetchInterval: 30000, enabled: freight?.status === 'in_progress' });
  const { data: locationHistory } = trpc.locations.historyByFreight.useQuery({ freightId: id, limit: 100 }, { refetchInterval: 30000, enabled: freight?.status === 'in_progress' });

  const assign = trpc.freights.assignDriver.useMutation({ onSuccess: () => { utils.freights.getById.invalidate(); toast.success('Motorista associado'); } });
  const validate = trpc.freights.validate.useMutation({ onSuccess: () => { utils.freights.getById.invalidate(); toast.success('Entrega validada'); } });
  const markPaid = trpc.freights.markPaid.useMutation({ onSuccess: () => { utils.freights.getById.invalidate(); toast.success('Pagamento registrado'); } });
  const sendChat = trpc.freightChats.send.useMutation({ onSuccess: () => { utils.freightChats.list.invalidate(); setChatMsg(''); } });

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat]);

  if (isLoading) return <div className="p-6 text-center text-slate-400">Carregando...</div>;
  if (!freight) return <div className="p-6 text-center text-slate-400">Frete não encontrado</div>;

  const trailPoints = (locationHistory ?? []).map((l) => [l.lat, l.lng] as [number, number]).reverse();
  const mapCenter: [number, number] = latestLoc ? [latestLoc.lat, latestLoc.lng] : [-5.188, -37.344];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sallog/fretes')}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{freight.title}</h1>
            <Badge variant={STATUS_VARIANT[freight.status]}>{STATUS_LABEL[freight.status]}</Badge>
          </div>
          <p className="text-slate-500 text-sm">{freight.originCity}/{freight.originState} → {freight.destinationCity}/{freight.destinationState}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-slate-900">{fmtValue(freight.value)}</p>
          <p className="text-xs text-slate-500">{CARGO_LABEL[freight.cargoType]} {freight.weight ? `· ${freight.weight}t` : ''}</p>
        </div>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="map">Mapa</TabsTrigger>
          <TabsTrigger value="interests">Interessados ({interests?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="chat">Chat ({chat.length})</TabsTrigger>
          <TabsTrigger value="docs">Comprovantes ({docs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="pt-4 space-y-4">
              {freight.description && <p className="text-slate-600 text-sm">{freight.description}</p>}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-slate-500">Distância:</span> <span className="font-medium">{freight.distance ? `${freight.distance} km` : '—'}</span></div>
                <div><span className="text-slate-500">Criado em:</span> <span className="font-medium">{new Date(freight.createdAt).toLocaleDateString('pt-BR')}</span></div>
                {freight.validatedAt && <div><span className="text-slate-500">Validado em:</span> <span className="font-medium">{new Date(freight.validatedAt).toLocaleDateString('pt-BR')}</span></div>}
                {freight.paidAt && <div><span className="text-slate-500">Pago em:</span> <span className="font-medium">{new Date(freight.paidAt).toLocaleDateString('pt-BR')}</span></div>}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                {freight.status === 'available' && (
                  <div className="flex items-center gap-2">
                    <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                      <SelectTrigger className="w-56"><SelectValue placeholder="Selecionar motorista" /></SelectTrigger>
                      <SelectContent>
                        {approvedDrivers?.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.userName} — {d.plate}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button className="gap-1" disabled={!selectedDriverId || assign.isPending} onClick={() => assign.mutate({ freightId: id, driverId: parseInt(selectedDriverId) })}>
                      <Truck className="h-4 w-4" /> Associar
                    </Button>
                  </div>
                )}
                {freight.status === 'completed' && (
                  <Button className="gap-1" onClick={() => validate.mutate({ id })} disabled={validate.isPending}>
                    <CheckCircle className="h-4 w-4" /> Validar Entrega
                  </Button>
                )}
                {freight.status === 'validated' && (
                  <Button className="gap-1 bg-green-600 hover:bg-green-700" onClick={() => markPaid.mutate({ id })} disabled={markPaid.isPending}>
                    <DollarSign className="h-4 w-4" /> Marcar como Pago
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="map">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> Localização do Motorista</CardTitle></CardHeader>
            <CardContent>
              {freight.status !== 'in_progress' ? (
                <p className="text-slate-400 text-sm text-center py-8">Rastreamento disponível apenas durante viagem ativa</p>
              ) : (
                <div className="h-80 rounded-lg overflow-hidden border">
                  <MapContainer center={mapCenter} zoom={7} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                    {latestLoc && (
                      <Marker position={[latestLoc.lat, latestLoc.lng]}>
                        <Popup>Última posição<br />{new Date(latestLoc.recordedAt).toLocaleString('pt-BR')}</Popup>
                      </Marker>
                    )}
                    {trailPoints.length > 1 && <Polyline positions={trailPoints} color="#3b82f6" weight={3} opacity={0.7} />}
                  </MapContainer>
                </div>
              )}
              {latestLoc && <p className="text-xs text-slate-500 mt-2">Última atualização: {new Date(latestLoc.recordedAt).toLocaleString('pt-BR')}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interests">
          <Card>
            <CardContent className="pt-4">
              {!interests || interests.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">Nenhum motorista demonstrou interesse</p>
              ) : (
                <div className="space-y-3">
                  {interests.map((i) => (
                    <div key={i.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{i.userName}</p>
                        <p className="text-xs text-slate-500">CPF: {i.driverCpf} · Placa: {i.driverPlate} · Tel: {i.driverPhone}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={i.driverStatus === 'approved' ? 'default' : 'secondary'}>{i.driverStatus}</Badge>
                        {freight.status === 'available' && i.driverStatus === 'approved' && (
                          <Button size="sm" variant="outline" onClick={() => assign.mutate({ freightId: id, driverId: i.driverId })}>Associar</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat">
          <Card>
            <CardContent className="pt-4">
              <div className="h-72 overflow-y-auto space-y-2 mb-3">
                {chat.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-6">Nenhuma mensagem</p>
                ) : (
                  chat.map((m) => (
                    <div key={m.id} className={`flex ${m.senderRole === 'admin' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs rounded-lg px-3 py-2 text-sm ${m.senderRole === 'admin' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
                        <p>{m.content}</p>
                        <p className={`text-xs mt-1 ${m.senderRole === 'admin' ? 'text-blue-200' : 'text-slate-400'}`}>{new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (chatMsg.trim()) sendChat.mutate({ freightId: id, content: chatMsg }); }}>
                <Input value={chatMsg} onChange={(e) => setChatMsg(e.target.value)} placeholder="Mensagem..." />
                <Button type="submit" size="icon" disabled={!chatMsg.trim() || sendChat.isPending}><Send className="h-4 w-4" /></Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card>
            <CardContent className="pt-4">
              {docs.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-6">Nenhum comprovante enviado</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {docs.map((d) => (
                    <a key={d.id} href={d.fileUrl} target="_blank" rel="noreferrer" className="block">
                      <img src={d.fileUrl} alt="Comprovante" className="w-full h-32 object-cover rounded-lg border hover:opacity-80 transition" />
                      <p className="text-xs text-slate-500 mt-1 text-center">{new Date(d.uploadedAt).toLocaleDateString('pt-BR')}</p>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
