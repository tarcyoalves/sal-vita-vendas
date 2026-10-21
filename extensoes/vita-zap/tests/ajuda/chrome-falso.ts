// chrome.storage / chrome.runtime falsos para testar o CRM sem o Chrome.

type Mudancas = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type Ouvinte = (mudancas: Mudancas, area: string) => void;

const copia = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export interface ChromeFalso {
  dados: Map<string, unknown>;
  ouvintes: Set<Ouvinte>;
  gravacoes: number;
  chrome: unknown;
  alarmes: Map<string, { name: string; scheduledTime: number }>;
  notificacoes: Map<string, Record<string, unknown>>;
  selo: { texto: string; cor: string | null };
  abas: Array<{ id: number; windowId: number; active: boolean; url: string }>;
  abasCriadas: string[];
  abasAtivadas: number[];
}

export function instalarChromeFalso(inicial: Record<string, unknown> = {}): ChromeFalso {
  const dados = new Map<string, unknown>(Object.entries(inicial).map(([k, v]) => [k, copia(v)]));
  const ouvintes = new Set<Ouvinte>();
  const estado: ChromeFalso = {
    dados,
    ouvintes,
    gravacoes: 0,
    chrome: null,
    alarmes: new Map(),
    notificacoes: new Map(),
    selo: { texto: '', cor: null },
    abas: [],
    abasCriadas: [],
    abasAtivadas: [],
  };

  const local = {
    async get(chaves?: string | string[] | null): Promise<Record<string, unknown>> {
      const lista = chaves == null ? [...dados.keys()] : Array.isArray(chaves) ? chaves : [chaves];
      const r: Record<string, unknown> = {};
      for (const k of lista) if (dados.has(k)) r[k] = copia(dados.get(k));
      return r;
    },
    async set(obj: Record<string, unknown>): Promise<void> {
      const mudancas: Mudancas = {};
      for (const [k, v] of Object.entries(obj)) {
        mudancas[k] = { oldValue: copia(dados.get(k)), newValue: copia(v) };
        dados.set(k, copia(v));
      }
      estado.gravacoes += 1;
      for (const o of ouvintes) o(mudancas, 'local');
    },
    async remove(chaves: string | string[]): Promise<void> {
      for (const k of Array.isArray(chaves) ? chaves : [chaves]) dados.delete(k);
    },
  };

  estado.chrome = {
    storage: {
      local,
      onChanged: {
        addListener: (f: Ouvinte) => ouvintes.add(f),
        removeListener: (f: Ouvinte) => ouvintes.delete(f),
      },
    },
    runtime: { id: 'teste', sendMessage: () => Promise.resolve(), onMessage: { addListener: () => undefined }, getURL: (p: string) => `chrome-extension://teste/${p}` },
    alarms: {
      async create(name: string, info: { when: number }) {
        estado.alarmes.set(name, { name, scheduledTime: info.when });
      },
      async getAll() {
        return [...estado.alarmes.values()];
      },
      async clear(name: string) {
        return estado.alarmes.delete(name);
      },
    },
    notifications: {
      async create(id: string, opcoes: Record<string, unknown>) {
        estado.notificacoes.set(id, opcoes);
        return id;
      },
      async clear(id: string) {
        return estado.notificacoes.delete(id);
      },
    },
    action: {
      async setBadgeText(d: { text: string }) {
        estado.selo.texto = d.text;
      },
      async setBadgeBackgroundColor(d: { color: string }) {
        estado.selo.cor = d.color;
      },
    },
    tabs: {
      async query() {
        return estado.abas;
      },
      async update(id: number) {
        estado.abasAtivadas.push(id);
      },
      async create(d: { url: string }) {
        estado.abasCriadas.push(d.url);
      },
    },
    windows: { async update() {} },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = estado.chrome;
  return estado;
}
