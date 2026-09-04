const REQUIRED_BOOTSTRAP_KEYS = [
  'INITIAL_ADMIN_EMAIL',
  'INITIAL_ADMIN_NAME',
  'INITIAL_ADMIN_PASSWORD',
] as const;

type BootstrapEnvKey = (typeof REQUIRED_BOOTSTRAP_KEYS)[number];
type BootstrapEnv = Partial<Record<BootstrapEnvKey, string>>;

export interface InitialAdminConfig {
  email: string;
  name: string;
  password: string;
}

/**
 * Lê a configuração do bootstrap sem tocar no banco.
 *
 * Ausência total significa "bootstrap desativado". Presença parcial é erro de
 * configuração: nunca completamos os dados com e-mail ou senha embutidos no
 * código, porque isso recriaria uma credencial conhecida em um cold start.
 */
export function readInitialAdminConfig(env: BootstrapEnv): InitialAdminConfig | null {
  const values = Object.fromEntries(
    REQUIRED_BOOTSTRAP_KEYS.map((key) => [key, env[key]?.trim() ?? '']),
  ) as Record<BootstrapEnvKey, string>;

  const configured = REQUIRED_BOOTSTRAP_KEYS.filter((key) => values[key].length > 0);
  if (configured.length === 0) return null;

  const missing = REQUIRED_BOOTSTRAP_KEYS.filter((key) => values[key].length === 0);
  if (missing.length > 0) {
    throw new Error(`[bootstrap] configuração incompleta; faltam: ${missing.join(', ')}`);
  }

  const email = values.INITIAL_ADMIN_EMAIL.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('[bootstrap] INITIAL_ADMIN_EMAIL não é um e-mail válido');
  }

  const password = values.INITIAL_ADMIN_PASSWORD;
  if (password.length < 12) {
    throw new Error('[bootstrap] INITIAL_ADMIN_PASSWORD deve ter pelo menos 12 caracteres');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('[bootstrap] INITIAL_ADMIN_PASSWORD deve conter maiúscula, minúscula, número e símbolo');
  }

  const normalized = password.toLowerCase().replace(/[^a-z0-9]/g, '');
  const forbidden = ['admin', 'password', 'senha', 'salvita', 'atendente'];
  if (forbidden.some((word) => normalized.includes(word))) {
    throw new Error('[bootstrap] INITIAL_ADMIN_PASSWORD contém uma palavra previsível');
  }

  return {
    email,
    name: values.INITIAL_ADMIN_NAME,
    password,
  };
}
