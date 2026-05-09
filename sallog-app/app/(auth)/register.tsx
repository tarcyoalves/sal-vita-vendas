import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function Register() {
  const { signUp, driver } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', cpf: '', plate: '', phone: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  function set(k: keyof typeof form, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  async function handleRegister() {
    if (!form.name || !form.cpf || !form.plate || !form.phone || !form.password) { Alert.alert('Erro', 'Preencha todos os campos'); return; }
    if (form.password !== form.confirm) { Alert.alert('Erro', 'As senhas não coincidem'); return; }
    if (form.password.length < 6) { Alert.alert('Erro', 'Senha deve ter mínimo 6 caracteres'); return; }
    setLoading(true);
    try {
      await signUp(form.name, form.cpf.replace(/\D/g, ''), form.plate, form.phone, form.password);
    } catch (e: any) {
      Alert.alert('Erro', e.message ?? 'Falha no cadastro');
    } finally {
      setLoading(false);
    }
  }

  // After registration, if driver is pending show waiting screen
  if (driver?.status === 'pending') {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <Text style={s.logo}>⏳</Text>
          <Text style={s.title}>Cadastro Enviado!</Text>
          <Text style={s.desc}>Seu cadastro está sendo analisado pela equipe Sal Vita. Você será notificado quando for aprovado.</Text>
          <TouchableOpacity style={s.btn} onPress={() => router.replace('/(tabs)/marketplace')}>
            <Text style={s.btnText}>Ver Fretes Disponíveis</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#0C3680' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.card}>
          <Text style={s.logo}>SalLog</Text>
          <Text style={s.subtitle}>Criar conta de motorista</Text>

          {([['name', 'Nome Completo', 'words', 'default', false], ['cpf', 'CPF', 'numeric', 'default', false], ['plate', 'Placa do Veículo', 'default', 'characters', true], ['phone', 'Telefone', 'phone-pad', 'default', false], ['password', 'Senha', 'default', 'default', false, true], ['confirm', 'Confirmar Senha', 'default', 'default', false, true]] as const).map(([key, label, keyboard, autocap, upper, secure]) => (
            <View key={key}>
              <Text style={s.label}>{label}</Text>
              <TextInput
                style={s.input}
                value={form[key as keyof typeof form]}
                onChangeText={(v) => set(key as keyof typeof form, upper ? v.toUpperCase() : v)}
                placeholder={label}
                keyboardType={keyboard as any}
                autoCapitalize={autocap as any}
                secureTextEntry={!!secure}
              />
            </View>
          ))}

          <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Criar Conta</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.link} onPress={() => router.back()}>
            <Text style={s.linkText}>Já tenho conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: 24, paddingTop: 60 },
  container: { flex: 1, backgroundColor: '#0C3680', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 28 },
  logo: { fontSize: 32, fontWeight: '800', color: '#0C3680', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#0C3680', textAlign: 'center', marginBottom: 12 },
  desc: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 5, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 11, fontSize: 15, marginBottom: 8, backgroundColor: '#f9fafb' },
  btn: { backgroundColor: '#0C3680', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { marginTop: 14, alignItems: 'center' },
  linkText: { color: '#0C3680', fontSize: 14, fontWeight: '500' },
});
