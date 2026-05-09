import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { trpc } from '../../lib/trpc';

const STATUS_LABEL: Record<string, string> = { in_progress: 'Em Andamento', completed: 'Concluído', validated: 'Validado', paid: 'Pago' };
const STATUS_COLOR: Record<string, string> = { in_progress: '#f59e0b', completed: '#f97316', validated: '#8b5cf6', paid: '#22c55e' };

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function MinhasViagens() {
  const router = useRouter();
  const { data = [], isLoading, refetch, isFetching } = trpc.freights.list.useQuery({ scope: 'mine' });

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#0C3680" /></View>;

  const active = data.filter((f) => f.status === 'in_progress');
  const past = data.filter((f) => f.status !== 'in_progress');

  function Section({ title, items }: { title: string; items: typeof data }) {
    if (items.length === 0) return null;
    return (
      <>
        <Text style={s.section}>{title}</Text>
        {items.map((item) => (
          <TouchableOpacity key={item.id} style={s.card} onPress={() => item.status === 'in_progress' ? router.push(`/trip/${item.id}`) : router.push(`/freight/${item.id}`)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={s.title} numberOfLines={1}>{item.title}</Text>
              <Text style={s.value}>{fmtValue(item.value)}</Text>
            </View>
            <Text style={s.route}>{item.originCity}/{item.originState} → {item.destinationCity}/{item.destinationState}</Text>
            <View style={[s.badge, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
              <Text style={[s.badgeText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </>
    );
  }

  return (
    <FlatList
      data={[]}
      renderItem={null}
      ListHeaderComponent={
        <View style={s.container}>
          {data.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyText}>📋</Text><Text style={s.emptyLabel}>Nenhuma viagem atribuída ainda</Text></View>
          ) : (
            <>
              <Section title="🟡 Em Andamento" items={active} />
              <Section title="📂 Histórico" items={past} />
            </>
          )}
        </View>
      }
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#0C3680" />}
    />
  );
}

const s = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section: { fontSize: 14, fontWeight: '700', color: '#64748b', marginTop: 12, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1e293b', marginRight: 8 },
  value: { fontSize: 16, fontWeight: '700', color: '#0C3680' },
  route: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 8 },
  badge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 48, marginBottom: 12 },
  emptyLabel: { fontSize: 15, color: '#94a3b8', textAlign: 'center' },
});
