import { FlatList, View, Text, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../lib/trpc';

const CARGO_LABEL: Record<string, string> = { bigbag: 'Big Bag', sacaria: 'Sacaria', granel: 'Granel' };

function fmtValue(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Freight = { id: number; title: string; originCity: string; originState: string; destinationCity: string; destinationState: string; cargoType: string; value: number; distance: number | null; weight: number | null };

function FreightCard({ item, onPress }: { item: Freight; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={s.cardHeader}>
        <Text style={s.title} numberOfLines={1}>{item.title}</Text>
        <Text style={s.value}>{fmtValue(item.value)}</Text>
      </View>
      <View style={s.route}>
        <View style={s.city}><Text style={s.cityLabel}>ORIGEM</Text><Text style={s.cityName}>{item.originCity}</Text><Text style={s.state}>{item.originState}</Text></View>
        <Text style={s.arrow}>→</Text>
        <View style={[s.city, s.cityRight]}><Text style={s.cityLabel}>DESTINO</Text><Text style={s.cityName}>{item.destinationCity}</Text><Text style={s.state}>{item.destinationState}</Text></View>
      </View>
      <View style={s.meta}>
        <View style={s.tag}><Text style={s.tagText}>{CARGO_LABEL[item.cargoType] ?? item.cargoType}</Text></View>
        {item.weight ? <View style={s.tag}><Text style={s.tagText}>{item.weight}t</Text></View> : null}
        {item.distance ? <View style={s.tag}><Text style={s.tagText}>{item.distance} km</Text></View> : null}
      </View>
    </TouchableOpacity>
  );
}

export default function Marketplace() {
  const router = useRouter();
  const { data = [], isLoading, refetch, isFetching } = trpc.freights.list.useQuery({ scope: 'available' });

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#0C3680" /></View>;

  return (
    <View style={s.container}>
      <FlatList
        data={data as Freight[]}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <FreightCard item={item} onPress={() => router.push(`/freight/${item.id}`)} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#0C3680" />}
        ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>🚛</Text><Text style={s.emptyLabel}>Nenhum frete disponível no momento</Text></View>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1e293b', marginRight: 8 },
  value: { fontSize: 18, fontWeight: '800', color: '#0C3680' },
  route: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  city: { flex: 1 },
  cityRight: { alignItems: 'flex-end' },
  cityLabel: { fontSize: 10, color: '#94a3b8', fontWeight: '600', letterSpacing: 0.5 },
  cityName: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  state: { fontSize: 12, color: '#64748b' },
  arrow: { fontSize: 18, color: '#cbd5e1', marginHorizontal: 8 },
  meta: { flexDirection: 'row', gap: 6 },
  tag: { backgroundColor: '#f1f5f9', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 48, marginBottom: 12 },
  emptyLabel: { fontSize: 15, color: '#94a3b8', textAlign: 'center' },
});
