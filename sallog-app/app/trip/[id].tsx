import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Image, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { trpc } from '../../lib/trpc';
import { uploadImage } from '../../lib/cloudinary';

function fmtValue(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export default function Trip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const freightId = parseInt(id ?? '0');
  const [chatMsg, setChatMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<'chat' | 'docs'>('chat');
  const chatEndRef = useRef<FlatList>(null);
  const utils = trpc.useUtils();

  const { data: freight } = trpc.freights.getById.useQuery({ id: freightId });
  const { data: chat = [], refetch: refetchChat } = trpc.freightChats.list.useQuery({ freightId });
  const { data: docs = [] } = trpc.freightDocuments.listByFreight.useQuery({ freightId });

  const sendChat = trpc.freightChats.send.useMutation({ onSuccess: () => { utils.freightChats.list.invalidate(); setChatMsg(''); } });
  const recordLoc = trpc.locations.record.useMutation();
  const saveDoc = trpc.freightDocuments.create.useMutation({ onSuccess: () => { utils.freightDocuments.listByFreight.invalidate(); Alert.alert('Comprovante enviado!'); } });
  const markCompleted = trpc.freights.markCompleted.useMutation({
    onSuccess: () => { Alert.alert('Viagem concluída!', 'Aguarde a validação do admin.'); router.replace('/(tabs)/minhas-viagens'); },
    onError: (e) => Alert.alert('Erro', e.message),
  });

  // GPS tracking every 30s while trip is active
  useEffect(() => {
    if (freight?.status !== 'in_progress') return;
    let watchSub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permissão negada', 'GPS necessário para rastreamento da viagem'); return; }

      watchSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 50 },
        (loc) => { recordLoc.mutate({ freightId, lat: loc.coords.latitude, lng: loc.coords.longitude }); },
      );
    })();

    return () => { watchSub?.remove(); };
  }, [freight?.status, freightId]);

  // Poll chat every 5s
  useEffect(() => {
    const interval = setInterval(() => refetchChat(), 5000);
    return () => clearInterval(interval);
  }, []);

  async function handleUploadPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permissão negada', 'Câmera necessária para enviar comprovante'); return; }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled) return;

    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      const url = await uploadImage(uri);
      saveDoc.mutate({ freightId, fileUrl: url });
    } catch {
      Alert.alert('Erro', 'Falha ao enviar foto. Verifique as configurações do Cloudinary.');
    } finally {
      setUploading(false);
    }
  }

  function handleFinish() {
    if (docs.length === 0) { Alert.alert('Comprovante obrigatório', 'Envie a foto do comprovante antes de concluir.'); return; }
    Alert.alert('Concluir Viagem?', 'Confirme que entregou a carga e enviou o comprovante.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', onPress: () => markCompleted.mutate({ id: freightId }) },
    ]);
  }

  if (!freight) return <View style={s.center}><ActivityIndicator size="large" color="#0C3680" /></View>;

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header info */}
      <View style={s.infoBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.infoTitle} numberOfLines={1}>{freight.title}</Text>
          <Text style={s.infoRoute}>{freight.originCity} → {freight.destinationCity}</Text>
        </View>
        <Text style={s.infoValue}>{fmtValue(freight.value)}</Text>
      </View>

      {/* GPS indicator */}
      {freight.status === 'in_progress' && (
        <View style={s.gpsBar}>
          <Text style={s.gpsDot}>📡</Text>
          <Text style={s.gpsText}>GPS ativo — enviando localização a cada 30s</Text>
        </View>
      )}

      {/* Tab buttons */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'chat' && s.tabActive]} onPress={() => setTab('chat')}>
          <Text style={[s.tabText, tab === 'chat' && s.tabTextActive]}>💬 Chat ({chat.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'docs' && s.tabActive]} onPress={() => setTab('docs')}>
          <Text style={[s.tabText, tab === 'docs' && s.tabTextActive]}>📎 Comprovantes ({docs.length})</Text>
        </TouchableOpacity>
      </View>

      {tab === 'chat' ? (
        <>
          <FlatList
            ref={chatEndRef}
            data={chat}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
            onContentSizeChange={() => chatEndRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <View style={[s.bubble, item.senderRole === 'driver' ? s.bubbleRight : s.bubbleLeft]}>
                <Text style={[s.bubbleText, item.senderRole === 'driver' && s.bubbleTextRight]}>{item.content}</Text>
                <Text style={[s.bubbleTime, item.senderRole === 'driver' && s.bubbleTimeRight]}>{new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={s.emptyChat}>Nenhuma mensagem ainda</Text>}
          />
          <View style={s.inputRow}>
            <TextInput style={s.input} value={chatMsg} onChangeText={setChatMsg} placeholder="Mensagem..." multiline />
            <TouchableOpacity style={s.sendBtn} onPress={() => chatMsg.trim() && sendChat.mutate({ freightId, content: chatMsg })} disabled={!chatMsg.trim() || sendChat.isPending}>
              <Text style={s.sendBtnText}>→</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {docs.map((d) => (
              <Image key={d.id} source={{ uri: d.fileUrl }} style={s.docThumb} />
            ))}
          </View>
          {docs.length === 0 && <Text style={s.emptyChat}>Nenhum comprovante enviado</Text>}
        </ScrollView>
      )}

      {/* Action buttons */}
      <View style={s.actions}>
        <TouchableOpacity style={[s.actionBtn, s.photoBtn]} onPress={handleUploadPhoto} disabled={uploading}>
          {uploading ? <ActivityIndicator color="#fff" /> : <Text style={s.actionBtnText}>📷 Enviar Comprovante</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, s.finishBtn]} onPress={handleFinish} disabled={markCompleted.isPending}>
          {markCompleted.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.actionBtnText}>✅ Concluir Viagem</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoBar: { backgroundColor: '#0C3680', padding: 12, flexDirection: 'row', alignItems: 'center' },
  infoTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 1 },
  infoRoute: { fontSize: 12, color: '#93c5fd' },
  infoValue: { fontSize: 16, fontWeight: '800', color: '#fbbf24', marginLeft: 8 },
  gpsBar: { backgroundColor: '#dcfce7', padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  gpsDot: { fontSize: 14 },
  gpsText: { fontSize: 12, color: '#166534', fontWeight: '500' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab: { flex: 1, padding: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#0C3680' },
  tabText: { fontSize: 13, color: '#94a3b8', fontWeight: '500' },
  tabTextActive: { color: '#0C3680', fontWeight: '700' },
  bubble: { maxWidth: '75%', borderRadius: 12, padding: 10, marginBottom: 6 },
  bubbleLeft: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9' },
  bubbleRight: { alignSelf: 'flex-end', backgroundColor: '#0C3680' },
  bubbleText: { fontSize: 14, color: '#1e293b' },
  bubbleTextRight: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  bubbleTimeRight: { color: '#93c5fd', textAlign: 'right' },
  emptyChat: { textAlign: 'center', color: '#94a3b8', marginTop: 24, fontSize: 14 },
  inputRow: { flexDirection: 'row', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  input: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 80 },
  sendBtn: { backgroundColor: '#0C3680', borderRadius: 20, paddingHorizontal: 16, justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  docThumb: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#e2e8f0' },
  actions: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  actionBtn: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  photoBtn: { backgroundColor: '#3b82f6' },
  finishBtn: { backgroundColor: '#22c55e' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
