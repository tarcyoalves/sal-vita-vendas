import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../contexts/AuthContext';

const CARGO_LABEL: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };
const STATUS_LABEL: Record<string, string> = { available: 'Disponível', in_progress: 'Em Andamento', completed: 'Concluído', validated: 'Validado', paid: 'Pago' };

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function FreightDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { driver } = useAuth();
  const utils = trpc.useUtils();

  const freightId = parseInt(id ?? '0');
  const { data: freight, isLoading } = trpc.freights.getById.useQuery({ id: freightId });
  const { data: myInterests } = trpc.freightInterests.myInterests.useQuery();

  const register = trpc.freightInterests.register.useMutation({
    onSuccess: () => {
      utils.freightInterests.myInterests.invalidate();
      Alert.alert('Interesse registrado!', 'O admin irá analisá-lo em breve.');
    },
    onError: (e) => Alert.alert('Erro', e.message),
  });

  if (isLoading || !freight) return <View style={s.center}><ActivityIndicator size="large" color="#0C3680" /></View>;

  const hasInterest = myInterests?.some((i) => i.freightId === freightId);
  const isAssigned = freight.assignedDriverId === driver?.id;
  const driverApproved = driver?.status === 'approved';

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={s.header}>
        <Text style={s.title}>{freight.title}</Text>
        <View style={s.statusBadge}><Text style={s.statusText}>{STATUS_LABEL[freight.status]}</Text></View>
      </View>

      <Text style={s.value}>{fmtValue(freight.value)}</Text>

      <View style={s.routeCard}>
        <View style={s.routeItem}>
          <Text style={s.routeLabel}>ORIGEM</Text>
          <Text style={s.routeCity}>{freight.originCity}</Text>
          <Text style={s.routeState}>{freight.originState}</Text>
        </View>
        <Text style={s.routeArrow}>→</Text>
        <View style={[s.routeItem, { alignItems: 'flex-end' }]}>
          <Text style={s.routeLabel}>DESTINO</Text>
          <Text style={s.routeCity}>{freight.destinationCity}</Text>
          <Text style={s.routeState}>{freight.destinationState}</Text>
        </View>
      </View>

      <View style={s.infoGrid}>
        <InfoRow label="Tipo de Carga" value={CARGO_LABEL[freight.cargoType] ?? freight.cargoType} />
        {freight.weight ? <InfoRow label="Peso" value={`${freight.weight} toneladas`} /> : null}
        {freight.distance ? <InfoRow label="Distância" value={`${freight.distance} km`} /> : null}
      </View>

      {freight.description ? <Text style={s.description}>{freight.description}</Text> : null}

      {freight.status === 'available' && driverApproved && !isAssigned && (
        <TouchableOpacity
          style={[s.btn, hasInterest && s.btnSecondary]}
          onPress={() => !hasInterest && register.mutate({ freightId })}
          disabled={hasInterest || register.isPending}
        >
          {register.isPending ? <ActivityIndicator color="#fff" /> : (
            <Text style={[s.btnText, hasInterest && s.btnTextSecondary]}>
              {hasInterest ? '✓ Interesse Registrado' : 'Tenho Interesse'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {!driverApproved && freight.status === 'available' && (
        <View style={s.warningBox}>
          <Text style={s.warningText}>Sua conta precisa ser aprovada para demonstrar interesse em fretes.</Text>
        </View>
      )}

      {isAssigned && freight.status === 'in_progress' && (
        <TouchableOpacity style={s.btn} onPress={() => router.push(`/trip/${freightId}`)}>
          <Text style={s.btnText}>🚛 Abrir Viagem</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: '#1e293b', marginRight: 8 },
  statusBadge: { backgroundColor: '#dbeafe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '600', color: '#1d4ed8' },
  value: { fontSize: 32, fontWeight: '800', color: '#0C3680', marginBottom: 16 },
  routeCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  routeItem: { flex: 1 },
  routeLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', letterSpacing: 0.5 },
  routeCity: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  routeState: { fontSize: 13, color: '#64748b' },
  routeArrow: { fontSize: 24, color: '#cbd5e1', marginHorizontal: 12 },
  infoGrid: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, gap: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 13, color: '#64748b' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  description: { fontSize: 14, color: '#64748b', lineHeight: 20, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  btn: { backgroundColor: '#0C3680', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnSecondary: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#22c55e' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnTextSecondary: { color: '#16a34a' },
  warningBox: { backgroundColor: '#fef9c3', borderRadius: 10, padding: 14, marginTop: 8 },
  warningText: { fontSize: 13, color: '#92400e', textAlign: 'center' },
});
