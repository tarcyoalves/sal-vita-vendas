import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!cpf.trim() || !password.trim()) { Alert.alert('Erro', 'Preencha CPF e senha'); return; }
    setLoading(true);
    try {
      await signIn(cpf.replace(/\D/g, ''), password);
      router.replace('/(tabs)/marketplace');
    } catch (e: any) {
      Alert.alert('Erro', e.message ?? 'CPF ou senha inválidos');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <Text style={s.logo}>SalLog</Text>
        <Text style={s.subtitle}>Plataforma de Fretes — Sal Vita</Text>

        <Text style={s.label}>CPF</Text>
        <TextInput style={s.input} value={cpf} onChangeText={setCpf} placeholder="000.000.000-00" keyboardType="numeric" autoCapitalize="none" />

        <Text style={s.label}>Senha</Text>
        <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Sua senha" secureTextEntry />

        <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Entrar</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={s.link} onPress={() => router.push('/(auth)/register')}>
          <Text style={s.linkText}>Não tem conta? Cadastre-se</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C3680', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 28 },
  logo: { fontSize: 36, fontWeight: '800', color: '#0C3680', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 28 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 16, backgroundColor: '#f9fafb' },
  btn: { backgroundColor: '#0C3680', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: '#0C3680', fontSize: 14, fontWeight: '500' },
});
