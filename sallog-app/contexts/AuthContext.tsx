import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { trpc } from '../lib/trpc';

type Driver = { id: number; cpf: string; plate: string; phone: string; status: string };
type User = { id: number; name: string; email?: string; role: string };

interface AuthContextValue {
  user: User | null;
  driver: Driver | null;
  token: string | null;
  loading: boolean;
  signIn: (cpf: string, password: string) => Promise<void>;
  signUp: (name: string, cpf: string, plate: string, phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loginMobile = trpc.auth.loginMobile.useMutation();
  const registerDriver = trpc.auth.registerDriver.useMutation();

  useEffect(() => {
    (async () => {
      const storedToken = await SecureStore.getItemAsync('sallog_token');
      const storedUser = await SecureStore.getItemAsync('sallog_user');
      const storedDriver = await SecureStore.getItemAsync('sallog_driver');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        if (storedDriver) setDriver(JSON.parse(storedDriver));
      }
      setLoading(false);
    })();
  }, []);

  async function persist(t: string, u: User, d: Driver) {
    await SecureStore.setItemAsync('sallog_token', t);
    await SecureStore.setItemAsync('sallog_user', JSON.stringify(u));
    await SecureStore.setItemAsync('sallog_driver', JSON.stringify(d));
    setToken(t);
    setUser(u);
    setDriver(d);
  }

  async function signIn(cpf: string, password: string) {
    const res = await loginMobile.mutateAsync({ cpf, password });
    await persist(res.token, res.user as User, res.driver);
  }

  async function signUp(name: string, cpf: string, plate: string, phone: string, password: string) {
    const res = await registerDriver.mutateAsync({ name, cpf, plate, phone, password });
    await persist(res.token, res.user as User, res.driver);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync('sallog_token');
    await SecureStore.deleteItemAsync('sallog_user');
    await SecureStore.deleteItemAsync('sallog_driver');
    setToken(null);
    setUser(null);
    setDriver(null);
  }

  return (
    <AuthContext.Provider value={{ user, driver, token, loading, signIn, signUp, signOut, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
