import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { trpc } from '../../lib/trpc';

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function Carteira() {
  const { data = [], isLoading, refetch, isFetching } = trpc.freights.list.useQuery({ scope: 'mine' });

  const paid = data.filter((f) => f.status === 'paid');
  const total = paid.reduce((acc, f) => acc + f.value, 0);
  const pendingPay = data.filter((f) => f.status === 'validated');
  const pendingTotal = pendingPay.reduce((acc, f) => acc + f.value, 0);

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#0C3680" /></View>;

  return (
    <FlatList
      data={paid}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor="#0C3680" />}
      ListHeaderComponent={
        <View>
          <View style={s.balanceCard}>
            <Text style={s.balanceLabel}>Total Recebido</Text>
            <Text style={s.balanceValue}>{fmtValue(total)}</Text>
            <View style={s.pendingRow}>
              <Text style={s.pendingLabel}>A Receber: </Text>
              <Text style={s.pendingValue}>{fmtValue(pendingTotal)}</Text>
            </View>
          </View>
          <Text style={s.section}>Histórico de Pagamentos</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.item}>
          <View style={{ flex: 1 }}>
            <Text style={s.itemTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={s.itemRoute}>{item.originCity}/{item.originState} → {item.destinationCity}/{item.destinationState}</Text>
            {item.paidAt ? <Text style={s.itemDate}>Pago em {new Date(item.paidAt).toLocaleDateString('pt-BR')}</Text> : null}
          </View>
          <Text style={s.itemValue}>{fmtValue(item.value)}</Text>
        </View>
      )}
      ListEmptyComponent={<View style={s.empty}><Text style={s.emptyText}>💰</Text><Text style={s.emptyLabel}>Nenhum pagamento registrado</Text></View>}
    />
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  balanceCard: { backgroundColor: '#0C3680', borderRadius: 16, padding: 24, marginBottom: 20 },
  balanceLabel: { fontSize: 13, color: '#93c5fd', fontWeight: '500', marginBottom: 4 },
  balanceValue: { fontSize: 36, fontWeight: '800', color: '#fff', marginBottom: 12 },
  pendingRow: { flexDirection: 'row', alignItems: 'center' },
  pendingLabel: { fontSize: 13, color: '#93c5fd' },
  pendingValue: { fontSize: 14, fontWeight: '700', color: '#fbbf24' },
  section: { fontSize: 14, fontWeight: '700', color: '#64748b', marginBottom: 10 },
  item: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  itemRoute: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  itemDate: { fontSize: 11, color: '#22c55e', fontWeight: '500' },
  itemValue: { fontSize: 16, fontWeight: '700', color: '#22c55e', marginLeft: 8 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 48, marginBottom: 12 },
  emptyLabel: { fontSize: 15, color: '#94a3b8', textAlign: 'center' },
});
